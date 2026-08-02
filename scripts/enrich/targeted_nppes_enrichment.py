"""
Targeted NPPES enrichment for publication-side HCP records.

This script closes a specific enrichment gap in FieldMark: HCP rows that were created
or enhanced from publication (OpenAlex) data but never matched into NPPES because the
original enrichment path was NPI-keyed.

Contract:
- This script only UPDATEs existing `hcps` rows.
- This script never INSERTs new `hcps` rows.
- Ambiguous matches are skipped (not guessed), and decisions are logged for audit.
"""

# ============================================================
# HCP DUPLICATE PREVENTION -- NOTE
# ============================================================
# This script UPDATEs existing rows only. It never INSERTs.
# No duplicate-creation risk. See Latest Documentation/INGESTION_README.md
# for context on the broader prevention workstream.
# ============================================================

from pathlib import Path
from dotenv import load_dotenv

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from tqdm import tqdm

import requests
from supabase import Client, create_client

# Load .env from the repo root. This file is scripts/enrich/<file>, so parents[2] is
# the repo root (parents[0]=scripts/enrich, [1]=scripts, [2]=repo root).
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1"
REQUEST_TIMEOUT_SECONDS = 20
API_SLEEP_SECONDS = 0.1
HCPS_PAGE_SIZE = 1000

US_COUNTRY_CODES = ("US", "USA")

US_STATES_AND_TERRITORIES = [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
    "PR",
]


