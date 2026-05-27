"""
FieldMark v2.0 — OpenAlex Author Metrics Enrichment

Fetches per-author metrics (cited_by_count, h_index, i10_index, works_count,
counts_by_year, 2yr_mean_citedness) from the OpenAlex authors API for every
HCP linked via hcp_openalex_authors_v2.

Writes time-stamped snapshots to hcp_author_metrics_v2.
Idempotent on (hcp_id, snapshot_date). Re-runs on the same day skip already-fetched
HCPs; runs on a different day write new snapshots.

Required environment variables:
- SUPABASE_URL
- SUPABASE_KEY
- OPENALEX_API_KEY  (also used in the polite pool mailto)

Usage:
    python openalex_author_enrichment.py                  # full run
    python openalex_author_enrichment.py --dry-run        # preview, no DB writes
    python openalex_author_enrichment.py --limit 1000     # first 1K HCPs only
    python openalex_author_enrichment.py --resume         # skip rows already snapshotted today
    python openalex_author_enrichment.py --batch-size 100 # tune throughput
"""
from __future__ import annotations

import argparse
import os
import signal
import sys
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from supabase import Client, create_client


# ============================================================
# Config
# ============================================================

OPENALEX_BASE = "https://api.openalex.org"
DEFAULT_BATCH_SIZE = 200            # Supabase upsert batch size
REQUEST_TIMEOUT = 30                # seconds
MAX_RETRIES = 4                     # per HCP, with exponential backoff
RETRY_BACKOFF_BASE = 2.0            # 2, 4, 8, 16 seconds
PROGRESS_INTERVAL = 1000            # print progress every N HCPs
RATE_WINDOW = 200                   # rolling average window for rate / ETA

POLITE_POOL_EMAIL = "garrett@fieldmark.local"   # used in mailto for polite pool


# ============================================================
# Globals (set in main)
# ============================================================

INTERRUPTED = False


def install_signal_handler() -> None:
    def _handle(signum, frame):
        global INTERRUPTED
        INTERRUPTED = True
        print("\n[openalex_enrich] interrupt received; will flush and exit at next batch boundary")
    signal.signal(signal.SIGINT, _handle)


# ============================================================
# Data types
# ============================================================

@dataclass
class LinkRow:
    hcp_id: str
    openalex_author_id: str  # full URL form, e.g. https://openalex.org/A5003437583


@dataclass
class MetricsRow:
    hcp_id: str
    openalex_author_id: str
    snapshot_date: str
    cited_by_count: Optional[int]
    works_count: Optional[int]
    h_index: Optional[int]
    i10_index: Optional[int]
    counts_by_year: Optional[List[Dict[str, Any]]]
    two_yr_mean_citedness: Optional[float]
    enrichment_run_id: str
    fetch_status: Optional[str]
    fetch_error: Optional[str]


@dataclass
class RunStats:
    total_input: int = 0
    fetched_ok: int = 0
    fetched_not_found: int = 0
    fetched_error: int = 0
    skipped_already_done: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    recent_durations: deque = field(default_factory=lambda: deque(maxlen=RATE_WINDOW))


# ============================================================
# OpenAlex client
# ============================================================

def author_id_to_slug(full_id: str) -> str:
    """Convert 'https://openalex.org/A5003437583' to 'A5003437583'."""
    return full_id.rsplit("/", 1)[-1]


def fetch_author(openalex_author_id: str, api_key: str, mailto: str) -> Dict[str, Any]:
    """
    Fetch one OpenAlex author by ID. Returns the parsed JSON dict.

    Raises:
        requests.HTTPError on non-2xx after retries
        ValueError on 404 (caller maps to fetch_status='not_found')
    """
    slug = author_id_to_slug(openalex_author_id)
    url = f"{OPENALEX_BASE}/authors/{slug}"
    params = {"api_key": api_key, "mailto": mailto}

    last_error: Optional[Exception] = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 404:
                raise ValueError(f"author_not_found:{slug}")
            if resp.status_code == 429:
                # Rate limited; back off harder
                backoff = RETRY_BACKOFF_BASE ** (attempt + 1)
                time.sleep(backoff)
                continue
            resp.raise_for_status()
            return resp.json()
        except ValueError:
            raise
        except (requests.RequestException, requests.HTTPError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BACKOFF_BASE ** attempt)
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("unexpected exit from fetch_author retry loop")


