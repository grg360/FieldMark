"""
extract_research_themes.py - Extract per-HCP research themes by TA via Claude API.

Themes are derived from recent first/senior author publications and written to
hcp_research_themes_v2. The TA is selected with --ta (default: nsclc); each TA
supplies its own cohort selection, written tag, and TA-neutral prompt fragments
via TA_CONFIGS. Delete/exists are (hcp_id, therapeutic_area)-scoped so a run for
one TA can never touch another TA's rows for a dual-TA HCP.

Required environment variables:
- DATABASE_URL (port 5432 direct connection)
- ANTHROPIC_API_KEY

Usage:
    python extract_research_themes.py --dry-run                                   # nsclc (default)
    python extract_research_themes.py --ta atopic-dermatitis --scope us --dry-run
    python extract_research_themes.py --ta atopic-dermatitis --scope us
    python extract_research_themes.py --force
    python extract_research_themes.py --limit 100
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import anthropic
import httpx
import psycopg
from anthropic import APIConnectionError, APIStatusError, APITimeoutError
from dotenv import load_dotenv
from psycopg.rows import dict_row

# On Windows the console defaults to cp1252, which crashes on Unicode-hyphen
# (U+2010) and other non-Latin characters in HCP names during the dry-run print.
# Force UTF-8 on stdout/stderr so sample output can't crash the run.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8192
MIN_REQUEST_INTERVAL_SEC = 1.0
MAX_RETRIES = 3
DRY_RUN_HCP_LIMIT = 10
INPUT_USD_PER_M = 3.0
OUTPUT_USD_PER_M = 15.0

# System prompt is per-TA via {domain}. For nsclc (domain="NSCLC") this renders
# byte-identical to the original hardcoded string.
SYSTEM_PROMPT_TEMPLATE = (
    "You analyze {domain} research output to identify thematic focus areas of individual "
    "investigators. You return structured JSON only - no preamble, no explanation, "
    "no markdown code fences."
)

# Selection SQL is per-TA because the cohort differs (NSCLC=Rising-US, AD=Established).
# All variants take a single %s = ta_id and return the same column shape (the rank
# column is aliased so downstream code never reads it by name).
TARGET_HCPS_SQL_NSCLC_RISING_US = """
SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.us_rank
FROM hcps_v2 h
JOIN hcp_rising_star_ranks_v3 r ON r.hcp_id = h.id
WHERE r.therapeutic_area_id = %(ta_id)s
  AND h.current_country = 'US'
  AND r.us_rank IS NOT NULL
ORDER BY r.us_rank ASC
"""

TARGET_HCPS_SQL_ESTABLISHED_REGION = """
SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.rank
FROM hcps_v2 h
JOIN hcp_established_ranks_v3 r ON r.hcp_id = h.id
WHERE r.therapeutic_area_id = %(ta_id)s
  AND r.scope_type = 'region' AND r.scope_value = ANY(%(scope_value)s)
ORDER BY r.rank ASC
"""

TARGET_HCPS_SQL_ESTABLISHED_GLOBAL = """
SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.rank
FROM hcps_v2 h
JOIN hcp_established_ranks_v3 r ON r.hcp_id = h.id
WHERE r.therapeutic_area_id = %(ta_id)s
  AND r.scope_type = 'global'
ORDER BY r.rank ASC
"""

# AD rising cohort, global scope (2-axis composite model). Same 5-column shape as
# the established SQL above (id, names, institution, rank) so fetch_target_hcps and
# the dry-run print are unchanged; rank is scope-local composite rank.
TARGET_HCPS_SQL_RISING_COMPOSITE_GLOBAL = """
SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.rank
FROM hcps_v2 h
JOIN hcp_rising_composite_v1 r ON r.hcp_id = h.id
WHERE r.therapeutic_area_id = %(ta_id)s
  AND r.scope_type = 'global'
