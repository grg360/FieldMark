"""
FieldMark - Stage 6c: derive hcps_v2.career_first_pub_year_v2 via the "sustained onset" method.

TA-parameterized replacement for the hand-adapted, per-cycle SQL
(sql/backfill/ad_career_first_pub_year_v2.sql, AD-hardcoded, and its NSCLC incremental copy).
The scoring METHOD is ported VERBATIM from that SQL - only the HCP-scope subquery is
parameterized (full-TA vs this-cycle's-new-HCPs). No math is changed.

PIPELINE POSITION: stage 6c, after stage 6b (openalex_author_enrichment.py) has populated
hcp_author_metrics_v2.counts_by_year at the snapshot_date. This reads counts_by_year and writes
hcps_v2.career_first_pub_year_v2. The --snapshot-date MUST match stage 6b's snapshot (it is
printed loudly at start).

METHOD (COALESCE(sustained, two_paper, earliest)):
  yearly    : explode counts_by_year -> (hcp_id, year, works) for scoped HCPs at snapshot_date
  windowed  : LEAD(works,1/2) / LEAD(year,1/2) per hcp ordered by year
  sustained : MIN(year) where works>=2 AND next-yr works>=2 (year+1) AND yr-after works>=2 (year+2)
  two_paper : MIN(year) where works>=2
  earliest  : MIN(year)
  new_start : COALESCE(sustained, two_paper, earliest)

Interface:
  python scripts/enrich/derive_career_first_pub_year_v2.py --ta nsclc \
      --ingestion-run-id <RUN> [--snapshot-date YYYY-MM-DD] [--dry-run|--execute] [--preview-limit N]

Env: DATABASE_URL (service role) via .env.
"""

from __future__ import annotations

import os
from datetime import date
from typing import Optional

import click
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


# ---------------------------------------------------------------------------
# The derivation CTE - ported VERBATIM from sql/backfill/ad_career_first_pub_year_v2.sql
# (== nsclc_career_first_pub_year_v2_incremental.sql). The ONLY parameterization is:
#   * snapshot_date  -> %(snapshot_date)s
#   * the HCP-scope subquery ({scope_subquery}) -> full-TA tag vs this-cycle ingestion_run_id
# `resolved` additionally exposes the intermediate start_* columns (for the dry-run preview);
# new_start is computed identically to the reference SQL.
# ---------------------------------------------------------------------------

def build_cte(scope_subquery: str) -> str:
    return f"""
WITH yearly AS (
  SELECT m.hcp_id, (elem->>'year')::int AS year, (elem->>'works_count')::int AS works
  FROM hcp_author_metrics_v2 m
  CROSS JOIN LATERAL jsonb_array_elements(m.counts_by_year) AS elem
  WHERE m.snapshot_date = %(snapshot_date)s
    AND m.hcp_id IN ( {scope_subquery} )
),
windowed AS (
  SELECT hcp_id, year, works,
    LEAD(works,1) OVER (PARTITION BY hcp_id ORDER BY year) AS n1w,
    LEAD(works,2) OVER (PARTITION BY hcp_id ORDER BY year) AS n2w,
    LEAD(year,1)  OVER (PARTITION BY hcp_id ORDER BY year) AS n1y,
    LEAD(year,2)  OVER (PARTITION BY hcp_id ORDER BY year) AS n2y
  FROM yearly
),
sustained AS (
  SELECT hcp_id, MIN(year) AS start_sustained FROM windowed
  WHERE works >= 2 AND n1w >= 2 AND n1y = year+1 AND n2w >= 2 AND n2y = year+2
  GROUP BY hcp_id
),
two_paper AS (
  SELECT hcp_id, MIN(year) AS start_2paper FROM yearly WHERE works >= 2 GROUP BY hcp_id
),
earliest AS (
  SELECT hcp_id, MIN(year) AS start_earliest FROM yearly GROUP BY hcp_id
),
resolved AS (
  SELECT e.hcp_id,
    s.start_sustained,
    t.start_2paper,
    e.start_earliest,
    COALESCE(s.start_sustained, t.start_2paper, e.start_earliest) AS new_start
  FROM earliest e
  LEFT JOIN sustained s ON s.hcp_id = e.hcp_id
  LEFT JOIN two_paper t ON t.hcp_id = e.hcp_id
)
"""


# Scope subqueries (the ONLY difference between full-backfill and incremental).
SCOPE_INCREMENTAL = "SELECT id FROM hcps_v2 WHERE ingestion_run_id = %(run_id)s"
SCOPE_FULL_TA = "SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id = %(ta_id)s"


@click.command()
@click.option("--ta", "ta_slug", required=True, help="Therapeutic area slug (e.g. nsclc).")
@click.option("--ingestion-run-id", "ingestion_run_id", default=None,
              help="Scope to HCPs with this hcps_v2.ingestion_run_id (incremental: this cycle's new "
                   "HCPs). Omit to scope to ALL HCPs tagged to the TA (full backfill).")
@click.option("--snapshot-date", "snapshot_date", default=None,
              help="hcp_author_metrics_v2.snapshot_date to read counts_by_year from. Default: today. "
                   "MUST match stage 6b's snapshot.")
