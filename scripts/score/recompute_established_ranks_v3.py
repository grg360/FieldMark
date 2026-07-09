"""
recompute_established_ranks_v3.py — Established cohort composite ranking (v3).

Reorders HCPs qualified as Established via hcp_cohort_classification_v2
(cohort='established') using:

  cohort_score =
    0.50 * scientific_influence_pctile
    + 0.35 * network_influence_pctile (re-derived within scope)
    + 0.15 * pharma_engagement_pctile

Missing signal data is treated as percentile 0 (penalizing). We may revisit
later (e.g., impute median or weight only available signals).

Scope rows (same intent as the old hcp_established_ranks_v2 materialization):
  - every Established HCP gets a global scope row (scope_type='global',
    scope_value=NULL)
  - HCPs with a non-null country also get a region scope row
    (scope_type='region', scope_value=<country code>)

Usage:
    python recompute_established_ranks_v3.py --ta nsclc
    python recompute_established_ranks_v3.py --ta nsclc --dry-run --debug-top 30

Required environment variables (.env):
    DATABASE_URL
"""

from __future__ import annotations

import os

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor, execute_values

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def get_conn():
    if not DATABASE_URL:
        raise EnvironmentError("Missing DATABASE_URL")
    return psycopg2.connect(DATABASE_URL)


def resolve_ta_id(conn, slug: str):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM therapeutic_areas WHERE slug = %s", (slug,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"TA not found: {slug}")
        return row[0]


def fetch_established_cohort(conn, ta_id):
    """
    Established cohort from hcp_cohort_classification_v2, expanded into the
    same (hcp, scope) rows the old hcp_established_ranks_v2 carried:
      - one global row per HCP
      - one region:<country> row when hcps_v2.country is non-null

    Returns list of dicts with keys:
      hcp_id, scope_type, scope_value, first_name, last_name, institution_normalized
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
              cc.hcp_id::text AS hcp_id,
              h.first_name,
              h.last_name,
              h.institution_normalized,
              NULLIF(BTRIM(h.country), '') AS country
            FROM hcp_cohort_classification_v2 cc
            JOIN hcps_v2 h ON h.id = cc.hcp_id
            WHERE cc.therapeutic_area_id = %s
              AND cc.cohort = 'established'
            ORDER BY cc.hcp_id
            """,
            (ta_id,),
        )
        base_rows = cur.fetchall()

    expanded = []
    for row in base_rows:
        expanded.append(
            {
                "hcp_id": row["hcp_id"],
                "scope_type": "global",
                "scope_value": None,
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "institution_normalized": row["institution_normalized"],
            }
        )
        country = row.get("country")
        if country:
            expanded.append(
                {
                    "hcp_id": row["hcp_id"],
                    "scope_type": "region",
                    "scope_value": country,
                    "first_name": row["first_name"],
                    "last_name": row["last_name"],
                    "institution_normalized": row["institution_normalized"],
                }
            )
    return expanded


def fetch_scientific_scores(conn, ta_id):
    """Returns {hcp_id_str: percentile}"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT hcp_id::text, percentile_rank
            FROM hcp_publication_leadership_v2
            WHERE therapeutic_area_id = %s
            """,
            (ta_id,),
        )
        return {
            row[0]: float(row[1]) if row[1] is not None else None for row in cur.fetchall()
        }


def fetch_network_scores(conn, ta_id):
    """Returns {hcp_id_str: network_influence_score} for ranking later"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT hcp_id::text, network_influence_score
            FROM hcp_network_centrality_v2
            WHERE therapeutic_area_id = %s
              AND window_type = '10yr'
            """,
            (ta_id,),
        )
        return {
            row[0]: float(row[1]) if row[1] is not None else None for row in cur.fetchall()
        }


def fetch_pharma_scores(conn, ta_id):
    """Returns {hcp_id_str: percentile}"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT hcp_id::text, percentile_rank
            FROM hcp_pharma_engagement_v2
            WHERE therapeutic_area_id = %s
            """,
            (ta_id,),
        )
        return {
            row[0]: float(row[1]) if row[1] is not None else None for row in cur.fetchall()
        }


def compute_percentiles_in_scope(values_dict):
    """Same rank-percentile pattern as other scripts."""
    if not values_dict:
        return {}
    items = sorted(values_dict.items(), key=lambda kv: kv[1], reverse=True)
    n = len(items)
    if n == 1:
        return {items[0][0]: 100.0}
    out = {}
    for position, (key, _) in enumerate(items):
        percentile = 100.0 * (1.0 - position / (n - 1))
        out[key] = round(percentile, 2)
    return out


