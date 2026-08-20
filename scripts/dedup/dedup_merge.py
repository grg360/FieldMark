"""
FieldMark — Phase 2 duplicate merge executor.

Reads dedup_candidates_phase1.csv and merges selected duplicate clusters
using "Approach A" (keep publication-keyed primary; merge+delete NPI stub).
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

CSV_PATH_DEFAULT = "dedup_candidates_phase1.csv"

ALLOWED_ACTIONS = {
    "merge_high_confidence",
    "merge_review",
    "merge_fragment_high_confidence",
}
TIER_CHOICES = sorted(ALLOWED_ACTIONS)

MERGE_KEYWORD_HINTS = ("department", "division", "center", "centre", "program", "unit", "clinic")


def get_required_env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def get_db_url() -> str:
    return get_required_env("DATABASE_URL")


@dataclass
class CandidateCluster:
    cluster_id: int
    recommended_action: str
    last_name: str
    primary_hcp_id: str
    stub_hcp_id: str
    primary_first_name: str
    stub_first_name: str
    merge_reason: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Execute dedup merges from dedup_candidates_phase1.csv")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Print planned operations only.")
    mode.add_argument("--execute", action="store_true", help="Perform merge writes/deletes.")
    parser.add_argument(
        "--tier",
        choices=TIER_CHOICES,
        default=None,
        help="Limit to one recommended_action tier.",
    )
    parser.add_argument("--cluster", type=int, default=None, help="Process only a single cluster_id.")
    parser.add_argument("--csv", type=str, default=CSV_PATH_DEFAULT, help="Path to candidate CSV.")
    return parser.parse_args()


def load_candidates(path: str, tier: Optional[str], cluster: Optional[int]) -> List[CandidateCluster]:
    out: List[CandidateCluster] = []
    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            action = str(r.get("recommended_action") or "").strip()
            if action not in ALLOWED_ACTIONS:
                continue
            cid = int(r.get("cluster_id") or 0)
            if tier and action != tier:
                continue
            if cluster is not None and cid != cluster:
                continue
            out.append(
                CandidateCluster(
                    cluster_id=cid,
                    recommended_action=action,
                    last_name=str(r.get("last_name") or ""),
                    primary_hcp_id=str(r.get("primary_hcp_id") or ""),
                    stub_hcp_id=str(r.get("stub_hcp_id") or ""),
                    primary_first_name=str(r.get("primary_first_name") or ""),
                    stub_first_name=str(r.get("stub_first_name") or ""),
                    merge_reason=str(r.get("merge_reason") or ""),
                )
            )
    return out


class UnionFind:
    """Minimal union-find for grouping candidate pair edges into components."""

    def __init__(self) -> None:
        self.parent: Dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        # Path compression.
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def build_components(candidates: Sequence[CandidateCluster]) -> List[List[str]]:
    """Group candidate pair edges into connected components of hcp_ids."""
    uf = UnionFind()
    for c in candidates:
        if c.primary_hcp_id and c.stub_hcp_id:
            uf.union(c.primary_hcp_id, c.stub_hcp_id)
    groups: Dict[str, List[str]] = {}
    seen: Set[str] = set()
    for c in candidates:
        for hid in (c.primary_hcp_id, c.stub_hcp_id):
            if hid and hid not in seen:
                seen.add(hid)
                groups.setdefault(uf.find(hid), []).append(hid)
    return [sorted(members) for members in groups.values() if len(members) >= 2]


def reasons_by_hcp(candidates: Sequence[CandidateCluster]) -> Dict[str, str]:
    """Map each hcp_id to a representative merge_reason from an incident pair."""
    out: Dict[str, str] = {}
    for c in candidates:
        if c.merge_reason:
            out.setdefault(c.primary_hcp_id, c.merge_reason)
            out.setdefault(c.stub_hcp_id, c.merge_reason)
    return out


def ns(v: Any) -> str:
    return " ".join(str(v or "").strip().split())


def fetch_works_counts(cur, hcp_ids: Sequence[str]) -> Dict[str, int]:
    """Max OpenAlex works_count per hcp_id from hcp_author_metrics_v2 (ok snapshots only)."""
    if not hcp_ids:
        return {}
    cur.execute(
        """
        SELECT hcp_id, COALESCE(MAX(works_count), 0) AS works_count
        FROM hcp_author_metrics_v2
        WHERE hcp_id = ANY(%s::uuid[])
          AND (fetch_status IS NULL OR fetch_status = 'ok')
        GROUP BY hcp_id
        """,
        (list(hcp_ids),),
    )
    return {str(r["hcp_id"]): int(r["works_count"] or 0) for r in cur.fetchall()}


def fetch_is_primary_flags(cur, hcp_ids: Sequence[str]) -> Dict[str, bool]:
    if not hcp_ids:
        return {}
    cur.execute(
        """
        SELECT hcp_id, BOOL_OR(COALESCE(is_primary, FALSE)) AS is_primary
        FROM hcp_openalex_authors_v2
        WHERE hcp_id = ANY(%s::uuid[])
        GROUP BY hcp_id
        """,
        (list(hcp_ids),),
    )
    return {str(r["hcp_id"]): bool(r["is_primary"]) for r in cur.fetchall()}


def fetch_npi_flags(cur, hcp_ids: Sequence[str]) -> Dict[str, bool]:
    """has-NPI flag per hcp_id from hcps_v2 (for survivor tiebreak)."""
    if not hcp_ids:
        return {}
    cur.execute(
        """
        SELECT id, (npi_number IS NOT NULL AND btrim(npi_number) <> '') AS has_npi
        FROM hcps_v2
        WHERE id = ANY(%s::uuid[])
        """,
        (list(hcp_ids),),
    )
    return {str(r["id"]): bool(r["has_npi"]) for r in cur.fetchall()}


def fetch_publink_flags(cur, hcp_ids: Sequence[str]) -> Dict[str, bool]:
    """has-publication-links flag per hcp_id from publication_authors_v2.

    Leading survivor criterion: publication_authors_v2 is the live register that
    DEFINES publication-first identity, so any record with a linked paper beats
    any record with none — structurally, not by happening to have OpenAlex
    works_count populated (NPI stubs can otherwise win tiebreak 2 via has-NPI
    against a pub record with no author-metrics row)."""
    if not hcp_ids:
        return {}
    cur.execute(
        """
        SELECT hcp_id, count(*) > 0 AS has_publinks
        FROM publication_authors_v2
        WHERE hcp_id = ANY(%s::uuid[])
        GROUP BY hcp_id
        """,
        (list(hcp_ids),),
    )
    return {str(r["hcp_id"]): bool(r["has_publinks"]) for r in cur.fetchall()}


def survivor_sort_key(
    hid: str,
    publinks_by_hcp: Dict[str, bool],
    works_by_hcp: Dict[str, int],
    npi_by_hcp: Dict[str, bool],
    is_primary_by_hcp: Dict[str, bool],
) -> Tuple[int, int, int, int, str]:
    """
    Survivor precedence (lower tuple wins under min()):
      1) has publication_authors_v2 links (publication-first wins structurally)
      2) higher OpenAlex works_count
      3) has NPI
      4) is_primary OpenAlex link
      5) lower id (stable deterministic fallback)
    """
    return (
        -int(bool(publinks_by_hcp.get(hid))),
        -int(works_by_hcp.get(hid, 0)),
        -int(bool(npi_by_hcp.get(hid))),
        -int(bool(is_primary_by_hcp.get(hid))),
        hid,
    )


def choose_survivor_many(
    ids: Sequence[str],
    *,
    publinks_by_hcp: Dict[str, bool],
    works_by_hcp: Dict[str, int],
    npi_by_hcp: Dict[str, bool],
    is_primary_by_hcp: Dict[str, bool],
) -> str:
    """Best survivor across N component members (precedence in survivor_sort_key)."""
    return min(
        ids,
        key=lambda hid: survivor_sort_key(
            hid, publinks_by_hcp, works_by_hcp, npi_by_hcp, is_primary_by_hcp
        ),
    )


def choose_survivor(
    a_id: str,
    b_id: str,
    *,
    publinks_by_hcp: Dict[str, bool],
    works_by_hcp: Dict[str, int],
    npi_by_hcp: Dict[str, bool],
    is_primary_by_hcp: Dict[str, bool],
) -> Tuple[str, str]:
    """
    Pick survivor between two duplicate candidates (precedence in
    survivor_sort_key: publinks > works_count > has-NPI > is_primary > id).
    Returns (survivor_id, merge_away_id).
    """
    survivor_id = min(
        [a_id, b_id],
        key=lambda hid: survivor_sort_key(
            hid, publinks_by_hcp, works_by_hcp, npi_by_hcp, is_primary_by_hcp
        ),
    )
    merge_id = b_id if survivor_id == a_id else a_id
    return survivor_id, merge_id


def is_more_specific_institution(primary_inst: str, stub_inst: str) -> bool:
    p = ns(primary_inst).lower()
    s = ns(stub_inst).lower()
    if not s:
        return False
    if not p:
        return True
    if len(s) <= len(p):
        return False
    s_hint = any(k in s for k in MERGE_KEYWORD_HINTS)
    p_hint = any(k in p for k in MERGE_KEYWORD_HINTS)
    return s_hint and not p_hint


# Fields whose merge rules ASSUME the stub carries genuine added specificity.
# That assumption holds for NPI stubs (the population this executor was written
# for) and is FALSE BY CONSTRUCTION for the 2026-07-22/23 MD5-hash shells, whose
# defining signature is UNNORMALISED raw affiliation and NO NPI:
#
#   institution_normalized  is_more_specific_institution() prefers the LONGER
#       string when it contains a keyword hint (department/division/centre/...).
#       The shells hold the raw affiliation verbatim, so they win that test and
#       would overwrite a clean survivor value -- measured: 862 of 1,093 pairs.
#       e.g. "Universite Paris-Saclay" -> "Universite Paris-Saclay, Gustave
#       Roussy, Departement d'Oncologie Medicale, Villejuif, France; ..."
#
#   nppes_*  the fill-if-empty rule presumes NPPES provenance. ZERO shells have
#       an NPI, so no nppes_* value on them came from NPPES. In practice
#       nppes_practice_city holds parsed affiliation fragments -- "Chongqing
#       University", "Ren Ji Hospital", "West Huaihai Road" -- and would have
#       been written to 1,038 of 1,093 survivors that currently have none.
#
# total_career_pubs is NOT suppressed: it is max(primary, stub) and every shell
# has it NULL, so the merge is provably a no-op there.
SUPPRESSED_FOR_UNNORMALISED_STUBS = frozenset({
    "institution_normalized",
    "nppes_practice_state",
    "nppes_practice_city",
    "nppes_practice_setting",
    "nppes_career_stage_years",
})


def compute_primary_update_payload(
    primary: Dict[str, Any],
    stub: Dict[str, Any],
    suppress_fields: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    if not ns(primary.get("nppes_practice_state")) and ns(stub.get("nppes_practice_state")):
        payload["nppes_practice_state"] = ns(stub.get("nppes_practice_state"))
    if not ns(primary.get("nppes_practice_city")) and ns(stub.get("nppes_practice_city")):
        payload["nppes_practice_city"] = ns(stub.get("nppes_practice_city"))
    if not ns(primary.get("nppes_practice_setting")) and ns(stub.get("nppes_practice_setting")):
        payload["nppes_practice_setting"] = ns(stub.get("nppes_practice_setting"))

    if primary.get("nppes_career_stage_years") in (None, "") and stub.get("nppes_career_stage_years") not in (None, ""):
        payload["nppes_career_stage_years"] = stub.get("nppes_career_stage_years")

    p_inst = ns(primary.get("institution_normalized"))
    s_inst = ns(stub.get("institution_normalized"))
    if not p_inst and s_inst:
        payload["institution_normalized"] = s_inst
    elif is_more_specific_institution(p_inst, s_inst):
        payload["institution_normalized"] = s_inst

    p_pubs = int(primary.get("total_career_pubs") or 0)
    s_pubs = int(stub.get("total_career_pubs") or 0)
    payload["total_career_pubs"] = max(p_pubs, s_pubs)

    if suppress_fields:
        for field in suppress_fields:
            payload.pop(field, None)

    return payload


NPI_SOURCE_RANK = {"human": 3, "llm": 2, "script": 1}


def npi_source_rank(source: Any) -> int:
    """Provenance precedence: human > llm > script. NULL/unknown ranks as script
    (pre-stamp NPIs are script-derived enrichment)."""
    return NPI_SOURCE_RANK.get(ns(source).lower(), 1)


def fetch_hcp_pair(cur, primary_id: str, stub_id: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    cur.execute(
        """
        SELECT id, npi_number, npi_source, npi_verified_at,
               nppes_practice_state, nppes_practice_city, nppes_practice_setting,
               nppes_career_stage_years, institution_normalized, total_career_pubs
        FROM hcps_v2
        WHERE id IN (%s, %s)
        FOR UPDATE
        """,
        (primary_id, stub_id),
    )
    rows = cur.fetchall()
    by_id = {str(r["id"]): r for r in rows}
    primary = by_id.get(primary_id)
    stub = by_id.get(stub_id)
    if not primary or not stub:
        raise RuntimeError("Primary or stub not found in hcps_v2")
    return primary, stub


def fetch_npi_source(cur, hcp_id: str, npi: str) -> str:
    """Best-effort provenance of (hcp_id, npi) for NPI-conflict logging: latest
    live nppes_enrichment_log_v2 row, then npi_match_proposals_v2, else unknown.
    Read-only. Must run BEFORE the log/proposal FK re-points in this merge so
    the stub's rows are still attached to the stub id."""
    cur.execute(
        """
        SELECT match_confidence, match_reason, enriched_at
        FROM nppes_enrichment_log_v2
        WHERE hcp_id = %s AND matched_npi = %s AND reverted_at IS NULL
        ORDER BY enriched_at DESC NULLS LAST
        LIMIT 1
        """,
        (hcp_id, npi),
    )
    row = cur.fetchone()
    if row:
        return (
            f"nppes_enrichment_log_v2[{row['match_confidence']}] "
            f"{ns(row['match_reason'])} @ {row['enriched_at']}"
        )
    cur.execute(
        """
        SELECT match_tier, match_status, applied_at
        FROM npi_match_proposals_v2
        WHERE hcp_id = %s AND npi = %s
        ORDER BY match_calculated_at DESC NULLS LAST
        LIMIT 1
        """,
        (hcp_id, npi),
    )
    row = cur.fetchone()
    if row:
        return (
            f"npi_match_proposals_v2[tier={row['match_tier']} "
            f"status={row['match_status']} applied_at={row['applied_at']}]"
        )
    return "unknown (no enrichment-log or proposal row; pre-log or manual)"


