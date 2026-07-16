from __future__ import annotations

"""
FieldMark Claude narrative generation — v2.

Replaces both anthropic_layer.py and the older top-500-by-composite script.

Key improvements over previous scripts:
1. Targets HCPs by cohort_classification (rising_star, established, community)
   instead of composite_score top-N. Cohort membership IS the gate.
2. Generates 5 structured fields per HCP×TA:
   - narrative (3 sentences)
   - why_now (1 sentence)
   - engagement_angle (2 sentences)
   - signal_strength (1 sentence)
   - caution_flags (1 sentence or null)
3. Uses cohort-specific prompt templates. Rising Stars get "emerging voice"
   framing; Established get "recognized expert" framing; Community get
   "active community physician" framing. No more universal "rising star"
   prompts for HCPs who aren't rising stars.
4. References percentile context, not raw component scores. "Top 10% of
   NSCLC Rising Stars by citation trajectory" reads better than
   "citation_trajectory_score=67.51".
5. Uses Sonnet 4.6 (free upgrade from 4.5 at same price).
6. CLI flags for cohort selection, dry-run cost preview, force regenerate.
7. Reports cost estimate before consuming API budget.

Required env vars (.env):
- SUPABASE_URL
- SUPABASE_KEY
- ANTHROPIC_API_KEY

Usage:
    python generate_narratives_v2.py --dry-run
    python generate_narratives_v2.py --cohort rising_star
    python generate_narratives_v2.py --cohort all
    python generate_narratives_v2.py --cohort community --community-top 500
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import psycopg
import requests
from dotenv import load_dotenv
from psycopg.rows import dict_row
from supabase import Client, create_client


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


# Anthropic API config
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-6"
PROMPT_VERSION = "v1.0"
RISING_STAR_PROMPT_VERSION = "rising_star_v3.4"
ANTHROPIC_VERSION = "2023-06-01"

# Pricing (per million tokens) — Sonnet 4.6
COST_INPUT_PER_MTOK = 3.00
COST_OUTPUT_PER_MTOK = 15.00

# Estimated tokens per call
EST_INPUT_TOKENS_PER_CALL = 600
EST_OUTPUT_TOKENS_PER_CALL = 250

VISIBLE_SCOPES = [
    ("global", None),
    ("country", "US"),
    ("region", "EU5"),
]

EU5_COUNTRIES = ["DE", "FR", "IT", "ES", "GB"]

# AD rising uses the 2-axis composite model (hcp_rising_composite_v1); every other TA
# stays on the frozen legacy rising model (hcp_rising_star_ranks_v3). The 3 shared rising
# functions (selection, context, freshness-skip) branch on this id so NSCLC/hepatology/
# rare-disease rising narratives are untouched.
AD_TA_ID = "9e4139d2-e062-4a58-8728-cdabb2d7dca1"

COHORT_SCORE_CONFIG: Dict[str, Dict[str, Any]] = {
    "rising_star": {
        # NOTE: rank_table is UNUSED (dead) — the rising selection/context/freshness
        # functions hardcode their table (now TA-conditional via AD_TA_ID), so this is
        # not the repoint lever. Left for parity with the other cohort entries.
        "rank_table": "hcp_rising_star_ranks_v3",
    },
    "established": {
        "rank_table": "hcp_established_ranks_v3",
    },
    "community": {
        "score_table": "hcp_community_scores_v2",
        "rank_table": "hcp_community_ranks_v2",
        "score_fields": {
            "pharma_engagement": "pharma_engagement_score",
            "engagement_breadth": "engagement_breadth_score",
            "medicare_volume": "medicare_volume_score",
            "career_stage": "career_stage_score",
        },
    },
}

# VISIBLE_TA_IDS is loaded dynamically from therapeutic_area_ingestion_config
# via load_visible_ta_ids() — see function below.


def load_visible_ta_ids(supabase: Client) -> List[str]:
    """
    Query therapeutic_area_ingestion_config for TAs that should appear on the frontend.
    Returns list of UUID strings.
    Filters: is_visible_in_ui = true AND is_active = true.
    Falls back to empty list (with warning) if table query fails.
    """
    try:
        resp = (
            supabase.table("therapeutic_area_ingestion_config")
            .select("therapeutic_area_id")
            .eq("is_visible_in_ui", True)
            .eq("is_active", True)
            .execute()
        )
        rows = resp.data or []
        ta_ids = [str(r["therapeutic_area_id"]) for r in rows if r.get("therapeutic_area_id")]
        if not ta_ids:
            print("[WARNING] No visible TAs found in therapeutic_area_ingestion_config. Narrative selection will be empty.")
        else:
            print(f"Loaded {len(ta_ids)} visible TA(s) from config: {ta_ids}")
        return ta_ids
    except Exception as exc:
        print(f"[ERROR] Failed to load visible TAs: {exc}. Returning empty list.")
        return []


def ta_slug_from_name(ta_name: Optional[str]) -> str:
    """Convert a TA display name to its slug form used in hcp_narratives_v2."""
    if not ta_name:
        return "unknown"
    return ta_name.lower().replace(' ', '_').replace('-', '_')


RISING_DEFAULT_TOP_N = 100
ESTABLISHED_DEFAULT_TOP_N = 100

# Pipeline behavior
COMMUNITY_DEFAULT_TOP_N = 500
API_SLEEP_SECONDS = 0.5
PROGRESS_EVERY = 25
MAX_TOKENS_RESPONSE = 600
TEMPERATURE = 0.1


@dataclass
class HCPContext:
    """Everything needed to generate a narrative for one HCP×TA pair."""
    hcp_id: str
    therapeutic_area_id: str
    therapeutic_area_name: str
    first_name: Optional[str]
    last_name: Optional[str]
    institution: Optional[str]
    country: Optional[str]
    cohort_classification: str
    cohort_score: Optional[float]
    composite_score: Optional[float]
    pub_velocity_pct: Optional[float]
    citation_trajectory_pct: Optional[float]
    trial_investigator_pct: Optional[float]
    first_pub_year: Optional[int]
    total_career_pubs: Optional[int]
    pharma_engagement_lifetime: Optional[float]
    pharma_companies_distinct: Optional[int]
    percentile_data: Dict[str, int] = field(default_factory=dict)
    therapeutic_area_slug: str = ""
    rising_star_v3: Optional[Dict[str, Any]] = None
    established_v3: Optional[Dict[str, Any]] = None


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(
        get_required_env("SUPABASE_URL"),
        get_required_env("SUPABASE_KEY"),
    )


def fetch_all_rows(
    supabase: Client, table: str, columns: str, page_size: int = 1000, target_version: str = "v1"
) -> List[Dict]:
    """Paginate through a table, fetching all rows."""
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


def safe_int(value: object) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_float(value: object) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def format_display_int(value: object) -> str:
    parsed = safe_float(value)
    if parsed is None:
        return "Unknown"
    return str(int(round(parsed)))


def format_signed_int(value: object) -> str:
    parsed = safe_float(value)
    if parsed is None:
        return "Unknown"
    rounded = int(round(parsed))
    if rounded > 0:
        return f"+{rounded}"
    return str(rounded)


def format_percentile_one_decimal(value: object) -> str:
    parsed = safe_float(value)
    if parsed is None:
        return "Unknown"
    return f"{parsed:.1f}"


def get_db_conn():
    """Direct Postgres connection (port 5432) for joined Rising Star v3 reads."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("Missing DATABASE_URL")
    return psycopg.connect(database_url, row_factory=dict_row)


def percentile_within_ta(value: float, all_values_in_ta: List[float]) -> float:
    """Compute simple percentile rank (0-100) of value within its TA peer group."""
    if not all_values_in_ta:
        return 0.0
    below_count = sum(1 for v in all_values_in_ta if v < value)
    return int(round(100.0 * below_count / len(all_values_in_ta)))


def pick_latest_scores(score_rows: List[Dict]) -> Dict[Tuple[str, str], Dict]:
    """Keep latest hcp_scores row per (hcp_id, therapeutic_area_id) by calculated_at."""
    latest: Dict[Tuple[str, str], Dict] = {}
    for row in score_rows:
        hcp_id = row.get("hcp_id")
        ta_id = row.get("therapeutic_area_id")
        if not hcp_id or not ta_id:
            continue
        key = (hcp_id, ta_id)
        current = latest.get(key)
        if current is None:
            latest[key] = row
            continue
        old_ts = str(current.get("calculated_at") or "")
        new_ts = str(row.get("calculated_at") or "")
        if new_ts >= old_ts:
            latest[key] = row
    return latest


def fetch_top_n_hcp_ids_from_rank_view(
    supabase: Client,
    rank_table: str,
    top_n: int,
    visible_ta_ids: List[str],
) -> Set[str]:
    """Top N hcp_ids per (TA x visible scope) from a precomputed rank view."""
    selected: Set[str] = set()
    for scope_type, scope_value in VISIBLE_SCOPES:
        for ta_id in visible_ta_ids:
            query = (
                supabase.table(rank_table)
                .select("hcp_id,rank")
                .eq("therapeutic_area_id", ta_id)
                .eq("scope_type", scope_type)
                .order("rank", desc=False)
                .range(0, top_n - 1)
            )
            if scope_value is None:
                query = query.is_("scope_value", None)
            else:
                query = query.eq("scope_value", scope_value)
            response = query.execute()
            rows = response.data or []
            for row in rows:
                hcp_id = row.get("hcp_id")
                if hcp_id:
                    selected.add(str(hcp_id))
    return selected


def fetch_rising_star_top_hcp_ids_v3(
    supabase: Client,
    top_n: int,
    visible_ta_ids: List[str],
) -> Set[str]:
    """Rising Star cohort selection: top N per TA by rank.

    Per-TA model split:
      - AD: GLOBAL top-N by composite rank from hcp_rising_composite_v1 (AD is
        global-first; the composite table stores global rows as scope_type='global',
        scope_value=NULL).
      - Every other TA: frozen legacy path — US-scope only, top-N by us_rank from
        hcp_rising_star_ranks_v3 (US-default product model; intl HCPs excluded).
    """
    selected: Set[str] = set()
    for ta_id in visible_ta_ids:
        try:
            if str(ta_id) == AD_TA_ID:
                response = (
                    supabase.table("hcp_rising_composite_v1")
                    .select("hcp_id")
                    .eq("therapeutic_area_id", ta_id)
                    .eq("scope_type", "global")
                    .order("rank", desc=False)
                    .range(0, top_n - 1)
                    .execute()
                )
            else:
                response = (
                    supabase.table("hcp_rising_star_ranks_v3")
                    .select("hcp_id")
                    .eq("therapeutic_area_id", ta_id)
                    .not_.is_("us_rank", "null")
                    .order("us_rank", desc=False)
                    .range(0, top_n - 1)
                    .execute()
                )
            for row in response.data or []:
                hcp_id = row.get("hcp_id")
                if hcp_id:
                    selected.add(str(hcp_id))
        except Exception as exc:
            print(f"[load] rising selection query failed for TA {ta_id}: {exc}")
    return selected