def upsert_ranks(conn, ta_id, rows):
    if not rows:
        return 0
    values = [
        (
            r["hcp_id"],
            ta_id,
            r["scope_type"],
            r["scope_value"],
            int(r["rank"]),
            float(r["cohort_score"]),
            float(r["scientific_pctile"]),
            float(r["network_pctile"]),
            float(r["pharma_pctile"]),
        )
        for r in rows
    ]
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO hcp_established_ranks_v3
                  (hcp_id, therapeutic_area_id, scope_type, scope_value,
                   rank, cohort_score,
                   scientific_influence_pctile, network_influence_pctile,
                   pharma_engagement_pctile)
                VALUES %s
                ON CONFLICT (hcp_id, therapeutic_area_id, scope_type, scope_value)
                DO UPDATE SET
                  rank = EXCLUDED.rank,
                  cohort_score = EXCLUDED.cohort_score,
                  scientific_influence_pctile = EXCLUDED.scientific_influence_pctile,
                  network_influence_pctile = EXCLUDED.network_influence_pctile,
                  pharma_engagement_pctile = EXCLUDED.pharma_engagement_pctile,
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
@click.option("--debug-top", default=30, type=int, help="Print top N for region/US scope")
@click.option("--w-scientific", default=0.50, type=float)
@click.option("--w-network", default=0.35, type=float)
@click.option("--w-pharma", default=0.15, type=float)
def main(
    ta: str,
    dry_run: bool,
    debug_top: int,
    w_scientific: float,
    w_network: float,
    w_pharma: float,
) -> None:
    if abs(w_scientific + w_network + w_pharma - 1.0) > 0.001:
        print(f"WARNING: weights sum to {w_scientific + w_network + w_pharma}, not 1.0")

    w_sci = w_scientific
    w_net = w_network
    w_pha = w_pharma

    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(f"Recomputing Established cohort for TA: {ta}")
    print(f"Weights: Scientific={w_scientific}, Network={w_network}, Pharma={w_pharma}")

    cohort = fetch_established_cohort(conn, ta_id)
    distinct_hcps = len({r["hcp_id"] for r in cohort})
    print(f"Found {distinct_hcps} Established HCPs -> {len(cohort)} (hcp, scope) rows")

    if not cohort:
        print("No cohort data. Exiting.")
        conn.close()
        return

    sci_scores = fetch_scientific_scores(conn, ta_id)
    print(f"  Scientific scores: {len(sci_scores)} HCPs")

    net_raw = fetch_network_scores(conn, ta_id)
    print(f"  Network scores: {len(net_raw)} HCPs")

    pharma_scores = fetch_pharma_scores(conn, ta_id)
    print(f"  Pharma scores: {len(pharma_scores)} HCPs")

    by_scope: dict[tuple[str, str | None], list] = {}
    for row in cohort:
        key = (row["scope_type"], row["scope_value"])
        by_scope.setdefault(key, []).append(row)

    print(f"Found {len(by_scope)} scopes")

    all_results = []
    debug_us_results = None
    debug_global_results = None

    for (scope_type, scope_value), members in by_scope.items():
        scope_net_raw = {m["hcp_id"]: net_raw.get(m["hcp_id"], 0) for m in members}
        scope_net_pctiles = compute_percentiles_in_scope(scope_net_raw)

        scope_results = []
        for m in members:
            hcp_id = m["hcp_id"]
            sci_value = sci_scores.get(hcp_id)
            net_value = scope_net_pctiles.get(hcp_id)
            pharma_value = pharma_scores.get(hcp_id)

            components = []
            if sci_value is not None:
                components.append((w_sci, float(sci_value)))
            if net_value is not None:
                components.append((w_net, float(net_value)))
            if pharma_value is not None:
                components.append((w_pha, float(pharma_value)))

            if not components:
                cohort_score = 0
            else:
                total_w = sum(w for w, _ in components)
                cohort_score = sum((w / total_w) * v for w, v in components)

            sci = float(sci_value) if sci_value is not None else 0
            net = float(net_value) if net_value is not None else 0
            pharma = float(pharma_value) if pharma_value is not None else 0

            scope_results.append(
                {
                    **m,
                    "scientific_pctile": sci,
                    "network_pctile": net,
                    "pharma_pctile": pharma,
                    "cohort_score": cohort_score,
                }
            )

        scope_results.sort(key=lambda r: r["cohort_score"], reverse=True)
        for i, r in enumerate(scope_results, 1):
            r["rank"] = i

        all_results.extend(scope_results)

        if scope_type == "region" and scope_value == "US":
            debug_us_results = scope_results
        if scope_type == "global":
            debug_global_results = scope_results

    def _print_top(label: str, scope_results: list) -> None:
        print(f"\n=== Top {debug_top} {label} Established (new composite) ===")
        print(
            f"{'NewRk':<6} {'Name':<28} {'Inst':<28} {'Score':<7} "
            f"{'Sci':<6} {'Net':<6} {'Pha':<6}"
        )
        for r in scope_results[:debug_top]:
            name = f"{r['first_name']} {r['last_name']}"
            name_safe = name.encode("ascii", errors="replace").decode("ascii")
            inst = r.get("institution_normalized") or ""
            inst_safe = str(inst).encode("ascii", errors="replace").decode("ascii")
            print(
                f"{r['rank']:<6} {name_safe[:27]:<28} {inst_safe[:27]:<28} "
                f"{r['cohort_score']:<7.2f} "
                f"{r['scientific_pctile']:<6.1f} {r['network_pctile']:<6.1f} "
                f"{r['pharma_pctile']:<6.1f}"
            )

    if debug_global_results:
        _print_top("global", debug_global_results)
    if debug_us_results:
        _print_top("US", debug_us_results)

    if dry_run:
        print(f"\n[dry-run] would have written {len(all_results)} rows")
    else:
        n = upsert_ranks(conn, ta_id, all_results)
        print(f"\nWrote {n} rows to hcp_established_ranks_v3")

    conn.close()


if __name__ == "__main__":
    main()
