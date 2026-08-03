"""
FieldMark — hcp_hcpcs_detail top-up for newly-NPI'd HCPs.

hcp_hcpcs_detail was loaded 2026-07-30 by joining the local CMS Medicare
provider-service parquets (2021-2023) to hcps_v2 BY NPI. Any HCP that gains an
NPI after a load (targeted enrichment, Medicare-crosswalk applies, resolver
writes, stub merges) has claims sitting in the parquets and no rows in the
table. This script closes that gap and is the standing companion step to any
NPI apply.

DESIGN: the target set is DERIVED, never passed — an anti-join of hcps_v2
(npi_number NOT NULL) against SELECT DISTINCT npi FROM hcp_hcpcs_detail. That
makes the script fully idempotent and self-healing: NPIs with no claims are
re-probed for free (duckdb hash join, seconds), NPIs already loaded are never
touched, and a no-op run inserts nothing. Inserts use ON CONFLICT DO NOTHING
on the PK (hcp_id, program_year, hcpcs_code, place_of_service); only base
columns are written — total_paid_est and source are GENERATED.

Registered as non-blocking reingest stage 12 (stage-11 mould): failure WARNs,
never gates the cycle. Logs to pipeline_runs as 'hcpcs_detail_topup'.

Examples:
  python scripts/ingest/hcpcs_detail_topup.py --dry-run
  python scripts/ingest/hcpcs_detail_topup.py --execute
  python scripts/ingest/hcpcs_detail_topup.py --execute --triggered-by reingest_cycle
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import duckdb
import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MEDICARE_DIR_DEFAULT = r"C:\Users\garre\Desktop\Fieldmark\Medicare"
PARQUET_YEARS = (2021, 2022, 2023)
INSERT_BATCH = 1000

INSERT_SQL = """
    INSERT INTO hcp_hcpcs_detail
      (hcp_id, npi, program_year, hcpcs_code, hcpcs_desc, hcpcs_drug_indicator,
       place_of_service, tot_benes, tot_srvcs, avg_mdcr_pymt_per_srvc)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (hcp_id, program_year, hcpcs_code, place_of_service) DO NOTHING
