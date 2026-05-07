from __future__ import annotations

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

MODEL = "claude-haiku-4-5-20251001"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
SLEEP_SECONDS = 0.2
MAX_RETRIES = 3
INPUT_COST_PER_MTOK = 0.80
OUTPUT_COST_PER_MTOK = 4.00


@dataclass
class Counters:
    processed_hcps: int = 0
    total_hcps: int = 0
    handles_classified: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    api_errors: int = 0
    json_errors: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


def env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return val


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def ns(v: Optional[str]) -> str:
    return " ".join(str(v or "").strip().split())


def load_candidates(client: Client) -> List[Dict]:
    rows: List[Dict] = []
    offset = 0
    page = 1000
    while True:
        batch = (
            client.table("hcps")
            .select(
                "id,first_name,last_name,specialty,subspecialty,institution_short,institution_full,country,"
                "twitter_handle,twitter_bio,twitter_followers,twitter_following,twitter_tweet_count,twitter_verified,twitter_enriched_at,"
                "bluesky_handle,bluesky_bio,bluesky_followers,bluesky_posts,bluesky_enriched_at"
            )
            .eq("social_verification_method", "algorithmic_stage1")
            .or_("twitter_handle.not.is.null,bluesky_handle.not.is.null")
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def extract_json(text: str) -> Optional[Dict]:
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def call_claude(
    *,
    api_key: str,
    first_name: str,
    last_name: str,
    specialty: str,
    subspecialty: str,
    institution: str,
    country: str,
    bio: str,
    follower_count: Optional[int],
    platform: str,
) -> Tuple[Optional[Dict], int, int, Optional[str]]:
    system_prompt = (
        "You evaluate whether a social media bio plausibly belongs to a specific healthcare professional. "
        "Return only valid JSON. Be strict — false matches are worse than missing matches."
    )
    user_prompt = f"""HCP profile:
  Name: {first_name} {last_name}
  Specialty: {specialty or 'unknown'}
  Subspecialty: {subspecialty or 'unknown'}
  Institution: {institution or 'unknown'}
  Country: {country or 'unknown'}

Social bio: "{bio}"
Follower count: {follower_count if follower_count is not None else 'unknown'}
Platform: {platform}

Evaluate whether this bio plausibly belongs to this HCP. Return JSON:
{{
  "is_clinician_or_researcher": true/false,
  "specialty_match": "yes" / "no" / "unclear" / "not_applicable",
  "institution_match": "yes" / "no" / "unclear" / "not_applicable",
  "confidence": "high" / "medium" / "low",
  "reasoning": "one sentence explaining confidence level"
}}

Confidence rules:
  - "high" only if bio CLEARLY indicates a clinician or researcher AND specialty or institution match (or are plausibly aligned).
  - "medium" if clinician role is clear but specialty/institution match is unclear or not_applicable.
  - "low" if bio is generic, ambiguous, describes a different role, or contradicts the HCP profile."""

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": MODEL,
        "max_tokens": 200,
        "temperature": 0.0,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }

    wait = 1.0
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.post(ANTHROPIC_URL, headers=headers, json=payload, timeout=(8, 40))
            if r.status_code == 429:
                if attempt == MAX_RETRIES:
                    return None, 0, 0, "rate_limited"
                time.sleep(wait)
                wait *= 2
                continue
            r.raise_for_status()
            body = r.json()
            usage = body.get("usage", {}) or {}
            input_tokens = int(usage.get("input_tokens") or 0)
            output_tokens = int(usage.get("output_tokens") or 0)
            content = body.get("content", []) or []
            text = ""
            if content and isinstance(content, list):
                text = "".join(str(c.get("text", "")) for c in content if isinstance(c, dict))
            parsed = extract_json(text)
            if not parsed:
                return None, input_tokens, output_tokens, "json_parse_error"
            return parsed, input_tokens, output_tokens, None
        except Exception as e:
            if attempt == MAX_RETRIES:
                return None, 0, 0, f"api_error:{e}"
            time.sleep(wait)
            wait *= 2
    return None, 0, 0, "unknown_error"