ORDER BY r.rank ASC
"""

# Momentum-model rising board, ALL COUNTRIES, ordered by global rank.
#
# NOT the NSCLC rising SQL. That one carries `h.current_country = 'US' AND r.us_rank IS
# NOT NULL`, which made sense against a board of ~1,588 with ~1,064 US-ranked members.
# Applied to a small board it is destructive: CRC's rising board is 140 members across
# 29 countries, of which only 21 hold a us_rank -- an 85% cut, and the survivors are not
# the strongest, merely the American ones. Ordering by r.rank keeps the board's own
# ranking rather than a country-local one.
TARGET_HCPS_SQL_RISING_ALL_COUNTRIES = """
SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.rank
FROM hcps_v2 h
JOIN hcp_rising_star_ranks_v3 r ON r.hcp_id = h.id
WHERE r.therapeutic_area_id = %(ta_id)s
ORDER BY r.rank ASC
"""

# Established global board, TOP 200 ONLY.
#
# THE LIMIT IS THE POINT. The unbounded TARGET_HCPS_SQL_ESTABLISHED_GLOBAL above is
# whole-board: for CRC that is 24,735 HCPs, i.e. 24,735 billed calls from one flag.
# 200 matches the cap the narrative generator already applies to the established arm
# (ESTABLISHED_DEFAULT_TOP_N = 100, raised to 200 by the cycle), so the themes and the
# narratives cover the same people instead of one silently exceeding the other.
TARGET_HCPS_SQL_ESTABLISHED_GLOBAL_TOP200 = """
SELECT DISTINCT h.id, h.first_name, h.last_name, h.institution_normalized, r.rank
FROM hcps_v2 h
JOIN hcp_established_ranks_v3 r ON r.hcp_id = h.id
WHERE r.therapeutic_area_id = %(ta_id)s
  AND r.scope_type = 'global'
ORDER BY r.rank ASC
LIMIT 200
"""

# Per-TA config. The nsclc entry reproduces the original prompt text and
# NSCLC-Rising-US selection verbatim (byte-identical rendered prompts, identical
# selected HCP set). Non-NSCLC TAs supply their own cohort scoping, tag, and
# TA-neutral prompt fragments.
#   tag              -> therapeutic_area TEXT write value + delete/exists scope
#   domain           -> prompt framing (renders into SYSTEM_PROMPT + user prompt)
#   generic_negative -> the "NOT generic categories like ..." example
#   theme_examples   -> the "e.g., ..." specific-theme exemplars
#   selection        -> {scope_slug: SQL}; the run's --scope keys into this
#   default_scope    -> scope used when --scope is omitted
TA_CONFIGS = {
    "nsclc": {
        "tag": "NSCLC",
        "domain": "NSCLC",
        "generic_negative": "'lung cancer'",
        "theme_examples": (
            "'EGFR-mutant resistance mechanisms' or "
            "'CNS-active TKIs for brain metastases'"
        ),
        "selection": {"rising": TARGET_HCPS_SQL_NSCLC_RISING_US},
        "default_scope": "rising",
    },
    "atopic-dermatitis": {
        "tag": "Atopic Dermatitis",
        "domain": "atopic dermatitis",
        "generic_negative": "'atopic dermatitis'",
        # TA-neutral: teaches "specific, not generic" without asserting any
        # drug/mechanism. The model extracts real themes from the abstracts.
        "theme_examples": (
            "'a specific signaling-pathway focus' or "
            "'a defined patient-selection strategy'"
        ),
        "selection": {
            "region": TARGET_HCPS_SQL_ESTABLISHED_REGION,
            "global": TARGET_HCPS_SQL_ESTABLISHED_GLOBAL,
            "rising-global": TARGET_HCPS_SQL_RISING_COMPOSITE_GLOBAL,
        },
        "default_scope": "region",
    },
    "colorectal-cancer": {
        # TAG IS SLUG.UPPER() DELIBERATELY, AND IT IS A WORKAROUND, NOT A RESOLUTION.
        #
        # Two writers derive this key by different rules. THIS script writes whatever
        # literal sits here into hcp_research_themes_v2.therapeutic_area. bucket_themes.py
        # independently computes `ta_upper = ta.upper()` and looks for that, raising
        # "No themes found for therapeutic_area=..." on anything else. The two agree only
        # where tag happens to equal SLUG.UPPER() -- true for nsclc by coincidence
        # ('nsclc'.upper() == 'NSCLC' == tag), false for atopic-dermatitis, whose tag is
        # 'Atopic Dermatitis' while bucket_themes hunts 'ATOPIC-DERMATITIS'. That mismatch
        # is why AD has 3,499 rows in hcp_research_themes_v2 and ZERO in theme_canonical_v1:
        # billed extraction that has never been bucketed, in a shipped TA.
        #
        # 'COLORECTAL-CANCER' is the only value that satisfies both derivations with no
        # code change. It also bakes a fourth spelling into a column that already holds
        # 'NSCLC' and 'Atopic Dermatitis', so it makes the underlying inconsistency worse
        # while making this TA work.
        #
        # THE REAL FIX is for bucket_themes.py to read TA_CONFIGS[slug]["tag"] from this
        # dict -- the same source this script writes from -- instead of computing
        # ta.upper() independently. That is a small change, it retires the class, and it
        # is the only thing that also unorphans AD's rows. Until it lands, every new TA
        # must spell its tag SLUG.UPPER() or hit the same wall.
        "tag": "COLORECTAL-CANCER",
        "domain": "colorectal cancer",
        "generic_negative": "'colorectal cancer'",
        # TA-NEUTRAL, following AD rather than NSCLC. NSCLC's exemplars name real
        # mechanisms ('EGFR-mutant resistance mechanisms'), which reads as helpful and is
        # actually a thumb on the scale: it tells the model which themes this TA is
        # "supposed" to have before it has read a single abstract. These teach the SHAPE of
        # a specific theme without asserting any CRC biology, so what comes back is what
        # the corpus says rather than what the prompt suggested.
        "theme_examples": (
            "'a specific molecular-subtype focus' or "
            "'a defined treatment-sequencing question'"
        ),
        "selection": {
            # 140 HCPs. All countries -- see TARGET_HCPS_SQL_RISING_ALL_COUNTRIES for why
            # the NSCLC US-only predicate would cut this to 21.
            "rising": TARGET_HCPS_SQL_RISING_ALL_COUNTRIES,
            # 200 HCPs, capped. The uncapped established global board is 24,735.
            "global-200": TARGET_HCPS_SQL_ESTABLISHED_GLOBAL_TOP200,
        },
        # THE DEFAULT IS THE CHEAP ONE, ON PURPose. --ta is the only required flag and
        # --scope defaults to this, so an invocation that forgets --scope costs 140 calls,
        # not 24,735. The expensive scope must be asked for by name.
        "default_scope": "rising",
    },
}
DEFAULT_TA = "nsclc"

PAPERS_SQL = """
SELECT
  p.id,
  p.pubmed_id,
  p.title,
  p.abstract,
  p.pub_year,
  pa.is_first_author,
  pa.is_senior_author
