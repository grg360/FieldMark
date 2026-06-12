#!/usr/bin/env python3
"""
Generate per-HCP scientific position synthesis from hcp_scientific_positions_v1
and store in hcp_ai_overviews with synthesis_type = scientific_positions.

Usage:
    python scripts/generate_scientific_position_synthesis.py
    python scripts/generate_scientific_position_synthesis.py --dry-run
    python scripts/generate_scientific_position_synthesis.py --hcp-id <uuid>
    python scripts/generate_scientific_position_synthesis.py --limit 10
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import anthropic
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"
THERAPEUTIC_AREA = "NSCLC"
MODEL_NAME = "claude-sonnet-4-6"
SYNTHESIS_TYPE = "scientific_positions"
ANTHROPIC_MAX_TOKENS = 4000
CORPUS_DEPTH_DEEP_THRESHOLD = 5
CORPUS_DEPTH_FOCUSED_THRESHOLD = 3
DRY_RUN_HCP_LIMIT = 1

GET_HCPS_WITH_POSITIONS_SQL = (
    "SELECT DISTINCT hcp_id FROM hcp_scientific_positions_v1 "
    "WHERE therapeutic_area_id = %s ORDER BY hcp_id"
)

GET_POSITIONS_FOR_HCP_SQL = """
SELECT
  sp.id AS position_id,
  sp.publication_id,
  sp.author_role,
  sp.position_type,
  sp.position_category,
  sp.drug_name,
  sp.drug_class,
  sp.biomarker,
  sp.disease_context,
  sp.position_text,
  sp.evidence_excerpt,
  sp.confidence,
  sp.pub_year,
  sp.citation_count,
  p.title AS pub_title,
  p.journal
FROM hcp_scientific_positions_v1 sp
LEFT JOIN publications_v2 p ON p.id = sp.publication_id
WHERE sp.hcp_id = %s
  AND sp.therapeutic_area_id = %s
ORDER BY sp.citation_count DESC NULLS LAST, sp.pub_year DESC, sp.confidence DESC
"""

UPSERT_SYNTHESIS_SQL = """
INSERT INTO hcp_ai_overviews (
  hcp_id,
  synthesis_type,
  therapeutic_area,
  body,
  model_used,
  prompt_tokens,
  completion_tokens,
  generated_at
)
VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (hcp_id, synthesis_type, therapeutic_area)
DO UPDATE SET
  body = EXCLUDED.body,
  model_used = EXCLUDED.model_used,
  prompt_tokens = EXCLUDED.prompt_tokens,
  completion_tokens = EXCLUDED.completion_tokens,
  generated_at = NOW()
"""

JSON_OUTPUT_AND_RULES_DEEP = """
OUTPUT
Return valid JSON only with this exact shape:
{{
  "headline": "One-sentence summary an MSL could read before a meeting.",
  "strongly_advocates": [
    {{
      "theme": "Short theme name (max 8 words)",
      "summary": "One sentence explaining the position the investigator takes on this theme.",
      "evidence_count": 0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1", "category2"]
    }}
  ],
  "frequently_raises": [
    {{
      "theme": "Short theme name (max 8 words)",
      "summary": "One sentence explaining the concern or unmet need.",
      "evidence_count": 0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1"]
    }}
  ],
  "research_focus": [
    {{
      "theme": "Short focus area name (max 6 words)",
      "weight": 0.0,
      "primary_position_categories": ["category1"]
    }}
  ],
  "corpus_depth": "deep",
  "paper_count": {paper_count},
  "position_count": {position_count}
}}

RULES
- Include 2-5 themes per bucket. Quality over quantity.
- representative_position_ids must come from the actual positions provided. Do not invent UUIDs.
- evidence_count is the number of distinct positions supporting this theme.
- weight in research_focus sums to approximately 1.0 across all entries.
- Use grounded language: "the investigator's published record advances", "the investigator has repeatedly raised", not "believes" or "advocates for" without evidence.
- If a theme appears in only one paper, do not include it - look for recurring viewpoints.
- Return JSON only. No preamble. No markdown fences.
"""

JSON_OUTPUT_AND_RULES_FOCUSED = """
OUTPUT
Return valid JSON only with this exact shape:
{{
  "headline": "One-sentence summary an MSL could read before a meeting.",
  "strongly_advocates": [
    {{
      "theme": "Short theme name (max 8 words)",
      "summary": "One sentence explaining the position the investigator takes on this theme.",
      "evidence_count": 0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1", "category2"]
    }}
  ],
  "frequently_raises": [
    {{
      "theme": "Short theme name (max 8 words)",
      "summary": "One sentence explaining the concern or unmet need.",
      "evidence_count": 0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1"]
    }}
  ],
  "research_focus": [
    {{
      "theme": "Short focus area name (max 6 words)",
      "weight": 0.0,
      "primary_position_categories": ["category1"]
    }}
  ],
  "corpus_depth": "focused",
  "paper_count": {paper_count},
  "position_count": {position_count}
}}