def fetch_rising_star_v3_context_rows(
    hcp_ids: Set[str],
    visible_ta_ids: List[str],
) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """Load Rising Star ranks + per-model context signals.

    Per-TA model split (structurally different SQL selected by ta_id):
      - AD: hcp_rising_composite_v1 (scope_type='global') LEFT JOIN
        hcp_scientific_emergence_v1 (recent-window emergence sub-signals). Network
        signal = r.network_influence_pctile from the composite row; NO network_momentum
        join (0% AD coverage).
      - Every other TA: frozen legacy query — hcp_rising_star_ranks_v3 + scientific/
        network momentum joins (unchanged).
    """
    if not hcp_ids or not visible_ta_ids:
        return {}

    ids_list = list(hcp_ids)
    ad_ta_ids = [t for t in visible_ta_ids if str(t) == AD_TA_ID]
    legacy_ta_ids = [t for t in visible_ta_ids if str(t) != AD_TA_ID]
    rows_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    batch_size = 500

    legacy_sql = """
        SELECT
            r.hcp_id,
            r.therapeutic_area_id,
            r.rank,
            r.us_rank,
            r.rising_star_percentile,
            r.momentum_component,
            r.visibility_component,
            r.scientific_momentum_percentile,
            r.network_momentum_percentile,
            r.scientific_visibility_percentile,
            r.network_visibility_percentile,
            r.archetype,
            sm.early_total_pubs,
            sm.recent_total_pubs,
            sm.pub_velocity_delta,
            sm.citation_velocity_delta,
            sm.authorship_progression_delta,
            sm.early_senior_author_pct,
            sm.recent_senior_author_pct,
            nm.early_collaborator_count,
            nm.recent_collaborator_count
        FROM hcp_rising_star_ranks_v3 r
        LEFT JOIN hcp_scientific_momentum_v1 sm
            ON sm.hcp_id = r.hcp_id
           AND sm.therapeutic_area_id = r.therapeutic_area_id
        LEFT JOIN hcp_network_momentum_v1 nm
            ON nm.hcp_id = r.hcp_id
           AND nm.therapeutic_area_id = r.therapeutic_area_id
        WHERE r.therapeutic_area_id = ANY(%s::uuid[])
          AND r.hcp_id = ANY(%s::uuid[])
    """

    composite_sql = """
        SELECT
            r.hcp_id,
            r.therapeutic_area_id,
            r.rank,
            r.rising_composite_score,
            r.network_influence_pctile,
            e.recent_pub_count,
            e.recent_pub_percentile,
            e.recent_senior_pubs,
            e.recent_first_pubs,
            e.recent_senior_first_pct,
            e.recent_authorship_percentile,
            e.recent_citations_per_pub,
            e.recent_total_citations,
            e.recent_citation_impact_percentile,
            e.emergence_percentile
        FROM hcp_rising_composite_v1 r
        LEFT JOIN hcp_scientific_emergence_v1 e
            ON e.hcp_id = r.hcp_id
           AND e.therapeutic_area_id = r.therapeutic_area_id
        WHERE r.therapeutic_area_id = ANY(%s::uuid[])
          AND r.hcp_id = ANY(%s::uuid[])
          AND r.scope_type = 'global'
    """

    # AD composite path only: per-HCP AD research themes (subfocus), used to
    # ground the engagement angle. Themes are tagged with the DISPLAY-form TA
    # string 'Atopic Dermatitis', NOT the 'atopic-dermatitis' slug — the slug
    # returns zero rows. Multiple extraction runs coexist in this table; scope to
    # the single most-recent run (by extracted_at) so stale/duplicate labels from
    # prior runs never mix in.
    themes_sql = """
        SELECT
            hcp_id,
            theme_name,
            centrality
        FROM hcp_research_themes_v2
        WHERE therapeutic_area = 'Atopic Dermatitis'
          AND extraction_run_id = (
              SELECT extraction_run_id
              FROM hcp_research_themes_v2
              WHERE therapeutic_area = 'Atopic Dermatitis'
              ORDER BY extracted_at DESC
              LIMIT 1
          )
          AND hcp_id = ANY(%s::uuid[])
        ORDER BY
            hcp_id,
            CASE centrality
                WHEN 'core' THEN 0
                WHEN 'supporting' THEN 1
                WHEN 'peripheral' THEN 2
                ELSE 3
            END,
            display_rank NULLS LAST,
            paper_count DESC
    """

    with get_db_conn() as conn:
        with conn.cursor() as cur:
            for ta_group, sql in ((legacy_ta_ids, legacy_sql), (ad_ta_ids, composite_sql)):
                if not ta_group:
                    continue
                for i in range(0, len(ids_list), batch_size):
                    batch_ids = ids_list[i : i + batch_size]
                    cur.execute(sql, (ta_group, batch_ids))
                    for row in cur.fetchall():
                        hcp_id = str(row["hcp_id"])
                        ta_id = str(row["therapeutic_area_id"])
                        rows_by_pair[(hcp_id, ta_id)] = dict(row)

            # AD composite path only: attach per-HCP themes. Legacy/NSCLC rows are
            # never touched (frozen path). Thin-corpus HCPs → themes = [] (the
            # prompt handles an empty list). Capped at 12 per HCP, core-first.
            if ad_ta_ids:
                themes_by_hcp: Dict[str, List[Dict[str, Any]]] = {}
                for i in range(0, len(ids_list), batch_size):
                    batch_ids = ids_list[i : i + batch_size]
                    cur.execute(themes_sql, (batch_ids,))
                    for trow in cur.fetchall():
                        themes_by_hcp.setdefault(str(trow["hcp_id"]), []).append(
                            {"label": trow["theme_name"], "centrality": trow["centrality"]}
                        )
                for (hcp_id, ta_id), row in rows_by_pair.items():
                    if ta_id == AD_TA_ID:
                        row["themes"] = themes_by_hcp.get(hcp_id, [])[:12]
    return rows_by_pair


def fetch_established_v3_context_rows(
    hcp_ids: Set[str],
    visible_ta_ids: List[str],
) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """Load Established v3 rank rows for both global and US scopes.

    Returns dict keyed by (hcp_id, ta_id) with both scope rows under
    'global' and 'us' keys plus shared percentiles.
    """
    if not hcp_ids or not visible_ta_ids:
        return {}

    ids_list = list(hcp_ids)
    ta_list = list(visible_ta_ids)
    rows_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    batch_size = 500

    sql = """
        SELECT
            hcp_id,
            therapeutic_area_id,
            scope_type,
            scope_value,
            rank,
            cohort_score,
            scientific_influence_pctile,
            network_influence_pctile,
            pharma_engagement_pctile,
            computed_at
        FROM hcp_established_ranks_v3
        WHERE therapeutic_area_id = ANY(%s::uuid[])
          AND hcp_id = ANY(%s::uuid[])
          AND (
                (scope_type = 'global')
             OR (scope_type = 'region' AND scope_value = 'US')
          )
    """

    with get_db_conn() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(ids_list), batch_size):
                batch_ids = ids_list[i : i + batch_size]
                cur.execute(sql, (ta_list, batch_ids))
                for row in cur.fetchall():
                    hcp_id = row["hcp_id"]
                    ta_id = row["therapeutic_area_id"]
                    scope_type = row["scope_type"]
                    scope_value = row["scope_value"]
                    rank_val = row["rank"]
                    cohort_score = row["cohort_score"]
                    sci_pctile = row["scientific_influence_pctile"]
                    net_pctile = row["network_influence_pctile"]
                    pharma_pctile = row["pharma_engagement_pctile"]
                    computed_at = row["computed_at"]
                    key = (str(hcp_id), str(ta_id))
                    entry = rows_by_pair.setdefault(
                        key,
                        {
                            "scientific_influence_pctile": None,
                            "network_influence_pctile": None,
                            "pharma_engagement_pctile": None,
                            "cohort_score": None,
                            "global_rank": None,
                            "us_rank": None,
                            "computed_at": None,
                        },
                    )
                    if entry["scientific_influence_pctile"] is None and sci_pctile is not None:
                        entry["scientific_influence_pctile"] = float(sci_pctile)
                    if entry["network_influence_pctile"] is None and net_pctile is not None:
                        entry["network_influence_pctile"] = float(net_pctile)
                    if entry["pharma_engagement_pctile"] is None and pharma_pctile is not None:
                        entry["pharma_engagement_pctile"] = float(pharma_pctile)
                    if entry["cohort_score"] is None and cohort_score is not None:
                        entry["cohort_score"] = float(cohort_score)
                    if entry["computed_at"] is None and computed_at is not None:
                        entry["computed_at"] = computed_at
                    if scope_type == "global":
                        entry["global_rank"] = int(rank_val) if rank_val is not None else None
                    elif scope_type == "region" and scope_value == "US":
                        entry["us_rank"] = int(rank_val) if rank_val is not None else None

    return rows_by_pair


def fetch_established_leadership_rows(
    hcp_ids: Set[str],
    visible_ta_ids: List[str],
) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """Load TA-scoped publication leadership rows for Established narrative context."""
    if not hcp_ids or not visible_ta_ids:
        return {}

    ids_list = list(hcp_ids)
    ta_list = list(visible_ta_ids)
    rows_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    batch_size = 500

    sql = """
        SELECT
            hcp_id,
            therapeutic_area_id,
            first_pub_count,
            senior_pub_count,
            senior_pub_recent_5yr,
            guideline_pub_count,
            percentile_rank
        FROM hcp_publication_leadership_v2
        WHERE therapeutic_area_id = ANY(%s::uuid[])
          AND hcp_id = ANY(%s::uuid[])
    """

    with get_db_conn() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(ids_list), batch_size):
                batch_ids = ids_list[i : i + batch_size]
                cur.execute(sql, (ta_list, batch_ids))
                for row in cur.fetchall():
                    hcp_id = str(row["hcp_id"])
                    ta_id = str(row["therapeutic_area_id"])
                    rows_by_pair[(hcp_id, ta_id)] = dict(row)
    return rows_by_pair


def merge_established_leadership_rows(
    established_v3_by_pair: Dict[Tuple[str, str], Dict[str, Any]],
    leadership_by_pair: Dict[Tuple[str, str], Dict[str, Any]],
) -> None:
    """Merge hcp_publication_leadership_v2 fields into Established v3 context dicts."""
    for key, lead in leadership_by_pair.items():
        if key not in established_v3_by_pair:
            continue
        entry = established_v3_by_pair[key]
        first_pub = safe_int(lead.get("first_pub_count")) or 0
        senior_pub = safe_int(lead.get("senior_pub_count")) or 0
        entry["first_pub_count"] = first_pub
        entry["senior_pub_count"] = senior_pub
        entry["senior_pub_recent_5yr"] = safe_int(lead.get("senior_pub_recent_5yr"))
        entry["guideline_pub_count"] = safe_int(lead.get("guideline_pub_count"))
        entry["leadership_percentile_rank"] = safe_float(lead.get("percentile_rank"))
        entry["lead_pub_total"] = first_pub + senior_pub


def fetch_established_top_hcp_ids(
    supabase: Client, top_n: int, visible_ta_ids: List[str]
) -> Set[str]:
    """Established cohort selection: US-scope only, top N per TA from hcp_established_ranks_v3.

    Matches the platform's US-default product model. Global/international HCPs are
    intentionally excluded from narrative generation.
    """
    selected: Set[str] = set()
    for ta_id in visible_ta_ids:
        try:
            response = (
                supabase.table("hcp_established_ranks_v3")
                .select("hcp_id,rank")
                .eq("therapeutic_area_id", ta_id)
                .eq("scope_type", "region")
                .eq("scope_value", "US")
                .order("rank", desc=False)
                .range(0, top_n - 1)
                .execute()
            )
            for row in response.data or []:
                hcp_id = row.get("hcp_id")
                if hcp_id:
                    selected.add(str(hcp_id))
        except Exception as exc:
            print(f"[load] hcp_established_ranks_v3 query failed for TA {ta_id}: {exc}")
    return selected


