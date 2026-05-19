"""
FieldMark — Step B+: name-based rescue for Step D wipe candidates.

Links pending wipe_candidates_audit rows to openalex_author_inventory when
normalized HCP name matches inventory display_name parsing + normalization,
with relaxed institution handling (single inventory row, or multi-row same
institution_bucket fragment cluster).

Requires: Step B/C complete, wipe_candidates_audit from Step D --diagnose.
SUPABASE_URL, SUPABASE_KEY (.env via python-dotenv optional).

Examples:
  python run_step_b_plus_reconcile.py --audit-run-id <uuid> --dry-run
  python run_step_b_plus_reconcile.py --audit-run-id <uuid> --csv-also rescues.csv
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

import preview_step_b_matching as stepb

INVENTORY_PAGE_SIZE = 1000
WIPE_PAGE_SIZE = 1000
PROGRESS_EVERY = 1000
NOTES_MAX = 8000

MATCH_METHOD = "step_b_plus_name_reconcile"
CONFIDENCE = "low"

STATUS_NO_MATCH = "reconcile_no_inventory_match"
STATUS_NAME_ONLY = "reconcile_name_only_rescue"
STATUS_FRAGMENT = "reconcile_fragment_cluster_rescue"
STATUS_AMBIGUOUS = "reconcile_ambiguous_homonym"

AUDIT_RESCUED = "rescued_step_b_plus"


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def table_exists(supabase: Client, table_name: str) -> bool:
    try:
        supabase.table(table_name).select("*").limit(1).execute()
        return True
    except Exception:
        return False


def parse_display_name_raw(display_name: Optional[str]) -> Tuple[str, str]:
    """Whitespace split: last token = last, rest = first (same as Step C inventory parsing)."""
    raw = str(display_name or "").strip()
    if not raw:
        return "", ""
    parts = raw.split()
    if len(parts) == 1:
        return "", parts[0]
    return " ".join(parts[:-1]), parts[-1]


def inventory_name_key(row: Dict[str, Any]) -> Tuple[str, str]:
    first_raw, last_raw = parse_display_name_raw(row.get("display_name"))
    return stepb.normalize_first_name(first_raw), stepb.normalize_last_name(last_raw)


def hcp_name_key_from_audit(first: Any, last: Any) -> Tuple[str, str]:
    return stepb.normalize_first_name(first), stepb.normalize_last_name(last)


def build_inventory_by_normalized_name(supabase: Client) -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
    by_name: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    last_oa: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select(stepb.INVENTORY_SELECT_COLUMNS)
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_oa is not None:
            q = q.gt("openalex_author_id", last_oa)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            k = inventory_name_key(row)
            if not k[0] or not k[1]:
                continue
            by_name.setdefault(k, []).append(row)
        last_oa = batch[-1].get("openalex_author_id")
        if not last_oa or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return by_name


def same_institution_bucket_cluster(matches: Sequence[Dict[str, Any]]) -> bool:
    buckets = {stepb.institution_bucket(r) for r in matches}
    buckets.discard("")
    return len(buckets) <= 1


def pick_primary_inventory_row(matches: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    return max(matches, key=lambda r: (stepb.row_corpus(r), stepb.normalize_openalex_author_id(r.get("openalex_author_id")) or ""))


def reconcile_outcome(
    matches: List[Dict[str, Any]],
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Returns (status, matches_to_link) where matches_to_link is empty if no rescue.
    """
    if not matches:
        return STATUS_NO_MATCH, []
    if len(matches) == 1:
        return STATUS_NAME_ONLY, list(matches)
    if same_institution_bucket_cluster(matches):
        return STATUS_FRAGMENT, list(matches)
    return STATUS_AMBIGUOUS, []


