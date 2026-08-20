"""
publication_leadership_scoring.py — Scientific Influence Score for Established HCPs.

Computes publication-derived leadership signals and writes percentile ranks to
hcp_publication_leadership_v2.

Usage:
    python publication_leadership_scoring.py --ta nsclc
    python publication_leadership_scoring.py --ta nsclc --dry-run --debug-top 20
    python publication_leadership_scoring.py --ta nsclc --limit 500

Required environment variables (.env):
    DATABASE_URL
"""

from __future__ import annotations

import math
import os
from typing import Any

import click
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor, execute_values

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

W_SENIOR_PUB = 1.0
W_SENIOR_RECENT = 0.5
W_FIRST_PUB = 0.4
W_SENIOR_CITATION_LOG = 12.0
W_FIRST_CITATION_LOG = 5.0
W_GUIDELINE = 8.0
W_GUIDELINE_SENIOR = 15.0
W_GUIDELINE_FIRST = 12.0
W_EDITORIAL_SENIOR = 3.0
W_REVIEW_SENIOR = 2.0


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


def fetch_established_hcp_ids(conn, ta_id: str, limit: int | None = None) -> list[str]:
    """Distinct Established cohort HCPs from hcp_cohort_classification_v2."""
    sql = """
        SELECT cc.hcp_id
        FROM hcp_cohort_classification_v2 cc
        WHERE cc.therapeutic_area_id = %s
          AND cc.cohort = 'established'
        ORDER BY cc.hcp_id
    """
    params: list[Any] = [ta_id]
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [str(row[0]) for row in cur.fetchall()]


def fetch_signals(conn, ta_id: str, hcp_ids: list[str] | None = None) -> list[dict]:
    hcp_filter = ""
    if hcp_ids is not None:
        if not hcp_ids:
            return []
        hcp_filter = " AND pa.hcp_id = ANY(%s::uuid[])"

    query = f"""
        WITH ta_pubs AS (
          SELECT p.id, p.publication_types, p.title, p.citation_count, p.pub_year
          FROM publications_v2 p
          JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
          WHERE pta.therapeutic_area_id = %s
        ),
        guideline_pubs AS (
          SELECT id FROM ta_pubs
          WHERE 'Practice Guideline' = ANY(publication_types)
             OR 'Consensus Statement' = ANY(publication_types)
             OR (
               title ~* '(guideline|consensus|recommendation|expert panel|position statement|provisional clinical opinion)'
               AND title !~* '(adherence|impact of|effect of|implementation|outcome of|cost of|complian|barrier|knowledge of|attitudes|survey|deviation|patient.reported|real.world|update of|how we|approach to)'
             )
        )
        SELECT
          pa.hcp_id,
          COUNT(*) FILTER (WHERE pa.is_senior_author) AS senior_pub_count,
          COALESCE(SUM(p.citation_count) FILTER (WHERE pa.is_senior_author), 0) AS senior_pub_total_citations,
          COUNT(*) FILTER (WHERE pa.is_senior_author AND p.pub_year >= EXTRACT(YEAR FROM now())::int - 5) AS senior_pub_recent_5yr,
          COUNT(*) FILTER (WHERE pa.is_first_author) AS first_pub_count,
          COALESCE(SUM(p.citation_count) FILTER (WHERE pa.is_first_author), 0) AS first_pub_total_citations,
          COUNT(*) FILTER (WHERE p.id IN (SELECT id FROM guideline_pubs)) AS guideline_pub_count,
          COUNT(*) FILTER (WHERE p.id IN (SELECT id FROM guideline_pubs) AND pa.is_senior_author) AS guideline_pub_senior,
          COUNT(*) FILTER (WHERE p.id IN (SELECT id FROM guideline_pubs) AND pa.is_first_author) AS guideline_pub_first,
          COUNT(*) FILTER (WHERE 'Editorial' = ANY(p.publication_types) AND pa.is_senior_author) AS editorial_senior_count,
          COUNT(*) FILTER (WHERE ('Systematic Review' = ANY(p.publication_types) OR 'Meta-Analysis' = ANY(p.publication_types)) AND pa.is_senior_author) AS review_senior_count
        FROM publication_authors_v2 pa
        JOIN ta_pubs p ON p.id = pa.publication_id
        WHERE pa.hcp_id IN (
          SELECT hcp_id FROM hcp_cohort_classification_v2
          WHERE therapeutic_area_id = %s AND cohort = 'established'
        ){hcp_filter}
        GROUP BY pa.hcp_id
    """
    params: list[Any] = [ta_id, ta_id]
    if hcp_ids is not None:
        params.append(hcp_ids)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, params)
        return cur.fetchall()


