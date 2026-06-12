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

import anthropic
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"
MODEL_NAME = "claude-sonnet-4-6"
MIN_ABSTRACT_LENGTH = 800
MIN_YEAR = 2020
PAPERS_PER_HCP = 10
MAX_POSITIONS_PER_PAPER = 10
ANTHROPIC_MAX_TOKENS = 2000
DRY_RUN_HCP_LIMIT = 3

VALID_POSITION_TYPES = frozenset(
    {
        "positive_position",
        "cautionary_position",
        "unmet_need_position",
        "hypothesis_position",
    }
)

RISING_STAR_HCPS_SQL = """
SELECT hcp_id, 'rising_star' AS cohort, us_rank AS rank_position
FROM hcp_rising_star_ranks_v3
WHERE therapeutic_area_id = %s
  AND us_rank <= 100
ORDER BY us_rank
"""

ESTABLISHED_HCPS_SQL = """
SELECT hcp_id, 'established' AS cohort, rank AS rank_position
FROM hcp_established_ranks_v3
WHERE therapeutic_area_id = %s
  AND scope_type = 'region'
  AND scope_value = 'US'
  AND rank <= 100
ORDER BY rank
"""

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

INSERT_POSITION_SQL = """
INSERT INTO hcp_scientific_positions_v1 (
  publication_id,
  hcp_id,
  therapeutic_area_id,
  author_role,
  position_type,
  drug_name,
  drug_class,
  biomarker,
  disease_context,
  position_text,
  evidence_excerpt,
  confidence,
  model_name
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

PROMPT_TEMPLATE = """You are a medical affairs scientific positioning analyst. Read the publication passage below and extract scientific positions the author is advancing through this work. A position is a claim, hypothesis, concern, or unmet need the author is advocating, asserting, or flagging.

CONTEXT
Therapeutic area: NSCLC
Title: {title}
Year: {pub_year}
Journal: {journal}
Author role on this paper: {author_role}
Passage (abstract):
{abstract}

TASK
Extract up to 10 scientific positions. Each must be directly supported by the passage. Do not infer beyond the text. Do not treat drug mentions as positive positions without explicit benefit evidence.

POSITION TYPES
- positive_position: efficacy, safety, favorable outcome, or favorable positioning claim
- cautionary_position: toxicity, resistance, lack of benefit, uncertainty, evidence gaps
- unmet_need_position: explicit or implied need (better sequencing, resistance strategies, selection, access)
- hypothesis_position: a mechanistic or clinical hypothesis the author is advancing

OUTPUT
Return valid JSON only with this exact shape:
{{
  "positions": [
    {{
      "position_type": "positive_position",
      "drug_name": "drug name or null",
      "drug_class": "class or null",
      "biomarker": "biomarker or null",
      "disease_context": "specific subtype/setting or null",
      "position_text": "one-sentence paraphrase of the position",
      "evidence_excerpt": "exact excerpt from passage, max 30 words",
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
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def get_db_connection() -> psycopg2.extensions.connection:
    host = get_required_env("SUPABASE_DB_HOST")
    user = get_required_env("SUPABASE_DB_USER")
    password = get_required_env("SUPABASE_DB_PASSWORD")
    port = int(os.getenv("SUPABASE_DB_PORT", "5432"))
    dbname = os.getenv("SUPABASE_DB_NAME", "postgres")
    return psycopg2.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password,
    )


def get_target_hcps(
    conn: psycopg2.extensions.connection,
    cohort: str,
    limit: int,
) -> list[dict[str, Any]]:
    hcps: list[dict[str, Any]] = []
    seen: set[str] = set()

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if cohort in ("rising_star", "both"):
            cur.execute(RISING_STAR_HCPS_SQL, (NSCLC_TA_ID,))
            for row in cur.fetchall():
                hcp_id = str(row["hcp_id"])
                if hcp_id not in seen:
                    seen.add(hcp_id)
                    hcps.append(dict(row))

        if cohort in ("established", "both"):
            cur.execute(ESTABLISHED_HCPS_SQL, (NSCLC_TA_ID,))
            for row in cur.fetchall():
                hcp_id = str(row["hcp_id"])
                if hcp_id not in seen:
                    seen.add(hcp_id)
                    hcps.append(dict(row))

    return hcps[:limit]


def get_top_papers_for_hcp(
    conn: psycopg2.extensions.connection,
    hcp_id: str,
) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            TOP_PAPERS_SQL,
            (hcp_id, MIN_YEAR, MIN_ABSTRACT_LENGTH, PAPERS_PER_HCP),
        )
        return [dict(row) for row in cur.fetchall()]


def build_extraction_prompt(
    paper: dict[str, Any],
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
    positions: list[dict[str, Any]],
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

            cur.execute(
                INSERT_POSITION_SQL,
                (
                    pub_id,
                    hcp_id,
                    NSCLC_TA_ID,
                    author_role,
                    position_type,
                    normalize_optional_text(pos.get("drug_name")),
                    normalize_optional_text(pos.get("drug_class")),
                    normalize_optional_text(pos.get("biomarker")),
                    normalize_optional_text(pos.get("disease_context")),
                    position_text,
                    evidence_excerpt,
                    confidence,
                    MODEL_NAME,
                ),
            )
            written += 1
    return written


def main() -> int:
    load_dotenv()
    args = parse_args()

    effective_limit = args.limit
    if args.dry_run:
        effective_limit = min(DRY_RUN_HCP_LIMIT, args.limit)

    api_key = get_required_env("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key, timeout=120.0)

    conn = get_db_connection()
    conn.autocommit = False

    stats = {
        "hcps_processed": 0,
        "papers_processed": 0,
        "positions_extracted": 0,
        "positions_by_type": Counter(),
        "api_errors": 0,
    }

    try:
        target_hcps = get_target_hcps(conn, args.cohort, effective_limit)
        total_hcps = len(target_hcps)
        print(f"Loaded {total_hcps} target HCPs (cohort={args.cohort}, limit={effective_limit})")

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
                papers = get_top_papers_for_hcp(conn, hcp_id)
            except Exception as exc:
                print(
                    f"[ERROR] HCP {hcp_id} ({cohort}, rank {rank_position}): "
                    f"failed to load papers: {exc}",
                    file=sys.stderr,
                )
                continue

            for paper in papers:
                pub_id = str(paper["pub_id"])
                author_role = paper.get("author_role") or "first_author"
                stats["papers_processed"] += 1

                try:
                    prompt = build_extraction_prompt(paper)
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
                    written = write_positions(conn, hcp_id, pub_id, author_role, positions)
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

        if args.dry_run:
            print("\nDry run complete - no database writes.")

        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
