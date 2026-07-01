import json
import os
import random
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

import pandas as pd
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


NPPES_PATH = r"C:\Users\garre\Desktop\FieldMark\NPPES\nppes_organizations.parquet"
OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\institution_nppes_validation_log.json"
ROR_BASE_URL = "https://api.ror.org/organizations"
SAMPLE_SIZE = 50

INSTITUTION_HINTS = {
    "university",
    "college",
    "hospital",
    "institute",
    "center",
    "centre",
    "medical",
    "health",
    "clinic",
    "system",
    "school",
}

GENERIC_WORDS = {
    "university",
    "college",
    "hospital",
    "institute",
    "center",
    "centre",
    "medical",
    "health",
    "clinic",
    "system",
    "school",
    "department",
    "division",
    "electronic",
    "address",
}


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def fetch_rising_star_institutions(database_url: str) -> List[str]:
    sql = """
        SELECT DISTINCT institution
        FROM hcps h
        WHERE h.institution IS NOT NULL
          AND h.id IN (
            SELECT hcp_id FROM hcp_normalized_scores
            WHERE tier IN ('rising_star', 'dark_horse')
          )
        ORDER BY institution;
    """
    institutions: List[str] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                institution = str(row.get("institution") or "").strip()
                if institution:
                    institutions.append(institution)
    return institutions


def normalize_words(value: str) -> List[str]:
    cleaned = "".join(ch.lower() if (ch.isalnum() or ch.isspace()) else " " for ch in value)
    return [word for word in cleaned.split() if len(word) > 3]


def has_strong_name_resemblance(our_name: str, matched_name: str) -> bool:
    our_words = set(normalize_words(our_name))
    if not our_words:
        return False
    matched_words = set(normalize_words(matched_name))
    if not matched_words:
        return False
    overlap = len(our_words.intersection(matched_words))
    return (overlap / len(our_words)) >= 0.5


def call_ror_with_retries(institution: str) -> Dict[str, Any]:
    last_error: Optional[Exception] = None
    for attempt in range(3):
        time.sleep(0.2)
        try:
            url = f"{ROR_BASE_URL}?affiliation={quote_plus(institution)}"
            req = Request(url, headers={"User-Agent": "FieldMark-NPPES-Validation/1.0"})
            with urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
            return json.loads(body)
        except HTTPError as exc:
            if 500 <= exc.code < 600 or exc.code == 429:
                last_error = exc
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            time.sleep(5 * (attempt + 1))
            continue
    raise RuntimeError(f"ROR request failed after retries: {repr(last_error)}")


