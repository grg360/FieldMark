from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv
from supabase import Client, create_client


THERAPEUTIC_AREAS: Dict[str, str] = {
    "rare-disease": "833e7b38-d01b-409e-82c0-71eb29e138a0",
    "hepatology": "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e",
    "nsclc": "c0065b03-a25e-4e9a-bde4-4b4d0db7827d",
}

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-5"
ANTHROPIC_MAX_TOKENS = 150
NARRATIVE_FRESHNESS_DAYS = 7
TOP_HCPS_PER_TA = 500
PROGRESS_EVERY = 50
SLEEP_SECONDS = 0.5


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def is_narrative_fresh(supabase: Client, hcp_id: str, therapeutic_area_id: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(days=NARRATIVE_FRESHNESS_DAYS)
    response = (
        supabase.table("hcp_narratives")
        .select("hcp_id")
        .eq("hcp_id", hcp_id)
        .eq("therapeutic_area_id", therapeutic_area_id)
        .gte("generated_at", cutoff.isoformat())
        .limit(1)
        .execute()
    )
    return bool(response.data)


def fetch_top_hcps(supabase: Client, therapeutic_area_id: str) -> List[Dict[str, Any]]:
    response = (
        supabase.table("hcp_scores")
        .select(
            "hcp_id, therapeutic_area_id, composite_score, pub_velocity_score, "
            "citation_trajectory_score, trial_investigator_score, "
            "hcps!inner(id, first_name, last_name, institution, country)"
        )
        .eq("therapeutic_area_id", therapeutic_area_id)
        .eq("hcps.country", "USA")
        .order("composite_score", desc=True)
        .limit(TOP_HCPS_PER_TA)
        .execute()
    )
    return response.data or []


def build_prompt(row: Dict[str, Any], ta_slug: str) -> str:
    hcp = row.get("hcps") or {}
    first_name = hcp.get("first_name", "")
    last_name = hcp.get("last_name", "")
    institution = hcp.get("institution", "Unknown institution")
    pub_velocity = row.get("pub_velocity_score", 0)
    citation_trajectory = row.get("citation_trajectory_score", 0)
    trial_activity = row.get("trial_investigator_score", 0)

    return (
        f"Write 2 sentences explaining why {first_name} {last_name} at {institution} "
        f"is a rising star in {ta_slug} for a pharmaceutical MSL audience. "
        f"Publication velocity score: {pub_velocity}. "
        f"Citation trajectory score: {citation_trajectory}. "
        f"Trial activity score: {trial_activity}. "
        "Be specific and professional. Do not use placeholder names."
    )


def call_anthropic(api_key: str, prompt: str) -> str:
    response = requests.post(
        ANTHROPIC_URL,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": ANTHROPIC_MODEL,
            "max_tokens": ANTHROPIC_MAX_TOKENS,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload.get("content") or []
    if not content or not isinstance(content, list):
        raise RuntimeError("Anthropic response missing content array")
    text = content[0].get("text")
    if not text:
        raise RuntimeError("Anthropic response missing content text")
    return str(text).strip()


def upsert_narrative(
    supabase: Client,
    hcp_id: str,
    therapeutic_area_id: str,
    narrative: str,
) -> None:
    payload = {
        "hcp_id": hcp_id,
        "narrative": narrative,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "therapeutic_area_id": therapeutic_area_id,
    }
    supabase.table("hcp_narratives").upsert(payload).execute()


def main() -> int:
    load_dotenv()

    try:
        supabase_url = require_env("SUPABASE_URL")
        supabase_key = require_env("SUPABASE_KEY")
        anthropic_api_key = require_env("ANTHROPIC_API_KEY")
    except RuntimeError as exc:
        print(f"[error] {exc}")
        return 1

    supabase: Client = create_client(supabase_url, supabase_key)

    total_seen = 0
    total_skipped_fresh = 0
    total_generated = 0
    total_errors = 0

    for ta_slug in ["rare-disease", "hepatology", "nsclc"]:
        ta_id = THERAPEUTIC_AREAS[ta_slug]
        print(f"\n[ta] {ta_slug} ({ta_id})")

        try:
            score_rows = fetch_top_hcps(supabase, ta_id)
        except Exception as exc:  # noqa: BLE001
            print(f"[error] failed to fetch HCPs for {ta_slug}: {exc}")
            total_errors += 1
            continue

        print(f"[info] fetched {len(score_rows)} candidate HCP rows")

        for row in score_rows:
            total_seen += 1
            hcp_id = str(row.get("hcp_id") or "")
            if not hcp_id:
                total_errors += 1
                continue

            try:
                if is_narrative_fresh(supabase, hcp_id, ta_id):
                    total_skipped_fresh += 1
                    print(f"[skip] {hcp_id} already has fresh narrative")
                    continue

                prompt = build_prompt(row, ta_slug)
                narrative = call_anthropic(anthropic_api_key, prompt)
                upsert_narrative(supabase, hcp_id, ta_id, narrative)
                total_generated += 1

                if total_generated % PROGRESS_EVERY == 0:
                    print(f"[progress] generated {total_generated} narratives so far")

                time.sleep(SLEEP_SECONDS)
            except Exception as exc:  # noqa: BLE001
                total_errors += 1
                print(f"[error] hcp_id={hcp_id} ta={ta_slug}: {exc}")

    print("\n[summary]")
    print(f"total_hcps_seen: {total_seen}")
    print(f"narratives_generated: {total_generated}")
    print(f"fresh_narratives_skipped: {total_skipped_fresh}")
    print(f"errors: {total_errors}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