def fetch_community_top_hcp_ids(
    supabase: Client, top_n: int, visible_ta_ids: List[str]
) -> Set[str]:
    """Community cohort selection: US-scope, top N per TA from hcp_community_ranks_v2.

    Exact mirror of fetch_established_top_hcp_ids (per-TA, scope_type='region'/'US',
    ordered by rank) — hcp_community_ranks_v2 carries the same global + US-region scope
    rows per HCP, so scoping to US yields one row per HCP (without it, top-N *rows* would
    collapse to ~N/2 unique HCPs). Replaces the old selector that read
    hcps_v2.cohort_classification/cohort_score — a TA-independent legacy column that pulled
    the global top-N across ALL TAs (Hepatology/Rare-Disease dominating an --ta nsclc run).
    NOTE: AD has zero rows here — AD community lives in community_practitioners (the
    directory), not this table — so an AD run correctly selects no community narratives.
    """
    selected: Set[str] = set()
    for ta_id in visible_ta_ids:
        try:
            response = (
                supabase.table("hcp_community_ranks_v2")
                .select("hcp_id,rank")
                .eq("therapeutic_area_id", ta_id)
                .eq("scope_type", "region")
                .eq("scope_value", "US")
                .order("rank", desc=False)
                .range(0, top_n - 1)
                .execute()
            )
            for row in response.data or []:
                hcp_id = row.get("hcp_id")
                if hcp_id:
                    selected.add(str(hcp_id))
        except Exception as exc:
            print(f"[load] hcp_community_ranks_v2 query failed for TA {ta_id}: {exc}")
    return selected


def fetch_hcps_by_ids(
    supabase: Client,
    hcp_ids: Set[str],
    target_version: str,
) -> List[Dict]:
    """Load HCP rows for a set of ids (batched to avoid URL limits)."""
    if not hcp_ids:
        return []
    hcps_table = get_table_name("hcps", target_version)
    if target_version == "v2":
        hcp_select_cols = (
            "id,first_name,last_name,institution_normalized,country,"
            "cohort_classification,cohort_score,total_career_pubs,career_first_pub_year_v2"
        )
    else:
        hcp_select_cols = (
            "id,first_name,last_name,institution,country,cohort_classification,"
            "cohort_score,total_career_pubs,first_pub_year"
        )
    ids_list = list(hcp_ids)
    hcps: List[Dict] = []
    batch_size = 500
    for i in range(0, len(ids_list), batch_size):
        batch_ids = ids_list[i : i + batch_size]
        response = (
            supabase.table(hcps_table)
            .select(hcp_select_cols)
            .in_("id", batch_ids)
            .execute()
        )
        batch = response.data or []
        if target_version == "v2":
            for row in batch:
                if "institution_normalized" in row:
                    row["institution"] = row.pop("institution_normalized")
                if "career_first_pub_year_v2" in row:
                    row["first_pub_year"] = row.pop("career_first_pub_year_v2")
        hcps.extend(batch)
    return hcps