def parse_best_match(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = payload.get("items") or []
    if not items:
        return None
    valid = [i for i in items if isinstance(i, dict) and isinstance(i.get("organization"), dict)]
    if not valid:
        return None
    valid_sorted = sorted(valid, key=lambda x: float(x.get("score") or 0), reverse=True)
    for item in valid_sorted:
        if bool(item.get("chosen")):
            item["acceptance_reason"] = "ror_chosen"
            return item
    top = valid_sorted[0]
    top_score = float(top.get("score") or 0)
    if top_score >= 0.9:
        top["acceptance_reason"] = "high_score_no_chosen"
        return top
    top_3 = valid_sorted[:3]
    if len(top_3) >= 2:
        states: List[str] = []
        for item in top_3:
            org = item.get("organization") or {}
            locations = org.get("locations") or []
            if locations and isinstance(locations[0], dict):
                geo = locations[0].get("geonames_details") or {}
                if isinstance(geo, dict):
                    state_code = geo.get("country_subdivision_code")
                    if state_code:
                        states.append(str(state_code))
        if len(states) >= 2 and len(set(states)) == 1:
            top["acceptance_reason"] = "consensus_state"
            return top
    return None


def extract_ror_name_and_geo(chosen: Dict[str, Any]) -> Dict[str, Any]:
    org = chosen.get("organization") or {}
    matched_name = ""
    names_list = org.get("names") or []
    if isinstance(names_list, list):
        for name_entry in names_list:
            if not isinstance(name_entry, dict):
                continue
            types = name_entry.get("types") or []
            if isinstance(types, list) and "ror_display" in types:
                matched_name = str(name_entry.get("value") or "")
                break
        if not matched_name:
            for name_entry in names_list:
                if not isinstance(name_entry, dict):
                    continue
                types = name_entry.get("types") or []
                if isinstance(types, list) and "label" in types:
                    matched_name = str(name_entry.get("value") or "")
                    break
    country_name = None
    country_code = None
    state_name = None
    state_code = None
    city_name = None
    locations = org.get("locations") or []
    if isinstance(locations, list) and locations:
        first_loc = locations[0]
        if isinstance(first_loc, dict):
            geo = first_loc.get("geonames_details") or {}
            if isinstance(geo, dict):
                country_name = geo.get("country_name")
                country_code = geo.get("country_code")
                state_name = geo.get("country_subdivision_name")
                state_code = geo.get("country_subdivision_code")
                city_name = geo.get("name")
    return {
        "ror_id": org.get("id"),
        "ror_name": matched_name or None,
        "ror_country": country_name,
        "ror_country_code": country_code,
        "ror_state": state_name,
        "ror_state_code": state_code,
        "ror_city": city_name,
        "ror_match_score": float(chosen.get("score") or 0),
        "acceptance_reason": chosen.get("acceptance_reason"),
    }


def clean_institution_name(value: str) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\bElectronic address:.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\S+@\S+", " ", text)
    text = re.sub(r"\b\d{5}(?:-\d{4})?\b", " ", text)
    text = re.sub(r"^\s*(Department|Division)\s+of\s+[^,]+,\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" ,;")
    return text


def extract_candidate_chunk(cleaned: str) -> str:
    if not cleaned:
        return cleaned
    chunks = [c.strip() for c in cleaned.split(",") if c.strip()]
    for chunk in chunks:
        words = set(normalize_words(chunk))
        if words.intersection(INSTITUTION_HINTS):
            return chunk
    return cleaned


def jaccard_similarity(words_a: Set[str], words_b: Set[str]) -> float:
    if not words_a or not words_b:
        return 0.0
    inter = len(words_a.intersection(words_b))
    union = len(words_a.union(words_b))
    return (inter / union) if union > 0 else 0.0


def tokenize_distinctive(value: str) -> Set[str]:
    return {w for w in normalize_words(value) if w not in GENERIC_WORDS}


def prepare_nppes_index(df: pd.DataFrame) -> Dict[str, Any]:
    records: List[Dict[str, Any]] = []
    inverted: Dict[str, Set[int]] = {}
    for idx, row in df.iterrows():
        legal_name = str(row.get("organization_name_legal") or "").strip()
        if not legal_name:
            continue
        tokens = tokenize_distinctive(legal_name)
        record = {
            "npi": row.get("npi"),
            "organization_name_legal": legal_name,
            "organization_name_other": row.get("organization_name_other"),
            "practice_state": row.get("practice_state"),
            "practice_city": row.get("practice_city"),
            "practice_zip": row.get("practice_zip"),
            "token_set": tokens,
        }
        rec_idx = len(records)
        records.append(record)
        for tok in tokens:
            inverted.setdefault(tok, set()).add(rec_idx)
    return {"records": records, "inverted": inverted}


def match_nppes(cleaned_candidate: str, index: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    query_tokens = tokenize_distinctive(cleaned_candidate)
    if not query_tokens:
        return None
    candidate_indices: Set[int] = set()
    for tok in query_tokens:
        candidate_indices.update(index["inverted"].get(tok, set()))
    if not candidate_indices:
        return None

    best_match: Optional[Dict[str, Any]] = None
    best_score = 0.0
    for rec_idx in candidate_indices:
        rec = index["records"][rec_idx]
        score = jaccard_similarity(query_tokens, rec["token_set"])
        if score >= 0.5 and score > best_score:
            best_score = score
            best_match = rec
    if not best_match:
        return None
    return {
        "npi": best_match.get("npi"),
        "name": best_match.get("organization_name_legal"),
        "other_name": best_match.get("organization_name_other"),
        "state": best_match.get("practice_state"),
        "city": best_match.get("practice_city"),
        "zip": best_match.get("practice_zip"),
        "score": best_score,
    }


def main() -> None:
    started = time.time()
    random.seed(42)
    load_dotenv()
    database_url = get_required_env("DATABASE_URL")

    institutions = fetch_rising_star_institutions(database_url)
    if len(institutions) > SAMPLE_SIZE:
        institutions = random.sample(institutions, SAMPLE_SIZE)
    else:
        institutions = institutions[:SAMPLE_SIZE]
    total_tested = len(institutions)

    nppes_df = pd.read_parquet(
        NPPES_PATH,
        columns=[
            "npi",
            "organization_name_legal",
            "organization_name_other",
            "practice_state",
            "practice_city",
            "practice_zip",
        ],
    )
    nppes_index = prepare_nppes_index(nppes_df)

    results: List[Dict[str, Any]] = []
    errors: List[str] = []

    ror_matched = 0
    nppes_matched = 0
    both_matched = 0
    only_ror_matched = 0
    only_nppes_matched = 0
    neither_matched = 0

    nppes_has_state = 0
    nppes_has_city = 0
    nppes_high_conf = 0
    nppes_medium_conf = 0

    only_nppes_rows: List[Dict[str, Any]] = []
    neither_rows: List[Dict[str, Any]] = []

    for institution in institutions:
        row: Dict[str, Any] = {
            "our_institution": institution,
            "cleaned_candidate": None,
            "ror_matched": False,
            "ror_name": None,
            "ror_id": None,
            "ror_score": None,
            "ror_acceptance_reason": None,
            "nppes_matched": False,
            "nppes_npi": None,
            "nppes_name": None,
            "nppes_score": None,
            "nppes_state": None,
            "nppes_city": None,
            "error": None,
        }
        try:
            payload = call_ror_with_retries(institution)
            chosen = parse_best_match(payload)
            if chosen:
                ror_meta = extract_ror_name_and_geo(chosen)
                row["ror_matched"] = True
                row["ror_name"] = ror_meta.get("ror_name")
                row["ror_id"] = ror_meta.get("ror_id")
                row["ror_score"] = ror_meta.get("ror_match_score")
                row["ror_acceptance_reason"] = ror_meta.get("acceptance_reason")
                ror_matched += 1
        except Exception as exc:
            errors.append(f"ror::{institution}: {repr(exc)}")

        try:
            cleaned = clean_institution_name(institution)
            candidate = extract_candidate_chunk(cleaned)
            row["cleaned_candidate"] = candidate
            nppes_match = match_nppes(candidate, nppes_index)
            if nppes_match:
                row["nppes_matched"] = True
                row["nppes_npi"] = nppes_match.get("npi")
                row["nppes_name"] = nppes_match.get("name")
                row["nppes_score"] = nppes_match.get("score")
                row["nppes_state"] = nppes_match.get("state")
                row["nppes_city"] = nppes_match.get("city")
                nppes_matched += 1
                if row["nppes_state"]:
                    nppes_has_state += 1
                if row["nppes_city"]:
                    nppes_has_city += 1
                if float(row["nppes_score"] or 0.0) >= 0.7:
                    nppes_high_conf += 1
                else:
                    nppes_medium_conf += 1
        except Exception as exc:
            row["error"] = repr(exc)
            errors.append(f"nppes::{institution}: {repr(exc)}")

        if row["ror_matched"] and row["nppes_matched"]:
            both_matched += 1
        elif row["ror_matched"] and not row["nppes_matched"]:
            only_ror_matched += 1
        elif (not row["ror_matched"]) and row["nppes_matched"]:
            only_nppes_matched += 1
            only_nppes_rows.append(row)
        else:
            neither_matched += 1
            neither_rows.append(row)

        results.append(row)

    def pct(n: int, d: int) -> float:
        return (n / d * 100.0) if d > 0 else 0.0

    print("ROR vs NPPES coverage:")
    print(f"  ROR matched: {ror_matched}/{total_tested} ({pct(ror_matched, total_tested):.1f}%)")
    print(f"  NPPES matched: {nppes_matched}/{total_tested} ({pct(nppes_matched, total_tested):.1f}%)")
    print(f"  Both matched: {both_matched}/{total_tested} ({pct(both_matched, total_tested):.1f}%)")
    print(f"  Only ROR matched: {only_ror_matched}/{total_tested} ({pct(only_ror_matched, total_tested):.1f}%)")
    print(f"  Only NPPES matched: {only_nppes_matched}/{total_tested} ({pct(only_nppes_matched, total_tested):.1f}%)")
    print(f"  Neither matched: {neither_matched}/{total_tested} ({pct(neither_matched, total_tested):.1f}%)")
    print("")

    print("NPPES match quality (for NPPES matches):")
    print(f"  has_state: {nppes_has_state}/{nppes_matched} ({pct(nppes_has_state, nppes_matched):.1f}%)")
    print(f"  has_city: {nppes_has_city}/{nppes_matched} ({pct(nppes_has_city, nppes_matched):.1f}%)")
    print(f"  high_confidence (Jaccard >= 0.7): {nppes_high_conf}/{nppes_matched}")
    print(f"  medium_confidence (Jaccard 0.5-0.7): {nppes_medium_conf}/{nppes_matched}")
    print("")

    print('Sample of "only NPPES matched" institutions (up to 10):')
    for row in only_nppes_rows[:10]:
        print(f'  Our: "{row["our_institution"]}"')
        print(f'  Cleaned: "{row.get("cleaned_candidate") or ""}"')
        print(f'  NPPES: "{row.get("nppes_name") or ""}"')
        print(f'  Score: {float(row.get("nppes_score") or 0.0):.3f}')
        print(f'  State: {row.get("nppes_state") or ""}')
        print("")

    print('Sample of "neither matched" institutions (up to 10):')
    for row in neither_rows[:10]:
        print(f'  Our: "{row["our_institution"]}"')
        print(f'  Cleaned: "{row.get("cleaned_candidate") or ""}"')
        print("")

    elapsed_seconds = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": elapsed_seconds,
        "total_institutions_tested": total_tested,
        "summary": {
            "ror_matched": ror_matched,
            "nppes_matched": nppes_matched,
            "both_matched": both_matched,
            "only_ror_matched": only_ror_matched,
            "only_nppes_matched": only_nppes_matched,
            "neither_matched": neither_matched,
        },
        "results": results,
        "errors": errors,
    }
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")


if __name__ == "__main__":
    main()
