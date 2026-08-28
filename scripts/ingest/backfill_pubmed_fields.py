"""
backfill_pubmed_fields.py — repair the four fields pubmed_pipeline used to drop.

WHY THIS EXISTS. _publication_v2_row() hardcoded abstract, language, mesh_terms and
publication_types to None from 2026-07-02 (5f5c0d7) until 2026-08-26, while the
article XML sat in scope. Every TA ingested through reingest_cycle.py in that
window lost all four. Split by the source stamp:

    source='pubmed_v2_ingest' (ingest_publications.py)  403,671 pubs, 403,671 typed
    source='pubmed'           (pubmed_pipeline.py)      169,197 pubs,      81 typed

The parse is fixed forward, but existing rows stay NULL until something re-touches
their PMIDs. Colorectal Cancer is 100% the broken path: 147,218 publications with
zero publication_types, mesh_terms, abstracts or language.

WHY NOT JUST RE-RUN THE PIPELINE. Its upsert payload also carries hardcoded None
for citation_count, citation_counts_by_year, openalex_enriched_at and
openalex_work_id, and PostgREST writes every payload key on conflict. A full
re-run would null CRC's 142,450 citation counts and its entire OpenAlex
enrichment -- and citation_count is a direct input to
publication_leadership_scoring (W_SENIOR_CITATION_LOG 12.0, W_FIRST_CITATION_LOG
5.0), the very board this backfill exists to unblock. It is also a live ESearch,
so it would ingest newly-indexed papers and mint TA links rather than repairing a
captured corpus. This script does neither.

WHAT IT TOUCHES: four columns, by UPDATE, on PMIDs already in the corpus. An
UPDATE cannot insert, so it cannot add a publication or a therapeutic-area link
even if PubMed returns something unexpected. source, ingestion_run_id, doi and
every OpenAlex column are never named.

Usage:
    python scripts/ingest/backfill_pubmed_fields.py --ta colorectal-cancer --dry-run
    python scripts/ingest/backfill_pubmed_fields.py --ta colorectal-cancer

Required environment variables (.env):
    DATABASE_URL          direct connection (port 5432), not the pooler
    PUBMED_API_KEY        optional; 0.15s pacing with, 0.34s without
"""

from __future__ import annotations

import os
import sys
from typing import Dict, List, Optional, Sequence, Tuple
from xml.etree import ElementTree as ET

import click
import psycopg2
from psycopg2.extras import execute_values

# Same-directory import: Python puts the script's own directory on sys.path[0], and
# scripts/ingest has no __init__.py. Importing pubmed_pipeline runs load_dotenv() and
# nothing else at module level -- no client construction, no env assertions (those live
# inside init_supabase / get_required_env, which are never called here).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pubmed_pipeline import (  # noqa: E402
    build_http_session,
    parse_abstract,
    parse_language,
    parse_mesh_terms,
    parse_publication_types,
    pubmed_efetch,
    text_or_none,
)

DATABASE_URL = os.getenv("DATABASE_URL")

# pubmed_efetch chunks internally at 100 and paces via pubmed_sleep_seconds(). This is the
# number of PMIDs handed to it per cycle -- fetch, parse, write, then the next slice, so a
# killed run loses at most this many rows of work and the selector below simply returns
# fewer PMIDs next time.
FETCH_SLICE = 1000
UPDATE_BATCH_SIZE = 500


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


def fetch_target_pmids(conn, ta_id: str) -> List[str]:
    """PMIDs in this TA's corpus that this script has not yet processed.

    SELF-LIMITING AND RESUMABLE BY CONSTRUCTION. A repaired row no longer matches, so a
    second run costs only what the first did not finish. It also means the script cannot
    be told to touch a row that has nothing wrong with it.

    THE PREDICATE IS THE TWO ARRAY COLUMNS ONLY, NOT ALL FOUR. This was measured, not
    assumed: a returned record with no MeSH headings parses to [] and is written as '{}',
    which is NOT NULL, so it drops out of the work set. But a record with no AbstractText
    parses to None and is written as NULL -- indistinguishable from never-processed. On
    the 1,000-PMID sample, 91 of 1,000 legitimately have no abstract; including
    `abstract IS NULL` in this predicate would re-fetch roughly 13,000 CRC rows on every
    subsequent run, forever, and the script would never converge. publication_types and
    mesh_terms always land non-NULL for any record efetch returns, which makes them exact
    "has this row been processed" markers. abstract and language are still WRITTEN -- they
    are just not used to decide what needs writing.

    THE SELECTOR IS THE BLAST RADIUS. Scoped to one therapeutic_area_id, so the 403,671
    rows written by ingest_publications.py -- which are a disjoint PMID set, all four
    fields populated -- fail both halves of this predicate and are unreachable.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.pubmed_id
            FROM publications_v2 p
            JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
            WHERE pta.therapeutic_area_id = %s
              AND p.pubmed_id IS NOT NULL
              AND (p.publication_types IS NULL OR p.mesh_terms IS NULL)
            ORDER BY p.pubmed_id
            """,
            (ta_id,),
        )
        return [str(row[0]) for row in cur.fetchall()]