def load_hcp_contexts(
    supabase: Client,
    target_cohorts: List[str],
    community_top_n: int,
    rising_top_n: int,
    established_top_n: int,
    target_version: str = "v1",
    single_hcp_id: Optional[str] = None,
    ta_slug: Optional[str] = None,
) -> Tuple[List[HCPContext], Dict[str, str]]:
    """
    Load HCP context for narrative generation, filtered by cohort.

    For rising_star and established: top N per (TA x visible scope) from rank views.
    For community: top N by cohort_score (default 500).

    When single_hcp_id is set, skip top-N selection and load only that HCP using the
    cohort's existing data-fetch paths.
    """
    visible_ta_ids = load_visible_ta_ids(supabase)
    if not visible_ta_ids:
        print("[WARNING] No visible TAs configured. Returning empty context list.")
        return [], {}

    # Optional single-TA scoping: resolve the --ta slug to its id via
    # therapeutic_areas.slug and restrict the run to that TA (must be among the
    # visible TAs). Additive only — omitting --ta leaves visible_ta_ids unchanged.
    if ta_slug:
        slug_resp = (
            supabase.table("therapeutic_areas")
            .select("id,slug")
            .eq("slug", ta_slug)
            .execute()
        )
        matched_ids = {str(r["id"]) for r in (slug_resp.data or []) if r.get("id")}
        scoped_ta_ids = [t for t in visible_ta_ids if t in matched_ids]
        if not scoped_ta_ids:
            raise ValueError(
                f"--ta '{ta_slug}' not found among visible TAs: {visible_ta_ids}"
            )
        visible_ta_ids = scoped_ta_ids
        print(f"--ta scoping: restricted to slug '{ta_slug}' -> {visible_ta_ids}")

    hcps: List[Dict] = []
    cohort_by_hcp: Dict[str, str] = {}
    rising_star_v3_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}
    established_v3_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {}

    if single_hcp_id:
        print(f"Single-HCP mode: loading hcp_id={single_hcp_id} (skipping cohort top-N selection)")
        hcp_rows = fetch_hcps_by_ids(supabase, {single_hcp_id}, target_version)
        if not hcp_rows:
            print(f"[WARNING] HCP {single_hcp_id} not found.")
            return [], {}
        hcp = hcp_rows[0]
        cohort = hcp.get("cohort_classification")
        if not cohort or cohort not in target_cohorts:
            print(
                f"[WARNING] HCP {single_hcp_id} cohort_classification={cohort!r} "
                f"does not match target cohorts {target_cohorts}."
            )
            return [], {}
        cohort_by_hcp[single_hcp_id] = cohort
        hcps = hcp_rows
        if cohort == "rising_star":
            rising_star_v3_by_pair = fetch_rising_star_v3_context_rows(
                {single_hcp_id}, visible_ta_ids
            )
            print(f"Loaded {len(rising_star_v3_by_pair)} Rising Star v3 HCP x TA signal rows")
        elif cohort == "established":
            established_v3_by_pair = fetch_established_v3_context_rows(
                {single_hcp_id}, visible_ta_ids
            )
            leadership_by_pair = fetch_established_leadership_rows(
                {single_hcp_id}, visible_ta_ids
            )
            merge_established_leadership_rows(established_v3_by_pair, leadership_by_pair)
            print(f"Loaded {len(established_v3_by_pair)} Established v3 HCP x TA rank rows")
            print(f"Merged {len(leadership_by_pair)} Established HCP x TA leadership rows")
        else:
            print(f"Loaded community HCP {single_hcp_id}")
    elif "rising_star" in target_cohorts:
        print(
            f"Selecting rising_star top-{rising_top_n} per (TA x visible scope) "
            "from the rising rank source (per-TA model: composite for AD, legacy v3 otherwise)..."
        )
        rising_ids = fetch_rising_star_top_hcp_ids_v3(
            supabase, rising_top_n, visible_ta_ids
        )
        print(f"Rising star rank selection: {len(rising_ids)} unique HCPs")
        for hcp_id in rising_ids:
            cohort_by_hcp[hcp_id] = "rising_star"
        hcps.extend(fetch_hcps_by_ids(supabase, rising_ids, target_version))
        rising_star_v3_by_pair = fetch_rising_star_v3_context_rows(rising_ids, visible_ta_ids)
        print(f"Loaded {len(rising_star_v3_by_pair)} Rising Star v3 HCP x TA signal rows")

    if not single_hcp_id and "established" in target_cohorts:
        print(f"Selecting established top-{established_top_n} per (TA x visible scope) from hcp_established_ranks_v3...")
        established_ids = fetch_established_top_hcp_ids(supabase, established_top_n, visible_ta_ids)
        print(f"Established rank selection: {len(established_ids)} unique HCPs")
        for hcp_id in established_ids:
            cohort_by_hcp[hcp_id] = "established"
        hcps.extend(fetch_hcps_by_ids(supabase, established_ids, target_version))
        established_v3_by_pair = fetch_established_v3_context_rows(established_ids, visible_ta_ids)
        leadership_by_pair = fetch_established_leadership_rows(established_ids, visible_ta_ids)
        merge_established_leadership_rows(established_v3_by_pair, leadership_by_pair)
        print(f"Loaded {len(established_v3_by_pair)} Established v3 HCP x TA rank rows")
        print(f"Merged {len(leadership_by_pair)} Established HCP x TA leadership rows")

    if not single_hcp_id and "community" in target_cohorts:
        print(f"Selecting community top-{community_top_n} per (TA x visible scope) from hcp_community_ranks_v2...")
        community_ids = fetch_community_top_hcp_ids(supabase, community_top_n, visible_ta_ids)
        print(f"Community rank selection: {len(community_ids)} unique HCPs")
        for hcp_id in community_ids:
            cohort_by_hcp[hcp_id] = "community"
        hcps.extend(fetch_hcps_by_ids(supabase, community_ids, target_version))

    # Dedupe by HCP id (same HCP may appear in multiple cohort selections)
    seen_ids: Set[str] = set()
    deduped_hcps: List[Dict] = []
    for row in hcps:
        hcp_id = row.get("id")
        if not hcp_id or hcp_id in seen_ids:
            continue
        seen_ids.add(hcp_id)
        if hcp_id in cohort_by_hcp:
            row["cohort_classification"] = cohort_by_hcp[hcp_id]
        deduped_hcps.append(row)
    hcps = deduped_hcps
    print(f"Loaded {len(hcps)} HCPs across cohorts {target_cohorts}")

    hcp_ids = {h["id"] for h in hcps if h.get("id")}

    print("Loading hcp_therapeutic_areas membership...")
    hcp_tas = fetch_all_rows(
        supabase,
        get_table_name("hcp_therapeutic_areas", target_version),
        "hcp_id,therapeutic_area_id",
        target_version=target_version,
    )
    ta_membership = {
        (row.get("hcp_id"), row.get("therapeutic_area_id"))
        for row in hcp_tas
        if row.get("hcp_id") in hcp_ids
    }
    print(f"Filtered to {len(ta_membership)} HCP×TA membership pairs for target cohorts")

    print("Loading therapeutic_areas...")
    ta_columns = "id,name,slug" if target_version == "v2" else "id,name"
    tas = fetch_all_rows(supabase, "therapeutic_areas", ta_columns)
    ta_name_map = {row["id"]: row.get("name", row["id"]) for row in tas if row.get("id")}
    ta_slug_map = {row["id"]: row.get("slug", "") for row in tas if row.get("id")}

    hcp_ids_by_cohort: Dict[str, Set[str]] = {c: set() for c in target_cohorts}
    for hcp in hcps:
        hid = hcp.get("id")
        cohort = hcp.get("cohort_classification")
        if hid and cohort in hcp_ids_by_cohort:
            hcp_ids_by_cohort[cohort].add(hid)

    scores_by_cohort: Dict[str, Dict[Tuple[str, str], Dict]] = {}
    for cohort in target_cohorts:
        if cohort == "rising_star":
            continue
        if cohort not in COHORT_SCORE_CONFIG:
            continue
        cohort_config = COHORT_SCORE_CONFIG[cohort]
        if "score_table" not in cohort_config:
            continue
        cohort_hcp_ids = hcp_ids_by_cohort.get(cohort) or set()
        if not cohort_hcp_ids:
            continue
        score_table = cohort_config["score_table"]
        score_cols = list(cohort_config["score_fields"].values())
        scores_select = (
            "hcp_id,therapeutic_area_id,composite_score,"
            + ",".join(score_cols)
            + ",scored_at"
        )
        print(f"Loading scores from {score_table} for {cohort}...")
        scores = fetch_all_rows(
            supabase, score_table, scores_select, target_version=target_version
        )
        for row in scores:
            if row.get("scored_at") and not row.get("calculated_at"):
                row["calculated_at"] = row["scored_at"]
        filtered_scores = [
            row
            for row in scores
            if row.get("hcp_id") in cohort_hcp_ids
            and (row.get("hcp_id"), row.get("therapeutic_area_id")) in ta_membership
        ]
        scores_by_cohort[cohort] = pick_latest_scores(filtered_scores)

    ops_table = get_table_name("hcp_open_payments_summary", target_version)
    print("Loading hcp_open_payments_summary...")
    # Batched .in_() like fetch_hcps_by_ids: a single .in_() with the whole cohort
    # overflows the request URL (hundreds of UUIDs > the gateway's char limit) and
    # 400s. The old len<1000 guard checked id COUNT, not URL length — the wrong axis.
    ops_ids_list = list(hcp_ids)
    ops_batch_size = 500
    ops_by_hcp: Dict[str, Dict] = {}
    for i in range(0, len(ops_ids_list), ops_batch_size):
        batch_ids = ops_ids_list[i : i + ops_batch_size]
        ops_raw = (
            supabase.table(ops_table)
            .select("hcp_id,total_payments_lifetime,distinct_companies_lifetime")
            .in_("hcp_id", batch_ids)
            .execute()
        )
        for row in (ops_raw.data or []):
            if row.get("hcp_id"):
                ops_by_hcp[row["hcp_id"]] = row

    hcp_map = {row["id"]: row for row in hcps if row.get("id")}

    print("Computing per-TA percentile distributions...")
    ta_distributions_by_cohort: Dict[str, Dict[str, Dict[str, List[float]]]] = {}
    for cohort, cohort_scores in scores_by_cohort.items():
        if cohort == "established":
            continue
        config = COHORT_SCORE_CONFIG[cohort]
        if "score_fields" not in config:
            continue
        ta_distributions_by_cohort[cohort] = {}
        for (_hcp_id, ta_id), score_row in cohort_scores.items():
            if ta_id not in ta_distributions_by_cohort[cohort]:
                ta_distributions_by_cohort[cohort][ta_id] = {
                    field_name: [] for field_name in config["score_fields"]
                }
            for field_name, db_column in config["score_fields"].items():
                value = safe_float(score_row.get(db_column))
                if value is not None:
                    ta_distributions_by_cohort[cohort][ta_id][field_name].append(value)

    contexts: List[HCPContext] = []
    for cohort, cohort_scores in scores_by_cohort.items():
        if cohort == "established":
            continue
        config = COHORT_SCORE_CONFIG[cohort]
        if "score_fields" not in config:
            continue
        for (hcp_id, ta_id), score_row in cohort_scores.items():
            if (hcp_id, ta_id) not in ta_membership:
                continue
            hcp = hcp_map.get(hcp_id)
            if not hcp:
                continue

            cohort_cls = hcp.get("cohort_classification", "unknown")
            percentile_data: Dict[str, int] = {}
            if score_row and config:
                for field_name, db_column in config["score_fields"].items():
                    value = safe_float(score_row.get(db_column))
                    if value is not None:
                        distribution = (
                            ta_distributions_by_cohort.get(cohort, {})
                            .get(ta_id, {})
                            .get(field_name, [])
                        )
                        percentile_data[field_name] = percentile_within_ta(value, distribution)

            pv_pct: Optional[float] = None
            ct_pct: Optional[float] = None
            tr_pct: Optional[float] = None
            if cohort_cls == "rising_star":
                pv_pct = percentile_data.get("pub_velocity")
                ct_pct = percentile_data.get("citation_trajectory")
                tr_pct = percentile_data.get("trial_investigator")

            ops = ops_by_hcp.get(hcp_id, {})

            ctx = HCPContext(
                hcp_id=hcp_id,
                therapeutic_area_id=ta_id,
                therapeutic_area_name=ta_name_map.get(ta_id, ta_id),
                first_name=hcp.get("first_name"),
                last_name=hcp.get("last_name"),
                institution=hcp.get("institution"),
                country=hcp.get("country"),
                cohort_classification=cohort_cls,
                cohort_score=safe_float(hcp.get("cohort_score")),
                composite_score=safe_float(score_row.get("composite_score")),
                pub_velocity_pct=pv_pct,
                citation_trajectory_pct=ct_pct,
                trial_investigator_pct=tr_pct,
                first_pub_year=safe_int(hcp.get("first_pub_year")),
                total_career_pubs=safe_int(hcp.get("total_career_pubs")),
                pharma_engagement_lifetime=safe_float(ops.get("total_payments_lifetime")),
                pharma_companies_distinct=safe_int(ops.get("distinct_companies_lifetime")),
                percentile_data=percentile_data,
                therapeutic_area_slug=ta_slug_map.get(ta_id, ""),
            )
            contexts.append(ctx)

    if "rising_star" in target_cohorts:
        for (hcp_id, ta_id), v3_row in rising_star_v3_by_pair.items():
            if (hcp_id, ta_id) not in ta_membership:
                continue
            hcp = hcp_map.get(hcp_id)
            if not hcp:
                continue
            ops = ops_by_hcp.get(hcp_id, {})
            ctx = HCPContext(
                hcp_id=hcp_id,
                therapeutic_area_id=ta_id,
                therapeutic_area_name=ta_name_map.get(ta_id, ta_id),
                first_name=hcp.get("first_name"),
                last_name=hcp.get("last_name"),
                institution=hcp.get("institution"),
                country=hcp.get("country"),
                cohort_classification="rising_star",
                cohort_score=safe_float(v3_row.get("rising_star_percentile")),
                composite_score=safe_float(v3_row.get("rising_star_percentile")),
                pub_velocity_pct=None,
                citation_trajectory_pct=None,
                trial_investigator_pct=None,
                first_pub_year=safe_int(hcp.get("first_pub_year")),
                total_career_pubs=safe_int(hcp.get("total_career_pubs")),
                pharma_engagement_lifetime=safe_float(ops.get("total_payments_lifetime")),
                pharma_companies_distinct=safe_int(ops.get("distinct_companies_lifetime")),
                percentile_data={},
                therapeutic_area_slug=ta_slug_map.get(ta_id, ""),
                rising_star_v3=v3_row,
            )
            contexts.append(ctx)

    if "established" in target_cohorts:
        for (hcp_id, ta_id), v3_row in established_v3_by_pair.items():
            if (hcp_id, ta_id) not in ta_membership:
                continue
            hcp = hcp_map.get(hcp_id)
            if not hcp:
                continue
            ops = ops_by_hcp.get(hcp_id, {})
            ctx = HCPContext(
                hcp_id=hcp_id,
                therapeutic_area_id=ta_id,
                therapeutic_area_name=ta_name_map.get(ta_id, ta_id),
                first_name=hcp.get("first_name"),
                last_name=hcp.get("last_name"),
                institution=hcp.get("institution"),
                country=hcp.get("country"),
                cohort_classification="established",
                cohort_score=safe_float(v3_row.get("cohort_score")),
                composite_score=safe_float(v3_row.get("cohort_score")),
                pub_velocity_pct=None,
                citation_trajectory_pct=None,
                trial_investigator_pct=None,
                first_pub_year=safe_int(hcp.get("first_pub_year")),
                total_career_pubs=None,
                pharma_engagement_lifetime=safe_float(ops.get("total_payments_lifetime")),
                pharma_companies_distinct=safe_int(ops.get("distinct_companies_lifetime")),
                percentile_data={},
                therapeutic_area_slug=ta_slug_map.get(ta_id, ""),
                established_v3=v3_row,
            )
            contexts.append(ctx)

    print(f"Built {len(contexts)} HCP×TA contexts for narrative generation")
    return contexts, ta_name_map


def freshness_filter(
    contexts: List[HCPContext],
    supabase: Client,
    ta_name_map: Dict[str, str],
    target_version: str = "v1",
) -> List[HCPContext]:
    """Drop contexts whose narrative is newer than the latest score row."""
    if not contexts:
        return contexts

    narratives_table = get_table_name("hcp_narratives", target_version)
    scores_table = get_table_name("hcp_scores", target_version)
    score_ts_col = "scored_at" if target_version == "v2" else "calculated_at"

    kept: List[HCPContext] = []
    skipped = 0
    for ctx in contexts:
        ta_id = ctx.therapeutic_area_id
        ta_slug = ta_slug_from_name(ta_name_map.get(ta_id))
        try:
            narr_resp = (
                supabase.table(narratives_table)
                .select("generated_at")
                .eq("hcp_id", ctx.hcp_id)
                .eq("therapeutic_area_slug", ta_slug)
                .limit(1)
                .execute()
            )
            narr_rows = narr_resp.data or []
            if not narr_rows:
                kept.append(ctx)
                continue
            generated_at = narr_rows[0].get("generated_at")
            if not generated_at:
                kept.append(ctx)
                continue

            if ctx.cohort_classification == "rising_star":
                rising_score_table = (
                    "hcp_rising_composite_v1"
                    if str(ctx.therapeutic_area_id) == AD_TA_ID
                    else "hcp_rising_star_ranks_v3"
                )
                score_resp = (
                    supabase.table(rising_score_table)
                    .select("computed_at")
                    .eq("hcp_id", ctx.hcp_id)
                    .eq("therapeutic_area_id", ctx.therapeutic_area_id)
                    .limit(1)
                    .execute()
                )
                score_rows = score_resp.data or []
                if not score_rows:
                    kept.append(ctx)
                    continue
                scored_at = score_rows[0].get("computed_at")
                if scored_at and str(generated_at) > str(scored_at):
                    skipped += 1
                    continue
                kept.append(ctx)
                continue

            if ctx.cohort_classification == "established":
                score_resp = (
                    supabase.table("hcp_established_ranks_v3")
                    .select("computed_at")
                    .eq("hcp_id", ctx.hcp_id)
                    .eq("therapeutic_area_id", ctx.therapeutic_area_id)
                    .limit(1)
                    .execute()
                )
                score_rows = score_resp.data or []
                if not score_rows:
                    kept.append(ctx)
                    continue
                scored_at = score_rows[0].get("computed_at")
                if scored_at and str(generated_at) > str(scored_at):
                    skipped += 1
                    continue
                kept.append(ctx)
                continue

            score_resp = (
                supabase.table(scores_table)
                .select(score_ts_col)
                .eq("hcp_id", ctx.hcp_id)
                .eq("therapeutic_area_id", ctx.therapeutic_area_id)
                .order(score_ts_col, desc=True)
                .limit(1)
                .execute()
            )
            score_rows = score_resp.data or []
            if not score_rows:
                kept.append(ctx)
                continue
            scored_at = score_rows[0].get(score_ts_col)
            if scored_at and str(generated_at) > str(scored_at):
                skipped += 1
                continue
            kept.append(ctx)
        except Exception as exc:
            print(
                f"[freshness] WARN: could not check hcp_id={ctx.hcp_id} "
                f"ta_id={ta_id} slug={ta_slug}: {exc}; keeping context"
            )
            kept.append(ctx)

    print(f"[freshness] Skipped {skipped} contexts with narratives newer than latest score")
    return kept


