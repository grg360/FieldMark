"""
FieldMark — Phase 1 duplicate detection (read-only, no DB writes).

Identifies strict duplicate HCP candidate pairs in hcps_v2 and writes
dedup_candidates_phase1.csv.

Usage:
  python dedup_detect.py
  python dedup_detect.py --limit-clusters 50
"""

from __future__ import annotations

import argparse
import csv
import itertools
import unicodedata
from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

READ_PAGE_SIZE = 1000
IN_CHUNK_SIZE = 100
OUTPUT_CSV = "dedup_candidates_phase1.csv"

# Stub-absorption path rarity guard (unchanged committed policy).
RARE_SURNAME_THRESHOLD = 50
# Fragment high-confidence path: conservative rarity bar. KOL fragments sit at
# freq 2-4; this drops the moderately-common Western tail (Bernstein/Friedman/
# Levine at 10-15) and all high-frequency Asia-Pac/common surnames.
RARE_SURNAME_STRICT_MAX = 10

CANDIDATE_TYPE_STUB = "stub"
CANDIDATE_TYPE_FRAGMENT = "fragment"

ACTION_FRAGMENT_HIGH_CONF = "merge_fragment_high_confidence"
ACTION_FRAGMENT_LOW_EVIDENCE = "fragment_low_evidence"

# Spot-check surnames for fragment-candidate visibility (AD KOLs).
FRAGMENT_KOL_SURNAMES = {
    "guttman-yassky",
    "werfel",
    "ferrucci",
    "katoh",
    "luger",
    "geha",
    "yosipovitch",
    "silverberg",
    "simpson",
    "neuschwander-tetri",
    "wollenberg",
    "weidinger",
    "eichenfield",
    "bissonnette",
}

CANONICAL_KOL_LAST_NAMES = {
    "loomba",
    "sanyal",
    "chalasani",
    "kowdley",
    "garassino",
    "wakelee",
    "heymach",
    # atopic-dermatitis KOL surnames (spot-visibility)
    "guttman-yassky",
    "werfel",
    "silverberg",
    "simpson",
    "wollenberg",
    "weidinger",
    "eichenfield",
    "bissonnette",
    "thaci",
    "ferrucci",
    "katoh",
    "luger",
    "geha",
}

# Unicode hyphen/dash variants folded to ASCII '-' before matching.
HYPHEN_VARIANTS = (
    "\u2010",  # hyphen
    "\u2011",  # non-breaking hyphen
    "\u2012",  # figure dash
    "\u2013",  # en dash
    "\u2014",  # em dash
    "\u2212",  # minus sign
    "\u00ad",  # soft hyphen
)


