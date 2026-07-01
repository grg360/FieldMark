from __future__ import annotations

"""
NPI gap audit: US HCPs with no NPI, matched against the CMS NPPES read API.

Targets post-merge cohort rows where npi_number IS NULL, state and country
are set (USA), ordered by total_career_pubs (high first, nulls last). Writes
only hcps.npi_number, hcps.npi_taxonomy, and hcps.npi_specialty.

Environment: SUPABASE_URL, SUPABASE_KEY (via .env).
"""

import argparse
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/"
CHECKPOINT_FILENAME = "npi_gap_checkpoint.json"
PAGE_SIZE = 1000
CHECKPOINT_EVERY = 500
PROGRESS_EVERY = 500
SLEEP_SECONDS = 0.1
REQUEST_TIMEOUT = (5, 25)
MAX_NPPES_RESULTS = 10

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("npi_gap_audit")


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def env_flag_true(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "y", "on"}


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def normalize_name(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).strip().lower().split())


# Full state / territory names -> USPS 2-letter (NPPES expects 2-letter state).
_STATE_NAME_TO_CODE: Dict[str, str] = {
    "alabama": "AL",
    "alaska": "AK",
    "american samoa": "AS",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "guam": "GU",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "northern mariana islands": "MP",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "puerto rico": "PR",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virgin islands": "VI",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}


def us_state_code(value: Optional[str]) -> str:
    """Map HCP or NPPES state to a 2-letter USPS code for API params and equality checks."""
    if value is None:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    if len(raw) == 2 and raw.isalpha():
        return raw.upper()
    return _STATE_NAME_TO_CODE.get(raw.lower(), "")


def primary_given_for_nppes_query(first_name: str) -> str:
    """
    NPPES name search is literal; middle initials (e.g. 'Carl H') often return zero rows.
    Use the first whitespace-delimited token for the API query only.
    """
    parts = str(first_name or "").strip().split()
    return parts[0] if parts else ""


def given_names_align(hcp_first: Optional[str], registry_first: Optional[str]) -> bool:
    """
    NPPES basic.first_name is often a single given name; hcps may store 'Carl H.' or 'Carl H'.
    Require the first given-name token to match (after normalize), or full-string equality.
    """
    h = normalize_name(hcp_first)
    r = normalize_name(registry_first)
    if not h or not r:
        return False
    if h == r:
        return True
    h_tok = h.split()
    r_tok = r.split()
    if not h_tok or not r_tok:
        return False
    if h_tok[0] != r_tok[0]:
        return False
    return len(h_tok[0]) >= 2 and len(r_tok[0]) >= 2


def normalize_city(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).strip().lower().split())


def load_checkpoint(path: Path) -> Set[str]:
    if not path.is_file():
        return set()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("Could not read checkpoint %s: %s; starting fresh.", path, exc)
        return set()
    ids = data.get("processed_ids")
    if isinstance(ids, list):
        return {str(x) for x in ids if x is not None}
    return set()


def save_checkpoint(path: Path, processed_ids: Set[str]) -> None:
    payload = {"processed_ids": sorted(processed_ids)}
    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=0)
    except OSError as exc:
        log.warning("Failed to write checkpoint %s: %s", path, exc)