def count_rows_for_hcp(cur, table: str, hcp_col: str, hcp_id: str) -> int:
    cur.execute(f"SELECT COUNT(*) AS c FROM {table} WHERE {hcp_col} = %s", (hcp_id,))
    row = cur.fetchone()
    return int(row["c"] or 0)


def move_simple_hcp_fk(cur, table: str, primary_id: str, stub_id: str, hcp_col: str = "hcp_id") -> int:
    cur.execute(f"UPDATE {table} SET {hcp_col} = %s WHERE {hcp_col} = %s", (primary_id, stub_id))
    return int(cur.rowcount or 0)


def move_hcp_fk_with_conflict_delete(
    cur,
    table: str,
    key_cols: Sequence[str],
    primary_id: str,
    stub_id: str,
    hcp_col: str = "hcp_id",
) -> Dict[str, int]:
    if not key_cols:
        cur.execute(f"DELETE FROM {table} s USING {table} p WHERE s.{hcp_col}=%s AND p.{hcp_col}=%s", (stub_id, primary_id))
        deleted = int(cur.rowcount or 0)
        cur.execute(f"UPDATE {table} SET {hcp_col}=%s WHERE {hcp_col}=%s", (primary_id, stub_id))
        return {"updated": int(cur.rowcount or 0), "deleted_conflicts": deleted}

    # Use IS NOT DISTINCT FROM (not =) so NULL key values compare equal, matching
    # unique-index NULL semantics. A plain "=" makes NULL = NULL evaluate to NULL,
    # so the DELETE skips colliding rows whose key contains NULL and the following
    # UPDATE then trips the unique constraint (observed on hcp_score_ranks_v2,
    # whose scope_value is NULL for national-scope rows).
    on_clause = " AND ".join([f"p.{c} IS NOT DISTINCT FROM s.{c}" for c in key_cols])
    cur.execute(
        f"DELETE FROM {table} s USING {table} p WHERE s.{hcp_col}=%s AND p.{hcp_col}=%s AND {on_clause}",
        (stub_id, primary_id),
    )
    deleted = int(cur.rowcount or 0)
    cur.execute(f"UPDATE {table} SET {hcp_col}=%s WHERE {hcp_col}=%s", (primary_id, stub_id))
    return {"updated": int(cur.rowcount or 0), "deleted_conflicts": deleted}


