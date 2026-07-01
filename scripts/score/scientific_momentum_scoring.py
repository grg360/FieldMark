"""
scientific_momentum_scoring.py — Scientific Momentum subscore for Rising Stars.

Measures publication output change between an early window (default 2016-2020)
and a recent window (default 2021-2025) for ACADEMIC HCPs in a TA.

Signals (weighted):
  50% Publication Velocity Delta (senior-author pub count change)
  30% Citation Volume Delta (total citation count change)
  20% Authorship Progression Delta (senior-author share change)

Usage:
    python scientific_momentum_scoring.py --ta nsclc
    python scientific_momentum_scoring.py --ta nsclc --dry-run --debug-top 30

Required environment variables (.env):
    DATABASE_URL (port 5432 direct connection, not pooler 6543)

Dependencies:
    pip install psycopg2-binary python-dotenv click scipy
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

CURRENT_YEAR = 2026
MIN_PUBS_PER_WINDOW = 5
MAX_CAREER_YEARS = 15

W_PUB_VELOCITY = 0.50
W_CITATION_VOLUME = 0.30
W_AUTHORSHIP_PROGRESSION = 0.20

UPSERT_BATCH_SIZE = 2000


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


def fetch_publication_rows(
    conn,
    ta_id: str,
    early_start_year: int,
    recent_end_year: int,
) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                pa.hcp_id,
                p.pub_year,
                pa.is_senior_author,
                p.citation_count
            FROM publication_authors_v2 pa
            JOIN publications_v2 p ON p.id = pa.publication_id
            JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
            JOIN hcp_industry_classification_v1 ic ON ic.hcp_id = pa.hcp_id
            JOIN hcps_v2 h ON h.id = pa.hcp_id
            WHERE pta.therapeutic_area_id = %s
              AND ic.classification = 'ACADEMIC'
              AND p.pub_year BETWEEN %s AND %s
              AND p.citation_count IS NOT NULL
              AND h.career_first_pub_year_v2 IS NOT NULL
              AND (%s - h.career_first_pub_year_v2) <= %s
            """,
            (ta_id, early_start_year, recent_end_year, CURRENT_YEAR, MAX_CAREER_YEARS),
        )
        return [
            {
                "hcp_id": str(row[0]),
                "pub_year": int(row[1]),
                "is_senior_author": bool(row[2]),
                "citation_count": int(row[3]),
            }
            for row in cur.fetchall()
        ]


def window_stats(papers: list[dict]) -> dict:
    total_pubs = len(papers)
    senior_pubs = sum(1 for p in papers if p["is_senior_author"])
    senior_author_pct = senior_pubs / total_pubs if total_pubs > 0 else 0.0
    total_citations = sum(p["citation_count"] for p in papers)
    avg_citation_rate = total_citations / total_pubs if total_pubs > 0 else 0.0
    return {
        "total_pubs": total_pubs,
        "senior_pubs": senior_pubs,
        "senior_author_pct": senior_author_pct,
        "total_citations": total_citations,
        "avg_citation_rate": avg_citation_rate,
    }


def compute_percentile_ranks(hcp_ids: list[str], values: dict[str, float]) -> dict[str, float]:
    if not hcp_ids:
        return {}
    n = len(hcp_ids)
    if n == 1:
        return {hcp_ids[0]: 100.0}
    ordered_values = [values[hcp_id] for hcp_id in hcp_ids]
    ranks = rankdata(ordered_values, method="average")
    return {
        hcp_id: round(100.0 * (ranks[i] - 1) / (n - 1), 2)
        for i, hcp_id in enumerate(hcp_ids)
    }


