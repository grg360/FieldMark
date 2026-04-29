from __future__ import annotations

"""
FieldMark OpenAlex pipeline: DOI citation enrichment and HCP career publication counts.

1) For each publication with a DOI, fetch OpenAlex work metadata and update citation_count.
2) For each HCP (optionally only those without total_career_pubs), search OpenAlex authors
   by name; on a confident match, store works_count as total_career_pubs on hcps.

Environment: SUPABASE_URL, SUPABASE_KEY, PUBMED_EMAIL (polite pool mailto for OpenAlex).
"""

import os
import argparse
import re
import time
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Sequence
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

OPENALEX_BASE_URL = "https://api.openalex.org"
FETCH_PAGE_SIZE = 1000
PROGRESS_EVERY = 100
SLEEP_SECONDS = 0.2
DEFAULT_TIMEOUT_SECONDS = 20
AUTHOR_MATCH_SCORE_THRESHOLD = 0.75


@dataclass
class PipelineStats:
    total_loaded: int = 0
    processed: int = 0
    updated: int = 0
    unchanged: int = 0
    not_found_or_missing_citations: int = 0
    failed: int = 0


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def env_flag_true(name: str) -> bool:
    value = os.getenv(name, "").strip().lower()
    return value in {"1", "true", "yes", "y", "on"}


def normalize_doi(doi_value: Optional[str]) -> Optional[str]:
    if not doi_value:
        return None
    doi = doi_value.strip().lower()
    if doi.startswith("https://doi.org/"):
        doi = doi.removeprefix("https://doi.org/")
    elif doi.startswith("http://doi.org/"):
        doi = doi.removeprefix("http://doi.org/")
    elif doi.startswith("doi:"):
        doi = doi.removeprefix("doi:").strip()
    doi = doi.strip()
    return doi or None


def normalize_name_key(value: Optional[str]) -> str:
    if not value:
        return ""
    value = re.sub(r"[^A-Za-z\s\-']", " ", value).strip()
    return " ".join(value.split()).strip().lower()


