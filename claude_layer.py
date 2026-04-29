from __future__ import annotations

"""
FieldMark Claude narrative generation layer.

This script:
1) Loads HCPs and score context from Supabase.
2) Selects top 50 HCPs per therapeutic area by composite score.
3) Calls Anthropic Claude Sonnet to generate compliant rising-star narratives.
4) Stores results in hcp_narratives.

Required env vars (.env):
- SUPABASE_URL
- SUPABASE_KEY
- ANTHROPIC_API_KEY
"""

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-5"
ANTHROPIC_VERSION = "2023-06-01"
TOP_PER_TA = 20
PROGRESS_EVERY = 10
API_SLEEP_SECONDS = 1.0


@dataclass
class CandidateHCP:
    hcp_id: str
    therapeutic_area_id: str
    therapeutic_area_name: str
    first_name: Optional[str]
    last_name: Optional[str]
    institution: Optional[str]
    first_pub_year: Optional[int]
    composite_score: Optional[float]
    pub_velocity_score: Optional[float]
    citation_trajectory_score: Optional[float]
    trial_investigator_score: Optional[float]
    career_multiplier: float


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


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


def compute_career_multiplier(first_pub_year: Optional[int]) -> float:
    if first_pub_year is None:
        return 1.0
    if first_pub_year >= 2020:
        return 1.30
    if 2017 <= first_pub_year <= 2019:
        return 1.15
    if 2011 <= first_pub_year <= 2016:
        return 1.0
    return 0.75


def pick_latest_scores(score_rows: List[Dict]) -> Dict[Tuple[str, str], Dict]:
    """
    Keep latest hcp_scores row per (hcp_id, therapeutic_area_id) by calculated_at.
    """
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


def build_top_candidates(supabase: Client) -> List[CandidateHCP]:
    hcps = fetch_all_rows(supabase, "hcps", "id,first_name,last_name,institution")
    hcp_tas = fetch_all_rows(supabase, "hcp_therapeutic_areas", "hcp_id,therapeutic_area_id")
    tas = fetch_all_rows(supabase, "therapeutic_areas", "id,name")
    scores = fetch_all_rows(
        supabase,
        "hcp_scores",
        "hcp_id,therapeutic_area_id,composite_score,pub_velocity_score,citation_trajectory_score,trial_investigator_score,calculated_at",
    )
    publications = fetch_all_rows(supabase, "publications", "hcp_id,pub_year")

    hcp_map = {row["id"]: row for row in hcps if row.get("id")}
    ta_map = {row["id"]: row.get("name", row["id"]) for row in tas if row.get("id")}
    ta_membership = {(row.get("hcp_id"), row.get("therapeutic_area_id")) for row in hcp_tas}
    latest_scores = pick_latest_scores(scores)

    # Earliest publication year by HCP.
    earliest_pub_by_hcp: Dict[str, int] = {}
    for pub in publications:
        hcp_id = pub.get("hcp_id")
        year = safe_int(pub.get("pub_year"))
        if not hcp_id or year is None:
            continue
        current = earliest_pub_by_hcp.get(hcp_id)
        if current is None or year < current:
            earliest_pub_by_hcp[hcp_id] = year

    candidates_by_ta: Dict[str, List[CandidateHCP]] = {}
    for (hcp_id, ta_id), score_row in latest_scores.items():
        # Enforce presence in the association table for explicit join semantics.
        if (hcp_id, ta_id) not in ta_membership:
            continue
        hcp = hcp_map.get(hcp_id)
        if not hcp:
            continue
        ta_name = ta_map.get(ta_id, ta_id)
        first_pub_year = earliest_pub_by_hcp.get(hcp_id)
        candidate = CandidateHCP(
            hcp_id=hcp_id,
            therapeutic_area_id=ta_id,
            therapeutic_area_name=ta_name,
            first_name=hcp.get("first_name"),
            last_name=hcp.get("last_name"),
            institution=hcp.get("institution"),
            first_pub_year=first_pub_year,
            composite_score=safe_float(score_row.get("composite_score")),
            pub_velocity_score=safe_float(score_row.get("pub_velocity_score")),
            citation_trajectory_score=safe_float(score_row.get("citation_trajectory_score")),
            trial_investigator_score=safe_float(score_row.get("trial_investigator_score")),
            career_multiplier=compute_career_multiplier(first_pub_year),
        )
        candidates_by_ta.setdefault(ta_id, []).append(candidate)

    selected: List[CandidateHCP] = []
    for ta_id, ta_candidates in candidates_by_ta.items():
        ranked = sorted(
            ta_candidates,
            key=lambda c: c.composite_score if c.composite_score is not None else -1.0,
            reverse=True,
        )[:TOP_PER_TA]
        selected.extend(ranked)
    return selected


