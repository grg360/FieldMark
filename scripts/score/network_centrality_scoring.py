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
import time
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

# --- Edge-fetch transport (2026-08-25) ------------------------------------
# fetch_edges runs a ~150s self-join over publication_authors_v2 and returns
# ~0.8-1.0M rows through the Supabase POOLER. Measured 2026-08-25:
#   CRC  early_roll   778,093 edges / 148s      CRC  recent_roll 1,023,034 / 161s
#   NSCLC early_roll  755,016 edges / 140s      (696,922 on 2026-08-17)
# CRC is only 3% larger than NSCLC, so this is NOT a CRC-specific problem --
# the weekly NSCLC cron runs the same query at 97% of the size. The old code
# held the connection silent for the whole computation and then fetchall()'d
# every row into one Python list; a single transient drop killed the entire
# 5-step rising chain with "SSL connection has been closed unexpectedly".
#
# TRANSPORT ONLY: the SQL, the edge set and the centrality math are unchanged.
EDGE_ITERSIZE = 50_000          # rows per server-side FETCH
FETCH_ATTEMPTS = 3              # bounded retry around the whole stream
FETCH_BACKOFF_BASE = 2.0        # 2s, 4s between attempts
STATEMENT_TIMEOUT_MS = 600_000  # 10 min -- generous over the measured ~160s
CONNECT_TIMEOUT_S = 30


