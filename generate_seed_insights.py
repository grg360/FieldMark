"""
Generate seed MSL field insights for FieldMark demo accounts.

Calls Claude API to produce realistic, structurally varied insights tied to
specific HCPs. Writes to msl_hcp_notes with full structured fields
(category, why_it_matters, claim linkage, etc).

Usage:
    python generate_seed_insights.py --user-id <uuid> [--dry-run]
    python generate_seed_insights.py --user-id <uuid> --hcps heymach,singh,...

Dry-run generates one insight for one HCP and prints it without writing.
"""

import argparse
import hashlib
import json
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
import requests
from dotenv import load_dotenv
from psycopg.rows import dict_row


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MODEL = "claude-sonnet-4-6"
TEMPERATURE = 0.7
MAX_TOKENS = 2400
API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

# Insight counts per cohort
COUNT_BY_COHORT = {
    "established": 3,
    "rising_star": 2,
    "community": 2,
}

# Demo HCP rosters per user_id
USER_HCP_ROSTERS: dict[str, list[str]] = {
    # Garrett (test user)
    "f0a8352f-3846-4a85-b96d-f91d8b3109f4": [
        "2302d82f-c44a-498e-b0ab-6ca39a3f8964",  # Heymach (Est)
        "71b51a2d-0f56-434f-abf4-f6755c796eaf",  # Ramalingam (Est)
        "659e0892-0795-4976-9938-8e43e4ea473b",  # Singh (RS)
        "7efaec17-c95c-4cd2-ae25-834170adcdae",  # Schoenfeld (RS)
        "51760cb9-3694-4e5c-a7e5-937c477c495f",  # Dagogo-Jack (RS)
        "b7a02d2d-c149-4a52-8a49-f915232bb711",  # Hussein (Comm, FL)
        "14309c59-5c74-4374-990d-6d42c9042b3d",  # Stephen Divers (Comm, AR)
    ],
    # Larry Liberti
    "49e84a2b-5f4e-45f1-8e85-92e5ee7f28ee": [
        "2302d82f-c44a-498e-b0ab-6ca39a3f8964",  # Heymach
        "659e0892-0795-4976-9938-8e43e4ea473b",  # Singh
        "b7a02d2d-c149-4a52-8a49-f915232bb711",  # Hussein
        "b217c02b-9402-497e-9fba-f8cc69bb382b",  # Spira (Est, VA)
        "cbb24fad-0ab0-4a3f-aa48-39af1a7ca25a",  # Janne (Est, MA)
        "5f36754d-c175-4f9e-94e4-00a1fab76f04",  # Tejas Patil (RS, CO)
        "530f4f8d-1b61-42cc-82ac-7d68ca390669",  # Kurt Tauer (Comm, TN)
    ],
    # Alex Carter (demo account, National)
    "e334b3b7-5dbb-4851-9fab-9b6034118763": [
        "2302d82f-c44a-498e-b0ab-6ca39a3f8964",  # Heymach (Est, TX)
        "cbb24fad-0ab0-4a3f-aa48-39af1a7ca25a",  # Janne (Est, MA)
        "71b51a2d-0f56-434f-abf4-f6755c796eaf",  # Ramalingam (Est, GA)
        "b217c02b-9402-497e-9fba-f8cc69bb382b",  # Spira (Est, VA)
        "77dae038-df3f-4d00-98f0-66d63917e6a3",  # Wakelee (Est, CA)
        "659e0892-0795-4976-9938-8e43e4ea473b",  # Singh (RS, PA)
        "7efaec17-c95c-4cd2-ae25-834170adcdae",  # Schoenfeld (RS, NY)
        "5f36754d-c175-4f9e-94e4-00a1fab76f04",  # Patil (RS, CO)
        "6648e326-c5e9-4fe3-a778-29decba1b669",  # Reuben (RS, TX)
        "b5ee1d52-6181-41a3-a91e-79aa92878327",  # Presley (RS, OH)
        "b7a02d2d-c149-4a52-8a49-f915232bb711",  # Hussein (Comm, FL)
        "14309c59-5c74-4374-990d-6d42c9042b3d",  # Divers (Comm, AR)
        "f44f55c9-d27e-4d75-81e8-29d59eeb5ab6",  # Waples (Comm, AL)
        "876f42be-8fab-47b7-a191-d91d584462f5",  # Sumrall (Comm, GA)
        "d50695b9-fa38-4e45-932e-f40a71207a1d",  # Challagalla (Comm, TX)
    ],
    # John (placeholder; populated once account exists)
    "PLACEHOLDER_JOHN_UUID": [
        "2302d82f-c44a-498e-b0ab-6ca39a3f8964",  # Heymach
        "659e0892-0795-4976-9938-8e43e4ea473b",  # Singh
        "b7a02d2d-c149-4a52-8a49-f915232bb711",  # Hussein
        "77dae038-df3f-4d00-98f0-66d63917e6a3",  # Wakelee (Est, CA)
        "6648e326-c5e9-4fe3-a778-29decba1b669",  # Reuben (RS, TX)
        "1cc0da29-fc0b-4246-acf7-e13db82eb6f1",  # Buroker (Comm, IA)
        "4858ae6b-8cd2-4325-a086-a2ad64e864d0",  # Tammy Young (Comm, MS)
    ],
}

