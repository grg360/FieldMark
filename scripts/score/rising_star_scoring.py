"""
rising_star_scoring.py — Rising Star v1 composite scoring.

Combines Scientific Momentum + Network Momentum (70%) with Scientific
Visibility + Network Visibility (30%) for eligible ACADEMIC HCPs in a TA.

Formula:
  Momentum   = 0.50 * Scientific Momentum percentile + 0.50 * Network Momentum percentile
  Visibility = 0.50 * Scientific Visibility percentile + 0.50 * Network Visibility percentile
  Scientific Visibility = 0.50 * recent pubs percentile + 0.50 * recent citations percentile
  (from hcp_scientific_momentum_v1 recent window metrics)
  Rising Star Raw = 0.70 * Momentum + 0.30 * Visibility

Usage:
    python rising_star_scoring.py --ta nsclc
    python rising_star_scoring.py --ta nsclc --dry-run --debug-top 30

Required environment variables (.env):
    DATABASE_URL (port 5432 direct connection, not pooler 6543)

Dependencies:
    pip install psycopg2-binary python-dotenv click scipy
"""

from __future__ import annotations

import os
from uuid import uuid4

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from scipy.stats import rankdata

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# MOMENTUM FLOOR (2026-08-17): three more senior-author papers in the recent
# rolling window than in the prior one. Raised from > 0, which admitted 39.7% of
# the board (246 of 619) on a single extra paper and left no approach ramp --
# nobody could be one paper from entry, because entry required only the first.
# Measured at 3: board 619 -> 251, US 123 -> 57, EU 132 -> 48; mean early->recent
# senior progression of admitted members 1.3->4.4 becomes 2.2->7.9. Named here
# beside the other thresholds; the momentum pipeline's own gates live with the
# computation (MIN_PUBS_PER_WINDOW, MAX_CAREER_YEARS in
# scientific_momentum_scoring.py; MIN_COLLABORATORS_PER_WINDOW in
# network_momentum_scoring.py).
MIN_VELOCITY_DELTA = 3

W_MOMENTUM = 0.70
W_VISIBILITY = 0.30
W_SCI = 0.50
W_NET = 0.50

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


