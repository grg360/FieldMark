#!/usr/bin/env python3
"""
Backfill hcp_scientific_positions_v1 for Top 100 US Rising Star and
Top 100 US Established NSCLC HCPs.

Usage:
    python scripts/extract_scientific_positions.py
    python scripts/extract_scientific_positions.py --dry-run
    python scripts/extract_scientific_positions.py --limit 50 --cohort rising_star
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

# TA uuids are no longer constants here -- see the note above TA_CONFIGS.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta  # noqa: E402
MODEL_NAME = "claude-sonnet-4-6"
MIN_ABSTRACT_LENGTH = 800
MIN_YEAR = 2020
PAPERS_PER_HCP = 10
MAX_POSITIONS_PER_PAPER = 10
# QUOTA REMOVED (2026-08-19). The prompt previously said "Extract up to 5", and the
# model returned EXACTLY 5 on 51 of 51 papers, twice -- 255 positions both runs, stdev
# 0.00. It was a quota, not a ceiling: a 3,455-char Lancet Oncology trial report and an
# 850-char German-language review both yielded five. Removing the target moved total
# volume by -4 (251 vs 255) but took per-paper spread from 0.00 to 1.03 (range 3-8), so
# the extractor can now say "this abstract has little to offer". Cost and groundedness
# unchanged ($0.99 vs $1.01; ~100% of excerpts verbatim in the abstract).
#
# This is justified on expressiveness ALONE. A same-prompt test-retest on these 51
# papers disagreed with itself on 40% of positions, and every recurrence-density gain
# first attributed to this change sat inside that noise band. Do not cite recurrence as
# a reason for this edit.
ANTHROPIC_MAX_TOKENS = 2000
DRY_RUN_HCP_LIMIT = 3

# Token accounting. response.usage was previously read and discarded, which left
# every question about this run's cost answerable only by estimate. Accumulated at
# module scope so call_anthropic keeps its single-return-value shape and no call
# site has to change.
USAGE = {"calls": 0, "input_tokens": 0, "output_tokens": 0}

# Per-TA config. The nsclc entry reproduces the original prompt text verbatim so
# its rendered prompt is byte-for-byte identical; non-NSCLC TAs use TA-neutral
# teaching exemplars so extraction is not biased toward NSCLC drugs/biomarkers.
# TA UUIDs REMOVED FROM THIS DICT (2026-08-27). They were hardcoded here, again in
# generate_scientific_position_synthesis, and again in extract_research_themes -- three copies
# of the same three constants, none of which the database knows about. The id is now resolved
# at USE time via scripts/utils/ta_registry.
#
# RESOLVED AT USE TIME, NOT AT IMPORT, deliberately: this dict is built at module scope, so
# calling the resolver here would make merely importing the module open a database connection.
# generate_cycle imports extract_research_themes for its TA_CONFIGS precisely because that
# module has no import-time side effects; the same property is worth keeping here.
#
# What remains in the dict is what is genuinely per-script: the prompt fragments.
TA_CONFIGS: dict[str, dict[str, str]] = {
    "nsclc": {
        "label": "NSCLC",
        "finding_position_example": (
            '- Finding (avoid): "Median TTD was 13.2 vs 7.5 months."\n'
            '- Position (extract): "The durable TTD and TTST advantage supports '
            'amivantamab-chemotherapy as the first-line standard of care."'
        ),
        "biomarker_examples": "PD-L1, mutation status, ctDNA, molecular markers",
    },
    "atopic-dermatitis": {
        "label": "atopic dermatitis",
        "finding_position_example": (
            '- Finding (avoid): "The active arm achieved a higher response rate '
            'than the comparator at the primary endpoint."\n'
            '- Position (extract): "The magnitude and durability of the response '
            'support this approach as a preferred option for the target patient '
            'population."'
        ),
        "biomarker_examples": (
            "disease-relevant molecular or serologic markers, expression or "
            "mutation status, biomarker levels"
        ),
    },
    "colorectal-cancer": {
        "label": "colorectal cancer",
        # TA-NEUTRAL, following the atopic-dermatitis entry rather than nsclc's. The
        # nsclc exemplar names a real drug and a real endpoint pair ("amivantamab-
        # chemotherapy", "TTD and TTST"), which is safe there because it reproduces the
        # original prompt verbatim, but as a template it teaches the model which answers
        # the TA is supposed to produce. These teach the finding-vs-position DISTINCTION
        # without asserting any CRC biology.
        "finding_position_example": (
            '- Finding (avoid): "The experimental arm showed longer progression-free '
            'survival than the control arm."\n'
            '- Position (extract): "The size and durability of the benefit justify '
            'this regimen as a preferred option for the biomarker-defined subgroup."'
        ),
        "biomarker_examples": (
            "disease-relevant molecular or serologic markers, mismatch-repair or "
            "microsatellite status, mutation status, ctDNA"
        ),
    },
}
DEFAULT_TA = "nsclc"

VALID_POSITION_TYPES = frozenset(
    {
        "positive_position",
        "cautionary_position",
        "unmet_need_position",
        "hypothesis_position",
    }
)

VALID_POSITION_CATEGORIES = frozenset(
    {
        "efficacy",
        "patient_selection",
        "biomarker",
        "safety",
        "resistance",
        "sequencing",
        "access",
        "diagnostics",
        "methodology",
    }
)

RISING_STAR_HCPS_SQL = """
SELECT hcp_id, 'rising_star' AS cohort, us_rank AS rank_position
FROM hcp_rising_star_ranks_v3 r
WHERE therapeutic_area_id = %s
  AND us_rank <= 100
  {skip_existing}
