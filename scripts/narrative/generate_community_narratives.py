"""
generate_community_narratives.py

Generates "Why This Practitioner" narratives for Community cohort HCPs by synthesizing
practice-pattern signals (Open Payments engagement, Medicare practice scale, drug engagement
trends) rather than publication-based academic signals.

Different shape than the Established narrative (which leads with publication leadership).
Community narrative emphasizes practice scale + pharma engagement story + actionable MSL framing.

Usage:
  python generate_community_narratives.py --limit 3 --dry-run        # validate prompt on 3 HCPs
  python generate_community_narratives.py --limit 50                 # run for top 50
  python generate_community_narratives.py --limit 200                # run for top 200
  python generate_community_narratives.py --force --limit 5          # regenerate even if exists

Idempotent. Skips HCPs that already have a Community narrative (prompt_version='community_v1')
unless --force is set. Skips HCPs without Open Payments data (nothing to synthesize from).
"""

import argparse
import os
import sys
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
PROMPT_VERSION = "community_v1"
NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"
NSCLC_TA_SLUG = "nsclc"


def fetch_top_community_hcps(conn, limit: int) -> List[Dict]:
    """
    Fetch top-ranked Community NSCLC HCPs that have Open Payments data to work from.
    Skips HCPs with no Open Payments summary (nothing to synthesize from).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 
                h.id,
                h.first_name,
                h.last_name,
                h.nppes_practice_state,
                h.institution_canonical,
                h.npi_specialty,
                r.rank,
                r.composite_score
            FROM hcp_community_ranks_v2 r
            JOIN hcps_v2 h ON h.id = r.hcp_id
            LEFT JOIN hcp_open_payments_summary_v2 op ON op.hcp_id = h.id
            WHERE r.therapeutic_area_id = %s
              AND r.scope_type = 'global'
              AND h.cohort_classification = 'community'
            ORDER BY r.rank
            LIMIT %s
            """,
            (NSCLC_TA_ID, limit),
        )
        rows = cur.fetchall()
    return [
        {
            "hcp_id": str(row[0]),
            "first_name": row[1] or "",
            "last_name": row[2] or "",
            "state": row[3],
            "institution": row[4],
            "specialty": row[5],
            "rank": row[6],
            "composite_score": float(row[7]) if row[7] is not None else None,
        }
        for row in rows
    ]


def fetch_single_community_hcp(conn, hcp_id: str) -> List[Dict]:
    """Fetch a single HCP by ID with the same shape as fetch_top_community_hcps."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 
                h.id,
                h.first_name,
                h.last_name,
                h.nppes_practice_state,
                h.institution_canonical,
                h.npi_specialty,
                r.rank
            FROM hcps_v2 h
            LEFT JOIN hcp_community_ranks_v2 r 
              ON r.hcp_id = h.id 
              AND r.therapeutic_area_id = %s
              AND r.scope_type = 'global'
            WHERE h.id = %s
              AND h.cohort_classification = 'community'
            """,
            (NSCLC_TA_ID, hcp_id),
        )
        rows = cur.fetchall()
    return [
        {
            "hcp_id": str(row[0]),
            "first_name": row[1] or "",
            "last_name": row[2] or "",
            "state": row[3],
            "institution": row[4],
            "specialty": row[5],
            "rank": row[6],
        }
        for row in rows
    ]


def fetch_open_payments_summary(conn, hcp_id: str) -> Optional[Dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 
                distinct_companies_lifetime,
                total_payments_lifetime,
                total_payments_3yr,
                total_payments_count_lifetime,
                most_recent_payment_date,
                year_over_year_trend_pct,
                speaker_bureau_3yr,
                consulting_3yr,
                honoraria_3yr,
                education_3yr
            FROM hcp_open_payments_summary_v2
            WHERE hcp_id = %s
            """,
            (hcp_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "companies_lifetime": row[0],
        "lifetime_usd": int(row[1]) if row[1] is not None else None,
        "payments_3yr_usd": int(row[2]) if row[2] is not None else None,
        "payment_count_lifetime": row[3],
        "most_recent_payment_date": row[4].isoformat() if row[4] else None,
        "yoy_trend_pct": float(row[5]) if row[5] is not None else None,
        "speaker_bureau_3yr": int(row[6]) if row[6] is not None else None,
        "consulting_3yr": int(row[7]) if row[7] is not None else None,
        "honoraria_3yr": int(row[8]) if row[8] is not None else None,
        "education_3yr": int(row[9]) if row[9] is not None else None,
    }


def fetch_top_companies(conn, hcp_id: str, limit: int = 5) -> List[Dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT manufacturer_name, total_amount_usd, payment_count
            FROM hcp_open_payments_top_companies_v2
            WHERE hcp_id = %s
            ORDER BY total_amount_usd DESC NULLS LAST
            LIMIT %s
            """,
            (hcp_id, limit),
        )
        rows = cur.fetchall()
    return [
        {"company": row[0], "amount_usd": int(row[1]) if row[1] is not None else 0, "payment_count": row[2]}
        for row in rows
    ]


