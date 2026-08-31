from __future__ import annotations

"""
Cluster-based career enrichment for FieldMark.

Recomputes hcps.total_career_pubs and hcps.first_pub_year by fetching OpenAlex
author records for each linked openalex_author_id in hcp_openalex_authors,
then aggregating works_count (SUM) and earliest publication year (MIN) across
the cluster.

Requires .env: SUPABASE_URL, SUPABASE_KEY, PUBMED_EMAIL (OpenAlex mailto).
Optional: OPENALEX_API_KEY

Examples:
  python career_enrichment_from_clusters.py --dry-run --limit 10
  python career_enrichment_from_clusters.py --only-changed-today
  python career_enrichment_from_clusters.py --hcp-ids-file ids.txt
  python career_enrichment_from_clusters.py --include-null-only
"""

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from tqdm import tqdm

# ============================================================
# Table routing (v1 vs v2)
# ============================================================

def get_table_name(base_name: str, target_version: str) -> str:
    """
    Returns the correct table name based on --target-version flag.
    v1 returns base_name unchanged. v2 appends _v2 suffix.
    """
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


OPENALEX_BASE_URL = "https://api.openalex.org"
FETCH_PAGE_SIZE = 1000
SLEEP_SECONDS = 0.05
PROGRESS_EVERY = 25
DEFAULT_TIMEOUT_SECONDS = 20


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


@dataclass
class EnrichmentStats:
    total_candidates: int = 0
    processed: int = 0
    updated: int = 0
    no_cluster: int = 0
    failed: int = 0
    partial: int = 0
    skipped: int = 0
    #: BATCHED PATH ONLY. Clusters left unwritten because at least one author id never got a
    #: trustworthy answer. Distinct from `partial`, which the singleton path uses for clusters
    #: it wrote anyway from an incomplete fetch -- see the write contract in run_pipeline.
    unresolved_clusters: int = 0
    author_ids_total: int = 0
    author_ids_not_found: int = 0
    author_ids_unresolved: int = 0
    requests_made: int = 0


@dataclass
class CandidateHCP:
    hcp_id: str
    first_name: Optional[str]
    last_name: Optional[str]
    total_career_pubs: Optional[int]
    first_pub_year: Optional[int]
    author_ids: List[str] = field(default_factory=list)


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def build_http_session(polite_mailto: str) -> requests.Session:
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=0)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": f"FieldMark/1.0 (mailto:{polite_mailto})"})
    return session


def extract_openalex_short_id(value: str) -> str:
    if not value:
        return ""
    v = str(value).strip()
    m = re.search(r"(A\d+)$", v)
    return m.group(1) if m else v


# ============================================================
# Batched author fetch -- REUSED from stage 8b, not reimplemented
# ============================================================
#
# 8a had the same shape 8b had before 2026-08-25: one GET /authors/{id} per author id, plus a
# fixed SLEEP_SECONDS = 0.05 per HCP. Measured 4.2 HCP/s over 92,638 clusters = ~5h51m on the
# CRC first build, against 69 candidates in 64s weekly -- a 1,343x work-set multiple against
# code whose shape was chosen when the input was a few hundred rows.
#
# The list form /authors?filter=openalex_id:A1|A2|... collapses 50 authors into one request.
# Every hard-won detail of that path already exists in openalex_author_enrichment: the per-page
# trap (per-page MUST be >= the id count or a 200 silently truncates), the
# meta.count/len(results) assertion that catches it, split-and-retry so one bad id or one
# transient 504 cannot condemn its 49 neighbours, and Retry-After honouring. Importing it is
# the point -- a second implementation would be a second place for the per-page trap to be
# rediscovered the hard way.
_ENRICH_DIR = os.path.dirname(os.path.abspath(__file__))
if _ENRICH_DIR not in sys.path:
    sys.path.insert(0, _ENRICH_DIR)
from openalex_author_enrichment import (  # noqa: E402
    AUTHOR_CHUNK_SIZE,
    author_id_to_slug,
    resolve_author_ids,
)


