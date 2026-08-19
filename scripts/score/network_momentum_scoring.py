"""
network_momentum_scoring.py — Network Momentum subscore for Rising Stars.

Measures change in co-authorship network centrality between an early window
(default hist_2016_2020) and a recent window (default recent_2021_2025) for
ACADEMIC HCPs in a TA.

Signals (weighted):
  50% Eigenvector Percentile Delta
  30% Degree Percentile Delta
  20% Betweenness Percentile Delta

Usage:
    python network_momentum_scoring.py --ta nsclc
    python network_momentum_scoring.py --ta nsclc --dry-run --debug-top 30

Required environment variables (.env):
    DATABASE_URL (port 5432 direct connection, not pooler 6543)

Dependencies:
    pip install psycopg2-binary python-dotenv click scipy
"""

from __future__ import annotations
from datetime import datetime, timezone

import os
from collections import defaultdict
from uuid import uuid4

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from scipy.stats import rankdata

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

CURRENT_YEAR = datetime.now(timezone.utc).year  # was frozen at 2026; career-age arithmetic must track the clock
MAX_CAREER_YEARS = 15
MIN_COLLABORATORS_PER_WINDOW = 20

W_EIGENVECTOR = 0.50
W_DEGREE = 0.30
W_BETWEENNESS = 0.20

UPSERT_BATCH_SIZE = 2000


def get_conn():
    if not DATABASE_URL:
        raise EnvironmentError("Missing DATABASE_URL")
    return psycopg2.connect(DATABASE_URL)


def resolve_ta_id(conn, slug: str) -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM therapeutic_areas WHERE slug = %s", (slug,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"TA slug not found: {slug}")
        return str(row[0])