ORDER BY us_rank
"""

# GLOBAL IS THE DEFAULT (2026-08-18), mirroring the narrative selector repoint of
# the same day. The Established ledger gained a Global territory scope on 08-17,
# and the global board's own top ranks are what every surface renders -- so the
# default cut here is the global top 200, not a per-country one.
#
# WHY THIS MATTERS FOR SIZING: the region SQL below is `rank <= 200` PER COUNTRY,
# so `--scope-value CN JP KR TW AU HK SG` selects 1,159 HCPs, of which only 78 sit
# in the global top 200. The two cuts are not interchangeable and the region one
# is ~15x larger. Positions are the substrate the Established narrative prompt
# reads, so the cut here must match the cut the narrative selector uses.
ESTABLISHED_HCPS_GLOBAL_SQL = """
SELECT hcp_id, 'established' AS cohort, rank AS rank_position
FROM hcp_established_ranks_v3 e
WHERE therapeutic_area_id = %s
  AND scope_type = 'global'
  AND scope_value IS NULL
  AND rank <= 200
  {skip_existing}
ORDER BY rank
"""

# REGION PATH RETAINED. --scope-value still selects per-country top 200 and is
# byte-identical to its pre-08-18 behaviour; it is how the US and Europe passes
# were run and stays reproducible. It is now opt-in rather than required.
# ANY() so one invocation can cover a multi-country region; a single value is
# exactly equivalent to the old 'US' literal. Placeholder order matters -- see
# get_target_hcps.build(), which threads params positionally.
ESTABLISHED_HCPS_SQL = """
SELECT hcp_id, 'established' AS cohort, rank AS rank_position
FROM hcp_established_ranks_v3 e
WHERE therapeutic_area_id = %s
  AND scope_type = 'region'
  AND scope_value = ANY(%s)
  AND rank <= 200
  {skip_existing}