def get_required_env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def norm(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def ascii_safe(v: Any) -> str:
    return norm(v).encode("ascii", errors="replace").decode("ascii")


def lower(value: Any) -> str:
    return norm(value).lower()


def strip_initials(first_name: Any) -> str:
    """
    Strip trailing initials:
      "Kris V." -> "Kris"
      "John D." -> "John"
    """
    parts = norm(first_name).split()
    while parts and len(parts[-1].replace(".", "")) == 1 and parts[-1].replace(".", "").isalpha():
        parts.pop()
    return " ".join(parts).strip().lower()


def name_key(value: Any) -> str:
    """
    Unicode-robust name component key:
      NFKC -> fold hyphen variants -> strip diacritics -> lowercase -> collapse whitespace.
    """
    text = norm(value)
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    for ch in HYPHEN_VARIANTS:
        text = text.replace(ch, "-")
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return " ".join(stripped.lower().split())


def block_key(last_name: Any) -> str:
    """Blocking key for surname variants (hyphen/diacritic/case)."""
    return name_key(strip_initials(last_name))


def strict_name_match(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """Both first and last must match after Unicode-robust normalization."""
    a_first = name_key(strip_initials(a.get("first_name")))
    b_first = name_key(strip_initials(b.get("first_name")))
    a_last = name_key(a.get("last_name"))
    b_last = name_key(b.get("last_name"))
    if not a_first or not b_first or not a_last or not b_last:
        return False
    return a_first == b_first and a_last == b_last


def fetch_all_hcps(client: Client) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    last_id: Optional[str] = None
    while True:
        q = (
            client.table("hcps_v2")
            .select(
                "id,first_name,last_name,total_career_pubs,npi_number,"
                "institution_normalized,country,nppes_practice_state"
            )
            .order("id")
            .limit(READ_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_id = str(batch[-1]["id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return rows


def fetch_pub_author_counts(client: Client) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    last_pub_id: Optional[str] = None
    while True:
        q = (
            client.table("publication_authors_v2")
            .select("publication_id,hcp_id")
            .order("publication_id")
            .limit(READ_PAGE_SIZE)
        )
        if last_pub_id is not None:
            q = q.gt("publication_id", last_pub_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            hcp_id = row.get("hcp_id")
            if hcp_id:
                counts[str(hcp_id)] += 1
        last_pub_id = str(batch[-1]["publication_id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return dict(counts)


def fetch_works_counts(client: Client) -> Dict[str, int]:
    """Latest snapshot_date works_count per hcp_id from hcp_author_metrics_v2."""
    works_by_hcp: Dict[str, int] = {}
    latest_snap: Dict[str, str] = {}
    last_hcp_id: Optional[str] = None
    while True:
        q = (
            client.table("hcp_author_metrics_v2")
            .select("hcp_id,snapshot_date,works_count,fetch_status")
            .order("hcp_id")
            .limit(READ_PAGE_SIZE)
        )
        if last_hcp_id is not None:
            q = q.gt("hcp_id", last_hcp_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            status = str(row.get("fetch_status") or "").strip().lower()
            if status and status not in ("ok", ""):
                continue
            hid = str(row.get("hcp_id") or "")
            if not hid:
                continue
            snap = str(row.get("snapshot_date") or "")
            wc = int(row.get("works_count") or 0)
            prev_snap = latest_snap.get(hid)
            if prev_snap is None or snap > prev_snap:
                latest_snap[hid] = snap
                works_by_hcp[hid] = wc
            elif snap == prev_snap:
                works_by_hcp[hid] = max(works_by_hcp.get(hid, 0), wc)
        last_hcp_id = str(batch[-1]["hcp_id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return works_by_hcp


def fetch_openalex_author_ids(client: Client) -> Dict[str, Set[str]]:
    """OpenAlex author ids linked to each hcp_id."""
    by_hcp: Dict[str, Set[str]] = defaultdict(set)
    last_hcp_id: Optional[str] = None
    while True:
        q = (
            client.table("hcp_openalex_authors_v2")
            .select("hcp_id,openalex_author_id")
            .order("hcp_id")
            .limit(READ_PAGE_SIZE)
        )
        if last_hcp_id is not None:
            q = q.gt("hcp_id", last_hcp_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            hid = str(row.get("hcp_id") or "")
            oa = norm(row.get("openalex_author_id"))
            if hid and oa:
                by_hcp[hid].add(oa)
        last_hcp_id = str(batch[-1]["hcp_id"])
        if len(batch) < READ_PAGE_SIZE:
            break
    return dict(by_hcp)


def chunked(seq: Sequence[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(seq), size):
        yield list(seq[i : i + size])


def fetch_rows_in(
    client: Client,
    table: str,
    columns: str,
    filter_col: str,
    values: Sequence[str],
    order_col: str,
) -> List[Dict[str, Any]]:
    """Chunked .in_() fetch with intra-chunk pagination (scoped, read-only)."""
    out: List[Dict[str, Any]] = []
    for chunk in chunked(sorted(set(values)), IN_CHUNK_SIZE):
        offset = 0
        while True:
            batch = (
                client.table(table)
                .select(columns)
                .in_(filter_col, chunk)
                .order(order_col)
                .range(offset, offset + READ_PAGE_SIZE - 1)
                .execute()
                .data
                or []
            )
            if not batch:
                break
            out.extend(batch)
            if len(batch) < READ_PAGE_SIZE:
                break
            offset += READ_PAGE_SIZE
    return out


def load_coauthors_and_domains(
    client: Client,
    hcp_ids: Set[str],
) -> Tuple[Dict[str, Set[str]], Dict[str, Set[str]]]:
    """
    For a scoped set of candidate HCP ids, compute:
      - coauthors_by_hcp: OTHER hcp_ids that co-appear on the same publication_id.
      - domains_by_hcp: therapeutic_area_ids tagged on the HCP's publications.
    Scoped via publication_authors_v2 / publication_therapeutic_areas_v2.
    """
    if not hcp_ids:
        return {}, {}

    pubs_by_hcp: Dict[str, Set[str]] = defaultdict(set)
    rows = fetch_rows_in(
        client,
        "publication_authors_v2",
        "publication_id,hcp_id",
        "hcp_id",
        sorted(hcp_ids),
        order_col="publication_id",
    )
    for r in rows:
        hid = str(r.get("hcp_id") or "")
        pid = str(r.get("publication_id") or "")
        if hid and pid:
            pubs_by_hcp[hid].add(pid)

    relevant_pubs: Set[str] = set()
    for pset in pubs_by_hcp.values():
        relevant_pubs |= pset

    members_by_pub: Dict[str, Set[str]] = defaultdict(set)
    member_rows = fetch_rows_in(
        client,
        "publication_authors_v2",
        "publication_id,hcp_id",
        "publication_id",
        sorted(relevant_pubs),
        order_col="hcp_id",
    )
    for r in member_rows:
        pid = str(r.get("publication_id") or "")
        hid = str(r.get("hcp_id") or "")
        if pid and hid:
            members_by_pub[pid].add(hid)

    ta_by_pub: Dict[str, Set[str]] = defaultdict(set)
    ta_rows = fetch_rows_in(
        client,
        "publication_therapeutic_areas_v2",
        "publication_id,therapeutic_area_id",
        "publication_id",
        sorted(relevant_pubs),
        order_col="therapeutic_area_id",
    )
    for r in ta_rows:
        pid = str(r.get("publication_id") or "")
        tid = str(r.get("therapeutic_area_id") or "")
        if pid and tid:
            ta_by_pub[pid].add(tid)

    coauthors_by_hcp: Dict[str, Set[str]] = {}
    domains_by_hcp: Dict[str, Set[str]] = {}
    for hid, pset in pubs_by_hcp.items():
        coauthors: Set[str] = set()
        domains: Set[str] = set()
        for pid in pset:
            coauthors |= members_by_pub.get(pid, set())
            domains |= ta_by_pub.get(pid, set())
        coauthors.discard(hid)
        coauthors_by_hcp[hid] = coauthors
        domains_by_hcp[hid] = domains

    return coauthors_by_hcp, domains_by_hcp


def is_publication_record(hcp: Dict[str, Any], pub_author_count: int) -> bool:
    career_pubs = int(hcp.get("total_career_pubs") or 0)
    return career_pubs >= 100 or pub_author_count >= 50


def is_npi_stub_record(hcp: Dict[str, Any], pub_author_count: int) -> bool:
    has_npi = bool(norm(hcp.get("npi_number")))
    return has_npi and pub_author_count < 20


def is_stub_path_pair(
    a: Dict[str, Any],
    b: Dict[str, Any],
    a_pub: int,
    b_pub: int,
) -> bool:
    """True when the existing primary-vs-stub absorption path would catch this pair."""
    a_is_pub = is_publication_record(a, a_pub)
    b_is_pub = is_publication_record(b, b_pub)
    a_is_stub = is_npi_stub_record(a, a_pub)
    b_is_stub = is_npi_stub_record(b, b_pub)
    return (a_is_pub and b_is_stub) or (b_is_pub and a_is_stub)


def geographic_fragment_conflict(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """True only on genuine US vs confirmed non-US conflict. Missing geo is neutral."""
    a_country = lower(a.get("country"))
    b_country = lower(b.get("country"))
    a_is_us = a_country in {"us", "usa", "united states"}
    b_is_us = b_country in {"us", "usa", "united states"}
    if (a_is_us and b_country and not b_is_us) or (b_is_us and a_country and not a_is_us):
        return True
    return False



# Only these signals QUALIFY a pair for high-confidence auto-merge. They
# discriminate "same person" from "two different people, same name, same field".
STRONG_SIGNALS = ("shared_openalex_id", "shared_coauthors", "same_institution")
# Recorded for context/training only; NEVER qualify a pair on their own because
# nearly every publisher has an OpenAlex id (both_have_openalex) and every HCP in
# one TA shares its domain (pub_domain_overlap).
CONTEXT_SIGNALS = ("both_have_openalex", "pub_domain_overlap")


def compute_corroboration_signals(
    a: Dict[str, Any],
    b: Dict[str, Any],
    openalex_by_hcp: Dict[str, Set[str]],
    coauthors_by_hcp: Dict[str, Set[str]],
    domains_by_hcp: Dict[str, Set[str]],
) -> Tuple[List[str], List[str]]:
    """
    Evidence signals for auto-merge. Each requires positive presence on BOTH
    records; missing data on either side is neutral (never a corroboration).
    Returns (strong_signals, context_signals). Only strong signals qualify a
    pair for high-confidence; context signals are recorded but non-qualifying.
    """
    strong: List[str] = []
    context: List[str] = []
    a_id = str(a.get("id"))
    b_id = str(b.get("id"))

    # STRONG: same_institution (both non-empty, equal case-insensitive).
    a_inst = lower(a.get("institution_normalized"))
    b_inst = lower(b.get("institution_normalized"))
    if a_inst and b_inst and a_inst == b_inst:
        strong.append("same_institution")

    # OpenAlex: identical author id is STRONG; both-present-only is CONTEXT.
    a_oa = openalex_by_hcp.get(a_id, set())
    b_oa = openalex_by_hcp.get(b_id, set())
    if a_oa and b_oa and (a_oa & b_oa):
        strong.append("shared_openalex_id")
    elif a_oa and b_oa:
        context.append("both_have_openalex")

    # STRONG: shared_coauthors (>=1 common co-author hcp_id).
    a_co = coauthors_by_hcp.get(a_id, set())
    b_co = coauthors_by_hcp.get(b_id, set())
    if a_co and b_co and (a_co & b_co):
        strong.append("shared_coauthors")

    # CONTEXT: pub_domain_overlap (shared therapeutic_area; non-discriminating).
    a_dom = domains_by_hcp.get(a_id, set())
    b_dom = domains_by_hcp.get(b_id, set())
    if a_dom and b_dom and (a_dom & b_dom):
        context.append("pub_domain_overlap")

    return strong, context


def assign_fragment_primary_stub(
    a: Dict[str, Any],
    b: Dict[str, Any],
    a_pub: int,
    b_pub: int,
    works_by_hcp: Dict[str, int],
) -> Tuple[Dict[str, Any], Dict[str, Any], int, int]:
    """Primary = higher OpenAlex works_count; tiebreak by linked pub count then id."""
    a_id = str(a["id"])
    b_id = str(b["id"])
    a_works = int(works_by_hcp.get(a_id, 0))
    b_works = int(works_by_hcp.get(b_id, 0))
    if a_works > b_works:
        return a, b, a_pub, b_pub
    if b_works > a_works:
        return b, a, b_pub, a_pub
    if a_pub >= b_pub:
        return a, b, a_pub, b_pub
    return b, a, b_pub, a_pub


def geographic_recommendation(primary: Dict[str, Any], stub: Dict[str, Any]) -> Tuple[bool, str]:
    p_country = lower(primary.get("country"))
    s_country = lower(stub.get("country"))
    p_state = lower(primary.get("nppes_practice_state"))
    s_state = lower(stub.get("nppes_practice_state"))

    if not p_country and not s_country and not p_state and not s_state:
        return (False, "merge_review")

    p_is_us = p_country in {"us", "usa", "united states"}
    s_is_us = s_country in {"us", "usa", "united states"}

    if (p_is_us and s_country and not s_is_us) or (s_is_us and p_country and not p_is_us):
        return (False, "skip_geographic_mismatch")

    if p_is_us and s_is_us:
        return (True, "merge_high_confidence")

    if p_country and s_country and p_country == s_country:
        return (True, "merge_high_confidence")

    return (False, "merge_review")


def build_candidate_row(
    cluster_id: int,
    primary: Dict[str, Any],
    stub: Dict[str, Any],
    primary_pub_count: int,
    stub_pub_count: int,
    *,
    candidate_type: str,
    recommended_action: Optional[str] = None,
    geographic_match: Optional[bool] = None,
    merge_reason: str = "",
    merge_confidence: str = "",
) -> Dict[str, Any]:
    if recommended_action is None or geographic_match is None:
        geo_rec, action_rec = geographic_recommendation(primary, stub)
        if geographic_match is None:
            geographic_match = geo_rec
        if recommended_action is None:
            recommended_action = action_rec
    return {
        "cluster_id": cluster_id,
        "candidate_type": candidate_type,
        "primary_hcp_id": primary["id"],
        "stub_hcp_id": stub["id"],
        "last_name": norm(primary.get("last_name")),
        "primary_first_name": norm(primary.get("first_name")),
        "stub_first_name": norm(stub.get("first_name")),
        "primary_career_pubs": int(primary.get("total_career_pubs") or 0),
        "primary_pub_author_count": primary_pub_count,
        "primary_npi": norm(primary.get("npi_number")),
        "primary_country": norm(primary.get("country")),
        "primary_state": norm(primary.get("nppes_practice_state")),
        "primary_institution": norm(primary.get("institution_normalized")),
        "stub_career_pubs": int(stub.get("total_career_pubs") or 0),
        "stub_pub_author_count": stub_pub_count,
        "stub_npi": norm(stub.get("npi_number")),
        "stub_country": norm(stub.get("country")),
        "stub_state": norm(stub.get("nppes_practice_state")),
        "stub_institution": norm(stub.get("institution_normalized")),
        "geographic_match": geographic_match,
        "recommended_action": recommended_action,
        "merge_reason": merge_reason,
        "merge_confidence": merge_confidence,
    }


def detect_stub_candidates(
    by_block: Dict[str, List[Dict[str, Any]]],
    last_name_freq: Counter[str],
    pub_author_counts: Dict[str, int],
    *,
    limit_clusters: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Existing primary-vs-stub absorption path (unchanged guards and actions)."""
    candidates: List[Dict[str, Any]] = []
    cluster_id = 0

    for bk, group in by_block.items():
        if last_name_freq[bk] >= RARE_SURNAME_THRESHOLD:
            continue
        if len(group) > 10:
            continue
        if len(group) < 2:
            continue

        for a, b in itertools.combinations(group, 2):
            if not strict_name_match(a, b):
                continue

            a_pub = int(pub_author_counts.get(str(a["id"]), 0))
            b_pub = int(pub_author_counts.get(str(b["id"]), 0))

            if not is_stub_path_pair(a, b, a_pub, b_pub):
                continue

            a_is_pub = is_publication_record(a, a_pub)
            primary, stub = (a, b) if a_is_pub else (b, a)
            primary_pub, stub_pub = (a_pub, b_pub) if a_is_pub else (b_pub, a_pub)

            cluster_id += 1
            candidates.append(
                build_candidate_row(
                    cluster_id,
                    primary,
                    stub,
                    primary_pub,
                    stub_pub,
                    candidate_type=CANDIDATE_TYPE_STUB,
                )
            )

            if limit_clusters is not None and len(candidates) >= limit_clusters:
                return candidates

    return candidates


def collect_fragment_pairs(
    by_block: Dict[str, List[Dict[str, Any]]],
    last_name_freq: Counter[str],
    pub_author_counts: Dict[str, int],
    works_by_hcp: Dict[str, int],
) -> List[Dict[str, Any]]:
    """
    Phase 1: gather rare-surname fragment pairs that pass the mandatory
    first+last name_key match. Corroboration/action is decided later.
    Only surnames with block-frequency <= RARE_SURNAME_STRICT_MAX enter here.
    """
    pairs: List[Dict[str, Any]] = []

    for bk, group in by_block.items():
        if len(group) < 2:
            continue

        # Rarity lookup uses the SAME key the Counter was built on (block_key).
        # Conservative bar: high-frequency surnames NEVER enter the high-confidence
        # path (they are dropped entirely, per committed policy).
        surname_freq = last_name_freq[bk]
        if surname_freq > RARE_SURNAME_STRICT_MAX:
            continue

        # Sub-group by first-name key to limit combinations; the emitted pair is
        # still validated by strict_name_match below.
        by_first: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for h in group:
            fk = name_key(strip_initials(h.get("first_name")))
            if fk:
                by_first[fk].append(h)

        for sub_group in by_first.values():
            if len(sub_group) < 2:
                continue
            for a, b in itertools.combinations(sub_group, 2):
                # Mandatory first+last name_key match on the ACTUAL emitted pair.
                if not strict_name_match(a, b):
                    continue

                a_pub = int(pub_author_counts.get(str(a["id"]), 0))
                b_pub = int(pub_author_counts.get(str(b["id"]), 0))

                if is_stub_path_pair(a, b, a_pub, b_pub):
                    continue

                if geographic_fragment_conflict(a, b):
                    continue

                primary, stub, primary_pub, stub_pub = assign_fragment_primary_stub(
                    a, b, a_pub, b_pub, works_by_hcp
                )
                pairs.append(
                    {
                        "primary": primary,
                        "stub": stub,
                        "primary_pub": primary_pub,
                        "stub_pub": stub_pub,
                        "surname_freq": surname_freq,
                    }
                )

    return pairs


def build_fragment_rows(
    pairs: Sequence[Dict[str, Any]],
    openalex_by_hcp: Dict[str, Set[str]],
    coauthors_by_hcp: Dict[str, Set[str]],
    domains_by_hcp: Dict[str, Set[str]],
    *,
    start_cluster_id: int = 0,
) -> List[Dict[str, Any]]:
    """
    Phase 2 (evidence band): a pair is high-confidence ONLY IF it has >=1
    corroborating signal. Otherwise it is demoted to fragment_low_evidence
    (recorded for the future review queue, never auto-merged).
    """
    candidates: List[Dict[str, Any]] = []
    cluster_id = start_cluster_id

    for pair in pairs:
        primary = pair["primary"]
        stub = pair["stub"]
        surname_freq = int(pair["surname_freq"])

        strong, context = compute_corroboration_signals(
            primary, stub, openalex_by_hcp, coauthors_by_hcp, domains_by_hcp
        )

        base_reason = ["identical_name", f"rare_surname_freq_{surname_freq}"]
        context_tokens = [f"context:{c}" for c in context]
        if strong:
            action = ACTION_FRAGMENT_HIGH_CONF
            confidence = "high"
            merge_reason = ";".join(base_reason + strong + context_tokens)
        else:
            action = ACTION_FRAGMENT_LOW_EVIDENCE
            confidence = "low"
            merge_reason = ";".join(base_reason + ["no_strong_corroboration"] + context_tokens)

        geo_match = not geographic_fragment_conflict(primary, stub)

        cluster_id += 1
        candidates.append(
            build_candidate_row(
                cluster_id,
                primary,
                stub,
                pair["primary_pub"],
                pair["stub_pub"],
                candidate_type=CANDIDATE_TYPE_FRAGMENT,
                recommended_action=action,
                geographic_match=geo_match,
                merge_reason=merge_reason,
                merge_confidence=confidence,
            )
        )

    return candidates


def write_csv(path: str, rows: Sequence[Dict[str, Any]]) -> None:
    fieldnames = [
        "cluster_id",
        "candidate_type",
        "primary_hcp_id",
        "stub_hcp_id",
        "last_name",
        "primary_first_name",
        "stub_first_name",
        "primary_career_pubs",
        "primary_pub_author_count",
        "primary_npi",
        "primary_country",
        "primary_state",
        "primary_institution",
        "stub_career_pubs",
        "stub_pub_author_count",
        "stub_npi",
        "stub_country",
        "stub_state",
        "stub_institution",
        "geographic_match",
        "recommended_action",
        "merge_reason",
        "merge_confidence",
    ]
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 1 strict duplicate detector for hcps_v2.")
    parser.add_argument(
        "--limit-clusters",
        type=int,
        default=None,
        help="Optional cap on emitted candidate clusters for quick tests.",
    )
    args = parser.parse_args()

    load_dotenv()
    client = init_supabase()

    print("Loading hcps_v2...")
    hcps = fetch_all_hcps(client)
    print(f"Loaded {len(hcps):,} HCP rows")

    print("Loading publication_authors_v2 counts...")
    pub_author_counts = fetch_pub_author_counts(client)
    print(f"Loaded publication-author counts for {len(pub_author_counts):,} HCP ids")

    print("Loading hcp_author_metrics_v2 works_count (latest snapshot)...")
    works_by_hcp = fetch_works_counts(client)
    print(f"Loaded OpenAlex works_count for {len(works_by_hcp):,} HCP ids")

    print("Loading hcp_openalex_authors_v2 for corroboration...")
    openalex_by_hcp = fetch_openalex_author_ids(client)
    print(f"Loaded OpenAlex author links for {len(openalex_by_hcp):,} HCP ids")

    last_name_freq: Counter[str] = Counter()
    by_block: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for h in hcps:
        bk = block_key(h.get("last_name"))
        if not bk:
            continue
        last_name_freq[bk] += 1
        by_block[bk].append(h)

    print("\nRunning stub-absorption detection path...")
    stub_candidates = detect_stub_candidates(
        by_block,
        last_name_freq,
        pub_author_counts,
        limit_clusters=args.limit_clusters,
    )
    print(f"  Stub candidates: {len(stub_candidates):,}")

    print("Running fragment-pairing detection path (rare surnames freq<=%d)..." % RARE_SURNAME_STRICT_MAX)
    fragment_pairs = collect_fragment_pairs(
        by_block,
        last_name_freq,
        pub_author_counts,
        works_by_hcp,
    )
    print(f"  Rare-surname fragment pairs (pre-corroboration): {len(fragment_pairs):,}")

    involved_hcp_ids: Set[str] = set()
    for pair in fragment_pairs:
        involved_hcp_ids.add(str(pair["primary"].get("id")))
        involved_hcp_ids.add(str(pair["stub"].get("id")))
    print(f"  Loading scoped coauthor/domain corroboration for {len(involved_hcp_ids):,} HCP ids...")
    coauthors_by_hcp, domains_by_hcp = load_coauthors_and_domains(client, involved_hcp_ids)

    fragment_candidates = build_fragment_rows(
        fragment_pairs,
        openalex_by_hcp,
        coauthors_by_hcp,
        domains_by_hcp,
        start_cluster_id=len(stub_candidates),
    )
    print(f"  Fragment candidates: {len(fragment_candidates):,}")

    candidates = stub_candidates + fragment_candidates
    write_csv(OUTPUT_CSV, candidates)

    stub_actions = Counter(c["recommended_action"] for c in stub_candidates)
    fragment_actions = Counter(c["recommended_action"] for c in fragment_candidates)
    action_counts = Counter(c["recommended_action"] for c in candidates)

    print("\n=== Dedup Phase 1 Detection Summary ===")
    print(f"Total candidates found: {len(candidates):,} (stub={len(stub_candidates):,}, fragment={len(fragment_candidates):,})")
    print("Breakdown by recommended_action (all):")
    for k, v in sorted(action_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {k}: {v:,}")
    print("Fragment candidates by action:")
    for k, v in sorted(fragment_actions.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {k}: {v:,}")
    if stub_actions:
        print("Stub candidates by action:")
        for k, v in sorted(stub_actions.items(), key=lambda kv: (-kv[1], kv[0])):
            print(f"  {k}: {v:,}")

    high_conf = [r for r in fragment_candidates if r["recommended_action"] == ACTION_FRAGMENT_HIGH_CONF]
    low_evidence = [r for r in fragment_candidates if r["recommended_action"] == ACTION_FRAGMENT_LOW_EVIDENCE]
    print(f"\nFragment high-confidence: {len(high_conf):,}")
    print(f"Fragment demoted to low-evidence (no corroboration): {len(low_evidence):,}")

    fragment_kol_hits: List[Dict[str, Any]] = []
    for row in fragment_candidates:
        ln = name_key(row.get("last_name"))
        if ln in FRAGMENT_KOL_SURNAMES:
            fragment_kol_hits.append(row)
    print("\nFragment-candidate AD KOL surname spot-check:")
    if fragment_kol_hits:
        for row in sorted(fragment_kol_hits, key=lambda r: name_key(r.get("last_name"))):
            print(
                f"  {ascii_safe(row['primary_first_name'])} {ascii_safe(row['last_name'])} "
                f"(cluster={row['cluster_id']}, action={row['recommended_action']}, "
                f"confidence={row['merge_confidence']}, "
                f"reason={row['merge_reason']}, "
                f"primary_career_pubs={row['primary_career_pubs']}, "
                f"stub_career_pubs={row['stub_career_pubs']})"
            )
    else:
        print("  (none)")

    print("\nSample 20 candidates:")
    for row in candidates[:20]:
        print(ascii_safe(str(row)))

    print("\nTop 20 by primary_career_pubs:")
    top20 = sorted(candidates, key=lambda r: int(r["primary_career_pubs"]), reverse=True)[:20]
    for row in top20:
        print(
            f"cluster={row['cluster_id']} type={row['candidate_type']} last={ascii_safe(row['last_name'])} "
            f"primary={ascii_safe(row['primary_first_name'])} {ascii_safe(row['last_name'])} "
            f"career_pubs={row['primary_career_pubs']} action={row['recommended_action']}"
        )

    found_kols: Set[str] = set()
    for row in candidates:
        ln = name_key(row.get("last_name"))
        if ln in CANONICAL_KOL_LAST_NAMES:
            found_kols.add(ln)
    print("\nCanonical KOLs found in all candidates:")
    if found_kols:
        for name in sorted(found_kols):
            print(f"  {name.title()}")
    else:
        print("  (none)")

    print(f"\nWrote CSV: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
