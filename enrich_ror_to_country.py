"""
FieldMark — Enrich distinct ROR IDs with country metadata from the ROR API.

Reads RORs from openalex_author_inventory and nppes_org_to_ror, unions and
dedupes, then calls https://api.ror.org/organizations/{id} for each. Writes
to ror_to_country for Step C and downstream use.

Requires: SUPABASE_URL, SUPABASE_KEY (and python-dotenv optional).
Optional: DATABASE_URL — used only to CREATE TABLE / index if the table is
missing (PostgREST cannot run DDL).

Examples:
  python enrich_ror_to_country.py --dry-run --limit 20
  python enrich_ror_to_country.py --resume
  python enrich_ror_to_country.py
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util import Retry

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

INVENTORY_PAGE_SIZE = 1000
NPPES_PAGE_SIZE = 1000
UPSERT_BATCH = 100
PROGRESS_EVERY = 100
ROR_REQUEST_INTERVAL_SEC = 0.5
ROR_API_BASE = "https://api.ror.org/organizations"
USER_AGENT = "FieldMark/1.0 (mailto:garrett.groesbeck@gmail.com)"

DDL_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS ror_to_country (
      ror_id TEXT PRIMARY KEY,
      country_code TEXT,
      country_name TEXT,
      ror_name TEXT,
      enriched_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_ror_to_country_country_code
    ON ror_to_country (country_code);
    """,
)


