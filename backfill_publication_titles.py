"""
backfill_publication_titles.py

Backfills NULL titles in publications_v2 by fetching from PubMed E-utilities efetch.

Usage:
  python backfill_publication_titles.py --dry-run        # fetch + print, no DB writes
  python backfill_publication_titles.py                  # full run, write to DB
  python backfill_publication_titles.py --limit 50       # cap rows processed (for testing)

Idempotent. Only touches rows where title IS NULL AND pubmed_id IS NOT NULL.
Never overwrites existing titles.
"""

import argparse
import os
import sys
import time
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

import psycopg
import requests
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env", file=sys.stderr)
    sys.exit(1)

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
BATCH_SIZE = 200
SLEEP_BETWEEN_BATCHES = 0.5  # 0.5s = 2 req/sec, well under 3/sec PubMed limit


def fetch_titles_from_pubmed(pmids: List[str]) -> Dict[str, str]:
    """
    Given a list of PMIDs, return a dict mapping pmid -> title.
    Skips records where title can't be parsed (logs to stderr).
    """
    if not pmids:
        return {}

    url = f"{EUTILS_BASE}/efetch.fcgi"
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "rettype": "xml",
        "retmode": "xml",
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"  [WARN] PubMed efetch failed for batch: {e}", file=sys.stderr)
        return {}

    titles: Dict[str, str] = {}

    try:
        root = ET.fromstring(response.content)
    except ET.ParseError as e:
        print(f"  [WARN] XML parse failed for batch: {e}", file=sys.stderr)
        return {}

    for article in root.findall(".//PubmedArticle"):
        pmid_el = article.find(".//PMID")
        title_el = article.find(".//ArticleTitle")

        if pmid_el is None or pmid_el.text is None:
            continue
        pmid = pmid_el.text.strip()

        if title_el is None:
            continue

        # ArticleTitle can contain inline tags (e.g. <i>, <sub>) so flatten to text
        title_text = "".join(title_el.itertext()).strip()

        if not title_text:
            continue

        # Strip trailing period that PubMed appends inconsistently
        if title_text.endswith("."):
            title_text = title_text[:-1]

        titles[pmid] = title_text

    return titles


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Fetch and print but don't write to DB")
    parser.add_argument("--limit", type=int, default=None, help="Cap rows processed (for testing)")
    args = parser.parse_args()

    print(f"Connecting to database...")
    conn = psycopg.connect(DATABASE_URL)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            # Find rows needing backfill
            query = """
                SELECT id, pubmed_id
                FROM publications_v2
                WHERE title IS NULL
                  AND pubmed_id IS NOT NULL
                ORDER BY pubmed_id
            """
            if args.limit:
                query += f" LIMIT {args.limit}"

            cur.execute(query)
            rows = cur.fetchall()

        total = len(rows)
        print(f"Found {total} rows needing title backfill")

        if total == 0:
            print("Nothing to do. Exiting.")
            return

        if args.dry_run:
            print("DRY RUN: will fetch from PubMed but not write to DB")

        # Build PMID -> row_id mapping for the update step
        pmid_to_row_id: Dict[str, str] = {}
        for row_id, pmid in rows:
            pmid_to_row_id[str(pmid)] = str(row_id)

        # Batch through PMIDs
        all_pmids = list(pmid_to_row_id.keys())
        matched_count = 0
        unmatched_count = 0
        updated_count = 0

        for i in range(0, len(all_pmids), BATCH_SIZE):
            batch = all_pmids[i:i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1
            total_batches = (len(all_pmids) + BATCH_SIZE - 1) // BATCH_SIZE
            print(f"[{batch_num}/{total_batches}] Fetching {len(batch)} PMIDs from PubMed...")

            titles = fetch_titles_from_pubmed(batch)

            for pmid in batch:
                if pmid in titles:
                    matched_count += 1
                else:
                    unmatched_count += 1
                    print(f"  [SKIP] PMID {pmid}: no title in PubMed response")

            if not args.dry_run and titles:
                # Update DB for matched titles
                with conn.cursor() as cur:
                    for pmid, title in titles.items():
                        row_id = pmid_to_row_id[pmid]
                        cur.execute(
                            "UPDATE publications_v2 SET title = %s WHERE id = %s AND title IS NULL",
                            (title, row_id),
                        )
                        if cur.rowcount > 0:
                            updated_count += 1
                conn.commit()
                print(f"  Updated {len(titles)} rows in this batch")

            if args.dry_run and titles:
                # Show first 3 examples per batch
                for pmid, title in list(titles.items())[:3]:
                    print(f"  [DRY] {pmid} -> {title[:80]}{'...' if len(title) > 80 else ''}")

            # Rate limit
            if i + BATCH_SIZE < len(all_pmids):
                time.sleep(SLEEP_BETWEEN_BATCHES)

        print()
        print(f"Done. matched={matched_count}, unmatched={unmatched_count}", end="")
        if not args.dry_run:
            print(f", updated={updated_count}")
        else:
            print(" (dry-run, no writes)")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
