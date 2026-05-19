from __future__ import annotations

"""
Dry-run matcher: proposes HCP links for unmatched site_contact trial_investigators rows.
Writes to trial_investigator_match_proposals only (no updates to trial_investigators).
"""

import logging
import os
import re
import time
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

STATE_ABBREV_TO_NAME = {
    "AL": "alabama",
    "AK": "alaska",
    "AZ": "arizona",
    "AR": "arkansas",
    "CA": "california",
    "CO": "colorado",
    "CT": "connecticut",
    "DE": "delaware",
    "FL": "florida",
    "GA": "georgia",
    "HI": "hawaii",
    "ID": "idaho",
    "IL": "illinois",
    "IN": "indiana",
    "IA": "iowa",
    "KS": "kansas",
    "KY": "kentucky",
    "LA": "louisiana",
    "ME": "maine",
    "MD": "maryland",
    "MA": "massachusetts",
    "MI": "michigan",
    "MN": "minnesota",
    "MS": "mississippi",
    "MO": "missouri",
    "MT": "montana",
    "NE": "nebraska",
    "NV": "nevada",
    "NH": "new hampshire",
    "NJ": "new jersey",
    "NM": "new mexico",
    "NY": "new york",
    "NC": "north carolina",
    "ND": "north dakota",
    "OH": "ohio",
    "OK": "oklahoma",
    "OR": "oregon",
    "PA": "pennsylvania",
    "RI": "rhode island",
    "SC": "south carolina",
    "SD": "south dakota",
    "TN": "tennessee",
    "TX": "texas",
    "UT": "utah",
    "VT": "vermont",
    "VA": "virginia",
    "WA": "washington",
    "WV": "west virginia",
    "WI": "wisconsin",
    "WY": "wyoming",
    "DC": "district of columbia",
}

# full normalized name -> two-letter abbrev lower
STATE_FULL_TO_ABBREV: Dict[str, str] = {v: k.lower() for k, v in STATE_ABBREV_TO_NAME.items()}

logger = logging.getLogger("trial_investigator_matcher")
logging.basicConfig(level=logging.INFO, format="%(message)s")

PAGE_SIZE = 1000
INSERT_BATCH = 500


def env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def ns(v: Optional[str]) -> str:
    return " ".join(str(v or "").strip().split())


