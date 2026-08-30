"""
FieldMark v2.0 — OpenAlex Author Metrics Enrichment

Fetches per-author metrics (cited_by_count, h_index, i10_index, works_count,
counts_by_year, 2yr_mean_citedness) from the OpenAlex authors API for every
HCP linked via hcp_openalex_authors_v2.

Writes time-stamped snapshots to hcp_author_metrics_v2.
Idempotent on (hcp_id, snapshot_date). Re-runs on the same day skip already-fetched
HCPs; runs on a different day write new snapshots.

FETCH MODE: BATCHED (2026-08-25). Authors are fetched ~50 at a time via the list
form /authors?filter=openalex_id:A1|A2|..., not one HTTP call per author. This is
a BILLED List operation (1 credit per request, $0.0001) where the singleton form
was free, but it collapses ~192k requests into ~3.9k -- and, more importantly,
drops the request rate from ~9/s (throttling territory) to ~1/s.

WRITE CONTRACT -- a row is a claim about what OpenAlex said:
  * id present in a 200 response  -> full metrics row
  * id absent from a 200 response -> fetch_status='not_found' (PROVEN absent)
  * request never answered        -> NO ROW AT ALL; the id stays missing at this
                                     snapshot_date and --resume retries it.
The pre-batching code wrote fetch_status='error' rows with counts_by_year=None on
any exception, and --resume (which had no status filter) then skipped them
forever. Both halves of that trap are fixed.

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
import threading
import time
import uuid
from collections import deque
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client


# ============================================================
# Config
# ============================================================

OPENALEX_BASE = "https://api.openalex.org"
DEFAULT_BATCH_SIZE = 200            # Supabase upsert batch size
DEFAULT_WORKERS = 2                 # concurrent fetch workers (batched: 2 is ample)
REQUEST_TIMEOUT = 60                # seconds (a 50-id OR filter is slower than a singleton)
MAX_RETRIES = 4                     # per request, with exponential backoff
RETRY_BACKOFF_BASE = 2.0            # 2, 4, 8, 16 seconds
PROGRESS_INTERVAL = 1000            # print progress every N link rows
RATE_WINDOW = 200                   # rolling average window for rate / ETA

# --- Batched author fetch -------------------------------------------------
# The /authors/{id} singleton form is free and unlimited but costs one HTTP
# round-trip per author (~192k for a first build). The list form
#   /authors?filter=openalex_id:A1|A2|...
# is a BILLED List operation (1 credit per REQUEST regardless of id count,
# $0.0001 each) and collapses 50 authors into one call. Measured 2026-08-25:
#   n=5..50 all HTTP 200; n=60 works but ~9s; 50 ids ~2.4s.
#   A 50-id filter 504'd once with reason="query_timeout" ("You were not
#   charged for this request") -- transient, not a hard ceiling. Hence
#   split-and-retry rather than a lower fixed chunk size.
AUTHOR_CHUNK_SIZE = 50              # ids per list request (OpenAlex documented OR max)
OPENALEX_PER_PAGE_MAX = 200         # API ceiling for per-page
MAX_SINGLE_RETRIES = 3              # extra attempts once a chunk is down to one id

POLITE_POOL_EMAIL = "garrett@fieldmark.local"   # used in mailto for polite pool


# ============================================================
# Data quality / conflation detection thresholds
# ============================================================
# OpenAlex author disambiguation can over-aggregate (multiple distinct humans
# merged into one author entity, especially for common Chinese/Indian names).
# We use two independent plausibility checks, computed from OpenAlex's own
# data but applying human-output constraints.

# Check 1: pubs-per-year heuristic.
# The most productive human researchers sustain ~30-40 pubs/year. Anything
# above 40 sustained over a long career strongly suggests entity aggregation.
PUBS_PER_YEAR_THRESHOLD = 40.0
PUBS_PER_YEAR_MIN_CAREER = 10        # Only apply if career span is at least 10 years
PUBS_PER_YEAR_MIN_WORKS = 500        # Only apply if works_count is meaningful

# Check 2: h-index disproportionality.
# h-index > 150 with works_count > 2000 is essentially impossible for one
# human — combined they indicate aggregation of multiple researchers' careers.
H_INDEX_DISPROPORTION_H = 150
H_INDEX_DISPROPORTION_WORKS = 2000


# ============================================================
# Globals (set in main)
# ============================================================

INTERRUPTED = False


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


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
    total_career_pubs: Optional[int] = None


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
    data_quality_flags: Optional[Dict[str, Any]] = None


@dataclass
class RunStats:
    total_input: int = 0
    fetched_ok: int = 0
    fetched_not_found: int = 0
    fetched_error: int = 0
    flagged_disambiguation_suspect: int = 0
    skipped_already_done: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    recent_durations: deque = field(default_factory=lambda: deque(maxlen=RATE_WINDOW))


# ============================================================
# OpenAlex client
# ============================================================

def author_id_to_slug(full_id: str) -> str:
    """Convert 'https://openalex.org/A5003437583' to 'A5003437583'."""
    return full_id.rsplit("/", 1)[-1]


class ChunkFetchError(Exception):
    """A list request did not yield a trustworthy answer for its ids.

    Raised for non-2xx, connection failures, and the meta.count/len(results)
    mismatch. The caller splits the chunk and retries; NOTHING is ever written
    on the strength of a chunk that raised this -- an unanswered request says
    nothing about any id in it.
    """


def _sleep_for_retry(resp: Optional[requests.Response], attempt: int) -> None:
    """Honour Retry-After when the server sends one; else exponential backoff.

    Blind 2/4/8/16 both over-waits when the server asks for less and
    under-waits when it asks for more. OpenAlex exposes Retry-After
    (see access-control-expose-headers).
    """
    if resp is not None:
        raw = resp.headers.get("Retry-After")
        if raw:
            try:
                # Retry-After is delta-seconds in every OpenAlex response seen.
                wait = float(raw)
                if wait >= 0:
                    time.sleep(min(wait, 120.0))
                    return
            except (TypeError, ValueError):
                pass  # http-date form -> fall through to backoff
    time.sleep(RETRY_BACKOFF_BASE ** attempt)


def fetch_authors_batch(
    author_ids: List[str], api_key: str, mailto: str
) -> Tuple[Dict[str, Dict[str, Any]], Optional[str]]:
    """Fetch up to AUTHOR_CHUNK_SIZE authors in ONE list request.

    Returns ({short_id: payload}, x_ratelimit_remaining). Ids absent from the
    returned mapping were absent from a 200 response -- i.e. genuinely not
    found (verified 2026-08-25: a bogus id is silently omitted and meta.count
    drops, with no error).

    Raises ChunkFetchError if the request did not produce a trustworthy answer.
    """
    slugs = [author_id_to_slug(a) for a in author_ids]
    # per-page MUST be >= the id count. With the default 25 a 40-id filter
    # returns meta.count=40 but only 25 results -- a silent 37% data loss on a
    # 200 response (measured). The assertion below is the backstop.
    per_page = min(OPENALEX_PER_PAGE_MAX, max(len(slugs), 25))
    params = {
        "filter": "openalex_id:" + "|".join(slugs),
        "per-page": per_page,
        "api_key": api_key,
        "mailto": mailto,
    }

    last_error: Optional[str] = None
    for attempt in range(MAX_RETRIES):
        resp = None
        try:
            resp = requests.get(
                f"{OPENALEX_BASE}/authors", params=params, timeout=REQUEST_TIMEOUT
            )
            if resp.status_code == 429 or resp.status_code >= 500:
                # 504 query_timeout on big OR filters is transient and explicitly
                # uncharged; 429 is throttling. Both retry, then split.
                last_error = f"HTTP {resp.status_code}"
                if attempt < MAX_RETRIES - 1:
                    _sleep_for_retry(resp, attempt)
                    continue
                raise ChunkFetchError(f"{last_error} after {MAX_RETRIES} attempts")
            resp.raise_for_status()
            body = resp.json()
        except ChunkFetchError:
            raise
        except (requests.RequestException, ValueError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt < MAX_RETRIES - 1:
                _sleep_for_retry(resp, attempt)
                continue
            raise ChunkFetchError(last_error) from exc

        results = body.get("results") or []
        meta_count = (body.get("meta") or {}).get("count")

        # Hard failure for this chunk: the response is internally inconsistent,
        # which in practice means pagination silently truncated it.
        if meta_count is not None and meta_count != len(results):
            raise ChunkFetchError(
                f"meta.count={meta_count} != len(results)={len(results)} "
                f"(per_page={per_page}, asked={len(slugs)}) -- truncated response"
            )

        by_id: Dict[str, Dict[str, Any]] = {}
        for item in results:
            raw_id = item.get("id")
            if raw_id:
                by_id[author_id_to_slug(str(raw_id))] = item
        return by_id, resp.headers.get("X-RateLimit-Remaining")

    raise ChunkFetchError(last_error or "unexpected exit from fetch_authors_batch")


def resolve_author_ids(
    author_ids: List[str], api_key: str, mailto: str
) -> Tuple[Dict[str, Dict[str, Any]], Set[str], Set[str], Optional[str]]:
    """Resolve ids to payloads, splitting on failure. NEVER raises.

    Returns (payload_by_short_id, not_found, unresolved, rate_remaining).

      payload_by_short_id : present in a 200 response
      not_found           : PROVEN absent from a 200 response
      unresolved          : we never got a trustworthy answer -> write nothing,
                            leave for the next --resume

    A failing chunk is halved and each half retried, down to single ids. This
    keeps one bad id (or one 504) from condemning its 49 neighbours.
    """
    if not author_ids:
        return {}, set(), set(), None
    try:
        by_id, remaining = fetch_authors_batch(author_ids, api_key, mailto)
        asked = {author_id_to_slug(a) for a in author_ids}
        return by_id, asked - set(by_id.keys()), set(), remaining
    except ChunkFetchError as exc:
        if len(author_ids) == 1:
            slug = author_id_to_slug(author_ids[0])
            for attempt in range(MAX_SINGLE_RETRIES):
                time.sleep(RETRY_BACKOFF_BASE ** attempt)
                try:
                    by_id, remaining = fetch_authors_batch(author_ids, api_key, mailto)
                    return by_id, {slug} - set(by_id.keys()), set(), remaining
                except ChunkFetchError:
                    continue
            eprint(f"[openalex_enrich] unresolved after retries: {slug} ({exc})")
            return {}, set(), {slug}, None

        mid = len(author_ids) // 2
        left = resolve_author_ids(author_ids[:mid], api_key, mailto)
        right = resolve_author_ids(author_ids[mid:], api_key, mailto)
        merged = dict(left[0])
        merged.update(right[0])
        return (
            merged,
            left[1] | right[1],
            left[2] | right[2],
            right[3] or left[3],
        )


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


def compute_data_quality_flags(parsed: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Compute structured data quality flags for a fetched author payload.

    Returns None if no checks failed (no flags needed).
    Returns a dict with conflation_suspected=true and checks_failed list if
    any plausibility check failed.

    Checks are independent of our v2 corpus — they use OpenAlex's own counts_by_year
    and summary_stats and apply human-plausibility constraints.
    """
    works_count = parsed.get("works_count") or 0
    h_index = parsed.get("h_index") or 0
    counts_by_year = parsed.get("counts_by_year") or []

    checks_failed: List[str] = []
    pubs_per_year: Optional[float] = None

    # Check 1: pubs-per-year heuristic
    if works_count >= PUBS_PER_YEAR_MIN_WORKS and len(counts_by_year) > 0:
        # counts_by_year is a list of {year, works_count, cited_by_count} from OpenAlex,
        # covering up to the last ~10 years. We need the full career span though,
        # so we use the year range observed.
        years = [item.get("year") for item in counts_by_year if item.get("year") is not None]
        if years:
            year_min = min(years)
            year_max = max(years)
            career_span = max(1, year_max - year_min + 1)
            if career_span >= PUBS_PER_YEAR_MIN_CAREER:
                pubs_per_year = works_count / career_span
                if pubs_per_year > PUBS_PER_YEAR_THRESHOLD:
                    checks_failed.append("pubs_per_year_excessive")

    # Check 2: h-index disproportionality
    if h_index > H_INDEX_DISPROPORTION_H and works_count > H_INDEX_DISPROPORTION_WORKS:
        checks_failed.append("h_index_disproportionate_to_works")

    if not checks_failed:
        return None

    return {
        "conflation_suspected": True,
        "checks_failed": checks_failed,
        "pubs_per_year": pubs_per_year,
        "h_index": h_index,
        "works_count": works_count,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# Supabase operations
# ============================================================

def resolve_ta_slug(client: Client, slug: str) -> Tuple[str, str]:
    rows = (
        client.table("therapeutic_areas")
        .select("id,name,slug")
        .eq("slug", slug)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError(f"No therapeutic_area found with slug='{slug}'")
    return str(rows[0]["id"]), str(rows[0]["name"])


def fetch_hcp_ids_for_ta(client: Client, ta_id: str) -> Set[str]:
    hcp_ids: Set[str] = set()
    page_size = 1000
    offset = 0
    while True:
        batch = (
            client.table("hcp_therapeutic_areas_v2")
            .select("hcp_id")
            .eq("therapeutic_area_id", ta_id)
            .order("hcp_id")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        for row in batch:
            hid = row.get("hcp_id")
            if hid:
                hcp_ids.add(str(hid))
        if len(batch) < page_size:
            break
        offset += page_size
    return hcp_ids


def _append_link_rows(rows: List[Dict[str, Any]], out: List[LinkRow]) -> None:
    for r in rows:
        hcp_join = r.get("hcps_v2")
        if isinstance(hcp_join, list):
            hcp_join = hcp_join[0] if hcp_join else None
        total_career_pubs = hcp_join.get("total_career_pubs") if hcp_join else None
        out.append(LinkRow(
            hcp_id=r["hcp_id"],
            openalex_author_id=r["openalex_author_id"],
            total_career_pubs=total_career_pubs,
        ))


def load_hcp_ids_from_file(path: str) -> Set[str]:
    """Load hcp_ids (one uuid per line; blank lines and '#' comments ignored)."""
    out: Set[str] = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s and not s.startswith("#"):
                out.add(s)
    return out


def load_link_rows(
    client: Client,
    limit: Optional[int],
    offset: int,
    scoped_hcp_ids: Optional[Set[str]] = None,
) -> List[LinkRow]:
    """
    Load (hcp_id, openalex_author_id, total_career_pubs) tuples.
    total_career_pubs is from hcps_v2 and used downstream for disambiguation
    conflation detection.
    """
    if scoped_hcp_ids is not None:
        out: List[LinkRow] = []
        hcp_list = sorted(scoped_hcp_ids)
        chunk_size = 200
        for i in range(0, len(hcp_list), chunk_size):
            chunk = hcp_list[i : i + chunk_size]
            resp = (
                client.table("hcp_openalex_authors_v2")
                .select("hcp_id, openalex_author_id, hcps_v2!inner(total_career_pubs)")
                .eq("is_primary", True)
                .in_("hcp_id", chunk)
                .order("hcp_id")
                .execute()
            )
            _append_link_rows(resp.data or [], out)
        if offset:
            out = out[offset:]
        if limit is not None:
            out = out[:limit]
        return out

    page_size = 1000
    out = []
    fetched = 0
    cur = offset

    while True:
        if limit is not None and fetched >= limit:
            break
        end = cur + page_size - 1
        q = (
            client.table("hcp_openalex_authors_v2")
            .select("hcp_id, openalex_author_id, hcps_v2!inner(total_career_pubs)")
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
            hcp_join = r.get("hcps_v2")
            # The embedded join may come back as object or single-element list
            if isinstance(hcp_join, list):
                hcp_join = hcp_join[0] if hcp_join else None
            total_career_pubs = hcp_join.get("total_career_pubs") if hcp_join else None
            out.append(LinkRow(
                hcp_id=r["hcp_id"],
                openalex_author_id=r["openalex_author_id"],
                total_career_pubs=total_career_pubs,
            ))
            fetched += 1
        if len(rows) < page_size:
            break
        cur += page_size

    return out


def load_done_for_snapshot(client: Client, snapshot_date: str) -> set:
    """Return hcp_ids that already have a USABLE row for the given snapshot_date.

    fetch_status='error' rows are EXCLUDED. Those are legacy poison rows from
    the pre-batching implementation, which wrote counts_by_year=None on any
    exception; because this query had no status filter, --resume treated them
    as done and never retried them -- a permanent silent gap that 8c then
    reads as "this HCP has no career onset". Excluding them makes every one
    retryable. The batched path no longer writes such rows at all (an
    unanswered request writes nothing), so this filter is purely remedial.
    """
    out: set = set()
    page_size = 1000
    cur = 0
    while True:
        end = cur + page_size - 1
        q = (
            client.table("hcp_author_metrics_v2")
            .select("hcp_id")
            .eq("snapshot_date", snapshot_date)
            .or_("fetch_status.is.null,fetch_status.neq.error")
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


def load_done_today(client: Client, today: str) -> set:
    """
    For --resume: return the set of hcp_ids that already have a row in
    hcp_author_metrics_v2 for today's snapshot_date.
    """
    return load_done_for_snapshot(client, today)


def upsert_batch(client: Client, rows: List[MetricsRow], dry_run: bool) -> None:
    if not rows:
        return
    if dry_run:
        print(f"[openalex_enrich] [DRY RUN] would upsert {len(rows)} rows")
        return
    # Deduplicate by (hcp_id, snapshot_date) keeping highest works_count.
    # ON CONFLICT cannot update the same constrained row twice in one batch;
    # duplicates arise when one hcp_id has multiple OpenAlex profiles (conflation).
    _seen: dict = {}
    for _r in rows:
        _key = (_r.hcp_id, _r.snapshot_date)
        _existing = _seen.get(_key)
        if _existing is None or (_r.works_count or 0) > (_existing.works_count or 0):
            _seen[_key] = _r
    _deduped = list(_seen.values())
    if len(_deduped) < len(rows):
        print(f"[openalex_enrich] dedup: {len(rows)} -> {len(_deduped)} rows (dropped {len(rows) - len(_deduped)} duplicate hcp_id+snapshot)")
    rows = _deduped
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
            "data_quality_flags": r.data_quality_flags,
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
    today = args.snapshot_date if args.snapshot_date else date.today().isoformat()
    try:
        datetime.strptime(today, "%Y-%m-%d")
    except ValueError:
        print(f"[openalex_enrich] ERROR: --snapshot-date must be YYYY-MM-DD, got {today!r}")
        return 2

    print(f"[openalex_enrich] enrichment_run_id={enrichment_run_id}")
    print(f"[openalex_enrich] snapshot_date={today}")
    print(
        f"[openalex_enrich] dry_run={args.dry_run} resume={args.resume} "
        f"missing_only={args.missing_only} limit={args.limit} offset={args.offset}"
    )

    scoped_ta_id: Optional[str] = None
    scoped_ta_name: Optional[str] = None
    scoped_hcp_ids: Optional[Set[str]] = None
    file_hcp_ids: Optional[Set[str]] = None
    if args.hcp_ids_file:
        file_hcp_ids = load_hcp_ids_from_file(args.hcp_ids_file)
        print(
            f"[openalex_enrich] --hcp-ids-file: {len(file_hcp_ids)} hcp_id(s) from {args.hcp_ids_file}"
        )
    if args.ta:
        scoped_ta_id, scoped_ta_name = resolve_ta_slug(client, args.ta)
        ta_hcp_ids = fetch_hcp_ids_for_ta(client, scoped_ta_id)
        print(
            f"[openalex_enrich] TA scope: {scoped_ta_name} "
            f"({len(ta_hcp_ids)} HCPs in hcp_therapeutic_areas_v2)"
        )
        if file_hcp_ids is not None:
            # Both scopes: enrich only HCPs in the TA AND in the file.
            scoped_hcp_ids = ta_hcp_ids & file_hcp_ids
            print(
                f"[openalex_enrich] INTERSECT --ta & --hcp-ids-file: "
                f"{len(scoped_hcp_ids)} HCP(s) in both"
            )
        else:
            scoped_hcp_ids = ta_hcp_ids
    elif file_hcp_ids is not None:
        # File only: exactly these HCPs.
        scoped_hcp_ids = file_hcp_ids

    print("[openalex_enrich] loading link rows from hcp_openalex_authors_v2 ...")
    links = load_link_rows(client, args.limit, args.offset, scoped_hcp_ids=scoped_hcp_ids)

    if args.missing_only:
        print(
            f"[openalex_enrich] loading HCPs already snapshotted for {today} (--missing-only) ..."
        )
        done_snapshot = load_done_for_snapshot(client, today)
        before = len(links)
        links = [link for link in links if link.hcp_id not in done_snapshot]
        print(
            f"[openalex_enrich] --missing-only: {before} candidates -> {len(links)} "
            f"({before - len(links)} already have snapshot_date={today})"
        )

    if args.ta:
        print(
            f"TA-SCOPED author-metrics run: {scoped_ta_name} (ta_id={scoped_ta_id}). "
            f"{len(links)} candidate HCPs (missing_only={args.missing_only})."
        )

    print(f"[openalex_enrich] loaded {len(links)} link rows")

    done_today: set = set()
    if args.resume:
        print("[openalex_enrich] loading already-done HCPs for today (--resume) ...")
        done_today = load_done_today(client, today)
        print(f"[openalex_enrich] {len(done_today)} HCPs already snapshotted today; will skip")

    stats = RunStats(total_input=len(links))
    pending: List[MetricsRow] = []

    # Concurrency setup
    pending_lock = threading.Lock()
    stats_lock = threading.Lock()
    flush_lock = threading.Lock()
    stop_event = threading.Event()

    # Reinstall signal handler to set stop_event in addition to global flag
    def _handle_interrupt(signum, frame):
        global INTERRUPTED
        INTERRUPTED = True
        stop_event.set()
        print("\n[openalex_enrich] interrupt received; workers will finish in-flight requests then exit")
    signal.signal(signal.SIGINT, _handle_interrupt)

    # Shared, lock-guarded view of the API's credit gauge. Only meaningful now
    # that we issue BILLED list requests -- singleton lookups never decremented it.
    rate_remaining: Dict[str, Optional[str]] = {"value": None}
    rate_lock = threading.Lock()

    def fetch_chunk(chunk: List[LinkRow]) -> List[MetricsRow]:
        """Worker: resolve one chunk of link rows in a single list request.

        Returns ONLY rows we have an answer for. Ids the API never answered
        about are omitted entirely -- they stay missing at this snapshot_date
        and the next --resume picks them up.
        """
        t0 = time.monotonic()
        # A chunk is keyed by distinct author id; two link rows may share one.
        distinct_ids = sorted({link.openalex_author_id for link in chunk})
        by_id, not_found, unresolved, remaining = resolve_author_ids(
            distinct_ids, openalex_key, POLITE_POOL_EMAIL
        )

        if remaining is not None:
            with rate_lock:
                rate_remaining["value"] = remaining

        elapsed = time.monotonic() - t0
        with stats_lock:
            # Amortise the request cost across the ids it covered, so the
            # existing per-item ETA arithmetic stays meaningful.
            per_item = elapsed / max(1, len(distinct_ids))
            for _ in distinct_ids:
                stats.recent_durations.append(per_item)

        rows: List[MetricsRow] = []
        for link in chunk:
            slug = author_id_to_slug(link.openalex_author_id)

            if slug in unresolved:
                # No trustworthy answer. Write NOTHING -- a row here would be a
                # claim we cannot support, and --resume would skip it forever.
                with stats_lock:
                    stats.fetched_error += 1
                continue

            if slug in not_found:
                # PROVEN absent from a 200 response: the 404 equivalent.
                with stats_lock:
                    stats.fetched_not_found += 1
                rows.append(MetricsRow(
                    hcp_id=link.hcp_id,
                    openalex_author_id=link.openalex_author_id,
                    snapshot_date=today,
                    cited_by_count=None, works_count=None, h_index=None,
                    i10_index=None, counts_by_year=None, two_yr_mean_citedness=None,
                    enrichment_run_id=enrichment_run_id,
                    fetch_status="not_found",
                    fetch_error=f"author_not_found:{slug}",
                    data_quality_flags=None,
                ))
                continue

            payload = by_id.get(slug)
            if payload is None:
                # Belt and braces: neither resolved, not_found, nor unresolved.
                with stats_lock:
                    stats.fetched_error += 1
                eprint(f"[openalex_enrich] BUG: {slug} in no result bucket; skipped")
                continue

            parsed = parse_author_payload(payload)
            quality_flags = compute_data_quality_flags(parsed)
            with stats_lock:
                if quality_flags is not None and quality_flags.get("conflation_suspected"):
                    stats.flagged_disambiguation_suspect += 1
                else:
                    stats.fetched_ok += 1

            rows.append(MetricsRow(
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
                fetch_status=None,
                fetch_error=None,
                data_quality_flags=quality_flags,
            ))
        return rows

    # Filter out skipped links before dispatching
    work_items = [link for link in links if link.hcp_id not in done_today]
    skipped_count = len(links) - len(work_items)
    if skipped_count:
        with stats_lock:
            stats.skipped_already_done = skipped_count

    # Chunk for the batched list endpoint: ~50 authors per HTTP request.
    chunks: List[List[LinkRow]] = [
        work_items[i:i + AUTHOR_CHUNK_SIZE]
        for i in range(0, len(work_items), AUTHOR_CHUNK_SIZE)
    ]
    print(
        f"[openalex_enrich] dispatching {len(work_items)} link rows as {len(chunks)} "
        f"batched request(s) of <={AUTHOR_CHUNK_SIZE} across {args.workers} worker(s)"
    )

    processed = 0            # link rows accounted for (answered or deliberately skipped)
    last_progress_at = 0
    max_in_flight = max(args.workers * 2, args.workers + 4)
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        work_iter = iter(chunks)
        in_flight = set()
        # Prime the window
        for _ in range(max_in_flight):
            try:
                chunk = next(work_iter)
            except StopIteration:
                break
            in_flight.add(executor.submit(fetch_chunk, chunk))
        while in_flight:
            done, in_flight = wait(in_flight, return_when=FIRST_COMPLETED)
            for future in done:
                # Refill: submit one new chunk per completed chunk, unless interrupted or exhausted
                if not INTERRUPTED:
                    try:
                        chunk = next(work_iter)
                        in_flight.add(executor.submit(fetch_chunk, chunk))
                    except StopIteration:
                        pass
                try:
                    metrics_rows = future.result()
                except Exception as exc:
                    # resolve_author_ids never raises, so this is a real bug --
                    # surface it rather than silently dropping a whole chunk.
                    eprint(f"[openalex_enrich] WARN: unexpected worker exception: {exc}")
                    continue

                # Thread-safe append to pending buffer
                should_flush = False
                with pending_lock:
                    pending.extend(metrics_rows)
                    if len(pending) >= args.batch_size:
                        should_flush = True

                # Flush outside pending_lock so we don't block workers during the upsert
                if should_flush:
                    with flush_lock:
                        # Re-grab pending under lock, swap with empty list
                        with pending_lock:
                            batch_to_write = pending
                            pending = []
                        upsert_batch(client, batch_to_write, args.dry_run)

                processed += AUTHOR_CHUNK_SIZE
                if processed - last_progress_at >= PROGRESS_INTERVAL:
                    last_progress_at = processed
                    with rate_lock:
                        rem = rate_remaining["value"]
                    with stats_lock:
                        if stats.recent_durations:
                            avg = sum(stats.recent_durations) / len(stats.recent_durations)
                            remaining = max(0, len(work_items) - processed)
                            # With concurrency, effective rate is avg/workers
                            eta_seconds = (avg * remaining) / max(1, args.workers)
                            eta_min = eta_seconds / 60.0
                            print(
                                f"[openalex_enrich] ~{min(processed, len(work_items))}/{len(work_items)} | "
                                f"ok={stats.fetched_ok} 404={stats.fetched_not_found} err={stats.fetched_error} "
                                f"flag={stats.flagged_disambiguation_suspect} skip={stats.skipped_already_done} | "
                                f"workers={args.workers} avg={avg*1000:.0f}ms/author eta={eta_min:.1f}min "
                                f"credits_remaining={rem if rem is not None else 'n/a'}"
                            )

    # Final flush
    if pending:
        upsert_batch(client, pending, args.dry_run)

    elapsed = (datetime.now(timezone.utc) - stats.started_at).total_seconds()
    print("[openalex_enrich] complete.")
    print(f"[openalex_enrich] total_input={stats.total_input}")
    print(f"[openalex_enrich] fetched_ok={stats.fetched_ok}")
    print(f"[openalex_enrich] fetched_not_found={stats.fetched_not_found}  (proven absent from a 200 response; row written with fetch_status='not_found')")
    print(f"[openalex_enrich] unresolved={stats.fetched_error}  (no trustworthy answer; NO row written -- re-run with --resume to retry)")
    print(f"[openalex_enrich] flagged_disambiguation_suspect={stats.flagged_disambiguation_suspect}")
    print(f"[openalex_enrich] skipped_already_done={stats.skipped_already_done}")
    print(f"[openalex_enrich] elapsed={elapsed/60:.1f}min ({elapsed:.0f}s)")
    print(f"[openalex_enrich] enrichment_run_id={enrichment_run_id}")

    # ALL-FAILED RULE. attempted counts only authors we tried to resolve this run: it EXCLUDES
    # skipped_already_done (a --resume no-op) and INCLUDES fetched_not_found, which this script
    # treats as a real answer -- it is proven-absent from a 200 response and a row IS written,
    # so it is a success for this purpose. Only fetched_error means no trustworthy answer and
    # no row. Everything unresolved with nothing written is the unambiguous failure.
    attempted = stats.fetched_ok + stats.fetched_not_found + stats.fetched_error
    if attempted and not (stats.fetched_ok + stats.fetched_not_found):
        print(f"[FAIL] 0 of {attempted} attempted authors resolved "
              f"({stats.fetched_error} unresolved).", file=sys.stderr)
        return 1
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="OpenAlex author metrics enrichment (v2)")
    p.add_argument("--dry-run", action="store_true", help="Do not write to Supabase.")
    p.add_argument("--limit", type=int, default=None, help="Only process the first N link rows.")
    p.add_argument("--offset", type=int, default=0, help="Skip the first N link rows.")
    p.add_argument("--resume", action="store_true", help="Skip HCPs already snapshotted today.")
    p.add_argument(
        "--snapshot-date",
        type=str,
        default=None,
        help="Snapshot date to write/resume (YYYY-MM-DD). Defaults to today. Use to resume an interrupted run into its original snapshot.",
    )
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Supabase upsert batch size.")
    p.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                   help=f"Concurrent batched-request workers (default {DEFAULT_WORKERS}). Each worker "
                        f"issues one list request covering up to {AUTHOR_CHUNK_SIZE} authors, so 2 "
                        f"workers is ~1 req/s -- far below the 10 req/s limit. Raising this mainly "
                        f"increases 504 query_timeout exposure on big OR filters.")
    p.add_argument(
        "--ta",
        type=str,
        default=None,
        metavar="SLUG",
        help="Scope to HCPs in one therapeutic area (e.g. atopic-dermatitis).",
    )
    p.add_argument(
        "--hcp-ids-file",
        type=str,
        default=None,
        metavar="PATH",
        help="Scope to these hcp_ids (one uuid per line). Combined with --ta => INTERSECT "
             "(HCPs in both the TA and the file); alone => exactly these ids. For incremental cycles.",
    )
    p.add_argument(
        "--missing-only",
        action="store_true",
        help="Only fetch HCPs without an hcp_author_metrics_v2 row for the target snapshot_date.",
    )
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(run(parse_args()))
