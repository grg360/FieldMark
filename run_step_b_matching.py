"""
FieldMark — Step B: persist HCP ↔ OpenAlex author matches.

Uses the same matching logic as preview_step_b_matching.py; writes to
hcp_openalex_authors and optionally updates hcps.openalex_author_id.

Requires SUPABASE_URL, SUPABASE_KEY. Prerequisite: table hcp_openalex_authors
must exist (see script error message for DDL).

Examples:
  python run_step_b_matching.py --dry-run --limit 500
  python run_step_b_matching.py --canonicals-only
  python run_step_b_matching.py --random-sample 2000 --batch-size 100
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client
from tqdm import tqdm

import preview_step_b_matching as stepb

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

KEYSET_BATCH_SIZE = 500
PROGRESS_EVERY = 500

HIGH_CONF_STATUSES = frozenset(
    {
        "verified_primary_found",
        "verified_primary_relocated",
        "category_2_clean_match",
        "category_2_fragment_cluster",
        "canonical_discovered_unique",
        "canonical_discovered_cluster",
        "canonical_discovered_dominant_institution",
    }
)
MEDIUM_CONF_STATUSES = frozenset(
    {
        "below_threshold_rediscovered_unique",
        "below_threshold_rediscovered_cluster",
        "below_threshold_rediscovered_dominant_institution",
    }
)
LOW_CONF_STATUSES = frozenset(
    {
        "category_3_name_only_match",
        "category_3_fragment_cluster",
    }
)

MATCH_METHOD_BY_STATUS: Dict[str, str] = {
    "verified_primary_found": "cat1_seed_verified_primary",
    "verified_primary_relocated": "cat1_primary_relocated",
    "openalex_id_below_corpus_threshold": "cat1_seed_missing_inventory",
    "below_threshold_rediscovered_unique": "cat1_below_threshold_name_rediscovery_unique",
    "below_threshold_rediscovered_cluster": "cat1_below_threshold_name_rediscovery_cluster",
    "below_threshold_rediscovered_dominant_institution": "cat1_below_threshold_name_rediscovery_dominant_inst",
    "category_2_clean_match": "cat2_ror_name_clean_match",
    "category_2_fragment_cluster": "cat2_ror_name_fragment_cluster",
    "category_2_ambiguous_homonym": "cat2_ror_ambiguous_homonym",
    "category_2_no_inventory_match": "cat2_ror_no_inventory_match",
    "category_3_no_match": "cat3_name_no_match",
    "category_3_name_only_match": "cat3_name_only_single",
    "category_3_fragment_cluster": "cat3_name_same_institution_cluster",
    "category_3_ambiguous_no_institution": "cat3_name_multi_institution_ambiguous",
    "canonical_discovered_unique": "canonical_name_discovery_unique",
    "canonical_discovered_cluster": "canonical_name_discovery_cluster",
    "canonical_discovered_dominant_institution": "canonical_name_discovery_dominant_institution",
    "canonical_discovered_ambiguous": "canonical_name_discovery_ambiguous",
}

NO_JOIN_WRITE_STATUSES = frozenset(
    {
        "category_3_no_match",
        "category_2_ambiguous_homonym",
        "category_3_ambiguous_no_institution",
        "openalex_id_below_corpus_threshold",
        "canonical_discovered_ambiguous",
        "category_2_no_inventory_match",
    }
)

NO_HCP_OPENALEX_UPDATE_STATUSES = frozenset(
    {
        "below_threshold_rediscovered_unique",
        "below_threshold_rediscovered_cluster",
        "below_threshold_rediscovered_dominant_institution",
        "category_3_name_only_match",
        "category_2_ambiguous_homonym",
        "category_3_ambiguous_no_institution",
        "openalex_id_below_corpus_threshold",
        "canonical_discovered_ambiguous",
    }
)


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Run Step B: write HCP to OpenAlex matches to hcp_openalex_authors (read preview for logic).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N HCPs in table order (testing). Default: no limit (full table).",
    )
    p.add_argument(
        "--random-sample",
        type=int,
        default=None,
        metavar="N",
        help="Sample N random HCPs (same as preview: all ids, shuffle seed 42). Wins over --limit.",
    )
    p.add_argument("--canonicals-only", action="store_true", help="Only canonical_hcps_snapshot ids")
    p.add_argument("--category", choices=("1", "2", "3", "all"), default="all")
    p.add_argument("--dry-run", action="store_true", help="Compute matches only; no DB writes")
    p.add_argument("--csv-also", metavar="PATH", default=None, help="Also write audit CSV to PATH")
    p.add_argument("--batch-size", type=int, default=100, help="hcp_openalex_authors rows per upsert batch")
    return p.parse_args()


def match_confidence_for_status(status: str) -> str:
    if status in HIGH_CONF_STATUSES:
        return "high"
    if status in MEDIUM_CONF_STATUSES:
        return "medium"
    if status in LOW_CONF_STATUSES:
        return "low"
    return "none"


def match_method_for_status(status: str) -> str:
    return MATCH_METHOD_BY_STATUS.get(status, "step_b_match")


def table_exists(supabase: Client, table_name: str) -> bool:
    try:
        supabase.table(table_name).select("id").limit(1).execute()
        return True
    except Exception:
        return False


def count_table(supabase: Client, table_name: str) -> int:
    r = supabase.table(table_name).select("*", count="exact", head=True).execute()
    return int(r.count or 0)


def prereq_exit_message() -> str:
    return (
        "Table hcp_openalex_authors does not exist or is not accessible.\n"
        "Create it in Supabase before running this script, for example:\n\n"
        "CREATE TABLE hcp_openalex_authors (\n"
        "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n"
        "  hcp_id UUID NOT NULL REFERENCES hcps(id) ON DELETE CASCADE,\n"
        "  openalex_author_id TEXT NOT NULL,\n"
        "  is_primary BOOLEAN DEFAULT FALSE,\n"
        "  match_status TEXT NOT NULL,\n"
        "  match_confidence TEXT NOT NULL,\n"
        "  match_method TEXT,\n"
        "  notes TEXT,\n"
        "  created_at TIMESTAMPTZ DEFAULT NOW(),\n"
        "  UNIQUE(hcp_id, openalex_author_id)\n"
        ");\n"
        "CREATE INDEX idx_hcp_openalex_authors_hcp_id ON hcp_openalex_authors(hcp_id);\n"
        "CREATE INDEX idx_hcp_openalex_authors_oa_id ON hcp_openalex_authors(openalex_author_id);\n"
        "CREATE INDEX idx_hcp_openalex_authors_confidence ON hcp_openalex_authors(match_confidence);\n"
    )


def sanity_checks(supabase: Client) -> Dict[str, int]:
    if not table_exists(supabase, "hcp_openalex_authors"):
        eprint(prereq_exit_message())
        raise SystemExit(1)
    counts: Dict[str, int] = {}
    for tbl in ("hcps", "openalex_author_inventory", "nppes_org_to_ror", "hcp_openalex_authors"):
        try:
            counts[tbl] = count_table(supabase, tbl)
        except Exception as exc:
            eprint(f"Sanity check failed for table {tbl!r}: {exc}")
            raise SystemExit(1) from exc
    return counts


def fetch_hcp_keyset_batch(
    supabase: Client,
    *,
    last_id: Optional[str],
    batch_size: int,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    q = (
        supabase.table("hcps")
        .select(stepb.HCP_SELECT_COLUMNS)
        .order("id")
        .limit(batch_size)
    )
    if last_id is not None:
        q = q.gt("id", last_id)
    rows = q.execute().data or []
    next_cursor = str(rows[-1]["id"]) if rows else None
    return rows, next_cursor


def build_join_rows(h: Dict[str, Any], mr: stepb.MatchResult) -> List[Dict[str, Any]]:
    if not mr.matched_ids:
        return []
    if mr.match_status in NO_JOIN_WRITE_STATUSES:
        return []
    primary_id = mr.matched_ids[0]
    conf = match_confidence_for_status(mr.match_status)
    method = match_method_for_status(mr.match_status)
    hid = str(h.get("id") or "")
    out: List[Dict[str, Any]] = []
    for oid in mr.matched_ids:
        out.append(
            {
                "hcp_id": hid,
                "openalex_author_id": oid,
                "is_primary": oid == primary_id,
                "match_status": mr.match_status,
                "match_confidence": conf,
                "match_method": method,
                "notes": ((mr.notes or "")[:8000]) if mr.notes else "",
            }
        )
    return out


def should_update_hcp_openalex_column(h: Dict[str, Any], mr: stepb.MatchResult) -> Optional[str]:
    """Return new primary OpenAlex URL if hcps.openalex_author_id should be updated, else None."""
    if not mr.matched_ids:
        return None
    if mr.match_status in NO_HCP_OPENALEX_UPDATE_STATUSES:
        return None
    primary_id = mr.matched_ids[0]
    stored = stepb.normalize_openalex_author_id(h.get("openalex_author_id"))
    if stored == primary_id:
        return None
    return primary_id


def upsert_join_batch(
    supabase: Client,
    rows: Sequence[Dict[str, Any]],
    *,
    batch_size: int,
    dry_run: bool,
    errors: List[str],
) -> int:
    if dry_run or not rows:
        return 0

    # Group rows by hcp_id so we can delete-then-insert atomically per HCP.
    # This ensures orphan rows from previous runs (where match logic produced
    # more rows than today's run) are removed.
    from collections import defaultdict

    by_hcp: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows:
        hid = str(r.get("hcp_id") or "")
        if hid:
            by_hcp[hid].append(r)

    written = 0
    hcp_ids = list(by_hcp.keys())

    for i in tqdm(range(0, len(hcp_ids), batch_size), desc="upserting join rows", unit="batch"):
        hcp_chunk = hcp_ids[i : i + batch_size]

        # Delete existing rows for these HCPs
        try:
            supabase.table("hcp_openalex_authors").delete().in_(
                "hcp_id", hcp_chunk
            ).execute()
        except Exception as exc:
            # Fall back to per-HCP deletes
            for hid in hcp_chunk:
                try:
                    supabase.table("hcp_openalex_authors").delete().eq(
                        "hcp_id", hid
                    ).execute()
                except Exception as exc2:
                    msg = f"delete hcp_id={hid}: {exc2}"
                    errors.append(msg)
                    eprint("[join delete]", msg)

        # Insert the new rows for these HCPs
        rows_to_insert: List[Dict[str, Any]] = []
        for hid in hcp_chunk:
            rows_to_insert.extend(by_hcp[hid])

        if not rows_to_insert:
            continue

        try:
            supabase.table("hcp_openalex_authors").insert(rows_to_insert).execute()
            written += len(rows_to_insert)
        except Exception as exc:
            # Fall back to per-row insert to identify offenders
            for r in rows_to_insert:
                try:
                    supabase.table("hcp_openalex_authors").insert(r).execute()
                    written += 1
                except Exception as exc2:
                    msg = f"insert hcp_id={r.get('hcp_id')} openalex={r.get('openalex_author_id')}: {exc2}"
                    errors.append(msg)
                    eprint("[join insert]", msg)

    return written


def apply_hcp_openalex_updates_sequential(
    supabase: Client,
    updates: Sequence[Tuple[str, str]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    """
    Set hcps.openalex_author_id one row at a time via UPDATE (avoids upsert INSERT
    paths that omit NOT NULL columns). Last write wins if the same hcp_id appears
    more than once in updates.
    """
    if dry_run or not updates:
        return 0
    by_id: Dict[str, str] = {}
    for hid, new_oa in updates:
        by_id[str(hid)] = new_oa
    n = 0
    for hid, new_oa in by_id.items():
        try:
            supabase.table("hcps").update({"openalex_author_id": new_oa}).eq("id", hid).execute()
            n += 1
        except Exception as exc2:
            msg = f"hcp_id={hid} update openalex_author_id: {exc2}"
            errors.append(msg)
            eprint("[hcp update]", msg)
    return n


def format_eta(seconds: float) -> str:
    if seconds <= 0 or not (seconds < 1e9):
        return "?"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m"


def run() -> None:
    args = parse_args()
    if args.random_sample is not None and args.random_sample < 1:
        raise SystemExit("--random-sample N requires N >= 1")
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit N requires N >= 1")

    load_dotenv()
    supabase = stepb.init_supabase()

    print("Pre-run sanity checks...")
    counts = sanity_checks(supabase)
    for k, v in counts.items():
        print(f"  {k}: {v} rows")

    canonical_ids: Set[str] = set(stepb.fetch_canonical_hcp_ids(supabase))
    print(f"  canonical_hcps_snapshot ids: {len(canonical_ids)}")

    print("\nLoading reference data (inventory + nppes map)...")
    inventory_all = stepb.fetch_openalex_inventory(supabase)
    org_map = stepb.fetch_nppes_org_to_ror(supabase)
    inventory_indexes = stepb.build_inventory_indexes(inventory_all)
    print(f"  inventory: {len(inventory_all)} rows; org map: {len(org_map)} keys\n")

    cat_filter: Optional[int] = None if args.category == "all" else int(args.category)

    # Total HCPs for progress (approx for full scan)
    total_run: Optional[int] = None
    if args.canonicals_only:
        total_run = len(canonical_ids)
    elif args.random_sample is not None:
        total_run = args.random_sample
    elif args.limit is not None:
        total_run = args.limit
    else:
        total_run = counts.get("hcps")

    dry = args.dry_run
    if dry:
        print("*** DRY RUN: no writes to hcp_openalex_authors or hcps ***\n")

    csv_rows: List[Dict[str, Any]] = []
    csv_path = args.csv_also
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

    errors: List[str] = []
    join_rows_written = 0
    hcp_updates_applied = 0
    processed = 0
    hcps_with_join_rows = 0
    hcp_updates_planned = 0

    t0 = time.perf_counter()
    last_progress = t0
    last_progress_count = 0
    canonical_audit: List[Tuple[Dict[str, Any], stepb.MatchResult, List[Dict[str, Any]]]] = []

    pending_joins: List[Dict[str, Any]] = []
    pending_hcp_updates: List[Tuple[str, str]] = []

    def flush_joins() -> None:
        nonlocal join_rows_written, pending_joins
        if pending_joins:
            join_rows_written += upsert_join_batch(
                supabase, pending_joins, batch_size=args.batch_size, dry_run=dry, errors=errors
            )
            pending_joins = []

    def flush_hcp_updates() -> None:
        nonlocal hcp_updates_applied, pending_hcp_updates
        if not pending_hcp_updates:
            return
        hcp_updates_applied += apply_hcp_openalex_updates_sequential(
            supabase,
            pending_hcp_updates,
            dry_run=dry,
            errors=errors,
        )
        pending_hcp_updates = []

    def maybe_progress(force: bool = False) -> None:
        nonlocal last_progress, last_progress_count
        now = time.perf_counter()
        if not force and processed - last_progress_count < PROGRESS_EVERY and (now - last_progress) < 30.0:
            return
        last_progress_count = processed
        elapsed = now - t0
        rate = processed / elapsed if elapsed > 0 else 0.0
        tot = total_run if total_run else processed
        pct = 100.0 * processed / tot if tot else 0.0
        eta_s = (tot - processed) / rate if rate > 0 and tot and processed < tot else 0.0
        ts = datetime.now().strftime("%H:%M:%S")
        mw = join_rows_written + len(pending_joins)
        print(
            f"[{ts}] Processed {processed}/{tot} ({pct:.1f}%) | "
            f"matches written: {mw} | hcps updated: {hcp_updates_applied} | "
            f"errors: {len(errors)} | rate: {rate:.1f}/s | ETA: {format_eta(eta_s)}"
        )
        last_progress = now

    def handle_one_hcp(h: Dict[str, Any]) -> bool:
        """Return False if --limit reached and caller should stop."""
        nonlocal processed, hcps_with_join_rows, hcp_updates_planned, pending_joins, pending_hcp_updates
        if args.limit is not None and processed >= args.limit:
            return False
        if cat_filter is not None and stepb.effective_input_category(h, canonical_ids) != cat_filter:
            return True

        mr = stepb.match_hcp(
            h,
            inventory_indexes=inventory_indexes,
            org_map=org_map,
            canonical_ids=canonical_ids,
        )
        csv_rows.append(stepb.result_to_csv_row(h, mr, inventory_indexes.by_id))

        joins = build_join_rows(h, mr)
        if joins:
            hcps_with_join_rows += 1
            pending_joins.extend(joins)

        new_oa = should_update_hcp_openalex_column(h, mr)
        if new_oa:
            hcp_updates_planned += 1
            pending_hcp_updates.append((str(h.get("id")), new_oa))

        if args.canonicals_only and str(h.get("id")) in canonical_ids:
            canonical_audit.append((h, mr, joins))

        processed += 1
        maybe_progress()
        return True

    if args.canonicals_only:
        ids = list(canonical_ids)
        hcps = stepb.fetch_hcps_by_ids(supabase, ids)
        hcps.sort(key=lambda x: str(x.get("id")))
        print(f"Canonical-only mode: {len(hcps)} HCP row(s)\n")
        for i, h in enumerate(tqdm(hcps, desc="matching HCPs", unit="hcp"), start=1):
            if not handle_one_hcp(h):
                break
            if i % KEYSET_BATCH_SIZE == 0:
                flush_joins()
                flush_hcp_updates()
    elif args.random_sample is not None:
        hcps = stepb.load_hcps_random_sample(supabase, args.random_sample)
        print(f"Random sample: {len(hcps)} HCP row(s)\n")
        for i, h in enumerate(tqdm(hcps, desc="matching HCPs", unit="hcp"), start=1):
            if not handle_one_hcp(h):
                break
            if i % KEYSET_BATCH_SIZE == 0:
                flush_joins()
                flush_hcp_updates()
    else:
        last_id: Optional[str] = None
        stop_all = False
        while True:
            if args.limit is not None and processed >= args.limit:
                break
            rows, last_id = fetch_hcp_keyset_batch(supabase, last_id=last_id, batch_size=KEYSET_BATCH_SIZE)
            if not rows:
                break
            for h in tqdm(rows, desc="matching HCPs", unit="hcp"):
                if not handle_one_hcp(h):
                    stop_all = True
                    break
            flush_joins()
            flush_hcp_updates()
            if stop_all:
                break
            if args.limit is not None and processed >= args.limit:
                break
            if last_id is None:
                break

    flush_joins()
    flush_hcp_updates()
    maybe_progress(force=True)

    if csv_path:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for row in csv_rows:
                w.writerow({k: row.get(k, "") for k in fieldnames})
        print(f"\nWrote audit CSV: {csv_path}")

    elapsed = time.perf_counter() - t0
    print("\n" + "=" * 72)
    print("STEP B RUN — SUMMARY")
    print("=" * 72)
    print(f"Total HCPs processed (after category filter): {processed}")
    print(f"hcp_openalex_authors row upserts (cumulative): {join_rows_written}")
    print(f"HCPs with at least one join row this run: {hcps_with_join_rows}")
    print(f"hcps.openalex_author_id updates applied: {hcp_updates_applied}")
    print(f"hcps.openalex_author_id updates eligible (pre-dedupe): {hcp_updates_planned}")
    print(f"Errors: {len(errors)}")
    print(f"Wall time: {elapsed:.1f}s ({elapsed / 60.0:.2f} min)")
    if errors:
        print("\nFirst errors (up to 20):")
        for line in errors[:20]:
            print(f"  {line}")

    # Reuse preview-style status histogram (CSV-shaped rows)
    stepb.print_summary(csv_rows, csv_path or "(no csv path; counts from run)")

    if args.canonicals_only and canonical_audit:
        print("\n" + "=" * 72)
        print("CANONICAL DETAIL (verification)")
        print("=" * 72)
        for h, mr, joins in canonical_audit:
            name = f'{h.get("first_name", "")} {h.get("last_name", "")}'.strip()
            print(
                f"\n  {name}  id={h.get('id')}\n"
                f"    match_status={mr.match_status}  match_confidence={mr.match_confidence}\n"
                f"    matched_ids ({len(mr.matched_ids)}): {';'.join(mr.matched_ids) or '(none)'}\n"
                f"    join rows written: {len(joins)}  "
                f"primary is_primary count: {sum(1 for j in joins if j.get('is_primary'))}"
            )


if __name__ == "__main__":
    run()
