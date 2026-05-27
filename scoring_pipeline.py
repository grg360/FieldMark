"""
FieldMark scoring pipeline (v1.4).

CHANGES IN v1.4 (2026-05-18):
- Added per-TA normalization step: composite_score is normalized 0-100 within
  each therapeutic area separately. Result written to normalized_score.
- Added tier assignment based on normalized_score thresholds:
    normalized >= 95 AND (pub_vel > 0 OR trial > 0) -> dark_horse
    normalized >= 85                                 -> rising_star
    normalized >= 30                                 -> emerging
    otherwise                                        -> unranked
- ScoreRow dataclass now includes normalized_score and tier.
- upsert_scores payload now writes normalized_score and tier columns.

This script:
1) Reads data from Supabase tables:
   hcps, publications, clinical_trials, trial_investigators,
   hcp_therapeutic_areas, therapeutic_areas
2) Calculates component scores for each HCP x therapeutic area:
   - Publication velocity (15%)
   - Citation trajectory (35%)
   - Trial investigator score (25%)
   - Cross signal bonus multiplier (1.15 if both pub+trial signals)
   - Recency weight (10%)
3) Computes composite score (0-100).
4) Normalizes composite_score per TA -> normalized_score (0-100).
5) Assigns tier based on normalized_score.
6) Writes results to hcp_scores (composite, normalized, tier, components).
7) Prints top 20 rising stars per therapeutic area.

Uses python-dotenv for environment variables.
Required env vars:
  SUPABASE_URL
  SUPABASE_KEY
"""

from __future__ import annotations

import argparse
import math
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm

from score_ranking import compute_and_write_ranks


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


SCORE_VERSION = "v1.4"
# When OpenAlex has enriched hcps.total_career_pubs, require this minimum for rankings / non-zero composite.
MIN_TOTAL_CAREER_PUBS_FOR_RANKINGS = 10
# If total_career_pubs is null, fall back to counting publication rows in our DB.
MIN_STORED_PUBLICATIONS_FALLBACK = 6
MAX_STORED_PUBLICATIONS_FOR_RANKINGS = 200
RECENT_PUBLICATION_YEAR_CUTOFF = 2022

# Tier assignment thresholds (against normalized_score, per TA)
TIER_DARK_HORSE_THRESHOLD = 95.0
TIER_RISING_STAR_THRESHOLD = 85.0
TIER_EMERGING_THRESHOLD = 30.0
CONCEPT_SCORE_THRESHOLD = 0.4


def passes_ranking_publication_threshold(total_career_pubs: Optional[int], stored_pub_count: int) -> bool:
    if stored_pub_count > MAX_STORED_PUBLICATIONS_FOR_RANKINGS:
        return False
    if total_career_pubs is not None:
        return total_career_pubs >= MIN_TOTAL_CAREER_PUBS_FOR_RANKINGS
    return stored_pub_count >= MIN_STORED_PUBLICATIONS_FALLBACK


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
    publications_count: int
    total_career_pubs: Optional[int]
    career_age_multiplier: float = 1.0
    normalized_score: float = 0.0
    tier: str = "unranked"


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def fetch_all_rows(
    supabase: Client, table: str, columns: str, page_size: int = 1000, target_version: str = "v1",
    order_column: str = "id",
) -> List[Dict]:
    try:
        count_response = supabase.table(table).select("*", count="estimated").limit(1).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed counting rows for table '{table}': {exc}") from exc
    expected_count = int(count_response.count or 0)

    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table(table)
                .select(columns)
                .order(order_column)
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed reading table '{table}': {exc}") from exc

        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        offset += page_size

        if offset > expected_count + page_size:
            logger_msg = (
                f"Pagination safety bail for table '{table}': "
                f"offset={offset} expected_count={expected_count}"
            )
            raise RuntimeError(logger_msg)

    print(f"Loaded {len(rows)} of ~{expected_count} rows from {table}")
    if len(rows) < (expected_count * 0.95):
        raise RuntimeError(f"Loaded only {len(rows)} of ~{expected_count} rows from {table}")
    return rows


