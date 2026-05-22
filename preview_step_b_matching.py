"""
FieldMark — Step B matching preview (read-only).

Loads HCPs, OpenAlex author inventory, NPPES→ROR mappings, and optionally
canonical snapshot IDs. Applies Category 1 / 2 / 3 matching rules without
writing to the database.

Refinements: Category 1 treats stored openalex_author_id as a seed and picks
the inventory primary by highest corpus_pub_count within the same-name cluster;
stored ids missing from inventory trigger name rediscovery. Canonical HCPs with no stored OpenAlex id
run an aggressive name discovery pass before Category 2/3.

Requires: SUPABASE_URL, SUPABASE_KEY (python-dotenv optional).

Examples:
  python preview_step_b_matching.py --limit 200
  python preview_step_b_matching.py --random-sample 500
  python preview_step_b_matching.py --canonicals-only --output step_b_preview.csv
"""

from __future__ import annotations

import argparse
import csv
import os
import random
import re
import unicodedata
from collections import Counter, defaultdict, namedtuple
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm


def get_table_name(base_name: str, target_version: str) -> str:
    """Returns the correct table name based on target_version.
    v1 returns base_name unchanged. v2 appends _v2 suffix."""
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HCP_SELECT_COLUMNS = (
    "id,first_name,last_name,npi_number,openalex_author_id,"
    "nppes_organization_name,institution,city,state,country"
)
INVENTORY_SELECT_COLUMNS = (
    "openalex_author_id,display_name,last_known_institution,"
    "last_known_institution_ror,orcid,corpus_pub_count,first_seen_pub_year,last_seen_pub_year"
)
NPPES_ROR_SELECT_COLUMNS = "nppes_organization_name,ror_id,ror_name,confidence"

PROGRESS_EVERY = 50
HCP_PAGE_SIZE = 200
INVENTORY_PAGE_SIZE = 1000
NPPES_PAGE_SIZE = 1000

LAST_SUFFIXES = frozenset(
    {
        "jr",
        "sr",
        "ii",
        "iii",
        "iv",
        "v",
        "md",
        "phd",
        "m.d",
        "ph.d",
        "dmd",
        "do",
        "mba",
        "mph",
        "msc",
    }
)


# ---------------------------------------------------------------------------
# Env / client
# ---------------------------------------------------------------------------


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


# ---------------------------------------------------------------------------
# Name / org / ROR normalization
# ---------------------------------------------------------------------------


def normalize_org_name(name: Optional[str]) -> str:
    if not name:
        return ""
    return " ".join(str(name).strip().split())


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


def split_display_name_to_raw_parts(display_name: Optional[str]) -> Tuple[str, str]:
    t = normalize_token_field(str(display_name or ""))
    parts = t.split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return " ".join(parts[:-1]), parts[-1]


def name_pair_from_display(display_name: Optional[str]) -> Tuple[str, str]:
    first_raw, last_raw = split_display_name_to_raw_parts(display_name)
    return normalize_first_name(first_raw), normalize_last_name(last_raw)


def hcp_name_pair(h: Dict[str, Any]) -> Tuple[str, str]:
    return normalize_first_name(h.get("first_name")), normalize_last_name(h.get("last_name"))


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


def institution_bucket(row: Dict[str, Any]) -> str:
    r = normalize_ror(row.get("last_known_institution_ror"))
    if r:
        return f"ror:{r}"
    inst = normalize_org_name(row.get("last_known_institution"))
    return f"inst:{inst.lower()}" if inst else ""


def normalize_openalex_author_id(value: Any) -> str:
    s = str(value or "").strip()
    if not s:
        return ""
    if s.startswith("https://openalex.org/"):
        return s
    tail = s.split("/")[-1]
    return f"https://openalex.org/{tail}"


# ---------------------------------------------------------------------------
# Supabase reads (keyset pagination)
# ---------------------------------------------------------------------------