def apply_result_update(client: Client, row: Dict, platform: str, result: Dict) -> None:
    hcp_id = row["id"]
    confidence = ns(result.get("confidence")).lower()
    reasoning = ns(result.get("reasoning")) or "no reasoning provided"

    if confidence == "high":
        payload = {
            "social_verified": True,
            "social_verification_method": "claude_classification",
            "social_verification_reasoning": reasoning,
            "social_verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        client.table("hcps").update(payload).eq("id", hcp_id).execute()
    elif confidence == "medium":
        payload = {"social_verification_reasoning": f"medium: {reasoning}"}
        client.table("hcps").update(payload).eq("id", hcp_id).execute()
    else:
        if platform == "twitter":
            payload = {
                "twitter_handle": None,
                "twitter_bio": None,
                "twitter_followers": None,
                "twitter_following": None,
                "twitter_tweet_count": None,
                "twitter_verified": None,
                "twitter_enriched_at": None,
                "social_verification_reasoning": f"low: {reasoning}",
            }
        else:
            payload = {
                "bluesky_handle": None,
                "bluesky_bio": None,
                "bluesky_followers": None,
                "bluesky_posts": None,
                "bluesky_enriched_at": None,
                "social_verification_reasoning": f"low: {reasoning}",
            }
        client.table("hcps").update(payload).eq("id", hcp_id).execute()


def run(dry_run: bool) -> None:
    load_dotenv()
    client = sb()
    api_key = env("ANTHROPIC_API_KEY")
    rows = load_candidates(client)

    counters = Counters(total_hcps=len(rows))
    high_reasons: List[str] = []
    med_reasons: List[str] = []
    low_reasons: List[str] = []
    manual_review_hcps: set = set()
    low_drop_hcps: set = set()

    for idx, row in enumerate(rows, start=1):
        counters.processed_hcps += 1
        first_name = ns(row.get("first_name"))
        last_name = ns(row.get("last_name"))
        specialty = ns(row.get("specialty")) or "unknown"
        subspecialty = ns(row.get("subspecialty")) or "unknown"
        institution = ns(row.get("institution_short")) or ns(row.get("institution_full")) or "unknown"
        country = ns(row.get("country")) or "unknown"

        for platform in ("twitter", "bluesky"):
            handle = ns(row.get(f"{platform}_handle"))
            bio = ns(row.get(f"{platform}_bio"))
            followers = row.get(f"{platform}_followers")
            if not handle or not bio:
                continue

            result, in_tok, out_tok, err = call_claude(
                api_key=api_key,
                first_name=first_name,
                last_name=last_name,
                specialty=specialty,
                subspecialty=subspecialty,
                institution=institution,
                country=country,
                bio=bio,
                follower_count=followers,
                platform=platform,
            )
            counters.handles_classified += 1
            counters.input_tokens += in_tok
            counters.output_tokens += out_tok
            time.sleep(SLEEP_SECONDS)

            if err:
                if "json_parse_error" in err:
                    counters.json_errors += 1
                else:
                    counters.api_errors += 1
                continue

            confidence = ns((result or {}).get("confidence")).lower()
            reasoning = ns((result or {}).get("reasoning")) or "no reasoning"
            if confidence == "high":
                counters.high += 1
                if len(high_reasons) < 5:
                    high_reasons.append(reasoning)
            elif confidence == "medium":
                counters.medium += 1
                manual_review_hcps.add(row["id"])
                if len(med_reasons) < 5:
                    med_reasons.append(reasoning)
            else:
                counters.low += 1
                low_drop_hcps.add(row["id"])
                if len(low_reasons) < 5:
                    low_reasons.append(reasoning)

            if not dry_run:
                apply_result_update(client, row, platform, result or {"confidence": "low", "reasoning": reasoning})

        if idx % 50 == 0 or idx == len(rows):
            print(
                f"[{idx}/{len(rows)}] | High: {counters.high} | Medium: {counters.medium} | "
                f"Low: {counters.low} | API errors: {counters.api_errors + counters.json_errors}"
            )

    input_cost = (counters.input_tokens / 1_000_000) * INPUT_COST_PER_MTOK
    output_cost = (counters.output_tokens / 1_000_000) * OUTPUT_COST_PER_MTOK
    total_cost = input_cost + output_cost

    print("\n=== Social Cleanup Stage 2 Summary ===")
    print(f"Mode: {'DRY RUN' if dry_run else 'WRITE MODE'}")
    print(f"Total handles classified (twitter + bluesky): {counters.handles_classified}")
    print(f"Confidence distribution -> High: {counters.high}, Medium: {counters.medium}, Low: {counters.low}")
    print(f"HCPs now with social_verified = true: {counters.high}")
    print(f"HCPs flagged for manual review (medium): {len(manual_review_hcps)}")
    print(f"HCPs dropped at low confidence: {len(low_drop_hcps)}")
    print(f"API errors: {counters.api_errors}, JSON parse errors: {counters.json_errors}")
    print(f"Total input tokens: {counters.input_tokens}")
    print(f"Total output tokens: {counters.output_tokens}")
    print(f"Estimated cost: ${total_cost:.4f} (input=${input_cost:.4f}, output=${output_cost:.4f})")
    print("Sample high-confidence reasoning:")
    for item in high_reasons:
        print(f"  - {item}")
    print("Sample medium-confidence reasoning:")
    for item in med_reasons:
        print(f"  - {item}")
    print("Sample low-confidence reasoning:")
    for item in low_reasons:
        print(f"  - {item}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Social cleanup Stage 2 via Claude classification")
    parser.add_argument("--dry-run", action="store_true", help="Run classification without DB writes")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
