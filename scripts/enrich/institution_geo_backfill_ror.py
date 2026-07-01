import argparse
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from supabase import Client, create_client


OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\institution_geo_backfill_ror_log.json"
ROR_BASE_URL = "https://api.ror.org/organizations"
PROGRESS_EVERY = 100


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--execute", action="store_true", default=False)
    parser.add_argument("--phase", choices=["a", "b", "both"], default="both")
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def normalize_words(value: str) -> List[str]:
    cleaned = "".join(ch.lower() if (ch.isalnum() or ch.isspace()) else " " for ch in str(value or ""))
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
            req = Request(url, headers={"User-Agent": "FieldMark-ROR-GeoBackfill/1.0"})
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


def parse_ror_v2_fields(chosen: Dict[str, Any]) -> Dict[str, Any]:
    org = chosen.get("organization") or {}
    score_raw = chosen.get("score")
    try:
        score = float(score_raw) if score_raw is not None else None
    except (TypeError, ValueError):
        score = None

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
        "score": score,
        "matched_name": matched_name,
        "ror_id": org.get("id"),
        "ror_country": country_name,
        "ror_country_code": country_code,
        "ror_state": state_name,
        "ror_state_code": state_code,
        "ror_city": city_name,
    }


def ensure_schema_or_exit(database_url: str) -> None:
    required_hcps_columns = {
        "institution_state",
        "institution_country",
        "institution_state_code",
        "institution_geo_method",
        "institution_geo_confidence",
        "institution_geo_resolved_at",
    }
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'institution_geo_lookup'
                ) AS exists_flag
                """
            )
            table_exists = bool((cur.fetchone() or {}).get("exists_flag"))

            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'hcps'
                """
            )
            existing_columns = {str(row.get("column_name")) for row in cur.fetchall()}

    if (not table_exists) or (not required_hcps_columns.issubset(existing_columns)):
        print(
            "SCHEMA MISSING: Run migration first. Required:\n"
            "- table institution_geo_lookup\n"
            "- columns on hcps: institution_state, institution_country, etc."
        )
        raise SystemExit(1)


def fetch_all_institutions(database_url: str) -> List[str]:
    sql = """
        SELECT DISTINCT institution
        FROM hcps
        WHERE institution IS NOT NULL
        ORDER BY institution;
    """
    items: List[str] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                institution = str(row.get("institution") or "").strip()
                if institution:
                    items.append(institution)
    return items


def fetch_already_resolved_institutions(database_url: str) -> Set[str]:
    sql = """
        SELECT institution_string
        FROM institution_geo_lookup
        WHERE institution_string IS NOT NULL;
    """
    items: Set[str] = set()
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                s = str(row.get("institution_string") or "").strip()
                if s:
                    items.add(s)
    return items


def insert_lookup_row(client: Client, payload: Dict[str, Any]) -> None:
    client.table("institution_geo_lookup").insert(payload).execute()


