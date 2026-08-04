"""
FieldMark — backfill hcp_hcpcs_detail.total_bene_day_services from CMS parquets.

The 2026-07-30 load populated hcp_hcpcs_detail without total_bene_day_services;
a later backfill attempt wrote nothing (verified 2026-08-04: with_bds = 0 in all
three program years). This script populates the column from the local Medicare
provider-service parquets (2021-2023), drug rows only.

DESIGN
  - Source filtered to hcpcs_drug_indicator = 'Y'.
  - Match key is npi + program_year + hcpcs_code + place_of_service — all four.
    A provider can hold both 'F' and 'O' rows for the same drug-year; dropping
    place_of_service would smear one value across both.
  - npi is TEXT in hcp_hcpcs_detail. The parquet npi dtype is printed after
    read and the column is CAST to VARCHAR in duckdb before anything is
    staged for writing; a silent int/text mismatch would match zero rows and
    look like success.
  - Where source total_bene_day_services > total_services (CMS counting is
    inconsistent on a handful of steroid/procedural codes), NULL is written
    instead — handled at read time so the bad value never reaches the DB.
  - Writes are UPDATE ... FROM (VALUES ...) chunks of CHUNK_SIZE=100, one
    commit per chunk. Pure single-column UPDATE with deterministic values →
    idempotent: a partial run leaves committed chunks in place and a re-run
    rewrites the same values. Safe to re-run at any point.
  - Success is confirmed by re-reading the database (join source keys against
    the table and compare values), never inferred from batch/rowcount alone.
    Exits non-zero if confirmed-written is zero.

Examples:
  python scripts/ingest/backfill_bene_day_services.py --dry-run
  python scripts/ingest/backfill_bene_day_services.py --execute
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, List, Sequence, Tuple

import duckdb
import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MEDICARE_DIR_DEFAULT = r"C:\Users\garre\Desktop\Fieldmark\Medicare"
PARQUET_YEARS = (2021, 2022, 2023)
CHUNK_SIZE = 100  # PostgREST caps at 1000 and short chunks are the house rule

UPDATE_SQL_TEMPLATE = """
    UPDATE hcp_hcpcs_detail AS d
    SET total_bene_day_services = v.bds
    FROM (VALUES {values}) AS v(npi, program_year, hcpcs_code, place_of_service, bds)
    WHERE d.npi = v.npi
      AND d.program_year = v.program_year
      AND d.hcpcs_code = v.hcpcs_code
      AND d.place_of_service = v.place_of_service