"""


def get_db_url() -> str:
    v = os.getenv("DATABASE_URL")
    if not v:
        raise EnvironmentError("Missing required environment variable: DATABASE_URL")
    return v


def fetch_target_npis(cur) -> Dict[str, str]:
    """npi -> hcp_id for every NPI'd HCP with zero hcp_hcpcs_detail rows.

    DERIVED target set (never passed): idempotent and self-healing. NPIs with
    no Medicare claims land here every run and cost only a hash-join probe.
    """
    cur.execute(
        """
        SELECT btrim(h.npi_number), h.id::text
        FROM hcps_v2 h
        WHERE h.npi_number IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM hcp_hcpcs_detail d WHERE d.npi = h.npi_number)
        """
    )
    return {npi: hid for npi, hid in cur.fetchall() if npi}


def fetch_claim_rows(medicare_dir: str, npis: List[str]) -> List[Tuple[Any, ...]]:
    """All parquet claim rows for the target NPIs, in hcp_hcpcs_detail base-column
    order (minus hcp_id). Defensive trim/upper on codes matches the 2026-07-30
    load (verified 0 rows altered there)."""
    paths = []
    for y in PARQUET_YEARS:
        p = Path(medicare_dir) / f"medicare_provider_service_{y}.parquet"
        if not p.exists():
            raise FileNotFoundError(f"Missing parquet: {p}")
        paths.append(str(p))

    con = duckdb.connect()
    con.execute("CREATE TEMP TABLE target_npis (npi VARCHAR)")
    con.executemany("INSERT INTO target_npis VALUES (?)", [(n,) for n in npis])
    union = " UNION ALL ".join(f"SELECT * FROM '{p}'" for p in paths)
    rows = con.execute(
        f"""
        SELECT m.npi,
               m.program_year,
               upper(trim(m.hcpcs_code))       AS hcpcs_code,
               m.hcpcs_description,
               m.hcpcs_drug_indicator,
               upper(trim(m.place_of_service)) AS place_of_service,
               m.total_beneficiaries,
               m.total_services,
               m.avg_medicare_payment
        FROM ({union}) m
        JOIN target_npis t ON t.npi = m.npi
        """
    ).fetchall()
    con.close()
    return rows


def log_pipeline_run(
    cur,
    run_id: str,
    started_at: datetime,
    status: str,
    rows_processed: int,
    rows_succeeded: int,
    metrics: Dict[str, Any],
    triggered_by: str,
    error_message: str | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO pipeline_runs
          (id, pipeline_name, started_at, completed_at, status,
           rows_processed, rows_succeeded, rows_flagged, rows_failed,
           metrics, error_message, triggered_by)
        VALUES (%s, 'hcpcs_detail_topup', %s, now(), %s, %s, %s, 0, 0, %s, %s, %s)
        """,
        (run_id, started_at, status, rows_processed, rows_succeeded,
         json.dumps(metrics), error_message, triggered_by),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Top up hcp_hcpcs_detail for newly-NPI'd HCPs")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Report what would be inserted; no writes.")
    mode.add_argument("--execute", action="store_true", help="Insert missing claim rows and log to pipeline_runs.")
    parser.add_argument("--medicare-dir", default=MEDICARE_DIR_DEFAULT,
                        help="Directory holding medicare_provider_service_<year>.parquet")
    parser.add_argument("--triggered-by", default="manual",
                        help="pipeline_runs.triggered_by label (reingest cycle passes 'reingest_cycle').")
    args = parser.parse_args()
    dry_run = bool(args.dry_run)

    started_at = datetime.now(timezone.utc)
    run_id = str(uuid.uuid4())

    with psycopg.connect(get_db_url()) as conn:
        with conn.cursor() as cur:
            targets = fetch_target_npis(cur)
        print(f"[TARGET] {len(targets):,} NPI'd HCPs with no hcp_hcpcs_detail rows (derived anti-join)")

        if not targets:
            print("[NOOP] nothing to probe.")
            if not dry_run:
                with conn.cursor() as cur:
                    log_pipeline_run(cur, run_id, started_at, "success", 0, 0,
                                     {"npis_probed": 0, "npis_with_claims": 0, "dry_run": False},
                                     args.triggered_by)
                conn.commit()
            return 0

        try:
            claim_rows = fetch_claim_rows(args.medicare_dir, list(targets.keys()))
        except Exception as exc:
            if not dry_run:
                with conn.cursor() as cur:
                    log_pipeline_run(cur, run_id, started_at, "failed", 0, 0,
                                     {"npis_probed": len(targets), "dry_run": False},
                                     args.triggered_by, error_message=str(exc))
                conn.commit()
            raise

        npis_with_claims = len({r[0] for r in claim_rows})
        by_year: Dict[int, int] = {}
        for r in claim_rows:
            by_year[int(r[1])] = by_year.get(int(r[1]), 0) + 1
        print(f"[PROBE] {npis_with_claims:,} of {len(targets):,} target NPIs have parquet claims; "
              f"{len(claim_rows):,} rows ({', '.join(f'{y}: {n:,}' for y, n in sorted(by_year.items()))})")

        if dry_run:
            print(f"[DRY RUN] would insert {len(claim_rows):,} rows (ON CONFLICT DO NOTHING). No writes.")
            return 0

        inserted = 0
        with conn.cursor() as cur:
            batch: List[Tuple[Any, ...]] = []
            for npi, year, code, desc, drug_ind, pos, benes, srvcs, avg_pymt in claim_rows:
                batch.append((targets[npi], npi, year, code, desc, drug_ind, pos, benes, srvcs, avg_pymt))
                if len(batch) >= INSERT_BATCH:
                    cur.executemany(INSERT_SQL, batch)
                    inserted += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
                    batch = []
            if batch:
                cur.executemany(INSERT_SQL, batch)
                inserted += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0

            log_pipeline_run(
                cur, run_id, started_at, "success",
                rows_processed=len(claim_rows), rows_succeeded=inserted,
                metrics={
                    "npis_probed": len(targets),
                    "npis_with_claims": npis_with_claims,
                    "rows_by_year": {str(k): v for k, v in sorted(by_year.items())},
                    "medicare_dir": str(args.medicare_dir),
                    "dry_run": False,
                },
                triggered_by=args.triggered_by,
            )
        conn.commit()
        print(f"[DONE] inserted {inserted:,} of {len(claim_rows):,} candidate rows "
              f"(difference = already present, skipped by ON CONFLICT). pipeline_runs id={run_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
