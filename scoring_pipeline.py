"""
FieldMark scoring pipeline (v1.1).

This script:
1) Reads data from Supabase tables:
   hcps, publications, clinical_trials, trial_investigators,
   hcp_therapeutic_areas, therapeutic_areas
2) Calculates component scores for each HCP x therapeutic area:
   - Publication velocity (25%)
   - Citation trajectory (20%)
   - Trial investigator score (30%)
   - Cross signal bonus multiplier (1.15 if both pub+trial signals)
   - Recency weight (10%)
3) Computes composite score (0-100).
4) Writes results to hcp_scores.
5) Prints top 20 rising stars per therapeutic area.

Uses python-dotenv for environment variables.
Required env vars:
  SUPABASE_URL
  SUPABASE_KEY
"""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

SCORE_VERSION = "v1.1"
TOP_N_PER_TA = 20


@dataclass
class ScoreRow:
    hcp_id: str
    therapeutic_area_id: str
    composite_score: float
    pub_velocity_score: float
    citation_trajectory_score: float
    trial_investigator_score: float
    congress_score: float
    msl_signal_score: float
    score_version: str
    calculated_at: str
    first_pub_year: Optional[int]
    career_multiplier: float


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def fetch_all_rows(supabase: Client, table: str, columns: str, page_size: int = 1000) -> List[Dict]:
    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table(table)
                .select(columns)
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed reading table '{table}': {exc}") from exc

        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def normalize_0_100(values: Dict[Tuple[str, str], float]) -> Dict[Tuple[str, str], float]:
    if not values:
        return {}
    min_v = min(values.values())
    max_v = max(values.values())
    if math.isclose(min_v, max_v):
        return {k: 50.0 for k in values}
    return {k: max(0.0, min(100.0, ((v - min_v) / (max_v - min_v)) * 100.0)) for k, v in values.items()}