def resolve_clusters_batched(
    candidates: Sequence["CandidateHCP"], api_key: str, mailto: str,
) -> Tuple[Dict[str, Dict[str, Any]], Set[str], Set[str]]:
    """Resolve every author id across every cluster, in AUTHOR_CHUNK_SIZE-sized list requests.

    Returns (payload_by_short_id, not_found, unresolved) with 8b's three-way meaning:
      payload_by_short_id : present in a 200 response
      not_found           : PROVEN absent from a 200 response -- a real answer
      unresolved          : never got a trustworthy answer -- says nothing about the id

    Ids are DEDUPED across clusters first. An author id shared by two HCPs was previously
    fetched twice; here it is fetched once.
    """
    all_ids: List[str] = sorted({
        author_id_to_slug(a) for c in candidates for a in c.author_ids if a
    })
    payloads: Dict[str, Dict[str, Any]] = {}
    not_found: Set[str] = set()
    unresolved: Set[str] = set()
    total_chunks = (len(all_ids) + AUTHOR_CHUNK_SIZE - 1) // AUTHOR_CHUNK_SIZE
    print(f"Resolving {len(all_ids):,} distinct author id(s) in {total_chunks:,} batched "
          f"request(s) of <={AUTHOR_CHUNK_SIZE}...", flush=True)

    for i in range(0, len(all_ids), AUTHOR_CHUNK_SIZE):
        chunk = all_ids[i : i + AUTHOR_CHUNK_SIZE]
        got, nf, unres, _rate = resolve_author_ids(chunk, api_key, mailto)
        payloads.update(got)
        not_found |= nf
        unresolved |= unres
        done = min(i + AUTHOR_CHUNK_SIZE, len(all_ids))
        if (i // AUTHOR_CHUNK_SIZE) % 20 == 0 or done == len(all_ids):
            print(f"  [{done:,}/{len(all_ids):,}] resolved={len(payloads):,} "
                  f"not_found={len(not_found):,} unresolved={len(unresolved):,}", flush=True)
    return payloads, not_found, unresolved


def fetch_openalex_author(
    session: requests.Session,
    author_short_id: str,
    polite_mailto: str,
) -> Optional[Dict[str, Any]]:
    api_key = os.getenv("OPENALEX_API_KEY")
    params: Dict[str, str] = {"mailto": polite_mailto}
    if api_key:
        params["api_key"] = api_key
    try:
        response = session.get(
            f"{OPENALEX_BASE_URL}/authors/{author_short_id}",
            params=params,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except (requests.RequestException, ValueError) as exc:
        eprint(f"[openalex] author {author_short_id}: {exc}")
        return None


def parse_works_count(author: Dict[str, Any]) -> int:
    try:
        return max(0, int(author.get("works_count", 0) or 0))
    except (TypeError, ValueError):
        return 0


def earliest_pub_year_from_author(author: Dict[str, Any]) -> Optional[int]:
    counts_by_year = author.get("counts_by_year")
    if not isinstance(counts_by_year, list):
        return None
    years: List[int] = []
    for item in counts_by_year:
        if not isinstance(item, dict):
            continue
        try:
            year = int(item.get("year"))
            works_count = int(item.get("works_count", 0) or 0)
        except (TypeError, ValueError):
            continue
        if works_count > 0:
            years.append(year)
    return min(years) if years else None


def aggregate_cluster_stats(
    authors: Sequence[Dict[str, Any]],
) -> Tuple[int, Optional[int]]:
    total_works = 0
    earliest: Optional[int] = None
    for author in authors:
        total_works += parse_works_count(author)
        year = earliest_pub_year_from_author(author)
        if year is not None:
            earliest = year if earliest is None else min(earliest, year)
    return total_works, earliest


def update_hcp_career_fields(
    supabase: Client,
    hcp_id: str,
    works_count: int,
    first_pub_year: Optional[int],
    target_version: str = "v1",
) -> None:
    hcps_table = get_table_name("hcps", target_version)
    if target_version == "v2":
        update_payload = {"total_career_pubs": works_count, "career_first_pub_year": first_pub_year}
    else:
        update_payload = {"total_career_pubs": works_count, "first_pub_year": first_pub_year}
    try:
        response = supabase.table(hcps_table).update(update_payload).eq("id", hcp_id).execute()
        if not response.data:
            raise RuntimeError(
                f"Update returned empty data for HCP {hcp_id} - "
                f"row not matched or write silently dropped"
            )
    except Exception as exc:
        raise RuntimeError(f"Failed updating HCP {hcp_id}: {exc}") from exc


def format_eta(total_seconds: float) -> str:
    if total_seconds < 0:
        total_seconds = 0
    minutes = int(total_seconds // 60)
    hours = minutes // 60
    remaining_minutes = minutes % 60
    return f"{hours}h {remaining_minutes}m"


def load_hcp_ids_file(path: str) -> Set[str]:
    ids: Set[str] = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            hid = line.strip()
            if hid and not hid.startswith("#"):
                ids.add(hid)
    return ids


def today_start_utc_iso() -> str:
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat()


def fetch_all_join_rows(supabase: Client, target_version: str = "v1") -> List[Dict[str, Any]]:
    hcp_oa_table = get_table_name("hcp_openalex_authors", target_version)
    # v1 uses created_at; v2 renamed this column to linked_at.
    # Select the appropriate column and normalize to "created_at" key in
    # returned dicts so downstream code (build_author_clusters) is unchanged.
    timestamp_column = "linked_at" if target_version == "v2" else "created_at"
    select_cols = f"hcp_id,openalex_author_id,{timestamp_column}"
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        response = (
            supabase.table(hcp_oa_table)
            .select(select_cols)
            .order("hcp_id")
            .range(offset, offset + FETCH_PAGE_SIZE - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        if target_version == "v2":
            # Normalize linked_at -> created_at so downstream code is unchanged
            for row in batch:
                if "linked_at" in row:
                    row["created_at"] = row.pop("linked_at")
        rows.extend(batch)
        if len(batch) < FETCH_PAGE_SIZE:
            break
        offset += FETCH_PAGE_SIZE
    return rows


def build_author_clusters(
    join_rows: Sequence[Dict[str, Any]],
    *,
    only_changed_today: bool,
    today_iso: str,
    hcp_ids_filter: Optional[Set[str]],
) -> Dict[str, List[str]]:
    """Map hcp_id -> deduped list of openalex_author_id short ids."""
    clusters: Dict[str, Set[str]] = {}
    for row in join_rows:
        hcp_id = str(row.get("hcp_id") or "").strip()
        if not hcp_id:
            continue
        if hcp_ids_filter is not None and hcp_id not in hcp_ids_filter:
            continue
        if only_changed_today:
            created = row.get("created_at")
            if not created or str(created) < today_iso:
                continue
        oid = extract_openalex_short_id(str(row.get("openalex_author_id") or ""))
        if not oid:
            continue
        clusters.setdefault(hcp_id, set()).add(oid)
    return {hid: sorted(ids) for hid, ids in clusters.items()}


def fetch_hcps_for_ids(
    supabase: Client,
    hcp_ids: Sequence[str],
    *,
    include_null_only: bool,
    target_version: str = "v1",
) -> List[Dict[str, Any]]:
    hcps_table = get_table_name("hcps", target_version)
    if target_version == "v2":
        year_col = "career_first_pub_year"
    else:
        year_col = "first_pub_year"
    select_cols = f"id,first_name,last_name,total_career_pubs,{year_col}"
    out: List[Dict[str, Any]] = []
    ids = [str(i) for i in hcp_ids if i]
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        q = (
            supabase.table(hcps_table)
            .select(select_cols)
            .in_("id", chunk)
        )
        if include_null_only:
            q = q.is_("total_career_pubs", "null")
        rows = q.execute().data or []
        if target_version == "v2":
            for row in rows:
                if "career_first_pub_year" in row:
                    row["first_pub_year"] = row.pop("career_first_pub_year")
        out.extend(rows)
    return out


def load_candidates(supabase: Client, args: argparse.Namespace) -> List[CandidateHCP]:
    hcp_ids_filter: Optional[Set[str]] = None
    if args.hcp_ids_file:
        hcp_ids_filter = load_hcp_ids_file(args.hcp_ids_file)
        if not hcp_ids_filter:
            raise ValueError(f"No HCP IDs found in {args.hcp_ids_file}")

    today_iso = today_start_utc_iso()
    join_rows = fetch_all_join_rows(supabase, args.target_version)
    clusters = build_author_clusters(
        join_rows,
        only_changed_today=args.only_changed_today,
        today_iso=today_iso,
        hcp_ids_filter=hcp_ids_filter,
    )

    if not clusters:
        return []

    hcp_rows = fetch_hcps_for_ids(
        supabase,
        list(clusters.keys()),
        include_null_only=args.include_null_only,
        target_version=args.target_version,
    )

    candidates: List[CandidateHCP] = []
    for row in hcp_rows:
        hid = str(row.get("id") or "").strip()
        if not hid:
            continue
        author_ids = clusters.get(hid, [])
        if not author_ids:
            continue
        candidates.append(
            CandidateHCP(
                hcp_id=hid,
                first_name=(row.get("first_name") or "").strip() or None,
                last_name=(row.get("last_name") or "").strip() or None,
                total_career_pubs=row.get("total_career_pubs"),
                first_pub_year=row.get("first_pub_year"),
                author_ids=author_ids,
            )
        )

    if args.limit is not None and args.limit > 0:
        candidates = candidates[: args.limit]
    return candidates


def describe_filters(args: argparse.Namespace) -> str:
    parts: List[str] = []
    if args.only_changed_today:
        parts.append("--only-changed-today")
    if args.hcp_ids_file:
        parts.append(f"--hcp-ids-file={args.hcp_ids_file}")
    if args.include_null_only:
        parts.append("--include-null-only")
    if args.limit is not None:
        parts.append(f"--limit={args.limit}")
    return ", ".join(parts) if parts else "(none)"


def run_pipeline(args: argparse.Namespace) -> EnrichmentStats:
    load_dotenv()
    supabase = init_supabase()
    polite_mailto = get_required_env("PUBMED_EMAIL")
    session = build_http_session(polite_mailto)

    candidates = load_candidates(supabase, args)
    stats = EnrichmentStats(total_candidates=len(candidates))
    print(f"Loaded {stats.total_candidates} candidate HCP(s) with cluster linkage.", flush=True)

    if not candidates:
        return stats

    start_time = time.time()

    if args.fetch_mode == "batched":
        return run_pipeline_batched(args, supabase, candidates, stats, polite_mailto, start_time)

    for idx, cand in enumerate(tqdm(candidates, desc="enriching careers (clusters)", unit="hcp"), start=1):
        if not cand.author_ids:
            stats.no_cluster += 1
            stats.skipped += 1
            stats.processed += 1
            continue

        fetched: List[Dict[str, Any]] = []
        fetch_failures = 0
        for author_id in cand.author_ids:
            author = fetch_openalex_author(session, author_id, polite_mailto)
            if author is None:
                fetch_failures += 1
                continue
            fetched.append(author)

        if not fetched:
            stats.failed += 1
            stats.processed += 1
            eprint(f"[hcp {cand.hcp_id}] all {len(cand.author_ids)} author fetch(es) failed")
            time.sleep(SLEEP_SECONDS)
            if idx % PROGRESS_EVERY == 0:
                _print_progress(idx, stats, start_time)
            continue

        had_partial = fetch_failures > 0
        if had_partial:
            stats.partial += 1
            eprint(
                f"[hcp {cand.hcp_id}] partial cluster: {fetch_failures}/{len(cand.author_ids)} "
                f"author fetch(es) failed; aggregating {len(fetched)} author(s)",
            )

        new_total, new_first_year = aggregate_cluster_stats(fetched)

        if args.dry_run:
            old_total = cand.total_career_pubs
            print(
                f"[dry-run] hcp_id={cand.hcp_id} "
                f"authors={len(cand.author_ids)} fetched={len(fetched)} "
                f"old_total_career_pubs={old_total} -> new_total_career_pubs={new_total} "
                f"first_pub_year={new_first_year}",
                flush=True,
            )
            stats.updated += 1
        else:
            try:
                update_hcp_career_fields(supabase, cand.hcp_id, new_total, new_first_year, target_version=args.target_version)
                stats.updated += 1
            except RuntimeError as exc:
                eprint(str(exc))
                stats.failed += 1

        stats.processed += 1
        time.sleep(SLEEP_SECONDS)

        if idx % PROGRESS_EVERY == 0:
            _print_progress(idx, stats, start_time)

    return stats


def run_pipeline_batched(
    args: argparse.Namespace,
    supabase: Client,
    candidates: Sequence[CandidateHCP],
    stats: EnrichmentStats,
    polite_mailto: str,
    start_time: float,
) -> EnrichmentStats:
    """Resolve every author id first, then aggregate per cluster from the resolved map.

    THE WRITE CONTRACT, carried over from 8b and TIGHTENED for the cluster shape.

    8b's rule is per-id: an id we did not get a trustworthy answer about gets no row. Here the
    unit written is a CLUSTER AGGREGATE -- SUM(works_count), MIN(first year) -- so one missing
    id does not merely leave a gap, it silently UNDERSTATES total_career_pubs for that HCP.
    The three-way outcome maps onto that as:

      resolved    -> contributes its payload
      not_found   -> PROVEN absent from a 200. A real answer: the id contributes nothing and
                     the cluster is still written. (An id OpenAlex has deleted or merged away
                     genuinely has no works to add.)
      unresolved  -> no trustworthy answer. The WHOLE CLUSTER is left unwritten and counted,
                     for the next --resume to pick up.

    That last line is a deliberate BEHAVIOUR CHANGE from the singleton path, which counted such
    clusters as `partial` and wrote the under-counted aggregate anyway. Writing a wrong
    total_career_pubs is worse than writing nothing, and TOTAL_CAREER_PUBS.md already records
    that column as unreliable partly because of writes like these.
    """
    api_key = os.getenv("OPENALEX_API_KEY", "")
    payloads, not_found, unresolved = resolve_clusters_batched(
        candidates, api_key, polite_mailto
    )
    stats.author_ids_total = len({author_id_to_slug(a) for c in candidates for a in c.author_ids if a})
    stats.author_ids_not_found = len(not_found)
    stats.author_ids_unresolved = len(unresolved)
    stats.requests_made = (stats.author_ids_total + AUTHOR_CHUNK_SIZE - 1) // AUTHOR_CHUNK_SIZE

    for idx, cand in enumerate(candidates, start=1):
        if not cand.author_ids:
            stats.no_cluster += 1
            stats.skipped += 1
            stats.processed += 1
            continue

        slugs = [author_id_to_slug(a) for a in cand.author_ids if a]
        blocked = [x for x in slugs if x in unresolved]
        if blocked:
            stats.unresolved_clusters += 1
            stats.processed += 1
            eprint(f"[hcp {cand.hcp_id}] {len(blocked)}/{len(slugs)} author id(s) unresolved; "
                   f"cluster NOT written (re-run to retry)")
            continue

        fetched = [payloads[x] for x in slugs if x in payloads]
        if not fetched:
            # Every id in the cluster was PROVEN absent. That is an answer, not a failure to
            # get one -- but there is nothing to aggregate, so nothing is written.
            stats.failed += 1
            stats.processed += 1
            eprint(f"[hcp {cand.hcp_id}] all {len(slugs)} author id(s) not found in OpenAlex")
            continue

        new_total, new_first_year = aggregate_cluster_stats(fetched)

        if args.dry_run:
            print(f"[dry-run] hcp_id={cand.hcp_id} authors={len(slugs)} fetched={len(fetched)} "
                  f"old_total_career_pubs={cand.total_career_pubs} -> "
                  f"new_total_career_pubs={new_total} first_pub_year={new_first_year}",
                  flush=True)
            stats.updated += 1
        else:
            try:
                update_hcp_career_fields(supabase, cand.hcp_id, new_total, new_first_year,
                                         target_version=args.target_version)
                stats.updated += 1
            except RuntimeError as exc:
                eprint(str(exc))
                stats.failed += 1
        stats.processed += 1
        if idx % PROGRESS_EVERY == 0:
            _print_progress(idx, stats, start_time)
    return stats


def _print_progress(idx: int, stats: EnrichmentStats, start_time: float) -> None:
    elapsed = time.time() - start_time
    rate = stats.processed / elapsed if elapsed > 0 else 0.0
    remaining = max(stats.total_candidates - idx, 0)
    eta = format_eta(remaining / rate if rate > 0 else 0)
    pct = (idx / max(stats.total_candidates, 1)) * 100
    print(
        f"[{idx}/{stats.total_candidates}] {pct:.1f}% | "
        f"Updated: {stats.updated} | Skipped: {stats.skipped} | Failed: {stats.failed} | "
        f"Rate: {rate:.2f}/s | ETA: {eta}",
        flush=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Recompute hcps.total_career_pubs and first_pub_year from "
            "hcp_openalex_authors clusters via OpenAlex author GET by ID."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print updates without writing to hcps.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process only the first N candidate HCPs.",
    )
    parser.add_argument(
        "--hcp-ids-file",
        type=str,
        default=None,
        metavar="PATH",
        help="File with HCP UUIDs (one per line); only process those IDs.",
    )
    parser.add_argument(
        "--fetch-mode",
        choices=["batched", "singleton"],
        default="batched",
        help=("batched (default): resolve authors ~%d at a time via "
              "/authors?filter=openalex_id:A1|A2|... -- a BILLED List operation "
              "($0.0001/request, so cents for a whole build) that collapses ~1,343x of HTTP "
              "round-trips. singleton: the original free GET /authors/{id} per author id, "
              "kept for a run with no api_key and for comparison. See the write-contract note "
              "in run_pipeline_batched -- the two paths differ on partial clusters."
              % AUTHOR_CHUNK_SIZE),
    )
    parser.add_argument(
        "--only-changed-today",
        action="store_true",
        help="Only HCPs with hcp_openalex_authors rows created today (UTC).",
    )
    parser.add_argument(
        "--include-null-only",
        action="store_true",
        help="Only HCPs where total_career_pubs IS NULL.",
    )
    parser.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version to write to. v1=legacy tables, v2=rebuild tables.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    wall_start = time.time()
    try:
        stats = run_pipeline(args)
    except Exception as exc:
        eprint(f"[ERROR] {exc}")
        return 1

    wall = time.time() - wall_start
    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print("\n=== Cluster-Based Career Enrichment Summary ===", flush=True)
    print(f"Mode: {mode}", flush=True)
    print(f"Filters: {describe_filters(args)}", flush=True)
    print(f"Candidates loaded: {stats.total_candidates}", flush=True)
    print(f"Processed: {stats.processed}", flush=True)
    print(f"Updated: {stats.updated}", flush=True)
    print(f"No cluster (no hcp_openalex_authors rows): {stats.no_cluster}", flush=True)
    print(f"Failed (all author fetches failed / all ids not found): {stats.failed}", flush=True)
    if args.fetch_mode == "batched":
        print(f"Unresolved clusters (NOT written, retry next run): "
              f"{stats.unresolved_clusters}", flush=True)
        print(f"Author ids: {stats.author_ids_total:,} distinct | "
              f"not_found {stats.author_ids_not_found:,} | "
              f"unresolved {stats.author_ids_unresolved:,}", flush=True)
        print(f"OpenAlex list requests: {stats.requests_made:,} "
              f"(~{stats.requests_made * 0.0001:.2f} USD at $0.0001/request)", flush=True)
    else:
        print(f"Partial (some author fetches failed but proceeded): {stats.partial}", flush=True)
    print(f"Wall time: {wall:.1f}s", flush=True)

    # ALL-FAILED RULE. This script already draws the line the rule needs: `failed` means the
    # item produced nothing, `partial` means it proceeded anyway -- so only `failed` counts
    # against success, and `partial` is deliberately ignored here. attempted EXCLUDES
    # no_cluster: an HCP with no hcp_openalex_authors rows was never attempted.
    # attempted EXCLUDES no_cluster (never attempted) and unresolved_clusters (deliberately
    # deferred, not failed) -- a run where every cluster was deferred by a transient API
    # outage is a retry, not a failure.
    attempted = stats.updated + stats.failed
    if attempted and not stats.updated:
        eprint(f"[FAIL] 0 of {attempted} attempted HCPs enriched ({stats.failed} failed).")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
