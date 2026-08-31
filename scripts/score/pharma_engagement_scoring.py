"""
pharma_engagement_scoring.py — Pharma Engagement subscore for HCPs by TA.

Uses 3-year Open Payments aggregates from hcp_open_payments_by_ta_v2 and
writes scores to hcp_pharma_engagement_v2.

Usage:
    python pharma_engagement_scoring.py --ta nsclc
    python pharma_engagement_scoring.py --ta nsclc --dry-run --debug-top 20

Required environment variables (.env):
    DATABASE_URL
"""

from __future__ import annotations

import math
import os

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor, execute_values

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

W_PAYMENTS = 0.30
W_COMPANIES = 0.35
W_DRUGS = 0.25
W_COUNT = 0.10


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


def fetch_payment_data(conn, ta_id):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
              hcp_id,
              COALESCE(ta_payments_3yr, 0) AS total_payments_3yr,
              COALESCE(ta_distinct_companies_3yr, 0) AS distinct_companies_3yr,
              COALESCE(ta_distinct_drugs_3yr, 0) AS distinct_drugs_3yr,
              COALESCE(ta_payments_count_3yr, 0) AS payment_count_3yr
            FROM hcp_open_payments_by_ta_v2
            WHERE therapeutic_area_id = %s
            """,
            (ta_id,),
        )
        return cur.fetchall()


def compute_percentiles(values_dict):
    """Continuous 0-100 rank percentile, each unique."""
    if not values_dict:
        return {}
    items = sorted(values_dict.items(), key=lambda kv: kv[1], reverse=True)
    n = len(items)
    out = {}
    # PERCENTILE CONVENTION (2026-08-18) — see docs/canonical/PERCENTILE_CONVENTION.md.
    # Weibull plotting position: 100 * (n + 1 - rank) / (n + 1), which for this
    # 0-indexed descending loop is 100 * (n - position) / (n + 1).
    #
    # It replaced 100.0 * (1.0 - position / (n - 1)), which put the first member at
    # EXACTLY 100.0 and the last at EXACTLY 0.0 — artifacts of a finite list rendered
    # as facts. First of 251 is standing above 250 measured people, not above everyone.
    #
    # AFFINE IN THE OLD VALUE: p_new = a * p_old + b, a = (n-1)/(n+1), b = 100/(n+1).
    # Both constants depend only on n, so ORDER WITHIN THIS COLUMN IS UNCHANGED. The
    # same two lines appear in eight sibling scorers; they are one convention, and the
    # doc lists all nine.
    #
    # n == 1 no longer needs a special case (the denominator is n+1, never zero) and
    # returns 50.0 rather than 100.0 — a lone member is neither top nor bottom.
    for position, (key, _) in enumerate(items):
        percentile = 100.0 * (n - position) / (n + 1)
        out[key] = round(percentile, 2)
    return out


def lookup_hcp_names(conn, hcp_ids):
    if not hcp_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, first_name, last_name
            FROM hcps_v2
            WHERE id::text = ANY(%s)
            """,
            ([str(h) for h in hcp_ids],),
        )
        return {row[0]: (row[1], row[2]) for row in cur.fetchall()}


