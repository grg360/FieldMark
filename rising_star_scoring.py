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


def fetch_input_signals(conn, ta_id: str) -> list[dict]:
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
              AND nc.window_type = 'recent_2021_2025'
            JOIN hcps_v2 h ON h.id = sm.hcp_id
            WHERE sm.therapeutic_area_id = %s
            """,
            (ta_id,),
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
    if n == 1:
        return {hcp_ids[0]: 100.0}
    ordered_values = [values[hcp_id] for hcp_id in hcp_ids]
    ranks = rankdata(ordered_values, method="average")
    return {
        hcp_id: round(100.0 * (ranks[i] - 1) / (n - 1), 2)
        for i, hcp_id in enumerate(hcp_ids)
    }


def classify_archetype(sci_mom: float, net_mom: float) -> str:
    if sci_mom >= 85 and net_mom >= 85:
        return "Balanced Rising Star"
    if sci_mom >= 90 and net_mom < 75:
        return "Scientific Accelerator"
    if net_mom >= 90 and sci_mom < 75:
        return "Network Accelerator"
    return "Emerging Leader"


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
                "archetype": classify_archetype(sci_mom, net_mom),
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
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N by rising_star_percentile")
def main(ta: str, dry_run: bool, debug_top: int) -> None:
    run_id = str(uuid4())
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(f"Computing Rising Star composite for TA={ta}")
    print("Fetching input signals...")
    rows = fetch_input_signals(conn, ta_id)
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
            f"{row['archetype'][:21]:<22}"
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
