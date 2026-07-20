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


def survivor_sort_key(
    hid: str,
    works_by_hcp: Dict[str, int],
    npi_by_hcp: Dict[str, bool],
    is_primary_by_hcp: Dict[str, bool],
) -> Tuple[int, int, int, str]:
    """
    Survivor precedence (lower tuple wins under min()):
      1) higher OpenAlex works_count
      2) has NPI
      3) is_primary OpenAlex link
      4) lower id (stable deterministic fallback)
    """
    return (
        -int(works_by_hcp.get(hid, 0)),
        -int(bool(npi_by_hcp.get(hid))),
        -int(bool(is_primary_by_hcp.get(hid))),
        hid,
    )


def choose_survivor_many(
    ids: Sequence[str],
    *,
    works_by_hcp: Dict[str, int],
    npi_by_hcp: Dict[str, bool],
    is_primary_by_hcp: Dict[str, bool],
) -> str:
    """Highest-works_count survivor across N component members (same precedence)."""
    return min(
        ids,
        key=lambda hid: survivor_sort_key(hid, works_by_hcp, npi_by_hcp, is_primary_by_hcp),
    )


def choose_survivor(
    a_id: str,
    b_id: str,
    *,
    works_by_hcp: Dict[str, int],
    npi_by_hcp: Dict[str, bool],
    is_primary_by_hcp: Dict[str, bool],
) -> Tuple[str, str]:
    """
    Pick survivor between two duplicate candidates.
    Precedence:
      1) higher OpenAlex works_count
      2) has NPI
      3) is_primary OpenAlex link
      4) lower id (stable deterministic fallback)
    Returns (survivor_id, merge_away_id).
    """
    survivor_id = min(
        [a_id, b_id],
        key=lambda hid: (
            -int(works_by_hcp.get(hid, 0)),
            -int(bool(npi_by_hcp.get(hid))),
            -int(bool(is_primary_by_hcp.get(hid))),
            hid,
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


def compute_primary_update_payload(primary: Dict[str, Any], stub: Dict[str, Any]) -> Dict[str, Any]:
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

    return payload


def fetch_hcp_pair(cur, primary_id: str, stub_id: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    cur.execute(
        """
        SELECT id, npi_number, nppes_practice_state, nppes_practice_city, nppes_practice_setting,
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
        ("hcp_narratives_v2", "hcp_id", ["therapeutic_area_slug"]),
        ("hcp_openalex_authors_v2", "hcp_id", ["openalex_author_id"]),
        ("dol_matches_v2", "hcp_id", ["social_user_id"]),
        ("hcp_affiliation_profile_v2", "hcp_id", []),  # hcp_id-alone unique
        ("hcp_nppes_detail_v2", "hcp_id", []),  # hcp_id-alone unique
    ]

    moved: Dict[str, Dict[str, int]] = {}

    # Save stub fields first for safe merge sequencing.
    stub_npi = ns(stub.get("npi_number"))
    primary_npi = ns(primary.get("npi_number"))
    payload = compute_primary_update_payload(primary, stub)

    # NPI unique-constraint-safe shuffle:
    # 1) (if needed) NULL stub.npi_number
    # 2) set primary.npi_number to saved stub value
    needs_npi_shuffle = (not primary_npi) and bool(stub_npi)
    if dry_run:
        moved["stub_npi_null"] = {"updated": 1 if needs_npi_shuffle else 0, "deleted_conflicts": 0}
        moved["primary_npi_update"] = {"updated": 1 if needs_npi_shuffle else 0, "deleted_conflicts": 0}
    elif needs_npi_shuffle:
        try:
            cur.execute("UPDATE hcps_v2 SET npi_number = NULL WHERE id = %s", (stub_id,))
            moved["stub_npi_null"] = {"updated": int(cur.rowcount or 0), "deleted_conflicts": 0}

            cur.execute("UPDATE hcps_v2 SET npi_number = %s WHERE id = %s", (stub_npi, primary_id))
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
        print(f"Loaded OpenAlex works_count for {len(works_by_hcp):,} / {len(all_hcp_ids):,} component HCP ids")

        for idx, members in enumerate(sorted(components, key=lambda m: -len(m)), start=1):
            survivor_id = choose_survivor_many(
                members,
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
