"""
Targeted NPPES enrichment for publication-side HCP records.

This script closes a specific enrichment gap in FieldMark: HCP rows that were created
or enhanced from publication (OpenAlex) data but never matched into NPPES because the
original enrichment path was NPI-keyed.

Contract:
- This script only UPDATEs existing `hcps` rows.
- This script never INSERTs new `hcps` rows.
- Ambiguous matches are skipped (not guessed), and decisions are logged for audit.

WHY STATE NARROWING IS ON BY DEFAULT (decided 2026-09-08)
---------------------------------------------------------
It was OFF, and the stated reason was: "nppes_practice_state is derived from institution
location and wrongly suppresses real matches." That reason was TRUE when written and is
FALSE NOW. The 2026-09-03 provenance repair emptied 14,676 institution-derived values out
of nppes_practice_state; the column holds only NPPES-sourced values, and for this script's
candidates (npi_number IS NULL) it is empty at every publication floor. The flag was
switched off to avoid a contaminated column that no longer exists.

Meanwhile the search state came from COALESCE(nppes_practice_state, derived_state), and
derived_state has no producer -- 1 to 21 candidates depending on the floor. So every live
registry search went out with no state, across all 50 states, and the measured consequence
is the ambiguity mode the log is full of: "no city discriminator" between a Boca Raton, a
Gurnee and a San Diego NPI for the same name. State was never the precision mechanism, but
without ANY discriminator, precision-first resolves to "match nothing".

institution_state is now in the COALESCE, matching nppes_matcher's blocking key, and it has
real coverage (173-1,855 candidates depending on floor). That is what makes narrowing worth
switching on: there is finally a column feeding it.

THE COST, AND WHY IT IS BOUNDED RATHER THAN ACCEPTED. An institution_state says where
someone PUBLISHES FROM, not where they practise, so as a hard filter it can suppress a real
match in another state -- and that miss now goes into the attempt memo, making a
wrong-state search permanent for that person. Two mechanisms bound it:

  1. STATELESS FALLBACK. institution-basis only: if the state-filtered search returns zero
     results, the search is repeated without the state. A weak state narrows; it never
     eliminates. nppes/derived basis gets no fallback -- those columns mean where the
     person practises, so zero results there is a real answer.
  2. THE CONFIRMATION GATE, imported from nppes_matcher, not restated here. An
     institution-basis match needs an independent signal (taxonomy / specialty /
     institution agreement) before an NPI is written. Without one it is logged
     'unconfirmed_institution' and HELD -- and that status is deliberately outside the
     attempt memo, because a gate decision is not a search failure and must be revisitable
     when the TA gets a confirming-taxonomy list.

--no-use-state restores the stateless behaviour for a one-off comparison.
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


TA_CONFIG_DIR = Path(__file__).resolve().parents[2] / "config" / "therapeutic_areas"

# match_confidence values that mean "we asked NPPES about this person and came back
# empty-handed". A row carrying one of these is the attempt memo.
#
# 'unconfirmed_institution' is DELIBERATELY NOT IN THIS TUPLE. It is not a search
# failure -- the registry answered, and the answer was held back by the confirmation
# gate. Memoising it would make a gate decision permanent and would strand those
# people the moment the TA gets a confirming-taxonomy list.
#
# nppes_enrichment_log_v2 carries NO CHECK on match_confidence (verified live
# 2026-09-08), so these values insert cleanly. The v1 DDL in build_enrichment_log_table's
# docstring below still shows a two-value CHECK; that is the v1 table, not this one.
MISS_CONFIDENCES = ("ambiguous", "no_match")
CONFIDENCE_UNCONFIRMED = "unconfirmed_institution"

# A write that was made and then WITHDRAWN (docs/npi_enrichment/01_revert_suspect_writes.sql).
# Memoised so the next run does not immediately re-write the same NPI, but kept as its own
# status: these are not search misses, and a report that lumped them in with the 515 genuine
# no-matches would hide the fact that we accepted an answer and then took it back.
CONFIDENCE_WITHDRAWN = "withdrawn_write"
CONFIDENCE_UNCONFIRMED_NAME = "unconfirmed_common_surname"

# SURNAME BLOCK GATE. Measured on the 2026-09-08 CRC run: of the attempts where NPPES
# returned something verifiable, 12.9% were ambiguous when the surname block was < 10 and
# 57.1% when it was 10-99 -- a 4.4x step. Above that it is a plateau (66.7 / 58.8 / 57.1 /
# 69.2 through to block >= 2000), so the discriminating boundary is 10, not any round
# number further up. A single NPPES result for a surname shared with ten or more people in
# hcps_v2 is evidence, not proof.
#
# It GATES, it does not reject: the match still needs an independent confirming signal, the
# same one the institution basis needs. Rejecting outright would discard 43 of 55 writes at
# this threshold, and inspection showed many of those are correct people failing only
# because the confirmer list is narrower than real NPPES coding.
SURNAME_BLOCK_GATE = 10
MEMO_CONFIDENCES = MISS_CONFIDENCES + (CONFIDENCE_WITHDRAWN,)

# THE CONFIRMATION GATE IS IMPORTED, NOT REIMPLEMENTED. nppes_matcher.py owns the rule
# that an institution-blocked candidate needs independent corroboration before an NPI is
# written, and owns the per-TA confirming-taxonomy lists. Two copies of that rule would
# drift, and the drift would be invisible -- both would still "have a gate".
import sys as _sys  # noqa: E402
_sys.path.insert(0, str(Path(__file__).resolve().parent))
_sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "utils"))
from nppes_matcher import (  # noqa: E402
    BASIS_DERIVED,
    BASIS_INSTITUTION,
    BASIS_NPPES,
    STATE_COLUMNS,
    confirmation_signals,
)
from ta_nppes_config import load_confirming_taxonomies  # noqa: E402


def fetch_surname_blocks(supabase_client: Client, surnames: Set[str]) -> Optional[Dict[str, int]]:
    """
    last_name_lower -> how many hcps_v2 rows share it.

    Reads the view hcp_surname_block_v1 (docs/npi_enrichment/03_rules.sql). Returns None
    -- not an empty dict -- when the view is absent, so the caller can say "the gate did
    not run" instead of silently behaving as though every surname were rare.
    """
    if not surnames:
        return {}
    out: Dict[str, int] = {}
    names = sorted(surnames)
    chunk = 200
    for i in range(0, len(names), chunk):
        try:
            resp = (
                supabase_client.table("hcp_surname_block_v1")
                .select("last_name_lower,freq")
                .in_("last_name_lower", names[i : i + chunk])
                .execute()
                .data
                or []
            )
        except Exception as exc:
            print(f"[SURNAME] view hcp_surname_block_v1 unavailable ({exc}).")
            return None
        for r in resp:
            out[str(r.get("last_name_lower") or "")] = int(r.get("freq") or 0)
    return out


def resolve_search_state(row: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """
    COALESCE(nppes_practice_state, derived_state, institution_state) + which column won.

    Identical to the blocking key in nppes_matcher.py, and it reads that script's
    STATE_COLUMNS so the two cannot diverge.
    """
    for column, basis in STATE_COLUMNS:
        value = str(row.get(column) or "").strip().upper()
        if value:
            return value, basis
    return "", None


def nppes_record_as_candidate(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Adapt one NPPES *API* result into the shape confirmation_signals() reads.

    The matcher works from the NPPES parquet (flat taxonomy_1..5 columns); the API
    returns a nested `taxonomies` list. This is the only difference between the two
    call sites, so it is the only thing adapted -- the gate itself is the imported one.
    """
    out: Dict[str, Any] = {}
    for i, tax in enumerate((record.get("taxonomies") or [])[:5], start=1):
        tax = tax or {}
        out[f"taxonomy_{i}"] = str(tax.get("code") or "").strip()
        out[f"primary_taxonomy_switch_{i}"] = "Y" if tax.get("primary") else "N"
    basic = record.get("basic") or {}
    out["credentials"] = str(basic.get("credential") or "")
    city = ""
    for addr in record.get("addresses") or []:
        if str((addr or {}).get("address_purpose") or "").upper() == "LOCATION":
            city = str((addr or {}).get("city") or "").strip()
            break
    out["practice_city"] = city
    return out