def nk(v: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9\s\-']", " ", ns(v).lower()).strip()


def normalize_state_to_abbrev(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    s = ns(raw)
    if len(s) == 2 and s.isalpha():
        return s.lower()
    key = nk(s)
    return STATE_FULL_TO_ABBREV.get(key)


def first_name_passes(raw_first: Optional[str], hcp_first: Optional[str]) -> bool:
    rf = ns(raw_first).lower()
    hf = ns(hcp_first).lower()
    if not rf or not hf:
        return False
    if rf == hf:
        return True
    if len(rf) == 1 and len(hf) >= 1 and rf == hf[0]:
        return True
    if len(hf) == 1 and len(rf) >= 1 and hf == rf[0]:
        return True
    return False


def institution_overlaps(raw_facility: Optional[str], hcp_institution: Optional[str]) -> bool:
    a = nk(raw_facility)
    b = nk(hcp_institution)
    if not a or not b:
        return False
    if b in a or a in b:
        return True
    toks = [t for t in b.split() if len(t) > 2]
    return bool(toks and any(t in a for t in toks))


def fetch_candidates(c: Client, last_lower: str, state_abbrev: str) -> List[Dict[str, Any]]:
    """HCPs with same last name (case-insensitive) and state, NPI present."""
    resp = (
        c.table("hcps")
        .select("id,first_name,last_name,city,state,institution_short")
        .not_.is_("npi_number", "null")
        .eq("last_name_lower", last_lower)
        .eq("state_lower", state_abbrev)
        .execute()
    )
    return list(resp.data or [])


def load_existing_proposed_ids(c: Client) -> set:
    """Load all trial_investigator_id values that already have a proposal."""
    existing = set()
    offset = 0
    page_size = 1000
    while True:
        resp = (
            c.table("trial_investigator_match_proposals")
            .select("trial_investigator_id")
            .order("trial_investigator_id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = list(resp.data or [])
        if not batch:
            break
        for row in batch:
            tid = row.get("trial_investigator_id")
            if tid:
                existing.add(str(tid))
        if len(batch) < page_size:
            break
        offset += page_size
    return existing


def decide_match(
    row: Dict[str, Any],
    candidates: List[Dict[str, Any]],
) -> Tuple[Optional[str], Optional[int], str, str, Optional[Dict[str, Any]]]:
    """
    Returns (proposed_hcp_id, confidence, status, decision_path, matched_candidate_or_none).
    """
    n_candidates = len(candidates)
    raw_first = row.get("investigator_raw_first_name")
    raw_last = row.get("investigator_raw_last_name")
    raw_facility = row.get("investigator_raw_facility")
    raw_city = row.get("investigator_raw_city") or ""

    if n_candidates == 0:
        return None, None, "no_candidate", "0_candidates", None

    if n_candidates == 1:
        cand = candidates[0]
        if first_name_passes(raw_first, cand.get("first_name")):
            return str(cand["id"]), 95, "matched_unique", "1_candidate_first_name_pass", cand
        return None, None, "first_name_mismatch", "1_candidate_first_name_fail", None

    if n_candidates <= 3:
        city_matches = [
            c
            for c in candidates
            if c.get("city") and ns(c["city"]).lower() == ns(raw_city).lower() and first_name_passes(raw_first, c.get("first_name"))
        ]
        if len(city_matches) == 1:
            c0 = city_matches[0]
            return str(c0["id"]), 85, "matched_disambiguated_city", "2-3_candidates_city_resolved", c0
        inst_matches = [
            c
            for c in candidates
            if institution_overlaps(raw_facility, c.get("institution_short"))
            and first_name_passes(raw_first, c.get("first_name"))
        ]
        if len(inst_matches) == 1:
            c0 = inst_matches[0]
            return str(c0["id"]), 75, "matched_disambiguated_institution", "2-3_candidates_institution_resolved", c0
        return None, None, "ambiguous", "2-3_candidates_unresolved", None

    if n_candidates <= 9:
        triple_matches = [
            c
            for c in candidates
            if c.get("city")
            and ns(c["city"]).lower() == ns(raw_city).lower()
            and first_name_passes(raw_first, c.get("first_name"))
            and institution_overlaps(raw_facility, c.get("institution_short"))
        ]
        if len(triple_matches) == 1:
            c0 = triple_matches[0]
            return str(c0["id"]), 70, "matched_strict", "4-9_candidates_triple_resolved", c0
        return None, None, "ambiguous", "4-9_candidates_unresolved", None

    triple_matches = [
        c
        for c in candidates
        if c.get("city")
        and ns(c["city"]).lower() == ns(raw_city).lower()
        and first_name_passes(raw_first, c.get("first_name"))
        and institution_overlaps(raw_facility, c.get("institution_short"))
    ]
    if len(triple_matches) == 1:
        c0 = triple_matches[0]
        return str(c0["id"]), 65, "matched_strict", "10+_candidates_triple_resolved", c0
    return None, None, "common_name_unresolved", "10+_candidates_unresolved", None


def proposal_row(
    row: Dict[str, Any],
    proposed_hcp_id: Optional[str],
    confidence: Optional[int],
    status: str,
    decision_path: str,
    n_candidates: int,
    matched: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "trial_investigator_id": row["id"],
        "proposed_hcp_id": proposed_hcp_id,
        "proposed_match_confidence": confidence,
        "proposed_match_status": status,
        "candidate_count": n_candidates,
        "decision_path": decision_path,
        "raw_first_name": row.get("investigator_raw_first_name"),
        "raw_last_name": row.get("investigator_raw_last_name"),
        "raw_facility": row.get("investigator_raw_facility"),
        "raw_city": row.get("investigator_raw_city"),
        "raw_state": row.get("investigator_raw_state"),
        "hcp_first_name": matched.get("first_name") if matched else None,
        "hcp_last_name": matched.get("last_name") if matched else None,
        "hcp_institution_short": matched.get("institution_short") if matched else None,
        "hcp_city": matched.get("city") if matched else None,
        "hcp_state": matched.get("state") if matched else None,
    }


def main() -> None:
    load_dotenv()
    c = sb()

    # HTTP/2 stream ID exhaustion mitigation
    # Track Supabase operations and recycle the client before hitting the ~20K limit
    op_counter = 0
    RECYCLE_THRESHOLD = 15000

    logger.info("Loading existing proposed trial_investigator_ids...")
    already_proposed = load_existing_proposed_ids(c)
    logger.info("Found %s existing proposed ids; these will be skipped.", len(already_proposed))
    t0 = time.time()
    candidate_cache: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}

    status_counts: Counter = Counter()
    path_counts: Counter = Counter()
    conf_counts: Counter = Counter()

    total_processed = 0
    offset = 0
    pending_inserts: List[Dict[str, Any]] = []

    while True:
        try:
            resp = (
                c.table("trial_investigators")
                .select(
                    "id,investigator_raw_first_name,investigator_raw_last_name,"
                    "investigator_raw_facility,investigator_raw_city,investigator_raw_state,"
                    "investigator_raw_country"
                )
                .eq("source", "site_contact")
                .is_("hcp_id", "null")
                .eq("investigator_raw_country", "United States")
                .not_.is_("investigator_raw_last_name", "null")
                .not_.is_("investigator_raw_first_name", "null")
                .not_.is_("investigator_raw_state", "null")
                .order("id")
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
            )
        except Exception as exc:
            logger.exception("Failed to fetch trial_investigators page at offset %s: %s", offset, exc)
            raise

        batch = list(resp.data or [])
        op_counter += 1
        if not batch:
            break

        for row in batch:
            # Recycle Supabase client to prevent HTTP/2 stream exhaustion
            if op_counter >= RECYCLE_THRESHOLD:
                try:
                    logger.info(f"[recycle] Recycling Supabase client after {op_counter} operations")
                    c = sb()
                    op_counter = 0
                except Exception as exc:
                    logger.warning(f"[recycle] Failed to recycle client: {exc}")

            if str(row["id"]) in already_proposed:
                continue
            total_processed += 1
            last_key = ns(row.get("investigator_raw_last_name")).lower()
            state_abbrev = normalize_state_to_abbrev(row.get("investigator_raw_state"))

            if not state_abbrev:
                prop = proposal_row(
                    row,
                    None,
                    None,
                    "no_candidate",
                    "invalid_state_normalization",
                    0,
                    None,
                )
                status_counts[prop["proposed_match_status"]] += 1
                path_counts[prop["decision_path"]] += 1
                pending_inserts.append(prop)
                if len(pending_inserts) >= INSERT_BATCH:
                    c.table("trial_investigator_match_proposals").insert(pending_inserts).execute()
                    op_counter += 1
                    pending_inserts.clear()
                if total_processed % PAGE_SIZE == 0:
                    logger.info("Processed %s rows...", total_processed)
                continue

            cache_key = (last_key, state_abbrev)
            if cache_key not in candidate_cache:
                candidate_cache[cache_key] = fetch_candidates(c, last_key, state_abbrev)
                op_counter += 1
            candidates = candidate_cache[cache_key]

            pid, conf, st, dpath, matched = decide_match(row, candidates)
            prop = proposal_row(row, pid, conf, st, dpath, len(candidates), matched)
            status_counts[st] += 1
            path_counts[dpath] += 1
            if conf is not None:
                conf_counts[conf] += 1

            pending_inserts.append(prop)
            if len(pending_inserts) >= INSERT_BATCH:
                c.table("trial_investigator_match_proposals").insert(pending_inserts).execute()
                op_counter += 1
                pending_inserts.clear()

            if total_processed % PAGE_SIZE == 0:
                logger.info("Processed %s rows...", total_processed)

        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    if pending_inserts:
        c.table("trial_investigator_match_proposals").insert(pending_inserts).execute()
        op_counter += 1

    elapsed = time.time() - t0

    print("\n=== Trial investigator matcher (dry-run) ===")
    print(f"Total input rows processed: {total_processed}")
    print("Distribution by proposed_match_status:")
    for k, v in sorted(status_counts.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {k}: {v}")
    print("Distribution by decision_path:")
    for k, v in sorted(path_counts.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {k}: {v}")
    print("Confidence distribution (matched proposals):")
    for level in (95, 85, 75, 70, 65):
        print(f"  {level}: {conf_counts.get(level, 0)}")
    print(f"Total runtime: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
