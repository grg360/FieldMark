import argparse
import json
import os
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from supabase import Client, create_client


OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\institution_geo_backfill_openalex_log.json"
ROR_LOOKUP_BASE = "https://api.ror.org/organizations"
PROGRESS_EVERY = 100
CIRCUIT_BREAKER_THRESHOLD = 20
CANONICAL_HCP_IDS = [
    "9339ead6-2023-4e69-9eda-2914553a2e20",  # Loomba
    "dc645bf0-b7e0-4c3c-9aaf-9e7bc35d6331",  # Garassino
    "6f9dd309-bd67-4260-a9c2-8a22129f988c",  # Chalasani
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--execute", action="store_true", default=False)
    parser.add_argument("--phase", choices=["a", "b", "c", "abc"], default="abc")
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ensure_schema_or_exit(database_url: str) -> None:
    required_lookup_columns = {
        "ror_id",
        "openalex_institution_id",
        "institution_display_name",
        "country",
        "country_code",
        "state_name",
        "state_code",
        "city",
        "latitude",
        "longitude",
        "source",
        "resolved_at",
    }
    required_hcps_columns = {
        "openalex_institution_ror_id",
        "institution_state",
        "institution_state_code",
        "institution_country",
        "institution_geo_method",
        "institution_geo_confidence",
        "institution_geo_resolved_at",
    }

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'institution_geo_lookup'
                """
            )
            lookup_cols = {str(r.get("column_name")) for r in cur.fetchall()}

            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'hcps'
                """
            )
            hcps_cols = {str(r.get("column_name")) for r in cur.fetchall()}

    if not required_lookup_columns.issubset(lookup_cols) or not required_hcps_columns.issubset(hcps_cols):
        print(
            "SCHEMA MISSING: Run migration first. Required additions:\n"
            "- table institution_geo_lookup with columns ror_id, openalex_institution_id, "
            "institution_display_name, country, country_code, state_name, state_code, city, "
            "latitude, longitude, source, resolved_at\n"
            "- columns on hcps: openalex_institution_ror_id, institution_state, institution_state_code, "
            "institution_country, institution_geo_method, institution_geo_confidence, institution_geo_resolved_at"
        )
        raise SystemExit(1)


def fetch_phase_a_rows(database_url: str) -> List[Dict[str, Any]]:
    sql = """
        WITH most_recent_pubs AS (
          SELECT DISTINCT ON (pa.hcp_id)
            pa.hcp_id,
            pa.publication_id,
            pa.openalex_author_id,
            p.pub_year,
            p.authorships
          FROM publication_authors pa
          JOIN publications p ON p.id = pa.publication_id
          WHERE p.authorships IS NOT NULL
          ORDER BY pa.hcp_id, p.pub_year DESC NULLS LAST, p.id DESC
        ),
        hcp_authorships AS (
          SELECT
            mrp.hcp_id,
            mrp.publication_id,
            mrp.openalex_author_id,
            mrp.pub_year,
            authorship_record
          FROM most_recent_pubs mrp,
            LATERAL jsonb_array_elements(mrp.authorships) AS authorship_record
          WHERE authorship_record->'author'->>'id' = mrp.openalex_author_id
        ),
        hcp_institutions AS (
          SELECT
            ha.hcp_id,
            ha.publication_id,
            ha.openalex_author_id,
            ha.pub_year,
            institution_record,
            ordinality
          FROM hcp_authorships ha,
            LATERAL jsonb_array_elements(ha.authorship_record->'institutions') WITH ORDINALITY AS inst(institution_record, ordinality)
          WHERE jsonb_array_length(COALESCE(ha.authorship_record->'institutions', '[]'::jsonb)) > 0
        )
        SELECT DISTINCT ON (hcp_id)
          hcp_id,
          publication_id,
          pub_year,
          institution_record->>'id' AS openalex_institution_id,
          institution_record->>'display_name' AS institution_display_name,
          institution_record->>'country_code' AS country_code,
          institution_record->>'ror' AS ror_id
        FROM hcp_institutions
        WHERE institution_record->>'ror' IS NOT NULL
          AND institution_record->>'ror' != ''
        ORDER BY hcp_id, ordinality ASC;
    """
    rows: List[Dict[str, Any]] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                d = dict(row)
                d["hcp_id"] = str(d.get("hcp_id"))
                d["publication_id"] = str(d.get("publication_id"))
                rows.append(d)
    return rows