def resolve_min_career_pubs(slug: str) -> int:
    """
    The publication floor for candidate selection, from the TA config.

    It used to be a CLI default of 500, which meant every TA silently inherited the
    number NSCLC happened to run with. It is a per-TA judgement -- how many career
    publications make a name specific enough that a live registry search is worth a
    call and a write -- so it lives beside the TA's other decisions and there is no
    default. Same shape as nppes.taxonomies in nppes_workstream_b_ingest.py: named
    error, listing where to put the value, rather than a guess.
    """
    path = TA_CONFIG_DIR / f"{slug}.json"
    if not path.exists():
        raise SystemExit(f"No TA config at {path}.")
    with open(path, "r", encoding="utf-8") as fh:
        cfg = json.load(fh)
    value = (cfg.get("nppes") or {}).get("min_career_pubs")
    if value is None:
        raise SystemExit(
            f"TA {slug!r} has no nppes.min_career_pubs in config/therapeutic_areas/{slug}.json.\n"
            "  This is the publication floor above which an HCP is worth a live NPPES search.\n"
            "  It is a per-TA judgement and this script will not guess it -- a wrong floor\n"
            "  either burns API calls on names too common to resolve, or silently leaves a\n"
            "  cohort unenriched. Set it in the TA config, or pass --min-career-pubs to\n"
            "  override for a one-off run.\n"
            "  NSCLC and Atopic Dermatitis ran historically at 500; that is history, not a\n"
            "  recommendation for a new TA."
        )
    if not isinstance(value, int) or value < 0:
        raise SystemExit(
            f"nppes.min_career_pubs in config/therapeutic_areas/{slug}.json must be a "
            f"non-negative integer; got {value!r}."
        )
    return value