def fetch_all_hcps(supabase: Client, page_size: int = 1000, target_version: str = "v1") -> List[Dict]:
    hcps_table = get_table_name("hcps", target_version)
    if target_version == "v2":
        select_cols = "id,first_name,last_name,country,total_career_pubs,career_first_pub_year"
    else:
        select_cols = "id,first_name,last_name,country,total_career_pubs,first_pub_year"
    try:
        count_response = supabase.table(hcps_table).select("*", count="estimated").limit(1).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed counting rows for table 'hcps': {exc}") from exc
    expected_count = int(count_response.count or 0)

    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table(hcps_table)
                .select(select_cols)
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed reading HCP rows: {exc}") from exc

        batch = response.data or []
        if not batch:
            break
        if target_version == "v2":
            for row in batch:
                if "career_first_pub_year" in row:
                    row["first_pub_year"] = row.pop("career_first_pub_year")
        rows.extend(batch)
        offset += page_size

        if offset > expected_count + page_size:
            raise RuntimeError(
                f"Pagination safety bail for table 'hcps': offset={offset} expected_count={expected_count}"
            )

    print(f"Loaded {len(rows)} of ~{expected_count} rows from hcps")
    if len(rows) < (expected_count * 0.95):
        raise RuntimeError(f"Loaded only {len(rows)} of ~{expected_count} rows from hcps")
    return rows


def fetch_all_publication_authors(
    supabase: Client, page_size: int = 1000, target_version: str = "v1"
) -> List[Dict]:
    """
    Fetch all publication_authors rows. Returns list of dicts with publication_id and hcp_id.
    These are the canonical many-to-many linkages between publications and HCPs.
    """
    pub_authors_table = get_table_name("publication_authors", target_version)
    try:
        count_response = (
            supabase.table(pub_authors_table).select("*", count="estimated").limit(1).execute()
        )
    except Exception as exc:
        raise RuntimeError(f"Failed counting rows for table 'publication_authors': {exc}") from exc
    expected_count = int(count_response.count or 0)

    rows: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table(pub_authors_table)
                .select("publication_id,hcp_id")
                .order("publication_id" if target_version == "v2" else "id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed reading publication_authors rows: {exc}") from exc

        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        offset += page_size

        if offset > expected_count + page_size:
            raise RuntimeError(
                f"Pagination safety bail for table 'publication_authors': offset={offset} expected_count={expected_count}"
            )

    print(f"Loaded {len(rows)} of ~{expected_count} rows from publication_authors")
    if len(rows) < (expected_count * 0.95):
        raise RuntimeError(f"Loaded only {len(rows)} of ~{expected_count} rows from publication_authors")
    return rows


def fetch_curated_concepts_by_ta(supabase: Client) -> Dict[str, set]:
    """Return {ta_id: set(openalex_concept_ids)}."""
    rows = (
        supabase.table("curated_ta_concepts")
        .select("therapeutic_area_id,openalex_concept_id")
        .execute()
        .data
        or []
    )
    by_ta: Dict[str, set] = {}
    for r in rows:
        ta_id = str(r.get("therapeutic_area_id") or "")
        c_id = str(r.get("openalex_concept_id") or "")
        if ta_id and c_id:
            by_ta.setdefault(ta_id, set()).add(c_id)
    return by_ta


def compute_pub_ta_relevance(
    publications: Sequence[Dict],
    curated_by_ta: Dict[str, set],
) -> Dict[str, set]:
    """For each publication, identify which TAs it is relevant to.
    Returns: {publication_id: set(ta_ids)}
    A pub is TA-relevant if any of its openalex_concepts is in the
    TA's curated list with score >= CONCEPT_SCORE_THRESHOLD.
    """
    pub_tas: Dict[str, set] = {}
    for pub in publications:
        pub_id = pub.get("id")
        if not pub_id:
            continue
        concepts = pub.get("openalex_concepts") or []
        if not isinstance(concepts, list):
            continue
        relevant_concept_ids = set()
        for c in concepts:
            if not isinstance(c, dict):
                continue
            c_id = c.get("id")
            try:
                c_score = float(c.get("score") or 0)
            except (TypeError, ValueError):
                continue
            if c_id and c_score >= CONCEPT_SCORE_THRESHOLD:
                relevant_concept_ids.add(str(c_id))
        if not relevant_concept_ids:
            continue
        tas_for_pub = set()
        for ta_id, curated_set in curated_by_ta.items():
            if relevant_concept_ids & curated_set:
                tas_for_pub.add(ta_id)
        if tas_for_pub:
            pub_tas[str(pub_id)] = tas_for_pub
    return pub_tas


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


