"""
take_weekly_snapshot.py

Captures a weekly snapshot of hcp_rising_star_ranks_v3 and 
hcp_established_ranks_v3 into history tables for momentum/delta 
computations.

Run weekly via GitHub Actions cron. Idempotent — re-running the same 
day uses ON CONFLICT DO NOTHING.

Usage:
    python pipelines/take_weekly_snapshot.py
    python pipelines/take_weekly_snapshot.py --date 2026-06-08  # override

Env vars required:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import os
import sys
from datetime import date

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set in environment or .env file")
        sys.exit(1)
    return psycopg2.connect(url)


def take_rising_star_snapshot(conn, snapshot_date):
    print(f"\n=== Rising Star snapshot for {snapshot_date} ===")
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                hcp_id, 
                therapeutic_area_id,
                us_rank,
                rank as global_rank,
                rising_star_percentile,
                archetype,
                scientific_momentum_percentile,
                network_momentum_percentile,
                scientific_visibility_percentile,
                network_visibility_percentile
            FROM hcp_rising_star_ranks_v3
        """)
        rows = cur.fetchall()
    
    print(f"Source rows: {len(rows):,}")
    
    if not rows:
        print("No rising star data to snapshot. Skipping.")
        return
    
    # Prepare for batch insert
    values = [
        (
            snapshot_date,
            r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]
        )
        for r in rows
    ]
    
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO hcp_rising_star_snapshots (
                snapshot_date,
                hcp_id,
                therapeutic_area_id,
                us_rank,
                global_rank,
                rising_star_percentile,
                archetype,
                scientific_momentum_percentile,
                network_momentum_percentile,
                scientific_visibility_percentile,
                network_visibility_percentile
            ) VALUES %s
            ON CONFLICT (snapshot_date, hcp_id, therapeutic_area_id) 
            DO NOTHING
            """,
            values,
            page_size=500,
        )
        inserted = cur.rowcount
    
    conn.commit()
    print(f"Inserted: {inserted:,} rows into hcp_rising_star_snapshots")


def take_established_snapshot(conn, snapshot_date):
    print(f"\n=== Established snapshot for {snapshot_date} ===")
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                hcp_id,
                therapeutic_area_id,
                scope_type,
                scope_value,
                rank,
                cohort_score
            FROM hcp_established_ranks_v3
        """)
        rows = cur.fetchall()
    
    print(f"Source rows: {len(rows):,}")
    
    if not rows:
        print("No established data to snapshot. Skipping.")
        return
    
    values = [
        (
            snapshot_date,
            r[0],   # hcp_id
            r[1],   # therapeutic_area_id
            r[2],   # scope_type
            r[3],   # scope_value
            r[4],   # rank -> us_rank (when scope_value='US')
            r[5],   # cohort_score
        )
        for r in rows
    ]
    
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO hcp_established_snapshots (
                snapshot_date,
                hcp_id,
                therapeutic_area_id,
                scope_type,
                scope_value,
                us_rank,
                cohort_score
            ) VALUES %s
            ON CONFLICT (snapshot_date, hcp_id, therapeutic_area_id, scope_type, COALESCE(scope_value, '__null__')) 
            DO NOTHING
            """,
            values,
            page_size=500,
        )
        inserted = cur.rowcount
    
    conn.commit()
    print(f"Inserted: {inserted:,} rows into hcp_established_snapshots")


def take_community_snapshot(conn, snapshot_date):
    print(f"\n=== Community snapshot for {snapshot_date} ===")

    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                hcp_id,
                therapeutic_area_id,
                scope_type,
                scope_value,
                rank,
                composite_score,
                normalized_score
            FROM hcp_community_ranks_v2
        """)
        rows = cur.fetchall()

    print(f"Source rows: {len(rows):,}")

    if not rows:
        print("No community data to snapshot. Skipping.")
        return

    values = [
        (snapshot_date, r[0], r[1], r[2], r[3], r[4], r[5], r[6])
        for r in rows
    ]

    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO hcp_community_snapshots (
                snapshot_date,
                hcp_id,
                therapeutic_area_id,
                scope_type,
                scope_value,
                rank,
                composite_score,
                normalized_score
            ) VALUES %s
            ON CONFLICT (snapshot_date, hcp_id, therapeutic_area_id, scope_type, COALESCE(scope_value, '__null__')) 
            DO NOTHING
            """,
            values,
            page_size=500,
        )
        inserted = cur.rowcount

    conn.commit()
    print(f"Inserted: {inserted:,} rows into hcp_community_snapshots")


def report_history(conn):
    """Print summary of snapshots in the database."""
    print("\n=== Snapshot history ===")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT snapshot_date, COUNT(*) AS row_count
            FROM hcp_rising_star_snapshots
            GROUP BY snapshot_date
            ORDER BY snapshot_date DESC
            LIMIT 10
        """)
        print("\nRising Star snapshots:")
        for row in cur.fetchall():
            print(f"  {row[0]}: {row[1]:,} rows")
        
        cur.execute("""
            SELECT snapshot_date, COUNT(*) AS row_count
            FROM hcp_established_snapshots
            GROUP BY snapshot_date
            ORDER BY snapshot_date DESC
            LIMIT 10
        """)
        print("\nEstablished snapshots:")
        for row in cur.fetchall():
            print(f"  {row[0]}: {row[1]:,} rows")

        cur.execute("""
            SELECT snapshot_date, COUNT(*) AS row_count
            FROM hcp_community_snapshots
            GROUP BY snapshot_date
            ORDER BY snapshot_date DESC
            LIMIT 10
        """)
        print("\nCommunity snapshots:")
        for row in cur.fetchall():
            print(f"  {row[0]}: {row[1]:,} rows")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Override snapshot date (YYYY-MM-DD). Defaults to today.",
    )
    args = parser.parse_args()
    
    if args.date:
        snapshot_date = date.fromisoformat(args.date)
    else:
        snapshot_date = date.today()
    
    print(f"Snapshot date: {snapshot_date}")
    
    conn = get_connection()
    try:
        take_rising_star_snapshot(conn, snapshot_date)
        take_established_snapshot(conn, snapshot_date)
        # Community snapshots STOPPED (Phase 3, 2026-08-11): community is not
        # ranked — there is no rank/composite/normalized_score to archive, and
        # the arm was the script's last reader of the frozen score columns.
        # take_community_snapshot stays defined for history's sake but must not
        # run. hcp_community_snapshots (160,712 rows through 2026-08-05) is
        # retained as the historical record of the ranked era. A future
        # community WHAT-MOVED (tier transitions + fact changes) needs a NEW
        # snapshot shape, not this one.
        # take_community_snapshot(conn, snapshot_date)
        report_history(conn)
    finally:
        conn.close()
    
    print("\nSnapshot complete.")


if __name__ == "__main__":
    main()