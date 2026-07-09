"""
NPPES matcher: propose NPI matches for unmatched US HCPs.

Expected Supabase table: npi_match_proposals
Columns:
  hcp_id UUID
  npi TEXT
  npi_first_name TEXT
  npi_last_name TEXT
  npi_credentials TEXT
  npi_practice_city TEXT
  npi_practice_state TEXT
  npi_practice_zip TEXT
  npi_practice_address TEXT
  npi_taxonomy_codes TEXT[]
  npi_primary_taxonomy TEXT
  match_tier INTEGER
  match_confidence INTEGER
  match_status TEXT
  match_calculated_at TIMESTAMPTZ
  candidates_found INTEGER
"""

from __future__ import annotations

import argparse
import os
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Tuple, Union

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

PARQUET_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet"
HCP_PAGE_SIZE = 1000
HCP_ID_CHUNK = 200
UPSERT_BATCH_SIZE = 500

# AD ta_id default; resolved from --ta slug at runtime.
DEFAULT_TA_SLUG = "atopic-dermatitis"

_ELIGIBLE_HCPS_CACHE: Dict[str, List[Dict]] = {}


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ns(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def norm_first(value: Optional[str]) -> str:
    raw = ns(value).lower()
    return raw.split()[0] if raw else ""


def norm_state(value: Optional[str]) -> str:
    return ns(value).upper()


def load_nppes_df() -> pd.DataFrame:
    df = pd.read_parquet(PARQUET_PATH, dtype_backend="numpy_nullable")
    required = [
        "npi",
        "first_name",
        "last_name",
        "middle_name",
        "credentials",
        "practice_city",
        "practice_state",
        "practice_zip",
        "practice_address",
        "taxonomy_1",
        "primary_taxonomy_switch_1",
        "taxonomy_2",
        "primary_taxonomy_switch_2",
        "taxonomy_3",
        "primary_taxonomy_switch_3",
        "taxonomy_4",
        "primary_taxonomy_switch_4",
        "taxonomy_5",
        "primary_taxonomy_switch_5",
    ]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise RuntimeError(f"NPPES parquet missing required columns: {missing}")

    for col in required:
        df[col] = df[col].astype(str)

    df["last_name_norm"] = df["last_name"].str.lower().str.strip()
    df["first_name_norm"] = df["first_name"].str.lower().str.strip()
    df["has_middle_name"] = df["middle_name"].map(lambda v: 1 if ns(v) else 0)
    df = df.set_index(["last_name_norm", "practice_state"]).sort_index()
    return df


def _ensure_dataframe(result: Union[pd.DataFrame, pd.Series]) -> pd.DataFrame:
    if isinstance(result, pd.Series):
        return result.to_frame().T
    return result


def resolve_ta_id(supabase: Client, slug: str) -> str:
    response = (
        supabase.table("therapeutic_areas")
        .select("id")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError(f"No therapeutic_area found with slug='{slug}'")
    return str(rows[0]["id"])


def fetch_community_hcp_ids(supabase: Client, ta_id: str) -> List[str]:
    """Step 1: AD community cohort hcp_ids from hcp_cohort_classification_v2."""
    ids: List[str] = []
    offset = 0
    while True:
        batch = (
            supabase.table("hcp_cohort_classification_v2")
            .select("hcp_id")
            .eq("therapeutic_area_id", ta_id)
            .eq("cohort", "community")
            .order("hcp_id")
            .range(offset, offset + HCP_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        ids.extend(str(row["hcp_id"]) for row in batch if row.get("hcp_id"))
        if len(batch) < HCP_PAGE_SIZE:
            break
        offset += HCP_PAGE_SIZE
    return ids


def hcp_state_from_v2(row: Dict) -> str:
    """COALESCE(nppes_practice_state, derived_state) for NPPES state matching."""
    return norm_state(row.get("nppes_practice_state") or row.get("derived_state"))


def load_eligible_unmatched_hcps(supabase: Client, ta_id: str) -> List[Dict]:
    """
    Two-step v2 cohort load:
      1) community hcp_ids for scoped TA from hcp_cohort_classification_v2
      2) hcps_v2 rows: id IN cohort, npi_number IS NULL, US-identifiable via state
    """
    if ta_id in _ELIGIBLE_HCPS_CACHE:
        return _ELIGIBLE_HCPS_CACHE[ta_id]

    community_ids = fetch_community_hcp_ids(supabase, ta_id)
    eligible: List[Dict] = []

    for i in range(0, len(community_ids), HCP_ID_CHUNK):
        chunk = community_ids[i : i + HCP_ID_CHUNK]
        offset = 0
        while True:
            batch = (
                supabase.table("hcps_v2")
                .select("id,first_name,last_name,nppes_practice_state,derived_state")
                .in_("id", chunk)
                .is_("npi_number", "null")
                .or_("derived_state.not.is.null,nppes_practice_state.not.is.null")
                .order("id")
                .range(offset, offset + HCP_PAGE_SIZE - 1)
                .execute()
                .data
                or []
            )
            if not batch:
                break
            for row in batch:
                state = hcp_state_from_v2(row)
                if not state:
                    continue
                eligible.append(
                    {
                        "id": row["id"],
                        "first_name": row.get("first_name"),
                        "last_name": row.get("last_name"),
                        "state": state,
                    }
                )
            if len(batch) < HCP_PAGE_SIZE:
                break
            offset += HCP_PAGE_SIZE

    eligible.sort(key=lambda row: str(row["id"]))
    _ELIGIBLE_HCPS_CACHE[ta_id] = eligible
    return eligible


def fetch_unmatched_hcps_page(
    supabase: Client,
    ta_id: str,
    offset: int,
    limit: int,
) -> List[Dict]:
    eligible = load_eligible_unmatched_hcps(supabase, ta_id)
    return eligible[offset : offset + limit]


def fetch_unmatched_hcps_count(supabase: Client, ta_id: str) -> int:
    return len(load_eligible_unmatched_hcps(supabase, ta_id))


def candidate_taxonomy_codes(row: pd.Series) -> List[str]:
    values: List[str] = []
    for i in range(1, 6):
        code = ns(row.get(f"taxonomy_{i}"))
        if code:
            values.append(code)
    return values


def primary_taxonomy_code(row: pd.Series) -> Optional[str]:
    for i in range(1, 6):
        switch = ns(row.get(f"primary_taxonomy_switch_{i}")).upper()
        if switch == "Y":
            code = ns(row.get(f"taxonomy_{i}"))
            return code or None
    return None


def name_state_candidates(
    nppes_df: pd.DataFrame,
    hcp_first: str,
    hcp_last_norm: str,
    hcp_state: str,
) -> pd.DataFrame:
    if not hcp_state:
        return pd.DataFrame()
    try:
        group = nppes_df.loc[(hcp_last_norm, hcp_state)]
    except KeyError:
        return pd.DataFrame()
    group = _ensure_dataframe(group)
    if group.empty:
        return pd.DataFrame()
    group = group.reset_index()

    group_first_lower = group["first_name_norm"].astype(str).str.lower()
    hcp_first_lower = hcp_first.lower() if hcp_first else ""

    if len(hcp_first_lower) <= 3:
        return group[group_first_lower.eq(hcp_first_lower)]

    exact = group_first_lower.eq(hcp_first_lower)
    starts_with_boundary = group_first_lower.str.startswith(hcp_first_lower + " ") | group_first_lower.str.startswith(
        hcp_first_lower + "."
    )
    return group[exact | starts_with_boundary]


def name_only_candidates(
    nppes_df: pd.DataFrame,
    hcp_first: str,
    hcp_last_norm: str,
) -> pd.DataFrame:
    try:
        group = nppes_df.xs(hcp_last_norm, level=0)
    except KeyError:
        return pd.DataFrame()
    group = _ensure_dataframe(group)
    if group.empty:
        return pd.DataFrame()
    group = group.reset_index()

    group_first_lower = group["first_name_norm"].astype(str).str.lower()
    hcp_first_lower = hcp_first.lower() if hcp_first else ""

    if len(hcp_first_lower) <= 3:
        return group[group_first_lower.eq(hcp_first_lower)]

    exact = group_first_lower.eq(hcp_first_lower)
    starts_with_boundary = group_first_lower.str.startswith(hcp_first_lower + " ") | group_first_lower.str.startswith(
        hcp_first_lower + "."
    )
    return group[exact | starts_with_boundary]


def disambiguate_multi(candidates: pd.DataFrame, hcp_first: str) -> Tuple[Optional[pd.Series], bool]:
    if candidates.empty:
        return None, False
    scored = candidates.copy()
    scored["first_name_len"] = scored["first_name_norm"].map(len)
    scored["first_name_exact"] = scored["first_name_norm"].eq(hcp_first).map(lambda v: 1 if v else 0)
    scored = scored.sort_values(
        by=["first_name_exact", "first_name_len", "has_middle_name"],
        ascending=[False, False, False],
    )
    if len(scored) == 1:
        return scored.iloc[0], False

    top = scored.iloc[0]
    second = scored.iloc[1]
    top_key = (int(top["first_name_exact"]), int(top["first_name_len"]), int(top["has_middle_name"]))
    second_key = (int(second["first_name_exact"]), int(second["first_name_len"]), int(second["has_middle_name"]))
    if top_key == second_key:
        return top, True
    return top, False


def proposal_row(
    hcp_id: str,
    candidate: Optional[pd.Series],
    tier: int,
    confidence: Optional[int],
    status: str,
    candidates_found: int,
    now_iso: str,
) -> Dict:
    if candidate is None:
        return {
            "hcp_id": hcp_id,
            "npi": None,
            "npi_first_name": None,
            "npi_last_name": None,
            "npi_credentials": None,
            "npi_practice_city": None,
            "npi_practice_state": None,
            "npi_practice_zip": None,
            "npi_practice_address": None,
            "npi_taxonomy_codes": [],
            "npi_primary_taxonomy": None,
            "match_tier": tier,
            "match_confidence": confidence,
            "match_status": status,
            "match_calculated_at": now_iso,
            "candidates_found": candidates_found,
        }

    return {
        "hcp_id": hcp_id,
        "npi": ns(candidate.get("npi")) or None,
        "npi_first_name": ns(candidate.get("first_name")) or None,
        "npi_last_name": ns(candidate.get("last_name")) or None,
        "npi_credentials": ns(candidate.get("credentials")) or None,
        "npi_practice_city": ns(candidate.get("practice_city")) or None,
        "npi_practice_state": ns(candidate.get("practice_state")) or None,
        "npi_practice_zip": ns(candidate.get("practice_zip")) or None,
        "npi_practice_address": ns(candidate.get("practice_address")) or None,
        "npi_taxonomy_codes": candidate_taxonomy_codes(candidate),
        "npi_primary_taxonomy": primary_taxonomy_code(candidate),
        "match_tier": tier,
        "match_confidence": confidence,
        "match_status": status,
        "match_calculated_at": now_iso,
        "candidates_found": candidates_found,
    }


def bulk_upsert_proposals(supabase: Client, rows: Sequence[Dict]) -> None:
    if not rows:
        return
    for start in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[start : start + UPSERT_BATCH_SIZE]
        supabase.table("npi_match_proposals").upsert(batch, on_conflict="hcp_id").execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Propose NPI matches for unmatched US community HCPs")
    parser.add_argument("--ta", default=DEFAULT_TA_SLUG, help="Therapeutic area slug")
    parser.add_argument("--dry-run", action="store_true", help="Compute matches but skip DB writes")
    args = parser.parse_args()

    load_dotenv()
    started = time.time()
    supabase = init_supabase()
    ta_id = resolve_ta_id(supabase, args.ta)

    print(f"TA={args.ta} (ta_id={ta_id})")
    print(f"Mode: {'DRY-RUN (no writes)' if args.dry_run else 'EXECUTE (writes enabled)'}")

    print("Loading NPPES parquet...")
    nppes_df = load_nppes_df()

    total_hcps = fetch_unmatched_hcps_count(supabase, ta_id)
    print(f"Loaded {total_hcps} unmatched US community HCPs (v2, state-set, no NPI)")

    tier_counts: Counter = Counter()
    status_counts: Counter = Counter()

    processed = 0
    offset = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    while True:
        hcp_page = fetch_unmatched_hcps_page(supabase, ta_id, offset, HCP_PAGE_SIZE)
        if not hcp_page:
            break

        proposals: List[Dict] = []
        for hcp in hcp_page:
            hcp_id = str(hcp["id"])
            hcp_first = norm_first(hcp.get("first_name"))
            hcp_last_norm = str(hcp.get("last_name") or "").strip().lower()
            hcp_state = norm_state(hcp.get("state"))

            if not hcp_first or not hcp_last_norm:
                tier = 4
                status = "no_match"
                confidence = None
                candidate = None
                candidates_found = 0
                proposals.append(proposal_row(hcp_id, candidate, tier, confidence, status, candidates_found, now_iso))
                tier_counts[tier] += 1
                status_counts[status] += 1
                continue

            # Tier 1 / 2: state-aware
            state_candidates = pd.DataFrame()
            if hcp_state:
                state_candidates = name_state_candidates(nppes_df, hcp_first, hcp_last_norm, hcp_state)

            if len(state_candidates) == 1:
                candidate = state_candidates.iloc[0]
                tier = 1
                confidence = 95
                status = "matched_high"
                candidates_found = 1
                proposals.append(proposal_row(hcp_id, candidate, tier, confidence, status, candidates_found, now_iso))
                tier_counts[tier] += 1
                status_counts[status] += 1
                continue

            if len(state_candidates) > 1:
                candidates_found = len(state_candidates)
                best, ambiguous = disambiguate_multi(state_candidates, hcp_first)
                if ambiguous:
                    tier = 4
                    confidence = None
                    status = "ambiguous"
                else:
                    tier = 2
                    confidence = 85
                    status = "matched_medium"
                proposals.append(proposal_row(hcp_id, best, tier, confidence, status, candidates_found, now_iso))
                tier_counts[tier] += 1
                status_counts[status] += 1
                continue

            # Tier 3 / 4: state missing only
            if not hcp_state:
                nationwide = name_only_candidates(nppes_df, hcp_first, hcp_last_norm)
                n = len(nationwide)
                if n == 1:
                    tier = 3
                    confidence = 70
                    status = "review_pending"
                    candidate = nationwide.iloc[0]
                elif 2 <= n <= 5:
                    best, _amb = disambiguate_multi(nationwide, hcp_first)
                    tier = 3
                    confidence = 50
                    status = "review_pending"
                    candidate = best
                elif n >= 6:
                    best, _amb = disambiguate_multi(nationwide, hcp_first)
                    tier = 4
                    confidence = None
                    status = "ambiguous"
                    candidate = best
                else:
                    tier = 4
                    confidence = None
                    status = "no_match"
                    candidate = None
                proposals.append(proposal_row(hcp_id, candidate, tier, confidence, status, n, now_iso))
                tier_counts[tier] += 1
                status_counts[status] += 1
                continue

            # No state-aware candidates and state is present -> no match
            tier = 4
            confidence = None
            status = "no_match"
            candidate = None
            candidates_found = 0
            proposals.append(proposal_row(hcp_id, candidate, tier, confidence, status, candidates_found, now_iso))
            tier_counts[tier] += 1
            status_counts[status] += 1

        if not args.dry_run:
            bulk_upsert_proposals(supabase, proposals)

        processed += len(hcp_page)
        if processed % 1000 == 0 or processed == total_hcps:
            print(
                f"Processed {processed} of total {total_hcps} HCPs. "
                f"Tier 1: {tier_counts.get(1, 0)}, Tier 2: {tier_counts.get(2, 0)}, "
                f"Tier 3: {tier_counts.get(3, 0)}, Tier 4: {tier_counts.get(4, 0)} "
                f"(no match: {status_counts.get('no_match', 0)}, ambiguous: {status_counts.get('ambiguous', 0)})"
            )

        if len(hcp_page) < HCP_PAGE_SIZE:
            break
        offset += HCP_PAGE_SIZE

    print("\n=== NPPES Matcher Summary ===")
    print(f"Total HCPs processed: {processed}")
    print("Tier distribution:")
    print(f"  Tier 1: {tier_counts.get(1, 0)}")
    print(f"  Tier 2: {tier_counts.get(2, 0)}")
    print(f"  Tier 3: {tier_counts.get(3, 0)}")
    print(f"  Tier 4: {tier_counts.get(4, 0)}")
    print("Status distribution:")
    for status in ["matched_high", "matched_medium", "review_pending", "no_match", "ambiguous"]:
        print(f"  {status}: {status_counts.get(status, 0)}")
    print(f"Estimated v1 application count (Tier 1 + Tier 2): {tier_counts.get(1, 0) + tier_counts.get(2, 0)}")
    if args.dry_run:
        print("[dry-run] skipped npi_match_proposals upsert")
    print(f"Total runtime: {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()