def first_pub_year_override_multiplier(
    first_pub_year: Optional[int],
    total_career_pubs: Optional[int],
) -> float:
    """
    Career-stage multiplier for Rising Stars composite.

    Establishment override uses two-signal logic to catch senior researchers
    whose first_pub_year may be data-coverage-limited:
    - total_career_pubs >= 500: established by volume alone, regardless of first_pub_year
    - total_career_pubs >= 200 AND first_pub_year < 2020: established by combined
      volume + documented career length

    Otherwise, standard career-age based logic on first_pub_year applies.
    """
    # Establishment override
    if total_career_pubs is not None:
        if total_career_pubs >= 500:
            return 0.75
        if total_career_pubs >= 200 and first_pub_year is not None and first_pub_year < 2020:
            return 0.75

    # Standard career-age based logic
    if first_pub_year is None:
        return 1.0
    if first_pub_year >= 2020:
        return 1.30
    if 2017 <= first_pub_year <= 2019:
        return 1.15
    if 2011 <= first_pub_year <= 2016:
        return 1.0
    return 0.75


def recent_publication_ratio_multiplier(pub_years: Sequence[int]) -> float:
    valid_years = [y for y in pub_years if y > 0]
    if not valid_years:
        # Neutral when no publication years are available.
        return 1.0
    recent_count = sum(1 for y in valid_years if y >= RECENT_PUBLICATION_YEAR_CUTOFF)
    ratio = recent_count / len(valid_years)
    if ratio >= 0.80:
        return 1.30
    if ratio >= 0.50:
        return 1.15
    if ratio >= 0.25:
        return 1.00
    return 0.75


def citation_trajectory_raw(publications: Sequence[Dict], current_year: int) -> float:
    """
    Slope-based citation trajectory using year-by-year citation accrual.

    For each publication with citation_counts_by_year data:
    - Restrict to papers 2-7 years old at scoring time
    - Use the last 3 complete years of citation data (excluding current
      year as partial)
    - Compute linear regression slope of citation increments over those years
    - Skip papers with fewer than 3 complete years of data

    Per HCP: average slope across qualifying papers. Requires >=2 qualifying
    papers to score non-zero.
    """
    if not publications:
        return 0.0

    # Last 3 complete years (exclude current year as partial)
    target_years = [current_year - 3, current_year - 2, current_year - 1]

    qualifying_slopes: List[float] = []

    for pub in publications:
        pub_year = safe_int(pub.get("pub_year"), 0)
        if pub_year <= 0:
            continue

        # Age band: 2-7 years old at scoring time
        paper_age = current_year - pub_year
        if paper_age < 2 or paper_age > 7:
            continue

        # Extract year-by-year data
        counts_by_year = pub.get("citation_counts_by_year")
        if not counts_by_year:
            continue

        # Build year -> count lookup from the JSONB array
        year_counts: Dict[int, int] = {}
        for entry in counts_by_year:
            if not isinstance(entry, dict):
                continue
            year_val = safe_int(entry.get("year"), 0)
            count_val = safe_int(entry.get("cited_by_count"), 0)
            if year_val > 0:
                year_counts[year_val] = count_val

        # Get citation increments for target years
        # Missing years are treated as 0
        increments = [year_counts.get(y, 0) for y in target_years]

        # Linear regression slope through 3 points (x = [0, 1, 2])
        x_mean = 1.0
        y_mean = sum(increments) / 3.0

        numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip([0, 1, 2], increments))
        denominator = 2.0  # sum of (x - x_mean)^2 for x in [0, 1, 2] is always 2

        slope = numerator / denominator
        qualifying_slopes.append(slope)

    # HCP needs >=2 qualifying papers
    if len(qualifying_slopes) < 2:
        return 0.0

    return sum(qualifying_slopes) / len(qualifying_slopes)


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
    publication_authors: Sequence[Dict],
    trial_investigators: Sequence[Dict],
    clinical_trials: Sequence[Dict],
) -> Tuple[Dict[str, List[Dict]], Dict[str, List[Dict]], Dict[str, Dict]]:
    pub_by_id: Dict[str, Dict] = {}
    for pub in publications:
        pid = pub.get("id")
        if pid:
            pub_by_id[pid] = pub

    pubs_by_hcp: Dict[str, List[Dict]] = {}
    for link in publication_authors:
        hcp_id = link.get("hcp_id")
        pub_id = link.get("publication_id")
        if not hcp_id or not pub_id:
            continue
        pub = pub_by_id.get(pub_id)
        if pub:
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


