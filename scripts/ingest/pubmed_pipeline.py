"""
PubMed -> Supabase pipeline for FieldMark.

This script:
1) Queries PubMed for recent rare-disease related publications.
2) Extracts publication and author affiliation metadata.
3) Deduplicates authors into unique HCP profiles.
4) Stores HCPs and linked publication rows in Supabase.

Required environment variables:
- SUPABASE_URL
- SUPABASE_KEY

Optional environment variables:
- PUBMED_EMAIL (recommended by NCBI)
- PUBMED_TOOL (default: fieldmark_pubmed_pipeline)
- PUBMED_MAX_RESULTS (optional; used only when TA config omits pubmed.max_results)
- PUBMED_RETMAX_PER_CALL (default: 100)
- PUBMED_API_BASE (default: https://eutils.ncbi.nlm.nih.gov/entrez/eutils)

Per-TA pubmed config (config/therapeutic_areas/*.json) is authoritative for years_back,
max_results, and retrieval metadata. years_back is in years; null means no date filter.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple, TypeVar

from dotenv import load_dotenv

load_dotenv()
from xml.etree import ElementTree as ET

import requests
from requests import Response
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from tqdm import tqdm
from urllib3.util.retry import Retry


def load_ta_config(ta_slug: str) -> dict:
    """Load per-TA configuration from config/therapeutic_areas/<slug>.json.

    Returns the parsed dict. Raises FileNotFoundError if the TA config is missing.
    """
    config_dir = Path(__file__).resolve().parent.parent.parent / "config" / "therapeutic_areas"
    config_path = config_dir / f"{ta_slug}.json"
    if not config_path.exists():
        raise FileNotFoundError(f"No TA config found for slug '{ta_slug}' at {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_ta_configs() -> list[str]:
    """Return a list of all TA slugs with config files present."""
    config_dir = Path(__file__).resolve().parent.parent.parent / "config" / "therapeutic_areas"
    if not config_dir.exists():
        return []
    return sorted([p.stem for p in config_dir.glob("*.json")])


@dataclass
class HCPRecord:
    first_name: Optional[str]
    last_name: Optional[str]
    credentials: Optional[str]
    institution: Optional[str]
    institution_full: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    country: Optional[str]
    specialty: Optional[str]
    subspecialty: Optional[str]
    dedupe_key: str


@dataclass
class PublicationRecord:
    pubmed_id: str
    title: Optional[str]
    journal: Optional[str]
    pub_year: Optional[int]
    citation_count: Optional[int]
    doi: Optional[str]
    hcp_dedupe_key: str


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def build_http_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=5,
        read=5,
        connect=5,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def safe_get(url: str, params: Dict[str, str], session: requests.Session, timeout: int = 40) -> Response:
    try:
        response = session.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        return response
    except requests.RequestException as exc:
        raise RuntimeError(f"HTTP request failed for {url}: {exc}") from exc


def safe_post(url: str, data: Dict[str, str], session: requests.Session, timeout: int = 40) -> Response:
    try:
        response = session.post(url, data=data, timeout=timeout)
        response.raise_for_status()
        return response
    except requests.RequestException as exc:
        raise RuntimeError(f"HTTP request failed for {url}: {exc}") from exc


SUPABASE_TRANSIENT_MARKERS = (
    "520",
    "521",
    "522",
    "523",
    "524",
    "500",
    "502",
    "503",
    "504",
    "APIError",
    "Cloudflare",
)

T = TypeVar("T")


def _is_transient_supabase_error(exc: Exception) -> bool:
    msg = str(exc)
    if "401" in msg or "403" in msg:
        return False
    if "400" in msg:
        return False
    return any(marker in msg for marker in SUPABASE_TRANSIENT_MARKERS)


def supabase_execute(fn: Callable[[], T]) -> T:
    """Run a Supabase PostgREST call with exponential backoff on transient failures."""
    max_attempts = 5
    last_exc: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if not _is_transient_supabase_error(exc) or attempt >= max_attempts:
                raise
            wait_seconds = 2**attempt
            summary = str(exc).split("\n")[0][:200]
            print(
                f"Supabase transient error (attempt {attempt}/{max_attempts}): "
                f"{summary}. Retrying in {wait_seconds}s..."
            )
            time.sleep(wait_seconds)
    assert last_exc is not None
    raise last_exc


def parse_xml(content: bytes, source_name: str) -> ET.Element:
    try:
        return ET.fromstring(content)
    except ET.ParseError as exc:
        raise RuntimeError(f"Failed to parse XML from {source_name}: {exc}") from exc


def text_or_none(elem: Optional[ET.Element]) -> Optional[str]:
    if elem is None or elem.text is None:
        return None
    value = elem.text.strip()
    return value if value else None


def normalize_token(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().lower()


def clean_person_name(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = re.sub(r"[^A-Za-z\-\'\s\.]", "", value).strip()
    value = re.sub(r"\s+", " ", value)
    return value or None


def infer_credentials(last_name_or_suffix: Optional[str]) -> Optional[str]:
    if not last_name_or_suffix:
        return None
    suffix = last_name_or_suffix.strip().upper().replace(".", "")
    allowed = {"MD", "DO", "PHD", "MSC", "MPH", "MBBS", "FRCP", "RN", "NP", "PA"}
    return suffix if suffix in allowed else None


def parse_country_from_affiliation(affiliation: Optional[str]) -> Optional[str]:
    if not affiliation:
        return None

    value = affiliation.strip()
    # Explicit US matching anywhere in the string.
    if re.search(r"\b(USA|U\.S\.A\.|United States)\b", value, flags=re.IGNORECASE):
        return "USA"

    # Look at the last comma-separated segment for country-like endings.
    parts = [p.strip(" .;") for p in value.split(",") if p.strip()]
    last = parts[-1] if parts else value.strip(" .;")

    # Two-letter terminal country code.
    match_code = re.search(r"\b([A-Z]{2})\b$", last)
    if match_code:
        return match_code.group(1)

    known_countries = {
        "canada": "Canada",
        "united kingdom": "United Kingdom",
        "uk": "UK",
        "germany": "Germany",
        "france": "France",
        "italy": "Italy",
        "spain": "Spain",
        "australia": "Australia",
        "japan": "Japan",
        "china": "China",
        "india": "India",
        "brazil": "Brazil",
        "netherlands": "Netherlands",
        "switzerland": "Switzerland",
        "sweden": "Sweden",
        "norway": "Norway",
        "denmark": "Denmark",
        "belgium": "Belgium",
        "ireland": "Ireland",
        "israel": "Israel",
    }
    normalized_last = normalize_token(last)
    return known_countries.get(normalized_last)


def parse_affiliation(affiliation: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Parse institution/city/state/zip/country from a free-text affiliation.
    This is heuristic and intentionally conservative.
    """
    if not affiliation:
        return None, None, None, None, None

    parts = [p.strip() for p in affiliation.split(",") if p.strip()]
    institution = affiliation.strip() if affiliation else None
    country = parse_country_from_affiliation(affiliation)

    city = parts[-3] if len(parts) >= 3 else None
    state = None
    zip_code = None

    # Try parse US-like state+zip chunk, usually second to last item.
    if len(parts) >= 2:
        maybe_state_zip = parts[-2]
        state_zip_match = re.search(r"\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b", maybe_state_zip)
        if state_zip_match:
            state = state_zip_match.group(1)
            zip_code = state_zip_match.group(2)
        else:
            # If no zip, keep a short token that may be a state/province.
            token_match = re.search(r"\b([A-Z]{2,3})\b", maybe_state_zip)
            if token_match:
                state = token_match.group(1)

    return institution, city, state, zip_code, country


