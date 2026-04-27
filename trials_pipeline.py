"""
ClinicalTrials.gov -> Supabase pipeline for FieldMark.

This script:
1) Queries ClinicalTrials.gov v2 API for rare disease / gene therapy / CAR-T /
   hematologic oncology trials.
2) Extracts trial metadata.
3) Extracts investigators and contact persons from each study.
4) Matches investigators to existing HCP records in Supabase by name when possible.
5) Stores trial rows in `clinical_trials` and investigator links in
   `trial_investigators`.

Environment variables are loaded from .env using python-dotenv.
Required:
- SUPABASE_URL
- SUPABASE_KEY

Optional:
- CTGOV_BASE_URL (default: https://clinicaltrials.gov/api/v2)
- CTGOV_PAGE_SIZE (default: 100)
- CTGOV_MAX_STUDIES (default: 1000)
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util.retry import Retry


TRIAL_QUERY = (
    "(rare disease OR orphan disease OR rare genetic disorder OR inborn error) "
    "AND "
    "(gene therapy OR CAR-T OR chimeric antigen receptor OR hematologic oncology "
    "OR leukemia OR lymphoma OR myeloma)"
)


@dataclass
class TrialRecord:
    nct_id: str
    title: Optional[str]
    phase: Optional[str]
    status: Optional[str]
    sponsor: Optional[str]
    start_date: Optional[str]
    completion_date: Optional[str]


@dataclass
class InvestigatorRecord:
    trial_nct_id: str
    first_name: Optional[str]
    last_name: Optional[str]
    role: Optional[str]
    source_text: str


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def build_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=5,
        read=5,
        connect=5,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def safe_get_json(
    session: requests.Session,
    url: str,
    params: Dict[str, str],
    timeout: int = 45,
) -> Dict:
    try:
        response = session.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("API response is not a JSON object.")
        return payload
    except requests.RequestException as exc:
        raise RuntimeError(f"HTTP request failed for {url}: {exc}") from exc
    except ValueError as exc:
        raise RuntimeError(f"Invalid JSON response from {url}: {exc}") from exc


def normalize_space(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def normalize_key(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().lower()


def split_name(raw_name: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Attempt to split a human name into first and last.
    Handles "Last, First" and "First Middle Last" forms.
    """
    raw_name = normalize_space(raw_name)
    if not raw_name:
        return None, None

    # Remove credential suffixes from matching purposes.
    raw_name = re.sub(
        r",?\s*(MD|DO|PHD|MBBS|FRCP|MSC|MPH|RN|NP|PA-C|PA)\.?$",
        "",
        raw_name,
        flags=re.IGNORECASE,
    )
    raw_name = normalize_space(raw_name)
    if not raw_name:
        return None, None

    if "," in raw_name:
        parts = [p.strip() for p in raw_name.split(",") if p.strip()]
        if len(parts) >= 2:
            last = parts[0]
            first = parts[1].split()[0] if parts[1].split() else parts[1]
            return normalize_space(first), normalize_space(last)

    tokens = raw_name.split()
    if len(tokens) == 1:
        return None, normalize_space(tokens[0])
    first = tokens[0]
    last = tokens[-1]
    return normalize_space(first), normalize_space(last)


def parse_iso_date(raw: Optional[str]) -> Optional[str]:
    """
    Parse common ClinicalTrials.gov date values into YYYY-MM-DD.
    """
    raw = normalize_space(raw)
    if not raw:
        return None

    # Already ISO date.
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw

    # Year-month.
    if re.match(r"^\d{4}-\d{2}$", raw):
        return f"{raw}-01"

    # Year only.
    if re.match(r"^\d{4}$", raw):
        return f"{raw}-01-01"

    # Month Year (e.g., "January 2024").
    for fmt in ("%B %Y", "%b %Y"):
        try:
            parsed = datetime.strptime(raw, fmt)
            return date(parsed.year, parsed.month, 1).isoformat()
        except ValueError:
            continue

    return None


def flatten_phase(phases: Optional[Sequence[str]]) -> Optional[str]:
    if not phases:
        return None
    normalized = [normalize_space(p) for p in phases if normalize_space(p)]
    if not normalized:
        return None
    return "; ".join(sorted(set(normalized)))


