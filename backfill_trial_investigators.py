"""
backfill_trial_investigators.py — One-shot backfill of co-investigators from CT.gov.

Iterates NCT IDs in clinical_trials_v2, fetches each study from CT.gov v2 API,
extracts all overall officials and site location contacts, and inserts missing
rows into trial_investigators_v2 (hcp_id always NULL — matching is separate).

Required environment variables (from .env):
- DATABASE_URL
- SUPABASE_URL
- SUPABASE_SERVICE_KEY (or SUPABASE_KEY)

Usage:
    python backend/scripts/backfill_trial_investigators.py --limit 5 --dry-run
    python backend/scripts/backfill_trial_investigators.py --limit 20
    python backend/scripts/backfill_trial_investigators.py --resume
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime
from typing import Any

import click
import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()

CT_GOV_API = "https://clinicaltrials.gov/api/v2/studies/{}?format=json"


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def validate_env() -> None:
    get_required_env("DATABASE_URL")
    get_required_env("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not service_key:
        get_required_env("SUPABASE_KEY")


def get_db_conn():
    return psycopg2.connect(get_required_env("DATABASE_URL"))


def ns(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def splitn(raw: str | None) -> tuple[str, str, str]:
    """Split investigator name into (first, middle, last). Mirrors trials_pipeline.splitn."""
    s = ns(raw)
    pattern = (
        r",?\s*(m\.?d\.?|d\.?o\.?|ph\.?d\.?|m\.?b\.?b\.?s\.?|m\.?p\.?h\.?|m\.?s\.?c\.?|"
        r"m\.?h\.?s\.?c\.?|m\.?s\.?c\.?e\.?|d\.?s\.?c\.?|s\.?c\.?d\.?|dr\.?p\.?h\.?|"
        r"f\.?a\.?[a-z]{2,4}\.?|r\.?n\.?|n\.?p\.?|pa-c|p\.?a\.?)$"
    )
    while True:
        new_s = re.sub(pattern, "", s, flags=re.I)
        if new_s == s:
            break
        s = new_s
    if "," in s:
        parts = [x.strip() for x in s.split(",") if x.strip()]
        if len(parts) >= 2:
            last = parts[0]
            given_tokens = parts[1].split()
            if not given_tokens:
                return "", "", last
            first = given_tokens[0]
            middle = " ".join(given_tokens[1:]) if len(given_tokens) > 1 else ""
            return first, middle, last
    tokens = s.split()
    if not tokens:
        return "", "", ""
    if len(tokens) == 1:
        return "", "", tokens[0]
    if len(tokens) == 2:
        return tokens[0], "", tokens[1]
    return tokens[0], " ".join(tokens[1:-1]), tokens[-1]


def fetch_nct_ids(conn, resume: bool, limit: int | None = None) -> list[tuple[str, str]]:
    """Return list of (nct_id, trial_id) tuples to process."""
    with conn.cursor() as cur:
        if resume:
            cur.execute(
                """
                SELECT ct.nct_id, ct.id::text
                FROM clinical_trials_v2 ct
                WHERE NOT EXISTS (
                    SELECT 1 FROM trial_backfill_progress p
                    WHERE p.nct_id = ct.nct_id AND p.status = 'success'
                )
                ORDER BY ct.nct_id
                """
            )
        else:
            cur.execute(
                "SELECT nct_id, id::text FROM clinical_trials_v2 ORDER BY nct_id"
            )
        rows = cur.fetchall()
        if limit:
            rows = rows[:limit]
        return rows


def fetch_existing_investigators_for_trial(conn, trial_id: str) -> set[str]:
    """Return investigator_name values already present for this trial."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT investigator_name FROM trial_investigators_v2
            WHERE trial_id = %s AND investigator_name IS NOT NULL
            """,
            (trial_id,),
        )
        return {row[0] for row in cur.fetchall()}


def fetch_ctgov(nct_id: str, session: requests.Session) -> dict | None:
    """Fetch trial data from CT.gov. Returns parsed JSON dict or None on 404."""
    url = CT_GOV_API.format(nct_id)
    try:
        response = session.get(url, timeout=30)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        return {"_error": str(exc)}


def extract_investigators(data: dict) -> tuple[list[dict], list[dict]]:
    """Parse CT.gov response into (officials, contacts) lists."""
    if not data or "_error" in data:
        return [], []

    protocol = data.get("protocolSection", {}) or {}
    cm = protocol.get("contactsLocationsModule", {}) or {}

    officials_raw = cm.get("overallOfficials", []) or []
    locations_raw = cm.get("locations", []) or []

    officials: list[dict] = []
    for official in officials_raw:
        if not isinstance(official, dict):
            continue
        name = ns(official.get("name"))
        if not name:
            continue
        officials.append(
            {
                "name": name,
                "role": ns(official.get("role")) or "OVERALL_OFFICIAL",
                "affiliation": ns(official.get("affiliation")) or None,
                "facility": None,
                "city": None,
                "state": None,
                "country": None,
            }
        )

    contacts: list[dict] = []
    seen_contact_names: set[str] = set()
    for location in locations_raw:
        if not isinstance(location, dict):
            continue
        facility = ns(location.get("facility")) or None
        city = ns(location.get("city")) or None
        state = ns(location.get("state")) or None
        country = ns(location.get("country")) or None
        location_contacts = location.get("contacts", []) or []
        for contact in location_contacts:
            if not isinstance(contact, dict):
                continue
            name = ns(contact.get("name"))
            if not name or name in seen_contact_names:
                continue
            seen_contact_names.add(name)
            contacts.append(
                {
                    "name": name,
                    "role": ns(contact.get("role")) or "SITE_CONTACT",
                    "affiliation": facility,
                    "facility": facility,
                    "city": city,
                    "state": state,
                    "country": country,
                }
            )

    return officials, contacts


def _row_tuple(trial_id: str, investigator: dict, source: str) -> tuple:
    first, middle, last = splitn(investigator["name"])
    return (
        trial_id,
        investigator["role"],
        investigator["name"],
        first or None,
        middle or None,
        last or None,
        investigator.get("affiliation"),
        investigator.get("facility"),
        investigator.get("city"),
        investigator.get("state"),
        investigator.get("country"),
        source,
    )


def insert_investigators(
    conn,
    trial_id: str,
    investigators: list[dict],
    existing_names: set[str],
    source: str,
) -> int:
    """Insert investigator rows, skipping names already present for this trial."""
    new_rows = [
        _row_tuple(trial_id, inv, source)
        for inv in investigators
        if inv["name"] not in existing_names
    ]
    if not new_rows:
        return 0

    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO trial_investigators_v2 (
                trial_id,
                role,
                investigator_name,
                investigator_raw_first_name,
                investigator_raw_middle_name,
                investigator_raw_last_name,
                investigator_raw_affiliation,
                investigator_raw_facility,
                investigator_raw_city,
                investigator_raw_state,
                investigator_raw_country,
                source
            )
            VALUES %s
            """,
            new_rows,
        )
    conn.commit()
    return len(new_rows)


