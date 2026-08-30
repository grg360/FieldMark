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
import asyncio
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

NSCLC_TA_NAME = "NSCLC"  # written to hcp_ai_overviews.therapeutic_area for nsclc only
# TA uuids are no longer constants here -- see the note above TA_CONFIGS.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta  # noqa: E402
MODEL_NAME = "claude-sonnet-4-6"
SYNTHESIS_TYPE = "scientific_positions"
ANTHROPIC_MAX_TOKENS = 4000
CORPUS_DEPTH_DEEP_THRESHOLD = 5
CORPUS_DEPTH_FOCUSED_THRESHOLD = 3
DRY_RUN_HCP_LIMIT = 1
CONCURRENCY_LIMIT = 8

# Per-TA config. The nsclc entry reproduces the original prompt text and written
# tag ("NSCLC") verbatim so its behavior is byte-for-byte identical; non-NSCLC
# TAs use TA-neutral theme exemplars and write their own slug tag.
# TA UUIDs REMOVED FROM THIS DICT (2026-08-27). They were hardcoded here, again in
# extract_scientific_positions, and again in extract_research_themes -- three copies of the
# same constants, none of which the database knows about. The id is now resolved at USE time
# via scripts/utils/ta_registry.
#
# RESOLVED AT USE TIME, NOT AT IMPORT, deliberately: this dict is built at module scope, so
# calling the resolver here would make merely importing the module open a database connection.
# generate_cycle imports extract_research_themes for its TA_CONFIGS precisely because that
# module has no import-time side effects; the same property is worth keeping here.
#
# What remains in the dict is what is genuinely per-script: the prompt fragments and the
# `tag` written to hcp_ai_overviews.therapeutic_area.
TA_CONFIGS: dict[str, dict[str, str]] = {
    "nsclc": {
        "tag": NSCLC_TA_NAME,  # written to hcp_ai_overviews.therapeutic_area
        "label": "NSCLC",  # prompt framing
        "theme_naming_examples": (
            '  - Good: "Perioperative Immunotherapy", "Resistance Reversal '
            'Strategies", "Precision IO Selection", "Radioimmunotherapy Combinations"\n'
            '  - Bad: "Durvalumab Efficacy", "Pembrolizumab Sequencing", '
            '"Nivolumab Plus SABR Improves EFS"'
        ),
    },
    "atopic-dermatitis": {
        "tag": "atopic-dermatitis",  # slug, matches the frontend read
        "label": "atopic dermatitis",
        "theme_naming_examples": (
            '  - Good: name the scientific concept or strategy, e.g. '
            '"Combination Maintenance Strategy", "Early Treatment Escalation", '
            '"Biomarker-Guided Selection", "Long-Term Disease Control"\n'
            '  - Bad: name a drug or a single endpoint result, e.g. '
            '"Drug X Efficacy", "Agent Y Sequencing", "Compound Z Improves Endpoint"'
        ),
    },
    "colorectal-cancer": {
        # SLUG, following atopic-dermatitis. This is written to
        # hcp_ai_overviews.therapeutic_area, the internally-inconsistent column that holds
        # 'NSCLC' for one TA and 'atopic-dermatitis' for another. The slug is the platform
        # convention and the form the frontend reads; nsclc's uppercase value is the
        # outlier, preserved only because changing it would orphan 598 existing rows.
        "tag": "colorectal-cancer",
        "label": "colorectal cancer",
        "theme_naming_examples": (
            '  - Good: name the scientific concept or strategy, e.g. '
            '"Biomarker-Guided Selection", "Treatment Sequencing Strategy", '
            '"Locoregional Control", "Minimal Residual Disease Monitoring"\n'
            '  - Bad: name a drug or a single endpoint result, e.g. '
            '"Drug X Efficacy", "Agent Y Sequencing", "Compound Z Improves Endpoint"'
        ),
    },
}
DEFAULT_TA = "nsclc"

# Selection is GLOBAL and has always been -- no country, rank or scope predicate.
# Coverage gaps here are unrun batches, never a filter.
GET_HCPS_WITH_POSITIONS_SQL = """
SELECT DISTINCT sp.hcp_id FROM hcp_scientific_positions_v1 sp
WHERE sp.therapeutic_area_id = %s
  {skip_existing}
ORDER BY sp.hcp_id
"""