def build_eligible_results(
    rows: list[dict],
    early_start_year: int,
    early_end_year: int,
    recent_start_year: int,
    recent_end_year: int,
) -> list[dict]:
    hcp_papers: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        hcp_papers[row["hcp_id"]].append(row)

    eligible: list[dict] = []
    for hcp_id, papers in hcp_papers.items():
        early_papers = [
            p for p in papers if early_start_year <= p["pub_year"] <= early_end_year
        ]
        recent_papers = [
            p for p in papers if recent_start_year <= p["pub_year"] <= recent_end_year
        ]

        if len(early_papers) < MIN_PUBS_PER_WINDOW or len(recent_papers) < MIN_PUBS_PER_WINDOW:
            continue

        early = window_stats(early_papers)
        recent = window_stats(recent_papers)

        eligible.append(
            {
                "hcp_id": hcp_id,
                "early_total_pubs": early["total_pubs"],
                "early_senior_pubs": early["senior_pubs"],
                "early_senior_author_pct": early["senior_author_pct"],
                "early_citation_rate": early["avg_citation_rate"],
                "recent_total_pubs": recent["total_pubs"],
                "recent_senior_pubs": recent["senior_pubs"],
                "recent_senior_author_pct": recent["senior_author_pct"],
                "recent_citation_rate": recent["avg_citation_rate"],
                "pub_velocity_delta": recent["senior_pubs"] - early["senior_pubs"],
                "citation_volume_delta": recent["total_citations"] - early["total_citations"],
                "citation_rate_delta": (
                    recent["avg_citation_rate"] - early["avg_citation_rate"]
                ),
                "authorship_progression_delta": (
                    recent["senior_author_pct"] - early["senior_author_pct"]
                ),
            }
        )

    if not eligible:
        return []

    hcp_ids = [r["hcp_id"] for r in eligible]

    pub_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["pub_velocity_delta"] for r in eligible}
    )
    cit_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["citation_volume_delta"] for r in eligible}
    )
    auth_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["authorship_progression_delta"] for r in eligible}
    )

    for row in eligible:
        hcp_id = row["hcp_id"]
        row["pub_velocity_percentile"] = pub_pctiles[hcp_id]
        row["citation_velocity_percentile"] = cit_pctiles[hcp_id]
        row["authorship_progression_percentile"] = auth_pctiles[hcp_id]
        row["scientific_momentum_raw"] = round(
            W_PUB_VELOCITY * row["pub_velocity_percentile"]
            + W_CITATION_VOLUME * row["citation_velocity_percentile"]
            + W_AUTHORSHIP_PROGRESSION * row["authorship_progression_percentile"],
            2,
        )

    momentum_pctiles = compute_percentile_ranks(
        hcp_ids, {r["hcp_id"]: r["scientific_momentum_raw"] for r in eligible}
    )
    for row in eligible:
        row["scientific_momentum_percentile"] = momentum_pctiles[row["hcp_id"]]

    return eligible


def lookup_hcp_debug_info(
    conn, hcp_ids: list[str]
) -> dict[str, tuple[str, str, str | None, str | None, int | None]]:
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
            row[0]: (row[1], row[2], row[3], row[4], row[5])
            for row in cur.fetchall()
        }


def upsert_results(
    conn,
    ta_id: str,
    results: list[dict],
    run_id: str,
    early_start_year: int,
    early_end_year: int,
    recent_start_year: int,
    recent_end_year: int,
) -> int:
    if not results:
        return 0

    values = [
        (
            r["hcp_id"],
            ta_id,
            int(early_start_year),
            int(early_end_year),
            int(recent_start_year),
            int(recent_end_year),
            int(r["early_total_pubs"]),
            int(r["early_senior_pubs"]),
            float(r["early_senior_author_pct"]),
            float(r["early_citation_rate"]),
            int(r["recent_total_pubs"]),
            int(r["recent_senior_pubs"]),
            float(r["recent_senior_author_pct"]),
            float(r["recent_citation_rate"]),
            float(r["pub_velocity_delta"]),
            float(r["citation_volume_delta"]),
            float(r["authorship_progression_delta"]),
            float(r["pub_velocity_percentile"]),
            float(r["citation_velocity_percentile"]),
            float(r["authorship_progression_percentile"]),
            float(r["scientific_momentum_raw"]),
            float(r["scientific_momentum_percentile"]),
            run_id,
        )
        for r in results
    ]

    sql = """
        INSERT INTO hcp_scientific_momentum_v1
          (hcp_id, therapeutic_area_id,
           early_start_year, early_end_year, recent_start_year, recent_end_year,
           early_total_pubs, early_senior_pubs, early_senior_author_pct, early_citation_rate,
           recent_total_pubs, recent_senior_pubs, recent_senior_author_pct, recent_citation_rate,
           pub_velocity_delta, citation_velocity_delta, authorship_progression_delta,
           pub_velocity_percentile, citation_velocity_percentile, authorship_progression_percentile,
           scientific_momentum_raw, scientific_momentum_percentile,
           enrichment_run_id)
        VALUES %s
        ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE SET
          early_start_year = EXCLUDED.early_start_year,
          early_end_year = EXCLUDED.early_end_year,
          recent_start_year = EXCLUDED.recent_start_year,
          recent_end_year = EXCLUDED.recent_end_year,
          early_total_pubs = EXCLUDED.early_total_pubs,
          early_senior_pubs = EXCLUDED.early_senior_pubs,
          early_senior_author_pct = EXCLUDED.early_senior_author_pct,
          early_citation_rate = EXCLUDED.early_citation_rate,
          recent_total_pubs = EXCLUDED.recent_total_pubs,
          recent_senior_pubs = EXCLUDED.recent_senior_pubs,
          recent_senior_author_pct = EXCLUDED.recent_senior_author_pct,
          recent_citation_rate = EXCLUDED.recent_citation_rate,
          pub_velocity_delta = EXCLUDED.pub_velocity_delta,
          citation_velocity_delta = EXCLUDED.citation_velocity_delta,
          authorship_progression_delta = EXCLUDED.authorship_progression_delta,
          pub_velocity_percentile = EXCLUDED.pub_velocity_percentile,
          citation_velocity_percentile = EXCLUDED.citation_velocity_percentile,
          authorship_progression_percentile = EXCLUDED.authorship_progression_percentile,
          scientific_momentum_raw = EXCLUDED.scientific_momentum_raw,
          scientific_momentum_percentile = EXCLUDED.scientific_momentum_percentile,
          computed_at = now(),
          enrichment_run_id = EXCLUDED.enrichment_run_id
    """

    try:
        with conn.cursor() as cur:
            for start in range(0, len(values), UPSERT_BATCH_SIZE):
                execute_values(cur, sql, values[start : start + UPSERT_BATCH_SIZE])
        conn.commit()
        return len(values)
    except Exception:
        conn.rollback()
        raise


