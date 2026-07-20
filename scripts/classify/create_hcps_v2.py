"""
FieldMark - Step C v2: Create canonical HCP identities from OpenAlex author inventory.

Clusters the openalex_author_inventory into canonical people using:
1. ORCID match (authoritative - all shards sharing a non-null ORCID = same person)
2. Normalized-name + institution match (same ROR or same normalized institution text)
3. Anti-conflation guard: name alone is NEVER sufficient; shards with same name but
   different institutions stay separate.

Reads enrichment data from author_pub_flat (distinct pubs, year ranges).
Writes to hcps_v2 + hcp_openalex_authors_v2. Does NOT tag TAs.

Preserves the exact clustering algorithm from the archived run_step_c_create_hcps.py
with the addition of ORCID-first grouping and author_pub_flat pub-count derivation.

Two run modes:
  * Full build (default): clean-build every cluster into a fresh HCP. Assumes empty/
    known-clean target tables.
  * Incremental (--incremental): insert-new-only. For each cluster, compute its
    identity_hash and, if that hash already exists in hcps_v2, DO NOT create a new HCP
    - only add missing OpenAlex shard-links and refresh derived fields. Otherwise create
    the HCP as a new (provisional) person. Idempotent: re-running with no new inventory
    data creates zero HCPs and zero links.

*** INCREMENTAL MODE MUST ALWAYS BE FOLLOWED BY THE DEDUP SUITE. ***
An incremental run can create NEW provisional HCPs for shards that clustering could not
attach to an existing identity (e.g. a known person publishing under a new institution
with no shared ORCID). Those provisional HCPs are fragments until a subsequent dedup pass
reconciles them into their canonical HCP. Running --incremental WITHOUT a following dedup
pass re-introduces the fragmentation problem this engine exists to prevent. The run-summary
emits `provisional_new_hcps` precisely so the orchestrator can hand that count to dedup.

Prerequisites: openalex_author_inventory and author_pub_flat populated.
Env: SUPABASE_URL, SUPABASE_KEY, optionally DATABASE_URL for direct reads.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client


# ============================================================
# Constants
# ============================================================

INVENTORY_PAGE_SIZE = 1000
FLAT_PAGE_SIZE = 1000
JOIN_UPSERT_CHUNK = 100
HCP_INSERT_BATCH = 100
PROGRESS_EVERY = 500

MATCH_METHOD_ORCID = "orcid"
MATCH_METHOD_NAME_INSTITUTION = "name_institution"
MATCH_METHOD_NAME_ONLY = "name_only_singleton"

CONFIDENCE_ORCID = 1.0
CONFIDENCE_NAME_INSTITUTION = 0.9
CONFIDENCE_NAME_ONLY_SINGLETON = 0.5

SOURCE_VALUE = "openalex_inventory_step_c_v2"

LAST_SUFFIXES = frozenset({
    "jr", "sr", "ii", "iii", "iv", "v", "md", "phd", "m.d", "ph.d",
    "dmd", "do", "mba", "mph", "msc",
})

# --- Validation tuning (used by the post-dry-run checks; not write-path logic) ---
# A single real prolific researcher tops out in the low thousands of career pubs.
# A cluster claiming far more is a likely name-collision conflation -> flag for review.
CONFLATION_PUB_CEILING = 2000
# Known atopic-dermatitis KOLs that MUST NOT fragment across many HCP rows.
# Matched on normalized last name (see normalize_last_name).
KOL_LAST_NAMES = (
    "guttman-yassky", "silverberg", "simpson", "eichenfield",
    "paller", "blauvelt", "bissonnette", "thaci", "deleuran",
)
# Count sanity thresholds: HCPs/authors ratio.
COUNTS_NOT_MERGING_RATIO = 0.95   # HCPs ~ authors -> clustering isn't merging (bug)
COUNTS_OVERMERGE_RATIO = 0.30     # HCPs << authors -> possible over-merge / conflation


# ============================================================
# Utilities
# ============================================================


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


# ============================================================
# Name / institution / ORCID normalization
# (Preserved exactly from preview_step_b_matching.py)
# ============================================================


def strip_ascii_diacritics(s: str) -> str:
    nfd = unicodedata.normalize("NFD", s)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def normalize_token_field(s: str) -> str:
    s = strip_ascii_diacritics(s.lower())
    for ch in ".,;:":
        s = s.replace(ch, " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_trailing_single_letter_tokens(first_norm: str) -> str:
    parts = first_norm.split()
    while len(parts) >= 2 and len(parts[-1].replace(".", "")) == 1:
        parts = parts[:-1]
    return " ".join(parts).strip()


def normalize_first_name(raw: Optional[str]) -> str:
    t = normalize_token_field(str(raw or ""))
    return strip_trailing_single_letter_tokens(t)


def normalize_last_name(raw: Optional[str]) -> str:
    tokens = normalize_token_field(str(raw or "")).split()
    while tokens and tokens[-1].replace(".", "").lower() in LAST_SUFFIXES:
        tokens.pop()
    return " ".join(tokens).strip()


def normalize_org_name(name: Optional[str]) -> str:
    if not name:
        return ""
    return " ".join(str(name).strip().split())


def normalize_ror(value: Optional[str]) -> str:
    if not value:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    s = s.rstrip("/")
    if "ror.org/" in s.lower():
        s = s.split("/")[-1]
    return s.lower()


def normalize_openalex_author_id(value: Any) -> str:
    s = str(value or "").strip()
    if not s:
        return ""
    if s.startswith("https://openalex.org/"):
        return s
    tail = s.split("/")[-1]
    return f"https://openalex.org/{tail}"


def normalize_orcid(value: Optional[str]) -> str:
    if not value:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    if "orcid.org/" in s:
        s = s.split("orcid.org/")[-1]
    s = s.strip("/").strip()
    return s.upper() if s else ""


def name_pair_from_display(display_name: Optional[str]) -> Tuple[str, str]:
    t = normalize_token_field(str(display_name or ""))
    parts = t.split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        first_raw, last_raw = parts[0], ""
    else:
        first_raw, last_raw = " ".join(parts[:-1]), parts[-1]
    return normalize_first_name(first_raw), normalize_last_name(last_raw)


def institution_cluster_token(row: Dict[str, Any]) -> str:
    inst = normalize_org_name(row.get("last_known_institution"))
    if not inst:
        return ""
    return normalize_token_field(inst)


# ============================================================
# identity_hash computation (sha256)
# ============================================================


def compute_identity_hash(orcid: str, normalized_name: str, institution_key: str) -> str:
    """Deterministic sha256 hex. ORCID-first; else name|institution."""
    if orcid:
        payload = f"orcid:{orcid}"
    else:
        payload = f"{normalized_name}|{institution_key}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ============================================================
# Clustering
# ============================================================


def cluster_key_for_row(row: Dict[str, Any]) -> Tuple[str, str, str]:
    """Deterministic bucket key: (normalized_first, normalized_last, institution_key).

    Same name + same ROR -> same bucket. Same name + same normalized institution -> same bucket.
    Anti-conflation (spec rule 3: require institutional or ORCID corroboration for any
    merge): a row with NO ROR and NO institution text has zero corroboration, so it must
    NOT name-merge with anyone. We make its institution_key unique to the row (its own
    OpenAlex id), which forces every such row into its own singleton bucket -> one HCP each.
    Fragmentation here is recoverable by dedup; conflation would not be.
    """
    nf, nl = name_pair_from_display(row.get("display_name"))
    r = normalize_ror(row.get("last_known_institution_ror"))
    if r:
        return (nf, nl, f"ror:{r}")
    it = institution_cluster_token(row)
    if it:
        return (nf, nl, f"inst:{it}")
    # No ROR and no institution: unique key per row -> true singleton, never name-merged.
    return (nf, nl, f"nameonly:{normalize_openalex_author_id(row.get('openalex_author_id'))}")


def cluster_inventory(
    rows: List[Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """Cluster inventory rows into canonical-person groups.

    Priority 1: ORCID match - all shards sharing a normalized ORCID become one cluster.
    Priority 2: Name + institution key - deterministic bucketing.
    Priority 3: Name-only singletons (anti-conflation: never merge on name alone).
    """
    # Phase 1: group by ORCID (authoritative)
    orcid_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    no_orcid: List[Dict[str, Any]] = []
    for row in rows:
        orc = normalize_orcid(row.get("orcid"))
        if orc:
            orcid_groups[orc].append(row)
        else:
            no_orcid.append(row)

    clusters: List[List[Dict[str, Any]]] = []
    consumed_oa_ids: Set[str] = set()

    for orc, group in orcid_groups.items():
        clusters.append(group)
        for row in group:
            oid = normalize_openalex_author_id(row.get("openalex_author_id"))
            if oid:
                consumed_oa_ids.add(oid)

    # Phase 2: bucket remaining by name + institution
    buckets: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
    for row in no_orcid:
        oid = normalize_openalex_author_id(row.get("openalex_author_id"))
        if oid in consumed_oa_ids:
            continue
        buckets[cluster_key_for_row(row)].append(row)

    for key, group in buckets.items():
        clusters.append(group)

    return clusters


# ============================================================
# Per-cluster field derivation
# ============================================================


def row_corpus(row: Dict[str, Any]) -> int:
    try:
        return int(row.get("corpus_pub_count") or 0)
    except (TypeError, ValueError):
        return 0


def year_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        y = int(value)
        return y if 1000 <= y <= 3000 else None
    except (TypeError, ValueError):
        return None


def pick_primary_row(cluster_rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    return max(
        cluster_rows,
        key=lambda r: (row_corpus(r), normalize_openalex_author_id(r.get("openalex_author_id")) or ""),
    )


def parse_display_name(display_name: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Split display_name -> (first_name, middle_name, last_name)."""
    raw = str(display_name or "").strip()
    if not raw:
        return None, None, None
    parts = raw.split()
    if len(parts) == 1:
        return None, None, parts[0]
    if len(parts) == 2:
        return parts[0], None, parts[1]
    return parts[0], " ".join(parts[1:-1]), parts[-1]


