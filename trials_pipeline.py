from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import time
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

URL = "https://clinicaltrials.gov/api/v2/studies"
CKPT = "trials_pipeline_checkpoint.json"
ROLES = {"PRINCIPAL_INVESTIGATOR", "SUB_INVESTIGATOR", "STUDY_CHAIR", "STUDY_DIRECTOR"}

STATE_ABBREV_TO_NAME = {
    "AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas", "CA": "california",
    "CO": "colorado", "CT": "connecticut", "DE": "delaware", "FL": "florida", "GA": "georgia",
    "HI": "hawaii", "ID": "idaho", "IL": "illinois", "IN": "indiana", "IA": "iowa", "KS": "kansas",
    "KY": "kentucky", "LA": "louisiana", "ME": "maine", "MD": "maryland", "MA": "massachusetts",
    "MI": "michigan", "MN": "minnesota", "MS": "mississippi", "MO": "missouri", "MT": "montana",
    "NE": "nebraska", "NV": "nevada", "NH": "new hampshire", "NJ": "new jersey", "NM": "new mexico",
    "NY": "new york", "NC": "north carolina", "ND": "north dakota", "OH": "ohio", "OK": "oklahoma",
    "OR": "oregon", "PA": "pennsylvania", "RI": "rhode island", "SC": "south carolina", "SD": "south dakota",
    "TN": "tennessee", "TX": "texas", "UT": "utah", "VT": "vermont", "VA": "virginia",
    "WA": "washington", "WV": "west virginia", "WI": "wisconsin", "WY": "wyoming", "DC": "district of columbia",
}

logger = logging.getLogger("trials_pipeline")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


@dataclass
class S:
    processed: int = 0
    skipped: int = 0
    linked_hcps: int = 0
    trials: int = 0
    links: int = 0
    start: float = 0.0
    matched_high_hcps: int = 0
    matched_medium_hcps: int = 0
    rejected_low_hcps: int = 0


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


def dt(raw: Optional[str]) -> Optional[str]:
    s = ns(raw)
    if not s:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    if re.match(r"^\d{4}-\d{2}$", s):
        return f"{s}-01"
    if re.match(r"^\d{4}$", s):
        return f"{s}-01-01"
    for f in ("%B %Y", "%b %Y"):
        try:
            return datetime.strptime(s, f).strftime("%Y-%m-01")
        except ValueError:
            pass
    return None


def ph(phases: Optional[Sequence[str]]) -> Optional[str]:
    if not phases:
        return None
    v = sorted(set(ns(x) for x in phases if ns(x)))
    return "; ".join(v) if v else None


