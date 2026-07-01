"""
FieldMark v2.0 - NPPES Organization to ROR ID Mapping

For each distinct NPPES organization name in our hcps table, query the ROR API
(https://ror.org) to find the best-matching ROR institution. Store the mapping
in nppes_org_to_ror table for use during Category 2 HCP reconciliation.

This enables matching NPPES clinicians (who have organization name + NPI) to
OpenAlex authors (who have ROR IDs from their last_known_institutions). Same ROR
on both sides = strong evidence of institutional overlap = high-confidence match.

Required environment variables:
- SUPABASE_URL
- SUPABASE_KEY

Optional:
- ROR_API_BASE (default: https://api.ror.org)

Usage:
    python map_nppes_to_ror.py                  # full run
    python map_nppes_to_ror.py --dry-run        # preview, no DB writes
    python map_nppes_to_ror.py --limit 100      # process only first N (testing)
    python map_nppes_to_ror.py --min-confidence 0.85  # higher confidence threshold
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util.retry import Retry


# ============================================================
# Config
# ============================================================

ROR_API_BASE = os.getenv("ROR_API_BASE", "https://api.ror.org")
ROR_RATE_LIMIT_SLEEP = 0.5      # 2 req/sec - polite default for free API
ROR_TIMEOUT_SECONDS = 15
DB_UPSERT_BATCH_SIZE = 100
PROGRESS_PRINT_EVERY = 100
DEFAULT_MIN_CONFIDENCE = 0.65   # auto-accept threshold (token-overlap based)


# ============================================================
# Data classes
# ============================================================

@dataclass
class RorMatchCandidate:
    ror_id: str
    name: str
    score: float
    matching_type: Optional[str] = None  # 'exact', 'fuzzy', 'common-term', etc.
    chosen: bool = False


@dataclass
class MappingStats:
    distinct_orgs_to_process: int = 0
    processed: int = 0
    matched_high_confidence: int = 0
    matched_medium_confidence: int = 0
    no_match: int = 0
    api_failures: int = 0
    rows_written: int = 0
    errors: List[str] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# ============================================================
# Helpers
# ============================================================

def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def build_http_session() -> requests.Session:
    s = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    a = HTTPAdapter(max_retries=retries)
    s.mount("https://", a)
    s.mount("http://", a)
    s.headers.update({
        "User-Agent": "FieldMark/1.0 (mailto:garrett.groesbeck@gmail.com)",
    })
    return s


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    if seconds < 3600:
        return f"{seconds / 60:.1f}m"
    return f"{seconds / 3600:.2f}h"


def estimate_remaining(processed: int, total: int, started_at: datetime) -> str:
    if processed == 0:
        return "unknown"
    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
    rate = processed / elapsed
    remaining = total - processed
    if rate == 0:
        return "unknown"
    return format_duration(remaining / rate)


def normalize_org_name(name: Optional[str]) -> str:
    """Light normalization for storage / dedup."""
    if not name:
        return ""
    return " ".join(name.strip().split())


def chunked(items: Sequence, size: int) -> Iterable[Sequence]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


# ============================================================
# DB: gather distinct NPPES orgs
# ============================================================

def fetch_distinct_nppes_orgs(supabase: Client) -> List[str]:
    """
    Return distinct, non-empty NPPES organization names from hcps.
    Paginated to handle large tables.
    """
    seen: Set[str] = set()
    offset = 0
    page_size = 1000

    while True:
        try:
            response = (
                supabase.table("hcps")
                .select("nppes_organization_name")
                .not_.is_("nppes_organization_name", "null")
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch hcps at offset {offset}: {exc}") from exc

        batch = response.data or []
        if not batch:
            break

        for row in batch:
            org = normalize_org_name(row.get("nppes_organization_name"))
            if org:
                seen.add(org)

        if len(batch) < page_size:
            break
        offset += page_size

    return sorted(seen)


def fetch_already_mapped_orgs(supabase: Client) -> Set[str]:
    """Return set of org names already present in nppes_org_to_ror."""
    seen: Set[str] = set()
    offset = 0
    page_size = 1000
    while True:
        try:
            response = (
                supabase.table("nppes_org_to_ror")
                .select("nppes_organization_name")
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            # Table may not exist yet on first run; treat as empty
            err = str(exc).lower()
            if "does not exist" in err or "relation" in err:
                return set()
            raise RuntimeError(f"Failed to fetch mapped orgs at offset {offset}: {exc}") from exc

        batch = response.data or []
        if not batch:
            break

        for row in batch:
            name = row.get("nppes_organization_name")
            if name:
                seen.add(name)

        if len(batch) < page_size:
            break
        offset += page_size
    return seen


# ============================================================
# ROR API query
# ============================================================

def normalize_for_comparison(s: Optional[str]) -> str:
    """Normalize a string for fuzzy comparison: lowercase, collapse whitespace, strip punctuation."""
    if not s:
        return ""
    import re
    cleaned = re.sub(r"[^\w\s]", " ", s.lower())
    return " ".join(cleaned.split())


def compute_name_similarity(query: str, candidate_name: str) -> float:
    """
    Compute a similarity score between query and candidate name.
    Uses token-set overlap (Jaccard-like): how many query tokens appear in candidate.
    Returns 0.0 to 1.0.
    """
    q_norm = normalize_for_comparison(query)
    c_norm = normalize_for_comparison(candidate_name)
    if not q_norm or not c_norm:
        return 0.0

    q_tokens = set(q_norm.split())
    c_tokens = set(c_norm.split())
    if not q_tokens:
        return 0.0

    # Tokens that are in query AND in candidate
    overlap = q_tokens & c_tokens
    # Score: fraction of query tokens that appear in candidate
    base = len(overlap) / len(q_tokens)

    # Bonus: penalize candidate having many extra tokens not in query
    # (helps distinguish "Mayo Clinic" from "Mayo Clinic College of Medicine and Science")
    extra_tokens = c_tokens - q_tokens
    extra_penalty = len(extra_tokens) * 0.05  # 5% penalty per extra token
    extra_penalty = min(extra_penalty, 0.3)   # cap penalty at 30%

    return max(0.0, base - extra_penalty)


def query_ror(session: requests.Session, org_name: str) -> Optional[List[RorMatchCandidate]]:
    """
    Query ROR's /organizations endpoint for the given org name.
    Returns list of candidates ranked by computed score, or None on API failure.

    ROR API returns items as a flat array of organization records (no embedded
    score/chosen/matching_type fields). We compute our own confidence score
    by comparing the query string to the candidate names.
    """
    url = f"{ROR_API_BASE}/organizations"
    params = {"query": org_name}

    try:
        r = session.get(url, params=params, timeout=ROR_TIMEOUT_SECONDS)
        r.raise_for_status()
        payload = r.json()
    except (requests.RequestException, ValueError) as exc:
        return None

    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []

    candidates: List[RorMatchCandidate] = []
    # ROR's array order is its ranking; we keep top 5 and score each
    for position, item in enumerate(items[:5]):
        if not isinstance(item, dict):
            continue
        ror_id = item.get("id")
        if not isinstance(ror_id, str):
            continue

        # Extract the display name (preferring 'ror_display' type, falling back to 'label')
        display_name: Optional[str] = None
        all_names: List[str] = []
        names = item.get("names")
        if isinstance(names, list):
            for n in names:
                if not isinstance(n, dict):
                    continue
                v = n.get("value")
                types = n.get("types") or []
                if not isinstance(v, str):
                    continue
                all_names.append(v)
                if "ror_display" in types and display_name is None:
                    display_name = v
                elif "label" in types and display_name is None:
                    display_name = v

        if display_name is None and all_names:
            display_name = all_names[0]
        if not display_name:
            continue

        # Compute similarity score against the display name AND any aliases/labels
        # Take the BEST score across all name variants for this org
        best_score = 0.0
        best_match_basis = None
        for name in all_names:
            s = compute_name_similarity(org_name, name)
            if s > best_score:
                best_score = s
                best_match_basis = name

        # Boost top-ranked items slightly (ROR's own ranking carries information)
        # Position 0 gets +0.05, position 1 gets +0.03, etc.
        position_boost = max(0.0, 0.05 - (position * 0.02))
        adjusted_score = min(1.0, best_score + position_boost)

        # "chosen" semantic: position 0 with score >= 0.7 = highly likely the right answer
        chosen = (position == 0 and best_score >= 0.7)

        # Capture matching basis as a descriptive string
        matching_type: Optional[str] = None
        if best_match_basis:
            if normalize_for_comparison(org_name) == normalize_for_comparison(best_match_basis):
                matching_type = "exact"
            elif best_score >= 0.8:
                matching_type = "strong_fuzzy"
            elif best_score >= 0.5:
                matching_type = "weak_fuzzy"
            else:
                matching_type = "low_overlap"

        candidates.append(RorMatchCandidate(
            ror_id=ror_id,
            name=display_name,
            score=adjusted_score,
            matching_type=matching_type,
            chosen=chosen,
        ))

    # Sort candidates by computed score descending
    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates


# ============================================================
# Match resolution
# ============================================================

def pick_best_match(
    candidates: List[RorMatchCandidate],
    min_confidence: float,
) -> Tuple[Optional[RorMatchCandidate], str]:
    """
    From ranked candidates, decide:
    - High confidence: candidates[0].chosen == True AND score >= min_confidence
    - Medium confidence: top score >= min_confidence but not 'chosen', OR chosen but slightly below threshold
    - No match: empty list or all scores too low

    Returns (candidate_or_None, confidence_label).
    """
    if not candidates:
        return None, "no_match"

    candidates_sorted = sorted(candidates, key=lambda c: c.score, reverse=True)
    top = candidates_sorted[0]

    # ROR's "chosen" flag plus high score = high confidence
    if top.chosen and top.score >= min_confidence:
        return top, "high"

    # High score without chosen flag = medium confidence
    if top.score >= min_confidence:
        return top, "medium"

    # Below threshold = no match (record for audit, don't auto-link)
    return top, "no_match"


# ============================================================
# DB write
# ============================================================

def upsert_mapping_batch(
    supabase: Client,
    rows: List[Dict[str, Any]],
    stats: MappingStats,
) -> None:
    if not rows:
        return
    try:
        supabase.table("nppes_org_to_ror").upsert(
            rows,
            on_conflict="nppes_organization_name",
        ).execute()
        stats.rows_written += len(rows)
    except Exception as exc:
        # Fall back row-by-row to find offenders
        for r in rows:
            try:
                supabase.table("nppes_org_to_ror").upsert(
                    r, on_conflict="nppes_organization_name"
                ).execute()
                stats.rows_written += 1
            except Exception as e2:
                stats.errors.append(
                    f"org={r.get('nppes_organization_name')!r}: {repr(e2)[:200]}"
                )


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Map NPPES organization names to ROR IDs")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--limit", type=int, default=None,
                        help="Cap number of orgs to process (testing)")
    parser.add_argument("--min-confidence", type=float, default=DEFAULT_MIN_CONFIDENCE,
                        help=f"Minimum ROR score for high-confidence match (default {DEFAULT_MIN_CONFIDENCE})")
    parser.add_argument("--resume", action="store_true",
                        help="Skip orgs already in nppes_org_to_ror (default: re-process all)")
    parser.add_argument("--verbose", action="store_true",
                        help="Print each org match decision to stdout (testing only)")
    args = parser.parse_args()

    load_dotenv()
    supabase = init_supabase()
    session = build_http_session()
    stats = MappingStats()
    stats.started_at = datetime.now(timezone.utc)

    print("=" * 70)
    print("FieldMark v2.0 - NPPES Organization to ROR Mapping")
    print("=" * 70)
    print(f"Started at: {stats.started_at.isoformat()}")
    print(f"Min confidence threshold: {args.min_confidence}")
    if args.dry_run:
        print("MODE: DRY RUN (no DB writes)")
    if args.resume:
        print("MODE: RESUME (skip already-mapped orgs)")

    # Step 1: gather distinct NPPES orgs
    print("\n[Step 1/2] Fetching distinct NPPES organization names...")
    t0 = time.time()
    all_orgs = fetch_distinct_nppes_orgs(supabase)
    print(f"  Found {len(all_orgs):,} distinct NPPES organization names "
          f"({format_duration(time.time() - t0)})")

    if args.resume:
        already_mapped = fetch_already_mapped_orgs(supabase)
        orgs_to_process = [o for o in all_orgs if o not in already_mapped]
        print(f"  Already mapped: {len(already_mapped):,}")
        print(f"  To process:     {len(orgs_to_process):,}")
    else:
        orgs_to_process = all_orgs

    if args.limit:
        orgs_to_process = orgs_to_process[:args.limit]
        print(f"  Limiting to first {len(orgs_to_process):,} (--limit)")

    stats.distinct_orgs_to_process = len(orgs_to_process)

    if not orgs_to_process:
        print("\nNothing to process.")
        stats.completed_at = datetime.now(timezone.utc)
        return

    # Step 2: query ROR for each org, build mapping rows, upsert in batches
    print(f"\n[Step 2/2] Querying ROR API + writing mappings...")
    print(f"  Rate limit: {1/ROR_RATE_LIMIT_SLEEP:.1f} req/sec sustainable")
    print(f"  Estimated runtime: {format_duration(len(orgs_to_process) * ROR_RATE_LIMIT_SLEEP)}")

    process_started = datetime.now(timezone.utc)
    pending_rows: List[Dict[str, Any]] = []
    ts_iso = stats.started_at.isoformat()

    for idx, org in enumerate(orgs_to_process, start=1):
        candidates = query_ror(session, org)

        if candidates is None:
            stats.api_failures += 1
            stats.errors.append(f"API failure for org: {org!r}")
            time.sleep(ROR_RATE_LIMIT_SLEEP)
            continue

        match, confidence = pick_best_match(candidates, args.min_confidence)

        if args.verbose:
            top_name = match.name if match else "(no candidates)"
            top_score = f"{match.score:.2f}" if match else "n/a"
            print(f"  [{confidence:>10s}] org={org!r:60s} -> {top_name!r:60s} score={top_score}")

        if confidence == "high":
            stats.matched_high_confidence += 1
        elif confidence == "medium":
            stats.matched_medium_confidence += 1
        else:
            stats.no_match += 1

        # Build row regardless of confidence - we record audit info for all attempts
        row: Dict[str, Any] = {
            "nppes_organization_name": org,
            "ror_id": match.ror_id if match else None,
            "ror_name": match.name if match else None,
            "ror_score": match.score if match else None,
            "ror_matching_type": match.matching_type if match else None,
            "ror_chosen_flag": match.chosen if match else None,
            "confidence": confidence,
            "candidate_count": len(candidates),
            "mapped_at": ts_iso,
        }
        if not args.dry_run:
            pending_rows.append(row)
            if len(pending_rows) >= DB_UPSERT_BATCH_SIZE:
                upsert_mapping_batch(supabase, pending_rows, stats)
                pending_rows = []

        stats.processed += 1

        if stats.processed % PROGRESS_PRINT_EVERY == 0:
            elapsed = (datetime.now(timezone.utc) - process_started).total_seconds()
            rate = stats.processed / elapsed if elapsed > 0 else 0
            pct = (stats.processed / stats.distinct_orgs_to_process * 100)
            eta = estimate_remaining(stats.processed, stats.distinct_orgs_to_process, process_started)
            print(f"  Progress: {stats.processed:,} / {stats.distinct_orgs_to_process:,} "
                  f"({pct:.1f}%)  rate={rate:.1f}/s  "
                  f"high={stats.matched_high_confidence:,} "
                  f"medium={stats.matched_medium_confidence:,} "
                  f"none={stats.no_match:,}  ETA={eta}")

        time.sleep(ROR_RATE_LIMIT_SLEEP)

    # Flush remaining
    if not args.dry_run and pending_rows:
        upsert_mapping_batch(supabase, pending_rows, stats)

    stats.completed_at = datetime.now(timezone.utc)
    total_elapsed = (stats.completed_at - stats.started_at).total_seconds()

    # Final summary
    print(f"\n{'=' * 70}")
    print(f"SUMMARY")
    print(f"{'=' * 70}")
    print(f"Total runtime:                  {format_duration(total_elapsed)}")
    print(f"Orgs processed:                 {stats.processed:,}")
    print(f"  High-confidence matches:      {stats.matched_high_confidence:,}")
    print(f"  Medium-confidence matches:    {stats.matched_medium_confidence:,}")
    print(f"  No match:                     {stats.no_match:,}")
    print(f"  API failures:                 {stats.api_failures:,}")
    print(f"DB rows written:                {stats.rows_written:,}")
    if stats.errors:
        print(f"\nFirst 10 errors:")
        for e in stats.errors[:10]:
            print(f"  - {e}")
        if len(stats.errors) > 10:
            print(f"  ... ({len(stats.errors) - 10} more)")


if __name__ == "__main__":
    main()
