"""
export_telescope_data.py — One-off export of Telescope NSCLC prototype network data.

Runs two SQL queries and writes JSON arrays for the frontend prototype.

Required environment variables:
- SUPABASE_URL (loaded for consistency with other scripts)
- SUPABASE_SERVICE_KEY or SUPABASE_KEY
- DATABASE_URL (direct Postgres connection for long-running SQL)

Usage:
    python export_telescope_data.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List
from uuid import UUID

from dotenv import load_dotenv
from supabase import Client, create_client

NODES_PATH = Path("frontend/src/data/telescope_nsclc_nodes.json")
EDGES_PATH = Path("frontend/src/data/telescope_nsclc_edges.json")
STATEMENT_TIMEOUT_MS = 300_000  # 5 minutes

# The ESTABLISHED seed reads hcp_established_ranks_v3 — the per-TA-classified table.
# It previously read hcp_score_ranks_v2, whose established slice is the output of
# established_scoring.py's (HCP x TA) cartesian product: every globally-'established'
# HCP got a row for BOTH TAs regardless of TA membership (Hepatology 11,389 ==
# NSCLC 11,389 — identical counts are the signature), so the seed was ~61% non-NSCLC.
# v3 has no `cohort` column (it is established-only) and names the score `cohort_score`.
#
# The RISING slice reads hcp_rising_star_ranks_v3 — the authoritative trajectory-based
# rising-star system (Scientific/Network Momentum + Visibility -> composite), gated on the
# positive cohort_classification='rising_star' label and US-scoped via us_rank. It REPLACES
# the former hcp_score_ranks_v2 cohort='rising' join, which was the ~234k-row career-age
# DEMOGRAPHIC gate (any mid-career HCP with >=1 pub) — that swept in non-rising names with
# meaningless global ranks (e.g. Joao V. Alessi #23,852). Displayed rank = us_rank (the real
# selective rank). NODES and EDGES apply the SAME ranks_v3 membership so the two graphs stay
# identical (see EDGES note below). ranks_v3 is NSCLC-only and has no scope_type column.
NODES_SQL = """
WITH top_established AS (
  SELECT
    hsr.hcp_id,
    h.first_name || ' ' || h.last_name AS name,
    h.institution_normalized,
    hsr.rank,
    hsr.cohort_score AS score_at_rank,
    hsr.therapeutic_area_id
  FROM hcp_established_ranks_v3 hsr
  JOIN hcps_v2 h ON h.id = hsr.hcp_id
  JOIN therapeutic_areas ta ON ta.id = hsr.therapeutic_area_id
  WHERE hsr.scope_type = 'global'
    AND h.country = 'US'
    AND ta.name = 'NSCLC'
  ORDER BY hsr.rank
  LIMIT 50
),
network_hcps AS (
  SELECT
    te.hcp_id::text AS id,
    te.name,
    te.institution_normalized AS institution,
    'established' AS cohort,
    te.rank,
    te.score_at_rank AS score
  FROM top_established te
  UNION
  SELECT DISTINCT
    h.id::text AS id,
    h.first_name || ' ' || h.last_name AS name,
    h.institution_normalized AS institution,
    'rising' AS cohort,
    rs.us_rank AS rank,
    rs.rising_star_percentile AS score
  FROM top_established te
  JOIN publication_authors_v2 pa_te ON pa_te.hcp_id = te.hcp_id
  JOIN publication_authors_v2 pa_rs
    ON pa_rs.publication_id = pa_te.publication_id
    AND pa_rs.hcp_id != te.hcp_id
  JOIN hcps_v2 h ON h.id = pa_rs.hcp_id AND h.country = 'US'
  JOIN hcp_rising_star_ranks_v3 rs
    ON rs.hcp_id = h.id
    AND rs.therapeutic_area_id = te.therapeutic_area_id
    AND rs.us_rank IS NOT NULL
)
SELECT * FROM network_hcps;
"""

# Same established-seed repoint as NODES_SQL — the two seeds MUST stay identical or
# the edge set would be computed over a different graph than the nodes.
EDGES_SQL = """
WITH top_established AS (
  SELECT hsr.hcp_id, hsr.therapeutic_area_id
  FROM hcp_established_ranks_v3 hsr
  JOIN hcps_v2 h ON h.id = hsr.hcp_id
  JOIN therapeutic_areas ta ON ta.id = hsr.therapeutic_area_id
  WHERE hsr.scope_type = 'global'
    AND h.country = 'US'
    AND ta.name = 'NSCLC'
  ORDER BY hsr.rank
  LIMIT 50
),
network_hcp_ids AS (
  SELECT hcp_id FROM top_established
  UNION
  SELECT DISTINCT pa_rs.hcp_id
  FROM top_established te
  JOIN publication_authors_v2 pa_te ON pa_te.hcp_id = te.hcp_id
  JOIN publication_authors_v2 pa_rs
    ON pa_rs.publication_id = pa_te.publication_id
    AND pa_rs.hcp_id != te.hcp_id
  JOIN hcps_v2 h ON h.id = pa_rs.hcp_id AND h.country = 'US'
  JOIN hcp_rising_star_ranks_v3 rs
    ON rs.hcp_id = pa_rs.hcp_id
    AND rs.therapeutic_area_id = te.therapeutic_area_id
    AND rs.us_rank IS NOT NULL
)
SELECT
  LEAST(pa1.hcp_id, pa2.hcp_id)::text AS source,
  GREATEST(pa1.hcp_id, pa2.hcp_id)::text AS target,
  count(DISTINCT pa1.publication_id) AS weight