def count_hcps_with_publications(database_url: str) -> int:
    sql = """
        SELECT COUNT(DISTINCT pa.hcp_id)::bigint AS c
        FROM publication_authors pa
        JOIN publications p ON p.id = pa.publication_id
        WHERE p.authorships IS NOT NULL;
    """
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            return int((cur.fetchone() or {}).get("c") or 0)


def update_hcp_ror_id(client: Client, hcp_id: str, ror_id: str) -> None:
    client.table("hcps").update({"openalex_institution_ror_id": ror_id}).eq("id", hcp_id).execute()


def fetch_pending_ror_ids(database_url: str, limit: Optional[int]) -> List[str]:
    sql = """
        SELECT DISTINCT openalex_institution_ror_id
        FROM hcps
        WHERE openalex_institution_ror_id IS NOT NULL
          AND openalex_institution_ror_id NOT IN (
            SELECT ror_id FROM institution_geo_lookup WHERE ror_id IS NOT NULL
          )
        ORDER BY openalex_institution_ror_id;
    """
    ids: List[str] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            for row in cur:
                rid = str(row.get("openalex_institution_ror_id") or "").strip()
                if rid:
                    ids.append(rid)
    if limit is not None:
        ids = ids[:limit]
    return ids


def ror_short_id(ror_id: str) -> str:
    s = str(ror_id or "").strip().rstrip("/")
    if s.startswith("https://ror.org/"):
        return s.split("/")[-1]
    return s.split("/")[-1]


def call_ror_lookup_with_retries(ror_id: str) -> Dict[str, Any]:
    last_error: Optional[Exception] = None
    for attempt in range(3):
        time.sleep(0.2)
        short = ror_short_id(ror_id)
        url = f"{ROR_LOOKUP_BASE}/{short}"
        try:
            req = Request(url, headers={"User-Agent": "FieldMark-OpenAlex-ROR-Backfill/1.0"})
            with urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
            return json.loads(body)
        except HTTPError as exc:
            if exc.code == 429:
                retry_after_header = None
                try:
                    retry_after_header = exc.headers.get("Retry-After") if exc.headers else None
                except Exception:
                    retry_after_header = None
                if retry_after_header:
                    try:
                        backoff = int(retry_after_header)
                    except (TypeError, ValueError):
                        backoff = 60
                else:
                    backoff = 30 * (attempt + 1)
                last_error = exc
                time.sleep(backoff)
                continue
            if 500 <= exc.code < 600:
                last_error = exc
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            time.sleep(5 * (attempt + 1))
            continue
    raise RuntimeError(f"ROR lookup failed after retries: {repr(last_error)}")


def parse_ror_lookup_payload(payload: Dict[str, Any], ror_id: str) -> Dict[str, Any]:
    names = payload.get("names") or []
    display_name = ""
    if isinstance(names, list):
        for name_entry in names:
            if not isinstance(name_entry, dict):
                continue
            types = name_entry.get("types") or []
            if isinstance(types, list) and "ror_display" in types:
                display_name = str(name_entry.get("value") or "")
                break
        if not display_name:
            for name_entry in names:
                if not isinstance(name_entry, dict):
                    continue
                types = name_entry.get("types") or []
                if isinstance(types, list) and "label" in types:
                    display_name = str(name_entry.get("value") or "")
                    break

    country_name = None
    country_code = None
    state_name = None
    state_code = None
    city = None
    lat = None
    lng = None
    locations = payload.get("locations") or []
    if isinstance(locations, list) and locations:
        first_loc = locations[0]
        if isinstance(first_loc, dict):
            geo = first_loc.get("geonames_details") or {}
            if isinstance(geo, dict):
                country_name = geo.get("country_name")
                country_code = geo.get("country_code")
                state_name = geo.get("country_subdivision_name")
                state_code = geo.get("country_subdivision_code")
                city = geo.get("name")
                lat = geo.get("lat")
                lng = geo.get("lng")

    return {
        "ror_id": ror_id,
        "institution_display_name": display_name or None,
        "country": country_name,
        "country_code": country_code,
        "state_name": state_name,
        "state_code": state_code,
        "city": city,
        "latitude": lat,
        "longitude": lng,
        "source": "openalex_authorship_ror_lookup",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }


def insert_lookup_row(client: Client, payload: Dict[str, Any]) -> None:
    client.table("institution_geo_lookup").insert(payload).execute()


def run_phase_a(database_url: str, client: Client, execute: bool) -> Dict[str, Any]:
    rows = fetch_phase_a_rows(database_url)
    hcps_with_publications = count_hcps_with_publications(database_url)
    hcps_with_ror_id = len(rows)
    hcps_without = max(hcps_with_publications - hcps_with_ror_id, 0)
    errors: List[str] = []

    if execute:
        for row in rows:
            try:
                update_hcp_ror_id(client, str(row["hcp_id"]), str(row["ror_id"]))
            except Exception as exc:
                errors.append(f'hcp_{row["hcp_id"]}: {repr(exc)}')

    return {
        "hcps_processed": hcps_with_publications,
        "hcps_with_ror_id": hcps_with_ror_id,
        "hcps_without": hcps_without,
        "errors": errors,
        "executed_writes": bool(execute),
    }


def write_log(payload: Dict[str, Any]) -> None:
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def run_phase_b(
    database_url: str,
    client: Client,
    execute: bool,
    limit: Optional[int],
    mode: str,
    phase_a_results: Optional[Dict[str, Any]],
    started: float,
) -> Dict[str, Any]:
    pending_ror_ids = fetch_pending_ror_ids(database_url, limit)
    unique_ror_ids = len(pending_ror_ids)
    looked_up = 0
    error_count = 0
    errors: List[str] = []
    consecutive_errors = 0
    phase_started = time.time()

    for rid in pending_ror_ids:
        try:
            payload = call_ror_lookup_with_retries(rid)
            parsed = parse_ror_lookup_payload(payload, rid)
            if execute:
                insert_lookup_row(client, parsed)
            looked_up += 1
            consecutive_errors = 0
        except Exception as exc:
            error_count += 1
            consecutive_errors += 1
            errors.append(f"{rid}: {repr(exc)}")
            if consecutive_errors >= CIRCUIT_BREAKER_THRESHOLD:
                partial_log = {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "mode": mode,
                    "elapsed_seconds": time.time() - started,
                    "phase": "b",
                    "phase_a_results": phase_a_results,
                    "phase_b_results": {
                        "unique_ror_ids": unique_ror_ids,
                        "looked_up": looked_up,
                        "errors": errors,
                        "error_count": error_count,
                        "circuit_breaker_tripped": True,
                    },
                    "phase_c_results": None,
                    "canonical_check": [],
                }
                write_log(partial_log)
                print(f"Saved log: {OUTPUT_LOG_PATH}")
                raise SystemExit(2)

        if (looked_up + error_count) % PROGRESS_EVERY == 0:
            done = looked_up + error_count
            elapsed = time.time() - phase_started
            rate = done / elapsed if elapsed > 0 else 0.0
            remaining = max(unique_ror_ids - done, 0)
            eta = (remaining / rate) if rate > 0 else None
            eta_text = f"{eta:.1f}s" if eta is not None else "unknown"
            print(
                f"Phase B {done}/{unique_ror_ids} | elapsed={elapsed:.1f}s rate={rate:.2f} ror/s "
                f"eta={eta_text} success={looked_up} errors={error_count}"
            )

    return {
        "unique_ror_ids": unique_ror_ids,
        "looked_up": looked_up,
        "errors": errors,
        "error_count": error_count,
        "executed_writes": bool(execute),
    }


def compute_phase_c_counts(database_url: str) -> Dict[str, int]:
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(
                """
                SELECT COUNT(*)::bigint AS c
                FROM hcps
                WHERE openalex_institution_ror_id IS NOT NULL
                """
            )
            with_ror = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                """
                SELECT COUNT(*)::bigint AS c
                FROM hcps h
                JOIN institution_geo_lookup i ON h.openalex_institution_ror_id = i.ror_id
                """
            )
            updatable = int((cur.fetchone() or {}).get("c") or 0)
    return {"hcps_updated": updatable, "hcps_skipped": max(with_ror - updatable, 0)}