def build_http_session() -> requests.Session:
    session = requests.Session()
    session.mount("https://", requests.adapters.HTTPAdapter(max_retries=0))
    session.mount("http://", requests.adapters.HTTPAdapter(max_retries=0))
    session.headers.update({"User-Agent": "FieldMark/1.0 (mailto:garrett.groesbeck@gmail.com)"})
    return session


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def fetch_publications_with_doi(supabase: Client) -> List[Dict]:
    publications: List[Dict] = []
    offset = 0

    while True:
        try:
            response = (
                supabase.table("publications")
                .select("id,doi,citation_count")
                .not_.is_("doi", "null")
                .range(offset, offset + FETCH_PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading publications page at offset {offset}: {exc}") from exc

        batch = response.data or []
        if not batch:
            break

        for row in batch:
            doi = normalize_doi(row.get("doi"))
            if doi:
                row["doi"] = doi
                publications.append(row)

        if len(batch) < FETCH_PAGE_SIZE:
            break
        offset += FETCH_PAGE_SIZE

    return publications


def format_eta(total_seconds: float) -> str:
    if total_seconds < 0:
        total_seconds = 0
    minutes = int(total_seconds // 60)
    hours = minutes // 60
    remaining_minutes = minutes % 60
    return f"{hours}h {remaining_minutes}m"


def fetch_openalex_work_by_doi(
    session: requests.Session,
    doi: str,
    polite_mailto: str,
) -> Optional[Dict]:
    encoded_doi = quote(doi, safe="")
    url = f"{OPENALEX_BASE_URL}/works/https://doi.org/{encoded_doi}"
    openalex_api_key = os.getenv("OPENALEX_API_KEY")

    try:
        params = {"mailto": polite_mailto}
        if openalex_api_key:
            params["api_key"] = openalex_api_key
        response = session.get(url, params=params, timeout=(5, 15))
        if response.status_code == 404:
            return None
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            return None
        return payload
    except (requests.RequestException, ValueError):
        return None


def extract_cited_by_count(work_payload: Optional[Dict]) -> Optional[int]:
    if not work_payload:
        return None
    value = work_payload.get("cited_by_count")
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return max(0, parsed)


def update_citation_count(supabase: Client, publication_id: str, citation_count: int) -> None:
    try:
        supabase.table("publications").update({"citation_count": citation_count}).eq("id", publication_id).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed updating publication {publication_id}: {exc}") from exc


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
    time.sleep(SLEEP_SECONDS)
    results = payload.get("results", [])
    return results if isinstance(results, list) else []


def pick_confident_author_match(
    candidates: Sequence[Dict],
    first_name: Optional[str],
    last_name: Optional[str],
) -> Optional[Dict]:
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


def process_hcp(
    supabase: Client,
    session: requests.Session,
    hcp: Dict,
    polite_mailto: str,
) -> bool:
    """
    If a confident OpenAlex author match exists, set hcps.total_career_pubs and
    hcps.first_pub_year from OpenAlex.
    Returns True when the hcp row was updated.
    """
    hcp_id = hcp.get("id")
    if not hcp_id:
        return False
    first_name = (hcp.get("first_name") or "").strip() or None
    last_name = (hcp.get("last_name") or "").strip() or None
    if not last_name:
        return False
    name_query = " ".join(p for p in (first_name, last_name) if p)
    if not name_query:
        return False

    candidates = search_openalex_authors(session, name_query, polite_mailto=polite_mailto)
    author = pick_confident_author_match(candidates, first_name, last_name)
    if not author:
        return False

    try:
        works_count = int(author.get("works_count", 0) or 0)
    except (TypeError, ValueError):
        return False
    if works_count < 0:
        return False

    earliest_year: Optional[int] = None
    counts_by_year = author.get("counts_by_year")
    if isinstance(counts_by_year, list):
        candidate_years: List[int] = []
        for item in counts_by_year:
            if not isinstance(item, dict):
                continue
            try:
                year = int(item.get("year"))
                year_works_count = int(item.get("works_count", 0) or 0)
            except (TypeError, ValueError):
                continue
            if year_works_count > 0:
                candidate_years.append(year)
        if candidate_years:
            earliest_year = min(candidate_years)

    try:
        supabase.table("hcps").update(
            {"total_career_pubs": works_count, "first_pub_year": earliest_year}
        ).eq("id", hcp_id).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed updating total_career_pubs/first_pub_year for HCP {hcp_id}: {exc}") from exc
    return True


def run_career_enrichment(
    supabase: Client,
    session: requests.Session,
    polite_mailto: str,
) -> None:
    """Set total_career_pubs from OpenAlex for HCPs that do not have it yet."""
    try:
        response = supabase.table("hcps").select("id,first_name,last_name,total_career_pubs").execute()
    except Exception as exc:
        raise RuntimeError(f"Failed to load hcps for career enrichment: {exc}") from exc

    hcps = response.data or []
    need_enrichment = [h for h in hcps if h.get("total_career_pubs") is None]
    if not need_enrichment:
        print("Career pub enrichment: all HCPs already have total_career_pubs (or none to process).")
        return

    print(f"Career pub enrichment: attempting OpenAlex author match for {len(need_enrichment)} HCPs without total_career_pubs...")
    updated = 0
    for idx, hcp in enumerate(need_enrichment, start=1):
        try:
            if process_hcp(supabase, session, hcp, polite_mailto):
                updated += 1
        except Exception as exc:
            print(f"Warning: process_hcp failed for hcp_id={hcp.get('id')}: {exc}")
        if idx % 50 == 0:
            print(f"  Career enrichment progress: {idx}/{len(need_enrichment)} (updated={updated})")
        time.sleep(SLEEP_SECONDS)

    print(f"Career pub enrichment done: {updated} HCPs updated with total_career_pubs.")


def run_pipeline(skip_doi_enrichment: bool = False) -> None:
    load_dotenv()
    supabase = init_supabase()
    session = build_http_session()
    polite_mailto = get_required_env("PUBMED_EMAIL")

    if skip_doi_enrichment:
        print("SKIP_DOI_ENRICHMENT enabled: skipping DOI citation enrichment phase.")
    else:
        print("Loading publications with DOI...")
        publications = fetch_publications_with_doi(supabase)
        stats = PipelineStats(total_loaded=len(publications))
        print(f"Loaded {stats.total_loaded} publications with non-null DOI.")
        start_time = time.time()

        for idx, publication in enumerate(publications, start=1):
            publication_id = publication.get("id")
            doi = publication.get("doi")
            old_citation = publication.get("citation_count")
            old_value = int(old_citation) if old_citation is not None else 0

            if not publication_id or not doi:
                stats.failed += 1
                continue

            work = fetch_openalex_work_by_doi(session, doi, polite_mailto=polite_mailto)
            new_citation = extract_cited_by_count(work)

            if new_citation is None:
                stats.not_found_or_missing_citations += 1
            elif new_citation == old_value:
                stats.unchanged += 1
            else:
                try:
                    update_citation_count(supabase, publication_id, new_citation)
                    stats.updated += 1
                except RuntimeError:
                    stats.failed += 1

            stats.processed += 1
            if idx % PROGRESS_EVERY == 0:
                elapsed = time.time() - start_time
                avg_per_pub = elapsed / max(stats.processed, 1)
                remaining = max(stats.total_loaded - idx, 0)
                eta = format_eta(avg_per_pub * remaining)
                pct = (idx / max(stats.total_loaded, 1)) * 100
                print(
                    f"[{idx}/{stats.total_loaded}] {pct:.1f}% | "
                    f"Updated: {stats.updated} | Failed: {stats.failed} | ETA: {eta}"
                )

            time.sleep(SLEEP_SECONDS)

        print("\n=== OpenAlex DOI Enrichment Summary ===")
        print(f"Total loaded: {stats.total_loaded}")
        print(f"Processed: {stats.processed}")
        print(f"Updated: {stats.updated}")
        print(f"Unchanged: {stats.unchanged}")
        print(f"Not found/missing citation count: {stats.not_found_or_missing_citations}")
        print(f"Failed: {stats.failed}")

    print("\nStarting HCP total_career_pubs enrichment (OpenAlex author match)...")
    run_career_enrichment(supabase, session, polite_mailto)


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description="FieldMark OpenAlex enrichment pipeline")
        parser.add_argument(
            "--skip-doi-enrichment",
            action="store_true",
            help="Skip DOI citation enrichment and run only HCP career enrichment.",
        )
        args = parser.parse_args()
        run_pipeline(skip_doi_enrichment=args.skip_doi_enrichment or env_flag_true("SKIP_DOI_ENRICHMENT"))
    except Exception as error:
        print(f"[ERROR] OpenAlex pipeline failed: {error}")
        raise