FROM network_hcp_ids nh1
JOIN network_hcp_ids nh2 ON nh1.hcp_id < nh2.hcp_id
JOIN publication_authors_v2 pa1 ON pa1.hcp_id = nh1.hcp_id
JOIN publication_authors_v2 pa2
  ON pa2.publication_id = pa1.publication_id
  AND pa2.hcp_id = nh2.hcp_id
GROUP BY LEAST(pa1.hcp_id, pa2.hcp_id), GREATEST(pa1.hcp_id, pa2.hcp_id);
"""

# ---------------------------------------------------------------------------
# Atopic Dermatitis (--ta ad). Same node/edge SCHEMA and same collaboration-graph
# logic as NSCLC, but sourced from the AD rank tables (hcp_established_ranks_v3 +
# hcp_rising_composite_v1, AD ta_id) since AD has no rows in hcp_score_ranks_v2.
# Deliberately GLOBAL (no country='US' filter) — AD is ~82% international.
# ---------------------------------------------------------------------------

AD_TA_ID = "9e4139d2-e062-4a58-8728-cdabb2d7dca1"
AD_NODES_PATH = Path("frontend/src/data/telescope_ad_nodes.json")
AD_EDGES_PATH = Path("frontend/src/data/telescope_ad_edges.json")

AD_NODES_SQL = """
WITH top_established AS (
  SELECT
    er.hcp_id,
    h.first_name || ' ' || h.last_name AS name,
    h.institution_normalized,
    er.rank,
    er.cohort_score AS score_at_rank,
    er.therapeutic_area_id
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
    AND er.scope_type = 'global'
  ORDER BY er.rank
  LIMIT 50
),
network_hcps AS (
  SELECT
    te.hcp_id::text AS id,
    te.name,
    te.institution_normalized AS institution,
    'established' AS cohort,
    te.rank,
    te.score_at_rank AS score
  FROM top_established te
  UNION
  SELECT DISTINCT
    h.id::text AS id,
    h.first_name || ' ' || h.last_name AS name,
    h.institution_normalized AS institution,
    'rising' AS cohort,
    rc.rank,
    rc.rising_composite_score AS score
  FROM top_established te
  JOIN publication_authors_v2 pa_te ON pa_te.hcp_id = te.hcp_id
  JOIN publication_authors_v2 pa_rs
    ON pa_rs.publication_id = pa_te.publication_id
    AND pa_rs.hcp_id != te.hcp_id
  JOIN hcps_v2 h ON h.id = pa_rs.hcp_id
  JOIN hcp_rising_composite_v1 rc
    ON rc.hcp_id = h.id
    AND rc.scope_type = 'global'
    AND rc.therapeutic_area_id = te.therapeutic_area_id
)
SELECT * FROM network_hcps;
"""

AD_EDGES_SQL = """
WITH top_established AS (
  SELECT er.hcp_id, er.therapeutic_area_id
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
    AND er.scope_type = 'global'
  ORDER BY er.rank
  LIMIT 50
),
network_hcp_ids AS (
  SELECT hcp_id FROM top_established
  UNION
  SELECT DISTINCT pa_rs.hcp_id
  FROM top_established te
  JOIN publication_authors_v2 pa_te ON pa_te.hcp_id = te.hcp_id
  JOIN publication_authors_v2 pa_rs
    ON pa_rs.publication_id = pa_te.publication_id
    AND pa_rs.hcp_id != te.hcp_id
  JOIN hcps_v2 h ON h.id = pa_rs.hcp_id
  JOIN hcp_rising_composite_v1 rc
    ON rc.hcp_id = pa_rs.hcp_id
    AND rc.scope_type = 'global'
    AND rc.therapeutic_area_id = te.therapeutic_area_id
)
SELECT
  LEAST(pa1.hcp_id, pa2.hcp_id)::text AS source,
  GREATEST(pa1.hcp_id, pa2.hcp_id)::text AS target,
  count(DISTINCT pa1.publication_id) AS weight
