"""
FieldMark — Backfill ror_to_country from the OpenAlex /institutions endpoint.

Companion to enrich_ror_to_country.py, which walks the ROR API one organization at a
time (0.5s/request). This one targets the specific gap that blocks affiliation
re-derivation: RORs that appear in RECENT publications but are missing from
ror_to_country. OpenAlex accepts up to 50 RORs per request via the OR-filter
(filter=ror:a|b|c), so ~8K RORs is ~161 requests rather than ~8K.

Scope: distinct institution_ror values in author_pub_flat rows for linked HCPs with
pub_year >= (current_year - window + 1), minus those already in ror_to_country.

Writes ONLY new rows (ON CONFLICT DO NOTHING) — never overwrites an existing mapping.

Env: DATABASE_URL. Optional: OPENALEX_API_KEY (polite pool via mailto regardless).

Usage:
  python scripts/enrich/backfill_ror_country_openalex.py --dry-run
  python scripts/enrich/backfill_ror_country_openalex.py
  python scripts/enrich/backfill_ror_country_openalex.py --window 3 --limit 200
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import psycopg
import requests
from dotenv import load_dotenv

load_dotenv()

OPENALEX_INSTITUTIONS = "https://api.openalex.org/institutions"
MAILTO = "garrett.groesbeck@gmail.com"
BATCH = 50                    # OpenAlex OR-filter ceiling
REQUEST_INTERVAL_SEC = 0.12   # polite pool allows 10/s; stay well under
MAX_RETRIES = 4
PROGRESS_EVERY = 20

ROR_RE = re.compile(r"^https?://ror\.org/", re.I)


def bare_ror(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    r = ROR_RE.sub("", str(raw).strip())
    return r or None


def fetch_unmapped_rors(conn, window: int) -> Tuple[List[str], int, int]:
    """Returns (unmapped_rors, distinct_recent_total, already_mapped).

    window=3 means pub_year >= current_year - 3 — the last 3 FULL years plus the
    current partial year (2023+ as of 2026). This matches the window in
    docs/AFFILIATION_REDERIVATION_SCOPE.md; reference data is deliberately filled
    one year wider than the re-derivation needs, so narrowing the window later
    never re-opens the gap.
    """
    min_year = datetime.now(timezone.utc).year - window
    sql = """
    WITH recent AS (
      SELECT DISTINCT regexp_replace(f.institution_ror, '^https?://ror\\.org/', '') AS rid
      FROM hcp_openalex_authors_v2 l
      JOIN author_pub_flat f ON f.author_id = l.openalex_author_id
      WHERE f.pub_year >= %(min_year)s
        AND f.institution_ror IS NOT NULL
    )
    SELECT r.rid, (rc.ror_id IS NOT NULL) AS mapped
    FROM recent r
    LEFT JOIN ror_to_country rc ON rc.ror_id = r.rid
    WHERE r.rid IS NOT NULL AND r.rid <> ''
    ORDER BY r.rid
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"min_year": min_year})
        rows = cur.fetchall()
    unmapped = [r[0] for r in rows if not r[1]]
    mapped = sum(1 for r in rows if r[1])
    return unmapped, len(rows), mapped


def fetch_batch(session: requests.Session, rors: List[str]) -> Dict[str, Dict[str, str]]:
    """One OpenAlex call for up to BATCH RORs. Returns {bare_ror: {...}}."""
    params = {
        "filter": "ror:" + "|".join(rors),
        "per-page": str(BATCH),
        "select": "id,ror,display_name,country_code,geo",
        "mailto": MAILTO,
    }
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(OPENALEX_INSTITUTIONS, params=params, timeout=60)
            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            payload = resp.json()
            out: Dict[str, Dict[str, str]] = {}
            for item in payload.get("results") or []:
                rid = bare_ror(item.get("ror"))
                if not rid:
                    continue
                geo = item.get("geo") or {}
                out[rid] = {
                    "country_code": item.get("country_code") or geo.get("country_code"),
                    "country_name": geo.get("country"),
                    "ror_name": item.get("display_name"),
                }
            return out
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(2 ** attempt)
    print(f"  ! batch failed after {MAX_RETRIES} attempts: {last_err}", file=sys.stderr)
    return {}