def format_hcp_facts_rising(ctx: HCPContext) -> str:
    """Format the HCP context as a fact block for the prompt."""
    hcp_name = f"{ctx.first_name or ''} {ctx.last_name or ''}".strip() or "Unknown HCP"
    lines = [
        f"Name: {hcp_name}",
        f"Institution: {ctx.institution or 'Unknown'}",
        f"Therapeutic Area: {ctx.therapeutic_area_name}",
        f"Cohort: {ctx.cohort_classification}",
        f"Cohort Score (percentile within cohort): {ctx.cohort_score if ctx.cohort_score is not None else 'Unknown'}",
    ]
    if ctx.first_pub_year is not None:
        career_years = datetime.now(timezone.utc).year - ctx.first_pub_year
        lines.append(f"Career Length: ~{career_years} years (first publication {ctx.first_pub_year})")
    if ctx.total_career_pubs is not None:
        lines.append(f"Total Career Publications: {ctx.total_career_pubs}")
    if ctx.pub_velocity_pct is not None:
        lines.append(f"Publication Velocity: {ctx.pub_velocity_pct}th percentile within TA")
    if ctx.citation_trajectory_pct is not None:
        lines.append(f"Citation Trajectory: {ctx.citation_trajectory_pct}th percentile within TA")
    if ctx.trial_investigator_pct is not None:
        lines.append(f"Clinical Trial Activity: {ctx.trial_investigator_pct}th percentile within TA")
    if ctx.pharma_engagement_lifetime is not None:
        lines.append(f"Lifetime Pharma Engagement: ${ctx.pharma_engagement_lifetime:,.0f}")
    if ctx.pharma_companies_distinct is not None:
        lines.append(f"Distinct Pharma Companies (lifetime): {ctx.pharma_companies_distinct}")
    return "\n".join(lines)


def format_hcp_facts_established(ctx: HCPContext) -> str:
    """Build prompt fact list for an Established-cohort HCP. Reads ctx.established_v3 (v3 ranks)."""
    v3 = ctx.established_v3 or {}
    lines = [
        f"HCP: {ctx.first_name or ''} {ctx.last_name or ''}".strip(),
        f"Institution: {ctx.institution or 'Unknown'}",
        f"Country: {ctx.country or 'Unknown'}",
        f"Therapeutic Area: {ctx.therapeutic_area_name}",
        f"Cohort: Established (recognized expert tier within TA)",
    ]

    global_rank = v3.get("global_rank")
    us_rank = v3.get("us_rank")
    rank_parts = []
    if global_rank is not None:
        rank_parts.append(f"global rank {global_rank}")
    if us_rank is not None:
        rank_parts.append(f"US rank {us_rank}")
    if rank_parts:
        lines.append("Standing: " + "; ".join(rank_parts) + " within the Established TA cohort")

    senior_pub_count = v3.get("senior_pub_count")
    senior_recent = v3.get("senior_pub_recent_5yr")
    leadership_pct = v3.get("leadership_percentile_rank")
    guideline_count = v3.get("guideline_pub_count")
    ta_label = ctx.therapeutic_area_name

    if senior_pub_count is not None:
        lines.append(
            f"Senior-Author Publications ({ta_label}): {senior_pub_count} lifetime "
            "(TA-scoped senior-author count)"
        )
    if senior_recent is not None:
        lines.append(
            f"Senior-Author Publications, last 5 years ({ta_label}): {senior_recent}"
        )
    if leadership_pct is not None:
        lines.append(
            f"Publication Leadership Percentile ({ta_label} Established cohort): "
            f"{leadership_pct:.0f}th percentile"
        )
    if guideline_count is not None and guideline_count > 0:
        lines.append(f"Guideline Publications ({ta_label}): {guideline_count}")

    if ctx.first_pub_year is not None:
        career_years = datetime.now(timezone.utc).year - ctx.first_pub_year
        lines.append(f"Career Length: ~{career_years} years (first publication {ctx.first_pub_year})")

    sci = v3.get("scientific_influence_pctile")
    net = v3.get("network_influence_pctile")
    pharma = v3.get("pharma_engagement_pctile")

    if sci is not None:
        lines.append(
            f"Scientific Influence: {sci:.0f}th percentile within Established cohort "
            "(publication leadership and citation impact)"
        )
    if net is not None:
        lines.append(
            f"Network Influence: {net:.0f}th percentile within Established cohort "
            "(co-authorship graph centrality)"
        )
    if pharma is not None:
        lines.append(
            f"Pharma Engagement: {pharma:.0f}th percentile within Established cohort "
            "(industry collaboration breadth)"
        )
    else:
        lines.append("Pharma Engagement: no Open Payments data on file for this HCP")

    if ctx.pharma_engagement_lifetime is not None:
        lines.append(f"Lifetime Pharma Engagement: ${ctx.pharma_engagement_lifetime:,.0f}")
    if ctx.pharma_companies_distinct is not None:
        lines.append(f"Distinct Pharma Companies (lifetime): {ctx.pharma_companies_distinct}")
    return "\n".join(lines)


def format_hcp_facts_community(ctx: HCPContext) -> str:
    """Build prompt fact list for a Community-cohort HCP. Reads from ctx.percentile_data dict."""
    lines = [
        f"HCP: {ctx.first_name or ''} {ctx.last_name or ''}".strip(),
        f"Institution: {ctx.institution or 'Unknown'}",
        f"Country: {ctx.country or 'Unknown'}",
        f"Therapeutic Area: {ctx.therapeutic_area_name}",
        f"Cohort: Community (top visible board by cohort_score within TA)",
        f"Cohort Score: {ctx.cohort_score if ctx.cohort_score is not None else 'Unknown'}",
    ]
    if ctx.first_pub_year is not None:
        career_years = datetime.now(timezone.utc).year - ctx.first_pub_year
        lines.append(f"Career Length: ~{career_years} years (first publication {ctx.first_pub_year})")
    if ctx.total_career_pubs is not None:
        lines.append(f"Total Career Publications: {ctx.total_career_pubs}")
    pd = ctx.percentile_data or {}
    if "pharma_engagement" in pd:
        lines.append(f"Pharma Engagement Score: {pd['pharma_engagement']}th percentile within TA")
    if "engagement_breadth" in pd:
        lines.append(f"Engagement Breadth: {pd['engagement_breadth']}th percentile within TA")
    if "medicare_volume" in pd:
        lines.append(f"Medicare Patient Volume: {pd['medicare_volume']}th percentile within TA")
    if "career_stage" in pd:
        lines.append(f"Career Stage Score: {pd['career_stage']}th percentile within TA")
    if ctx.pharma_engagement_lifetime is not None:
        lines.append(f"Lifetime Pharma Engagement: ${ctx.pharma_engagement_lifetime:,.0f}")
    if ctx.pharma_companies_distinct is not None:
        lines.append(f"Distinct Pharma Companies (lifetime): {ctx.pharma_companies_distinct}")
    return "\n".join(lines)


def format_hcp_facts(ctx: HCPContext, cohort: str) -> str:
    """Dispatch to the right cohort-specific fact formatter."""
    if cohort == "rising_star":
        return format_hcp_facts_rising(ctx)
    if cohort == "established":
        return format_hcp_facts_established(ctx)
    if cohort == "community":
        return format_hcp_facts_community(ctx)
    raise ValueError(f"Unknown cohort {cohort!r}")


def _format_rising_themes(themes: Optional[List[Dict[str, Any]]]) -> str:
    """Render per-HCP AD research themes for the composite rising prompt.

    Empty / missing → an explicit instruction to reason from metrics alone, so
    the prompt assembles cleanly for thin-corpus HCPs (themes = []).
    """
    if not themes:
        return ("None available — reason from the publication metrics alone; "
                "do not invent focus areas.")
    lines: List[str] = []
    for theme in themes:
        label = (theme.get("label") or "").strip()
        if not label:
            continue
        centrality = (theme.get("centrality") or "unspecified").strip()
        lines.append(f"  - [{centrality}] {label}")
    if not lines:
        return ("None available — reason from the publication metrics alone; "
                "do not invent focus areas.")
    return "\n".join(lines)