def build_dedupe_key(first_name: Optional[str], last_name: Optional[str], institution: Optional[str]) -> str:
    return f"{normalize_token(first_name)}|{normalize_token(last_name)}|{normalize_token(institution)}"


def resolve_years_back(pubmed_cfg: Dict[str, Any]) -> Optional[int]:
    """Return years_back from TA config; missing key or null means no date filter."""
    if "years_back" not in pubmed_cfg:
        return None
    value = pubmed_cfg["years_back"]
    return int(value) if value is not None else None


def years_back_to_days(years_back: Optional[int]) -> Optional[int]:
    if years_back is None:
        return None
    return years_back * 365


def resolve_max_results(pubmed_cfg: Dict[str, Any]) -> Optional[int]:
    """Resolve max_results: TA config (if key present) -> env (if key absent) -> None."""
    if "max_results" in pubmed_cfg:
        value = pubmed_cfg["max_results"]
        return int(value) if value is not None else None
    env_val = os.getenv("PUBMED_MAX_RESULTS")
    if env_val not in (None, ""):
        return int(env_val)
    return None


def pubmed_esearch_count(
    session: requests.Session,
    base_url: str,
    query: str,
    days_back: Optional[int],
    email: Optional[str],
    tool_name: str,
) -> int:
    """Return total PMID count for a query (esearch Count element)."""
    esearch_url = f"{base_url}/esearch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    params: Dict[str, str] = {
        "db": "pubmed",
        "term": query,
        "retmode": "xml",
        "retmax": "0",
        "sort": "pub_date",
        "tool": tool_name,
    }
    if days_back is not None:
        params["datetype"] = "pdat"
        params["reldate"] = str(days_back)
    if email:
        params["email"] = email
    if api_key:
        params["api_key"] = api_key

    response = safe_post(esearch_url, data=params, session=session)
    root = parse_xml(response.content, "esearch_count")
    if root.findtext("ERROR"):
        raise RuntimeError(f"PubMed ESearch error: {root.findtext('ERROR')}")
    count_text = root.findtext("Count")
    return int(count_text) if count_text and count_text.isdigit() else 0


PUBMED_HISTORY_MAX_PMIDS = 9999


def iter_year_date_ranges(days_back: int) -> List[Tuple[str, str]]:
    """Split a relative day window into calendar-year chunks (newest first)."""
    end = date.today()
    start = end - timedelta(days=days_back)
    ranges: List[Tuple[str, str]] = []
    for year in range(end.year, start.year - 1, -1):
        year_start = max(start, date(year, 1, 1))
        year_end = min(end, date(year, 12, 31))
        if year_start > year_end:
            continue
        ranges.append((year_start.strftime("%Y/%m/%d"), year_end.strftime("%Y/%m/%d")))
    return ranges