def fetch_drug_engagement(conn, hcp_id: str, limit: int = 10) -> List[Dict]:
    """
    Fetch top drugs by total payment amount. Each row includes trend signal.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 
                drug_name,
                total_amount_usd,
                most_recent_payment_date,
                year_over_year_trend_pct
            FROM hcp_open_payments_by_drug_v2
            WHERE hcp_id = %s
              AND drug_name IS NOT NULL
            ORDER BY total_amount_usd DESC NULLS LAST
            LIMIT %s
            """,
            (hcp_id, limit),
        )
        rows = cur.fetchall()
    return [
        {
            "drug": row[0],
            "amount_usd": int(row[1]) if row[1] is not None else 0,
            "most_recent": row[2].isoformat() if row[2] else None,
            "yoy_trend_pct": float(row[3]) if row[3] is not None else None,
        }
        for row in rows
    ]


def fetch_medicare(conn, hcp_id: str) -> Optional[Dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 
                total_beneficiaries_3yr,
                beneficiaries_yoy_trend_pct,
                primary_place_of_service,
                predominant_specialty,
                predominant_state,
                top_hcpcs_codes
            FROM hcp_medicare_summary_v2
            WHERE hcp_id = %s
            """,
            (hcp_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "patients_3yr": row[0],
        "patients_yoy_trend_pct": float(row[1]) if row[1] is not None else None,
        "place_of_service": row[2],
        "specialty": row[3],
        "state": row[4],
        "top_hcpcs_codes": row[5],
    }


def has_existing_community_narrative(conn, hcp_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM hcp_narratives_v2
                WHERE hcp_id = %s
                  AND prompt_version = %s
                  AND therapeutic_area_slug = %s
            )
            """,
            (hcp_id, PROMPT_VERSION, NSCLC_TA_SLUG),
        )
        return cur.fetchone()[0]