def query_trials(
    session: requests.Session,
    base_url: str,
    query: str,
    page_size: int,
    max_studies: int,
) -> List[Dict]:
    """
    Query ClinicalTrials.gov v2 studies endpoint with pagination.
    """
    studies_url = f"{base_url}/studies"
    studies: List[Dict] = []
    next_page_token: Optional[str] = None

    while len(studies) < max_studies:
        params: Dict[str, str] = {
            "query.term": query,
            "pageSize": str(min(page_size, max_studies - len(studies))),
            "format": "json",
        }
        if next_page_token:
            params["pageToken"] = next_page_token

        payload = safe_get_json(session=session, url=studies_url, params=params)
        batch = payload.get("studies", [])
        if not isinstance(batch, list):
            raise RuntimeError("ClinicalTrials.gov payload missing expected 'studies' list.")

        studies.extend(study for study in batch if isinstance(study, dict))
        next_page_token = payload.get("nextPageToken")
        if not next_page_token or not batch:
            break

        time.sleep(0.2)

    return studies


def extract_trial_record(study: Dict) -> Optional[TrialRecord]:
    protocol = study.get("protocolSection", {}) or {}
    identification = protocol.get("identificationModule", {}) or {}
    status_module = protocol.get("statusModule", {}) or {}
    design_module = protocol.get("designModule", {}) or {}
    sponsor_module = protocol.get("sponsorCollaboratorsModule", {}) or {}

    nct_id = normalize_space(identification.get("nctId"))
    if not nct_id:
        return None

    title = normalize_space(identification.get("briefTitle"))
    phase = flatten_phase(design_module.get("phases"))
    status = normalize_space(status_module.get("overallStatus"))

    lead_sponsor = sponsor_module.get("leadSponsor", {}) or {}
    sponsor = normalize_space(lead_sponsor.get("name"))

    start_date = parse_iso_date(
        (status_module.get("startDateStruct", {}) or {}).get("date")
    )
    completion_date = parse_iso_date(
        (status_module.get("completionDateStruct", {}) or {}).get("date")
    )

    return TrialRecord(
        nct_id=nct_id,
        title=title,
        phase=phase,
        status=status,
        sponsor=sponsor,
        start_date=start_date,
        completion_date=completion_date,
    )


def extract_investigators(study: Dict, nct_id: str) -> List[InvestigatorRecord]:
    protocol = study.get("protocolSection", {}) or {}
    contacts_module = protocol.get("contactsLocationsModule", {}) or {}

    investigators: List[InvestigatorRecord] = []
    seen_signatures: Set[Tuple[str, str, str]] = set()

    def add_person(raw_name: Optional[str], role: Optional[str]) -> None:
        first_name, last_name = split_name(raw_name)
        source_text = normalize_space(raw_name) or ""
        role_norm = normalize_space(role) or "investigator"

        if not source_text:
            return
        sig = (normalize_key(first_name), normalize_key(last_name), normalize_key(role_norm))
        if sig in seen_signatures:
            return
        seen_signatures.add(sig)
        investigators.append(
            InvestigatorRecord(
                trial_nct_id=nct_id,
                first_name=first_name,
                last_name=last_name,
                role=role_norm,
                source_text=source_text,
            )
        )

    # Central contacts.
    for contact in contacts_module.get("centralContacts", []) or []:
        if not isinstance(contact, dict):
            continue
        add_person(contact.get("name"), contact.get("role") or "central_contact")

    # Overall officials.
    for official in contacts_module.get("overallOfficials", []) or []:
        if not isinstance(official, dict):
            continue
        add_person(official.get("name"), official.get("role") or "overall_official")

    # Location contacts and investigators.
    for location in contacts_module.get("locations", []) or []:
        if not isinstance(location, dict):
            continue
        contact = location.get("contact", {}) or {}
        add_person(contact.get("name"), contact.get("role") or "site_contact")

        for official in location.get("contacts", []) or []:
            if not isinstance(official, dict):
                continue
            add_person(official.get("name"), official.get("role") or "site_contact")

    return investigators