@click.option("--dry-run", is_flag=True, help="Compute + preview, write nothing (default).")
@click.option("--execute", is_flag=True, help="Run the UPDATE.")
@click.option("--preview-limit", default=25, type=int, help="Rows to show in the dry-run preview.")
def main(
    ta_slug: str,
    ingestion_run_id: Optional[str],
    snapshot_date: Optional[str],
    dry_run: bool,
    execute: bool,
    preview_limit: int,
) -> None:
    load_dotenv()
    db_url = get_required_env("DATABASE_URL")

    snapshot = snapshot_date or date.today().isoformat()
    current_year = date.today().year
    write = execute and not dry_run  # dry-run is the safe default

    incremental = bool(ingestion_run_id)
    scope_subquery = SCOPE_INCREMENTAL if incremental else SCOPE_FULL_TA
    cte = build_cte(scope_subquery)

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Resolve TA slug -> id (+ name for the banner).
            cur.execute("SELECT id, name FROM therapeutic_areas WHERE slug = %s", (ta_slug,))
            ta_row = cur.fetchone()
            if not ta_row:
                raise SystemExit(f"No therapeutic_area with slug '{ta_slug}'.")
            ta_id = str(ta_row["id"])
            ta_name = ta_row["name"]

            params = {
                "snapshot_date": snapshot,
                "ta_id": ta_id,
                "run_id": ingestion_run_id,
                "current_year": current_year,
                "preview_limit": preview_limit,
            }

            scope_label = (
                f"ingestion_run_id={ingestion_run_id} (incremental: this cycle's new HCPs)"
                if incremental else
                f"ALL HCPs tagged to '{ta_name}' (full backfill)"
            )

            # --- Banner ---
            print("=" * 72)
            print("  STAGE 6c - career_first_pub_year_v2 (sustained-onset)")
            print("=" * 72)
            print(f"  TA:            {ta_name}  (slug={ta_slug})")
            print(f"  ta_id:         {ta_id}")
            print(f"  *** snapshot_date: {snapshot}  <- MUST match stage 6b's enrichment snapshot ***")
            print(f"  Scope:         {scope_label}")
            print(f"  Mode:          {'EXECUTE (writes)' if write else 'DRY-RUN (no writes)'}")
            print("=" * 72)

            if not write:
                # Total scoped HCPs that would be updated.
                cur.execute(cte + "SELECT COUNT(*) AS n FROM resolved", params)
                total = cur.fetchone()["n"]
                print(f"\nScoped HCPs with counts_by_year at {snapshot}: {total:,} (all get a new_start).")

                # Preview.
                cur.execute(
                    cte + """
                    SELECT hcp_id, start_sustained, start_2paper, start_earliest, new_start,
                           (%(current_year)s - new_start) AS implied_career_age
                    FROM resolved
                    ORDER BY new_start NULLS LAST
                    LIMIT %(preview_limit)s
                    """,
                    params,
                )
                rows = cur.fetchall()
                print(f"\nPreview (first {len(rows)} by earliest new_start):")
                print(f"  {'hcp_id':38} {'sust':>5} {'2pap':>5} {'earl':>5} {'NEW':>5} {'age':>4}")
                for r in rows:
                    print(f"  {str(r['hcp_id']):38} "
                          f"{_fmt(r['start_sustained']):>5} {_fmt(r['start_2paper']):>5} "
                          f"{_fmt(r['start_earliest']):>5} {_fmt(r['new_start']):>5} "
                          f"{_fmt(r['implied_career_age']):>4}")
                print(f"\n[DRY-RUN] No rows written. Re-run with --execute to write.")
                return

            # --- Execute: run the exact WITH...UPDATE, with a belt-and-suspenders scope guard. ---
            update_sql = (
                cte
                + "UPDATE hcps_v2 h SET career_first_pub_year_v2 = r.new_start "
                  "FROM resolved r WHERE r.hcp_id = h.id"
            )
            if incremental:
                # Redundant with the CTE scope, but guards the UPDATE from touching any HCP
                # outside this cycle's ingestion_run_id.
                update_sql += " AND h.ingestion_run_id = %(run_id)s"

            cur.execute(update_sql, params)
            updated = cur.rowcount
            conn.commit()
            print(f"\n{updated:,} rows updated.")

            # VERIFY: scoped HCPs now non-null.
            if incremental:
                cur.execute(
                    "SELECT COUNT(*) AS n FROM hcps_v2 "
                    "WHERE ingestion_run_id = %(run_id)s AND career_first_pub_year_v2 IS NOT NULL",
                    params,
                )
            else:
                cur.execute(
                    "SELECT COUNT(*) AS n FROM hcps_v2 WHERE id IN "
                    "(SELECT hcp_id FROM hcp_therapeutic_areas_v2 WHERE therapeutic_area_id = %(ta_id)s) "
                    "AND career_first_pub_year_v2 IS NOT NULL",
                    params,
                )
            verified = cur.fetchone()["n"]
            print(f"VERIFY: {verified:,} scoped HCPs now have career_first_pub_year_v2 non-null.")


def _fmt(v: object) -> str:
    return "-" if v is None else str(v)


if __name__ == "__main__":
    main()