def get_conn():
    """Connect with TCP keepalives and an explicit statement timeout.

    keepalives matter because this script goes long stretches sending nothing:
    ~150s inside the edge query, then many minutes computing betweenness while
    the connection sits idle before the write. Without them a pooled connection
    can be reaped with no error until the next use.
    """
    if not DATABASE_URL:
        raise EnvironmentError("Missing DATABASE_URL")
    conn = psycopg2.connect(
        DATABASE_URL,
        connect_timeout=CONNECT_TIMEOUT_S,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    # SET rather than libpq `options=`: reliably applied through the pooler.
    with conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
    conn.commit()
    return conn


def ensure_conn(conn):
    """Return a live connection, reconnecting if the old one died while idle.

    `conn` is opened before the edge fetch and then sits unused for the whole
    centrality computation -- ~7 minutes on a 778k-edge graph, dominated by
    betweenness. A pooled connection can be closed server-side in that window
    (observed 2026-08-25: the fetch succeeded and `lookup_hcp_names` then died
    with "server closed the connection unexpectedly"). TCP keepalives do not
    prevent an application-layer pooler timeout, so probe and replace.
    """
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return conn
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        print("  [conn] connection died while idle; reconnecting", flush=True)
        try:
            conn.close()
        except Exception:  # noqa: BLE001 - already dead
            pass
        return get_conn()


# TA RESOLUTION MOVED TO scripts/utils/ta_registry.py (2026-08-27).
# Replaced a local resolve_ta_id that was one of NINE near-identical copies across sixteen
# scripts -- same query, different return types (str(row[0]) / row[0] / row["id"]) and
# different exceptions (ValueError / RuntimeError / SystemExit). Fifteen of them reported only
# "TA slug not found: <slug>", which repeats the typo back without saying what IS valid.
# The shared resolver caches per process and raises with the full slug list.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta_id  # noqa: E402,F401


def build_edges_query(
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

    return sql, (ta_id,) + year_params


def iter_edges(conn, sql: str, params: tuple):
    """Stream edges through a NAMED (server-side) cursor.

    A named cursor keeps the result set on the server and pulls it in
    itersize-sized FETCH batches. Two consequences, both of which are the point:
      * the client-server link exchanges traffic every batch instead of going
        silent for the whole transfer, and
      * peak Python memory is bounded by itersize, not by the full ~1M rows.

    AUTOCOMMIT: a server-side cursor only exists inside a transaction. psycopg2
    connections default to autocommit=False, but assert it rather than assume --
    under autocommit the portal is destroyed after the first FETCH and the
    stream silently truncates.
    """
    if getattr(conn, "autocommit", False):
        raise RuntimeError(
            "iter_edges requires autocommit=False (server-side cursors need a transaction)"
        )
    # Unique name: a named cursor is a server object and must not collide with
    # another portal on the same session.
    with conn.cursor(name=f"edges_{uuid4().hex}") as cur:
        cur.itersize = EDGE_ITERSIZE
        cur.execute(sql, params)
        for row in cur:
            yield row[0], row[1], int(row[2])


def fetch_edges_into_graph(
    ta_id: str,
    min_edge_weight: int,
    **window_kwargs,
) -> tuple[nx.Graph, int, int]:
    """Stream edges straight into the graph, with a bounded retry.

    Returns (graph, edges_kept, edges_filtered) -- identical values to the old
    fetchall()-then-loop, because the same rows are applied by the same filter.
    Graph construction is order-independent, so streaming changes nothing.

    The retry rebuilds from scratch on each attempt. A dropped server-side
    cursor cannot be resumed, and a half-built graph is worse than none -- so a
    failed attempt discards its partial graph and starts over on a FRESH
    connection (the old one is dead by definition).
    """
    sql, params = build_edges_query(ta_id, **window_kwargs)
    last_exc: Exception | None = None

    for attempt in range(1, FETCH_ATTEMPTS + 1):
        conn = None
        try:
            conn = get_conn()
            graph = nx.Graph()
            edges_kept = 0
            edges_filtered = 0
            streamed = 0
            for hcp_a, hcp_b, weight in iter_edges(conn, sql, params):
                streamed += 1
                w = int(weight)
                if w >= min_edge_weight:
                    graph.add_edge(hcp_a, hcp_b, weight=w)
                    edges_kept += 1
                else:
                    edges_filtered += 1
                if streamed % (EDGE_ITERSIZE * 4) == 0:
                    print(f"  ...streamed {streamed:,} edge rows", flush=True)
            conn.commit()
            print(f"Found {streamed:,} co-authorship pairs (streamed)")
            return graph, edges_kept, edges_filtered
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as exc:
            # The failure class this function exists for: SSL/connection drops
            # mid-stream. Programming errors are NOT caught -- they must not be
            # retried three times before surfacing.
            last_exc = exc
            print(
                f"  [fetch_edges] attempt {attempt}/{FETCH_ATTEMPTS} failed: "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )
            if attempt < FETCH_ATTEMPTS:
                backoff = FETCH_BACKOFF_BASE ** attempt
                print(f"  [fetch_edges] retrying in {backoff:.0f}s (graph discarded)", flush=True)
                time.sleep(backoff)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001 - closing a dead conn must not mask the cause
                    pass

    raise RuntimeError(
        f"fetch_edges failed after {FETCH_ATTEMPTS} attempts: {last_exc}"
    ) from last_exc


def compute_percentiles(scores_dict):
    """Rank-percentile: 100 = highest, 0+ = lowest, each HCP unique."""
    if not scores_dict:
        return {}
    items = sorted(scores_dict.items(), key=lambda kv: kv[1], reverse=True)
    n = len(items)
    out = {}
    # PERCENTILE CONVENTION (2026-08-18) — see docs/PERCENTILE_CONVENTION.md.
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
    print("Fetching edges (server-side cursor, streaming into the graph)...")
    # Streamed on its own short-lived connection so a mid-stream drop cannot
    # poison `conn`, which is still needed for the name lookup and the write.
    graph, edges_kept, edges_filtered = fetch_edges_into_graph(
        ta_id,
        min_edge_weight,
        window_years=window_years if (start_year is None and start_date is None) else None,
        start_year=start_year,
        end_year=end_year,
        start_date=start_date,
        end_date=end_date,
    )

    if graph.number_of_edges() == 0 and edges_filtered == 0:
        print("No edges found. Exiting.")
        conn.close()
        return

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
    # First DB use since before the fetch -- the connection has been idle
    # through the whole centrality computation.
    conn = ensure_conn(conn)
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
        conn = ensure_conn(conn)
        written = upsert_results(conn, ta_id, window_type, results, run_id, window_start=win_start, window_end=win_end)
        print(f"\nWrote {written} rows to hcp_network_centrality_v2")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