def lev(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    p = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        c = [i]
        for j, cb in enumerate(b, 1):
            c.append(min(c[j - 1] + 1, p[j] + 1, p[j - 1] + (0 if ca == cb else 1)))
        p = c
    return p[-1]


def splitn(raw: Optional[str]) -> Tuple[str, str]:
    s = ns(raw)
    # Strip trailing credentials repeatedly (MD, PhD, M.H.Sc, DrPH, FACP, etc.)
    pattern = r",?\s*(m\.?d\.?|d\.?o\.?|ph\.?d\.?|m\.?b\.?b\.?s\.?|m\.?p\.?h\.?|m\.?s\.?c\.?|m\.?h\.?s\.?c\.?|m\.?s\.?c\.?e\.?|d\.?s\.?c\.?|s\.?c\.?d\.?|dr\.?p\.?h\.?|f\.?a\.?[a-z]{2,4}\.?|r\.?n\.?|n\.?p\.?|pa-c|p\.?a\.?)$"
    while True:
        new_s = re.sub(pattern, "", s, flags=re.I)
        if new_s == s:
            break
        s = new_s
    if "," in s:
        p = [x.strip() for x in s.split(",") if x.strip()]
        if len(p) >= 2:
            return nk(p[1].split()[0] if p[1].split() else p[1]), nk(p[0])
    t = nk(s).split()
    if not t:
        return "", ""
    if len(t) == 1:
        return "", t[0]
    return t[0], t[-1]


def name_ok(first: str, last: str, off_name: str) -> bool:
    hf, hl = nk(first), nk(last)
    of, ol = splitn(off_name)
    if not hl or not ol:
        return False
    if hl == ol and hf and of and hf[0] == of[0]:
        return True
    return lev(f"{hf} {hl}".strip(), f"{of} {ol}".strip()) <= 2


def _affiliation_score_details(hcp: Dict, official: Dict, trial_locations: List[Dict]) -> Tuple[int, List[str]]:
    score = 0
    signals: List[str] = []
    hcp_inst_short = nk(hcp.get("institution_short"))
    hcp_inst_full = nk(hcp.get("institution_full"))
    hcp_city = nk(hcp.get("city"))
    hcp_state = nk(hcp.get("state"))
    off_aff = nk(official.get("affiliation"))

    if off_aff:
        for cand in [hcp_inst_short, hcp_inst_full]:
            if not cand:
                continue
            if cand in off_aff or off_aff in cand:
                score += 50
                signals.append("institution_in_official_affiliation")
                break
            toks = [t for t in cand.split() if len(t) > 2]
            if toks and sum(1 for t in toks if t in off_aff) >= max(1, min(3, len(toks))):
                score += 50
                signals.append("institution_token_overlap_in_official_affiliation")
                break

    if hcp_city and off_aff and hcp_city in off_aff:
        score += 40
        signals.append("city_in_official_affiliation")
    elif hcp_city and trial_locations:
        for loc in trial_locations:
            loc_city = nk((loc or {}).get("city", ""))
            if loc_city == hcp_city:
                score += 40
                signals.append("city_match_in_trial_locations")
                break

    if hcp_state and trial_locations:
        hcp_state_full = STATE_ABBREV_TO_NAME.get(hcp_state.upper(), hcp_state)
        for loc in trial_locations:
            loc_state = nk((loc or {}).get("state", ""))
            if loc_state == hcp_state or loc_state == nk(hcp_state_full):
                score += 30
                signals.append("state_match_in_trial_locations")
                break

    if hcp_inst_short and trial_locations:
        for loc in trial_locations:
            facility = nk((loc or {}).get("facility", ""))
            if facility and (hcp_inst_short in facility or facility in hcp_inst_short):
                score += 20
                signals.append("facility_matches_hcp_institution_short")
                break

    return min(score, 100), signals


def compute_affiliation_confidence(hcp: Dict, official: Dict, trial_locations: List[Dict]) -> int:
    score, _signals = _affiliation_score_details(hcp, official, trial_locations)
    return score


def load_ckpt() -> Set[str]:
    if not os.path.exists(CKPT):
        return set()
    try:
        with open(CKPT, "r", encoding="utf-8") as f:
            return set((json.load(f).get("processed_hcp_ids") or []))
    except Exception:
        return set()


def save_ckpt(ids: Set[str]) -> None:
    with open(CKPT, "w", encoding="utf-8") as f:
        json.dump({"processed_hcp_ids": sorted(ids), "saved_at": datetime.now(UTC).isoformat()}, f, indent=2)


def get_hcps(c: Client, target_version: str = "v1") -> List[Dict]:
    """Load HCPs with non-null state (includes Step C OpenAlex HCPs; NPI not required)."""
    hcps_table = get_table_name("hcps", target_version)
    if target_version == "v2":
        select_cols = (
            "id,first_name,last_name,institution_normalized,institution_raw,"
            "nppes_practice_city,nppes_practice_state,npi_number"
        )
        state_col = "nppes_practice_state"
    else:
        select_cols = "id,first_name,last_name,institution_short,institution_full,city,state,npi_number"
        state_col = "state"
    rows: List[Dict] = []
    o = 0
    while True:
        b = (
            c.table(hcps_table)
            .select(select_cols)
            .not_.is_(state_col, "null")
            .order("id")
            .range(o, o + 999)
            .execute()
            .data
            or []
        )
        if not b:
            break
        if target_version == "v2":
            for row in b:
                if "institution_normalized" in row:
                    row["institution_short"] = row.pop("institution_normalized")
                if "institution_raw" in row:
                    row["institution_full"] = row.pop("institution_raw")
                if "nppes_practice_city" in row:
                    row["city"] = row.pop("nppes_practice_city")
                if "nppes_practice_state" in row:
                    row["state"] = row.pop("nppes_practice_state")
        rows.extend(b)
        if len(b) < 1000:
            break
        o += 1000
    return rows


def stratified_test_sample(hcps: List[Dict], limit: int) -> List[Dict]:
    if limit < 50:
        return hcps[:limit]
    g1 = [h for h in hcps if h.get("institution_short") is not None]
    g2 = [h for h in hcps if h.get("institution_short") is None and h.get("city") is not None]
    all_ids = set()
    out: List[Dict] = []
    for group, n in [(g1, 10), (g2, 10)]:
        for h in group[:n]:
            hid = str(h.get("id"))
            if hid not in all_ids:
                out.append(h)
                all_ids.add(hid)
    remaining_pool = [h for h in hcps if str(h.get("id")) not in all_ids]
    random.Random(42).shuffle(remaining_pool)
    for h in remaining_pool[:30]:
        out.append(h)
    return out[:limit]


def ct(session: requests.Session, term: str, locn: Optional[str]) -> List[Dict]:
    p = {"query.term": term, "query.locn": locn or "", "pageSize": "1000", "countTotal": "true", "format": "json"}
    d = 0.5
    for i in range(3):
        try:
            r = session.get(URL, params=p, timeout=(6, 40))
            if r.status_code == 429 or 500 <= r.status_code < 600:
                raise requests.HTTPError(response=r)
            r.raise_for_status()
            x = r.json().get("studies", [])
            return [s for s in x if isinstance(s, dict)] if isinstance(x, list) else []
        except Exception:
            if i == 2:
                return []
            time.sleep(d)
            d *= 2
    return []


def extract(h: Dict, studies: Sequence[Dict]) -> Tuple[List[Dict], List[Dict], int, List[Dict]]:
    h_id = h.get("id")
    first = str(h.get("first_name") or "")
    last = str(h.get("last_name") or "")
    trials: Dict[str, Dict] = {}
    links: List[Dict] = []
    best_conf = -1
    sample_matches: List[Dict] = []
    for st in studies:
        p = st.get("protocolSection", {}) or {}
        idm = p.get("identificationModule", {}) or {}
        sm = p.get("statusModule", {}) or {}
        dm = p.get("designModule", {}) or {}
        scm = p.get("sponsorCollaboratorsModule", {}) or {}
        cm = p.get("contactsLocationsModule", {}) or {}
        nct = ns(idm.get("nctId"))
        if not nct:
            continue
        trial_locations = cm.get("locations", []) or []
        if not isinstance(trial_locations, list):
            trial_locations = []
        offs = cm.get("overallOfficials", []) or []
        if not isinstance(offs, list):
            continue
        captured_links: List[Dict] = []
        for o in offs:
            if not isinstance(o, dict):
                continue
            role = ns(o.get("role")).upper()
            if role == "CONTACT" or role not in ROLES:
                continue
            nm = ns(o.get("name"))
            if not nm:
                continue
            raw_first, raw_last = splitn(nm)
            raw_affiliation = ns(o.get("affiliation")) or None

            matched_hcp_id: Optional[str] = None
            matched_confidence: Optional[int] = None
            if name_ok(first, last, nm):
                confidence = compute_affiliation_confidence(h, o, trial_locations)
                best_conf = max(best_conf, confidence)
                if confidence >= 40:
                    matched_hcp_id = h_id
                    matched_confidence = confidence
                    score, signals = _affiliation_score_details(h, o, trial_locations)
                    if confidence < 60:
                        logger.debug(f"medium confidence match: {first} {last} <-> {nm} (score={confidence})")
                    if len(sample_matches) < 5:
                        sample_matches.append(
                            {
                                "hcp_name": f"{first} {last}".strip(),
                                "official_name": nm,
                                "nct_id": nct,
                                "score": score,
                                "signals": signals,
                            }
                        )

            captured_links.append(
                {
                    "hcp_id": matched_hcp_id,
                    "match_confidence": matched_confidence,
                    "nct_id": nct,
                    "role": role,
                    "investigator_name": nm or None,
                    "investigator_raw_first_name": raw_first or None,
                    "investigator_raw_last_name": raw_last or None,
                    "investigator_raw_affiliation": raw_affiliation,
                    "investigator_raw_facility": None,
                    "investigator_raw_city": None,
                    "investigator_raw_state": None,
                    "investigator_raw_country": None,
                    "source": "overall_official",
                }
            )

        locations = cm.get("locations", []) or []
        if not isinstance(locations, list):
            locations = []

        for loc in locations:
            if not isinstance(loc, dict):
                continue

            facility = ns(loc.get("facility")) or None
            city = ns(loc.get("city")) or None
            state = ns(loc.get("state")) or None
            country = ns(loc.get("country")) or None

            site_contacts = loc.get("contacts", []) or []
            if not isinstance(site_contacts, list):
                continue

            for sc in site_contacts:
                if not isinstance(sc, dict):
                    continue

                sc_role = ns(sc.get("role")).upper()
                if sc_role == "CONTACT" or sc_role not in ROLES:
                    continue

                sc_name = ns(sc.get("name"))
                if not sc_name:
                    continue

                sc_first, sc_last = splitn(sc_name)
                is_queried_match = name_ok(first, last, sc_name)

                if is_queried_match:
                    synthetic_official = {
                        "name": sc_name,
                        "affiliation": facility or "",
                    }
                    synthetic_locations = [{"facility": facility, "city": city, "state": state}]
                    confidence = compute_affiliation_confidence(h, synthetic_official, synthetic_locations)
                    best_conf = max(best_conf, confidence)
                    if confidence >= 40:
                        captured_links.append(
                            {
                                "hcp_id": h_id,
                                "nct_id": nct,
                                "role": sc_role,
                                "investigator_name": sc_name,
                                "investigator_raw_first_name": sc_first or None,
                                "investigator_raw_last_name": sc_last or None,
                                "investigator_raw_affiliation": facility,
                                "investigator_raw_facility": facility,
                                "investigator_raw_city": city,
                                "investigator_raw_state": state,
                                "investigator_raw_country": country,
                                "match_confidence": confidence,
                                "source": "site_contact",
                            }
                        )
                        continue

                captured_links.append(
                    {
                        "hcp_id": None,
                        "nct_id": nct,
                        "role": sc_role,
                        "investigator_name": sc_name,
                        "investigator_raw_first_name": sc_first or None,
                        "investigator_raw_last_name": sc_last or None,
                        "investigator_raw_affiliation": facility,
                        "investigator_raw_facility": facility,
                        "investigator_raw_city": city,
                        "investigator_raw_state": state,
                        "investigator_raw_country": country,
                        "match_confidence": None,
                        "source": "site_contact",
                    }
                )
        if not captured_links:
            continue
        lead = scm.get("leadSponsor", {}) or {}
        rp = scm.get("responsibleParty", {}) or {}

        collaborators_raw = scm.get("collaborators", []) or []
        collaborators_clean = [
            {"name": ns(c.get("name")), "class": ns(c.get("class"))}
            for c in collaborators_raw
            if isinstance(c, dict) and ns(c.get("name"))
        ]

        conditions_mod = p.get("conditionsModule", {}) or {}
        conditions_clean = [ns(c) for c in (conditions_mod.get("conditions", []) or []) if ns(c)]

        aim = p.get("armsInterventionsModule", {}) or {}
        interventions_raw = aim.get("interventions", []) or []
        interventions_clean = [
            {"type": ns(i.get("type")), "name": ns(i.get("name"))}
            for i in interventions_raw
            if isinstance(i, dict) and ns(i.get("name"))
        ]

        trials[nct] = {
            "nct_id": nct,
            "title": ns(idm.get("briefTitle")) or None,
            "phase": ph(dm.get("phases")),
            "status": ns(sm.get("overallStatus")) or None,
            "sponsor": ns(lead.get("name")) or None,
            "lead_sponsor_class": ns(lead.get("class")) or None,
            "study_type": ns(dm.get("studyType")) or None,
            "responsible_party_type": ns(rp.get("type")) or None,
            "start_date": dt(((sm.get("startDateStruct", {}) or {}).get("date"))),
            "completion_date": dt(((sm.get("completionDateStruct", {}) or {}).get("date"))),
            "locations": trial_locations if trial_locations else [],
            "collaborators": collaborators_clean if collaborators_clean else None,
            "conditions": conditions_clean if conditions_clean else None,
            "interventions": interventions_clean if interventions_clean else None,
        }
        links.extend(captured_links)
    return list(trials.values()), links, best_conf, sample_matches


def upsert_trials(c: Client, rows: List[Dict], target_version: str = "v1") -> Dict[str, str]:
    if not rows:
        return {}
    trials_table = get_table_name("clinical_trials", target_version)
    # Omit locations from clinical_trials upsert (site data is on trial_investigators).
    upsert_rows = [{k: v for k, v in r.items() if k != "locations"} for r in rows]
    # Batch in chunks of 20 to avoid statement timeouts on heavy trial payloads
    for i in range(0, len(upsert_rows), 20):
        batch = upsert_rows[i : i + 20]
        response = c.table(trials_table).upsert(batch, on_conflict="nct_id").execute()
        if not response.data:
            raise RuntimeError(
                f"Trials upsert returned empty data ({len(batch)} rows submitted) - "
                f"writes may have been silently dropped"
            )
    ids = [r["nct_id"] for r in rows if r.get("nct_id")]
    m: Dict[str, str] = {}
    for i in range(0, len(ids), 100):
        q = c.table(trials_table).select("id,nct_id").in_("nct_id", ids[i : i + 100]).execute().data or []
        for r in q:
            m[str(r["nct_id"])] = str(r["id"])
    return m


def insert_links(c: Client, links: List[Dict], m: Dict[str, str], target_version: str = "v1") -> int:
    rows = [
        {
            "hcp_id": l["hcp_id"],
            "trial_id": m.get(str(l.get("nct_id") or "")),
            "role": l["role"],
            "investigator_name": l["investigator_name"],
            "investigator_raw_first_name": l["investigator_raw_first_name"],
            "investigator_raw_last_name": l["investigator_raw_last_name"],
            "investigator_raw_affiliation": l.get("investigator_raw_affiliation"),
            "investigator_raw_facility": l.get("investigator_raw_facility"),
            "investigator_raw_city": l.get("investigator_raw_city"),
            "investigator_raw_state": l.get("investigator_raw_state"),
            "investigator_raw_country": l.get("investigator_raw_country"),
            "match_confidence": l["match_confidence"],
            "source": l["source"],
        }
        for l in links
    ]
    rows = [r for r in rows if r["trial_id"]]
    if not rows:
        return 0

    dedup_map: Dict[Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]], Dict] = {}
    for r in rows:
        key = (
            r["trial_id"],
            r["investigator_raw_first_name"],
            r["investigator_raw_last_name"],
            r["role"],
            r["source"],
        )
        existing = dedup_map.get(key)
        if existing is None:
            dedup_map[key] = r
        elif existing.get("hcp_id") is None and r.get("hcp_id") is not None:
            dedup_map[key] = r

    rows = list(dedup_map.values())
    if not rows:
        return 0

    for i in range(0, len(rows), 500):
        batch = rows[i : i + 500]
        batch_serializable: List[Dict] = []
        for r in batch:
            serialized: Dict[str, Any] = {}
            for k, v in r.items():
                if v is None:
                    serialized[k] = None
                else:
                    serialized[k] = str(v) if not isinstance(v, (str, int, float, bool)) else v
            batch_serializable.append(serialized)
        try:
            if target_version == "v2":
                investigators_table = get_table_name("trial_investigators", target_version)
                response = c.table(investigators_table).upsert(
                    batch_serializable,
                    on_conflict="trial_id,investigator_raw_first_name,investigator_raw_last_name,role,source",
                ).execute()
                if not response.data:
                    raise RuntimeError(
                        f"Investigator upsert returned empty data ({len(batch_serializable)} rows) - "
                        f"writes may have been silently dropped"
                    )
            else:
                c.rpc("upsert_trial_investigators_preserving_match", {"rows_data": batch_serializable}).execute()
        except Exception as e:
            logger.error(f"[rpc] upsert failed for batch {i}: {e}")
            raise
    return len(rows)