def move_trial_proposals(cur, primary_id: str, stub_id: str) -> Dict[str, int]:
    cur.execute(
        """
        DELETE FROM trial_investigator_match_proposals_v2 s
        USING trial_investigator_match_proposals_v2 p
        WHERE s.proposed_hcp_id = %s
          AND p.proposed_hcp_id = %s
          AND p.trial_investigator_id = s.trial_investigator_id
        """,
        (stub_id, primary_id),
    )
    deleted = int(cur.rowcount or 0)
    cur.execute(
        """
        UPDATE trial_investigator_match_proposals_v2
        SET proposed_hcp_id = %s
        WHERE proposed_hcp_id = %s
        """,
        (primary_id, stub_id),
    )
    return {"updated": int(cur.rowcount or 0), "deleted_conflicts": deleted}


def merge_record_into_survivor(
    cur,
    survivor_id: str,
    stub_id: str,
    dry_run: bool,
    suppress_fields: Optional[Set[str]] = None,
) -> Dict[str, Dict[str, int]]:
    """
    Merge a single stub record INTO a fixed survivor (no survivor re-selection).
    Survivor choice is made once per component by the caller; this only re-points
    FKs, merges fields/NPI, and deletes the stub.
    """
    if survivor_id == stub_id:
        raise RuntimeError(f"refusing to merge a record into itself: {survivor_id}")

    primary_id = survivor_id
    primary, stub = fetch_hcp_pair(cur, survivor_id, stub_id)

    # Simple hcp_id re-points: no unique key on hcp_id, so a plain UPDATE cannot
    # create a duplicate-key conflict.
    tables_simple = [
        ("trial_investigators_v2", "hcp_id"),
        ("nppes_enrichment_log_v2", "hcp_id"),
        ("hcp_research_themes_v2", "hcp_id"),
        ("hcp_scientific_positions_v1", "hcp_id"),
        # --- Added 2026-08-02 (FK audit): ON DELETE CASCADE, hcp_id not in any
        #     unique key. Without a re-point the stub delete silently removes
        #     its congress rows. ---
        ("congress_confirmed_presenters", "hcp_id"),
    ]

    # Conflict-safe re-points: (hcp_id, *key_cols) is a unique/primary key, so a
    # merged-away row that would collide with an existing survivor row is deleted
    # first, then the remainder are re-pointed.
    tables_conflict = [
        ("hcp_open_payments_summary_v2", "hcp_id", []),
        ("hcp_open_payments_by_ta_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_open_payments_top_companies_v2", "hcp_id", ["manufacturer_name"]),
        ("hcp_open_payments_by_drug_v2", "hcp_id", ["drug_name", "manufacturer_name"]),
        ("hcp_medicare_summary_v2", "hcp_id", []),
        ("hcp_medicare_by_ta_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_scores_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_established_scores_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_community_scores_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_therapeutic_areas_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_institutions_v2", "hcp_id", ["reference_institution_id"]),
        # --- Added after FK audit (all remaining FKs -> hcps_v2.id) ---
        ("dol_canonical_overrides", "hcp_id", ["social_user_id"]),
        ("hcp_ai_overviews", "hcp_id", ["synthesis_type", "therapeutic_area"]),
        ("hcp_author_metrics_v2", "hcp_id", ["snapshot_date"]),
        ("hcp_established_ranks_v3", "hcp_id", ["therapeutic_area_id", "scope_type", "scope_value"]),
        ("hcp_industry_classification_v1", "hcp_id", []),
        ("hcp_leadership_evidence", "hcp_id", ["role_type", "organization", "source_url"]),
        ("hcp_network_centrality_v2", "hcp_id", ["therapeutic_area_id", "window_type"]),
        ("hcp_pharma_engagement_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_publication_leadership_v2", "hcp_id", ["therapeutic_area_id"]),
        ("hcp_score_ranks_v2", "hcp_id", ["therapeutic_area_id", "cohort", "scope_type", "scope_value"]),
        ("msl_hcp_relationships", "hcp_id", ["user_id"]),
        ("npi_match_proposals_v2", "hcp_id", ["npi"]),
        ("nih_grant_investigators", "hcp_id", ["core_project_num", "role"]),
        # --- Moved from tables_simple: composite-key uniques on the hcp_id FK
        #     column caused UniqueViolation on plain re-point (crash on merge). ---
        ("publication_authors_v2", "hcp_id", ["publication_id"]),
        ("hcp_narratives_v2", "hcp_id", ["therapeutic_area_slug", "cohort"]),
        ("hcp_openalex_authors_v2", "hcp_id", ["openalex_author_id"]),
        ("dol_matches_v2", "hcp_id", ["social_user_id"]),
        ("hcp_affiliation_profile_v2", "hcp_id", []),  # hcp_id-alone unique
        ("hcp_nppes_detail_v2", "hcp_id", []),  # hcp_id-alone unique
        # --- Added 2026-08-02: postdates the FK audit. FK is ON DELETE CASCADE,
        #     so a missing re-point SILENTLY DELETES the stub's Medicare claims
        #     rows instead of blocking — re-point before the stub delete. ---
        ("hcp_hcpcs_detail", "hcp_id", ["program_year", "hcpcs_code", "place_of_service"]),
    ]

    moved: Dict[str, Dict[str, int]] = {}

    # Save stub fields first for safe merge sequencing.
    stub_npi = ns(stub.get("npi_number"))
    primary_npi = ns(primary.get("npi_number"))

    stub_npi_source = ns(stub.get("npi_source")) or None
    stub_npi_verified_at = stub.get("npi_verified_at")

    # Both-sides case: precedence decides (human > llm > script, NULL as script).
    # Stub outranking primary -> stub's NPI + provenance replace the primary's.
    # Genuine tie or primary outranks -> primary keeps its own, as before.
    stub_wins_precedence = (
        bool(primary_npi)
        and bool(stub_npi)
        and primary_npi != stub_npi
        and npi_source_rank(stub.get("npi_source")) > npi_source_rank(primary.get("npi_source"))
    )

    # Conflict visibility: when both records hold DIFFERENT non-null NPIs one of
    # them is discarded — log both sides and the actual outcome. 65 duplicate
    # pairs are known to hold NPIs that block their twin; without this log the
    # discarded NPI vanishes without trace.
    if primary_npi and stub_npi and primary_npi != stub_npi:
        survivor_source = fetch_npi_source(cur, primary_id, primary_npi)
        stub_source = fetch_npi_source(cur, stub_id, stub_npi)
        print(
            f"      [NPI_CONFLICT] survivor={primary_id} npi={primary_npi} "
            f"npi_source={primary.get('npi_source') or 'NULL'} log={survivor_source}"
        )
        print(
            f"      [NPI_CONFLICT] stub={stub_id} npi={stub_npi} "
            f"npi_source={stub.get('npi_source') or 'NULL'} log={stub_source}"
        )
        if stub_wins_precedence:
            print(
                f"      [NPI_CONFLICT] winner=stub by npi_source precedence "
                f"({stub.get('npi_source') or 'NULL'} > {primary.get('npi_source') or 'NULL'}); "
                f"survivor takes npi {stub_npi}; survivor's own npi {primary_npi} discarded"
            )
        else:
            print(
                f"      [NPI_CONFLICT] winner=survivor (tie or higher npi_source; "
                f"npi {primary_npi} kept); stub npi {stub_npi} discarded with the stub delete"
            )

    payload = compute_primary_update_payload(primary, stub, suppress_fields)

    # NPI unique-constraint-safe shuffle — provenance travels with the NPI:
    # 1) (if moving) NULL stub.npi_number to free the unique slot
    # 2) set primary npi_number + npi_source + npi_verified_at from the stub
    # Fires when the primary has no NPI (fill), or when the stub's NPI outranks
    # the primary's by source precedence (replace).
    needs_npi_shuffle = (not primary_npi) and bool(stub_npi)
    move_npi = needs_npi_shuffle or stub_wins_precedence
    if dry_run:
        moved["stub_npi_null"] = {"updated": 1 if move_npi else 0, "deleted_conflicts": 0}
        moved["primary_npi_update"] = {"updated": 1 if move_npi else 0, "deleted_conflicts": 0}
        if move_npi:
            print(
                f"      [NPI_MOVE plan] survivor={primary_id} takes npi={stub_npi} "
                f"npi_source={stub_npi_source or 'NULL'} "
                f"npi_verified_at={stub_npi_verified_at or 'NULL'}"
                + (" (stub outranks by precedence)" if stub_wins_precedence else "")
            )
    elif move_npi:
        try:
            cur.execute("UPDATE hcps_v2 SET npi_number = NULL WHERE id = %s", (stub_id,))
            moved["stub_npi_null"] = {"updated": int(cur.rowcount or 0), "deleted_conflicts": 0}

            cur.execute(
                "UPDATE hcps_v2 SET npi_number = %s, npi_source = %s, npi_verified_at = %s "
                "WHERE id = %s",
                (stub_npi, stub_npi_source, stub_npi_verified_at, primary_id),
            )
            moved["primary_npi_update"] = {"updated": int(cur.rowcount or 0), "deleted_conflicts": 0}
        except Exception as exc:
            raise RuntimeError(f"NPI shuffle failed (stub={stub_id} -> primary={primary_id}): {exc}") from exc
    else:
        moved["stub_npi_null"] = {"updated": 0, "deleted_conflicts": 0}
        moved["primary_npi_update"] = {"updated": 0, "deleted_conflicts": 0}

    if dry_run:
        moved["primary_field_merge"] = {"updated": 1 if payload else 0, "deleted_conflicts": 0}
    else:
        if payload:
            set_sql = ", ".join([f"{k} = %s" for k in payload.keys()])
            values = list(payload.values()) + [primary_id]
            cur.execute(f"UPDATE hcps_v2 SET {set_sql} WHERE id = %s", values)
            moved["primary_field_merge"] = {"updated": int(cur.rowcount or 0), "deleted_conflicts": 0}
        else:
            moved["primary_field_merge"] = {"updated": 0, "deleted_conflicts": 0}

    for table, hcp_col in tables_simple:
        if dry_run:
            moved[table] = {"updated": count_rows_for_hcp(cur, table, hcp_col, stub_id), "deleted_conflicts": 0}
        else:
            moved[table] = {"updated": move_simple_hcp_fk(cur, table, primary_id, stub_id, hcp_col), "deleted_conflicts": 0}

    # Cohort-collision artifact-strip: when the survivor is an ACADEMIC board
    # member, the stub's community score must NOT re-point onto it — an academic
    # survivor carrying a community score lands in the community full-board
    # unresolved tier (the manual Aditi cleanup, automated). Academic status is
    # BOARD-MEMBERSHIP ground truth (an established/rising rank row exists), not
    # hcp_cohort_classification_v2. Runs before the tables_conflict loop so the
    # loop finds nothing to move; only ever touches the STUB's rows.
    cur.execute(
        "SELECT (EXISTS (SELECT 1 FROM hcp_established_ranks_v3 WHERE hcp_id = %s) "
        "OR EXISTS (SELECT 1 FROM hcp_rising_star_ranks_v3 WHERE hcp_id = %s)) AS is_academic",
        (survivor_id, survivor_id),
    )
    survivor_is_academic = bool(cur.fetchone()["is_academic"])
    if survivor_is_academic:
        strip_scores = count_rows_for_hcp(cur, "hcp_community_scores_v2", "hcp_id", stub_id)
        # hcp_community_ranks_v2 was DROPPED (community ranks retirement,
        # 2026-08-13). This used to count its rows purely to print how many
        # "vanish with the view" -- decorative, nothing depended on it, and no
        # DELETE was ever issued against it. Left in place it raises
        # UndefinedTable and takes the whole merge executor down with it, which
        # is how this was found: the executor could not run at all.
        cur.execute(
            "SELECT COUNT(*) AS c FROM hcp_score_ranks_v2 WHERE hcp_id = %s AND cohort = 'community'",
            (stub_id,),
        )
        strip_score_ranks = int(cur.fetchone()["c"] or 0)
        print(
            f"      [COHORT_STRIP] survivor={survivor_id} is academic "
            f"(established/rising board member); stub community artifacts are stripped, not re-pointed"
        )
        print(
            f"      [COHORT_STRIP] {'would delete' if dry_run else 'deleting'} "
            f"{strip_scores} hcp_community_scores_v2 row(s) for stub={stub_id}; "
            f"{strip_score_ranks} hcp_score_ranks_v2 cohort='community' row(s)"
        )
        if not dry_run:
            cur.execute("DELETE FROM hcp_community_scores_v2 WHERE hcp_id = %s", (stub_id,))
            strip_scores = int(cur.rowcount or 0)
            cur.execute(
                "DELETE FROM hcp_score_ranks_v2 WHERE hcp_id = %s AND cohort = 'community'",
                (stub_id,),
            )
            strip_score_ranks = int(cur.rowcount or 0)
        moved["hcp_community_scores_v2 [COHORT_STRIP]"] = {"updated": 0, "deleted_conflicts": strip_scores}
        moved["hcp_score_ranks_v2 [COHORT_STRIP]"] = {"updated": 0, "deleted_conflicts": strip_score_ranks}
        # Stripped, not moved: drop both tables from this merge's re-point list
        # so the dry-run plan and the live run report identical movement. The
        # stub's NON-community hcp_score_ranks_v2 rows must still re-point, so
        # that table is handled manually here with the loop's own helper and
        # key columns; in dry-run its count excludes the stripped rows.
        tables_conflict = [
            t for t in tables_conflict if t[0] not in ("hcp_community_scores_v2", "hcp_score_ranks_v2")
        ]
        if dry_run:
            cur.execute(
                "SELECT COUNT(*) AS c FROM hcp_score_ranks_v2 WHERE hcp_id = %s AND cohort <> 'community'",
                (stub_id,),
            )
            moved["hcp_score_ranks_v2"] = {"updated": int(cur.fetchone()["c"] or 0), "deleted_conflicts": 0}
        else:
            moved["hcp_score_ranks_v2"] = move_hcp_fk_with_conflict_delete(
                cur,
                "hcp_score_ranks_v2",
                ["therapeutic_area_id", "cohort", "scope_type", "scope_value"],
                primary_id,
                stub_id,
            )

    for table, hcp_col, key_cols in tables_conflict:
        if dry_run:
            moved[table] = {"updated": count_rows_for_hcp(cur, table, hcp_col, stub_id), "deleted_conflicts": 0}
        else:
            moved[table] = move_hcp_fk_with_conflict_delete(cur, table, key_cols, primary_id, stub_id, hcp_col)

    # hcp_top_collaborators_v2 has TWO FKs to hcps_v2.id: hcp_id (part of the
    # unique key) and collaborator_hcp_id (not in the unique key). Re-point both,
    # then drop any self-collaborator rows created by the merge.
    if dry_run:
        moved["hcp_top_collaborators_v2(hcp_id)"] = {
            "updated": count_rows_for_hcp(cur, "hcp_top_collaborators_v2", "hcp_id", stub_id),
            "deleted_conflicts": 0,
        }
        moved["hcp_top_collaborators_v2(collaborator_hcp_id)"] = {
            "updated": count_rows_for_hcp(cur, "hcp_top_collaborators_v2", "collaborator_hcp_id", stub_id),
            "deleted_conflicts": 0,
        }
    else:
        moved["hcp_top_collaborators_v2(hcp_id)"] = move_hcp_fk_with_conflict_delete(
            cur,
            "hcp_top_collaborators_v2",
            ["therapeutic_area_id", "window_type", "rank"],
            primary_id,
            stub_id,
            "hcp_id",
        )
        collab_updated = move_simple_hcp_fk(
            cur, "hcp_top_collaborators_v2", primary_id, stub_id, "collaborator_hcp_id"
        )
        cur.execute(
            "DELETE FROM hcp_top_collaborators_v2 WHERE hcp_id = collaborator_hcp_id AND hcp_id = %s",
            (primary_id,),
        )
        self_deleted = int(cur.rowcount or 0)
        moved["hcp_top_collaborators_v2(collaborator_hcp_id)"] = {
            "updated": collab_updated,
            "deleted_conflicts": self_deleted,
        }

    # nih_merge_candidates has two hcp FKs (hcp_id_a, hcp_id_b), no unique key on
    # either -> plain re-point of both columns.
    if dry_run:
        moved["nih_merge_candidates"] = {
            "updated": (
                count_rows_for_hcp(cur, "nih_merge_candidates", "hcp_id_a", stub_id)
                + count_rows_for_hcp(cur, "nih_merge_candidates", "hcp_id_b", stub_id)
            ),
            "deleted_conflicts": 0,
        }
    else:
        moved["nih_merge_candidates"] = {
            "updated": (
                move_simple_hcp_fk(cur, "nih_merge_candidates", primary_id, stub_id, "hcp_id_a")
                + move_simple_hcp_fk(cur, "nih_merge_candidates", primary_id, stub_id, "hcp_id_b")
            ),
            "deleted_conflicts": 0,
        }

    if dry_run:
        moved["trial_investigator_match_proposals_v2"] = {
            "updated": count_rows_for_hcp(cur, "trial_investigator_match_proposals_v2", "proposed_hcp_id", stub_id),
            "deleted_conflicts": 0,
        }
    else:
        moved["trial_investigator_match_proposals_v2"] = move_trial_proposals(cur, primary_id, stub_id)

    # hcp_cohort_classification_v2 has NO FK to hcps_v2, so the stub delete
    # below would strand its per-(hcp, TA) taxonomy rows forever. Sweep them
    # here, stub-keyed only, in the same transaction as the delete they exist
    # for. The survivor keeps its own classification rows untouched.
    if dry_run:
        moved["hcp_cohort_classification_v2 [ORPHAN_SWEEP]"] = {
            "updated": 0,
            "deleted_conflicts": count_rows_for_hcp(cur, "hcp_cohort_classification_v2", "hcp_id", stub_id),
        }
    else:
        cur.execute("DELETE FROM hcp_cohort_classification_v2 WHERE hcp_id = %s", (stub_id,))
        moved["hcp_cohort_classification_v2 [ORPHAN_SWEEP]"] = {
            "updated": 0,
            "deleted_conflicts": int(cur.rowcount or 0),
        }

    if dry_run:
        moved["hcps_v2_stub_delete"] = {"updated": 1, "deleted_conflicts": 0}
    else:
        cur.execute("DELETE FROM hcps_v2 WHERE id = %s", (stub_id,))
        moved["hcps_v2_stub_delete"] = {"updated": int(cur.rowcount or 0), "deleted_conflicts": 0}

    return moved