def log_progress(
    conn,
    nct_id: str,
    officials_added: int,
    contacts_added: int,
    skipped: int,
    status: str,
    error: str | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO trial_backfill_progress
                (nct_id, officials_added, contacts_added, skipped_existing, status, error_message)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (nct_id) DO UPDATE SET
                processed_at = now(),
                officials_added = EXCLUDED.officials_added,
                contacts_added = EXCLUDED.contacts_added,
                skipped_existing = EXCLUDED.skipped_existing,
                status = EXCLUDED.status,
                error_message = EXCLUDED.error_message
            """,
            (nct_id, officials_added, contacts_added, skipped, status, error),
        )
    conn.commit()


@click.command()
@click.option("--batch-size", default=100, show_default=True, help="Progress log interval (NCT IDs).")
@click.option("--rate-limit", default=5, show_default=True, help="Max CT.gov requests per second.")
@click.option("--resume", is_flag=True, help="Skip NCT IDs already marked success in trial_backfill_progress.")
@click.option("--limit", default=None, type=int, help="Process only the first N NCT IDs (testing).")
@click.option("--dry-run", is_flag=True, help="Fetch and parse only; do not write to DB.")
def main(batch_size: int, rate_limit: int, resume: bool, limit: int | None, dry_run: bool) -> None:
    validate_env()
    sleep_per_request = 1.0 / rate_limit
    conn = get_db_conn()
    session = requests.Session()
    session.headers.update({"User-Agent": "FieldMark/1.0"})

    nct_targets = fetch_nct_ids(conn, resume, limit)
    print(
        f"Processing {len(nct_targets)} NCT IDs "
        f"(resume={resume}, dry_run={dry_run}, rate_limit={rate_limit}/sec)"
    )

    total_officials = 0
    total_contacts = 0
    total_skipped = 0
    total_errors = 0
    started = datetime.now()

    for i, (nct_id, trial_id) in enumerate(nct_targets):
        try:
            data = fetch_ctgov(nct_id, session)

            if data is None:
                if not dry_run:
                    log_progress(conn, nct_id, 0, 0, 0, "no_data")
                if (i + 1) % batch_size == 0:
                    print(f"  {i + 1}/{len(nct_targets)} processed (no_data on {nct_id})")
                time.sleep(sleep_per_request)
                continue

            if "_error" in data:
                if not dry_run:
                    log_progress(conn, nct_id, 0, 0, 0, "http_error", data["_error"])
                total_errors += 1
                if (i + 1) % batch_size == 0:
                    print(f"  {i + 1}/{len(nct_targets)} processed ({total_errors} errors so far)")
                time.sleep(sleep_per_request * 2)
                continue

            officials, contacts = extract_investigators(data)

            if dry_run:
                print(f"  [dry] {nct_id}: {len(officials)} officials, {len(contacts)} contacts")
                time.sleep(sleep_per_request)
                continue

            existing = fetch_existing_investigators_for_trial(conn, trial_id)

            off_added = insert_investigators(
                conn, trial_id, officials, existing, "overall_official"
            )
            existing_after = existing | {inv["name"] for inv in officials}
            cont_added = insert_investigators(
                conn, trial_id, contacts, existing_after, "site_contact"
            )

            skipped = (len(officials) + len(contacts)) - (off_added + cont_added)

            total_officials += off_added
            total_contacts += cont_added
            total_skipped += skipped

            log_progress(conn, nct_id, off_added, cont_added, skipped, "success")

            if (i + 1) % batch_size == 0:
                elapsed = (datetime.now() - started).total_seconds()
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                eta_seconds = (len(nct_targets) - (i + 1)) / rate if rate > 0 else 0
                print(
                    f"  {i + 1}/{len(nct_targets)} processed | "
                    f"{total_officials} officials + {total_contacts} contacts added | "
                    f"{total_skipped} skipped | {total_errors} errors | "
                    f"ETA: {eta_seconds / 60:.1f} min"
                )

            time.sleep(sleep_per_request)

        except Exception as exc:
            print(f"  UNEXPECTED ERROR on {nct_id}: {exc}")
            if not dry_run:
                log_progress(conn, nct_id, 0, 0, 0, "parse_error", str(exc))
            total_errors += 1
            time.sleep(sleep_per_request * 2)

    elapsed = (datetime.now() - started).total_seconds()
    print(f"\nComplete in {elapsed / 60:.1f} min")
    print(f"  Total officials added: {total_officials}")
    print(f"  Total contacts added: {total_contacts}")
    print(f"  Total skipped (already existed): {total_skipped}")
    print(f"  Total errors: {total_errors}")

    conn.close()


if __name__ == "__main__":
    main()