RULES
- Include 2-5 themes per bucket. Quality over quantity.
- representative_position_ids must come from the actual positions provided. Do not invent UUIDs.
- evidence_count is the number of distinct positions supporting this theme.
- weight in research_focus sums to approximately 1.0 across all entries.
- Use grounded language: "the investigator's published record advances", "the investigator has repeatedly raised", not "believes" or "advocates for" without evidence.
- Be more conservative in claiming "strongly advocates" - prefer "current focus" framing in the summary text.
- Themes still require multi-paper recurrence where possible.
- Return JSON only. No preamble. No markdown fences.
"""

JSON_OUTPUT_AND_RULES_SIGNAL = """
OUTPUT
Return valid JSON only with this exact shape:
{{
  "headline": "One-sentence summary an MSL could read before a meeting.",
  "strongly_advocates": [
    {{
      "theme": "Short theme name (max 8 words)",
      "summary": "One sentence explaining the position the investigator takes on this theme.",
      "evidence_count": 0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1", "category2"]
    }}
  ],
  "frequently_raises": [
    {{
      "theme": "Short theme name (max 8 words)",
      "summary": "One sentence explaining the concern or unmet need.",
      "evidence_count": 0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1"]
    }}
  ],
  "research_focus": [
    {{
      "theme": "Short focus area name (max 6 words)",
      "weight": 0.0,
      "primary_position_categories": ["category1"]
    }}
  ],
  "corpus_depth": "signal_moment",
  "paper_count": {paper_count},
  "position_count": {position_count}
}}

RULES
- Include 2-5 themes per bucket. Quality over quantity.
- representative_position_ids must come from the actual positions provided. Do not invent UUIDs.
- evidence_count is the number of distinct positions supporting this theme.
- weight in research_focus sums to approximately 1.0 across all entries.
- Use grounded language: "the investigator's published record advances", "the investigator has repeatedly raised", not "believes" or "advocates for" without evidence.
- The strongly_advocates and frequently_raises arrays should reflect positions taken in the specific paper(s), not aggregated trends.
- Do not aggregate across papers as if they form a pattern when the sample is too small.
- Return JSON only. No preamble. No markdown fences.
"""

PROMPT_TEMPLATE_DEEP = (
    """You are a medical affairs analyst synthesizing an investigator's scientific positioning from their published work in NSCLC.

INVESTIGATOR CORPUS
This investigator has {paper_count} senior or first-authored NSCLC publications and {position_count} extracted scientific positions. The corpus is large enough to characterize a developed scientific worldview.

POSITIONS (sorted by citation impact, most recent first):
{positions_block}

TASK
Synthesize this investigator's scientific positioning into a structured analyst note. Look for recurring themes across positions, not isolated single-paper claims. The output is meant for a Medical Science Liaison preparing for a scientific engagement.

Three buckets:
1. STRONGLY ADVOCATES: themes the investigator has advanced as positive positions across multiple papers (weighted by recency, citation count, and senior/first authorship)
2. FREQUENTLY RAISES: concerns, cautions, or unmet needs the investigator has flagged across multiple papers
3. RESEARCH FOCUS: the dominant categories of scientific work (efficacy, biomarker, resistance, etc.) the investigator is engaged with, weighted by position volume

For each theme, link back to specific position IDs as evidence.
"""
    + JSON_OUTPUT_AND_RULES_DEEP
)

PROMPT_TEMPLATE_FOCUSED = (
    """You are a medical affairs analyst synthesizing an investigator's scientific positioning from their published work in NSCLC.

INVESTIGATOR CORPUS
This investigator has {paper_count} senior or first-authored NSCLC publications and {position_count} extracted scientific positions. The corpus is focused but not exhaustive - characterize the current scientific focus without overclaiming a fully developed worldview.

POSITIONS:
{positions_block}

TASK
Synthesize this investigator's current scientific focus. Output structure is identical to deep-corpus synthesis but framed as focus rather than developed worldview. Be more conservative in claiming "strongly advocates" - prefer "current focus" framing in the summary text. Themes still require multi-paper recurrence where possible.
"""
    + JSON_OUTPUT_AND_RULES_FOCUSED
)

PROMPT_TEMPLATE_SIGNAL = (
    """You are a medical affairs analyst characterizing an investigator's recent senior/first-authored work in NSCLC.

