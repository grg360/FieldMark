"""
rising_composite_scoring.py — Rising Star composite ranking (Emergence + Network).

Combines within-cohort Scientific Emergence with scope-re-derived Network Influence:

  rising_composite = w_emergence * emergence_pctile + w_network * network_pctile

Population: rising HCPs with an emergence score in hcp_scientific_emergence_v1
for the scoped TA (joined to hcps_v2 for geography and names), gated by the
SAME industry/government predicate as recompute_established_ranks_v3 (2026-08-02):
only ACADEMIC HCPs, plus GOVERNMENT at NCI/NIH, enter the cohort — INDUSTRY,
other GOVERNMENT, UNKNOWN and unclassified are excluded BEFORE percentiling, so
survivors are ranked against each other. (Measured before the fix: 185 of 3,052
AD members were industry/gov/unknown, 15 of them in the global top 100 —
Sanofi at #2, Pfizer #13, Regeneron #15 on rendered surfaces.)

The writer DELETES de-listed rows (same TA, hcp_id not in the new result set)
in the same transaction as the upsert — upsert-only recompute leaves stale
ranks interleaved with fresh ones, the trap established hit.

Scopes mirror recompute_established_ranks_v3:
  - one global row per HCP (scope_type='global', scope_value=NULL)
  - one region row when country is non-null (scope_type='region', scope_value=country)

Network percentile is re-derived within each scope using the shared convention
100.0 * (n - position) / (n + 1) — the Weibull plotting position, see
docs/PERCENTILE_CONVENTION.md. Missing network raw scores are excluded from
the composite via per-HCP weight renormalization (emergence-only when network absent).

Usage:
    python scripts/score/rising_composite_scoring.py --ta atopic-dermatitis --dry-run
    python scripts/score/rising_composite_scoring.py --ta atopic-dermatitis --execute

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


def fetch_rising_cohort(conn, ta_id):
    """
    Rising HCPs with emergence scores, expanded into global + region scope rows.

    Returns list of dicts with keys:
      hcp_id, scope_type, scope_value, first_name, last_name,
      institution_normalized, country, emergence_pctile
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
              se.hcp_id::text AS hcp_id,
              se.emergence_percentile,
              h.first_name,
              h.last_name,
              h.institution_normalized,
              NULLIF(BTRIM(h.country), '') AS country
            FROM hcp_scientific_emergence_v1 se
            JOIN hcps_v2 h ON h.id = se.hcp_id
            WHERE se.therapeutic_area_id = %s
              -- Industry/government gate, VERBATIM the established predicate
              -- (recompute_established_ranks_v3.py). Admit ACADEMIC, plus
              -- GOVERNMENT at NCI/NIH (engageable trialists, not regulators).
              -- INDUSTRY, other GOVERNMENT, UNKNOWN and unclassified drop out
              -- here, before scope percentiling, so survivors are ranked
              -- against each other. Classifier is reingest stage 8e.
              AND EXISTS (
                SELECT 1 FROM hcp_industry_classification_v1 ic
                WHERE ic.hcp_id = se.hcp_id
                  AND (
                    ic.classification = 'ACADEMIC'
                    OR (
                      ic.classification = 'GOVERNMENT'
                      AND (
                        ic.matched_pattern LIKE '%%National Cancer Institute%%'
                        OR ic.matched_pattern LIKE '%%National Institutes of Health%%'
                      )
                    )
                  )
              )
            ORDER BY se.hcp_id
            """,
            (ta_id,),
        )
        base_rows = cur.fetchall()

    expanded = []
    for row in base_rows:
        emergence_pctile = float(row["emergence_percentile"])
        base = {
            "hcp_id": row["hcp_id"],
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "institution_normalized": row["institution_normalized"],
            "country": row.get("country"),
            "emergence_pctile": emergence_pctile,
        }
        expanded.append({**base, "scope_type": "global", "scope_value": None})
        country = row.get("country")
        if country:
            expanded.append(
                {**base, "scope_type": "region", "scope_value": country}
            )
    return expanded


def fetch_network_scores(conn, ta_id):
    """Returns {hcp_id_str: network_influence_score} for 10yr window."""
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


def compute_percentiles_in_scope(values_dict):
    """Continuous rank-percentile: 100 = highest, 0+ = lowest."""
    if not values_dict:
        return {}
    items = sorted(values_dict.items(), key=lambda kv: kv[1], reverse=True)
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


def assert_scoped_ta_writes(rows, scoped_ta_id: str) -> None:
    bad = [r for r in rows if str(r.get("therapeutic_area_id")) != str(scoped_ta_id)]
    if bad:
        raise RuntimeError(
            f"SAFETY VIOLATION: {len(bad)} row(s) have therapeutic_area_id != {scoped_ta_id}"
        )


def upsert_composite(conn, ta_id, rows):
    # Empty result -> write NOTHING and delete NOTHING. An empty cohort means
    # something upstream broke (e.g. the classifier table emptied); silently
    # wiping the board on it would be destructive, not corrective.
    if not rows:
        return 0, 0
    payload = [
        (
            r["hcp_id"],
            ta_id,
            r["scope_type"],
            r["scope_value"],
            int(r["rank"]),
            float(r["rising_composite_score"]),
            float(r["emergence_pctile"]),
            float(r["network_pctile"]),
        )
        for r in rows
    ]
    scoped_rows = [{"therapeutic_area_id": ta_id, **r} for r in rows]
    assert_scoped_ta_writes(scoped_rows, ta_id)
    keep_ids = sorted({r["hcp_id"] for r in rows})
    try:
        with conn.cursor() as cur:
            # DE-LIST DELETE, same transaction as the upsert: rows for this TA
            # whose hcp_id is not in the new result set are removed. Without
            # this, upsert-only recompute leaves de-listed members (e.g. the
            # industry class the cohort gate now excludes) holding stale ranks
            # that interleave with the fresh ordering — the trap established
            # hit and had to clean up with separate deletes.
            cur.execute(
                """
                DELETE FROM hcp_rising_composite_v1
                WHERE therapeutic_area_id = %s
                  AND NOT (hcp_id = ANY(%s::uuid[]))
                """,
                (ta_id, keep_ids),
            )
            delisted = cur.rowcount or 0
            execute_values(
                cur,
                """
                INSERT INTO hcp_rising_composite_v1
                  (hcp_id, therapeutic_area_id, scope_type, scope_value,
                   rank, rising_composite_score,
                   emergence_pctile, network_influence_pctile)
                VALUES %s
                ON CONFLICT (hcp_id, therapeutic_area_id, scope_type, scope_value)
                DO UPDATE SET
                  rank = EXCLUDED.rank,
                  rising_composite_score = EXCLUDED.rising_composite_score,
                  emergence_pctile = EXCLUDED.emergence_pctile,
                  network_influence_pctile = EXCLUDED.network_influence_pctile,
                  computed_at = now()
                """,
                payload,
            )
        conn.commit()
        return len(payload), delisted
    except Exception:
        conn.rollback()
        raise


@click.command()
@click.option("--ta", default="atopic-dermatitis", help="Therapeutic area slug")
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--execute", is_flag=True, help="Write results to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N for global/US scopes")
@click.option("--w-emergence", default=0.75, type=float)
@click.option("--w-network", default=0.25, type=float)
def main(
    ta: str,
    dry_run: bool,
    execute: bool,
    debug_top: int,
    w_emergence: float,
    w_network: float,
) -> None:
    if abs(w_emergence + w_network - 1.0) > 0.001:
        print(f"WARNING: weights sum to {w_emergence + w_network}, not 1.0")

    write = execute and not dry_run

    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(f"Computing Rising composite for TA: {ta} ({ta_id})")
    print(f"Weights: Emergence={w_emergence}, Network={w_network}")
    print(f"Mode: {'EXECUTE (writes enabled)' if write else 'DRY-RUN (no writes)'}")

    cohort = fetch_rising_cohort(conn, ta_id)
    distinct_hcps = len({r["hcp_id"] for r in cohort})
    print(f"Found {distinct_hcps} rising HCPs with emergence -> {len(cohort)} (hcp, scope) rows")

    if not cohort:
        print("No rising cohort data. Exiting.")
        conn.close()
        return

    net_raw = fetch_network_scores(conn, ta_id)
    print(f"  Network scores (10yr): {len(net_raw)} HCPs")

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
            emergence_value = m["emergence_pctile"]
            net_raw_value = net_raw.get(hcp_id)
            net_pctile_value = scope_net_pctiles.get(hcp_id) if net_raw_value is not None else None

            components = []
            if emergence_value is not None:
                components.append((w_emergence, float(emergence_value)))
            if net_pctile_value is not None:
                components.append((w_network, float(net_pctile_value)))

            if not components:
                composite_score = 0.0
            else:
                total_w = sum(w for w, _ in components)
                composite_score = sum((w / total_w) * v for w, v in components)

            net_stored = float(net_pctile_value) if net_pctile_value is not None else 0.0

            scope_results.append(
                {
                    **m,
                    "network_pctile": net_stored,
                    "rising_composite_score": composite_score,
                }
            )

        scope_results.sort(key=lambda r: r["rising_composite_score"], reverse=True)
        for i, r in enumerate(scope_results, 1):
            r["rank"] = i

        all_results.extend(scope_results)

        if scope_type == "region" and scope_value == "US":
            debug_us_results = scope_results
        if scope_type == "global":
            debug_global_results = scope_results

    def _print_top(label: str, scope_results: list) -> None:
        print(f"\n=== Top {debug_top} {label} Rising (composite) ===")
        print(
            f"{'Rk':<5} {'Name':<26} {'Inst':<24} {'Ctry':<5} "
            f"{'Score':<7} {'Emerg':<7} {'Net':<7}"
        )
        for r in scope_results[:debug_top]:
            name = f"{r['first_name']} {r['last_name']}"
            name_safe = name.encode("ascii", errors="replace").decode("ascii")
            inst = r.get("institution_normalized") or ""
            inst_safe = str(inst).encode("ascii", errors="replace").decode("ascii")
            country = r.get("country") or ""
            print(
                f"{r['rank']:<5} {name_safe[:25]:<26} {inst_safe[:23]:<24} {country:<5} "
                f"{r['rising_composite_score']:<7.2f} "
                f"{r['emergence_pctile']:<7.2f} {r['network_pctile']:<7.2f}"
            )

    if debug_global_results:
        _print_top("global", debug_global_results)
    if debug_us_results:
        _print_top("US", debug_us_results)

    if write:
        n, delisted = upsert_composite(conn, ta_id, all_results)
        print(f"\nWrote {n} rows to hcp_rising_composite_v1; de-listed (deleted) {delisted} stale rows")
    else:
        print(f"\n[dry-run] would have written {len(all_results)} rows to hcp_rising_composite_v1")

    conn.close()


if __name__ == "__main__":
    main()