def run_phase_c(database_url: str, execute: bool) -> Dict[str, Any]:
    counts = compute_phase_c_counts(database_url)
    if not execute:
        return {"hcps_updated": counts["hcps_updated"], "hcps_skipped": counts["hcps_skipped"], "executed_writes": False}

    sql = """
        UPDATE hcps h
        SET
          institution_state = i.state_name,
          institution_state_code = i.state_code,
          institution_country = i.country,
          institution_geo_method = 'openalex_authorship',
          institution_geo_confidence = CASE
            WHEN i.state_name IS NOT NULL THEN 'high'
            WHEN i.country IS NOT NULL THEN 'medium'
            ELSE 'no_data'
          END,
          institution_geo_resolved_at = NOW()
        FROM institution_geo_lookup i
        WHERE h.openalex_institution_ror_id = i.ror_id;
    """
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(sql)
            updated = int(cur.rowcount or 0)
        conn.commit()
    return {"hcps_updated": updated, "hcps_skipped": counts["hcps_skipped"], "executed_writes": True}


def fetch_canonical_check(database_url: str) -> List[Dict[str, Any]]:
    rng = random.Random(42)
    rows: List[Dict[str, Any]] = []
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute(
                """
                SELECT id, first_name, last_name
                FROM hcps
                WHERE id = ANY(%s)
                ORDER BY id
                """,
                (CANONICAL_HCP_IDS,),
            )
            canonical_found = {str(r.get("id")): dict(r) for r in cur.fetchall()}
            for cid in CANONICAL_HCP_IDS:
                if cid in canonical_found:
                    row = canonical_found[cid]
                    rows.append({"id": cid, "first_name": row.get("first_name"), "last_name": row.get("last_name")})

            cur.execute(
                """
                SELECT id, first_name, last_name
                FROM hcps
                WHERE openalex_institution_ror_id IS NOT NULL
                ORDER BY id
                """
            )
            candidates = [dict(r) for r in cur.fetchall() if str(r.get("id")) not in CANONICAL_HCP_IDS]
            extra = rng.sample(candidates, min(2, len(candidates))) if candidates else []
            rows.extend(extra)

            out: List[Dict[str, Any]] = []
            for r in rows[:5]:
                hcp_id = str(r.get("id"))
                cur.execute(
                    """
                    SELECT
                      id,
                      first_name,
                      last_name,
                      openalex_institution_ror_id,
                      institution_state,
                      institution_state_code,
                      institution_country,
                      institution_geo_confidence
                    FROM hcps
                    WHERE id = %s
                    LIMIT 1
                    """,
                    (hcp_id,),
                )
                row = cur.fetchone()
                if not row:
                    continue
                d = dict(row)
                ror_id = d.get("openalex_institution_ror_id")
                city = None
                if ror_id:
                    cur.execute(
                        """
                        SELECT city
                        FROM institution_geo_lookup
                        WHERE ror_id = %s
                        LIMIT 1
                        """,
                        (ror_id,),
                    )
                    c_row = cur.fetchone()
                    city = (c_row or {}).get("city") if c_row else None

                out.append(
                    {
                        "hcp_id": str(d.get("id")),
                        "name": f'{d.get("first_name") or ""} {d.get("last_name") or ""}'.strip(),
                        "openalex_institution_ror_id": ror_id,
                        "institution_state": d.get("institution_state"),
                        "institution_state_code": d.get("institution_state_code"),
                        "institution_country": d.get("institution_country"),
                        "city": city,
                        "institution_geo_confidence": d.get("institution_geo_confidence"),
                    }
                )
    return out


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
    phase_c_results: Optional[Dict[str, Any]] = None

    if args.phase in ("a", "abc"):
        print(f"Running Phase A ({mode})...")
        phase_a_results = run_phase_a(database_url, client, execute=execute)

    if args.phase in ("b", "abc"):
        print(f"Running Phase B ({mode})...")
        phase_b_results = run_phase_b(
            database_url=database_url,
            client=client,
            execute=execute,
            limit=args.limit,
            mode=mode,
            phase_a_results=phase_a_results,
            started=started,
        )

    if args.phase in ("c", "abc"):
        print(f"Running Phase C ({mode})...")
        phase_c_results = run_phase_c(database_url, execute=execute)

    canonical_check = fetch_canonical_check(database_url)
    log_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "elapsed_seconds": time.time() - started,
        "phase": args.phase,
        "phase_a_results": phase_a_results,
        "phase_b_results": phase_b_results,
        "phase_c_results": phase_c_results,
        "canonical_check": canonical_check,
    }
    write_log(log_payload)
    print(f"Saved log: {OUTPUT_LOG_PATH}")


if __name__ == "__main__":
    main()
