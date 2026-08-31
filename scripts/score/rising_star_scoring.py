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

# COHERENCE FLOOR (2026-08-20). A rising star must clear the median of the
# eligible pool on ALL FOUR signals the board is built from.
#
# WHAT IT REPLACED, AND WHY. The gate was MIN_VELOCITY_DELTA -- a raw count of
# senior-author papers gained between the rolling windows (>0 until 08-17, then
# >=3). A count on a small integer cannot separate emergence from accident. At
# >0 it admitted Moises Velez, whose senior count moved 0->1 while his total
# output went 5->6, his citation rate fell 593->22 (-96%) and his collaborators
# contracted 57->45. At >=3 it removed Aditi Singh, who was US #5 on the
# composite with senior 0->1, total pubs 9->25, collaborators 47->150. Both had
# delta 1. No count, and no transition or non-decline rule built on these
# columns, separates them -- measured 2026-08-20 across seven candidate gates,
# every transition form admitted Velez.
#
# The four components do separate them, decisively: Singh is 93/81/92/79 and
# Velez is 67/6/28/12. The gate now asks whether the signals AGREE, not how big
# one of them is.
#
# WHAT IT COSTS, PLAINLY. Strong output without network expansion no longer
# qualifies. Antonio Passaro (97/43/99/97) and Giuseppe Lamberti (99/43/97/96)
# are excluded on network momentum alone despite ranking 52 and 54 today. That
# is the intended meaning of the rule, not a defect in it: a board about
# trajectory should not admit a record whose collaboration network is static.
# A floor fitted to readmit them (P42) was measured and rejected -- it is a
# constant chosen to clear two named people, and at P40 it also readmits the
# falling-citation records the gate exists to catch.
#
# The momentum pipeline's own gates live with the computation
# (MIN_PUBS_PER_WINDOW, MAX_CAREER_YEARS in scientific_momentum_scoring.py;
# MIN_COLLABORATORS_PER_WINDOW in network_momentum_scoring.py).
MIN_COMPONENT_PERCENTILE = 50

W_MOMENTUM = 0.70
W_VISIBILITY = 0.30
W_SCI = 0.50
W_NET = 0.50

UPSERT_BATCH_SIZE = 2000


def get_conn():
    if not DATABASE_URL:
        raise EnvironmentError("Missing DATABASE_URL")
    return psycopg2.connect(DATABASE_URL)


# TA RESOLUTION MOVED TO scripts/utils/ta_registry.py (2026-08-27).
# Replaced a local resolve_ta_id that was one of NINE near-identical copies across sixteen
# scripts -- same query, different return types (str(row[0]) / row[0] / row["id"]) and
# different exceptions (ValueError / RuntimeError / SystemExit). Fifteen of them reported only
# "TA slug not found: <slug>", which repeats the typo back without saying what IS valid.
# The shared resolver caches per process and raises with the full slug list.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta_id  # noqa: E402,F401


