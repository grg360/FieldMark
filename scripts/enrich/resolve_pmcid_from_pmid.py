#!/usr/bin/env python3
"""
Resolve publications_v2.pmcid from pubmed_id via the NCBI ID Converter.

The corpus stores pubmed_id on every row but no PMCID, and PMC full-text
retrieval is keyed on PMCID. The stored proxies do not substitute:
open_access->>'oa_url' names PMC for only ~9.5% of extraction-gate papers
(it is OpenAlex's best-location pick, which prefers the publisher), and
any_repository_has_fulltext does not say which repository. So resolve once,
store the answer, stop re-deriving it.

pmcid_resolved_at is stamped on every row asked about, including misses, so
"not in PMC" stays distinguishable from "never asked".

Usage:
  python scripts/enrich/resolve_pmcid_from_pmid.py --scope gate --dry-run
  python scripts/enrich/resolve_pmcid_from_pmid.py --scope gate
  python scripts/enrich/resolve_pmcid_from_pmid.py --scope gate --refresh
  python scripts/enrich/resolve_pmcid_from_pmid.py --scope all --limit 5000
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_batch

IDCONV_URL = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/"
# The converter's documented ceiling. Do not raise it -- above 200 the service
# truncates its response rather than erroring, which would silently under-resolve.
BATCH_SIZE = 200
# No API key applies to idconv (it is not an E-utility), so the unauthenticated
# 3 req/s ceiling governs. 0.4s leaves headroom.
RATE_LIMIT_SECONDS = 0.4
REQUEST_TIMEOUT_SECONDS = 30
MAX_RETRIES = 4

NSCLC_TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"

# The extraction gate, verbatim from scripts/narrative/extract_scientific_positions.py
# (MIN_YEAR=2020, MIN_ABSTRACT_LENGTH=800, first-or-senior, TA-scoped, not excluded)
# joined to the top-N global Established board. Deliberately NOT the top-10-by-citation
# cap: that cap is a per-HCP selection applied after this, and the question here is what
# the reachable pool looks like, not what the current run happened to sample.
GATE_SQL = """
SELECT DISTINCT p.id, p.pubmed_id
FROM hcp_established_ranks_v3 e
JOIN publication_authors_v2 pa ON pa.hcp_id = e.hcp_id
JOIN publications_v2 p ON p.id = pa.publication_id
JOIN publication_therapeutic_areas_v2 pta
  ON pta.publication_id = p.id
 AND pta.therapeutic_area_id = %(ta)s
 AND NOT pta.is_excluded
WHERE e.therapeutic_area_id = %(ta)s
  AND e.scope_type = 'global'
  AND e.scope_value IS NULL
  AND e.rank <= %(rank_limit)s
  AND p.pub_year >= %(min_year)s
  AND length(coalesce(p.abstract, '')) >= %(min_abstract)s
  AND (pa.is_senior_author = true OR pa.is_first_author = true)
  AND p.pubmed_id IS NOT NULL
  {unresolved}
"""

ALL_SQL = """
SELECT p.id, p.pubmed_id
FROM publications_v2 p
WHERE p.pubmed_id IS NOT NULL
  {unresolved}
