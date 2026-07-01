"""
generate_seed_followups.py

Generates LLM-written follow-up tasks (msl_hcp_next_actions) for a user, derived from their
existing field insights (msl_hcp_notes).

For each HCP in the user's relationship list, fetches recent insights and asks Claude to
generate 1-2 natural follow-up actions an MSL would schedule. Distributes priorities and
due dates across overdue / due-this-week / future.

Usage:
  python generate_seed_followups.py --user-id <UUID> --dry-run
  python generate_seed_followups.py --user-id <UUID>
  python generate_seed_followups.py --user-id <UUID> --hcps "<id1>,<id2>"

Idempotent guard: skips HCPs that already have at least one open follow-up for this user.
Pass --force to bypass the guard.
"""

import argparse
import json
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import anthropic
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env", file=sys.stderr)
    sys.exit(1)
if not ANTHROPIC_API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not set in .env", file=sys.stderr)
    sys.exit(1)

CLAUDE_MODEL = "claude-sonnet-4-6"

# Priority distribution: how often each priority shows up
# 60% normal, 25% high, 15% low feels MSL-natural
PRIORITY_WEIGHTS = [("normal", 0.60), ("high", 0.25), ("low", 0.15)]

# Due-date distribution
# 40% overdue (1-14 days ago), 45% this week (0-7 days out), 15% future (8-30 days out)
# Heavier on overdue so the OVERDUE FOLLOW-UPS tile populates meaningfully on the demo home page.
DUE_DATE_BUCKETS = [
    ("overdue", 0.40, (-14, -1)),
    ("this_week", 0.45, (0, 7)),
    ("future", 0.15, (8, 30)),
]


def weighted_choice(choices: List[Tuple[str, float]]) -> str:
    """Pick a single choice based on weights."""
    r = random.random()
    cumulative = 0.0
    for choice, weight in choices:
        cumulative += weight
        if r < cumulative:
            return choice
    return choices[-1][0]


def random_due_at() -> Optional[datetime]:
    """
    Return a random due_at timestamp distributed across overdue / this_week / future buckets.
    """
    bucket = weighted_choice([(name, weight) for name, weight, _ in DUE_DATE_BUCKETS])
    bounds = next(rng for name, _, rng in DUE_DATE_BUCKETS if name == bucket)
    days_offset = random.randint(bounds[0], bounds[1])
    # Random hour during business day for realism
    hour = random.randint(9, 17)
    minute = random.choice([0, 15, 30, 45])
    base = datetime.now(timezone.utc).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return base + timedelta(days=days_offset)


def fetch_user_hcps(conn, user_id: str) -> List[Dict]:
    """Return list of HCPs the user has relationships with, including cohort."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                r.id AS relationship_id,
                r.hcp_id,
                h.first_name,
                h.last_name,
                h.cohort_classification
            FROM msl_hcp_relationships r
            JOIN hcps_v2 h ON h.id = r.hcp_id
            WHERE r.user_id = %s
            ORDER BY h.last_name
            """,
            (user_id,),
        )
        rows = cur.fetchall()
    return [
        {
            "relationship_id": str(row[0]),
            "hcp_id": str(row[1]),
            "first_name": row[2],
            "last_name": row[3],
            "cohort": row[4],
        }
        for row in rows
    ]


def fetch_recent_insights_for_hcp(conn, user_id: str, relationship_id: str, limit: int = 3) -> List[Dict]:
    """
    Return up to N most recent insights for the user's relationship with this HCP.
    Used as context for follow-up generation.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                body,
                insight_category,
                interaction_type,
                why_it_matters,
                belief_claim_title,
                occurred_at
            FROM msl_hcp_notes
            WHERE relationship_id = %s AND user_id = %s
            ORDER BY occurred_at DESC NULLS LAST
            LIMIT %s
            """,
            (relationship_id, user_id, limit),
        )
        rows = cur.fetchall()
    return [
        {
            "body": row[0],
            "insight_category": row[1],
            "interaction_type": row[2],
            "why_it_matters": row[3],
            "belief_claim_title": row[4],
            "occurred_at": row[5].isoformat() if row[5] else None,
        }
        for row in rows
    ]


