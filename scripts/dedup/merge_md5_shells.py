"""
merge_md5_shells.py — merge the 2026-07-22/23 MD5-hash shell rows into their
real (SHA-256) twins.

THE POPULATION. On 2026-07-22/23 a disambiguation run minted 3,571 hcps_v2 rows
through a code path that neither normalised nor used the current identity
scheme. Their signature is exact and has zero false positives against the
246,792 real rows:

    length(identity_hash) = 32        (MD5; every real row is 64-char SHA-256)

Every one of the 3,571 also has: no cohort_classification, no
in_corpus_pub_count, institution_normalized == the raw affiliation string, and
2,200 carry a non-ISO country ("France" rather than "FR").

They reach no board — established, rising and community are all zero — but they
ARE reachable: hcp search queries hcps_v2 with no quality gate, so a search for
"Besse" returns two Benjamin Besse rows, and /hcp/<id>/profile renders a
Community profile by exhaustion for all of them.

WHAT THIS SCRIPT MERGES, AND WHAT IT DELIBERATELY DOES NOT.
Only the 1,093 shells with EXACTLY ONE same-name SHA-256 twin. Pairing is by
normalised name, and that is ambiguous for the rest:

    exactly 1 candidate   1,093   <- merged here
    2-3 candidates          207   <- held
    4-10 candidates         162   <- held
    11+ candidates          159   <- held (3,813 pair rows)

Merging an ambiguous shell means choosing which of several real people absorbs
its publication. Choosing wrong attributes someone else's paper to them, which
is the exact defect this whole line of work exists to avoid. The 528 ambiguous
and the 1,950 unpaired shells need identity resolution (publication overlap and
affiliation-string comparison), not a name join.

SURVIVOR IS FORCED, NOT CHOSEN. dedup_merge.choose_survivor arbitrates between
rows of unknown provenance; that is not this case. The MD5 population is
known-bad, so a shell must never win. Its precedence would in fact pick
correctly 6,339 times out of 6,368 -- rule 1 (has publication links) ties
because the shells hold ~1 link each, and rule 2 (OpenAlex works_count) then
favours the real row because shells have no OpenAlex link at all. But in 29
pairs the real row also has no metrics row, NPI saves none of them, and in 14
the shell holds the lower UUID and would win rule 5. A coin flip is not a
judgement, so the survivor is passed explicitly.

FIELD MERGE IS SUPPRESSED. See SUPPRESSED_FOR_UNNORMALISED_STUBS in
dedup_merge.py: is_more_specific_institution and the nppes_* fill-if-empty rules
both assume the stub carries genuine added specificity, which is true for NPI
stubs and false by construction here.

Usage:
    python scripts/dedup/merge_md5_shells.py --dry-run
    python scripts/dedup/merge_md5_shells.py --execute

Env: DATABASE_URL
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Tuple

import psycopg2
from psycopg2.extras import Json, RealDictCursor
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dedup_merge import (  # noqa: E402
    SUPPRESSED_FOR_UNNORMALISED_STUBS,
    merge_record_into_survivor,
)

load_dotenv()

MERGE_PASS = "md5_shell_2026_07_22"

# The pairing query. n = 1 is the whole safety argument -- see the module
# docstring. Ordering is deterministic so a resumed run repeats the same order.
PAIRS_SQL = """
WITH md5rows AS (
  SELECT id, lower(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) AS k
  FROM hcps_v2 WHERE length(identity_hash) = 32
),
sha AS (
  SELECT id, lower(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) AS k
  FROM hcps_v2 WHERE length(identity_hash) = 64
),
cand AS (
  SELECT m.id AS shell_id, min(s.id::text)::uuid AS survivor_id, count(*) AS n, m.k
  FROM md5rows m JOIN sha s ON s.k = m.k
  GROUP BY m.id, m.k
)
SELECT shell_id, survivor_id, k FROM cand WHERE n = 1 ORDER BY shell_id
"""


def row_image(cur, hcp_id: str) -> Dict[str, Any]:
    """Full row as a dict, for dedup_merge_log.original_*_data."""
    cur.execute("SELECT to_jsonb(h) AS j FROM hcps_v2 h WHERE h.id = %s", (hcp_id,))
    r = cur.fetchone()
    return r["j"] if r else {}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="Report what would move; write nothing.")
    g.add_argument("--execute", action="store_true", help="Perform the merge.")
    ap.add_argument("--limit", type=int, default=None, help="Cap pairs (testing).")
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set")

    conn = psycopg2.connect(url)
    conn.autocommit = False
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(PAIRS_SQL)
            pairs: List[Tuple[str, str, str]] = [
                (str(r["shell_id"]), str(r["survivor_id"]), r["k"]) for r in cur.fetchall()
            ]
        if args.limit:
            pairs = pairs[: args.limit]

        print(f"pairs to merge: {len(pairs):,}")
        print(f"suppressed fields: {sorted(SUPPRESSED_FOR_UNNORMALISED_STUBS)}")

        # A shell must never be a survivor. Cheap, and the one invariant that
        # makes forcing the survivor safe rather than reckless.
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT count(*) AS n FROM hcps_v2 WHERE id = ANY(%s::uuid[]) AND length(identity_hash) = 32",
                ([s for _, s, _ in pairs],),
            )
            bad = cur.fetchone()["n"]
        if bad:
            raise SystemExit(f"ABORT: {bad} survivors are themselves MD5 shells")
        print("survivor check: 0 survivors are MD5 shells")

        totals: Dict[str, int] = {}
        for i, (shell_id, survivor_id, name) in enumerate(pairs, 1):
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if args.execute:
                    canon_before = row_image(cur, survivor_id)
                    merged_before = row_image(cur, shell_id)

                moved = merge_record_into_survivor(
                    cur,
                    survivor_id=survivor_id,
                    stub_id=shell_id,
                    dry_run=args.dry_run,
                    suppress_fields=SUPPRESSED_FOR_UNNORMALISED_STUBS,
                )

                for table, counts in moved.items():
                    for k, v in counts.items():
                        totals[f"{table}.{k}"] = totals.get(f"{table}.{k}", 0) + int(v or 0)

                if args.execute:
                    cur.execute(
                        """
                        INSERT INTO dedup_merge_log
                          (canonical_hcp_id, merged_hcp_id, merge_pass, merge_signals,
                           original_canonical_data, original_merged_data, fk_updates_count)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            survivor_id, shell_id, MERGE_PASS,
                            Json({
                                "signature": "length(identity_hash)=32",
                                "name_key": name,
                                "candidates": 1,
                                "survivor": "forced_sha256",
                                "suppressed_fields": sorted(SUPPRESSED_FOR_UNNORMALISED_STUBS),
                            }),
                            Json(canon_before), Json(merged_before), Json(moved),
                        ),
                    )
            if i % 100 == 0:
                print(f"  {i:,}/{len(pairs):,}")

        if args.dry_run:
            conn.rollback()
            print("\n[DRY RUN] rolled back, nothing written")
        else:
            conn.commit()
            print(f"\nCommitted. dedup_merge_log pass = {MERGE_PASS}")

        print("\nFK movement totals:")
        for k in sorted(totals):
            if totals[k]:
                print(f"  {k:<62} {totals[k]:,}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