ORDER BY rank
"""

# When --skip-existing is set, exclude HCPs that already have any position row
# for this TA, so a re-run only processes the not-yet-covered HCPs (e.g. the
# established rank 101-200 tail after the top-100 was already extracted). The
# {alias} is the ranks-table alias so the correlation targets the OUTER row, not
# the subquery's own hcp_id column. Adds one %s (ta_id) per use.
SKIP_EXISTING_CLAUSE = """AND NOT EXISTS (
    SELECT 1 FROM hcp_scientific_positions_v1 sp
    WHERE sp.hcp_id = {alias}.hcp_id
      AND sp.therapeutic_area_id = %s
  )"""

# TA SCOPING (2026-08-14). This query previously joined only publications_v2 and
# publication_authors_v2, so it selected an HCP's top-cited papers with NO regard
# for therapeutic area -- a hepatology paper would be chosen over a lung one if it
# out-cited it. The join below scopes selection to the TA, and NOT is_excluded
# drops associations the corpus has marked as belonging elsewhere (mesothelioma,
# see migrations/2026_08_14_mesothelioma_corpus_separation.sql).
#
# Both conditions are needed. The positive join alone would NOT have removed
# mesothelioma: those papers were correctly NSCLC-tagged by the ingest query's own
# rules. Selection-side only -- this changes which papers positions are extracted
# from, and touches no score.
TOP_PAPERS_SQL = """
WITH ranked AS (
  SELECT
    p.id AS pub_id,
    p.title,
    p.abstract,
    p.pub_year,
    p.citation_count,
    p.journal,
    pa.is_first_author,
    pa.is_senior_author,
    row_number() OVER (
      PARTITION BY pa.hcp_id
      ORDER BY p.citation_count DESC NULLS LAST, p.pub_year DESC
    ) AS rn
  FROM publications_v2 p
  JOIN publication_authors_v2 pa ON pa.publication_id = p.id
  JOIN publication_therapeutic_areas_v2 pta
    ON pta.publication_id = p.id
   AND pta.therapeutic_area_id = %s
   AND NOT pta.is_excluded
  WHERE pa.hcp_id = %s
    AND p.pub_year >= %s
    AND length(coalesce(p.abstract, '')) >= %s
    AND (pa.is_senior_author = true OR pa.is_first_author = true)
)
SELECT
  pub_id,
  title,
  abstract,
  pub_year,
  citation_count,
  journal,
  CASE
    WHEN is_senior_author THEN 'senior_author'
    ELSE 'first_author'
  END AS author_role
