from __future__ import annotations

"""
Standalone career enrichment script for FieldMark.

For each HCP with null total_career_pubs:
1) Search OpenAlex authors by name.
2) Choose a confident match.
3) Update hcps.total_career_pubs and hcps.first_pub_year.

Configuration from .env:
- SUPABASE_URL
- SUPABASE_KEY
- PUBMED_EMAIL  (used as OpenAlex polite-pool mailto)
"""

import os
import re
import time
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Sequence

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import Client, create_client

OPENALEX_BASE_URL = "https://api.openalex.org"
AUTHOR_MATCH_SCORE_THRESHOLD = 0.75
FETCH_PAGE_SIZE = 1000
SLEEP_SECONDS = 0.5
PROGRESS_EVERY = 50
DEFAULT_TIMEOUT_SECONDS = 20


@dataclass
class EnrichmentStats:
    total_candidates: int = 0
    processed: int = 0
    updated: int = 0
    no_match: int = 0
    failed: int = 0


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def build_http_session() -> requests.Session:
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=0)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": "FieldMark/1.0 (mailto:your_email@example.com)"})
    return session


def normalize_name_key(value: Optional[str]) -> str:
    if not value:
        return ""
    value = re.sub(r"[^A-Za-z\s\-']", " ", value).strip()
    return " ".join(value.split()).strip().lower()


