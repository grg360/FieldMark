"""
compute_top_collaborators.py — Top-N co-authorship collaborators per HCP by TA.

Populates hcp_top_collaborators_v2 from publication co-authorship edges.

Usage:
    python compute_top_collaborators.py --ta nsclc
    python compute_top_collaborators.py --ta nsclc --dry-run --top-n 5

Required environment variables (.env):
    DATABASE_URL
"""

from __future__ import annotations

import os
import sys

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def get_conn():
    if not DATABASE_URL:
        raise EnvironmentError("Missing DATABASE_URL")
    return psycopg2.connect(DATABASE_URL)


# TA RESOLUTION MOVED TO scripts/utils/ta_registry.py (2026-08-27).
# Replaced a local resolve_ta_id that was one of NINE near-identical copies across sixteen
# scripts -- same query, different return types (str(row[0]) / row[0] / row["id"]) and
# different exceptions (ValueError / RuntimeError / SystemExit). Fifteen of them reported only
# "TA slug not found: <slug>", which repeats the typo back without saying what IS valid.
# The shared resolver caches per process and raises with the full slug list.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta_id  # noqa: E402,F401


def compute_top_collaborators(conn, ta_id, window_years, top_n):
    """Returns list of (hcp_id, collaborator_hcp_id, shared_pubs, rank) tuples."""
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH ta_pubs AS (
              SELECT p.id
              FROM publications_v2 p
              JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
              WHERE pta.therapeutic_area_id = %s
                AND p.pub_year >= EXTRACT(YEAR FROM now())::int - %s
            ),
            hcp_edges AS (
              SELECT
                pa1.hcp_id,
                pa2.hcp_id AS collaborator_hcp_id,
                COUNT(DISTINCT pa1.publication_id) AS shared_pubs
              FROM publication_authors_v2 pa1
              JOIN publication_authors_v2 pa2
                ON pa2.publication_id = pa1.publication_id
                AND pa2.hcp_id <> pa1.hcp_id
              JOIN ta_pubs tp ON tp.id = pa1.publication_id
              GROUP BY pa1.hcp_id, pa2.hcp_id
            ),
            ranked AS (
              SELECT
                hcp_id,
                collaborator_hcp_id,
                shared_pubs,
                ROW_NUMBER() OVER (PARTITION BY hcp_id ORDER BY shared_pubs DESC) AS rn
              FROM hcp_edges
            )
            SELECT hcp_id, collaborator_hcp_id, shared_pubs, rn AS rank
            FROM ranked
            WHERE rn <= %s
            """,
            (ta_id, window_years, top_n),
        )
        return cur.fetchall()


def truncate_existing(conn, ta_id, window_type):
    """Removes existing rows for this TA + window before re-inserting."""
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM hcp_top_collaborators_v2
            WHERE therapeutic_area_id = %s
              AND window_type = %s
            """,
            (ta_id, window_type),
        )


def upsert_collaborators(conn, ta_id, window_type, rows):
    if not rows:
        return 0
    values = [
        (r[0], ta_id, window_type, int(r[3]), r[1], int(r[2]))
        for r in rows
    ]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO hcp_top_collaborators_v2
              (hcp_id, therapeutic_area_id, window_type, rank,
               collaborator_hcp_id, shared_publications)
            VALUES %s
            ON CONFLICT (hcp_id, therapeutic_area_id, window_type, rank)
            DO UPDATE SET
              collaborator_hcp_id = EXCLUDED.collaborator_hcp_id,
              shared_publications = EXCLUDED.shared_publications,
              computed_at = now()
            """,
            values,
        )
    return len(values)


def write_collaborators(conn, ta_id, window_type, rows):
    try:
        truncate_existing(conn, ta_id, window_type)
        n = upsert_collaborators(conn, ta_id, window_type, rows)
        conn.commit()
        return n
    except Exception:
        conn.rollback()
        raise


def sample_print(conn, rows):
    """For dry-run: print first 5 HCPs' top collaborators."""
    by_hcp: dict = {}
    for r in rows:
        by_hcp.setdefault(r[0], []).append(r)

    sample_ids = list(by_hcp.keys())[:5]

    name_ids = set(sample_ids)
    for hcp_id in sample_ids:
        for collab_row in by_hcp[hcp_id]:
            name_ids.add(collab_row[1])

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, first_name, last_name
            FROM hcps_v2
            WHERE id::text = ANY(%s)
            """,
            ([str(h) for h in name_ids],),
        )
        names = {row[0]: f"{row[1]} {row[2]}" for row in cur.fetchall()}

    print("\n=== Sample: top collaborators for 5 HCPs ===")
    for hcp_id in sample_ids:
        hcp_name = names.get(str(hcp_id), "?")
        print(f"\n{hcp_name}")
        for r in sorted(by_hcp[hcp_id], key=lambda x: x[3]):
            collab_name = names.get(str(r[1]), "?")
            print(f"  {r[3]}. {collab_name} ({r[2]} shared pubs)")


@click.command()
@click.option("--ta", default="nsclc", help="Therapeutic area slug")
@click.option("--window-years", default=10, type=int, help="Publication lookback window in years")
@click.option("--window-type", default="10yr", help="Label stored in hcp_top_collaborators_v2.window_type")
@click.option("--top-n", default=5, type=int, help="Top N collaborators per HCP")
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
def main(ta: str, window_years: int, window_type: str, top_n: int, dry_run: bool) -> None:
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(f"Computing top {top_n} collaborators for TA={ta} window={window_years}yr")

    rows = compute_top_collaborators(conn, ta_id, window_years, top_n)
    print(f"Found {len(rows)} (hcp, collaborator) edges across all HCPs")

    if dry_run:
        if rows:
            sample_print(conn, rows)
        print(f"\n[dry-run] would have written {len(rows)} rows")
    else:
        print("Removing existing rows for this TA + window...")
        print("Inserting new rows...")
        n = write_collaborators(conn, ta_id, window_type, rows)
        print(f"Wrote {n} rows to hcp_top_collaborators_v2")

        # ALL-FAILED RULE. attempted = collaborator edges the query produced, succeeded = rows
        # written. This one is worth guarding despite having no swallow handlers, because
        # write_collaborators TRUNCATES the TA's rows before inserting: a run that computes
        # edges and then writes none does not leave the old data in place, it leaves the table
        # empty. A TA with no co-authorship edges yields rows == [] and stays quiet.
        if rows and not n:
            print(f"[FAIL] 0 of {len(rows):,} collaborator rows written after the delete.",
                  file=sys.stderr)
            conn.close()
            raise SystemExit(1)

    conn.close()


if __name__ == "__main__":
    main()
