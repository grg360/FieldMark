"""
extract_web_signals.py - Extract identification web signals for Rising Star HCPs.

Phase 1 (identification): Tavily multi-query search + Claude structured extraction
into hcp_web_signals_v1.

Required environment variables:
- DATABASE_URL (port 5432 direct connection)
- ANTHROPIC_API_KEY
- TAVILY_API_KEY

Usage:
    python extract_web_signals.py --dry-run
    python extract_web_signals.py
    python extract_web_signals.py --force
    python extract_web_signals.py --limit 50
    python extract_web_signals.py --hcp-id <uuid>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

# HCP names/institutions carry non-cp1252 characters (e.g. U+2010 hyphen, accented
# letters). On Windows the default console/redirect encoding is cp1252, so printing
# them raises UnicodeEncodeError. Force UTF-8 with replacement, as the other pipeline
# scripts do.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import anthropic
import httpx
import psycopg
import requests
from anthropic import APIConnectionError, APIStatusError, APITimeoutError
from dotenv import load_dotenv
from psycopg.rows import dict_row

CHECKPOINT_PATH = "extract_web_signals_checkpoint.json"
PHASE = "identification"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8192
MIN_TAVILY_INTERVAL_SEC = 1.0
MAX_RETRIES = 3
DRY_RUN_HCP_LIMIT = 5
TAVILY_SEARCHES_PER_HCP = 12
CLAUDE_INPUT_USD_PER_M = 3.0
CLAUDE_OUTPUT_USD_PER_M = 15.0
TAVILY_USD_PER_CREDIT = 0.008
TAVILY_SEARCH_URL = "https://api.tavily.com/search"

SYSTEM_PROMPT = (
    "You analyze web search results to identify a healthcare "
    "professional's public profile information. You return strict JSON "
    "only - no preamble, no explanation, no markdown code fences."
)

USER_PROMPT_TEMPLATE = """Target HCP: {first_name} {last_name}
Institution (as recorded in source database): {institution_normalized}

Below are search results aggregated from 12 different queries. Each
result includes a URL, title, and content snippet.

Search results:
{aggregated_results}

Extract every identification & contact signal you can confidently
attribute to this specific person at this specific institution.

Return a JSON ARRAY of signal objects. Each object has this exact shape:

{{
  "signal_type": <one of: "institution", "department", "academic_title",
                  "city", "state", "country", "faculty_profile_url",
                  "institutional_email", "office_phone", "orcid_id",
                  "google_scholar_url", "linkedin_url", "lab_url",
                  "lab_name">,
  "signal_value": <the extracted value as a string>,
  "source_url": <the URL of the search result this came from>,
  "source_title": <the title of the source page>,
  "confidence": <"high" | "medium" | "low">
}}

CRITICAL EXTRACTION RULES:

- institution: Verify against the recorded institution. If the web
  results indicate a different current institution, return the web
  version with confidence "medium" or "low" depending on evidence
  strength. Do not echo back the recorded institution unless web
  evidence supports it.

