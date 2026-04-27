from __future__ import annotations

"""
FieldMark OpenAlex DOI citation enrichment pipeline.

Workflow:
1) Read publications with non-null DOI from Supabase.
2) For each DOI, fetch work metadata from:
   https://api.openalex.org/works/https://doi.org/{doi}
3) Extract cited_by_count.
4) Update publications.citation_count in Supabase.

Runtime constraints:
- Sleeps 0.2 seconds between requests.
- Prints progress every 100 publications.
- Caps processing at 500 publications for first test run.
"""

import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util.retry import Retry

OPENALEX_BASE_URL = "https://api.openalex.org"
MAX_PUBLICATIONS = 5000
PROGRESS_EVERY = 100
SLEEP_SECONDS = 0.2
DEFAULT_TIMEOUT_SECONDS = 20


@dataclass
class PipelineStats:
    total_loaded: int = 0
    processed: int = 0
    updated: int = 0
    unchanged: int = 0
    not_found_or_missing_citations: int = 0
    failed: int = 0


class TimeoutHTTPAdapter(HTTPAdapter):
    """HTTP adapter that injects a default timeout if missing."""

    def __init__(self, *args, timeout: int = DEFAULT_TIMEOUT_SECONDS, **kwargs):
        self.timeout = timeout
        super().__init__(*args, **kwargs)

    def send(self, request, **kwargs):  # type: ignore[override]
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = self.timeout
        return super().send(request, **kwargs)


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


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


def build_http_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=5,
        read=5,
        connect=5,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "HEAD"),
    )
    adapter = TimeoutHTTPAdapter(max_retries=retries, timeout=DEFAULT_TIMEOUT_SECONDS)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def fetch_publications_with_doi(supabase: Client, limit: int = MAX_PUBLICATIONS) -> List[Dict]:
    try:
        response = (
            supabase.table("publications")
            .select("id,doi,citation_count")
            .not_.is_("doi", "null")
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise RuntimeError(f"Failed loading publications from Supabase: {exc}") from exc

    rows = response.data or []
    cleaned = []
    for row in rows:
        doi = normalize_doi(row.get("doi"))
        if doi:
            row["doi"] = doi
            cleaned.append(row)
    return cleaned


def fetch_openalex_work_by_doi(
    session: requests.Session,
    doi: str,
    polite_mailto: str,
) -> Optional[Dict]:
    encoded_doi = quote(doi, safe="")
    url = f"{OPENALEX_BASE_URL}/works/https://doi.org/{encoded_doi}"

    try:
        response = session.get(url, params={"mailto": polite_mailto})
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


def run_pipeline() -> None:
    load_dotenv()
    supabase = init_supabase()
    session = build_http_session()
    polite_mailto = get_required_env("PUBMED_EMAIL")

    print("Loading publications with DOI...")
    publications = fetch_publications_with_doi(supabase, limit=MAX_PUBLICATIONS)
    stats = PipelineStats(total_loaded=len(publications))
    print(f"Loaded {stats.total_loaded} publications (cap={MAX_PUBLICATIONS}).")

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
            print(
                f"Progress: {idx}/{stats.total_loaded} | "
                f"updated={stats.updated}, unchanged={stats.unchanged}, "
                f"not_found_or_missing={stats.not_found_or_missing_citations}, failed={stats.failed}"
            )

        time.sleep(SLEEP_SECONDS)

    print("\n=== OpenAlex DOI Enrichment Summary ===")
    print(f"Total loaded: {stats.total_loaded}")
    print(f"Processed: {stats.processed}")
    print(f"Updated: {stats.updated}")
    print(f"Unchanged: {stats.unchanged}")
    print(f"Not found/missing citation count: {stats.not_found_or_missing_citations}")
    print(f"Failed: {stats.failed}")


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] OpenAlex pipeline failed: {error}")
        raise
"""
OpenAlex DOI citation enrichment pipeline for FieldMark.

Simplified approach:
1) Fetch publications from Supabase where DOI is present.
2) For each DOI, call OpenAlex work endpoint directly:
   https://api.openalex.org/works/https://doi.org/{doi}
3) Extract cited_by_count.
4) Update publications.citation_count.

Runtime behavior:
- Sleep 0.2 seconds between OpenAlex requests.
- Print progress every 100 publications.
- Cap processing to 500 publications for initial test run.
"""