def run_phase_a(
    database_url: str,
    client: Client,
    execute: bool,
    limit: Optional[int],
) -> Dict[str, Any]:
    all_institutions = fetch_all_institutions(database_url)
    already_done = fetch_already_resolved_institutions(database_url)
    pending = [x for x in all_institutions if x not in already_done]
    if limit is not None:
        pending = pending[:limit]

    total_institutions = len(pending)
    resolved_high = 0
    resolved_medium = 0
    resolved_low = 0
    no_match = 0
    errors: List[str] = []
    processed = 0
    phase_started = time.time()

    for institution in pending:
        row_payload: Dict[str, Any] = {
            "institution_string": institution,
            "ror_id": None,
            "ror_name": None,
            "ror_country": None,
            "ror_country_code": None,
            "ror_state": None,
            "ror_state_code": None,
            "ror_city": None,
            "confidence": "no_match",
            "acceptance_reason": None,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            payload = call_ror_with_retries(institution)
            chosen = parse_best_match(payload)
            if chosen:
                parsed = parse_ror_v2_fields(chosen)
                score = parsed["score"]
                matched_name = str(parsed["matched_name"] or "")
                acceptance_reason = str(chosen.get("acceptance_reason") or "")
                strong_name = has_strong_name_resemblance(institution, matched_name)

                if acceptance_reason == "ror_chosen" and score is not None and score >= 0.9 and strong_name:
                    confidence = "high"
                    resolved_high += 1
                elif acceptance_reason == "ror_chosen" and score is not None and score >= 0.7:
                    confidence = "medium"
                    resolved_medium += 1
                elif acceptance_reason == "high_score_no_chosen":
                    confidence = "medium"
                    resolved_medium += 1
                elif acceptance_reason == "consensus_state":
                    confidence = "medium"
                    resolved_medium += 1
                else:
                    confidence = "low"
                    resolved_low += 1

                row_payload.update(
                    {
                        "ror_id": parsed["ror_id"],
                        "ror_name": matched_name or None,
                        "ror_country": parsed["ror_country"],
                        "ror_country_code": parsed["ror_country_code"],
                        "ror_state": parsed["ror_state"],
                        "ror_state_code": parsed["ror_state_code"],
                        "ror_city": parsed["ror_city"],
                        "confidence": confidence,
                        "acceptance_reason": acceptance_reason,
                    }
                )
            else:
                no_match += 1
        except Exception as exc:
            errors.append(f'{institution}: {repr(exc)}')
            no_match += 1

        if execute:
            try:
                insert_lookup_row(client, row_payload)
            except Exception as exc:
                errors.append(f'insert::{institution}: {repr(exc)}')

        processed += 1
        if processed % PROGRESS_EVERY == 0:
            elapsed = time.time() - phase_started
            rate = processed / elapsed if elapsed > 0 else 0.0
            remaining = max(total_institutions - processed, 0)
            eta = (remaining / rate) if rate > 0 else None
            eta_text = f"{eta:.1f}s" if eta is not None else "unknown"
            print(
                f"Phase A {processed}/{total_institutions} | elapsed={elapsed:.1f}s "
                f"rate={rate:.2f} inst/s eta={eta_text} | "
                f"high={resolved_high} medium={resolved_medium} low={resolved_low} no_match={no_match}"
            )

    return {
        "total_institutions": total_institutions,
        "resolved_high": resolved_high,
        "resolved_medium": resolved_medium,
        "resolved_low": resolved_low,
        "no_match": no_match,
        "errors": errors,
        "executed_writes": bool(execute),
    }


def compute_phase_b_counts(database_url: str) -> Dict[str, int]:
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(
                """
                SELECT COUNT(*)::bigint AS c
                FROM hcps
                WHERE institution IS NOT NULL
                """
            )
            total_hcps = int((cur.fetchone() or {}).get("c") or 0)

            cur.execute(
                """
                SELECT COUNT(*)::bigint AS c
                FROM hcps h
                JOIN institution_geo_lookup i ON h.institution = i.institution_string
                WHERE i.confidence IN ('high', 'medium')
                  AND i.ror_state IS NOT NULL
                """
            )
            updatable = int((cur.fetchone() or {}).get("c") or 0)

    return {
        "hcps_updated": updatable,
        "hcps_skipped": max(total_hcps - updatable, 0),
    }


def run_phase_b(database_url: str, execute: bool) -> Dict[str, Any]:
    counts = compute_phase_b_counts(database_url)
    if not execute:
        return {"hcps_updated": counts["hcps_updated"], "hcps_skipped": counts["hcps_skipped"], "executed_writes": False}

    update_sql = """
        UPDATE hcps h
        SET
          institution_state = i.ror_state,
          institution_state_code = i.ror_state_code,
          institution_country = i.ror_country,
          institution_geo_method =
            CASE
              WHEN i.acceptance_reason = 'ror_chosen' THEN 'ror_chosen'
              WHEN i.acceptance_reason = 'high_score_no_chosen' THEN 'ror_high_score'
              WHEN i.acceptance_reason = 'consensus_state' THEN 'ror_consensus_state'
              ELSE 'ror_unknown'
            END,
          institution_geo_confidence = i.confidence,
          institution_geo_resolved_at = NOW()
        FROM institution_geo_lookup i
        WHERE h.institution = i.institution_string
          AND i.confidence IN ('high', 'medium')
          AND i.ror_state IS NOT NULL;
    """
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(update_sql)
            updated = int(cur.rowcount or 0)
        conn.commit()

    return {"hcps_updated": updated, "hcps_skipped": counts["hcps_skipped"], "executed_writes": True}


def fetch_canonical_check(database_url: str) -> List[Dict[str, Any]]:
    sql = """
        SELECT
          id,
          first_name,
          last_name,
          institution,
          institution_state,
          institution_country,
          institution_geo_confidence
        FROM hcps
        WHERE institution IS NOT NULL
        ORDER BY id
        LIMIT 5;
    """
    rows: List[Dict[str, Any]] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                rows.append(
                    {
                        "hcp_id": str(row.get("id")),
                        "name": f'{row.get("first_name") or ""} {row.get("last_name") or ""}'.strip(),
                        "institution": row.get("institution"),
                        "institution_state": row.get("institution_state"),
                        "institution_country": row.get("institution_country"),
                        "institution_geo_confidence": row.get("institution_geo_confidence"),
                    }
                )
    return rows


def main() -> None:
    started = time.time()
    args = parse_args()
    execute = bool(args.execute and not args.dry_run)
    mode = "execute" if execute else "dry_run"

    load_dotenv()
    database_url = get_required_env("DATABASE_URL")
    client = init_supabase()

    ensure_schema_or_exit(database_url)

    phase_a_results: Optional[Dict[str, Any]] = None
    phase_b_results: Optional[Dict[str, Any]] = None

    if args.phase in ("a", "both"):
        print(f"Running Phase A ({mode})...")
        phase_a_results = run_phase_a(database_url, client, execute=execute, limit=args.limit)

    if args.phase in ("b", "both"):
        print(f"Running Phase B ({mode})...")
        phase_b_results = run_phase_b(database_url, execute=execute)

    canonical_check = fetch_canonical_check(database_url)
    elapsed_seconds = time.time() - started

    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": elapsed_seconds,
        "phase": args.phase,
        "phase_a_results": phase_a_results,
        "phase_b_results": phase_b_results,
        "canonical_check": canonical_check,
    }
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_payload, f, indent=2)
    print(f"Saved log: {OUTPUT_LOG_PATH}")


if __name__ == "__main__":
    main()