def compute_raw_score(signals: dict) -> float:
    return (
        float(signals["senior_pub_count"] or 0) * W_SENIOR_PUB
        + float(signals["senior_pub_recent_5yr"] or 0) * W_SENIOR_RECENT
        + float(signals["first_pub_count"] or 0) * W_FIRST_PUB
        + math.log10(float(signals["senior_pub_total_citations"] or 0) + 1) * W_SENIOR_CITATION_LOG
        + math.log10(float(signals["first_pub_total_citations"] or 0) + 1) * W_FIRST_CITATION_LOG
        + float(signals["guideline_pub_count"] or 0) * W_GUIDELINE
        + float(signals["guideline_pub_senior"] or 0) * W_GUIDELINE_SENIOR
        + float(signals["guideline_pub_first"] or 0) * W_GUIDELINE_FIRST
        + float(signals["editorial_senior_count"] or 0) * W_EDITORIAL_SENIOR
        + float(signals["review_senior_count"] or 0) * W_REVIEW_SENIOR
    )


def compute_normalized(raw_scores: list[float]) -> list[float]:
    if not raw_scores:
        return []
    score_min = min(raw_scores)
    score_max = max(raw_scores)
    if score_max == score_min:
        return [50.0] * len(raw_scores)
    return [((score - score_min) / (score_max - score_min)) * 100.0 for score in raw_scores]


def compute_percentile_ranks(raw_scores: list[float]) -> list[float]:
    """Continuous rank-percentile: 100 = highest, 0+ = lowest, each HCP unique.

    Matches network_centrality_scoring / pharma_engagement_scoring:
      percentile = 100.0 * (1.0 - position / (n - 1))  # 0-indexed, descending
    """
    if not raw_scores:
        return []
    n = len(raw_scores)
    indexed = sorted(enumerate(raw_scores), key=lambda item: item[1], reverse=True)
    ranks = [0.0] * n
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
    for position, (orig_idx, _) in enumerate(indexed):
        percentile = 100.0 * (n - position) / (n + 1)
        ranks[orig_idx] = round(percentile, 2)
    return ranks