INVESTIGATOR CORPUS
This investigator has only {paper_count} senior or first-authored NSCLC publications, with {position_count} extracted positions. Do not claim a developed worldview. Characterize the specific work and the positions advanced within it.

POSITIONS:
{positions_block}

TASK
Anchor the synthesis on the specific paper(s). Use "Recent Senior-Authored Work" framing. Do not aggregate across papers as if they form a pattern when the sample is too small. The strongly_advocates and frequently_raises arrays should reflect positions taken in the specific paper(s), not aggregated trends. research_focus still applies.
"""
    + JSON_OUTPUT_AND_RULES_SIGNAL
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate scientific position synthesis per HCP via Claude API."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process 1 HCP, print prompt and parsed JSON, no DB writes.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Maximum total HCPs to process (default: unlimited).",
    )
    parser.add_argument(
        "--hcp-id",
        type=str,
        default=None,
        metavar="UUID",
        help="Process only this specific HCP (overrides limit).",
    )
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def get_db_connection() -> psycopg2.extensions.connection:
    database_url = get_required_env("DATABASE_URL")
    return psycopg2.connect(database_url)


def get_target_hcp_ids(
    conn: psycopg2.extensions.connection,
    hcp_id_filter: str | None = None,
    limit: int | None = None,
) -> list[str]:
    if hcp_id_filter:
        return [hcp_id_filter]

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(GET_HCPS_WITH_POSITIONS_SQL, (NSCLC_TA_ID,))
        rows = cur.fetchall()

    hcp_ids = [str(row["hcp_id"]) for row in rows]
    if limit is not None:
        return hcp_ids[:limit]
    return hcp_ids


def get_positions_for_hcp(
    conn: psycopg2.extensions.connection,
    hcp_id: str,
) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(GET_POSITIONS_FOR_HCP_SQL, (hcp_id, NSCLC_TA_ID))
        return [dict(row) for row in cur.fetchall()]


def build_positions_block(positions: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for pos in positions:
        position_id = pos.get("position_id", "unknown")
        pub_year = pos.get("pub_year") if pos.get("pub_year") is not None else "n/a"
        citations = pos.get("citation_count") if pos.get("citation_count") is not None else "n/a"
        author_role = pos.get("author_role") or "n/a"
        position_type = pos.get("position_type") or "n/a"
        position_category = pos.get("position_category") or "n/a"
        drug_name = pos.get("drug_name") or "n/a"
        biomarker = pos.get("biomarker") or "n/a"
        position_text = (pos.get("position_text") or "").strip()

        lines.append(
            f"- [{position_id}] ({pub_year}, citations={citations}, "
            f"{author_role}, {position_type}/{position_category})"
        )
        lines.append(f"  drug: {drug_name} | biomarker: {biomarker}")
        lines.append(f"  position: {position_text}")
        lines.append("")

    return "\n".join(lines).strip()


def count_distinct_papers(positions: list[dict[str, Any]]) -> int:
    paper_ids = {str(p["publication_id"]) for p in positions if p.get("publication_id")}
    return len(paper_ids)


def determine_corpus_depth(paper_count: int) -> str:
    if paper_count >= CORPUS_DEPTH_DEEP_THRESHOLD:
        return "deep"
    if paper_count >= CORPUS_DEPTH_FOCUSED_THRESHOLD:
        return "focused"
    return "signal_moment"


def build_synthesis_prompt(
    positions: list[dict[str, Any]],
    paper_count: int,
    position_count: int,
    corpus_depth: str,
) -> str:
    positions_block = build_positions_block(positions)
    format_kwargs = {
        "paper_count": paper_count,
        "position_count": position_count,
        "positions_block": positions_block,
    }

    if corpus_depth == "deep":
        template = PROMPT_TEMPLATE_DEEP
    elif corpus_depth == "focused":
        template = PROMPT_TEMPLATE_FOCUSED
    else:
        template = PROMPT_TEMPLATE_SIGNAL

    return template.format(**format_kwargs)


def strip_markdown_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def extract_response_text(response: anthropic.types.Message) -> str:
    parts: list[str] = []
    for block in response.content:
        if block.type == "text":
            parts.append(block.text)
    return "".join(parts).strip()


def call_anthropic_for_synthesis(
    client: anthropic.Anthropic,
    prompt: str,
) -> tuple[dict[str, Any], int, int]:
    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=ANTHROPIC_MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = extract_response_text(response)
    prompt_tokens = int(response.usage.input_tokens)
    completion_tokens = int(response.usage.output_tokens)
    cleaned = strip_markdown_fences(raw_text)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise ValueError(f"Failed to parse Anthropic JSON response: {raw_text[:500]}")
        parsed = json.loads(match.group(0))

    if not isinstance(parsed, dict):
        raise ValueError("Anthropic response is not a JSON object")

    return parsed, prompt_tokens, completion_tokens


def write_synthesis(
    conn: psycopg2.extensions.connection,
    hcp_id: str,
    synthesis_dict: dict[str, Any],
    prompt_tokens: int,
    completion_tokens: int,
) -> None:
    body = json.dumps(synthesis_dict, ensure_ascii=True)
    with conn.cursor() as cur:
        cur.execute(
            UPSERT_SYNTHESIS_SQL,
            (
                hcp_id,
                SYNTHESIS_TYPE,
                THERAPEUTIC_AREA,
                body,
                MODEL_NAME,
                prompt_tokens,
                completion_tokens,
            ),
        )


def main() -> int:
    load_dotenv()
    args = parse_args()

    if args.hcp_id:
        effective_limit = None
    elif args.dry_run:
        effective_limit = DRY_RUN_HCP_LIMIT
    else:
        effective_limit = args.limit

    api_key = get_required_env("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key, timeout=120.0)

    conn = get_db_connection()
    conn.autocommit = False

    stats = {
        "hcps_processed": 0,
        "syntheses_written": 0,
        "depth_counts": Counter(),
        "api_errors": 0,
        "db_errors": 0,
    }

    try:
        target_hcp_ids = get_target_hcp_ids(conn, args.hcp_id, effective_limit)
        total_hcps = len(target_hcp_ids)
        print(f"Loaded {total_hcps} target HCPs")

        if total_hcps == 0:
            print("No HCPs to process.")
            return 0

        for idx, hcp_id in enumerate(target_hcp_ids, start=1):
            try:
                positions = get_positions_for_hcp(conn, hcp_id)
            except Exception as exc:
                stats["db_errors"] += 1
                print(
                    f"[ERROR] Failed to load positions for HCP {hcp_id}: {exc}",
                    file=sys.stderr,
                )
                continue

            if not positions:
                print(f"[SKIP] HCP {hcp_id}: no positions found")
                continue

            paper_count = count_distinct_papers(positions)
            position_count = len(positions)
            corpus_depth = determine_corpus_depth(paper_count)
            stats["depth_counts"][corpus_depth] += 1

            try:
                prompt = build_synthesis_prompt(
                    positions,
                    paper_count,
                    position_count,
                    corpus_depth,
                )
                synthesis_dict, prompt_tokens, completion_tokens = call_anthropic_for_synthesis(
                    client,
                    prompt,
                )
            except Exception as exc:
                stats["api_errors"] += 1
                print(
                    f"[ERROR] Anthropic API failed for HCP {hcp_id}: {exc}",
                    file=sys.stderr,
                )
                continue

            if args.dry_run:
                print(f"\n=== DRY RUN: HCP {hcp_id} ===")
                print("--- PROMPT ---")
                print(prompt)
                print("--- PARSED JSON ---")
                print(json.dumps(synthesis_dict, indent=2, ensure_ascii=True))
                stats["hcps_processed"] += 1
                print(
                    f"[HCP {idx}/{total_hcps}] {hcp_id}: "
                    f"{paper_count} papers, {position_count} positions, "
                    f"depth={corpus_depth}, dry-run only"
                )
                continue

            try:
                write_synthesis(
                    conn,
                    hcp_id,
                    synthesis_dict,
                    prompt_tokens,
                    completion_tokens,
                )
                conn.commit()
                stats["syntheses_written"] += 1
            except Exception as exc:
                stats["db_errors"] += 1
                print(
                    f"[ERROR] DB write failed for HCP {hcp_id}: {exc}",
                    file=sys.stderr,
                )
                conn.rollback()
                continue

            stats["hcps_processed"] += 1
            print(
                f"[HCP {idx}/{total_hcps}] {hcp_id}: "
                f"{paper_count} papers, {position_count} positions, "
                f"depth={corpus_depth}, synthesis written"
            )

        print("\n=== Summary ===")
        print(f"HCPs processed: {stats['hcps_processed']}")
        print(f"Syntheses written: {stats['syntheses_written']}")
        print("By depth:")
        for depth, count in sorted(stats["depth_counts"].items()):
            print(f"  {depth}: {count}")
        print(f"API errors: {stats['api_errors']}")
        print(f"DB errors: {stats['db_errors']}")

        if args.dry_run:
            print("\nDry run complete - no database writes.")

        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