def fetch_hcps_keyset(
    supabase: Client,
    *,
    limit_total: Optional[int],
    last_id_cursor: Optional[str] = None,
    target_version: str = "v1",
) -> Iterable[Dict[str, Any]]:
    """Yield HCP rows ordered by id (UUID keyset)."""
    hcps_table = get_table_name("hcps", target_version)
    last_id: Optional[str] = last_id_cursor
    yielded = 0
    while True:
        q = (
            supabase.table(hcps_table)
            .select(HCP_SELECT_COLUMNS)
            .order("id")
            .limit(HCP_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            if limit_total is not None and yielded >= limit_total:
                return
            yielded += 1
            yield row
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < HCP_PAGE_SIZE:
            break


NOT_IN_INVENTORY_NOTE = (
    "Stored OpenAlex author id is absent from openalex_author_inventory "
    "(author below corpus_pub_count threshold for inventory or not in Hepatology-enriched publications)."
)


def fetch_all_hcp_ids_keyset(supabase: Client, target_version: str = "v1") -> List[str]:
    """Load every hcp id via keyset pagination (id column only)."""
    hcps_table = get_table_name("hcps", target_version)
    ids: List[str] = []
    last_id: Optional[str] = None
    while True:
        q = supabase.table(hcps_table).select("id").order("id").limit(HCP_PAGE_SIZE)
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            hid = row.get("id")
            if hid:
                ids.append(str(hid))
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < HCP_PAGE_SIZE:
            break
    return ids


def load_hcps_random_sample(
    supabase: Client, n: int, target_version: str = "v1"
) -> List[Dict[str, Any]]:
    """
    Representative sample: fetch all HCP ids (light keyset scan), shuffle in Python
    with random.seed(42), take the first n ids, then load full rows for those ids.
    """
    print("Fetching all HCP ids (id column only, keyset pagination)...")
    all_ids = fetch_all_hcp_ids_keyset(supabase, target_version)
    print(f"  Total HCP ids: {len(all_ids)}")
    random.seed(42)
    random.shuffle(all_ids)
    pick = all_ids[:n]
    print(f"  Shuffled with random.seed(42); selected first {len(pick)} id(s) for full-row load.")
    rows = fetch_hcps_by_ids(supabase, pick, target_version)
    row_by = {str(r.get("id")): r for r in rows}
    return [row_by[i] for i in pick if i in row_by]


def fetch_hcps_by_ids(
    supabase: Client, ids: Sequence[str], target_version: str = "v1"
) -> List[Dict[str, Any]]:
    hcps_table = get_table_name("hcps", target_version)
    out: List[Dict[str, Any]] = []
    ids = [str(i) for i in ids if i]
    chunk = 50
    for i in range(0, len(ids), chunk):
        part = ids[i : i + chunk]
        rows = supabase.table(hcps_table).select(HCP_SELECT_COLUMNS).in_("id", part).execute().data or []
        out.extend(rows)
    return out


def fetch_canonical_hcp_ids(supabase: Client) -> List[str]:
    rows = supabase.table("canonical_hcps_snapshot").select("id").execute().data or []
    return list({str(r["id"]) for r in rows if r.get("id")})


def fetch_openalex_inventory(supabase: Client) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    last_oa: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select(INVENTORY_SELECT_COLUMNS)
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_oa is not None:
            q = q.gt("openalex_author_id", last_oa)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_oa = batch[-1].get("openalex_author_id")
        if not last_oa or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return rows


def fetch_nppes_org_to_ror(supabase: Client) -> Dict[str, Dict[str, Any]]:
    """
    Map normalized nppes_organization_name -> best row (high > medium > no_match).
    """
    rows: List[Dict[str, Any]] = []
    last_org: Optional[str] = None
    while True:
        q = (
            supabase.table("nppes_org_to_ror")
            .select(NPPES_ROR_SELECT_COLUMNS)
            .order("nppes_organization_name")
            .limit(NPPES_PAGE_SIZE)
        )
        if last_org is not None:
            q = q.gt("nppes_organization_name", last_org)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_org = batch[-1].get("nppes_organization_name")
        if not last_org or len(batch) < NPPES_PAGE_SIZE:
            break

    precedence = {"high": 3, "medium": 2, "no_match": 1, "": 0}

    best: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = normalize_org_name(r.get("nppes_organization_name"))
        if not key:
            continue
        conf = str(r.get("confidence") or "").strip().lower()
        cur = best.get(key)
        if cur is None or precedence.get(conf, 0) > precedence.get(str(cur.get("confidence") or "").lower(), 0):
            best[key] = r
    return best


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


@dataclass
class MatchResult:
    category: int
    match_status: str
    matched_ids: List[str] = field(default_factory=list)
    primary_display: str = ""
    primary_ror: str = ""
    match_confidence: str = "none"
    notes: str = ""


InventoryIndexes = namedtuple(
    "InventoryIndexes",
    [
        "by_id",
        "by_normalized_name",
        "by_ror_and_name",
        "by_ror",
        "by_normalized_last_name",
    ],
)


def build_inventory_indexes(inventory: Sequence[Dict[str, Any]]) -> InventoryIndexes:
    by_id: Dict[str, Dict[str, Any]] = {}
    by_normalized_name: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    by_ror_and_name: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
    by_ror: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    by_normalized_last_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for row in inventory:
        oid = normalize_openalex_author_id(row.get("openalex_author_id"))
        if oid:
            by_id[oid] = row

        nf, nl = name_pair_from_display(row.get("display_name"))
        by_normalized_name[(nf, nl)].append(row)
        if nl:
            by_normalized_last_name[nl].append(row)

        ror_norm = normalize_ror(row.get("last_known_institution_ror"))
        if ror_norm:
            by_ror[ror_norm].append(row)
            by_ror_and_name[(ror_norm, nf, nl)].append(row)

    return InventoryIndexes(
        by_id=dict(by_id),
        by_normalized_name=dict(by_normalized_name),
        by_ror_and_name=dict(by_ror_and_name),
        by_ror=dict(by_ror),
        by_normalized_last_name=dict(by_normalized_last_name),
    )


def row_corpus(row: Dict[str, Any]) -> int:
    try:
        return int(row.get("corpus_pub_count") or 0)
    except (TypeError, ValueError):
        return 0


def openalex_id_tail(oid: str) -> str:
    return oid.rstrip("/").split("/")[-1] if oid else ""


def order_cluster_ids_primary_first(cluster: Sequence[Dict[str, Any]], primary_row: Dict[str, Any]) -> List[str]:
    pid = normalize_openalex_author_id(primary_row.get("openalex_author_id"))
    rest = [r for r in cluster if normalize_openalex_author_id(r.get("openalex_author_id")) != pid]
    rest_sorted = sorted(rest, key=row_corpus, reverse=True)
    out = [pid] if pid else []
    out.extend(normalize_openalex_author_id(r.get("openalex_author_id")) for r in rest_sorted)
    return [x for x in out if x]


def aggressive_name_discovery(
    h: Dict[str, Any],
    inv: InventoryIndexes,
    *,
    status_prefix: str,
) -> Optional[MatchResult]:
    """
    Name-only inventory search (Refinement 2 / below-threshold rediscovery).
    status_prefix: 'canonical_discovered' or 'below_threshold_rediscovered'.
    Returns None when there are zero name matches.
    """
    hcp_nf, hcp_nl = hcp_name_pair(h)
    if not hcp_nf or not hcp_nl:
        return None

    matching: List[Dict[str, Any]] = list(inv.by_normalized_name.get((hcp_nf, hcp_nl), []))

    if not matching:
        return None

    if len(matching) == 1:
        p = matching[0]
        oid = normalize_openalex_author_id(p.get("openalex_author_id"))
        if not oid:
            return None
        return MatchResult(
            1,
            f"{status_prefix}_unique",
            [oid],
            primary_display=str(p.get("display_name") or ""),
            primary_ror=str(p.get("last_known_institution_ror") or ""),
            match_confidence="high",
            notes="",
        )

    # ROR-anchored grouping (v2): group candidates by ROR.
    # Rows without a ROR are excluded from clustering — too ambiguous for
    # common-name HCPs.
    by_ror: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    no_ror_count = 0
    for row in matching:
        row_ror = normalize_ror(row.get("last_known_institution_ror"))
        if row_ror:
            by_ror[row_ror].append(row)
        else:
            no_ror_count += 1

    if not by_ror:
        # All candidates lacked a ROR — too ambiguous
        if status_prefix == "canonical_discovered":
            return MatchResult(
                1, "canonical_discovered_ambiguous", [],
                match_confidence="none",
                notes=f"{len(matching)} same-name candidates, none with ROR",
            )
        return MatchResult(
            1, "openalex_id_below_corpus_threshold", [],
            match_confidence="none",
            notes=f"{NOT_IN_INVENTORY_NOTE} Rediscovery ambiguous: {len(matching)} same-name candidates, none with ROR",
        )

    if len(by_ror) == 1:
        # Exactly one ROR group — clean cluster
        rows = next(iter(by_ror.values()))
        primary_row = max(rows, key=row_corpus)
        mids = order_cluster_ids_primary_first(rows, primary_row)
        notes_parts = []
        if len(mids) > 1:
            notes_parts.append(f"{len(mids)} inventory rows same ROR")
        if no_ror_count > 0:
            notes_parts.append(f"{no_ror_count} same-name candidate(s) without ROR excluded")
        return MatchResult(
            1,
            f"{status_prefix}_cluster" if len(mids) > 1 else f"{status_prefix}_unique",
            mids,
            primary_display=str(primary_row.get("display_name") or ""),
            primary_ror=str(primary_row.get("last_known_institution_ror") or ""),
            match_confidence="high",
            notes="; ".join(notes_parts),
        )

    # Multiple distinct RORs — different real people sharing a name.
    # Pick the dominant ROR by total corpus_pub_count IF it has > 70% of the
    # corpus across all candidates. Otherwise, ambiguous.
    ror_sums = {r: sum(row_corpus(row) for row in rows) for r, rows in by_ror.items()}
    total_sum = sum(ror_sums.values())
    if total_sum <= 0:
        cand = ";".join(
            sorted({
                normalize_openalex_author_id(r.get("openalex_author_id"))
                for r in matching
                if normalize_openalex_author_id(r.get("openalex_author_id"))
            })
        )
        notes = f"candidates (no corpus totals): {cand}"
        if status_prefix == "canonical_discovered":
            return MatchResult(1, "canonical_discovered_ambiguous", [], match_confidence="none", notes=notes)
        return MatchResult(
            1, "openalex_id_below_corpus_threshold", [],
            match_confidence="none",
            notes=f"Below-threshold rediscovery ambiguous. {notes}",
        )

    best_ror = max(ror_sums, key=lambda k: ror_sums[k])
    dominant_ratio = ror_sums[best_ror] / total_sum
    if dominant_ratio > 0.7:
        rows = by_ror[best_ror]
        primary_row = max(rows, key=row_corpus)
        mids = order_cluster_ids_primary_first(rows, primary_row)
        pct = 100.0 * dominant_ratio
        return MatchResult(
            1,
            f"{status_prefix}_dominant_institution",
            mids,
            primary_display=str(primary_row.get("display_name") or ""),
            primary_ror=str(primary_row.get("last_known_institution_ror") or ""),
            match_confidence="high",
            notes=f"dominant ROR ror:{best_ror}: {pct:.1f}% of corpus pubs ({total_sum} total across {len(by_ror)} RORs)",
        )

    cand_ids = sorted({
        normalize_openalex_author_id(r.get("openalex_author_id"))
        for r in matching
        if normalize_openalex_author_id(r.get("openalex_author_id"))
    })
    notes = f"name matches span {len(by_ror)} distinct RORs (no dominant); candidate_openalex_ids: {';'.join(cand_ids)}"
    if status_prefix == "canonical_discovered":
        return MatchResult(1, "canonical_discovered_ambiguous", [], match_confidence="none", notes=notes)
    return MatchResult(
        1, "openalex_id_below_corpus_threshold", [],
        match_confidence="none",
        notes=f"{NOT_IN_INVENTORY_NOTE} Rediscovery ambiguous. {notes}",
    )


def category_1_match(
    h: Dict[str, Any],
    inv: InventoryIndexes,
) -> MatchResult:
    """
    Refinement 1: stored openalex_author_id is a seed only; primary = max corpus_pub_count
    within the same-name cluster (seed location used to validate seed; cluster union
    widened to all same-name inventory rows so a higher-pub primary at another ROR
    relocates the primary, e.g. Oxford vs hospital fragment).
    """
    by_id = inv.by_id
    hcp_nf, hcp_nl = hcp_name_pair(h)
    seed_id = normalize_openalex_author_id(h.get("openalex_author_id"))
    seed_row = by_id.get(seed_id)

    if not seed_row:
        below_threshold = MatchResult(
            1,
            "openalex_id_below_corpus_threshold",
            [],
            match_confidence="none",
            notes=NOT_IN_INVENTORY_NOTE,
        )
        redisc = aggressive_name_discovery(h, inv, status_prefix="below_threshold_rediscovered")
        if redisc and redisc.matched_ids:
            return redisc
        return below_threshold

    # ROR-anchored cluster widening (v2)
    cluster_by_id: Dict[str, Dict[str, Any]] = {seed_id: seed_row}
    seed_ror = normalize_ror(seed_row.get("last_known_institution_ror"))
    cluster_rors: Set[str] = {seed_ror} if seed_ror else set()

    candidates = inv.by_normalized_name.get((hcp_nf, hcp_nl), [])

    # Iteratively include same-name rows whose ROR matches any cluster ROR.
    # Loop in case earlier-rejected rows become eligible after later ones widen the set.
    if cluster_rors:
        changed = True
        while changed:
            changed = False
            for row in candidates:
                oid = normalize_openalex_author_id(row.get("openalex_author_id"))
                if not oid or oid in cluster_by_id:
                    continue
                row_ror = normalize_ror(row.get("last_known_institution_ror"))
                if row_ror and row_ror in cluster_rors:
                    cluster_by_id[oid] = row
                    changed = True

    # If seed had no ROR, the cluster stays as seed-only — conservative under-clustering.

    cluster = list(cluster_by_id.values())
    primary_row = max(cluster, key=row_corpus)
    primary_id = normalize_openalex_author_id(primary_row.get("openalex_author_id"))
    matched_ids = order_cluster_ids_primary_first(cluster, primary_row)

    rejected_count = sum(
        1 for r in candidates
        if normalize_openalex_author_id(r.get("openalex_author_id")) not in cluster_by_id
    )

    if primary_id == seed_id:
        status = "verified_primary_found"
        notes_parts = []
        if len(matched_ids) > 1:
            notes_parts.append(f"{len(matched_ids) - 1} additional fragment(s) same ROR")
        if rejected_count > 0:
            notes_parts.append(f"{rejected_count} same-name candidate(s) excluded by ROR gate")
        notes = "; ".join(notes_parts)
    else:
        status = "verified_primary_relocated"
        notes_parts = [
            f"Original seed {openalex_id_tail(seed_id)} ({row_corpus(seed_row)} pubs); "
            f"relocated primary to {openalex_id_tail(primary_id)} ({row_corpus(primary_row)} pubs)"
        ]
        if rejected_count > 0:
            notes_parts.append(f"{rejected_count} same-name candidate(s) excluded by ROR gate")
        notes = "; ".join(notes_parts)

    return MatchResult(
        1,
        status,
        matched_ids,
        primary_display=str(primary_row.get("display_name") or ""),
        primary_ror=str(primary_row.get("last_known_institution_ror") or ""),
        match_confidence="high",
        notes=notes,
    )


def medium_ror_cross_validated(
    inv: InventoryIndexes,
    *,
    ror_norm: str,
    hcp_nf: str,
    hcp_nl: str,
) -> bool:
    if not ror_norm:
        return False
    return bool(inv.by_ror_and_name.get((ror_norm, hcp_nf, hcp_nl)))


def trusted_ror_for_category_2(
    h: Dict[str, Any],
    org_map: Dict[str, Dict[str, Any]],
    inv: InventoryIndexes,
) -> Tuple[Optional[str], str]:
    """Returns (ror_norm, reason_if_untrusted). reason empty if trusted."""
    org = normalize_org_name(h.get("nppes_organization_name"))
    if not org:
        return None, "no_nppes_organization_name"
    row = org_map.get(org)
    if not row:
        return None, "org_not_in_nppes_org_to_ror"
    conf = str(row.get("confidence") or "").strip().lower()
    ror_norm = normalize_ror(row.get("ror_id"))
    hcp_nf, hcp_nl = hcp_name_pair(h)
    if conf == "high" and ror_norm:
        return ror_norm, ""
    if conf == "medium" and ror_norm:
        if medium_ror_cross_validated(inv, ror_norm=ror_norm, hcp_nf=hcp_nf, hcp_nl=hcp_nl):
            return ror_norm, ""
        return None, "medium_confidence_not_cross_validated"
    return None, f"confidence_{conf or 'empty'}"


def category_2_ror_name_match(
    h: Dict[str, Any],
    inv: InventoryIndexes,
    trusted_ror: str,
) -> MatchResult:
    hcp_nf, hcp_nl = hcp_name_pair(h)
    by_pair: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    for row in inv.by_ror.get(trusted_ror, []):
        nf, nl = name_pair_from_display(row.get("display_name"))
        by_pair[(nf, nl)].append(row)

    matching = by_pair.get((hcp_nf, hcp_nl), [])
    other_nonempty = any(
        k != (hcp_nf, hcp_nl) and k[0] and k[1] for k in by_pair
    )

    if not matching and not other_nonempty:
        return MatchResult(2, "category_2_no_inventory_match", [], notes="ROR matched but no inventory rows at ROR")

    if not matching and other_nonempty:
        # Different names at same ROR — homonyms / unrelated
        return MatchResult(
            2,
            "category_2_ambiguous_homonym",
            [],
            match_confidence="none",
            notes=f"ROR has {len(by_pair)} distinct name pairs; none match HCP",
        )

    if matching and not other_nonempty:
        primary_row = max(matching, key=row_corpus)
        mids = order_cluster_ids_primary_first(matching, primary_row)
        if len(mids) == 1:
            p = primary_row
            return MatchResult(
                2,
                "category_2_clean_match",
                mids,
                primary_display=str(p.get("display_name") or ""),
                primary_ror=str(p.get("last_known_institution_ror") or ""),
                match_confidence="high",
            )
        p = primary_row
        return MatchResult(
            2,
            "category_2_fragment_cluster",
            mids,
            primary_display=str(p.get("display_name") or ""),
            primary_ror=str(p.get("last_known_institution_ror") or ""),
            match_confidence="high",
            notes=f"{len(mids)} OpenAlex IDs same name+ROR (primary = highest corpus_pub_count)",
        )

    # matching + other_nonempty both -> ambiguous homonym at institution
    return MatchResult(
        2,
        "category_2_ambiguous_homonym",
        [],
        match_confidence="none",
        notes="Multiple distinct name clusters at same ROR",
    )


def category_3_name_inventory(
    h: Dict[str, Any],
    inv: InventoryIndexes,
) -> MatchResult:
    hcp_nf, hcp_nl = hcp_name_pair(h)
    if not hcp_nf or not hcp_nl:
        return MatchResult(3, "category_3_no_match", [], notes="HCP name incomplete after normalization")

    matching: List[Dict[str, Any]] = list(inv.by_normalized_name.get((hcp_nf, hcp_nl), []))

    if not matching:
        return MatchResult(3, "category_3_no_match", [], match_confidence="none")

    if len(matching) == 1:
        p = matching[0]
        oid = normalize_openalex_author_id(p.get("openalex_author_id"))
        return MatchResult(
            3,
            "category_3_name_only_match",
            [oid] if oid else [],
            primary_display=str(p.get("display_name") or ""),
            primary_ror=str(p.get("last_known_institution_ror") or ""),
            match_confidence="low",
            notes="Name-only (no ROR gate in category 3)",
        )

    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in matching:
        b = institution_bucket(row)
        key = b if b else "__empty__"
        buckets[key].append(row)

    if len(buckets) == 1:
        rows = next(iter(buckets.values()))
        primary_row = max(rows, key=row_corpus)
        mids = order_cluster_ids_primary_first(rows, primary_row)
        p = primary_row
        return MatchResult(
            3,
            "category_3_fragment_cluster",
            mids,
            primary_display=str(p.get("display_name") or ""),
            primary_ror=str(p.get("last_known_institution_ror") or ""),
            match_confidence="medium",
            notes=f"{len(mids)} IDs same institution bucket (primary = highest corpus_pub_count)",
        )

    return MatchResult(
        3,
        "category_3_ambiguous_no_institution",
        [],
        match_confidence="none",
        notes=f"name matches span {len(buckets)} institution buckets",
    )


def match_hcp(
    h: Dict[str, Any],
    *,
    inventory_indexes: InventoryIndexes,
    org_map: Dict[str, Dict[str, Any]],
    canonical_ids: Set[str],
) -> MatchResult:
    oa_raw = str(h.get("openalex_author_id") or "").strip()
    npi_raw = str(h.get("npi_number") or "").strip()
    hid = str(h.get("id") or "")

    # Refinement 2: canonical HCPs with no stored OpenAlex id — aggressive name discovery first
    if hid in canonical_ids and not oa_raw:
        disc = aggressive_name_discovery(h, inventory_indexes, status_prefix="canonical_discovered")
        if disc is not None:
            if disc.match_status != "canonical_discovered_ambiguous" and disc.matched_ids:
                return disc
            # ambiguous or zero matches: fall through to category 2 / 3

    if oa_raw:
        return category_1_match(h, inventory_indexes)

    if npi_raw:
        trusted, reason = trusted_ror_for_category_2(h, org_map, inventory_indexes)
        if trusted:
            r2 = category_2_ror_name_match(h, inventory_indexes, trusted)
            if r2.match_status != "category_2_no_inventory_match":
                return r2
            # fall through to name-only search
            r3 = category_3_name_inventory(h, inventory_indexes)
            r3.category = 2
            r3.notes = (r3.notes + "; " if r3.notes else "") + f"cat2_fallthrough_after_no_inventory ({reason})"
            return r3

        r3 = category_3_name_inventory(h, inventory_indexes)
        r3.category = 2
        r3.notes = (r3.notes + "; " if r3.notes else "") + f"cat2_fallthrough_no_trusted_ror ({reason})"
        return r3

    return category_3_name_inventory(h, inventory_indexes)


def result_to_csv_row(
    h: Dict[str, Any],
    r: MatchResult,
    inventory_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    total_pubs = 0
    for oid in r.matched_ids:
        row = inventory_by_id.get(oid)
        if row:
            try:
                total_pubs += int(row.get("corpus_pub_count") or 0)
            except (TypeError, ValueError):
                pass

    return {
        "hcp_id": str(h.get("id") or ""),
        "hcp_first_name": h.get("first_name") or "",
        "hcp_last_name": h.get("last_name") or "",
        "hcp_npi": str(h.get("npi_number") or ""),
        "hcp_existing_openalex_id": normalize_openalex_author_id(h.get("openalex_author_id")),
        "hcp_organization_name": h.get("nppes_organization_name") or "",
        "hcp_institution": h.get("institution") or "",
        "hcp_state": h.get("state") or "",
        "hcp_country": h.get("country") or "",
        "category": r.category,
        "match_status": r.match_status,
        "matched_openalex_ids": ";".join(r.matched_ids),
        "matched_count": len(r.matched_ids),
        "total_corpus_pubs_across_matches": total_pubs,
        "primary_inventory_display_name": r.primary_display,
        "primary_inventory_ror": r.primary_ror,
        "match_confidence": r.match_confidence,
        "notes": r.notes,
    }


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


def print_summary(rows: List[Dict[str, Any]], csv_path: str) -> None:
    print("\n" + "=" * 72)
    print("STEP B PREVIEW — SUMMARY")
    print("=" * 72)
    print(f"Total HCPs processed: {len(rows)}")
    print(f"Detailed CSV: {csv_path}\n")

    by_status = Counter(r["match_status"] for r in rows)

    def cat(n: int) -> List[Dict[str, Any]]:
        return [r for r in rows if int(r["category"]) == n]

    c1 = cat(1)
    print("--- Category 1 ---")
    print(f"  verified_primary_found:           {sum(1 for r in c1 if r['match_status'] == 'verified_primary_found')}")
    print(f"  verified_primary_relocated:       {sum(1 for r in c1 if r['match_status'] == 'verified_primary_relocated')}")
    print(
        f"  openalex_id_below_corpus_threshold: "
        f"{sum(1 for r in c1 if r['match_status'] == 'openalex_id_below_corpus_threshold')}"
    )
    print(f"  canonical_discovered_unique:      {sum(1 for r in c1 if r['match_status'] == 'canonical_discovered_unique')}")
    print(f"  canonical_discovered_cluster:     {sum(1 for r in c1 if r['match_status'] == 'canonical_discovered_cluster')}")
    print(
        f"  canonical_discovered_dominant_institution: "
        f"{sum(1 for r in c1 if r['match_status'] == 'canonical_discovered_dominant_institution')}"
    )
    print(f"  canonical_discovered_ambiguous:   {sum(1 for r in c1 if r['match_status'] == 'canonical_discovered_ambiguous')}")
    print(
        f"  below_threshold_rediscovered_unique: "
        f"{sum(1 for r in c1 if r['match_status'] == 'below_threshold_rediscovered_unique')}"
    )
    print(
        f"  below_threshold_rediscovered_cluster: "
        f"{sum(1 for r in c1 if r['match_status'] == 'below_threshold_rediscovered_cluster')}"
    )
    print(
        f"  below_threshold_rediscovered_dominant_institution: "
        f"{sum(1 for r in c1 if r['match_status'] == 'below_threshold_rediscovered_dominant_institution')}"
    )

    c2 = cat(2)
    print("\n--- Category 2 ---")
    print(f"  category_2_clean_match:         {sum(1 for r in c2 if r['match_status'] == 'category_2_clean_match')}")
    print(f"  category_2_fragment_cluster:    {sum(1 for r in c2 if r['match_status'] == 'category_2_fragment_cluster')}")
    print(f"  category_2_ambiguous_homonym:   {sum(1 for r in c2 if r['match_status'] == 'category_2_ambiguous_homonym')}")
    no_ror = [
        r
        for r in c2
        if r["match_status"]
        in (
            "category_3_no_match",
            "category_3_name_only_match",
            "category_3_fragment_cluster",
            "category_3_ambiguous_no_institution",
            "category_2_no_inventory_match",
        )
    ]
    print(f"  no_ror_or_no_match / fallthrough: {len(no_ror)}")
    print("    (includes category_2_no_inventory_match and category_3_* outcomes on cat-2 HCPs)")

    c3 = cat(3)
    print("\n--- Category 3 ---")
    print(f"  category_3_name_only_match:              {sum(1 for r in c3 if r['match_status'] == 'category_3_name_only_match')}")
    print(f"  category_3_fragment_cluster:             {sum(1 for r in c3 if r['match_status'] == 'category_3_fragment_cluster')}")
    print(f"  category_3_ambiguous_no_institution:     {sum(1 for r in c3 if r['match_status'] == 'category_3_ambiguous_no_institution')}")
    print(f"  category_3_no_match:                     {sum(1 for r in c3 if r['match_status'] == 'category_3_no_match')}")

    print("\n--- All match_status counts ---")
    for status, cnt in sorted(by_status.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {status}: {cnt}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Preview Step B HCP to OpenAlex matching (read-only)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "HCP selection:\n"
            "  --canonicals-only: snapshot ids only (ignores --limit and --random-sample).\n"
            "  --random-sample N: fetch ALL hcp ids (keyset, id column only), shuffle in Python with\n"
            "    random.seed(42), take the first N ids, load full rows. More representative than the\n"
            "    first N rows by id. If both --limit and --random-sample are set, --random-sample wins.\n"
            "  --limit N: otherwise, first N HCPs by id keyset order (default 200).\n"
            "  With --category: filtering runs AFTER the N rows are loaded, so the CSV may contain\n"
            "  fewer than N rows."
        ),
    )
    p.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Process first N HCPs by id keyset order (ignored if --random-sample is set)",
    )
    p.add_argument(
        "--random-sample",
        type=int,
        default=None,
        metavar="N",
        help=(
            "Load N random HCPs: all ids via keyset, shuffle with seed 42, take first N (wins over --limit)"
        ),
    )
    p.add_argument("--canonicals-only", action="store_true", help="Only HCPs in canonical_hcps_snapshot")
    p.add_argument(
        "--category",
        choices=("1", "2", "3", "all"),
        default="all",
        help="Restrict to HCP category after rows are selected (may reduce row count vs --limit / --random-sample)",
    )
    p.add_argument("--output", default="step_b_preview.csv", help="CSV output path")
    p.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version to read HCPs from. v1=legacy tables, v2=rebuild tables.",
    )
    return p.parse_args()