def iter_decade_date_ranges() -> List[Tuple[str, str]]:
    """Split full PubMed history into decade chunks (newest first)."""
    end = date.today()
    ranges: List[Tuple[str, str]] = []
    year = end.year
    while year >= 1960:
        decade_end = date(year, 12, 31)
        decade_start = date(max(year - 9, 1960), 1, 1)
        ranges.append((decade_start.strftime("%Y/%m/%d"), decade_end.strftime("%Y/%m/%d")))
        year -= 10
    return ranges


def pubmed_esearch_init_history(
    session: requests.Session,
    esearch_url: str,
    query: str,
    email: Optional[str],
    tool_name: str,
    days_back: Optional[int] = None,
    mindate: Optional[str] = None,
    maxdate: Optional[str] = None,
) -> Tuple[str, str, int]:
    """Run one ESearch with usehistory=y; return WebEnv, QueryKey, Count."""
    api_key = os.getenv("PUBMED_API_KEY")
    init_params: Dict[str, str] = {
        "db": "pubmed",
        "term": query,
        "retmode": "xml",
        "retmax": "0",
        "usehistory": "y",
        "sort": "pub_date",
        "tool": tool_name,
    }
    if mindate and maxdate:
        init_params["datetype"] = "pdat"
        init_params["mindate"] = mindate
        init_params["maxdate"] = maxdate
    elif days_back is not None:
        init_params["datetype"] = "pdat"
        init_params["reldate"] = str(days_back)
    if email:
        init_params["email"] = email
    if api_key:
        init_params["api_key"] = api_key

    response = safe_post(esearch_url, data=init_params, session=session)
    root = parse_xml(response.content, "esearch_init")
    if root.findtext("ERROR"):
        raise RuntimeError(f"PubMed ESearch error: {root.findtext('ERROR')}")

    webenv = text_or_none(root.find("WebEnv"))
    query_key = text_or_none(root.find("QueryKey"))
    if not webenv or not query_key:
        raise RuntimeError("PubMed ESearch did not return WebEnv/QueryKey for history session.")

    count_text = root.findtext("Count")
    total_count = int(count_text) if count_text and count_text.isdigit() else 0
    return webenv, query_key, total_count


def pubmed_efetch_history_pmids(
    session: requests.Session,
    efetch_url: str,
    webenv: str,
    query_key: str,
    session_target: int,
    per_call: int,
    email: Optional[str],
    tool_name: str,
    sleep_seconds: float,
    total_retrieved: int,
    overall_target: int,
    last_progress_logged: int,
    max_total: Optional[int] = None,
) -> Tuple[List[str], int, int]:
    """EFetch PMIDs from one history session (max 9,999 per NCBI limit)."""
    api_key = os.getenv("PUBMED_API_KEY")
    capped_target = min(session_target, PUBMED_HISTORY_MAX_PMIDS)
    ids: List[str] = []
    retstart = 0
    stop_at = max_total if max_total is not None else overall_target

    while retstart < capped_target:
        if total_retrieved >= stop_at:
            break
        batch_size = min(per_call, capped_target - retstart)
        if max_total is not None:
            batch_size = min(batch_size, stop_at - total_retrieved)
            if batch_size <= 0:
                break
        fetch_params: Dict[str, str] = {
            "db": "pubmed",
            "rettype": "uilist",
            "retmode": "text",
            "WebEnv": webenv,
            "query_key": query_key,
            "retstart": str(retstart),
            "retmax": str(batch_size),
            "tool": tool_name,
        }
        if email:
            fetch_params["email"] = email
        if api_key:
            fetch_params["api_key"] = api_key

        response = safe_post(efetch_url, data=fetch_params, session=session)
        batch_ids = [line.strip() for line in response.text.splitlines() if line.strip()]
        if not batch_ids:
            break
        ids.extend(batch_ids)
        retstart += len(batch_ids)
        total_retrieved += len(batch_ids)

        if total_retrieved - last_progress_logged >= 5000 or total_retrieved >= overall_target:
            print(
                f"Retrieved {total_retrieved:,} / {overall_target:,} PMIDs from PubMed history..."
            )
            last_progress_logged = total_retrieved

        time.sleep(sleep_seconds)

    return ids, total_retrieved, last_progress_logged


