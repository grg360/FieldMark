"""
FieldMark — Medicare Part D oral-oncology anchor ingest.

Loads Part D prescribing for the drugs in part_d_oncology_drugs_v1, restricted to
NPIs present in hcps_v2, into hcp_part_d_oncology_v1 so the NSCLC evidence tiers
(docs/design/NSCLC_COHORT_EVIDENCE_TIERS.md) can be computed from the database.

WHY PART D (see the design doc): Part B failed as a lung anchor — general
solid-tumour infusibles, 11-beneficiary suppression, fee-for-service only. Part D
succeeds: suppression is on 11 CLAIMS (an oral targeted therapy is dispensed
~monthly, so two patients clear the floor), and it includes Medicare Advantage.

DESIGN
  - Source: Medicare_Part_D_Prescribers_by_Provider_and_Drug_<year>.csv (~28M rows
    each), read with duckdb. YEAR IS NOT A COLUMN — parsed from the filename and
    stored explicitly.
  - MATCH BY PREFIX, lowercased, never exact. CMS records salt forms
    ("Osimertinib Mesylate", "Alectinib Hcl", ...); an exact-match list of bare
    stems silently returns zero rows for osimertinib, the largest drug in the set.
    Both the matched stem and the raw Gnrc_Name are stored, so the mapping is
    auditable.
  - ANCHOR GRADE IS DRUG *AND* YEAR. The stem->group membership and the
    effective-dated stem->grade rows are READ from part_d_oncology_drugs_v1 (never
    hardcoded here). Drug membership (what loads) is stem presence, year-independent;
    the grade is resolved per row by joining on stem AND program_year in
    [valid_from_year, valid_to_year]. A stem with no covering grade row for a year
    still loads, with anchor_grade NULL. "Anchored" downstream == anchor_grade
    'strict' for that row's program_year. Run part_d_oncology_schema.sql first.
  - npi is TEXT in hcps_v2. The duckdb dtype of Prscrbr_NPI is printed, then cast
    to VARCHAR explicitly; a silent int/text mismatch matches zero rows.
  - Tot_Benes is blank under 11 — stored as NULL, never zero.
  - Grain hcp_id + program_year + gnrc_name: rows are aggregated across brands of
    the same molecule within a provider-year (sum of claims/fills; representative
    brand = the one with the most claims; tot_benes summed over the non-suppressed
    brand rows, a floor).
  - Upsert on the PK → idempotent and resumable (commit per chunk; a partial run
    leaves committed chunks and a re-run rewrites the same values).
  - Success is confirmed by re-reading the database (staged keys joined back),
    never inferred from a batch count. Exits non-zero if confirmed is zero.

Examples:
  python scripts/ingest/part_d_oncology_ingest.py --dry-run
  python scripts/ingest/part_d_oncology_ingest.py --execute
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import duckdb
import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MEDICARE_DIR_DEFAULT = r"C:\Users\garre\Desktop\Fieldmark\Medicare"
FILE_TEMPLATE = "Medicare_Part_D_Prescribers_by_Provider_and_Drug_{year}.csv"
PART_D_YEARS = (2022, 2023, 2024)
CHUNK_SIZE = 1000  # write/verify batch size

INSERT_SQL = """
    INSERT INTO hcp_part_d_oncology_v1
      (hcp_id, npi, program_year, gnrc_name, brnd_name, drug_stem, drug_group,
       anchor_grade, tot_clms, tot_30day_fills, tot_benes)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (hcp_id, program_year, gnrc_name) DO UPDATE SET
      npi = EXCLUDED.npi,
      brnd_name = EXCLUDED.brnd_name,
      drug_stem = EXCLUDED.drug_stem,
      drug_group = EXCLUDED.drug_group,
      anchor_grade = EXCLUDED.anchor_grade,
      tot_clms = EXCLUDED.tot_clms,
      tot_30day_fills = EXCLUDED.tot_30day_fills,
      tot_benes = EXCLUDED.tot_benes,
      ingested_at = now()