def build_prompt(hcp: Dict, op_summary: Dict, top_companies: List[Dict], drugs: List[Dict], medicare: Optional[Dict]) -> str:
    name = f"Dr. {hcp['first_name']} {hcp['last_name']}".strip()
    location = hcp["state"] or "unknown state"
    institution = hcp["institution"] or "community practice setting"
    specialty = hcp["specialty"] or medicare["specialty"] if medicare else hcp["specialty"]
    specialty = specialty or "medical oncology"

    # Build data block
    lines = []
    lines.append(f"HCP: {name}")
    lines.append(f"Location: {location}")
    lines.append(f"Institution: {institution}")
    lines.append(f"Specialty: {specialty}")
    if hcp.get("rank") is not None:
        lines.append(f"US national rank in NSCLC Community cohort: #{hcp['rank']}")
    lines.append("")

    lines.append("PRACTICE SCALE:")
    if medicare:
        if medicare["patients_3yr"]:
            lines.append(f"- Medicare beneficiaries (3-year): {medicare['patients_3yr']:,}")
        if medicare["patients_yoy_trend_pct"] is not None:
            lines.append(f"- Patient volume YoY trend: {medicare['patients_yoy_trend_pct']:+.1f}%")
        if medicare["place_of_service"]:
            lines.append(f"- Primary place of service: {medicare['place_of_service']}")
    else:
        lines.append("- Medicare data not available")
    lines.append("")

    lines.append("PHARMA ENGAGEMENT:")
    if op_summary["companies_lifetime"]:
        lines.append(f"- Distinct pharma companies engaged (lifetime): {op_summary['companies_lifetime']}")
    if op_summary["lifetime_usd"]:
        lines.append(f"- Total payments received (lifetime): ${op_summary['lifetime_usd']:,}")
    if op_summary["payments_3yr_usd"]:
        lines.append(f"- Payments last 3 years: ${op_summary['payments_3yr_usd']:,}")
    if op_summary["yoy_trend_pct"] is not None:
        lines.append(f"- Engagement YoY trend: {op_summary['yoy_trend_pct']:+.1f}%")
    if op_summary["speaker_bureau_3yr"]:
        lines.append(f"- Speaker bureau payments (3yr): ${op_summary['speaker_bureau_3yr']:,}")
    if op_summary["consulting_3yr"]:
        lines.append(f"- Consulting payments (3yr): ${op_summary['consulting_3yr']:,}")
    lines.append("")

    if top_companies:
        lines.append("TOP PHARMA RELATIONSHIPS:")
        for c in top_companies:
            lines.append(f"- {c['company']}: ${c['amount_usd']:,} across {c['payment_count']} payments")
        lines.append("")

    if drugs:
        lines.append("DRUG ENGAGEMENT (top by lifetime payment amount):")
        for d in drugs:
            trend_str = ""
            if d["yoy_trend_pct"] is not None:
                if d["yoy_trend_pct"] >= 25:
                    trend_str = f" [growing {d['yoy_trend_pct']:+.0f}% YoY]"
                elif d["yoy_trend_pct"] <= -25:
                    trend_str = f" [declining {d['yoy_trend_pct']:+.0f}% YoY]"
                else:
                    trend_str = " [stable]"
            lines.append(f"- {d['drug']}: ${d['amount_usd']:,}{trend_str}")
        lines.append("")

    data_block = "\n".join(lines).strip()

    return f"""You are writing a "Why This Practitioner" narrative for a Community-cohort HCP in a B2B SaaS platform used by pharmaceutical Medical Science Liaisons (MSLs). The reader is an MSL planning to engage this HCP.

Community HCPs do not have the academic publication footprint that Established or Rising Star HCPs do. Instead, their intelligence layer comes from practice-pattern data: Medicare patient volume, pharma engagement history, drug utilization patterns, and prescribing trends.

The narrative you write should be operationally useful to an MSL planning a visit, not a celebration of academic credentials. It should help them understand:
- What kind of practice they're walking into (scale, setting)
- What this HCP's pharma engagement signals about their priorities and influence
- Which drug trends in their data are worth knowing before the conversation
- Anything actionable an MSL should be aware of

DATA AVAILABLE:

{data_block}

REQUIREMENTS:

- 80 to 130 words, single paragraph
- Tone: operationally informed, like a sharp colleague briefing an MSL before a visit
- NOT a celebration ("a respected leader in...") and NOT a generic profile
- Lead with the most distinctive thing in the data, not boilerplate practice context
- Reference SPECIFIC numbers from the data when they tell a story (e.g., "$81K lifetime engagement across 60 pharma companies", "43,000 Medicare beneficiaries")
- Reference SPECIFIC drug trends when meaningful (e.g., "Tagrisso utilization declining 60% YoY - a signal worth understanding before EGFR-targeted conversations")
- Use SPECIFIC pharma company names when they appear in top relationships
- Speak to what an MSL should DO with this information - what to ask, what to bring, what to be ready for
- Avoid em dashes (do not use "--" or any dash longer than a hyphen between words; use commas, periods, or colons instead)
- Avoid smart quotes and unicode characters
- Avoid generic phrases like "active community oncologist" or "broad therapeutic engagement"
- Do not start with "Dr." or the HCP's name - start with a specific observation about the data
- If the data is sparse (low payment totals, few drugs, limited Medicare detail), do NOT close with vague gestures like "understand who else is influencing decisions" or "find out where decisions are made." Instead, anchor on what IS known: practice scale, geography, the small handful of pharma touchpoints that exist, and what those concretely suggest for first contact.
- SPECIAL CASE - zero pharma engagement: If "Distinct pharma companies engaged (lifetime)" is 0 AND "Total payments received (lifetime)" is 0, this HCP has no Open Payments record at all. Frame this as strategically meaningful: a high-volume community practitioner that pharma has not yet reached. Lead with the practice scale (patient volume, geography, setting) and explicitly name the absence of engagement as an opportunity signal. Suggest what an MSL should bring to a first conversation when there is no engagement history to anchor against - educational materials, peer-published data, comparative effectiveness research. Do not invent engagement data that does not exist. Do not speculate about WHY the HCP has no engagement (could be anti-pharma, could be untapped, could be selective - the data cannot distinguish). Treat the absence as a fact and a strategic prompt, not a deficiency.

Output ONLY the narrative text. No preamble, no JSON wrapping, no quotation marks around the output."""


def generate_narrative(client: anthropic.Anthropic, prompt: str) -> Tuple[str, int, int]:
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=400,
        temperature=0.6,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    # Defensive: strip wrapping quotes if model adds them
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()
    return text, response.usage.input_tokens, response.usage.output_tokens