def most_frequent(values: List[str]) -> str:
    if not values:
        return ""
    counter = Counter(values)
    return counter.most_common(1)[0][0]


@dataclass
class ClusterMetadata:
    """Derived fields for one canonical person cluster."""
    hcp_id: str
    first_name: Optional[str]
    middle_name: Optional[str]
    last_name: str
    preferred_display_name: Optional[str]
    orcid: Optional[str]
    institution_normalized: Optional[str]
    institution_raw: Optional[str]
    institution_ror: Optional[str]
    country: Optional[str]
    career_first_pub_year: Optional[int]
    latest_pub_year: Optional[int]
    total_career_pubs: int
    identity_hash: str
    identity_confidence_score: float
    identity_method: str
    cluster_size: int
    primary_row: Dict[str, Any]
    all_rows: List[Dict[str, Any]]


def derive_cluster_metadata(
    cluster_rows: List[Dict[str, Any]],
    ror_country: Dict[str, str],
    flat_stats: Dict[str, Dict[str, Any]],
) -> ClusterMetadata:
    """Derive all HCP fields from a cluster of inventory rows + flat aggregation."""
    primary = pick_primary_row(cluster_rows)
    hcp_id = str(uuid.uuid4())

    # Most-frequent display_name across cluster
    display_names = [str(r.get("display_name") or "") for r in cluster_rows if r.get("display_name")]
    preferred_display_name = most_frequent(display_names) if display_names else None
    first_name, middle_name, last_name = parse_display_name(preferred_display_name or primary.get("display_name"))
    if not last_name or not last_name.strip():
        last_name = "Unknown"

    # ORCID (take first non-empty from cluster)
    orcid = ""
    for r in cluster_rows:
        orc = normalize_orcid(r.get("orcid"))
        if orc:
            orcid = orc
            break

    # Institution - most-frequent ROR; else most-frequent institution name
    rors = [normalize_ror(r.get("last_known_institution_ror")) for r in cluster_rows]
    rors_nonempty = [r for r in rors if r]
    institution_ror = most_frequent(rors_nonempty) if rors_nonempty else None

    institutions = [normalize_org_name(r.get("last_known_institution")) for r in cluster_rows]
    institutions_nonempty = [i for i in institutions if i]
    institution_normalized = most_frequent(institutions_nonempty) if institutions_nonempty else None
    institution_raw = institution_normalized

    # Country from ROR lookup
    country = None
    if institution_ror:
        cc = ror_country.get(institution_ror, "")
        if cc and cc.lower() != "unknown":
            country = cc

    # Pub stats from author_pub_flat (preferred) or inventory fallback.
    #
    # total_career_pubs choice (per spec): use the DISTINCT pub_id count across all of
    # the cluster's shards in author_pub_flat, NOT the sum of each shard's
    # corpus_pub_count. When one person is split into multiple OpenAlex author shards,
    # the same publication frequently appears under more than one shard; summing
    # corpus_pub_count double-counts those shared pubs and inflates the career total.
    # A distinct pub_id union is the correct career footprint. We only fall back to the
    # corpus_pub_count sum when flat data is unavailable (e.g. --skip-flat-stats).
    shard_oa_ids = [normalize_openalex_author_id(r.get("openalex_author_id")) for r in cluster_rows]
    shard_oa_ids = [oid for oid in shard_oa_ids if oid]

    total_career_pubs = 0
    career_first_pub_year = None
    latest_pub_year = None

    if flat_stats:
        all_pub_ids: Set[str] = set()
        all_years: List[int] = []
        for oid in shard_oa_ids:
            stats = flat_stats.get(oid)
            if stats:
                all_pub_ids.update(stats.get("pub_ids", set()))
                all_years.extend(stats.get("years", []))
        if all_pub_ids:
            total_career_pubs = len(all_pub_ids)
        if all_years:
            career_first_pub_year = min(all_years)
            latest_pub_year = max(all_years)

    # Fallback to inventory corpus sums if flat didn't provide data
    if total_career_pubs == 0:
        total_career_pubs = sum(row_corpus(r) for r in cluster_rows)
    if career_first_pub_year is None:
        fyears = [y for r in cluster_rows if (y := year_int(r.get("first_seen_pub_year"))) is not None]
        career_first_pub_year = min(fyears) if fyears else None
    if latest_pub_year is None:
        lyears = [y for r in cluster_rows if (y := year_int(r.get("last_seen_pub_year"))) is not None]
        latest_pub_year = max(lyears) if lyears else None

    # Clustering method
    if orcid:
        identity_method = MATCH_METHOD_ORCID
        identity_confidence_score = CONFIDENCE_ORCID
    elif institution_ror or institution_normalized:
        identity_method = MATCH_METHOD_NAME_INSTITUTION
        identity_confidence_score = CONFIDENCE_NAME_INSTITUTION
    else:
        identity_method = MATCH_METHOD_NAME_ONLY
        identity_confidence_score = CONFIDENCE_NAME_ONLY_SINGLETON

    # identity_hash
    nf, nl = name_pair_from_display(preferred_display_name or primary.get("display_name"))
    normalized_name = f"{nf} {nl}".strip()
    inst_key = institution_ror or normalize_token_field(institution_normalized or "")
    if not orcid and not inst_key:
        # Name-only singleton (no ORCID, no institution corroboration; see
        # cluster_key_for_row). identity_hash is UNIQUE NOT NULL, so two distinct
        # same-name singletons must not collide on sha256(name|"") -> anchor the hash on
        # this shard's own OpenAlex id. Deterministic per shard, so re-runs reproduce the
        # same hash (idempotent) while keeping each singleton distinct.
        inst_key = f"oa:{normalize_openalex_author_id(primary.get('openalex_author_id'))}"
    identity_hash = compute_identity_hash(orcid, normalized_name, inst_key)

    return ClusterMetadata(
        hcp_id=hcp_id,
        first_name=first_name,
        middle_name=middle_name,
        last_name=last_name,
        preferred_display_name=preferred_display_name,
        orcid=orcid or None,
        institution_normalized=institution_normalized,
        institution_raw=institution_raw,
        institution_ror=institution_ror,
        country=country,
        career_first_pub_year=career_first_pub_year,
        latest_pub_year=latest_pub_year,
        total_career_pubs=total_career_pubs,
        identity_hash=identity_hash,
        identity_confidence_score=identity_confidence_score,
        identity_method=identity_method,
        cluster_size=len(cluster_rows),
        primary_row=primary,
        all_rows=cluster_rows,
    )