def fetch_centrality_rows(
    conn,
    ta_id: str,
    early_window_type: str,
    recent_window_type: str,
) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              c.hcp_id,
              c.window_type,
              c.degree_percentile,
              c.eigenvector_percentile,
              c.betweenness_percentile,
              c.collaborator_count
            FROM hcp_network_centrality_v2 c
            JOIN hcp_industry_classification_v1 ic ON ic.hcp_id = c.hcp_id
            JOIN hcps_v2 h ON h.id = c.hcp_id
            WHERE c.therapeutic_area_id = %s
              AND c.window_type IN (%s, %s)
              AND ic.classification = 'ACADEMIC'
              AND h.career_first_pub_year_v2 IS NOT NULL
              AND (%s - h.career_first_pub_year_v2) <= %s
            """,
            (
                ta_id,
                early_window_type,
                recent_window_type,
                CURRENT_YEAR,
                MAX_CAREER_YEARS,
            ),
        )
        return [
            {
                "hcp_id": str(row[0]),
                "window_type": row[1],
                "degree_percentile": float(row[2]) if row[2] is not None else 0.0,
                "eigenvector_percentile": float(row[3]) if row[3] is not None else 0.0,
                "betweenness_percentile": float(row[4]) if row[4] is not None else 0.0,
                "collaborator_count": int(row[5]) if row[5] is not None else 0,
            }
            for row in cur.fetchall()
        ]


def compute_percentile_ranks(hcp_ids: list[str], values: dict[str, float]) -> dict[str, float]:
    if not hcp_ids:
        return {}
    n = len(hcp_ids)
    ordered_values = [values[hcp_id] for hcp_id in hcp_ids]
    ranks = rankdata(ordered_values, method="average")
    # PERCENTILE CONVENTION (2026-08-18) — see docs/PERCENTILE_CONVENTION.md.
    # Weibull plotting position. rankdata gives 1 = lowest, so ascending rank r maps
    # to 100 * r / (n + 1); the highest value (r = n) lands at 100n/(n+1), the lowest
    # at 100/(n+1).
    #
    # It replaced 100.0 * (r - 1) / (n - 1), which put the top at EXACTLY 100.0 and the
    # bottom at EXACTLY 0.0 — artifacts of a finite list rendered as facts.
    #
    # AFFINE IN THE OLD VALUE: p_new = a * p_old + b, a = (n-1)/(n+1), b = 100/(n+1),
    # so ORDER WITHIN THIS COLUMN IS UNCHANGED. method="average" still shares a value
    # between genuine ties. Eight sibling scorers carry the same convention.
    #
    # n == 1 no longer needs a special case (denominator n+1 is never zero) and returns
    # 50.0 rather than 100.0 — a lone member is neither top nor bottom.
    return {
        hcp_id: round(100.0 * ranks[i] / (n + 1), 2)
        for i, hcp_id in enumerate(hcp_ids)
    }


def build_eligible_results(
    rows: list[dict],
    early_window_type: str,
    recent_window_type: str,
) -> list[dict]:
    hcp_windows: dict[str, dict[str, dict]] = defaultdict(dict)
    for row in rows:
        hcp_windows[row["hcp_id"]][row["window_type"]] = row

    eligible: list[dict] = []
    for hcp_id, windows in hcp_windows.items():
        if early_window_type not in windows or recent_window_type not in windows:
            continue

        early = windows[early_window_type]
        recent = windows[recent_window_type]

        if (
            early["collaborator_count"] < MIN_COLLABORATORS_PER_WINDOW
            or recent["collaborator_count"] < MIN_COLLABORATORS_PER_WINDOW
        ):
            continue

        eligible.append(
            {
                "hcp_id": hcp_id,
                "early_collaborator_count": early["collaborator_count"],
                "recent_collaborator_count": recent["collaborator_count"],
                "early_degree_pctile": early["degree_percentile"],
                "recent_degree_pctile": recent["degree_percentile"],
                "early_eigenvector_pctile": early["eigenvector_percentile"],
                "recent_eigenvector_pctile": recent["eigenvector_percentile"],
                "early_betweenness_pctile": early["betweenness_percentile"],
                "recent_betweenness_pctile": recent["betweenness_percentile"],
                "degree_delta": recent["degree_percentile"] - early["degree_percentile"],
                "eigenvector_delta": (
                    recent["eigenvector_percentile"] - early["eigenvector_percentile"]
                ),
                "betweenness_delta": (
                    recent["betweenness_percentile"] - early["betweenness_percentile"]
                ),
            }
        )

    if not eligible:
        return []

    hcp_ids = [r["hcp_id"] for r in eligible]

    degree_delta_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["degree_delta"] for r in eligible}
    )
    eigenvector_delta_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["eigenvector_delta"] for r in eligible}
    )
    betweenness_delta_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["betweenness_delta"] for r in eligible}
    )

    for row in eligible:
        hcp_id = row["hcp_id"]
        row["degree_delta_pctile"] = degree_delta_pctiles[hcp_id]
        row["eigenvector_delta_pctile"] = eigenvector_delta_pctiles[hcp_id]
        row["betweenness_delta_pctile"] = betweenness_delta_pctiles[hcp_id]
        row["network_momentum_raw"] = round(
            W_EIGENVECTOR * row["eigenvector_delta_pctile"]
            + W_DEGREE * row["degree_delta_pctile"]
            + W_BETWEENNESS * row["betweenness_delta_pctile"],
            2,
        )

    momentum_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["network_momentum_raw"] for r in eligible}
    )
    for row in eligible:
        row["network_momentum_percentile"] = momentum_pctiles[row["hcp_id"]]

    return eligible


def lookup_hcp_debug_info(
    conn, hcp_ids: list[str]
) -> dict[str, tuple[str, str, str | None, str | None, int | None]]:
    if not hcp_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, first_name, last_name, institution_normalized,
                   country, career_first_pub_year_v2
            FROM hcps_v2
            WHERE id::text = ANY(%s)
            """,
            (hcp_ids,),
        )
        return {
            row[0]: (row[1], row[2], row[3], row[4], row[5])
            for row in cur.fetchall()
        }


