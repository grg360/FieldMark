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
from typing import Any, Dict, List, Optional

from tqdm import tqdm

import requests
from supabase import Client, create_client

# Load .env file from in project root (same directory as this script)
load_dotenv(Path(__file__).parent / ".env")


NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1"
REQUEST_TIMEOUT_SECONDS = 20
API_SLEEP_SECONDS = 0.1

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
) -> List[Dict[str, Any]]:
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


def search_nppes(
    first_name: str, last_name: str, state: Optional[str], max_results: int = 20
) -> Dict[str, Any]:
    # NPPES treats first_name as exact match; strip middle initials by taking only first word
    nppes_first_name = first_name.split()[0] if first_name and first_name.split() else first_name

    params = {
        "first_name": nppes_first_name,
        "last_name": last_name,
        "state": (state or "").strip(),
        "limit": max_results,
    }

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


def _extract_nppes_org_text(nppes_record: Dict[str, Any]) -> str:
    basic = nppes_record.get("basic") or {}
    org_name = basic.get("organization_name") or ""
    if org_name:
        return _normalize_text(org_name)

    first = basic.get("first_name") or ""
    last = basic.get("last_name") or ""
    return _normalize_text(f"{first} {last}")


def _extract_primary_state(nppes_record: Dict[str, Any]) -> str:
    addresses = nppes_record.get("addresses") or []
    for addr in addresses:
        if str(addr.get("address_purpose") or "").lower() == "location":
            return str(addr.get("state") or "").upper().strip()
    if addresses:
        return str(addresses[0].get("state") or "").upper().strip()
    return ""


def _has_strong_institution_match(institution_short: Optional[str], org_text: str) -> bool:
    inst = _normalize_text(institution_short)
    if not inst:
        return False
    return inst in org_text or org_text in inst


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

    institution_short = hcp_row.get("institution_short")
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
        org_text = _extract_nppes_org_text(rec)

        strong_inst = _has_strong_institution_match(institution_short, org_text)
        reason_parts = []
        if strong_inst:
            reason_parts.append("strong institution match")
        if not reason_parts:
            reason_parts.append("no strong discriminator")

        candidate_entry = {
            "npi": npi,
            "reason": ", ".join(reason_parts),
            "org_name": org_text,
            "state": _extract_primary_state(rec),
        }
        candidates.append(candidate_entry)

        if strong_inst:
            strong_matches.append(
                {
                    "npi": npi,
                    "nppes_data": rec,
                    "reason": "Strong institution_short match among multiple results.",
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
) -> bool:
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

    if dry_run:
        print(f"[DRY RUN] Would update hcp_id={hcp_id} with payload={json.dumps(payload)}")
        return False

    try:
        supabase_client.table("hcps").update(payload).eq("id", hcp_id).execute()
    except Exception as exc:
        error_msg = str(exc)
        if "duplicate key" in error_msg.lower() or "23505" in error_msg or "hcps_npi_number_key" in error_msg:
            print(f"[DUPLICATE_NPI] hcp_id={hcp_id} npi={npi} -- NPI already assigned to another HCP row. Logging and skipping.")
            try:
                supabase_client.table("nppes_enrichment_log").insert({
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

    log_payload = {
        "hcp_id": hcp_id,
        "matched_npi": npi,
        "match_confidence": "high_confidence",
        "match_reason": "Applied targeted publication-source-to-NPPES enrichment update.",
        "candidates_considered": nppes_data,
    }
    try:
        supabase_client.table("nppes_enrichment_log").insert(log_payload).execute()
    except Exception as log_exc:
        print(f"[LOG_FAILED] hcp_id={hcp_id}: {log_exc}")

    print(f"[UPDATE] hcp_id={hcp_id} updated and logged with matched NPI {npi}.")
    return True


def build_enrichment_log_table(supabase_client: Client) -> None:
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
    _ = supabase_client
    print(
        "[INFO] build_enrichment_log_table is documentation-only in this script. "
        "Run the SQL in Supabase SQL Editor manually."
    )


def main() -> None:
    dry_run = False
    # Set to None to process all candidates. Set to an integer for a small test run.
    sample_limit = None

    supabase_client = create_supabase_client()
    build_enrichment_log_table(supabase_client)

    candidates = get_candidate_hcps(
        supabase_client, min_career_pubs=500, us_only=True, limit=sample_limit
    )
    print(
        f"[START] Candidate HCP count: {len(candidates)} "
        f"(sample_limit={sample_limit}, dry_run={dry_run})"
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
        state = str(hcp.get("derived_state") or "")

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
                supabase_client.table("nppes_enrichment_log").insert(
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
