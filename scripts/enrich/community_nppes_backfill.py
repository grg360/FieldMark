"""
FieldMark — NPPES API backfill for Community cohort HCPs (hcps_v2).

Pulls NPPES Registry API data per NPI and writes summary fields to hcps_v2
plus extended detail to hcp_nppes_detail_v2.

Run community_classification.py before this if cohort labels are not set.

Schema source: sql/rebuild/phase1_schema.sql, phase1_addendum_4_schema_reconciliation.sql
(queried via information_schema-equivalent repo definitions; verify live DB before execute).

If columns below are missing in your Supabase project, run the commented DDL
in SCHEMA_DDL_COMMENTS — do not auto-execute from this script.

Examples:
  python community_nppes_backfill.py --dry-run
  python community_nppes_backfill.py --execute
  python community_nppes_backfill.py --execute --limit 100
  python community_nppes_backfill.py --execute --reset-status
"""

from __future__ import annotations

import argparse
import logging
import re
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Optional DDL (run manually in Supabase if columns are absent)
# ---------------------------------------------------------------------------
SCHEMA_DDL_COMMENTS = """
-- hcps_v2 (not in phase1_schema.sql; may exist in production already)
-- ALTER TABLE hcps_v2 ADD COLUMN IF NOT EXISTS nppes_practice_zip text;
-- ALTER TABLE hcps_v2 ADD COLUMN IF NOT EXISTS nppes_enriched_at timestamptz;
-- ALTER TABLE hcps_v2 ADD COLUMN IF NOT EXISTS npi_taxonomy text;

-- hcp_nppes_detail_v2 extensions for full API payload (optional but recommended)
-- ALTER TABLE hcp_nppes_detail_v2 ADD COLUMN IF NOT EXISTS nppes_mailing_address jsonb;
-- ALTER TABLE hcp_nppes_detail_v2 ADD COLUMN IF NOT EXISTS nppes_taxonomies jsonb;
-- ALTER TABLE hcp_nppes_detail_v2 ADD COLUMN IF NOT EXISTS nppes_other_names jsonb;
-- ALTER TABLE hcp_nppes_detail_v2 ADD COLUMN IF NOT EXISTS nppes_identifiers jsonb;
-- ALTER TABLE hcp_nppes_detail_v2 ADD COLUMN IF NOT EXISTS nppes_endpoints jsonb;
-- ALTER TABLE hcp_nppes_detail_v2 ADD COLUMN IF NOT EXISTS raw_api_response jsonb;
"""

NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1&number={npi}"
CURRENT_YEAR = 2026
READ_PAGE_SIZE = 1000
REQUEST_TIMEOUT_SECONDS = 20
THROTTLE_SECONDS = 0.15
PROGRESS_INTERVAL = 1000

logger = logging.getLogger("community_nppes_backfill")


def env(name: str) -> str:
    import os

    v = os.getenv(name)
    if not v:
        raise EnvironmentError(f"Missing env var: {name}")
    return v


def sb() -> Client:
    return create_client(env("SUPABASE_URL"), env("SUPABASE_KEY"))


def norm(v: Any) -> str:
    return " ".join(str(v or "").strip().split())


def normalize_npi(npi: str) -> str:
    return re.sub(r"\D", "", str(npi or "").strip())


def is_valid_npi(npi: str) -> bool:
    digits = normalize_npi(npi)
    return len(digits) == 10 and digits.isdigit()