def assign_tier(normalized: float, composite: float, pub_vel: float, trial: float) -> str:
    """
    Assign tier based on per-TA normalized_score thresholds.

    - dark_horse: normalized >= 95 AND has signal evidence (pub_vel or trial > 0)
    - rising_star: normalized >= 85
    - emerging: normalized >= 30
    - unranked: below 30, or composite is 0 (failed ranking threshold)
    """
    # HCPs that failed the ranking publication threshold have composite_score=0
    if composite == 0.0:
        return "unranked"
    if normalized >= TIER_DARK_HORSE_THRESHOLD and (pub_vel > 0 or trial > 0):
        return "dark_horse"
    if normalized >= TIER_RISING_STAR_THRESHOLD:
        return "rising_star"
    if normalized >= TIER_EMERGING_THRESHOLD:
        return "emerging"
    return "unranked"


def compute_scores(
    hcp_tas: Sequence[Dict],
    publications: Sequence[Dict],
    publication_authors: Sequence[Dict],
    trial_investigators: Sequence[Dict],
    clinical_trials: Sequence[Dict],
    hcps: Sequence[Dict],
    pub_tas: Optional[Dict[str, set]] = None,
) -> List[ScoreRow]:
    now_dt = datetime.now(timezone.utc).date()
    current_year = now_dt.year

    pubs_by_hcp, links_by_hcp, trials_by_id = build_lookup_maps(
        publications=publications,
        publication_authors=publication_authors,
        trial_investigators=trial_investigators,
        clinical_trials=clinical_trials,
    )
    pub_count_by_hcp: Dict[str, int] = {hid: len(pubs) for hid, pubs in pubs_by_hcp.items()}
    allowed_hcp_ids = {h.get("id") for h in hcps if h.get("id")}

    total_career_by_hcp: Dict[str, Optional[int]] = {}
    first_pub_year_enriched_by_hcp: Dict[str, Optional[int]] = {}
    for h in hcps:
        hid = h.get("id")
        if not hid:
            continue
        raw_first_pub = h.get("first_pub_year")
        if raw_first_pub is None:
            first_pub_year_enriched_by_hcp[hid] = None
        else:
            try:
                first_pub_year_enriched_by_hcp[hid] = int(raw_first_pub)
            except (TypeError, ValueError):
                first_pub_year_enriched_by_hcp[hid] = None
        raw_tcp = h.get("total_career_pubs")
        if raw_tcp is None:
            total_career_by_hcp[hid] = None
        else:
            try:
                total_career_by_hcp[hid] = int(raw_tcp)
            except (TypeError, ValueError):
                total_career_by_hcp[hid] = None

    raw_pub_velocity: Dict[Tuple[str, str], float] = {}
    raw_citation: Dict[Tuple[str, str], float] = {}
    trial_scores: Dict[Tuple[str, str], float] = {}
    recency_scores: Dict[Tuple[str, str], float] = {}
    has_pub_and_trial: Dict[Tuple[str, str], bool] = {}
    first_pub_year_by_hcp: Dict[str, Optional[int]] = {}
    recent_pub_multiplier_by_hcp: Dict[str, float] = {}

    valid_pairs: List[Tuple[str, str]] = []
    for rel in hcp_tas:
        hcp_id = rel.get("hcp_id")
        ta_id = rel.get("therapeutic_area_id")
        if not hcp_id or not ta_id or hcp_id not in allowed_hcp_ids:
            continue

        key = (hcp_id, ta_id)
        valid_pairs.append(key)

        all_hcp_pubs = pubs_by_hcp.get(hcp_id, [])
        hcp_links = links_by_hcp.get(hcp_id, [])

        # Per-TA filter: only count publications relevant to this TA.
        # If pub_tas is None (v1 mode), pass through unfiltered.
        if pub_tas is not None:
            hcp_pubs = [
                pub for pub in all_hcp_pubs
                if pub.get("id") and ta_id in pub_tas.get(str(pub.get("id")), set())
            ]
        else:
            hcp_pubs = all_hcp_pubs

        pub_years = [safe_int(pub.get("pub_year"), 0) for pub in hcp_pubs if safe_int(pub.get("pub_year"), 0) > 0]
        # Priority order:
        # 1) OpenAlex-enriched hcps.first_pub_year when present
        # 2) Derived min publication year from loaded publications
        # 3) None when no publication years exist
        first_pub_year_by_hcp[hcp_id] = (
            first_pub_year_enriched_by_hcp.get(hcp_id)
            if first_pub_year_enriched_by_hcp.get(hcp_id) is not None
            else (min(pub_years) if pub_years else None)
        )
        recent_pub_multiplier_by_hcp[hcp_id] = recent_publication_ratio_multiplier(pub_years)
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

    # First pass: compute composite_score for every (hcp, ta) pair
    rows: List[ScoreRow] = []
    composite_by_pair: Dict[Tuple[str, str], float] = {}
    pub_vel_by_pair: Dict[Tuple[str, str], float] = {}
    trial_by_pair: Dict[Tuple[str, str], float] = {}

    now_iso = datetime.now(timezone.utc).isoformat()
    for key in tqdm(valid_pairs, desc="computing scores", unit="pair"):
        hcp_id, ta_id = key
        pub_velocity = pub_velocity_scores.get(key, 0.0)
        citation = citation_scores.get(key, 0.0)
        trial_score = trial_scores.get(key, 0.0)
        recency = recency_scores.get(key, 0.0)
        publications_count = pub_count_by_hcp.get(hcp_id, 0)
        total_career_pubs = total_career_by_hcp.get(hcp_id)
        # Gating is now handled inside citation_trajectory_raw, which returns
        # 0.0 for HCPs with fewer than 2 qualifying papers. No external gate needed.
        citation_for_scoring = citation
        cross_multiplier = 1.15 if has_pub_and_trial.get(key, False) else 1.0
        first_pub_year = first_pub_year_by_hcp.get(hcp_id)
        career_multiplier = recent_pub_multiplier_by_hcp.get(hcp_id, 1.0)
        career_age_multiplier = 1.0
        # Secondary override: if enriched first_pub_year exists on hcps, it takes precedence.
        if first_pub_year_enriched_by_hcp.get(hcp_id) is not None:
            career_multiplier = first_pub_year_override_multiplier(first_pub_year, total_career_pubs)
            career_age_multiplier = career_multiplier

        # Components without populated data contribute 0 to the composite but
        # remain in the formula so activation is a data change, not a code change.
        # Recency is encoded as a multiplier on the trial matrix — NOT as a standalone component.
        congress = 0.0           # v1.2 placeholder; activates via congress data ingestion
        msl_signal = 0.0         # v1.2 placeholder; activates via MSL contributor onboarding
        h_index = 0.0            # v1.5 backlog: wire from hcps.scholar_h_index
        institution_tier = 0.0   # v1.5 backlog: wire from institution tier lists

        # Rising Stars composite weights, revised after empirical analysis showed
        # trajectory-strong HCPs were being buried by the prior weighting.
        #   pub_velocity        15% (deweighted; formula has known plateau degeneracy)
        #   citation_trajectory 35% (PRIMARY rising-star signal; was 20%)
        #   trial_investigator  25% (unchanged)
        #   congress            10% (unchanged; placeholder)
        #   msl_signal          10% (unchanged; placeholder)
        #   h_index              0% (removed; correlates with established, not rising)
        #   institution_tier     5% (unchanged)
        weighted_base = (
            (0.15 * pub_velocity)
            + (0.35 * citation_for_scoring)
            + (0.25 * trial_score)
            + (0.10 * congress)
            + (0.10 * msl_signal)
            + (0.00 * h_index)
            + (0.05 * institution_tier)
        )
        # Cross-signal and career multipliers are applied after base weighting.
        composite_uncapped = weighted_base * cross_multiplier * career_multiplier
        composite = max(0.0, min(100.0, composite_uncapped))

        if not passes_ranking_publication_threshold(total_career_pubs, publications_count):
            composite = 0.0

        # Track for per-TA normalization step
        composite_by_pair[key] = composite
        pub_vel_by_pair[key] = pub_velocity
        trial_by_pair[key] = trial_score

        rows.append(
            ScoreRow(
                hcp_id=hcp_id,
                therapeutic_area_id=ta_id,
                composite_score=round(composite, 4),
                pub_velocity_score=round(pub_velocity, 4),
                citation_trajectory_score=round(citation_for_scoring, 4),
                trial_investigator_score=round(trial_score, 4),
                congress_score=0.0,
                msl_signal_score=0.0,
                score_version=SCORE_VERSION,
                calculated_at=now_iso,
                first_pub_year=first_pub_year,
                career_multiplier=round(career_multiplier, 4),
                career_age_multiplier=round(career_age_multiplier, 4),
                publications_count=publications_count,
                total_career_pubs=total_career_pubs,
                normalized_score=0.0,  # filled in second pass below
                tier="unranked",        # filled in second pass below
            )
        )

    # Second pass: per-TA normalization + tier assignment
    print("Normalizing composite_score per therapeutic area...")
    tas_seen = {key[1] for key in composite_by_pair.keys()}

    normalized_by_pair: Dict[Tuple[str, str], float] = {}
    for ta_id in tas_seen:
        # Build per-TA dict of composite scores
        ta_pairs = {
            k: v for k, v in composite_by_pair.items() if k[1] == ta_id
        }
        # Normalize 0-100 within this TA
        ta_normalized = normalize_0_100(ta_pairs)
        normalized_by_pair.update(ta_normalized)
        ta_count = len(ta_pairs)
        ta_nonzero = sum(1 for v in ta_normalized.values() if v > 0)
        print(f"  TA {ta_id}: {ta_count} pairs normalized, {ta_nonzero} above zero")

    # Assign normalized_score and tier to each row
    updated_rows: List[ScoreRow] = []
    for r in rows:
        key = (r.hcp_id, r.therapeutic_area_id)
        norm = normalized_by_pair.get(key, 0.0)
        tier = assign_tier(
            normalized=norm,
            composite=r.composite_score,
            pub_vel=pub_vel_by_pair.get(key, 0.0),
            trial=trial_by_pair.get(key, 0.0),
        )
        # Build new ScoreRow with normalization + tier filled in
        r_new = ScoreRow(
            hcp_id=r.hcp_id,
            therapeutic_area_id=r.therapeutic_area_id,
            composite_score=r.composite_score,
            pub_velocity_score=r.pub_velocity_score,
            citation_trajectory_score=r.citation_trajectory_score,
            trial_investigator_score=r.trial_investigator_score,
            congress_score=r.congress_score,
            msl_signal_score=r.msl_signal_score,
            score_version=r.score_version,
            calculated_at=r.calculated_at,
            first_pub_year=r.first_pub_year,
            career_multiplier=r.career_multiplier,
            career_age_multiplier=r.career_age_multiplier,
            publications_count=r.publications_count,
            total_career_pubs=r.total_career_pubs,
            normalized_score=round(norm, 4),
            tier=tier,
        )
        updated_rows.append(r_new)

    # Log tier distribution for sanity
    tier_counts: Dict[str, int] = {}
    for r in updated_rows:
        tier_counts[r.tier] = tier_counts.get(r.tier, 0) + 1
    print(f"Tier distribution: {tier_counts}")

    return updated_rows


