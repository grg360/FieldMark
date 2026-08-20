#!/usr/bin/env python3
"""
sweep_stranded_narratives.py -- delete narratives whose HCP has left the board.

WHY THIS IS A STANDING STEP AND NOT A MIGRATION
-----------------------------------------------
Until 2026-08-20 the rising board was gated by MIN_VELOCITY_DELTA, a count of
senior-author papers. A count moves when someone publishes, so strandings were
rare and arrived in one-off batches when the THRESHOLD changed -- the 08-17 sweep
header says so explicitly, and was right at the time.

The gate is now MIN_COMPONENT_PERCENTILE: a percentile floor on all four
components, evaluated against the eligible pool. A percentile floor moves when
ANYONE ELSE moves. Members drift across the median every cycle without doing
anything differently, so stranded narratives are now ordinary churn.

Ordinary churn must not depend on someone remembering. Hence stage 13.5.

ORDER MATTERS: RUN AFTER GENERATION, NOT BEFORE
-----------------------------------------------
Stage 13 regenerates narratives for current board members; this sweep removes
narratives for people who are no longer members. Run in that order the board is
fully covered before anything is deleted. Reversed, the sweep deletes rows that
generation would have replaced, and the board is briefly uncovered.

The 2026-08-17 sweep ran the other way round and left 270 people with no
narrative pending a later run. The 08-20 sweep ran after generation and left the
board at full coverage.

WHAT IT WILL NOT DO
-------------------
It never deletes without first writing a restorable backup, and it aborts if the
board moved between computing the set and deleting it. A stranded narrative is a
row that CONTRADICTS the board, not a row that is merely old -- so the failure
mode to avoid is deleting the wrong set, not deleting late.

Usage:
    python scripts/narrative/sweep_stranded_narratives.py --ta nsclc --dry-run
    python scripts/narrative/sweep_stranded_narratives.py --ta nsclc --cohort rising_star
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKUP_DIR = REPO_ROOT / "sql" / "revert" / "stranded_sweeps"

# Where board membership lives, per cohort. A cohort absent here is unsupported
# rather than assumed -- guessing the membership source is how you delete the
# wrong set.
#
# community is deliberately ABSENT: its board is a tier-filtered view
# (community_board_nsclc_v1.qualifies) that is NSCLC-specific and not keyed the
# same way, and community narratives are currently blocked upstream on Phase 4
# context assembly. Add it when that lands, with its own membership predicate.
BOARD_SOURCES: dict[str, str] = {
    "rising_star": "hcp_rising_star_ranks_v3",
    "established": "hcp_established_ranks_v3",
}

# Whether the narrative scope EQUALS the board, i.e. whether "board members with
# no narrative" is a meaningful number.
#
# rising_star: yes -- the generator selects the whole board, so a non-zero count
#   means generation did not cover it, which is worth a warning.
# established: NO -- the board is scope-partitioned (global + one row per region,
#   46,015 rows over 17,041 people for NSCLC) while the generator writes only the
#   GLOBAL TOP 200. Uncovered members are the expected state, not a fault, and
#   warning on it would cry wolf every cycle forever.
#
# Stranding is still well defined for both: a narrative is stranded when its HCP
# is on NO scope row of the board at all.
NARRATIVE_SCOPE_IS_BOARD: dict[str, bool] = {
    "rising_star": True,
    "established": False,
}

NARRATIVE_COLS = [
    "id", "hcp_id", "therapeutic_area_slug", "narrative_text", "prompt_version",
    "model_used", "generated_at", "why_now", "engagement_angle", "signal_strength",
    "caution_flags", "source_enrichment_run_id", "cohort",
]


def get_conn():
    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("Missing DATABASE_URL")
    return psycopg2.connect(url)


def fetch_stranded(conn, slug: str, cohort: str) -> list[dict]:
    board_table = BOARD_SOURCES[cohort]
    sql = f"""
        WITH ta AS (SELECT id FROM therapeutic_areas WHERE slug = %(slug)s)
        SELECT n.*, h.first_name || ' ' || h.last_name AS name,
               coalesce(cc.cohort, '(unclassified)') AS classification_v2,
               EXISTS (SELECT 1 FROM hcp_narratives_v2 o
                       WHERE o.hcp_id = n.hcp_id
                         AND o.therapeutic_area_slug = %(slug)s
                         AND o.cohort <> %(cohort)s) AS has_other
        FROM hcp_narratives_v2 n
        JOIN hcps_v2 h ON h.id = n.hcp_id
        LEFT JOIN hcp_cohort_classification_v2 cc
               ON cc.hcp_id = n.hcp_id
              AND cc.therapeutic_area_id = (SELECT id FROM ta)
        WHERE n.cohort = %(cohort)s
          AND n.therapeutic_area_slug = %(slug)s
          AND NOT EXISTS (
                SELECT 1 FROM {board_table} b, ta
                WHERE b.hcp_id = n.hcp_id
                  AND b.therapeutic_area_id = ta.id)
        ORDER BY h.last_name, h.first_name
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, {"slug": slug, "cohort": cohort})
        return [dict(r) for r in cur.fetchall()]