def fetch_input_signals(conn, ta_id: str, vis_window: str = 'recent_2021_2025') -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              sm.hcp_id,
              sm.scientific_momentum_percentile,
              sm.recent_total_pubs,
              sm.recent_citation_rate,
              nm.network_momentum_percentile,
              nc.network_influence_score AS network_visibility_raw,
              h.country
            FROM hcp_scientific_momentum_v1 sm
            JOIN hcp_network_momentum_v1 nm
              ON nm.hcp_id = sm.hcp_id
              AND nm.therapeutic_area_id = sm.therapeutic_area_id
            LEFT JOIN hcp_network_centrality_v2 nc
              ON nc.hcp_id = sm.hcp_id
              AND nc.therapeutic_area_id = sm.therapeutic_area_id
              AND nc.window_type = %(vis_window)s
            JOIN hcps_v2 h ON h.id = sm.hcp_id
            -- GATE (2026-08-05): the maintained v2 taxonomy replaces the stale
            -- hcps_v2.cohort_classification column (73.6%% null, unmaintained,
            -- froze the board). OR-15: rising_eligible, or established within
            -- the momentum pipeline's own 15-year career cap — the two
            -- taxonomies draw their boundary at ~10 vs 15 years by design.
            JOIN hcp_cohort_classification_v2 cc
              ON cc.hcp_id = sm.hcp_id
              AND cc.therapeutic_area_id = sm.therapeutic_area_id
            WHERE sm.therapeutic_area_id = %(ta_id)s
              AND (cc.cohort = 'rising_eligible'
                   OR (cc.cohort = 'established' AND cc.career_age <= 15))
              -- MOMENTUM FLOOR (2026-08-05, raised 2026-08-17): a board defined
              -- by trajectory excludes members whose senior-author output did not
              -- move. One condition on the thing the cohort claims to measure;
              -- degree can fall for reasons unrelated to trajectory, so it is not
              -- part of the floor. Threshold is MIN_VELOCITY_DELTA above.
              AND sm.pub_velocity_delta >= %(min_delta)s
            """,
            {"ta_id": ta_id, "vis_window": vis_window, "min_delta": MIN_VELOCITY_DELTA},
        )
        return [
            {
                "hcp_id": str(row[0]),
                "scientific_momentum_percentile": float(row[1]),
                "recent_total_pubs": float(row[2]),
                "recent_citation_rate": float(row[3]),
                "network_momentum_percentile": float(row[4]),
                "network_visibility_raw": float(row[5]) if row[5] is not None else 0.0,
                "country": row[6],
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


# classify_archetype removed 2026-08-05: the four threshold archetypes were a
# top-down taxonomy whose residual bucket held 88.8%% of the board, and the
# both-high corner tested at chance rate (no data-defined class). The one
# surviving label is the RECENT SENIOR AUTHORSHIP event badge (zero senior
# papers in the early window, >= 3 in the recent — a claim about the windows,
# not the whole career), computed by the profile/board RPCs — an event anchor
# that survived the fixed->rolling window change at 89%% vs the corner's 42%%.
# The archetype column stays in the table (NULL) and is no longer read.


def build_results(rows: list[dict]) -> list[dict]:
    if not rows:
        return []

    hcp_ids = [r["hcp_id"] for r in rows]

    for row in rows:
        row["recent_total_citations"] = (
            float(row["recent_citation_rate"]) * float(row["recent_total_pubs"])
        )

    recent_pubs_pctiles = compute_percentile_ranks(
        hcp_ids,
        {r["hcp_id"]: r["recent_total_pubs"] for r in rows},
    )
    recent_citations_pctiles = compute_percentile_ranks(
        hcp_ids,
        {r["hcp_id"]: r["recent_total_citations"] for r in rows},
    )
    net_vis_pctiles = compute_percentile_ranks(
        hcp_ids,
        {r["hcp_id"]: r["network_visibility_raw"] for r in rows},
    )

    results: list[dict] = []
    for row in rows:
        hcp_id = row["hcp_id"]
        sci_mom = row["scientific_momentum_percentile"]
        net_mom = row["network_momentum_percentile"]
        sci_vis = (
            W_SCI * recent_pubs_pctiles[hcp_id]
            + W_NET * recent_citations_pctiles[hcp_id]
        )
        net_vis = net_vis_pctiles[hcp_id]

        momentum_component = W_SCI * sci_mom + W_NET * net_mom
        visibility_component = W_SCI * sci_vis + W_NET * net_vis
        rising_star_raw = W_MOMENTUM * momentum_component + W_VISIBILITY * visibility_component

        results.append(
            {
                "hcp_id": hcp_id,
                "country": row["country"],
                "scientific_momentum_percentile": sci_mom,
                "network_momentum_percentile": net_mom,
                "scientific_visibility_percentile": round(sci_vis, 2),
                "network_visibility_percentile": net_vis,
                "momentum_component": round(momentum_component, 2),
                "visibility_component": round(visibility_component, 2),
                "rising_star_raw": round(rising_star_raw, 2),
                "archetype": None,
            }
        )

    hcp_ids = [r["hcp_id"] for r in results]
    rising_star_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["rising_star_raw"] for r in results}
    )
    for row in results:
        row["rising_star_percentile"] = rising_star_pctiles[row["hcp_id"]]

    sorted_by_raw = sorted(results, key=lambda r: r["rising_star_raw"], reverse=True)
    for rank, row in enumerate(sorted_by_raw, 1):
        row["rank"] = rank

    us_sorted = [r for r in sorted_by_raw if r.get("country") == "US"]
    us_rank_map = {r["hcp_id"]: i for i, r in enumerate(us_sorted, 1)}
    for row in results:
        row["us_rank"] = us_rank_map.get(row["hcp_id"])

    return results


def lookup_hcp_debug_info(
    conn, hcp_ids: list[str]
) -> dict[str, tuple[str, str, str | None]]:
    if not hcp_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, first_name, last_name, institution_normalized
            FROM hcps_v2
            WHERE id::text = ANY(%s)
            """,
            (hcp_ids,),
        )
        return {row[0]: (row[1], row[2], row[3]) for row in cur.fetchall()}


