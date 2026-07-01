"""
FieldMark — Step D: wipe HCPs with no NPI, no OpenAlex id, no join rows, not canonical.

Phase 1 (--diagnose, default): find candidates, insert into wipe_candidates_audit only.
Phase 2 (--execute --confirm-irreversible): delete npi_match_proposals then hcps for a prior audit run.

Requires wipe_candidates_audit table (DDL in module docstring). SUPABASE_URL + SUPABASE_KEY.

Examples:
  python run_step_d_wipe.py
  python run_step_d_wipe.py --diagnose
  python run_step_d_wipe.py --execute --confirm-irreversible --batch-size 25 --sleep-between-batches 0.3
  python run_step_d_wipe.py --execute --confirm-irreversible --dry-run-execute
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

HCP_SCAN_COLUMNS = (
    "id,npi_number,openalex_author_id,first_name,last_name,institution,"
    "city,state,country,source,created_at"
)
HCP_PAGE_SIZE = 500
JOIN_PAGE_SIZE = 1000
AUDIT_INSERT_BATCH = 200
PROGRESS_DIAGNOSE_EVERY = 1000
NPI_PROPOSAL_DELETE_BATCH = 200

DDL_HINT = """
CREATE TABLE wipe_candidates_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL,
  first_name TEXT,
  last_name TEXT,
  institution TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  source TEXT,
  created_at_original TIMESTAMPTZ,
  reason_for_wipe TEXT,
  audit_run_id TEXT,
  audited_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_status TEXT DEFAULT 'pending'
);
CREATE INDEX idx_wipe_candidates_run_id ON wipe_candidates_audit(audit_run_id);
CREATE INDEX idx_wipe_candidates_status ON wipe_candidates_audit(deletion_status);
"""


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


def count_hcps_filtered(supabase: Client, *, npi_not_null: bool = False, oa_not_null: bool = False) -> int:
    q = supabase.table("hcps").select("id", count="exact", head=True)
    if npi_not_null:
        q = q.not_.is_("npi_number", "null")
    if oa_not_null:
        q = q.not_.is_("openalex_author_id", "null")
    r = q.execute()
    return int(r.count or 0)


def count_total_hcps(supabase: Client) -> int:
    r = supabase.table("hcps").select("id", count="exact", head=True).execute()
    return int(r.count or 0)


def fetch_canonical_ids(supabase: Client) -> Set[str]:
    out: Set[str] = set()
    rows = supabase.table("canonical_hcps_snapshot").select("id").execute().data or []
    for r in rows:
        if r.get("id"):
            out.add(str(r["id"]))
    return out


def fetch_linked_hcp_ids(supabase: Client) -> Set[str]:
    """Distinct hcp_id present in hcp_openalex_authors."""
    out: Set[str] = set()
    last_id: Optional[str] = None
    while True:
        q = (
            supabase.table("hcp_openalex_authors")
            .select("id,hcp_id")
            .order("id")
            .limit(JOIN_PAGE_SIZE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for r in batch:
            hid = r.get("hcp_id")
            if hid:
                out.add(str(hid))
        last_id = batch[-1].get("id")
        if not last_id or len(batch) < JOIN_PAGE_SIZE:
            break
    return out


def npi_empty(h: Dict[str, Any]) -> bool:
    return not str(h.get("npi_number") or "").strip()


def oa_empty(h: Dict[str, Any]) -> bool:
    return not str(h.get("openalex_author_id") or "").strip()


def is_wipe_candidate(
    h: Dict[str, Any],
    *,
    linked_hcp_ids: Set[str],
    canonical_ids: Set[str],
) -> bool:
    hid = str(h.get("id") or "")
    if not hid:
        return False
    if not npi_empty(h):
        return False
    if not oa_empty(h):
        return False
    if hid in linked_hcp_ids:
        return False
    if hid in canonical_ids:
        return False
    return True


REASON_DEFAULT = "no_npi_no_openalex_id_no_join_row_not_canonical"


def audit_row_from_hcp(h: Dict[str, Any], audit_run_id: str) -> Dict[str, Any]:
    return {
        "hcp_id": str(h["id"]),
        "first_name": h.get("first_name"),
        "last_name": h.get("last_name"),
        "institution": h.get("institution"),
        "city": h.get("city"),
        "state": h.get("state"),
        "country": h.get("country"),
        "source": h.get("source"),
        "created_at_original": h.get("created_at"),
        "reason_for_wipe": REASON_DEFAULT,
        "audit_run_id": audit_run_id,
        "deletion_status": "pending",
    }


def insert_audit_batch(
    supabase: Client,
    rows: List[Dict[str, Any]],
    errors: List[str],
) -> int:
    if not rows:
        return 0
    try:
        supabase.table("wipe_candidates_audit").insert(rows).execute()
        return len(rows)
    except Exception as exc:
        eprint(f"[audit insert batch n={len(rows)}] {exc}")
        nok = 0
        for r in rows:
            try:
                supabase.table("wipe_candidates_audit").insert([r]).execute()
                nok += 1
            except Exception as exc2:
                errors.append(f"audit insert hcp_id={r.get('hcp_id')}: {exc2}")
                eprint("[audit insert]", errors[-1])
        return nok


def fetch_hcps_keyset_page(
    supabase: Client,
    *,
    last_id: Optional[str],
) -> List[Dict[str, Any]]:
    q = supabase.table("hcps").select(HCP_SCAN_COLUMNS).order("id").limit(HCP_PAGE_SIZE)
    if last_id is not None:
        q = q.gt("id", last_id)
    return q.execute().data or []


def diagnose(supabase: Client, errors: List[str]) -> str:
    audit_run_id = str(uuid.uuid4())
    t0 = time.perf_counter()
    print("MODE: diagnose")
    print(f"Audit run ID: {audit_run_id}\n")

    print("Pre-run counts:")
    total = count_total_hcps(supabase)
    with_npi = count_hcps_filtered(supabase, npi_not_null=True)
    with_oa = count_hcps_filtered(supabase, oa_not_null=True)
    print(f"  Total HCPs: {total:,}")
    print(f"  HCPs with npi_number set: {with_npi:,}")
    print(f"  HCPs with openalex_author_id set: {with_oa:,}")

    print("\nLoading canonical_hcps_snapshot ids...")
    canonical_ids = fetch_canonical_ids(supabase)
    print(f"  Canonical HCPs: {len(canonical_ids):,}")

    print("\nLoading distinct hcp_id from hcp_openalex_authors...")
    linked = fetch_linked_hcp_ids(supabase)
    print(f"  HCPs with at least one hcp_openalex_authors row: {len(linked):,}")

    print("\nScanning hcps (keyset) for wipe candidates...")
    last_id: Optional[str] = None
    audit_buf: List[Dict[str, Any]] = []
    written = 0
    scanned = 0
    while True:
        batch = fetch_hcps_keyset_page(supabase, last_id=last_id)
        if not batch:
            break
        scanned += len(batch)
        for h in batch:
            if is_wipe_candidate(h, linked_hcp_ids=linked, canonical_ids=canonical_ids):
                audit_buf.append(audit_row_from_hcp(h, audit_run_id))
                if len(audit_buf) >= AUDIT_INSERT_BATCH:
                    written += insert_audit_batch(supabase, audit_buf, errors)
                    audit_buf = []
                    if written % PROGRESS_DIAGNOSE_EVERY == 0:
                        print(f"  ... audit rows written: {written:,} (scanned {scanned:,} hcps)")
        last_id = str(batch[-1]["id"]) if batch[-1].get("id") else None
        if not last_id or len(batch) < HCP_PAGE_SIZE:
            break

    if audit_buf:
        written += insert_audit_batch(supabase, audit_buf, errors)

    elapsed = time.perf_counter() - t0
    print(f"\nTotal wipe candidates identified: {written:,}")
    print(f"Audit run ID: {audit_run_id}")
    if errors:
        print(f"Errors during audit insert: {len(errors)}")
        for e in errors[:20]:
            print(f"  {e}")
    print("\nNext step: review wipe_candidates_audit then run:")
    print(
        f"  python run_step_d_wipe.py --execute --confirm-irreversible --audit-run-id {audit_run_id}"
    )
    print("\nVerification (diagnose):")
    print(
        "SELECT reason_for_wipe, COUNT(*) FROM wipe_candidates_audit \n"
        f"WHERE audit_run_id = '{audit_run_id}' GROUP BY reason_for_wipe;\n"
    )
    print("=" * 72)
    print(f"Runtime: {elapsed:.1f}s | Tables affected: wipe_candidates_audit (inserts)")
    print("=" * 72)
    return audit_run_id


def count_pending_for_run(supabase: Client, audit_run_id: str) -> int:
    r = (
        supabase.table("wipe_candidates_audit")
        .select("hcp_id", count="exact", head=True)
        .eq("audit_run_id", audit_run_id)
        .eq("deletion_status", "pending")
        .execute()
    )
    return int(r.count or 0)


def fetch_pending_hcp_ids(supabase: Client, audit_run_id: str) -> List[str]:
    out: List[str] = []
    last_h: Optional[str] = None
    page = 1000
    while True:
        q = (
            supabase.table("wipe_candidates_audit")
            .select("hcp_id")
            .eq("audit_run_id", audit_run_id)
            .eq("deletion_status", "pending")
            .order("hcp_id")
            .limit(page)
        )
        if last_h is not None:
            q = q.gt("hcp_id", last_h)
        batch = q.execute().data or []
        if not batch:
            break
        for r in batch:
            if r.get("hcp_id"):
                out.append(str(r["hcp_id"]))
        last_h = batch[-1].get("hcp_id")
        if not last_h or len(batch) < page:
            break
    return out


def latest_pending_audit_run_id(supabase: Client) -> Optional[str]:
    """Most recent audit_run_id among rows with deletion_status=pending (by max audited_at per run)."""
    rows = (
        supabase.table("wipe_candidates_audit")
        .select("audit_run_id,audited_at")
        .eq("deletion_status", "pending")
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    max_ts_by_run: Dict[str, str] = {}
    for r in rows:
        rid = str(r.get("audit_run_id") or "")
        if not rid:
            continue
        ts = str(r.get("audited_at") or "")
        if rid not in max_ts_by_run or ts > max_ts_by_run[rid]:
            max_ts_by_run[rid] = ts
    return max(max_ts_by_run.items(), key=lambda kv: kv[1])[0]


def verify_no_canonical_in_wipe(supabase: Client, wipe_ids: Set[str]) -> Tuple[bool, Set[str]]:
    overlap: Set[str] = set()
    if not wipe_ids:
        return True, overlap
    canonical = fetch_canonical_ids(supabase)
    overlap = wipe_ids & canonical
    return len(overlap) == 0, overlap


def is_statement_timeout(exc: BaseException) -> bool:
    text = str(exc).lower()
    return (
        "57014" in text
        or "statement timeout" in text
        or "canceling statement due to statement timeout" in text
    )


def delete_npi_proposals_for_hcps(
    supabase: Client,
    hcp_ids: Sequence[str],
    *,
    sleep_seconds: float,
    errors: List[str],
) -> int:
    """Delete npi_match_proposals in chunks of NPI_PROPOSAL_DELETE_BATCH. On statement timeout, exit."""
    deleted = 0
    ids = list(hcp_ids)
    for i in range(0, len(ids), NPI_PROPOSAL_DELETE_BATCH):
        chunk = ids[i : i + NPI_PROPOSAL_DELETE_BATCH]
        try:
            supabase.table("npi_match_proposals").delete().in_("hcp_id", chunk).execute()
            deleted += len(chunk)
        except Exception as exc:
            if is_statement_timeout(exc):
                eprint(
                    f"\nFATAL: npi_match_proposals delete timed out (statement timeout) on batch "
                    f"starting at index {i} (batch size {NPI_PROPOSAL_DELETE_BATCH}).\n"
                    "Do not continue: partial deletes may have occurred. Re-run with a smaller "
                    "NPI batch (edit NPI_PROPOSAL_DELETE_BATCH in run_step_d_wipe.py) or increase "
                    "the database statement_timeout.\n"
                    f"Original error: {exc}"
                )
                raise SystemExit(2) from exc
            msg = f"npi_match_proposals delete batch starting {i}: {exc}"
            errors.append(msg)
            eprint("[execute]", msg)
            for hid in chunk:
                try:
                    supabase.table("npi_match_proposals").delete().eq("hcp_id", hid).execute()
                    deleted += 1
                except Exception as exc2:
                    if is_statement_timeout(exc2):
                        eprint(
                            f"\nFATAL: npi_match_proposals delete timed out on hcp_id={hid}.\n"
                            "Re-run with smaller batches or higher statement_timeout.\n"
                            f"Original error: {exc2}"
                        )
                        raise SystemExit(2) from exc2
                    errors.append(f"npi_match_proposals hcp_id={hid}: {exc2}")
                    eprint("[execute]", errors[-1])
                    raise
        if sleep_seconds > 0 and i + NPI_PROPOSAL_DELETE_BATCH < len(ids):
            time.sleep(sleep_seconds)
        ts = datetime.now().strftime("%H:%M:%S")
        done = min(i + len(chunk), len(ids))
        print(f"[{ts}] npi_match_proposals: deleted through {done:,} / {len(ids):,} hcp_id(s) in batch(es)")
    return deleted


def delete_hcps_batches(
    supabase: Client,
    hcp_ids: Sequence[str],
    *,
    batch_size: int,
    sleep_seconds: float,
    errors: List[str],
) -> int:
    deleted = 0
    ids = list(hcp_ids)
    n_batches = (len(ids) + batch_size - 1) // batch_size if ids else 0
    batch_num = 0
    for i in range(0, len(ids), batch_size):
        batch_num += 1
        chunk = ids[i : i + batch_size]
        try:
            supabase.table("hcps").delete().in_("id", chunk).execute()
            deleted += len(chunk)
        except Exception as exc:
            if is_statement_timeout(exc):
                eprint(
                    f"\nFATAL: hcps delete timed out (statement timeout) on batch {batch_num}/{n_batches} "
                    f"(starting index {i}, batch size {len(chunk)}).\n"
                    "Stopped without row-by-row fallback. If npi_match_proposals deletes already committed, "
                    "reconcile DB state before re-running.\n"
                    "Re-run with --batch-size smaller than "
                    f"{batch_size} (e.g. 25) and/or increase statement_timeout.\n"
                    f"Original error: {exc}"
                )
                raise SystemExit(2) from exc
            msg = f"hcps delete batch starting {i}: {exc}"
            errors.append(msg)
            eprint("[execute]", msg)
            for hid in chunk:
                try:
                    supabase.table("hcps").delete().eq("id", hid).execute()
                    deleted += 1
                except Exception as exc2:
                    if is_statement_timeout(exc2):
                        eprint(
                            f"\nFATAL: hcps delete timed out on id={hid}.\n"
                            f"Re-run with smaller --batch-size.\nOriginal error: {exc2}"
                        )
                        raise SystemExit(2) from exc2
                    errors.append(f"hcps id={hid}: {exc2}")
                    eprint("[execute]", errors[-1])
                    raise
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] hcps: batch {batch_num}/{n_batches} | deleted so far {deleted:,} / {len(ids):,}")
        if sleep_seconds > 0 and i + batch_size < len(ids):
            time.sleep(sleep_seconds)
    return deleted


def mark_audit_deleted(
    supabase: Client,
    audit_run_id: str,
    hcp_ids: Sequence[str],
    *,
    batch_size: int,
    status: str,
    sleep_seconds: float,
    errors: List[str],
) -> int:
    updated = 0
    ids = list(hcp_ids)
    n_batches = (len(ids) + batch_size - 1) // batch_size if ids else 0
    batch_num = 0
    for i in range(0, len(ids), batch_size):
        batch_num += 1
        chunk = ids[i : i + batch_size]
        try:
            (
                supabase.table("wipe_candidates_audit")
                .update({"deletion_status": status})
                .eq("audit_run_id", audit_run_id)
                .eq("deletion_status", "pending")
                .in_("hcp_id", chunk)
                .execute()
            )
            updated += len(chunk)
        except Exception as exc:
            if is_statement_timeout(exc):
                eprint(
                    f"\nFATAL: wipe_candidates_audit update timed out on batch {batch_num}/{n_batches}.\n"
                    f"Original error: {exc}"
                )
                raise SystemExit(2) from exc
            errors.append(f"audit update batch {i}: {exc}")
            eprint("[execute]", errors[-1])
            raise
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] wipe_candidates_audit: batch {batch_num}/{n_batches} | updated {updated:,} / {len(ids):,}")
        if sleep_seconds > 0 and i + batch_size < len(ids):
            time.sleep(sleep_seconds)
    return updated


def execute_dry_run_psycopg2(
    wipe_ids: List[str],
    audit_run_id: str,
    supabase: Client,
    *,
    hcp_batch_size: int,
    sleep_seconds: float,
    errors: List[str],
) -> Tuple[int, int]:
    """Run deletes in one transaction and ROLLBACK; then COMMIT audit status to dry_run_validated."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL is required for --dry-run-execute (transactional rollback). "
            "Set it in .env or run without --dry-run-execute."
        )
    import psycopg2

    props_deleted = 0
    hcps_deleted = 0
    conn = None
    tx_ok = False
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cur = conn.cursor()
        try:
            ids = list(wipe_ids)
            for i in range(0, len(ids), NPI_PROPOSAL_DELETE_BATCH):
                chunk = ids[i : i + NPI_PROPOSAL_DELETE_BATCH]
                tup = tuple(chunk)
                cur.execute("DELETE FROM npi_match_proposals WHERE hcp_id IN %s", (tup,))
                props_deleted += cur.rowcount or 0
                ts = datetime.now().strftime("%H:%M:%S")
                done = min(i + len(chunk), len(ids))
                print(f"[{ts}] (tx) npi_match_proposals through {done:,} / {len(ids):,}")
                if sleep_seconds > 0 and i + NPI_PROPOSAL_DELETE_BATCH < len(ids):
                    time.sleep(sleep_seconds)
            n_h = (len(ids) + hcp_batch_size - 1) // hcp_batch_size if ids else 0
            hb = 0
            for i in range(0, len(ids), hcp_batch_size):
                hb += 1
                chunk = ids[i : i + hcp_batch_size]
                tup = tuple(chunk)
                cur.execute("DELETE FROM hcps WHERE id IN %s", (tup,))
                hcps_deleted += cur.rowcount or 0
                ts = datetime.now().strftime("%H:%M:%S")
                done = min(i + len(chunk), len(ids))
                print(f"[{ts}] (tx) hcps batch {hb}/{n_h} through {done:,} / {len(ids):,} (will rollback)")
                if sleep_seconds > 0 and i + hcp_batch_size < len(ids):
                    time.sleep(sleep_seconds)
            tx_ok = True
        finally:
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                cur.close()
            except Exception:
                pass
    except Exception as exc:
        if is_statement_timeout(exc):
            eprint(
                f"\nFATAL: --dry-run-execute transaction timed out inside PostgreSQL.\n"
                "Transaction was rolled back. Re-run with smaller --batch-size or "
                "edit NPI_PROPOSAL_DELETE_BATCH.\n"
                f"Original error: {exc}"
            )
            raise SystemExit(2) from exc
        raise
    finally:
        try:
            if conn and not conn.closed:
                conn.close()
        except Exception:
            pass

    if tx_ok:
        mark_audit_deleted(
            supabase,
            audit_run_id,
            wipe_ids,
            batch_size=hcp_batch_size,
            status="dry_run_validated",
            sleep_seconds=sleep_seconds,
            errors=errors,
        )
    return props_deleted, hcps_deleted