INTERACTION_TYPES = [
    "meeting", "advisory_board", "conference", "tumor_board",
    "phone", "email", "publication_review", "internal", "general",
]
INTERACTION_TYPE_WEIGHTS = [0.30, 0.18, 0.15, 0.08, 0.10, 0.08, 0.04, 0.04, 0.03]

CATEGORIES = [
    "evidence_gap", "message_challenge", "message_reinforcement",
    "competitor_signal", "clinical_practice_trend",
    "access_reimbursement", "patient_selection",
    "safety_observation", "other",
]

CATEGORY_BIAS_BY_COHORT: dict[str, list[str]] = {
    "established": [
        "message_challenge", "evidence_gap", "clinical_practice_trend",
        "message_reinforcement", "competitor_signal", "patient_selection",
    ],
    "rising_star": [
        "clinical_practice_trend", "evidence_gap", "patient_selection",
        "message_reinforcement", "competitor_signal", "safety_observation",
    ],
    "community": [
        "access_reimbursement", "clinical_practice_trend", "patient_selection",
        "competitor_signal", "message_challenge", "safety_observation",
    ],
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise EnvironmentError(f"Missing env var: {name}")
    return val


def build_advocacy_claim_key(hcp_id: str, position_ids: list[str]) -> str:
    """Mirror the TS buildAdvocacyClaimKey hash exactly."""
    sorted_ids = sorted(position_ids)
    payload = f"advocacy|{hcp_id}|{','.join(sorted_ids)}"
    return hashlib.sha256(payload.encode()).hexdigest()


def random_occurred_at(weeks_back: int = 8) -> str:
    """Random datetime in last N weeks, business-hours-ish."""
    now = datetime.now(timezone.utc)
    days_back = random.randint(1, weeks_back * 7)
    hour = random.randint(8, 18)
    minute = random.choice([0, 15, 30, 45])
    occurred = now - timedelta(days=days_back)
    occurred = occurred.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return occurred.isoformat()


def fetch_hcp_record(conn, hcp_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, first_name, last_name, cohort_classification,
                   nppes_practice_state, nppes_practice_city
            FROM hcps_v2
            WHERE id = %s
            """,
            (hcp_id,),
        )
        row = cur.fetchone()
        return row


def fetch_belief_profile(conn, hcp_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT body
            FROM hcp_ai_overviews
            WHERE hcp_id = %s
              AND synthesis_type = 'scientific_positions'
              AND therapeutic_area = 'NSCLC'
            LIMIT 1
            """,
            (hcp_id,),
        )
        row = cur.fetchone()
        if not row or not row.get("body"):
            return None
        try:
            return json.loads(row["body"])
        except (json.JSONDecodeError, TypeError):
            return None


def fetch_or_create_relationship(conn, user_id: str, hcp_id: str) -> str:
    """Find or create msl_hcp_relationships row, return relationship_id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM msl_hcp_relationships
            WHERE user_id = %s AND hcp_id = %s
            LIMIT 1
            """,
            (user_id, hcp_id),
        )
        row = cur.fetchone()
        if row:
            return row["id"]

        cur.execute(
            """
            INSERT INTO msl_hcp_relationships (user_id, hcp_id, status, created_from)
            VALUES (%s, %s, 'targeted', 'seed_script')
            RETURNING id
            """,
            (user_id, hcp_id),
        )
        new_rel = cur.fetchone()
        return new_rel["id"]


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

