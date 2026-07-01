"""
ingest_nih_grants.py — Pull NIH RePORTER grants into public.nih_grants.

Uses NIH RePORTER API v2: https://api.reporter.nih.gov/v2/projects/search
Scope: FY2012–FY2026, curated activity code whitelist. No HCP matching (see match_nih_investigators.py).

Required environment variables:
- SUPABASE_URL
- SUPABASE_SERVICE_KEY (falls back to SUPABASE_KEY if unset)

Usage:
    python ingest_nih_grants.py
    python ingest_nih_grants.py --test
    python ingest_nih_grants.py --retry-failed
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm

API_URL = "https://api.reporter.nih.gov/v2/projects/search"
CHECKPOINT_PATH = Path("nih_ingest_checkpoint.json")
PAGE_LIMIT = 500
MAX_OFFSET = 14999
REQUEST_SLEEP_SECONDS = 0.5
UPSERT_BATCH_SIZE = 100
REQUEST_TIMEOUT = (10, 120)

ACTIVITY_CODES = [
    "R01", "R03", "R15", "R21", "R33", "R34", "R35", "R37", "R56", "R61",
    "K01", "K02", "K05", "K07", "K08", "K12", "K18", "K22", "K23", "K24", "K25", "K76", "K99",
    "P01", "P20", "P30", "P50", "P60",
    "U01", "U10", "U19", "U24", "U54",
    "DP1", "DP2", "DP5",
    "RC1", "RC2", "RC4", "RM1",
]

FISCAL_YEARS = list(range(2012, 2027))


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    url = get_required_env("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip() or os.getenv("SUPABASE_KEY", "").strip()
    if not key:
        raise EnvironmentError("Missing SUPABASE_SERVICE_KEY or SUPABASE_KEY")
    return create_client(url, key)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def combo_key(fiscal_year: int, activity_code: str) -> Tuple[str, str]:
    return (str(fiscal_year), activity_code)


def load_checkpoint(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        return {
            "completed_combos": [],
            "failed_combos": [],
            "total_grants_ingested": 0,
            "started_at": utc_now_iso(),
            "last_updated_at": utc_now_iso(),
        }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {
            "completed_combos": [],
            "failed_combos": [],
            "total_grants_ingested": 0,
            "started_at": utc_now_iso(),
            "last_updated_at": utc_now_iso(),
        }
    if not isinstance(data, dict):
        data = {}
    data.setdefault("completed_combos", [])
    data.setdefault("failed_combos", [])
    data.setdefault("total_grants_ingested", 0)
    data.setdefault("started_at", utc_now_iso())
    data.setdefault("last_updated_at", utc_now_iso())
    return data


def save_checkpoint(path: Path, state: Dict[str, Any]) -> None:
    state["last_updated_at"] = utc_now_iso()
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def completed_set(state: Dict[str, Any]) -> Set[Tuple[str, str]]:
    out: Set[Tuple[str, str]] = set()
    for item in state.get("completed_combos", []):
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            out.add((str(item[0]), str(item[1])))
    return out


def failed_list(state: Dict[str, Any]) -> List[List[str]]:
    raw = state.get("failed_combos", [])
    if not isinstance(raw, list):
        return []
    return [list(x) for x in raw if isinstance(x, (list, tuple)) and len(x) >= 2]


def build_query_plan(
    state: Dict[str, Any],
    retry_failed_only: bool,
    fiscal_years: List[int],
    activity_codes: List[str],
) -> List[Tuple[int, str]]:
    all_combos = [(fy, code) for fy in fiscal_years for code in activity_codes]
    done = completed_set(state)

    if retry_failed_only:
        plan: List[Tuple[int, str]] = []
        for item in failed_list(state):
            key = (str(item[0]), str(item[1]))
            if key not in done:
                plan.append((int(item[0]), str(item[1])))
        return plan

    plan = []
    for fy, code in all_combos:
        if (str(fy), code) not in done:
            plan.append((fy, code))
    return plan


def _parse_date(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    if isinstance(value, str):
        return value[:10] if len(value) >= 10 else value
    return str(value)


def _strip_nul(value: Any) -> Any:
    """Recursively strip U+0000 null bytes from strings, lists, and dicts.
    Postgres text columns reject \\u0000 even though it's valid JSON."""
    if value is None:
        return None
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [_strip_nul(item) for item in value]
    if isinstance(value, dict):
        return {k: _strip_nul(v) for k, v in value.items()}
    return value