"""
VALUES_ROW = "(%s::text, %s::int, %s::text, %s::text, %s::int)"


def get_db_url() -> str:
    v = os.getenv("DATABASE_URL")
    if not v:
        raise EnvironmentError("Missing required environment variable: DATABASE_URL")
    return v


def read_source_rows(medicare_dir: str) -> List[Tuple[Any, ...]]:
    """Drug rows from the three parquets with the violation rule applied at
    read time. Returns (npi, program_year, hcpcs_code, place_of_service, bds)
    with npi cast to VARCHAR and codes upper/trimmed to match the loader.
    Prints the read/filter/null funnel as it goes."""
    paths = []
    for y in PARQUET_YEARS:
        p = Path(medicare_dir) / f"medicare_provider_service_{y}.parquet"
        if not p.exists():
            raise FileNotFoundError(f"Missing parquet: {p}")
        paths.append(str(p))

    con = duckdb.connect()
    union = " UNION ALL ".join(f"SELECT * FROM '{p}'" for p in paths)

    # ---- TYPE CHECK BEFORE WRITING: what does duckdb say npi is? ----
    npi_type = next(
        r[1] for r in con.execute(f"DESCRIBE SELECT npi FROM ({union}) LIMIT 1").fetchall()
    )
    print(f"[TYPE ] parquet npi dtype per duckdb: {npi_type} "
          f"(target hcp_hcpcs_detail.npi is text; casting to VARCHAR explicitly)")

    for y in PARQUET_YEARS:
        total, drugs = con.execute(
            f"""
            SELECT count(*),
                   count(*) FILTER (WHERE hcpcs_drug_indicator = 'Y')
            FROM '{Path(medicare_dir) / f"medicare_provider_service_{y}.parquet"}'
            """
        ).fetchone()
        print(f"[READ ] {y}: {total:,} parquet rows, {drugs:,} after drug filter")

    nulled, src_null = con.execute(
        f"""
        SELECT count(*) FILTER (WHERE total_bene_day_services > total_services),
               count(*) FILTER (WHERE total_bene_day_services IS NULL)
        FROM ({union}) WHERE hcpcs_drug_indicator = 'Y'
        """
    ).fetchone()
    print(f"[NULL ] {nulled:,} drug rows nulled by violation rule (bds > total_services); "
          f"{src_null:,} already NULL in source")

    rows = con.execute(
        f"""
        SELECT CAST(npi AS VARCHAR)             AS npi,
               CAST(program_year AS INTEGER)    AS program_year,
               upper(trim(hcpcs_code))          AS hcpcs_code,
               upper(trim(place_of_service))    AS place_of_service,
               CASE WHEN total_bene_day_services > total_services THEN NULL
                    ELSE CAST(total_bene_day_services AS INTEGER) END AS bds
        FROM ({union})
        WHERE hcpcs_drug_indicator = 'Y'
        QUALIFY row_number() OVER (
            PARTITION BY npi, program_year, upper(trim(hcpcs_code)),
                         upper(trim(place_of_service))
            ORDER BY total_services DESC NULLS LAST
        ) = 1
        """
    ).fetchall()
    dup_dropped = con.execute(
        f"SELECT count(*) FROM ({union}) WHERE hcpcs_drug_indicator = 'Y'"
    ).fetchone()[0] - len(rows)
    if dup_dropped:
        print(f"[WARN ] {dup_dropped:,} duplicate source rows on the 4-part key "
              f"dropped (kept highest total_services)")
    con.close()

    if rows and not isinstance(rows[0][0], str):
        raise TypeError(f"npi came back as {type(rows[0][0]).__name__}, not str — "
                        f"refusing to write; the join would silently match zero rows")
    return rows


def write_chunks(conn, rows: Sequence[Tuple[Any, ...]]) -> int:
    """UPDATE in chunks of CHUNK_SIZE, committing each chunk (resumable).
    Returns the sum of UPDATE rowcounts — diagnostic only, NOT the success
    signal; verify_against_db() is."""
    matched = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), CHUNK_SIZE):
            chunk = rows[i:i + CHUNK_SIZE]
            sql = UPDATE_SQL_TEMPLATE.format(values=", ".join([VALUES_ROW] * len(chunk)))
            cur.execute(sql, [p for row in chunk for p in row])
            matched += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
            conn.commit()
            done = i + len(chunk)
            if done % 10_000 < CHUNK_SIZE or done == len(rows):
                print(f"[WRITE] {done:,}/{len(rows):,} rows attempted "
                      f"({matched:,} matched so far)")
    return matched


def stage_source_rows(cur, rows: Sequence[Tuple[Any, ...]]) -> None:
    """Stage source rows into a session-local TEMP table (dropped on commit),
    in CHUNK_SIZE batches. Touches no real table."""
    cur.execute(
        """
        CREATE TEMP TABLE tmp_bds_src (
          npi text, program_year int, hcpcs_code text,
          place_of_service text, bds int
        ) ON COMMIT DROP
        """
    )
    for i in range(0, len(rows), CHUNK_SIZE):
        cur.executemany(
            "INSERT INTO tmp_bds_src VALUES (%s, %s, %s, %s, %s)",
            rows[i:i + CHUNK_SIZE],
        )


def dry_run_match_check(conn, rows: Sequence[Tuple[Any, ...]]) -> None:
    """Read-only preview of the four-part join the UPDATE would use. A
    source-side row count alone cannot detect a broken join — this reports
    how many DB drug rows the staged source actually reaches. No writes to
    any real table; the staged source lives in a TEMP table dropped on
    commit."""
    with conn.cursor() as cur:
        stage_source_rows(cur, rows)

        cur.execute(
            """
            SELECT count(*),
                   count(*) FILTER (WHERE s.npi IS NOT NULL)
            FROM hcp_hcpcs_detail d
            LEFT JOIN tmp_bds_src s
              ON s.npi = d.npi
             AND s.program_year = d.program_year
             AND s.hcpcs_code = d.hcpcs_code
             AND s.place_of_service = d.place_of_service
            WHERE d.hcpcs_drug_indicator = 'Y'
            """
        )
        drug_rows, matched = cur.fetchone()
        print(f"[MATCH] hcp_hcpcs_detail drug rows: {drug_rows:,} (expected ~59,754)")
        print(f"[MATCH] matched by 4-part join:     {matched:,}")
        print(f"[MATCH] NOT matched:                {drug_rows - matched:,}")

        cur.execute(
            """
            SELECT d.program_year, count(*)
            FROM hcp_hcpcs_detail d
            WHERE d.hcpcs_drug_indicator = 'Y'
              AND NOT EXISTS (
                SELECT 1 FROM tmp_bds_src s
                WHERE s.npi = d.npi
                  AND s.program_year = d.program_year
                  AND s.hcpcs_code = d.hcpcs_code
                  AND s.place_of_service = d.place_of_service
              )
            GROUP BY d.program_year ORDER BY d.program_year
            """
        )
        unmatched_by_year = cur.fetchall()
        if unmatched_by_year:
            for year, n in unmatched_by_year:
                print(f"[MATCH] unmatched in {year}: {n:,}")
            cur.execute(
                """
                SELECT d.npi, d.program_year, d.hcpcs_code, d.place_of_service
                FROM hcp_hcpcs_detail d
                WHERE d.hcpcs_drug_indicator = 'Y'
                  AND NOT EXISTS (
                    SELECT 1 FROM tmp_bds_src s
                    WHERE s.npi = d.npi
                      AND s.program_year = d.program_year
                      AND s.hcpcs_code = d.hcpcs_code
                      AND s.place_of_service = d.place_of_service
                  )
                LIMIT 5
                """
            )
            print("[MATCH] sample non-matching DB rows "
                  "(npi, program_year, hcpcs_code, place_of_service):")
            for r in cur.fetchall():
                print(f"[MATCH]   {r!r}")
        else:
            print("[MATCH] every DB drug row is matched by the source.")

        # ---- join-key diagnostics ----
        cur.execute(
            """
            SELECT place_of_service, count(*)
            FROM hcp_hcpcs_detail GROUP BY place_of_service ORDER BY count(*) DESC
            """
        )
        print("[DIAG ] place_of_service in hcp_hcpcs_detail:")
        for pos, n in cur.fetchall():
            print(f"[DIAG ]   {pos!r}: {n:,}")

        cur.execute(
            """
            SELECT place_of_service, count(*)
            FROM tmp_bds_src GROUP BY place_of_service ORDER BY count(*) DESC
            """
        )
        print("[DIAG ] place_of_service in source (drug rows, post-normalization):")
        for pos, n in cur.fetchall():
            print(f"[DIAG ]   {pos!r}: {n:,}")

        cur.execute(
            """
            SELECT count(*) FROM hcp_hcpcs_detail
            WHERE hcpcs_code <> upper(trim(hcpcs_code))
            """
        )
        n_unnorm = cur.fetchone()[0]
        print(f"[DIAG ] DB hcpcs_code values not upper/trim-normalized: {n_unnorm:,}")
    conn.commit()  # drops the temp table; nothing else was written


def verify_against_db(conn, rows: Sequence[Tuple[Any, ...]]) -> Tuple[int, int]:
    """Re-read the database and count what actually landed. Source rows are
    staged into a TEMP table (also in CHUNK_SIZE batches) and joined against
    hcp_hcpcs_detail. Returns (keys_matched, values_confirmed) where
    values_confirmed counts non-NULL source values the DB now holds exactly."""
    with conn.cursor() as cur:
        stage_source_rows(cur, rows)
        cur.execute(
            """
            SELECT count(*),
                   count(*) FILTER (WHERE s.bds IS NOT NULL
                                    AND d.total_bene_day_services = s.bds)
            FROM tmp_bds_src s
            JOIN hcp_hcpcs_detail d
              ON d.npi = s.npi
             AND d.program_year = s.program_year
             AND d.hcpcs_code = s.hcpcs_code
             AND d.place_of_service = s.place_of_service
            """
        )
        keys_matched, values_confirmed = cur.fetchone()

        cur.execute(
            """
            SELECT program_year, count(*), count(total_bene_day_services)
            FROM hcp_hcpcs_detail WHERE hcpcs_drug_indicator = 'Y'
            GROUP BY program_year ORDER BY program_year
            """
        )
        for year, drug_rows, with_bds in cur.fetchall():
            pct = 100.0 * with_bds / drug_rows if drug_rows else 0.0
            print(f"[DB   ] {year}: {with_bds:,}/{drug_rows:,} drug rows "
                  f"with bds ({pct:.1f}%)")
    conn.commit()  # drops the temp table
    return keys_matched, values_confirmed


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill hcp_hcpcs_detail.total_bene_day_services from CMS parquets")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true",
                      help="Read parquets, print the funnel, and preview the "
                           "4-part join against the DB (read-only). No writes.")
    mode.add_argument("--execute", action="store_true",
                      help="Write in chunks of %d and verify against the DB." % CHUNK_SIZE)
    parser.add_argument("--medicare-dir", default=MEDICARE_DIR_DEFAULT,
                        help="Directory holding medicare_provider_service_<year>.parquet")
    args = parser.parse_args()

    rows = read_source_rows(args.medicare_dir)
    non_null = sum(1 for r in rows if r[4] is not None)
    print(f"[PLAN ] {len(rows):,} rows to attempt ({non_null:,} with a value, "
          f"{len(rows) - non_null:,} writing NULL)")

    if args.dry_run:
        if rows:
            with psycopg.connect(get_db_url()) as conn:
                dry_run_match_check(conn, rows)
        else:
            print("[DRY RUN] source produced zero rows — nothing to check.")
        print("[DRY RUN] no writes.")
        return 0

    if not rows:
        print("[FAIL ] source produced zero rows — nothing to write.")
        return 1

    with psycopg.connect(get_db_url()) as conn:
        matched = write_chunks(conn, rows)
        keys_matched, values_confirmed = verify_against_db(conn, rows)

    print("=" * 64)
    print(f"[FUNNEL] attempted:            {len(rows):,}")
    print(f"[FUNNEL] update rowcount:      {matched:,}  (diagnostic only)")
    print(f"[FUNNEL] keys matched in DB:   {keys_matched:,}")
    print(f"[FUNNEL] values CONFIRMED by re-read: {values_confirmed:,} "
          f"of {non_null:,} non-NULL attempts")
    if values_confirmed == 0:
        print("[FAIL ] zero confirmed writes — the join matched nothing or values "
              "did not land. Do NOT treat this run as a success.")
        return 1
    if values_confirmed < non_null:
        print(f"[WARN ] {non_null - values_confirmed:,} non-NULL source rows have no "
              f"exactly-matching DB row (missing key in table, or value mismatch). "
              f"Investigate before calling this complete.")
    print("[DONE ] backfill confirmed by database re-read.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