def init_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_key = get_required_env("SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def chunked(items: Sequence, size: int) -> Iterable[Sequence]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def upsert_trials(supabase: Client, trials: Sequence[TrialRecord]) -> Dict[str, str]:
    if not trials:
        return {}

    trial_id_map: Dict[str, str] = {}
    rows = [
        {
            "nct_id": trial.nct_id,
            "title": trial.title,
            "phase": trial.phase,
            "status": trial.status,
            "sponsor": trial.sponsor,
            "start_date": trial.start_date,
            "completion_date": trial.completion_date,
        }
        for trial in trials
    ]

    try:
        supabase.table("clinical_trials").upsert(
            rows,
            on_conflict="nct_id",
        ).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed to upsert clinical_trials: {exc}") from exc

    # Fetch trial IDs for mapping.
    nct_ids = [trial.nct_id for trial in trials]
    for batch in chunked(nct_ids, 100):
        try:
            query = (
                supabase.table("clinical_trials")
                .select("id,nct_id")
                .in_("nct_id", list(batch))
                .execute()
            )
            for row in query.data or []:
                trial_id_map[row["nct_id"]] = row["id"]
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch clinical trial IDs: {exc}") from exc

    return trial_id_map


def load_hcp_name_map(supabase: Client) -> Dict[Tuple[str, str], str]:
    """
    Build a name-based lookup from hcps(first_name,last_name) -> id.
    """
    name_map: Dict[Tuple[str, str], str] = {}
    offset = 0
    page_size = 1000

    while True:
        try:
            result = (
                supabase.table("hcps")
                .select("id,first_name,last_name")
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch HCP names from Supabase: {exc}") from exc

        rows = result.data or []
        if not rows:
            break

        for row in rows:
            first = normalize_key(row.get("first_name"))
            last = normalize_key(row.get("last_name"))
            if first and last:
                name_map[(first, last)] = row["id"]

        if len(rows) < page_size:
            break
        offset += page_size

    return name_map


def match_hcp_id(
    investigator: InvestigatorRecord,
    hcp_name_map: Dict[Tuple[str, str], str],
) -> Optional[str]:
    first = normalize_key(investigator.first_name)
    last = normalize_key(investigator.last_name)
    if first and last and (first, last) in hcp_name_map:
        return hcp_name_map[(first, last)]
    return None


def upsert_trial_investigators(
    supabase: Client,
    investigators: Sequence[InvestigatorRecord],
    trial_id_map: Dict[str, str],
    hcp_name_map: Dict[Tuple[str, str], str],
) -> int:
    rows = []
    for investigator in investigators:
        trial_id = trial_id_map.get(investigator.trial_nct_id)
        if not trial_id:
            continue

        hcp_id = match_hcp_id(investigator, hcp_name_map)
        rows.append(
            {
                "hcp_id": hcp_id,
                "trial_id": trial_id,
                "role": investigator.role,
            }
        )

    if not rows:
        return 0

    try:
        # If you can, enforce a unique constraint like (trial_id, hcp_id, role) in DB.
        supabase.table("trial_investigators").insert(
            rows,
            returning="minimal",
        ).execute()
    except Exception as exc:
        raise RuntimeError(f"Failed to upsert trial_investigators: {exc}") from exc

    return len(rows)


def run_pipeline() -> None:
    load_dotenv()

    base_url = os.getenv("CTGOV_BASE_URL", "https://clinicaltrials.gov/api/v2")
    page_size = int(os.getenv("CTGOV_PAGE_SIZE", "100"))
    max_studies = int(os.getenv("CTGOV_MAX_STUDIES", "1000"))

    session = build_session()
    supabase = init_supabase()

    print("Querying ClinicalTrials.gov...")
    studies = query_trials(
        session=session,
        base_url=base_url,
        query=TRIAL_QUERY,
        page_size=page_size,
        max_studies=max_studies,
    )
    if not studies:
        print("No studies found.")
        return
    print(f"Fetched {len(studies)} studies.")

    trial_records: List[TrialRecord] = []
    investigator_records: List[InvestigatorRecord] = []
    seen_nct_ids: Set[str] = set()

    for study in studies:
        trial = extract_trial_record(study)
        if not trial:
            continue
        if trial.nct_id in seen_nct_ids:
            continue
        seen_nct_ids.add(trial.nct_id)
        trial_records.append(trial)
        investigator_records.extend(extract_investigators(study, trial.nct_id))

    print(f"Prepared {len(trial_records)} unique trial records.")
    print(f"Prepared {len(investigator_records)} investigator/contact records.")

    print("Upserting clinical_trials...")
    trial_id_map = upsert_trials(supabase, trial_records)
    print(f"Mapped {len(trial_id_map)} trial IDs.")

    print("Loading HCP lookup map...")
    hcp_name_map = load_hcp_name_map(supabase)
    print(f"Loaded {len(hcp_name_map)} HCP name keys.")

    print("Upserting trial_investigators...")
    inserted_links = upsert_trial_investigators(
        supabase=supabase,
        investigators=investigator_records,
        trial_id_map=trial_id_map,
        hcp_name_map=hcp_name_map,
    )
    print(f"Upserted {inserted_links} trial-investigator links.")
    print("Pipeline completed successfully.")


if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as error:
        print(f"[ERROR] Pipeline failed: {error}")
        raise
