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

# Anthropic API config
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-6"
ANTHROPIC_VERSION = "2023-06-01"

# Pricing (per million tokens) — Sonnet 4.6
COST_INPUT_PER_MTOK = 3.00
COST_OUTPUT_PER_MTOK = 15.00

# Estimated tokens per call
EST_INPUT_TOKENS_PER_CALL = 600
EST_OUTPUT_TOKENS_PER_CALL = 250

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


def fetch_all_rows(supabase: Client, table: str, columns: str, page_size: int = 1000) -> List[Dict]:
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


def load_existing_narrative_keys(supabase: Client, model_version: str) -> Set[Tuple[str, str]]:
    existing: Set[Tuple[str, str]] = set()
    page_size = 1000
    offset = 0
    while True:
        response = (
            supabase.table("hcp_narratives")
            .select("hcp_id, therapeutic_area_id")
            .eq("model_version", model_version)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        for row in batch:
            if row.get("hcp_id") and row.get("therapeutic_area_id"):
                existing.add((row["hcp_id"], row["therapeutic_area_id"]))
        if len(batch) < page_size:
            break
        offset += page_size
    return existing


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
    return round(100.0 * below_count / len(all_values_in_ta), 1)


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


def load_hcp_contexts(
    supabase: Client,
    target_cohorts: List[str],
    community_top_n: int,
) -> List[HCPContext]:
    """
    Load HCP context for narrative generation, filtered by cohort.

    For rising_star and established: include all HCPs in that cohort.
    For community: include top N by cohort_score (default 500).
    """
    print("Loading HCPs by cohort_classification...")

    # Build cohort filter — only HCPs in target cohorts (paginated past 1000-row cap)
    hcps: List[Dict] = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            supabase.table("hcps")
            .select("id,first_name,last_name,institution,country,cohort_classification,cohort_score,total_career_pubs,first_pub_year")
            .in_("cohort_classification", target_cohorts)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        hcps.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    print(f"Loaded {len(hcps)} HCPs across cohorts {target_cohorts}")

    # For community, downselect to top N by cohort_score
    if "community" in target_cohorts:
        community_hcps = [h for h in hcps if h.get("cohort_classification") == "community"]
        community_hcps.sort(
            key=lambda h: h.get("cohort_score") if h.get("cohort_score") is not None else -1.0,
            reverse=True,
        )
        community_keep = community_hcps[:community_top_n]
        community_keep_ids = {h["id"] for h in community_keep}
        # Filter hcps list: keep all non-community AND top-N community
        hcps = [
            h for h in hcps
            if h.get("cohort_classification") != "community" or h["id"] in community_keep_ids
        ]
        print(f"After community top-{community_top_n} downselect: {len(hcps)} HCPs total")

    hcp_ids = {h["id"] for h in hcps if h.get("id")}

    print("Loading hcp_therapeutic_areas membership...")
    hcp_tas = fetch_all_rows(supabase, "hcp_therapeutic_areas", "hcp_id,therapeutic_area_id")
    ta_membership = {
        (row.get("hcp_id"), row.get("therapeutic_area_id"))
        for row in hcp_tas
        if row.get("hcp_id") in hcp_ids
    }
    print(f"Filtered to {len(ta_membership)} HCP×TA membership pairs for target cohorts")

    print("Loading therapeutic_areas...")
    tas = fetch_all_rows(supabase, "therapeutic_areas", "id,name")
    ta_name_map = {row["id"]: row.get("name", row["id"]) for row in tas if row.get("id")}

    print("Loading hcp_scores...")
    scores = fetch_all_rows(
        supabase,
        "hcp_scores",
        "hcp_id,therapeutic_area_id,composite_score,pub_velocity_score,citation_trajectory_score,trial_investigator_score,calculated_at",
    )
    latest_scores = pick_latest_scores(scores)

    print("Loading hcp_open_payments_summary...")
    ops_raw = (
        supabase.table("hcp_open_payments_summary")
        .select("hcp_id,total_payments_lifetime,distinct_companies_lifetime")
        .in_("hcp_id", list(hcp_ids) if len(hcp_ids) < 1000 else None)
        .execute()
        if len(hcp_ids) < 1000
        else None
    )
    if ops_raw is None:
        # Fallback: fetch all
        ops_raw = supabase.table("hcp_open_payments_summary").select("hcp_id,total_payments_lifetime,distinct_companies_lifetime").execute()
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
        )
        contexts.append(ctx)

    print(f"Built {len(contexts)} HCP×TA contexts for narrative generation")
    return contexts


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
    return f"""You are writing a medical-affairs-safe intelligence brief for a pharmaceutical MSL about an emerging scientific voice. The HCP is classified as a Rising Star — a mid-career researcher with publication momentum, citation growth, or clinical trial activity that signals emerging influence in their therapeutic area.

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
- caution_flags: 1 sentence OR the JSON literal null. Use null if no caution flags. Include if there's something an MSL should know (high engagement with competitors, limited recent activity, geographic challenges).
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


def upsert_narrative(supabase: Client, ctx: HCPContext, output: Dict[str, Optional[str]]) -> None:
    """Write narrative to hcp_narratives."""
    row = {
        "hcp_id": ctx.hcp_id,
        "therapeutic_area_id": ctx.therapeutic_area_id,
        "narrative": output["narrative"],
        "why_now": output["why_now"],
        "engagement_angle": output["engagement_angle"],
        "signal_strength": output["signal_strength"],
        "caution_flags": output["caution_flags"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": ANTHROPIC_MODEL,
    }
    try:
        # Assumes unique constraint or just inserts. If on_conflict is needed,
        # the existing constraint (hcp_id, therapeutic_area_id, model_version)
        # will handle dedupe in the older script's schema.
        supabase.table("hcp_narratives").upsert(
            row,
            on_conflict="hcp_id,therapeutic_area_id,model_version",
        ).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed writing hcp_narratives for HCP {ctx.hcp_id}: {exc}") from exc


def estimate_cost(num_calls: int) -> float:
    """Estimate total API cost in USD for the given number of calls."""
    input_cost = (num_calls * EST_INPUT_TOKENS_PER_CALL / 1_000_000) * COST_INPUT_PER_MTOK
    output_cost = (num_calls * EST_OUTPUT_TOKENS_PER_CALL / 1_000_000) * COST_OUTPUT_PER_MTOK
    return input_cost + output_cost


def run_pipeline(target_cohorts: List[str], community_top_n: int, dry_run: bool, force: bool) -> None:
    load_dotenv()
    supabase = init_supabase()

    print(f"Target cohorts: {target_cohorts}")
    if "community" in target_cohorts:
        print(f"Community downselect: top {community_top_n} by cohort_score")
    print()

    contexts = load_hcp_contexts(supabase, target_cohorts, community_top_n)
    if not contexts:
        print("No HCPs found for target cohorts. Exiting.")
        return

    if not force:
        print("Checking for existing narratives...")
        existing_keys = load_existing_narrative_keys(supabase, ANTHROPIC_MODEL)
        original_count = len(contexts)
        contexts = [
            ctx for ctx in contexts
            if (ctx.hcp_id, ctx.therapeutic_area_id) not in existing_keys
        ]
        skipped = original_count - len(contexts)
        if skipped > 0:
            print(f"Skipping {skipped} HCP×TA pairs that already have narratives from this model version.")
            print(f"Generating {len(contexts)} new narratives.")

        if not contexts:
            print("No new narratives to generate. All target HCPs already have narratives.")
            return

    # Cost estimate
    estimated_cost = estimate_cost(len(contexts))
    print(f"\n=== Cost Estimate ===")
    print(f"Total narrative calls: {len(contexts)}")
    print(f"Estimated input tokens: {len(contexts) * EST_INPUT_TOKENS_PER_CALL:,}")
    print(f"Estimated output tokens: {len(contexts) * EST_OUTPUT_TOKENS_PER_CALL:,}")
    print(f"Estimated cost: ${estimated_cost:.2f}")
    print()

    if dry_run:
        print("[DRY RUN] Exiting without API calls or database writes.")
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
            upsert_narrative(supabase, ctx, output)
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
        "--dry-run",
        action="store_true",
        help="Compute cohort sizes and estimated cost, but don't call API or write to DB",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate narratives even if fresh ones exist (default: only generate missing)",
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
            dry_run=args.dry_run,
            force=args.force,
        )
        return 0
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