def upsert_scores(
    supabase: Client,
    score_rows: Sequence[ScoreRow],
    target_version: str = "v1",
    scoring_run_id: Optional[str] = None,
) -> int:
    if not score_rows:
        return 0

    scores_table = get_table_name("hcp_scores", target_version)
    if target_version == "v2":
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
                "career_age_multiplier": row.career_age_multiplier,
                "scored_at": row.calculated_at,
                "scoring_run_id": scoring_run_id,
                "normalized_score": row.normalized_score,
                "tier": row.tier,
            }
            for row in score_rows
        ]
    else:
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
                "normalized_score": row.normalized_score,
                "tier": row.tier,
            }
            for row in score_rows
        ]

    batch_size = 100
    progress_every = 5000
    processed = 0

    for start in range(0, len(payload), batch_size):
        batch = payload[start : start + batch_size]
        try:
            # Recommended unique index for deterministic updates:
            # unique (hcp_id, therapeutic_area_id, score_version)
            response = supabase.table(scores_table).upsert(
                batch,
                on_conflict="hcp_id,therapeutic_area_id",
            ).execute()
            if not response.data:
                raise RuntimeError(
                    f"hcp_scores upsert returned empty data ({len(batch)} rows) - "
                    f"writes may have been silently dropped"
                )
        except Exception as exc:
            raise RuntimeError(f"Failed to upsert hcp_scores batch starting at {start}: {exc}") from exc

        processed += len(batch)
        if processed % progress_every == 0:
            print(f"Upsert progress: {processed}/{len(payload)} hcp_scores rows")

    return len(payload)


