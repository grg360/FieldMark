"""
extract_external_links.py - Extract public profile links for Rising Star HCPs via Tavily + Claude.

Uses Tavily web search and Claude structured extraction to populate hcp_external_links_v1.

Required environment variables:
- DATABASE_URL (port 5432 direct connection)
- ANTHROPIC_API_KEY
- TAVILY_API_KEY

Usage:
    python extract_external_links.py --dry-run
    python extract_external_links.py
    python extract_external_links.py --force
    python extract_external_links.py --limit 50
    python extract_external_links.py --hcp-id <uuid>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import anthropic
import httpx
import psycopg
import requests
from anthropic import APIConnectionError, APIStatusError, APITimeoutError
from dotenv import load_dotenv
from psycopg.rows import dict_row

CHECKPOINT_PATH = "extract_external_links_checkpoint.json"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2048
MIN_TAVILY_INTERVAL_SEC = 1.0
MAX_RETRIES = 3
DRY_RUN_HCP_LIMIT = 5
BATCH_COMMIT_SIZE = 10
CLAUDE_INPUT_USD_PER_M = 3.0
CLAUDE_OUTPUT_USD_PER_M = 15.0
TAVILY_USD_PER_CREDIT = 0.008
TAVILY_SEARCH_URL = "https://api.tavily.com/search"

SYSTEM_PROMPT = (
    "You analyze web search results to identify a healthcare "
    "professional's public profile URLs. You return strict JSON only - "
    "no preamble, no explanation, no markdown code fences."
)

USER_PROMPT_TEMPLATE = """Search results for: {first_name} {last_name} ({institution})

Results:
{tavily_results}

Extract the following public profile information for this person.
Return strict JSON with these exact keys. Use null when a field is
not confidently identifiable from the search results:

{{
  "faculty_profile_url": <url or null>,
  "department": <string or null>,
  "orcid_id": <16-digit ORCID like "0000-0000-0000-0000" or null>,
  "google_scholar_url": <url or null>,
  "linkedin_url": <url or null>,
  "confidence": <"high" | "medium" | "low">
}}

Strict rules:
- faculty_profile_url MUST be hosted on the same institution as
  "{institution}". For example, a University of Pennsylvania HCP's
  faculty page must be on a *.upenn.edu, *.pennmedicine.org, or
  *.med.upenn.edu domain. If no institutional URL is found, return null.
