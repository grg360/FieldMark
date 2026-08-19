"""
recompute_established_ranks_v3.py — Established cohort composite ranking (v3).

Reorders HCPs qualified as Established via hcp_cohort_classification_v2
(cohort='established') using:

  cohort_score =
    0.60 * scientific_influence_pctile
    + 0.40 * network_influence_pctile (re-derived within scope)
    + 0.00 * pharma_engagement_pctile   (excluded from ranking — see below)

WEIGHTS ROUNDED TO 60/40 (2026-08-09, Garrett's ruling): the previous
0.59/0.41 was a pharma-renormalization artifact (0.50/0.35 rescaled over
0.85) that nobody rounded, not a chosen weight.

PHARMA WEIGHT IS ZERO (2026-08-02). pharma_engagement_pctile stays populated
on the row and stays displayed on the ledger — it is excluded from RANKING,
not from the surface. Rationale:

  Only 73 of 202 top-200 US-established HCPs have a pharma_engagement row.
  The chain leaks twice: 156 have an NPI, 101 have any Open Payments record,
  73 have NSCLC-attributed payments. The prior formula omitted the component
  and renormalised total_w from 1.0 to 0.85 when pharma was absent, so a
  missing pharma row scored ~99.7 on sci+net alone while a present one
  dragged the composite toward the pharma percentile. Absence was rewarded
  and presence penalised. Of the 129 zeros, roughly 50 are genuine
  non-engagers, 28 have payments that failed NSCLC attribution, 46 have no
  NPI, and 5 await an Open Payments top-up — so a third of the zeros mean
  something other than zero. Revisit the weight when NPI coverage and TA
  attribution make absence unambiguous.

NOTE on missing signals: the composite RENORMALISES over the components that
are present (it does NOT treat missing as 0 — only the stored per-component
display columns default to 0). That renormalisation is exactly what made the
pharma component perverse at 27% coverage; with two well-covered components
it is benign, but check coverage before adding any weight back.

Scope rows (same intent as the old hcp_established_ranks_v2 materialization):
  - every Established HCP gets a global scope row (scope_type='global',
    scope_value=NULL)
  - HCPs with a non-null country also get a region scope row
    (scope_type='region', scope_value=<country code>)
  - HCPs whose country falls in a region flagged regions.aggregate_scope ALSO get an
    aggregate region row (scope_type='region', scope_value=<region_key>) -- see below.
    EUROPE and APAC are flagged today.

THE EUROPE AGGREGATE SCOPE (2026-08-18). Established ranks are scope-local AND
normalised within scope, so an all-Europe selection could not be assembled by
unioning the per-country boards: that returns 31 rank-1 rows. The ledger's Europe
parent was therefore expand-only (selectable: cohortTag === "RS" in
lib/cohortLedger.ts). This scope is the additive scorer bucket that makes it
selectable -- one pool of 3,859, percentiles computed within it, ranks 1..n.

  MEMBERSHIP IS THE UNION OF THE PER-COUNTRY BUCKETS, BY CONSTRUCTION. The set
  comes from the SAME h.country the per-country row is emitted from, so a person
  in the EUROPE bucket is always in exactly one of its 31 country buckets. Deriving
  it from anything else (current_country, an affiliation rollup) would let the
  aggregate contradict its own children -- someone visible in EUROPE but in no
  European country board, or the reverse.

  NOT effective_country, deliberately. Rising places by COALESCE(current_country,
  country); Established is scored-as-stored everywhere and has no effective-country
  analogue yet (see rising_board's us_rank_eff for what that would look like). Using
  one here would silently place people in a pool their own country row disagrees
  with. When Established does get an effective-country reading it moves ALL its
  scopes at once, not this one.

  'EUROPE' IS NOT AN ISO CODE, which is what makes the bucket safe to add to a
  shared table: every consumer pinned to scope_value='US' or a country list is
  unaffected. The exception found in the 2026-08-18 consumer sweep is the "Other"
  region board (lib/api.ts resolveRpcScopeParams), which expresses itself as
  NOT IN (every defined country) and therefore matches aggregate scope values too.
  That query is fixed in the same change; anything added later that filters by
  negation has to exclude aggregates the same way.

  COUNTRY LIST FROM region_countries, NEVER HARDCODED. Same table rising_ledger
  and rising_board read, so the three cannot drift. 'EUROPE' is geography (33
  codes, incl. GB/CH/NO/RS/UA); 'EU' is the 27-member union and is a DIFFERENT
  key -- rising_board read 'EU' until 2026-08-18 and showed 48 Europeans where the
  ledger showed 53.

Usage:
    python recompute_established_ranks_v3.py --ta nsclc
    python recompute_established_ranks_v3.py --ta nsclc --dry-run --debug-top 30

Required environment variables (.env):
    DATABASE_URL
"""

from __future__ import annotations

import os
from uuid import uuid4

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor, execute_values

# Aggregate scopes are DATA, not a constant here (generalised 2026-08-18). A region
# gets an aggregate bucket when regions.aggregate_scope is true; the scope_value written
# IS the region_key, so the bucket and the country list it is built from cannot be
# repointed apart. EUROPE and APAC are flagged today. Adding LATAM is an UPDATE on
# regions plus a re-run -- no edit here, and none in either ledger RPC.
#
# WHY A FLAG RATHER THAN "every multi-country region": measured 2026-08-18 against this
# cohort, the derived rule writes 19,018 aggregate rows against the 12,620 wanted --
# EU5 (2,733), EU (3,320) and EUROPE (3,849) are three overlapping boards over the same
# people, and LATAM (66) is too small to rank. Which regions deserve a board is a
# product decision; it is stored.

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