FROM network_hcp_ids nh1
JOIN network_hcp_ids nh2 ON nh1.hcp_id < nh2.hcp_id
JOIN publication_authors_v2 pa1 ON pa1.hcp_id = nh1.hcp_id
JOIN publication_authors_v2 pa2
  ON pa2.publication_id = pa1.publication_id
  AND pa2.hcp_id = nh2.hcp_id
GROUP BY LEAST(pa1.hcp_id, pa2.hcp_id), GREATEST(pa1.hcp_id, pa2.hcp_id);
"""

# TA registry — --ta selects which SQL + output paths to use. NSCLC entry uses the
# original constants verbatim, so `--ta nsclc` (the default) is byte-identical.
NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"

# Focus enrichment (Option 3): bake each node's REAL top-5 collaborators from the
# validated-clean hcp_top_collaborators_v2 (window 10yr), so the FOCUS view can show a
# researcher's actual network — including collaborators absent from the bounded overview
# subgraph (the whole point: e.g. Heymach's Zhang/Gibbons/Swisher). Additive: overview
# nodes/edges are untouched. Per-collaborator institution is deliberately NOT baked
# (recover by hcp_id lookup on focus) — it was the largest string weight. Collaborator
# `cohort` (established / rising / other) is baked for focus-view node coloring and mirrors
# the overview's two cohorts, resolved via each TA's own rank tables. NSCLC-scoped by the
# ta id + rising-membership join (%(ta)s), keeping the seed-coupled TA pin intact.
# Cohort classification uses correlated EXISTS (not JOINs): a collaborator with >1 row in
# a rank table would fan a JOIN out and duplicate the collaborator, so membership is tested,
# never joined. Guarantees exactly one row per (seed, rank) → at most 5 per node.
#   {rising_exists}: the TA-appropriate rising-membership EXISTS clause.
# Return the collaborator's RAW rank in each cohort (established / rising /
# community). enrich_focus() picks the stronger cohort by PERCENTILE and bakes
# {cohort, rank} — so the frontend can SHOW "Rising #4" / "Established #296"
# instead of falsely claiming a ranked person is unrecognized. `{rising_rank}` is
# the per-TA rising-rank scalar subquery.
FOCUS_SQL_TEMPLATE = """
WITH seed AS (SELECT DISTINCT unnest(%(ids)s::uuid[]) AS hcp_id)  -- DISTINCT: the overview
-- UNION can list one hcp twice (established seed AND rising co-author, e.g. Riely); an
-- undeduped seed would fan the join out and duplicate that node's collaborators.
SELECT tc.hcp_id::text AS seed_id, tc.rank, tc.shared_publications,
       tc.collaborator_hcp_id::text AS collab_id,
       trim(coalesce(h.first_name,'') || ' ' || coalesce(h.last_name,'')) AS collab_name,
       (SELECT min(er.rank) FROM hcp_established_ranks_v3 er
          WHERE er.hcp_id = tc.collaborator_hcp_id
            AND er.therapeutic_area_id = %(ta)s AND er.scope_type = 'global') AS est_rank,
       ({rising_rank}) AS rising_rank,
       (SELECT min(cr.rank) FROM hcp_community_ranks_v2 cr
          WHERE cr.hcp_id = tc.collaborator_hcp_id
            AND cr.therapeutic_area_id = %(ta)s) AS community_rank