def upsert_narrative(conn, hcp_id: str, narrative_text: str) -> None:
    """
    Insert or update narrative for this HCP with the community_v1 prompt_version.
    """
    with conn.cursor() as cur:
        # Delete any existing community_v1 narrative first (idempotent for --force runs)
        cur.execute(
            """
            DELETE FROM hcp_narratives_v2
            WHERE hcp_id = %s
              AND therapeutic_area_slug = %s
            """,
            (hcp_id, NSCLC_TA_SLUG),
        )
        cur.execute(
            """
            INSERT INTO hcp_narratives_v2 (
                hcp_id,
                therapeutic_area_slug,
                narrative_text,
                prompt_version,
                model_used,
                generated_at
            ) VALUES (%s, %s, %s, %s, %s, now())
            """,
            (hcp_id, NSCLC_TA_SLUG, narrative_text, PROMPT_VERSION, CLAUDE_MODEL),
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50, help="Max number of HCPs to process (ranked, top first)")
    parser.add_argument("--dry-run", action="store_true", help="Generate but don't write to DB")
    parser.add_argument("--force", action="store_true", help="Regenerate even if community narrative already exists")
    parser.add_argument("--hcp-id", type=str, default=None, help="Process only this single HCP ID, ignoring --limit and rank ordering")
    args = parser.parse_args()

    print("Connecting to database...")
    conn = psycopg.connect(DATABASE_URL)
    conn.autocommit = False

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    try:
        if args.hcp_id:
            hcps = fetch_single_community_hcp(conn, args.hcp_id)
            if not hcps:
                print(f"ERROR: HCP {args.hcp_id} not found or not in NSCLC Community cohort")
                return
            print(f"Single-HCP mode: processing {args.hcp_id}")
        else:
            hcps = fetch_top_community_hcps(conn, args.limit)
            print(f"Fetched {len(hcps)} top Community NSCLC HCPs")
        if args.dry_run:
            print("DRY RUN: will generate but not write to DB")
        if args.force:
            print("FORCE: will overwrite any existing community_v1 narratives")

        total_input_tokens = 0
        total_output_tokens = 0
        total_generated = 0
        total_skipped = 0
        total_errors = 0

        for idx, hcp in enumerate(hcps, 1):
            name = f"{hcp['first_name']} {hcp['last_name']}"

            # Idempotency guard
            if not args.force and not args.dry_run:
                if has_existing_community_narrative(conn, hcp["hcp_id"]):
                    print(f"[{idx}/{len(hcps)}] {name}: existing community narrative, skipping")
                    total_skipped += 1
                    continue

            op_summary = fetch_open_payments_summary(conn, hcp["hcp_id"])
            if not op_summary:
                # No Open Payments record - frame as untapped opportunity rather than skip
                op_summary = {
                    "companies_lifetime": 0,
                    "lifetime_usd": 0,
                    "payments_3yr_usd": 0,
                    "yoy_trend_pct": None,
                    "speaker_bureau_3yr": 0,
                    "consulting_3yr": 0,
                }
                print(f"[{idx}/{len(hcps)}] {name}: no Open Payments record - generating opportunity narrative")

            top_companies = fetch_top_companies(conn, hcp["hcp_id"], limit=5)
            drugs = fetch_drug_engagement(conn, hcp["hcp_id"], limit=10)
            medicare = fetch_medicare(conn, hcp["hcp_id"])

            prompt = build_prompt(hcp, op_summary, top_companies, drugs, medicare)

            print(f"[{idx}/{len(hcps)}] {name} (rank #{hcp['rank']}, {hcp['state']}) - generating...")

            try:
                narrative_text, in_tokens, out_tokens = generate_narrative(client, prompt)
            except Exception as e:
                print(f"  ERROR: {e}")
                total_errors += 1
                continue

            total_input_tokens += in_tokens
            total_output_tokens += out_tokens

            if args.dry_run:
                print(f"  [DRY] {narrative_text}")
            else:
                upsert_narrative(conn, hcp["hcp_id"], narrative_text)
                conn.commit()
                total_generated += 1
                # Print first 120 chars of generated narrative for visibility during run
                preview = narrative_text[:120] + ("..." if len(narrative_text) > 120 else "")
                print(f"  -> {preview}")

        # Cost estimate (Sonnet 4.6: ~$3/Mtok input, ~$15/Mtok output)
        cost = (total_input_tokens * 3.0 / 1_000_000) + (total_output_tokens * 15.0 / 1_000_000)
        print()
        if args.dry_run:
            print(f"DRY RUN complete. {total_skipped} skipped. {total_errors} errors.")
        else:
            print(f"Done. Generated {total_generated} narratives. {total_skipped} skipped. {total_errors} errors.")
        print(f"Total tokens: input={total_input_tokens}, output={total_output_tokens}")
        print(f"Estimated cost: ${cost:.4f}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