def has_existing_followups(conn, user_id: str, relationship_id: str) -> bool:
    """Check whether this user already has any open follow-ups for this HCP."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM msl_hcp_next_actions
                WHERE relationship_id = %s
                  AND user_id = %s
                  AND completed_at IS NULL
            )
            """,
            (relationship_id, user_id),
        )
        return cur.fetchone()[0]


def build_followup_prompt(hcp_first: str, hcp_last: str, cohort: str, insights: List[Dict]) -> str:
    """
    Build a prompt asking Claude to generate 1-2 follow-up actions derived from the insights.
    """
    insight_block_lines = []
    for i, ins in enumerate(insights, 1):
        ts = ins["occurred_at"][:10] if ins["occurred_at"] else "recent"
        insight_block_lines.append(f"INSIGHT {i} ({ts}, {ins['interaction_type']}, category={ins['insight_category']}):")
        insight_block_lines.append(ins["body"])
        if ins["why_it_matters"]:
            insight_block_lines.append(f"WHY IT MATTERS: {ins['why_it_matters']}")
        if ins["belief_claim_title"]:
            insight_block_lines.append(f"LINKED BELIEF CLAIM: {ins['belief_claim_title']}")
        insight_block_lines.append("")
    insights_text = "\n".join(insight_block_lines).strip()

    return f"""You are an experienced MSL (Medical Science Liaison) drafting follow-up tasks for yourself in your CRM. You just captured the following field insights about Dr. {hcp_first} {hcp_last} (cohort: {cohort}). Based on these, write 1-2 short, natural follow-up actions you would schedule.

INSIGHTS YOU JUST CAPTURED:

{insights_text}

REQUIREMENTS for each follow-up:
- 8 to 16 words, short and direct
- Start with an action verb: Circle back, Send, Confirm, Ask, Share, Schedule, Follow up, Validate, Forward, Probe, Bring, Check
- Reference specific scientific or strategic content from the insights (drug names, clinical concepts, specific belief gaps)
- Sound like a real MSL would write to themselves (not academic, not corporate)
- Vary the action verbs across the follow-ups you write
- One follow-up can be a question to clarify ambiguity; another can be a concrete deliverable
- Do not start with "Discuss"
- Do not write generic follow-ups like "Follow up with Dr. X about recent discussion"
- Avoid em dashes, smart quotes, and unicode characters

PRIORITY GUIDANCE - reserve "high" for genuinely time-sensitive or strategically critical actions. Default to "normal" for routine MSL follow-through, and use "low" for things that are useful-but-not-pressing. Across multiple follow-ups in one batch, mix priorities - do not assign "high" to everything just because the underlying insight was strategic.

Output JSON array, no preamble:

[
  {{
    "body": "Circle back on perioperative IO subgroup data and confirm whether EFS curves hold for PD-L1 negative patients",
    "priority": "high" | "normal" | "low"
  }},
  ...
]

Generate 1 or 2 follow-ups, biased toward 2 unless the insights truly only support one."""


def generate_followups_for_hcp(
    client: anthropic.Anthropic,
    hcp_first: str,
    hcp_last: str,
    cohort: str,
    insights: List[Dict],
) -> Tuple[List[Dict], int, int]:
    """
    Call Claude to generate follow-ups. Return (followups_list, input_tokens, output_tokens).
    """
    prompt = build_followup_prompt(hcp_first, hcp_last, cohort, insights)
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=600,
        temperature=0.7,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()

    # Defensive JSON extraction
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
        if text.endswith("```"):
            text = text[:-3].strip()

    followups = json.loads(text)

    # Validate shape
    cleaned = []
    for fu in followups:
        if not isinstance(fu, dict):
            continue
        body = fu.get("body", "").strip()
        priority = fu.get("priority", "normal").strip().lower()
        if not body:
            continue
        if priority not in ("low", "normal", "high"):
            priority = "normal"
        cleaned.append({"body": body, "priority": priority})

    return cleaned, response.usage.input_tokens, response.usage.output_tokens