ORDER BY p.citation_count DESC NULLS LAST
"""

UNRESOLVED_CLAUSE = "AND p.pmcid_resolved_at IS NULL"

UPDATE_SQL = """
UPDATE publications_v2
SET pmcid = %s, pmcid_resolved_at = %s
WHERE id = %s
"""


def normalize_pmcid(raw):
    """Canonical PMC<digits>. The converter returns the prefixed form, but stored
    oa_urls carry both shapes (legacy /pmc/articles/8205932 is bare-numeric), so
    normalize rather than trust the caller."""
    if not raw:
        return None
    value = str(raw).strip().upper()
    if not value:
        return None
    if value.startswith("PMC"):
        value = value[3:]
    if not value.isdigit():
        return None
    return "PMC" + value


def fetch_batch(session, pmids, email):
    """One converter call. Returns {pmid: pmcid-or-None} for every pmid asked, so a
    miss is recorded as a miss and still gets stamped."""
    params = {
        "ids": ",".join(pmids),
        "format": "json",
        "tool": "fieldmark",
        "email": email,
        "idtype": "pmid",
    }
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(IDCONV_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:  # noqa: BLE001 - network or JSON, both retryable
            last_error = exc
            if attempt == MAX_RETRIES:
                break
            time.sleep(2 ** attempt)
            continue

        if payload.get("status") == "error":
            raise RuntimeError("idconv error: " + str(payload.get("message")))

        out = {pmid: None for pmid in pmids}
        for record in payload.get("records") or []:
            pmid = str(record.get("pmid") or "").strip()
            if not pmid:
                continue
            # A record can carry errmsg ("invalid article id") and no pmcid; that is
            # a legitimate miss, not a failure.
            out[pmid] = normalize_pmcid(record.get("pmcid"))
        return out

    raise RuntimeError("idconv failed after %d attempts: %s" % (MAX_RETRIES, last_error))


def load_targets(conn, args):
    unresolved = "" if args.refresh else UNRESOLVED_CLAUSE
    with conn.cursor() as cur:
        if args.scope == "gate":
            cur.execute(
                GATE_SQL.format(unresolved=unresolved),
                {
                    "ta": args.ta_id,
                    "rank_limit": args.rank_limit,
                    "min_year": args.min_year,
                    "min_abstract": args.min_abstract,
                },
            )
        else:
            cur.execute(ALL_SQL.format(unresolved=unresolved))
        rows = cur.fetchall()
    if args.limit:
        rows = rows[: args.limit]
    return [(str(r[0]), str(r[1])) for r in rows]


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=("gate", "all"), default="gate")
    parser.add_argument("--ta-id", default=NSCLC_TA_ID)
    parser.add_argument("--rank-limit", type=int, default=200)
    parser.add_argument("--min-year", type=int, default=2020)
    parser.add_argument("--min-abstract", type=int, default=800)
    parser.add_argument("--limit", type=int, default=0, help="cap targets (0 = no cap)")
    parser.add_argument("--refresh", action="store_true",
                        help="re-ask rows already stamped (default asks only unresolved)")
    parser.add_argument("--dry-run", action="store_true", help="select and report, no fetch, no write")
    args = parser.parse_args()

    email = os.environ.get("PUBMED_EMAIL")
    if not email:
        print("[FATAL] PUBMED_EMAIL is required by the NCBI ID Converter", file=sys.stderr)
        return 1

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        targets = load_targets(conn, args)
        batches = (len(targets) + BATCH_SIZE - 1) // BATCH_SIZE
        print("[SCOPE] %s - %d papers with a PMID - %d batches of %d"
              % (args.scope, len(targets), batches, BATCH_SIZE))
        if args.dry_run:
            print("[DRY RUN] no fetch, no write")
            return 0
        if not targets:
            print("[DONE] nothing to resolve")
            return 0

        by_pmid = {}
        for pub_id, pmid in targets:
            by_pmid.setdefault(pmid, []).append(pub_id)
        pmids = list(by_pmid.keys())

        session = requests.Session()
        hits = 0
        misses = 0
        pending = []

        for index in range(0, len(pmids), BATCH_SIZE):
            chunk = pmids[index:index + BATCH_SIZE]
            resolved = fetch_batch(session, chunk, email)
            stamped_at = datetime.now(timezone.utc)
            for pmid in chunk:
                pmcid = resolved.get(pmid)
                if pmcid:
                    hits += 1
                else:
                    misses += 1
                for pub_id in by_pmid[pmid]:
                    pending.append((pmcid, stamped_at, pub_id))
            done = min(index + BATCH_SIZE, len(pmids))
            print("  [%5d/%d] hits=%d misses=%d" % (done, len(pmids), hits, misses), flush=True)
            time.sleep(RATE_LIMIT_SECONDS)

        with conn.cursor() as cur:
            execute_batch(cur, UPDATE_SQL, pending, page_size=500)
        conn.commit()

        total = hits + misses
        rate = (100.0 * hits / total) if total else 0.0
        print("[DONE] %d resolved - %d not in PMC - %.1f%% - %d rows written"
              % (hits, misses, rate, len(pending)))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