FROM publications_v2 p
JOIN publication_authors_v2 pa ON pa.publication_id = p.id
JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
WHERE pa.hcp_id = %s
  AND pta.therapeutic_area_id = %s
  AND p.pub_year >= 2021
  AND (pa.is_first_author = true OR pa.is_senior_author = true)
  AND p.title IS NOT NULL
ORDER BY p.pub_year DESC, p.pub_date DESC NULLS LAST
LIMIT 30
"""

INSERT_THEME_SQL = """
INSERT INTO public.hcp_research_themes_v2 (
  hcp_id,
  theme_name,
  centrality,
  paper_count,
  display_rank,
  example_pmids,
  therapeutic_area,
  extraction_run_id
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""

# TA-scoped so an AD run can NEVER delete or be blocked by a dual-TA HCP's NSCLC
# themes. A no-op on NSCLC's single-TA data (every NSCLC row is already tagged
# 'NSCLC'), so NSCLC behavior is unchanged.
DELETE_THEMES_SQL = """
DELETE FROM public.hcp_research_themes_v2 WHERE hcp_id = %s AND therapeutic_area = %s
"""

COUNT_THEMES_SQL = """
SELECT COUNT(*) AS cnt FROM public.hcp_research_themes_v2 WHERE hcp_id = %s AND therapeutic_area = %s
"""


# TA RESOLUTION MOVED TO scripts/utils/ta_registry.py (2026-08-27).
# Replaced a local resolve_ta_id that was one of NINE near-identical copies across sixteen
# scripts -- same query, different return types (str(row[0]) / row[0] / row["id"]) and
# different exceptions (ValueError / RuntimeError / SystemExit). Fifteen of them reported only
# "TA slug not found: <slug>", which repeats the typo back without saying what IS valid.
# The shared resolver caches per process and raises with the full slug list.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta, resolve_ta_id  # noqa: E402,F401


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def load_checkpoint(path: str) -> Optional[Dict[str, Any]]:
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[WARN] Could not read checkpoint {path}: {exc}", flush=True)
        return None


def save_checkpoint(path: str, state: Dict[str, Any]) -> None:
    state["last_updated_at"] = utc_now_iso()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def delete_checkpoint(path: str) -> None:
    if os.path.isfile(path):
        os.remove(path)


def format_elapsed(seconds: float) -> str:
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def format_eta(seconds: float) -> str:
    if seconds <= 0:
        return "0m"
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, _ = divmod(rem, 60)
    if h > 0:
        return f"{h}h {m}m"
    return f"{max(1, m)}m"


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens / 1_000_000) * INPUT_USD_PER_M + (output_tokens / 1_000_000) * OUTPUT_USD_PER_M


def author_position_label(is_first: bool, is_senior: bool) -> str:
    if is_first and is_senior:
        return "both"
    if is_first:
        return "first author"
    if is_senior:
        return "senior author"
    return "author"