def upsert(conn, rows: List[Tuple[str, str, str, str]]) -> int:
    """Insert new mappings only. Never overwrites an existing ror_to_country row."""
    if not rows:
        return 0
    sql = """
    INSERT INTO ror_to_country (ror_id, country_code, country_name, ror_name, enriched_at)
    VALUES (%s, %s, %s, %s, NOW())
    ON CONFLICT (ror_id) DO NOTHING
    """
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount if cur.rowcount and cur.rowcount > 0 else len(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", type=int, default=3, help="Recency window in years (default 3)")
    ap.add_argument("--limit", type=int, help="Cap RORs processed (testing)")
    ap.add_argument("--dry-run", action="store_true", help="Fetch but do not write")
    args = ap.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 1

    session = requests.Session()
    session.headers.update({"User-Agent": f"FieldMark/1.0 (mailto:{MAILTO})"})

    with psycopg.connect(db_url) as conn:
        unmapped, distinct_total, already = fetch_unmapped_rors(conn, args.window)
        print(f"Recency window     : last {args.window} years")
        print(f"Distinct recent ROR: {distinct_total:,}")
        print(f"  already mapped   : {already:,}")
        print(f"  unmapped         : {len(unmapped):,}")

        if args.limit:
            unmapped = unmapped[: args.limit]
            print(f"  (limited to {len(unmapped):,})")
        if not unmapped:
            print("\nNothing to do.")
            return 0

        batches = [unmapped[i : i + BATCH] for i in range(0, len(unmapped), BATCH)]
        print(f"\nFetching {len(batches)} OpenAlex requests ({BATCH}/request)...\n")

        found: Dict[str, Dict[str, str]] = {}
        t0 = time.perf_counter()
        for i, batch in enumerate(batches, 1):
            found.update(fetch_batch(session, batch))
            if i % PROGRESS_EVERY == 0 or i == len(batches):
                el = time.perf_counter() - t0
                print(f"  [{i}/{len(batches)}] resolved {len(found):,}  ({el:.0f}s)")
            time.sleep(REQUEST_INTERVAL_SEC)

        no_cc = sorted(r for r, v in found.items() if not v.get("country_code"))
        writable = [
            (r, v["country_code"], v.get("country_name"), v.get("ror_name"))
            for r, v in sorted(found.items())
            if v.get("country_code")
        ]
        missing = sorted(set(unmapped) - set(found.keys()))

        elapsed = time.perf_counter() - t0
        print(f"\n{'=' * 60}")
        print(f"Requested          : {len(unmapped):,}")
        print(f"Found in OpenAlex  : {len(found):,}")
        print(f"  with country_code: {len(writable):,}")
        print(f"  no country_code  : {len(no_cc):,}")
        print(f"Not in OpenAlex    : {len(missing):,}")
        print(f"API time           : {elapsed:.0f}s")

        if args.dry_run:
            print("\n[--dry-run] no writes. Sample:")
            for r, cc, cn, name in writable[:10]:
                print(f"  {r}  {cc}  {name}")
            return 0

        written = upsert(conn, writable)
        conn.commit()
        print(f"\nWrote {written:,} new ror_to_country rows.")

        # Post-state coverage
        unmapped_after, distinct_after, mapped_after = fetch_unmapped_rors(conn, args.window)
        pct = 100.0 * mapped_after / distinct_after if distinct_after else 0.0
        print(f"\nRecent-paper ROR coverage: {mapped_after:,}/{distinct_after:,} ({pct:.1f}%)")
        print(f"Still unmapped           : {len(unmapped_after):,}")

        if missing:
            print(f"\nFirst 20 not-in-OpenAlex RORs: {', '.join(missing[:20])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