FROM hcp_top_collaborators_v2 tc
JOIN seed s ON s.hcp_id = tc.hcp_id
JOIN hcps_v2 h ON h.id = tc.collaborator_hcp_id
WHERE tc.therapeutic_area_id = %(ta)s AND tc.window_type = '10yr' AND tc.rank <= 5
ORDER BY tc.hcp_id, tc.rank
"""

# Per-TA rising RANK scalar + the cohort's population size (for the percentile
# comparison). NSCLC → hcp_rising_star_ranks_v3 (US-scoped via us_rank); AD →
# hcp_rising_composite_v1 (global). Kept consistent with the rising node layer.
NSCLC_RISING_RANK = """SELECT min(sr.us_rank) FROM hcp_rising_star_ranks_v3 sr
              WHERE sr.hcp_id = tc.collaborator_hcp_id
                AND sr.therapeutic_area_id = %(ta)s AND sr.us_rank IS NOT NULL"""
NSCLC_RISING_SIZE = """SELECT count(*) AS c FROM hcp_rising_star_ranks_v3
              WHERE therapeutic_area_id = %(ta)s AND us_rank IS NOT NULL"""
AD_RISING_RANK = """SELECT min(sr.rank) FROM hcp_rising_composite_v1 sr
              WHERE sr.hcp_id = tc.collaborator_hcp_id
                AND sr.therapeutic_area_id = %(ta)s AND sr.scope_type = 'global'"""
AD_RISING_SIZE = """SELECT count(*) AS c FROM hcp_rising_composite_v1
              WHERE therapeutic_area_id = %(ta)s AND scope_type = 'global'"""

TA_EXPORTS = {
    "nsclc": {
        "nodes_sql": NODES_SQL, "edges_sql": EDGES_SQL,
        "nodes_path": NODES_PATH, "edges_path": EDGES_PATH,
        "ta_id": NSCLC_TA_ID, "rising_rank": NSCLC_RISING_RANK, "rising_size": NSCLC_RISING_SIZE,
    },
    "ad": {
        "nodes_sql": AD_NODES_SQL, "edges_sql": AD_EDGES_SQL,
        "nodes_path": AD_NODES_PATH, "edges_path": AD_EDGES_PATH,
        "ta_id": AD_TA_ID, "rising_rank": AD_RISING_RANK, "rising_size": AD_RISING_SIZE,
    },
}
# Accepted --ta aliases -> registry key.
TA_ALIASES = {
    "nsclc": "nsclc",
    "ad": "ad", "atopic-dermatitis": "ad", "atopic_dermatitis": "ad",
}


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    url = get_required_env("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip() or os.getenv("SUPABASE_KEY", "").strip()
    if not key:
        raise EnvironmentError("Missing SUPABASE_SERVICE_KEY or SUPABASE_KEY")
    return create_client(url, key)


def json_safe_row(row: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, UUID):
            out[key] = str(value)
        elif isinstance(value, Decimal):
            out[key] = float(value)
        else:
            out[key] = value
    return out


def run_query(sql: str, params: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
    database_url = get_required_env("DATABASE_URL")

    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
                cur.execute(sql, params or {})
                rows = cur.fetchall()
        return [json_safe_row(dict(row)) for row in rows]
    except ImportError:
        pass

    try:
        import psycopg2
        import psycopg2.extras
    except ImportError as exc:
        raise RuntimeError(
            "DATABASE_URL queries require psycopg or psycopg2-binary. "
            "Install with: pip install psycopg[binary]  OR  pip install psycopg2-binary"
        ) from exc

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
            cur.execute(sql, params or {})
            rows = cur.fetchall()
        return [json_safe_row(dict(row)) for row in rows]
    finally:
        conn.close()


def enrich_focus(nodes: List[Dict[str, Any]], ta_id: str, rising_rank: str, rising_size: str) -> None:
    """Attach `focus_collaborators` (top-5) to each node IN PLACE. Overview fields untouched.

    Each collaborator gets {cohort, rank}: the STRONGER of the cohorts they hold,
    chosen by percentile (rank / cohort size), ties → rising. `rank` is null only
    when the collaborator is genuinely unranked in all three cohorts.
    """
    ids = [n["id"] for n in nodes]
    sql = FOCUS_SQL_TEMPLATE.format(rising_rank=rising_rank)
    rows = run_query(sql, {"ids": ids, "ta": ta_id})
    est_size = (run_query(
        "SELECT count(*) AS c FROM hcp_established_ranks_v3 "
        "WHERE therapeutic_area_id = %(ta)s AND scope_type = 'global'", {"ta": ta_id})[0]["c"]) or 1
    ris_size = (run_query(rising_size, {"ta": ta_id})[0]["c"]) or 1
    com_size = (run_query(
        "SELECT count(*) AS c FROM hcp_community_ranks_v2 "
        "WHERE therapeutic_area_id = %(ta)s", {"ta": ta_id})[0]["c"]) or 1

    def choose(er, rr, cr):
        # (percentile, cohort, rank, tiebreak) — lower percentile wins; ties → rising.
        cands = []
        if er is not None:
            cands.append((er / est_size, "established", er, 1))
        if rr is not None:
            cands.append((rr / ris_size, "rising", rr, 0))
        if cr is not None:
            cands.append((cr / com_size, "community", cr, 2))
        if not cands:
            return ("other", None)
        cands.sort(key=lambda c: (c[0], c[3]))
        return (cands[0][1], cands[0][2])

    from collections import defaultdict

    by_seed: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows:
        cohort, rank = choose(r["est_rank"], r["rising_rank"], r["community_rank"])
        by_seed[r["seed_id"]].append({
            "hcp_id": r["collab_id"],
            "name": r["collab_name"],
            "shared_publications": r["shared_publications"],
            "cohort": cohort,
            "rank": rank,
        })
    for n in nodes:
        n["focus_collaborators"] = by_seed.get(n["id"], [])


def payload_size_mb(data: List[Dict[str, Any]]) -> float:
    return len(json.dumps(data, default=str).encode("utf-8")) / (1024 * 1024)


def write_json_array(path: Path, data: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export Telescope collaboration network data (nodes + edges)."
    )
    parser.add_argument(
        "--ta",
        type=str,
        default="nsclc",
        help="Therapeutic area: 'nsclc' (default) or 'ad'/'atopic-dermatitis'.",
    )
    parser.add_argument(
        "--out-dir",
        type=str,
        default=None,
        help="Optional output directory. When set, nodes/edges are written to "
        "<out-dir>/<original-filename> instead of the live frontend paths — use for a "
        "dry run that does NOT overwrite the live JSON.",
    )
    args = parser.parse_args()
    ta_key = TA_ALIASES.get(args.ta.strip().lower())
    if ta_key is None:
        print(
            f"Error: unknown --ta '{args.ta}'. Options: {sorted(set(TA_ALIASES))}",
            file=sys.stderr,
        )
        return 1
    cfg = TA_EXPORTS[ta_key]

    out_dir = Path(args.out_dir) if args.out_dir else None

    def eff_path(p: Path) -> Path:
        return (out_dir / p.name) if out_dir else p

    if out_dir:
        print(f"[DRY RUN] Writing to {out_dir} — live JSON NOT overwritten.")

    load_dotenv()
    try:
        init_supabase()
    except EnvironmentError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    try:
        print(f"[{ta_key}] Querying nodes...")
        nodes = run_query(cfg["nodes_sql"])
        print(f"Got {len(nodes)} nodes ({payload_size_mb(nodes):.1f} MB)")

        # Focus enrichment — bake each node's real top-5 collaborators (additive).
        print(f"[{ta_key}] Enriching nodes with focus_collaborators...")
        enrich_focus(nodes, cfg["ta_id"], cfg["rising_rank"], cfg["rising_size"])
        covered = sum(1 for n in nodes if n.get("focus_collaborators"))
        print(f"  focus_collaborators on {covered}/{len(nodes)} nodes ({payload_size_mb(nodes):.1f} MB)")
        nodes_out = eff_path(cfg["nodes_path"])
        print(f"Writing to {nodes_out}")
        write_json_array(nodes_out, nodes)

        print(f"[{ta_key}] Querying edges...")
        edges = run_query(cfg["edges_sql"])
        print(f"Got {len(edges)} edges ({payload_size_mb(edges):.1f} MB)")
        edges_out = eff_path(cfg["edges_path"])
        print(f"Writing to {edges_out}")
        write_json_array(edges_out, edges)

        print("Done.")
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