def format_publications_block(papers: List[Dict[str, Any]]) -> str:
    blocks: List[str] = []
    for paper in papers:
        pmid = paper.get("pubmed_id")
        pmid_str = str(pmid).strip() if pmid is not None else "unknown"
        title = (paper.get("title") or "").strip()
        abstract_raw = paper.get("abstract")
        if abstract_raw and str(abstract_raw).strip():
            abstract = str(abstract_raw).strip()
        else:
            abstract = "No abstract"
        year = paper.get("pub_year") or "unknown"
        position = author_position_label(
            bool(paper.get("is_first_author")),
            bool(paper.get("is_senior_author")),
        )
        blocks.append(
            f"PMID: {pmid_str}\n"
            f"Title: {title}\n"
            f"Abstract: {abstract}\n"
            f"Author position: {position}\n"
            f"Year: {year}"
        )
    return "\n---\n".join(blocks)


def build_user_prompt(
    papers: List[Dict[str, Any]],
    domain: str,
    theme_examples: str,
    generic_negative: str,
) -> str:
    publications_block = format_publications_block(papers)
    return (
        f"Below are the recent publications (last 5 years) of an {domain} researcher. "
        "They appear as either first author (executing the work) or senior author "
        "(directing the work).\n\n"
        "Identify 10-12 distinct research themes in their work. Themes should be SPECIFIC "
        f"scientific concepts - e.g., {theme_examples} - NOT generic categories like "
        f"{generic_negative} or 'clinical trials'.\n\n"
        "For each theme, return:\n"
        "- theme_name (string, 2-6 words, specific not generic)\n"
        "- centrality ('core' if this is a central focus appearing across multiple papers, "
        "'supporting' if it's a recurring secondary interest, 'peripheral' if it appears "
        "in only 1-2 papers)\n"
        "- paper_count (integer, number of papers in which this theme is the central topic)\n"
        "- example_pmids (array of up to 3 strings - PubMed IDs from the publications below "
        "where this theme is most evident)\n\n"
        "Order the themes by paper_count descending (highest first).\n\n"
        "Return ONLY a JSON array. No other text.\n\n"
        f"PUBLICATIONS:\n{publications_block}"
    )


def extract_response_text(response: anthropic.types.Message) -> str:
    parts: List[str] = []
    for block in response.content:
        if block.type == "text":
            parts.append(block.text)
    return "".join(parts).strip()


def strip_markdown_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def extract_json_array(text: str) -> Optional[List[Any]]:
    cleaned = strip_markdown_fences(text)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\[[\s\S]*\]", cleaned)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            return None
    return None


VALID_CENTRALITY = frozenset({"core", "supporting", "peripheral"})