def parse_articles(articles: Sequence[ET.Element]) -> Dict[str, Tuple]:
    """{pmid: (publication_types, mesh_terms, abstract, language)} from efetch XML."""
    out: Dict[str, Tuple] = {}
    for article in articles:
        pmid = text_or_none(article.find("./MedlineCitation/PMID"))
        if not pmid or pmid in out:
            continue
        out[pmid] = (
            parse_publication_types(article),
            parse_mesh_terms(article),
            parse_abstract(article),
            parse_language(article),
        )
    return out


def write_batch(
    conn, parsed: Dict[str, Tuple], requested: Sequence[str]
) -> Tuple[int, List[str]]:
    """UPDATE exactly four columns, for exactly the PMIDs efetch actually returned.

    THE WRITE CONTRACT (same as the openalex_author_enrichment batching work): a PMID
    PubMed did not return is LEFT ALONE, never written with nulls. Absence of an answer
    is not an answer. The assertion below is the guard -- values is built from `parsed`,
    which is keyed by the PMID inside the returned XML, so a requested-but-missing PMID
    cannot reach the VALUES list. Anything missing is reported and re-selected by the
    next run, because its row still matches fetch_target_pmids().

    A returned PMID whose fields are genuinely empty IS written: [] for the arrays and
    NULL for a record that truly has no abstract or no language. That is a real answer
    and is what distinguishes "PubMed says there is none" from "PubMed said nothing".
    """
    missing = [p for p in requested if p not in parsed]
    stray = [p for p in parsed if p not in set(requested)]
    if stray:
        # Cannot happen against efetch-by-id, but writing a row we never asked about is
        # the one failure this script must not have. Refuse rather than narrow silently.
        raise RuntimeError(
            f"efetch returned {len(stray)} PMID(s) that were not requested "
            f"(e.g. {stray[:5]}); refusing to write."
        )

    values = [
        (pmid, types, mesh, abstract, language)
        for pmid, (types, mesh, abstract, language) in parsed.items()
    ]

    # THE ASSERTION. Every PMID about to be written came back from efetch, and the
    # requested set is exactly accounted for as written-or-left-alone. Structurally
    # guaranteed by how `values` is built today; asserted so that a future edit which
    # starts seeding rows from the REQUEST list instead of the RESPONSE fails here
    # rather than quietly nulling records PubMed never answered for.
    returned = set(parsed)
    batch_pmids = {v[0] for v in values}
    assert batch_pmids <= returned, (
        f"{len(batch_pmids - returned)} PMID(s) in the UPDATE batch were not returned by efetch"
    )
    assert len(batch_pmids) + len(missing) == len(set(requested)), (
        f"accounting mismatch: {len(batch_pmids)} written + {len(missing)} left alone "
        f"!= {len(set(requested))} requested"
    )

    if not values:
        return 0, missing

    written = 0
    with conn.cursor() as cur:
        for start in range(0, len(values), UPDATE_BATCH_SIZE):
            chunk = values[start : start + UPDATE_BATCH_SIZE]
            execute_values(
                cur,
                """
                UPDATE publications_v2 p
                   SET publication_types = v.publication_types,
                       mesh_terms        = v.mesh_terms,
                       abstract          = v.abstract,
                       language          = v.language
                  FROM (VALUES %s)
                    AS v(pubmed_id, publication_types, mesh_terms, abstract, language)
                 WHERE p.pubmed_id = v.pubmed_id
                """,
                chunk,
                template="(%s, %s::text[], %s::text[], %s::text, %s::text)",
            )
            written += cur.rowcount or 0
    return written, missing