PROMPT_VARIATION_GUIDANCE = """
CRITICAL TONE AND VARIATION REQUIREMENTS:

- Each insight must read as if written by an experienced MSL after a real encounter, not by AI.
- Slightly conversational where natural. MSL notes are not academic prose. They're field shorthand.
- VARY OPENING VERBS. Do NOT all start with "Raised concerns about X" or "Noted that Y" or "Highlighted Z". Real MSLs use specific verbs: "challenged," "anchored on," "circled back to," "deflected," "anticipated," "questioned the assumption," "pushed back on," "advocated for," "flagged hesitancy about," "pressed for clarity on," etc.
- VARY ENCOUNTER CONTEXT. Don't write "At a recent meeting." Write "During the post-session Q&A at ASCO," "On a steering committee call after the MATTERHORN data drop," "After a tumor board case discussion," "In follow-up email exchange." Specific context > vague filler.
- VARY STRATEGIC REGISTER. Some insights should feel tactical, some strategic, some ambiguous. Roughly 15% should be ambiguous ("Initial read is X but worth a second touch to confirm" / "Single data point, watch list it").
- AVOID DEAD MSL PHRASES: "raised concerns about," "highlighted the importance of," "discussed at length," "expressed interest in," "emphasized the need for." These are AI tells. Use specific, active verbs.
- AVOID OVERLY POLISHED SENTENCES. Real MSL notes occasionally use sentence fragments, dashes for emphasis, and field shorthand ("comm onc," "Q1 readout," "MA team should...").
"""

WHY_IT_MATTERS_GUIDANCE = """
WHY IT MATTERS guidance:

- This is the strategic translation an MSL writes for their manager.
- Should answer: "Why should the brand or medical strategy team care about this insight specifically?"
- Roughly 70% should suggest a clear action or implication.
- Roughly 15% should be flagging/watch-list: "Single signal, worth monitoring if it surfaces 2-3 more times."
- Roughly 15% can be null (some insights legitimately don't have strategic implication yet).
- Do NOT just restate the body. Translate it into strategic terms.
- Keep it concise: one to two sentences. Not three.
"""