def eta(done: int, total: int, start: float) -> str:
    if done <= 0:
        return "?:??"
    rem = ((time.time() - start) / done) * max(0, total - done)
    m = int(rem // 60)
    return f"{m // 60}:{m % 60:02d}"


def run(
    test: bool,
    limit: Optional[int],
    reset_checkpoint: bool = False,
    target_version: str = "v1",
) -> None:
    load_dotenv()
    c = sb()
    s = requests.Session()
    s.headers.update({"User-Agent": "FieldMark/1.0"})

    # HTTP/2 stream ID exhaustion mitigation
    # Track Supabase operations and recycle the client before hitting the ~20K limit
    op_counter = 0
    RECYCLE_THRESHOLD = 15000

    if reset_checkpoint and os.path.exists(CKPT):
        os.remove(CKPT)
        print("Checkpoint deleted; will re-process all HCPs from scratch.")
    hcps = get_hcps(c, target_version)
    seen = load_ckpt()
    todo = [h for h in hcps if str(h.get("id")) not in seen]
    if test:
        todo = stratified_test_sample(todo, limit or 50)
    elif limit:
        todo = todo[:limit]
    print(f"Loaded HCPs: {len(hcps)} | Pending after checkpoint: {len(todo)}")
    if test:
        print(f"TEST MODE: limit={limit or 50} (stratified 10 short/non-null + 10 short/null city/non-null + 30 random)")
    st = S(start=time.time())
    role = Counter()
    sponsor = Counter()
    sample_matches: List[Dict] = []
    for i, h in enumerate(todo, 1):
        # Recycle Supabase client to prevent HTTP/2 stream exhaustion
        if op_counter >= RECYCLE_THRESHOLD:
            try:
                logger.info(f"[recycle] Recycling Supabase client after {op_counter} operations")
                c = sb()
                op_counter = 0
            except Exception as exc:
                logger.warning(f"[recycle] Failed to recycle client: {exc}")

        hid = str(h.get("id") or "")
        nm = f"{ns(h.get('first_name'))} {ns(h.get('last_name'))}".strip()
        if not hid or not nm:
            st.skipped += 1
            continue
        studies = ct(s, nm, None)
        time.sleep(0.1)
        st.processed += 1
        seen.add(hid)
        if not studies:
            st.skipped += 1
            continue
        trials, links, best_conf, sample = extract(h, studies)
        for x in sample:
            if len(sample_matches) < 5:
                sample_matches.append(x)
        if best_conf >= 60:
            st.matched_high_hcps += 1
        elif best_conf >= 40:
            st.matched_medium_hcps += 1
        elif best_conf >= 0:
            st.rejected_low_hcps += 1
        if not trials or not links:
            st.skipped += 1
            continue
        m = upsert_trials(c, trials, target_version)
        op_counter += len(trials) * 2  # estimate: 1 upsert + 1 select per trial batch
        ins = insert_links(c, links, m, target_version)
        op_counter += max(len(links) // 500, 1) * 2  # estimate: 1 fetch + 1 upsert per 500-row batch
        st.linked_hcps += 1
        st.trials += len(trials)
        st.links += ins
        for l in links:
            role[str(l.get("role") or "")] += 1
        for t in trials:
            sponsor[str(t.get("lead_sponsor_class") or "(null)")] += 1
        if i % 500 == 0 or i == len(todo):
            print(
                f"[{i}/{len(todo)}] HCPs processed | Trials added: {st.trials} | "
                f"Investigators added: {st.links} | Skipped: {st.skipped} | ETA: {eta(i, len(todo), st.start)}"
            )
        if i % 500 == 0:
            save_ckpt(seen)
            print(f"Checkpoint saved at {i} HCPs.")
    save_ckpt(seen)
    print("\n=== Trials Pipeline Summary ===")
    print(f"Total HCPs processed: {st.processed}")
    print(f"Total HCPs with at least one verified trial link: {st.linked_hcps}")
    print(f"Total trials ingested: {st.trials}")
    print(f"Total trial_investigator links (excluding CONTACT): {st.links}")
    print(f"HCPs matched with high confidence (60-100): {st.matched_high_hcps}")
    print(f"HCPs matched with medium confidence (40-59): {st.matched_medium_hcps}")
    print(f"HCPs rejected for low confidence (<40): {st.rejected_low_hcps}")
    print("Distribution by role:")
    for k, v in role.most_common():
        print(f"  {k}: {v}")
    print("Distribution by lead_sponsor_class:")
    for k, v in sponsor.most_common():
        print(f"  {k}: {v}")
    print("Sample matched links (up to 5):")
    for sm in sample_matches[:5]:
        print(json.dumps(sm))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Investigator-first CTGov pipeline")
    p.add_argument("--test", action="store_true")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="Delete checkpoint file before starting (forces full re-processing of all HCPs)",
    )
    p.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version. v1=legacy tables, v2=rebuild tables.",
    )
    a = p.parse_args()
    run(a.test, a.limit, a.reset_checkpoint, a.target_version)