def print_sample(parsed: Dict[str, Tuple], n: int = 3) -> None:
    print(f"\n--- parsed sample ({min(n, len(parsed))} of {len(parsed):,}) ---")
    for pmid, (types, mesh, abstract, language) in list(parsed.items())[:n]:
        print(f"  PMID {pmid}")
        print(f"    publication_types  {types}")
        print(f"    mesh_terms         {(mesh or [])[:6]}{' …' if len(mesh or []) > 6 else ''}")
        print(f"    language           {language!r}")
        if abstract is None:
            print("    abstract           None  (record carries no AbstractText)")
        else:
            abs_txt = abstract[:160].replace("\n", " ")
            print(f"    abstract           {abs_txt!r}{' …' if len(abstract) > 160 else ''}")


@click.command()
@click.option("--ta", required=True, help="Therapeutic area slug, e.g. colorectal-cancer")
@click.option("--dry-run", is_flag=True, help="Select and fetch one slice, parse it, print a sample. No writes.")
@click.option("--limit", default=None, type=int, help="Cap the PMIDs processed (testing).")
def main(ta: str, dry_run: bool, limit: Optional[int]) -> None:
    conn = get_conn()
    ta_id = resolve_ta_id(conn, ta)
    print(f"TA {ta} -> {ta_id}")

    pmids = fetch_target_pmids(conn, ta_id)
    print(f"PMIDs still unprocessed (publication_types or mesh_terms NULL): {len(pmids):,}")
    if limit is not None:
        pmids = pmids[:limit]
        print(f"  --limit {limit}: processing {len(pmids):,}")
    if not pmids:
        print("Nothing to repair. Exiting.")
        conn.close()
        return

    base_url = os.getenv("PUBMED_API_BASE", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils")
    tool_name = os.getenv("PUBMED_TOOL", "fieldmark_backfill_pubmed_fields")
    email = os.getenv("PUBMED_EMAIL")
    session = build_http_session()

    if dry_run:
        slice_pmids = pmids[:FETCH_SLICE]
        print(f"\n[dry-run] fetching one slice of {len(slice_pmids):,} to prove the parse…")
        articles = pubmed_efetch(session, base_url, slice_pmids, email, tool_name)
        parsed = parse_articles(articles)
        missing = [p for p in slice_pmids if p not in parsed]
        print(f"\n[dry-run] requested {len(slice_pmids):,}, efetch returned {len(parsed):,}, "
              f"missing {len(missing):,}")
        if missing:
            print(f"[dry-run] missing would be LEFT ALONE, not nulled: {missing[:5]}")
        # NON-EMPTY, not "present". [] and None are different answers and both are
        # legitimate -- an erratum genuinely has no MeSH headings and no abstract. Both get
        # written; the distinction matters only for reading this line.
        print(f"[dry-run] of the {len(parsed):,} returned, NON-EMPTY: "
              f"{sum(1 for v in parsed.values() if v[0]):,} publication_types, "
              f"{sum(1 for v in parsed.values() if v[1]):,} mesh_terms, "
              f"{sum(1 for v in parsed.values() if v[2]):,} abstract, "
              f"{sum(1 for v in parsed.values() if v[3]):,} language")
        print_sample(parsed)
        print(f"\n[dry-run] would UPDATE 4 columns on {len(parsed):,} rows this slice; "
              f"{len(pmids):,} PMIDs total across {(len(pmids) + FETCH_SLICE - 1) // FETCH_SLICE} slices. "
              f"No writes performed.")
        conn.close()
        return

    total_written = 0
    total_missing: List[str] = []
    slices = (len(pmids) + FETCH_SLICE - 1) // FETCH_SLICE
    for idx in range(slices):
        slice_pmids = pmids[idx * FETCH_SLICE : (idx + 1) * FETCH_SLICE]
        print(f"\n[slice {idx + 1}/{slices}] {len(slice_pmids):,} PMIDs")
        articles = pubmed_efetch(session, base_url, slice_pmids, email, tool_name)
        parsed = parse_articles(articles)
        try:
            written, missing = write_batch(conn, parsed, slice_pmids)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        total_written += written
        total_missing.extend(missing)
        print(f"[slice {idx + 1}/{slices}] efetch returned {len(parsed):,}, "
              f"updated {written:,}, left alone {len(missing):,}")

    print(f"\nUpdated {total_written:,} rows across {slices} slice(s).")
    if total_missing:
        print(f"{len(total_missing):,} PMID(s) were not returned by efetch and were LEFT ALONE "
              f"(not written with nulls). They still match the selector, so re-running this "
              f"script retries exactly those. First few: {total_missing[:10]}")
    conn.close()


if __name__ == "__main__":
    main()