def build_prompt_rising_star_composite(ctx: HCPContext) -> str:
    """AD Rising Star prompt — 2-axis Emergence / Network Influence composite model.

    Distinct from the frozen v3 momentum/visibility/archetype prompt used by every
    non-AD TA. The output JSON keys are IDENTICAL to the legacy rising prompt
    (narrative, why_now, signal_strength, caution_flags, engagement_angle) so the
    shared parser (generate_narrative) and writer (upsert_narrative) are unchanged.
    'signal_strength' is CONCEPTUALLY the emergence-confidence field here — the JSON
    key stays 'signal_strength' to avoid breaking the required-field check and the
    hcp_narratives(_v2).signal_strength column; only its meaning/label changes.
    """
    v3 = ctx.rising_star_v3 or {}
    career_years = "Unknown"
    if ctx.first_pub_year is not None:
        career_years = str(datetime.now(timezone.utc).year - ctx.first_pub_year)

    # recent_senior_first_pct is stored as a 0-1 fraction; render as a percent.
    _sf = safe_float(v3.get("recent_senior_first_pct"))
    senior_first_pct_disp = format_display_int(_sf * 100) if _sf is not None else "Unknown"
    themes_block = _format_rising_themes(v3.get("themes"))

    return f"""You are writing an MSL-facing intelligence brief for an EMERGING (rising)
{ctx.therapeutic_area_name} investigator — someone whose recent body of work
indicates they are TRANSITIONING INTO scientific leadership in {ctx.therapeutic_area_name}.
You are NOT describing an established authority; you are flagging someone crossing
that threshold, so a field team can engage them BEFORE their influence peaks.

HCP: {ctx.first_name or ''} {ctx.last_name or ''}
Institution: {ctx.institution or 'Unknown'}
Career years (first publication to present): {career_years}

DATA (recent window = 2021-2025):
  Recent {ctx.therapeutic_area_name} publications: {format_display_int(v3.get('recent_pub_count'))}
  Recent senior-author publications: {format_display_int(v3.get('recent_senior_pubs'))}
  Recent first-author publications: {format_display_int(v3.get('recent_first_pubs'))}
  Senior/first-author share of recent output: {senior_first_pct_disp}%
  Citations per recent paper: {format_display_int(v3.get('recent_citations_per_pub'))}
  Total recent citations: {format_display_int(v3.get('recent_total_citations'))}
  Emergence percentile (within the rising cohort): {format_percentile_one_decimal(v3.get('emergence_percentile'))}
  Network Influence percentile: {format_percentile_one_decimal(v3.get('network_influence_pctile'))}
  Composite rising score: {format_percentile_one_decimal(v3.get('rising_composite_score'))}
  Rank in the {ctx.therapeutic_area_name} rising cohort: {format_display_int(v3.get('rank'))}

RESEARCH THEMES (this HCP's actual {ctx.therapeutic_area_name} subfocus; centrality in brackets):
{themes_block}

HOW TO REASON (follow this order; do NOT output these instructions):
1. PRE-STEP (internal, do not output): identify the SINGLE STRONGEST piece of
   evidence that this investigator is emerging. Build the narrative around that
   one thing — not an even list of every statistic.
2. EVIDENCE LOGIC — lead with CONCRETE OBSERVABLE evidence (actual recent output,
   authorship, citation impact), THEN interpretation (what that combination
   implies), THEN the percentile as CONFIRMATION, last. Never lead with the
   percentile; it validates the observation, it does not replace it.
3. REASON, DON'T RECITE — do not list numbers ("39 papers. 28 citations. 99.9
   percentile."). Reason FROM them ("an unusually high volume of recent
   publications combined with consistent senior authorship suggests a rapid
   transition from contributor to scientific leader"). The insight leads; the
   numbers support it.
4. EMERGENCE DISCIPLINE (future tense) — this person is still climbing. Use
   "fastest-establishing," "rapidly building scientific authority,"
   "increasingly influential." NEVER "leading authority," "recognized authority,"
   or "established" language — that describes the wrong cohort.
5. EMERGENCE vs NETWORK BALANCE — weight the narrative roughly 60% on the
   emergence / scientific story and 40% on the network / collaboration story.
   Give network a genuine second beat (advisory-board potential, referral
   patterns, congress presence, position in the {ctx.therapeutic_area_name}
   research graph, how their influence spreads) — not a footnote.
6. THEMES -> ENGAGEMENT — ground the engagement angle in this HCP's ACTUAL themes
   above (e.g. "JAK inhibitor positioning," "IL-31/IL-33 pruritus biology,"
   "barrier dysfunction," "pediatric AD," "comparative biologic efficacy"). Be
   specific to THEIR subfocus, never generic. If the themes are advocacy /
   patient-burden flavored, frame engagement accordingly — do not force a
   bench-science frame onto a non-bench profile. If no themes are listed, reason
   from the publication metrics alone and do not invent focus areas.
7. INDUSTRY AFFILIATION — if the Institution above is a pharmaceutical company
   (e.g. Regeneron, Sanofi, Pfizer, AbbVie, Eli Lilly), this is a meaningful
   {ctx.therapeutic_area_name} signal, NOT a disqualifier — AD's emerging evidence
   base is heavily industry-shaped. Write the narrative normally, but you MUST add
   a caution flag naming the affiliation as context (e.g. "Regeneron-affiliated;
   recent publication profile reflects an industry research role, characteristic
   of the heavy industry authorship shaping AD's emerging literature"), and frame
   engagement honestly for an industry-embedded author (scientific exchange /
   congress presence, not KOL recruitment).
8. PRIORITY HOOK (the close) — end on WHY ENGAGE NOW, as a priority argument, not
   hype. Concept (vary the wording): investigators at this stage often become
   tomorrow's established KOLs; early engagement builds the relationship before
   their influence reaches its peak.

Return STRICT JSON with EXACTLY these fields, no additional fields, no preamble,
no markdown fences:

{{
  "narrative": "...",
  "why_now": "...",
  "signal_strength": "high" | "moderate" | "early",
  "caution_flags": "..." | null,
  "engagement_angle": "..."
}}

Field instructions:

narrative: 4-6 sentences, max 130 words, MSL tone. Order: evidence ->
interpretation -> percentile-as-confirmation. Roughly 60% emergence / 40% network.
End on the priority hook. Do NOT use marketing words ("trajectory," "ascent,"
"leadership in the making," "exceptional," "rockstar," "monster"). Do not invent
numbers not present in the DATA above.

why_now: one to two sentences. The rationale for engaging at THIS career moment —
the emergence signal that makes now the right time, before their influence peaks.

signal_strength: this is your EMERGENCE CONFIDENCE — exactly one of "high",
"moderate", or "early", keyed to the strength of the emergence evidence (recent
output + authorship + citation impact, confirmed by the composite rising score and
emergence percentile). high = strong, convergent recent evidence; moderate = solid
but mixed; early = promising but thin. The JSON key MUST remain "signal_strength".

caution_flags: a single string listing the honest caveats (semicolon-separated if
more than one), or null. ACTIVELY include real ones — they build trust:
single-collaboration-network concentration, high recent volume but limited
independent senior authorship, industry affiliation (per rule 7), a highly
specialized / narrow focus, or a thin corpus. Return null ONLY if none genuinely
apply. Do NOT return a JSON array.

engagement_angle: one to two sentences. A specific, theme-grounded, science-forward
next step for the MSL, tied to this HCP's actual subfocus above (or to their
publication profile if no themes are listed). For an industry-embedded author,
frame as scientific exchange / congress presence, not KOL recruitment.

Output ONLY the JSON object. No code fences. No commentary.
"""


def build_prompt_rising_star(ctx: HCPContext) -> str:
    """Prompt for Rising Star cohort -- v3 momentum/visibility methodology."""
    # AD forks to the Emergence/Network composite prompt; all other TAs use the
    # frozen v3 momentum/visibility/archetype prompt below (byte-unchanged).
    if str(ctx.therapeutic_area_id) == AD_TA_ID:
        return build_prompt_rising_star_composite(ctx)
    v3 = ctx.rising_star_v3 or {}
    career_years = "Unknown"
    if ctx.first_pub_year is not None:
        career_years = str(datetime.now(timezone.utc).year - ctx.first_pub_year)

    us_rank = safe_int(v3.get("us_rank"))
    us_rank_clause = f"Rank {us_rank} US" if us_rank is not None else "Global cohort only"

    return f"""You are writing a structured narrative for an MSL describing why a
Healthcare Professional is classified as a Rising Star in the
{ctx.therapeutic_area_name} therapeutic area.

HCP: {ctx.first_name or ''} {ctx.last_name or ''}
Institution: {ctx.institution or 'Unknown'}
Career years: {career_years}
Archetype: {v3.get('archetype') or 'Emerging Leader'}

Rising Star composite percentile: {format_percentile_one_decimal(v3.get('rising_star_percentile'))}
  (Rank {format_display_int(v3.get('rank'))} global; {us_rank_clause})
Momentum component: {format_display_int(v3.get('momentum_component'))}
Visibility component: {format_display_int(v3.get('visibility_component'))}

Scientific Momentum percentile: {format_display_int(v3.get('scientific_momentum_percentile'))}
  Publications {format_display_int(v3.get('early_total_pubs'))} (2016-2020) -> {format_display_int(v3.get('recent_total_pubs'))}
    (2021-2025)
  Senior-author publication delta: {format_signed_int(v3.get('pub_velocity_delta'))}
  Citation volume growth: {format_signed_int(v3.get('citation_velocity_delta'))}
  Senior-author share: {format_display_int(v3.get('early_senior_author_pct'))} ->
    {format_display_int(v3.get('recent_senior_author_pct'))}

Network Momentum percentile: {format_display_int(v3.get('network_momentum_percentile'))}
  Collaborators {format_display_int(v3.get('early_collaborator_count'))} (2016-2020) ->
    {format_display_int(v3.get('recent_collaborator_count'))} (2021-2025)

Scientific Visibility percentile: {format_display_int(v3.get('scientific_visibility_percentile'))}
Network Visibility percentile: {format_display_int(v3.get('network_visibility_percentile'))}

Return STRICT JSON with exactly these fields, no additional fields,
no preamble, no markdown fences:

{{
  "narrative": "...",
  "why_now": "...",
  "signal_strength": "high" | "moderate" | "early",
  "caution_flags": "..." | null,
  "engagement_angle": "..."
}}

Field instructions:

narrative: 3-5 sentences, max 110 words. Plain professional English
for an MSL audience. Anchor every claim in a specific number from
the data above. Where a growth ratio is striking
(>=3x), describe it proportionally as well as in raw counts
(e.g., "publication output increased more than eight-fold, from
6 to 49 papers" rather than only "from 6 to 49"). Reference the
archetype EXPLICITLY at least once in the narrative -- either in
the opening identification ("X is a Scientific Accelerator in
NSCLC...") or in the interpretation ("This profile is
characteristic of a Balanced Rising Star..."). Do NOT use
marketing words ("trajectory," "ascent," "leadership in the
making," "exceptional," "monster"). End with a MILESTONE-FOCUSED forward-looking statement that
names a specific observable event rather than predicting an
outcome. Use constructions like "A transition into X would
represent the next milestone..." or "First evidence of X would
mark a meaningful inflection..." Avoid outcome-prediction
phrasing like "influence could follow," "is likely to," "is a
reasonable expectation." When one signal clearly dominates the profile (e.g., network
momentum percentile >= 95 while scientific momentum is moderate,
or vice versa), give it its own sentence with a short framing
opener ("The defining feature of the profile is..." or "The
strongest signal is..."), then state the numbers in the
following sentence. Avoid compound sentences that combine the
framing and the data into one long clause.

why_now: One sentence, max 20 words. The single strongest signal
driving this person's Rising Star status right now. Numbers required.

signal_strength: One of "high", "moderate", "early".
  high = rising_star_percentile >= 95
  moderate = rising_star_percentile 85-94
  early = rising_star_percentile < 85

caution_flags: One sentence, max 25 words, identifying the most
important caveat to the profile (e.g., senior-author share = 0,
geographic concentration, collaboration count outlier, etc.).
Return null if no meaningful caution applies.

engagement_angle: One sentence, max 20 words. A concrete MSL
engagement suggestion grounded in the profile shape (e.g., "monitor
for transition into senior authorship," "engage around growing
collaborator network," "early relationship-building given low
prior industry visibility").

Output ONLY the JSON object. No code fences. No commentary.
"""