def build_prompt_for_hcp(
    hcp: dict[str, Any],
    belief_profile: dict[str, Any] | None,
    cohort: str,
    insight_count: int,
) -> tuple[str, list[dict[str, Any]]]:
    """Build the prompt for a single HCP and return (prompt_text, candidate_claims)."""

    full_name = f"{hcp.get('first_name', '').strip()} {hcp.get('last_name', '').strip()}".strip()
    state = hcp.get("nppes_practice_state") or "unspecified state"
    city = hcp.get("nppes_practice_city") or ""
    location_str = f"{city}, {state}" if city else state

    cohort_label = {
        "established": "Established (recognized NSCLC expert)",
        "rising_star": "Rising Star (emerging NSCLC leader)",
        "community": "Community (high-volume community oncologist)",
    }.get(cohort, cohort)

    candidate_claims: list[dict[str, Any]] = []
    belief_context = ""
    if belief_profile:
        strongly_advocates = belief_profile.get("strongly_advocates", [])
        frequently_raises = belief_profile.get("frequently_raises", [])
        for c in strongly_advocates[:4]:
            candidate_claims.append({
                "title": c.get("theme"),
                "summary": c.get("summary"),
                "section": "strongly_advocates",
                "position_ids": c.get("representative_position_ids", []),
            })
        for c in frequently_raises[:3]:
            candidate_claims.append({
                "title": c.get("theme"),
                "summary": c.get("summary"),
                "section": "frequently_raises",
                "position_ids": c.get("representative_position_ids", []),
            })

        if candidate_claims:
            claims_str = "\n".join(
                f"  - [{c['section']}] \"{c['title']}\": {c['summary']}"
                for c in candidate_claims
            )
            belief_context = f"\n\nBelief Profile claims (Claude may optionally tie an insight to one of these by exact title; not required):\n{claims_str}"

    biased_categories = CATEGORY_BIAS_BY_COHORT.get(cohort, CATEGORIES)
    biased_categories_str = ", ".join(biased_categories)

    prompt = f"""You are simulating a Medical Science Liaison (MSL) in oncology / NSCLC. The MSL has had {insight_count} field interactions with the same physician over the past 6-8 weeks. You will generate {insight_count} structured insight records from those interactions.

PHYSICIAN CONTEXT:
- Name: {full_name}
- Cohort: {cohort_label}
- Location: {location_str}
{belief_context}

GENERATE {insight_count} INSIGHTS as a JSON array. Each insight has these fields:

- body (string, required): The MSL's structured takeaway from the encounter, 2-4 sentences. Conversational MSL voice. See variation rules below.
- why_it_matters (string OR null): The MSL's strategic translation for management. See guidance below.
- category (string, required): One of {CATEGORIES}. Bias toward these for this cohort: {biased_categories_str}.
- category_other_label (string OR null): Required only if category is "other"; a short label.
- interaction_type (string, required): One of {INTERACTION_TYPES}.
- interaction_type_other_label (string OR null): Required only if interaction_type is "other".
- insight_strength (string, required): One of "routine", "notable", "strategic". Bias toward "notable" and "strategic"; only ~10% "routine".
- linked_claim_title (string OR null): If this insight is about a specific Belief Profile claim listed above, set this to the EXACT claim title. Otherwise null. Aim for roughly 40% of insights to reference a claim (only when belief profile exists).

{PROMPT_VARIATION_GUIDANCE}

{WHY_IT_MATTERS_GUIDANCE}

DISTRIBUTION REQUIREMENTS:
- The {insight_count} insights for this HCP must vary across topics. Do not anchor every insight to the same theme.
- Vary interaction_type across the {insight_count} insights (don't make them all "meeting").
- Vary insight_strength (don't make them all "strategic").

OUTPUT:
Return ONLY a valid JSON array. No preamble, no markdown fences, no commentary. Just the array.
"""

    return prompt, candidate_claims


# ---------------------------------------------------------------------------
# API call
# ---------------------------------------------------------------------------

