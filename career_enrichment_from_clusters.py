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
SLEEP_SECONDS = 0.2
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
    try:
        supabase.table(hcps_table).update(
            {"total_career_pubs": works_count, "first_pub_year": first_pub_year}
        ).eq("id", hcp_id).execute()
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
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        response = (
            supabase.table(hcp_oa_table)
            .select("hcp_id,openalex_author_id,created_at")
            .order("hcp_id")
            .range(offset, offset + FETCH_PAGE_SIZE - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
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
    out: List[Dict[str, Any]] = []
    ids = [str(i) for i in hcp_ids if i]
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        q = (
            supabase.table(hcps_table)
            .select("id,first_name,last_name,total_career_pubs,first_pub_year")
            .in_("id", chunk)
        )
        if include_null_only:
            q = q.is_("total_career_pubs", "null")
        rows = q.execute().data or []
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
    print(f"Failed (all author fetches failed): {stats.failed}", flush=True)
    print(f"Partial (some author fetches failed but proceeded): {stats.partial}", flush=True)
    print(f"Wall time: {wall:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