def get_top_n_for_ta(hcp_count: int) -> int:
    if hcp_count >= 5000:
        return 100
    if 2000 <= hcp_count <= 4999:
        return 50
    if 500 <= hcp_count <= 1999:
        return 20
    return 10


def print_top_rising_stars(
    score_rows: Sequence[ScoreRow],
    hcps: Sequence[Dict],
    therapeutic_areas: Sequence[Dict],
) -> None:
    hcp_name_map = {
        row["id"]: f'{row.get("first_name", "")} {row.get("last_name", "")}'.strip()
        for row in hcps
        if row.get("id")
    }
    ta_name_map = {row["id"]: row.get("name", row["id"]) for row in therapeutic_areas if row.get("id")}

    eligible_rows = [
        r
        for r in score_rows
        if passes_ranking_publication_threshold(r.total_career_pubs, r.publications_count)
    ]
    by_ta: Dict[str, List[ScoreRow]] = {}
    for row in eligible_rows:
        by_ta.setdefault(row.therapeutic_area_id, []).append(row)

    print("\n=== TOP RISING STARS BY THERAPEUTIC AREA ===")
    print(
        f"(Rankings: need total_career_pubs>={MIN_TOTAL_CAREER_PUBS_FOR_RANKINGS} when set; "
        f"else >= {MIN_STORED_PUBLICATIONS_FALLBACK} stored publication rows; "
        f"exclude HCPs with >{MAX_STORED_PUBLICATIONS_FOR_RANKINGS} stored publications.)\n"
    )
    for ta_id, rows in by_ta.items():
        ta_name = ta_name_map.get(ta_id, ta_id)
        unique_hcp_count = len({row.hcp_id for row in rows})
        top_n = get_top_n_for_ta(unique_hcp_count)
        sorted_rows = sorted(rows, key=lambda r: r.normalized_score, reverse=True)[:top_n]
        print(f"\n[{ta_name}] Top {len(sorted_rows)} of {unique_hcp_count} HCPs")
        for idx, row in enumerate(sorted_rows, start=1):
            hcp_name = hcp_name_map.get(row.hcp_id, row.hcp_id)
            career_part = (
                f"CareerPubs={row.total_career_pubs}"
                if row.total_career_pubs is not None
                else "CareerPubs=None"
            )
            print(
                f"{idx:>2}. {hcp_name:<35} "
                f"Norm={row.normalized_score:6.2f} "
                f"Tier={row.tier:<12} "
                f"Composite={row.composite_score:6.2f} "
                f"StoredPubs={row.publications_count:<3} {career_part} "
                f"(PubVel={row.pub_velocity_score:6.2f}, "
                f"CitTraj={row.citation_trajectory_score:6.2f}, "
                f"Trial={row.trial_investigator_score:6.2f})"
            )


