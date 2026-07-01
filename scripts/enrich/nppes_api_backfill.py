"""
Backfill NPPES taxonomy data via the public NPI Registry API for HCPs with NPI but no taxonomy.

Usage:
  python nppes_api_backfill.py --dry-run --limit 10
  python nppes_api_backfill.py --limit 10
  python nppes_api_backfill.py --reset-status
  python nppes_api_backfill.py --rate-limit 0.2
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from supabase import Client, create_client
from tqdm import tqdm


def get_table_name(base_name: str, target_version: str) -> str:
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/"
DEFAULT_RATE_LIMIT_SECONDS = 0.2
PAGE_SIZE = 1000
PROGRESS_INTERVAL = 500
REQUEST_TIMEOUT_SECONDS = 10
MAX_RETRIES = 3

logger = logging.getLogger("nppes_api_backfill")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill hcps.npi_taxonomy via NPPES Registry API"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Fetch and parse only; do not write to Supabase",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most this many HCP rows (for testing)",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=DEFAULT_RATE_LIMIT_SECONDS,
        help="Seconds to sleep after each API call",
    )
    parser.add_argument(
        "--reset-status",
        action="store_true",
        default=False,
        help="Re-process rows with status api_error or no_data (skip enriched)",
    )
    parser.add_argument(
        "--target-version",
        choices=["v1", "v2"],
        default="v1",
        help="Schema version. v1=legacy tables, v2=rebuild tables.",
    )
    return parser.parse_args()


def is_valid_npi_format(npi: str) -> bool:
    digits = re.sub(r"\D", "", str(npi or "").strip())
    return len(digits) == 10 and digits.isdigit()


def normalize_npi(npi: str) -> str:
    return re.sub(r"\D", "", str(npi or "").strip())


def _row_needs_enrichment(
    npi_taxonomy: Optional[str],
    enrichment_status: Optional[str],
    reset_status: bool,
) -> bool:
    if reset_status:
        return npi_taxonomy is None or enrichment_status in ("api_error", "no_data")
    return npi_taxonomy is None


def fetch_hcps_needing_enrichment(
    client: Client,
    *,
    reset_status: bool,
    limit: Optional[int],
    target_version: str = "v1",
) -> List[Dict[str, Any]]:
    """Paginate hcps with NPI; default = missing taxonomy only."""
    if target_version == "v1":
        rows: List[Dict[str, Any]] = []
        offset = 0
        page_size = PAGE_SIZE

        while True:
            if limit is not None and len(rows) >= limit:
                break
            try:
                q = (
                    client.table("hcps")
                    .select("id,npi_number,first_name,last_name,npi_taxonomy,npi_taxonomy_enrichment_status")
                    .not_.is_("npi_number", "null")
                    .order("id")
                    .range(offset, offset + page_size - 1)
                )
                if reset_status:
                    q = q.or_(
                        "npi_taxonomy.is.null,"
                        "npi_taxonomy_enrichment_status.in.(api_error,no_data)"
                    )
                else:
                    q = q.is_("npi_taxonomy", "null")
                batch = q.execute().data or []
            except Exception as exc:
                logger.exception("Failed to fetch hcps page at offset %s: %s", offset, exc)
                raise

            if not batch:
                break

            for row in batch:
                if limit is not None and len(rows) >= limit:
                    break
                rows.append(row)

            if len(batch) < page_size:
                break
            offset += page_size

        return rows

    hcps_table = get_table_name("hcps", target_version)
    detail_table = get_table_name("hcp_nppes_detail", target_version)
    page_size = PAGE_SIZE

    all_hcps: List[Dict[str, Any]] = []
    offset = 0
    while True:
        try:
            batch = (
                client.table(hcps_table)
                .select("id,npi_number,first_name,last_name")
                .not_.is_("npi_number", "null")
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            logger.exception("Failed to fetch %s page at offset %s: %s", hcps_table, offset, exc)
            raise
        if not batch:
            break
        all_hcps.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    detail_by_hcp: Dict[str, Dict[str, Any]] = {}
    offset = 0
    while True:
        try:
            batch = (
                client.table(detail_table)
                .select("hcp_id,npi_taxonomy,npi_taxonomy_enrichment_status")
                .order("hcp_id")
                .range(offset, offset + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            logger.exception("Failed to fetch %s page at offset %s: %s", detail_table, offset, exc)
            raise
        if not batch:
            break
        for row in batch:
            hcp_id = row.get("hcp_id")
            if not hcp_id:
                continue
            detail_by_hcp[str(hcp_id)] = {
                "npi_taxonomy": row.get("npi_taxonomy"),
                "npi_taxonomy_enrichment_status": row.get("npi_taxonomy_enrichment_status"),
            }
        if len(batch) < page_size:
            break
        offset += page_size

    rows: List[Dict[str, Any]] = []
    for hcp in all_hcps:
        if limit is not None and len(rows) >= limit:
            break
        hcp_id = str(hcp.get("id") or "")
        detail = detail_by_hcp.get(hcp_id, {})
        npi_taxonomy = detail.get("npi_taxonomy")
        enrichment_status = detail.get("npi_taxonomy_enrichment_status")
        if not _row_needs_enrichment(npi_taxonomy, enrichment_status, reset_status):
            continue
        rows.append(
            {
                **hcp,
                "npi_taxonomy": npi_taxonomy,
                "npi_taxonomy_enrichment_status": enrichment_status,
            }
        )

    return rows


def call_nppes_api(npi: str) -> Optional[Dict[str, Any]]:
    url = f"{NPPES_API_URL}?number={npi}&version=2.1"
    backoff = 1.0

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
            if resp.status_code >= 500:
                raise requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict):
                logger.error("NPPES API returned non-dict JSON for NPI %s", npi)
                return None
            return data
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as exc:
            if attempt < MAX_RETRIES:
                logger.warning(
                    "NPPES API attempt %s/%s for NPI %s failed: %s; retrying in %.1fs",
                    attempt,
                    MAX_RETRIES,
                    npi,
                    exc,
                    backoff,
                )
                time.sleep(backoff)
                backoff *= 2
            else:
                logger.error(
                    "NPPES API failed after %s attempts for NPI %s: %s",
                    MAX_RETRIES,
                    npi,
                    exc,
                )
                return None
        except Exception as exc:
            logger.error("NPPES API unexpected error for NPI %s: %s", npi, exc)
            return None

    return None


def parse_primary_taxonomy(api_response: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    try:
        result_count = int(api_response.get("result_count") or 0)
    except (TypeError, ValueError):
        result_count = 0

    if result_count <= 0:
        return None, None

    results = api_response.get("results")
    if not isinstance(results, list) or not results:
        return None, None

    first = results[0]
    if not isinstance(first, dict):
        return None, None

    taxonomies = first.get("taxonomies")
    if not isinstance(taxonomies, list) or not taxonomies:
        return None, None

    chosen: Optional[Dict[str, Any]] = None
    for tax in taxonomies:
        if isinstance(tax, dict) and tax.get("primary") is True:
            chosen = tax
            break
    if chosen is None:
        chosen = taxonomies[0] if isinstance(taxonomies[0], dict) else None

    if not chosen:
        return None, None

    code = str(chosen.get("code") or "").strip() or None
    desc = str(chosen.get("desc") or "").strip() or None
    return code, desc


def write_update(
    client: Client,
    hcp_id: str,
    taxonomy_code: Optional[str],
    specialty_desc: Optional[str],
    status: str,
    target_version: str = "v1",
) -> bool:
    now_iso = datetime.now(timezone.utc).isoformat()
    if target_version == "v1":
        if status == "enriched":
            payload = {
                "npi_taxonomy": taxonomy_code,
                "npi_specialty": specialty_desc,
                "npi_taxonomy_enrichment_status": status,
                "npi_taxonomy_enriched_at": now_iso,
            }
        else:
            payload = {
                "npi_taxonomy": None,
                "npi_specialty": None,
                "npi_taxonomy_enrichment_status": status,
                "npi_taxonomy_enriched_at": now_iso,
            }

        try:
            client.table("hcps").update(payload).eq("id", hcp_id).execute()
            return True
        except Exception as exc:
            logger.error("Supabase update failed for hcp_id=%s status=%s: %s", hcp_id, status, exc)
            return False

    hcps_table = get_table_name("hcps", target_version)
    detail_table = get_table_name("hcp_nppes_detail", target_version)
    if status == "enriched":
        detail_taxonomy = taxonomy_code
    else:
        detail_taxonomy = None
        specialty_desc = None

    try:
        response = client.table(hcps_table).update({"npi_specialty": specialty_desc}).eq("id", hcp_id).execute()
        if not response.data:
            logger.warning(
                "Supabase %s npi_specialty update returned empty data for hcp_id=%s status=%s - possible silent failure",
                hcps_table,
                hcp_id,
                status,
            )
            return False
    except Exception as exc:
        logger.error(
            "Supabase %s npi_specialty update failed for hcp_id=%s status=%s: %s",
            hcps_table,
            hcp_id,
            status,
            exc,
        )
        return False

    try:
        detail_response = client.table(detail_table).upsert(
            {
                "hcp_id": hcp_id,
                "npi_taxonomy": detail_taxonomy,
                "npi_taxonomy_enrichment_status": status,
                "npi_taxonomy_enriched_at": now_iso,
            },
            on_conflict="hcp_id",
        ).execute()
        if not detail_response.data:
            logger.warning(
                "Supabase %s upsert returned empty data for hcp_id=%s status=%s - possible silent failure",
                detail_table,
                hcp_id,
                status,
            )
            return False
    except Exception as exc:
        logger.error(
            "Supabase %s upsert failed for hcp_id=%s status=%s: %s",
            detail_table,
            hcp_id,
            status,
            exc,
        )
        return False

    return True


def enrich_hcp_taxonomy(
    client: Client,
    hcp: Dict[str, Any],
    rate_limit_seconds: float,
    dry_run: bool,
    target_version: str = "v1",
) -> str:
    hcp_id = str(hcp.get("id") or "")
    raw_npi = str(hcp.get("npi_number") or "").strip()
    first = hcp.get("first_name") or ""
    last = hcp.get("last_name") or ""
    api_called = False

    try:
        if not is_valid_npi_format(raw_npi):
            status = "invalid_npi"
            if dry_run:
                logger.info(
                    "[dry-run] hcp_id=%s %s %s npi=%r -> would set status=%s",
                    hcp_id,
                    first,
                    last,
                    raw_npi,
                    status,
                )
            else:
                if not write_update(client, hcp_id, None, None, status, target_version=target_version):
                    return "api_error"
            return status

        npi = normalize_npi(raw_npi)
        api_called = True
        data = call_nppes_api(npi)

        if data is None:
            status = "api_error"
            if dry_run:
                logger.info(
                    "[dry-run] hcp_id=%s %s %s npi=%s -> would set status=%s",
                    hcp_id,
                    first,
                    last,
                    npi,
                    status,
                )
            else:
                if not write_update(client, hcp_id, None, None, status, target_version=target_version):
                    return "api_error"
            return status

        try:
            result_count = int(data.get("result_count") or 0)
        except (TypeError, ValueError):
            result_count = 0

        if result_count <= 0:
            status = "invalid_npi"
            if dry_run:
                logger.info(
                    "[dry-run] hcp_id=%s %s %s npi=%s -> would set status=%s (0 results)",
                    hcp_id,
                    first,
                    last,
                    npi,
                    status,
                )
            else:
                if not write_update(client, hcp_id, None, None, status, target_version=target_version):
                    return "api_error"
            return status

        code, desc = parse_primary_taxonomy(data)
        if not code and not desc:
            status = "no_data"
            if dry_run:
                logger.info(
                    "[dry-run] hcp_id=%s %s %s npi=%s -> would set status=%s",
                    hcp_id,
                    first,
                    last,
                    npi,
                    status,
                )
            else:
                if not write_update(client, hcp_id, None, None, status, target_version=target_version):
                    return "api_error"
            return status

        status = "enriched"
        if dry_run:
            logger.info(
                "[dry-run] hcp_id=%s %s %s npi=%s -> would set taxonomy=%r specialty=%r status=%s",
                hcp_id,
                first,
                last,
                npi,
                code,
                desc,
                status,
            )
        else:
            if not write_update(client, hcp_id, code, desc, status, target_version=target_version):
                return "api_error"
        return status

    except Exception as exc:
        logger.exception(
            "Unexpected error enriching hcp_id=%s %s %s: %s",
            hcp_id,
            first,
            last,
            exc,
        )
        if not dry_run:
            if write_update(client, hcp_id, None, None, "api_error", target_version=target_version):
                pass
        return "api_error"
    finally:
        if api_called:
            time.sleep(rate_limit_seconds)


def print_summary(counts: Dict[str, int], total: int, elapsed_seconds: float) -> None:
    print("\n" + "=" * 60)
    print("NPPES API TAXONOMY BACKFILL — SUMMARY")
    print("=" * 60)
    print(f"Total processed: {total:,}")
    print(f"Runtime: {elapsed_seconds:.1f}s ({elapsed_seconds / 60.0:.1f} min)")
    print("\nCounts by status:")
    for key in ("enriched", "no_data", "api_error", "invalid_npi"):
        n = counts.get(key, 0)
        pct = (100.0 * n / total) if total else 0.0
        print(f"  {key}: {n:,} ({pct:.1f}%)")
    print(f"\n{counts.get('enriched', 0):,} HCPs successfully enriched with taxonomy data")
    print("=" * 60)


def main() -> None:
    args = parse_args()
    load_dotenv()
    client = init_supabase()

    t0 = time.perf_counter()

    hcps_to_process = fetch_hcps_needing_enrichment(
        client,
        reset_status=args.reset_status,
        limit=args.limit,
        target_version=args.target_version,
    )

    logger.info("Found %s HCPs needing taxonomy enrichment", len(hcps_to_process))
    if args.dry_run:
        logger.info("DRY RUN — no Supabase writes")
    if args.reset_status:
        logger.info("RESET STATUS — including api_error and no_data rows")
    logger.info("Rate limit: %.2fs between API calls", args.rate_limit)

    counts: Dict[str, int] = {
        "enriched": 0,
        "no_data": 0,
        "api_error": 0,
        "invalid_npi": 0,
    }

    for idx, hcp in enumerate(tqdm(hcps_to_process, desc="backfilling NPPES taxonomy", unit="hcp")):
        try:
            result = enrich_hcp_taxonomy(
                client, hcp, args.rate_limit, args.dry_run, target_version=args.target_version
            )
        except Exception as exc:
            logger.exception(
                "Unhandled error on row %s; continuing: %s",
                hcp.get("id"),
                exc,
            )
            result = "api_error"
        counts[result] = counts.get(result, 0) + 1

        if (idx + 1) % PROGRESS_INTERVAL == 0:
            logger.info(
                "Processed %s/%s — %s",
                idx + 1,
                len(hcps_to_process),
                counts,
            )

    elapsed = time.perf_counter() - t0
    print_summary(counts, len(hcps_to_process), elapsed)


if __name__ == "__main__":
    main()