def pubmed_esearch(
    session: requests.Session,
    base_url: str,
    query: str,
    days_back: Optional[int],
    max_results: Optional[int],
    per_call: int,
    email: Optional[str],
    tool_name: str,
) -> List[str]:
    esearch_url = f"{base_url}/esearch.fcgi"
    efetch_url = f"{base_url}/efetch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34

    webenv, query_key, total_count = pubmed_esearch_init_history(
        session=session,
        esearch_url=esearch_url,
        query=query,
        email=email,
        tool_name=tool_name,
        days_back=days_back,
    )
    if total_count == 0:
        return []

    if max_results is not None:
        overall_target = min(total_count, max_results)
    else:
        overall_target = total_count

    ids: List[str] = []
    total_retrieved = 0
    last_progress_logged = 0

    if overall_target <= PUBMED_HISTORY_MAX_PMIDS:
        batch_ids, total_retrieved, last_progress_logged = pubmed_efetch_history_pmids(
            session=session,
            efetch_url=efetch_url,
            webenv=webenv,
            query_key=query_key,
            session_target=overall_target,
            per_call=per_call,
            email=email,
            tool_name=tool_name,
            sleep_seconds=sleep_seconds,
            total_retrieved=total_retrieved,
            overall_target=overall_target,
            last_progress_logged=last_progress_logged,
        )
        ids.extend(batch_ids)
    else:
        if days_back is not None:
            date_ranges = iter_year_date_ranges(days_back)
        else:
            date_ranges = iter_decade_date_ranges()

        seen: Set[str] = set()
        unique_ids = ids  # reuse list, populate with unique PMIDs in order
        for mindate, maxdate in date_ranges:
            if len(unique_ids) >= overall_target:
                break
            chunk_webenv, chunk_query_key, chunk_count = pubmed_esearch_init_history(
                session=session,
                esearch_url=esearch_url,
                query=query,
                email=email,
                tool_name=tool_name,
                mindate=mindate,
                maxdate=maxdate,
            )
            if chunk_count == 0:
                continue
            session_target = min(chunk_count, PUBMED_HISTORY_MAX_PMIDS)
            batch_ids, total_retrieved, last_progress_logged = pubmed_efetch_history_pmids(
                session=session,
                efetch_url=efetch_url,
                webenv=chunk_webenv,
                query_key=chunk_query_key,
                session_target=session_target,
                per_call=per_call,
                email=email,
                tool_name=tool_name,
                sleep_seconds=sleep_seconds,
                total_retrieved=len(unique_ids),
                overall_target=overall_target,
                last_progress_logged=last_progress_logged,
                max_total=overall_target,
            )
            for pmid in batch_ids:
                if pmid not in seen:
                    seen.add(pmid)
                    unique_ids.append(pmid)
                    if len(unique_ids) >= overall_target:
                        break

    # Preserve order while removing any duplicated PMIDs (single-session path only).
    if overall_target <= PUBMED_HISTORY_MAX_PMIDS:
        seen: Set[str] = set()
        unique_ids: List[str] = []
        for pmid in ids:
            if pmid not in seen:
                seen.add(pmid)
                unique_ids.append(pmid)
    if max_results is not None:
        return unique_ids[:max_results]
    return unique_ids