def upsert_results(conn, ta_id: str, results: list[dict], run_id: str) -> int:
    if not results:
        return 0

    values = [
        (
            r["hcp_id"],
            ta_id,
            float(r["scientific_momentum_percentile"]),
            float(r["network_momentum_percentile"]),
            float(r["scientific_visibility_percentile"]),
            float(r["network_visibility_percentile"]),
            float(r["momentum_component"]),
            float(r["visibility_component"]),
            float(r["rising_star_raw"]),
            float(r["rising_star_percentile"]),
            int(r["rank"]),
            int(r["us_rank"]) if r["us_rank"] is not None else None,
            r["archetype"],
            r["country"],
            run_id,
        )
        for r in results
    ]

    sql = """
        INSERT INTO hcp_rising_star_ranks_v3
          (hcp_id, therapeutic_area_id,
           scientific_momentum_percentile, network_momentum_percentile,
           scientific_visibility_percentile, network_visibility_percentile,
           momentum_component, visibility_component,
           rising_star_raw, rising_star_percentile,
           rank, us_rank, archetype, country,
           enrichment_run_id)
        VALUES %s
        ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE SET
          scientific_momentum_percentile = EXCLUDED.scientific_momentum_percentile,
          network_momentum_percentile = EXCLUDED.network_momentum_percentile,
          scientific_visibility_percentile = EXCLUDED.scientific_visibility_percentile,
          network_visibility_percentile = EXCLUDED.network_visibility_percentile,
          momentum_component = EXCLUDED.momentum_component,
          visibility_component = EXCLUDED.visibility_component,
          rising_star_raw = EXCLUDED.rising_star_raw,
          rising_star_percentile = EXCLUDED.rising_star_percentile,
          rank = EXCLUDED.rank,
          us_rank = EXCLUDED.us_rank,
          archetype = EXCLUDED.archetype,
          country = EXCLUDED.country,
          computed_at = now(),
          enrichment_run_id = EXCLUDED.enrichment_run_id
    """

    # DE-LIST DELETE, same transaction as the upsert (2026-08-03): rows for this
    # TA whose hcp_id is not in the new result set are removed. Upsert-only
    # recompute leaves de-listed members (HCPs that left the rising_star cohort,
    # or whose hcps_v2 row was deleted) holding stale ranks that interleave with
    # the fresh ordering — the trap that left 5 dangling NSCLC rows at
    # computed_at 2026-06-22, one still occupying US rank 113. The empty-result
    # guard (`if not results: return 0` above) means an upstream failure that
    # produces zero rows deletes NOTHING rather than wiping the board.
    keep_ids = sorted({r["hcp_id"] for r in results})
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM hcp_rising_star_ranks_v3 "
                "WHERE therapeutic_area_id = %s AND NOT (hcp_id = ANY(%s::uuid[]))",
                (ta_id, keep_ids),
            )
            delisted = cur.rowcount or 0
            for start in range(0, len(values), UPSERT_BATCH_SIZE):
                execute_values(cur, sql, values[start : start + UPSERT_BATCH_SIZE])
        conn.commit()
        if delisted:
            print(f"[upsert] de-listed {delisted} stale row(s) not in the new result set")
        return len(values)
    except Exception:
        conn.rollback()
        raise


@click.command()
@click.option("--vis-window", default="recent_2021_2025", help="hcp_network_centrality_v2.window_type used for network visibility")
@click.option("--ta", default="nsclc", help="Therapeutic area slug")
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N by rising_star_percentile")
def main(ta: str, dry_run: bool, debug_top: int, vis_window: str) -> None:
    run_id = str(uuid4())
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(f"Computing Rising Star composite for TA={ta}")
    print("Fetching input signals...")
    rows = fetch_input_signals(conn, ta_id, vis_window=vis_window)
    print(f"Loaded {len(rows):,} eligible HCPs")

    print("Computing composite scores and archetypes...")
    results = build_results(rows)
    print(f"Scored HCPs: {len(results):,}")

    if not results:
        print("No eligible HCPs found. Exiting.")
        conn.close()
        return

    sorted_results = sorted(
        results, key=lambda r: r["rising_star_percentile"], reverse=True
    )
    top_n = sorted_results[:debug_top]
    hcp_info = lookup_hcp_debug_info(conn, [r["hcp_id"] for r in top_n])

    print(f"\n=== Top {debug_top} by Rising Star Percentile ({ta}) ===")
    print(
        f"{'Rk':<4} {'Name':<24} {'Inst':<24} {'Country':<8} {'RisingStar%':<11} "
        f"{'Momentum':<9} {'Visibility':<10} {'SciMom':<7} {'NetMom':<7} "
        f"{'SciVis':<7} {'NetVis':<7} {'Archetype':<22}"
    )
    for i, row in enumerate(top_n, 1):
        first_name, last_name, institution = hcp_info.get(
            row["hcp_id"], ("?", "?", "?")
        )
        name = f"{first_name} {last_name}"
        print(
            f"{i:<4} {name[:23]:<24} {(institution or '')[:23]:<24} "
            f"{(row['country'] or '')[:7]:<8} "
            f"{row['rising_star_percentile']:<11.2f} "
            f"{row['momentum_component']:<9.2f} "
            f"{row['visibility_component']:<10.2f} "
            f"{row['scientific_momentum_percentile']:<7.1f} "
            f"{row['network_momentum_percentile']:<7.1f} "
            f"{row['scientific_visibility_percentile']:<7.1f} "
            f"{row['network_visibility_percentile']:<7.1f} "
            f"{(row['archetype'] or '-')[:21]:<22}"
        )

    if dry_run:
        print(f"\n[dry-run] would have written {len(results):,} rows")
    else:
        written = upsert_results(conn, ta_id, results, run_id)
        print(f"\nWrote {written:,} rows to hcp_rising_star_ranks_v3")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
