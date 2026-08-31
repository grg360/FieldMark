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
from datetime import date, datetime, timezone

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

CURRENT_YEAR = datetime.now(timezone.utc).year  # was frozen at 2026; career-age arithmetic must track the clock
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


# TA RESOLUTION MOVED TO scripts/utils/ta_registry.py (2026-08-27).
# Replaced a local resolve_ta_id that was one of NINE near-identical copies across sixteen
# scripts -- same query, different return types (str(row[0]) / row[0] / row["id"]) and
# different exceptions (ValueError / RuntimeError / SystemExit). Fifteen of them reported only
# "TA slug not found: <slug>", which repeats the typo back without saying what IS valid.
# The shared resolver caches per process and raises with the full slug list.
import os as _os, sys as _sys  # noqa: E402
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "utils"))
from ta_registry import resolve_ta_id  # noqa: E402,F401


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
                p.citation_count,
                p.pub_date
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
                "pub_date": row[4],
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


def effective_pub_date(p: dict) -> date:
    """Membership date for rolling windows. Jan-1 rows are year-only
    placeholders (~12.5% of the corpus): fall back to pub_year via a July-1
    effective date — the majority-of-year rule, deterministic and
    window-exclusive. Null dates get the same fallback."""
    d = p.get("pub_date")
    if d is None or (d.month == 1 and d.day == 1):
        return date(p["pub_year"], 7, 1)
    return d


def build_eligible_results(
    rows: list[dict],
    early_start_year: int,
    early_end_year: int,
    recent_start_year: int,
    recent_end_year: int,
    date_windows: tuple[date, date, date, date] | None = None,
) -> list[dict]:
    hcp_papers: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        hcp_papers[row["hcp_id"]].append(row)

    eligible: list[dict] = []
    for hcp_id, papers in hcp_papers.items():
        if date_windows is not None:
            e_start, e_end, r_start, r_end = date_windows
            early_papers = [
                p for p in papers if e_start <= effective_pub_date(p) <= e_end
            ]
            recent_papers = [
                p for p in papers if r_start <= effective_pub_date(p) <= r_end
            ]
        else:
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
    window_dates=(None, None, None, None),
) -> int:
    if not results:
        return 0

    values = [
        (
            r["hcp_id"],
            ta_id,
            window_dates[0], window_dates[1], window_dates[2], window_dates[3],
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
           early_window_start, early_window_end, recent_window_start, recent_window_end,
           early_start_year, early_end_year, recent_start_year, recent_end_year,
           early_total_pubs, early_senior_pubs, early_senior_author_pct, early_citation_rate,
           recent_total_pubs, recent_senior_pubs, recent_senior_author_pct, recent_citation_rate,
           pub_velocity_delta, citation_velocity_delta, authorship_progression_delta,
           pub_velocity_percentile, citation_velocity_percentile, authorship_progression_percentile,
           scientific_momentum_raw, scientific_momentum_percentile,
           enrichment_run_id)
        VALUES %s
        ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE SET
          early_window_start = EXCLUDED.early_window_start,
          early_window_end = EXCLUDED.early_window_end,
          recent_window_start = EXCLUDED.recent_window_start,
          recent_window_end = EXCLUDED.recent_window_end,
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

    # DE-LIST (2026-08-05, rolling windows): rows for this TA whose hcp_id is

    # not in the new result set are removed — an upsert-only recompute leaves

    # members who no longer clear the thresholds holding stale window rows,

    # which the ranks join then scores from mixed vintages (the 142/62-row

    # contamination found on the first rolling run). Empty result sets delete

    # nothing (guarded at function entry).

    keep_ids = sorted({r["hcp_id"] for r in results})

    with conn.cursor() as _cur:

        _cur.execute(

            "DELETE FROM hcp_scientific_momentum_v1 "

            "WHERE therapeutic_area_id = %s AND NOT (hcp_id = ANY(%s::uuid[]))",

            (ta_id, keep_ids),

        )

        if _cur.rowcount:

            print(f"[upsert] de-listed {_cur.rowcount} stale row(s) not in the new result set")

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
@click.option("--early-start-date", default=None, help="Rolling early window start (YYYY-MM-DD). All four date args together switch to date mode.")
@click.option("--early-end-date", default=None)
@click.option("--recent-start-date", default=None)
@click.option("--recent-end-date", default=None)
@click.option("--dry-run", is_flag=True, help="Compute but do not write to DB")
@click.option("--debug-top", default=20, type=int, help="Print top N by scientific_momentum_percentile")
def main(
    ta: str,
    early_start_year: int,
    early_end_year: int,
    recent_start_year: int,
    recent_end_year: int,
    early_start_date: str | None,
    early_end_date: str | None,
    recent_start_date: str | None,
    recent_end_date: str | None,
    dry_run: bool,
    debug_top: int,
) -> None:
    date_args = [early_start_date, early_end_date, recent_start_date, recent_end_date]
    if any(date_args) and not all(date_args):
        raise click.UsageError("Provide all four --*-date args together, or none.")
    date_windows = None
    if all(date_args):
        date_windows = tuple(date.fromisoformat(d) for d in date_args)
        # keep the legacy year columns coherent with the rolling ranges
        early_start_year = date_windows[0].year
        early_end_year = date_windows[1].year
        recent_start_year = date_windows[2].year
        recent_end_year = date_windows[3].year
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
        date_windows=date_windows,
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
            window_dates=(date_windows or (None, None, None, None)),
        )
        print(f"\nWrote {written:,} rows to hcp_scientific_momentum_v1")
        print(f"Run ID: {run_id}")

    conn.close()


if __name__ == "__main__":
    main()