"""


def get_db_url() -> str:
    v = os.getenv("DATABASE_URL")
    if not v:
        raise EnvironmentError("Missing required environment variable: DATABASE_URL")
    return v


def year_from_path(p: Path) -> int:
    m = re.search(r"(20\d{2})", p.name)
    if not m:
        raise ValueError(f"Could not parse a program_year from filename: {p.name}")
    return int(m.group(1))


def load_reference(cur) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str, int, Any]]]:
    """Returns (membership, grades):
      membership = distinct (drug_stem, drug_group) — year-independent, what loads
      grades     = (drug_stem, anchor_grade, valid_from_year, valid_to_year) rows"""
    cur.execute(
        "SELECT drug_stem, drug_group, anchor_grade, valid_from_year, valid_to_year "
        "FROM part_d_oncology_drugs_v1"
    )
    rows = cur.fetchall()
    if not rows:
        raise RuntimeError("part_d_oncology_drugs_v1 is empty — run part_d_oncology_schema.sql first")
    membership: Dict[str, str] = {}
    grades: List[Tuple[str, str, int, Any]] = []
    for stem, group, grade, vfrom, vto in rows:
        s = str(stem).lower()
        membership[s] = str(group)
        grades.append((s, (str(grade) if grade is not None else None), int(vfrom),
                       (int(vto) if vto is not None else None)))
    return sorted(membership.items()), grades


def load_npi_to_hcp(cur) -> Dict[str, str]:
    cur.execute("SELECT btrim(npi_number), id::text FROM hcps_v2 WHERE npi_number IS NOT NULL")
    return {npi: hid for npi, hid in cur.fetchall() if npi}


def _duck_with_refs(
    npis: Sequence[str],
    membership: Sequence[Tuple[str, str]],
    grades: Sequence[Tuple[str, str, int, Any]],
) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("CREATE TEMP TABLE cohort_npi (npi VARCHAR)")
    con.executemany("INSERT INTO cohort_npi VALUES (?)", [(n,) for n in npis])
    con.execute("CREATE TEMP TABLE drug_stems (stem VARCHAR, drug_group VARCHAR)")
    con.executemany("INSERT INTO drug_stems VALUES (?, ?)", list(membership))
    con.execute(
        "CREATE TEMP TABLE drug_grades (stem VARCHAR, anchor_grade VARCHAR, "
        "valid_from_year INTEGER, valid_to_year INTEGER)"
    )
    con.executemany("INSERT INTO drug_grades VALUES (?, ?, ?, ?)", list(grades))
    return con


def scan_year(con: duckdb.DuckDBPyConnection, csv_path: Path) -> Tuple[int, int, int]:
    """One pass: (rows_read, rows_after_drug_filter, rows_matched_to_cohort).
    Prefix match, lowercased; cohort = npi present in hcps_v2 (cast to VARCHAR)."""
    row = con.execute(
        f"""
        SELECT
          count(*) AS rows_read,
          count(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM drug_stems s WHERE lower(m.Gnrc_Name) LIKE s.stem || '%')
          ) AS after_drug,
          count(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM drug_stems s WHERE lower(m.Gnrc_Name) LIKE s.stem || '%')
              AND EXISTS (SELECT 1 FROM cohort_npi c WHERE c.npi = CAST(m.Prscrbr_NPI AS VARCHAR))
          ) AS matched
        FROM read_csv('{csv_path.as_posix()}', header=true, sample_size=-1) m
        """
    ).fetchone()
    return int(row[0]), int(row[1]), int(row[2])


def fetch_year_rows(con: duckdb.DuckDBPyConnection, csv_path: Path, year: int) -> List[Tuple[Any, ...]]:
    """Matched rows aggregated to (npi, gnrc_name) grain for one file, with the
    anchor_grade resolved for `year`. Returns:
    (npi, gnrc_name, brnd_name, stem, group, anchor_grade, clms, fills, benes)."""
    return con.execute(
        f"""
        WITH matched AS (
          SELECT CAST(m.Prscrbr_NPI AS VARCHAR)                      AS npi,
                 m.Gnrc_Name                                         AS gnrc_name,
                 m.Brnd_Name                                         AS brnd_name,
                 s.stem                                              AS drug_stem,
                 s.drug_group                                        AS drug_group,
                 TRY_CAST(m.Tot_Clms AS INTEGER)                     AS tot_clms,
                 TRY_CAST(m.Tot_30day_Fills AS DOUBLE)               AS tot_30day_fills,
                 TRY_CAST(NULLIF(trim(CAST(m.Tot_Benes AS VARCHAR)), '') AS INTEGER) AS tot_benes
          FROM read_csv('{csv_path.as_posix()}', header=true, sample_size=-1) m
          JOIN cohort_npi c ON c.npi = CAST(m.Prscrbr_NPI AS VARCHAR)
          JOIN drug_stems s ON lower(m.Gnrc_Name) LIKE s.stem || '%'
        ),
        graded AS (
          SELECT mt.*,
                 (SELECT g.anchor_grade FROM drug_grades g
                   WHERE g.stem = mt.drug_stem
                     AND {year} >= g.valid_from_year
                     AND ({year} <= g.valid_to_year OR g.valid_to_year IS NULL)
                   LIMIT 1)                                          AS anchor_grade
          FROM matched mt
        )
        SELECT npi,
               gnrc_name,
               arg_max(brnd_name, coalesce(tot_clms, 0)) AS brnd_name,
               any_value(drug_stem)                      AS drug_stem,
               any_value(drug_group)                     AS drug_group,
               any_value(anchor_grade)                   AS anchor_grade,
               sum(tot_clms)                             AS tot_clms,
               sum(tot_30day_fills)                      AS tot_30day_fills,
               sum(tot_benes)                            AS tot_benes
        FROM graded
        GROUP BY npi, gnrc_name
        """
    ).fetchall()


def write_year_rows(
    year: int, rows: Sequence[Tuple[Any, ...]], npi_to_hcp: Dict[str, str]
) -> Tuple[int, List[Tuple[str, int, str]]]:
    """Upsert one year's rows under a SHORT-LIVED connection opened HERE — after the
    minutes-long DuckDB scan — and closed on return. No Postgres connection is held
    across scans, so Supabase cannot idle it out (the original failure mode).

    Commits every CHUNK_SIZE rows, so a mid-year failure leaves the committed chunks
    intact; the (hcp_id, program_year, gnrc_name) PK upsert makes any re-run
    idempotent — already-written rows are overwritten with identical values, never
    duplicated. Returns (rows_written, keys_written)."""
    written = 0
    keys: List[Tuple[str, int, str]] = []
    with psycopg.connect(get_db_url()) as conn:
        with conn.cursor() as cur:
            batch: List[Tuple[Any, ...]] = []
            for (npi, gnrc, brnd, stem, grp, grade, clms, fills, benes) in rows:
                hcp_id = npi_to_hcp.get(npi)
                if hcp_id is None:
                    continue  # not a cohort NPI (join already filtered; belt and braces)
                batch.append((hcp_id, npi, year, gnrc, brnd, stem, grp, grade,
                              None if clms is None else int(clms), fills,
                              None if benes is None else int(benes)))
                keys.append((hcp_id, year, gnrc))
                if len(batch) >= CHUNK_SIZE:
                    cur.executemany(INSERT_SQL, batch)
                    conn.commit()  # commit per chunk → resumable
                    written += len(batch)
                    batch = []
            if batch:
                cur.executemany(INSERT_SQL, batch)
                conn.commit()
                written += len(batch)
    return written, keys


def verify_confirmed(conn, keys: Sequence[Tuple[str, int, str]]) -> int:
    """Re-read: how many written (hcp_id, program_year, gnrc_name) keys are present."""
    if not keys:
        return 0
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TEMP TABLE tmp_pd_keys (hcp_id uuid, program_year int, gnrc_name text) ON COMMIT DROP"
        )
        for i in range(0, len(keys), CHUNK_SIZE):
            cur.executemany("INSERT INTO tmp_pd_keys VALUES (%s, %s, %s)", keys[i:i + CHUNK_SIZE])
        cur.execute(
            """
            SELECT count(*)
            FROM tmp_pd_keys k
            JOIN hcp_part_d_oncology_v1 d
              ON d.hcp_id = k.hcp_id
             AND d.program_year = k.program_year
             AND d.gnrc_name = k.gnrc_name
            """
        )
        n = cur.fetchone()[0]
    conn.commit()
    return int(n)


# ---------------------------------------------------------------------------
# DRY-RUN DELTA (read-only; added 2026-09-15)
#
# THE FUNNEL ANSWERS "HOW MUCH MATCHES", NOT "HOW MUCH IS NEW". 257,664 matched
# rows against the 79,988 already in the table is not a delta, and the difference
# is not subtraction: the grains differ (CSV rows aggregate to hcp_id + year +
# gnrc_name) and an upsert rewrites as well as inserts.
#
# WHY NOBODY NEEDED A DELTA BEFORE, AND WHY IT IS NEEDED NOW. The cohort is built
# from hcps_v2 AT RUN TIME (load_npi_to_hcp below). Workstream B added 19,043
# NPI-native records on 2026-09-09 and this script has not run since, so those
# physicians have never been scanned for. "No Part D row" for them means nobody
# looked -- which is not the same claim as "does not prescribe", and the two are
# indistinguishable once written. Same class as cohort_classification_v2 not being
# re-run, five days apart, same upstream event.
#
# EVERYTHING HERE IS READ-ONLY. It stages the candidate rows into a TEMP table and
# joins; no persistent object is written and --execute is untouched.
#
# COST: a row-level delta needs the rows, so dry-run now calls fetch_year_rows --
# a second full pass over each ~4GB CSV on top of scan_year's. Dry-run wall time
# roughly doubles. The funnel alone cannot produce this answer.
# ---------------------------------------------------------------------------

# The columns the upsert actually overwrites. ingested_at is excluded deliberately:
# it moves on every upsert by construction, so including it would report 100% of
# updates as "changed" and tell nobody anything.
DELTA_COLUMNS = ("npi", "brnd_name", "drug_stem", "drug_group", "anchor_grade",
                 "tot_clms", "tot_30day_fills", "tot_benes")


def stage_candidates(cur, staged: Sequence[Tuple[Any, ...]]) -> None:
    """Load the rows --execute WOULD write into a TEMP table, at the PK grain."""
    cur.execute(
        """
        CREATE TEMP TABLE tmp_pd_candidate (
          hcp_id uuid, npi text, program_year int, gnrc_name text, brnd_name text,
          drug_stem text, drug_group text, anchor_grade text,
          tot_clms int, tot_30day_fills numeric, tot_benes int
        ) ON COMMIT DROP
        """
    )
    for i in range(0, len(staged), CHUNK_SIZE):
        cur.executemany(
            "INSERT INTO tmp_pd_candidate VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            staged[i:i + CHUNK_SIZE],
        )
    cur.execute("CREATE INDEX ON tmp_pd_candidate (hcp_id, program_year, gnrc_name)")
    cur.execute("ANALYZE tmp_pd_candidate")


def _one(cur, sql: str) -> Tuple[Any, ...]:
    cur.execute(sql)
    return cur.fetchone()


def report_delta(staged: Sequence[Tuple[Any, ...]]) -> None:
    """Print the delta. Opens its own short-lived connection, like write_year_rows."""
    print("=" * 64)
    if not staged:
        print("[DELTA] no candidate rows staged - nothing to compare.")
        return

    with psycopg.connect(get_db_url()) as conn:
        with conn.cursor() as cur:
            stage_candidates(cur, staged)

            # In-batch key collisions: two NPIs mapping to one hcp_id would collide on
            # the PK inside a single --execute batch, last-write-wins. Reported because
            # the insert/update split below counts DISTINCT keys, and a gap between the
            # two is a real defect this dry run can see for free.
            rows_staged, keys_distinct = _one(cur, """
                SELECT count(*), count(DISTINCT (hcp_id, program_year, gnrc_name))
                FROM tmp_pd_candidate
            """)
            print(f"[DELTA] candidate rows staged:          {rows_staged:,}")
            print(f"[DELTA] distinct PK keys:               {keys_distinct:,}"
                  + ("" if rows_staged == keys_distinct
                     else f"   <-- {rows_staged - keys_distinct:,} IN-BATCH COLLISIONS"))

            present, to_insert = _one(cur, """
                SELECT count(*) FILTER (WHERE d.hcp_id IS NOT NULL),
                       count(*) FILTER (WHERE d.hcp_id IS NULL)
                FROM (SELECT DISTINCT hcp_id, program_year, gnrc_name FROM tmp_pd_candidate) k
                LEFT JOIN hcp_part_d_oncology_v1 d
                       ON d.hcp_id = k.hcp_id AND d.program_year = k.program_year
                      AND d.gnrc_name = k.gnrc_name
            """)
            print(f"[DELTA] already present (same grain):   {present:,}")
            print(f"[DELTA] would be INSERTED:              {to_insert:,}")

            changed, = _one(cur, f"""
                SELECT count(*)
                FROM tmp_pd_candidate c
                JOIN hcp_part_d_oncology_v1 d
                  ON d.hcp_id = c.hcp_id AND d.program_year = c.program_year
                 AND d.gnrc_name = c.gnrc_name
                WHERE {" OR ".join("d." + col + " IS DISTINCT FROM c." + col for col in DELTA_COLUMNS)}
            """)
            print(f"[DELTA] would be UPDATED:               {present:,}")
            print(f"[DELTA]   ...of which a value CHANGES:  {changed:,}   "
                  f"({'no-op rewrite' if changed == 0 else 'REAL CHANGES'}; "
                  f"ingested_at excluded, it always moves)")

            # Per-column, so "something changed" names itself.
            for col in DELTA_COLUMNS:
                n, = _one(cur, f"""
                    SELECT count(*) FROM tmp_pd_candidate c
                    JOIN hcp_part_d_oncology_v1 d
                      ON d.hcp_id = c.hcp_id AND d.program_year = c.program_year
                     AND d.gnrc_name = c.gnrc_name
                    WHERE d.{col} IS DISTINCT FROM c.{col}
                """)
                if n:
                    print(f"[DELTA]     {col:<16} differs on {n:,} rows")

            # ---- HCPs gaining a FIRST Part D row ----
            # "First" = no row in hcp_part_d_oncology_v1 at all, any year, any drug.
            # This is the population whose board qualification can change, because
            # community_board_v1.qualifies reads Part D PRESENCE, not counts.
            print("-" * 64)
            total_new, nsclc_n, crc_n, neither_n = _one(cur, """
                WITH firsts AS (
                  SELECT DISTINCT c.hcp_id FROM tmp_pd_candidate c
                  WHERE NOT EXISTS (SELECT 1 FROM hcp_part_d_oncology_v1 d WHERE d.hcp_id = c.hcp_id)
                ),
                scored AS (
                  SELECT f.hcp_id,
                         EXISTS (SELECT 1 FROM hcp_community_scores_v2 s
                                  JOIN therapeutic_areas t ON t.id = s.therapeutic_area_id
                                 WHERE s.hcp_id = f.hcp_id AND t.slug = 'nsclc')             AS in_nsclc,
                         EXISTS (SELECT 1 FROM hcp_community_scores_v2 s
                                  JOIN therapeutic_areas t ON t.id = s.therapeutic_area_id
                                 WHERE s.hcp_id = f.hcp_id AND t.slug = 'colorectal-cancer') AS in_crc
                  FROM firsts f
                )
                SELECT count(*),
                       count(*) FILTER (WHERE in_nsclc),
                       count(*) FILTER (WHERE in_crc),
                       count(*) FILTER (WHERE NOT in_nsclc AND NOT in_crc)
                FROM scored
            """)
            print(f"[DELTA] HCPs gaining a FIRST Part D row: {total_new:,}")
            print(f"[DELTA]   scored for nsclc:              {nsclc_n:,}")
            print(f"[DELTA]   scored for colorectal-cancer:  {crc_n:,}")
            print(f"[DELTA]   scored for neither:            {neither_n:,}")
            print("[DELTA]   (nsclc and colorectal overlap, so the three need not sum)")

            # ---- THE NUMBER THAT DECIDES THE RUN ----
            # 4,915 is the regression oracle for the whole fortnight. qualifies is
            # patient_volume > 0 OR Part D presence, so a FIRST Part D row can only
            # ADD a member, never remove one. Two populations, and only the second
            # moves the oracle:
            #   already_member  on the board today; they already qualified on
            #                   patient_volume, so a first Part D row changes nothing.
            #   would_be_added  in the nsclc cohort, NOT qualifying today, gaining a
            #                   first Part D row. This is what turns 4,915 into
            #                   4,915 + n, and it is the number to decide on.
            print("-" * 64)
            already, added = _one(cur, """
                WITH firsts AS (
                  SELECT DISTINCT c.hcp_id FROM tmp_pd_candidate c
                  WHERE NOT EXISTS (SELECT 1 FROM hcp_part_d_oncology_v1 d WHERE d.hcp_id = c.hcp_id)
                )
                SELECT count(*) FILTER (WHERE b.qualifies),
                       count(*) FILTER (WHERE NOT b.qualifies)
                FROM firsts f
                JOIN community_board_v1 b ON b.hcp_id = f.hcp_id
                JOIN therapeutic_areas t ON t.id = b.ta_id AND t.slug = 'nsclc'
            """)
            members_now, = _one(cur, """
                SELECT count(*) FROM community_board_v1 b
                JOIN therapeutic_areas t ON t.id = b.ta_id AND t.slug = 'nsclc'
                WHERE b.qualifies
            """)
            print(f"[ORACLE] nsclc board members today:               {members_now:,}")
            print(f"[ORACLE] already qualifying, gaining a first row: {already:,}   (no effect on the count)")
            print(f"[ORACLE] NON-qualifying, gaining a first row:     {added:,}   <-- WOULD BE ADDED")
            if added:
                print(f"[ORACLE] nsclc board would become {members_now:,} + {added:,} = {members_now + added:,}")
            else:
                print("[ORACLE] nsclc board count UNCHANGED by this run.")

            # ---- NON-LUNG anchor_grade ----
            # Block 50 withheld anchor_grade from this table because
            # hcp_nsclc_evidence_tier_v1 counts dominant_rows / cross_rows /
            # supporting_grade_rows over hcp_part_d_oncology_v1 with NO drug_group
            # predicate: it reads the column as a LUNG grade whatever TA the drug
            # belongs to. A non-lung grade moved 130 lung physicians into 'supported'
            # with supported_evidence reading "lung-dominant oral".
            #
            # This ingest resolves anchor_grade from part_d_oncology_drugs_v1 and the
            # upsert sets anchor_grade = EXCLUDED.anchor_grade, so a re-run RE-OPENS
            # that door. 'strict' is the worst case: the ladder reads strict_rows > 0
            # as ANCHORED, the top tier, not merely supported.
            print("-" * 64)
            cur.execute("""
                SELECT c.drug_group, c.anchor_grade, c.drug_stem,
                       count(*) AS rows, count(DISTINCT c.hcp_id) AS hcps
                FROM tmp_pd_candidate c
                WHERE c.anchor_grade IS NOT NULL AND c.drug_group <> 'lung'
                GROUP BY 1, 2, 3 ORDER BY 4 DESC
            """)
            non_lung = cur.fetchall()
            if not non_lung:
                print("[GRADE ] no non-lung anchor_grade would be written. Block 50's "
                      "invariant survives this run.")
            else:
                total = sum(r[3] for r in non_lung)
                print(f"[GRADE ] *** {total:,} ROWS WOULD CARRY A NON-LUNG anchor_grade ***")
                for grp, grade, stem, rows_n, hcps_n in non_lung:
                    print(f"[GRADE ]   {grp}/{grade:<16} {stem:<14} {rows_n:,} rows - {hcps_n:,} HCPs")
                lung_hit, = _one(cur, """
                    SELECT count(DISTINCT c.hcp_id)
                    FROM tmp_pd_candidate c
                    JOIN community_board_v1 b ON b.hcp_id = c.hcp_id
                    JOIN therapeutic_areas t ON t.id = b.ta_id AND t.slug = 'nsclc'
                    WHERE c.anchor_grade IS NOT NULL AND c.drug_group <> 'lung' AND b.qualifies
                """)
                strict_hit, = _one(cur, """
                    SELECT count(DISTINCT c.hcp_id)
                    FROM tmp_pd_candidate c
                    JOIN community_board_v1 b ON b.hcp_id = c.hcp_id
                    JOIN therapeutic_areas t ON t.id = b.ta_id AND t.slug = 'nsclc'
                    WHERE c.anchor_grade = 'strict' AND c.drug_group <> 'lung' AND b.qualifies
                """)
                print(f"[GRADE ]   on the nsclc board today: {lung_hit:,} HCPs would carry a "
                      f"non-lung grade the ladder reads as lung evidence")
                print(f"[GRADE ]   ...of which graded 'strict', which reads as ANCHORED: {strict_hit:,}")
                print("[GRADE ] This is the block 50 defect returning through the ingest door. "
                      "Do NOT --execute until either the ladder scopes its grade counts by "
                      "drug_group, or this script is taught to write lung grades only.")

        conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Part D oral-oncology anchor rows")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true",
                      help="Scan and print the funnel, the hcps_v2 match count, and the "
                           "INSERT/UPDATE delta against hcp_part_d_oncology_v1. No writes. "
                           "Reads each CSV twice, so it takes about twice as long as the "
                           "funnel alone.")
    mode.add_argument("--execute", action="store_true",
                      help="Write matched rows (chunked upsert) and verify against the DB.")
    parser.add_argument("--medicare-dir", default=MEDICARE_DIR_DEFAULT)
    parser.add_argument("--years", default=",".join(str(y) for y in PART_D_YEARS),
                        help="Comma-separated program years to load (default 2022,2023,2024).")
    args = parser.parse_args()

    years = [int(y) for y in str(args.years).split(",") if y.strip()]
    paths: List[Tuple[int, Path]] = []
    for y in years:
        p = Path(args.medicare_dir) / FILE_TEMPLATE.format(year=y)
        if not p.exists():
            raise FileNotFoundError(f"Missing Part D file: {p}")
        assert year_from_path(p) == y, f"filename/year mismatch for {p}"
        paths.append((y, p))

    with psycopg.connect(get_db_url()) as conn:
        with conn.cursor() as cur:
            membership, grades = load_reference(cur)
            npi_to_hcp = load_npi_to_hcp(cur)
    print(f"[REF ] {len(membership)} drug stems; {len(grades)} grade rows "
          f"({sum(1 for _, g, _, _ in grades if g == 'strict')} strict-graded)")
    print(f"[COHORT] {len(npi_to_hcp):,} hcps_v2 NPIs (npi_number not null)")

    con = _duck_with_refs(list(npi_to_hcp.keys()), membership, grades)

    # ---- TYPE CHECK BEFORE WRITING: what does duckdb infer for Prscrbr_NPI? ----
    _, first_path = paths[0]
    npi_type = next(
        r[1] for r in con.execute(
            f"DESCRIBE SELECT Prscrbr_NPI FROM read_csv('{first_path.as_posix()}', header=true) LIMIT 1"
        ).fetchall()
    )
    print(f"[TYPE ] Prscrbr_NPI dtype per duckdb: {npi_type} "
          f"(hcps_v2.npi_number is text; cast to VARCHAR explicitly in every join)")

    dry_run = bool(args.dry_run)
    total_read = total_after = total_matched = total_written = 0
    written_keys: List[Tuple[str, int, str]] = []
    # Dry-run only. Same tuple shape as write_year_rows' batch, so what is compared is
    # what would be written.
    delta_staged: List[Tuple[Any, ...]] = []

    for year, path in paths:
        rows_read, after_drug, matched = scan_year(con, path)
        total_read += rows_read
        total_after += after_drug
        total_matched += matched
        print(f"[SCAN ] {year}: {rows_read:,} read · {after_drug:,} after drug filter · "
              f"{matched:,} matched to a cohort NPI")

        if dry_run:
            # SECOND PASS, DRY RUN ONLY. scan_year gives counts; the delta needs the
            # rows themselves at the write grain, which is what fetch_year_rows
            # produces. Same function --execute uses, so the delta is computed from
            # exactly the rows that would be written rather than from a reimplementation
            # of them -- a separate query here could drift from the writer and report a
            # delta for a run that never happens.
            rows = fetch_year_rows(con, path, year)
            staged_rows = 0
            for (npi, gnrc, brnd, stem, grp, grade, clms, fills, benes) in rows:
                hcp_id = npi_to_hcp.get(npi)
                if hcp_id is None:
                    continue  # mirrors write_year_rows' belt-and-braces skip
                delta_staged.append((hcp_id, npi, year, gnrc, brnd, stem, grp, grade,
                                     None if clms is None else int(clms), fills,
                                     None if benes is None else int(benes)))
                staged_rows += 1
            print(f"[DELTA] {year}: {staged_rows:,} candidate rows at the write grain "
                  f"(from {len(rows):,} aggregated)")
            continue

        rows = fetch_year_rows(con, path, year)
        # Open the write connection only now — after the scan — and close it when
        # the year's batch is done (write_year_rows). Nothing spans the scans, so a
        # failure costs at most this one year; earlier years are already committed
        # under their own now-closed connections.
        year_written, year_keys = write_year_rows(year, rows, npi_to_hcp)
        total_written += year_written
        written_keys.extend(year_keys)
        print(f"[WRITE] {year}: {year_written:,} of {len(rows):,} rows upserted")

    con.close()

    print("=" * 64)
    print(f"[FUNNEL] rows read (all years):        {total_read:,}")
    print(f"[FUNNEL] rows after drug filter:       {total_after:,}")
    print(f"[FUNNEL] rows matched to a cohort NPI: {total_matched:,}")

    if dry_run:
        report_delta(delta_staged)
        print("=" * 64)
        print("[DRY RUN] no writes.")
        return 0

    print(f"[FUNNEL] rows written (upserted):      {total_written:,}")
    with psycopg.connect(get_db_url()) as conn:
        confirmed = verify_confirmed(conn, written_keys)
    print(f"[FUNNEL] rows CONFIRMED by re-read:    {confirmed:,} of {len(written_keys):,}")

    if confirmed == 0:
        print("[FAIL ] zero confirmed rows — nothing landed. Do NOT treat this as success.")
        return 1
    if confirmed < len(written_keys):
        print(f"[WARN ] {len(written_keys) - confirmed:,} written keys not found on re-read — investigate.")
    print("[DONE ] Part D oncology anchor ingest confirmed by database re-read.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