# ---------------------------------------------------------------------------
# Env / client
# ---------------------------------------------------------------------------


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing required env var: {name}")
    return v


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ror_path_id(raw: Optional[str]) -> Optional[str]:
    """Normalize stored ROR to lowercase id segment for API path (e.g. 02drdmm93)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.rstrip("/")
    if "ror.org/" in s.lower():
        s = s.split("/")[-1]
    s = s.lower()
    if not s or not re.match(r"^[a-z0-9]+$", s):
        return None
    return s


def table_ror_to_country_accessible(supabase: Client) -> bool:
    try:
        supabase.table("ror_to_country").select("ror_id").limit(1).execute()
        return True
    except Exception:
        return False


def ensure_ror_to_country_table(supabase: Client) -> None:
    """Create ror_to_country + index via DATABASE_URL if table is missing."""
    if table_ror_to_country_accessible(supabase):
        return

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        eprint("Table ror_to_country is not accessible and DATABASE_URL is not set.")
        eprint("Create the table manually in the Supabase SQL editor, then re-run:\n")
        for stmt in DDL_STATEMENTS:
            print(stmt.strip())
        raise SystemExit(1)

    try:
        import psycopg2
    except ImportError:
        eprint("Table ror_to_country is not accessible and psycopg2 is not installed.")
        eprint("Install with: pip install psycopg2-binary")
        eprint("Or create the table manually:\n")
        for stmt in DDL_STATEMENTS:
            print(stmt.strip())
        raise SystemExit(1) from None

    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        for stmt in DDL_STATEMENTS:
            cur.execute(stmt)
        cur.close()
        conn.close()
    except Exception as exc:
        eprint(f"Failed to create ror_to_country (check DB permissions): {exc}")
        eprint("Create the table manually in the Supabase SQL editor:\n")
        for stmt in DDL_STATEMENTS:
            print(stmt.strip())
        raise SystemExit(1) from exc

    if not table_ror_to_country_accessible(supabase):
        eprint("Table ror_to_country still not visible via Supabase API after DDL.")
        raise SystemExit(1)


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Enrich distinct ROR IDs with country data from api.ror.org into ror_to_country.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--dry-run", action="store_true", help="Call ROR API only; no DB writes")
    p.add_argument("--limit", type=int, default=None, metavar="N", help="Process at most N RORs after union/resume")
    p.add_argument("--resume", action="store_true", help="Skip RORs already present in ror_to_country")
    return p.parse_args()


def make_ror_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    retry = Retry(
        total=6,
        connect=6,
        read=6,
        backoff_factor=1.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    return s


def fetch_distinct_inventory_rors(supabase: Client) -> Set[str]:
    out: Set[str] = set()
    last_oa: Optional[str] = None
    while True:
        q = (
            supabase.table("openalex_author_inventory")
            .select("openalex_author_id,last_known_institution_ror")
            .order("openalex_author_id")
            .limit(INVENTORY_PAGE_SIZE)
        )
        if last_oa is not None:
            q = q.gt("openalex_author_id", last_oa)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            rid = ror_path_id(row.get("last_known_institution_ror"))
            if rid:
                out.add(rid)
        last_oa = batch[-1].get("openalex_author_id")
        if not last_oa or len(batch) < INVENTORY_PAGE_SIZE:
            break
    return out


def fetch_distinct_nppes_rors(supabase: Client) -> Set[str]:
    out: Set[str] = set()
    last_key: Optional[str] = None
    while True:
        q = (
            supabase.table("nppes_org_to_ror")
            .select("nppes_organization_name,ror_id,confidence")
            .in_("confidence", ["high", "medium"])
            .order("nppes_organization_name")
            .limit(NPPES_PAGE_SIZE)
        )
        if last_key is not None:
            q = q.gt("nppes_organization_name", last_key)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            rid = ror_path_id(row.get("ror_id"))
            if rid:
                out.add(rid)
        last_key = batch[-1].get("nppes_organization_name")
        if not last_key or len(batch) < NPPES_PAGE_SIZE:
            break
    return out


def fetch_existing_ror_ids(supabase: Client) -> Set[str]:
    out: Set[str] = set()
    last_id: Optional[str] = None
    page = 1000
    while True:
        q = supabase.table("ror_to_country").select("ror_id").order("ror_id").limit(page)
        if last_id is not None:
            q = q.gt("ror_id", last_id)
        batch = q.execute().data or []
        if not batch:
            break
        for row in batch:
            rid = row.get("ror_id")
            if rid:
                out.add(str(rid).lower())
        last_id = batch[-1].get("ror_id")
        if not last_id or len(batch) < page:
            break
    return out


def pick_ror_display_name(names: Sequence[Dict[str, Any]]) -> Optional[str]:
    for n in names:
        types = n.get("types") or []
        if "ror_display" in types:
            v = n.get("value")
            if v:
                return str(v)
    for n in names:
        types = n.get("types") or []
        if "label" in types:
            v = n.get("value")
            if v:
                return str(v)
    if names:
        v = names[0].get("value")
        return str(v) if v else None
    return None


def parse_ror_org_json(data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    locs = data.get("locations") or []
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    if locs and isinstance(locs[0], dict):
        gd = locs[0].get("geonames_details") or {}
        country_code = gd.get("country_code")
        if country_code is not None:
            country_code = str(country_code).strip() or None
        country_name = gd.get("country_name")
        if country_name is not None:
            country_name = str(country_name).strip() or None
    ror_name = pick_ror_display_name(data.get("names") or [])
    return country_code, country_name, ror_name


def upsert_ror_batch(
    supabase: Client,
    rows: Sequence[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    if not rows:
        return 0
    if dry_run:
        return 0
    chunk = list(rows)
    try:
        supabase.table("ror_to_country").upsert(chunk, on_conflict="ror_id").execute()
        return len(chunk)
    except Exception:
        nok = 0
        for r in chunk:
            try:
                supabase.table("ror_to_country").upsert([r], on_conflict="ror_id").execute()
                nok += 1
            except Exception as exc2:
                msg = f"ror_id={r.get('ror_id')}: {exc2}"
                errors.append(msg)
                eprint("[ror_to_country upsert]", msg)
        return nok


def flush_ror_buffer_if_full(
    supabase: Client,
    buf: List[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    """When buf has at least UPSERT_BATCH rows, flush that many from the front."""
    if len(buf) < UPSERT_BATCH:
        return 0
    chunk = buf[:UPSERT_BATCH]
    del buf[:UPSERT_BATCH]
    return upsert_ror_batch(supabase, chunk, dry_run=dry_run, errors=errors)


def flush_ror_buffer_remainder(
    supabase: Client,
    buf: List[Dict[str, Any]],
    *,
    dry_run: bool,
    errors: List[str],
) -> int:
    n = 0
    while buf:
        chunk = buf[:UPSERT_BATCH]
        del buf[:UPSERT_BATCH]
        n += upsert_ror_batch(supabase, chunk, dry_run=dry_run, errors=errors)
    return n


def main() -> None:
    args = parse_args()
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit N requires N >= 1")

    load_dotenv()
    supabase = init_supabase()

    if not args.dry_run:
        ensure_ror_to_country_table(supabase)
    else:
        if not table_ror_to_country_accessible(supabase):
            eprint("Note: ror_to_country not readable (--dry-run); skipping table check/creation.")

    print("Collecting distinct ROR ids from openalex_author_inventory...")
    inv = fetch_distinct_inventory_rors(supabase)
    print(f"  Inventory distinct RORs (non-null): {len(inv)}")

    print("Collecting distinct ROR ids from nppes_org_to_ror (high|medium)...")
    npp = fetch_distinct_nppes_rors(supabase)
    print(f"  NPPES distinct RORs: {len(npp)}")

    combined: Set[str] = set(inv) | set(npp)
    print(f"  Union (deduped): {len(combined)}")

    if args.resume:
        if table_ror_to_country_accessible(supabase):
            existing = fetch_existing_ror_ids(supabase)
            print(f"  Already in ror_to_country (--resume): {len(existing)}")
            to_process = sorted(combined - existing)
        else:
            to_process = sorted(combined)
            eprint("  (--resume: ror_to_country not readable; processing full union)")
    else:
        to_process = sorted(combined)

    if args.limit is not None:
        to_process = to_process[: args.limit]

    total = len(to_process)
    print(f"\nRORs to process this run: {total}")
    if total == 0:
        print("Nothing to do.")
        return

    session = make_ror_session()
    errors: List[str] = []
    country_counts: Counter[str] = Counter()
    failures = 0
    written = 0
    dry_run_rows = 0
    buf: List[Dict[str, Any]] = []
    t0 = time.perf_counter()
    now_iso = datetime.now(timezone.utc).isoformat()

    for i, rid in enumerate(to_process, start=1):
        url = f"{ROR_API_BASE}/{rid}"
        try:
            resp = session.get(url, timeout=60)
        except requests.RequestException as exc:
            failures += 1
            msg = f"ror_id={rid} request error: {exc}"
            errors.append(msg)
            eprint("[ROR API]", msg)
        else:
            if resp.status_code == 404:
                row = {
                    "ror_id": rid,
                    "country_code": "unknown",
                    "country_name": None,
                    "ror_name": None,
                    "enriched_at": now_iso,
                }
                country_counts["unknown"] += 1
                buf.append(row)
                if args.dry_run:
                    dry_run_rows += 1
                else:
                    written += flush_ror_buffer_if_full(supabase, buf, dry_run=args.dry_run, errors=errors)
            elif resp.status_code != 200:
                failures += 1
                msg = f"ror_id={rid} HTTP {resp.status_code}: {resp.text[:200]!r}"
                errors.append(msg)
                eprint("[ROR API]", msg)
            else:
                try:
                    data = resp.json()
                except Exception as exc:
                    failures += 1
                    msg = f"ror_id={rid} invalid JSON: {exc}"
                    errors.append(msg)
                    eprint("[ROR API]", msg)
                else:
                    cc, cn, rname = parse_ror_org_json(data)
                    key_cc = (cc or "").strip() or "unknown"
                    country_counts[key_cc] += 1
                    buf.append(
                        {
                            "ror_id": rid,
                            "country_code": cc,
                            "country_name": cn,
                            "ror_name": rname,
                            "enriched_at": now_iso,
                        }
                    )
                    if args.dry_run:
                        dry_run_rows += 1
                    else:
                        written += flush_ror_buffer_if_full(supabase, buf, dry_run=args.dry_run, errors=errors)

        time.sleep(ROR_REQUEST_INTERVAL_SEC)

        if i % PROGRESS_EVERY == 0 or i == total:
            elapsed = time.perf_counter() - t0
            rate = i / elapsed if elapsed > 0 else 0.0
            print(f"  Progress: {i}/{total} RORs ({rate:.2f} ROR/s elapsed)...")

    if not args.dry_run:
        written += flush_ror_buffer_remainder(supabase, buf, dry_run=False, errors=errors)
    else:
        buf.clear()

    elapsed = time.perf_counter() - t0
    print("\n" + "=" * 72)
    print("ENRICH ROR TO COUNTRY - SUMMARY")
    print("=" * 72)
    print(f"Total RORs processed (API calls): {total}")
    if args.dry_run:
        print(f"Dry-run: would upsert {dry_run_rows} row(s); DB writes skipped.")
    else:
        print(f"Rows written to ror_to_country (successful upserts): {written}")
    print(f"API / parse failures (no row stored): {failures}")
    print(f"Logged errors (includes upsert failures): {len(errors)}")
    print(f"Wall time: {elapsed:.1f}s ({elapsed / 60.0:.2f} min)")
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}" + (", resume" if args.resume else ""))

    # Country distribution (404 → unknown; missing code treated as unknown bucket above)
    print("\nCountry code distribution (this run, successful + 404-unknown):")
    if not country_counts:
        print("  (none)")
    else:
        total_c = sum(country_counts.values())
        for code, cnt in country_counts.most_common():
            pct = 100.0 * cnt / total_c if total_c else 0.0
            print(f"  {code}: {cnt} RORs ({pct:.1f}%)")

    if errors and len(errors) <= 30:
        print("\nError log:")
        for e in errors[:30]:
            print(f"  {e}")
    elif errors:
        print(f"\n({len(errors)} errors logged; showing first 30 on stderr)")
        for e in errors[:30]:
            eprint(f"  {e}")

    print("=" * 72)


if __name__ == "__main__":
    main()