def run_pipeline(dry_run: bool = False, target_version: str = "v1") -> None:
    load_dotenv()
    supabase = init_supabase()

    scoring_run_id: Optional[str] = None
    if target_version == "v2":
        scoring_run_id = str(uuid.uuid4())
        print(f"Scoring run ID (v2): {scoring_run_id}")

    print("Loading Supabase data...")
    hcps = fetch_all_hcps(supabase, target_version=target_version)
    print(f"Loaded {len(hcps)} HCPs (all countries).")
    publications = fetch_all_rows(
        supabase,
        get_table_name("publications", target_version),
        "id,pub_year,citation_count,citation_counts_by_year,openalex_concepts",
        target_version=target_version,
    )
    publication_authors = fetch_all_publication_authors(supabase, target_version=target_version)
    clinical_trials = fetch_all_rows(
        supabase,
        get_table_name("clinical_trials", target_version),
        "id,nct_id,phase,start_date,completion_date",
        target_version=target_version,
    )
    trial_investigators = fetch_all_rows(
        supabase,
        get_table_name("trial_investigators", target_version),
        "hcp_id,trial_id,role",
        target_version=target_version,
    )
    if target_version == "v2":
        hcp_tas = fetch_all_rows(
            supabase,
            get_table_name("hcp_therapeutic_areas", target_version),
            "hcp_id,therapeutic_area_id",
            target_version=target_version,
            order_column="hcp_id",
        )
    else:
        hcp_tas = fetch_all_rows(
            supabase,
            get_table_name("hcp_therapeutic_areas", target_version),
            "hcp_id,therapeutic_area_id",
            target_version=target_version,
        )
    therapeutic_areas = fetch_all_rows(supabase, "therapeutic_areas", "id,name")

    print("Loading curated_ta_concepts and computing per-pub TA relevance...")
    curated_by_ta = fetch_curated_concepts_by_ta(supabase)
    pub_tas = compute_pub_ta_relevance(publications, curated_by_ta)
    print(f"  Curated concepts loaded for {len(curated_by_ta)} TAs")
    print(f"  {len(pub_tas)} publications have TA relevance")

    print(f"Operating on full HCP set: {len(hcps)}")

    print(
        f"Loaded hcps={len(hcps)}, pubs={len(publications)}, pub_authors={len(publication_authors)}, "
        f"trials={len(clinical_trials)}, trial_links={len(trial_investigators)}, hcp_ta={len(hcp_tas)}"
    )

    print("Computing scores...")
    scores = compute_scores(
        hcp_tas=hcp_tas,
        publications=publications,
        publication_authors=publication_authors,
        trial_investigators=trial_investigators,
        clinical_trials=clinical_trials,
        hcps=hcps,
        pub_tas=pub_tas,
    )
    print(f"Computed {len(scores)} score rows.")

    if dry_run:
        print("[DRY RUN] Skipping hcp_scores upsert. Scores computed but not persisted.")
    else:
        print("Upserting hcp_scores...")
        upserted = upsert_scores(
            supabase, scores, target_version=target_version, scoring_run_id=scoring_run_id
        )
        print(f"Upserted {upserted} hcp_scores records.")

    # Rank computation is v2-only because hcp_score_ranks_v2 only exists in v2.
    # Respects the dry_run flag (computes ranks and prints stats, no writes).
    if target_version == "v2":
        print("\nComputing country/region/global ranks for rising stars...")
        compute_and_write_ranks(
            client=supabase,
            score_rows=scores,
            cohort="rising",
            scoring_run_id=scoring_run_id,
            dry_run=dry_run,
        )
    else:
        print("\nSkipping rank computation (target_version=v1; ranks are v2-only).")

    print_top_rising_stars(scores, hcps, therapeutic_areas)
    print("\nScoring pipeline complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FieldMark scoring pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Compute and print scores without writing to hcp_scores")
    parser.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version. v1=legacy tables, v2=rebuild tables.",
    )
    args = parser.parse_args()

    try:
        run_pipeline(dry_run=args.dry_run, target_version=args.target_version)
    except Exception as error:
        print(f"[ERROR] Scoring pipeline failed: {error}")
        raise