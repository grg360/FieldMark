"""
FieldMark — Step C v2: Create canonical HCP identities from OpenAlex author inventory.

Clusters the openalex_author_inventory into canonical people using:
1. ORCID match (authoritative — all shards sharing a non-null ORCID = same person)
2. Normalized-name + institution match (same ROR or same normalized institution text)
3. Anti-conflation guard: name alone is NEVER sufficient; shards with same name but
   different institutions stay separate.

Reads enrichment data from author_pub_flat (distinct pubs, year ranges).
Writes to hcps_v2 + hcp_openalex_authors_v2. Does NOT tag TAs.

Preserves the exact clustering algorithm from the archived run_step_c_create_hcps.py
with the addition of ORCID-first grouping and author_pub_flat pub-count derivation.

Prerequisites: openalex_author_inventory and author_pub_flat populated.
Env: SUPABASE_URL, SUPABASE_KEY, optionally DATABASE_URL for direct reads.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
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

    Anti-conflation: name alone → "nameonly" bucket (singletons, never merge).
    Same name + same ROR → same bucket. Same name + same normalized institution → same bucket.
    """
    nf, nl = name_pair_from_display(row.get("display_name"))
    r = normalize_ror(row.get("last_known_institution_ror"))
    if r:
        return (nf, nl, f"ror:{r}")
    it = institution_cluster_token(row)
    if it:
        return (nf, nl, f"inst:{it}")
    return (nf, nl, "nameonly")


def cluster_inventory(
    rows: List[Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """Cluster inventory rows into canonical-person groups.

    Priority 1: ORCID match — all shards sharing a normalized ORCID become one cluster.
    Priority 2: Name + institution key — deterministic bucketing.
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
    """Split display_name → (first_name, middle_name, last_name)."""
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

    # Institution — most-frequent ROR; else most-frequent institution name
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

    # Pub stats from author_pub_flat (preferred) or inventory fallback
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
# DB operations
# ============================================================


def fetch_linked_openalex_ids(supabase: Client, target_version: str) -> Set[str]:
    """All openalex_author_id values already linked in hcp_openalex_authors."""
    hcp_oa_table = get_table_name("hcp_openalex_authors", target_version)
    out: Set[str] = set()
    last_hcp_id: Optional[str] = None
    while True:
        q = (
            supabase.table(hcp_oa_table)
            .select("hcp_id,openalex_author_id")
            .order("hcp_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_hcp_id is not None:
            q = q.gt("hcp_id", last_hcp_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oid = normalize_openalex_author_id(row.get("openalex_author_id"))
            if oid:
                out.add(oid)
        last_hcp_id = batch[-1].get("hcp_id")
        if not last_hcp_id or len(batch) < INVENTORY_PAGE_SIZE:
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
        eprint(f"[hcps insert batch n={len(rows)}] {exc}")
        for r in rows:
            try:
                resp = supabase.table(hcps_table).insert([r]).execute()
                if resp.data:
                    hid = r.get("id")
                    if hid:
                        ok.add(str(hid))
                else:
                    errors.append(f"hcp insert id={r.get('id')}: single-row returned empty")
            except Exception as exc2:
                errors.append(f"hcp insert id={r.get('id')}: {exc2}")
                eprint(f"[hcps insert] {exc2}")
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
            eprint(f"[link upsert batch] {exc}")
            for r in chunk:
                try:
                    resp = supabase.table(hcp_oa_table).upsert(
                        [r], on_conflict="hcp_id,openalex_author_id"
                    ).execute()
                    if resp.data:
                        n += 1
                    else:
                        errors.append(f"link upsert hcp={r.get('hcp_id')} oa={r.get('openalex_author_id')}: empty")
                except Exception as exc2:
                    errors.append(f"link upsert hcp={r.get('hcp_id')} oa={r.get('openalex_author_id')}: {exc2}")
    return n


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
    return p.parse_args()


# ============================================================
# Main
# ============================================================


def main() -> None:
    args = parse_args()
    target_version = args.target_version
    dry_run = args.dry_run
    bs = max(1, args.batch_size)

    load_dotenv()
    supabase = init_supabase()
    t0 = time.perf_counter()
    ingestion_run_id = str(uuid.uuid4())
    ts_iso = datetime.now(timezone.utc).isoformat()

    print(f"Step C v2 — target_version={target_version}, dry_run={dry_run}")
    print(f"Ingestion run ID: {ingestion_run_id}")

    # --- Idempotency: load already-linked OA IDs ---
    print("\nLoading linked OpenAlex IDs from hcp_openalex_authors...")
    linked = fetch_linked_openalex_ids(supabase, target_version)
    print(f"  Already linked: {len(linked):,}")

    # --- Fetch unlinked inventory ---
    print("\nFetching unlinked inventory rows...")
    t1 = time.perf_counter()
    unlinked = fetch_unlinked_inventory(supabase, linked)
    print(f"  Unlinked rows: {len(unlinked):,} ({time.perf_counter() - t1:.1f}s)")

    if not unlinked:
        print("Nothing to do — all inventory rows are already linked.")
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
    print(f"STEP C v2 — {'DRY RUN' if dry_run else 'LIVE'} SUMMARY")
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

    # --- Top HCPs for conflation check ---
    top_by_pubs = sorted(metas, key=lambda m: m.total_career_pubs, reverse=True)[:10]
    print(f"\nTop 10 by total_career_pubs (conflation check):")
    for m in top_by_pubs:
        print(f"  {m.preferred_display_name or m.last_name}: "
              f"{m.total_career_pubs} pubs, {m.cluster_size} shard(s), "
              f"method={m.identity_method}, inst={m.institution_normalized or '(none)'}")

    if dry_run:
        print(f"\n*** DRY RUN: no writes performed. ***")
        print(f"Wall time: {time.perf_counter() - t0:.1f}s")
        if args.csv_also:
            _write_csv(args.csv_also, metas)
            print(f"CSV: {args.csv_also}")
        return

    # --- Write ---
    print(f"\nWriting HCPs and links (batch size {bs})...")
    errors: List[str] = []
    hcps_created = 0
    links_written = 0

    for start in range(0, len(metas), bs):
        batch = metas[start:start + bs]
        hcp_rows = [build_hcp_row(m, ts_iso, ingestion_run_id) for m in batch]
        ok_ids = insert_hcps_batch(supabase, hcp_rows, errors, target_version)
        hcps_created += len(ok_ids)

        link_rows: List[Dict[str, Any]] = []
        for m in batch:
            if m.hcp_id in ok_ids:
                link_rows.extend(build_link_rows(m))
        if link_rows:
            links_written += upsert_link_rows(supabase, link_rows, errors, target_version)

        done = min(start + len(batch), len(metas))
        if done % PROGRESS_EVERY == 0 or done == len(metas):
            elapsed = time.perf_counter() - t0
            print(f"  [{done}/{len(metas)}] HCPs={hcps_created:,} links={links_written:,} "
                  f"errors={len(errors)} ({elapsed:.0f}s)")

    print(f"\n{'='*72}")
    print(f"COMPLETE: {hcps_created:,} HCPs created, {links_written:,} link rows.")
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