def fetch_attempt_memo(supabase_client: Client, target_version: str) -> Set[str]:
    """
    hcp_ids not to re-query: searched and came back ambiguous/no-match, or written
    and later withdrawn.

    WHY: candidate selection filters on npi_number IS NULL and the publication floor
    and nothing else, so a name the registry cannot resolve is re-queried against the
    live API every single week, forever. 2,106 HCPs already carry an enrichment-log row
    and still have no NPI. Nothing about the query changes between runs -- same name,
    same registry -- so the second call and the two-hundredth are the same call.

    A miss is memoised, not permanent: --retry-misses ignores this set, which is the
    right move after an NPPES data refresh or a change to the matching rules.
    """
    log_table = get_table_name("nppes_enrichment_log", target_version)
    memo: Set[str] = set()
    offset = 0
    while True:
        batch = (
            supabase_client.table(log_table)
            .select("hcp_id")
            .in_("match_confidence", list(MEMO_CONFIDENCES))
            .is_("reverted_at", "null")
            .order("hcp_id")
            .range(offset, offset + HCPS_PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        for row in batch:
            if row.get("hcp_id"):
                memo.add(str(row["hcp_id"]))
        if len(batch) < HCPS_PAGE_SIZE:
            break
        offset += HCPS_PAGE_SIZE
    return memo


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
    country_by_name: Dict[str, str] = {}
    chunk = 100  # institution names are long; keep the .in_ URL bounded
    for i in range(0, len(names), chunk):
        resp = (
            supabase_client.table("institution_geo_lookup")
            .select("institution_display_name,city,country_code")
            .in_("institution_display_name", names[i : i + chunk])
            .execute()
            .data
            or []
        )
        for r in resp:
            nm, city, cc = r.get("institution_display_name"), r.get("city"), r.get("country_code")
            if nm and city and nm not in city_by_name:
                city_by_name[nm] = str(city).strip()
            if nm and cc and nm not in country_by_name:
                country_by_name[nm] = str(cc).strip().upper()
    n_with = 0
    for c in candidates:
        key = str(c.get("institution_short") or "").strip()
        city = city_by_name.get(key)
        c["institution_city"] = city
        # RESOLVED institution country, for the non-US disqualifier. None means the
        # institution did not resolve -- which is NOT the same as non-US and must not
        # be treated as one.
        c["institution_country"] = country_by_name.get(key)
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
                    "id,first_name,last_name,middle_name,country,current_country,institution_normalized,"
                    "institution_canonical,total_career_pubs,npi_number,nppes_practice_state,"
                    "derived_state,institution_state,ingestion_run_id"
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
                search_state, state_basis = resolve_search_state(row)
                out.append(
                    {
                        "id": row.get("id"),
                        "first_name": first,
                        "last_name": last,
                        "derived_state": search_state or None,
                        "state_basis": state_basis,
                        "current_country": row.get("current_country"),
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
                "id,first_name,last_name,middle_name,country,current_country,institution_normalized,"
                "institution_canonical,total_career_pubs,npi_number,nppes_practice_state,"
                "derived_state,institution_state,ingestion_run_id"
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
        # NPPES search state: COALESCE(nppes_practice_state, derived_state, institution_state).
        # institution_state joined this COALESCE on 2026-09-08, making it identical to the
        # blocking key in nppes_matcher.py. Before that it was the first two columns, and the
        # provenance repair had emptied the first, so 94-98% of candidates reached a live
        # registry search carrying no state at all.
        search_state, state_basis = resolve_search_state(row)
        filtered_v2.append(
            {
                "id": row.get("id"),
                "first_name": first,
                "last_name": last,
                # `derived_state` is the historical key the rest of this script reads the
                # search state from. Kept as the carrier so no call site moves; what changed
                # is what feeds it, and `state_basis` records which column that was.
                "derived_state": search_state or None,
                "state_basis": state_basis,
                "current_country": row.get("current_country"),
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
    state_basis: Optional[str] = None,
    search_path: str = "",
    gate_signals: Optional[List[str]] = None,
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

    # THE BASIS RIDES ON THE ROW. A match found on an institution_state search state is
    # weaker than one found on a practice state, and six months from now the only way to
    # tell them apart is this field. Same principle as state_basis on the read side and
    # block_basis in nppes_matcher.
    log_payload = {
        "hcp_id": hcp_id,
        "matched_npi": npi,
        "match_confidence": "high_confidence",
        "match_reason": (
            "Applied targeted publication-source-to-NPPES enrichment update. "
            f"basis={state_basis or 'none'} path={search_path or 'unknown'}"
            + (f" confirmed_by={','.join(gate_signals)}" if gate_signals else "")
        ),
        "candidates_considered": {
            "search_state_basis": state_basis,
            "search_path": search_path,
            "confirmation_signals": list(gate_signals or []),
            "nppes_record": nppes_data,
        },
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
        default=None,
        help="Override the TA config's nppes.min_career_pubs for this run. NO DEFAULT: with "
             "--ta the value is read from config/therapeutic_areas/<slug>.json, which is "
             "where the per-TA judgement belongs.",
    )
    parser.add_argument(
        "--retry-misses",
        action="store_true",
        default=False,
        help="Ignore the attempt memo and re-query HCPs already logged ambiguous/no_match. "
             "Use after an NPPES data refresh or a change to the matching rules -- not "
             "routinely: nothing about an unchanged name/registry pair changes between runs.",
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
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Send the resolved search state to NPPES. ON by default since 2026-09-08 -- see "
             "the WHY STATE NARROWING IS ON block in the module docstring. --no-use-state "
             "restores the stateless behaviour.",
    )
    args = parser.parse_args()
    dry_run = args.dry_run
    sample_limit = args.sample_limit
    target_version = args.target_version
    ta_slug = args.ta
    retry_misses = args.retry_misses

    # The floor: explicit override wins, then the TA config, then a named error. An
    # --hcp-ids-file run bypasses the gate entirely and needs neither.
    if args.min_career_pubs is not None:
        min_career_pubs = args.min_career_pubs
        print(f"[GATE] min_career_pubs={min_career_pubs} (--min-career-pubs override)")
    elif args.hcp_ids_file:
        min_career_pubs = 0
        print("[GATE] min_career_pubs not consulted -- --hcp-ids-file defines the candidate set")
    elif ta_slug:
        min_career_pubs = resolve_min_career_pubs(ta_slug)
        print(f"[GATE] min_career_pubs={min_career_pubs} "
              f"(config/therapeutic_areas/{ta_slug}.json -> nppes.min_career_pubs)")
    else:
        raise SystemExit(
            "No publication floor available: pass --ta <slug> so it can be read from that "
            "TA's config, --min-career-pubs <n> to override, or --hcp-ids-file to define the "
            "candidate set directly."
        )

    ingestion_run_ids = args.ingestion_run_ids
    hcp_ids_file = args.hcp_ids_file
    use_state = args.use_state

    # The confirming-taxonomy list for the gate, from nppes_matcher's registry. A TA that
    # is absent from it cannot confirm on taxonomy, so its institution-basis matches are
    # held rather than written -- stated loudly here rather than discovered as a zero.
    allow_taxonomies = set(load_confirming_taxonomies(ta_slug)) if ta_slug else set()
    if allow_taxonomies:
        print(f"[GATE] {len(allow_taxonomies)} confirming taxonomy codes for {ta_slug}")
    else:
        print(
            f"[GATE] WARNING: nppes.confirming_taxonomies is empty for {ta_slug!r} in "
            "config/therapeutic_areas/. Institution-basis matches can only "
            "confirm on specialty or institution agreement, and will otherwise be HELD."
        )

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

    # ATTEMPT MEMO. Applied after selection rather than inside it so the skip is
    # COUNTED and printed: "0 candidates" and "0 candidates left after the memo" are
    # different facts and the second one must not read as the first.
    memo_skipped = 0
    if retry_misses:
        print("[MEMO] --retry-misses: attempt memo IGNORED, previously-missed HCPs re-queried.")
    else:
        memo = fetch_attempt_memo(supabase_client, target_version)
        before_memo = len(candidates)
        candidates = [h for h in candidates if str(h.get("id")) not in memo]
        memo_skipped = before_memo - len(candidates)
        print(
            f"[MEMO] {len(memo):,} HCPs previously logged ambiguous/no_match; "
            f"{memo_skipped:,} of {before_memo:,} candidates skipped, {len(candidates):,} remain. "
            f"Use --retry-misses to re-query them."
        )

    # City-based tiebreak signal: attach each HCP's institution city from institution_geo_lookup.
    n_city, n_total = attach_institution_city(supabase_client, candidates)
    pct = (100.0 * n_city / n_total) if n_total else 0.0
    print(
        f"[TIEBREAK] institution_geo_lookup city attached for {n_city}/{n_total} candidates "
        f"({pct:.1f}%). Tiebreak uses city ALONE (no state)."
    )
    print(f"[STATE] search state filter: {'ON (--use-state)' if use_state else 'OFF (default)'}")

    # NON-US DISQUALIFIER. The candidate filter trusts hcps_v2.country, which said 'US' for
    # physicians at Wuhan, Harbin, Changchun, Shaanxi and Western University -- 17 wrong NPI
    # writes on 2026-09-08. Two independent contradictions now disqualify:
    #   * the institution RESOLVES (institution_geo_lookup) to a country that is not US
    #   * current_country is set and is not US
    # An UNRESOLVED institution does NOT disqualify. 42 of 791 candidates at floor 25 do not
    # resolve, and treating unknown as non-US would silently drop them -- the same class of
    # error in the other direction.
    before_geo = len(candidates)
    kept: List[Dict[str, Any]] = []
    dropped_inst = dropped_country = 0
    for c in candidates:
        inst_cc = (c.get("institution_country") or "").upper()
        cur_cc = str(c.get("current_country") or "").strip().upper()
        if inst_cc and inst_cc != "US":
            dropped_inst += 1
            continue
        if cur_cc and cur_cc not in US_COUNTRY_CODES:
            dropped_country += 1
            continue
        kept.append(c)
    candidates = kept
    print(
        f"[NON-US] dropped {before_geo - len(candidates):,} of {before_geo:,} candidates "
        f"({dropped_inst:,} resolved non-US institution, {dropped_country:,} non-US "
        f"current_country); unresolved institutions kept."
    )

    # Surname block frequencies for the confirmation gate below.
    surname_blocks = fetch_surname_blocks(
        supabase_client, {str(c.get("last_name") or "").strip().lower() for c in candidates}
    )
    if surname_blocks is None:
        print(
            "[SURNAME] WARNING: block frequencies unavailable, so the common-surname "
            "confirmation gate DID NOT RUN. Matches on common names are being written on "
            "name evidence alone. Apply docs/npi_enrichment/03_rules.sql."
        )
    else:
        n_gated = sum(
            1 for c in candidates
            if surname_blocks.get(str(c.get("last_name") or "").strip().lower(), 0) >= SURNAME_BLOCK_GATE
        )
        print(
            f"[SURNAME] gate at block >= {SURNAME_BLOCK_GATE}: {n_gated:,} of "
            f"{len(candidates):,} candidates will need a confirming signal."
        )

    print(
        f"[START] Candidate HCP count: {len(candidates)} "
        f"(sample_limit={sample_limit}, dry_run={dry_run}, target_version={target_version})"
    )

    total_processed = 0
    unconfirmed = 0
    high_confidence = 0
    ambiguous = 0
    no_match = 0
    updated = 0

    for hcp in tqdm(candidates, desc="processing HCPs", unit="hcp"):
        total_processed += 1
        hcp_id = str(hcp.get("id"))
        first_name = str(hcp.get("first_name") or "")
        last_name = str(hcp.get("last_name") or "")
        state_basis = hcp.get("state_basis")
        # INSTITUTION-BASIS STATES ARE NOT SENT. Measured on the 2026-09-08 CRC run:
        # only 4 of 135 institution-basis candidates returned ANY result in their
        # institution's state (3%), all 4 failed verification, and 131 fell through to
        # the stateless fallback -- 131 wasted calls for zero verified writes. An
        # institution_state says where someone publishes from, and it turns out that is
        # simply not where they are registered.
        #
        # The BASIS IS STILL RESOLVED AND RECORDED, and the confirmation gate below still
        # keys on it. The gate keys on the candidate's state PROVENANCE, not on which
        # search found the record, so dropping the narrowing does not weaken it -- an
        # institution-basis candidate matched by a name-only search is if anything
        # weaker evidence, and still needs corroboration.
        send_state = use_state and state_basis in (BASIS_NPPES, BASIS_DERIVED)
        state = str(hcp.get("derived_state") or "") if send_state else ""

        print(
            f"[PROCESS] hcp_id={hcp_id} name={first_name} {last_name} "
            f"state={state or '-'} basis={state_basis or '-'} "
            f"pubs={hcp.get('total_career_pubs')}"
        )

        nppes_raw = search_nppes(first_name, last_name, state, max_results=20)
        search_path = f"state:{state_basis}" if state else f"stateless(basis={state_basis or 'none'})"

        # The stateless fallback that used to live here is gone with the narrowing it
        # protected: institution-basis candidates now go straight out without a state,
        # which is what the fallback made them do 131 times out of 135 anyway.
        decision = score_nppes_match(hcp, nppes_raw)
        match_type = decision.get("match")

        # THE CONFIRMATION GATE, for institution-basis candidates only.
        #
        # The same rule as nppes_matcher's, imported rather than restated: a state that
        # came from institution_state is legitimate for NARROWING and illegitimate for
        # DECIDING, so the match needs a signal that does not come from that state.
        # Candidates blocked on nppes/derived keep exactly the bar they had.
        gate_signals: List[str] = []
        surname_block = (surname_blocks or {}).get(last_name.strip().lower(), 0)
        needs_gate = (
            state_basis == BASIS_INSTITUTION
            or (surname_blocks is not None and surname_block >= SURNAME_BLOCK_GATE)
        )
        if match_type == "high_confidence" and needs_gate:
            gate_signals = confirmation_signals(
                hcp, nppes_record_as_candidate(decision.get("nppes_data") or {}), allow_taxonomies
            )
            if not gate_signals:
                unconfirmed += 1
                why = ("institution_state basis" if state_basis == BASIS_INSTITUTION
                       else f"surname block {surname_block} >= {SURNAME_BLOCK_GATE}")
                status = (CONFIDENCE_UNCONFIRMED if state_basis == BASIS_INSTITUTION
                          else CONFIDENCE_UNCONFIRMED_NAME)
                print(
                    f"[GATE] HELD hcp_id={hcp_id} npi={decision.get('npi')} -- {why}, and no "
                    f"independent signal corroborates it. Not written."
                )
                if not dry_run and not (
                    scoped_hcp_ids is not None and hcp_id not in scoped_hcp_ids
                ):
                    supabase_client.table(
                        get_table_name("nppes_enrichment_log", target_version)
                    ).insert(
                        {
                            "hcp_id": hcp_id,
                            "matched_npi": decision.get("npi"),
                            "match_confidence": status,
                            "match_reason": (
                                f"Match held, not written: {why}, and no independent confirming "
                                "signal (taxonomy/specialty/institution). Neither status is in "
                                "the attempt memo -- a gate hold is not a search failure and is "
                                f"revisitable. basis={state_basis} path={search_path}"
                            ),
                            "candidates_considered": {
                                "search_state": state,
                                "search_state_basis": state_basis,
                                "search_path": search_path,
                                "surname_block": surname_block,
                                "gate_reason": why,
                                "confirmation_signals": [],
                                "results": nppes_raw.get("results") or [],
                            },
                        }
                    ).execute()
                continue

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
                state_basis=state_basis,
                search_path=search_path,
                gate_signals=gate_signals,
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
                            "match_reason": "Multiple plausible NPPES matches; skipped. "
                                            f"basis={state_basis or 'none'} path={search_path}",
                            "candidates_considered": {
                                "search_state_basis": state_basis,
                                "search_path": search_path,
                                "results": nppes_raw.get("results") or [],
                            },
                        }
                    ).execute()

        else:
            no_match += 1
            print(
                f"[DECISION] NO_MATCH hcp_id={hcp_id} reason={decision.get('reason')}"
            )
            # A no-match used to write NOTHING, which is why the memo could not exist:
            # the most-repeated outcome was the one that left no trace, so it was the
            # one re-queried forever. Logging it is what makes the attempt memoisable.
            if not dry_run:
                if scoped_hcp_ids is not None and hcp_id not in scoped_hcp_ids:
                    print(f"[SAFETY] Skipping no_match log for out-of-scope hcp_id={hcp_id}")
                else:
                    supabase_client.table(
                        get_table_name("nppes_enrichment_log", target_version)
                    ).insert(
                        {
                            "hcp_id": hcp_id,
                            "matched_npi": None,
                            "match_confidence": "no_match",
                            "match_reason": f"No plausible NPPES match; skipped. "
                                            f"reason={decision.get('reason')} "
                                            f"basis={state_basis or 'none'} path={search_path}",
                            "candidates_considered": {
                                "search_state_basis": state_basis,
                                "search_path": search_path,
                                "results": nppes_raw.get("results") or [],
                            },
                        }
                    ).execute()

    print("\n[SUMMARY]")
    print(f"total_processed={total_processed}")
    print(f"high_confidence_matches={high_confidence}")
    print(f"ambiguous_skipped={ambiguous}")
    print(f"no_match_skipped={no_match}")
    print(f"unconfirmed_institution_held={unconfirmed} (matched, gate withheld the write)")
    print(f"memo_skipped={memo_skipped} (not re-queried; --retry-misses to force)")
    print(f"updated={updated} (dry_run={dry_run})")


if __name__ == "__main__":
    main()