def build_join_rows(
    hcp_id: str,
    matches: Sequence[Dict[str, Any]],
    primary: Dict[str, Any],
    match_status: str,
) -> List[Dict[str, Any]]:
    primary_oid = stepb.normalize_openalex_author_id(primary.get("openalex_author_id"))
    notes = f"step_b_plus;{len(matches)} inventory match(es);primary={primary_oid}"[:NOTES_MAX]
    out: List[Dict[str, Any]] = []
    for r in matches:
        oid = stepb.normalize_openalex_author_id(r.get("openalex_author_id"))
        if not oid:
            continue
        out.append(
            {
                "hcp_id": hcp_id,
                "openalex_author_id": oid,
                "is_primary": oid == primary_oid,
                "match_status": match_status,
                "match_confidence": CONFIDENCE,
                "match_method": MATCH_METHOD,
                "notes": notes,
            }
        )
    return out


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
    written = 0
    for i in range(0, len(rows), batch_size):
        chunk = list(rows[i : i + batch_size])
        try:
            supabase.table("hcp_openalex_authors").upsert(
                chunk,
                on_conflict="hcp_id,openalex_author_id",
            ).execute()
            written += len(chunk)
        except Exception as exc:
            eprint(f"[join batch] {exc}")
            for r in chunk:
                try:
                    supabase.table("hcp_openalex_authors").upsert(
                        [r],
                        on_conflict="hcp_id,openalex_author_id",
                    ).execute()
                    written += 1
                except Exception as exc2:
                    msg = f"hcp_id={r.get('hcp_id')} oa={r.get('openalex_author_id')}: {exc2}"
                    errors.append(msg)
                    eprint("[join upsert]", msg)
    return written