def build_prompt_established(ctx: HCPContext) -> str:
    """Prompt for Established cohort - recognized expert framing using v3 methodology."""
    facts = format_hcp_facts(ctx, "established")
    prompt = (
        "You are writing a medical-affairs-safe intelligence brief for a pharmaceutical MSL about a recognized scientific expert in their therapeutic area.\n\n"
        "Methodology context (do not restate verbatim, but use to interpret the data):\n"
        "- This HCP sits within the Established cohort of their TA - the recognized-expert tier (separate from Rising Stars and Community).\n"
        "- Standing within the Established cohort reflects a weighted blend of signals: 50 percent Scientific Influence (publication leadership and citation impact within the cohort), 35 percent Network Influence (co-authorship graph centrality), 15 percent Pharma Engagement (industry collaboration breadth).\n"
        "- All percentiles below are computed within the Established cohort in this TA, so a 70th percentile here means top 30 percent among recognized experts, not among all HCPs.\n"
        "- If Pharma Engagement percentile is absent from the facts, that HCP has no Open Payments data on file - treat this as missing data, not low engagement; ranking reweights the remaining signals proportionally.\n"
        "- Pharma Engagement phrasing (all five JSON fields): If pharma_engagement_pctile is absent from the facts, treat as missing Open Payments data. If pharma_engagement_pctile is exactly 0.0, do NOT cite it as '0th percentile', 'no documented industry collaboration', or any phrasing that implies a confirmed low engagement finding; instead omit Pharma Engagement from that field or note that 'pharma engagement data is not available for this profile'. If pharma_engagement_pctile is greater than 0.0 but below 5.0, cite as 'at the low end of documented industry collaboration within the Established cohort' (do not use a numeric percentile). If between 5.0 and 99.5, cite as 'Nth percentile' as usual. If >= 99.5, use ceiling phrasing per the rule below. Low documented pharma engagement among Established experts is COMMON and NOT a concern when cited appropriately; do not interpret it as institutional restrictions or limited receptivity.\n"
        "- Percentile phrasing (all five JSON fields): When citing Scientific Influence, Network Influence, or Publication Leadership percentiles from the facts in narrative, why_now, engagement_angle, signal_strength, or caution_flags: if the value is >= 99.5, do NOT write '99th percentile', '100th percentile', or other numeric ceiling phrasing. Instead describe as 'at the top of the Established [TA] cohort' or 'at the ceiling of the cohort'. Percentiles below 99.5 may be cited as 'Nth percentile' as usual. Pharma Engagement follows the Pharma Engagement phrasing rule above.\n\n"
        "Return ONLY valid JSON with exactly these five fields:\n"
        "{\n"
        '  "narrative": "string (exactly 3 sentences)",\n'
        '  "why_now": "string (exactly 1 sentence)",\n'
        '  "engagement_angle": "string (exactly 2 sentences)",\n'
        '  "signal_strength": "string (exactly 1 sentence)",\n'
        '  "caution_flags": "string or null"\n'
        "}\n\n"
        "Constraints:\n"
        "- narrative: exactly 3 sentences. Frame as a recognized expert with sustained influence. Lead with TA-scoped rank (US and/or global) from the facts. State TA-scoped senior-author publication counts using senior_pub_count and senior_pub_recent_5yr (e.g. '54 NSCLC publications as senior author, including 35 in the last 5 years'). NEVER use the phrase 'leadership publications'. Reference Scientific Influence percentile as driven by publication leadership and citation impact. Reference Network Influence when available. Reference Pharma Engagement only per the Pharma Engagement phrasing rules above. If guideline_pub_count is present and greater than 0, you may reference contributor to N TA guideline publications. Career length may appear alone without any publication count. NEVER cite cohort_score, composite score, or any weighted score figure. NEVER cite total_career_pubs, lifetime works, works_count, or any career-total publication figure. NEVER produce an 'X publications over Y years' construction. Avoid hagiography; be specific and data-anchored. Do not invent numbers not present in the facts.\n"
        "- why_now: exactly 1 sentence. Why this expert matters in the current scientific landscape, not just historical contribution.\n"
        "- engagement_angle: exactly 2 sentences. Suggest scientific topics where this expert's perspective adds value. Established experts often have strong opinions on methodology, study design, or therapeutic positioning - lean into that.\n"
        "- signal_strength: exactly 1 sentence. Honest confidence statement. If Pharma Engagement is absent or exactly 0.0 per the phrasing rules, note that pharma engagement data is not available for this profile rather than citing a low percentile.\n"
        "- caution_flags: 1 sentence OR the JSON literal null. Default to null. Only populate when there is a SPECIFIC, ACTIONABLE concern AT THE HIGH END: very high pharma engagement breadth (20+ distinct companies suggesting saturation), lifetime engagement heavily concentrated with a single direct competitor where the MSL's product directly competes, or documented evidence (not inference) of a specific institutional restriction on industry engagement. Do NOT flag absent or zero Pharma Engagement percentile as a concern. Do NOT infer institutional policies from low pharma scores. Do NOT use this field to hedge, speculate, or restate percentile data - those belong in signal_strength.\n"
        "- Never cite cohort_score, composite score, or weighted score figures in any JSON field; use rank and percentiles only.\n"
        "- No markdown. No text outside JSON.\n"
        "- Do not name specific drug brands or NCT trial numbers.\n"
        "- Ensure proper spacing between all words. Do not concatenate words together (e.g., write 'and 19th' not 'and19th', 'study design' not 'studydesign').\n\n"
        "HCP context:\n"
        f"{facts}\n"
    )
    return prompt


def build_prompt_community(ctx: HCPContext) -> str:
    """Prompt for Community cohort — active community physician framing."""
    facts = format_hcp_facts(ctx, "community")
    prompt = (
        "You are writing a medical-affairs-safe intelligence brief for a pharmaceutical MSL about an active community physician. "
        "This HCP has been algorithmically selected as a top Community-cohort name within their therapeutic area — a practicing clinician with meaningful patient volume, industry engagement experience, and demonstrated openness to medical affairs interaction. "
        "They are NOT framed as a researcher or KOL; they are a practitioner. "
        "The MSL value here is patient-care impact, real-world treatment patterns, and practical clinical perspective — not citation metrics or trial leadership. "
        "Percentile data below is computed within the community cohort in their TA.\n\n"
        "Return ONLY valid JSON with exactly these five fields:\n"
        "{\n"
        '  "narrative": "string (exactly 3 sentences)",\n'
        '  "why_now": "string (exactly 1 sentence)",\n'
        '  "engagement_angle": "string (exactly 2 sentences)",\n'
        '  "signal_strength": "string (exactly 1 sentence)",\n'
        '  "caution_flags": "string or null"\n'
        "}\n\n"
        "Constraints:\n"
        "- narrative: exactly 3 sentences. Frame as an active community physician with patient-care impact and industry engagement experience. Reference practice setting, pharma engagement history, and breadth of industry relationships. Do NOT frame as a researcher or KOL — they're a practitioner.\n"
        "- why_now: exactly 1 sentence. Why an MSL would engage now — recent prescribing patterns, current engagement breadth, or career-stage signals.\n"
        "- engagement_angle: exactly 2 sentences. Suggest topics relevant to a community physician's practice — patient case discussion, clinical pearls, real-world evidence rather than basic science. Tone should be practical.\n"
        "- signal_strength: exactly 1 sentence. Honest confidence statement. Community signals are different from research signals — say so if relevant.\n"
        "- caution_flags: 1 sentence OR the JSON literal null. Use null in most cases — high pharma engagement in Community is common and not inherently a flag. Only populate when there is a SPECIFIC actionable concern: engagement breadth so extreme it suggests low signal per relationship (e.g., 30+ companies), evidence of recent inactivity, or specific competitor saturation. Do NOT use this field to hedge.\n"
        "- No markdown. No text outside JSON.\n"
        "- Do not name specific drug brands or NCT trial numbers.\n\n"
        "HCP context:\n"
        f"{facts}\n"
    )
    return prompt


def build_prompt(ctx: HCPContext) -> str:
    """Route to cohort-specific prompt template."""
    cohort = ctx.cohort_classification
    if cohort == "rising_star":
        return build_prompt_rising_star(ctx)
    if cohort == "established":
        return build_prompt_established(ctx)
    if cohort == "community":
        return build_prompt_community(ctx)
    # Fallback — should not happen since we filter by cohort
    return build_prompt_rising_star(ctx)


def extract_text_response(payload: Dict) -> str:
    content = payload.get("content", [])
    if not isinstance(content, list):
        raise RuntimeError("Unexpected Claude response shape: missing content list.")
    parts: List[str] = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            text = item.get("text")
            if isinstance(text, str):
                parts.append(text)
    response_text = "\n".join(parts).strip()
    if not response_text:
        raise RuntimeError("Claude response did not include text content.")
    return response_text