FROM ranked
WHERE rn <= %s
ORDER BY rn
"""

DELETE_POSITIONS_FOR_HCP_TA_SQL = (
    "DELETE FROM hcp_scientific_positions_v1 "
    "WHERE hcp_id = %s AND therapeutic_area_id = %s"
)

INSERT_POSITION_SQL = """
INSERT INTO hcp_scientific_positions_v1 (
  publication_id,
  hcp_id,
  therapeutic_area_id,
  author_role,
  position_type,
  position_category,
  drug_name,
  drug_class,
  biomarker,
  disease_context,
  position_text,
  evidence_excerpt,
  confidence,
  model_name,
  pub_year,
  citation_count
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

PROMPT_TEMPLATE = """You are a medical affairs scientific positioning analyst. Read the publication passage below and extract scientific positions the author is advancing through this work. A position is a claim, hypothesis, concern, or unmet need the author is advocating, asserting, or flagging.

CONTEXT
Therapeutic area: {ta_label}
Title: {title}
Year: {pub_year}
Journal: {journal}
Author role on this paper: {author_role}
Passage (abstract):
{abstract}

TASK
Extract the distinct, high-value scientific positions this passage genuinely advances. There is no target number. Many abstracts support only two or three; some support none at all. Do not pad the list to reach a count - a short list of well-grounded positions is more useful than a longer padded one. Extract at most 10. A position should help an MSL understand the author's scientific stance, treatment philosophy, patient-selection view, safety concern, biomarker perspective, resistance concern, or unmet-need framing.

Prefer positions that reflect the author's interpretation, clinical implication, treatment philosophy, or future direction. Do not extract bare findings (what the study measured or reported) unless they directly support a broader scientific position the author is advancing.

A finding states what happened. A position states what it means or what should be done about it. Examples:
{finding_position_example}

Do not exhaustively list every endpoint. Consolidate related endpoint findings into one position when they support the same scientific point.

Do not create multiple positions from the same evidence excerpt. If one observation could fit multiple position types, choose the single best type.

The evidence_excerpt must come from the abstract body, not the title or metadata.

POSITION TYPES (polarity)
- positive_position: efficacy, safety, favorable outcome, or favorable positioning claim
- cautionary_position: toxicity, resistance, lack of benefit, uncertainty, evidence gaps
- unmet_need_position: explicit or implied need (better sequencing, resistance strategies, selection, access)
- hypothesis_position: a mechanistic or clinical hypothesis the author is advancing

POSITION CATEGORIES (subject matter, pick the single best fit)
- efficacy: treatment effect, response, survival, outcomes
- patient_selection: who should receive treatment, stratification, eligibility
- biomarker: {biomarker_examples}
- safety: toxicity, adverse events, tolerability
- resistance: acquired or primary resistance mechanisms and patterns
- sequencing: order or line of therapy, treatment pathway
- access: availability, cost, real-world utilization, disparities
- diagnostics: testing methodology, specimen type, assay validity
- methodology: trial design, statistical approach, study methodology

OUTPUT
Return valid JSON only with this exact shape:
{{
  "positions": [
    {{
      "position_type": "positive_position",
      "position_category": "efficacy",
      "drug_name": "drug name or null",
      "drug_class": "class or null",
      "biomarker": "biomarker or null",
      "disease_context": "specific subtype/setting or null",
      "position_text": "one-sentence paraphrase of the position",
      "evidence_excerpt": "exact excerpt from abstract body, max 30 words",
      "confidence": 0.0
    }}
  ]
}}

RULES
- Conservative language. Use "suggests", "associated with", "may" when the passage does.
- Positions must be grounded in this passage.
- If the passage contains no extractable positions, return {{"positions": []}}.
- Return JSON only. No preamble. No markdown fences.
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract scientific positions from NSCLC publications into hcp_scientific_positions_v1."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process 3 HCPs, print prompts and parsed JSON, no DB writes.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Maximum total HCPs to process (default: 200).",
    )
    parser.add_argument(
        "--cohort",
        choices=("rising_star", "established", "both"),
        default="both",
        help="Which cohort(s) to process (default: both).",
    )
    parser.add_argument(
        "--scope-value",
        nargs="+",
        default=None,
        metavar="CODE",
        help=(
            "OPTIONAL. Omit for the GLOBAL top 200 (the default since 2026-08-18, "
            "matching the narrative selector's cut). Pass country code(s) to use "
            "the per-country region path instead, e.g. --scope-value US, or "
            "--scope-value DE FR GB for a multi-country region -- note that is "
            "top 200 PER COUNTRY, so 7 codes select ~1,159 HCPs, not 200. "
            "Unused by the rising_star selection."
        ),
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
        help="Skip HCPs that already have any position for this TA (only "
        "process not-yet-covered HCPs, e.g. the established rank 101-200 tail).",
    )
    parser.add_argument(
        "--allow-belief-relink-break",
        action="store_true",
        help="Override the belief-link safety guard. Re-extraction DELETEs and "
        "re-INSERTs positions with fresh gen_random_uuid() ids, so every "
        "hcp_scientific_positions_v1.id changes — which silently orphans every "
        "msl_hcp_notes.belief_claim_key (the key is sha256 over those ids). "
        "Pass this ONLY together with a re-key backfill of the affected notes "
        "(see docs/BELIEF_CLAIM_LINK_STABILITY.md). Ignored on --dry-run.",
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


def get_target_hcps(
    conn: psycopg2.extensions.connection,
    cohort: str,
    limit: int,
    ta_id: str,
    skip_existing: bool = False,
    scope_value: list[str] | None = None,
) -> list[dict[str, Any]]:
    hcps: list[dict[str, Any]] = []
    seen: set[str] = set()

    def build(
        sql_template: str, alias: str, mid_params: tuple[Any, ...] = ()
    ) -> tuple[str, tuple[Any, ...]]:
        # mid_params sit between the leading ta_id and the trailing ta_id that
        # SKIP_EXISTING_CLAUSE contributes -- matching placeholder order in the SQL.
        if skip_existing:
            clause = SKIP_EXISTING_CLAUSE.format(alias=alias)
            return sql_template.format(skip_existing=clause), (ta_id, *mid_params, ta_id)
        return sql_template.format(skip_existing=""), (ta_id, *mid_params)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if cohort in ("rising_star", "both"):
            sql, params = build(RISING_STAR_HCPS_SQL, "r")
            cur.execute(sql, params)
            for row in cur.fetchall():
                hcp_id = str(row["hcp_id"])
                if hcp_id not in seen:
                    seen.add(hcp_id)
                    hcps.append(dict(row))

        if cohort in ("established", "both"):
            # GLOBAL BY DEFAULT (2026-08-18). Omitting --scope-value selects the
            # global top 200 -- the same cut the narrative selector now uses, so
            # stage 1 and stage 2 cover the same people. Passing --scope-value
            # keeps the per-country top-200 path (how US and Europe were run).
            if scope_value:
                sql, params = build(ESTABLISHED_HCPS_SQL, "e", (list(scope_value),))
            else:
                sql, params = build(ESTABLISHED_HCPS_GLOBAL_SQL, "e")
            cur.execute(sql, params)
            for row in cur.fetchall():
                hcp_id = str(row["hcp_id"])
                if hcp_id not in seen:
                    seen.add(hcp_id)
                    hcps.append(dict(row))

    return hcps[:limit]


def get_top_papers_for_hcp(
    conn: psycopg2.extensions.connection,
    hcp_id: str,
    ta_id: str,
) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            TOP_PAPERS_SQL,
            (ta_id, hcp_id, MIN_YEAR, MIN_ABSTRACT_LENGTH, PAPERS_PER_HCP),
        )
        return [dict(row) for row in cur.fetchall()]


def build_extraction_prompt(
    paper: dict[str, Any],
    ta: dict[str, str],
    hcp_name_hint: str | None = None,
) -> str:
    title = (paper.get("title") or "").strip()
    abstract = (paper.get("abstract") or "").strip()
    pub_year = paper.get("pub_year") or "unknown"
    journal = (paper.get("journal") or "").strip() or "unknown"
    author_role = paper.get("author_role") or "first_author"
    prompt = PROMPT_TEMPLATE.format(
        title=title,
        pub_year=pub_year,
        journal=journal,
        author_role=author_role,
        abstract=abstract,
        ta_label=ta["label"],
        finding_position_example=ta["finding_position_example"],
        biomarker_examples=ta["biomarker_examples"],
    )
    if hcp_name_hint:
        prompt = f"HCP context: {hcp_name_hint}\n\n{prompt}"
    return prompt


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


def call_anthropic(client: anthropic.Anthropic, prompt: str) -> list[dict[str, Any]]:
    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=ANTHROPIC_MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    USAGE["calls"] += 1
    USAGE["input_tokens"] += int(response.usage.input_tokens)
    USAGE["output_tokens"] += int(response.usage.output_tokens)
    raw_text = extract_response_text(response)
    cleaned = strip_markdown_fences(raw_text)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            print(f"[WARN] Failed to parse Anthropic JSON response: {raw_text[:500]}", file=sys.stderr)
            return []
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            print(f"[WARN] Failed to parse Anthropic JSON response: {raw_text[:500]}", file=sys.stderr)
            return []

    positions = parsed.get("positions") if isinstance(parsed, dict) else None
    if not isinstance(positions, list):
        print(f"[WARN] Anthropic response missing positions array: {raw_text[:500]}", file=sys.stderr)
        return []

    return positions[:MAX_POSITIONS_PER_PAPER]


def normalize_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "null":
        return None
    return text


def normalize_confidence(value: Any) -> float | None:
    if value is None:
        return None
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None
    if confidence < 0.0 or confidence > 1.0:
        return None
    return confidence


def write_positions(
    conn: psycopg2.extensions.connection,
    hcp_id: str,
    pub_id: str,
    author_role: str,
    pub_year: int | None,
    citation_count: int | None,
    positions: list[dict[str, Any]],
    ta_id: str,
) -> int:
    written = 0
    with conn.cursor() as cur:
        for pos in positions:
            if not isinstance(pos, dict):
                continue

            position_type = pos.get("position_type")
            if position_type not in VALID_POSITION_TYPES:
                continue

            position_text = normalize_optional_text(pos.get("position_text"))
            evidence_excerpt = normalize_optional_text(pos.get("evidence_excerpt"))
            if not position_text or not evidence_excerpt:
                continue

            confidence = normalize_confidence(pos.get("confidence"))
            if confidence is None:
                continue

            raw_category = normalize_optional_text(pos.get("position_category"))
            if raw_category is not None and raw_category not in VALID_POSITION_CATEGORIES:
                raw_category = None

            cur.execute(
                INSERT_POSITION_SQL,
                (
                    pub_id,
                    hcp_id,
                    ta_id,
                    author_role,
                    position_type,
                    raw_category,
                    normalize_optional_text(pos.get("drug_name")),
                    normalize_optional_text(pos.get("drug_class")),
                    normalize_optional_text(pos.get("biomarker")),
                    normalize_optional_text(pos.get("disease_context")),
                    position_text,
                    evidence_excerpt,
                    confidence,
                    MODEL_NAME,
                    pub_year,
                    citation_count,
                ),
            )
            written += 1
    return written


def main() -> int:
    load_dotenv()
    args = parse_args()
    ta = TA_CONFIGS[args.ta]
    ta_id = resolve_ta(args.ta).id

    effective_limit = args.limit
    if args.dry_run:
        effective_limit = min(DRY_RUN_HCP_LIMIT, args.limit)

    api_key = get_required_env("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key, timeout=120.0)

    conn = get_db_connection()
    conn.autocommit = False

    # Belief-link safety guard. This script DELETEs and re-INSERTs each processed
    # HCP's positions (idempotency, below), and the INSERT does not supply id, so
    # every hcp_scientific_positions_v1.id is regenerated (gen_random_uuid). The
    # field-insight → belief-position link keys on those ids
    # (msl_hcp_notes.belief_claim_key = sha256 over them), so a re-extraction
    # SILENTLY orphans every belief link — including the 75 seeded links on the
    # demo path. Refuse unless explicitly overridden. --dry-run writes nothing, so
    # it is exempt; --skip-existing only processes not-yet-covered HCPs and never
    # DELETEs an existing (keyed) HCP's positions, so it is exempt too.
    if not args.dry_run and not args.skip_existing and not args.allow_belief_relink_break:
        with conn.cursor() as _cur:
            _cur.execute(
                "SELECT count(*) FROM msl_hcp_notes "
                "WHERE belief_claim_key IS NOT NULL AND deleted_at IS NULL"
            )
            keyed = int(_cur.fetchone()[0] or 0)
        if keyed > 0:
            print(
                f"[GUARD] Refusing to run: {keyed} field insight(s) carry a "
                "belief_claim_key that hashes hcp_scientific_positions_v1.id. A full "
                "re-extraction regenerates those ids and SILENTLY breaks every one "
                "of those links (the demo path included).\n"
                "  • To EXTEND coverage without touching existing positions, use "
                "--skip-existing (safe, exempt).\n"
                "  • To re-extract anyway, pass --allow-belief-relink-break AND run "
                "a re-key backfill of the affected notes afterward "
                "(docs/BELIEF_CLAIM_LINK_STABILITY.md).\n"
                "  • --dry-run is always safe (no writes).",
                file=sys.stderr,
            )
            conn.close()
            return 1

    stats = {
        "hcps_processed": 0,
        "papers_processed": 0,
        "positions_extracted": 0,
        "positions_by_type": Counter(),
        "api_errors": 0,
    }

    try:
        target_hcps = get_target_hcps(
            conn, args.cohort, effective_limit, ta_id, args.skip_existing,
            args.scope_value,
        )
        total_hcps = len(target_hcps)
        print(
            f"Loaded {total_hcps} target HCPs "
            f"(ta={args.ta}, cohort={args.cohort}, limit={effective_limit}, "
            f"scope={','.join(args.scope_value) + ' (region top-200 per country)' if args.scope_value else 'GLOBAL top-200'}, "
            f"skip_existing={args.skip_existing})"
        )

        if total_hcps == 0:
            print("No HCPs to process.")
            return 0

        for idx, hcp in enumerate(target_hcps, start=1):
            hcp_id = str(hcp["hcp_id"])
            cohort = hcp.get("cohort", "unknown")
            rank_position = hcp.get("rank_position")
            hcp_positions = 0
            papers = []

            try:
                papers = get_top_papers_for_hcp(conn, hcp_id, ta_id)
            except Exception as exc:
                print(
                    f"[ERROR] HCP {hcp_id} ({cohort}, rank {rank_position}): "
                    f"failed to load papers: {exc}",
                    file=sys.stderr,
                )
                continue

            # Idempotency: clear this HCP's existing positions for the TA before
            # re-inserting, so re-runs replace rather than duplicate. Same
            # transaction as the inserts below (committed per HCP).
            if not args.dry_run:
                try:
                    with conn.cursor() as cur:
                        cur.execute(DELETE_POSITIONS_FOR_HCP_TA_SQL, (hcp_id, ta_id))
                except Exception as exc:
                    print(
                        f"[ERROR] Failed to clear existing positions for HCP {hcp_id}: {exc}",
                        file=sys.stderr,
                    )
                    conn.rollback()
                    continue

            for paper in papers:
                pub_id = str(paper["pub_id"])
                author_role = paper.get("author_role") or "first_author"
                stats["papers_processed"] += 1

                try:
                    prompt = build_extraction_prompt(paper, ta)
                    if args.dry_run:
                        print(f"\n=== DRY RUN: HCP {hcp_id} paper {pub_id} ===")
                        print("--- PROMPT ---")
                        print(prompt)
                        positions = call_anthropic(client, prompt)
                        print("--- PARSED JSON ---")
                        print(json.dumps({"positions": positions}, indent=2))
                    else:
                        positions = call_anthropic(client, prompt)
                except Exception as exc:
                    stats["api_errors"] += 1
                    print(
                        f"[ERROR] Anthropic API failed for HCP {hcp_id}, pub {pub_id}: {exc}",
                        file=sys.stderr,
                    )
                    continue

                for pos in positions:
                    if isinstance(pos, dict) and pos.get("position_type") in VALID_POSITION_TYPES:
                        stats["positions_by_type"][str(pos["position_type"])] += 1

                if args.dry_run:
                    hcp_positions += len(positions)
                    continue

                try:
                    written = write_positions(
                        conn,
                        hcp_id,
                        pub_id,
                        author_role,
                        paper.get("pub_year"),
                        paper.get("citation_count"),
                        positions,
                        ta_id,
                    )
                    hcp_positions += written
                    stats["positions_extracted"] += written
                except Exception as exc:
                    print(
                        f"[ERROR] DB write failed for HCP {hcp_id}, pub {pub_id}: {exc}",
                        file=sys.stderr,
                    )
                    conn.rollback()
                    continue

            if not args.dry_run:
                try:
                    conn.commit()
                except Exception as exc:
                    print(
                        f"[ERROR] Commit failed for HCP {hcp_id}: {exc}",
                        file=sys.stderr,
                    )
                    conn.rollback()

            stats["hcps_processed"] += 1
            print(
                f"[HCP {idx}/{total_hcps}] processing {hcp_id} "
                f"({cohort}, rank {rank_position}): "
                f"{len(papers)} papers, {hcp_positions} positions extracted"
            )

        print("\n=== Summary ===")
        print(f"Total HCPs processed: {stats['hcps_processed']}")
        print(f"Total papers processed: {stats['papers_processed']}")
        print(f"Total positions extracted: {stats['positions_extracted']}")
        print("Total positions by type:")
        for position_type, count in sorted(stats["positions_by_type"].items()):
            print(f"  {position_type}: {count}")
        print(f"API errors: {stats['api_errors']}")
        if USAGE["calls"]:
            print(
                f"Token usage: {USAGE['input_tokens']:,} in / "
                f"{USAGE['output_tokens']:,} out over {USAGE['calls']:,} calls "
                f"({USAGE['input_tokens'] // USAGE['calls']:,} in / "
                f"{USAGE['output_tokens'] // USAGE['calls']:,} out per call)"
            )

        if args.dry_run:
            print("\nDry run complete - no database writes.")
            return 0

        # ALL-FAILED RULE (see the same guard in generate_scientific_position_synthesis.py).
        # positions_extracted is incremented only on the write path, so it is the honest
        # "succeeded" signal here. Not a partial-failure threshold: some HCPs legitimately
        # yield no positions, and only ZERO across an attempted run is unambiguous.
        if stats["hcps_processed"] and not stats["positions_extracted"]:
            print(
                f"\n[FAIL] 0 positions written across {stats['hcps_processed']} HCPs "
                f"({stats['api_errors']} API errors).",
                file=sys.stderr,
            )
            return 1
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
