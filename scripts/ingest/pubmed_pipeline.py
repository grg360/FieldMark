"""
PubMed -> Supabase pipeline for FieldMark.

This script:
1) Queries PubMed for recent rare-disease related publications.
2) Extracts publication and author affiliation metadata.
3) Deduplicates authors into unique HCP profiles.
4) Stores HCPs and linked publication rows in Supabase v2 tables
   (hcps_v2, publications_v2, publication_authors_v2, hcp_therapeutic_areas_v2,
   publication_therapeutic_areas_v2).

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
import hashlib
import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple, TypeVar

from dotenv import load_dotenv

load_dotenv()
from xml.etree import ElementTree as ET

import httpx
import requests
from requests import Response
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions
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
    author_position: Optional[int] = None
    total_authors: Optional[int] = None
    is_first_author: Optional[bool] = None
    is_senior_author: Optional[bool] = None
    hcp_id: Optional[str] = None


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


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
HCP_UPSERT_BATCH_SIZE = 100
PUBLICATION_UPSERT_BATCH_SIZE = 200
TA_LINK_UPSERT_BATCH_SIZE = 200
CHECKPOINT_EVERY_N_BATCHES = 10

HCPS_TABLE = "hcps_v2"
PUBLICATIONS_TABLE = "publications_v2"
PUBLICATION_AUTHORS_TABLE = "publication_authors_v2"
HCP_THERAPEUTIC_AREAS_TABLE = "hcp_therapeutic_areas_v2"
PUBLICATION_THERAPEUTIC_AREAS_TABLE = "publication_therapeutic_areas_v2"
PUBMED_SOURCE = "pubmed"
CHECKPOINT_FILENAME_SUFFIX = "_v2"


def get_checkpoint_path(ta_slug: str) -> Path:
    return REPO_ROOT / f"pubmed_checkpoint_{ta_slug}{CHECKPOINT_FILENAME_SUFFIX}.json"


def fresh_checkpoint(ta_slug: str) -> Dict[str, Any]:
    return {
        "ta_slug": ta_slug,
        "phases": {
            "pmid_retrieval": {"complete": False, "pmids": []},
            "efetch": {"complete": False, "publications_fetched_count": 0},
            "publication_upsert": {"complete_batches": 0, "total_batches": 0},
            "hcp_extract": {"complete": False, "unique_hcps_count": 0},
            "hcp_upsert": {"complete_batches": 0, "total_batches": 0},
            "author_link_upsert": {"complete_batches": 0, "total_batches": 0},
            "publication_ta_link_upsert": {"complete_batches": 0, "total_batches": 0},
            "ta_link_upsert": {"complete_batches": 0, "total_batches": 0},
        },
        "updated_at": None,
    }


def normalize_checkpoint(data: Dict[str, Any], ta_slug: str) -> Dict[str, Any]:
    checkpoint = fresh_checkpoint(ta_slug)
    if isinstance(data.get("phases"), dict):
        for phase_name, phase_state in data["phases"].items():
            if phase_name not in checkpoint["phases"]:
                continue
            if isinstance(phase_state, dict):
                checkpoint["phases"][phase_name].update(phase_state)
            else:
                checkpoint["phases"][phase_name] = phase_state
    checkpoint["ta_slug"] = ta_slug
    if data.get("updated_at"):
        checkpoint["updated_at"] = data["updated_at"]
    return checkpoint


def load_checkpoint(ta_slug: str) -> Dict[str, Any]:
    path = get_checkpoint_path(ta_slug)
    if not path.is_file():
        return fresh_checkpoint(ta_slug)
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            print(f"[WARN] Checkpoint file {path.name}: expected JSON object; starting fresh.")
            return fresh_checkpoint(ta_slug)
        return normalize_checkpoint(data, ta_slug)
    except json.JSONDecodeError as exc:
        print(f"[WARN] Checkpoint file {path.name} corrupt or invalid JSON ({exc}); starting fresh.")
        return fresh_checkpoint(ta_slug)
    except OSError as exc:
        print(f"[WARN] Could not read checkpoint file {path.name} ({exc}); starting fresh.")
        return fresh_checkpoint(ta_slug)


def save_checkpoint(checkpoint: Dict[str, Any], ta_slug: str) -> None:
    checkpoint["ta_slug"] = ta_slug
    checkpoint["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    path = get_checkpoint_path(ta_slug)
    try:
        path.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
    except OSError as exc:
        print(f"[WARN] Could not write checkpoint file {path.name}: {exc}")


def is_hcp_upsert_complete(checkpoint: Dict[str, Any], total_batches: Optional[int] = None) -> bool:
    phase = checkpoint["phases"]["hcp_upsert"]
    total = total_batches if total_batches is not None else (phase.get("total_batches") or 0)
    complete = phase.get("complete_batches", 0) or 0
    if total <= 0:
        return False
    # Stale checkpoint from a prior batch-size / HCP-count scale (e.g. complete_batches=5730
    # at size 15 vs total_batches=1916 at size 100) must not be treated as complete.
    if complete > total:
        return False
    return complete >= total


def resolve_hcp_upsert_start_batch(checkpoint: Dict[str, Any], total_batches: int) -> int:
    """Return the first batch index to upsert; clamp stale checkpoint batch counters."""
    phase = checkpoint["phases"]["hcp_upsert"]
    complete = phase.get("complete_batches", 0) or 0
    if total_batches <= 0:
        return 0
    if complete > total_batches:
        print(
            f"[WARN] Checkpoint hcp_upsert.complete_batches ({complete}) exceeds "
            f"current total_batches ({total_batches}) — likely a batch-size or scale change. "
            f"Resetting HCP upsert start to batch 0."
        )
        return 0
    if complete >= total_batches:
        return total_batches
    return complete


def is_batch_phase_complete(checkpoint: Dict[str, Any], phase_name: str) -> bool:
    phase = checkpoint["phases"][phase_name]
    total = phase.get("total_batches") or 0
    return total > 0 and phase.get("complete_batches", 0) >= total


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


def compute_identity_hash(
    first_name: Optional[str],
    last_name: Optional[str],
    institution: Optional[str],
) -> str:
    """Match hcps_v2.identity_hash: md5(coalesce(fn,'') || '|' || coalesce(ln,'') || '|' || coalesce(inst,''))."""
    fn = first_name if first_name is not None else ""
    ln = last_name if last_name is not None else ""
    inst = institution if institution is not None else ""
    payload = f"{fn}|{ln}|{inst}"
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


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
    mindate: Optional[str] = None,
    maxdate: Optional[str] = None,
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
    if mindate and maxdate:
        params["datetype"] = "pdat"
        params["mindate"] = mindate
        params["maxdate"] = maxdate
    elif days_back is not None:
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
    mindate: Optional[str] = None,
    maxdate: Optional[str] = None,
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
        mindate=mindate,
        maxdate=maxdate,
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
        if mindate and maxdate:
            # The >9999 chunker splits by year (days_back) or decade (full corpus); it has no
            # chunker for an arbitrary explicit range, so decade-chunking would silently ignore
            # the window. Fail loudly instead of over-fetching the whole corpus.
            raise RuntimeError(
                f"Explicit --mindate/--maxdate window returned {total_count:,} PMIDs (> "
                f"{PUBMED_HISTORY_MAX_PMIDS}); this path cannot page an arbitrary range. "
                f"Use --days N for large windows, or narrow the range."
            )
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

        valid_authors: List[Tuple[ET.Element, Optional[str], Optional[str], Optional[str], Optional[str]]] = []
        for author in author_nodes:
            if author.find("CollectiveName") is not None:
                continue

            first_name = clean_person_name(
                text_or_none(author.find("ForeName")) or text_or_none(author.find("Initials"))
            )
            last_name = clean_person_name(text_or_none(author.find("LastName")))
            credentials = infer_credentials(text_or_none(author.find("Suffix")))
            aff_info_nodes = author.findall("./AffiliationInfo/Affiliation")
            affiliation = text_or_none(aff_info_nodes[0]) if aff_info_nodes else None

            if not first_name and not last_name:
                continue

            valid_authors.append((author, first_name, last_name, credentials, affiliation))

        if not valid_authors:
            continue

        total_authors = len(valid_authors)
        for position, (_author, first_name, last_name, credentials, affiliation) in enumerate(valid_authors):
            institution, city, state, zip_code, country = parse_affiliation(affiliation)

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

            author_position = position + 1
            publication_records.append(
                PublicationRecord(
                    pubmed_id=pmid,
                    title=title,
                    journal=journal,
                    pub_year=pub_year,
                    citation_count=None,  # Not available directly in E-utilities efetch response.
                    doi=doi,
                    hcp_dedupe_key=dedupe_key,
                    author_position=author_position,
                    total_authors=total_authors,
                    is_first_author=position == 0,
                    is_senior_author=position == total_authors - 1 and total_authors > 1,
                )
            )

    return hcps_by_key, publication_records


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    # HTTP/1.1 avoids httpx HTTP/2 stream exhaustion (~20k streams per connection).
    httpx_client = httpx.Client(http2=False, follow_redirects=True)
    options = SyncClientOptions(httpx_client=httpx_client)
    return create_client(supabase_url, supabase_key, options)


def _hcp_v2_row_dict(hcp: HCPRecord) -> Dict[str, object]:
    """Fixed key set for every HCP upsert row (explicit nulls for shape consistency)."""
    institution_raw = hcp.institution_full or hcp.institution
    return {
        "identity_hash": compute_identity_hash(hcp.first_name, hcp.last_name, hcp.institution),
        "first_name": hcp.first_name,
        "last_name": hcp.last_name or "Unknown",
        "credentials": hcp.credentials,
        "institution_raw": institution_raw,
        "institution_normalized": hcp.institution,
        "country": hcp.country,
        "nppes_practice_city": hcp.city,
        "nppes_practice_state": hcp.state,
    }


HCP_ID_LOOKUP_CHUNK_SIZE = 100


def _fetch_hcp_ids_for_batch(supabase: Client, batch: Sequence[HCPRecord]) -> Dict[str, str]:
    """Resolve dedupe_key -> id for a batch via identity_hash IN lookup."""
    if not batch:
        return {}

    hash_to_dedupe_key: Dict[str, str] = {}
    for hcp in batch:
        identity_hash = compute_identity_hash(hcp.first_name, hcp.last_name, hcp.institution)
        hash_to_dedupe_key[identity_hash] = hcp.dedupe_key

    id_map: Dict[str, str] = {}
    for start in range(0, len(batch), HCP_ID_LOOKUP_CHUNK_SIZE):
        chunk = batch[start : start + HCP_ID_LOOKUP_CHUNK_SIZE]
        identity_hashes = [
            compute_identity_hash(h.first_name, h.last_name, h.institution) for h in chunk
        ]
        try:
            response = supabase_execute(
                lambda hashes=identity_hashes: (
                    supabase.table(HCPS_TABLE)
                    .select("id,identity_hash")
                    .in_("identity_hash", hashes)
                    .execute()
                )
            )
        except Exception:
            print("[DIAG] PostgREST batch select failed in _fetch_hcp_ids_for_batch")
            print("[DIAG] lookup_method: identity_hash in_ filter")
            print(f"[DIAG] identity_hashes: {identity_hashes}")
            for diag_hcp in chunk:
                print(
                    "[DIAG] HCP record: "
                    f"dedupe_key={diag_hcp.dedupe_key} "
                    f"first_name={diag_hcp.first_name} "
                    f"last_name={diag_hcp.last_name} "
                    f"institution={diag_hcp.institution}"
                )
                print(
                    "[DIAG] repr: "
                    f"first_name={repr(diag_hcp.first_name)} "
                    f"last_name={repr(diag_hcp.last_name)} "
                    f"institution={repr(diag_hcp.institution)}"
                )
            raise

        for row in response.data or []:
            rid = row.get("id")
            identity_hash = row.get("identity_hash")
            if not rid or not identity_hash:
                continue
            dedupe_key = hash_to_dedupe_key.get(identity_hash)
            if dedupe_key and dedupe_key not in id_map:
                id_map[dedupe_key] = rid
    return id_map


def upsert_hcps(
    supabase: Client,
    hcps: Sequence[HCPRecord],
    start_batch: int = 0,
    on_batch_complete: Optional[Callable[[int, int], None]] = None,
) -> Dict[str, str]:
    if not hcps:
        return {}

    batch_size = HCP_UPSERT_BATCH_SIZE
    id_map: Dict[str, str] = {}
    total_batches = (len(hcps) + batch_size - 1) // batch_size
    batches_upserted = 0
    rows_upserted = 0
    batches_lookup_only = 0

    if start_batch > 0:
        if start_batch >= total_batches:
            print(
                f"HCP upsert: all {total_batches} batches already complete; "
                f"rebuilding ID map via lookup only..."
            )
        else:
            print(
                f"Resuming HCP upsert from batch {start_batch + 1}/{total_batches} "
                f"(rebuilding ID map for {start_batch} prior batches)..."
            )

    for batch_idx in tqdm(range(total_batches), desc="upserting HCPs", unit="batch"):
        i = batch_idx * batch_size
        batch = list(hcps[i : i + batch_size])

        if batch_idx < start_batch:
            batches_lookup_only += 1
            batch_ids = _fetch_hcp_ids_for_batch(supabase, batch)
            for hcp in batch:
                rid = batch_ids.get(hcp.dedupe_key)
                if rid:
                    id_map[hcp.dedupe_key] = rid
            continue

        rows = [_hcp_v2_row_dict(h) for h in batch]

        try:
            response = supabase_execute(
                lambda upsert_rows=rows: supabase.table(HCPS_TABLE).upsert(
                    upsert_rows,
                    on_conflict="identity_hash",
                    returning="representation",
                ).execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed batch upsert HCPs (batch starting at {i}): {exc}") from exc

        returned_rows = response.data or []
        if len(returned_rows) < len(rows):
            print(
                f"[WARN] HCP upsert batch {batch_idx + 1}/{total_batches}: "
                f"sent {len(rows)} rows, PostgREST returned {len(returned_rows)}."
            )
        batches_upserted += 1
        rows_upserted += len(rows)

        batch_ids = _fetch_hcp_ids_for_batch(supabase, batch)
        for hcp in batch:
            rid = batch_ids.get(hcp.dedupe_key)
            if rid:
                id_map[hcp.dedupe_key] = rid

        missing = [h for h in batch if h.dedupe_key not in id_map]
        for hcp in missing:
            try:
                identity_hash = compute_identity_hash(
                    hcp.first_name, hcp.last_name, hcp.institution
                )
                query = supabase_execute(
                    lambda ih=identity_hash: (
                        supabase.table(HCPS_TABLE)
                        .select("id")
                        .eq("identity_hash", ih)
                        .limit(1)
                        .execute()
                    )
                )
                qrows = query.data or []
                if qrows:
                    id_map[hcp.dedupe_key] = qrows[0]["id"]
            except Exception as exc:
                raise RuntimeError(f"Failed to fetch HCP id for key {hcp.dedupe_key}: {exc}") from exc

        if on_batch_complete:
            on_batch_complete(batch_idx + 1, total_batches)

    print(
        f"HCP upsert summary: {batches_upserted} write batches ({rows_upserted:,} rows), "
        f"{batches_lookup_only} lookup-only batches skipped, "
        f"{len(id_map):,} dedupe keys mapped to IDs."
    )
    return id_map


def _resolve_hcp_id(record: PublicationRecord, hcp_id_map: Dict[str, str]) -> Optional[str]:
    if record.hcp_id:
        return record.hcp_id
    return hcp_id_map.get(record.hcp_dedupe_key)


def _publication_v2_row(record: PublicationRecord, therapeutic_area_id: Optional[str]) -> Dict[str, object]:
    """Fixed key set for every publication upsert row (explicit nulls for shape consistency).

    NOTE: ingestion_run_id is intentionally NOT in this payload. Including it would make the
    on_conflict="pubmed_id" upsert overwrite it on every re-ingest (last-wrote semantics). It is
    INSERT-ONLY: stamped in upsert_publications on rows where it is still NULL (created-by).
    """
    return {
        "pubmed_id": record.pubmed_id,
        "doi": record.doi,
        "openalex_work_id": None,
        "title": record.title,
        "abstract": None,
        "journal": record.journal,
        "pub_year": record.pub_year,
        "pub_date": None,
        "language": None,
        "pubmed_authorships": None,
        "mesh_terms": None,
        "publication_types": None,
        "citation_count": record.citation_count,
        "citation_counts_by_year": None,
        "openalex_enriched_at": None,
        "source_therapeutic_area_id": therapeutic_area_id,
        "source": PUBMED_SOURCE,
        # ingestion_run_id deliberately omitted -> excluded from the ON CONFLICT UPDATE set,
        # so a re-ingest never overwrites a pre-existing value. Stamped insert-only below.
    }


def _backfill_source_therapeutic_area_id(
    supabase: Client,
    pmids: Sequence[str],
    therapeutic_area_id: str,
) -> None:
    """Set source_therapeutic_area_id on existing rows where still NULL.

    ingest_publications.py uses the same explicit backfill because blind upsert on
    pubmed_id conflict does not reliably populate this column on pre-existing rows.
    """
    if not pmids or not therapeutic_area_id:
        return

    unique_pmids = list({pmid for pmid in pmids if pmid})
    chunk_size = PUBLICATION_UPSERT_BATCH_SIZE
    for start in range(0, len(unique_pmids), chunk_size):
        chunk = unique_pmids[start : start + chunk_size]
        supabase_execute(
            lambda ids=chunk, ta_id=therapeutic_area_id: (
                supabase.table(PUBLICATIONS_TABLE)
                .update({"source_therapeutic_area_id": ta_id})
                .in_("pubmed_id", ids)
                .is_("source_therapeutic_area_id", "null")
                .execute()
            )
        )


def _tag_publications_for_therapeutic_area(
    supabase: Client,
    pmids: Sequence[str],
    therapeutic_area_id: str,
) -> int:
    if not pmids or not therapeutic_area_id:
        return 0

    _backfill_source_therapeutic_area_id(supabase, pmids, therapeutic_area_id)
    pmid_to_id = _fetch_publication_ids_for_pmids(supabase, pmids)
    publication_ids = list(pmid_to_id.values())
    if not publication_ids:
        return 0
    return upsert_publication_therapeutic_area_links(
        supabase=supabase,
        publication_ids=publication_ids,
        therapeutic_area_id=therapeutic_area_id,
    )


def _author_link_row(publication_id: str, record: PublicationRecord, hcp_id: str) -> Dict[str, object]:
    """Fixed key set for every author-link upsert row (explicit nulls for shape consistency)."""
    return {
        "publication_id": publication_id,
        "hcp_id": hcp_id,
        "author_position": record.author_position,
        "is_first_author": record.is_first_author,
        "is_senior_author": record.is_senior_author,
        "total_authors": record.total_authors,
        "openalex_author_id": None,
        "disambiguation_method": None,
        "disambiguation_confidence": None,
    }


def _fetch_publication_ids_for_pmids(supabase: Client, pmids: Sequence[str]) -> Dict[str, str]:
    if not pmids:
        return {}

    pmid_to_id: Dict[str, str] = {}
    unique_pmids = list({pmid for pmid in pmids if pmid})
    chunk_size = PUBLICATION_UPSERT_BATCH_SIZE
    for start in range(0, len(unique_pmids), chunk_size):
        chunk = unique_pmids[start : start + chunk_size]
        response = supabase_execute(
            lambda ids=chunk: (
                supabase.table(PUBLICATIONS_TABLE)
                .select("id,pubmed_id")
                .in_("pubmed_id", ids)
                .execute()
            )
        )
        for row in response.data or []:
            pubmed_id = row.get("pubmed_id")
            publication_id = row.get("id")
            if pubmed_id and publication_id and pubmed_id not in pmid_to_id:
                pmid_to_id[pubmed_id] = publication_id
    return pmid_to_id


def summarize_v2_write_counts(
    unique_hcps: Sequence[HCPRecord],
    publication_records: Sequence[PublicationRecord],
) -> Dict[str, int]:
    unique_pmids = {record.pubmed_id for record in publication_records}
    return {
        HCPS_TABLE: len(unique_hcps),
        PUBLICATIONS_TABLE: len(unique_pmids),
        PUBLICATION_AUTHORS_TABLE: len(publication_records),
        HCP_THERAPEUTIC_AREAS_TABLE: len(unique_hcps),
        PUBLICATION_THERAPEUTIC_AREAS_TABLE: len(unique_pmids),
    }


def upsert_publications(
    supabase: Client,
    publication_records: Sequence[PublicationRecord],
    hcp_id_map: Dict[str, str],
    therapeutic_area_id: Optional[str],
    start_batch: int = 0,
    on_batch_complete: Optional[Callable[[int, int], None]] = None,
    ingestion_run_id: Optional[str] = None,
) -> Tuple[int, int]:
    pubs_by_pmid: Dict[str, Dict[str, object]] = {}
    author_links_by_pmid: Dict[str, List[Tuple[PublicationRecord, str]]] = defaultdict(list)

    for record in publication_records:
        hcp_id = _resolve_hcp_id(record, hcp_id_map)
        if not hcp_id:
            continue
        if record.pubmed_id not in pubs_by_pmid:
            pubs_by_pmid[record.pubmed_id] = _publication_v2_row(record, therapeutic_area_id)
        author_links_by_pmid[record.pubmed_id].append((record, hcp_id))

    publication_rows = list(pubs_by_pmid.values())
    if not publication_rows:
        return 0, 0

    ordered_pmids = [row["pubmed_id"] for row in publication_rows if row.get("pubmed_id")]
    batch_size = PUBLICATION_UPSERT_BATCH_SIZE
    total_batches = (len(publication_rows) + batch_size - 1) // batch_size
    author_link_count = 0

    if start_batch > 0:
        print(
            f"Resuming publication upsert from batch {start_batch + 1}/{total_batches} "
            f"(skipping {start_batch} prior batches)..."
        )

    for batch_idx in range(total_batches):
        if batch_idx < start_batch:
            continue

        i = batch_idx * batch_size
        batch = publication_rows[i : i + batch_size]
        batch_pmids = [str(row["pubmed_id"]) for row in batch if row.get("pubmed_id")]

        try:
            response = supabase_execute(
                lambda rows=batch: supabase.table(PUBLICATIONS_TABLE).upsert(
                    rows,
                    on_conflict="pubmed_id",
                    returning="representation",
                ).execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to upsert publications_v2 batch starting at {i}: {exc}") from exc

        # INSERT-ONLY stamp of ingestion_run_id (created-by semantics). The column was excluded
        # from the upsert payload, so pre-existing rows are untouched above; here we set it ONLY
        # where it is still NULL -- i.e. the rows this run just inserted. Rows created by an
        # earlier run keep their original ingestion_run_id (never overwritten).
        if ingestion_run_id and batch_pmids:
            try:
                supabase_execute(
                    lambda pmids=batch_pmids: supabase.table(PUBLICATIONS_TABLE)
                    .update({"ingestion_run_id": ingestion_run_id})
                    .in_("pubmed_id", pmids)
                    .is_("ingestion_run_id", "null")
                    .execute()
                )
            except Exception as exc:
                print(f"  [warn] ingestion_run_id insert-only stamp failed for batch at {i}: {exc}")

        pmid_to_id = {
            str(row["pubmed_id"]): row["id"]
            for row in (response.data or [])
            if row.get("pubmed_id") and row.get("id")
        }
        missing_pmids = [pmid for pmid in batch_pmids if pmid not in pmid_to_id]
        if missing_pmids:
            pmid_to_id.update(_fetch_publication_ids_for_pmids(supabase, missing_pmids))

        author_rows: List[Dict[str, object]] = []
        deduped_author_keys: Set[Tuple[str, str]] = set()
        for pmid in batch_pmids:
            publication_id = pmid_to_id.get(pmid)
            if not publication_id:
                continue
            for record, hcp_id in author_links_by_pmid.get(pmid, []):
                key = (publication_id, hcp_id)
                if key in deduped_author_keys:
                    continue
                deduped_author_keys.add(key)
                author_rows.append(_author_link_row(publication_id, record, hcp_id))

        if author_rows:
            try:
                supabase_execute(
                    lambda rows=author_rows: supabase.table(PUBLICATION_AUTHORS_TABLE).upsert(
                        rows,
                        on_conflict="publication_id,hcp_id",
                    ).execute()
                )
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to upsert publication_authors_v2 batch starting at {i}: {exc}"
                ) from exc
            author_link_count += len(author_rows)

        if therapeutic_area_id and batch_pmids:
            _tag_publications_for_therapeutic_area(
                supabase, batch_pmids, therapeutic_area_id
            )

        if on_batch_complete:
            on_batch_complete(batch_idx + 1, total_batches)

    return len(publication_rows), author_link_count


def fetch_hcps_with_low_publication_counts(
    supabase: Client,
    max_publications: int = 2,
) -> List[Dict[str, object]]:
    try:
        hcps_response = supabase_execute(
            lambda: supabase.table(HCPS_TABLE).select("id,first_name,last_name").execute()
        )
        pubs_response = supabase_execute(
            lambda: supabase.table(PUBLICATION_AUTHORS_TABLE).select("hcp_id,publication_id").execute()
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
    therapeutic_area_id: str,
    ingestion_run_id: Optional[str] = None,
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
            publication_records = [
                PublicationRecord(
                    pubmed_id=str(row["pubmed_id"]),
                    title=row.get("title"),
                    journal=row.get("journal"),
                    pub_year=row.get("pub_year"),
                    citation_count=row.get("citation_count"),
                    doi=row.get("doi"),
                    hcp_dedupe_key="",
                    hcp_id=hcp_id,
                )
                for row in rows
            ]
            pub_count, author_count = upsert_publications(
                supabase=supabase,
                publication_records=publication_records,
                hcp_id_map={},
                therapeutic_area_id=therapeutic_area_id,
                ingestion_run_id=ingestion_run_id,
            )
            total_upserted += author_count or pub_count
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
    publication_counts: Optional[Dict[str, int]] = None,
    start_batch: int = 0,
    on_batch_complete: Optional[Callable[[int, int], None]] = None,
) -> int:
    if not hcp_ids:
        return 0

    unique_hcp_ids = list({hcp_id for hcp_id in hcp_ids if hcp_id})
    if not unique_hcp_ids:
        return 0

    batch_size = TA_LINK_UPSERT_BATCH_SIZE
    total_batches = (len(unique_hcp_ids) + batch_size - 1) // batch_size
    upserted = 0

    if start_batch > 0:
        print(
            f"Resuming HCP TA link upsert from batch {start_batch + 1}/{total_batches} "
            f"(skipping {start_batch} prior batches)..."
        )

    for batch_idx in range(total_batches):
        if batch_idx < start_batch:
            upserted += min(batch_size, len(unique_hcp_ids) - batch_idx * batch_size)
            continue

        i = batch_idx * batch_size
        batch_ids = unique_hcp_ids[i : i + batch_size]
        rows = [
            {
                "hcp_id": hcp_id,
                "therapeutic_area_id": therapeutic_area_id,
                "publication_count": (publication_counts or {}).get(hcp_id, 0),
            }
            for hcp_id in batch_ids
        ]

        try:
            supabase_execute(
                lambda: supabase.table(HCP_THERAPEUTIC_AREAS_TABLE).upsert(
                    rows,
                    on_conflict="hcp_id,therapeutic_area_id",
                ).execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to upsert hcp_therapeutic_areas_v2 links: {exc}") from exc

        upserted += len(rows)
        if on_batch_complete:
            on_batch_complete(batch_idx + 1, total_batches)

    return upserted


def upsert_publication_therapeutic_area_links(
    supabase: Client,
    publication_ids: Sequence[str],
    therapeutic_area_id: str,
    start_batch: int = 0,
    on_batch_complete: Optional[Callable[[int, int], None]] = None,
) -> int:
    if not publication_ids:
        return 0

    unique_publication_ids = list({publication_id for publication_id in publication_ids if publication_id})
    if not unique_publication_ids:
        return 0

    batch_size = TA_LINK_UPSERT_BATCH_SIZE
    total_batches = (len(unique_publication_ids) + batch_size - 1) // batch_size
    upserted = 0

    if start_batch > 0:
        print(
            f"Resuming publication TA link upsert from batch {start_batch + 1}/{total_batches} "
            f"(skipping {start_batch} prior batches)..."
        )

    for batch_idx in range(total_batches):
        if batch_idx < start_batch:
            upserted += min(batch_size, len(unique_publication_ids) - batch_idx * batch_size)
            continue

        i = batch_idx * batch_size
        batch_ids = unique_publication_ids[i : i + batch_size]
        rows = [
            {
                "publication_id": publication_id,
                "therapeutic_area_id": therapeutic_area_id,
                "source": PUBMED_SOURCE,
            }
            for publication_id in batch_ids
        ]

        try:
            supabase_execute(
                lambda: supabase.table(PUBLICATION_THERAPEUTIC_AREAS_TABLE).upsert(
                    rows,
                    on_conflict="publication_id,therapeutic_area_id",
                ).execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to upsert publication_therapeutic_areas_v2 links: {exc}") from exc

        upserted += len(rows)
        if on_batch_complete:
            on_batch_complete(batch_idx + 1, total_batches)

    return upserted


def run_pipeline(args: Optional[argparse.Namespace] = None) -> Optional[str]:
    # One id per ingest run, stamped onto every publications_v2 row written by this run so the
    # batch is identifiable. Printed in a parseable form (and returned) for an orchestrator to
    # capture and pass to downstream stages as --ingestion-run-id.
    ingestion_run_id = str(uuid.uuid4())
    print(f"[pubmed_pipeline] ingestion_run_id={ingestion_run_id}")

    base_url = os.getenv("PUBMED_API_BASE", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils")
    tool_name = os.getenv("PUBMED_TOOL", "fieldmark_pubmed_pipeline")
    email = os.getenv("PUBMED_EMAIL")
    per_call = int(os.getenv("PUBMED_RETMAX_PER_CALL", "100"))
    dry_run = bool(args and args.dry_run)
    reset_checkpoint = bool(args and args.reset_checkpoint)
    resume = bool(args and args.resume)

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
        checkpoint_path = get_checkpoint_path(ta_slug)
        checkpoint: Optional[Dict[str, Any]] = None

        if not dry_run:
            if resume and not checkpoint_path.is_file():
                raise RuntimeError(
                    f"--resume requires checkpoint file {checkpoint_path.name} for TA '{ta_slug}'"
                )
            if reset_checkpoint and checkpoint_path.is_file():
                checkpoint_path.unlink()
                print(f"Checkpoint reset for {ta_slug}; starting fresh.")
            checkpoint = load_checkpoint(ta_slug)
            if resume and checkpoint_path.is_file():
                print(f"Resuming from checkpoint {checkpoint_path.name}")

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

        # CLI date-window override (mutually exclusive: --days vs --mindate/--maxdate; validated
        # in main()). When given, it overrides the config window AND forces fresh PMID retrieval:
        # a date-windowed run must query that window, not resume the full-corpus offset checkpoint,
        # nor poison it with the windowed PMID set (see checkpoint read/write guards below).
        cli_days = getattr(args, "days", None) if args else None
        cli_mindate = getattr(args, "mindate", None) if args else None
        cli_maxdate = getattr(args, "maxdate", None) if args else None
        window_mindate: Optional[str] = None
        window_maxdate: Optional[str] = None
        date_window_override = cli_days is not None or bool(cli_mindate and cli_maxdate)
        if cli_days is not None:
            days_back = cli_days
            print(f"CLI date window: --days {cli_days} (relative; overrides config, fresh query, "
                  f"checkpoint offset ignored)")
        elif cli_mindate and cli_maxdate:
            days_back = None  # explicit range supersedes the relative window
            window_mindate, window_maxdate = cli_mindate, cli_maxdate
            print(f"CLI date window: --mindate {cli_mindate} --maxdate {cli_maxdate} (explicit range; "
                  f"overrides config, fresh query, checkpoint offset ignored)")

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

        pmid_phase = checkpoint["phases"]["pmid_retrieval"] if checkpoint else None
        if checkpoint and not date_window_override and pmid_phase.get("complete") and pmid_phase.get("pmids"):
            pmids = [str(p) for p in pmid_phase["pmids"]]
            print(f"Checkpoint: skipping PMID retrieval ({len(pmids):,} PMIDs loaded from checkpoint)")
        else:
            total_available = pubmed_esearch_count(
                session=session,
                base_url=base_url,
                query=query_text,
                days_back=days_back,
                email=email,
                tool_name=tool_name,
                mindate=window_mindate,
                maxdate=window_maxdate,
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
                mindate=window_mindate,
                maxdate=window_maxdate,
            )
            # Do NOT persist the windowed PMID set into the shared checkpoint: it is a partial
            # (date-bounded) view and would poison a later full-corpus run's pmid_retrieval cache.
            if checkpoint is not None and not date_window_override:
                checkpoint["phases"]["pmid_retrieval"] = {
                    "complete": True,
                    "pmids": pmids,
                }
                save_checkpoint(checkpoint, ta_slug)

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

        if checkpoint is not None:
            checkpoint["phases"]["efetch"] = {
                "complete": True,
                "publications_fetched_count": len(articles),
            }
            save_checkpoint(checkpoint, ta_slug)

        hcps_by_key, publication_records = extract_records(articles)
        unique_hcps = list(hcps_by_key.values())
        print(
            f"Extracted {len(unique_hcps)} unique HCP profiles and "
            f"{len(publication_records)} author-publication links."
        )

        if checkpoint is not None:
            checkpoint["phases"]["hcp_extract"] = {
                "complete": True,
                "unique_hcps_count": len(unique_hcps),
            }
            save_checkpoint(checkpoint, ta_slug)

        if dry_run:
            v2_counts = summarize_v2_write_counts(unique_hcps, publication_records)
            print("Sample publication titles:")
            for article in articles[:5]:
                title = text_or_none(article.find("./MedlineCitation/Article/ArticleTitle"))
                print(f"  - {title or '(no title)'}")
            print("\n[DRY RUN] v2 tables that would be written:")
            for table_name, row_count in v2_counts.items():
                print(f"  {table_name}: {row_count:,} rows")
            continue

        assert supabase is not None
        assert checkpoint is not None

        hcp_total_batches = (
            (len(unique_hcps) + HCP_UPSERT_BATCH_SIZE - 1) // HCP_UPSERT_BATCH_SIZE
            if unique_hcps
            else 0
        )
        checkpoint["phases"]["hcp_upsert"]["total_batches"] = hcp_total_batches
        hcp_start_batch = resolve_hcp_upsert_start_batch(checkpoint, hcp_total_batches)
        stale_complete = checkpoint["phases"]["hcp_upsert"].get("complete_batches", 0) or 0
        if stale_complete > hcp_total_batches:
            checkpoint["phases"]["hcp_upsert"]["complete_batches"] = 0
        if is_hcp_upsert_complete(checkpoint, hcp_total_batches):
            print(
                f"Checkpoint: HCP upsert complete "
                f"({hcp_total_batches}/{hcp_total_batches} batches); rebuilding ID map..."
            )

        def on_hcp_batch(batch_num: int, total: int) -> None:
            checkpoint["phases"]["hcp_upsert"]["complete_batches"] = batch_num
            checkpoint["phases"]["hcp_upsert"]["total_batches"] = total
            if batch_num % CHECKPOINT_EVERY_N_BATCHES == 0 or batch_num == total:
                save_checkpoint(checkpoint, ta_slug)

        print("Upserting HCPs into Supabase...")
        hcp_id_map = upsert_hcps(
            supabase,
            unique_hcps,
            start_batch=hcp_start_batch,
            on_batch_complete=on_hcp_batch,
        )
        checkpoint["phases"]["hcp_upsert"]["complete_batches"] = hcp_total_batches
        checkpoint["phases"]["hcp_upsert"]["total_batches"] = hcp_total_batches
        save_checkpoint(checkpoint, ta_slug)
        print(f"Mapped {len(hcp_id_map)} HCP keys to DB IDs.")

        pub_total_batches = 0
        pub_start_batch = 0

        def on_publication_batch(batch_num: int, total: int) -> None:
            checkpoint["phases"]["publication_upsert"]["complete_batches"] = batch_num
            checkpoint["phases"]["publication_upsert"]["total_batches"] = total
            checkpoint["phases"]["author_link_upsert"]["complete_batches"] = batch_num
            checkpoint["phases"]["author_link_upsert"]["total_batches"] = total
            if batch_num % CHECKPOINT_EVERY_N_BATCHES == 0 or batch_num == total:
                save_checkpoint(checkpoint, ta_slug)

        print("Upserting publications into Supabase...")
        if is_batch_phase_complete(checkpoint, "publication_upsert"):
            pub_start_batch = checkpoint["phases"]["publication_upsert"]["complete_batches"]
            pub_total_batches = checkpoint["phases"]["publication_upsert"]["total_batches"]
            print(
                f"Checkpoint: publication upsert complete "
                f"({pub_total_batches}/{pub_total_batches} batches); skipping."
            )
        else:
            pub_start_batch = checkpoint["phases"]["publication_upsert"].get("complete_batches", 0)

            unique_pmids_with_hcps = {
                record.pubmed_id
                for record in publication_records
                if _resolve_hcp_id(record, hcp_id_map)
            }
            pub_total_batches = (
                (len(unique_pmids_with_hcps) + PUBLICATION_UPSERT_BATCH_SIZE - 1)
                // PUBLICATION_UPSERT_BATCH_SIZE
                if unique_pmids_with_hcps
                else 0
            )
            checkpoint["phases"]["publication_upsert"]["total_batches"] = pub_total_batches
            checkpoint["phases"]["author_link_upsert"]["total_batches"] = pub_total_batches
            pub_count, author_link_count = upsert_publications(
                supabase,
                publication_records,
                hcp_id_map,
                therapeutic_area_id=therapeutic_area_id,
                start_batch=pub_start_batch,
                on_batch_complete=on_publication_batch,
                ingestion_run_id=ingestion_run_id,
            )
            checkpoint["phases"]["publication_upsert"]["complete_batches"] = pub_total_batches
            checkpoint["phases"]["author_link_upsert"]["complete_batches"] = pub_total_batches
            save_checkpoint(checkpoint, ta_slug)
            print(
                f"Upserted {pub_count} publications_v2 rows and "
                f"{author_link_count} publication_authors_v2 rows."
            )

        unique_pmids_with_hcps = {
            record.pubmed_id
            for record in publication_records
            if _resolve_hcp_id(record, hcp_id_map)
        }
        pmid_to_publication_id = _fetch_publication_ids_for_pmids(supabase, list(unique_pmids_with_hcps))
        publication_ids_for_ta = list(pmid_to_publication_id.values())

        hcp_publication_counts: Dict[str, int] = defaultdict(int)
        for record in publication_records:
            hcp_id = _resolve_hcp_id(record, hcp_id_map)
            if hcp_id:
                hcp_publication_counts[hcp_id] += 1

        unique_hcp_ids = list({hcp_id for hcp_id in hcp_id_map.values() if hcp_id})
        ta_total_batches = (
            (len(unique_hcp_ids) + TA_LINK_UPSERT_BATCH_SIZE - 1) // TA_LINK_UPSERT_BATCH_SIZE
            if unique_hcp_ids
            else 0
        )
        checkpoint["phases"]["ta_link_upsert"]["total_batches"] = ta_total_batches

        def on_ta_link_batch(batch_num: int, total: int) -> None:
            checkpoint["phases"]["ta_link_upsert"]["complete_batches"] = batch_num
            checkpoint["phases"]["ta_link_upsert"]["total_batches"] = total
            if batch_num % CHECKPOINT_EVERY_N_BATCHES == 0 or batch_num == total:
                save_checkpoint(checkpoint, ta_slug)

        print("Upserting HCP therapeutic area links...")
        if is_batch_phase_complete(checkpoint, "ta_link_upsert"):
            link_count = len(unique_hcp_ids)
            print(
                f"Checkpoint: HCP TA link upsert complete "
                f"({ta_total_batches}/{ta_total_batches} batches); skipping."
            )
        else:
            ta_start_batch = checkpoint["phases"]["ta_link_upsert"].get("complete_batches", 0)
            link_count = upsert_hcp_therapeutic_area_links(
                supabase=supabase,
                hcp_ids=unique_hcp_ids,
                therapeutic_area_id=therapeutic_area_id,
                publication_counts=dict(hcp_publication_counts),
                start_batch=ta_start_batch,
                on_batch_complete=on_ta_link_batch,
            )
            checkpoint["phases"]["ta_link_upsert"]["complete_batches"] = ta_total_batches
            save_checkpoint(checkpoint, ta_slug)
        print(f"Upserted {link_count} hcp_therapeutic_areas_v2 rows for {query_label}.")

        pub_ta_total_batches = (
            (len(publication_ids_for_ta) + TA_LINK_UPSERT_BATCH_SIZE - 1) // TA_LINK_UPSERT_BATCH_SIZE
            if publication_ids_for_ta
            else 0
        )
        checkpoint["phases"]["publication_ta_link_upsert"]["total_batches"] = pub_ta_total_batches

        def on_pub_ta_link_batch(batch_num: int, total: int) -> None:
            checkpoint["phases"]["publication_ta_link_upsert"]["complete_batches"] = batch_num
            checkpoint["phases"]["publication_ta_link_upsert"]["total_batches"] = total
            if batch_num % CHECKPOINT_EVERY_N_BATCHES == 0 or batch_num == total:
                save_checkpoint(checkpoint, ta_slug)

        print("Upserting publication therapeutic area links...")
        if is_batch_phase_complete(checkpoint, "publication_ta_link_upsert"):
            pub_ta_link_count = len(publication_ids_for_ta)
            print(
                f"Checkpoint: publication TA link upsert complete "
                f"({pub_ta_total_batches}/{pub_ta_total_batches} batches); skipping."
            )
        else:
            pub_ta_start_batch = checkpoint["phases"]["publication_ta_link_upsert"].get("complete_batches", 0)
            pub_ta_link_count = upsert_publication_therapeutic_area_links(
                supabase=supabase,
                publication_ids=publication_ids_for_ta,
                therapeutic_area_id=therapeutic_area_id,
                start_batch=pub_ta_start_batch,
                on_batch_complete=on_pub_ta_link_batch,
            )
            checkpoint["phases"]["publication_ta_link_upsert"]["complete_batches"] = pub_ta_total_batches
            save_checkpoint(checkpoint, ta_slug)
        print(
            f"Upserted {pub_ta_link_count} publication_therapeutic_areas_v2 rows for {query_label}."
        )

        if not dry_run:
            print(f"Starting second pass author enrichment for {query_label}...")
            second_pass_count = run_author_enrichment_second_pass(
                supabase=supabase,
                session=session,
                base_url=base_url,
                email=email,
                tool_name=tool_name,
                per_call=per_call,
                therapeutic_area_id=therapeutic_area_id,
                ingestion_run_id=ingestion_run_id,
            )
            print(
                f"Second pass upserted {second_pass_count} publication_authors_v2 rows "
                f"for {query_label}."
            )

    if dry_run:
        print("Dry run completed.")
        return ingestion_run_id

    print("Pipeline run completed.")
    return ingestion_run_id


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
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        metavar="N",
        help="Date-window the run to the last N days (publication date). Overrides the config window "
             "and forces a fresh query (ignores the checkpoint offset). Mutually exclusive with "
             "--mindate/--maxdate.",
    )
    parser.add_argument(
        "--mindate",
        type=str,
        default=None,
        metavar="YYYY/MM/DD",
        help="Explicit date-window start (publication date). Must be given with --maxdate. "
             "Mutually exclusive with --days.",
    )
    parser.add_argument(
        "--maxdate",
        type=str,
        default=None,
        metavar="YYYY/MM/DD",
        help="Explicit date-window end (publication date). Must be given with --mindate. "
             "Mutually exclusive with --days.",
    )
    parser.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="Delete the per-TA checkpoint file before starting (forces a fresh run).",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from pubmed_checkpoint_<ta>.json; errors if the checkpoint file is missing.",
    )
    args = parser.parse_args()

    # --days and --mindate/--maxdate are mutually exclusive; an explicit range needs both bounds.
    if args.days is not None and (args.mindate or args.maxdate):
        parser.error("--days is mutually exclusive with --mindate/--maxdate.")
    if bool(args.mindate) != bool(args.maxdate):
        parser.error("--mindate and --maxdate must be given together.")

    run_pipeline(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"[ERROR] Pipeline failed: {error}")
        raise
