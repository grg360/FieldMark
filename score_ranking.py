"""
score_ranking.py

Shared rank computation for FieldMark scoring pipelines.

After a scoring script computes and upserts normalized scores for a cohort
(rising / established / community), it calls compute_and_write_ranks() to
populate hcp_score_ranks_v2 with country, region, and global ranks per
(hcp_id, therapeutic_area_id) pair.

Scope semantics:
  - country: rank within HCP's country (e.g. country='US')
  - region:  rank within HCP's region per the regions taxonomy. A single HCP
             can be ranked in multiple regions (GB is in both EU5 and UK).
  - global:  rank across all HCPs in this TA + cohort, regardless of country

HCPs with country=NULL receive only a global rank row.

This module is dry-run-aware: pass dry_run=True to compute ranks and print
diagnostics without writing.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
from uuid import UUID, uuid4

from supabase import Client


COHORTS = ("rising", "established", "community")
SCOPE_TYPES = ("country", "region", "global")


def _get(row: Any, key: str, default: Any = None) -> Any:
    """Access a field on either a dict or a dataclass-like object."""
    if isinstance(row, Mapping):
        return row.get(key, default)
    return getattr(row, key, default)


def _load_hcp_countries(client: Client, hcp_ids: Sequence[str]) -> Dict[str, Optional[str]]:
    """Return {hcp_id: country_code_or_None} for the given HCPs."""
    out: Dict[str, Optional[str]] = {}
    # Supabase has a practical .in_() ceiling; chunk to be safe.
    CHUNK = 500
    ids = list({str(h) for h in hcp_ids})
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i : i + CHUNK]
        resp = client.table("hcps_v2").select("id, country").in_("id", chunk).execute()
        for row in resp.data or []:
            out[str(row["id"])] = row.get("country")
    # HCPs not found get None (defensive)
    for hid in ids:
        out.setdefault(hid, None)
    return out


def _load_region_membership(client: Client) -> Dict[str, List[str]]:
    """Return {country_code: [region_key, ...]} from public.region_countries."""
    resp = client.table("region_countries").select("region_key, country_code").execute()
    membership: Dict[str, List[str]] = defaultdict(list)
    for row in resp.data or []:
        membership[row["country_code"]].append(row["region_key"])
    return dict(membership)


def _percentile(rank: int, scope_size: int) -> float:
    """Convert rank (1-based) and scope size to 0-100 percentile.
    Rank 1 in scope of 100 → 99.0 (top 1%).
    Rank scope_size in scope of N → 0.0 (bottom)."""
    if scope_size <= 1:
        return 100.0
    return round(((scope_size - rank) / (scope_size - 1)) * 100.0, 2)


def _rank_within_bucket(
    bucket_rows: List[Tuple[str, str, float]],
    scope_type: str,
    scope_value: Optional[str],
    cohort: str,
    rank_run_id: UUID,
    scoring_run_id: Optional[UUID],
) -> List[Dict[str, Any]]:
    """
    bucket_rows: list of (hcp_id, therapeutic_area_id, normalized_score)
    Returns rank rows ready for upsert.
    """
    if not bucket_rows:
        return []
    # Sort by score descending; stable on hcp_id for determinism
    sorted_rows = sorted(bucket_rows, key=lambda r: (-(r[2] if r[2] is not None else 0.0), r[0]))
    scope_size = len(sorted_rows)
    out: List[Dict[str, Any]] = []
    for idx, (hcp_id, ta_id, score) in enumerate(sorted_rows, start=1):
        out.append(
            {
                "hcp_id": str(hcp_id),
                "therapeutic_area_id": str(ta_id),
                "cohort": cohort,
                "scope_type": scope_type,
                "scope_value": scope_value,
                "rank": idx,
                "percentile": _percentile(idx, scope_size),
                "scope_size": scope_size,
                "score_at_rank": float(score) if score is not None else 0.0,
                "rank_run_id": str(rank_run_id),
                "scoring_run_id": str(scoring_run_id) if scoring_run_id else None,
            }
        )
    return out


def compute_and_write_ranks(
    client: Client,
    score_rows: Sequence[Any],
    cohort: str,
    rank_run_id: Optional[UUID] = None,
    scoring_run_id: Optional[UUID] = None,
    dry_run: bool = False,
    batch_size: int = 500,
) -> int:
    """
    Compute country/region/global ranks for each (hcp_id, therapeutic_area_id)
    pair in score_rows and upsert into hcp_score_ranks_v2.

    Args:
      client: Supabase client
      score_rows: Iterable of dicts or dataclass instances containing at minimum
                  hcp_id, therapeutic_area_id, normalized_score
      cohort: One of 'rising', 'established', 'community'
      rank_run_id: UUID for this rank computation run. Generated if not provided.
      scoring_run_id: Optional UUID linking ranks to the scoring run that produced
                      the underlying scores.
      dry_run: If True, compute and print stats without writing to DB.
      batch_size: Upsert batch size.

    Returns:
      Total count of rank rows that would be (or were) written.
    """
    if cohort not in COHORTS:
        raise ValueError(f"cohort must be one of {COHORTS}, got {cohort!r}")
    if not score_rows:
        print(f"[score_ranking] No score rows for cohort={cohort}. Nothing to rank.")
        return 0

    if rank_run_id is None:
        rank_run_id = uuid4()
    print(f"[score_ranking] cohort={cohort} rank_run_id={rank_run_id} dry_run={dry_run}")

    # Extract minimal tuples and gather unique HCP IDs
    tuples: List[Tuple[str, str, float]] = []
    hcp_ids = set()
    for row in score_rows:
        hid = _get(row, "hcp_id")
        tid = _get(row, "therapeutic_area_id")
        score = _get(row, "normalized_score")
        if hid is None or tid is None:
            continue
        if score is None:
            continue
        tuples.append((str(hid), str(tid), float(score)))
        hcp_ids.add(str(hid))

    if not tuples:
        print(f"[score_ranking] No usable rows (missing hcp_id / ta_id / normalized_score).")
        return 0

    print(f"[score_ranking] {len(tuples)} ranking rows across {len(hcp_ids)} unique HCPs")

    # Load lookups
    print("[score_ranking] Loading HCP countries...")
    hcp_country = _load_hcp_countries(client, list(hcp_ids))
    print("[score_ranking] Loading region membership...")
    region_membership = _load_region_membership(client)

    # Bucketize: (scope_type, scope_value, ta_id) -> list of (hcp_id, ta_id, score)
    buckets: Dict[Tuple[str, Optional[str], str], List[Tuple[str, str, float]]] = defaultdict(list)
    for hid, tid, score in tuples:
        country = hcp_country.get(hid)

        # Global: every HCP, every TA
        buckets[("global", None, tid)].append((hid, tid, score))

        # Country: only HCPs with a known country
        if country:
            buckets[("country", country, tid)].append((hid, tid, score))

            # Region: every region this country belongs to
            for region_key in region_membership.get(country, []):
                buckets[("region", region_key, tid)].append((hid, tid, score))

    print(f"[score_ranking] Computing ranks across {len(buckets)} (scope, ta) buckets...")

    rank_rows: List[Dict[str, Any]] = []
    for (scope_type, scope_value, _ta_id), rows in buckets.items():
        rank_rows.extend(
            _rank_within_bucket(
                rows, scope_type, scope_value, cohort, rank_run_id, scoring_run_id
            )
        )

    # Stats by scope
    by_scope: Dict[str, int] = defaultdict(int)
    for r in rank_rows:
        by_scope[r["scope_type"]] += 1
    print(f"[score_ranking] Generated {len(rank_rows)} rank rows: " + 
          ", ".join(f"{k}={v}" for k, v in sorted(by_scope.items())))

    if dry_run:
        print(f"[DRY RUN] Would upsert {len(rank_rows)} rank rows.")
        return len(rank_rows)

    # Batch upsert
    written = 0
    for i in range(0, len(rank_rows), batch_size):
        batch = rank_rows[i : i + batch_size]
        response = client.table("hcp_score_ranks_v2").upsert(
            batch,
            on_conflict="hcp_id,therapeutic_area_id,cohort,scope_type,scope_value",
        ).execute()
        returned = len(response.data) if response.data else 0
        if returned != len(batch):
            print(f"[score_ranking] WARNING: batch i={i} sent {len(batch)} rows, db returned {returned}")
        written += returned
        if (i // batch_size) % 10 == 0:
            print(f"[score_ranking]   upserted {written}/{len(rank_rows)}...")

    print(f"[score_ranking] Wrote {written} rank rows to hcp_score_ranks_v2.")
    return written