@click.command()
@click.option("--ta", default="nsclc", help="Therapeutic area slug")
@click.option("--early-start-year", default=2016, type=int, help="Early window start (inclusive)")
@click.option("--early-end-year", default=2020, type=int, help="Early window end (inclusive)")
@click.option("--recent-start-year", default=2021, type=int, help="Recent window start (inclusive)")
@click.option("--recent-end-year", default=2025, type=int, help="Recent window end (inclusive)")
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N by scientific_momentum_percentile")
def main(
    ta: str,
    early_start_year: int,
    early_end_year: int,
    recent_start_year: int,
    recent_end_year: int,
    dry_run: bool,
    debug_top: int,
) -> None:
    if early_start_year > early_end_year:
        raise click.UsageError("--early-start-year must be <= --early-end-year")
    if recent_start_year > recent_end_year:
        raise click.UsageError("--recent-start-year must be <= --recent-end-year")

    run_id = str(uuid4())
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)

    print(
        f"Computing scientific momentum for TA={ta} "
        f"early={early_start_year}-{early_end_year} "
        f"recent={recent_start_year}-{recent_end_year}"
    )
    print("Fetching publication rows...")
    rows = fetch_publication_rows(conn, ta_id, early_start_year, recent_end_year)
    print(f"Loaded {len(rows):,} author-publication rows")

    print("Aggregating and scoring eligible ACADEMIC HCPs...")
    results = build_eligible_results(
        rows,
        early_start_year,
        early_end_year,
        recent_start_year,
        recent_end_year,
    )
    print(f"Eligible HCPs: {len(results):,}")

    if not results:
        print("No eligible HCPs found. Exiting.")
        conn.close()
        return

    sorted_results = sorted(
        results, key=lambda r: r["scientific_momentum_percentile"], reverse=True
    )
    top_n = sorted_results[:debug_top]
    hcp_info = lookup_hcp_debug_info(conn, [r["hcp_id"] for r in top_n])

    print(f"\n=== Top {debug_top} by Scientific Momentum Percentile ({ta}) ===")
    print(
        f"{'Rk':<4} {'Name':<24} {'Inst':<24} {'Country':<8} {'CareerYrs':<9} "
        f"{'Momentum%':<10} {'PubVel':<7} {'CitVolDelta':<11} {'AuthProg':<8} "
        f"{'EarlyPubs':<10} {'RecentPubs':<10}"
    )
    for i, row in enumerate(top_n, 1):
        first_name, last_name, institution, country, career_first_pub = hcp_info.get(
            row["hcp_id"], ("?", "?", "?", "?", None)
        )
        name = f"{first_name} {last_name}"
        career_years = (
            CURRENT_YEAR - career_first_pub if career_first_pub is not None else "?"
        )
        print(
            f"{i:<4} {name[:23]:<24} {(institution or '')[:23]:<24} "
            f"{(country or '')[:7]:<8} {str(career_years):<9} "
            f"{row['scientific_momentum_percentile']:<10.2f} "
            f"{row['pub_velocity_delta']:<7.0f} "
            f"{row['citation_volume_delta']:<11.0f} "
            f"{row['authorship_progression_delta']:<8.3f} "
            f"{row['early_total_pubs']:<10} "
            f"{row['recent_total_pubs']:<10}"
        )

    if dry_run:
        print(f"\n[dry-run] would have written {len(results):,} rows")
    else:
        written = upsert_results(
            conn,
            ta_id,
            results,
            run_id,
            early_start_year,
            early_end_year,
            recent_start_year,
            recent_end_year,
        )
        print(f"\nWrote {written:,} rows to hcp_scientific_momentum_v1")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