def fetch_pages(
    client: Client,
    table: str,
    columns: str,
    *,
    order_column: str = "id",
    page_size: int = READ_PAGE_SIZE,
    filters: Optional[List[Tuple[str, str, Any]]] = None,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    last_cursor: Optional[str] = None
    while True:
        q = client.table(table).select(columns).order(order_column).limit(page_size)
        if filters:
            for op, col, val in filters:
                if op == "eq":
                    q = q.eq(col, val)
                elif op == "is":
                    q = q.is_(col, val)
                elif op == "not_is":
                    q = q.not_.is_(col, val)
        if last_cursor is not None:
            q = q.gt(order_column, last_cursor)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        last_cursor = str(batch[-1][order_column])
        if len(batch) < page_size:
            break
    return rows


def load_detail_statuses(client: Client) -> Dict[str, str]:
    rows = fetch_pages(
        client,
        "hcp_nppes_detail_v2",
        "hcp_id,npi_taxonomy_enrichment_status",
        order_column="hcp_id",
    )
    return {
        str(r["hcp_id"]): str(r.get("npi_taxonomy_enrichment_status") or "")
        for r in rows
        if r.get("hcp_id")
    }


def select_community_hcps(
    client: Client,
    *,
    limit: Optional[int],
    reset_status: bool,
) -> List[Dict[str, Any]]:
    print("Loading community HCPs with NPI...")
    all_rows = fetch_pages(
        client,
        "hcps_v2",
        "id,npi_number,nppes_practice_state,nppes_practice_city,nppes_practice_setting",
        order_column="id",
        filters=[("eq", "cohort_classification", "community"), ("not_is", "npi_number", "null")],
    )
    detail_status = load_detail_statuses(client) if reset_status else {}

    selected: List[Dict[str, Any]] = []
    for row in all_rows:
        hid = str(row.get("id") or "")
        if not hid:
            continue
        status = detail_status.get(hid, "")
        has_setting = bool(norm(row.get("nppes_practice_setting")))
        if has_setting and not (reset_status and status in ("not_found", "api_error")):
            continue
        selected.append(row)
        if limit is not None and len(selected) >= limit:
            break

    print(f"  Selected {len(selected):,} of {len(all_rows):,} community HCPs for processing")
    return selected


def read_hcp_ids_file(path: str) -> List[str]:
    """One HCP uuid per line; blanks ignored. Matches the stage-8 affected-set /
    targeted_nppes_enrichment --hcp-ids-file format."""
    ids: List[str] = []
    seen = set()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            s = line.strip()
            if s and s not in seen:
                seen.add(s)
                ids.append(s)
    return ids


def select_hcps_by_ids(client: Client, hcp_ids: List[str]) -> List[Dict[str, Any]]:
    """Select exactly the given HCP ids that carry an NPI — no cohort filter, no
    practice-setting skip. This is a DETAIL FETCH by existing npi_number (writes
    nppes_enumeration_date etc.), NOT a match: an id with a null npi is dropped
    here, never matched. Used to backfill established/rising, which the
    community-scoped selector never reaches."""
    rows: List[Dict[str, Any]] = []
    chunk = 150  # keep the .in_ URL bounded
    for i in range(0, len(hcp_ids), chunk):
        batch = hcp_ids[i : i + chunk]
        resp = (
            client.table("hcps_v2")
            .select("id,npi_number,nppes_practice_state,nppes_practice_city,nppes_practice_setting")
            .in_("id", batch)
            .not_.is_("npi_number", "null")
            .execute()
            .data
            or []
        )
        rows.extend(resp)
    print(f"  Selected {len(rows):,} of {len(hcp_ids):,} requested ids that carry an NPI (detail fetch, no match)")
    return rows


def pick_address(addresses: Any, purpose: str) -> Dict[str, Any]:
    if not isinstance(addresses, list):
        return {}
    purpose_lower = purpose.lower()
    for addr in addresses:
        if isinstance(addr, dict) and str(addr.get("address_purpose") or "").lower() == purpose_lower:
            return addr
    return {}


def format_address_line(addr: Dict[str, Any]) -> Optional[str]:
    if not addr:
        return None
    parts = [norm(addr.get("address_1")), norm(addr.get("address_2"))]
    joined = ", ".join(p for p in parts if p)
    return joined or None


def parse_taxonomies(taxonomies: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not isinstance(taxonomies, list):
        return out
    for t in taxonomies:
        if not isinstance(t, dict):
            continue
        out.append(
            {
                "code": t.get("code"),
                "desc": t.get("desc"),
                "license": t.get("license"),
                "license_state": t.get("state"),
                "primary": t.get("primary"),
                "taxonomy_group": t.get("taxonomy_group"),
            }
        )
    return out


def primary_taxonomy(taxonomies: List[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    if not taxonomies:
        return None, None
    chosen = next((t for t in taxonomies if t.get("primary") is True), taxonomies[0])
    code = str(chosen.get("code") or "").strip() or None
    desc = str(chosen.get("desc") or "").strip() or None
    return code, desc


def parse_enumeration_year(basic: Dict[str, Any]) -> Optional[int]:
    raw = str(basic.get("enumeration_date") or "").strip()
    if len(raw) >= 4 and raw[:4].isdigit():
        return int(raw[:4])
    return None


def derive_practice_setting(
    sole_proprietor: Optional[str],
    organization_npi: Optional[str],
) -> Optional[str]:
    sole = (sole_proprietor or "").strip().upper()
    if sole == "YES":
        return "solo"
    if sole == "NO" or organization_npi:
        return "group"
    return None


def extract_organization_npi(result: Dict[str, Any], taxonomies: List[Dict[str, Any]]) -> Optional[str]:
    enum_type = str(result.get("enumeration_type") or "").strip()
    if enum_type == "NPI-2":
        return str(result.get("number") or "").strip() or None
    for t in taxonomies:
        group = str(t.get("taxonomy_group") or "")
        if "organization" in group.lower():
            # taxonomy_group is descriptive, not an NPI; no org NPI on Type-1 records typically
            break
    return None


def call_nppes_api(client_http: httpx.Client, npi: str) -> Tuple[Optional[Dict[str, Any]], str]:
    url = NPPES_API_URL.format(npi=npi)
    for attempt in (1, 2):
        try:
            resp = client_http.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
            if resp.status_code == 404:
                return None, "not_found"
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict):
                return None, "api_error"
            count = int(data.get("result_count") or 0)
            if count <= 0:
                return None, "not_found"
            results = data.get("results")
            if not isinstance(results, list) or not results:
                return None, "not_found"
            return data, "ok"
        except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.HTTPError) as exc:
            if attempt == 1:
                logger.warning("NPPES API error for %s (%s), retrying in 2s", npi, exc)
                time.sleep(2.0)
                continue
            logger.error("NPPES API failed for %s after retry: %s", npi, exc)
            return None, "api_error"
        except Exception as exc:
            logger.error("Unexpected NPPES error for %s: %s", npi, exc)
            return None, "api_error"
    return None, "api_error"


def parse_nppes_result(
    api_response: Dict[str, Any],
    existing_hcp: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Returns (hcps_v2_update_payload, hcp_nppes_detail_v2_upsert_payload)."""
    result = api_response["results"][0]
    basic = result.get("basic") if isinstance(result.get("basic"), dict) else {}
    addresses = result.get("addresses") or []
    practice = pick_address(addresses, "LOCATION")
    mailing = pick_address(addresses, "MAILING")

    taxonomies = parse_taxonomies(result.get("taxonomies"))
    tax_code, tax_desc = primary_taxonomy(taxonomies)

    enum_year = parse_enumeration_year(basic)
    career_years = max(CURRENT_YEAR - enum_year, 0) if enum_year else None
    sole_raw = str(basic.get("sole_proprietor") or "").strip().upper() or None
    org_npi = extract_organization_npi(result, taxonomies)
    practice_setting = derive_practice_setting(sole_raw, org_npi)

    now_iso = datetime.now(timezone.utc).isoformat()

    def keep_or_new(existing_key: str, new_val: Any) -> Any:
        existing = existing_hcp.get(existing_key)
        if existing is not None and norm(existing):
            return existing
        return new_val

    hcps_update: Dict[str, Any] = {
        "nppes_practice_state": keep_or_new("nppes_practice_state", practice.get("state")),
        "nppes_practice_city": keep_or_new("nppes_practice_city", practice.get("city")),
        "nppes_practice_setting": practice_setting,
        "nppes_career_stage_years": career_years,
        "npi_specialty": tax_desc,
        "npi_taxonomy": tax_code,
        "nppes_enriched_at": now_iso,
    }

    # nppes_practice_zip on hcps_v2 — column may not exist; omit if write fails in execute path
    zip_code = practice.get("postal_code")
    if zip_code:
        hcps_update["nppes_practice_zip"] = keep_or_new("nppes_practice_zip", zip_code)

    other_names = result.get("other_names")
    identifiers = result.get("identifiers")
    endpoints = result.get("endpoints")

    detail: Dict[str, Any] = {
        "hcp_id": str(existing_hcp["id"]),
        "nppes_enumeration_date": basic.get("enumeration_date"),
        "nppes_is_sole_proprietor": sole_raw == "YES" if sole_raw else None,
        "nppes_practice_address": format_address_line(practice),
        "nppes_practice_zip": practice.get("postal_code"),
        "nppes_organization_name": norm(basic.get("organization_name")) or None,
        "nppes_organization_npi": org_npi,
        "nppes_career_stage": None,
        "npi_taxonomy": tax_code,
        "npi_taxonomy_enrichment_status": "enriched",
        "npi_taxonomy_enriched_at": now_iso,
        "nppes_enriched_at": now_iso,
    }

    # JSON sidecar fields — only included if columns exist in DB (see SCHEMA_DDL_COMMENTS)
    optional_json = {
        "nppes_mailing_address": mailing or None,
        "nppes_taxonomies": taxonomies,
        "nppes_other_names": other_names,
        "nppes_identifiers": identifiers,
        "nppes_endpoints": endpoints,
        "raw_api_response": api_response,
    }
    detail.update(optional_json)

    return hcps_update, detail


def write_not_found(client: Client, hcp_id: str, npi: str, dry_run: bool) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "hcp_id": hcp_id,
        "npi_taxonomy_enrichment_status": "not_found",
        "npi_taxonomy_enriched_at": now_iso,
        "nppes_enriched_at": now_iso,
    }
    if dry_run:
        return
    resp = client.table("hcp_nppes_detail_v2").upsert(payload, on_conflict="hcp_id").execute()
    if not resp.data:
        raise RuntimeError(f"not_found upsert returned empty data for hcp_id={hcp_id} npi={npi}")


def write_error_status(client: Client, hcp_id: str, dry_run: bool) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "hcp_id": hcp_id,
        "npi_taxonomy_enrichment_status": "api_error",
        "npi_taxonomy_enriched_at": now_iso,
    }
    if dry_run:
        return
    client.table("hcp_nppes_detail_v2").upsert(payload, on_conflict="hcp_id").execute()


def apply_writes(
    client: Client,
    hcp_id: str,
    hcps_update: Dict[str, Any],
    detail: Dict[str, Any],
    *,
    dry_run: bool,
) -> None:
    if dry_run:
        return

    optional_hcps_keys = ("nppes_practice_zip", "nppes_enriched_at", "npi_taxonomy")
    hcps_payload = dict(hcps_update)
    hcps_fallback = {k: v for k, v in hcps_payload.items() if k not in optional_hcps_keys}
    for attempt_payload in (hcps_payload, hcps_fallback):
        try:
            resp = client.table("hcps_v2").update(attempt_payload).eq("id", hcp_id).execute()
            if not resp.data:
                raise RuntimeError(f"hcps_v2 update returned empty data for {hcp_id}")
            break
        except Exception as exc:
            if attempt_payload is hcps_payload and "column" in str(exc).lower():
                continue
            raise

    # detail — try full payload, then scalar-only fallback
    scalar_detail = {
        k: detail[k]
        for k in detail
        if k
        in (
            "hcp_id",
            "nppes_enumeration_date",
            "nppes_is_sole_proprietor",
            "nppes_practice_address",
            "nppes_practice_zip",
            "nppes_organization_name",
            "nppes_organization_npi",
            "nppes_career_stage",
            "npi_taxonomy",
            "npi_taxonomy_enrichment_status",
            "npi_taxonomy_enriched_at",
            "nppes_enriched_at",
        )
    }
    for attempt_detail in (detail, scalar_detail):
        try:
            resp = client.table("hcp_nppes_detail_v2").upsert(attempt_detail, on_conflict="hcp_id").execute()
            if not resp.data:
                raise RuntimeError(f"hcp_nppes_detail_v2 upsert returned empty data for {hcp_id}")
            return
        except Exception as exc:
            if attempt_detail is detail and "column" in str(exc).lower():
                continue
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description="NPPES API backfill for community HCPs")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--execute", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N HCPs")
    parser.add_argument(
        "--reset-status",
        action="store_true",
        help="Re-process rows previously marked not_found or api_error in hcp_nppes_detail_v2",
    )
    parser.add_argument(
        "--hcp-ids-file",
        type=str,
        default=None,
        help=(
            "Path to a file of HCP uuids (one per line). When set, process exactly "
            "those ids that carry an NPI — bypassing the community cohort filter and "
            "the practice-setting skip. Used to backfill nppes_enumeration_date for "
            "established/rising, which the community selector never reaches."
        ),
    )
    args = parser.parse_args()
    dry_run = bool(args.dry_run)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    load_dotenv()
    client = sb()

    if args.hcp_ids_file:
        requested = read_hcp_ids_file(args.hcp_ids_file)
        print(f"  Read {len(requested):,} ids from {args.hcp_ids_file}")
        hcps = select_hcps_by_ids(client, requested)
        if args.limit:
            hcps = hcps[: args.limit]
    else:
        hcps = select_community_hcps(client, limit=args.limit, reset_status=bool(args.reset_status))
    started = time.time()

    counts = Counter(success=0, not_found=0, error=0, skipped=0)
    state_dist: Counter[str] = Counter()
    specialty_dist: Counter[str] = Counter()

    with httpx.Client() as http_client:
        for idx, hcp in enumerate(
            tqdm(hcps, desc="NPPES backfill", unit="hcp"),
            start=1,
        ):
            hcp_id = str(hcp["id"])
            raw_npi = str(hcp.get("npi_number") or "")
            try:
                if not is_valid_npi(raw_npi):
                    counts["error"] += 1
                    write_error_status(client, hcp_id, dry_run)
                    continue

                npi = normalize_npi(raw_npi)
                api_data, status = call_nppes_api(http_client, npi)
                time.sleep(THROTTLE_SECONDS)

                if status == "not_found" or api_data is None:
                    if status == "not_found":
                        counts["not_found"] += 1
                    else:
                        counts["error"] += 1
                    if status == "not_found":
                        write_not_found(client, hcp_id, npi, dry_run)
                    else:
                        write_error_status(client, hcp_id, dry_run)
                    continue

                hcps_update, detail = parse_nppes_result(api_data, hcp)
                apply_writes(client, hcp_id, hcps_update, detail, dry_run=dry_run)
                counts["success"] += 1

                setting = hcps_update.get("nppes_practice_setting")
                if setting:
                    state = str(hcps_update.get("nppes_practice_state") or "UNKNOWN")
                    state_dist[state] += 1
                spec = hcps_update.get("npi_specialty")
                if spec:
                    specialty_dist[str(spec)] += 1

            except Exception as exc:
                counts["error"] += 1
                logger.exception("Failed hcp_id=%s: %s", hcp_id, exc)
                try:
                    write_error_status(client, hcp_id, dry_run)
                except Exception:
                    pass

            if idx % PROGRESS_INTERVAL == 0:
                elapsed = time.time() - started
                print(
                    f"\n[progress {idx:,}/{len(hcps):,}] "
                    f"success={counts['success']:,} not_found={counts['not_found']:,} "
                    f"errors={counts['error']:,} elapsed={elapsed:.0f}s"
                )

    elapsed = time.time() - started
    print("\n=== Community NPPES backfill complete ===")
    print(f"Mode: {'DRY RUN' if dry_run else 'EXECUTE'}")
    print(f"Total community HCPs processed: {len(hcps):,}")
    print(f"Successful NPPES matches: {counts['success']:,}")
    print(f"Not found: {counts['not_found']:,}")
    print(f"Errors: {counts['error']:,}")
    print(f"Elapsed: {elapsed:.1f}s")

    if state_dist:
        print("\nPer-state distribution (newly set practice_setting):")
        for state, cnt in state_dist.most_common(20):
            print(f"  {state}: {cnt:,}")

    if specialty_dist:
        print("\nPer-specialty distribution (top 20):")
        for spec, cnt in specialty_dist.most_common(20):
            print(f"  {spec}: {cnt:,}")


if __name__ == "__main__":
    main()