# ============================================================
# Row builders
# ============================================================


def build_hcp_row(meta: ClusterMetadata, ts_iso: str, ingestion_run_id: str) -> Dict[str, Any]:
    return {
        "id": meta.hcp_id,
        "identity_hash": meta.identity_hash,
        "first_name": meta.first_name,
        "middle_name": meta.middle_name,
        "last_name": meta.last_name,
        "preferred_display_name": meta.preferred_display_name,
        "orcid": meta.orcid,
        "institution_normalized": meta.institution_normalized,
        "institution_raw": meta.institution_raw,
        "country": meta.country,
        "career_first_pub_year": meta.career_first_pub_year,
        "total_career_pubs": meta.total_career_pubs,
        "latest_pub_year": meta.latest_pub_year,
        "identity_confidence_score": meta.identity_confidence_score,
        "identity_method": meta.identity_method,
        "created_at": ts_iso,
        "updated_at": ts_iso,
        "ingestion_run_id": ingestion_run_id,
    }


def build_link_rows(meta: ClusterMetadata) -> List[Dict[str, Any]]:
    primary_oid = normalize_openalex_author_id(meta.primary_row.get("openalex_author_id"))
    rows: List[Dict[str, Any]] = []
    for r in meta.all_rows:
        oid = normalize_openalex_author_id(r.get("openalex_author_id"))
        if not oid:
            continue
        rows.append({
            "hcp_id": meta.hcp_id,
            "openalex_author_id": oid,
            "is_primary": oid == primary_oid,
            "match_confidence": meta.identity_confidence_score,
            "match_method": meta.identity_method,
            "first_seen_pub_year": year_int(r.get("first_seen_pub_year")),
            "last_seen_pub_year": year_int(r.get("last_seen_pub_year")),
            "corpus_pub_count": row_corpus(r),
        })
    return rows


# ============================================================
# Validation (run after a dry-run, before trusting the output)
# ============================================================


def validate_no_conflation(metas: Sequence["ClusterMetadata"], top_n: int = 15) -> List[str]:
    """Flag clusters that look like name-collision conflation.

    Two heuristics:
      1. Implausible career pub count (> CONFLATION_PUB_CEILING) - real prolific
         researchers top out in the low thousands; more suggests distinct people merged.
      2. A multi-shard cluster whose shards span more than one distinct ROR - the
         bucketing should never produce this (name+ROR is the merge key), so if it
         appears it is a real red flag worth eyeballing.
    Returns a list of human-readable warning strings (empty = clean).
    """
    warnings: List[str] = []
    for m in sorted(metas, key=lambda x: x.total_career_pubs, reverse=True):
        distinct_rors = {
            normalize_ror(r.get("last_known_institution_ror"))
            for r in m.all_rows
            if normalize_ror(r.get("last_known_institution_ror"))
        }
        if m.total_career_pubs > CONFLATION_PUB_CEILING and m.identity_method != MATCH_METHOD_ORCID:
            warnings.append(
                f"[pub-ceiling] {m.preferred_display_name or m.last_name}: "
                f"{m.total_career_pubs} pubs across {m.cluster_size} shard(s), "
                f"method={m.identity_method}, inst={m.institution_normalized or '(none)'} "
                f"- verify this is one real researcher, not merged homonyms."
            )
        if len(distinct_rors) > 1:
            warnings.append(
                f"[multi-ror] {m.preferred_display_name or m.last_name}: "
                f"{m.cluster_size} shard(s) span {len(distinct_rors)} distinct RORs "
                f"{sorted(distinct_rors)} - unexpected for a single-identity cluster."
            )

    print("\n--- Validation 1: conflation check ---")
    print(f"  Top {top_n} clusters by total_career_pubs:")
    for m in sorted(metas, key=lambda x: x.total_career_pubs, reverse=True)[:top_n]:
        print(
            f"    {m.total_career_pubs:>6} pubs | {m.cluster_size} shard(s) | "
            f"{m.identity_method:<16} | {m.preferred_display_name or m.last_name} "
            f"@ {m.institution_normalized or '(none)'}"
        )
    if warnings:
        print(f"  [WARN] {len(warnings)} conflation warning(s):")
        for w in warnings:
            print(f"    {w}")
    else:
        print("  [OK] no conflation heuristics tripped.")
    return warnings


def validate_kol_fragmentation(metas: Sequence["ClusterMetadata"]) -> List[str]:
    """Check that known KOLs each resolve to one (or a small correct number of) HCP.

    Fragmentation = one real person split across many HCP rows. For each known KOL last
    name we count how many HCP clusters carry that normalized last name and warn when a
    name resolves to several separate HCPs (candidate fragmentation to reconcile).
    NOTE: on a --ta-scoped or --limit run this only sees a slice, so treat as advisory.
    """
    by_last: Dict[str, List["ClusterMetadata"]] = defaultdict(list)
    for m in metas:
        _, nl = name_pair_from_display(m.preferred_display_name or m.last_name)
        if nl:
            by_last[nl].append(m)

    warnings: List[str] = []
    print("\n--- Validation 2: KOL fragmentation check ---")
    for kol in KOL_LAST_NAMES:
        matches = by_last.get(kol, [])
        n = len(matches)
        if n == 0:
            print(f"  {kol}: 0 HCPs (not in this run's slice)")
            continue
        insts = {m.institution_normalized or "(none)" for m in matches}
        # More HCP rows than distinct institutions -> same person split at one institution.
        flagged = n > max(1, len(insts))
        marker = "[WARN]" if flagged else "[OK]"
        print(f"  {marker} {kol}: {n} HCP(s) across {len(insts)} institution(s)")
        if flagged:
            warnings.append(
                f"[kol-fragment] '{kol}' resolves to {n} HCPs but only {len(insts)} "
                f"distinct institution(s) - likely fragmentation to reconcile in dedup."
            )
    if not warnings:
        print("  [OK] no KOL fragmentation heuristics tripped.")
    return warnings


def validate_counts(n_authors: int, n_hcps: int) -> List[str]:
    """Sanity-check the HCP:author ratio (clustering should reduce shards->people)."""
    warnings: List[str] = []
    ratio = (n_hcps / n_authors) if n_authors else 0.0
    print("\n--- Validation 3: count sanity ---")
    print(f"  Inventory authors clustered: {n_authors:,}")
    print(f"  HCPs formed:                 {n_hcps:,}")
    print(f"  HCP:author ratio:            {ratio:.3f}")
    if n_authors == 0:
        print("  (no authors to assess)")
        return warnings
    if ratio >= COUNTS_NOT_MERGING_RATIO:
        warnings.append(
            f"[counts] ratio {ratio:.3f} >= {COUNTS_NOT_MERGING_RATIO}: HCPs ~ authors, "
            f"clustering is barely merging - possible bug (shards not grouping)."
        )
    elif ratio <= COUNTS_OVERMERGE_RATIO:
        warnings.append(
            f"[counts] ratio {ratio:.3f} <= {COUNTS_OVERMERGE_RATIO}: HCPs << authors, "
            f"possible over-merge / conflation - verify large clusters."
        )
    if warnings:
        for w in warnings:
            print(f"  [WARN] {w}")
    else:
        print("  [OK] ratio in expected merge band.")
    return warnings


