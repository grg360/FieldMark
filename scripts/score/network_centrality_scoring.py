"""
network_centrality_scoring.py — Co-authorship network centrality for HCPs.

Computes weighted degree, eigenvector, and betweenness centrality from
publication co-authorship edges and writes to hcp_network_centrality_v2.

Usage:
    python network_centrality_scoring.py --ta nsclc
    python network_centrality_scoring.py --ta nsclc --window-years 10 --dry-run
    python network_centrality_scoring.py --ta nsclc --start-year 2016 --end-year 2020 --window-type hist_2016_2020
    python network_centrality_scoring.py --debug-top 30

Required environment variables (.env):
    DATABASE_URL

Dependencies:
    pip install networkx psycopg2-binary python-dotenv click
"""

from __future__ import annotations

import os
from uuid import uuid4

import click
import networkx as nx
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

W_DEGREE = 0.4
W_EIGENVECTOR = 0.4
W_BETWEENNESS = 0.2


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


def fetch_edges(
    conn,
    ta_id: str,
    window_years: int | None = None,
    start_year: int | None = None,
    end_year: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[tuple[str, str, int]]:
    """Returns list of (hcp_a, hcp_b, weight) tuples."""
    if start_date is not None and end_date is not None:
        # Rolling month-boundary window (2026-08-05). Real pub_date decides
        # membership; Jan-1 placeholder rows (year-only precision, ~12.5% of
        # the corpus) fall back to pub_year via a July-1 effective date —
        # the majority-of-year rule, deterministic and window-exclusive.
        year_filter = (
            "(CASE WHEN EXTRACT(MONTH FROM p.pub_date) = 1 AND EXTRACT(DAY FROM p.pub_date) = 1 "
            "THEN make_date(p.pub_year, 7, 1) "
            "ELSE COALESCE(p.pub_date, make_date(p.pub_year, 7, 1)) END) BETWEEN %s AND %s"
        )
        year_params = (start_date, end_date)
    elif start_year is not None and end_year is not None:
        year_filter = "p.pub_year BETWEEN %s AND %s"
        year_params = (start_year, end_year)
    else:
        year_filter = "p.pub_year >= EXTRACT(YEAR FROM now())::int - %s"
        year_params = (window_years,)

    sql = f"""
            WITH ta_pubs AS (
              SELECT p.id, p.pub_year
              FROM publications_v2 p
              JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
              WHERE pta.therapeutic_area_id = %s
                AND {year_filter}
            ),
            hcp_pub_pairs AS (
              SELECT
                LEAST(pa1.hcp_id::text, pa2.hcp_id::text) AS hcp_a,
                GREATEST(pa1.hcp_id::text, pa2.hcp_id::text) AS hcp_b,
                COUNT(DISTINCT pa1.publication_id) AS shared_pubs
              FROM publication_authors_v2 pa1
              JOIN publication_authors_v2 pa2
                ON pa1.publication_id = pa2.publication_id
                AND pa1.hcp_id <> pa2.hcp_id
              JOIN ta_pubs tp ON tp.id = pa1.publication_id
              GROUP BY 1, 2
            )
            SELECT hcp_a, hcp_b, shared_pubs FROM hcp_pub_pairs
            """

    with conn.cursor() as cur:
        cur.execute(sql, (ta_id,) + year_params)
        return [(row[0], row[1], int(row[2])) for row in cur.fetchall()]


def compute_percentiles(scores_dict):
    """Rank-percentile: 100 = highest, 0+ = lowest, each HCP unique."""
    if not scores_dict:
        return {}
    items = sorted(scores_dict.items(), key=lambda kv: kv[1], reverse=True)
    n = len(items)
    if n == 1:
        return {items[0][0]: 100.0}
    out = {}
    for position, (key, _) in enumerate(items):
        percentile = 100.0 * (1.0 - position / (n - 1))
        out[key] = round(percentile, 2)
    return out


def lookup_hcp_names(conn, hcp_ids: list[str]) -> dict[str, tuple[str, str, str | None]]:
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


def upsert_results(
    conn,
    ta_id: str,
    window_type: str,
    results: list[dict],
    run_id: str,
    window_start=None,
    window_end=None,
) -> int:
    if not results:
        return 0
    values = [
        (
            r["hcp_id"],
            ta_id,
            window_type,
            window_start, window_end,
            r["degree_centrality_weighted"],
            r["eigenvector_centrality"],
            r["betweenness_centrality"],
            int(round(r["degree_percentile"])),
            int(round(r["eigenvector_percentile"])),
            int(round(r["betweenness_percentile"])),
            r["network_influence_score"],
            r["collaborator_count"],
            r["total_collaboration_weight"],
            run_id,
        )
        for r in results
    ]
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO hcp_network_centrality_v2
                  (hcp_id, therapeutic_area_id, window_type, window_start, window_end,
                   degree_centrality_weighted, eigenvector_centrality, betweenness_centrality,
                   degree_percentile, eigenvector_percentile, betweenness_percentile,
                   network_influence_score, collaborator_count, total_collaboration_weight,
                   enrichment_run_id)
                VALUES %s
                ON CONFLICT (hcp_id, therapeutic_area_id, window_type) DO UPDATE SET
                  window_start = EXCLUDED.window_start,
                  window_end = EXCLUDED.window_end,
                  degree_centrality_weighted = EXCLUDED.degree_centrality_weighted,
                  eigenvector_centrality = EXCLUDED.eigenvector_centrality,
                  betweenness_centrality = EXCLUDED.betweenness_centrality,
                  degree_percentile = EXCLUDED.degree_percentile,
                  eigenvector_percentile = EXCLUDED.eigenvector_percentile,
                  betweenness_percentile = EXCLUDED.betweenness_percentile,
                  network_influence_score = EXCLUDED.network_influence_score,
                  collaborator_count = EXCLUDED.collaborator_count,
                  total_collaboration_weight = EXCLUDED.total_collaboration_weight,
                  computed_at = now(),
                  enrichment_run_id = EXCLUDED.enrichment_run_id
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
@click.option("--window-years", default=10, type=int, help="Publication lookback window in years")
@click.option(
    "--start-year",
    default=None,
    type=int,
    help="Start of publication window (inclusive). If set, overrides --window-years.",
)
@click.option(
    "--end-year",
    default=None,
    type=int,
    help="End of publication window (inclusive). If set, overrides --window-years.",
)
@click.option("--start-date", default=None, help="Rolling window start (YYYY-MM-DD, month boundary). Overrides year args.")
@click.option("--end-date", default=None, help="Rolling window end (YYYY-MM-DD, inclusive).")
@click.option("--window-type", default="10yr", help="Label stored in hcp_network_centrality_v2.window_type")
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N by network_influence_score")
@click.option(
    "--min-edge-weight",
    default=1,
    type=int,
    help="Filter edges below this weight. Default 1.",
)
def main(
    ta: str,
    window_years: int,
    start_year: int | None,
    end_year: int | None,
    start_date: str | None,
    end_date: str | None,
    window_type: str,
    dry_run: bool,
    debug_top: int,
    min_edge_weight: int,
) -> None:
    if (start_date is None) != (end_date is None):
        raise click.UsageError("--start-date and --end-date must be provided together.")
    if start_date is not None and window_type in ("10yr", "5yr"):
        raise click.UsageError("When using --start-date/--end-date, specify a rolling --window-type (e.g. early_roll / recent_roll).")
    if (start_year is None) != (end_year is None):
        raise click.UsageError("--start-year and --end-year must be provided together.")
    if start_year is not None and end_year is not None:
        if start_year > end_year:
            raise click.UsageError("--start-year must be <= --end-year.")
        if window_type == "10yr":
            raise click.UsageError(
                "When using --start-year/--end-year, specify --window-type "
                "(e.g. hist_2016_2020 or recent_2021_2025)."
            )

    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    # Recorded window range: date-mode uses the dates verbatim; year-mode uses
    # calendar bounds; the trailing '10yr'/'5yr' style windows record nothing.
    if start_date is not None:
        win_start, win_end = start_date, end_date
    elif start_year is not None:
        win_start, win_end = f"{start_year}-01-01", f"{end_year}-12-31"
    else:
        win_start = win_end = None

    if start_date is not None:
        print(
            f"Computing network centrality for TA={ta} "
            f"window={start_date}..{end_date} (label={window_type})"
        )
    elif start_year is not None:
        print(
            f"Computing network centrality for TA={ta} "
            f"window={start_year}-{end_year} (label={window_type})"
        )
    else:
        print(
            f"Computing network centrality for TA={ta} "
            f"window={window_years}yr ({window_type})"
        )
    print("Fetching edges...")
    edges_raw = fetch_edges(
        conn,
        ta_id,
        window_years=window_years if (start_year is None and start_date is None) else None,
        start_year=start_year,
        end_year=end_year,
        start_date=start_date,
        end_date=end_date,
    )
    print(f"Found {len(edges_raw)} co-authorship pairs")

    if not edges_raw:
        print("No edges found. Exiting.")
        conn.close()
        return

    print("Building graph...")
    graph = nx.Graph()
    edges_kept = 0
    edges_filtered = 0
    for hcp_a, hcp_b, weight in edges_raw:
        w = int(weight)
        if w >= min_edge_weight:
            graph.add_edge(hcp_a, hcp_b, weight=w)
            edges_kept += 1
        else:
            edges_filtered += 1
    print(f"Edges kept: {edges_kept}, filtered (weight < {min_edge_weight}): {edges_filtered}")
    print(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")

    print("Computing weighted degree...")
    weighted_degree = dict(graph.degree(weight="weight"))
    collab_count = dict(graph.degree())

    print("Computing eigenvector centrality...")
    try:
        eigenvector = nx.eigenvector_centrality(
            graph, weight="weight", max_iter=1000, tol=1e-6
        )
    except nx.PowerIterationFailedConvergence:
        print("  power iteration didn't converge, using numpy fallback")
        eigenvector = nx.eigenvector_centrality_numpy(graph, weight="weight")

    print("Computing betweenness centrality (this may take a while)...")
    graph_dist = graph.copy()
    for _u, _v, data in graph_dist.edges(data=True):
        weight = data.get("weight", 0)
        data["distance"] = 1.0 / weight if weight > 0 else 1.0

    if graph.number_of_nodes() > 5000:
        k_sample = min(1000, graph.number_of_nodes())
        print(f"  large graph, sampling k={k_sample} sources")
        betweenness = nx.betweenness_centrality(
            graph_dist,
            weight="distance",
            k=k_sample,
            normalized=True,
            seed=42,
        )
    else:
        betweenness = nx.betweenness_centrality(
            graph_dist,
            weight="distance",
            normalized=True,
        )

    print("Computing percentiles...")
    degree_pctiles = compute_percentiles(weighted_degree)
    eigen_pctiles = compute_percentiles(eigenvector)
    btwn_pctiles = compute_percentiles(betweenness)

    print("Assembling results...")
    results: list[dict] = []
    for hcp_id in graph.nodes():
        degree_pct = degree_pctiles.get(hcp_id, 0)
        eigen_pct = eigen_pctiles.get(hcp_id, 0)
        btwn_pct = btwn_pctiles.get(hcp_id, 0)
        results.append(
            {
                "hcp_id": hcp_id,
                "degree_centrality_weighted": float(weighted_degree.get(hcp_id, 0)),
                "eigenvector_centrality": float(eigenvector.get(hcp_id, 0)),
                "betweenness_centrality": float(betweenness.get(hcp_id, 0)),
                "degree_percentile": degree_pct,
                "eigenvector_percentile": eigen_pct,
                "betweenness_percentile": btwn_pct,
                "network_influence_score": (
                    W_DEGREE * degree_pct
                    + W_EIGENVECTOR * eigen_pct
                    + W_BETWEENNESS * btwn_pct
                ),
                "collaborator_count": int(collab_count.get(hcp_id, 0)),
                "total_collaboration_weight": float(weighted_degree.get(hcp_id, 0)),
            }
        )

    sorted_results = sorted(
        results, key=lambda r: r["network_influence_score"], reverse=True
    )
    top_n = sorted_results[:debug_top]
    hcp_names = lookup_hcp_names(conn, [r["hcp_id"] for r in top_n])

    print(f"\n=== Top {debug_top} by Network Influence Score ({ta}, {window_type}) ===")
    print(
        f"{'Rk':<4} {'Name':<28} {'Inst':<28} {'NI':<8} "
        f"{'Deg%':<6} {'Eig%':<6} {'Btw%':<6} {'Collabs':<8}"
    )
    for i, row in enumerate(top_n, 1):
        first_name, last_name, institution = hcp_names.get(
            row["hcp_id"], ("?", "?", "?")
        )
        name = f"{first_name} {last_name}"
        print(
            f"{i:<4} {name[:27]:<28} {(institution or '')[:27]:<28} "
            f"{row['network_influence_score']:<8.2f} "
            f"{row['degree_percentile']:<6.2f} {row['eigenvector_percentile']:<6.2f} "
            f"{row['betweenness_percentile']:<6.2f} {row['collaborator_count']:<8}"
        )

    if dry_run:
        print(f"\n[dry-run] would have written {len(results)} rows")
    else:
        run_id = str(uuid4())
        written = upsert_results(conn, ta_id, window_type, results, run_id, window_start=win_start, window_end=win_end)
        print(f"\nWrote {written} rows to hcp_network_centrality_v2")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