def insert_followup(conn, relationship_id: str, user_id: str, body: str, priority: str, due_at: datetime) -> Optional[str]:
    """Insert a follow-up. Return new row id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO msl_hcp_next_actions (
                relationship_id, user_id, body, priority, due_at, created_from
            ) VALUES (
                %s, %s, %s, %s, %s, %s
            )
            RETURNING id
            """,
            (relationship_id, user_id, body, priority, due_at, "seed_script"),
        )
        return str(cur.fetchone()[0])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True, help="User UUID to generate follow-ups for")
    parser.add_argument("--dry-run", action="store_true", help="Generate but don't insert")
    parser.add_argument("--hcps", help="Comma-separated list of HCP UUIDs to limit to")
    parser.add_argument("--force", action="store_true", help="Generate even if HCP already has open follow-ups")
    args = parser.parse_args()

    print(f"Connecting to database...")
    conn = psycopg.connect(DATABASE_URL)
    conn.autocommit = False

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    try:
        # Fetch HCPs in user's portfolio
        all_hcps = fetch_user_hcps(conn, args.user_id)

        if args.hcps:
            allowed_ids = {h.strip() for h in args.hcps.split(",") if h.strip()}
            hcps = [h for h in all_hcps if h["hcp_id"] in allowed_ids]
        else:
            hcps = all_hcps

        if not hcps:
            print("No HCPs found for this user. Exiting.")
            return

        print(f"Processing {len(hcps)} HCPs for user {args.user_id}")
        if args.dry_run:
            print("DRY RUN: will generate but not write to DB")

        total_input_tokens = 0
        total_output_tokens = 0
        total_inserted = 0
        total_skipped = 0

        for idx, hcp in enumerate(hcps, 1):
            name = f"{hcp['first_name']} {hcp['last_name']}"
            cohort = hcp["cohort"] or "unknown"

            # Skip if existing follow-ups (unless --force)
            if not args.force and not args.dry_run:
                if has_existing_followups(conn, args.user_id, hcp["relationship_id"]):
                    print(f"[{idx}/{len(hcps)}] {name}: already has open follow-ups, skipping")
                    total_skipped += 1
                    continue

            insights = fetch_recent_insights_for_hcp(conn, args.user_id, hcp["relationship_id"], limit=3)
            if not insights:
                print(f"[{idx}/{len(hcps)}] {name}: no insights found, skipping")
                total_skipped += 1
                continue

            print(f"[{idx}/{len(hcps)}] {name} ({cohort}) - generating from {len(insights)} insight(s)...")

            try:
                followups, in_tokens, out_tokens = generate_followups_for_hcp(
                    client, hcp["first_name"], hcp["last_name"], cohort, insights
                )
            except Exception as e:
                print(f"  ERROR generating for {name}: {e}")
                continue

            total_input_tokens += in_tokens
            total_output_tokens += out_tokens

            for fu in followups:
                due_at = random_due_at()
                if args.dry_run:
                    print(f"  [DRY] [{fu['priority']:>6}] due {due_at.strftime('%Y-%m-%d')}: {fu['body']}")
                else:
                    new_id = insert_followup(
                        conn,
                        hcp["relationship_id"],
                        args.user_id,
                        fu["body"],
                        fu["priority"],
                        due_at,
                    )
                    total_inserted += 1
                    print(f"  [{fu['priority']:>6}] due {due_at.strftime('%Y-%m-%d')}: {fu['body']}")

            if not args.dry_run:
                conn.commit()

        # Cost estimate (Sonnet 4.6 pricing: ~$3/Mtok input, ~$15/Mtok output)
        cost = (total_input_tokens * 3.0 / 1_000_000) + (total_output_tokens * 15.0 / 1_000_000)
        print()
        if args.dry_run:
            print(f"DRY RUN complete. {total_skipped} skipped.")
        else:
            print(f"Done. Inserted {total_inserted} follow-ups. {total_skipped} HCPs skipped.")
        print(f"Total tokens: input={total_input_tokens}, output={total_output_tokens}")
        print(f"Estimated cost: ${cost:.4f}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