def upsert_results(
    conn,
    ta_id: str,
    results: list[dict],
    run_id: str,
    early_window_type: str,
    recent_window_type: str,
    window_dates=(None, None, None, None),
) -> int:
    if not results:
        return 0

    values = [
        (
            r["hcp_id"],
            ta_id,
            window_dates[0], window_dates[1], window_dates[2], window_dates[3],
            early_window_type,
            recent_window_type,
            int(r["early_collaborator_count"]),
            int(r["recent_collaborator_count"]),
            float(r["early_degree_pctile"]),
            float(r["recent_degree_pctile"]),
            float(r["degree_delta"]),
            float(r["early_eigenvector_pctile"]),
            float(r["recent_eigenvector_pctile"]),
            float(r["eigenvector_delta"]),
            float(r["early_betweenness_pctile"]),
            float(r["recent_betweenness_pctile"]),
            float(r["betweenness_delta"]),
            float(r["degree_delta_pctile"]),
            float(r["eigenvector_delta_pctile"]),
            float(r["betweenness_delta_pctile"]),
            float(r["network_momentum_raw"]),
            float(r["network_momentum_percentile"]),
            run_id,
        )
        for r in results
    ]

    sql = """
        INSERT INTO hcp_network_momentum_v1
          (hcp_id, therapeutic_area_id,
           early_window_start, early_window_end, recent_window_start, recent_window_end,
           early_window_type, recent_window_type,
           early_collaborator_count, recent_collaborator_count,
           early_degree_percentile, recent_degree_percentile, degree_delta,
           early_eigenvector_percentile, recent_eigenvector_percentile, eigenvector_delta,
           early_betweenness_percentile, recent_betweenness_percentile, betweenness_delta,
           degree_delta_percentile, eigenvector_delta_percentile, betweenness_delta_percentile,
           network_momentum_raw, network_momentum_percentile,
           enrichment_run_id)
        VALUES %s
        ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE SET
          early_window_start = EXCLUDED.early_window_start,
          early_window_end = EXCLUDED.early_window_end,
          recent_window_start = EXCLUDED.recent_window_start,
          recent_window_end = EXCLUDED.recent_window_end,
          early_window_type = EXCLUDED.early_window_type,
          recent_window_type = EXCLUDED.recent_window_type,
          early_collaborator_count = EXCLUDED.early_collaborator_count,
          recent_collaborator_count = EXCLUDED.recent_collaborator_count,
          early_degree_percentile = EXCLUDED.early_degree_percentile,
          recent_degree_percentile = EXCLUDED.recent_degree_percentile,
          degree_delta = EXCLUDED.degree_delta,
          early_eigenvector_percentile = EXCLUDED.early_eigenvector_percentile,
          recent_eigenvector_percentile = EXCLUDED.recent_eigenvector_percentile,
          eigenvector_delta = EXCLUDED.eigenvector_delta,
          early_betweenness_percentile = EXCLUDED.early_betweenness_percentile,
          recent_betweenness_percentile = EXCLUDED.recent_betweenness_percentile,
          betweenness_delta = EXCLUDED.betweenness_delta,
          degree_delta_percentile = EXCLUDED.degree_delta_percentile,
          eigenvector_delta_percentile = EXCLUDED.eigenvector_delta_percentile,
          betweenness_delta_percentile = EXCLUDED.betweenness_delta_percentile,
          network_momentum_raw = EXCLUDED.network_momentum_raw,
          network_momentum_percentile = EXCLUDED.network_momentum_percentile,
          computed_at = now(),
          enrichment_run_id = EXCLUDED.enrichment_run_id
    """

    # DE-LIST (2026-08-05, rolling windows): rows for this TA whose hcp_id is

    # not in the new result set are removed — an upsert-only recompute leaves

    # members who no longer clear the thresholds holding stale window rows,

    # which the ranks join then scores from mixed vintages (the 142/62-row

    # contamination found on the first rolling run). Empty result sets delete

    # nothing (guarded at function entry).

    keep_ids = sorted({r["hcp_id"] for r in results})

    with conn.cursor() as _cur:

        _cur.execute(

            "DELETE FROM hcp_network_momentum_v1 "

            "WHERE therapeutic_area_id = %s AND NOT (hcp_id = ANY(%s::uuid[]))",

            (ta_id, keep_ids),

        )

        if _cur.rowcount:

            print(f"[upsert] de-listed {_cur.rowcount} stale row(s) not in the new result set")

    try:
        with conn.cursor() as cur:
            for start in range(0, len(values), UPSERT_BATCH_SIZE):
                execute_values(cur, sql, values[start : start + UPSERT_BATCH_SIZE])
        conn.commit()
        return len(values)
    except Exception:
        conn.rollback()
        raise