def safe_int(value: Optional[object], default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_date(value: Optional[object]) -> Optional[date]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            dt = datetime.strptime(raw, fmt)
            if fmt == "%Y":
                return date(dt.year, 1, 1)
            if fmt == "%Y-%m":
                return date(dt.year, dt.month, 1)
            return dt.date()
        except ValueError:
            continue
    return None


def parse_year_to_date(pub_year: Optional[object]) -> Optional[date]:
    year = safe_int(pub_year, default=0)
    if year <= 0:
        return None
    return date(year, 12, 31)


def phase_bucket(phase_value: Optional[str]) -> Optional[int]:
    if not phase_value:
        return None
    text = phase_value.lower()
    # Prefer highest phase mentioned when multiple are present.
    if "phase 3" in text or "phase iii" in text:
        return 3
    if "phase 2" in text or "phase ii" in text:
        return 2
    if "phase 1" in text or "phase i" in text:
        return 1
    return None


def role_bucket(role_value: Optional[str]) -> str:
    if not role_value:
        return "other"
    text = role_value.lower()
    if "principal investigator" in text or re.search(r"\bpi\b", text):
        return "pi"
    if "co-investigator" in text or "co investigator" in text or "sub-investigator" in text:
        return "coi"
    return "other"


def trial_role_phase_weight(role: Optional[str], phase: Optional[str]) -> float:
    p = phase_bucket(phase)
    r = role_bucket(role)
    if p == 3 and r == "pi":
        return 100.0
    if p == 2 and r == "pi":
        return 80.0
    if p == 3 and r == "coi":
        return 60.0
    if p == 2 and r == "coi":
        return 50.0
    if p == 1:
        return 30.0
    return 20.0


def publication_velocity_raw(pub_years: Sequence[int], current_year: int) -> float:
    """
    Curve-based publication acceleration over active career years.
    Higher when yearly publication counts are accelerating (e.g. 1 -> 3 -> 6),
    lower when output is flat over time (e.g. 8 -> 8 -> 8).
    """
    if not pub_years:
        return -1.0

    first_year = min(pub_years)
    last_year = current_year
    if first_year > last_year:
        return -1.0

    counts: Dict[int, int] = {}
    for y in range(first_year, last_year + 1):
        counts[y] = 0
    for y in pub_years:
        if y in counts:
            counts[y] += 1

    series = [counts[y] for y in range(first_year, last_year + 1)]
    if len(series) == 1:
        return 0.0

    # Focus on the latest 3 active years to capture "rising now" momentum.
    recent_window = series[-3:] if len(series) >= 3 else series
    start = recent_window[0]
    end = recent_window[-1]
    trend_gain = (end - start) / max(start, 1)

    # Second derivative style acceleration on the recent window.
    acceleration = 0.0
    if len(recent_window) >= 3:
        d1 = recent_window[1] - recent_window[0]
        d2 = recent_window[2] - recent_window[1]
        acceleration = d2 - d1

    # Positive trend + acceleration => high raw velocity.
    return (trend_gain * 0.7) + (acceleration * 0.3)


def career_age_multiplier(first_pub_year: Optional[int]) -> float:
    if first_pub_year is None:
        return 1.0
    if first_pub_year >= 2020:
        return 1.30
    if 2017 <= first_pub_year <= 2019:
        return 1.15
    if 2011 <= first_pub_year <= 2016:
        return 1.0
    return 0.75


def citation_trajectory_raw(publications: Sequence[Dict], current_year: int) -> float:
    """
    Growth in citation density on recent vs older publications.
    Recent = last 3 years; older = all prior years.
    """
    recent: List[float] = []
    older: List[float] = []

    for pub in publications:
        pub_year = safe_int(pub.get("pub_year"), 0)
        if pub_year <= 0:
            continue
        citations = max(0, safe_int(pub.get("citation_count"), 0))
        age = max(1, current_year - pub_year + 1)
        citation_density = citations / age
        if pub_year >= current_year - 2:
            recent.append(citation_density)
        else:
            older.append(citation_density)

    recent_avg = sum(recent) / len(recent) if recent else 0.0
    older_avg = sum(older) / len(older) if older else 0.0
    baseline = max(older_avg, 1.0)
    return (recent_avg - older_avg) / baseline


def recency_score(last_activity: Optional[date], now_date: date) -> float:
    """
    10% decay per year of inactivity beyond 12 months.
    """
    if last_activity is None:
        return 0.0
    days_since = (now_date - last_activity).days
    if days_since <= 365:
        return 100.0
    extra_years = (days_since - 365) / 365.0
    return max(0.0, min(100.0, 100.0 * (0.9 ** extra_years)))


def compute_trial_score(trial_links: Sequence[Dict], trials_by_id: Dict[str, Dict]) -> float:
    if not trial_links:
        return 0.0

    weights: List[float] = []
    unique_trial_ids = set()
    for link in trial_links:
        trial_id = link.get("trial_id")
        if not trial_id:
            continue
        trial = trials_by_id.get(trial_id)
        if not trial:
            continue
        unique_trial_ids.add(trial_id)
        weights.append(trial_role_phase_weight(link.get("role"), trial.get("phase")))

    if not weights:
        return 0.0

    base = sum(weights) / len(weights)
    additional_trials = max(0, len(unique_trial_ids) - 1)
    bonus_multiplier = 1.0 + (0.10 * additional_trials)
    score = base * bonus_multiplier
    return max(0.0, min(100.0, score))


def build_lookup_maps(
    publications: Sequence[Dict],
    trial_investigators: Sequence[Dict],
    clinical_trials: Sequence[Dict],
) -> Tuple[Dict[str, List[Dict]], Dict[str, List[Dict]], Dict[str, Dict]]:
    pubs_by_hcp: Dict[str, List[Dict]] = {}
    for pub in publications:
        hcp_id = pub.get("hcp_id")
        if hcp_id:
            pubs_by_hcp.setdefault(hcp_id, []).append(pub)

    links_by_hcp: Dict[str, List[Dict]] = {}
    for link in trial_investigators:
        hcp_id = link.get("hcp_id")
        if hcp_id:
            links_by_hcp.setdefault(hcp_id, []).append(link)

    trials_by_id: Dict[str, Dict] = {}
    for trial in clinical_trials:
        tid = trial.get("id")
        if tid:
            trials_by_id[tid] = trial

    return pubs_by_hcp, links_by_hcp, trials_by_id


def compute_scores(
    hcp_tas: Sequence[Dict],
    publications: Sequence[Dict],
    trial_investigators: Sequence[Dict],
    clinical_trials: Sequence[Dict],
) -> List[ScoreRow]:
    now_dt = datetime.now(timezone.utc).date()
    current_year = now_dt.year

    pubs_by_hcp, links_by_hcp, trials_by_id = build_lookup_maps(
        publications=publications,
        trial_investigators=trial_investigators,
        clinical_trials=clinical_trials,
    )

    raw_pub_velocity: Dict[Tuple[str, str], float] = {}
    raw_citation: Dict[Tuple[str, str], float] = {}
    trial_scores: Dict[Tuple[str, str], float] = {}
    recency_scores: Dict[Tuple[str, str], float] = {}
    has_pub_and_trial: Dict[Tuple[str, str], bool] = {}
    first_pub_year_by_hcp: Dict[str, Optional[int]] = {}

    valid_pairs: List[Tuple[str, str]] = []
    for rel in hcp_tas:
        hcp_id = rel.get("hcp_id")
        ta_id = rel.get("therapeutic_area_id")
        if not hcp_id or not ta_id:
            continue

        key = (hcp_id, ta_id)
        valid_pairs.append(key)

        hcp_pubs = pubs_by_hcp.get(hcp_id, [])
        hcp_links = links_by_hcp.get(hcp_id, [])

        pub_years = [safe_int(pub.get("pub_year"), 0) for pub in hcp_pubs if safe_int(pub.get("pub_year"), 0) > 0]
        first_pub_year_by_hcp[hcp_id] = min(pub_years) if pub_years else None
        raw_pub_velocity[key] = publication_velocity_raw(pub_years, current_year) if pub_years else -1.0
        raw_citation[key] = citation_trajectory_raw(hcp_pubs, current_year) if hcp_pubs else -1.0
        trial_scores[key] = compute_trial_score(hcp_links, trials_by_id)

        pub_activity_dates = [parse_year_to_date(pub.get("pub_year")) for pub in hcp_pubs]
        trial_activity_dates = []
        for link in hcp_links:
            trial = trials_by_id.get(link.get("trial_id"))
            if not trial:
                continue
            trial_activity_dates.append(parse_date(trial.get("completion_date")))
            trial_activity_dates.append(parse_date(trial.get("start_date")))

        candidates = [d for d in (pub_activity_dates + trial_activity_dates) if d is not None]
        last_activity = max(candidates) if candidates else None
        recency_scores[key] = recency_score(last_activity, now_dt)

        has_pub_and_trial[key] = bool(hcp_pubs) and bool(hcp_links)

    pub_velocity_scores = normalize_0_100(raw_pub_velocity)
    citation_scores = normalize_0_100(raw_citation)

    rows: List[ScoreRow] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for key in valid_pairs:
        hcp_id, ta_id = key
        pub_velocity = pub_velocity_scores.get(key, 0.0)
        citation = citation_scores.get(key, 0.0)
        trial_score = trial_scores.get(key, 0.0)
        recency = recency_scores.get(key, 0.0)
        cross_multiplier = 1.15 if has_pub_and_trial.get(key, False) else 1.0
        first_pub_year = first_pub_year_by_hcp.get(hcp_id)
        career_multiplier = career_age_multiplier(first_pub_year)

        weighted_base = (
            (0.25 * pub_velocity)
            + (0.20 * citation)
            + (0.30 * trial_score)
            + (0.10 * recency)
        )
        # Cross-signal bonus is applied as a multiplier.
        composite_uncapped = weighted_base * cross_multiplier * career_multiplier
        composite = max(0.0, min(100.0, composite_uncapped))

        rows.append(
            ScoreRow(
                hcp_id=hcp_id,
                therapeutic_area_id=ta_id,
                composite_score=round(composite, 4),
                pub_velocity_score=round(pub_velocity, 4),
                citation_trajectory_score=round(citation, 4),
                trial_investigator_score=round(trial_score, 4),
                congress_score=0.0,
                msl_signal_score=0.0,
                score_version=SCORE_VERSION,
                calculated_at=now_iso,
                first_pub_year=first_pub_year,
                career_multiplier=round(career_multiplier, 4),
            )
        )

    return rows


def upsert_scores(supabase: Client, score_rows: Sequence[ScoreRow]) -> int:
    if not score_rows:
        return 0

    payload = [
        {
            "hcp_id": row.hcp_id,
            "therapeutic_area_id": row.therapeutic_area_id,
            "composite_score": row.composite_score,
            "pub_velocity_score": row.pub_velocity_score,
            "citation_trajectory_score": row.citation_trajectory_score,
            "trial_investigator_score": row.trial_investigator_score,
            "congress_score": row.congress_score,
            "msl_signal_score": row.msl_signal_score,
            "score_version": row.score_version,
            "calculated_at": row.calculated_at,
        }
        for row in score_rows
    ]

    try:
        # Recommended unique index for deterministic updates:
        # unique (hcp_id, therapeutic_area_id, score_version)
        supabase.table("hcp_scores").upsert(
            payload,
            on_conflict="hcp_id,therapeutic_area_id,score_version",
        ).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed to upsert hcp_scores: {exc}") from exc
    return len(payload)


def print_top_rising_stars(
    score_rows: Sequence[ScoreRow],
    hcps: Sequence[Dict],
    therapeutic_areas: Sequence[Dict],
    top_n: int = TOP_N_PER_TA,
) -> None:
    hcp_name_map = {
        row["id"]: f'{row.get("first_name", "")} {row.get("last_name", "")}'.strip()
        for row in hcps
        if row.get("id")
    }
    ta_name_map = {row["id"]: row.get("name", row["id"]) for row in therapeutic_areas if row.get("id")}

    by_ta: Dict[str, List[ScoreRow]] = {}
    for row in score_rows:
        by_ta.setdefault(row.therapeutic_area_id, []).append(row)

    print("\n=== TOP RISING STARS BY THERAPEUTIC AREA ===")
    for ta_id, rows in by_ta.items():
        ta_name = ta_name_map.get(ta_id, ta_id)
        sorted_rows = sorted(rows, key=lambda r: r.composite_score, reverse=True)[:top_n]
        print(f"\n[{ta_name}] Top {len(sorted_rows)}")
        for idx, row in enumerate(sorted_rows, start=1):
            hcp_name = hcp_name_map.get(row.hcp_id, row.hcp_id)
            print(
                f"{idx:>2}. {hcp_name:<35} "
                f"Composite={row.composite_score:6.2f} "
                f"(PubVel={row.pub_velocity_score:6.2f}, "
                f"CitTraj={row.citation_trajectory_score:6.2f}, "
                f"Trial={row.trial_investigator_score:6.2f}, "
                f"FirstPub={row.first_pub_year}, "
                f"CareerMult={row.career_multiplier:4.2f})"
            )


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()

    print("Loading Supabase data...")
    hcps = fetch_all_rows(supabase, "hcps", "id,first_name,last_name")
    publications = fetch_all_rows(supabase, "publications", "hcp_id,pub_year,citation_count")
    clinical_trials = fetch_all_rows(
        supabase,
        "clinical_trials",
        "id,nct_id,phase,start_date,completion_date",
    )
    trial_investigators = fetch_all_rows(
        supabase,
        "trial_investigators",
        "hcp_id,trial_id,role",
    )
    hcp_tas = fetch_all_rows(
        supabase,
        "hcp_therapeutic_areas",
        "hcp_id,therapeutic_area_id",
    )
    therapeutic_areas = fetch_all_rows(supabase, "therapeutic_areas", "id,name")

    print(
        f"Loaded hcps={len(hcps)}, pubs={len(publications)}, trials={len(clinical_trials)}, "
        f"trial_links={len(trial_investigators)}, hcp_ta={len(hcp_tas)}"
    )

    print("Computing scores...")
    scores = compute_scores(
        hcp_tas=hcp_tas,
        publications=publications,
        trial_investigators=trial_investigators,
        clinical_trials=clinical_trials,
    )
    print(f"Computed {len(scores)} score rows.")

    print("Upserting hcp_scores...")
    upserted = upsert_scores(supabase, scores)
    print(f"Upserted {upserted} hcp_scores records.")

    print_top_rising_stars(scores, hcps, therapeutic_areas, top_n=TOP_N_PER_TA)
    print("\nScoring pipeline complete.")


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Scoring pipeline failed: {error}")
        raise