def board_size(conn, slug: str, cohort: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT count(DISTINCT b.hcp_id) FROM {BOARD_SOURCES[cohort]} b
                JOIN therapeutic_areas t ON t.id = b.therapeutic_area_id AND t.slug = %s""",
            (slug,),
        )
        return int(cur.fetchone()[0])


def uncovered_members(conn, slug: str, cohort: str) -> int:
    """Board members with no narrative -- the check that this ran AFTER generation."""
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT count(DISTINCT b.hcp_id) FROM {BOARD_SOURCES[cohort]} b
                JOIN therapeutic_areas t ON t.id = b.therapeutic_area_id AND t.slug = %s
                WHERE NOT EXISTS (SELECT 1 FROM hcp_narratives_v2 n
                                  WHERE n.hcp_id = b.hcp_id
                                    AND n.therapeutic_area_slug = %s
                                    AND n.cohort = %s)""",
            (slug, slug, cohort),
        )
        return int(cur.fetchone()[0])


def sql_literal(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, list):
        if not v:
            return "'{}'"
        return "ARRAY[" + ",".join("'" + str(x).replace("'", "''") + "'" for x in v) + "]::text[]"
    return "'" + str(v).replace("'", "''") + "'"


def write_backup(rows: list[dict], slug: str, cohort: str, stamp: str) -> tuple[Path, Path]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    base = f"{stamp}_{slug}_{cohort}"
    restore = BACKUP_DIR / f"{base}_RESTORE.sql"
    manifest = BACKUP_DIR / f"{base}_MANIFEST.tsv"

    with open(restore, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            f"-- RESTORE for the stranded-narrative sweep of {stamp} "
            f"({slug} / {cohort}).\n"
            f"-- {len(rows)} row images, original ids preserved so any reference to them\n"
            f"-- is re-established by restoring. ON CONFLICT (id) DO NOTHING, so this\n"
            f"-- cannot clobber a row that has since been regenerated.\n"
            f"--\n"
            f"-- These texts assert a board membership that no longer holds. Restore to\n"
            f"-- recover from a mistaken sweep, not to bring the prose back.\n\nBEGIN;\n\n"
        )
        for r in rows:
            vals = ", ".join(sql_literal(r[c]) for c in NARRATIVE_COLS)
            f.write(
                f"INSERT INTO hcp_narratives_v2 ({', '.join(NARRATIVE_COLS)})\n"
                f"VALUES ({vals})\nON CONFLICT (id) DO NOTHING;\n\n"
            )
        f.write("COMMIT;\n")

    with open(manifest, "w", encoding="utf-8", newline="\n") as f:
        f.write("id\thcp_id\tname\tclassification_v2\tprompt_version\tgenerated_on\tafter_delete\n")
        for r in rows:
            f.write("\t".join([
                str(r["id"]), str(r["hcp_id"]), r["name"], r["classification_v2"],
                r["prompt_version"] or "", str(r["generated_at"])[:10],
                "HAS_OTHER" if r["has_other"] else "NONE_LEFT",
            ]) + "\n")
    return manifest, restore


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ta", default="nsclc", help="Therapeutic area slug")
    ap.add_argument("--cohort", default="rising_star", choices=sorted(BOARD_SOURCES))
    ap.add_argument("--dry-run", action="store_true", help="Report and write the backup; delete nothing")
    args = ap.parse_args()

    conn = get_conn()
    stamp = datetime.now(timezone.utc).strftime("%Y_%m_%d")
    print(f"=== stranded sweep: {args.ta} / {args.cohort} ===")

    board = board_size(conn, args.ta, args.cohort)
    uncovered = uncovered_members(conn, args.ta, args.cohort)
    rows = fetch_stranded(conn, args.ta, args.cohort)
    print(f"  board {board:,} | stranded {len(rows):,} | board members without a narrative {uncovered:,}")

    if uncovered and NARRATIVE_SCOPE_IS_BOARD[args.cohort]:
        # Not fatal -- a stranded row still contradicts the board and still ought to
        # go. But for this cohort the generator selects the whole board, so a
        # non-zero count means generation did not cover it. Say so loudly rather
        # than let a silent sweep imply the board is healthy.
        print(f"  WARN: {uncovered:,} board member(s) have no {args.cohort} narrative. "
              f"This sweep runs AFTER generation by design (stage 13.5); a non-zero "
              f"count here means stage 13 did not cover the board.", file=sys.stderr)
    elif uncovered:
        print(f"  ({uncovered:,} board members have no {args.cohort} narrative -- expected: "
              f"the generator writes a top-N cut, not the whole board)")

    if not rows:
        print("  nothing stranded; no backup written, nothing deleted")
        conn.close()
        return 0

    by_bucket: dict[str, int] = {}
    for r in rows:
        by_bucket[r["classification_v2"]] = by_bucket.get(r["classification_v2"], 0) + 1
    print("  by hcp_cohort_classification_v2: "
          + ", ".join(f"{k} {v}" for k, v in sorted(by_bucket.items())))
    none_left = sum(1 for r in rows if not r["has_other"])
    print(f"  {none_left:,} would be left with no narrative for this TA; "
          f"{len(rows) - none_left:,} carry one under another cohort")

    manifest, restore = write_backup(rows, args.ta, args.cohort, stamp)
    print(f"  manifest -> {manifest.relative_to(REPO_ROOT)}")
    print(f"  restore  -> {restore.relative_to(REPO_ROOT)}")

    if args.dry_run:
        print("  [DRY RUN] backup written, nothing deleted")
        conn.close()
        return 0

    # RE-DERIVE AND ASSERT. The set is recomputed inside the delete transaction and
    # checked against what the backup describes. If the board moved in between --
    # another scorer run, a manual edit -- this aborts rather than deleting a set
    # the restore file cannot undo.
    ids = [r["id"] for r in rows]
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT count(*) FROM hcp_narratives_v2 n
                    WHERE n.cohort = %s AND n.therapeutic_area_slug = %s
                      AND NOT EXISTS (
                        SELECT 1 FROM {BOARD_SOURCES[args.cohort]} b
                        JOIN therapeutic_areas t ON t.id = b.therapeutic_area_id AND t.slug = %s
                        WHERE b.hcp_id = n.hcp_id)""",
                (args.cohort, args.ta, args.ta),
            )
            now = int(cur.fetchone()[0])
            if now != len(rows):
                raise SystemExit(
                    f"ABORT: {now} stranded rows now, backup describes {len(rows)}. "
                    f"The board moved after the backup was written. Re-run the sweep; "
                    f"the backup on disk does not match what would be deleted."
                )
            cur.execute("DELETE FROM hcp_narratives_v2 WHERE id = ANY(%s::uuid[])", (ids,))
            deleted = cur.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    print(f"  deleted {deleted:,} rows (restore: {restore.relative_to(REPO_ROOT)})")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