def resolve_ta_slug(supabase_client: Client, slug: str) -> Tuple[str, str]:
    """Resolve a TA slug to (therapeutic_area_id, ta_name)."""
    rows = (
        supabase_client.table("therapeutic_areas")
        .select("id,name,slug")
        .eq("slug", slug)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError(f"No therapeutic_area found with slug='{slug}'")
    return str(rows[0]["id"]), str(rows[0]["name"])


def fetch_hcp_ids_for_ta(supabase_client: Client, ta_id: str) -> Set[str]:
    """Load hcp_ids tagged to a therapeutic area via hcp_therapeutic_areas_v2."""
    ta_table = "hcp_therapeutic_areas_v2"
    hcp_ids: Set[str] = set()
    offset = 0
    while True:
        batch = (
            supabase_client.table(ta_table)
            .select("hcp_id")
            .eq("therapeutic_area_id", ta_id)
            .order("hcp_id")
            .range(offset, offset + HCPS_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        for row in batch:
            hid = row.get("hcp_id")
            if hid:
                hcp_ids.add(str(hid))
        if len(batch) < HCPS_PAGE_SIZE:
            break
        offset += HCPS_PAGE_SIZE
    return hcp_ids


def fetch_hcp_ids_for_ingestion_runs(
    supabase_client: Client, ingestion_run_ids: List[str], *, target_version: str
) -> Set[str]:
    """Load hcp_ids whose hcps_v2.ingestion_run_id is in the given run set."""
    hcps_table = get_table_name("hcps", target_version)
    hcp_ids: Set[str] = set()
    for run_id in ingestion_run_ids:
        offset = 0
        while True:
            batch = (
                supabase_client.table(hcps_table)
                .select("id")
                .eq("ingestion_run_id", run_id)
                .order("id")
                .range(offset, offset + HCPS_PAGE_SIZE - 1)
                .execute()
                .data
                or []
            )
            if not batch:
                break
            for row in batch:
                hid = row.get("id")
                if hid:
                    hcp_ids.add(str(hid))
            if len(batch) < HCPS_PAGE_SIZE:
                break
            offset += HCPS_PAGE_SIZE
    return hcp_ids


def read_hcp_ids_file(path: str) -> Set[str]:
    """One HCP uuid per line; blanks ignored. Matches the stage-8 affected-set file
    format (compute_affected_hcps.py --out) used elsewhere in the cycle."""
    ids: Set[str] = set()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            s = line.strip()
            if s:
                ids.add(s)
    return ids


def build_scoped_hcp_ids(
    supabase_client: Client,
    *,
    ta_id: Optional[str],
    ingestion_run_ids: Optional[List[str]],
    target_version: str,
) -> Set[str]:
    """Build the scoped HCP id set. When both filters are given, intersect them."""
    scoped_sets: List[Set[str]] = []
    if ta_id:
        ta_hcps = fetch_hcp_ids_for_ta(supabase_client, ta_id)
        print(f"[SCOPE] TA filter: {len(ta_hcps):,} HCPs in hcp_therapeutic_areas_v2")
        scoped_sets.append(ta_hcps)
    if ingestion_run_ids:
        run_hcps = fetch_hcp_ids_for_ingestion_runs(
            supabase_client, ingestion_run_ids, target_version=target_version
        )
        print(
            f"[SCOPE] ingestion_run_id filter ({len(ingestion_run_ids)} run(s)): "
            f"{len(run_hcps):,} HCPs"
        )
        scoped_sets.append(run_hcps)

    if not scoped_sets:
        return set()

    scoped = scoped_sets[0]
    for extra in scoped_sets[1:]:
        scoped &= extra
    return scoped


def attach_institution_city(
    supabase_client: Client, candidates: List[Dict[str, Any]]
) -> Tuple[int, int]:
    """Populate candidate['institution_city'] for the city-based tiebreak.

    JOIN: institution_geo_lookup.institution_display_name = the HCP's institution string
    (candidate['institution_short'] = COALESCE(institution_normalized, institution_canonical)),
    taking institution_geo_lookup.city. institution_display_name and institution_canonical
    share OpenAlex provenance, so exact-name join lands for ~97% of the retry population.
    Returns (n_with_city, n_total) for coverage reporting.
    """
    names = sorted(
        {str(c.get("institution_short")).strip() for c in candidates if c.get("institution_short")}
    )
    city_by_name: Dict[str, str] = {}
    chunk = 100  # institution names are long; keep the .in_ URL bounded
    for i in range(0, len(names), chunk):
        resp = (
            supabase_client.table("institution_geo_lookup")
            .select("institution_display_name,city")
            .in_("institution_display_name", names[i : i + chunk])
            .execute()
            .data
            or []
        )
        for r in resp:
            nm, city = r.get("institution_display_name"), r.get("city")
            if nm and city and nm not in city_by_name:
                city_by_name[nm] = str(city).strip()
    n_with = 0
    for c in candidates:
        city = city_by_name.get(str(c.get("institution_short") or "").strip())
        c["institution_city"] = city
        if city:
            n_with += 1
    return n_with, len(candidates)


def create_supabase_client() -> Client:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_service_key = os.environ.get("SUPABASE_KEY")

    if not supabase_url or not supabase_service_key:
        raise RuntimeError(
            "Missing SUPABASE_URL and/or SUPABASE_KEY environment variables."
        )

    return create_client(supabase_url, supabase_service_key)


def get_candidate_hcps(
    supabase_client: Client,
    min_career_pubs: int = 500,
    us_only: bool = True,
    limit: Optional[int] = None,
    target_version: str = "v1",
    scoped_hcp_ids: Optional[Set[str]] = None,
    explicit_hcp_ids: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    if explicit_hcp_ids is not None:
        # --hcp-ids-file: the id list IS the candidate set. BYPASS the min_career_pubs
        # gate and the openalex/us_only filters (and any --ta/--ingestion-run-id scoping) —
        # the caller has already chosen who to enrich. npi_number IS NULL is still enforced:
        # the write path only sets NPI where NULL, so any id that already has an NPI is
        # fetched-and-skipped here, never overwritten. v2 tables only (enforced in main).
        hcps_table = get_table_name("hcps", target_version)
        ids = sorted(explicit_hcp_ids)
        id_chunk = 150  # keep the .in_ URL under PostgREST's request-line limit
        out: List[Dict[str, Any]] = []
        for i in range(0, len(ids), id_chunk):
            chunk = ids[i : i + id_chunk]
            batch = (
                supabase_client.table(hcps_table)
                .select(
                    "id,first_name,last_name,middle_name,country,institution_normalized,"
                    "institution_canonical,total_career_pubs,npi_number,nppes_practice_state,"
                    "derived_state,ingestion_run_id"
                )
                .in_("id", chunk)
                .is_("npi_number", "null")
                .execute()
                .data
                or []
            )
            for row in batch:
                first = str(row.get("first_name") or "").strip()
                last = str(row.get("last_name") or "").strip()
                if not first or not last:
                    continue
                nppes_state = (
                    str(row.get("nppes_practice_state") or row.get("derived_state") or "")
                    .strip()
                    .upper()
                )
                out.append(
                    {
                        "id": row.get("id"),
                        "first_name": first,
                        "last_name": last,
                        "derived_state": nppes_state or None,
                        "institution_short": row.get("institution_normalized")
                        or row.get("institution_canonical"),
                        "total_career_pubs": row.get("total_career_pubs"),
                    }
                )
            if limit is not None and len(out) >= limit:
                return out[:limit]
        return out

    if target_version == "v1":
        query = (
            supabase_client.table("hcps")
            .select(
                "id, first_name, last_name, derived_state, institution_short, "
                "total_career_pubs, openalex_author_id, npi_number"
            )
            .is_("npi_number", "null")
            .not_.is_("openalex_author_id", "null")
            .gte("total_career_pubs", min_career_pubs)
            .not_.is_("first_name", "null")
            .not_.is_("last_name", "null")
        )

        if us_only:
            query = query.in_("derived_state", US_STATES_AND_TERRITORIES)

        if limit is not None:
            query = query.limit(limit)

        response = query.execute()
        rows = response.data or []

        filtered: List[Dict[str, Any]] = []
        for row in rows:
            first = str(row.get("first_name") or "").strip()
            last = str(row.get("last_name") or "").strip()
            if not first or not last:
                continue
            filtered.append(
                {
                    "id": row.get("id"),
                    "first_name": first,
                    "last_name": last,
                    "derived_state": row.get("derived_state"),
                    "institution_short": row.get("institution_short"),
                    "total_career_pubs": row.get("total_career_pubs"),
                }
            )

        return filtered

    if scoped_hcp_ids is not None and not scoped_hcp_ids:
        return []

    hcps_table = get_table_name("hcps", target_version)
    raw_hcps: List[Dict[str, Any]] = []
    offset = 0
    while True:
        if limit is not None and len(raw_hcps) >= limit:
            break
        q = (
            supabase_client.table(hcps_table)
            .select(
                "id,first_name,last_name,middle_name,country,institution_normalized,"
                "institution_canonical,total_career_pubs,npi_number,nppes_practice_state,"
                "derived_state,ingestion_run_id"
            )
            .is_("npi_number", "null")
            .gte("total_career_pubs", min_career_pubs)
            .not_.is_("first_name", "null")
            .not_.is_("last_name", "null")
        )
        if us_only:
            q = q.in_("country", list(US_COUNTRY_CODES))
        batch = q.order("id").range(offset, offset + HCPS_PAGE_SIZE - 1).execute().data or []
        if not batch:
            break
        raw_hcps.extend(batch)
        if len(batch) < HCPS_PAGE_SIZE:
            break
        offset += HCPS_PAGE_SIZE

    filtered_v2: List[Dict[str, Any]] = []
    for row in raw_hcps:
        if limit is not None and len(filtered_v2) >= limit:
            break
        hcp_id = str(row.get("id") or "")
        if not hcp_id:
            continue
        if scoped_hcp_ids is not None and hcp_id not in scoped_hcp_ids:
            continue
        first = str(row.get("first_name") or "").strip()
        last = str(row.get("last_name") or "").strip()
        if not first or not last:
            continue
        # NPPES search state: COALESCE(nppes_practice_state, derived_state)
        nppes_state = (
            str(row.get("nppes_practice_state") or row.get("derived_state") or "")
            .strip()
            .upper()
        )
        filtered_v2.append(
            {
                "id": row.get("id"),
                "first_name": first,
                "last_name": last,
                "derived_state": nppes_state or None,
                "institution_short": row.get("institution_normalized")
                or row.get("institution_canonical"),
                "total_career_pubs": row.get("total_career_pubs"),
            }
        )

    return filtered_v2


def search_nppes(
    first_name: str, last_name: str, state: Optional[str], max_results: int = 20
) -> Dict[str, Any]:
    # NPPES treats first_name as exact match; strip middle initials by taking only first word
    nppes_first_name = first_name.split()[0] if first_name and first_name.split() else first_name

    params = {
        "first_name": nppes_first_name,
        "last_name": last_name,
        "limit": max_results,
    }
    # State is OFF by default (see --use-state). nppes_practice_state is derived from
    # institution location and is wrong often enough to suppress real matches (e.g. a KOL
    # sent TX against an MA record). Only sent when the caller passes a non-empty state.
    st = (state or "").strip()
    if st:
        params["state"] = st

    try:
        response = requests.get(
            NPPES_API_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS
        )

        if 500 <= response.status_code < 600:
            time.sleep(API_SLEEP_SECONDS)
            retry = requests.get(
                NPPES_API_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS
            )
            if retry.ok:
                return retry.json()
            print(
                f"[NPPES] Retry failed for {first_name} {last_name} "
                f"(status={retry.status_code}); skipping."
            )
            return {"results": []}

        if 400 <= response.status_code < 500:
            print(
                f"[NPPES] Client error for {first_name} {last_name} "
                f"(status={response.status_code}); skipping."
            )
            return {"results": []}

        if not response.ok:
            print(
                f"[NPPES] Unexpected status for {first_name} {last_name} "
                f"(status={response.status_code}); skipping."
            )
            return {"results": []}

        return response.json()

    except requests.RequestException as exc:
        print(f"[NPPES] Request error for {first_name} {last_name}: {exc}")
        return {"results": []}
    finally:
        time.sleep(API_SLEEP_SECONDS)


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").lower().strip().split())


def _extract_nppes_location_city(nppes_record: Dict[str, Any]) -> str:
    """City of the candidate's LOCATION-purpose (practice) address. For NPI-1 individual
    providers this is the only usable geographic discriminator — organization_name is always
    empty and practiceLocations is usually empty, so the practice city lives here."""
    for addr in nppes_record.get("addresses") or []:
        if str(addr.get("address_purpose") or "").lower() == "location":
            city = _normalize_text(addr.get("city"))
            if city:
                return city
    return ""


def _extract_primary_state(nppes_record: Dict[str, Any]) -> str:
    addresses = nppes_record.get("addresses") or []
    for addr in addresses:
        if str(addr.get("address_purpose") or "").lower() == "location":
            return str(addr.get("state") or "").upper().strip()
    if addresses:
        return str(addresses[0].get("state") or "").upper().strip()
    return ""


def _city_match(hcp_institution_city: Optional[str], candidate_location_city: str) -> bool:
    """Exact (normalized) match of the HCP's institution city against a candidate's LOCATION
    address city. City ALONE — deliberately NOT combined with state: OR-ing state in was
    measured to drop unique resolutions from 110 to 56 by adding spurious matches."""
    a = _normalize_text(hcp_institution_city)
    b = _normalize_text(candidate_location_city)
    if not a or not b:
        return False
    return a == b


def _get_primary_taxonomy_description(nppes_record: Dict[str, Any]) -> str:
    taxonomies = nppes_record.get("taxonomies") or []
    if not taxonomies:
        return ""

    primary = None
    for taxonomy in taxonomies:
        if bool(taxonomy.get("primary")):
            primary = taxonomy
            break

    chosen = primary or taxonomies[0]
    return str(chosen.get("desc") or "").strip()


def _verification_failure_reason(hcp_row: Dict[str, Any], nppes_record: Dict[str, Any]) -> str:
    basic = nppes_record.get("basic") or {}
    hcp_first_word = str(hcp_row.get("first_name") or "").strip().split()
    hcp_last = str(hcp_row.get("last_name") or "").strip().upper()
    nppes_first = str(basic.get("first_name") or "").strip().upper()
    nppes_last = str(basic.get("last_name") or "").strip().upper()

    if not hcp_first_word:
        return "missing HCP first_name"
    if nppes_first != hcp_first_word[0].upper():
        return "first_name exact mismatch (NPPES has '" + nppes_first + "', we expected '" + hcp_first_word[0].upper() + "')"
    if nppes_last != hcp_last:
        return "last_name mismatch"

    excluded_taxonomies = {
        "Nurse Practitioner",
        "Registered Nurse",
        "Physician Assistant",
        "Pharmacist",
        "Physical Therapist",
        "Occupational Therapist",
        "Speech-Language Pathologist",
        "Social Worker",
        "Counselor",
        "Peer Specialist",
        "Medical Assistant",
        "Nurse Anesthetist",
        "Midwife",
        "Optometrist",
        "Audiologist",
        "Dietitian",
        "Chiropractor",
        "Acupuncturist",
    }
    primary_taxonomy = _get_primary_taxonomy_description(nppes_record)
    if primary_taxonomy in excluded_taxonomies:
        return f"excluded taxonomy ({primary_taxonomy})"

    return ""


def _is_verified_match(hcp_row: Dict[str, Any], nppes_record: Dict[str, Any]) -> bool:
    return _verification_failure_reason(hcp_row, nppes_record) == ""


def score_nppes_match(
    hcp_row: Dict[str, Any], nppes_results: Dict[str, Any]
) -> Dict[str, Any]:
    results = nppes_results.get("results") or []
    if len(results) == 0:
        return {"match": "no_match", "reason": "NPPES returned zero results."}

    if len(results) == 1:
        only = results[0]
        if _is_verified_match(hcp_row, only):
            return {
                "match": "high_confidence",
                "npi": only.get("number"),
                "nppes_data": only,
                "reason": "Single NPPES result, verified match on name and taxonomy",
            }
        return {
            "match": "no_match",
            "reason": "Single NPPES result but failed verification: "
            + _verification_failure_reason(hcp_row, only),
        }

    hcp_institution_city = hcp_row.get("institution_city")
    verified_results = [rec for rec in results if _is_verified_match(hcp_row, rec)]
    if len(verified_results) == 0:
        return {
            "match": "no_match",
            "reason": "No NPPES results passed verification checks.",
        }

    strong_matches: List[Dict[str, Any]] = []
    candidates: List[Dict[str, Any]] = []

    for rec in verified_results:
        npi = rec.get("number")
        location_city = _extract_nppes_location_city(rec)

        city_hit = _city_match(hcp_institution_city, location_city)

        candidate_entry = {
            "npi": npi,
            "reason": "institution city match" if city_hit else "no city discriminator",
            "location_city": location_city,
            "state": _extract_primary_state(rec),
        }
        candidates.append(candidate_entry)

        if city_hit:
            strong_matches.append(
                {
                    "npi": npi,
                    "nppes_data": rec,
                    "reason": "Institution-city match among multiple verified results.",
                }
            )

    if len(verified_results) == 1:
        only_verified = verified_results[0]
        return {
            "match": "high_confidence",
            "npi": only_verified.get("number"),
            "nppes_data": only_verified,
            "reason": "Multiple NPPES results but exactly one passed verification (name + taxonomy match)",
        }

    if len(strong_matches) == 1:
        winner = strong_matches[0]
        return {
            "match": "high_confidence",
            "npi": winner["npi"],
            "nppes_data": winner["nppes_data"],
            "reason": winner["reason"],
        }

    return {"match": "ambiguous", "candidates": candidates}


def _compute_career_stage_years(hcp_id: str, nppes_data: Dict[str, Any]) -> Optional[int]:
    years_since_first_pub_year = nppes_data.get("years_since_first_pub_year")
    if years_since_first_pub_year is not None:
        try:
            years = int(years_since_first_pub_year)
            return max(years, 0)
        except (TypeError, ValueError):
            pass

    basic = nppes_data.get("basic") or {}
    enum_date = str(basic.get("enumeration_date") or "").strip()
    if not enum_date:
        return None

    try:
        parsed = datetime.strptime(enum_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        years = int((datetime.now(timezone.utc) - parsed).days / 365.25)
        return max(years, 0)
    except ValueError:
        print(f"[WARN] Could not parse enumeration_date for hcp_id={hcp_id}: {enum_date}")
        return None


def update_hcp_with_nppes(
    supabase_client: Client,
    hcp_id: str,
    npi: str,
    nppes_data: Dict[str, Any],
    dry_run: bool = True,
    target_version: str = "v1",
    scoped_hcp_ids: Optional[Set[str]] = None,
) -> bool:
    if scoped_hcp_ids is not None and hcp_id not in scoped_hcp_ids:
        print(
            f"[SAFETY] Refusing update for hcp_id={hcp_id}: outside scoped HCP set."
        )
        return False

    addresses = nppes_data.get("addresses") or []
    basic = nppes_data.get("basic") or {}

    practice_address = None
    for addr in addresses:
        if str(addr.get("address_purpose") or "").lower() == "location":
            practice_address = addr
            break
    if practice_address is None and addresses:
        practice_address = addresses[0]
    practice_address_line = None
    if isinstance(practice_address, dict):
        address_1 = str(practice_address.get("address_1") or "").strip()
        address_2 = str(practice_address.get("address_2") or "").strip()
        practice_address_line = address_1 or address_2 or None

    organization_npi = None
    if str(nppes_data.get("enumeration_type") or "").strip() == "NPI-2":
        organization_npi = npi

    nppes_career_stage_years = _compute_career_stage_years(hcp_id, nppes_data)
    payload = {
        "npi_number": npi,
        "nppes_practice_address": practice_address_line,
        "nppes_organization_npi": organization_npi,
        "nppes_career_stage_years": nppes_career_stage_years,
        "nppes_enriched_at": datetime.now(timezone.utc).isoformat(),
    }

    log_table = get_table_name("nppes_enrichment_log", target_version)
    hcps_table = get_table_name("hcps", target_version)
    detail_table = get_table_name("hcp_nppes_detail", target_version)

    if dry_run:
        print(f"[DRY RUN] Would update hcp_id={hcp_id} with payload={json.dumps(payload)}")
        return False

    if target_version == "v1":
        try:
            supabase_client.table(hcps_table).update(payload).eq("id", hcp_id).execute()
        except Exception as exc:
            error_msg = str(exc)
            if "duplicate key" in error_msg.lower() or "23505" in error_msg or "hcps_npi_number_key" in error_msg:
                print(f"[DUPLICATE_NPI] hcp_id={hcp_id} npi={npi} -- NPI already assigned to another HCP row. Logging and skipping.")
                try:
                    supabase_client.table(log_table).insert({
                        "hcp_id": hcp_id,
                        "matched_npi": npi,
                        "match_confidence": "ambiguous",
                        "match_reason": f"Duplicate NPI conflict: NPI {npi} already exists on another hcp_id. Likely HCP duplicate.",
                        "candidates_considered": nppes_data,
                    }).execute()
                except Exception as log_exc:
                    print(f"[LOG_FAILED] hcp_id={hcp_id}: {log_exc}")
                return False
            else:
                print(f"[UPDATE_FAILED] hcp_id={hcp_id}: {error_msg}")
                return False
    else:
        try:
            # npi_number IS NULL is enforced ON THE WRITE, not just at candidate
            # selection: with the npi_source/npi_verified_at stamps riding this
            # update, an unguarded .eq("id") would let a re-run (or select/write
            # race) overwrite an NPI set since selection. The predicate makes
            # that a 0-row update instead.
            response = (
                supabase_client.table(hcps_table)
                .update(
                    {
                        "npi_number": npi,
                        "nppes_career_stage_years": nppes_career_stage_years,
                        "npi_source": "script",
                        "npi_verified_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                .eq("id", hcp_id)
                .is_("npi_number", "null")
                .execute()
            )
            if not response.data:
                print(
                    f"[UPDATE_NO_DATA] hcp_id={hcp_id} npi={npi} - no row updated: id missing "
                    f"or npi_number already set (write-time IS NULL guard). Not counted as updated."
                )
                return False
        except Exception as exc:
            error_msg = str(exc)
            if "duplicate key" in error_msg.lower() or "23505" in error_msg or "hcps_npi_number_key" in error_msg:
                print(f"[DUPLICATE_NPI] hcp_id={hcp_id} npi={npi} -- NPI already assigned to another HCP row. Logging and skipping.")
                try:
                    supabase_client.table(log_table).insert({
                        "hcp_id": hcp_id,
                        "matched_npi": npi,
                        "match_confidence": "ambiguous",
                        "match_reason": f"Duplicate NPI conflict: NPI {npi} already exists on another hcp_id. Likely HCP duplicate.",
                        "candidates_considered": nppes_data,
                    }).execute()
                except Exception as log_exc:
                    print(f"[LOG_FAILED] hcp_id={hcp_id}: {log_exc}")
                return False
            else:
                print(f"[UPDATE_FAILED] hcp_id={hcp_id}: {error_msg}")
                return False

        try:
            detail_response = supabase_client.table(detail_table).upsert(
                {
                    "hcp_id": hcp_id,
                    "nppes_practice_address": practice_address_line,
                    "nppes_organization_npi": organization_npi,
                    "nppes_enriched_at": datetime.now(timezone.utc).isoformat(),
                },
                on_conflict="hcp_id",
            ).execute()
            if not detail_response.data:
                print(f"[DETAIL_UPSERT_NO_DATA] hcp_id={hcp_id} - detail upsert returned empty data")
        except Exception as exc:
            print(f"[DETAIL_UPSERT_FAILED] hcp_id={hcp_id}: {exc}")

    log_payload = {
        "hcp_id": hcp_id,
        "matched_npi": npi,
        "match_confidence": "high_confidence",
        "match_reason": "Applied targeted publication-source-to-NPPES enrichment update.",
        "candidates_considered": nppes_data,
    }
    try:
        supabase_client.table(log_table).insert(log_payload).execute()
    except Exception as log_exc:
        print(f"[LOG_FAILED] hcp_id={hcp_id}: {log_exc}")

    print(f"[UPDATE] hcp_id={hcp_id} updated and logged with matched NPI {npi}.")
    return True


def build_enrichment_log_table(supabase_client: Client, target_version: str = "v1") -> None:
    """
    # TO CREATE THIS TABLE, RUN THE SQL BELOW IN SUPABASE SQL EDITOR FIRST

    CREATE TABLE IF NOT EXISTS public.nppes_enrichment_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      hcp_id uuid REFERENCES public.hcps(id),
      matched_npi text,
      match_confidence text CHECK (match_confidence IN ('high_confidence', 'ambiguous')),
      match_reason text,
      candidates_considered jsonb,
      enriched_at timestamp DEFAULT NOW(),
      reverted_at timestamp NULL
    );
    """
    if target_version == "v2":
        print(
            "Skipping build_enrichment_log_table in v2 mode (nppes_enrichment_log_v2 already exists)"
        )
        return
    _ = supabase_client
    print(
        "[INFO] build_enrichment_log_table is documentation-only in this script. "
        "Run the SQL in Supabase SQL Editor manually."
    )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--sample-limit", type=int, default=None)
    parser.add_argument(
        "--min-career-pubs",
        type=int,
        default=500,
        help="Minimum total_career_pubs threshold for candidate selection (default 500).",
    )
    parser.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version. v1=legacy tables, v2=rebuild tables.",
    )
    parser.add_argument(
        "--ta",
        type=str,
        default=None,
        metavar="SLUG",
        help="Scope enrichment to HCPs tagged to this therapeutic area (e.g. atopic-dermatitis).",
    )
    parser.add_argument(
        "--ingestion-run-id",
        action="append",
        dest="ingestion_run_ids",
        default=None,
        metavar="UUID",
        help="Scope enrichment to HCPs from a specific Step C ingestion run (repeatable).",
    )
    parser.add_argument(
        "--hcp-ids-file",
        type=str,
        default=None,
        metavar="PATH",
        help="Enrich exactly the HCP uuids in this file (one per line, stage-8 affected-set "
             "format). The list defines the candidate set directly and BYPASSES "
             "--min-career-pubs; it also takes precedence over --ta / --ingestion-run-id. "
             "v2 only; npi_number IS NULL is still enforced (never overwrites an existing NPI).",
    )
    parser.add_argument(
        "--use-state",
        action="store_true",
        default=False,
        help="Restore the old behaviour: send nppes_practice_state to NPPES. OFF by default "
             "because that state is derived from institution location and wrongly suppresses "
             "real matches. State was never the precision mechanism (name + taxonomy are).",
    )
    args = parser.parse_args()
    dry_run = args.dry_run
    sample_limit = args.sample_limit
    min_career_pubs = args.min_career_pubs
    target_version = args.target_version
    ta_slug = args.ta
    ingestion_run_ids = args.ingestion_run_ids
    hcp_ids_file = args.hcp_ids_file
    use_state = args.use_state

    supabase_client = create_supabase_client()
    build_enrichment_log_table(supabase_client, target_version=target_version)

    scoped_hcp_ids: Optional[Set[str]] = None
    scoped_ta_id: Optional[str] = None
    scoped_ta_name: Optional[str] = None
    explicit_hcp_ids: Optional[Set[str]] = None

    if hcp_ids_file:
        if target_version != "v2":
            raise SystemExit("--hcp-ids-file requires --target-version v2.")
        explicit_hcp_ids = read_hcp_ids_file(hcp_ids_file)

    # v2 requires an explicit scope so frozen TAs are never touched. --hcp-ids-file
    # satisfies that requirement (it is the strictest scope of all).
    if (
        target_version == "v2"
        and not ta_slug
        and not ingestion_run_ids
        and explicit_hcp_ids is None
    ):
        raise SystemExit(
            "v2 mode requires scoping: pass --ta <slug>, --ingestion-run-id <uuid>, or "
            "--hcp-ids-file <path> so frozen TAs (e.g. NSCLC) are never touched."
        )

    if explicit_hcp_ids is not None:
        # PRECEDENCE: an explicit id list wins. It defines the candidate set directly and
        # bypasses the min_career_pubs gate; --ta / --ingestion-run-id are ignored.
        scoped_hcp_ids = explicit_hcp_ids
        print(f"\n{'='*60}")
        print(f"  EXPLICIT ID-LIST RUN: {len(explicit_hcp_ids):,} HCP id(s) from {hcp_ids_file}")
        print(f"  Candidate set = the id list; --min-career-pubs gate ({min_career_pubs}) BYPASSED.")
        if ta_slug or ingestion_run_ids:
            print("  [SCOPE] --hcp-ids-file takes precedence: --ta / --ingestion-run-id ignored.")
        print("  Only these ids can be selected or updated (npi_number IS NULL still enforced).")
        print(f"{'='*60}\n")
        if not explicit_hcp_ids:
            print("[SCOPE] --hcp-ids-file is empty. Exiting.")
            return
    elif ta_slug or ingestion_run_ids:
        if ta_slug:
            scoped_ta_id, scoped_ta_name = resolve_ta_slug(supabase_client, ta_slug)
        scoped_hcp_ids = build_scoped_hcp_ids(
            supabase_client,
            ta_id=scoped_ta_id,
            ingestion_run_ids=ingestion_run_ids,
            target_version=target_version,
        )
        print(f"\n{'='*60}")
        if scoped_ta_name:
            print(f"  TA-SCOPED RUN: {scoped_ta_name} (slug={ta_slug})")
            print(f"  therapeutic_area_id: {scoped_ta_id}")
        if ingestion_run_ids:
            print(f"  ingestion_run_id(s): {', '.join(ingestion_run_ids)}")
        print(f"  Scoped HCP count: {len(scoped_hcp_ids):,}")
        print(f"  Only these HCPs can be selected or updated.")
        print(f"{'='*60}\n")
        if not scoped_hcp_ids:
            print("[SCOPE] No HCPs match the scope filters. Exiting.")
            return

    candidates = get_candidate_hcps(
        supabase_client,
        min_career_pubs=min_career_pubs,
        us_only=True,
        limit=sample_limit,
        target_version=target_version,
        scoped_hcp_ids=scoped_hcp_ids,
        explicit_hcp_ids=explicit_hcp_ids,
    )

    if scoped_hcp_ids is not None:
        out_of_scope = [
            str(h.get("id"))
            for h in candidates
            if str(h.get("id")) not in scoped_hcp_ids
        ]
        if out_of_scope:
            raise RuntimeError(
                f"SAFETY VIOLATION: {len(out_of_scope)} candidate(s) outside scoped HCP set. Aborting."
            )

    # City-based tiebreak signal: attach each HCP's institution city from institution_geo_lookup.
    n_city, n_total = attach_institution_city(supabase_client, candidates)
    pct = (100.0 * n_city / n_total) if n_total else 0.0
    print(
        f"[TIEBREAK] institution_geo_lookup city attached for {n_city}/{n_total} candidates "
        f"({pct:.1f}%). Tiebreak uses city ALONE (no state)."
    )
    print(f"[STATE] search state filter: {'ON (--use-state)' if use_state else 'OFF (default)'}")

    print(
        f"[START] Candidate HCP count: {len(candidates)} "
        f"(sample_limit={sample_limit}, dry_run={dry_run}, target_version={target_version})"
    )

    total_processed = 0
    high_confidence = 0
    ambiguous = 0
    no_match = 0
    updated = 0

    for hcp in tqdm(candidates, desc="processing HCPs", unit="hcp"):
        total_processed += 1
        hcp_id = str(hcp.get("id"))
        first_name = str(hcp.get("first_name") or "")
        last_name = str(hcp.get("last_name") or "")
        # State OFF by default; only sent when --use-state is passed.
        state = str(hcp.get("derived_state") or "") if use_state else ""

        print(
            f"[PROCESS] hcp_id={hcp_id} name={first_name} {last_name} state={state} "
            f"pubs={hcp.get('total_career_pubs')}"
        )

        nppes_raw = search_nppes(first_name, last_name, state, max_results=20)
        decision = score_nppes_match(hcp, nppes_raw)
        match_type = decision.get("match")

        if match_type == "high_confidence":
            high_confidence += 1
            nppes_basic = (decision.get("nppes_data") or {}).get("basic") or {}
            nppes_name = (
                f"{str(nppes_basic.get('first_name') or '').strip()} "
                f"{str(nppes_basic.get('last_name') or '').strip()}"
            ).strip()
            print(
                f"[DECISION] HIGH_CONFIDENCE hcp_id={hcp_id} "
                f"npi={decision.get('npi')} nppes_name={nppes_name} "
                f"reason={decision.get('reason')}"
            )
            did_update = update_hcp_with_nppes(
                supabase_client=supabase_client,
                hcp_id=hcp_id,
                npi=str(decision.get("npi")),
                nppes_data=decision.get("nppes_data") or {},
                dry_run=dry_run,
                target_version=target_version,
                scoped_hcp_ids=scoped_hcp_ids,
            )
            if did_update:
                updated += 1

        elif match_type == "ambiguous":
            ambiguous += 1
            print(
                f"[DECISION] AMBIGUOUS hcp_id={hcp_id} "
                f"candidates={json.dumps(decision.get('candidates') or [])}"
            )
            if not dry_run:
                if scoped_hcp_ids is not None and hcp_id not in scoped_hcp_ids:
                    print(f"[SAFETY] Skipping ambiguous log for out-of-scope hcp_id={hcp_id}")
                else:
                    supabase_client.table(
                        get_table_name("nppes_enrichment_log", target_version)
                    ).insert(
                        {
                            "hcp_id": hcp_id,
                            "matched_npi": None,
                            "match_confidence": "ambiguous",
                            "match_reason": "Multiple plausible NPPES matches; skipped.",
                            "candidates_considered": nppes_raw.get("results") or [],
                        }
                    ).execute()

        else:
            no_match += 1
            print(
                f"[DECISION] NO_MATCH hcp_id={hcp_id} reason={decision.get('reason')}"
            )

    print("\n[SUMMARY]")
    print(f"total_processed={total_processed}")
    print(f"high_confidence_matches={high_confidence}")
    print(f"ambiguous_skipped={ambiguous}")
    print(f"no_match_skipped={no_match}")
    print(f"updated={updated} (dry_run={dry_run})")


if __name__ == "__main__":
    main()
