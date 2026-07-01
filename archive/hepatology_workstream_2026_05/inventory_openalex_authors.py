"""
FieldMark v2.0 - Step A: OpenAlex Author Inventory

Scans the authorships JSONB across all OpenAlex-enriched publications.
Aggregates by OpenAlex author ID. Writes results to openalex_author_inventory.

This is the foundation for OpenAlex-driven HCP discovery. Every OpenAlex author
ID that appears in our publications corpus gets one row, with their corpus
publication count, display name, last known institution, and other metadata
captured directly from the JSONB (no extra OpenAlex API calls needed).

Required environment variables:
- SUPABASE_URL
- SUPABASE_KEY

Usage:
    python inventory_openalex_authors.py                 # full run, threshold=3
    python inventory_openalex_authors.py --min-pubs 5    # higher threshold
    python inventory_openalex_authors.py --min-pubs 1    # no threshold
    python inventory_openalex_authors.py --dry-run       # preview, no DB writes
    python inventory_openalex_authors.py --truncate      # wipe inventory first
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

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


# ============================================================
# Config
# ============================================================

FETCH_PAGE_SIZE = 1000          # Publications per Supabase select page
DB_INSERT_BATCH_SIZE = 500      # Inventory rows per upsert
PROGRESS_PRINT_EVERY = 10000    # Print progress every N publications scanned


# ============================================================
# Data structures
# ============================================================

@dataclass
class AuthorAccumulator:
    """Holds aggregated data for one OpenAlex author across many publications."""
    openalex_author_id: str
    display_names: Dict[str, int] = field(default_factory=lambda: defaultdict(int))  # name -> count
    institutions: Dict[str, int] = field(default_factory=lambda: defaultdict(int))   # institution -> count
    rors: Dict[str, int] = field(default_factory=lambda: defaultdict(int))           # ror -> count
    orcids: Set[str] = field(default_factory=set)
    pub_years: List[int] = field(default_factory=list)
    corpus_pub_count: int = 0

    def add_appearance(
        self,
        display_name: Optional[str],
        institution: Optional[str],
        ror: Optional[str],
        orcid: Optional[str],
        pub_year: Optional[int],
    ) -> None:
        self.corpus_pub_count += 1
        if display_name:
            self.display_names[display_name] += 1
        if institution:
            self.institutions[institution] += 1
        if ror:
            self.rors[ror] += 1
        if orcid:
            self.orcids.add(orcid)
        if pub_year:
            self.pub_years.append(pub_year)

    def most_common(self, counter: Dict[str, int]) -> Optional[str]:
        if not counter:
            return None
        return max(counter.items(), key=lambda kv: kv[1])[0]

    def first_seen_year(self) -> Optional[int]:
        return min(self.pub_years) if self.pub_years else None

    def last_seen_year(self) -> Optional[int]:
        return max(self.pub_years) if self.pub_years else None

    def primary_orcid(self) -> Optional[str]:
        # If multiple ORCIDs are claimed across papers for one OpenAlex author ID,
        # take whichever one appears (usually only one anyway).
        return next(iter(self.orcids), None) if self.orcids else None


@dataclass
class ScanStats:
    publications_scanned: int = 0
    publications_with_authorships: int = 0
    publications_skipped_no_authorships: int = 0
    total_author_appearances: int = 0
    distinct_authors_seen: int = 0
    authors_passing_threshold: int = 0
    inventory_rows_written: int = 0
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


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    if seconds < 3600:
        return f"{seconds / 60:.1f}m"
    return f"{seconds / 3600:.2f}h"


def normalize_openalex_id(raw: Any) -> Optional[str]:
    """OpenAlex author IDs are URLs like 'https://openalex.org/A5043626370'. Normalize."""
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip()
    return s if s else None


def chunked(items: Sequence, size: int) -> Iterable[Sequence]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


# ============================================================
# Authorship JSONB parsing
# ============================================================

def parse_authorship_entry(entry: Dict[str, Any], pub_year: Optional[int]) -> Optional[Tuple[str, Dict]]:
    """
    Parse one entry from a publications.authorships JSONB array.
    Returns (openalex_author_id, accumulator_kwargs) or None if invalid.

    OpenAlex authorship structure:
    {
      "author": {
        "id": "https://openalex.org/A5043626370",
        "display_name": "Harry L. A. Janssen",
        "orcid": "https://orcid.org/0000-..."
      },
      "institutions": [
        {"id": "...", "display_name": "...", "ror": "...", "country_code": "..."}
      ],
      "author_position": "first" | "middle" | "last",
      ...
    }
    """
    if not isinstance(entry, dict):
        return None

    author = entry.get("author")
    if not isinstance(author, dict):
        return None

    openalex_id = normalize_openalex_id(author.get("id"))
    if not openalex_id:
        return None

    display_name = author.get("display_name")
    if not isinstance(display_name, str):
        display_name = None

    orcid_raw = author.get("orcid")
    orcid = orcid_raw.strip() if isinstance(orcid_raw, str) and orcid_raw.strip() else None

    # Pick the first institution as primary
    institutions = entry.get("institutions")
    primary_institution: Optional[str] = None
    primary_ror: Optional[str] = None
    if isinstance(institutions, list) and institutions:
        first_inst = institutions[0]
        if isinstance(first_inst, dict):
            inst_name = first_inst.get("display_name")
            inst_ror = first_inst.get("ror")
            if isinstance(inst_name, str) and inst_name.strip():
                primary_institution = inst_name.strip()
            if isinstance(inst_ror, str) and inst_ror.strip():
                primary_ror = inst_ror.strip()

    return openalex_id, {
        "display_name": display_name,
        "institution": primary_institution,
        "ror": primary_ror,
        "orcid": orcid,
        "pub_year": pub_year,
    }


# ============================================================
# DB scan
# ============================================================

def fetch_publications_with_authorships(supabase: Client, target_version: str = "v1") -> Iterable[Dict]:
    """
    Yield publications with authorships JSONB populated, in batches.
    Uses keyset pagination (id > last_id) instead of offset-based pagination
    to avoid statement timeouts at high page numbers. Each yielded item is
    a row: {id, pub_year, authorships}.
    """
    publications_table = get_table_name("publications", target_version)
    last_id: Optional[str] = None
    page_size = 200  # smaller batches since authorships JSONB is heavy

    while True:
        try:
            query = (
                supabase.table(publications_table)
                .select("id, pub_year, authorships")
                .not_.is_("authorships", "null")
                .order("id")
                .limit(page_size)
            )
            if last_id is not None:
                query = query.gt("id", last_id)
            response = query.execute()
        except Exception as exc:
            raise RuntimeError(
                f"Failed to fetch publications (last_id={last_id}): {exc}"
            ) from exc

        batch = response.data or []
        if not batch:
            break

        for row in batch:
            yield row

        # Update cursor to last row's id
        last_id = batch[-1].get("id")
        if not last_id:
            break

        if len(batch) < page_size:
            break


# ============================================================
# DB write
# ============================================================

def truncate_inventory(supabase: Client) -> None:
    """Delete all rows in openalex_author_inventory (idempotent reset)."""
    try:
        response = supabase.table("openalex_author_inventory").delete().neq("openalex_author_id", "").execute()
        # Note: response.data may be empty if table was already empty,
        # which is a valid state (idempotent). We only flag silent failure
        # by allowing the .execute() exception to bubble.
    except Exception as exc:
        raise RuntimeError(f"Failed to truncate inventory: {exc}") from exc


def accumulator_to_row(acc: AuthorAccumulator) -> Dict[str, Any]:
    return {
        "openalex_author_id": acc.openalex_author_id,
        "display_name": acc.most_common(acc.display_names),
        "last_known_institution": acc.most_common(acc.institutions),
        "last_known_institution_ror": acc.most_common(acc.rors),
        "orcid": acc.primary_orcid(),
        "corpus_pub_count": acc.corpus_pub_count,
        "first_seen_pub_year": acc.first_seen_year(),
        "last_seen_pub_year": acc.last_seen_year(),
        "has_matching_hcp": False,
        "matching_hcp_id": None,
        "inventoried_at": datetime.now(timezone.utc).isoformat(),
    }


def upsert_inventory_batch(supabase: Client, rows: List[Dict[str, Any]], stats: ScanStats) -> None:
    if not rows:
        return
    try:
        response = supabase.table("openalex_author_inventory").upsert(
            rows,
            on_conflict="openalex_author_id",
        ).execute()
        if not response.data:
            raise RuntimeError(
                f"Batch upsert returned empty data ({len(rows)} rows) - "
                f"writes may have been silently dropped"
            )
        stats.inventory_rows_written += len(response.data)
    except Exception as exc:
        # On batch failure, fall back to row-by-row to identify offenders
        for r in rows:
            try:
                row_response = supabase.table("openalex_author_inventory").upsert(
                    r, on_conflict="openalex_author_id"
                ).execute()
                if not row_response.data:
                    stats.errors.append(
                        f"author {r.get('openalex_author_id')}: upsert returned empty data"
                    )
                else:
                    stats.inventory_rows_written += 1
            except Exception as e2:
                stats.errors.append(f"author {r.get('openalex_author_id')}: {repr(e2)[:200]}")


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Inventory OpenAlex authors from publications.authorships")
    parser.add_argument("--min-pubs", type=int, default=3,
                        help="Minimum corpus_pub_count threshold for writing to inventory (default 3)")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--truncate", action="store_true",
                        help="Truncate openalex_author_inventory before populating")
    parser.add_argument("--target-version", choices=["v1", "v2"], default="v1",
                        help="Schema version to read from. v1=legacy tables, v2=rebuild tables.")
    args = parser.parse_args()

    load_dotenv()
    supabase = init_supabase()
    stats = ScanStats()
    stats.started_at = datetime.now(timezone.utc)

    print("=" * 70)
    print("FieldMark v2.0 - Step A: OpenAlex Author Inventory")
    print("=" * 70)
    print(f"Started at: {stats.started_at.isoformat()}")
    print(f"Threshold: corpus_pub_count >= {args.min_pubs}")
    if args.dry_run:
        print("MODE: DRY RUN (no DB writes)")

    # Truncate if requested
    if args.truncate and not args.dry_run:
        print("\nTruncating openalex_author_inventory...")
        truncate_inventory(supabase)
        print("  Truncated.")

    # Pass 1: Scan all publications, accumulate per-author data in memory
    print("\n[Pass 1/2] Scanning publications.authorships...")
    accumulators: Dict[str, AuthorAccumulator] = {}
    scan_started = datetime.now(timezone.utc)

    for pub in fetch_publications_with_authorships(supabase, args.target_version):
        stats.publications_scanned += 1
        authorships = pub.get("authorships")
        if not isinstance(authorships, list):
            stats.publications_skipped_no_authorships += 1
            continue
        stats.publications_with_authorships += 1
        pub_year = pub.get("pub_year")

        for entry in authorships:
            parsed = parse_authorship_entry(entry, pub_year)
            if not parsed:
                continue
            openalex_id, kwargs = parsed
            stats.total_author_appearances += 1

            acc = accumulators.get(openalex_id)
            if acc is None:
                acc = AuthorAccumulator(openalex_author_id=openalex_id)
                accumulators[openalex_id] = acc
            acc.add_appearance(**kwargs)

        if stats.publications_scanned % PROGRESS_PRINT_EVERY == 0:
            elapsed = (datetime.now(timezone.utc) - scan_started).total_seconds()
            rate = stats.publications_scanned / elapsed if elapsed > 0 else 0
            print(f"  Scanned {stats.publications_scanned:,} publications  "
                  f"distinct_authors={len(accumulators):,}  "
                  f"appearances={stats.total_author_appearances:,}  "
                  f"rate={rate:.0f}/s")

    stats.distinct_authors_seen = len(accumulators)
    scan_elapsed = (datetime.now(timezone.utc) - scan_started).total_seconds()
    print(f"\n  Scan complete in {format_duration(scan_elapsed)}")
    print(f"  Publications scanned:    {stats.publications_scanned:,}")
    print(f"  With authorships:        {stats.publications_with_authorships:,}")
    print(f"  Author appearances:      {stats.total_author_appearances:,}")
    print(f"  Distinct authors:        {stats.distinct_authors_seen:,}")

    # Distribution summary
    print("\n  Author distribution by corpus_pub_count:")
    bucket_counts = defaultdict(int)
    for acc in accumulators.values():
        c = acc.corpus_pub_count
        if c == 1:
            bucket_counts["1 paper"] += 1
        elif c <= 4:
            bucket_counts["2-4 papers"] += 1
        elif c <= 9:
            bucket_counts["5-9 papers"] += 1
        elif c <= 24:
            bucket_counts["10-24 papers"] += 1
        elif c <= 49:
            bucket_counts["25-49 papers"] += 1
        else:
            bucket_counts["50+ papers"] += 1
    for bucket in ["1 paper", "2-4 papers", "5-9 papers", "10-24 papers", "25-49 papers", "50+ papers"]:
        if bucket in bucket_counts:
            print(f"    {bucket:>15s}: {bucket_counts[bucket]:>8,} authors")

    # Pass 2: Filter by threshold and upsert
    qualifying = [acc for acc in accumulators.values() if acc.corpus_pub_count >= args.min_pubs]
    stats.authors_passing_threshold = len(qualifying)
    print(f"\n  Authors passing threshold (>= {args.min_pubs} pubs): {len(qualifying):,}")

    if not args.dry_run and qualifying:
        print(f"\n[Pass 2/2] Writing inventory to database...")
        write_started = datetime.now(timezone.utc)
        total_to_write = len(qualifying)
        processed = 0

        for batch_accs in chunked(qualifying, DB_INSERT_BATCH_SIZE):
            rows = [accumulator_to_row(acc) for acc in batch_accs]
            upsert_inventory_batch(supabase, rows, stats)
            processed += len(rows)

            if processed % (DB_INSERT_BATCH_SIZE * 4) == 0 or processed >= total_to_write:
                elapsed = (datetime.now(timezone.utc) - write_started).total_seconds()
                rate = processed / elapsed if elapsed > 0 else 0
                pct = (processed / total_to_write * 100) if total_to_write else 100
                print(f"  Written {processed:,} / {total_to_write:,} ({pct:.1f}%)  "
                      f"rate={rate:.0f}/s")

    stats.completed_at = datetime.now(timezone.utc)
    total_elapsed = (stats.completed_at - stats.started_at).total_seconds()

    # Final summary
    print(f"\n{'=' * 70}")
    print(f"SUMMARY")
    print(f"{'=' * 70}")
    print(f"Total runtime:                {format_duration(total_elapsed)}")
    print(f"Publications scanned:         {stats.publications_scanned:,}")
    print(f"Distinct authors seen:        {stats.distinct_authors_seen:,}")
    print(f"Authors >= threshold:         {stats.authors_passing_threshold:,}")
    print(f"Inventory rows written:       {stats.inventory_rows_written:,}")
    if stats.errors:
        print(f"\nErrors ({len(stats.errors)}):")
        for e in stats.errors[:10]:
            print(f"  - {e}")
        if len(stats.errors) > 10:
            print(f"  ... ({len(stats.errors) - 10} more)")


if __name__ == "__main__":
    main()