- department: Academic division or department (e.g., "Division of
  Hematology-Oncology", "Department of Radiation Oncology"). Extract
  verbatim from institutional pages. Skip if only inferred.

- academic_title: One of "Assistant Professor", "Associate Professor",
  "Professor", "Instructor", "Research Scientist", "Physician
  Scientist", "Clinical Fellow", "Adjunct Professor". Skip if not
  clearly stated.

- city / state / country: From institutional pages or biographical
  text. Skip if not present.

- faculty_profile_url: MUST be hosted on the same institution as
  "{institution_normalized}". Examples of valid domains for known
  institutions:
    University of Pennsylvania: *.upenn.edu, *.pennmedicine.org
    MD Anderson: *.mdanderson.org
    Memorial Sloan Kettering: *.mskcc.org
    Dana-Farber: *.dana-farber.org
    Mayo Clinic: *.mayo.edu, *.mayoclinic.org
  If you cannot confidently match the URL to the institution's domain,
  return null for this field (do not include the signal).

- institutional_email: ONLY include if the email is explicitly published
  on a university, hospital, or cancer center webpage (one of the URLs
  in the search results). DO NOT infer from naming conventions. DO NOT
  guess. DO NOT extract from third-party people-finder sites. If no
  publicly listed email is found, omit this signal entirely. This rule
  is absolute - do not generate plausible emails.

- office_phone: Only if officially published. Same strictness as email.

- orcid_id: Must be 16 digits in the format "0000-0000-0000-0000".
  Strip the orcid.org URL prefix if present and return only the ID.

- google_scholar_url: Must start with https://scholar.google.com/.

- linkedin_url: Must start with https://www.linkedin.com/in/.

- lab_url / lab_name: Only if the person is explicitly identified as
  the lab head, lab director, or PI of the lab. Do not include labs
  where they are merely listed as a member.

- Source priority for resolving conflicts:
  1. University website
  2. Hospital website
  3. Cancer center website
  4. ORCID
  5. Google Scholar
  6. LinkedIn

- confidence levels:
  high   = signal extracted verbatim from an institutional source page
           where the HCP is explicitly identified
  medium = signal extracted from a credible source but with some
           ambiguity (e.g., a directory listing without full bio context)
  low    = signal extracted from secondary/third-party sources or with
           ambiguous attribution

Return only the JSON array. No preamble. No code fences.
"""

SEARCH_QUERY_TEMPLATES: List[str] = [
    '"{name}" "{institution}"',
    '"{name}" "{institution}" professor',
    '"{name}" "{institution}" oncology',
    '"{name}" "{institution}" department',
    '"{name}" faculty profile',
    '"{name}" contact',
    '"{name}" email',
    '"{name}" ORCID',
    '"{name}" Google Scholar',
    'site:linkedin.com/in "{name}" "{institution}"',
    '"{name}" lab',
    '"{name}" research group',
]

TARGET_HCPS_SQL = """
SELECT h.id, h.first_name, h.last_name, h.institution_normalized, r.us_rank
FROM hcps_v2 h
JOIN hcp_rising_star_ranks_v3 r ON r.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = r.therapeutic_area_id
WHERE ta.name = 'NSCLC'
  AND h.country = 'US'
  AND r.us_rank IS NOT NULL
ORDER BY r.us_rank ASC
"""

TARGET_HCP_BY_ID_SQL = """
SELECT h.id, h.first_name, h.last_name, h.institution_normalized, r.us_rank
FROM hcps_v2 h
JOIN hcp_rising_star_ranks_v3 r ON r.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = r.therapeutic_area_id
WHERE h.id = %s
  AND ta.name = 'NSCLC'
  AND h.country = 'US'
  AND r.us_rank IS NOT NULL
LIMIT 1
"""

# Established cohort: US NSCLC established top-200 (hcp_established_ranks_v3, region
# scope US). us_rank is aliased from e.rank so downstream display/ordering is uniform
# with the rising path.
ESTABLISHED_HCPS_SQL = """
SELECT h.id, h.first_name, h.last_name, h.institution_normalized, e.rank AS us_rank
FROM hcps_v2 h
JOIN hcp_established_ranks_v3 e ON e.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = e.therapeutic_area_id
WHERE ta.name = 'NSCLC'
  AND e.scope_type = 'region'
  AND e.scope_value = 'US'
  AND e.rank <= 200
ORDER BY e.rank ASC
"""

ESTABLISHED_HCP_BY_ID_SQL = """
SELECT h.id, h.first_name, h.last_name, h.institution_normalized, e.rank AS us_rank
FROM hcps_v2 h
JOIN hcp_established_ranks_v3 e ON e.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = e.therapeutic_area_id
WHERE h.id = %s
  AND ta.name = 'NSCLC'
  AND e.scope_type = 'region'
  AND e.scope_value = 'US'
  AND e.rank <= 200
LIMIT 1
"""

# Cohort dispatch: rising stays the default so the existing invocation is unchanged.
COHORT_TARGET_SQL = {"rising": TARGET_HCPS_SQL, "established": ESTABLISHED_HCPS_SQL}
COHORT_BY_ID_SQL = {"rising": TARGET_HCP_BY_ID_SQL, "established": ESTABLISHED_HCP_BY_ID_SQL}
COHORTS = tuple(COHORT_TARGET_SQL.keys())

COUNT_SIGNALS_SQL = """
SELECT COUNT(*) AS cnt
FROM public.hcp_web_signals_v1
WHERE hcp_id = %s AND phase = %s
"""

DELETE_SIGNALS_SQL = """
DELETE FROM public.hcp_web_signals_v1
WHERE hcp_id = %s AND phase = %s
"""

INSERT_SIGNAL_SQL = """
INSERT INTO public.hcp_web_signals_v1 (
  hcp_id,
  signal_type,
  signal_value,
  source_url,
  source_title,
  source_date,
  confidence,
  extraction_run_id,
  phase
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

VALID_SIGNAL_TYPES = frozenset({
    "institution",
    "department",
    "academic_title",
    "city",
    "state",
    "country",
    "faculty_profile_url",
    "institutional_email",
    "office_phone",
    "orcid_id",
    "google_scholar_url",
    "linkedin_url",
    "lab_url",
    "lab_name",
})

VALID_CONFIDENCE = frozenset({"high", "medium", "low"})


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


def estimate_total_cost(
    tavily_credits: int,
    input_tokens: int,
    output_tokens: int,
) -> Tuple[float, float, float]:
    tavily_cost = tavily_credits * TAVILY_USD_PER_CREDIT
    claude_cost = (input_tokens / 1_000_000) * CLAUDE_INPUT_USD_PER_M + (
        output_tokens / 1_000_000
    ) * CLAUDE_OUTPUT_USD_PER_M
    return tavily_cost, claude_cost, tavily_cost + claude_cost


def hcp_display_name(hcp: Dict[str, Any]) -> str:
    first = (hcp.get("first_name") or "").strip()
    last = (hcp.get("last_name") or "").strip()
    return f"{first} {last}".strip() or "Unknown"


def build_search_queries(hcp: Dict[str, Any]) -> List[str]:
    name = hcp_display_name(hcp)
    institution = (hcp.get("institution_normalized") or "").strip()
    return [
        template.format(name=name, institution=institution)
        for template in SEARCH_QUERY_TEMPLATES
    ]


def format_aggregated_results(
    query_results: List[Tuple[str, List[Dict[str, Any]]]],
) -> str:
    blocks: List[str] = []
    for query_idx, (query, results) in enumerate(query_results, start=1):
        blocks.append(f'[Query {query_idx}: "{query}"]')
        if not results:
            blocks.append("(no results)")
        else:
            for item in results:
                title = (item.get("title") or "").strip() or "(no title)"
                url = (item.get("url") or "").strip() or "(no url)"
                snippet = (item.get("content") or item.get("snippet") or "").strip()
                if not snippet:
                    snippet = "(no snippet)"
                blocks.append(f"Title: {title}\nURL: {url}\nSnippet: {snippet}")
        blocks.append("---")
    return "\n".join(blocks)


def build_user_prompt(
    hcp: Dict[str, Any],
    query_results: List[Tuple[str, List[Dict[str, Any]]]],
) -> str:
    return USER_PROMPT_TEMPLATE.format(
        first_name=(hcp.get("first_name") or "").strip(),
        last_name=(hcp.get("last_name") or "").strip(),
        institution_normalized=(hcp.get("institution_normalized") or "").strip() or "Unknown",
        aggregated_results=format_aggregated_results(query_results),
    )


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


def normalize_optional_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def validate_signal(raw: Any, hcp_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        print(f"[WARN] HCP {hcp_id}: dropped signal (not an object)", flush=True)
        return None

    signal_type = raw.get("signal_type")
    if signal_type not in VALID_SIGNAL_TYPES:
        print(
            f"[WARN] HCP {hcp_id}: dropped signal (invalid signal_type: {signal_type})",
            flush=True,
        )
        return None

    signal_value = normalize_optional_str(raw.get("signal_value"))
    if signal_value is None:
        print(
            f"[WARN] HCP {hcp_id}: dropped {signal_type} (empty signal_value)",
            flush=True,
        )
        return None

    confidence = raw.get("confidence")
    if confidence not in VALID_CONFIDENCE:
        print(
            f"[WARN] HCP {hcp_id}: {signal_type} invalid confidence, defaulting to low",
            flush=True,
        )
        confidence = "low"

    source_url = normalize_optional_str(raw.get("source_url"))
    source_title = normalize_optional_str(raw.get("source_title"))

    if signal_type == "google_scholar_url" and not signal_value.startswith(
        "https://scholar.google.com/"
    ):
        print(f"[WARN] HCP {hcp_id}: dropped invalid google_scholar_url", flush=True)
        return None

    if signal_type == "linkedin_url" and not signal_value.startswith(
        "https://www.linkedin.com/in/"
    ):
        print(f"[WARN] HCP {hcp_id}: dropped invalid linkedin_url", flush=True)
        return None

    return {
        "signal_type": signal_type,
        "signal_value": signal_value,
        "source_url": source_url,
        "source_title": source_title,
        "confidence": confidence,
    }


def call_tavily_with_retry(api_key: str, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": False,
    }
    last_error: Optional[Exception] = None

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(TAVILY_SEARCH_URL, json=payload, timeout=30)
            if response.status_code >= 500 and attempt < MAX_RETRIES - 1:
                delay = 2**attempt
                print(
                    f"[WARN] Tavily {response.status_code}; retrying in {delay}s "
                    f"(attempt {attempt + 1}/{MAX_RETRIES})...",
                    flush=True,
                )
                time.sleep(delay)
                continue
            response.raise_for_status()
            data = response.json()
            results = data.get("results", [])
            return results if isinstance(results, list) else []
        except requests.RequestException as exc:
            last_error = exc
            if attempt < MAX_RETRIES - 1:
                delay = 2**attempt
                print(
                    f"[WARN] Tavily request failed; retrying in {delay}s "
                    f"(attempt {attempt + 1}/{MAX_RETRIES})...",
                    flush=True,
                )
                time.sleep(delay)
                continue
            raise

    raise RuntimeError(f"Tavily API failed after retries: {last_error}")


def extract_response_text(response: anthropic.types.Message) -> str:
    parts: List[str] = []
    for block in response.content:
        if block.type == "text":
            parts.append(block.text)
    return "".join(parts).strip()


def call_claude(
    client: anthropic.Anthropic,
    user_prompt: str,
) -> Tuple[str, int, int]:
    last_error: Optional[Exception] = None

    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
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


def fetch_target_hcps(conn: psycopg.Connection, cohort: str) -> List[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(COHORT_TARGET_SQL[cohort])
        return list(cur.fetchall())


def fetch_hcp_by_id(
    conn: psycopg.Connection, hcp_id: str, cohort: str
) -> Optional[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(COHORT_BY_ID_SQL[cohort], (hcp_id,))
        row = cur.fetchone()
    return dict(row) if row else None


def signals_exist(conn: psycopg.Connection, hcp_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(COUNT_SIGNALS_SQL, (hcp_id, PHASE))
        row = cur.fetchone()
    return int(row["cnt"]) > 0 if row else False


def delete_signals(conn: psycopg.Connection, hcp_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(DELETE_SIGNALS_SQL, (hcp_id, PHASE))


def write_signals(
    conn: psycopg.Connection,
    hcp_id: str,
    signals: List[Dict[str, Any]],
    extraction_run_id: str,
) -> int:
    rows = [
        (
            hcp_id,
            sig["signal_type"],
            sig["signal_value"],
            sig.get("source_url"),
            sig.get("source_title"),
            None,
            sig["confidence"],
            extraction_run_id,
            PHASE,
        )
        for sig in signals
    ]
    with conn.cursor() as cur:
        cur.executemany(INSERT_SIGNAL_SQL, rows)
    conn.commit()
    return len(rows)


def run_tavily_searches(
    api_key: str,
    queries: List[str],
    last_tavily_at: float,
) -> Tuple[List[Tuple[str, List[Dict[str, Any]]]], float, int]:
    query_results: List[Tuple[str, List[Dict[str, Any]]]] = []
    credits_used = 0
    for query in queries:
        elapsed = time.monotonic() - last_tavily_at
        if elapsed < MIN_TAVILY_INTERVAL_SEC:
            time.sleep(MIN_TAVILY_INTERVAL_SEC - elapsed)
        results = call_tavily_with_retry(api_key, query, max_results=5)
        last_tavily_at = time.monotonic()
        credits_used += 1
        query_results.append((query, results))
    return query_results, last_tavily_at, credits_used


def signal_type_counts(signals: List[Dict[str, Any]]) -> Counter:
    return Counter(sig["signal_type"] for sig in signals)


def print_signal_summary(signals: List[Dict[str, Any]]) -> None:
    counts = signal_type_counts(signals)
    if not counts:
        print("  Signals by type: (none)", flush=True)
        return
    parts = [f"{stype}={count}" for stype, count in sorted(counts.items())]
    print(f"  Signals by type: {', '.join(parts)}", flush=True)


def print_dry_run_signals(hcp: Dict[str, Any], signals: List[Dict[str, Any]]) -> None:
    rank = hcp.get("us_rank")
    institution = (hcp.get("institution_normalized") or "").strip()
    print(f"Rank: {rank} | {hcp_display_name(hcp)} | {institution}", flush=True)
    print_signal_summary(signals)
    for sig in signals:
        print(
            f"  [{sig['confidence']}] {sig['signal_type']}: {sig['signal_value']}",
            flush=True,
        )
    print("---", flush=True)


@dataclass
class RunStats:
    successful_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    signals_written: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tavily_credits: int = 0
    per_hcp_durations: List[float] = field(default_factory=list)


def print_progress(
    index: int,
    total: int,
    start_time: float,
    stats: RunStats,
) -> None:
    elapsed = time.monotonic() - start_time
    pct = (index / total * 100.0) if total else 100.0
    recent = stats.per_hcp_durations[-20:]
    avg = sum(recent) / len(recent) if recent else 0.0
    remaining = max(0, total - index)
    eta_sec = remaining * avg
    print(
        f"[{format_elapsed(elapsed)} elapsed] HCP {index}/{total} ({pct:.1f}%) | "
        f"last 20 avg: {avg:.1f}s | ETA: {format_eta(eta_sec)} | "
        f"ok: {stats.successful_count}, skipped: {stats.skipped_count}, "
        f"failed: {stats.failed_count}",
        flush=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract identification web signals for Rising Star HCPs."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process up to 5 HCPs, call APIs, print signals, no DB writes.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-process HCPs that already have identification-phase rows.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N HCPs.",
    )
    parser.add_argument(
        "--hcp-id",
        type=str,
        default=None,
        metavar="UUID",
        help="Process a single HCP by ID (smoke test).",
    )
    parser.add_argument(
        "--cohort",
        choices=COHORTS,
        default="rising",
        help="Which NSCLC US cohort to target (default: rising). Each cohort "
        "uses its own checkpoint file so runs never cross-skip.",
    )
    return parser.parse_args()


def checkpoint_path_for(cohort: str) -> str:
    # Rising keeps the historical path (its checkpoint already lives there); other
    # cohorts get a suffixed file so the rising run's processed_hcp_ids can never
    # mark an established HCP as done. Cross-cohort overlaps are still skipped, but
    # via the per-HCP DB check (signals_exist), which is the correct reason.
    return CHECKPOINT_PATH if cohort == "rising" else f"extract_web_signals_checkpoint_{cohort}.json"


def resolve_hcp_limit(dry_run: bool, limit: Optional[int]) -> Optional[int]:
    if dry_run and limit is not None:
        return min(DRY_RUN_HCP_LIMIT, limit)
    if dry_run:
        return DRY_RUN_HCP_LIMIT
    return limit


def get_processed_ids(checkpoint_state: Optional[Dict[str, Any]]) -> Set[str]:
    if not checkpoint_state:
        return set()
    raw = checkpoint_state.get("processed_hcp_ids", [])
    if not isinstance(raw, list):
        return set()
    return {str(item) for item in raw}


def main() -> int:
    load_dotenv()
    args = parse_args()
    dry_run = bool(args.dry_run)
    force = bool(args.force)
    cohort = args.cohort
    hcp_limit = resolve_hcp_limit(dry_run, args.limit)
    single_hcp_id = (args.hcp_id or "").strip() or None
    checkpoint_path = checkpoint_path_for(cohort)

    database_url = get_required_env("DATABASE_URL")
    anthropic_api_key = get_required_env("ANTHROPIC_API_KEY")
    tavily_api_key = get_required_env("TAVILY_API_KEY")
    client = anthropic.Anthropic(api_key=anthropic_api_key, timeout=180.0)

    if force and not dry_run:
        delete_checkpoint(checkpoint_path)
        extraction_run_id = str(uuid.uuid4())
        checkpoint_state: Optional[Dict[str, Any]] = None
        print("Force mode: starting fresh extraction run.", flush=True)
    elif force and dry_run:
        extraction_run_id = str(uuid.uuid4())
        checkpoint_state = None
    else:
        checkpoint_state = load_checkpoint(checkpoint_path)
        if checkpoint_state and checkpoint_state.get("extraction_run_id"):
            extraction_run_id = str(checkpoint_state["extraction_run_id"])
        else:
            extraction_run_id = str(uuid.uuid4())

    start_time = time.monotonic()
    stats = RunStats()
    last_tavily_at = 0.0

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        conn.autocommit = False

        if single_hcp_id:
            print(f"Loading single HCP {single_hcp_id} (cohort={cohort})...", flush=True)
            hcp_row = fetch_hcp_by_id(conn, single_hcp_id, cohort)
            if not hcp_row:
                print(f"HCP {single_hcp_id} not found in {cohort} target cohort.", flush=True)
                return 1
            hcps = [hcp_row]
        else:
            print(f"Loading target US NSCLC {cohort} HCPs...", flush=True)
            hcps = fetch_target_hcps(conn, cohort)
            print(f"Loaded {len(hcps)} HCPs.", flush=True)

            processed_ids = get_processed_ids(checkpoint_state)
            if processed_ids and not force:
                before = len(hcps)
                hcps = [h for h in hcps if str(h["id"]) not in processed_ids]
                print(
                    f"Resuming: skipping {before - len(hcps)} already checkpointed HCPs",
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
                "phase": PHASE,
                "started_at": utc_now_iso(),
                "processed_hcp_ids": [],
                "processed_count": 0,
            }

        mode_label = "dry-run" if dry_run else "live"
        if force:
            mode_label += ", force"
        print(
            f"Run ID: {extraction_run_id} | cohort: {cohort} | phase: {PHASE} | "
            f"mode: {mode_label} | HCPs in queue: {total}",
            flush=True,
        )

        for idx, hcp in enumerate(hcps, start=1):
            hcp_id = str(hcp["id"])
            hcp_start = time.monotonic()
            rank = hcp.get("us_rank")
            institution = (hcp.get("institution_normalized") or "").strip()

            try:
                if not force and not dry_run and signals_exist(conn, hcp_id):
                    print(
                        f"[SKIP] rank={rank} {hcp_display_name(hcp)} ({institution}): "
                        "already extracted",
                        flush=True,
                    )
                    stats.skipped_count += 1
                    if not dry_run:
                        checkpoint_state = checkpoint_state or {
                            "extraction_run_id": extraction_run_id,
                            "phase": PHASE,
                            "started_at": utc_now_iso(),
                            "processed_hcp_ids": [],
                            "processed_count": 0,
                        }
                        processed_ids = get_processed_ids(checkpoint_state)
                        processed_ids.add(hcp_id)
                        checkpoint_state["processed_hcp_ids"] = sorted(processed_ids)
                        checkpoint_state["processed_count"] = len(processed_ids)
                        save_checkpoint(checkpoint_path, checkpoint_state)
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                queries = build_search_queries(hcp)
                query_results, last_tavily_at, credits_used = run_tavily_searches(
                    tavily_api_key,
                    queries,
                    last_tavily_at,
                )
                stats.total_tavily_credits += credits_used

                user_prompt = build_user_prompt(hcp, query_results)
                raw_text, in_tok, out_tok = call_claude(client, user_prompt)
                stats.total_input_tokens += in_tok
                stats.total_output_tokens += out_tok

                hcp_runtime = time.monotonic() - hcp_start
                print(
                    f"  Tavily: {credits_used} searches | Claude: {in_tok} in / {out_tok} out | "
                    f"runtime: {hcp_runtime:.1f}s",
                    flush=True,
                )

                parsed = extract_json_array(raw_text)
                if parsed is None:
                    print(
                        f"[ERROR] rank={rank} {hcp_display_name(hcp)}: "
                        "failed to parse Claude JSON array",
                        flush=True,
                    )
                    print(f"Raw response:\n{raw_text[:3000]}", flush=True)
                    stats.failed_count += 1
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                validated: List[Dict[str, Any]] = []
                for item in parsed:
                    signal = validate_signal(item, hcp_id)
                    if signal:
                        validated.append(signal)

                if not validated:
                    validated = [
                        {
                            "signal_type": "no_signals_found",
                            "signal_value": "",
                            "source_url": None,
                            "source_title": None,
                            "confidence": "low",
                        }
                    ]

                print(
                    f"[OK] rank={rank} {hcp_display_name(hcp)} | {institution} | "
                    f"signals={len(validated)}",
                    flush=True,
                )
                print_signal_summary(validated)

                if dry_run:
                    print_dry_run_signals(hcp, validated)
                    stats.successful_count += 1
                else:
                    if force:
                        delete_signals(conn, hcp_id)
                    written = write_signals(conn, hcp_id, validated, extraction_run_id)
                    stats.signals_written += written
                    stats.successful_count += 1

                    checkpoint_state = checkpoint_state or {
                        "extraction_run_id": extraction_run_id,
                        "phase": PHASE,
                        "started_at": utc_now_iso(),
                        "processed_hcp_ids": [],
                        "processed_count": 0,
                    }
                    processed_ids = get_processed_ids(checkpoint_state)
                    processed_ids.add(hcp_id)
                    checkpoint_state["processed_hcp_ids"] = sorted(processed_ids)
                    checkpoint_state["processed_count"] = len(processed_ids)
                    save_checkpoint(checkpoint_path, checkpoint_state)

            except (APITimeoutError, APIConnectionError, httpx.TimeoutException) as exc:
                print(
                    f"[TIMEOUT] rank={rank} {hcp_display_name(hcp)}: "
                    f"{type(exc).__name__} - skipping",
                    flush=True,
                )
                stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                print_progress(idx, total, start_time, stats)
                continue
            except Exception as exc:
                print(
                    f"[ERROR] rank={rank} {hcp_display_name(hcp)}: {exc}",
                    flush=True,
                )
                stats.failed_count += 1

            stats.per_hcp_durations.append(time.monotonic() - hcp_start)
            print_progress(idx, total, start_time, stats)

    runtime_sec = time.monotonic() - start_time
    h, rem = divmod(int(runtime_sec), 3600)
    m, _ = divmod(rem, 60)
    tavily_cost, claude_cost, total_cost = estimate_total_cost(
        stats.total_tavily_credits,
        stats.total_input_tokens,
        stats.total_output_tokens,
    )
    hcps_processed = stats.successful_count + stats.skipped_count + stats.failed_count

    print("\n=== Extraction summary ===", flush=True)
    print(f"Run ID: {extraction_run_id}", flush=True)
    print(f"Phase: {PHASE}", flush=True)
    print(f"Total HCPs processed: {hcps_processed}", flush=True)
    print(f"Successfully extracted: {stats.successful_count}", flush=True)
    print(f"Skipped (already extracted): {stats.skipped_count}", flush=True)
    print(f"Failed: {stats.failed_count}", flush=True)
    print(f"Signal rows written: {stats.signals_written}", flush=True)
    print(f"Total Tavily credits consumed: {stats.total_tavily_credits}", flush=True)
    print(f"Total Claude input tokens: {stats.total_input_tokens:,}", flush=True)
    print(f"Total Claude output tokens: {stats.total_output_tokens:,}", flush=True)
    print(f"Tavily cost (estimated): ${tavily_cost:.2f}", flush=True)
    print(f"Claude cost: ${claude_cost:.2f}", flush=True)
    print(f"Total estimated spend: ${total_cost:.2f}", flush=True)
    print(f"Total runtime: {h} hours {m} minutes", flush=True)

    if dry_run:
        print("\nDry run complete - no database writes or checkpoint updates.", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