def normalize_example_pmids(value: Any) -> List[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value[:3]:
        if item is None:
            continue
        s = str(item).strip()
        if s:
            out.append(s)
    return out


def validate_theme(raw: Any, hcp_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        print(f"[WARN] HCP {hcp_id}: dropped theme (not an object)", flush=True)
        return None

    theme_name = raw.get("theme_name")
    if not isinstance(theme_name, str) or not theme_name.strip():
        print(f"[WARN] HCP {hcp_id}: dropped theme (invalid theme_name)", flush=True)
        return None

    centrality = raw.get("centrality")
    if centrality not in VALID_CENTRALITY:
        print(
            f"[WARN] HCP {hcp_id}: dropped theme '{theme_name}' (invalid centrality: {centrality})",
            flush=True,
        )
        return None

    paper_count = raw.get("paper_count")
    if not isinstance(paper_count, int) or paper_count < 0:
        try:
            paper_count = int(paper_count)
        except (TypeError, ValueError):
            print(
                f"[WARN] HCP {hcp_id}: dropped theme '{theme_name}' (invalid paper_count)",
                flush=True,
            )
            return None
    if paper_count < 0:
        print(
            f"[WARN] HCP {hcp_id}: dropped theme '{theme_name}' (negative paper_count)",
            flush=True,
        )
        return None

    return {
        "theme_name": theme_name.strip(),
        "centrality": centrality,
        "paper_count": paper_count,
        "example_pmids": normalize_example_pmids(raw.get("example_pmids")),
    }


def assign_display_ranks(themes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sorted_themes = sorted(themes, key=lambda t: t["paper_count"], reverse=True)
    for idx, theme in enumerate(sorted_themes):
        theme["display_rank"] = idx + 1 if idx < 6 else None
    return sorted_themes


def call_claude(
    client: anthropic.Anthropic,
    user_prompt: str,
    system_prompt: str,
) -> Tuple[str, int, int]:
    last_error: Optional[Exception] = None

    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            text = extract_response_text(response)
            input_tokens = int(response.usage.input_tokens)
            output_tokens = int(response.usage.output_tokens)
            return text, input_tokens, output_tokens
        except APIStatusError as exc:
            last_error = exc
            if exc.status_code == 429:
                print("[WARN] Rate limited (429); sleeping 60s before retry...", flush=True)
                time.sleep(60)
                continue
            if exc.status_code >= 500 and attempt < MAX_RETRIES - 1:
                delay = 2**attempt
                print(
                    f"[WARN] Anthropic {exc.status_code}; retrying in {delay}s "
                    f"(attempt {attempt + 1}/{MAX_RETRIES})...",
                    flush=True,
                )
                time.sleep(delay)
                continue
            raise

    raise RuntimeError(f"Claude API failed after retries: {last_error}")


def fetch_target_hcps(
    conn: psycopg.Connection,
    target_sql: str,
    ta_id: str,
    scope_value: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    with conn.cursor() as cur:
        # Named params: psycopg3 ignores keys the statement does not reference, so
        # one call site serves both the scope_value-bearing SQL and the rest.
        cur.execute(target_sql, {"ta_id": ta_id, "scope_value": scope_value})
        return list(cur.fetchall())


def fetch_papers(conn: psycopg.Connection, hcp_id: str, ta_id: str) -> List[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(PAPERS_SQL, (hcp_id, ta_id))
        return list(cur.fetchall())


def themes_exist(conn: psycopg.Connection, hcp_id: str, tag: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(COUNT_THEMES_SQL, (hcp_id, tag))
        row = cur.fetchone()
    return int(row["cnt"]) > 0 if row else False


def delete_themes(conn: psycopg.Connection, hcp_id: str, tag: str) -> None:
    with conn.cursor() as cur:
        cur.execute(DELETE_THEMES_SQL, (hcp_id, tag))


def write_themes(
    conn: psycopg.Connection,
    hcp_id: str,
    themes: List[Dict[str, Any]],
    extraction_run_id: str,
    tag: str,
) -> int:
    rows = [
        (
            hcp_id,
            t["theme_name"],
            t["centrality"],
            t["paper_count"],
            t.get("display_rank"),
            t["example_pmids"] or None,
            tag,
            extraction_run_id,
        )
        for t in themes
    ]
    with conn.cursor() as cur:
        cur.executemany(INSERT_THEME_SQL, rows)
    conn.commit()
    return len(rows)


def print_dry_run_hcp(
    hcp: Dict[str, Any],
    themes: List[Dict[str, Any]],
) -> None:
    first = hcp.get("first_name") or ""
    last = hcp.get("last_name") or ""
    institution = hcp.get("institution_normalized") or ""
    print(f"HCP: {first} {last} ({institution})", flush=True)
    print("Themes (top 6 marked *):", flush=True)

    display = [t for t in themes if t.get("display_rank") is not None]
    non_display = [t for t in themes if t.get("display_rank") is None]

    for theme in display:
        pmids = ", ".join(theme["example_pmids"]) if theme["example_pmids"] else "none"
        print(
            f"  * {theme['theme_name']} ({theme['centrality']}, {theme['paper_count']} papers) "
            f"- PMIDs: [{pmids}]",
            flush=True,
        )
    for theme in non_display:
        pmids = ", ".join(theme["example_pmids"]) if theme["example_pmids"] else "none"
        print(
            f"    {theme['theme_name']} ({theme['centrality']}, {theme['paper_count']} papers) "
            f"- PMIDs: [{pmids}]",
            flush=True,
        )
    print("---", flush=True)


@dataclass
class RunStats:
    successful_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    themes_written: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    per_hcp_durations: List[float] = field(default_factory=list)


def print_progress(
    index: int,
    total: int,
    start_time: float,
    stats: RunStats,
) -> None:
    elapsed = time.monotonic() - start_time
    pct = (index / total * 100.0) if total else 100.0
    recent = stats.per_hcp_durations[-50:]
    avg = sum(recent) / len(recent) if recent else 0.0
    remaining = max(0, total - index)
    eta_sec = remaining * avg
    print(
        f"[{format_elapsed(elapsed)} elapsed] HCP {index}/{total} ({pct:.1f}%) | "
        f"last 50 avg: {avg:.1f}s | ETA: {format_eta(eta_sec)} | "
        f"matched: {stats.successful_count}, skipped: {stats.skipped_count}, "
        f"failed: {stats.failed_count}",
        flush=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract per-HCP research themes by therapeutic area via Claude API."
    )
    parser.add_argument(
        "--ta",
        choices=tuple(TA_CONFIGS.keys()),
        default=DEFAULT_TA,
        help="Therapeutic-area slug (default: nsclc).",
    )
    parser.add_argument(
        "--scope",
        default=None,
        help=(
            "Cohort scope within the TA (e.g. AD: 'region' vs 'global'). "
            "Defaults to the TA config's default_scope. Valid values are per-TA."
        ),
    )
    parser.add_argument(
        "--scope-value",
        nargs="+",
        default=None,
        metavar="CODE",
        help=(
            "Country code(s) for a region-scoped selection, e.g. --scope-value US, "
            "or --scope-value DE FR GB for a multi-country region. REQUIRED (no "
            "default) when the chosen --scope is region-scoped; rejected when it "
            "is not, so a run can never appear scoped when it is not."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process up to 10 HCPs, call Claude, print themes, no DB writes.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-extract all HCPs; delete existing themes and ignore checkpoint.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N HCPs.",
    )
    return parser.parse_args()


def resolve_hcp_limit(dry_run: bool, limit: Optional[int]) -> Optional[int]:
    if dry_run and limit is not None:
        return min(DRY_RUN_HCP_LIMIT, limit)
    if dry_run:
        return DRY_RUN_HCP_LIMIT
    return limit


def main() -> int:
    load_dotenv()
    args = parse_args()
    dry_run = bool(args.dry_run)
    force = bool(args.force)
    hcp_limit = resolve_hcp_limit(dry_run, args.limit)

    # Resolve the TA config + scope. Fix A: validate --scope against the per-TA
    # selection dict (not a static choices tuple), because valid scopes differ by
    # TA (nsclc: rising; atopic-dermatitis: us/global). ta_id needs a DB
    # connection, so it is resolved later, inside the `with conn` block (fix B).
    ta_slug = args.ta
    ta_cfg = TA_CONFIGS[ta_slug]
    scope = args.scope or ta_cfg["default_scope"]
    if scope not in ta_cfg["selection"]:
        valid = ", ".join(sorted(ta_cfg["selection"].keys()))
        raise SystemExit(
            f"Invalid --scope '{scope}' for --ta {ta_slug}. Valid scopes: {valid}"
        )
    target_sql = ta_cfg["selection"][scope]
    scope_is_regional = "%(scope_value)s" in target_sql
    scope_value: Optional[List[str]] = args.scope_value
    if scope_is_regional and not scope_value:
        raise SystemExit(
            f"--scope-value is required for --ta {ta_slug} --scope {scope} "
            f"(region-scoped selection). There is no default: pass the country "
            f"code(s) explicitly, e.g. --scope-value US."
        )
    if scope_value and not scope_is_regional:
        raise SystemExit(
            f"--scope-value is not accepted for --ta {ta_slug} --scope {scope} "
            f"(selection is not region-scoped). Refusing to run rather than "
            f"silently ignoring it."
        )
    # tag IS NO LONGER READ FROM TA_CONFIGS. It comes from therapeutic_areas.themes_tag,
    # resolved inside the `with conn` block below alongside ta_id -- see there for why.
    domain = ta_cfg["domain"]
    theme_examples = ta_cfg["theme_examples"]
    generic_negative = ta_cfg["generic_negative"]
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(domain=domain)
    # Per-TA/scope checkpoint so an AD run can never resume from an NSCLC checkpoint.
    scope_tag = scope + ("_" + "-".join(scope_value) if scope_value else "")
    checkpoint_path = f"extract_research_themes_{ta_slug}_{scope_tag}_checkpoint.json"

    database_url = get_required_env("DATABASE_URL")
    api_key = get_required_env("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key, timeout=120.0)

    if force:
        delete_checkpoint(checkpoint_path)
        extraction_run_id = str(uuid.uuid4())
        checkpoint_state: Optional[Dict[str, Any]] = None
        print("Force mode: starting fresh extraction run.", flush=True)
    else:
        checkpoint_state = load_checkpoint(checkpoint_path)
        if checkpoint_state and checkpoint_state.get("extraction_run_id"):
            extraction_run_id = str(checkpoint_state["extraction_run_id"])
        else:
            extraction_run_id = str(uuid.uuid4())

    start_time = time.monotonic()
    stats = RunStats()
    last_request_at = 0.0

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        conn.autocommit = False
        # ONE RESOLUTION, FOUR KEYS (2026-09-02). resolve_ta returns id, slug, name AND
        # themes_tag, so the literal this script writes into
        # hcp_research_themes_v2.therapeutic_area is now READ from the same row every other
        # tool reads, rather than being the private property of TA_CONFIGS[slug]["tag"].
        #
        # WHY IT MATTERS HERE SPECIFICALLY: this script is the WRITER. Whatever sits in `tag`
        # becomes the stored key, and bucket_themes.py then has to find it again by its own
        # rule (slug.upper()). The two agreed for nsclc by coincidence and for
        # colorectal-cancer by a workaround; they disagreed for atopic-dermatitis, whose 3,499
        # rows have never been bucketed. Reading the column removes the second rule entirely.
        #
        # A TA WITH NO TAG IS A HARD STOP, not a fallback to slug.upper(). Guessing the key on
        # a billed extraction is how the AD orphan happened; refusing costs one UPDATE.
        ta = resolve_ta(ta_slug, conn)  # fix B: needs conn
        ta_id = ta.id
        tag = ta.themes_tag
        if not tag:
            raise SystemExit(
                f"therapeutic_areas.themes_tag is NULL for '{ta_slug}'. It is the key this "
                f"script writes into hcp_research_themes_v2.therapeutic_area and the key "
                f"bucket_themes.py reads back. Set it before extracting -- a guessed key "
                f"produces rows nothing downstream can find."
            )
        print(
            f"Loading target HCPs | TA: {tag} ({ta_slug}) | scope: {scope}"
            + (f" | scope-value: {','.join(scope_value)}" if scope_value else "")
            + "...",
            flush=True,
        )
        hcps = fetch_target_hcps(conn, target_sql, ta_id, scope_value)
        total_loaded = len(hcps)
        print(f"Loaded {total_loaded} HCPs meeting publication threshold.", flush=True)

        if not force and checkpoint_state:
            last_id = checkpoint_state.get("last_processed_hcp_id")
            processed_count = int(checkpoint_state.get("processed_count", 0))
            if last_id:
                hcps = [h for h in hcps if str(h["id"]) > str(last_id)]
                print(
                    f"Resuming from HCP {last_id}, already processed {processed_count} HCPs",
                    flush=True,
                )

        if hcp_limit is not None:
            hcps = hcps[:hcp_limit]

        total = len(hcps)
        if total == 0:
            print("No HCPs to process.", flush=True)
            return 0

        if checkpoint_state is None and not force:
            checkpoint_state = {
                "extraction_run_id": extraction_run_id,
                "started_at": utc_now_iso(),
                "last_processed_hcp_id": None,
                "processed_count": 0,
            }

        mode_label = "dry-run" if dry_run else "live"
        if force:
            mode_label += ", force"
        print(
            f"Run ID: {extraction_run_id} | mode: {mode_label} | HCPs in queue: {total}",
            flush=True,
        )

        for idx, hcp in enumerate(hcps, start=1):
            hcp_id = str(hcp["id"])
            hcp_start = time.monotonic()

            try:
                if not force and not dry_run and themes_exist(conn, hcp_id, tag):
                    print(f"[SKIP] HCP {hcp_id}: already extracted", flush=True)
                    stats.skipped_count += 1
                    if not dry_run:
                        checkpoint_state = checkpoint_state or {
                            "extraction_run_id": extraction_run_id,
                            "started_at": utc_now_iso(),
                            "last_processed_hcp_id": None,
                            "processed_count": 0,
                        }
                        checkpoint_state["last_processed_hcp_id"] = hcp_id
                        checkpoint_state["processed_count"] = int(
                            checkpoint_state.get("processed_count", 0)
                        ) + 1
                        save_checkpoint(checkpoint_path, checkpoint_state)
                    duration = time.monotonic() - hcp_start
                    stats.per_hcp_durations.append(duration)
                    print_progress(idx, total, start_time, stats)
                    continue

                papers = fetch_papers(conn, hcp_id, ta_id)
                if not papers:
                    print(f"[WARN] HCP {hcp_id}: no qualifying papers; skipping", flush=True)
                    stats.failed_count += 1
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                elapsed_since_request = time.monotonic() - last_request_at
                if elapsed_since_request < MIN_REQUEST_INTERVAL_SEC:
                    time.sleep(MIN_REQUEST_INTERVAL_SEC - elapsed_since_request)

                user_prompt = build_user_prompt(
                    papers, domain, theme_examples, generic_negative
                )
                raw_text, in_tok, out_tok = call_claude(client, user_prompt, system_prompt)
                last_request_at = time.monotonic()
                stats.total_input_tokens += in_tok
                stats.total_output_tokens += out_tok

                parsed = extract_json_array(raw_text)
                if parsed is None:
                    print(
                        f"[ERROR] HCP {hcp_id}: failed to parse Claude JSON response",
                        flush=True,
                    )
                    print(f"Raw response:\n{raw_text[:2000]}", flush=True)
                    stats.failed_count += 1
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                validated: List[Dict[str, Any]] = []
                for item in parsed:
                    theme = validate_theme(item, hcp_id)
                    if theme:
                        validated.append(theme)

                if not validated:
                    print(f"[ERROR] HCP {hcp_id}: no valid themes after validation", flush=True)
                    stats.failed_count += 1
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                themes = assign_display_ranks(validated)

                if dry_run:
                    print_dry_run_hcp(hcp, themes)
                    stats.successful_count += 1
                else:
                    if force:
                        delete_themes(conn, hcp_id, tag)
                    written = write_themes(conn, hcp_id, themes, extraction_run_id, tag)
                    stats.themes_written += written
                    stats.successful_count += 1
                    checkpoint_state = checkpoint_state or {
                        "extraction_run_id": extraction_run_id,
                        "started_at": utc_now_iso(),
                        "last_processed_hcp_id": None,
                        "processed_count": 0,
                    }
                    checkpoint_state["last_processed_hcp_id"] = hcp_id
                    checkpoint_state["processed_count"] = int(
                        checkpoint_state.get("processed_count", 0)
                    ) + 1
                    save_checkpoint(checkpoint_path, checkpoint_state)

            except (APITimeoutError, APIConnectionError, httpx.TimeoutException) as e:
                print(
                    f"[TIMEOUT] HCP {hcp_id}: {type(e).__name__} after 120s - skipping, will retry on next run",
                    flush=True,
                )
                stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                print_progress(idx, total, start_time, stats)
                continue
            except Exception as exc:
                print(f"[ERROR] HCP {hcp_id}: {exc}", flush=True)
                stats.failed_count += 1

            stats.per_hcp_durations.append(time.monotonic() - hcp_start)
            print_progress(idx, total, start_time, stats)

    runtime_sec = time.monotonic() - start_time
    h, rem = divmod(int(runtime_sec), 3600)
    m, _ = divmod(rem, 60)
    cost = estimate_cost(stats.total_input_tokens, stats.total_output_tokens)

    if dry_run:
        api_calls = stats.successful_count + stats.failed_count
        projected_in = 0
        projected_out = 0
        if api_calls > 0:
            projected_in = int(stats.total_input_tokens / api_calls * total_loaded)
            projected_out = int(stats.total_output_tokens / api_calls * total_loaded)
        projected_cost = estimate_cost(projected_in, projected_out)
        sample_n = api_calls if api_calls else DRY_RUN_HCP_LIMIT
        print(
            f"\nCost estimate based on {sample_n} HCPs:\n"
            f"  Total input tokens: {stats.total_input_tokens:,}\n"
            f"  Total output tokens: {stats.total_output_tokens:,}\n"
            f"  Cost of dry run: ${cost:.2f}\n"
            f"  Projected cost for full {total_loaded} HCPs: ${projected_cost:.2f}",
            flush=True,
        )

    print("\n=== Extraction summary ===", flush=True)
    print(f"Run ID: {extraction_run_id}", flush=True)
    print(f"Total HCPs processed: {stats.successful_count + stats.skipped_count + stats.failed_count}", flush=True)
    print(f"Successfully extracted themes: {stats.successful_count}", flush=True)
    print(f"Skipped (already extracted): {stats.skipped_count}", flush=True)
    print(f"Failed: {stats.failed_count}", flush=True)
    print(f"Total themes written: {stats.themes_written}", flush=True)
    print(f"Total input tokens: {stats.total_input_tokens:,}", flush=True)
    print(f"Total output tokens: {stats.total_output_tokens:,}", flush=True)
    print(f"Estimated cost: ${cost:.2f}", flush=True)
    print(f"Total runtime: {h} hours {m} minutes", flush=True)

    if dry_run:
        print("\nDry run complete - no database writes or checkpoint updates.", flush=True)
        return 0

    # ALL-FAILED RULE. attempted EXCLUDES skipped_count: a --skip-existing run where every HCP
    # was already extracted has successful_count == 0 and is a correct no-op, not a failure.
    # Only "everything we actually tried, failed" is unambiguous. Not a partial threshold --
    # generate_cycle's postcheck owns the ratio, measured against hcp_research_themes_v2.
    attempted = stats.successful_count + stats.failed_count
    if attempted and not stats.successful_count:
        print(f"\n[FAIL] 0 of {attempted} attempted HCPs extracted "
              f"({stats.failed_count} failed).", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