# When --skip-existing is set, exclude HCPs that already carry a synthesis for this
# TA, so a re-run only covers the not-yet-synthesised tail. Without it the UPSERT's
# ON CONFLICT DO UPDATE rewrites every existing row -- on 2026-08-19 that was 263
# US syntheses, all of them already newer than their source positions, i.e. $13.52
# of duplicate spend and 263 rewritten characterisations for no change. --limit is
# NOT a substitute: it truncates by `ORDER BY hcp_id` (UUID order), so it cannot
# target the uncovered. Matches the flag of the same name on
# extract_scientific_positions.py. Adds one %s (the TA tag).
SKIP_EXISTING_CLAUSE = """AND NOT EXISTS (
    SELECT 1 FROM hcp_ai_overviews ao
    WHERE ao.hcp_id = sp.hcp_id
      AND ao.synthesis_type = 'scientific_positions'
      AND ao.therapeutic_area = %s
  )"""

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
      "theme": "2-4 word scientific concept name",
      "summary": "One sentence explaining the position the investigator takes on this theme.",
      "evidence_count": 0,
      "supporting_paper_count": 0,
      "confidence": 0.0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1", "category2"]
    }}
  ],
  "frequently_raises": [
    {{
      "theme": "2-4 word scientific concept name",
      "summary": "One sentence explaining the concern or unmet need.",
      "evidence_count": 0,
      "supporting_paper_count": 0,
      "confidence": 0.0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1"]
    }}
  ],
  "research_focus": [
    {{
      "theme": "2-4 word focus area name",
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
- Theme names must be 2-4 words describing scientific concepts or strategies. Never use individual drug names as themes. Keep elaboration in the summary field.
- Each theme in strongly_advocates and frequently_raises must include a confidence score (0.50-0.98) calibrated to evidence strength, recency, citation impact, and senior/first authorship proportion.
- primary_position_categories must use base category names only (efficacy, patient_selection, biomarker, safety, resistance, sequencing, access, diagnostics, methodology). Do not concatenate polarity prefixes.
- representative_position_ids must come from the actual positions provided. Do not invent UUIDs.
- evidence_count is the number of distinct positions supporting this theme.
- supporting_paper_count is the number of DISTINCT source publications backing the theme. Compute this by counting unique publication_ids across the supporting positions. Each position is tagged with its publication_id implicitly via the [position_id] in the input - papers that produce multiple positions count once. Example: if a theme is supported by 7 positions drawn from 4 distinct papers, supporting_paper_count is 4.
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
      "theme": "2-4 word scientific concept name",
      "summary": "One sentence explaining the position the investigator takes on this theme.",
      "evidence_count": 0,
      "supporting_paper_count": 0,
      "confidence": 0.0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1", "category2"]
    }}
  ],
  "frequently_raises": [
    {{
      "theme": "2-4 word scientific concept name",
      "summary": "One sentence explaining the concern or unmet need.",
      "evidence_count": 0,
      "supporting_paper_count": 0,
      "confidence": 0.0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1"]
    }}
  ],
  "research_focus": [
    {{
      "theme": "2-4 word focus area name",
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
- Theme names must be 2-4 words describing scientific concepts or strategies. Never use individual drug names as themes. Keep elaboration in the summary field.
- Each theme in strongly_advocates and frequently_raises must include a confidence score (0.50-0.98) calibrated to evidence strength, recency, citation impact, and senior/first authorship proportion.
- primary_position_categories must use base category names only (efficacy, patient_selection, biomarker, safety, resistance, sequencing, access, diagnostics, methodology). Do not concatenate polarity prefixes.
- representative_position_ids must come from the actual positions provided. Do not invent UUIDs.
- evidence_count is the number of distinct positions supporting this theme.
- supporting_paper_count is the number of DISTINCT source publications backing the theme. Compute this by counting unique publication_ids across the supporting positions. Each position is tagged with its publication_id implicitly via the [position_id] in the input - papers that produce multiple positions count once. Example: if a theme is supported by 7 positions drawn from 4 distinct papers, supporting_paper_count is 4.
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
      "theme": "2-4 word scientific concept name",
      "summary": "One sentence explaining the position the investigator takes on this theme.",
      "evidence_count": 0,
      "supporting_paper_count": 0,
      "confidence": 0.0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1", "category2"]
    }}
  ],
  "frequently_raises": [
    {{
      "theme": "2-4 word scientific concept name",
      "summary": "One sentence explaining the concern or unmet need.",
      "evidence_count": 0,
      "supporting_paper_count": 0,
      "confidence": 0.0,
      "representative_position_ids": ["uuid1", "uuid2"],
      "primary_position_categories": ["category1"]
    }}
  ],
  "research_focus": [
    {{
      "theme": "2-4 word focus area name",
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
- Theme names must be 2-4 words describing scientific concepts or strategies. Never use individual drug names as themes. Keep elaboration in the summary field.
- Each theme in strongly_advocates and frequently_raises must include a confidence score (0.50-0.98) calibrated to evidence strength, recency, citation impact, and senior/first authorship proportion.
- primary_position_categories must use base category names only (efficacy, patient_selection, biomarker, safety, resistance, sequencing, access, diagnostics, methodology). Do not concatenate polarity prefixes.
- representative_position_ids must come from the actual positions provided. Do not invent UUIDs.
- evidence_count is the number of distinct positions supporting this theme.
- supporting_paper_count is the number of DISTINCT source publications backing the theme. Compute this by counting unique publication_ids across the supporting positions. Each position is tagged with its publication_id implicitly via the [position_id] in the input - papers that produce multiple positions count once. Example: if a theme is supported by 7 positions drawn from 4 distinct papers, supporting_paper_count is 4.
- weight in research_focus sums to approximately 1.0 across all entries.
- Use grounded language: "the investigator's published record advances", "the investigator has repeatedly raised", not "believes" or "advocates for" without evidence.
- The strongly_advocates and frequently_raises arrays should reflect positions taken in the specific paper(s), not aggregated trends.
- Do not aggregate across papers as if they form a pattern when the sample is too small.
- Return JSON only. No preamble. No markdown fences.
"""

PROMPT_TEMPLATE_DEEP = (
    """You are a medical affairs analyst synthesizing an investigator's scientific positioning from their published work in {ta_label}.

INVESTIGATOR CORPUS
This investigator has {paper_count} senior or first-authored {ta_label} publications and {position_count} extracted scientific positions. The corpus is large enough to characterize a developed scientific worldview.

POSITIONS (sorted by citation impact, most recent first):
{positions_block}

TASK
Synthesize this investigator's scientific positioning into a structured analyst note. Look for recurring themes across positions, not isolated single-paper claims. The output is meant for a Medical Science Liaison preparing for a scientific engagement.

Three buckets:
1. STRONGLY ADVOCATES: themes the investigator has advanced as positive positions across multiple papers (weighted by recency, citation count, and senior/first authorship)
2. FREQUENTLY RAISES: concerns, cautions, or unmet needs the investigator has flagged across multiple papers
3. RESEARCH FOCUS: the dominant categories of scientific work (efficacy, biomarker, resistance, etc.) the investigator is engaged with, weighted by position volume

For each theme, link back to specific position IDs as evidence.

THEME NAMING RULES
- Theme names must be 2-4 words. Scannable, not sentences.
- Theme names must describe scientific concepts, strategies, or treatment philosophies - NOT individual drug names.
{theme_naming_examples}
- Keep the long explanation in the summary field, not in the theme name.
- primary_position_categories must use ONLY base category names from the enum: efficacy, patient_selection, biomarker, safety, resistance, sequencing, access, diagnostics, methodology. Do NOT concatenate polarity prefixes (no "positive_position/efficacy").

CONFIDENCE SCORING
- Each theme in strongly_advocates and frequently_raises must include a confidence score from 0.50 to 0.98.
- Calibrate confidence based on: number of supporting positions, recency, citation impact, senior/first authorship proportion, AND the theme's prominence relative to the rest of the corpus.
- Use the full scale. Most strong themes should land 0.80-0.90. Reserve 0.95+ for career-defining themes where the investigator is widely recognized as a primary voice.
- Rubric:
  - 0.95-0.98 = career-defining theme (investigator is a primary voice in the field; theme dominates the corpus)
  - 0.90-0.94 = dominant recurring theme (clearly central to investigator's work; multiple high-citation papers)
  - 0.80-0.89 = strong recurring theme (consistent across multiple papers but one of several focuses)
  - 0.70-0.79 = meaningful secondary theme (recurring but not central)
  - 0.50-0.69 = supporting theme (appears across a few papers, weaker signal)
- If most themes for one investigator land in 0.90+, you are over-calibrating. Spread the scores across the rubric.
- Do not exceed 0.98. Do not go below 0.50 (anything weaker should not be included as a theme at all).
"""
    + JSON_OUTPUT_AND_RULES_DEEP
)

PROMPT_TEMPLATE_FOCUSED = (
    """You are a medical affairs analyst synthesizing an investigator's scientific positioning from their published work in {ta_label}.

INVESTIGATOR CORPUS
This investigator has {paper_count} senior or first-authored {ta_label} publications and {position_count} extracted scientific positions. The corpus is focused but not exhaustive - characterize the current scientific focus without overclaiming a fully developed worldview.

POSITIONS:
{positions_block}

TASK
Synthesize this investigator's current scientific focus. Output structure is identical to deep-corpus synthesis but framed as focus rather than developed worldview. Be more conservative in claiming "strongly advocates" - prefer "current focus" framing in the summary text. Themes still require multi-paper recurrence where possible.

THEME NAMING RULES
- Theme names must be 2-4 words. Scannable, not sentences.
- Theme names must describe scientific concepts, strategies, or treatment philosophies - NOT individual drug names.
- primary_position_categories must use ONLY base category names: efficacy, patient_selection, biomarker, safety, resistance, sequencing, access, diagnostics, methodology.
"""
    + JSON_OUTPUT_AND_RULES_FOCUSED
)

PROMPT_TEMPLATE_SIGNAL = (
    """You are a medical affairs analyst characterizing an investigator's recent senior/first-authored work in {ta_label}.

INVESTIGATOR CORPUS
This investigator has only {paper_count} senior or first-authored {ta_label} publications, with {position_count} extracted positions. Do not claim a developed worldview. Characterize the specific work and the positions advanced within it.

POSITIONS:
{positions_block}

TASK
Anchor the synthesis on the specific paper(s). Use "Recent Senior-Authored Work" framing. Do not aggregate across papers as if they form a pattern when the sample is too small. The strongly_advocates and frequently_raises arrays should reflect positions taken in the specific paper(s), not aggregated trends. research_focus still applies.

THEME NAMING RULES
- Theme names must be 2-4 words. Scannable, not sentences.
- Theme names must describe scientific concepts, strategies, or treatment philosophies - NOT individual drug names.
- primary_position_categories must use ONLY base category names: efficacy, patient_selection, biomarker, safety, resistance, sequencing, access, diagnostics, methodology.
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
    parser.add_argument(
        "--ta",
        choices=tuple(TA_CONFIGS.keys()),
        default=DEFAULT_TA,
        help="Therapeutic area to process (default: nsclc).",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Only process HCPs with no synthesis yet for this TA. Without this "
        "the UPSERT rewrites every existing synthesis, which costs full price and "
        "churns already-published characterisations. --limit is not a substitute: "
        "it truncates by hcp_id order and cannot target the uncovered.",
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
    ta_id: str | None = None,
    skip_existing: bool = False,
    ta_tag: str | None = None,
) -> tuple[list[str], int]:
    """Returns (hcp_ids_to_process, selected_before_limit).

    BOTH NUMBERS, because they differ and the difference is not obvious.
    --dry-run sets limit=1 (DRY_RUN_HCP_LIMIT), and the slice below is applied
    AFTER selection -- so a dry-run of a 305-HCP selection processes 1. Reporting
    only the post-slice count reads as "the selector matched 1", which is how a
    correct --skip-existing run was misread as a broken clause on 2026-08-19.
    """
    if hcp_id_filter:
        return [hcp_id_filter], 1

    if skip_existing:
        sql = GET_HCPS_WITH_POSITIONS_SQL.format(skip_existing=SKIP_EXISTING_CLAUSE)
        params: tuple[Any, ...] = (ta_id, ta_tag)
    else:
        sql = GET_HCPS_WITH_POSITIONS_SQL.format(skip_existing="")
        params = (ta_id,)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    hcp_ids = [str(row["hcp_id"]) for row in rows]
    selected = len(hcp_ids)
    if limit is not None:
        return hcp_ids[:limit], selected
    return hcp_ids, selected


def get_positions_for_hcp(
    conn: psycopg2.extensions.connection,
    hcp_id: str,
    ta_id: str,
) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(GET_POSITIONS_FOR_HCP_SQL, (hcp_id, ta_id))
        return [dict(row) for row in cur.fetchall()]


def build_positions_block(positions: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for pos in positions:
        position_id = pos.get("position_id", "unknown")
        publication_id = pos.get("publication_id", "unknown")
        pub_year = pos.get("pub_year") if pos.get("pub_year") is not None else "n/a"
        citations = pos.get("citation_count") if pos.get("citation_count") is not None else "n/a"
        author_role = pos.get("author_role") or "n/a"
        position_type = pos.get("position_type") or "n/a"
        position_category = pos.get("position_category") or "n/a"
        drug_name = pos.get("drug_name") or "n/a"
        biomarker = pos.get("biomarker") or "n/a"
        position_text = (pos.get("position_text") or "").strip()

        lines.append(
            f"- [{position_id}] pub={publication_id} ({pub_year}, citations={citations}, "
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
    ta: dict[str, str],
) -> str:
    positions_block = build_positions_block(positions)
    format_kwargs = {
        "paper_count": paper_count,
        "position_count": position_count,
        "positions_block": positions_block,
        "ta_label": ta["label"],
        "theme_naming_examples": ta["theme_naming_examples"],
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


async def call_anthropic_for_synthesis_async(
    client: anthropic.Anthropic,
    prompt: str,
    semaphore: asyncio.Semaphore,
) -> tuple[dict[str, Any], int, int]:
    async with semaphore:
        return await asyncio.to_thread(call_anthropic_for_synthesis, client, prompt)


def write_synthesis(
    conn: psycopg2.extensions.connection,
    hcp_id: str,
    synthesis_dict: dict[str, Any],
    prompt_tokens: int,
    completion_tokens: int,
    ta: dict[str, str],
) -> None:
    body = json.dumps(synthesis_dict, ensure_ascii=True)
    with conn.cursor() as cur:
        cur.execute(
            UPSERT_SYNTHESIS_SQL,
            (
                hcp_id,
                SYNTHESIS_TYPE,
                ta["tag"],
                body,
                MODEL_NAME,
                prompt_tokens,
                completion_tokens,
            ),
        )


async def run_all_hcps(
    conn: psycopg2.extensions.connection,
    client: anthropic.Anthropic,
    target_hcp_ids: list[str],
    args: argparse.Namespace,
    stats: dict[str, Any],
    ta: dict[str, str],
    ta_id: str,
) -> None:
    total_hcps = len(target_hcp_ids)
    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
    db_lock = asyncio.Lock()
    done_counter = 0

    async def process_hcp(idx: int, hcp_id: str) -> None:
        nonlocal done_counter

        try:
            try:
                async with db_lock:
                    positions = get_positions_for_hcp(conn, hcp_id, ta_id)
            except Exception as exc:
                async with db_lock:
                    stats["db_errors"] += 1
                print(
                    f"[ERROR] Failed to load positions for HCP {hcp_id}: {exc}",
                    file=sys.stderr,
                )
                return

            if not positions:
                print(f"[SKIP] HCP {hcp_id}: no positions found")
                return

            paper_count = count_distinct_papers(positions)
            position_count = len(positions)
            corpus_depth = determine_corpus_depth(paper_count)

            async with db_lock:
                stats["depth_counts"][corpus_depth] += 1

            prompt = build_synthesis_prompt(
                positions,
                paper_count,
                position_count,
                corpus_depth,
                ta,
            )

            try:
                synthesis_dict, prompt_tokens, completion_tokens = (
                    await call_anthropic_for_synthesis_async(client, prompt, semaphore)
                )
            except Exception as exc:
                async with db_lock:
                    stats["api_errors"] += 1
                print(
                    f"[ERROR] Anthropic API failed for HCP {hcp_id}: {exc}",
                    file=sys.stderr,
                )
                return

            if args.dry_run:
                print(f"\n=== DRY RUN: HCP {hcp_id} ===")
                print("--- PROMPT ---")
                print(prompt)
                print("--- PARSED JSON ---")
                print(json.dumps(synthesis_dict, indent=2, ensure_ascii=True))
                async with db_lock:
                    stats["hcps_processed"] += 1
                    done_counter += 1
                    n = done_counter
                print(
                    f"[done {n}/{total_hcps}] {hcp_id}: "
                    f"{paper_count} papers, {position_count} positions, "
                    f"depth={corpus_depth}, dry-run only"
                )
                return

            try:
                async with db_lock:
                    write_synthesis(
                        conn,
                        hcp_id,
                        synthesis_dict,
                        prompt_tokens,
                        completion_tokens,
                        ta,
                    )
                    conn.commit()
                    stats["syntheses_written"] += 1
                    stats["hcps_processed"] += 1
                    done_counter += 1
                    n = done_counter
            except Exception as exc:
                async with db_lock:
                    stats["db_errors"] += 1
                    conn.rollback()
                print(
                    f"[ERROR] DB write failed for HCP {hcp_id}: {exc}",
                    file=sys.stderr,
                )
                return

            print(
                f"[done {n}/{total_hcps}] {hcp_id}: "
                f"{paper_count} papers, {position_count} positions, "
                f"depth={corpus_depth}, synthesis written"
            )
        except Exception as exc:
            print(
                f"[ERROR] Unexpected error for HCP {hcp_id}: {exc}",
                file=sys.stderr,
            )

    tasks = [
        process_hcp(idx, hcp_id)
        for idx, hcp_id in enumerate(target_hcp_ids, start=1)
    ]
    await asyncio.gather(*tasks, return_exceptions=True)


def main() -> int:
    load_dotenv()
    args = parse_args()
    ta = TA_CONFIGS[args.ta]
    _ta_id = resolve_ta(args.ta).id

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
        target_hcp_ids, selected_hcps = get_target_hcp_ids(
            conn,
            args.hcp_id,
            effective_limit,
            _ta_id,
            skip_existing=args.skip_existing,
            ta_tag=ta["tag"],
        )
        total_hcps = len(target_hcp_ids)
        scope_label = (
            "uncovered only" if args.skip_existing
            else "ALL — existing syntheses will be rewritten"
        )
        print(
            f"Selected {selected_hcps} HCPs ({scope_label}); processing {total_hcps} (ta={args.ta})"
        )
        if total_hcps < selected_hcps:
            reason = "--dry-run" if args.dry_run else f"--limit {args.limit}"
            print(f"  NOTE: {reason} caps this run at {total_hcps} of {selected_hcps} selected.")

        if total_hcps == 0:
            print("No HCPs to process.")
            return 0

        asyncio.run(
            run_all_hcps(conn, client, target_hcp_ids, args, stats, ta, _ta_id),
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

        # ALL-FAILED RULE. On 2026-08-25 every one of 15 HCPs died with a NameError, db_errors
        # reached 15, and this returned 0 -- the orchestrator recorded the stage as succeeded and
        # only G5's postcheck caught it. A stage that attempted work and wrote nothing did not
        # succeed. Deliberately NOT a partial-failure threshold: what an acceptable error rate is
        # differs per script, and generate_cycle's postcheck already measures that against the
        # target table rather than against a counter the script keeps about itself.
        if total_hcps and not stats["syntheses_written"]:
            print(
                f"\n[FAIL] 0 of {total_hcps} syntheses written "
                f"({stats['api_errors']} API errors, {stats['db_errors']} DB errors).",
                file=sys.stderr,
            )
            return 1
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