def execute_live(
    supabase: Client,
    wipe_ids: List[str],
    audit_run_id: str,
    *,
    batch_size: int,
    sleep_seconds: float,
    errors: List[str],
) -> Tuple[int, int]:
    props = delete_npi_proposals_for_hcps(supabase, wipe_ids, sleep_seconds=sleep_seconds, errors=errors)
    hcps_n = delete_hcps_batches(
        supabase,
        wipe_ids,
        batch_size=batch_size,
        sleep_seconds=sleep_seconds,
        errors=errors,
    )
    mark_audit_deleted(
        supabase,
        audit_run_id,
        wipe_ids,
        batch_size=batch_size,
        status="deleted",
        sleep_seconds=sleep_seconds,
        errors=errors,
    )
    return props, hcps_n


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Step D: audit and optionally delete unlinked HCPs (no NPI, no OA, no join, not canonical).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--diagnose",
        action="store_true",
        help="Phase 1: find candidates and write wipe_candidates_audit only (default if --execute not set)",
    )
    p.add_argument(
        "--execute",
        action="store_true",
        help="Phase 2: delete from npi_match_proposals then hcps for an audit run",
    )
    p.add_argument(
        "--confirm-irreversible",
        action="store_true",
        help="Required with --execute (except ignored when combined with diagnose-only)",
    )
    p.add_argument("--audit-run-id", type=str, default=None, metavar="ID", help="Audit run to execute (default: latest pending)")
    p.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="hcps delete and wipe_candidates_audit update batch size (default 50)",
    )
    p.add_argument(
        "--sleep-between-batches",
        type=float,
        default=0.2,
        metavar="SEC",
        help="Seconds to sleep between delete/update batches (default 0.2)",
    )
    p.add_argument(
        "--dry-run-execute",
        action="store_true",
        help="With --execute: run deletes inside a DB transaction then ROLLBACK; set audit to dry_run_validated (needs DATABASE_URL)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if args.batch_size < 1:
        raise SystemExit("--batch-size must be >= 1")
    if args.sleep_between_batches < 0:
        raise SystemExit("--sleep-between-batches must be >= 0")
    if args.execute and args.diagnose:
        raise SystemExit("Use either --execute or --diagnose, not both.")
    if args.execute and not args.confirm_irreversible:
        raise SystemExit("--execute requires --confirm-irreversible")
    if args.dry_run_execute and not args.execute:
        raise SystemExit("--dry-run-execute requires --execute")

    load_dotenv()
    supabase = init_supabase()

    if not table_exists(supabase, "wipe_candidates_audit"):
        eprint("Table wipe_candidates_audit does not exist or is not accessible.")
        eprint("Create it in the Supabase SQL editor, then re-run:\n")
        print(DDL_HINT.strip())
        raise SystemExit(1)

    errors: List[str] = []
    t0 = time.perf_counter()

    if args.execute:
        if not table_exists(supabase, "npi_match_proposals"):
            eprint("npi_match_proposals not accessible; cannot run --execute.")
            raise SystemExit(1)
        if not table_exists(supabase, "hcp_openalex_authors"):
            eprint("hcp_openalex_authors not accessible.")
            raise SystemExit(1)

        audit_run_id = args.audit_run_id or latest_pending_audit_run_id(supabase)
        if not audit_run_id:
            raise SystemExit("No pending audit run found. Run --diagnose first or pass --audit-run-id.")

        pending_count = count_pending_for_run(supabase, audit_run_id)
        if pending_count == 0:
            raise SystemExit(f"No pending rows for audit_run_id={audit_run_id!r}")

        wipe_ids = list(dict.fromkeys(fetch_pending_hcp_ids(supabase, audit_run_id)))
        if len(wipe_ids) != pending_count:
            eprint(
                f"Note: pending audit rows={pending_count} vs distinct hcp_id={len(wipe_ids)} "
                "(duplicates in audit collapsed for deletes)."
            )

        wipe_set = set(wipe_ids)
        ok_canon, bad = verify_no_canonical_in_wipe(supabase, wipe_set)
        if not ok_canon:
            raise SystemExit(f"Defensive check failed: canonical ids overlap wipe list: {list(bad)[:20]}")

        print("\n" + "=" * 72)
        print("EXECUTE - CONFIRMATION")
        print("=" * 72)
        mode = "dry-run-execute" if args.dry_run_execute else "execute"
        print(f"Mode: {mode}")
        print(f"Audit run ID: {audit_run_id}")
        print(f"HCPs to delete: {len(wipe_ids):,}")
        print("This is irreversible (or will be rolled back for dry-run-execute).")
        print(f"Type the audit_run_id exactly to confirm: ", end="", flush=True)
        line = sys.stdin.readline()
        if not line:
            raise SystemExit("Aborted (no input).")
        if line.strip() != audit_run_id:
            raise SystemExit("Confirmation text did not match audit_run_id. ABORT.")

        print(
            f"\nBatch settings: hcps + audit updates use --batch-size={args.batch_size}; "
            f"npi_match_proposals uses fixed chunks of {NPI_PROPOSAL_DELETE_BATCH}; "
            f"sleep {args.sleep_between_batches}s between batches.\n"
        )

        audit_pending = count_pending_for_run(supabase, audit_run_id)
        if audit_pending < len(wipe_ids):
            raise SystemExit(f"Inconsistent audit state: pending rows {audit_pending} < distinct ids {len(wipe_ids)}")

        if args.dry_run_execute:
            props, hcps_n = execute_dry_run_psycopg2(
                wipe_ids,
                audit_run_id,
                supabase,
                hcp_batch_size=args.batch_size,
                sleep_seconds=args.sleep_between_batches,
                errors=errors,
            )
            final_total = count_total_hcps(supabase)
            elapsed = time.perf_counter() - t0
            print(f"\nDry-run-execute: deletes rolled back (tx rowcounts: npi_proposals={props:,}, hcps={hcps_n:,}).")
            print(f"Audit rows marked dry_run_validated: {len(wipe_ids):,}")
            print(f"Final HCP count (unchanged): {final_total:,}")
            print("\nVerification (execute / dry-run):")
            print("SELECT COUNT(*) FROM hcps;\n")
            print(
                "SELECT COUNT(*) FROM wipe_candidates_audit \n"
                f"WHERE audit_run_id = '{audit_run_id}' AND deletion_status = 'dry_run_validated';\n"
            )
        else:
            props, hcps_n = execute_live(
                supabase,
                wipe_ids,
                audit_run_id,
                batch_size=args.batch_size,
                sleep_seconds=args.sleep_between_batches,
                errors=errors,
            )
            final_total = count_total_hcps(supabase)
            elapsed = time.perf_counter() - t0
            print(f"\nHCPs deleted: {hcps_n:,}")
            print(f"npi_match_proposals deletes attempted (batch units): {props:,}")
            print(f"Final HCP count: {final_total:,}")
            print("\nVerification (execute):")
            print("SELECT COUNT(*) FROM hcps;\n")
            print(
                "SELECT COUNT(*) FROM wipe_candidates_audit \n"
                f"WHERE audit_run_id = '{audit_run_id}' AND deletion_status = 'deleted';\n"
            )

        print("=" * 72)
        print(f"Runtime: {elapsed:.1f}s | Errors logged: {len(errors)}")
        print("Tables affected: npi_match_proposals, hcps, wipe_candidates_audit")
        if errors:
            for e in errors[:30]:
                print(f"  {e}")
        return

    # Default + explicit --diagnose
    diagnose(supabase, errors)
    elapsed = time.perf_counter() - t0
    if errors:
        print(f"\nDiagnose completed with {len(errors)} error(s).")


if __name__ == "__main__":
    main()