def fetch_hcps_gap_cohort(supabase: Client) -> List[Dict[str, Any]]:
    """Rows equivalent to SQL: npi NULL, state NOT NULL, country USA; merge_category unrestricted."""
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        try:
            response = (
                supabase.table("hcps")
                .select(
                    "id,first_name,last_name,institution_short,city,state,country,"
                    "total_career_pubs,npi_number,merge_category"
                )
                .is_("npi_number", "null")
                .not_.is_("state", "null")
                .eq("country", "USA")
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(f"Failed loading hcps at offset {offset}: {exc}") from exc
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    def sort_key(r: Dict[str, Any]) -> Tuple[int, float]:
        pubs = r.get("total_career_pubs")
        null_group = 1 if pubs is None else 0
        pub_val = float(pubs) if pubs is not None else 0.0
        return (null_group, -pub_val)

    rows.sort(key=sort_key)
    return rows


def best_address(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    addresses = result.get("addresses", [])
    if not isinstance(addresses, list):
        return None
    for addr in addresses:
        if isinstance(addr, dict) and addr.get("address_purpose") == "LOCATION":
            return addr
    for addr in addresses:
        if isinstance(addr, dict):
            return addr
    return None


def result_name_state_match(result: Dict[str, Any], hcp: Dict[str, Any]) -> bool:
    basic = result.get("basic", {})
    if not isinstance(basic, dict):
        return False
    h_last = normalize_name(hcp.get("last_name"))
    r_last = normalize_name(basic.get("last_name"))
    if not h_last or not r_last or h_last != r_last:
        return False
    if not given_names_align(hcp.get("first_name"), basic.get("first_name")):
        return False
    addr = best_address(result)
    r_state = us_state_code(addr.get("state") if isinstance(addr, dict) else None)
    h_state = us_state_code(hcp.get("state"))
    if not h_state or not r_state:
        return False
    return r_state == h_state


def result_city(result: Dict[str, Any]) -> str:
    addr = best_address(result)
    if not isinstance(addr, dict):
        return ""
    return normalize_city(addr.get("city"))


def primary_taxonomy(result: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    taxonomies = result.get("taxonomies", [])
    if not isinstance(taxonomies, list) or not taxonomies:
        return None, None
    chosen: Optional[Dict[str, Any]] = None
    for t in taxonomies:
        if isinstance(t, dict) and t.get("primary") is True:
            chosen = t
            break
    if chosen is None and isinstance(taxonomies[0], dict):
        chosen = taxonomies[0]
    if not isinstance(chosen, dict):
        return None, None
    code = chosen.get("code") or chosen.get("taxonomy_code")
    desc = chosen.get("desc") or chosen.get("description")
    code_s = str(code).strip() if code is not None else None
    desc_s = str(desc).strip() if desc is not None else None
    return (code_s or None, desc_s or None)


def choose_nppes_match(hcp: Dict[str, Any], results: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Returns (chosen_result, reason_tag).
    reason_tag: matched_single | matched_city | no_results | no_name_state_match |
                ambiguous_multi | skip_missing_hcp_names
    """
    first = str(hcp.get("first_name") or "").strip()
    last = str(hcp.get("last_name") or "").strip()
    if not first or not last:
        return None, "skip_missing_hcp_names"

    if not results:
        return None, "no_results"

    name_state_matches = [r for r in results if isinstance(r, dict) and result_name_state_match(r, hcp)]
    if not name_state_matches:
        return None, "no_name_state_match"

    if len(name_state_matches) == 1:
        return name_state_matches[0], "matched_single"

    hcp_city = normalize_city(hcp.get("city"))
    if not hcp_city:
        return None, "ambiguous_multi"

    city_matches = [r for r in name_state_matches if result_city(r) == hcp_city]
    if len(city_matches) == 1:
        return city_matches[0], "matched_city"

    return None, "ambiguous_multi"


def call_nppes(
    session: requests.Session,
    first_name: str,
    last_name: str,
    state: str,
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Returns (results, error_tag). error_tag is '' on success.
    On 429, waits 10s and retries (up to 4 attempts). Network errors retry once, then fail.
    """
    state_code = us_state_code(state)
    if not state_code:
        return [], "skip_invalid_state"

    params: Dict[str, str] = {
        "version": "2.1",
        "first_name": first_name,
        "last_name": last_name,
        "state": state_code,
        "limit": str(MAX_NPPES_RESULTS),
        "enumeration_type": "NPI-1",
    }
    if env_flag_true("NPI_GAP_DEBUG"):
        log.info("NPPES URL %s?%s", NPPES_API_URL.rstrip("/"), urlencode(params))

    last_err = ""
    for attempt in range(4):
        try:
            response = session.get(NPPES_API_URL, params=params, timeout=REQUEST_TIMEOUT)
            if response.status_code == 429:
                log.warning("NPPES 429; backing off 10s (attempt %s)", attempt + 1)
                time.sleep(10.0)
                last_err = "429"
                continue
            response.raise_for_status()
            try:
                payload = response.json()
            except ValueError:
                return [], "bad_json"
        except requests.RequestException as exc:
            last_err = f"network:{exc}"
            if attempt == 0:
                time.sleep(1.0)
                continue
            log.warning("NPPES request failed after retry: %s", exc)
            return [], last_err

        if not isinstance(payload, dict):
            return [], "bad_shape"
        results = payload.get("results", [])
        if isinstance(results, list):
            return [r for r in results if isinstance(r, dict)], ""
        return [], "bad_shape"

    return [], last_err or "429_exhausted"


def update_hcp_npi_fields(
    supabase: Client,
    hcp_id: str,
    npi_number: str,
    npi_taxonomy: Optional[str],
    npi_specialty: Optional[str],
) -> bool:
    payload: Dict[str, Any] = {
        "npi_number": npi_number,
        "npi_taxonomy": npi_taxonomy,
        "npi_specialty": npi_specialty,
    }
    try:
        supabase.table("hcps").update(payload).eq("id", hcp_id).is_("npi_number", "null").execute()
        return True
    except Exception as exc:
        log.warning("DB update failed for hcp_id=%s: %s", hcp_id, exc)
        return False


def extract_npi_number(result: Dict[str, Any]) -> Optional[str]:
    n = result.get("number")
    if n is None:
        return None
    s = str(n).strip()
    return s or None


def run_audit(checkpoint_path: Path, reset_checkpoint: bool) -> None:
    load_dotenv()
    supabase = init_supabase()

    if reset_checkpoint and checkpoint_path.is_file():
        checkpoint_path.unlink(missing_ok=True)
        log.info("Removed checkpoint file %s.", checkpoint_path)

    processed_ids = load_checkpoint(checkpoint_path)
    log.info("Loaded checkpoint: %s HCP ids already processed.", len(processed_ids))

    session = requests.Session()
    session.headers.setdefault("User-Agent", "FieldMark-NPI-Gap-Audit/1.0")

    log.info("Loading HCP gap cohort (USA, state set, npi_number null)...")
    cohort = fetch_hcps_gap_cohort(supabase)
    queue = [r for r in cohort if r.get("id") and str(r["id"]) not in processed_ids]
    log.info("Queued %s HCPs after checkpoint filter.", len(queue))

    matched = 0
    ambiguous = 0
    skipped_other = 0
    skipped_invalid_state = 0
    failed = 0
    since_ckpt = 0
    processed = 0

    for hcp in queue:
        hcp_id = str(hcp["id"])
        first_name = str(hcp.get("first_name") or "").strip()
        last_name = str(hcp.get("last_name") or "").strip()
        state = str(hcp.get("state") or "").strip()

        chosen: Optional[Dict[str, Any]] = None
        reason = ""

        if not first_name or not last_name or not state:
            skipped_other += 1
            reason = "skip_missing_hcp_fields"
        else:
            results, err = call_nppes(
                session,
                primary_given_for_nppes_query(first_name),
                last_name,
                state,
            )
            if err:
                if err == "skip_invalid_state":
                    skipped_invalid_state += 1
                    reason = "skip_invalid_state"
                else:
                    failed += 1
                    reason = f"nppes_error:{err}"
            else:
                chosen, match_reason = choose_nppes_match(hcp, results)
                reason = match_reason
                if chosen is not None:
                    npi = extract_npi_number(chosen)
                    tax, spec = primary_taxonomy(chosen)
                    if not npi:
                        skipped_other += 1
                        reason = "no_npi_in_result"
                    elif not update_hcp_npi_fields(supabase, hcp_id, npi, tax, spec):
                        failed += 1
                        reason = "db_update_failed"
                    else:
                        matched += 1
                        reason = f"matched:{match_reason}"
                else:
                    if match_reason == "ambiguous_multi":
                        ambiguous += 1
                    else:
                        skipped_other += 1

        log.info(
            "decision hcp_id=%s name=%s %s state=%s inst=%s -> %s",
            hcp_id,
            first_name,
            last_name,
            state,
            (hcp.get("institution_short") or "")[:60],
            reason,
        )

        processed_ids.add(hcp_id)
        since_ckpt += 1
        processed += 1

        if since_ckpt >= CHECKPOINT_EVERY:
            save_checkpoint(checkpoint_path, processed_ids)
            since_ckpt = 0

        if processed % PROGRESS_EVERY == 0:
            log.info(
                "Progress: processed=%s matched=%s ambiguous=%s other_skips=%s invalid_state_skips=%s failed=%s",
                processed,
                matched,
                ambiguous,
                skipped_other,
                skipped_invalid_state,
                failed,
            )

        time.sleep(SLEEP_SECONDS)

    if since_ckpt > 0:
        save_checkpoint(checkpoint_path, processed_ids)

    log.info(
        "Processed %s HCPs, found %s new NPI matches, skipped %s (ambiguous), failed %s",
        processed,
        matched,
        ambiguous,
        failed,
    )
    log.info("Invalid-state skips (state not mappable to USPS code): %s", skipped_invalid_state)
    log.info("Other skips (no NPPES rows, no name/state match, missing fields): %s", skipped_other)


def main() -> None:
    parser = argparse.ArgumentParser(description="NPPES NPI gap audit for US HCPs without NPI.")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(CHECKPOINT_FILENAME),
        help=f"Checkpoint JSON path (default: {CHECKPOINT_FILENAME})",
    )
    parser.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="Delete checkpoint before run.",
    )
    args = parser.parse_args()
    run_audit(args.checkpoint.resolve(), reset_checkpoint=args.reset_checkpoint)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        log.exception("npi_gap_audit failed: %s", err)
        raise
