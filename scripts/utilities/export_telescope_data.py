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
    load_dotenv()
    try:
        init_supabase()
    except EnvironmentError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    try:
        print("Querying nodes...")
        nodes = run_query(NODES_SQL)
        print(f"Got {len(nodes)} nodes ({payload_size_mb(nodes):.1f} MB)")
        print(f"Writing to {NODES_PATH}")
        write_json_array(NODES_PATH, nodes)

        print("Querying edges...")
        edges = run_query(EDGES_SQL)
        print(f"Got {len(edges)} edges ({payload_size_mb(edges):.1f} MB)")
        print(f"Writing to {EDGES_PATH}")
        write_json_array(EDGES_PATH, edges)

        print("Done.")
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