def fetch_input_signals(conn, ta_id: str, vis_window: str = 'recent_roll') -> list[dict]:
    """Fetch the ELIGIBLE POOL -- the cohort gate only, no component floor.

    THE POOL IS NOT THE BOARD (2026-08-20). This used to apply the momentum
    floor in SQL and return the board directly. The coherence gate cannot be a
    SQL predicate: two of its four components (scientific and network
    VISIBILITY) are percentile ranks computed in this script, so they do not
    exist until the pool is in memory. The gate therefore moves to
    build_results(), which percentiles over this pool and then selects.

    vis_window defaults to 'recent_roll' (2026-08-20), not the fixed
    'recent_2021_2025' label. The other three components are computed on the
    rolling windows (2021-08-01..2026-07-31); the fixed label is a separate,
    staler capture ending a year earlier. Reading it here made the gate assert
    agreement between DIFFERENT PERIODS rather than between signals. The rolling
    centrality rows already existed -- no recompute was needed, only this
    default. Measured effect on its own: board 330 -> 338, US 56 -> 59.
    """
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
              -- EFFECTIVE COUNTRY, not h.country (2026-08-20). This projection is the
              -- sole basis for us_rank (see build_results: the US slice is
              -- `r.get("country") == "US"`), and h.country is the HISTORICAL column.
              -- Every other consumer -- rising_ledger, rising_board's us_rank_eff and
              -- eu_rank, the established scope resolution, RisingQuadrant, HCPChip --
              -- resolves country as coalesce(current_country, country), which is what
              -- the 2026-08-14 affiliation re-derivation maintains.
              --
              -- Measured on the 336-member board before this change: 73 members were
              -- US by h.country and 76 by the effective country. The three additions
              -- (Di Federico IT->US at Dana-Farber, Nagasaka JP->US, Pabani CA->US) sit
              -- high enough that 71 of the 73 existing us_rank values were off by 2-3,
              -- and the three themselves carried NO us_rank at all -- a global #9
              -- reading "RANK #9 GLOBAL" on the profile because the US rank it should
              -- have shown (#3) did not exist.
              --
              -- Board MEMBERSHIP is unaffected: the gate is four component percentiles
              -- and never reads country. Only ordering within the US slice moves.
              coalesce(h.current_country, h.country) AS country
            FROM hcp_scientific_momentum_v1 sm
            JOIN hcp_network_momentum_v1 nm
              ON nm.hcp_id = sm.hcp_id
              AND nm.therapeutic_area_id = sm.therapeutic_area_id
            LEFT JOIN hcp_network_centrality_v2 nc
              ON nc.hcp_id = sm.hcp_id
              AND nc.therapeutic_area_id = sm.therapeutic_area_id
              AND nc.window_type = %(vis_window)s
            JOIN hcps_v2 h ON h.id = sm.hcp_id
            -- GATE (2026-08-26): the maintained v2 taxonomy, rising_eligible ONLY.
            --
            -- RISING IS EXCLUSIVE. The clause that stood here --
            --   OR (cc.cohort = 'established' AND cc.career_age <= 15)
            -- was added 2026-08-05 (ba84d41) to replace a gate reading the stale
            -- hcps_v2.cohort_classification column: 73.6%% null, unmaintained, and
            -- the thing that had frozen the board. "FROZE THE BOARD" REFERRED TO THE
            -- DEAD COLUMN, NOT TO A CAREER-AGE BOUNDARY -- a rising_eligible-only
            -- board had never run in production, so there was never evidence that
            -- the taxonomy's own 3-10 boundary would be too small.
            --
            -- The clause solved a DATA-SOURCE problem and created a COHORT-OVERLAP
            -- problem as a side effect: 203 of NSCLC's 336 members were also
            -- classified established, and 34 of those held an established narrative
            -- alongside a rising one. docs/canonical/fieldmark-methodology-page.md promises
            -- customers "three mutually exclusive cohorts"; while the clause stood,
            -- that sentence was false. Rising now means what the taxonomy says it
            -- means: career age 3-10 with the TA publication floor.
            --
            -- MEASURED COST, 2026-08-26 (NSCLC, vis_window recent_roll). Pool
            -- 1,934 -> 792. Board 336 -> 149, US 76 -> 42. That is NOT pure
            -- attrition: 133 of the 336 survive, 203 leave, and 16 rising_eligible
            -- HCPs who fail the wider gate ENTER, because the two visibility
            -- percentiles are recomputed over the smaller pool and clear P50
            -- against it. Membership moves in both directions.
            JOIN hcp_cohort_classification_v2 cc
              ON cc.hcp_id = sm.hcp_id
              AND cc.therapeutic_area_id = sm.therapeutic_area_id
            WHERE sm.therapeutic_area_id = %(ta_id)s
              AND cc.cohort = 'rising_eligible'
              -- NO COMPONENT FLOOR HERE (2026-08-20). The momentum floor that
              -- stood on this line (sm.pub_velocity_delta >= MIN_VELOCITY_DELTA)
              -- is gone; selection is now MIN_COMPONENT_PERCENTILE applied to
              -- all four components in build_results(). See the constant.
            """,
            {"ta_id": ta_id, "vis_window": vis_window},
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
    # PERCENTILE CONVENTION (2026-08-18) — see docs/canonical/PERCENTILE_CONVENTION.md.
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

    # THE GATE (2026-08-20). Percentiles above are over the ELIGIBLE POOL, so the
    # floor is reproducible from the stored columns: anyone can re-derive board
    # membership by reading the four *_percentile values off
    # hcp_rising_star_ranks_v3 and checking them against MIN_COMPONENT_PERCENTILE.
    # Under the old gate that was impossible -- the deciding variable
    # (pub_velocity_delta) lived in a different table that is overwritten in place.
    #
    # DENOMINATOR NOTE, worth knowing before comparing to history: the visibility
    # percentiles are taken over the ELIGIBLE POOL (792 for NSCLC as of 2026-08-26,
    # ~1,934 before the OR-15 clause was removed) rather than over the post-gate
    # board, because a value used to SELECT the board cannot be computed FROM the
    # board without circularity. Stored sci_vis/net_vis therefore shift for
    # everyone whenever the pool definition moves -- once at the 08-20 gate change
    # and again at the 08-26 cohort change.
    #
    # THE MIXED DENOMINATOR, AND THAT IT JUST GOT WIDER (2026-08-26). sci_mom and
    # net_mom are NOT recomputed here -- they arrive already percentiled from
    # hcp_scientific_momentum_v1 / hcp_network_momentum_v1. Neither of those
    # scorers joins hcp_cohort_classification_v2 at all; their population is
    # ACADEMIC industry classification AND
    # (CURRENT_YEAR - hcps_v2.career_first_pub_year_v2) <= MAX_CAREER_YEARS (15).
    # Removing the OR-15 clause narrowed the pool THIS script percentiles over
    # without touching theirs, so MIN_COMPONENT_PERCENTILE now means two different
    # things inside one four-way AND: P50 of the 792-person rising_eligible pool on
    # the visibility axes, P50 of the ~15-year academic momentum population -- which
    # still contains every established HCP the gate above just excluded -- on the
    # momentum axes.
    #
    # The mixture PREDATES this change and is NOT fixed here, deliberately: aligning
    # the momentum pipelines to the rising cohort would re-scope four scorers and
    # every board that reads them. It is recorded so the gap is not rediscovered as
    # a surprise. See docs/canonical/RISING_EXCLUSIVE_GATE_DEBT.md.
    gated: list[dict] = []
    excluded_by_component = {"sci_mom": 0, "net_mom": 0, "sci_vis": 0, "net_vis": 0}
    for row in rows:
        hcp_id = row["hcp_id"]
        sci_mom = row["scientific_momentum_percentile"]
        net_mom = row["network_momentum_percentile"]
        sci_vis = (
            W_SCI * recent_pubs_pctiles[hcp_id]
            + W_NET * recent_citations_pctiles[hcp_id]
        )
        net_vis = net_vis_pctiles[hcp_id]

        components = {
            "sci_mom": sci_mom, "net_mom": net_mom,
            "sci_vis": sci_vis, "net_vis": net_vis,
        }
        below = [k for k, v in components.items() if v < MIN_COMPONENT_PERCENTILE]
        if below:
            # Attribute to every failing axis, not just the first: the counts are
            # a diagnostic of WHICH signal is doing the excluding, and on the
            # 08-20 measurement that was overwhelmingly network momentum.
            for k in below:
                excluded_by_component[k] += 1
            continue
        gated.append({**row, "_sci_vis": sci_vis, "_net_vis": net_vis})

    print(
        f"[gate] eligible {len(rows):,} -> board {len(gated):,} "
        f"(all four components >= P{MIN_COMPONENT_PERCENTILE:g})"
    )
    print(
        "[gate] exclusions by axis (an HCP can fail more than one): "
        + ", ".join(f"{k} {v:,}" for k, v in excluded_by_component.items())
    )

    results: list[dict] = []
    for row in gated:
        hcp_id = row["hcp_id"]
        sci_mom = row["scientific_momentum_percentile"]
        net_mom = row["network_momentum_percentile"]
        sci_vis = row["_sci_vis"]
        net_vis = row["_net_vis"]

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
@click.option("--vis-window", default="recent_roll", help="hcp_network_centrality_v2.window_type for network visibility. Default 'recent_roll' matches the rolling windows the other three components use; 'recent_2021_2025' is the older fixed label and ends a year earlier.")
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

    print("Applying the coherence gate and computing composite scores...")
    results = build_results(rows)
    print(f"Board size: {len(results):,}")

    if not results:
        # Guard matters more under a four-way AND than under a count floor: a
        # single upstream component arriving all-NULL would empty the board, and
        # upsert_results() deletes nothing when handed zero rows.
        print("No HCPs cleared the gate. Exiting without writing.")
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