def main() -> None:
    args = parse_args()
    dry_run = bool(args.dry_run)

    load_dotenv()
    _supabase = init_supabase()  # keep standard v2 script pattern

    candidates_all = load_candidates(args.csv, tier=None, cluster=None)
    by_action = Counter(c.recommended_action for c in candidates_all)
    candidates = load_candidates(args.csv, tier=args.tier, cluster=args.cluster)

    print(f"Total clusters in CSV: {len(candidates_all):,}")
    print("Clusters by recommended_action:")
    for k, v in sorted(by_action.items()):
        print(f"  {k}: {v:,}")
    print(f"Clusters selected for this run: {len(candidates):,}")

    # Import psycopg lazily so dry-run/compile workflows do not hard fail if absent.
    import psycopg  # type: ignore
    from psycopg.rows import dict_row  # type: ignore

    db_url = get_db_url()
    successes = 0
    failed = 0
    stubs_deleted = 0
    failure_reasons: List[Tuple[str, str]] = []

    # Group all selected pairs into connected components (transitive-safe).
    components = build_components(candidates)
    reason_by_hcp = reasons_by_hcp(candidates)
    print(f"Connected components (>=2 records): {len(components):,}")

    all_hcp_ids: Set[str] = set()
    for comp in components:
        all_hcp_ids.update(comp)

    # Global guard: no id may be a survivor in one component and merged-away in
    # another. Components are disjoint by construction, but track defensively.
    global_survivors: Set[str] = set()
    global_merged_away: Set[str] = set()

    with psycopg.connect(db_url, row_factory=dict_row, autocommit=False) as conn:
        with conn.cursor() as preload_cur:
            works_by_hcp = fetch_works_counts(preload_cur, sorted(all_hcp_ids))
            is_primary_by_hcp = fetch_is_primary_flags(preload_cur, sorted(all_hcp_ids))
            npi_by_hcp = fetch_npi_flags(preload_cur, sorted(all_hcp_ids))
            publinks_by_hcp = fetch_publink_flags(preload_cur, sorted(all_hcp_ids))
        print(f"Loaded OpenAlex works_count for {len(works_by_hcp):,} / {len(all_hcp_ids):,} component HCP ids")
        print(
            f"Loaded publication-link flags: {sum(1 for v in publinks_by_hcp.values() if v):,} "
            f"of {len(all_hcp_ids):,} component ids have publication_authors_v2 rows"
        )

        for idx, members in enumerate(sorted(components, key=lambda m: -len(m)), start=1):
            survivor_id = choose_survivor_many(
                members,
                publinks_by_hcp=publinks_by_hcp,
                works_by_hcp=works_by_hcp,
                npi_by_hcp=npi_by_hcp,
                is_primary_by_hcp=is_primary_by_hcp,
            )
            merge_away = [m for m in members if m != survivor_id]

            print(
                f"\ncomponent={idx} size={len(members)} "
                f"survivor={survivor_id} (works={works_by_hcp.get(survivor_id, 0)}) "
                f"merge_away={len(merge_away)}"
            )
            for m in merge_away:
                print(
                    f"    <- {m} (works={works_by_hcp.get(m, 0)}, "
                    f"reason={reason_by_hcp.get(m, '')})"
                )

            global_survivors.add(survivor_id)

            for stub_id in merge_away:
                # Already-merged tracking: never process an id twice; never merge
                # the survivor away.
                if stub_id in global_merged_away:
                    print(f"    [SKIP] {stub_id} already merged away")
                    continue
                if stub_id == survivor_id:
                    continue
                try:
                    with conn.transaction():
                        with conn.cursor() as cur:
                            moved = merge_record_into_survivor(
                                cur, survivor_id, stub_id, dry_run=dry_run
                            )
                    prefix = "Would UPDATE" if dry_run else "Moved"
                    for table, stats in moved.items():
                        print(
                            f"      {prefix} {stats['updated']} rows in {table}"
                            + (
                                f" (deleted_conflicts={stats['deleted_conflicts']})"
                                if stats.get("deleted_conflicts")
                                else ""
                            )
                        )
                    global_merged_away.add(stub_id)
                    successes += 1
                    stubs_deleted += moved.get("hcps_v2_stub_delete", {}).get("updated", 0)
                except Exception as exc:
                    failed += 1
                    failure_reasons.append((stub_id, repr(exc)))
                    print(f"      [FAILED] merge {stub_id} -> {survivor_id}: {exc}")
                    continue

    overlap = global_survivors & global_merged_away
    print("\n=== Final Summary ===")
    print(f"Components processed: {len(components):,}")
    print(f"Successful record merges: {successes}")
    print(f"Failed record merges: {failed}")
    print(f"Stubs deleted count: {stubs_deleted if not dry_run else 0}")
    print(f"Survivor/merged-away overlap (must be 0): {len(overlap)}")
    if overlap:
        print(f"  OVERLAP IDS: {sorted(overlap)}")
    if failure_reasons:
        print("Failed reasons:")
        for hid, reason in failure_reasons:
            print(f"  {hid}: {reason}")


if __name__ == "__main__":
    main()
