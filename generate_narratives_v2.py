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
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


# Anthropic API config
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-6"
PROMPT_VERSION = "v1.0"
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
VISIBLE_TA_IDS = [
    "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e",
    "c0065b03-a25e-4e9a-bde4-4b4d0db7827d",
]


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
TEMPERATURE = 0.4


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
    therapeutic_area_slug: str = ""


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
) -> Set[str]:
    """Top N hcp_ids per (TA x visible scope) from a precomputed rank view."""
    selected: Set[str] = set()
    for scope_type, scope_value in VISIBLE_SCOPES:
        for ta_id in VISIBLE_TA_IDS:
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


def fetch_established_top_hcp_ids(supabase: Client, top_n: int) -> Set[str]:
    """Established cohort selection from rank view, with scores-table fallback."""
    try:
        return fetch_top_n_hcp_ids_from_rank_view(
            supabase, "hcp_established_ranks_v2", top_n
        )
    except Exception as exc:
        print(
            f"[load] hcp_established_ranks_v2 unavailable ({exc}); "
            "falling back to hcp_scores_v2 tier=established"
        )
        selected: Set[str] = set()
        for ta_id in VISIBLE_TA_IDS:
            response = (
                supabase.table("hcp_scores_v2")
                .select("hcp_id")
                .eq("therapeutic_area_id", ta_id)
                .eq("tier", "established")
                .order("normalized_score", desc=True)
                .range(0, top_n - 1)
                .execute()
            )
            for row in response.data or []:
                hcp_id = row.get("hcp_id")
                if hcp_id:
                    selected.add(str(hcp_id))
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
) -> Tuple[List[HCPContext], Dict[str, str]]:
    """
    Load HCP context for narrative generation, filtered by cohort.

    For rising_star and established: top N per (TA x visible scope) from rank views.
    For community: top N by cohort_score (default 500).
    """
    hcps: List[Dict] = []
    cohort_by_hcp: Dict[str, str] = {}

    if "rising_star" in target_cohorts:
        print(f"Selecting rising_star top-{rising_top_n} per (TA x visible scope) from rank table...")
        rising_ids = fetch_top_n_hcp_ids_from_rank_view(
            supabase, "hcp_rising_star_ranks_v2", rising_top_n
        )
        print(f"Rising star rank selection: {len(rising_ids)} unique HCPs")
        for hcp_id in rising_ids:
            cohort_by_hcp[hcp_id] = "rising_star"
        hcps.extend(fetch_hcps_by_ids(supabase, rising_ids, target_version))

    if "established" in target_cohorts:
        print(f"Selecting established top-{established_top_n} per (TA x visible scope) from rank table...")
        established_ids = fetch_established_top_hcp_ids(supabase, established_top_n)
        print(f"Established rank selection: {len(established_ids)} unique HCPs")
        for hcp_id in established_ids:
            cohort_by_hcp[hcp_id] = "established"
        hcps.extend(fetch_hcps_by_ids(supabase, established_ids, target_version))

    if "community" in target_cohorts:
        print("Loading community HCPs by cohort_classification...")
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
        community_hcps: List[Dict] = []
        page_size = 1000
        offset = 0
        while True:
            response = (
                supabase.table(hcps_table)
                .select(hcp_select_cols)
                .eq("cohort_classification", "community")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            batch = response.data or []
            if not batch:
                break
            if target_version == "v2":
                for row in batch:
                    if "institution_normalized" in row:
                        row["institution"] = row.pop("institution_normalized")
                    if "career_first_pub_year_v2" in row:
                        row["first_pub_year"] = row.pop("career_first_pub_year_v2")
            community_hcps.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
        community_hcps.sort(
            key=lambda h: h.get("cohort_score") if h.get("cohort_score") is not None else -1.0,
            reverse=True,
        )
        community_keep = community_hcps[:community_top_n]
        print(f"After community top-{community_top_n} downselect: {len(community_keep)} HCPs")
        for row in community_keep:
            hcp_id = row.get("id")
            if hcp_id:
                cohort_by_hcp[str(hcp_id)] = "community"
        hcps.extend(community_keep)

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

    print("Loading hcp_scores...")
    scores_table = get_table_name("hcp_scores", target_version)
    if target_version == "v2":
        scores_select = (
            "hcp_id,therapeutic_area_id,composite_score,pub_velocity_score,"
            "citation_trajectory_score,trial_investigator_score,scored_at"
        )
    else:
        scores_select = (
            "hcp_id,therapeutic_area_id,composite_score,pub_velocity_score,"
            "citation_trajectory_score,trial_investigator_score,calculated_at"
        )
    scores = fetch_all_rows(supabase, scores_table, scores_select, target_version=target_version)
    if target_version == "v2":
        for row in scores:
            if "scored_at" in row:
                row["calculated_at"] = row.pop("scored_at")
    latest_scores = pick_latest_scores(scores)

    ops_table = get_table_name("hcp_open_payments_summary", target_version)
    print("Loading hcp_open_payments_summary...")
    ops_raw = (
        supabase.table(ops_table)
        .select("hcp_id,total_payments_lifetime,distinct_companies_lifetime")
        .in_("hcp_id", list(hcp_ids) if len(hcp_ids) < 1000 else None)
        .execute()
        if len(hcp_ids) < 1000
        else None
    )
    if ops_raw is None:
        # Fallback: fetch all
        ops_raw = (
            supabase.table(ops_table)
            .select("hcp_id,total_payments_lifetime,distinct_companies_lifetime")
            .execute()
        )
    ops_by_hcp = {row["hcp_id"]: row for row in (ops_raw.data or []) if row.get("hcp_id")}

    hcp_map = {row["id"]: row for row in hcps if row.get("id")}

    # Pre-compute per-TA percentile distributions
    # For each TA, collect all pub_velocity / citation_trajectory / trial_investigator scores
    # so we can express each HCP's score as a percentile within their TA cohort
    print("Computing per-TA percentile distributions...")
    ta_pub_velocities: Dict[str, List[float]] = {}
    ta_citations: Dict[str, List[float]] = {}
    ta_trials: Dict[str, List[float]] = {}
    for (hcp_id, ta_id), score_row in latest_scores.items():
        if (hcp_id, ta_id) not in ta_membership:
            continue
        pv = safe_float(score_row.get("pub_velocity_score"))
        ct = safe_float(score_row.get("citation_trajectory_score"))
        tr = safe_float(score_row.get("trial_investigator_score"))
        if pv is not None:
            ta_pub_velocities.setdefault(ta_id, []).append(pv)
        if ct is not None:
            ta_citations.setdefault(ta_id, []).append(ct)
        if tr is not None:
            ta_trials.setdefault(ta_id, []).append(tr)

    # Build final context objects
    contexts: List[HCPContext] = []
    for (hcp_id, ta_id), score_row in latest_scores.items():
        if (hcp_id, ta_id) not in ta_membership:
            continue
        hcp = hcp_map.get(hcp_id)
        if not hcp:
            continue

        pv = safe_float(score_row.get("pub_velocity_score"))
        ct = safe_float(score_row.get("citation_trajectory_score"))
        tr = safe_float(score_row.get("trial_investigator_score"))

        pv_pct = percentile_within_ta(pv, ta_pub_velocities.get(ta_id, [])) if pv is not None else None
        ct_pct = percentile_within_ta(ct, ta_citations.get(ta_id, [])) if ct is not None else None
        tr_pct = percentile_within_ta(tr, ta_trials.get(ta_id, [])) if tr is not None else None

        ops = ops_by_hcp.get(hcp_id, {})

        ctx = HCPContext(
            hcp_id=hcp_id,
            therapeutic_area_id=ta_id,
            therapeutic_area_name=ta_name_map.get(ta_id, ta_id),
            first_name=hcp.get("first_name"),
            last_name=hcp.get("last_name"),
            institution=hcp.get("institution"),
            country=hcp.get("country"),
            cohort_classification=hcp.get("cohort_classification", "unknown"),
            cohort_score=safe_float(hcp.get("cohort_score")),
            composite_score=safe_float(score_row.get("composite_score")),
            pub_velocity_pct=pv_pct,
            citation_trajectory_pct=ct_pct,
            trial_investigator_pct=tr_pct,
            first_pub_year=safe_int(hcp.get("first_pub_year")),
            total_career_pubs=safe_int(hcp.get("total_career_pubs")),
            pharma_engagement_lifetime=safe_float(ops.get("total_payments_lifetime")),
            pharma_companies_distinct=safe_int(ops.get("distinct_companies_lifetime")),
            therapeutic_area_slug=ta_slug_map.get(ta_id, ""),
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


def format_hcp_facts(ctx: HCPContext) -> str:
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


def build_prompt_rising_star(ctx: HCPContext) -> str:
    """Prompt for Rising Star cohort — emerging voice framing."""
    return f"""You are writing a medical-affairs-safe intelligence brief for a pharmaceutical MSL about an emerging scientific voice. This HCP has been algorithmically selected as a top-100 Rising Star within their therapeutic area, drawn from researchers in the early-to-mid career band (3-10 years since first publication). They are by definition a high-priority name on a curated MSL surfacing board. The percentile data below is computed against the full scored population (tens of thousands of HCPs across all career stages), so percentiles in the middle ranges still represent meaningful emerging signal for someone in this curated top tier. Frame the HCP as a scientifically credible emerging voice worth MSL engagement; identify what specifically makes them notable rather than dwelling on what they haven't yet achieved. The HCP is classified as a Rising Star — a mid-career researcher with publication momentum, citation growth, or clinical trial activity that signals emerging influence in their therapeutic area.

Return ONLY valid JSON with exactly these five fields:
{{
  "narrative": "string",
  "why_now": "string",
  "engagement_angle": "string",
  "signal_strength": "string",
  "caution_flags": "string or null"
}}

Constraints:
- narrative: exactly 3 sentences. Frame as an emerging scientific voice with specific evidence (publication trajectory, citation growth, trial leadership). Avoid promotional or commercial targeting language. Reference percentile context when available.
- why_now: exactly 1 sentence. Concrete timing signal (recent acceleration, recent trial role, etc.).
- engagement_angle: exactly 2 sentences. Suggest scientific topics the MSL could productively focus on based on the HCP's activity. Be specific to therapeutic area.
- signal_strength: exactly 1 sentence. Honest confidence statement — strong if data is consistent across publications and trials, weaker if mixed signals.
- caution_flags: 1 sentence OR the JSON literal null. Use null in most cases — the absence of strong signal is NOT a caution flag, it's just part of being early-career. Only populate caution_flags when there is a SPECIFIC, ACTIONABLE concern an MSL should know about: significant pharma engagement with direct competitors (>$50K with a competing company), affiliation with an institution that has restrictive industry-engagement policies, evidence of recent inactivity (no publications in 24+ months), or other concrete red flags. Do NOT use this field to re-state low percentile data or to hedge engagement expectations — those belong in signal_strength, not caution_flags. If you find yourself writing "MSL engagement should be framed around scientific exchange," use null instead.
- No markdown. No text outside JSON.
- Do not name specific drug brands or NCT trial numbers.

HCP context:
{format_hcp_facts(ctx)}
"""


def build_prompt_established(ctx: HCPContext) -> str:
    """Prompt for Established cohort — recognized expert framing."""
    return f"""You are writing a medical-affairs-safe intelligence brief for a pharmaceutical MSL about a recognized expert. The HCP is classified as Established — a senior researcher with sustained productivity, deep publication history, and recognized influence in their therapeutic area.

Return ONLY valid JSON with exactly these five fields:
{{
  "narrative": "string",
  "why_now": "string",
  "engagement_angle": "string",
  "signal_strength": "string",
  "caution_flags": "string or null"
}}

Constraints:
- narrative: exactly 3 sentences. Frame as a recognized expert with sustained influence. Reference depth of career (years active, total publications) and current standing (percentile context, recent trial leadership if any). Avoid hagiography — be concrete.
- why_now: exactly 1 sentence. Why this expert matters in the current scientific landscape, not just history.
- engagement_angle: exactly 2 sentences. Suggest scientific topics where this expert's perspective would add value. Established experts often have strong opinions on methodology, study design, or therapeutic positioning — lean into that.
- signal_strength: exactly 1 sentence. Honest confidence statement.
- caution_flags: 1 sentence OR null. Established HCPs may have competing relationships or be over-scheduled. Note honestly if applicable.
- No markdown. No text outside JSON.
- Do not name specific drug brands or NCT trial numbers.

HCP context:
{format_hcp_facts(ctx)}
"""


def build_prompt_community(ctx: HCPContext) -> str:
    """Prompt for Community cohort — active community physician framing."""
    return f"""You are writing a medical-affairs-safe intelligence brief for a pharmaceutical MSL about an active community physician. The HCP is classified as Community — a practicing physician with significant patient volume and substantial existing pharmaceutical industry engagement, though not necessarily a publishing researcher.

Return ONLY valid JSON with exactly these five fields:
{{
  "narrative": "string",
  "why_now": "string",
  "engagement_angle": "string",
  "signal_strength": "string",
  "caution_flags": "string or null"
}}

Constraints:
- narrative: exactly 3 sentences. Frame as an active community physician with patient-care impact and industry engagement experience. Reference practice setting, pharma engagement history, and breadth of industry relationships. Do NOT frame as a researcher or KOL — they're a practitioner.
- why_now: exactly 1 sentence. Why an MSL would engage now — current activity, recent prescribing patterns inferred from engagement, etc.
- engagement_angle: exactly 2 sentences. Suggest topics relevant to a community physician's practice — patient case discussion, clinical pearls, real-world evidence rather than basic science. Tone should be practical.
- signal_strength: exactly 1 sentence. Honest confidence statement. Community signals are different from research signals — say so if relevant.
- caution_flags: 1 sentence OR null. High engagement with many competing companies is common in Community — flag if it's notably extreme.
- No markdown. No text outside JSON.
- Do not name specific drug brands or NCT trial numbers.

HCP context:
{format_hcp_facts(ctx)}
"""


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
    return parsed


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
    if target_version == "v2":
        row = {
            "hcp_id": ctx.hcp_id,
            "therapeutic_area_slug": ctx.therapeutic_area_slug,
            "narrative_text": output["narrative"],
            "why_now": output["why_now"],
            "engagement_angle": output["engagement_angle"],
            "signal_strength": output["signal_strength"],
            "caution_flags": [output["caution_flags"]] if output["caution_flags"] else None,
            "generated_at": generated_at,
            "model_used": ANTHROPIC_MODEL,
            "prompt_version": PROMPT_VERSION,
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
) -> None:
    load_dotenv()
    supabase = init_supabase()

    print(f"Target cohorts: {target_cohorts}")
    if "rising_star" in target_cohorts:
        print(f"Rising star downselect: top {rising_top_n} per (TA x visible scope) from ranks")
    if "established" in target_cohorts:
        print(f"Established downselect: top {established_top_n} per (TA x visible scope) from ranks")
    if "community" in target_cohorts:
        print(f"Community downselect: top {community_top_n} by cohort_score")
    print()

    contexts, ta_name_map = load_hcp_contexts(
        supabase,
        target_cohorts,
        community_top_n,
        rising_top_n,
        established_top_n,
        target_version=target_version,
    )
    if not contexts:
        print("No HCPs found for target cohorts. Exiting.")
        return

    if not force:
        contexts = freshness_filter(
            contexts, supabase, ta_name_map, target_version=target_version
        )
        if not contexts:
            print("All contexts filtered by freshness. Exiting.")
            return

    # Cost estimate (+1 sample call in dry-run)
    num_calls = len(contexts) + (1 if dry_run else 0)
    estimated_cost = estimate_cost(num_calls)
    print(f"\n=== Cost Estimate ===")
    print(f"Total narrative calls: {len(contexts)}" + (" (+1 sample in dry-run)" if dry_run else ""))
    print(f"Estimated input tokens: {num_calls * EST_INPUT_TOKENS_PER_CALL:,}")
    print(f"Estimated output tokens: {num_calls * EST_OUTPUT_TOKENS_PER_CALL:,}")
    print(f"Estimated cost: ${estimated_cost:.2f}")
    print()

    if dry_run:
        print("[DRY RUN] Generating one sample narrative, then exiting without DB writes.")
        if contexts:
            anthropic_api_key = get_required_env("ANTHROPIC_API_KEY")
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

    # Cohort breakdown for transparency
    cohort_breakdown: Dict[str, int] = {}
    for ctx in contexts:
        cohort_breakdown[ctx.cohort_classification] = cohort_breakdown.get(ctx.cohort_classification, 0) + 1
    print(f"Narratives to generate by cohort:")
    for cohort, count in sorted(cohort_breakdown.items()):
        print(f"  {cohort}: {count}")
    print()

    # Confirm before consuming budget
    confirm = input(f"Proceed with generation? Estimated cost ${estimated_cost:.2f}. Type 'yes' to continue: ")
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
    args = parser.parse_args()

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
        )
        return 0
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