def map_grant_row(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    core = result.get("core_project_num") or result.get("project_num")
    if not core:
        return None

    org = result.get("organization") if isinstance(result.get("organization"), dict) else {}
    agency_ic = result.get("agency_ic_admin") if isinstance(result.get("agency_ic_admin"), dict) else {}
    study_section = result.get("full_study_section") if isinstance(result.get("full_study_section"), dict) else {}

    spending = result.get("spending_categories")
    pref = result.get("pref_terms")
    if isinstance(pref, list):
        pref = "; ".join(str(p) for p in pref)
    elif pref is not None:
        pref = str(pref)

    return _strip_nul({
        "core_project_num": str(core),
        "appl_id": result.get("appl_id"),
        "project_title": result.get("project_title"),
        "abstract_text": result.get("abstract_text"),
        "public_health_relevance": result.get("phr_text"),
        "fiscal_year": result.get("fiscal_year"),
        "project_start_date": _parse_date(result.get("project_start_date")),
        "project_end_date": _parse_date(result.get("project_end_date")),
        "award_notice_date": _parse_date(result.get("award_notice_date")),
        "total_cost": result.get("award_amount"),
        "direct_cost_amt": result.get("direct_cost_amt"),
        "indirect_cost_amt": result.get("indirect_cost_amt"),
        "activity_code": result.get("activity_code"),
        "administering_ic": agency_ic.get("abbreviation") if isinstance(agency_ic, dict) else None,
        "funding_mechanism": result.get("funding_mechanism"),
        "study_section": study_section.get("sra_designator_code") if isinstance(study_section, dict) else None,
        "org_name": org.get("org_name") if isinstance(org, dict) else None,
        "org_city": org.get("org_city") if isinstance(org, dict) else None,
        "org_state": org.get("org_state") if isinstance(org, dict) else None,
        "org_country": org.get("org_country") if isinstance(org, dict) else None,
        "org_duns": org.get("org_duns") if isinstance(org, dict) else None,
        "is_active": bool(result.get("is_active", False)),
        "is_new": bool(result.get("is_new", False)),
        "subproject_id": result.get("subproject_id"),
        "parent_project_num": result.get("super_project_num") or None,
        "agency_code": result.get("agency_code"),
        "spending_categories": spending,
        "pref_terms": pref,
        "raw_payload": result,
    })


def fetch_page(
    fiscal_year: int,
    activity_code: str,
    offset: int,
    session: requests.Session,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    payload = {
        "criteria": {
            "fiscal_years": [fiscal_year],
            "activity_codes": [activity_code],
            "exclude_subprojects": False,
            "sub_project_only": False,
        },
        "limit": PAGE_LIMIT,
        "offset": offset,
    }

    last_error: Optional[str] = None
    for attempt in range(4):
        try:
            resp = session.post(API_URL, json=payload, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 429:
                if attempt >= 3:
                    return [], f"HTTP 429 after retries: {resp.text[:200]}"
                print("Rate limited (429); sleeping 60s before retry...")
                time.sleep(60.0)
                continue
            if resp.status_code != 200:
                return [], f"HTTP {resp.status_code}: {resp.text[:300]}"
            data = resp.json()
            results = data.get("results") or []
            if not isinstance(results, list):
                results = []
            return results, None
        except requests.RequestException as exc:
            last_error = str(exc)
            if attempt >= 3:
                break
            time.sleep(2 ** (attempt + 1))

    return [], last_error or "unknown request error"


def upsert_grants_batch(client: Client, rows: List[Dict[str, Any]]) -> int:
    """Upsert a batch, deduplicating by (core_project_num, fiscal_year). Returns duplicates dropped."""
    if not rows:
        return 0

    seen: Dict[Tuple[str, Optional[int]], Dict[str, Any]] = {}
    duplicates_dropped = 0
    for row in rows:
        core = row.get("core_project_num")
        fy = row.get("fiscal_year")
        if not core:
            continue
        key = (str(core), fy)
        if key in seen:
            duplicates_dropped += 1
        seen[key] = row

    deduped = list(seen.values())
    if not deduped:
        return duplicates_dropped

    try:
        client.table("nih_grants").upsert(
            deduped, on_conflict="core_project_num,fiscal_year"
        ).execute()
    except Exception as exc:
        print(f"\n[DATABASE ERROR] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    return duplicates_dropped


def ingest_combination(
    client: Client,
    fiscal_year: int,
    activity_code: str,
    session: requests.Session,
    inner_bar: Optional[tqdm],
) -> Tuple[int, Optional[str]]:
    offset = 0
    combo_count = 0
    hit_cap = False

    while True:
        if offset > MAX_OFFSET:
            hit_cap = True
            print(
                f"\n[WARNING] FY{fiscal_year} {activity_code}: offset exceeded {MAX_OFFSET}; "
                "NIH API may cap results — some grants may be missing."
            )
            break

        results, err = fetch_page(fiscal_year, activity_code, offset, session)
        time.sleep(REQUEST_SLEEP_SECONDS)

        if err:
            return combo_count, err

        if not results:
            break

        batch: List[Dict[str, Any]] = []
        for raw in results:
            if not isinstance(raw, dict):
                continue
            row = map_grant_row(raw)
            if row:
                batch.append(row)

        duplicates_this_combo = 0
        for i in range(0, len(batch), UPSERT_BATCH_SIZE):
            duplicates_this_combo += upsert_grants_batch(client, batch[i : i + UPSERT_BATCH_SIZE])

        combo_count += len(batch) - duplicates_this_combo

        if duplicates_this_combo > 0:
            print(
                f"\n[INFO] FY{fiscal_year} {activity_code}: {duplicates_this_combo} duplicate "
                "core_project_num rows dropped within batches."
            )

        if inner_bar is not None:
            inner_bar.update(1)

        if len(results) < PAGE_LIMIT:
            break

        offset += PAGE_LIMIT

    if hit_cap and inner_bar is not None:
        inner_bar.close()

    return combo_count, None


def mark_combo_completed(state: Dict[str, Any], fiscal_year: int, activity_code: str) -> None:
    key = [str(fiscal_year), activity_code]
    completed = state.setdefault("completed_combos", [])
    if key not in completed:
        completed.append(key)


def mark_combo_failed(state: Dict[str, Any], fiscal_year: int, activity_code: str) -> None:
    key = [str(fiscal_year), activity_code]
    failed = state.setdefault("failed_combos", [])
    if key not in failed:
        failed.append(key)


def remove_combo_failed(state: Dict[str, Any], fiscal_year: int, activity_code: str) -> None:
    key = [str(fiscal_year), activity_code]
    state["failed_combos"] = [
        x for x in failed_list(state) if not (str(x[0]) == key[0] and str(x[1]) == key[1])
    ]


def print_final_summary(
    state: Dict[str, Any],
    combos_attempted: int,
    combos_completed: int,
    combos_failed: int,
    elapsed_sec: float,
) -> None:
    print("\n" + "=" * 60)
    print("NIH RePORTER ingest summary")
    print("=" * 60)
    print(f"Total grants ingested (checkpoint): {state.get('total_grants_ingested', 0):,}")
    print(f"Combinations attempted this run: {combos_attempted}")
    print(f"Combinations completed this run: {combos_completed}")
    print(f"Combinations failed this run: {combos_failed}")
    print(f"Total time: {elapsed_sec:.1f}s")
    print(f"Checkpoint: {CHECKPOINT_PATH.resolve()}")

    failed = failed_list(state)
    if failed:
        print(f"\nFailed combinations ({len(failed)}):")
        for item in failed[:20]:
            print(f"  FY{item[0]} {item[1]}")
        if len(failed) > 20:
            print(f"  ... and {len(failed) - 20} more")
        print("\nTo retry failed combinations, run: python ingest_nih_grants.py --retry-failed")
    print("=" * 60)


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Ingest NIH RePORTER grants into public.nih_grants")
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="Retry only combinations listed in checkpoint failed_combos",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run a small validation batch (FY2024 + K23/K99/K08 only). Writes to Supabase; idempotent.",
    )
    args = parser.parse_args()

    if args.test and args.retry_failed:
        print("Error: --test and --retry-failed are mutually exclusive.", file=sys.stderr)
        return 1

    fiscal_years = FISCAL_YEARS
    activity_codes = ACTIVITY_CODES
    if args.test:
        fiscal_years = [2024]
        activity_codes = ["K23", "K99", "K08"]
        print("[TEST MODE] Running narrow scope: FY2024 x K23/K99/K08")

    t0 = time.time()
    state = load_checkpoint(CHECKPOINT_PATH)
    if not state.get("started_at"):
        state["started_at"] = utc_now_iso()

    plan = build_query_plan(
        state,
        retry_failed_only=args.retry_failed,
        fiscal_years=fiscal_years,
        activity_codes=activity_codes,
    )
    if not plan:
        print("Nothing to do — all combinations completed (and no failed combos to retry).")
        print_final_summary(state, 0, 0, 0, time.time() - t0)
        return 0

    client = init_supabase()
    session = requests.Session()

    combos_attempted = 0
    combos_completed = 0
    combos_failed = 0
    run_grants = 0

    total_combos = len(plan)
    outer = tqdm(plan, desc="FY × activity code", unit="combo", total=total_combos)

    try:
        for fiscal_year, activity_code in outer:
            combos_attempted += 1
            combo_start = time.time()
            inner = tqdm(
                desc=f"FY{fiscal_year} {activity_code} pages",
                unit="page",
                leave=False,
            )

            try:
                count, err = ingest_combination(
                    client, fiscal_year, activity_code, session, inner
                )
            except KeyboardInterrupt:
                inner.close()
                save_checkpoint(CHECKPOINT_PATH, state)
                print("\nInterrupted — checkpoint saved.")
                print_final_summary(
                    state, combos_attempted, combos_completed, combos_failed, time.time() - t0
                )
                return 0
            finally:
                if not inner.disable:
                    inner.close()

            if err:
                print(f"\n[FAILED] FY{fiscal_year} {activity_code}: {err}")
                mark_combo_failed(state, fiscal_year, activity_code)
                combos_failed += 1
                save_checkpoint(CHECKPOINT_PATH, state)
                continue

            mark_combo_completed(state, fiscal_year, activity_code)
            if args.retry_failed:
                remove_combo_failed(state, fiscal_year, activity_code)

            run_grants += count
            state["total_grants_ingested"] = int(state.get("total_grants_ingested", 0)) + count
            combos_completed += 1
            save_checkpoint(CHECKPOINT_PATH, state)

            elapsed_combo = time.time() - combo_start
            print(
                f"[FY{fiscal_year} {activity_code}] {count:,} grants ingested in {elapsed_combo:.0f}s. "
                f"Total so far: {state['total_grants_ingested']:,}."
            )

    except KeyboardInterrupt:
        save_checkpoint(CHECKPOINT_PATH, state)
        print("\nInterrupted — checkpoint saved.")
        print_final_summary(
            state, combos_attempted, combos_completed, combos_failed, time.time() - t0
        )
        return 0

    print_final_summary(state, combos_attempted, combos_completed, combos_failed, time.time() - t0)
    return 0 if combos_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