def parse_json_object(text: str) -> Dict:
    """Parse JSON object from model text, tolerating accidental fence wrappers."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError("Could not find JSON object in Claude output.")
    candidate = cleaned[start : end + 1]
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed parsing Claude JSON output: {exc}") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Claude JSON output is not an object.")
    return clean_narrative_payload(parsed)


def clean_narrative_spacing(text: str) -> str:
    """Fix observed spacing glitches in model output.

    Conservative: only fixes patterns that cannot collide with legitimate
    acronyms or biomedical terms (PD-L1, KRAS G12C, NSCLC, etc.).
    """
    if not text or not isinstance(text, str):
        return text
    import re as _re
    text = _re.sub(r"([,.;:])([A-Za-z])", r"\1 \2", text)
    text = text.replace("ScientificInfluence", "Scientific Influence")
    text = text.replace("NetworkInfluence", "Network Influence")
    text = text.replace("PharmaEngagement", "Pharma Engagement")
    text = text.replace("OpenPayments", "Open Payments")
    return text


def clean_narrative_payload(payload: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
    """Apply spacing cleanup to all string fields in a narrative payload."""
    cleaned: Dict[str, Optional[str]] = {}
    for key, value in payload.items():
        if isinstance(value, str):
            cleaned[key] = clean_narrative_spacing(value)
        else:
            cleaned[key] = value
    return cleaned


def generate_narrative(ctx: HCPContext, anthropic_api_key: str) -> Dict[str, Optional[str]]:
    """Call Claude API and return the parsed narrative output."""
    prompt = build_prompt(ctx)
    headers = {
        "x-api-key": anthropic_api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": MAX_TOKENS_RESPONSE,
        "temperature": TEMPERATURE,
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        response = requests.post(ANTHROPIC_API_URL, headers=headers, json=body, timeout=60)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise RuntimeError(f"Anthropic API request failed: {exc}") from exc
    except ValueError as exc:
        raise RuntimeError(f"Failed parsing Anthropic API JSON response: {exc}") from exc

    text = extract_text_response(payload)
    parsed = parse_json_object(text)

    narrative = parsed.get("narrative")
    why_now = parsed.get("why_now")
    engagement_angle = parsed.get("engagement_angle")
    signal_strength = parsed.get("signal_strength")
    caution_flags = parsed.get("caution_flags")

    required_str_fields = [narrative, why_now, engagement_angle, signal_strength]
    if not all(isinstance(x, str) and x.strip() for x in required_str_fields):
        raise RuntimeError("Claude output missing required string fields")

    # caution_flags can be null or a string
    caution_clean: Optional[str] = None
    if caution_flags is not None and isinstance(caution_flags, str) and caution_flags.strip():
        if caution_flags.strip().lower() not in ("null", "none", "n/a", "na"):
            caution_clean = caution_flags.strip()

    return {
        "narrative": narrative.strip(),
        "why_now": why_now.strip(),
        "engagement_angle": engagement_angle.strip(),
        "signal_strength": signal_strength.strip(),
        "caution_flags": caution_clean,
    }


def upsert_narrative(
    supabase: Client,
    ctx: HCPContext,
    output: Dict[str, Optional[str]],
    target_version: str = "v1",
) -> None:
    """Write narrative to hcp_narratives."""
    generated_at = datetime.now(timezone.utc).isoformat()
    prompt_version = (
        RISING_STAR_PROMPT_VERSION
        if ctx.cohort_classification == "rising_star"
        else PROMPT_VERSION
    )
    if target_version == "v2":
        row = {
            "hcp_id": ctx.hcp_id,
            "therapeutic_area_slug": ctx.therapeutic_area_slug,
            "narrative_text": output["narrative"],
            "why_now": output.get("why_now"),
            "engagement_angle": output.get("engagement_angle"),
            "signal_strength": output.get("signal_strength"),
            "caution_flags": [output["caution_flags"]] if output.get("caution_flags") else None,
            "generated_at": generated_at,
            "model_used": ANTHROPIC_MODEL,
            "prompt_version": prompt_version,
        }
        narratives_table = "hcp_narratives_v2"
        on_conflict = "hcp_id,therapeutic_area_slug"
    else:
        row = {
            "hcp_id": ctx.hcp_id,
            "therapeutic_area_id": ctx.therapeutic_area_id,
            "narrative": output["narrative"],
            "why_now": output["why_now"],
            "engagement_angle": output["engagement_angle"],
            "signal_strength": output["signal_strength"],
            "caution_flags": output["caution_flags"],
            "generated_at": generated_at,
            "model_version": ANTHROPIC_MODEL,
        }
        narratives_table = "hcp_narratives"
        on_conflict = "hcp_id,therapeutic_area_id,model_version"
    try:
        # Assumes unique constraint or just inserts. If on_conflict is needed,
        # the existing constraint (hcp_id, therapeutic_area_id, model_version)
        # will handle dedupe in the older script's schema.
        supabase.table(narratives_table).upsert(
            row,
            on_conflict=on_conflict,
        ).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed writing {narratives_table} for HCP {ctx.hcp_id}: {exc}") from exc


def estimate_cost(num_calls: int) -> float:
    """Estimate total API cost in USD for the given number of calls."""
    input_cost = (num_calls * EST_INPUT_TOKENS_PER_CALL / 1_000_000) * COST_INPUT_PER_MTOK
    output_cost = (num_calls * EST_OUTPUT_TOKENS_PER_CALL / 1_000_000) * COST_OUTPUT_PER_MTOK
    return input_cost + output_cost


def run_pipeline(
    target_cohorts: List[str],
    community_top_n: int,
    rising_top_n: int,
    established_top_n: int,
    dry_run: bool,
    force: bool,
    target_version: str = "v1",
    single_hcp_id: Optional[str] = None,
    ta_slug: Optional[str] = None,
) -> None:
    load_dotenv()
    supabase = init_supabase()
    needs_postgres = (
        "rising_star" in target_cohorts or "established" in target_cohorts
    )
    if needs_postgres and not os.getenv("DATABASE_URL"):
        raise EnvironmentError(
            "DATABASE_URL is required for rising_star and established cohorts "
            "(v3 signal joins via Postgres)."
        )

    if single_hcp_id:
        if len(target_cohorts) != 1:
            raise ValueError(
                "--hcp-id requires exactly one --cohort value (not 'all')."
            )
        expected_cohort = target_cohorts[0]
        hcp_rows = fetch_hcps_by_ids(supabase, {single_hcp_id}, target_version)
        if not hcp_rows:
            raise ValueError(f"HCP not found: {single_hcp_id}")
        actual_cohort = hcp_rows[0].get("cohort_classification")
        if actual_cohort != expected_cohort:
            raise ValueError(
                f"HCP {single_hcp_id} cohort_classification is '{actual_cohort}', "
                f"not '{expected_cohort}'. Use --cohort {actual_cohort} to regenerate."
            )
        hcp_name = (
            f"{hcp_rows[0].get('first_name') or ''} {hcp_rows[0].get('last_name') or ''}"
        ).strip()
        print(f"Single-HCP mode: {hcp_name or single_hcp_id} ({single_hcp_id})")
        print(f"Cohort cross-check passed: {expected_cohort}")
    else:
        print(f"Target cohorts: {target_cohorts}")
        if "rising_star" in target_cohorts:
            print(f"Rising star downselect: top {rising_top_n} per (TA x visible scope) from ranks")
        if "established" in target_cohorts:
            print(
                f"Established downselect: top {established_top_n} per (TA x visible scope) from ranks"
            )
        if "community" in target_cohorts:
            print(f"Community downselect: top {community_top_n} per (TA x visible scope) from hcp_community_ranks_v2")
    print()

    contexts, ta_name_map = load_hcp_contexts(
        supabase,
        target_cohorts,
        community_top_n,
        rising_top_n,
        established_top_n,
        target_version=target_version,
        single_hcp_id=single_hcp_id,
        ta_slug=ta_slug,
    )
    if not contexts:
        print("No HCPs found for target cohorts. Exiting.")
        return

    if not force:
        if not (dry_run and single_hcp_id):
            contexts = freshness_filter(
                contexts, supabase, ta_name_map, target_version=target_version
            )
        elif dry_run and single_hcp_id:
            print("[DRY RUN] Skipping freshness filter for single-HCP preview.")
        if not contexts:
            print("All contexts filtered by freshness. Exiting.")
            return

    cohort_breakdown: Dict[str, int] = {}
    for ctx in contexts:
        cohort_breakdown[ctx.cohort_classification] = (
            cohort_breakdown.get(ctx.cohort_classification, 0) + 1
        )

    # Cost estimate (+1 sample call in dry-run for cohort mode only)
    num_calls = len(contexts) + (1 if dry_run and not single_hcp_id else 0)
    estimated_cost = estimate_cost(num_calls)
    cohort_labels = {
        "rising_star": "Rising star",
        "established": "Established",
        "community": "Community",
    }
    print(f"\n=== Cost Estimate ===")
    if len(target_cohorts) > 1:
        for cohort in target_cohorts:
            count = cohort_breakdown.get(cohort, 0)
            cohort_cost = estimate_cost(count)
            label = cohort_labels.get(cohort, cohort)
            print(f"{label}: {count} narratives, ${cohort_cost:.2f}")
        total_suffix = " (+1 sample in dry-run)" if dry_run else ""
        print(f"Total: ${estimated_cost:.2f}{total_suffix}")
    else:
        print(f"Total narrative calls: {len(contexts)}" + (" (+1 sample in dry-run)" if dry_run and not single_hcp_id else ""))
        print(f"Estimated input tokens: {num_calls * EST_INPUT_TOKENS_PER_CALL:,}")
        print(f"Estimated output tokens: {num_calls * EST_OUTPUT_TOKENS_PER_CALL:,}")
        print(f"Estimated cost: ${estimated_cost:.2f}")
    print()

    if dry_run:
        anthropic_api_key = get_required_env("ANTHROPIC_API_KEY")
        if single_hcp_id:
            print("[DRY RUN] Generating narrative(s) for single HCP, no DB writes.")
            if not contexts:
                print("[DRY RUN] No contexts available for this HCP.")
                return
            for ctx in contexts:
                print(
                    f"\n=== Narrative (hcp_id={ctx.hcp_id}, TA={ctx.therapeutic_area_name}) ==="
                )
                try:
                    output = generate_narrative(ctx, anthropic_api_key)
                    print(json.dumps(output, indent=2))
                except Exception as exc:
                    print(f"[DRY RUN] Generation failed: {exc}")
        else:
            print("[DRY RUN] Generating one sample narrative, then exiting without DB writes.")
            if contexts:
                sample_ctx = contexts[0]
                print(f"\n=== Sample narrative (hcp_id={sample_ctx.hcp_id}, TA={sample_ctx.therapeutic_area_name}) ===")
                try:
                    output = generate_narrative(sample_ctx, anthropic_api_key)
                    print(json.dumps(output, indent=2))
                except Exception as exc:
                    print(f"[DRY RUN] Sample generation failed: {exc}")
            else:
                print("[DRY RUN] No contexts available for sample narrative.")
        return

    print(f"Narratives to generate by cohort:")
    for cohort, count in sorted(cohort_breakdown.items()):
        print(f"  {cohort}: {count}")
    print()

    # Confirm before consuming budget (skip for single-HCP targeted regen)
    if not single_hcp_id:
        if len(target_cohorts) > 1:
            confirm = input("Proceed with generation? Type 'yes' to continue: ")
        else:
            confirm = input(
                f"Proceed with generation? Estimated cost ${estimated_cost:.2f}. Type 'yes' to continue: "
            )
        if confirm.strip().lower() != "yes":
            print("Cancelled by user.")
            return

    anthropic_api_key = get_required_env("ANTHROPIC_API_KEY")
    success = 0
    failed = 0
    start_time = time.time()

    for idx, ctx in enumerate(contexts, start=1):
        try:
            output = generate_narrative(ctx, anthropic_api_key)
            upsert_narrative(supabase, ctx, output, target_version=target_version)
            success += 1
        except Exception as exc:
            failed += 1
            print(f"  Failed: hcp_id={ctx.hcp_id} ta={ctx.therapeutic_area_name}: {exc}")

        if idx % PROGRESS_EVERY == 0:
            elapsed = time.time() - start_time
            rate = idx / elapsed if elapsed > 0 else 0
            eta_seconds = (len(contexts) - idx) / rate if rate > 0 else 0
            print(f"Progress: {idx}/{len(contexts)} | success={success} failed={failed} | rate={rate:.1f}/sec | ETA={eta_seconds/60:.1f} min")

        time.sleep(API_SLEEP_SECONDS)

    elapsed = time.time() - start_time
    print()
    print(f"=== Complete ===")
    print(f"Total time: {elapsed/60:.1f} minutes")
    print(f"Narratives generated: {success}")
    print(f"Failures: {failed}")
    print(f"Actual cost: ~${estimate_cost(success):.2f}")


def main() -> int:
    parser = argparse.ArgumentParser(description="FieldMark narrative generation v2")
    parser.add_argument(
        "--cohort",
        type=str,
        default="all",
        choices=["rising_star", "established", "community", "all"],
        help="Target cohort for narrative generation",
    )
    parser.add_argument(
        "--community-top",
        type=int,
        default=COMMUNITY_DEFAULT_TOP_N,
        help=f"Number of top Community HCPs by cohort_score to include (default: {COMMUNITY_DEFAULT_TOP_N})",
    )
    parser.add_argument(
        "--rising-top",
        type=int,
        default=RISING_DEFAULT_TOP_N,
        help="Top N per (TA x visible scope) for rising_star cohort",
    )
    parser.add_argument(
        "--established-top",
        type=int,
        default=ESTABLISHED_DEFAULT_TOP_N,
        help="Top N per (TA x visible scope) for established cohort",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute cohort sizes and estimated cost, but don't call API or write to DB",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate narratives even if fresh ones exist (default: only generate missing)",
    )
    parser.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version. v1=legacy tables, v2=rebuild tables.",
    )
    parser.add_argument(
        "--hcp-id",
        type=str,
        default=None,
        help="Regenerate narrative for a single HCP by UUID (skips cohort top-N selection)",
    )
    parser.add_argument(
        "--ta",
        type=str,
        default=None,
        help="Restrict the run to a single TA by slug; default = all visible TAs.",
    )
    args = parser.parse_args()

    if args.hcp_id and args.cohort == "all":
        print(
            "[ERROR] --hcp-id requires a specific --cohort value "
            "(rising_star, established, or community), not 'all'.",
            file=sys.stderr,
        )
        return 1

    if args.cohort == "all":
        target_cohorts = ["rising_star", "established", "community"]
    else:
        target_cohorts = [args.cohort]

    try:
        run_pipeline(
            target_cohorts=target_cohorts,
            community_top_n=args.community_top,
            rising_top_n=args.rising_top,
            established_top_n=args.established_top,
            dry_run=args.dry_run,
            force=args.force,
            target_version=args.target_version,
            single_hcp_id=args.hcp_id,
            ta_slug=args.ta,
        )
        return 0
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
