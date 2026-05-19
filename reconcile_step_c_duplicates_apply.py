"""
FieldMark — apply Step C collision reconciliation (join rows + primary OA recompute).

Usage:
  python reconcile_step_c_duplicates_apply.py --dry-run
  python reconcile_step_c_duplicates_apply.py
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv

from preview_step_b_matching import (
    init_supabase,
    normalize_first_name,
    normalize_last_name,
    normalize_openalex_author_id,
    normalize_org_name,
    split_display_name_to_raw_parts,
)

EXPECTED_RECONCILABLE = 23
INVENTORY_PAGE_SIZE = 1000
JOIN_PAGE_SIZE = 1000
HCP_PAGE_SIZE = 500

JOIN_NOTES = "Recovered from Step C constraint collision via reconcile_step_c_duplicates_apply.py"
JOIN_STATUS = "step_c_collision_reconciliation"
JOIN_METHOD = "step_c_duplicate_recovery"
JOIN_CONFIDENCE = "high"


@dataclass
class PlannedCase:
    entry: Dict[str, Any]
    hcp: Dict[str, Any]
    action: str  # simple_link | fragment_cluster_recompute_primary | matches_existing_oa_id
    inv_oa: str
    inv_corpus: int
    existing_hcp_oa: Optional[str]
    existing_corpus: Optional[int]  # None = unknown/not in inventory
    primary_oa: str
    primary_corpus: int
    join_rows: List[Dict[str, Any]]
    update_hcp_oa_from: Optional[str]
    update_hcp_oa_to: Optional[str]


@dataclass
class HcpRunState:
    initial_hcp_oa: Optional[str]
    oa_corpus: Dict[str, int] = field(default_factory=dict)
    tracked_hcp_oa: Optional[str] = None


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def oa_id(value: Any) -> str:
    return normalize_openalex_author_id(value) or str(value or "").strip()


def oa_or_none(value: Any) -> Optional[str]:
    s = oa_id(value) if value is not None and str(value).strip() else ""
    return s or None


def hcp_display_name(hcp: Dict[str, Any]) -> str:
    return f"{hcp.get('first_name', '')} {hcp.get('last_name', '')}".strip()


def corpus_int(value: Any) -> int:
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def fetch_linked_openalex_ids(supabase) -> Set[str]:
    linked: Set[str] = set()
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("hcp_openalex_authors")
            .select("openalex_author_id")
            .order("openalex_author_id")
            .limit(JOIN_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("openalex_author_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oa = row.get("openalex_author_id")
            if oa:
                linked.add(str(oa))
        last_id = batch[-1]["openalex_author_id"]
        if len(batch) < JOIN_PAGE_SIZE:
            break
    return linked


def fetch_inventory_and_corpus_map(
    supabase, linked_ids: Set[str]
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    unlinked: List[Dict[str, Any]] = []
    corpus_by_oa: Dict[str, int] = {}
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select(
                "openalex_author_id,display_name,last_known_institution,"
                "last_known_institution_ror,corpus_pub_count,first_seen_pub_year,last_seen_pub_year"
            )
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("openalex_author_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            oid = str(row.get("openalex_author_id") or "")
            if oid:
                corpus_by_oa[oid] = corpus_int(row.get("corpus_pub_count"))
                if oid not in linked_ids:
                    unlinked.append(row)
        last_id = batch[-1]["openalex_author_id"]
        if len(batch) < INVENTORY_PAGE_SIZE:
            break
    return unlinked, corpus_by_oa


def build_full_hcp_index(supabase) -> Dict[Tuple[str, str, str], List[Dict[str, Any]]]:
    index: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
    last_id: Optional[str] = None
    loaded = 0
    while True:
        q = (
            supabase.table("hcps")
            .select("id,first_name,last_name,institution,openalex_author_id,source")
            .order("id")
            .limit(HCP_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for hcp in batch:
            loaded += 1
            key = (
                normalize_first_name(hcp.get("first_name")),
                normalize_last_name(hcp.get("last_name")),
                normalize_org_name(hcp.get("institution")),
            )
            if key[0] and key[1]:
                index[key].append(hcp)
            if loaded % 10_000 == 0:
                print(f"  ... loaded {loaded:,} HCPs")
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < HCP_PAGE_SIZE:
            break
    print(f"  Loaded {loaded:,} HCPs into name+institution index")
    return index


def find_reconcilable(
    unlinked: List[Dict[str, Any]],
    hcp_index: Dict[Tuple[str, str, str], List[Dict[str, Any]]],
) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
    reconcilable: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    for inv in unlinked:
        first_raw, last_raw = split_display_name_to_raw_parts(inv.get("display_name"))
        inv_first = normalize_first_name(first_raw)
        inv_last = normalize_last_name(last_raw)
        inv_inst = normalize_org_name(inv.get("last_known_institution"))
        if not inv_first or not inv_last:
            continue
        matches = hcp_index.get((inv_first, inv_last, inv_inst), [])
        if len(matches) == 1:
            entry = {
                "inventory": inv,
                "first_norm": inv_first,
                "last_norm": inv_last,
                "institution_norm": inv_inst,
            }
            reconcilable.append((entry, matches[0]))
    reconcilable.sort(key=lambda pair: str(pair[0]["inventory"].get("openalex_author_id") or ""))
    return reconcilable


def classify_action(inv_oa: str, hcp: Dict[str, Any]) -> str:
    hcp_oa = oa_or_none(hcp.get("openalex_author_id"))
    if not hcp_oa:
        return "simple_link"
    if hcp_oa == inv_oa:
        return "matches_existing_oa_id"
    return "fragment_cluster_recompute_primary"


def recompute_primary(oa_corpus: Dict[str, int]) -> str:
    return max(oa_corpus.items(), key=lambda kv: (kv[1], kv[0]))[0]


def build_join_rows(hcp_id: str, oa_corpus: Dict[str, int], primary_oa: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for oid in sorted(oa_corpus.keys()):
        rows.append(
            {
                "hcp_id": hcp_id,
                "openalex_author_id": oid,
                "is_primary": oid == primary_oa,
                "match_status": JOIN_STATUS,
                "match_confidence": JOIN_CONFIDENCE,
                "match_method": JOIN_METHOD,
                "notes": JOIN_NOTES,
            }
        )
    return rows


def plan_cases(
    reconcilable: List[Tuple[Dict[str, Any], Dict[str, Any]]],
    corpus_by_oa: Dict[str, int],
) -> List[PlannedCase]:
    """Classify each reconcilable pair; plan join rows per inventory entry (merged at execute)."""
    planned: List[PlannedCase] = []
    hcp_accum: Dict[str, Dict[str, int]] = {}
    hcp_initial_oa: Dict[str, Optional[str]] = {}

    for entry, hcp in reconcilable:
        inv = entry["inventory"]
        inv_oa = oa_id(inv.get("openalex_author_id"))
        inv_corpus = corpus_int(inv.get("corpus_pub_count"))
        hcp_id = str(hcp.get("id") or "")
        existing_hcp_oa = oa_or_none(hcp.get("openalex_author_id"))

        action = classify_action(inv_oa, hcp)

        if hcp_id not in hcp_accum:
            hcp_accum[hcp_id] = {}
            hcp_initial_oa[hcp_id] = existing_hcp_oa
            if existing_hcp_oa:
                hcp_accum[hcp_id][existing_hcp_oa] = corpus_by_oa.get(existing_hcp_oa, 0)

        hcp_accum[hcp_id][inv_oa] = inv_corpus
        primary_oa = recompute_primary(hcp_accum[hcp_id])
        primary_corpus = hcp_accum[hcp_id][primary_oa]

        existing_corpus: Optional[int] = None
        if existing_hcp_oa:
            existing_corpus = corpus_by_oa.get(existing_hcp_oa)
            if existing_hcp_oa not in corpus_by_oa:
                existing_corpus = 0

        join_rows = build_join_rows(hcp_id, dict(hcp_accum[hcp_id]), primary_oa)

        update_from = hcp_initial_oa[hcp_id]
        update_to: Optional[str] = None
        if action == "simple_link":
            update_to = primary_oa
        elif action == "fragment_cluster_recompute_primary" and primary_oa != existing_hcp_oa:
            update_to = primary_oa

        planned.append(
            PlannedCase(
                entry=entry,
                hcp=hcp,
                action=action,
                inv_oa=inv_oa,
                inv_corpus=inv_corpus,
                existing_hcp_oa=existing_hcp_oa,
                existing_corpus=existing_corpus,
                primary_oa=primary_oa,
                primary_corpus=primary_corpus,
                join_rows=join_rows,
                update_hcp_oa_from=update_from,
                update_hcp_oa_to=update_to,
            )
        )
    return planned


def print_plan(planned: List[PlannedCase]) -> None:
    counts = defaultdict(int)
    for p in planned:
        counts[p.action] += 1

    print()
    print("=" * 60)
    print("RECONCILIATION PLAN")
    print("=" * 60)
    print(f"Total cases: {len(planned)}")
    print(f"  case A (simple_link):                       {counts['simple_link']}")
    print(f"  case B (fragment_cluster_recompute_primary): {counts['fragment_cluster_recompute_primary']}")
    print(f"  case C (matches_existing_oa_id, anomaly):    {counts['matches_existing_oa_id']}")
    print()

    print("--- CASE A: simple_link ---")
    for p in planned:
        if p.action != "simple_link":
            continue
        inv = p.entry["inventory"]
        name = str(inv.get("display_name") or hcp_display_name(p.hcp))
        inst = str(inv.get("last_known_institution") or p.hcp.get("institution") or "")
        print(f"{name} | {inst}")
        print(f"  HCP id: {p.hcp.get('id')}")
        print(f"  Add join row: {p.inv_oa} (corpus={p.inv_corpus}, primary=TRUE)")
        for jr in p.join_rows:
            print(f"    - {jr['openalex_author_id']}: is_primary={jr['is_primary']}")
        frm = p.update_hcp_oa_from or "(none)"
        print(f"  Update hcps.openalex_author_id: {frm} -> {p.update_hcp_oa_to}")
        print()

    print("--- CASE B: fragment_cluster_recompute_primary ---")
    for p in planned:
        if p.action != "fragment_cluster_recompute_primary":
            continue
        inv = p.entry["inventory"]
        name = str(inv.get("display_name") or hcp_display_name(p.hcp))
        inst = str(inv.get("last_known_institution") or p.hcp.get("institution") or "")
        ex_corpus_label = p.existing_corpus if p.existing_corpus is not None else "unknown"
        print(f"{name} | {inst}")
        print(f"  HCP id: {p.hcp.get('id')}")
        print(f"  Existing OA ID: {p.existing_hcp_oa} (corpus={ex_corpus_label})")
        print(f"  New OA ID:      {p.inv_oa} (corpus={p.inv_corpus})")
        print(f"  Primary after recompute: {p.primary_oa} (corpus={p.primary_corpus})")
        print("  Join row writes:")
        for jr in p.join_rows:
            print(f"    - {jr['openalex_author_id']}: is_primary={jr['is_primary']}")
        if p.update_hcp_oa_to and p.update_hcp_oa_to != p.update_hcp_oa_from:
            print(f"  Update hcps.openalex_author_id: {p.update_hcp_oa_from} -> {p.update_hcp_oa_to}")
        else:
            print("  Update hcps.openalex_author_id: no change (existing primary wins)")
        print()

    if counts["matches_existing_oa_id"]:
        print("--- CASE C: matches_existing_oa_id (anomaly) ---")
        for p in planned:
            if p.action != "matches_existing_oa_id":
                continue
            inv = p.entry["inventory"]
            print(f"  SKIP: {inv.get('display_name')} -> {p.inv_oa} (HCP already has this OA id)")
        print()


def execute_case(
    supabase,
    idx: int,
    total: int,
    planned: PlannedCase,
    hcp_states: Dict[str, HcpRunState],
    *,
    dry_run: bool,
) -> Tuple[bool, int, int, Optional[str]]:
    """Returns (success, join_rows_written, hcp_updates, error_message)."""
    inv = planned.entry["inventory"]
    hcp = planned.hcp
    hcp_id = str(hcp.get("id") or "")
    inv_oa = planned.inv_oa
    inv_corpus = planned.inv_corpus
    name = hcp_display_name(hcp) or str(inv.get("display_name") or "")

    if planned.action == "matches_existing_oa_id":
        return True, 0, 0, None

    if hcp_id not in hcp_states:
        initial = oa_or_none(hcp.get("openalex_author_id"))
        hcp_states[hcp_id] = HcpRunState(initial_hcp_oa=initial, tracked_hcp_oa=initial)

    st = hcp_states[hcp_id]
    if st.initial_hcp_oa and st.initial_hcp_oa not in st.oa_corpus:
        st.oa_corpus[st.initial_hcp_oa] = planned.existing_corpus if planned.existing_corpus is not None else 0
    st.oa_corpus[inv_oa] = inv_corpus

    primary_oa = recompute_primary(st.oa_corpus)
    join_rows = build_join_rows(hcp_id, st.oa_corpus, primary_oa)

    join_written = 0
    hcp_updates = 0
    err: Optional[str] = None

    if dry_run:
        return True, len(join_rows), 1 if primary_oa != st.tracked_hcp_oa else 0, None

    try:
        supabase.table("hcp_openalex_authors").upsert(
            join_rows,
            on_conflict="hcp_id,openalex_author_id",
        ).execute()
        join_written = len(join_rows)
    except Exception as exc:
        return False, 0, 0, str(exc)

    if primary_oa != st.tracked_hcp_oa:
        try:
            supabase.table("hcps").update({"openalex_author_id": primary_oa}).eq("id", hcp_id).execute()
            hcp_updates = 1
            st.tracked_hcp_oa = primary_oa
        except Exception as exc:
            return False, join_written, 0, f"join ok, hcps update failed: {exc}"

    return True, join_written, hcp_updates, err


def count_remaining_unlinked(supabase, linked_ids: Set[str]) -> int:
    remaining = 0
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select("openalex_author_id")
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("openalex_author_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            if row.get("openalex_author_id") not in linked_ids:
                remaining += 1
        last_id = batch[-1]["openalex_author_id"]
        if len(batch) < INVENTORY_PAGE_SIZE:
            break
    return remaining


def run_verification_queries(supabase) -> None:
    print("\nPost-run verification (running via API)...")
    try:
        linked = fetch_linked_openalex_ids(supabase)
        remaining = count_remaining_unlinked(supabase, linked)
        print(f"  remaining_unlinked (inventory rows with no join): {remaining}")
    except Exception as exc:
        eprint(f"  remaining_unlinked check failed: {exc}")

    try:
        r = (
            supabase.table("hcp_openalex_authors")
            .select("id", count="exact", head=True)
            .eq("match_status", JOIN_STATUS)
            .execute()
        )
        print(f"  reconciliation_join_rows (match_status={JOIN_STATUS}): {int(r.count or 0)}")
    except Exception as exc:
        eprint(f"  reconciliation_join_rows check failed: {exc}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Apply Step C collision reconciliation.")
    p.add_argument("--dry-run", action="store_true", help="Print plan only; no database writes")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    t0 = time.perf_counter()

    load_dotenv()
    supabase = init_supabase()

    print("Loading linked openalex_author_id values...")
    linked_ids = fetch_linked_openalex_ids(supabase)
    print(f"  Linked count: {len(linked_ids):,}")

    print("Scanning inventory (unlinked + corpus map)...")
    unlinked, corpus_by_oa = fetch_inventory_and_corpus_map(supabase, linked_ids)
    print(f"  Unlinked inventory entries: {len(unlinked)}")

    print("Loading HCP index...")
    hcp_index = build_full_hcp_index(supabase)

    reconcilable = find_reconcilable(unlinked, hcp_index)
    print(f"Reconcilable cases found: {len(reconcilable)}")

    if len(reconcilable) != EXPECTED_RECONCILABLE:
        print(
            f"\nWARNING: expected exactly {EXPECTED_RECONCILABLE} reconcilable cases, "
            f"found {len(reconcilable)}. Stopping — DB may have changed since diagnostic."
        )
        raise SystemExit(1)

    planned = plan_cases(reconcilable, corpus_by_oa)
    print_plan(planned)

    if args.dry_run:
        print("DRY RUN — no writes performed.")
        return

    print("\nApplying reconciliation...")
    hcp_states: Dict[str, HcpRunState] = {}
    errors: List[Tuple[str, str, str]] = []
    success_count = 0
    total_join_rows = 0
    total_hcp_updates = 0
    total = len(planned)

    for i, p in enumerate(planned, start=1):
        if p.action == "matches_existing_oa_id":
            print(f"[{i}/{total}] {p.action}: {hcp_display_name(p.hcp)} (skipped anomaly)")
            continue

        ok, joins, updates, err = execute_case(
            supabase, i, total, p, hcp_states, dry_run=False
        )
        label = p.action
        name = hcp_display_name(p.hcp)
        if ok:
            success_count += 1
            total_join_rows += joins
            total_hcp_updates += updates
            print(f"[{i}/{total}] {label}: {name} ok")
        else:
            hid = str(p.hcp.get("id") or "")
            errors.append((hid, name, err or "unknown error"))
            print(f"[{i}/{total}] {label}: {name} ERROR: {err}")

    elapsed = time.perf_counter() - t0
    print()
    print("=" * 60)
    print("RECONCILIATION SUMMARY")
    print("=" * 60)
    print(f"Total HCPs processed:    {total}")
    print(f"Successful:              {success_count}")
    print(f"Errors:                  {len(errors)}")
    print()
    print(f"Join rows written:       {total_join_rows}")
    print(f"hcps.openalex_author_id updates: {total_hcp_updates}")
    print()
    print(f"Wall time: {elapsed:.1f}s")

    if errors:
        print("\n--- ERRORS ---")
        for hid, name, msg in errors:
            print(f"  {hid} ({name}): {msg}")

    print("\nPost-run verification queries (run in Supabase SQL editor):")
    print(
        """
  -- Should now be 11 (previously 34, minus 23 reconciled)
  SELECT COUNT(*) AS remaining_unlinked
  FROM openalex_author_inventory oai
  WHERE NOT EXISTS (
    SELECT 1 FROM hcp_openalex_authors hoa
    WHERE hoa.openalex_author_id = oai.openalex_author_id
  );

  -- Should be 23 new join rows (or 25 if we count both rows for the 2 fragment cases)
  SELECT COUNT(*) AS reconciliation_join_rows
  FROM hcp_openalex_authors
  WHERE match_status = 'step_c_collision_reconciliation';
"""
    )

    run_verification_queries(supabase)


if __name__ == "__main__":
    main()
