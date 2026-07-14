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

NODES_SQL = """
WITH top_established AS (
  SELECT
    hsr.hcp_id,
    h.first_name || ' ' || h.last_name AS name,
    h.institution_normalized,
    hsr.rank,
    hsr.score_at_rank,
    hsr.therapeutic_area_id
  FROM hcp_score_ranks_v2 hsr
  JOIN hcps_v2 h ON h.id = hsr.hcp_id
  JOIN therapeutic_areas ta ON ta.id = hsr.therapeutic_area_id
  WHERE hsr.cohort = 'established'
    AND hsr.scope_type = 'global'
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
    hsr.rank,
    hsr.score_at_rank AS score
  FROM top_established te
  JOIN publication_authors_v2 pa_te ON pa_te.hcp_id = te.hcp_id
  JOIN publication_authors_v2 pa_rs
    ON pa_rs.publication_id = pa_te.publication_id
    AND pa_rs.hcp_id != te.hcp_id
  JOIN hcps_v2 h ON h.id = pa_rs.hcp_id AND h.country = 'US'
  JOIN hcp_score_ranks_v2 hsr
    ON hsr.hcp_id = h.id
    AND hsr.cohort = 'rising'
    AND hsr.scope_type = 'global'
    AND hsr.therapeutic_area_id = te.therapeutic_area_id
)
SELECT * FROM network_hcps;
"""

EDGES_SQL = """
WITH top_established AS (
  SELECT hsr.hcp_id, hsr.therapeutic_area_id
  FROM hcp_score_ranks_v2 hsr
  JOIN hcps_v2 h ON h.id = hsr.hcp_id
  JOIN therapeutic_areas ta ON ta.id = hsr.therapeutic_area_id
  WHERE hsr.cohort = 'established'
    AND hsr.scope_type = 'global'
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
  JOIN hcp_score_ranks_v2 hsr
    ON hsr.hcp_id = pa_rs.hcp_id
    AND hsr.cohort = 'rising'
    AND hsr.scope_type = 'global'
    AND hsr.therapeutic_area_id = te.therapeutic_area_id
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
TA_EXPORTS = {
    "nsclc": {
        "nodes_sql": NODES_SQL, "edges_sql": EDGES_SQL,
        "nodes_path": NODES_PATH, "edges_path": EDGES_PATH,
    },
    "ad": {
        "nodes_sql": AD_NODES_SQL, "edges_sql": AD_EDGES_SQL,
        "nodes_path": AD_NODES_PATH, "edges_path": AD_EDGES_PATH,
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


def run_query(sql: str) -> List[Dict[str, Any]]:
    database_url = get_required_env("DATABASE_URL")

    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
                cur.execute(sql)
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
            cur.execute(sql)
            rows = cur.fetchall()
        return [json_safe_row(dict(row)) for row in rows]
    finally:
        conn.close()


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
    args = parser.parse_args()
    ta_key = TA_ALIASES.get(args.ta.strip().lower())
    if ta_key is None:
        print(
            f"Error: unknown --ta '{args.ta}'. Options: {sorted(set(TA_ALIASES))}",
            file=sys.stderr,
        )
        return 1
    cfg = TA_EXPORTS[ta_key]

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
        print(f"Writing to {cfg['nodes_path']}")
        write_json_array(cfg["nodes_path"], nodes)

        print(f"[{ta_key}] Querying edges...")
        edges = run_query(cfg["edges_sql"])
        print(f"Got {len(edges)} edges ({payload_size_mb(edges):.1f} MB)")
        print(f"Writing to {cfg['edges_path']}")
        write_json_array(cfg["edges_path"], edges)

        print("Done.")
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