def build_prompt(candidate: CandidateHCP) -> str:
    hcp_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or "Unknown HCP"
    return (
        "You are writing a medical-affairs-safe narrative for an internal scientific engagement context.\n\n"
        "Return ONLY valid JSON with exactly these fields:\n"
        "{\n"
        '  "narrative": "string",\n'
        '  "why_now": "string",\n'
        '  "engagement_window": "string"\n'
        "}\n\n"
        "Constraints:\n"
        "- narrative must be exactly 3 sentences.\n"
        "- narrative should frame the HCP as an emerging scientific voice.\n"
        "- avoid promotional or commercial targeting language.\n"
        "- why_now must be exactly 1 sentence focused on timing signal.\n"
        "- engagement_window must be exactly 1 sentence focused on why now is timely for scientific engagement.\n"
        "- do not include markdown or any text outside JSON.\n\n"
        f"HCP name: {hcp_name}\n"
        f"Institution: {candidate.institution or 'Unknown'}\n"
        f"Therapeutic area: {candidate.therapeutic_area_name}\n"
        f"First publication year: {candidate.first_pub_year if candidate.first_pub_year is not None else 'Unknown'}\n"
        f"Composite score: {candidate.composite_score if candidate.composite_score is not None else 'Unknown'}\n"
        f"Publication velocity score: {candidate.pub_velocity_score if candidate.pub_velocity_score is not None else 'Unknown'}\n"
        f"Citation trajectory score: {candidate.citation_trajectory_score if candidate.citation_trajectory_score is not None else 'Unknown'}\n"
        f"Trial investigator score: {candidate.trial_investigator_score if candidate.trial_investigator_score is not None else 'Unknown'}\n"
        f"Career multiplier: {candidate.career_multiplier}\n"
    )


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
    """
    Parse JSON object from model text, tolerating accidental fence wrappers.
    """
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


def generate_narrative(candidate: CandidateHCP, anthropic_api_key: str) -> Dict[str, str]:
    prompt = build_prompt(candidate)
    headers = {
        "x-api-key": anthropic_api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 600,
        "temperature": 0.3,
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
    engagement_window = parsed.get("engagement_window")
    if not all(isinstance(x, str) and x.strip() for x in [narrative, why_now, engagement_window]):
        raise RuntimeError("Claude output missing required string fields: narrative/why_now/engagement_window")

    return {
        "narrative": narrative.strip(),
        "why_now": why_now.strip(),
        "engagement_window": engagement_window.strip(),
    }


def upsert_narrative(
    supabase: Client,
    candidate: CandidateHCP,
    output: Dict[str, str],
) -> None:
    row = {
        "hcp_id": candidate.hcp_id,
        "therapeutic_area_id": candidate.therapeutic_area_id,
        "narrative": output["narrative"],
        "why_now": output["why_now"],
        "engagement_window": output["engagement_window"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": ANTHROPIC_MODEL,
    }
    try:
        # Recommended: unique (hcp_id, therapeutic_area_id, model_version).
        supabase.table("hcp_narratives").upsert(
            row,
            on_conflict="hcp_id,therapeutic_area_id,model_version",
        ).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed writing hcp_narratives for HCP {candidate.hcp_id}: {exc}") from exc


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()
    anthropic_api_key = get_required_env("ANTHROPIC_API_KEY")

    print("Loading HCP and score context from Supabase...")
    candidates = build_top_candidates(supabase)
    if not candidates:
        print("No HCP candidates found for narrative generation.")
        return

    print(f"Generating narratives for {len(candidates)} HCP x therapeutic-area records...")
    success = 0
    failed = 0

    for idx, candidate in enumerate(candidates, start=1):
        try:
            output = generate_narrative(candidate, anthropic_api_key=anthropic_api_key)
            upsert_narrative(supabase, candidate, output)
            success += 1
        except Exception as exc:
            failed += 1
            print(
                f"Warning: narrative generation failed for hcp_id={candidate.hcp_id}, "
                f"ta_id={candidate.therapeutic_area_id}: {exc}"
            )

        if idx % PROGRESS_EVERY == 0:
            print(f"Progress: {idx}/{len(candidates)} processed | success={success} failed={failed}")
        time.sleep(API_SLEEP_SECONDS)

    print("\n=== Claude Narrative Generation Summary ===")
    print(f"Candidates processed: {len(candidates)}")
    print(f"Narratives stored: {success}")
    print(f"Failures: {failed}")


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Claude layer failed: {error}")
        raise