def run_validations(metas: Sequence["ClusterMetadata"], n_authors: int) -> List[str]:
    """Run all validation checks; return the combined warning list."""
    warnings: List[str] = []
    warnings += validate_no_conflation(metas)
    warnings += validate_kol_fragmentation(metas)
    warnings += validate_counts(n_authors, len(metas))
    print("\n--- Validation summary ---")
    if warnings:
        print(f"  [WARN] {len(warnings)} total warning(s) - review before a live run.")
    else:
        print("  [OK] all validations passed.")
    return warnings


# ============================================================
# DB operations
# ============================================================


def fetch_linked_openalex_ids(supabase: Client, target_version: str) -> Set[str]:
    """Every openalex_author_id already linked in hcp_openalex_authors(_v2).

    This is the incremental idempotency prefilter: any author already linked here is
    dropped from the unlinked backlog, so links written by a prior run MUST be visible to
    the next run. Under target_version 'v2' this reads hcp_openalex_authors_v2 -- the SAME
    table upsert_link_rows() writes to (both resolve via get_table_name), so reads and
    writes cannot diverge for a given run.

    Keyset MUST paginate by openalex_author_id, NOT hcp_id. The PK is composite
    (hcp_id, openalex_author_id); ordering by hcp_id and advancing with gt(hcp_id) silently
    drops the tail shards of any hcp_id whose rows straddle a page boundary -- those
    already-linked authors then look unlinked and get re-created every run, so idempotency
    never converges. Ordering by openalex_author_id is safe for building a SET of ids: if
    an id is duplicated across a boundary it is already in the set, so skipping its later
    rows loses nothing.
    """
    hcp_oa_table = get_table_name("hcp_openalex_authors", target_version)
    out: Set[str] = set()
    last_oa: Optional[str] = None
    while True:
        q = (
            supabase.table(hcp_oa_table)
            .select("openalex_author_id")
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_oa is not None:
            q = q.gt("openalex_author_id", last_oa)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oid = normalize_openalex_author_id(row.get("openalex_author_id"))
            if oid:
                out.add(oid)
        last_oa = batch[-1].get("openalex_author_id")
        if not last_oa or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return out


INVENTORY_SELECT = (
    "openalex_author_id,display_name,last_known_institution,"
    "last_known_institution_ror,orcid,corpus_pub_count,first_seen_pub_year,last_seen_pub_year"
)


def fetch_unlinked_inventory(supabase: Client, linked: Set[str]) -> List[Dict[str, Any]]:
    """Fetch inventory rows whose OA IDs are NOT already linked."""
    rows_out: List[Dict[str, Any]] = []
    last_oa: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select(INVENTORY_SELECT)
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_oa is not None:
            q = q.gt("openalex_author_id", last_oa)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oid = normalize_openalex_author_id(row.get("openalex_author_id"))
            if not oid or oid in linked:
                continue
            rows_out.append(row)
        last_oa = batch[-1].get("openalex_author_id")
        if not last_oa or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return rows_out


def fetch_flat_stats_for_authors(
    supabase: Client,
    author_ids: Set[str],
    ta_slug: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Fetch per-author pub aggregation from author_pub_flat.

    Returns {openalex_author_id: {"pub_ids": set, "years": list}}.
    For total_career_pubs we always aggregate cross-TA (the full flat table).
    """
    stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"pub_ids": set(), "years": []})

    author_list = sorted(author_ids)
    chunk_size = 200
    for start in range(0, len(author_list), chunk_size):
        chunk = author_list[start:start + chunk_size]
        last_pub: Optional[str] = None
        while True:
            q = (
                supabase.table("author_pub_flat")
                .select("author_id,pub_id,pub_year")
                .in_("author_id", chunk)
                .order("author_id")
                .order("pub_id")
                .limit(FLAT_PAGE_SIZE)
            )
            if last_pub is not None:
                q = q.gt("pub_id", last_pub)
            batch = q.execute().data or []
            if not batch:
                break
            for row in batch:
                aid = row.get("author_id") or ""
                pid = row.get("pub_id") or ""
                py = year_int(row.get("pub_year"))
                if aid and pid:
                    stats[aid]["pub_ids"].add(pid)
                if py is not None:
                    stats[aid]["years"].append(py)
            last_pub = batch[-1].get("pub_id")
            if not last_pub or len(batch) < FLAT_PAGE_SIZE:
                break

    return dict(stats)


def fetch_ror_country_map(supabase: Client) -> Dict[str, str]:
    out: Dict[str, str] = {}
    last_id: Optional[str] = None
    while True:
        q = supabase.table("ror_to_country").select("ror_id,country_code").order("ror_id").limit(INVENTORY_PAGE_SIZE)
        if last_id is not None:
            q = q.gt("ror_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            rid = str(row.get("ror_id") or "").strip().lower()
            cc = row.get("country_code")
            if rid:
                out[rid] = str(cc).strip() if cc is not None else ""
        last_id = batch[-1].get("ror_id")
        if not last_id or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return out


def insert_hcps_batch(
    supabase: Client,
    rows: Sequence[Dict[str, Any]],
    errors: List[str],
    target_version: str,
) -> Set[str]:
    """Insert batch; return set of successfully inserted HCP ids."""
    hcps_table = get_table_name("hcps", target_version)
    ok: Set[str] = set()
    if not rows:
        return ok
    try:
        response = supabase.table(hcps_table).insert(list(rows)).execute()
        if not response.data:
            raise RuntimeError(f"Batch insert returned empty data ({len(rows)} rows)")
        for r in response.data:
            hid = r.get("id")
            if hid:
                ok.add(str(hid))
        missing = {str(r.get("id")) for r in rows if r.get("id")} - ok
        for mid in missing:
            errors.append(f"hcp insert id={mid}: submitted but not in response")
        return ok
    except Exception as exc:
        eprint(f"[{hcps_table} insert batch n={len(rows)}] {exc}")
        for r in rows:
            try:
                resp = supabase.table(hcps_table).insert([r]).execute()
                if resp.data:
                    hid = r.get("id")
                    if hid:
                        ok.add(str(hid))
                else:
                    errors.append(f"{hcps_table} insert id={r.get('id')}: single-row returned empty")
            except Exception as exc2:
                errors.append(f"{hcps_table} insert id={r.get('id')}: {exc2}")
                eprint(f"[{hcps_table} insert] {exc2}")
        return ok


def upsert_link_rows(
    supabase: Client,
    rows: Sequence[Dict[str, Any]],
    errors: List[str],
    target_version: str,
) -> int:
    """Upsert hcp_openalex_authors rows; return count written."""
    hcp_oa_table = get_table_name("hcp_openalex_authors", target_version)
    n = 0
    for i in range(0, len(rows), JOIN_UPSERT_CHUNK):
        chunk = list(rows[i:i + JOIN_UPSERT_CHUNK])
        try:
            response = supabase.table(hcp_oa_table).upsert(
                chunk, on_conflict="hcp_id,openalex_author_id"
            ).execute()
            if not response.data:
                raise RuntimeError(f"Link upsert returned empty ({len(chunk)} rows)")
            n += len(response.data)
        except Exception as exc:
            eprint(f"[{hcp_oa_table} upsert batch] {exc}")
            for r in chunk:
                try:
                    resp = supabase.table(hcp_oa_table).upsert(
                        [r], on_conflict="hcp_id,openalex_author_id"
                    ).execute()
                    if resp.data:
                        n += 1
                    else:
                        errors.append(f"{hcp_oa_table} upsert hcp={r.get('hcp_id')} oa={r.get('openalex_author_id')}: empty")
                except Exception as exc2:
                    errors.append(f"{hcp_oa_table} upsert hcp={r.get('hcp_id')} oa={r.get('openalex_author_id')}: {exc2}")
    return n


# ============================================================
# Incremental mode (path B: insert-new-only)
# ============================================================


def fetch_identity_hash_map(supabase: Client, target_version: str) -> Dict[str, str]:
    """identity_hash -> hcp_id for every existing HCP (keyset over id).

    This is the idempotency index: a cluster whose identity_hash is already present is a
    person we have already resolved, so we never create a second HCP for them.
    """
    hcps_table = get_table_name("hcps", target_version)
    out: Dict[str, str] = {}
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table(hcps_table)
            .select("id,identity_hash")
            .order("id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            h = row.get("identity_hash")
            hid = row.get("id")
            if h and hid:
                out[str(h)] = str(hid)
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return out


def fetch_link_oa_ids_for_hcp(supabase: Client, hcp_id: str, target_version: str) -> Set[str]:
    """Existing openalex_author_id shard-links for one HCP.

    hcp_openalex_authors_v2 has a composite PK and NO id column, so we select the
    PK columns only - never select("id") (v2 gotcha).
    """
    hcp_oa_table = get_table_name("hcp_openalex_authors", target_version)
    rows = (
        supabase.table(hcp_oa_table)
        .select("openalex_author_id")
        .eq("hcp_id", hcp_id)
        .execute()
        .data
        or []
    )
    return {normalize_openalex_author_id(r.get("openalex_author_id")) for r in rows if r.get("openalex_author_id")}


def update_inventory_backrefs(
    supabase: Client,
    oa_to_hcp: Dict[str, str],
    *,
    errors: List[str],
) -> int:
    """Write the inventory back-reference for every author linked this run.

    Sets openalex_author_inventory.has_matching_hcp = TRUE and matching_hcp_id = <hcp_id>
    for each linked openalex_author_id, keyed on openalex_author_id (the inventory's
    per-author key, full-URL form). Partial update -> .update().eq(), never upsert
    (v2 gotcha). Without this, has_matching_hcp stays false after an incremental run and
    can't be trusted as a resolution signal downstream. Returns rows updated.
    """
    n = 0
    for oid, hcp_id in oa_to_hcp.items():
        try:
            supabase.table("openalex_author_inventory").update(
                {"has_matching_hcp": True, "matching_hcp_id": hcp_id}
            ).eq("openalex_author_id", oid).execute()
            n += 1
        except Exception as exc:
            errors.append(f"inventory backref oa={oid} hcp={hcp_id}: {exc}")
            eprint(f"[inventory backref] oa={oid} hcp={hcp_id}: {exc}")
    return n


def build_link_row_for_shard(
    hcp_id: str,
    shard_row: Dict[str, Any],
    *,
    is_primary: bool,
    match_confidence: float,
    match_method: str,
) -> Optional[Dict[str, Any]]:
    oid = normalize_openalex_author_id(shard_row.get("openalex_author_id"))
    if not oid:
        return None
    return {
        "hcp_id": hcp_id,
        "openalex_author_id": oid,
        "is_primary": is_primary,
        "match_confidence": match_confidence,
        "match_method": match_method,
        "first_seen_pub_year": year_int(shard_row.get("first_seen_pub_year")),
        "last_seen_pub_year": year_int(shard_row.get("last_seen_pub_year")),
        "corpus_pub_count": row_corpus(shard_row),
    }


@dataclass
class IncrementalPlan:
    """The decided actions for an incremental run (pure - no DB effects)."""
    creates: List["ClusterMetadata"] = field(default_factory=list)          # brand-new people -> new HCPs
    link_inserts: List[Dict[str, Any]] = field(default_factory=list)        # links onto existing HCPs
    touched_hcp_ids: Set[str] = field(default_factory=set)                  # existing HCPs gaining >=1 link


def plan_incremental(
    metas: Sequence["ClusterMetadata"],
    existing_hash_to_hcp: Dict[str, str],
    existing_links: Set[Tuple[str, str]],
) -> IncrementalPlan:
    """Decide creates vs. link-only, purely from in-memory state.

    Keeping this a pure function (no DB access) is what makes the idempotency guarantee
    testable offline: apply a plan to the state, re-plan, and the second plan must be
    empty. See self_test_idempotency().

    For a cluster whose identity_hash already exists:
      * The person is already resolved - do NOT create a new HCP.
      * Add only the shard-links that don't already exist (composite-PK existence check
        against `existing_links`); new links onto an existing HCP are is_primary=False
        (the existing primary shard stays primary).
    For a cluster whose identity_hash is new: create the HCP + its links (full-build path).
    """
    plan = IncrementalPlan()
    for m in metas:
        existing_hcp_id = existing_hash_to_hcp.get(m.identity_hash)
        if existing_hcp_id is None:
            plan.creates.append(m)
            continue
        for shard_row in m.all_rows:
            oid = normalize_openalex_author_id(shard_row.get("openalex_author_id"))
            if not oid:
                continue
            if (existing_hcp_id, oid) in existing_links:
                continue  # link already present -> skip (idempotent)
            link = build_link_row_for_shard(
                existing_hcp_id,
                shard_row,
                is_primary=False,
                match_confidence=m.identity_confidence_score,
                match_method=m.identity_method,
            )
            if link is not None:
                plan.link_inserts.append(link)
                plan.touched_hcp_ids.add(existing_hcp_id)
    return plan


def refresh_existing_hcp_derived_fields(
    supabase: Client,
    hcp_id: str,
    new_shard_ids: Set[str],
    flat_stats: Dict[str, Dict[str, Any]],
    ts_iso: str,
    target_version: str,
    *,
    dry_run: bool,
) -> Optional[Dict[str, Any]]:
    """Recompute total_career_pubs / latest_pub_year for an existing HCP that gained
    shards, and update ONLY if the new shards actually changed them.

    Correctness note: total_career_pubs is a DISTINCT pub_id union, so we must recompute
    across the FULL shard set (existing links | new shards), not just the new shards -
    otherwise we'd miss pubs shared between old and new shards. Uses .update().eq()
    (never upsert). Returns the applied update dict, or None if nothing changed.
    """
    hcps_table = get_table_name("hcps", target_version)

    existing_shards = fetch_link_oa_ids_for_hcp(supabase, hcp_id, target_version)
    all_shards = {s for s in (existing_shards | new_shard_ids) if s}

    # Ensure flat stats cover every shard (fetch any we don't already have).
    missing = all_shards - set(flat_stats.keys())
    local_stats = flat_stats
    if missing:
        extra = fetch_flat_stats_for_authors(supabase, missing)
        local_stats = {**flat_stats, **extra}

    pub_ids: Set[str] = set()
    years: List[int] = []
    for oid in all_shards:
        st = local_stats.get(oid)
        if st:
            pub_ids.update(st.get("pub_ids", set()))
            years.extend(st.get("years", []))

    if not pub_ids and not years:
        # No flat data (e.g. --skip-flat-stats) - cannot safely recompute; leave as-is.
        return None

    new_total = len(pub_ids) if pub_ids else None
    new_latest = max(years) if years else None

    stored = (
        supabase.table(hcps_table)
        .select("total_career_pubs,latest_pub_year")
        .eq("id", hcp_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    stored_total = int(stored[0].get("total_career_pubs") or 0) if stored else 0
    stored_latest = year_int(stored[0].get("latest_pub_year")) if stored else None

    update: Dict[str, Any] = {}
    if new_total is not None and new_total != stored_total:
        update["total_career_pubs"] = new_total
    if new_latest is not None and (stored_latest is None or new_latest > stored_latest):
        update["latest_pub_year"] = new_latest

    if not update:
        return None
    if not dry_run:
        update_with_ts = {**update, "updated_at": ts_iso}
        supabase.table(hcps_table).update(update_with_ts).eq("id", hcp_id).execute()
    return update


@dataclass
class IncrementalSummary:
    """Structured 'what changed' record for an incremental run (also the dedup seed)."""
    mode: str
    dry_run: bool
    ingestion_run_id: str
    timestamp: str
    hcps_created_count: int
    hcps_created_ids: List[str]
    shard_links_added: int
    existing_hcps_touched_count: int
    existing_hcps_touched_ids: List[str]
    provisional_new_hcps: int
    inventory_backrefs_written: int
    errors: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "dry_run": self.dry_run,
            "ingestion_run_id": self.ingestion_run_id,
            "timestamp": self.timestamp,
            "hcps_created": {"count": self.hcps_created_count, "hcp_ids": self.hcps_created_ids},
            "shard_links_added": self.shard_links_added,
            "existing_hcps_touched": {
                "count": self.existing_hcps_touched_count,
                "hcp_ids": self.existing_hcps_touched_ids,
            },
            "provisional_new_hcps": self.provisional_new_hcps,
            "inventory_backrefs_written": self.inventory_backrefs_written,
            "errors": self.errors,
            "next_step": "REQUIRED: run the dedup suite to reconcile provisional_new_hcps.",
        }


def emit_incremental_summary(summary: IncrementalSummary, summary_out: Optional[str]) -> None:
    payload = summary.to_dict()
    print("\n=== INCREMENTAL RUN SUMMARY (JSON) ===")
    print(json.dumps(payload, indent=2, sort_keys=True))
    if summary.provisional_new_hcps > 0:
        print(
            f"\n*** {summary.provisional_new_hcps} provisional new HCP(s) created. "
            f"You MUST run the dedup suite next to reconcile them. ***"
        )
    if summary_out:
        with open(summary_out, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
        print(f"Run-summary written to: {summary_out}")


def execute_incremental(
    supabase: Client,
    metas: Sequence["ClusterMetadata"],
    *,
    flat_stats: Dict[str, Dict[str, Any]],
    ts_iso: str,
    ingestion_run_id: str,
    target_version: str,
    dry_run: bool,
    bs: int,
    errors: List[str],
) -> IncrementalSummary:
    """Run the insert-new-only path and return the structured run summary."""
    print("\nLoading existing identity_hash -> hcp_id map (idempotency index)...")
    existing_hash_to_hcp = fetch_identity_hash_map(supabase, target_version)
    print(f"  Existing HCPs indexed by identity_hash: {len(existing_hash_to_hcp):,}")

    # Existing links only need checking for clusters that hit an existing hash. Build
    # that set narrowly (composite-PK existence check, no select("id")).
    hit_hcp_ids: Set[str] = {
        existing_hash_to_hcp[m.identity_hash]
        for m in metas
        if m.identity_hash in existing_hash_to_hcp
    }
    existing_links: Set[Tuple[str, str]] = set()
    for hcp_id in hit_hcp_ids:
        for oid in fetch_link_oa_ids_for_hcp(supabase, hcp_id, target_version):
            existing_links.add((hcp_id, oid))

    plan = plan_incremental(metas, existing_hash_to_hcp, existing_links)
    print(
        f"  Plan: {len(plan.creates):,} new HCP(s), "
        f"{len(plan.link_inserts):,} link(s) onto {len(plan.touched_hcp_ids):,} existing HCP(s)."
    )

    created_ids: List[str] = []
    links_added = 0
    # openalex_author_id -> hcp_id for every author linked this run (new HCPs AND links
    # onto existing HCPs). Drives the inventory back-reference write below.
    oa_to_hcp: Dict[str, str] = {}

    if not dry_run:
        # 1) Create brand-new HCPs (+ their links), reusing the full-build writers.
        for start in range(0, len(plan.creates), bs):
            batch = plan.creates[start:start + bs]
            hcp_rows = [build_hcp_row(m, ts_iso, ingestion_run_id) for m in batch]
            ok_ids = insert_hcps_batch(supabase, hcp_rows, errors, target_version)
            created_ids.extend(sorted(ok_ids))
            link_rows: List[Dict[str, Any]] = []
            for m in batch:
                if m.hcp_id in ok_ids:
                    mlinks = build_link_rows(m)
                    link_rows.extend(mlinks)
                    for lr in mlinks:
                        oa_to_hcp[normalize_openalex_author_id(lr["openalex_author_id"])] = m.hcp_id
            if link_rows:
                links_added += upsert_link_rows(supabase, link_rows, errors, target_version)

        # 2) Add missing links onto existing HCPs.
        if plan.link_inserts:
            links_added += upsert_link_rows(supabase, plan.link_inserts, errors, target_version)
            for lr in plan.link_inserts:
                oa_to_hcp[normalize_openalex_author_id(lr["openalex_author_id"])] = str(lr["hcp_id"])
    else:
        created_ids = [m.hcp_id for m in plan.creates]
        create_links = sum(len(build_link_rows(m)) for m in plan.creates)
        links_added = create_links + len(plan.link_inserts)
        # Same back-reference set a live run WOULD write (reported, not applied).
        for m in plan.creates:
            for lr in build_link_rows(m):
                oa_to_hcp[normalize_openalex_author_id(lr["openalex_author_id"])] = m.hcp_id
        for lr in plan.link_inserts:
            oa_to_hcp[normalize_openalex_author_id(lr["openalex_author_id"])] = str(lr["hcp_id"])

    # Inventory back-reference: mark every linked author resolved. Live writes now; dry-run
    # reports the count it would have written.
    if not dry_run:
        inventory_backrefs_written = update_inventory_backrefs(supabase, oa_to_hcp, errors=errors)
    else:
        inventory_backrefs_written = len(oa_to_hcp)

    # 3) Refresh derived fields on existing HCPs that gained shards.
    new_shards_by_hcp: Dict[str, Set[str]] = defaultdict(set)
    for link in plan.link_inserts:
        new_shards_by_hcp[str(link["hcp_id"])].add(normalize_openalex_author_id(link["openalex_author_id"]))

    touched_ids: List[str] = []
    for hcp_id, new_shard_ids in new_shards_by_hcp.items():
        applied = refresh_existing_hcp_derived_fields(
            supabase, hcp_id, new_shard_ids, flat_stats, ts_iso, target_version, dry_run=dry_run
        )
        if applied:
            touched_ids.append(hcp_id)

    # provisional_new_hcps: EVERY HCP created by an incremental run is provisional - a
    # candidate for the dedup pass to fold into an existing canonical (a new shard that
    # clustering could not attach to an existing identity, e.g. new institution + no
    # shared ORCID). This is the count the orchestrator hands to the dedup stage.
    provisional_new_hcps = len(created_ids)

    return IncrementalSummary(
        mode="incremental",
        dry_run=dry_run,
        ingestion_run_id=ingestion_run_id,
        timestamp=ts_iso,
        hcps_created_count=len(created_ids),
        hcps_created_ids=created_ids,
        shard_links_added=links_added,
        existing_hcps_touched_count=len(touched_ids),
        existing_hcps_touched_ids=sorted(touched_ids),
        provisional_new_hcps=provisional_new_hcps,
        inventory_backrefs_written=inventory_backrefs_written,
        errors=len(errors),
    )


# ============================================================
# Offline idempotency self-test (no DB)
# ============================================================


def _fake_meta(identity_hash: str, hcp_id: str, shard_ids: Sequence[str]) -> "ClusterMetadata":
    """Build a minimal ClusterMetadata for the self-test (no DB, no flat stats)."""
    rows = [{"openalex_author_id": s, "corpus_pub_count": 3} for s in shard_ids]
    return ClusterMetadata(
        hcp_id=hcp_id,
        first_name=None, middle_name=None, last_name="Test",
        preferred_display_name="Test Person", orcid=None,
        institution_normalized="Inst", institution_raw="Inst", institution_ror="ror:x",
        country=None, career_first_pub_year=2000, latest_pub_year=2020,
        total_career_pubs=len(shard_ids), identity_hash=identity_hash,
        identity_confidence_score=0.9, identity_method=MATCH_METHOD_NAME_INSTITUTION,
        cluster_size=len(rows), primary_row=rows[0], all_rows=rows,
    )


def self_test_idempotency() -> bool:
    """Prove --incremental is idempotent using the pure planner (no DB).

    Round 1 against a partially-populated state creates some HCPs and links. We then apply
    that plan to the state (as the executor would) and re-plan. Round 2 MUST be empty:
    zero creates, zero link inserts.
    """
    print("Self-test: incremental idempotency (offline, pure planner)")

    # State: hash "H_EXIST" already resolved to hcp "hcp_exist" with one linked shard.
    existing_hash_to_hcp: Dict[str, str] = {"H_EXIST": "hcp_exist"}
    existing_links: Set[Tuple[str, str]] = {("hcp_exist", "https://openalex.org/A_old")}

    metas = [
        # New person (hash not present) -> should create.
        _fake_meta("H_NEW", "hcp_new_1", ["https://openalex.org/A_new1"]),
        # Existing person gaining a new shard -> link-only, no create.
        _fake_meta("H_EXIST", "hcp_ignored", ["https://openalex.org/A_new2"]),
        # Existing person, shard ALREADY linked -> no-op.
        _fake_meta("H_EXIST", "hcp_ignored", ["https://openalex.org/A_old"]),
    ]

    plan1 = plan_incremental(metas, existing_hash_to_hcp, existing_links)
    ok = True
    if len(plan1.creates) != 1:
        print(f"  FAIL round1: expected 1 create, got {len(plan1.creates)}"); ok = False
    if len(plan1.link_inserts) != 1:
        print(f"  FAIL round1: expected 1 link insert, got {len(plan1.link_inserts)}"); ok = False

    # Apply plan1 to the state, exactly as the executor's writes would.
    for m in plan1.creates:
        existing_hash_to_hcp[m.identity_hash] = m.hcp_id
        for shard_row in m.all_rows:
            existing_links.add((m.hcp_id, normalize_openalex_author_id(shard_row["openalex_author_id"])))
    for link in plan1.link_inserts:
        existing_links.add((str(link["hcp_id"]), normalize_openalex_author_id(link["openalex_author_id"])))

    plan2 = plan_incremental(metas, existing_hash_to_hcp, existing_links)
    if plan2.creates or plan2.link_inserts:
        print(
            f"  FAIL round2 (idempotency): {len(plan2.creates)} create(s), "
            f"{len(plan2.link_inserts)} link(s) - expected 0/0"
        )
        ok = False

    print("  [OK] idempotency holds: second run creates 0 HCPs and 0 links." if ok else "  [FAIL] self-test FAILED.")
    return ok


# ============================================================
# CLI
# ============================================================


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Step C v2: Create canonical HCPs from OpenAlex author inventory clustering.",
    )
    p.add_argument("--dry-run", action="store_true", help="Compute clusters, print stats, write nothing")
    p.add_argument("--limit", type=int, default=None, metavar="N", help="Process only N clusters (testing)")
    p.add_argument("--ta", type=str, default=None, metavar="SLUG",
                   help="Scope to authors in this TA (via author_pub_flat.source_ta_id); "
                        "pub counts still cross-TA")
    p.add_argument("--target-version", choices=["v1", "v2"], default="v2",
                   help="Schema version (default v2)")
    p.add_argument("--batch-size", type=int, default=HCP_INSERT_BATCH, help="HCP insert batch size")
    p.add_argument("--csv-also", metavar="PATH", default=None, help="Write CSV of planned HCPs")
    p.add_argument("--skip-flat-stats", action="store_true",
                   help="Skip author_pub_flat reads (faster for testing, uses inventory corpus sums)")
    p.add_argument("--incremental", action="store_true",
                   help="Insert-new-only path B: skip clusters whose identity_hash already "
                        "exists (only add missing shard-links + refresh derived fields). "
                        "MUST be followed by the dedup suite.")
    p.add_argument("--summary-out", metavar="PATH", default=None,
                   help="Write the incremental run-summary JSON to this path (also printed to stdout).")
    p.add_argument("--self-test", action="store_true",
                   help="Run the offline incremental idempotency self-test (no DB) and exit.")
    return p.parse_args()


# ============================================================
# Main
# ============================================================


def main() -> None:
    args = parse_args()

    # Offline idempotency self-test: no DB, no env needed. Exit non-zero on failure.
    if args.self_test:
        raise SystemExit(0 if self_test_idempotency() else 1)

    target_version = args.target_version
    dry_run = args.dry_run
    incremental = args.incremental
    bs = max(1, args.batch_size)

    load_dotenv()
    supabase = init_supabase()
    t0 = time.perf_counter()
    ingestion_run_id = str(uuid.uuid4())
    ts_iso = datetime.now(timezone.utc).isoformat()

    mode_label = "INCREMENTAL (insert-new-only)" if incremental else "FULL BUILD"
    print(f"Step C v2 - target_version={target_version}, dry_run={dry_run}, mode={mode_label}")
    print(f"Ingestion run ID: {ingestion_run_id}")
    if incremental:
        print("NOTE: incremental mode MUST be followed by the dedup suite (see module docstring).")

    # --- Idempotency: load already-linked OA IDs ---
    link_table = get_table_name("hcp_openalex_authors", target_version)
    print(f"\nLoading linked OpenAlex IDs from {link_table}...")
    linked = fetch_linked_openalex_ids(supabase, target_version)
    print(f"  Already linked: {len(linked):,}")

    # --- Fetch unlinked inventory ---
    print("\nFetching unlinked inventory rows...")
    t1 = time.perf_counter()
    unlinked = fetch_unlinked_inventory(supabase, linked)
    print(f"  Unlinked rows: {len(unlinked):,} ({time.perf_counter() - t1:.1f}s)")

    if not unlinked:
        print("Nothing to do - all inventory rows are already linked.")
        if incremental:
            # This is the idempotent no-op case (e.g. a second --incremental run with no
            # new inventory). Still emit the required run-summary, all-zero.
            emit_incremental_summary(
                IncrementalSummary(
                    mode="incremental", dry_run=dry_run, ingestion_run_id=ingestion_run_id,
                    timestamp=ts_iso, hcps_created_count=0, hcps_created_ids=[],
                    shard_links_added=0, existing_hcps_touched_count=0,
                    existing_hcps_touched_ids=[], provisional_new_hcps=0,
                    inventory_backrefs_written=0, errors=0,
                ),
                args.summary_out,
            )
        return

    # --- TA scoping (optional) ---
    if args.ta:
        print(f"\nTA scoping: filtering to authors appearing in TA '{args.ta}' via author_pub_flat...")
        ta_row = supabase.table("therapeutic_areas").select("id").eq("slug", args.ta).limit(1).execute()
        ta_rows = ta_row.data or []
        if not ta_rows:
            raise SystemExit(f"No therapeutic_areas row for slug '{args.ta}'")
        ta_id = str(ta_rows[0]["id"])
        print(f"  TA ID: {ta_id}")

        # Collect author_ids that appear in this TA
        ta_author_ids: Set[str] = set()
        last_aid: Optional[str] = None
        while True:
            q = (
                supabase.table("author_pub_flat")
                .select("author_id")
                .eq("source_ta_id", ta_id)
                .order("author_id")
                .limit(FLAT_PAGE_SIZE)
            )
            if last_aid:
                q = q.gt("author_id", last_aid)
            batch = q.execute().data or []
            if not batch:
                break
            for row in batch:
                aid = row.get("author_id")
                if aid:
                    ta_author_ids.add(str(aid))
            last_aid = batch[-1].get("author_id")
            if not last_aid or len(batch) < FLAT_PAGE_SIZE:
                break
        print(f"  Authors in TA: {len(ta_author_ids):,}")

        unlinked = [
            r for r in unlinked
            if normalize_openalex_author_id(r.get("openalex_author_id")) in ta_author_ids
        ]
        print(f"  Unlinked after TA filter: {len(unlinked):,}")

    # --- Cluster ---
    print("\nClustering...")
    clusters = cluster_inventory(unlinked)
    print(f"  Clusters formed: {len(clusters):,} (from {len(unlinked):,} inventory rows)")

    if args.limit:
        clusters = clusters[:args.limit]
        print(f"  After --limit: {len(clusters):,}")

    # --- Flat stats ---
    flat_stats: Dict[str, Dict[str, Any]] = {}
    if not args.skip_flat_stats:
        all_oa_ids: Set[str] = set()
        for cluster in clusters:
            for row in cluster:
                oid = normalize_openalex_author_id(row.get("openalex_author_id"))
                if oid:
                    all_oa_ids.add(oid)
        print(f"\nFetching author_pub_flat stats for {len(all_oa_ids):,} author IDs...")
        t2 = time.perf_counter()
        flat_stats = fetch_flat_stats_for_authors(supabase, all_oa_ids)
        print(f"  Done ({time.perf_counter() - t2:.1f}s). Authors with flat data: {len(flat_stats):,}")
    else:
        print("\n[--skip-flat-stats] Using inventory corpus sums instead of author_pub_flat")

    # --- ROR country ---
    print("\nLoading ror_to_country...")
    ror_country = fetch_ror_country_map(supabase)
    print(f"  ROR keys: {len(ror_country):,}")

    # --- Derive metadata ---
    print("\nDeriving cluster metadata...")
    metas: List[ClusterMetadata] = []
    for cluster in clusters:
        meta = derive_cluster_metadata(cluster, ror_country, flat_stats)
        metas.append(meta)

    # --- Summary stats ---
    method_counts = Counter(m.identity_method for m in metas)
    country_counts = Counter(m.country or "(null)" for m in metas)
    multi_shard = sum(1 for m in metas if m.cluster_size > 1)
    total_links = sum(len(build_link_rows(m)) for m in metas)

    print(f"\n{'='*72}")
    print(f"STEP C v2 - {'DRY RUN' if dry_run else 'LIVE'} SUMMARY")
    print(f"{'='*72}")
    print(f"Unlinked inventory rows: {len(unlinked):,}")
    print(f"Clusters to process: {len(metas):,}")
    print(f"Multi-shard clusters (merged): {multi_shard:,}")
    print(f"Link rows to write: {total_links:,}")
    print(f"\nClustering methods:")
    for method, cnt in method_counts.most_common():
        print(f"  {method}: {cnt:,}")
    print(f"\nTop countries:")
    for code, cnt in country_counts.most_common(15):
        print(f"  {code}: {cnt:,}")

    # Authors actually going into the processed clusters (respects --limit / --ta),
    # used for the count-ratio validation.
    authors_in_clusters = sum(m.cluster_size for m in metas)

    # --- Top HCPs for conflation check ---
    top_by_pubs = sorted(metas, key=lambda m: m.total_career_pubs, reverse=True)[:10]
    print(f"\nTop 10 by total_career_pubs (conflation check):")
    for m in top_by_pubs:
        print(f"  {m.preferred_display_name or m.last_name}: "
              f"{m.total_career_pubs} pubs, {m.cluster_size} shard(s), "
              f"method={m.identity_method}, inst={m.institution_normalized or '(none)'}")

    errors: List[str] = []

    if dry_run:
        # Spec validations run after the dry-run computation, before any live trust.
        print(f"\n{'='*72}")
        print("VALIDATIONS (post-dry-run)")
        print(f"{'='*72}")
        run_validations(metas, authors_in_clusters)

        if incremental:
            # Show exactly what a live incremental run WOULD do (reads only; no writes).
            summary = execute_incremental(
                supabase, metas,
                flat_stats=flat_stats, ts_iso=ts_iso, ingestion_run_id=ingestion_run_id,
                target_version=target_version, dry_run=True, bs=bs, errors=errors,
            )
            emit_incremental_summary(summary, args.summary_out)

        print(f"\n*** DRY RUN: no writes performed. ***")
        print(f"Wall time: {time.perf_counter() - t0:.1f}s")
        if args.csv_also:
            _write_csv(args.csv_also, metas)
            print(f"CSV: {args.csv_also}")
        return

    # --- Live write ---
    if incremental:
        summary = execute_incremental(
            supabase, metas,
            flat_stats=flat_stats, ts_iso=ts_iso, ingestion_run_id=ingestion_run_id,
            target_version=target_version, dry_run=False, bs=bs, errors=errors,
        )
        print(f"\n{'='*72}")
        print(f"INCREMENTAL COMPLETE: {summary.hcps_created_count:,} new HCP(s), "
              f"{summary.shard_links_added:,} link(s) added, "
              f"{summary.existing_hcps_touched_count:,} existing HCP(s) refreshed.")
        if errors:
            print(f"Errors: {len(errors)}")
            for e in errors[:10]:
                print(f"  {e}")
        print(f"Wall time: {time.perf_counter() - t0:.1f}s")
        emit_incremental_summary(summary, args.summary_out)
        if args.csv_also:
            _write_csv(args.csv_also, metas)
            print(f"CSV: {args.csv_also}")
        return

    # --- Full-build write ---
    print(f"\nWriting HCPs and links (batch size {bs})...")
    hcps_created = 0
    links_written = 0
    # openalex_author_id -> hcp_id for every author linked by this build. Same back-
    # reference the incremental path writes, via the same helper: has_matching_hcp /
    # matching_hcp_id must be maintained by BOTH writers, or a full rebuild leaves the
    # flag stale (worse than consistently absent).
    oa_to_hcp: Dict[str, str] = {}

    for start in range(0, len(metas), bs):
        batch = metas[start:start + bs]
        hcp_rows = [build_hcp_row(m, ts_iso, ingestion_run_id) for m in batch]
        ok_ids = insert_hcps_batch(supabase, hcp_rows, errors, target_version)
        hcps_created += len(ok_ids)

        link_rows: List[Dict[str, Any]] = []
        for m in batch:
            if m.hcp_id in ok_ids:
                mlinks = build_link_rows(m)
                link_rows.extend(mlinks)
                for lr in mlinks:
                    oa_to_hcp[normalize_openalex_author_id(lr["openalex_author_id"])] = m.hcp_id
        if link_rows:
            links_written += upsert_link_rows(supabase, link_rows, errors, target_version)

        done = min(start + len(batch), len(metas))
        if done % PROGRESS_EVERY == 0 or done == len(metas):
            elapsed = time.perf_counter() - t0
            print(f"  [{done}/{len(metas)}] HCPs={hcps_created:,} links={links_written:,} "
                  f"errors={len(errors)} ({elapsed:.0f}s)")

    # Inventory back-reference for every author linked by this build (one writer, both paths).
    inv_backrefs = update_inventory_backrefs(supabase, oa_to_hcp, errors=errors)

    print(f"\n{'='*72}")
    print(f"COMPLETE: {hcps_created:,} HCPs created, {links_written:,} link rows, "
          f"{inv_backrefs:,} inventory back-reference(s).")
    if errors:
        print(f"Errors: {len(errors)}")
        for e in errors[:10]:
            print(f"  {e}")
    print(f"Wall time: {time.perf_counter() - t0:.1f}s")

    if args.csv_also:
        _write_csv(args.csv_also, metas)
        print(f"CSV: {args.csv_also}")


def _write_csv(path: str, metas: Sequence[ClusterMetadata]) -> None:
    fieldnames = [
        "hcp_id", "first_name", "middle_name", "last_name", "preferred_display_name",
        "orcid", "institution_normalized", "institution_ror", "country",
        "total_career_pubs", "career_first_pub_year", "latest_pub_year",
        "cluster_size", "identity_method", "identity_confidence_score", "identity_hash",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for m in metas:
            w.writerow({
                "hcp_id": m.hcp_id,
                "first_name": m.first_name or "",
                "middle_name": m.middle_name or "",
                "last_name": m.last_name,
                "preferred_display_name": m.preferred_display_name or "",
                "orcid": m.orcid or "",
                "institution_normalized": m.institution_normalized or "",
                "institution_ror": m.institution_ror or "",
                "country": m.country or "",
                "total_career_pubs": m.total_career_pubs,
                "career_first_pub_year": m.career_first_pub_year or "",
                "latest_pub_year": m.latest_pub_year or "",
                "cluster_size": m.cluster_size,
                "identity_method": m.identity_method,
                "identity_confidence_score": m.identity_confidence_score,
                "identity_hash": m.identity_hash,
            })


if __name__ == "__main__":
    main()