def search_openalex_authors(
    session: requests.Session,
    name_query: str,
    polite_mailto: str,
) -> List[Dict]:
    openalex_api_key = os.getenv("OPENALEX_API_KEY")
    try:
        params = {
            "search": name_query,
            "per-page": "10",
            "mailto": polite_mailto,
        }
        if openalex_api_key:
            params["api_key"] = openalex_api_key
        response = session.get(
            f"{OPENALEX_BASE_URL}/authors",
            params=params,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []
    results = payload.get("results", []) if isinstance(payload, dict) else []
    return results if isinstance(results, list) else []


def pick_confident_author_match(
    candidates: Sequence[Dict],
    first_name: Optional[str],
    last_name: Optional[str],
) -> Optional[Dict]:
    # Same logic as openalex_pipeline.py.
    if not candidates or not last_name:
        return None
    first_norm = normalize_name_key(first_name)
    last_norm = normalize_name_key(last_name)
    if not last_norm:
        return None

    best_candidate: Optional[Dict] = None
    best_score = 0.0

    for candidate in candidates:
        display_name = normalize_name_key(candidate.get("display_name"))
        try:
            works_count = int(candidate.get("works_count", 0) or 0)
        except (TypeError, ValueError):
            works_count = 0
        if not display_name or works_count <= 0:
            continue
        if last_norm not in display_name:
            continue

        name_score = SequenceMatcher(
            None,
            f"{first_norm} {last_norm}".strip(),
            display_name,
        ).ratio()
        pub_count_score = 1.0 if works_count >= 3 else (works_count / 3.0)
        total_score = (0.8 * name_score) + (0.2 * pub_count_score)
        if total_score > best_score:
            best_score = total_score
            best_candidate = candidate

    if best_score < AUTHOR_MATCH_SCORE_THRESHOLD:
        return None
    return best_candidate


def extract_earliest_pub_year(author: Dict) -> Optional[int]:
    counts_by_year = author.get("counts_by_year")
    if not isinstance(counts_by_year, list):
        return None
    years: List[int] = []
    for item in counts_by_year:
        if not isinstance(item, dict):
            continue
        try:
            year = int(item.get("year"))
            works_count = int(item.get("works_count", 0) or 0)
        except (TypeError, ValueError):
            continue
        if works_count > 0:
            years.append(year)
    return min(years) if years else None


def update_hcp_career_fields(supabase: Client, hcp_id: str, works_count: int, first_pub_year: Optional[int]) -> None:
    try:
        supabase.table("hcps").update(
            {"total_career_pubs": works_count, "first_pub_year": first_pub_year}
        ).eq("id", hcp_id).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed updating HCP {hcp_id}: {exc}") from exc


def format_eta(total_seconds: float) -> str:
    if total_seconds < 0:
        total_seconds = 0
    minutes = int(total_seconds // 60)
    hours = minutes // 60
    remaining_minutes = minutes % 60
    return f"{hours}h {remaining_minutes}m"


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()
    session = build_http_session()
    polite_mailto = get_required_env("PUBMED_EMAIL")
    openalex_api_key = os.getenv("OPENALEX_API_KEY")

    hcps: List[Dict] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("hcps")
                .select("id,first_name,last_name,total_career_pubs")
                .is_("total_career_pubs", "null")
                .range(offset, offset + FETCH_PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading HCP candidates page at offset {offset}: {exc}") from exc

        batch = response.data or []
        if not batch:
            break

        hcps.extend(batch)
        if len(batch) < FETCH_PAGE_SIZE:
            break
        offset += FETCH_PAGE_SIZE

    stats = EnrichmentStats(total_candidates=len(hcps))
    print(f"Loaded {stats.total_candidates} HCPs with null total_career_pubs.", flush=True)
    start_time = time.time()

    for idx, hcp in enumerate(hcps, start=1):
        hcp_id = hcp.get("id")
        first_name = (hcp.get("first_name") or "").strip() or None
        last_name = (hcp.get("last_name") or "").strip() or None

        if not hcp_id or not last_name:
            stats.failed += 1
            continue

        name_query = " ".join(part for part in [first_name, last_name] if part)
        print(f"[{idx}] Searching: {name_query}", flush=True)
        try:
            params = {
                "filter": f"display_name.search:{name_query}",
                "per-page": "10",
                "mailto": polite_mailto,
            }
            if openalex_api_key:
                params["api_key"] = openalex_api_key
            response = session.get(
                f"{OPENALEX_BASE_URL}/authors",
                params=params,
                timeout=(5, 15),
            )
            response.raise_for_status()
            payload = response.json()
            results = payload.get("results", []) if isinstance(payload, dict) else []
            candidates = results if isinstance(results, list) else []
        except requests.exceptions.Timeout:
            print(f"[{idx}] Timeout on: {name_query} — skipping", flush=True)
            stats.failed += 1
            continue
        except Exception as e:
            print(f"[{idx}] Error on: {name_query} — {e}", flush=True)
            stats.failed += 1
            continue

        author = pick_confident_author_match(candidates, first_name, last_name)
        if not author:
            stats.no_match += 1
            stats.processed += 1
            if idx % PROGRESS_EVERY == 0:
                elapsed = time.time() - start_time
                avg_per_hcp = elapsed / max(stats.processed, 1)
                remaining = max(stats.total_candidates - idx, 0)
                eta = format_eta(avg_per_hcp * remaining)
                pct = (idx / max(stats.total_candidates, 1)) * 100
                print(
                    f"[{idx}/{stats.total_candidates}] {pct:.1f}% | "
                    f"Updated: {stats.updated} | Failed: {stats.failed} | ETA: {eta}",
                    flush=True,
                )
            time.sleep(SLEEP_SECONDS)
            continue

        try:
            works_count = int(author.get("works_count", 0) or 0)
        except (TypeError, ValueError):
            stats.failed += 1
            stats.processed += 1
            time.sleep(SLEEP_SECONDS)
            continue

        first_pub_year = extract_earliest_pub_year(author)
        try:
            update_hcp_career_fields(supabase, hcp_id, works_count, first_pub_year)
            stats.updated += 1
        except RuntimeError:
            stats.failed += 1

        stats.processed += 1
        if idx % PROGRESS_EVERY == 0:
            elapsed = time.time() - start_time
            avg_per_hcp = elapsed / max(stats.processed, 1)
            remaining = max(stats.total_candidates - idx, 0)
            eta = format_eta(avg_per_hcp * remaining)
            pct = (idx / max(stats.total_candidates, 1)) * 100
            print(
                f"[{idx}/{stats.total_candidates}] {pct:.1f}% | "
                f"Updated: {stats.updated} | Failed: {stats.failed} | ETA: {eta}",
                flush=True,
            )
        time.sleep(SLEEP_SECONDS)

    print("\n=== Career Enrichment Summary ===", flush=True)
    print(f"Candidates: {stats.total_candidates}", flush=True)
    print(f"Processed: {stats.processed}", flush=True)
    print(f"Updated: {stats.updated}", flush=True)
    print(f"No confident match: {stats.no_match}", flush=True)
    print(f"Failed: {stats.failed}", flush=True)


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Career enrichment failed: {error}", flush=True)
        raise