def upsert_results(conn, ta_id, rows):
    if not rows:
        return 0
    values = [
        (
            r["hcp_id"],
            ta_id,
            float(r["total_payments_3yr"]),
            int(r["distinct_companies_3yr"]),
            int(r["distinct_drugs_3yr"]),
            int(r["payment_count_3yr"]),
            float(r["raw_score"]),
            float(r["percentile_rank"]),
        )
        for r in rows
    ]
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO hcp_pharma_engagement_v2
                  (hcp_id, therapeutic_area_id,
                   total_payments_3yr, distinct_companies_3yr,
                   distinct_drugs_3yr, payment_count_3yr,
                   raw_score, percentile_rank)
                VALUES %s
                ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE SET
                  total_payments_3yr = EXCLUDED.total_payments_3yr,
                  distinct_companies_3yr = EXCLUDED.distinct_companies_3yr,
                  distinct_drugs_3yr = EXCLUDED.distinct_drugs_3yr,
                  payment_count_3yr = EXCLUDED.payment_count_3yr,
                  raw_score = EXCLUDED.raw_score,
                  percentile_rank = EXCLUDED.percentile_rank,
                  computed_at = now()
                """,
                values,
            )
        conn.commit()
        return len(values)
    except Exception:
        conn.rollback()
        raise


@click.command()
@click.option("--ta", default="nsclc", help="Therapeutic area slug")
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N by raw score")
def main(ta: str, dry_run: bool, debug_top: int) -> None:
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(f"Computing Pharma Engagement Score for TA: {ta}")

    payment_data = fetch_payment_data(conn, ta_id)
    print(f"Found {len(payment_data)} HCPs with TA payment data")

    if not payment_data:
        print("No data. Exiting.")
        conn.close()
        return

    log_payments = {
        r["hcp_id"]: math.log10(float(r["total_payments_3yr"]) + 1) for r in payment_data
    }
    companies = {r["hcp_id"]: int(r["distinct_companies_3yr"]) for r in payment_data}
    drugs = {r["hcp_id"]: int(r["distinct_drugs_3yr"]) for r in payment_data}
    counts = {r["hcp_id"]: int(r["payment_count_3yr"]) for r in payment_data}

    print("Computing input percentiles...")
    pct_payments = compute_percentiles(log_payments)
    pct_companies = compute_percentiles(companies)
    pct_drugs = compute_percentiles(drugs)
    pct_counts = compute_percentiles(counts)

    rows = []
    for r in payment_data:
        hcp_id = r["hcp_id"]
        raw = (
            W_PAYMENTS * pct_payments.get(hcp_id, 0)
            + W_COMPANIES * pct_companies.get(hcp_id, 0)
            + W_DRUGS * pct_drugs.get(hcp_id, 0)
            + W_COUNT * pct_counts.get(hcp_id, 0)
        )
        rows.append(
            {
                "hcp_id": hcp_id,
                "total_payments_3yr": r["total_payments_3yr"],
                "distinct_companies_3yr": r["distinct_companies_3yr"],
                "distinct_drugs_3yr": r["distinct_drugs_3yr"],
                "payment_count_3yr": r["payment_count_3yr"],
                "raw_score": raw,
            }
        )

    raw_scores = {r["hcp_id"]: r["raw_score"] for r in rows}
    final_pctiles = compute_percentiles(raw_scores)

    for r in rows:
        r["percentile_rank"] = final_pctiles.get(r["hcp_id"], 0)

    sorted_rows = sorted(rows, key=lambda r: r["raw_score"], reverse=True)
    top_n = sorted_rows[:debug_top]
    names = lookup_hcp_names(conn, [r["hcp_id"] for r in top_n])

    print(f"\n=== Top {debug_top} by Pharma Engagement ({ta}) ===")
    print(f"{'Rk':<4} {'Name':<28} {'Pctl':<7} {'$':<10} {'Cos':<4} {'Drugs':<6} {'Cnt':<5}")
    for i, r in enumerate(top_n, 1):
        fn, ln = names.get(str(r["hcp_id"]), ("?", "?"))
        name = f"{fn} {ln}"
        print(
            f"{i:<4} {name[:27]:<28} {r['percentile_rank']:<7.2f} "
            f"${r['total_payments_3yr']:<9.0f} {r['distinct_companies_3yr']:<4} "
            f"{r['distinct_drugs_3yr']:<6} {r['payment_count_3yr']:<5}"
        )

    if dry_run:
        print(f"\n[dry-run] would have written {len(rows)} rows")
    else:
        n = upsert_results(conn, ta_id, rows)
        print(f"\nWrote {n} rows to hcp_pharma_engagement_v2")

    conn.close()


if __name__ == "__main__":
    main()