- department is the academic division or department (e.g., "Division
  of Hematology-Oncology"). Extract verbatim from the search results.
- orcid_id is ONLY the 16-digit identifier, not the full orcid.org URL.
- google_scholar_url must start with https://scholar.google.com/.
- linkedin_url must start with https://www.linkedin.com/in/.
- confidence: "high" if 3+ fields confidently extracted including
  faculty_profile_url; "medium" if 1-2 fields; "low" if only weak
  signals or guessing.

Return only the JSON object. No preamble.
"""

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

COUNT_LINKS_SQL = """
SELECT COUNT(*) AS cnt FROM public.hcp_external_links_v1 WHERE hcp_id = %s
"""

UPSERT_LINKS_SQL = """
INSERT INTO public.hcp_external_links_v1 (
  hcp_id,
  faculty_profile_url,
  department,
  orcid_id,
  google_scholar_url,
  linkedin_url,
  confidence,
  source_search_query,
  extraction_run_id
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (hcp_id) DO UPDATE SET
  faculty_profile_url = EXCLUDED.faculty_profile_url,
  department = EXCLUDED.department,
  orcid_id = EXCLUDED.orcid_id,
  google_scholar_url = EXCLUDED.google_scholar_url,
  linkedin_url = EXCLUDED.linkedin_url,
  confidence = EXCLUDED.confidence,
  source_search_query = EXCLUDED.source_search_query,
  extracted_at = now(),
  extraction_run_id = EXCLUDED.extraction_run_id
"""

FIELD_KEYS = (
    "faculty_profile_url",
    "department",
    "orcid_id",
    "google_scholar_url",
    "linkedin_url",
)

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
) -> float:
    claude_cost = (input_tokens / 1_000_000) * CLAUDE_INPUT_USD_PER_M + (
        output_tokens / 1_000_000
    ) * CLAUDE_OUTPUT_USD_PER_M
    tavily_cost = tavily_credits * TAVILY_USD_PER_CREDIT
    return tavily_cost + claude_cost


def build_search_query(hcp: Dict[str, Any]) -> str:
    first = (hcp.get("first_name") or "").strip()
    last = (hcp.get("last_name") or "").strip()
    institution = (hcp.get("institution_normalized") or "").strip()
    return f"{first} {last} {institution} faculty profile".strip()


def format_tavily_results(results: List[Dict[str, Any]]) -> str:
    if not results:
        return "(no search results returned)"
    blocks: List[str] = []
    for item in results:
        title = (item.get("title") or "").strip() or "(no title)"
        url = (item.get("url") or "").strip() or "(no url)"
        snippet = (item.get("content") or item.get("snippet") or "").strip()
        if not snippet:
            snippet = "(no snippet)"
        blocks.append(f"Title: {title}\nURL: {url}\nSnippet: {snippet}")
    return "\n---\n".join(blocks)


def build_user_prompt(hcp: Dict[str, Any], tavily_results: List[Dict[str, Any]]) -> str:
    institution = (hcp.get("institution_normalized") or "").strip() or "Unknown"
    return USER_PROMPT_TEMPLATE.format(
        first_name=(hcp.get("first_name") or "").strip(),
        last_name=(hcp.get("last_name") or "").strip(),
        institution=institution,
        tavily_results=format_tavily_results(tavily_results),
    )


def strip_markdown_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    cleaned = strip_markdown_fences(text)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
    return None


def normalize_optional_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def validate_extraction(raw: Dict[str, Any], hcp_id: str) -> Optional[Dict[str, Any]]:
    confidence = raw.get("confidence")
    if confidence not in VALID_CONFIDENCE:
        print(
            f"[WARN] HCP {hcp_id}: invalid confidence '{confidence}', defaulting to low",
            flush=True,
        )
        confidence = "low"

    faculty_profile_url = normalize_optional_str(raw.get("faculty_profile_url"))
    department = normalize_optional_str(raw.get("department"))
    orcid_id = normalize_optional_str(raw.get("orcid_id"))
    google_scholar_url = normalize_optional_str(raw.get("google_scholar_url"))
    linkedin_url = normalize_optional_str(raw.get("linkedin_url"))

    if google_scholar_url and not google_scholar_url.startswith("https://scholar.google.com/"):
        print(f"[WARN] HCP {hcp_id}: dropping invalid google_scholar_url", flush=True)
        google_scholar_url = None

    if linkedin_url and not linkedin_url.startswith("https://www.linkedin.com/in/"):
        print(f"[WARN] HCP {hcp_id}: dropping invalid linkedin_url", flush=True)
        linkedin_url = None

    return {
        "faculty_profile_url": faculty_profile_url,
        "department": department,
        "orcid_id": orcid_id,
        "google_scholar_url": google_scholar_url,
        "linkedin_url": linkedin_url,
        "confidence": confidence,
    }


def count_extracted_fields(record: Dict[str, Any]) -> int:
    return sum(1 for key in FIELD_KEYS if record.get(key))


def call_tavily_with_retry(api_key: str, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": max_results,
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


def fetch_target_hcps(conn: psycopg.Connection) -> List[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(TARGET_HCPS_SQL)
        return list(cur.fetchall())


def fetch_hcp_by_id(conn: psycopg.Connection, hcp_id: str) -> Optional[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(TARGET_HCP_BY_ID_SQL, (hcp_id,))
        row = cur.fetchone()
    return dict(row) if row else None


def links_exist(conn: psycopg.Connection, hcp_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(COUNT_LINKS_SQL, (hcp_id,))
        row = cur.fetchone()
    return int(row["cnt"]) > 0 if row else False


def upsert_links(
    cur: psycopg.Cursor,
    hcp_id: str,
    record: Dict[str, Any],
    search_query: str,
    extraction_run_id: str,
) -> None:
    cur.execute(
        UPSERT_LINKS_SQL,
        (
            hcp_id,
            record.get("faculty_profile_url"),
            record.get("department"),
            record.get("orcid_id"),
            record.get("google_scholar_url"),
            record.get("linkedin_url"),
            record.get("confidence"),
            search_query,
            extraction_run_id,
        ),
    )


def hcp_display_name(hcp: Dict[str, Any]) -> str:
    first = (hcp.get("first_name") or "").strip()
    last = (hcp.get("last_name") or "").strip()
    return f"{first} {last}".strip() or "Unknown"


@dataclass
class RunStats:
    successful_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    rows_written: int = 0
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
        description="Extract public profile links for Rising Star HCPs via Tavily + Claude."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process up to 5 HCPs, call APIs, print results, no DB writes.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-process HCPs that already have rows in hcp_external_links_v1.",
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
    return parser.parse_args()


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


def print_dry_run_record(hcp: Dict[str, Any], record: Dict[str, Any], search_query: str) -> None:
    rank = hcp.get("us_rank")
    institution = (hcp.get("institution_normalized") or "").strip()
    print(f"Rank: {rank} | {hcp_display_name(hcp)} | {institution}", flush=True)
    print(f"Search query: {search_query}", flush=True)
    print(f"Confidence: {record.get('confidence')}", flush=True)
    for key in FIELD_KEYS:
        print(f"  {key}: {record.get(key)}", flush=True)
    print("---", flush=True)


def main() -> int:
    load_dotenv()
    args = parse_args()
    dry_run = bool(args.dry_run)
    force = bool(args.force)
    hcp_limit = resolve_hcp_limit(dry_run, args.limit)
    single_hcp_id = (args.hcp_id or "").strip() or None

    database_url = get_required_env("DATABASE_URL")
    anthropic_api_key = get_required_env("ANTHROPIC_API_KEY")
    tavily_api_key = get_required_env("TAVILY_API_KEY")
    client = anthropic.Anthropic(api_key=anthropic_api_key, timeout=120.0)

    if force:
        delete_checkpoint(CHECKPOINT_PATH)
        extraction_run_id = str(uuid.uuid4())
        checkpoint_state: Optional[Dict[str, Any]] = None
        print("Force mode: starting fresh extraction run.", flush=True)
    else:
        checkpoint_state = load_checkpoint(CHECKPOINT_PATH)
        if checkpoint_state and checkpoint_state.get("extraction_run_id"):
            extraction_run_id = str(checkpoint_state["extraction_run_id"])
        else:
            extraction_run_id = str(uuid.uuid4())

    start_time = time.monotonic()
    stats = RunStats()
    last_tavily_at = 0.0
    pending_writes = 0

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        conn.autocommit = False

        if single_hcp_id:
            print(f"Loading single HCP {single_hcp_id}...", flush=True)
            hcp_row = fetch_hcp_by_id(conn, single_hcp_id)
            if not hcp_row:
                print(f"HCP {single_hcp_id} not found in target cohort.", flush=True)
                return 1
            hcps = [hcp_row]
        else:
            print("Loading target US NSCLC Rising Star HCPs...", flush=True)
            hcps = fetch_target_hcps(conn)
            total_loaded = len(hcps)
            print(f"Loaded {total_loaded} HCPs.", flush=True)

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
                "started_at": utc_now_iso(),
                "processed_hcp_ids": [],
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
            rank = hcp.get("us_rank")
            institution = (hcp.get("institution_normalized") or "").strip()

            try:
                if not force and not dry_run and links_exist(conn, hcp_id):
                    print(
                        f"[SKIP] rank={rank} {hcp_display_name(hcp)} ({institution}): "
                        "already extracted",
                        flush=True,
                    )
                    stats.skipped_count += 1
                    if checkpoint_state is not None:
                        processed_ids = get_processed_ids(checkpoint_state)
                        processed_ids.add(hcp_id)
                        checkpoint_state["processed_hcp_ids"] = sorted(processed_ids)
                        checkpoint_state["processed_count"] = len(processed_ids)
                        save_checkpoint(CHECKPOINT_PATH, checkpoint_state)
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                search_query = build_search_query(hcp)

                elapsed_since_tavily = time.monotonic() - last_tavily_at
                if elapsed_since_tavily < MIN_TAVILY_INTERVAL_SEC:
                    time.sleep(MIN_TAVILY_INTERVAL_SEC - elapsed_since_tavily)

                tavily_results = call_tavily_with_retry(tavily_api_key, search_query, max_results=5)
                last_tavily_at = time.monotonic()
                stats.total_tavily_credits += 1

                user_prompt = build_user_prompt(hcp, tavily_results)
                raw_text, in_tok, out_tok = call_claude(client, user_prompt)
                stats.total_input_tokens += in_tok
                stats.total_output_tokens += out_tok

                print(
                    f"  Tavily: 1 credit | Claude: {in_tok} in / {out_tok} out tokens",
                    flush=True,
                )

                parsed = extract_json_object(raw_text)
                if parsed is None:
                    print(
                        f"[ERROR] rank={rank} {hcp_display_name(hcp)}: "
                        "failed to parse Claude JSON response",
                        flush=True,
                    )
                    print(f"Raw response:\n{raw_text[:2000]}", flush=True)
                    stats.failed_count += 1
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                record = validate_extraction(parsed, hcp_id)
                if record is None:
                    stats.failed_count += 1
                    stats.per_hcp_durations.append(time.monotonic() - hcp_start)
                    print_progress(idx, total, start_time, stats)
                    continue

                field_count = count_extracted_fields(record)
                print(
                    f"[OK] rank={rank} {hcp_display_name(hcp)} | {institution} | "
                    f"fields={field_count} | confidence={record.get('confidence')}",
                    flush=True,
                )

                if dry_run:
                    print_dry_run_record(hcp, record, search_query)
                    stats.successful_count += 1
                else:
                    with conn.cursor() as cur:
                        upsert_links(cur, hcp_id, record, search_query, extraction_run_id)
                    pending_writes += 1
                    stats.rows_written += 1
                    stats.successful_count += 1

                    if pending_writes >= BATCH_COMMIT_SIZE:
                        conn.commit()
                        pending_writes = 0

                    if checkpoint_state is not None:
                        processed_ids = get_processed_ids(checkpoint_state)
                        processed_ids.add(hcp_id)
                        checkpoint_state["processed_hcp_ids"] = sorted(processed_ids)
                        checkpoint_state["processed_count"] = len(processed_ids)
                        save_checkpoint(CHECKPOINT_PATH, checkpoint_state)

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

        if not dry_run and pending_writes > 0:
            conn.commit()

    runtime_sec = time.monotonic() - start_time
    h, rem = divmod(int(runtime_sec), 3600)
    m, _ = divmod(rem, 60)
    total_cost = estimate_total_cost(
        stats.total_tavily_credits,
        stats.total_input_tokens,
        stats.total_output_tokens,
    )

    print("\n=== Extraction summary ===", flush=True)
    print(f"Run ID: {extraction_run_id}", flush=True)
    print(
        f"Total HCPs processed: "
        f"{stats.successful_count + stats.skipped_count + stats.failed_count}",
        flush=True,
    )
    print(f"Successfully extracted links: {stats.successful_count}", flush=True)
    print(f"Skipped (already extracted): {stats.skipped_count}", flush=True)
    print(f"Failed: {stats.failed_count}", flush=True)
    print(f"Rows written: {stats.rows_written}", flush=True)
    print(f"Total Tavily credits (estimated): {stats.total_tavily_credits}", flush=True)
    print(f"Total Claude input tokens: {stats.total_input_tokens:,}", flush=True)
    print(f"Total Claude output tokens: {stats.total_output_tokens:,}", flush=True)
    print(
        f"Total dollar cost: ${total_cost:.2f} "
        f"(Tavily ${stats.total_tavily_credits * TAVILY_USD_PER_CREDIT:.2f} + "
        f"Claude ${total_cost - stats.total_tavily_credits * TAVILY_USD_PER_CREDIT:.2f})",
        flush=True,
    )
    print(f"Total runtime: {h} hours {m} minutes", flush=True)

    if dry_run:
        print("\nDry run complete - no database writes or checkpoint updates.", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
