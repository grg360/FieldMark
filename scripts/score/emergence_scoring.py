"""
emergence_scoring.py — Scientific Emergence subscore for Rising Stars.

A DISTINCT construct from Established's Scientific Authority. Emergence measures
recent-window trajectory ("who is establishing themselves scientifically?"),
NOT accumulated authority. See TA_BUILD_DEBT §30v.

Population: HCPs in hcp_cohort_classification_v2 WHERE cohort='rising_eligible'
(TA-anchored at >=3 TA pubs by the classifier). Only requirement beyond cohort
membership is RECENT-window activity. There is deliberately NO early-window
requirement — a zero early baseline (0 pubs 2016-2020 -> many pubs 2021-2025) is
the SIGNATURE of emergence, not a disqualifier.

Signals (weighted), all measured on the recent window only:
  45% Recent AD publications (volume)
  35% Recent senior/first authorship share
  20% Recent citation impact (citations PER publication, not total — production is
      already the 45% axis; per-pub keeps citations measuring impact, not quantity)

NO network signal here. Network is a separate axis consumed by the Rising composite
(mirroring Established = Scientific Authority + Network Influence).

Percentiles are computed WITHIN the rising cohort (not globally — otherwise the
field's giants would crush everyone).

Usage:
    python scripts/score/emergence_scoring.py --ta atopic-dermatitis --dry-run
    python scripts/score/emergence_scoring.py --ta atopic-dermatitis --execute

Required environment variables (.env): DATABASE_URL
"""

from __future__ import annotations

import os
from collections import defaultdict
from uuid import uuid4

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from scipy.stats import rankdata

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Recent window defaults (overridable via CLI).
RECENT_START_YEAR = 2021
RECENT_END_YEAR = 2025

# Emergence weights (advisor-approved, §30v).
W_RECENT_PUBS = 0.45
W_AUTHORSHIP = 0.35
W_CITATION_IMPACT = 0.20

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


def fetch_recent_publication_rows(
    conn,
    ta_id: str,
    recent_start_year: int,
    recent_end_year: int,
) -> list[dict]:
    """
    One row per (rising HCP, recent AD publication). Scoped to:
      - the rising_eligible cohort for this TA
      - AD-tagged publications in the recent window
    Frozen-safe: filtered to this ta_id on both the cohort and the pub-TA join.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                pa.hcp_id,
                p.pub_year,
                pa.is_senior_author,
                pa.is_first_author,
                p.citation_count
            FROM hcp_cohort_classification_v2 cc
            JOIN publication_authors_v2 pa
              ON pa.hcp_id = cc.hcp_id
            JOIN publications_v2 p
              ON p.id = pa.publication_id
            JOIN publication_therapeutic_areas_v2 pta
              ON pta.publication_id = p.id
             AND pta.therapeutic_area_id = cc.therapeutic_area_id
            WHERE cc.therapeutic_area_id = %s
              AND cc.cohort = 'rising_eligible'
              AND p.pub_year BETWEEN %s AND %s
              AND p.citation_count IS NOT NULL
            """,
            (ta_id, recent_start_year, recent_end_year),
        )
        return [
            {
                "hcp_id": str(row[0]),
                "pub_year": int(row[1]),
                "is_senior_author": bool(row[2]),
                "is_first_author": bool(row[3]),
                "citation_count": int(row[4]),
            }
            for row in cur.fetchall()
        ]


def compute_percentile_ranks(
    hcp_ids: list[str], values: dict[str, float]
) -> dict[str, float]:
    """
    Continuous rank-percentile WITHIN the given population: 100 = highest.
    Uses average ranks for ties, then maps to a continuous 0..100 scale.
    """
    if not hcp_ids:
        return {}
    n = len(hcp_ids)
    arr = [values[h] for h in hcp_ids]
    # rankdata: 1 = lowest.
    ranks = rankdata(arr, method="average")
    # PERCENTILE CONVENTION (2026-08-18) — see docs/canonical/PERCENTILE_CONVENTION.md.
    # Weibull plotting position: ascending rank r maps to 100 * r / (n + 1), so the
    # highest value lands at 100n/(n+1) and the lowest at 100/(n+1).
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
    out: dict[str, float] = {}
    for h, r in zip(hcp_ids, ranks):
        out[h] = round(100.0 * r / (n + 1), 2)
    return out