def lookup_hcp_names(conn, hcp_ids: list[str]) -> dict[str, tuple[str, str]]:
    if not hcp_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, first_name, last_name
            FROM hcps_v2
            WHERE id = ANY(%s::uuid[])
            """,
            (hcp_ids,),
        )
        return {str(row[0]): (row[1], row[2]) for row in cur.fetchall()}


def upsert_results(conn, ta_id: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    values = [
        (
            r["hcp_id"],
            ta_id,
            r["senior_pub_count"],
            r["senior_pub_total_citations"],
            r["senior_pub_recent_5yr"],
            r["first_pub_count"],
            r["first_pub_total_citations"],
            r["guideline_pub_count"],
            r["guideline_pub_senior"],
            r["guideline_pub_first"],
            r["editorial_senior_count"],
            r["review_senior_count"],
            r["raw_score"],
            r["normalized_score"],
            r["percentile_rank"],
        )
        for r in rows
    ]
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO hcp_publication_leadership_v2
                  (hcp_id, therapeutic_area_id,
                   senior_pub_count, senior_pub_total_citations, senior_pub_recent_5yr,
                   first_pub_count, first_pub_total_citations,
                   guideline_pub_count, guideline_pub_senior, guideline_pub_first,
                   editorial_senior_count, review_senior_count,
                   raw_score, normalized_score, percentile_rank)
                VALUES %s
                ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE SET
                  senior_pub_count = EXCLUDED.senior_pub_count,
                  senior_pub_total_citations = EXCLUDED.senior_pub_total_citations,
                  senior_pub_recent_5yr = EXCLUDED.senior_pub_recent_5yr,
                  first_pub_count = EXCLUDED.first_pub_count,
                  first_pub_total_citations = EXCLUDED.first_pub_total_citations,
                  guideline_pub_count = EXCLUDED.guideline_pub_count,
                  guideline_pub_senior = EXCLUDED.guideline_pub_senior,
                  guideline_pub_first = EXCLUDED.guideline_pub_first,
                  editorial_senior_count = EXCLUDED.editorial_senior_count,
                  review_senior_count = EXCLUDED.review_senior_count,
                  raw_score = EXCLUDED.raw_score,
                  normalized_score = EXCLUDED.normalized_score,
                  percentile_rank = EXCLUDED.percentile_rank,
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
@click.option("--limit", default=None, type=int, help="Process only first N Established HCPs (by hcp_id)")
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=10, type=int, help="Print top N raw scores before writing")
def main(ta: str, limit: int | None, dry_run: bool, debug_top: int) -> None:
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)
    print(f"Computing Scientific Influence Score for TA: {ta} ({ta_id})")

    scoped_hcp_ids = fetch_established_hcp_ids(conn, ta_id, limit)
    if limit:
        print(f"Scoped to top {limit} Established HCPs ({len(scoped_hcp_ids)} ids)")
    signals = fetch_signals(conn, ta_id, scoped_hcp_ids if limit else None)
    print(f"Found signals for {len(signals)} HCPs")

    rows: list[dict] = []
    for signal_row in signals:
        raw = compute_raw_score(signal_row)
        rows.append({**signal_row, "raw_score": raw})

    raw_scores = [r["raw_score"] for r in rows]
    normalized = compute_normalized(raw_scores)
    percentiles = compute_percentile_ranks(raw_scores)

    for row, norm, pct in zip(rows, normalized, percentiles):
        row["normalized_score"] = norm
        row["percentile_rank"] = pct

    sorted_rows = sorted(rows, key=lambda r: r["raw_score"], reverse=True)
    top_n = sorted_rows[:debug_top]
    hcp_names = lookup_hcp_names(conn, [str(r["hcp_id"]) for r in top_n])

    print(f"\n=== Top {debug_top} by Scientific Influence Score ({ta}) ===")
    print(
        f"{'Rank':<5} {'Name':<30} {'Pctl':<6} {'Raw':<8} "
        f"{'Sr':<4} {'Sr5y':<5} {'Cit':<6} {'GP':<3} {'GS':<3}"
    )
    for i, row in enumerate(top_n, 1):
        name = " ".join(hcp_names.get(str(row["hcp_id"]), ("?", "?")))
        name_safe = name.encode("ascii", errors="replace").decode("ascii")
        print(
            f"{i:<5} {name_safe[:29]:<30} {row['percentile_rank']:<6.2f} {row['raw_score']:<8.1f} "
            f"{row['senior_pub_count']:<4} {row['senior_pub_recent_5yr']:<5} "
            f"{row['senior_pub_total_citations']:<6} {row['guideline_pub_count']:<3} "
            f"{row['guideline_pub_senior']:<3}"
        )

    if dry_run:
        print(f"\n[dry-run] would have written {len(rows)} rows")
    else:
        written = upsert_results(conn, ta_id, rows)
        print(f"\nWrote {written} rows to hcp_publication_leadership_v2")

    conn.close()


if __name__ == "__main__":
    main()
