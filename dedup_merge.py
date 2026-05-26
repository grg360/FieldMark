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
from typing import Any, Dict, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

CSV_PATH_DEFAULT = "dedup_candidates_phase1.csv"

ALLOWED_ACTIONS = {"merge_high_confidence", "merge_review"}

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Execute dedup merges from dedup_candidates_phase1.csv")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Print planned operations only.")
    mode.add_argument("--execute", action="store_true", help="Perform merge writes/deletes.")
    parser.add_argument(
        "--tier",
        choices=["merge_high_confidence", "merge_review"],
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
                )
            )
    return out


def ns(v: Any) -> str:
    return " ".join(str(v or "").strip().split())


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

    on_clause = " AND ".join([f"p.{c} = s.{c}" for c in key_cols])
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


def merge_cluster(cur, cluster: CandidateCluster, dry_run: bool) -> Dict[str, Dict[str, int]]:
    primary_id = cluster.primary_hcp_id
    stub_id = cluster.stub_hcp_id

    tables_simple = [
        ("publication_authors_v2", "hcp_id"),
        ("trial_investigators_v2", "hcp_id"),
        ("hcp_narratives_v2", "hcp_id"),
        ("hcp_affiliation_profile_v2", "hcp_id"),
        ("hcp_nppes_detail_v2", "hcp_id"),
        ("hcp_openalex_authors_v2", "hcp_id"),
        ("dol_matches_v2", "hcp_id"),
        ("nppes_enrichment_log_v2", "hcp_id"),
    ]

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
    ]

    moved: Dict[str, Dict[str, int]] = {}

    primary, stub = fetch_hcp_pair(cur, primary_id, stub_id)
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
    failure_reasons: List[Tuple[int, str]] = []

    with psycopg.connect(db_url, row_factory=dict_row, autocommit=False) as conn:
        for c in candidates:
            print(
                f"\ncluster={c.cluster_id} last_name={c.last_name} "
                f"primary={c.primary_first_name}({c.primary_hcp_id}) "
                f"stub={c.stub_first_name}({c.stub_hcp_id}) tier={c.recommended_action}"
            )
            try:
                if dry_run:
                    with conn.transaction():
                        with conn.cursor() as cur:
                            moved = merge_cluster(cur, c, dry_run=True)
                else:
                    with conn.transaction():
                        with conn.cursor() as cur:
                            moved = merge_cluster(cur, c, dry_run=False)

                for table, stats in moved.items():
                    prefix = "Would UPDATE" if dry_run else "Moved"
                    print(
                        f"  {prefix} {stats['updated']} rows in {table}"
                        + (
                            f" (deleted_conflicts={stats['deleted_conflicts']})"
                            if stats.get("deleted_conflicts")
                            else ""
                        )
                    )
                successes += 1
                stubs_deleted += moved.get("hcps_v2_stub_delete", {}).get("updated", 0)
            except Exception as exc:
                failed += 1
                failure_reasons.append((c.cluster_id, repr(exc)))
                print(f"  [FAILED] cluster={c.cluster_id}: {exc}")
                continue

    print("\n=== Final Summary ===")
    print(f"Successful merges count: {successes}")
    print(f"Failed merges count: {failed}")
    print(f"Stubs deleted count: {stubs_deleted if not dry_run else 0}")
    if failure_reasons:
        print("Failed reasons:")
        for cid, reason in failure_reasons:
            print(f"  cluster {cid}: {reason}")


if __name__ == "__main__":
    main()