def call_claude_api(prompt: str, api_key: str) -> dict[str, Any]:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    payload = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = requests.post(API_URL, headers=headers, json=payload, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    text = data["content"][0]["text"]
    usage = data.get("usage", {})
    try:
        insights = json.loads(text)
    except json.JSONDecodeError:
        # Try to recover by stripping markdown fences
        cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        insights = json.loads(cleaned)
    return {"insights": insights, "usage": usage}


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    # Sonnet 4.6 approximate pricing (subject to change)
    input_cost = (input_tokens / 1_000_000) * 3.0
    output_cost = (output_tokens / 1_000_000) * 15.0
    return input_cost + output_cost


# ---------------------------------------------------------------------------
# Write to DB
# ---------------------------------------------------------------------------

def insert_insight(
    conn,
    user_id: str,
    hcp_id: str,
    relationship_id: str,
    insight: dict[str, Any],
    candidate_claims: list[dict[str, Any]],
) -> str | None:
    """Insert one insight row. Returns inserted id or None on failure."""
    body = (insight.get("body") or "").strip()
    if not body:
        return None

    why = insight.get("why_it_matters")
    why = why.strip() if isinstance(why, str) and why.strip() else None

    category = insight.get("category") or "other"
    if category not in CATEGORIES:
        category = "other"

    cat_other = insight.get("category_other_label")
    cat_other = cat_other.strip() if isinstance(cat_other, str) and cat_other.strip() else None
    if category != "other":
        cat_other = None

    itype = insight.get("interaction_type") or "general"
    if itype not in INTERACTION_TYPES:
        itype = "general"

    itype_other = insight.get("interaction_type_other_label")
    itype_other = itype_other.strip() if isinstance(itype_other, str) and itype_other.strip() else None
    if itype != "other":
        itype_other = None

    strength = insight.get("insight_strength") or "notable"
    if strength not in ("routine", "notable", "strategic"):
        strength = "notable"

    # Resolve claim linkage
    claim_key = None
    claim_title = None
    linked_title = insight.get("linked_claim_title")
    if linked_title and candidate_claims:
        for c in candidate_claims:
            if c["title"] and c["title"].strip().lower() == linked_title.strip().lower():
                if c["position_ids"]:
                    claim_key = build_advocacy_claim_key(hcp_id, c["position_ids"])
                    claim_title = c["title"].strip()
                break

    occurred = random_occurred_at()

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO msl_hcp_notes (
                relationship_id, user_id, body, interaction_type,
                interaction_type_other_label, insight_strength,
                insight_category, insight_category_other_label,
                why_it_matters, belief_claim_key, belief_claim_title, occurred_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
            """,
            (relationship_id, user_id, body, itype, itype_other,
             strength, category, cat_other, why, claim_key, claim_title, occurred),
        )
        row = cur.fetchone()
        return row["id"] if row else None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate seed MSL field insights")
    parser.add_argument("--user-id", required=True, help="Target user_id (uuid)")
    parser.add_argument("--dry-run", action="store_true", help="Generate 1 insight for 1 HCP and print without writing")
    parser.add_argument("--hcps", default=None, help="Comma-separated HCP UUIDs (overrides default roster)")
    args = parser.parse_args()

    load_dotenv()
    api_key = require_env("ANTHROPIC_API_KEY")
    db_url = require_env("DATABASE_URL")

    user_id = args.user_id
    hcps = args.hcps.split(",") if args.hcps else USER_HCP_ROSTERS.get(user_id, [])
    if not hcps:
        print(f"ERROR: No HCPs configured for user_id {user_id}")
        sys.exit(1)

    if args.dry_run:
        hcps = hcps[:1]
        print(f"DRY RUN MODE: generating 1 insight for 1 HCP, no DB writes\n")

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        total_inserted = 0
        total_input_tokens = 0
        total_output_tokens = 0

        for idx, hcp_id in enumerate(hcps, start=1):
            hcp = fetch_hcp_record(conn, hcp_id)
            if not hcp:
                print(f"[{idx}/{len(hcps)}] HCP {hcp_id} not found, skipping")
                continue

            cohort = hcp.get("cohort_classification") or "community"
            count = 1 if args.dry_run else COUNT_BY_COHORT.get(cohort, 2)

            full_name = f"{hcp.get('first_name', '')} {hcp.get('last_name', '')}".strip()
            print(f"[{idx}/{len(hcps)}] {full_name} ({cohort}) -> generating {count} insight(s)")

            belief = fetch_belief_profile(conn, hcp_id)
            prompt, candidate_claims = build_prompt_for_hcp(hcp, belief, cohort, count)

            try:
                result = call_claude_api(prompt, api_key)
            except Exception as e:
                print(f"  API error: {e}")
                continue

            insights = result["insights"]
            usage = result["usage"]
            total_input_tokens += usage.get("input_tokens", 0)
            total_output_tokens += usage.get("output_tokens", 0)

            if args.dry_run:
                print("\n--- DRY RUN OUTPUT ---")
                print(json.dumps(insights, indent=2))
                print("--- END DRY RUN ---\n")
                print(f"Tokens: input={usage.get('input_tokens', 0)}, output={usage.get('output_tokens', 0)}")
                print(f"Estimated cost: ${estimate_cost(usage.get('input_tokens', 0), usage.get('output_tokens', 0)):.4f}")
                return

            relationship_id = fetch_or_create_relationship(conn, user_id, hcp_id)
            for insight in insights:
                inserted_id = insert_insight(conn, user_id, hcp_id, relationship_id, insight, candidate_claims)
                if inserted_id:
                    total_inserted += 1

            conn.commit()
            time.sleep(0.5)  # be gentle on the API

        cost = estimate_cost(total_input_tokens, total_output_tokens)
        print(f"\nDone. Inserted {total_inserted} insights.")
        print(f"Total tokens: input={total_input_tokens}, output={total_output_tokens}")
        print(f"Estimated cost: ${cost:.4f}")


if __name__ == "__main__":
    main()