def build_emergence_results(
    rows: list[dict],
    recent_start_year: int,
    recent_end_year: int,
) -> list[dict]:
    """
    Aggregate recent-window rows per HCP and compute the emergence score.
    Eligibility: at least one recent AD pub (i.e., appears in `rows`). No
    early-window requirement by design.
    """
    hcp_papers: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        hcp_papers[row["hcp_id"]].append(row)

    agg: list[dict] = []
    for hcp_id, papers in hcp_papers.items():
        recent_pub_count = len(papers)
        recent_senior = sum(1 for p in papers if p["is_senior_author"])
        recent_first = sum(1 for p in papers if p["is_first_author"])
        recent_total_citations = sum(p["citation_count"] for p in papers)
        # Senior/first authorship SHARE of recent output (leadership signal).
        senior_first = sum(
            1 for p in papers if p["is_senior_author"] or p["is_first_author"]
        )
        recent_senior_first_pct = (
            senior_first / recent_pub_count if recent_pub_count else 0.0
        )
        # Citations PER PUB (impact, not quantity — production is scored separately).
        recent_citations_per_pub = (
            recent_total_citations / recent_pub_count if recent_pub_count else 0.0
        )
        agg.append(
            {
                "hcp_id": hcp_id,
                "recent_pub_count": recent_pub_count,
                "recent_senior_pubs": recent_senior,
                "recent_first_pubs": recent_first,
                "recent_senior_first_pct": round(recent_senior_first_pct, 4),
                "recent_total_citations": recent_total_citations,
                "recent_citations_per_pub": round(recent_citations_per_pub, 3),
            }
        )

    if not agg:
        return []

    hcp_ids = [r["hcp_id"] for r in agg]

    # Percentiles WITHIN the rising cohort for each signal.
    pub_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: float(r["recent_pub_count"]) for r in agg}
    )
    auth_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: float(r["recent_senior_first_pct"]) for r in agg}
    )
    cit_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: float(r["recent_citations_per_pub"]) for r in agg}
    )

    for row in agg:
        h = row["hcp_id"]
        row["recent_pub_percentile"] = pub_pctiles[h]
        row["recent_authorship_percentile"] = auth_pctiles[h]
        row["recent_citation_impact_percentile"] = cit_pctiles[h]
        row["emergence_raw"] = round(
            W_RECENT_PUBS * pub_pctiles[h]
            + W_AUTHORSHIP * auth_pctiles[h]
            + W_CITATION_IMPACT * cit_pctiles[h],
            2,
        )

    emergence_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["emergence_raw"] for r in agg}
    )
    for row in agg:
        row["emergence_percentile"] = emergence_pctiles[row["hcp_id"]]
        row["recent_start_year"] = recent_start_year
        row["recent_end_year"] = recent_end_year

    return agg