def parse_author_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract the metrics fields from an OpenAlex author response.
    All fields are nullable — OpenAlex returns null/missing for sparse authors.
    """
    summary_stats = payload.get("summary_stats") or {}
    return {
        "cited_by_count": payload.get("cited_by_count"),
        "works_count": payload.get("works_count"),
        "h_index": summary_stats.get("h_index"),
        "i10_index": summary_stats.get("i10_index"),
        "two_yr_mean_citedness": summary_stats.get("2yr_mean_citedness"),
        "counts_by_year": payload.get("counts_by_year"),
    }


# ============================================================
# Supabase operations
# ============================================================

def load_link_rows(client: Client, limit: Optional[int], offset: int) -> List[LinkRow]:
    """
    Load (hcp_id, openalex_author_id) pairs from hcp_openalex_authors_v2.
    Only is_primary=true links are fetched (one author per HCP at a time).
    Paginated via Supabase range() because the table has 239K rows.
    """
    page_size = 1000
    out: List[LinkRow] = []
    fetched = 0
    cur = offset

    while True:
        if limit is not None and fetched >= limit:
            break
        end = cur + page_size - 1
        q = (
            client.table("hcp_openalex_authors_v2")
            .select("hcp_id, openalex_author_id")
            .eq("is_primary", True)
            .order("hcp_id")
            .range(cur, end)
        )
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break
        for r in rows:
            if limit is not None and fetched >= limit:
                break
            out.append(LinkRow(hcp_id=r["hcp_id"], openalex_author_id=r["openalex_author_id"]))
            fetched += 1
        if len(rows) < page_size:
            break
        cur += page_size

    return out


def load_done_today(client: Client, today: str) -> set:
    """
    For --resume: return the set of hcp_ids that already have a row in
    hcp_author_metrics_v2 for today's snapshot_date.
    """
    out: set = set()
    page_size = 1000
    cur = 0
    while True:
        end = cur + page_size - 1
        q = (
            client.table("hcp_author_metrics_v2")
            .select("hcp_id")
            .eq("snapshot_date", today)
            .range(cur, end)
        )
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break
        for r in rows:
            out.add(r["hcp_id"])
        if len(rows) < page_size:
            break
        cur += page_size
    return out


def upsert_batch(client: Client, rows: List[MetricsRow], dry_run: bool) -> None:
    if not rows:
        return
    if dry_run:
        print(f"[openalex_enrich] [DRY RUN] would upsert {len(rows)} rows")
        return
    payload = []
    for r in rows:
        payload.append({
            "hcp_id": r.hcp_id,
            "openalex_author_id": r.openalex_author_id,
            "snapshot_date": r.snapshot_date,
            "cited_by_count": r.cited_by_count,
            "works_count": r.works_count,
            "h_index": r.h_index,
            "i10_index": r.i10_index,
            "counts_by_year": r.counts_by_year,
            "two_yr_mean_citedness": r.two_yr_mean_citedness,
            "enrichment_run_id": r.enrichment_run_id,
            "fetch_status": r.fetch_status,
            "fetch_error": r.fetch_error,
        })
    client.table("hcp_author_metrics_v2").upsert(
        payload,
        on_conflict="hcp_id,snapshot_date",
    ).execute()


# ============================================================
# Main loop
# ============================================================

def run(args: argparse.Namespace) -> int:
    install_signal_handler()
    load_dotenv()

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    openalex_key = os.environ.get("OPENALEX_API_KEY")

    if not supabase_url or not supabase_key:
        print("[openalex_enrich] ERROR: SUPABASE_URL or SUPABASE_KEY not set in environment.")
        return 2
    if not openalex_key:
        print("[openalex_enrich] ERROR: OPENALEX_API_KEY not set in environment.")
        return 2

    client = create_client(supabase_url, supabase_key)
    enrichment_run_id = str(uuid.uuid4())
    today = date.today().isoformat()

    print(f"[openalex_enrich] enrichment_run_id={enrichment_run_id}")
    print(f"[openalex_enrich] snapshot_date={today}")
    print(f"[openalex_enrich] dry_run={args.dry_run} resume={args.resume} limit={args.limit} offset={args.offset}")

    print("[openalex_enrich] loading link rows from hcp_openalex_authors_v2 ...")
    links = load_link_rows(client, args.limit, args.offset)
    print(f"[openalex_enrich] loaded {len(links)} link rows")

    done_today: set = set()
    if args.resume:
        print("[openalex_enrich] loading already-done HCPs for today (--resume) ...")
        done_today = load_done_today(client, today)
        print(f"[openalex_enrich] {len(done_today)} HCPs already snapshotted today; will skip")

    stats = RunStats(total_input=len(links))
    pending: List[MetricsRow] = []

    for idx, link in enumerate(links, start=1):
        if INTERRUPTED:
            print("[openalex_enrich] interrupt acknowledged; flushing in-flight batch")
            break

        if link.hcp_id in done_today:
            stats.skipped_already_done += 1
            continue

        t0 = time.monotonic()
        fetch_status: Optional[str] = None
        fetch_error: Optional[str] = None
        parsed: Dict[str, Any] = {
            "cited_by_count": None,
            "works_count": None,
            "h_index": None,
            "i10_index": None,
            "two_yr_mean_citedness": None,
            "counts_by_year": None,
        }

        try:
            payload = fetch_author(link.openalex_author_id, openalex_key, POLITE_POOL_EMAIL)
            parsed = parse_author_payload(payload)
            stats.fetched_ok += 1
        except ValueError as ve:
            fetch_status = "not_found"
            fetch_error = str(ve)
            stats.fetched_not_found += 1
        except Exception as exc:
            fetch_status = "error"
            fetch_error = f"{type(exc).__name__}: {exc}"[:500]
            stats.fetched_error += 1

        stats.recent_durations.append(time.monotonic() - t0)

        pending.append(MetricsRow(
            hcp_id=link.hcp_id,
            openalex_author_id=link.openalex_author_id,
            snapshot_date=today,
            cited_by_count=parsed["cited_by_count"],
            works_count=parsed["works_count"],
            h_index=parsed["h_index"],
            i10_index=parsed["i10_index"],
            counts_by_year=parsed["counts_by_year"],
            two_yr_mean_citedness=parsed["two_yr_mean_citedness"],
            enrichment_run_id=enrichment_run_id,
            fetch_status=fetch_status,
            fetch_error=fetch_error,
        ))

        if len(pending) >= args.batch_size:
            upsert_batch(client, pending, args.dry_run)
            pending = []

        if idx % PROGRESS_INTERVAL == 0:
            if stats.recent_durations:
                avg = sum(stats.recent_durations) / len(stats.recent_durations)
                remaining = len(links) - idx
                eta_seconds = avg * remaining
                eta_min = eta_seconds / 60.0
                print(
                    f"[openalex_enrich] {idx}/{len(links)} | "
                    f"ok={stats.fetched_ok} 404={stats.fetched_not_found} err={stats.fetched_error} skip={stats.skipped_already_done} | "
                    f"avg={avg*1000:.0f}ms/req eta={eta_min:.1f}min"
                )

    # Final flush
    if pending:
        upsert_batch(client, pending, args.dry_run)

    elapsed = (datetime.now(timezone.utc) - stats.started_at).total_seconds()
    print("[openalex_enrich] complete.")
    print(f"[openalex_enrich] total_input={stats.total_input}")
    print(f"[openalex_enrich] fetched_ok={stats.fetched_ok}")
    print(f"[openalex_enrich] fetched_not_found={stats.fetched_not_found}")
    print(f"[openalex_enrich] fetched_error={stats.fetched_error}")
    print(f"[openalex_enrich] skipped_already_done={stats.skipped_already_done}")
    print(f"[openalex_enrich] elapsed={elapsed/60:.1f}min ({elapsed:.0f}s)")
    print(f"[openalex_enrich] enrichment_run_id={enrichment_run_id}")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="OpenAlex author metrics enrichment (v2)")
    p.add_argument("--dry-run", action="store_true", help="Do not write to Supabase.")
    p.add_argument("--limit", type=int, default=None, help="Only process the first N link rows.")
    p.add_argument("--offset", type=int, default=0, help="Skip the first N link rows.")
    p.add_argument("--resume", action="store_true", help="Skip HCPs already snapshotted today.")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Supabase upsert batch size.")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(run(parse_args()))