def apply_hcp_openalex_updates(
    supabase: Client,
    updates: Sequence[Tuple[str, str]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    if dry_run or not updates:
        return 0
    n = 0
    for hid, new_oa in updates:
        try:
            supabase.table("hcps").update({"openalex_author_id": new_oa}).eq("id", hid).execute()
            n += 1
        except Exception as exc2:
            msg = f"hcp_id={hid} update openalex_author_id: {exc2}"
            errors.append(msg)
            eprint("[hcp update]", msg)
    return n


def mark_audit_rescued_batch(
    supabase: Client,
    audit_run_id: str,
    audit_row_ids: Sequence[str],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    if dry_run or not audit_row_ids:
        return 0
    n = 0
    chunk_size = 200
    ids = list(audit_row_ids)
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        try:
            (
                supabase.table("wipe_candidates_audit")
                .update({"deletion_status": AUDIT_RESCUED})
                .eq("audit_run_id", audit_run_id)
                .eq("deletion_status", "pending")
                .in_("id", chunk)
                .execute()
            )
            n += len(chunk)
        except Exception as exc:
            msg = f"audit update batch: {exc}"
            errors.append(msg)
            eprint("[audit]", msg)
            for aid in chunk:
                try:
                    (
                        supabase.table("wipe_candidates_audit")
                        .update({"deletion_status": AUDIT_RESCUED})
                        .eq("id", aid)
                        .eq("deletion_status", "pending")
                        .execute()
                    )
                    n += 1
                except Exception as exc2:
                    errors.append(f"audit id={aid}: {exc2}")
                    eprint("[audit]", errors[-1])
    return n


def fetch_wipe_candidates(
    supabase: Client,
    audit_run_id: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("wipe_candidates_audit")
            .select("id,hcp_id,first_name,last_name,institution,audit_run_id,deletion_status")
            .eq("audit_run_id", audit_run_id)
            .eq("deletion_status", "pending")
            .order("id")
            .limit(WIPE_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        out.extend(batch)
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < WIPE_PAGE_SIZE:
            break
    return out


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Step B+: rescue wipe candidates by normalized name vs inventory.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--audit-run-id", type=str, required=True, metavar="ID", help="audit_run_id from Step D diagnose")
    p.add_argument("--dry-run", action="store_true", help="Compute outcomes only; no DB writes")
    p.add_argument("--csv-also", metavar="PATH", default=None, help="Write CSV of rescue decisions")
    p.add_argument("--batch-size", type=int, default=100, help="hcp_openalex_authors upsert batch size")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if args.batch_size < 1:
        raise SystemExit("--batch-size must be >= 1")

    load_dotenv()
    supabase = init_supabase()

    for tbl in ("wipe_candidates_audit", "openalex_author_inventory", "hcp_openalex_authors", "hcps"):
        if not table_exists(supabase, tbl):
            eprint(f"Required table missing or inaccessible: {tbl}")
            raise SystemExit(1)

    print(f"Audit run ID: {args.audit_run_id}")
    print("Loading pending wipe candidates...")
    candidates = fetch_wipe_candidates(supabase, args.audit_run_id)
    total = len(candidates)
    print(f"  Pending candidates: {total:,}")
    if total == 0:
        print("Nothing to process (no pending rows for this audit_run_id).")
        return

    print("Building inventory name index (this may take a minute)...")
    t_idx = time.perf_counter()
    by_name = build_inventory_by_normalized_name(supabase)
    print(f"  Name keys: {len(by_name):,} (inventory scan {time.perf_counter() - t_idx:.1f}s)")

    counters: Counter[str] = Counter()
    errors: List[str] = []
    pending_joins: List[Dict[str, Any]] = []
    pending_hcp_updates: List[Tuple[str, str]] = []
    pending_audit_ids: List[str] = []
    csv_rows: List[Dict[str, Any]] = []
    joins_written_total = 0
    hcp_updates_total = 0
    audit_updated_total = 0

    t0 = time.perf_counter()
    processed = 0
    rescued_queued = 0

    def flush_joins() -> None:
        nonlocal joins_written_total
        if not pending_joins:
            return
        joins_written_total += upsert_join_batch(
            supabase, pending_joins, batch_size=args.batch_size, dry_run=args.dry_run, errors=errors
        )
        pending_joins.clear()

    def flush_hcps() -> None:
        nonlocal hcp_updates_total
        if not pending_hcp_updates:
            return
        hcp_updates_total += apply_hcp_openalex_updates(
            supabase, pending_hcp_updates, dry_run=args.dry_run, errors=errors
        )
        pending_hcp_updates.clear()

    def flush_audit() -> None:
        nonlocal audit_updated_total
        if not pending_audit_ids:
            return
        audit_updated_total += mark_audit_rescued_batch(
            supabase, args.audit_run_id, pending_audit_ids, dry_run=args.dry_run, errors=errors
        )
        pending_audit_ids.clear()

    for row in candidates:
        processed += 1
        audit_pk = str(row.get("id") or "")
        hcp_id = str(row.get("hcp_id") or "")
        if not audit_pk or not hcp_id:
            errors.append(f"skip audit row missing id/hcp_id: {row!r}")
            counters["reconcile_skip_bad_row"] += 1
            continue

        nk = hcp_name_key_from_audit(row.get("first_name"), row.get("last_name"))
        matches = list(by_name.get(nk, []))
        status, to_link = reconcile_outcome(matches)

        counters[status] += 1

        csv_rows.append(
            {
                "audit_row_id": audit_pk,
                "hcp_id": hcp_id,
                "normalized_first": nk[0],
                "normalized_last": nk[1],
                "outcome": status,
                "inventory_match_count": len(matches),
                "linked_openalex_ids": ";".join(
                    stepb.normalize_openalex_author_id(m.get("openalex_author_id"))
                    for m in to_link
                    if stepb.normalize_openalex_author_id(m.get("openalex_author_id"))
                ),
            }
        )

        if not to_link:
            if processed % PROGRESS_EVERY == 0 or processed == total:
                _progress(processed, total, rescued_queued, counters, errors, t0)
            continue

        rescued_queued += 1
        primary = pick_primary_inventory_row(to_link)
        primary_oa = stepb.normalize_openalex_author_id(primary.get("openalex_author_id"))
        if not primary_oa:
            errors.append(f"audit={audit_pk} hcp={hcp_id}: primary inventory missing openalex id")
            counters[status] -= 1
            counters["reconcile_skip_missing_primary_oa"] += 1
            rescued_queued -= 1
            if processed % PROGRESS_EVERY == 0 or processed == total:
                _progress(processed, total, rescued_queued, counters, errors, t0)
            continue

        pending_joins.extend(build_join_rows(hcp_id, to_link, primary, status))
        pending_hcp_updates.append((hcp_id, primary_oa))
        pending_audit_ids.append(audit_pk)

        if len(pending_joins) >= args.batch_size:
            flush_joins()
        if len(pending_hcp_updates) >= 50:
            flush_hcps()
        if len(pending_audit_ids) >= 200:
            flush_audit()

        if processed % PROGRESS_EVERY == 0 or processed == total:
            _progress(processed, total, rescued_queued, counters, errors, t0)

    flush_joins()
    flush_hcps()
    flush_audit()

    elapsed = time.perf_counter() - t0
    rescued_final = counters[STATUS_NAME_ONLY] + counters[STATUS_FRAGMENT]

    print("\n" + "=" * 72)
    print("STEP B+ RECONCILE - SUMMARY")
    print("=" * 72)
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"Audit run ID: {args.audit_run_id}")
    print(f"Total wipe candidates processed: {total:,}")
    print(f"Rescued (unique HCPs): {rescued_final:,}")
    print(f"  {STATUS_NAME_ONLY}: {counters[STATUS_NAME_ONLY]:,}")
    print(f"  {STATUS_FRAGMENT}: {counters[STATUS_FRAGMENT]:,}")
    print("Stayed wipe target:")
    print(f"  {STATUS_NO_MATCH}: {counters[STATUS_NO_MATCH]:,}")
    print(f"  {STATUS_AMBIGUOUS}: {counters[STATUS_AMBIGUOUS]:,}")
    if counters.get("reconcile_skip_bad_row") or counters.get("reconcile_skip_missing_primary_oa"):
        print(
            f"  Skipped: bad_row={counters.get('reconcile_skip_bad_row', 0)}, "
            f"missing_primary_oa={counters.get('reconcile_skip_missing_primary_oa', 0)}"
        )
    print(f"hcp_openalex_authors rows written: {joins_written_total:,}")
    print(f"hcps.openalex_author_id updates applied: {hcp_updates_total:,}")
    print(f"wipe_candidates_audit rows -> {AUDIT_RESCUED}: {audit_updated_total:,}")
    print(f"Errors logged: {len(errors):,}")
    print(f"Runtime: {elapsed:.1f}s ({elapsed / 60.0:.2f} min)")
    print("\nVerification:")
    print(
        "SELECT deletion_status, COUNT(*) FROM wipe_candidates_audit \n"
        f"WHERE audit_run_id = '{args.audit_run_id}' GROUP BY deletion_status;\n"
    )
    print("=" * 72)

    if args.csv_also:
        _write_csv(args.csv_also, csv_rows)
        print(f"CSV written: {args.csv_also}")

    if errors:
        print("\nFirst errors:")
        for e in errors[:25]:
            print(f"  {e}")


def _progress(
    processed: int,
    total: int,
    rescued_queued: int,
    counters: Counter[str],
    errors: List[str],
    t0: float,
) -> None:
    elapsed = time.perf_counter() - t0
    rate = processed / elapsed if elapsed > 0 else 0.0
    unlinked = (
        counters[STATUS_NO_MATCH]
        + counters[STATUS_AMBIGUOUS]
        + counters.get("reconcile_skip_bad_row", 0)
        + counters.get("reconcile_skip_missing_primary_oa", 0)
    )
    ts = datetime.now().strftime("%H:%M:%S")
    print(
        f"[{ts}] Processed {processed}/{total} | rescued {rescued_queued} | "
        f"unlinked {unlinked} | errors {len(errors)} | rate {rate:.2f}/s"
    )


def _write_csv(path: str, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


if __name__ == "__main__":
    main()