def lookup_hcp_debug_info(conn, hcp_ids: list[str]) -> dict:
    if not hcp_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, first_name, last_name, institution_normalized,
                   country, career_first_pub_year_v2
            FROM hcps_v2
            WHERE id::text = ANY(%s)
            """,
            (hcp_ids,),
        )
        return {
            str(r[0]): (r[1], r[2], r[3], r[4], r[5]) for r in cur.fetchall()
        }


def upsert_results(conn, ta_id: str, results: list[dict], run_id: str) -> int:
    if not results:
        return 0
    payload = [
        (
            r["hcp_id"],
            ta_id,
            int(r["recent_start_year"]),
            int(r["recent_end_year"]),
            int(r["recent_pub_count"]),
            int(r["recent_senior_pubs"]),
            int(r["recent_first_pubs"]),
            float(r["recent_senior_first_pct"]),
            int(r["recent_total_citations"]),
            float(r["recent_citations_per_pub"]),
            float(r["recent_pub_percentile"]),
            float(r["recent_authorship_percentile"]),
            float(r["recent_citation_impact_percentile"]),
            float(r["emergence_raw"]),
            float(r["emergence_percentile"]),
            run_id,
        )
        for r in results
    ]
    sql = """
        INSERT INTO hcp_scientific_emergence_v1
          (hcp_id, therapeutic_area_id,
           recent_start_year, recent_end_year,
           recent_pub_count, recent_senior_pubs, recent_first_pubs,
           recent_senior_first_pct, recent_total_citations, recent_citations_per_pub,
           recent_pub_percentile, recent_authorship_percentile,
           recent_citation_impact_percentile,
           emergence_raw, emergence_percentile,
           enrichment_run_id)
        VALUES %s
        ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE SET
          recent_start_year = EXCLUDED.recent_start_year,
          recent_end_year = EXCLUDED.recent_end_year,
          recent_pub_count = EXCLUDED.recent_pub_count,
          recent_senior_pubs = EXCLUDED.recent_senior_pubs,
          recent_first_pubs = EXCLUDED.recent_first_pubs,
          recent_senior_first_pct = EXCLUDED.recent_senior_first_pct,
          recent_total_citations = EXCLUDED.recent_total_citations,
          recent_citations_per_pub = EXCLUDED.recent_citations_per_pub,
          recent_pub_percentile = EXCLUDED.recent_pub_percentile,
          recent_authorship_percentile = EXCLUDED.recent_authorship_percentile,
          recent_citation_impact_percentile = EXCLUDED.recent_citation_impact_percentile,
          emergence_raw = EXCLUDED.emergence_raw,
          emergence_percentile = EXCLUDED.emergence_percentile,
          computed_at = now(),
          enrichment_run_id = EXCLUDED.enrichment_run_id
    """
    written = 0
    with conn.cursor() as cur:
        for i in range(0, len(payload), UPSERT_BATCH_SIZE):
            chunk = payload[i : i + UPSERT_BATCH_SIZE]
            execute_values(cur, sql, chunk)
            written += len(chunk)
    conn.commit()
    return written


@click.command()
@click.option("--ta", default="atopic-dermatitis", help="Therapeutic area slug")
@click.option("--recent-start-year", default=RECENT_START_YEAR, type=int)
@click.option("--recent-end-year", default=RECENT_END_YEAR, type=int)
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--execute", is_flag=True, help="Write results to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N by emergence")
def main(
    ta: str,
    recent_start_year: int,
    recent_end_year: int,
    dry_run: bool,
    execute: bool,
    debug_top: int,
) -> None:
    if recent_start_year > recent_end_year:
        raise click.UsageError("--recent-start-year must be <= --recent-end-year")
    # Safe default: no write unless --execute is explicitly passed.
    write = execute and not dry_run

    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)
    run_id = str(uuid4())

    print(f"Computing Scientific Emergence for TA={ta} ({ta_id})")
    print(f"Recent window: {recent_start_year}-{recent_end_year}")
    print(f"Mode: {'EXECUTE (writes enabled)' if write else 'DRY-RUN (no writes)'}")

    print("Fetching recent-window publication rows for rising cohort...")
    rows = fetch_recent_publication_rows(conn, ta_id, recent_start_year, recent_end_year)
    print(f"Loaded {len(rows):,} (rising HCP, recent AD pub) rows")

    results = build_emergence_results(rows, recent_start_year, recent_end_year)
    print(f"Scored (rising HCPs with recent activity): {len(results):,}")

    if not results:
        print("No eligible rising HCPs with recent activity. Exiting.")
        conn.close()
        return

    sorted_results = sorted(
        results, key=lambda r: r["emergence_percentile"], reverse=True
    )
    top_n = sorted_results[:debug_top]
    hcp_info = lookup_hcp_debug_info(conn, [r["hcp_id"] for r in top_n])

    print(f"\n=== Top {debug_top} by Scientific Emergence ({ta}) ===")
    print(
        f"{'Rk':<4} {'Name':<24} {'Inst':<22} {'Ctry':<5} {'CareerYr':<8} "
        f"{'Emrg%':<7} {'RecPubs':<8} {'Sr':<4} {'1st':<4} {'Sr/1stPct':<9} "
        f"{'Cit/Pub':<8}"
    )
    for i, row in enumerate(top_n, 1):
        fn, ln, inst, country, cfpy = hcp_info.get(
            row["hcp_id"], ("?", "?", "?", "?", None)
        )
        name = f"{fn} {ln}"
        career_year = cfpy if cfpy is not None else "?"
        print(
            f"{i:<4} {name[:23]:<24} {(inst or '')[:21]:<22} "
            f"{(country or '')[:4]:<5} {str(career_year):<8} "
            f"{row['emergence_percentile']:<7.2f} "
            f"{row['recent_pub_count']:<8} "
            f"{row['recent_senior_pubs']:<4} {row['recent_first_pubs']:<4} "
            f"{row['recent_senior_first_pct']*100:<9.1f} "
            f"{row['recent_citations_per_pub']:<8.1f}"
        )

    if write:
        written = upsert_results(conn, ta_id, results, run_id)
        print(f"\nWrote {written:,} rows to hcp_scientific_emergence_v1")
        print(f"Run ID: {run_id}")
    else:
        print(f"\n[dry-run] would have written {len(results):,} rows")

    conn.close()


if __name__ == "__main__":
    main()