def hcp_category_num(h: Dict[str, Any]) -> int:
    if str(h.get("openalex_author_id") or "").strip():
        return 1
    if str(h.get("npi_number") or "").strip():
        return 2
    return 3


def effective_input_category(h: Dict[str, Any], canonical_ids: Set[str]) -> int:
    """For --category filter: canonical rows without OA may resolve via discovery (treat as cat 1)."""
    hid = str(h.get("id") or "")
    if hid in canonical_ids and not str(h.get("openalex_author_id") or "").strip():
        return 1
    return hcp_category_num(h)


def main() -> None:
    args = parse_args()
    if args.random_sample is not None and args.random_sample < 1:
        raise SystemExit("--random-sample N requires N >= 1")
    load_dotenv()

    supabase = init_supabase()
    print("Loading openalex_author_inventory (keyset)...")
    inventory_all = fetch_openalex_inventory(supabase)
    print(f"  Loaded {len(inventory_all)} inventory rows.")

    print("Loading nppes_org_to_ror (keyset)...")
    org_map = fetch_nppes_org_to_ror(supabase)
    print(f"  Loaded {len(org_map)} distinct org keys.")

    inventory_indexes = build_inventory_indexes(inventory_all)

    canonical_ids = set(fetch_canonical_hcp_ids(supabase))
    print(f"canonical_hcps_snapshot ids loaded: {len(canonical_ids)} (for pre-pass + category filter)")

    cat_filter: Optional[int] = None if args.category == "all" else int(args.category)

    hcp_iter: Iterable[Dict[str, Any]]
    if args.canonicals_only:
        ids = list(canonical_ids)
        print(f"canonical_hcps_snapshot: {len(ids)} id(s) (--random-sample / --limit ignored)")
        hcps = fetch_hcps_by_ids(supabase, ids, args.target_version)
        hcps.sort(key=lambda x: str(x.get("id")))
        hcp_iter = hcps
    elif args.random_sample is not None:
        hcp_iter = load_hcps_random_sample(supabase, args.random_sample, args.target_version)
        print(
            "Note: --category filter applies after this sample is loaded; "
            "CSV row count may be less than N."
        )
    else:
        hcp_iter = fetch_hcps_keyset(
            supabase, limit_total=args.limit, target_version=args.target_version
        )

    out_rows: List[Dict[str, Any]] = []
    processed = 0
    for h in tqdm(hcp_iter, desc="matching HCPs", unit="hcp"):
        if cat_filter is not None and effective_input_category(h, canonical_ids) != cat_filter:
            continue
        mr = match_hcp(
            h,
            inventory_indexes=inventory_indexes,
            org_map=org_map,
            canonical_ids=canonical_ids,
        )
        out_rows.append(result_to_csv_row(h, mr, inventory_indexes.by_id))
        processed += 1
        if processed % PROGRESS_EVERY == 0:
            print(f"  Progress: {processed} HCPs matched...")

    fieldnames = [
        "hcp_id",
        "hcp_first_name",
        "hcp_last_name",
        "hcp_npi",
        "hcp_existing_openalex_id",
        "hcp_organization_name",
        "hcp_institution",
        "hcp_state",
        "hcp_country",
        "category",
        "match_status",
        "matched_openalex_ids",
        "matched_count",
        "total_corpus_pubs_across_matches",
        "primary_inventory_display_name",
        "primary_inventory_ror",
        "match_confidence",
        "notes",
    ]
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in out_rows:
            w.writerow({k: row.get(k, "") for k in fieldnames})

    print_summary(out_rows, os.path.abspath(args.output))


if __name__ == "__main__":
    main()
