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
UPSERT_BATCH_SIZE = 500


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


def fetch_unmatched_hcps_page(supabase: Client, offset: int, limit: int) -> List[Dict]:
    response = (
        supabase.table("hcps")
        .select("id,first_name,last_name,state")
        .eq("country", "USA")
        .is_("npi_number", "null")
        .order("id")
        .range(offset, offset + limit - 1)
        .execute()
    )
    return response.data or []


def fetch_unmatched_hcps_count(supabase: Client) -> int:
    response = (
        supabase.table("hcps")
        .select("id", count="estimated")
        .eq("country", "USA")
        .is_("npi_number", "null")
        .limit(1)
        .execute()
    )
    return int(response.count or 0)


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
    load_dotenv()
    started = time.time()
    supabase = init_supabase()

    print("Loading NPPES parquet...")
    nppes_df = load_nppes_df()

    total_hcps = fetch_unmatched_hcps_count(supabase)
    print(f"Loaded {total_hcps} unmatched US HCPs")

    tier_counts: Counter = Counter()
    status_counts: Counter = Counter()

    processed = 0
    offset = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    while True:
        hcp_page = fetch_unmatched_hcps_page(supabase, offset, HCP_PAGE_SIZE)
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
    print(f"Total runtime: {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()