def fetch_region_countries(conn, region_key):
    """The country set for a region, from the DB. Single source of truth shared with
    rising_ledger and rising_board -- a hardcoded list here would be a fourth copy to
    keep in sync, and the one that silently shrinks a board when it drifts."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT country_code FROM region_countries WHERE region_key = %s",
            (region_key,),
        )
        codes = {row[0] for row in cur.fetchall()}
    if not codes:
        raise RuntimeError(
            f"region_countries has no rows for region_key={region_key!r}; "
            "refusing to emit an empty aggregate scope"
        )
    return codes


def fetch_aggregate_regions(conn):
    """[(region_key, {country codes})] for every region flagged aggregate_scope.

    One query rather than a fetch per region, and ordered by regions.sort_order so a
    re-run emits its scopes in a stable order. A flagged region with no countries is a
    misconfiguration, not an empty board -- it would write a scope nobody can be in --
    so the join drops it and the caller is told."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT r.region_key,
                   array_agg(rc.country_code ORDER BY rc.country_code) AS codes
            FROM regions r
            JOIN region_countries rc ON rc.region_key = r.region_key
            WHERE r.aggregate_scope
            GROUP BY r.region_key, r.sort_order
            ORDER BY r.sort_order, r.region_key
            """
        )
        regions = [(row[0], set(row[1])) for row in cur.fetchall()]
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM regions WHERE aggregate_scope")
        flagged = cur.fetchone()[0]
    if flagged != len(regions):
        raise RuntimeError(
            f"{flagged} regions are flagged aggregate_scope but only {len(regions)} have "
            "countries in region_countries; refusing to emit an empty aggregate scope"
        )
    return regions


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
              -- Industry/government filter, matching what rising already does. Admit only
              -- ACADEMIC HCPs, plus GOVERNMENT HCPs at NCI / NIH -- those are engageable
              -- trialists, not regulators, so they stay. Everything else (INDUSTRY, and
              -- GOVERNMENT that is FDA/CDC/VA/DoD, plus UNKNOWN / unclassified) is dropped
              -- from the cohort. matched_pattern carries the classifier's NCI/NIH regex
              -- ('\bNational Cancer Institute\b' / '\bNational Institutes of Health\b'), so a
              -- LIKE on the readable substring is the exemption. The classifier is stage 8e of
              -- the reingest cycle and current for all HCPs.
              AND EXISTS (
                SELECT 1 FROM hcp_industry_classification_v1 ic
                WHERE ic.hcp_id = cc.hcp_id
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
            ORDER BY cc.hcp_id
            """,
            (ta_id,),
        )
        base_rows = cur.fetchall()

    aggregate_regions = fetch_aggregate_regions(conn)

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
            # The aggregate pools. Emitted from the SAME `country` as the row above,
            # so each aggregate is the exact union of its country buckets. A person in
            # two flagged regions would get a row in each -- no region overlaps today
            # (EUROPE and APAC are disjoint), and the flag is what keeps it that way:
            # EU5/EU/EUROPE would have overlapped, which is why the rule was rejected.
            for region_key, codes in aggregate_regions:
                if country in codes:
                    expanded.append(
                        {
                            "hcp_id": row["hcp_id"],
                            "scope_type": "region",
                            "scope_value": region_key,
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


def upsert_ranks(conn, ta_id, rows, run_id):
    # run_id: one uuid4 minted per invocation (main), written to every row —
    # the same provenance pattern scientific_momentum_scoring.py uses. Narrative
    # generation reads it into hcp_narratives_v2.source_enrichment_run_id so a
    # narrative's snapshot is identifiable after this table is overwritten.
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
            run_id,
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
                   pharma_engagement_pctile, enrichment_run_id)
                VALUES %s
                ON CONFLICT (hcp_id, therapeutic_area_id, scope_type, scope_value)
                DO UPDATE SET
                  rank = EXCLUDED.rank,
                  cohort_score = EXCLUDED.cohort_score,
                  scientific_influence_pctile = EXCLUDED.scientific_influence_pctile,
                  network_influence_pctile = EXCLUDED.network_influence_pctile,
                  pharma_engagement_pctile = EXCLUDED.pharma_engagement_pctile,
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
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=30, type=int, help="Print top N for region/US scope")
@click.option("--w-scientific", default=0.60, type=float)
@click.option("--w-network", default=0.40, type=float)
@click.option("--w-pharma", default=0.0, type=float)
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

            # Zero-weight components are skipped entirely so they can neither
            # contribute nor participate in the missing-component renormalisation
            # (the pharma perversity documented in the header).
            components = []
            if sci_value is not None and w_sci > 0:
                components.append((w_sci, float(sci_value)))
            if net_value is not None and w_net > 0:
                components.append((w_net, float(net_value)))
            if pharma_value is not None and w_pha > 0:
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
        run_id = str(uuid4())
        n = upsert_ranks(conn, ta_id, all_results, run_id)
        print(f"\nWrote {n} rows to hcp_established_ranks_v3")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