@click.command()
@click.option("--ta", default="nsclc", help="Therapeutic area slug")
@click.option(
    "--early-window-type",
    default="hist_2016_2020",
    help="Early centrality window_type label in hcp_network_centrality_v2",
)
@click.option(
    "--recent-window-type",
    default="recent_2021_2025",
    help="Recent centrality window_type label in hcp_network_centrality_v2",
)
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--early-start-date", default=None, help="Rolling early window start (YYYY-MM-DD) — recorded on rows")
@click.option("--early-end-date", default=None)
@click.option("--recent-start-date", default=None)
@click.option("--recent-end-date", default=None)
@click.option("--debug-top", default=20, type=int, help="Print top N by network_momentum_percentile")
def main(
    ta: str,
    early_window_type: str,
    recent_window_type: str,
    dry_run: bool,
    debug_top: int,
    early_start_date: str | None,
    early_end_date: str | None,
    recent_start_date: str | None,
    recent_end_date: str | None,
) -> None:
    run_id = str(uuid4())
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(
        f"Computing network momentum for TA={ta} "
        f"early={early_window_type} recent={recent_window_type}"
    )
    print("Fetching centrality rows...")
    rows = fetch_centrality_rows(conn, ta_id, early_window_type, recent_window_type)
    print(f"Loaded {len(rows):,} centrality rows")

    print("Aggregating and scoring eligible ACADEMIC HCPs...")
    results = build_eligible_results(rows, early_window_type, recent_window_type)
    print(f"Eligible HCPs: {len(results):,}")

    if not results:
        print("No eligible HCPs found. Exiting.")
        conn.close()
        return

    sorted_results = sorted(
        results, key=lambda r: r["network_momentum_percentile"], reverse=True
    )
    top_n = sorted_results[:debug_top]
    hcp_info = lookup_hcp_debug_info(conn, [r["hcp_id"] for r in top_n])

    print(f"\n=== Top {debug_top} by Network Momentum Percentile ({ta}) ===")
    print(
        f"{'Rk':<4} {'Name':<24} {'Inst':<24} {'Country':<8} {'CareerYrs':<9} "
        f"{'NetMom%':<10} {'EigDelta':<9} {'DegDelta':<9} {'BtwDelta':<9} "
        f"{'EarlyCollabs':<12} {'RecentCollabs':<13}"
    )
    for i, row in enumerate(top_n, 1):
        first_name, last_name, institution, country, career_first_pub = hcp_info.get(
            row["hcp_id"], ("?", "?", "?", "?", None)
        )
        name = f"{first_name} {last_name}"
        career_years = (
            CURRENT_YEAR - career_first_pub if career_first_pub is not None else "?"
        )
        print(
            f"{i:<4} {name[:23]:<24} {(institution or '')[:23]:<24} "
            f"{(country or '')[:7]:<8} {str(career_years):<9} "
            f"{row['network_momentum_percentile']:<10.2f} "
            f"{row['eigenvector_delta']:<9.2f} "
            f"{row['degree_delta']:<9.2f} "
            f"{row['betweenness_delta']:<9.2f} "
            f"{row['early_collaborator_count']:<12} "
            f"{row['recent_collaborator_count']:<13}"
        )

    if dry_run:
        print(f"\n[dry-run] would have written {len(results):,} rows")
    else:
        written = upsert_results(
            conn,
            ta_id,
            results,
            run_id,
            early_window_type,
            recent_window_type,
            window_dates=(early_start_date, early_end_date, recent_start_date, recent_end_date),
        )
        print(f"\nWrote {written:,} rows to hcp_network_momentum_v1")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
