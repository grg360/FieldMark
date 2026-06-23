"""
Backfill belief_claim_title on existing msl_hcp_notes rows.

For each row with belief_claim_key set but belief_claim_title null, look up the
HCP's Belief Profile, re-hash each candidate claim using the same algorithm as
the seed script, match the existing key to find the source claim, and write
the title back.

Usage:
    python backfill_belief_claim_titles.py [--dry-run]
"""

import argparse
import hashlib
import json
import os
import sys
from typing import Any

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


def require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise EnvironmentError(f"Missing env var: {name}")
    return val


def build_advocacy_claim_key(hcp_id: str, position_ids: list[str]) -> str:
    """Mirror the TS buildAdvocacyClaimKey hash exactly."""
    sorted_ids = sorted(position_ids)
    payload = f"advocacy|{hcp_id}|{','.join(sorted_ids)}"
    return hashlib.sha256(payload.encode()).hexdigest()


def fetch_candidate_claims(conn, hcp_id: str) -> list[dict[str, Any]]:
    """Load the Belief Profile and return all candidate claims with their position_ids and titles."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT body
            FROM hcp_ai_overviews
            WHERE hcp_id = %s
              AND synthesis_type = 'scientific_positions'
              AND therapeutic_area = 'NSCLC'
            LIMIT 1
            """,
            (hcp_id,),
        )
        row = cur.fetchone()
        if not row or not row.get("body"):
            return []

    try:
        profile = json.loads(row["body"])
    except (json.JSONDecodeError, TypeError):
        return []

    candidates: list[dict[str, Any]] = []
    for section_key in ("strongly_advocates", "frequently_raises"):
        for c in profile.get(section_key, []):
            title = c.get("theme")
            pos_ids = c.get("representative_position_ids", [])
            if title and pos_ids:
                candidates.append({
                    "title": title.strip(),
                    "position_ids": pos_ids,
                })
    return candidates


def main():
    parser = argparse.ArgumentParser(description="Backfill belief_claim_title")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    load_dotenv()
    db_url = require_env("DATABASE_URL")

    if args.dry_run:
        print("DRY RUN MODE: no database writes\n")

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        # Find rows needing backfill
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT n.id AS note_id, n.belief_claim_key, r.hcp_id, h.first_name, h.last_name
                FROM msl_hcp_notes n
                JOIN msl_hcp_relationships r ON r.id = n.relationship_id
                JOIN hcps_v2 h ON h.id = r.hcp_id
                WHERE n.belief_claim_key IS NOT NULL
                  AND n.belief_claim_title IS NULL
                  AND n.deleted_at IS NULL
                ORDER BY n.created_at ASC
                """,
            )
            rows = cur.fetchall()

        print(f"Found {len(rows)} rows needing backfill\n")

        if not rows:
            print("Nothing to do.")
            return

        # Cache candidate lists per HCP to avoid repeat lookups
        cache: dict[str, list[dict[str, Any]]] = {}

        matched = 0
        unmatched = 0
        skipped = 0

        for row in rows:
            note_id = row["note_id"]
            hcp_id = row["hcp_id"]
            target_key = row["belief_claim_key"]
            hcp_name = f"{row['first_name']} {row['last_name']}".strip()

            if hcp_id not in cache:
                cache[hcp_id] = fetch_candidate_claims(conn, hcp_id)

            candidates = cache[hcp_id]
            if not candidates:
                print(f"  [SKIP] {hcp_name} ({note_id}): no Belief Profile candidates")
                skipped += 1
                continue

            # Find matching candidate by re-hashing
            matched_title = None
            for c in candidates:
                if build_advocacy_claim_key(hcp_id, c["position_ids"]) == target_key:
                    matched_title = c["title"]
                    break

            if matched_title is None:
                print(f"  [UNMATCHED] {hcp_name} ({note_id}): key {target_key[:12]}... did not match any candidate")
                unmatched += 1
                continue

            if args.dry_run:
                print(f"  [DRY] {hcp_name} ({note_id}) -> '{matched_title}'")
                matched += 1
            else:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE msl_hcp_notes
                        SET belief_claim_title = %s,
                            updated_at = now()
                        WHERE id = %s
                        """,
                        (matched_title, note_id),
                    )
                print(f"  [OK] {hcp_name} ({note_id}) -> '{matched_title}'")
                matched += 1

        if not args.dry_run:
            conn.commit()

        print(f"\nDone. matched={matched}, unmatched={unmatched}, skipped={skipped}")


if __name__ == "__main__":
    main()
