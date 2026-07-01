import json
import os
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\institution_ror_validation_log.json"
ROR_BASE_URL = "https://api.ror.org/organizations"
SAMPLE_SIZE = 50


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
            req = Request(url, headers={"User-Agent": "FieldMark-ROR-Validation/1.0"})
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
    """
    Returns the best ROR match using a smart acceptance algorithm:
    1. If chosen=true exists, use it
    2. Otherwise, if top candidate score >= 0.9, accept it (still trusted)
    3. Otherwise, if top 3 candidates agree on state, accept top one
    4. Otherwise, no match

    Returns the item dict (containing chosen, score, organization).
    Adds an "acceptance_reason" key for downstream confidence labeling.
    """
    items = payload.get("items") or []
    if not items:
        return None

    # Filter to valid dict items with organization data
    valid = [
        i for i in items
        if isinstance(i, dict) and isinstance(i.get("organization"), dict)
    ]
    if not valid:
        return None

    # Sort by score descending
    valid_sorted = sorted(valid, key=lambda x: float(x.get("score") or 0), reverse=True)

    # Rule 1: chosen=true wins
    for item in valid_sorted:
        if bool(item.get("chosen")):
            item["acceptance_reason"] = "ror_chosen"
            return item

    # Rule 2: top candidate with score >= 0.9 (high confidence on its own)
    top = valid_sorted[0]
    top_score = float(top.get("score") or 0)
    if top_score >= 0.9:
        top["acceptance_reason"] = "high_score_no_chosen"
        return top

    # Rule 3: top 3 candidates agree on state
    top_3 = valid_sorted[:3]
    if len(top_3) >= 2:
        states = []
        for item in top_3:
            org = item.get("organization") or {}
            locations = org.get("locations") or []
            if locations and isinstance(locations[0], dict):
                geo = locations[0].get("geonames_details") or {}
                if isinstance(geo, dict):
                    s = geo.get("country_subdivision_code")
                    if s:
                        states.append(s)

        # If all the states we found agree (and we found at least 2), accept
        if len(states) >= 2 and len(set(states)) == 1:
            top["acceptance_reason"] = "consensus_state"
            return top

    return None


def main() -> None:
    started = time.time()
    random.seed(42)
    load_dotenv()
    database_url = get_required_env("DATABASE_URL")

    institutions = fetch_rising_star_institutions(database_url)
    if len(institutions) > SAMPLE_SIZE:
        institutions = random.sample(institutions, SAMPLE_SIZE)

    total_tested = len(institutions)
    results: List[Dict[str, Any]] = []
    errors: List[str] = []

    high_confidence = 0
    medium_confidence = 0
    low_confidence = 0
    no_match = 0
    has_state = 0
    has_state_code = 0
    country_breakdown: Dict[str, int] = {}

    for institution in institutions:
        row: Dict[str, Any] = {
            "our_name": institution,
            "ror_match_found": False,
            "ror_match_score": None,
            "ror_id": None,
            "ror_name": None,
            "ror_country": None,
            "ror_country_code": None,
            "ror_state": None,
            "ror_state_code": None,
            "ror_city": None,
            "confidence": "no_match",
            "error": None,
        }
        try:
            payload = call_ror_with_retries(institution)
            chosen = parse_best_match(payload)
            if chosen:
                org = chosen.get("organization") or {}
                score_raw = chosen.get("score")
                try:
                    score = float(score_raw) if score_raw is not None else None
                except (TypeError, ValueError):
                    score = None

                # ROR v2: name lives in names[] array; pick the ror_display entry
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
                    # Fallback: first label entry if no ror_display
                    if not matched_name:
                        for name_entry in names_list:
                            if not isinstance(name_entry, dict):
                                continue
                            types = name_entry.get("types") or []
                            if isinstance(types, list) and "label" in types:
                                matched_name = str(name_entry.get("value") or "")
                                break

                # ROR v2: country and state nested in locations[].geonames_details
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

                row["ror_match_found"] = True
                row["ror_match_score"] = score
                row["ror_id"] = org.get("id")
                row["ror_name"] = matched_name or None
                row["ror_country"] = country_name
                row["ror_country_code"] = country_code
                row["ror_state"] = state_name
                row["ror_state_code"] = state_code
                row["ror_city"] = city_name

                strong_name = has_strong_name_resemblance(institution, matched_name)
                acceptance_reason = chosen.get("acceptance_reason", "")
                row["acceptance_reason"] = acceptance_reason

                if acceptance_reason == "ror_chosen" and score is not None and score >= 0.9 and strong_name:
                    row["confidence"] = "high"
                    high_confidence += 1
                elif acceptance_reason == "ror_chosen" and score is not None and score >= 0.7:
                    row["confidence"] = "medium"
                    medium_confidence += 1
                elif acceptance_reason == "high_score_no_chosen":
                    row["confidence"] = "medium"
                    medium_confidence += 1
                elif acceptance_reason == "consensus_state":
                    row["confidence"] = "medium"
                    medium_confidence += 1
                else:
                    row["confidence"] = "low"
                    low_confidence += 1

                if row["ror_state"]:
                    has_state += 1
                if row["ror_state_code"]:
                    has_state_code += 1

                country_key = str(row["ror_country_code"] or row["ror_country"] or "UNKNOWN")
                country_breakdown[country_key] = country_breakdown.get(country_key, 0) + 1
            else:
                no_match += 1
        except Exception as exc:
            row["error"] = repr(exc)
            errors.append(f"{institution}: {repr(exc)}")
            no_match += 1

        results.append(row)

    def pct(n: int) -> float:
        return (n / total_tested * 100.0) if total_tested > 0 else 0.0

    print("Coverage breakdown:")
    print(f"  high_confidence: {high_confidence}/{total_tested} ({pct(high_confidence):.1f}%)")
    print(f"  medium_confidence: {medium_confidence}/{total_tested} ({pct(medium_confidence):.1f}%)")
    print(f"  low_confidence: {low_confidence}/{total_tested} ({pct(low_confidence):.1f}%)")
    print(f"  no_match: {no_match}/{total_tested} ({pct(no_match):.1f}%)")
    print("")

    print("State data quality:")
    print(f"  has_state: {has_state}/{total_tested} ({pct(has_state):.1f}%)")
    print(f"  has_state_code: {has_state_code}/{total_tested} ({pct(has_state_code):.1f}%)")
    print("")

    print("Country breakdown of matches:")
    for key in sorted(country_breakdown.keys()):
        print(f"  {key}: {country_breakdown[key]}")
    print("")

    sample_size = min(10, len(results))
    sample_rows = random.sample(results, sample_size) if sample_size > 0 else []
    print("Sample output (10 random):")
    for row in sample_rows:
        print(f'  Our: "{row["our_name"]}"')
        print(f'  ROR: "{row.get("ror_name") or ""}"')
        print(f'  Confidence: {row["confidence"]}')
        print(f'  Country: {row.get("ror_country_code") or row.get("ror_country") or ""}')
        print(f'  State: {row.get("ror_state") or row.get("ror_state_code") or ""}')
        print("")

    elapsed_seconds = time.time() - started
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": elapsed_seconds,
        "total_institutions_tested": total_tested,
        "results": [
            {
                "our_name": row["our_name"],
                "matched_name": row.get("ror_name"),
                "confidence": row["confidence"],
                "country": row.get("ror_country_code") or row.get("ror_country"),
                "state": row.get("ror_state") or row.get("ror_state_code"),
                "ror_id": row.get("ror_id"),
            }
            for row in results
        ],
        "errors": errors,
    }
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")


if __name__ == "__main__":
    main()