def chunked(items: Sequence[str], size: int) -> Iterable[Sequence[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def pubmed_efetch(
    session: requests.Session,
    base_url: str,
    pmids: Sequence[str],
    email: Optional[str],
    tool_name: str,
) -> List[ET.Element]:
    efetch_url = f"{base_url}/efetch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34
    all_articles: List[ET.Element] = []
    for batch in tqdm(list(chunked(list(pmids), 100)), desc="fetching publications", unit="batch"):
        params = {
            "db": "pubmed",
            "id": ",".join(batch),
            "retmode": "xml",
            "tool": tool_name,
        }
        if email:
            params["email"] = email
        if api_key:
            params["api_key"] = api_key

        response = safe_get(efetch_url, params=params, session=session)
        root = parse_xml(response.content, "efetch")
        all_articles.extend(root.findall("./PubmedArticle"))
        time.sleep(sleep_seconds)
    return all_articles


def parse_pub_year(article: ET.Element) -> Optional[int]:
    year_path_candidates = [
        "./MedlineCitation/Article/Journal/JournalIssue/PubDate/Year",
        "./MedlineCitation/Article/ArticleDate/Year",
        "./PubmedData/History/PubMedPubDate[@PubStatus='pubmed']/Year",
    ]
    for path in year_path_candidates:
        raw = text_or_none(article.find(path))
        if raw and raw.isdigit():
            return int(raw)
    return None


def parse_doi(article: ET.Element) -> Optional[str]:
    for aid in article.findall("./PubmedData/ArticleIdList/ArticleId"):
        if aid.attrib.get("IdType", "").lower() == "doi" and aid.text:
            return aid.text.strip()
    # Many records only carry the DOI on ELocationID under Article (not in ArticleIdList).
    for eloc in article.findall("./MedlineCitation/Article/ELocationID"):
        if eloc.attrib.get("EIdType", "").lower() == "doi" and eloc.text:
            return eloc.text.strip()
    return None


def build_author_query(first_name: Optional[str], last_name: Optional[str]) -> Optional[str]:
    if not last_name:
        return None
    normalized_last = normalize_space(last_name)
    normalized_first = normalize_space(first_name) if first_name else None
    if not normalized_last:
        return None
    if normalized_first:
        first_initial = normalized_first[0]
        return f"\"{normalized_last} {first_initial}\"[Author]"
    return f"\"{normalized_last}\"[Author]"


def normalize_space(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def pubmed_esearch_all(
    session: requests.Session,
    base_url: str,
    query: str,
    per_call: int,
    email: Optional[str],
    tool_name: str,
) -> List[str]:
    """
    Fetch all PMIDs for a query with pagination.
    """
    esearch_url = f"{base_url}/esearch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = 0.11 if api_key else 0.34
    max_results = 500
    ids: List[str] = []
    retstart = 0

    while len(ids) < max_results:
        batch_size = min(per_call, max_results - len(ids))
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "xml",
            "retmax": str(batch_size),
            "retstart": str(retstart),
            "sort": "pub_date",
            "tool": tool_name,
        }
        if email:
            params["email"] = email
        if api_key:
            params["api_key"] = api_key

        response = safe_post(esearch_url, data=params, session=session)
        root = parse_xml(response.content, "esearch_all")
        if root.findtext("ERROR"):
            raise RuntimeError(f"PubMed ESearch error: {root.findtext('ERROR')}")

        batch_ids = [elem.text for elem in root.findall("./IdList/Id") if elem.text]
        if not batch_ids:
            break

        ids.extend(batch_ids)
        retstart += len(batch_ids)
        if len(ids) >= max_results:
            break
        time.sleep(sleep_seconds)

    seen: Set[str] = set()
    unique_ids: List[str] = []
    for pmid in ids:
        if pmid not in seen:
            seen.add(pmid)
            unique_ids.append(pmid)
    return unique_ids[:max_results]


def is_author_match(
    article_author_first: Optional[str],
    article_author_last: Optional[str],
    target_first: Optional[str],
    target_last: Optional[str],
) -> bool:
    if not article_author_last or not target_last:
        return False

    article_last_norm = normalize_token(article_author_last)
    target_last_norm = normalize_token(target_last)
    if article_last_norm != target_last_norm:
        return False

    # If we do not have first name on the HCP record, last-name-only fallback.
    if not target_first:
        return True

    article_first_norm = normalize_token(article_author_first)
    target_first_norm = normalize_token(target_first)
    if not article_first_norm:
        return False

    return article_first_norm.startswith(target_first_norm[:1]) or target_first_norm.startswith(article_first_norm[:1])


def extract_publication_rows_for_hcp(
    articles: Sequence[ET.Element],
    hcp_id: str,
    first_name: Optional[str],
    last_name: Optional[str],
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    seen_pubmed_ids: Set[str] = set()

    for article in articles:
        pmid = text_or_none(article.find("./MedlineCitation/PMID"))
        if not pmid or pmid in seen_pubmed_ids:
            continue

        title = text_or_none(article.find("./MedlineCitation/Article/ArticleTitle"))
        journal = text_or_none(article.find("./MedlineCitation/Article/Journal/Title"))
        pub_year = parse_pub_year(article)
        doi = parse_doi(article)

        author_nodes = article.findall("./MedlineCitation/Article/AuthorList/Author")
        matched = False
        for author in author_nodes:
            if author.find("CollectiveName") is not None:
                continue
            article_first = clean_person_name(text_or_none(author.find("ForeName")) or text_or_none(author.find("Initials")))
            article_last = clean_person_name(text_or_none(author.find("LastName")))
            if is_author_match(article_first, article_last, first_name, last_name):
                matched = True
                break

        if not matched:
            continue

        seen_pubmed_ids.add(pmid)
        rows.append(
            {
                "hcp_id": hcp_id,
                "pubmed_id": pmid,
                "title": title,
                "journal": journal,
                "pub_year": pub_year,
                "citation_count": None,
                "doi": doi,
            }
        )

    return rows


def extract_records(articles: Sequence[ET.Element]) -> Tuple[Dict[str, HCPRecord], List[PublicationRecord]]:
    hcps_by_key: Dict[str, HCPRecord] = {}
    publication_records: List[PublicationRecord] = []

    for article in tqdm(articles, desc="ingesting publications", unit="pub"):
        pmid = text_or_none(article.find("./MedlineCitation/PMID"))
        if not pmid:
            continue

        title = text_or_none(article.find("./MedlineCitation/Article/ArticleTitle"))
        journal = text_or_none(article.find("./MedlineCitation/Article/Journal/Title"))
        pub_year = parse_pub_year(article)
        doi = parse_doi(article)

        author_nodes = article.findall("./MedlineCitation/Article/AuthorList/Author")
        if not author_nodes:
            continue

        for author in author_nodes:
            # Skip collaborators without structured names.
            if author.find("CollectiveName") is not None:
                continue

            first_name = clean_person_name(text_or_none(author.find("ForeName")) or text_or_none(author.find("Initials")))
            last_name = clean_person_name(text_or_none(author.find("LastName")))
            credentials = infer_credentials(text_or_none(author.find("Suffix")))

            aff_info_nodes = author.findall("./AffiliationInfo/Affiliation")
            affiliation = text_or_none(aff_info_nodes[0]) if aff_info_nodes else None
            institution, city, state, zip_code, country = parse_affiliation(affiliation)

            # If no meaningful name data exists, skip this author.
            if not first_name and not last_name:
                continue

            dedupe_key = build_dedupe_key(first_name, last_name, institution)
            if dedupe_key not in hcps_by_key:
                hcps_by_key[dedupe_key] = HCPRecord(
                    first_name=first_name,
                    last_name=last_name,
                    credentials=credentials,
                    institution=institution,
                    institution_full=affiliation,
                    city=city,
                    state=state,
                    zip_code=zip_code,
                    country=country,
                    specialty=None,
                    subspecialty=None,
                    dedupe_key=dedupe_key,
                )

            publication_records.append(
                PublicationRecord(
                    pubmed_id=pmid,
                    title=title,
                    journal=journal,
                    pub_year=pub_year,
                    citation_count=None,  # Not available directly in E-utilities efetch response.
                    doi=doi,
                    hcp_dedupe_key=dedupe_key,
                )
            )

    return hcps_by_key, publication_records


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def _hcp_row_dict(hcp: HCPRecord) -> Dict[str, object]:
    return {
        "npi_number": None,
        "first_name": hcp.first_name,
        "last_name": hcp.last_name,
        "credentials": hcp.credentials,
        "institution": hcp.institution,
        "institution_full": hcp.institution_full,
        "city": hcp.city,
        "state": hcp.state,
        "zip_code": hcp.zip_code,
        "country": hcp.country,
        "specialty": hcp.specialty,
        "subspecialty": hcp.subspecialty,
        "opt_out": False,
        "is_claimed": False,
    }


def _postgrest_eq_quoted(col: str, value: str) -> str:
    escaped = str(value).replace('"', '\\"')
    return f'{col}.eq."{escaped}"'


def _postgrest_and_clause_for_hcp(hcp: HCPRecord) -> str:
    """Single and(...) filter matching this HCP's natural key (PostgREST or= syntax)."""
    fn = hcp.first_name if hcp.first_name is not None else ""
    ln = hcp.last_name if hcp.last_name is not None else ""
    parts = [
        _postgrest_eq_quoted("first_name", fn),
        _postgrest_eq_quoted("last_name", ln),
    ]
    if hcp.institution is None:
        parts.append("institution.is.null")
    else:
        parts.append(_postgrest_eq_quoted("institution", hcp.institution))
    return f"and({','.join(parts)})"


def _fetch_hcp_ids_for_batch(supabase: Client, batch: Sequence[HCPRecord]) -> Dict[str, str]:
    """Resolve dedupe_key -> id for a batch via one select filtered by natural keys."""
    if not batch:
        return {}

    or_filter = ",".join(_postgrest_and_clause_for_hcp(h) for h in batch)
    try:
        response = supabase_execute(
            lambda: (
                supabase.table("hcps")
                .select("id,first_name,last_name,institution")
                .or_(or_filter)
                .execute()
            )
        )
    except Exception as exc:
        raise RuntimeError(f"Failed batch select for HCP ids: {exc}") from exc

    id_map: Dict[str, str] = {}
    for row in response.data or []:
        rid = row.get("id")
        if not rid:
            continue
        key = build_dedupe_key(
            row.get("first_name"),
            row.get("last_name"),
            row.get("institution"),
        )
        if key not in id_map:
            id_map[key] = rid
    return id_map


def upsert_hcps(supabase: Client, hcps: Sequence[HCPRecord]) -> Dict[str, str]:
    if not hcps:
        return {}

    batch_size = 50
    id_map: Dict[str, str] = {}

    for i in tqdm(range(0, len(hcps), batch_size), desc="upserting HCPs", unit="batch"):
        batch = list(hcps[i : i + batch_size])
        rows = [_hcp_row_dict(h) for h in batch]

        try:
            supabase_execute(
                lambda: supabase.table("hcps").upsert(
                    rows,
                    on_conflict="first_name,last_name,institution",
                    returning="representation",
                ).execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed batch upsert HCPs (batch starting at {i}): {exc}") from exc

        batch_ids = _fetch_hcp_ids_for_batch(supabase, batch)
        for hcp in batch:
            rid = batch_ids.get(hcp.dedupe_key)
            if rid:
                id_map[hcp.dedupe_key] = rid

        missing = [h for h in batch if h.dedupe_key not in id_map]
        for hcp in missing:
            try:
                q = (
                    supabase.table("hcps")
                    .select("id")
                    .eq("first_name", hcp.first_name)
                    .eq("last_name", hcp.last_name)
                )
                if hcp.institution is None:
                    q = q.is_("institution", "null")
                else:
                    q = q.eq("institution", hcp.institution)
                query = supabase_execute(lambda: q.limit(1).execute())
                qrows = query.data or []
                if qrows:
                    id_map[hcp.dedupe_key] = qrows[0]["id"]
            except Exception as exc:
                raise RuntimeError(f"Failed to fetch HCP id for key {hcp.dedupe_key}: {exc}") from exc

    return id_map


def upsert_publications(
    supabase: Client,
    publication_records: Sequence[PublicationRecord],
    hcp_id_map: Dict[str, str],
) -> int:
    publication_rows = []
    for record in publication_records:
        hcp_id = hcp_id_map.get(record.hcp_dedupe_key)
        if not hcp_id:
            continue
        publication_rows.append(
            {
                "hcp_id": hcp_id,
                "pubmed_id": record.pubmed_id,
                "title": record.title,
                "journal": record.journal,
                "pub_year": record.pub_year,
                "citation_count": record.citation_count,
                "doi": record.doi,
            }
        )

    if not publication_rows:
        return 0

    deduped: Dict[Tuple[str, str], Dict[str, object]] = {}
    for row in publication_rows:
        key = (row["hcp_id"], row["pubmed_id"])
        if key not in deduped:
            deduped[key] = row
    publication_rows = list(deduped.values())

    batch_size = 200
    progress_every = 1000
    processed = 0

    for i in range(0, len(publication_rows), batch_size):
        batch = publication_rows[i : i + batch_size]
        try:
            # Upsert assumes unique constraint on (hcp_id, pubmed_id).
            supabase_execute(
                lambda: supabase.table("publications").upsert(
                    batch,
                    on_conflict="hcp_id,pubmed_id",
                ).execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to upsert publication records batch starting at {i}: {exc}") from exc

        processed += len(batch)
        if processed % progress_every == 0:
            print(f"Publication upsert progress: {processed}/{len(publication_rows)}")

    return len(publication_rows)


def fetch_hcps_with_low_publication_counts(
    supabase: Client,
    max_publications: int = 2,
) -> List[Dict[str, object]]:
    try:
        hcps_response = supabase_execute(
            lambda: supabase.table("hcps").select("id,first_name,last_name").execute()
        )
        pubs_response = supabase_execute(
            lambda: supabase.table("publications").select("hcp_id,pubmed_id").execute()
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to load HCP/publication counts for second pass: {exc}") from exc

    pub_counts: Dict[str, int] = {}
    for row in pubs_response.data or []:
        hcp_id = row.get("hcp_id")
        if hcp_id:
            pub_counts[hcp_id] = pub_counts.get(hcp_id, 0) + 1

    low_pub_hcps: List[Dict[str, object]] = []
    for hcp in hcps_response.data or []:
        hcp_id = hcp.get("id")
        if not hcp_id:
            continue
        if pub_counts.get(hcp_id, 0) <= max_publications:
            low_pub_hcps.append(hcp)
    return low_pub_hcps


def run_author_enrichment_second_pass(
    supabase: Client,
    session: requests.Session,
    base_url: str,
    email: Optional[str],
    tool_name: str,
    per_call: int,
) -> int:
    """
    For HCPs with sparse publication history, fetch career-spanning author publications.
    """
    low_pub_hcps = fetch_hcps_with_low_publication_counts(supabase, max_publications=2)
    low_pub_hcps = low_pub_hcps[:500]
    if not low_pub_hcps:
        print("Second pass: no HCPs with fewer than 3 publications found.")
        return 0

    print(f"Second pass: found {len(low_pub_hcps)} HCPs with fewer than 3 publications.")
    total_upserted = 0
    for hcp in tqdm(low_pub_hcps, desc="enriching authors", unit="hcp"):
        hcp_id = hcp.get("id")
        first_name = clean_person_name(hcp.get("first_name"))
        last_name = clean_person_name(hcp.get("last_name"))
        if not hcp_id:
            continue

        author_query = build_author_query(first_name, last_name)
        if not author_query:
            continue

        try:
            pmids = pubmed_esearch_all(
                session=session,
                base_url=base_url,
                query=author_query,
                per_call=per_call,
                email=email,
                tool_name=tool_name,
            )
        except Exception as exc:
            print(f"Second pass warning: failed search for HCP {hcp_id}: {exc}")
            continue

        if not pmids:
            continue

        pmids = pmids[:50]

        try:
            articles = pubmed_efetch(
                session=session,
                base_url=base_url,
                pmids=pmids,
                email=email,
                tool_name=tool_name,
            )
            rows = extract_publication_rows_for_hcp(articles, hcp_id, first_name, last_name)
            if not rows:
                continue
            supabase_execute(
                lambda: supabase.table("publications").upsert(
                    rows,
                    on_conflict="hcp_id,pubmed_id",
                ).execute()
            )
            total_upserted += len(rows)
        except Exception as exc:
            print(f"Second pass warning: failed upsert for HCP {hcp_id}: {exc}")
            continue

    return total_upserted


def get_therapeutic_area_id_by_slug(supabase: Client, slug: str) -> str:
    try:
        response = supabase_execute(
            lambda: (
                supabase.table("therapeutic_areas")
                .select("id")
                .eq("slug", slug)
                .limit(1)
                .execute()
            )
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to query therapeutic area slug '{slug}': {exc}") from exc

    rows = response.data or []
    if not rows or not rows[0].get("id"):
        raise RuntimeError(f"No therapeutic_areas row found for slug '{slug}'.")
    return rows[0]["id"]


def upsert_hcp_therapeutic_area_links(
    supabase: Client,
    hcp_ids: Sequence[str],
    therapeutic_area_id: str,
) -> int:
    if not hcp_ids:
        return 0

    unique_hcp_ids = list({hcp_id for hcp_id in hcp_ids if hcp_id})
    if not unique_hcp_ids:
        return 0

    rows = [
        {
            "hcp_id": hcp_id,
            "therapeutic_area_id": therapeutic_area_id,
            "strength_score": 0,
        }
        for hcp_id in unique_hcp_ids
    ]

    try:
        supabase_execute(
            lambda: supabase.table("hcp_therapeutic_areas").upsert(
                rows,
                on_conflict="hcp_id,therapeutic_area_id",
            ).execute()
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to upsert hcp_therapeutic_areas links: {exc}") from exc

    return len(rows)


def run_pipeline(args: Optional[argparse.Namespace] = None) -> None:
    base_url = os.getenv("PUBMED_API_BASE", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils")
    tool_name = os.getenv("PUBMED_TOOL", "fieldmark_pubmed_pipeline")
    email = os.getenv("PUBMED_EMAIL")
    per_call = int(os.getenv("PUBMED_RETMAX_PER_CALL", "100"))
    dry_run = bool(args and args.dry_run)

    ta_slugs_to_run = (
        [slug.strip() for slug in args.ta.split(",") if slug.strip()]
        if args and args.ta
        else list_ta_configs()
    )
    if not ta_slugs_to_run:
        raise RuntimeError("No TA configs found in config/therapeutic_areas/")

    session = build_http_session()
    supabase: Optional[Client] = None
    if not dry_run:
        supabase = init_supabase()
    elif dry_run:
        print("[DRY RUN] No Supabase writes will be performed.")

    for ta_slug in ta_slugs_to_run:
        cfg = load_ta_config(ta_slug)
        pubmed_cfg = cfg.get("pubmed") or {}
        print("Ingestion mode: global (geographic filtering deferred to enrichment)")
        query_text = pubmed_cfg["global_query"]
        query_label = f"{cfg['name']}"
        print(f"\n--- Processing query: {query_label} ({ta_slug}) ---")

        therapeutic_area_id = cfg["ta_uuid"]
        print(f"Using therapeutic_area_id={therapeutic_area_id} from config")

        retrieval_cfg = pubmed_cfg.get("retrieval") or {}
        recall = retrieval_cfg.get("recall", "unknown")
        source = retrieval_cfg.get("source", "unknown")
        print(f"Retrieval strategy: recall={recall}, source={source}")

        years_back = resolve_years_back(pubmed_cfg)
        days_back = years_back_to_days(years_back)
        if years_back is not None:
            print(
                f"Using years_back={years_back} "
                f"(publication date filter, {days_back} days)"
            )
        else:
            print("No time filter (full PubMed history)")

        config_max_results = resolve_max_results(pubmed_cfg)
        max_results = config_max_results
        if args and args.limit:
            max_results = min(max_results, args.limit) if max_results is not None else args.limit

        if config_max_results is None:
            print(
                "[WARN] Unlimited fetch mode: no max_results cap; "
                "paginating until PubMed returns no more IDs."
            )
        else:
            print(f"Using max_results={config_max_results}")
        if args and args.limit:
            print(f"Applying CLI --limit={args.limit} (effective fetch cap: {max_results})")

        total_available = pubmed_esearch_count(
            session=session,
            base_url=base_url,
            query=query_text,
            days_back=days_back,
            email=email,
            tool_name=tool_name,
        )
        print(f"PubMed reports {total_available:,} total matching PMIDs for this query/window.")

        print("Searching PubMed...")
        pmids = pubmed_esearch(
            session=session,
            base_url=base_url,
            query=query_text,
            days_back=days_back,
            max_results=max_results,
            per_call=per_call,
            email=email,
            tool_name=tool_name,
        )
        if not pmids:
            print(f"No PubMed results found for {query_label}.")
            continue
        print(f"Found {len(pmids)} publication IDs.")

        print("Fetching publication details...")
        articles = pubmed_efetch(
            session=session,
            base_url=base_url,
            pmids=pmids,
            email=email,
            tool_name=tool_name,
        )
        if not articles:
            print(f"No article payloads returned by efetch for {query_label}.")
            continue

        hcps_by_key, publication_records = extract_records(articles)
        unique_hcps = list(hcps_by_key.values())
        print(
            f"Extracted {len(unique_hcps)} unique HCP profiles and "
            f"{len(publication_records)} author-publication links."
        )

        if dry_run:
            print("Sample publication titles:")
            for article in articles[:5]:
                title = text_or_none(article.find("./MedlineCitation/Article/ArticleTitle"))
                print(f"  - {title or '(no title)'}")
            continue

        assert supabase is not None

        print("Upserting HCPs into Supabase...")
        hcp_id_map = upsert_hcps(supabase, unique_hcps)
        print(f"Mapped {len(hcp_id_map)} HCP keys to DB IDs.")

        print("Upserting publications into Supabase...")
        inserted_or_updated = upsert_publications(supabase, publication_records, hcp_id_map)
        print(f"Upserted {inserted_or_updated} publication rows.")

        print("Upserting HCP therapeutic area links...")
        link_count = upsert_hcp_therapeutic_area_links(
            supabase=supabase,
            hcp_ids=list(hcp_id_map.values()),
            therapeutic_area_id=therapeutic_area_id,
        )
        print(f"Upserted {link_count} hcp_therapeutic_areas rows for {query_label}.")

    if dry_run:
        print("Dry run completed.")
        return

    assert supabase is not None
    print("Starting second pass author enrichment...")
    second_pass_count = run_author_enrichment_second_pass(
        supabase=supabase,
        session=session,
        base_url=base_url,
        email=email,
        tool_name=tool_name,
        per_call=per_call,
    )
    print(f"Second pass upserted {second_pass_count} publication rows.")
    print("Pipeline run completed.")


def main() -> None:
    parser = argparse.ArgumentParser(description="PubMed -> Supabase pipeline for FieldMark")
    parser.add_argument(
        "--ta",
        type=str,
        default=None,
        help="Single TA slug or comma-separated list (default: all configs in config/therapeutic_areas/)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch PubMed results and print samples without writing to Supabase",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap PMIDs per TA (testing)",
    )
    args = parser.parse_args()
    run_pipeline(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"[ERROR] Pipeline failed: {error}")
        raise
