"""
PubMed -> Supabase pipeline for FieldMark.

PUBLICATIONS-ONLY. This script persists publications, NOT HCP identities. Author identity is
resolved downstream from OpenAlex evidence (create_hcps_v2.py is the sole identity authority at
stage 2; rebuild_publication_authors_v2.py -- Step F -- builds publication_authors_v2 at stage 5).
Minting HCPs from PubMed names here was the root of the checkpoint-resume publication loss: the
PubMed name-md5 identity_hash no longer matched hcps_v2 (create_hcps_v2 backfills an OpenAlex-derived
hash; dedup_merge deletes the PubMed stubs), so the id_map collapsed and the attribution gate silently
dropped the batch. That path is removed.

This script:
1) Queries PubMed for TA-relevant publications (per-TA config query + date window).
2) Extracts publication metadata (incl. raw pubmed_authorships JSON for later OpenAlex linkage).
3) Persists publications_v2 UNCONDITIONALLY, keyed by pubmed_id, plus their
   publication_therapeutic_areas_v2 links and source_therapeutic_area_id.
   It does NOT write hcps_v2, publication_authors_v2, or hcp_therapeutic_areas_v2.

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
import calendar
import json
import os
import random
import re
import sys
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
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


# Transport failures the ADAPTER CANNOT retry. urllib3's Retry (build_http_session) covers
# connect/read failures and the 429/5xx status list, but it considers a request finished once
# response HEADERS arrive -- so a body that starts and then truncates is never re-issued. That
# is `ProtocolError: Response ended prematurely`, surfacing as ChunkedEncodingError, and it
# killed a 13-minute verification run twice. These are the classes worth one more layer.
#
# DELIBERATELY ABSENT: 429 and 5xx. The adapter already owns those with its own budget; a
# second layer would multiply attempts (5 x 4) rather than add resilience, and at ~7 req/s
# against NCBI's 10/s ceiling a retry storm is a real way to turn a blip into sustained 429s.
HTTP_TRANSIENT_EXCEPTIONS = (
    requests.exceptions.ChunkedEncodingError,
    requests.exceptions.ContentDecodingError,
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
)
HTTP_RETRY_ATTEMPTS = 4
HTTP_RETRY_BASE_SECONDS = 2.0
HTTP_RETRY_MAX_SECONDS = 30.0


# Redaction is keyed on the PARAM NAME, never on the secret's value: the pattern keeps
# working when the key is rotated, and the secret itself never has to appear in this file.
# Two shapes leak:
#   1. requests' HTTPError.__str__ embeds the fully-resolved URL -- "...&api_key=SECRET".
#   2. NCBI's own 400 body echoes the key back:
#      {"error":"API key invalid","api-key":"SECRET","type":"invalid","status":"unknown"}
# Path to disk: HTTPError str -> RuntimeError -> traceback -> child stderr -> run_stage's
# stderr=STDOUT -> orchestrator stdout -> run_weekly_reingest.ps1's Tee-Object -> logs/.
_REDACT_PATTERNS = (
    re.compile(r"(api_key=)[^&\s\"']+", re.IGNORECASE),        # URL query param
    re.compile(r'("api-key"\s*:\s*")[^"]*(")', re.IGNORECASE),  # NCBI JSON body field
    re.compile(r'("api_key"\s*:\s*")[^"]*(")', re.IGNORECASE),  # defensive: underscore variant
)


def _redact(text: str) -> str:
    """Strip the PubMed API key from anything about to be logged or raised."""
    if not text:
        return text
    out = _REDACT_PATTERNS[0].sub(r"\1<REDACTED>", text)
    for pattern in _REDACT_PATTERNS[1:]:
        out = pattern.sub(r"\1<REDACTED>\2", out)
    return out


def _response_body_excerpt(exc: requests.exceptions.HTTPError, limit: int = 400) -> str:
    """Best-effort excerpt of the response body attached to an HTTPError.

    WHY THIS EXISTS: the body is where NCBI says what actually went wrong. Raising only the
    status line ("400 Client Error: Bad Request") threw that away, so diagnosing the CRC
    build's batch-32 failure meant reproducing it from scratch rather than reading the log.
    """
    response = getattr(exc, "response", None)
    if response is None:
        return ""
    try:
        body = (response.text or "").strip()
    except Exception:
        return ""
    if not body:
        return ""
    body = _redact(" ".join(body.split()))
    return body[:limit] + ("..." if len(body) > limit else "")


# A 400 carrying this is NCBI's key-validation service refusing the request, NOT a malformed
# request. Observed body:
#   {"error":"API key invalid","api-key":"...","type":"invalid","status":"unknown"}
# It is INTERMITTENT under sustained load -- it killed the CRC build at efetch batch 32 of
# 1474, after ~1,600 successful calls with the same key, and the same key worked again
# immediately after. Matching on the BODY rather than the bare 400 keeps every other 4xx
# fail-fast. A genuinely revoked key simply retries 4 times and then fails, which is correct
# and costs a few seconds.
API_KEY_INVALID_MARKERS = ("api key invalid", '"error":"api key invalid"')


def _is_transient_http_error(exc: requests.exceptions.HTTPError, body: str) -> bool:
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    if status != 400:
        return False
    lowered = body.lower()
    return any(marker in lowered for marker in API_KEY_INVALID_MARKERS)


def _http_with_retry(
    do_request: Callable[[], Response],
    url: str,
    label: str,
) -> Response:
    """Issue a request, retrying post-header transport failures and transient 4xx.

    Fails fast on 4xx by default -- raise_for_status has already classified it, and a 400
    malformed term / 403 / 414 URI-too-long is deterministic, so re-sending is pure waste.
    The ONE exception is a 400 whose BODY says the API key is invalid: that is NCBI's key
    service under load, it is intermittent, and failing fast on it costs an entire
    unresumable run. See API_KEY_INVALID_MARKERS.

    NOTE ON REJECTED QUERIES: PubMed answers a bad query with HTTP 200 and an <ERROR>
    element, so it never reaches this function's except clause at all. Rejection is detected
    by the callers' `root.findtext("ERROR")` checks, which sit OUTSIDE this retry. A query
    PubMed rejected therefore cannot be re-issued here -- keep it that way.
    """
    last_exc: Optional[BaseException] = None
    last_body = ""
    for attempt in range(1, HTTP_RETRY_ATTEMPTS + 1):
        try:
            response = do_request()
            response.raise_for_status()
            return response
        except requests.exceptions.HTTPError as exc:
            body = _response_body_excerpt(exc)
            last_body = body
            if not _is_transient_http_error(exc, body):
                # Adapter already exhausted its 429/5xx budget; other 4xx are deterministic.
                raise RuntimeError(
                    _redact(f"HTTP request failed for {url}: {exc}")
                    + (f" | body: {body}" if body else "")
                ) from exc
            last_exc = exc
            if attempt == HTTP_RETRY_ATTEMPTS:
                break
            ceiling = min(HTTP_RETRY_BASE_SECONDS * (2 ** (attempt - 1)), HTTP_RETRY_MAX_SECONDS)
            delay = random.uniform(0, ceiling)
            print(
                f"[pubmed_pipeline] [retry {attempt}/{HTTP_RETRY_ATTEMPTS - 1}] {label} {url}: "
                f"HTTP 400 API-key-invalid (transient, NCBI key service); "
                f"retrying in {delay:.1f}s",
                file=sys.stderr, flush=True,
            )
            time.sleep(delay)
        except HTTP_TRANSIENT_EXCEPTIONS as exc:
            last_exc = exc
            if attempt == HTTP_RETRY_ATTEMPTS:
                break
            # Full jitter: sleep is uniform in [0, min(base * 2^(n-1), cap)]. Subdivided
            # windows fail in correlated bursts, so unjittered backoff would re-collide.
            ceiling = min(HTTP_RETRY_BASE_SECONDS * (2 ** (attempt - 1)), HTTP_RETRY_MAX_SECONDS)
            delay = random.uniform(0, ceiling)
            print(
                f"[pubmed_pipeline] [retry {attempt}/{HTTP_RETRY_ATTEMPTS - 1}] {label} {url}: "
                f"{type(exc).__name__}: {_redact(str(exc))}; retrying in {delay:.1f}s",
                file=sys.stderr, flush=True,
            )
            time.sleep(delay)
        except requests.RequestException as exc:
            # Anything else in the requests hierarchy: not classified as transient, fail fast.
            raise RuntimeError(_redact(f"HTTP request failed for {url}: {exc}")) from exc

    # Body on the exhausted path too: this is the revoked-key case, and "retried 4x and gave
    # up" is only actionable if the log says WHY.
    raise RuntimeError(
        _redact(f"HTTP request failed for {url} after {HTTP_RETRY_ATTEMPTS} attempts: {last_exc}")
        + (f" | body: {last_body}" if last_body else "")
    ) from last_exc


# NCBI allows 10 req/sec with an API key, 3 without. 0.15s (~6.7/s) rather than the previous
# 0.11s (~9.1/s): at 91% of the ceiling any burst -- retries, or the chunker's now-numerous
# ESearch inits landing between paced EFetch calls -- crosses 10/s and earns 429s, which the
# adapter retries, sustaining the condition. Costs ~25% wall-clock for real headroom.
# The no-key value is unchanged.
def pubmed_sleep_seconds() -> float:
    return 0.15 if os.getenv("PUBMED_API_KEY") else 0.34


def pubmed_pace() -> None:
    """Sleep one inter-request interval.

    Applied to EVERY PubMed call including the ESearch count and history-init calls, which
    were previously unpaced. That was harmless when a run made one of each; the recursive
    sub-year chunker issues one init per window (~120+ for a ten-year build, each landing
    immediately after a paced EFetch page).
    """
    time.sleep(pubmed_sleep_seconds())


def safe_get(url: str, params: Dict[str, str], session: requests.Session, timeout: int = 40) -> Response:
    return _http_with_retry(
        lambda: session.get(url, params=params, timeout=timeout), url, "GET"
    )


def safe_post(url: str, data: Dict[str, str], session: requests.Session, timeout: int = 40) -> Response:
    return _http_with_retry(
        lambda: session.post(url, data=data, timeout=timeout), url, "POST"
    )


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
            "publication_ta_link_upsert": {"complete_batches": 0, "total_batches": 0},
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
    pubmed_pace()
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


def subdivide_date_range(mindate: str, maxdate: str) -> List[Tuple[str, str]]:
    """Split an inclusive YYYY/MM/DD window into the next-finer level (newest first).

    Multi-year -> calendar years; within one year -> calendar months; within one
    month -> days. Returns [] for a single day, which is the recursion floor: the
    caller MUST raise there rather than truncate.

    Sub-ranges are clipped to the parent window, so the union is exactly the parent
    and no paper can fall between two sub-windows.
    """
    start = datetime.strptime(mindate, "%Y/%m/%d").date()
    end = datetime.strptime(maxdate, "%Y/%m/%d").date()
    if start >= end:
        return []

    out: List[Tuple[str, str]] = []
    fmt = "%Y/%m/%d"

    if end.year > start.year:
        for year in range(end.year, start.year - 1, -1):
            s = max(start, date(year, 1, 1))
            e = min(end, date(year, 12, 31))
            if s <= e:
                out.append((s.strftime(fmt), e.strftime(fmt)))
        return out

    if start.month != end.month:
        year = start.year
        for month in range(end.month, start.month - 1, -1):
            last = calendar.monthrange(year, month)[1]
            s = max(start, date(year, month, 1))
            e = min(end, date(year, month, last))
            if s <= e:
                out.append((s.strftime(fmt), e.strftime(fmt)))
        return out

    day = end
    while day >= start:
        out.append((day.strftime(fmt), day.strftime(fmt)))
        day -= timedelta(days=1)
    return out


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
    pubmed_pace()
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
    stats: Optional[Dict[str, int]] = None,
) -> List[str]:
    """Retrieve the PMID set for a query/window.

    `stats`, when passed, is filled with retrieval instrumentation:
      esearch_available  - true ESearch total for the whole query/window
      esearch_retrieved  - PMIDs actually returned (deduped)
      chunks_subdivided  - windows that exceeded the cap and had to be split
      esearch_target     - what we were ALLOWED to fetch (available, or --limit)
    The caller compares retrieved against target; a shortfall must fail the stage.
    """
    esearch_url = f"{base_url}/esearch.fcgi"
    efetch_url = f"{base_url}/efetch.fcgi"
    api_key = os.getenv("PUBMED_API_KEY")
    sleep_seconds = pubmed_sleep_seconds()
    stats_subdivided = [0]  # list so the nested recursion can mutate it

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

        def retrieve_window(win_mindate: str, win_maxdate: str) -> None:
            """Fetch one window, RECURSING when it exceeds the per-session cap.

            Replaces the previous `session_target = min(chunk_count, MAX)`, which
            silently discarded everything above 9,999 -- a whole-year chunk of a
            high-volume TA lost ~40% of that year with no error, no warning and no
            funnel field (measured: NSCLC 2021-2024 flattened at ~9.4k against
            11.2-12.1k available).

            Each level opens its OWN history session -- sessions are independent, so
            subdividing needs no new API surface -- and appends into the shared
            seen/unique_ids accumulators, leaving dedup and ordering unchanged.
            """
            # No nonlocal: progress counters are per-window now (see the call below), and
            # the only cross-window state is seen/unique_ids, which are mutated in place.
            if len(unique_ids) >= overall_target:
                return

            win_webenv, win_query_key, win_count = pubmed_esearch_init_history(
                session=session,
                esearch_url=esearch_url,
                query=query,
                email=email,
                tool_name=tool_name,
                mindate=win_mindate,
                maxdate=win_maxdate,
            )
            if win_count == 0:
                return

            if win_count > PUBMED_HISTORY_MAX_PMIDS:
                subranges = subdivide_date_range(win_mindate, win_maxdate)
                if not subranges:
                    # Recursion floor: a SINGLE DAY over the cap. Pathological, and the
                    # only remaining options are truncate (the bug) or fail. Fail.
                    raise RuntimeError(
                        f"Single-day window {win_mindate} returned {win_count:,} PMIDs "
                        f"(> {PUBMED_HISTORY_MAX_PMIDS}); cannot subdivide below one day. "
                        f"Refusing to truncate silently -- narrow the query or raise the cap."
                    )
                stats_subdivided[0] += 1
                print(
                    f"  [chunk] {win_mindate}..{win_maxdate} = {win_count:,} PMIDs > "
                    f"{PUBMED_HISTORY_MAX_PMIDS:,}; subdividing into {len(subranges)} sub-window(s)"
                )
                for sub_mindate, sub_maxdate in subranges:
                    retrieve_window(sub_mindate, sub_maxdate)
                    if len(unique_ids) >= overall_target:
                        return
                return

            batch_ids, _retrieved, _progress = pubmed_efetch_history_pmids(
                session=session,
                efetch_url=efetch_url,
                webenv=win_webenv,
                query_key=win_query_key,
                session_target=win_count,
                per_call=per_call,
                email=email,
                tool_name=tool_name,
                sleep_seconds=sleep_seconds,
                # SELF-CONTAINED per-window fetch: this window's own count is the target and
                # its own counter starts at 0, so the window is always retrieved COMPLETELY.
                #
                # It previously passed total_retrieved=len(unique_ids) with the GLOBAL
                # overall_target, which made pubmed_efetch_history_pmids stop on
                # `total_retrieved >= stop_at` -- a UNIQUE-pmid target spent as a RAW-fetch
                # budget. Date windows overlap heavily (year-only pdat values all land in
                # January, so a year's months sum to ~140% of the year), so duplicates
                # exhaust that budget before the unique target is met; late windows get
                # clipped mid-fetch and the unique pmids in their tails are lost. Measured
                # on 2022-2026 NSCLC: 51,380 retrieved of 52,548 available, stuck there
                # because every remaining window was clipped to the same shrinking budget.
                # Setting only max_total=None does NOT fix it: stop_at falls back to
                # overall_target, which is the same number.
                #
                # Global bookkeeping (dedup + the overall_target early-break) lives in
                # retrieve_window, above and below. Each window is <= the per-session cap,
                # so an uncapped per-window fetch is bounded by construction.
                total_retrieved=0,
                overall_target=win_count,
                last_progress_logged=0,
                max_total=None,
            )
            for pmid in batch_ids:
                if pmid not in seen:
                    seen.add(pmid)
                    unique_ids.append(pmid)
                    if len(unique_ids) >= overall_target:
                        break

        for mindate, maxdate in date_ranges:
            if len(unique_ids) >= overall_target:
                break
            retrieve_window(mindate, maxdate)

    # Preserve order while removing any duplicated PMIDs (single-session path only).
    if overall_target <= PUBMED_HISTORY_MAX_PMIDS:
        seen: Set[str] = set()
        unique_ids: List[str] = []
        for pmid in ids:
            if pmid not in seen:
                seen.add(pmid)
                unique_ids.append(pmid)
    result = unique_ids[:max_results] if max_results is not None else unique_ids
    if stats is not None:
        stats["esearch_available"] = total_count
        stats["esearch_retrieved"] = len(result)
        stats["chunks_subdivided"] = stats_subdivided[0]
        stats["esearch_target"] = overall_target
    return result


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
    sleep_seconds = pubmed_sleep_seconds()
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
            # THE ONLY CALL SITE THAT PUTS THE KEY IN A URL. The other three POST, so their
            # params go in the body and never reach a query string. This one stays GET
            # deliberately: URL length was measured at 1,271 chars for a 100-PMID batch and
            # both GET and POST return 200, so there is no diagnosed reason to change the
            # highest-traffic call site. Containment is _redact() on every raise/log path --
            # requests' HTTPError.__str__ embeds the resolved URL, key included.
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


def parse_pub_date(article: ET.Element) -> Optional[str]:
    """YYYY-MM-DD from the PubDate node, or None if no year. Ported from ingest_publications.py
    so this pipeline populates publications_v2.pub_date (the Pulse theme time-series depends on it;
    writing None here left 16,971 corpus-wide NULLs). Missing month/day default to 01."""
    y = parse_pub_year(article)
    if not y:
        return None
    m = text_or_none(article.find("./MedlineCitation/Article/Journal/JournalIssue/PubDate/Month"))
    d = text_or_none(article.find("./MedlineCitation/Article/Journal/JournalIssue/PubDate/Day"))
    month_map = {
        "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
        "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
    }
    if m and not m.isdigit():
        m = month_map.get(m[:3], "01")
    elif not m:
        m = "01"
    if not d or not d.isdigit():
        d = "01"
    return f"{y}-{m.zfill(2)}-{d.zfill(2)}"


def parse_authorships(article: ET.Element) -> List[Dict[str, Any]]:
    """Extract author info AS-IS from PubMed (names, affiliations, ORCID, collective entries) for
    later OpenAlex-driven resolution. Stored raw as publications_v2.pubmed_authorships (JSONB).
    Does NOT mint HCP identities. Ported from ingest_publications.py."""
    out: List[Dict[str, Any]] = []
    for idx, author in enumerate(article.findall("./MedlineCitation/Article/AuthorList/Author")):
        if author.find("CollectiveName") is not None:
            collective = text_or_none(author.find("CollectiveName"))
            if collective:
                out.append({
                    "position": idx + 1,
                    "is_collective": True,
                    "collective_name": collective,
                })
            continue

        affiliations: List[str] = []
        for aff in author.findall("./AffiliationInfo/Affiliation"):
            t = (aff.text or "").strip()
            if t:
                affiliations.append(t)

        orcid: Optional[str] = None
        for ident in author.findall("./Identifier"):
            if ident.attrib.get("Source", "").lower() == "orcid" and ident.text:
                orcid = ident.text.strip()
                break

        out.append({
            "position": idx + 1,
            "is_collective": False,
            "last_name": text_or_none(author.find("LastName")),
            "fore_name": text_or_none(author.find("ForeName")),
            "initials": text_or_none(author.find("Initials")),
            "suffix": text_or_none(author.find("Suffix")),
            "affiliations": affiliations,
            "orcid": orcid,
        })
    return out


# ---------------------------------------------------------------------------
# THE FOUR FIELDS THIS PIPELINE USED TO DROP (2026-08-26)
#
# _publication_v2_row() hardcoded publication_types, mesh_terms, abstract and
# language to None while the article XML was in scope -- parse_authorships(article)
# ran two lines above the nulls. The four parsers below are ported VERBATIM from
# ingest_publications.py (parse_abstract, parse_mesh_terms,
# parse_publication_types, parse_language), the same convention parse_pub_date and
# parse_authorships already follow.
#
# WHY PORTED AND NOT IMPORTED. scripts/ingest has no __init__.py, so an import
# needs sys.path surgery -- and ingest_publications.py is ORPHANED (nothing calls
# it; see TA_BUILD_GUIDE - 24Aug26.md:457,585). Importing would make the live
# weekly cycle depend on a script the build guides tell people to stay away from
# and that is a deletion candidate. Four pure XML functions, no shared state.
#
# WHAT IT COST, MEASURED 2026-08-26. The nulls were introduced 2026-07-02 in
# 5f5c0d7 (AD ingestion v2). ad27ade on 07-23 rewrote this function's signature
# and carried them through unchanged -- it is NOT the origin. Splitting
# publications_v2 by the source stamp shows the damage exactly:
#
#   source='pubmed_v2_ingest' (ingest_publications.py)  403,671 pubs, 403,671 typed
#   source='pubmed'           (THIS pipeline)           169,197 pubs,      81 typed
#
# Every TA built through ta_cycle.py (then reingest_cycle.py) since 07-02 lost all four. Colorectal
# Cancer is 100% this path: 147,218 publications with zero publication_types, zero
# mesh_terms, zero abstracts, zero language. publication_leadership_scoring.py
# reads publication_types for its Editorial and Systematic Review / Meta-Analysis
# terms, so both are inert for CRC today; zero abstracts is the wider cost, since
# abstracts feed the billed theme and scientific-position extractors.
# ---------------------------------------------------------------------------


def parse_abstract(article: ET.Element) -> Optional[str]:
    """Structured abstracts are flattened to 'Label: text' segments joined by spaces, capped at
    10k chars. Ported from ingest_publications.py."""
    parts: List[str] = []
    for ab in article.findall("./MedlineCitation/Article/Abstract/AbstractText"):
        label = ab.attrib.get("Label")
        text = (ab.text or "").strip()
        if not text:
            continue
        if label:
            parts.append(f"{label}: {text}")
        else:
            parts.append(text)
    if not parts:
        return None
    joined = " ".join(parts)
    return joined[:10000]  # cap at 10k chars


def parse_mesh_terms(article: ET.Element) -> List[str]:
    """MeSH DescriptorName values, in document order. Ported from ingest_publications.py."""
    out: List[str] = []
    for mh in article.findall("./MedlineCitation/MeshHeadingList/MeshHeading/DescriptorName"):
        if mh.text:
            out.append(mh.text.strip())
    return out


def parse_publication_types(article: ET.Element) -> List[str]:
    """PubMed PublicationType values -- 'Practice Guideline', 'Consensus Statement', 'Editorial',
    'Systematic Review', 'Meta-Analysis' are the five publication_leadership_scoring.py reads.
    Ported from ingest_publications.py."""
    out: List[str] = []
    for pt in article.findall("./MedlineCitation/Article/PublicationTypeList/PublicationType"):
        if pt.text:
            out.append(pt.text.strip())
    return out


def parse_language(article: ET.Element) -> Optional[str]:
    """Ported from ingest_publications.py."""
    return text_or_none(article.find("./MedlineCitation/Article/Language"))


def extract_publication_rows(
    articles: Sequence[ET.Element], therapeutic_area_id: Optional[str]
) -> List[Dict[str, object]]:
    """One publications_v2 row per unique pubmed_id, built directly from the article XML.

    UNCONDITIONAL PERSISTENCE: the only article skipped is one with no PMID (the row is keyed by
    pubmed_id, so a PMID-less record cannot be persisted). Articles with no AuthorList or only a
    collective author ARE persisted -- they are real TA-matched publications (consortium papers,
    editorials, errata); their author data is preserved raw in pubmed_authorships for later OpenAlex
    linkage. HCP identities are NOT minted here (create_hcps_v2 owns identity; Step F builds
    publication_authors_v2)."""
    rows_by_pmid: Dict[str, Dict[str, object]] = {}
    for article in tqdm(articles, desc="building publication rows", unit="pub"):
        pmid = text_or_none(article.find("./MedlineCitation/PMID"))
        if not pmid or pmid in rows_by_pmid:
            continue
        rows_by_pmid[pmid] = _publication_v2_row(article, pmid, therapeutic_area_id)
    return list(rows_by_pmid.values())


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    # HTTP/1.1 avoids httpx HTTP/2 stream exhaustion (~20k streams per connection).
    httpx_client = httpx.Client(http2=False, follow_redirects=True)
    options = SyncClientOptions(httpx_client=httpx_client)
    return create_client(supabase_url, supabase_key, options)


def _publication_v2_row(
    article: ET.Element, pmid: str, therapeutic_area_id: Optional[str]
) -> Dict[str, object]:
    """Fixed key set for one publications_v2 row, built directly from the article XML.

    pub_date and pubmed_authorships ARE populated here (parse_pub_date / parse_authorships) -- the
    former feeds the Pulse theme time-series, the latter preserves author data raw for later
    OpenAlex linkage without minting HCP identities.

    SO ARE abstract, language, mesh_terms and publication_types, since 2026-08-26. All four were
    hardcoded to None from 2026-07-02 (5f5c0d7) while the XML sat in scope; see the block above the
    parsers for the measured cost.

    RE-INGEST NOW REPAIRS RATHER THAN ERASES. The upsert is on_conflict='pubmed_id' and these keys
    are in the payload, so PostgREST writes them on every conflict. While they were None that made a
    re-ingest DESTRUCTIVE -- re-touching a PMID that ingest_publications.py had populated would have
    nulled all four. Now the same path backfills them.

    WHAT IS IN THIS PAYLOAD IS WHAT A RE-INGEST OVERWRITES. That is the whole contract. A key
    belongs here only if THIS function can derive it from THIS article's XML; anything else is
    someone else's column and must be omitted, not set to None.

    THE FOUR OPENALEX COLUMNS ARE OMITTED FOR EXACTLY THAT REASON (2026-08-27). openalex_work_id,
    citation_count, citation_counts_by_year and openalex_enriched_at used to sit here as explicit
    None. They cannot be parsed from an E-utilities efetch response -- they are written by
    enrich/openalex_pipeline.py -- so carrying them meant every re-touch of an existing PMID
    silently erased another stage's work. Measured on CRC before the scoped backfill was written:
    a full pipeline re-run would have nulled 142,450 citation_counts, 142,450
    citation_counts_by_year and 142,450 openalex_enriched_at. citation_count is a direct input to
    publication_leadership_scoring (W_SENIOR_CITATION_LOG 12.0, W_FIRST_CITATION_LOG 5.0), so the
    re-run would have broken the board it was meant to unblock. All four are nullable with no
    column default, so omitting them yields NULL on INSERT -- byte-identical to the explicit None
    for a genuinely new publication, and a no-op on conflict.

    CONSEQUENCE, DELIBERATE: an already-enriched row is no longer reset to
    openalex_enriched_at IS NULL by a re-ingest, and openalex_pipeline.fetch_publications_with_doi()
    selects on exactly that predicate. So citation counts on existing rows are no longer refreshed
    as a side effect of re-ingestion. They were only ever refreshed BY THE DESTRUCTION -- null the
    timestamp, re-enrich next cycle -- which is not a refresh mechanism, it is a bug with an
    upside. A real refresh wants an explicit re-enrich path (a --since / --stale-days selector on
    openalex_pipeline); until that exists, counts on already-enriched publications are frozen.

    NOTE: ingestion_run_id is intentionally NOT in this payload either, for a different reason.
    Including it would make the on_conflict="pubmed_id" upsert overwrite it on every re-ingest
    (last-wrote semantics). It is INSERT-ONLY: stamped in upsert_publications on rows where it is
    still NULL (created-by).
    """
    return {
        "pubmed_id": pmid,
        "doi": parse_doi(article),
        "title": text_or_none(article.find("./MedlineCitation/Article/ArticleTitle")),
        "abstract": parse_abstract(article),
        "journal": text_or_none(article.find("./MedlineCitation/Article/Journal/Title")),
        "pub_year": parse_pub_year(article),
        "pub_date": parse_pub_date(article),
        "language": parse_language(article),
        "pubmed_authorships": parse_authorships(article),
        "mesh_terms": parse_mesh_terms(article),
        "publication_types": parse_publication_types(article),
        "source_therapeutic_area_id": therapeutic_area_id,
        "source": PUBMED_SOURCE,
        # DELIBERATELY OMITTED -- see the docstring. Every key present here is overwritten on
        # conflict, so a key this function cannot derive from the XML must not appear at all:
        #   openalex_work_id, citation_count, citation_counts_by_year, openalex_enriched_at
        #     -> owned by enrich/openalex_pipeline.py. Nullable, no column default, so they
        #        default to NULL on INSERT and are untouched on UPDATE.
        #   ingestion_run_id
        #     -> insert-only (created-by), stamped in upsert_publications where still NULL.
        #   ingested_at
        #     -> DEFAULT now() on INSERT; omitted so a re-ingest does not restamp it.
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


def summarize_v2_write_counts(publication_rows: Sequence[Dict[str, object]]) -> Dict[str, int]:
    """Dry-run projection of what would be written. Publications-only now: no hcps_v2,
    publication_authors_v2, or hcp_therapeutic_areas_v2 writes originate here."""
    n = len(publication_rows)
    return {
        PUBLICATIONS_TABLE: n,
        PUBLICATION_THERAPEUTIC_AREAS_TABLE: n,
    }


def upsert_publications(
    supabase: Client,
    publication_rows: Sequence[Dict[str, object]],
    start_batch: int = 0,
    on_batch_complete: Optional[Callable[[int, int], None]] = None,
    ingestion_run_id: Optional[str] = None,
) -> int:
    """Persist publications_v2 rows UNCONDITIONALLY, keyed by pubmed_id. No HCP resolution, no
    author-link writes (Step F owns publication_authors_v2), no attribution gate. TA linking +
    source_therapeutic_area_id backfill happen in a separate post-upsert step over ALL pmids."""
    rows = list(publication_rows)
    if not rows:
        return 0

    batch_size = PUBLICATION_UPSERT_BATCH_SIZE
    total_batches = (len(rows) + batch_size - 1) // batch_size

    if start_batch > 0:
        print(
            f"Resuming publication upsert from batch {start_batch + 1}/{total_batches} "
            f"(skipping {start_batch} prior batches)..."
        )

    for batch_idx in range(total_batches):
        if batch_idx < start_batch:
            continue

        i = batch_idx * batch_size
        batch = rows[i : i + batch_size]
        batch_pmids = [str(row["pubmed_id"]) for row in batch if row.get("pubmed_id")]

        try:
            supabase_execute(
                lambda b=batch: supabase.table(PUBLICATIONS_TABLE).upsert(
                    b,
                    on_conflict="pubmed_id",
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

        if on_batch_complete:
            on_batch_complete(batch_idx + 1, total_batches)

    return len(rows)


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

    # AUTHORITATIVE batch identity: when requested, accumulate the PRIMARY windowed-query pmids
    # (the esearch result set) across the TA loop and emit them at the end. This is the orchestrator's
    # source of truth for "this cycle's batch", replacing the unreliable insert-only run_id reverse-
    # derivation (which under-captures re-ingested papers that kept an older run_id).
    primary_pmids_out = getattr(args, "primary_pmids_out", None) if args else None
    primary_pmids_accum: List[str] = []

    # Per-TA funnel counters -> run_summary.json (instrumentation). The hard guard below turns a
    # silent "consumed N candidates, persisted ~0" into a non-zero exit.
    run_summary_out = getattr(args, "run_summary_out", None) if args else None
    ta_funnels: List[Dict[str, Any]] = []

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
        # Funnel appended by reference now; mutated in place as the stages run, so the early
        # `continue` paths (quiet week, no efetch payload) still leave a recorded row.
        funnel: Dict[str, Any] = {
            "ta_slug": ta_slug,
            "esearch_candidates": 0,
            # Retrieval instrumentation. esearch_candidates records what we FETCHED;
            # without esearch_available there was nothing to compare it against, so a
            # chunk truncated at the 9,999 cap looked identical to a complete fetch.
            "esearch_available": 0,
            "esearch_retrieved": 0,
            "esearch_target": 0,
            "chunks_subdivided": 0,
            "short_fetch": False,
            "efetch_articles": 0,
            "extracted_pmids": 0,
            "publications_upserted": 0,
            "pub_ta_links_upserted": 0,
            "write_skipped_by_checkpoint": False,
            "dry_run": dry_run,
        }
        ta_funnels.append(funnel)

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
            esearch_stats: Dict[str, int] = {}
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
                stats=esearch_stats,
            )
            funnel["esearch_available"] = esearch_stats.get("esearch_available", 0)
            funnel["esearch_retrieved"] = esearch_stats.get("esearch_retrieved", 0)
            funnel["esearch_target"] = esearch_stats.get("esearch_target", 0)
            funnel["chunks_subdivided"] = esearch_stats.get("chunks_subdivided", 0)
            # SHORT FETCH: retrieved fewer than we were allowed to. Compared against
            # target, not available, so an intentional --limit is not a failure.
            funnel["short_fetch"] = (
                funnel["esearch_retrieved"] < funnel["esearch_target"]
            )
            print(
                f"Retrieval: available={funnel['esearch_available']:,} "
                f"target={funnel['esearch_target']:,} "
                f"retrieved={funnel['esearch_retrieved']:,} "
                f"subdivided_windows={funnel['chunks_subdivided']}"
            )
            if funnel["short_fetch"]:
                print(
                    f"[pubmed_pipeline] [ERROR] SHORT FETCH for {ta_slug}: retrieved "
                    f"{funnel['esearch_retrieved']:,} of {funnel['esearch_target']:,}."
                )
            # Do NOT persist the windowed PMID set into the shared checkpoint: it is a partial
            # (date-bounded) view and would poison a later full-corpus run's pmid_retrieval cache.
            if checkpoint is not None and not date_window_override:
                checkpoint["phases"]["pmid_retrieval"] = {
                    "complete": True,
                    "pmids": pmids,
                }
                save_checkpoint(checkpoint, ta_slug)

        # Capture the PRIMARY windowed pmids for this TA into the batch-identity accumulator BEFORE
        # any early-continue, so a genuinely empty window still contributes (nothing) and the file is
        # written even when 0 primary papers matched.
        if primary_pmids_out is not None:
            primary_pmids_accum.extend(str(p) for p in pmids)

        funnel["esearch_candidates"] = len(pmids)
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
        funnel["efetch_articles"] = len(articles)
        if not articles:
            print(f"No article payloads returned by efetch for {query_label}.")
            continue

        if checkpoint is not None:
            checkpoint["phases"]["efetch"] = {
                "complete": True,
                "publications_fetched_count": len(articles),
            }
            save_checkpoint(checkpoint, ta_slug)

        # Build publication rows (one per unique pmid) directly from the article XML. HCP identities
        # are NOT minted here -- create_hcps_v2 (stage 2) owns identity; Step F (stage 5) builds
        # publication_authors_v2. Raw author data is preserved in pubmed_authorships for that linkage.
        publication_rows = extract_publication_rows(articles, therapeutic_area_id)
        funnel["extracted_pmids"] = len(publication_rows)
        print(f"Built {len(publication_rows)} publication row(s) from {len(articles)} article(s).")

        if dry_run:
            v2_counts = summarize_v2_write_counts(publication_rows)
            print("Sample publication titles:")
            for row in publication_rows[:5]:
                print(f"  - {row.get('title') or '(no title)'}")
            print("\n[DRY RUN] v2 tables that would be written:")
            for table_name, row_count in v2_counts.items():
                print(f"  {table_name}: {row_count:,} rows")
            continue

        assert supabase is not None
        assert checkpoint is not None

        all_pmids = [str(row["pubmed_id"]) for row in publication_rows if row.get("pubmed_id")]

        def on_publication_batch(batch_num: int, total: int) -> None:
            checkpoint["phases"]["publication_upsert"]["complete_batches"] = batch_num
            checkpoint["phases"]["publication_upsert"]["total_batches"] = total
            if batch_num % CHECKPOINT_EVERY_N_BATCHES == 0 or batch_num == total:
                save_checkpoint(checkpoint, ta_slug)

        pub_total_batches = (
            (len(publication_rows) + PUBLICATION_UPSERT_BATCH_SIZE - 1) // PUBLICATION_UPSERT_BATCH_SIZE
            if publication_rows
            else 0
        )
        print("Upserting publications into Supabase (unconditional; keyed by pubmed_id)...")
        if is_batch_phase_complete(checkpoint, "publication_upsert"):
            pub_count = len(publication_rows)
            funnel["write_skipped_by_checkpoint"] = True
            print(
                f"Checkpoint: publication upsert complete "
                f"({pub_total_batches}/{pub_total_batches} batches); skipping."
            )
        else:
            pub_start_batch = checkpoint["phases"]["publication_upsert"].get("complete_batches", 0)
            checkpoint["phases"]["publication_upsert"]["total_batches"] = pub_total_batches
            pub_count = upsert_publications(
                supabase,
                publication_rows,
                start_batch=pub_start_batch,
                on_batch_complete=on_publication_batch,
                ingestion_run_id=ingestion_run_id,
            )
            checkpoint["phases"]["publication_upsert"]["complete_batches"] = pub_total_batches
            save_checkpoint(checkpoint, ta_slug)
        funnel["publications_upserted"] = pub_count
        print(f"Upserted {pub_count} publications_v2 rows for {query_label}.")

        # publication_therapeutic_areas_v2 links + source_therapeutic_area_id backfill, UNGATED over
        # EVERY persisted pub of this TA. source_ta_id feeds author_pub_flat.source_ta_id, which
        # drives create_hcps_v2 --ta scoping -- so this is load-bearing, not cosmetic.
        print("Upserting publication therapeutic area links (ungated)...")
        if is_batch_phase_complete(checkpoint, "publication_ta_link_upsert"):
            pub_ta_link_count = checkpoint["phases"]["publication_ta_link_upsert"].get("total_batches", 0)
            print("Checkpoint: publication TA link upsert complete; skipping.")
        else:
            pub_ta_link_count = _tag_publications_for_therapeutic_area(
                supabase, all_pmids, therapeutic_area_id
            )
            checkpoint["phases"]["publication_ta_link_upsert"]["complete_batches"] = 1
            checkpoint["phases"]["publication_ta_link_upsert"]["total_batches"] = 1
            save_checkpoint(checkpoint, ta_slug)
        funnel["pub_ta_links_upserted"] = pub_ta_link_count
        print(
            f"Upserted {pub_ta_link_count} publication_therapeutic_areas_v2 rows for {query_label}."
        )

    # Emit the authoritative PRIMARY pmid set (batch identity for the orchestrator). Written even
    # when empty (0 primary papers -> empty file), so the caller can distinguish "quiet window,
    # nothing new" from "flag not passed". De-duplicated, order-preserving.
    if primary_pmids_out is not None:
        seen: Set[str] = set()
        deduped = [p for p in primary_pmids_accum if not (p in seen or seen.add(p))]
        Path(primary_pmids_out).write_text(
            "\n".join(deduped) + ("\n" if deduped else ""), encoding="utf-8"
        )
        print(f"[pubmed_pipeline] wrote {len(deduped)} primary pmid(s) -> {primary_pmids_out}")

    # HARD GUARD (instrumentation part 3): a stage that consumed candidates AND fetched article
    # payloads but persisted ~0 publications is the exact silent-loss failure this refactor exists to
    # kill. Flag any such TA (dry-run and checkpoint-skip runs are exempt: they legitimately write 0).
    starved = [
        f for f in ta_funnels
        if not f["dry_run"]
        and not f["write_skipped_by_checkpoint"]
        and f["esearch_candidates"] > 0
        and f["efetch_articles"] > 0
        and f["publications_upserted"] == 0
    ]

    # SHORT-FETCH GUARD: a TA that retrieved fewer PMIDs than ESearch offered has
    # silently lost papers. Before the recursive chunker this was the normal outcome
    # for any high-volume year and nothing recorded it. Checkpoint-skip runs are
    # exempt (they retrieve 0 by design); dry runs are exempt below.
    short = [
        f for f in ta_funnels
        if not f["dry_run"]
        and not f["write_skipped_by_checkpoint"]
        and f["short_fetch"]
    ]

    totals = {
        "esearch_candidates": sum(f["esearch_candidates"] for f in ta_funnels),
        "esearch_available": sum(f["esearch_available"] for f in ta_funnels),
        "esearch_retrieved": sum(f["esearch_retrieved"] for f in ta_funnels),
        "chunks_subdivided": sum(f["chunks_subdivided"] for f in ta_funnels),
        "efetch_articles": sum(f["efetch_articles"] for f in ta_funnels),
        "extracted_pmids": sum(f["extracted_pmids"] for f in ta_funnels),
        "publications_upserted": sum(f["publications_upserted"] for f in ta_funnels),
        "pub_ta_links_upserted": sum(f["pub_ta_links_upserted"] for f in ta_funnels),
    }
    run_summary = {
        "ingestion_run_id": ingestion_run_id,
        "completed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dry_run": dry_run,
        "per_ta": ta_funnels,
        "totals": totals,
        "starved_tas": [f["ta_slug"] for f in starved],
        "short_fetch_tas": [f["ta_slug"] for f in short],
    }
    summary_path = Path(run_summary_out) if run_summary_out else (REPO_ROOT / "pubmed_run_summary.json")
    try:
        summary_path.write_text(json.dumps(run_summary, indent=2), encoding="utf-8")
        print(f"[pubmed_pipeline] wrote run summary -> {summary_path}")
    except OSError as exc:
        print(f"[pubmed_pipeline] [warn] could not write run summary to {summary_path}: {exc}")

    if dry_run:
        print("Dry run completed.")
        return ingestion_run_id

    if starved:
        detail = ", ".join(
            f"{f['ta_slug']}(cand={f['esearch_candidates']}, "
            f"articles={f['efetch_articles']}, upserted=0)"
            for f in starved
        )
        raise SystemExit(
            f"[pubmed_pipeline] FAIL: {len(starved)} TA(s) consumed candidates but persisted 0 "
            f"publications: {detail}. See {summary_path}."
        )

    if short:
        detail = ", ".join(
            f"{f['ta_slug']}(retrieved={f['esearch_retrieved']}, "
            f"target={f['esearch_target']}, available={f['esearch_available']}, "
            f"subdivided={f['chunks_subdivided']})"
            for f in short
        )
        raise SystemExit(
            f"[pubmed_pipeline] FAIL: {len(short)} TA(s) retrieved fewer PMIDs than ESearch "
            f"offered -- papers were silently dropped: {detail}. See {summary_path}."
        )

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
        "--primary-pmids-out",
        type=str,
        default=None,
        metavar="FILE",
        help="Write the PRIMARY windowed-query pmids (the esearch result set, one per line) to FILE. "
             "This is the authoritative batch identity for the orchestrator -- primary papers only, "
             "NOT second-pass author-history/enrichment pmids. Written even if empty (0 primary "
             "papers -> empty file).",
    )
    parser.add_argument(
        "--run-summary-out",
        type=str,
        default=None,
        metavar="FILE",
        help="Write the funnel-counter run summary (esearch_candidates/efetch_articles/"
             "publications_upserted/... per TA + totals) as JSON to FILE. Defaults to "
             "pubmed_run_summary.json at the repo root. Drives the non-zero-exit hard guard.",
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
