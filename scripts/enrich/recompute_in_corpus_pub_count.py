"""
FieldMark - Stage 8f: populate hcps_v2.in_corpus_pub_count from author_pub_flat.

Sibling of 8c (derive_career_first_pub_year_v2.py): the other publication-derived
statistic on hcps_v2, computed from the same substrate, in the same window.

WHY THIS EXISTS
---------------
This script was originally scoped to RECOMPUTE hcps_v2.total_career_pubs. That was
cancelled, because total_career_pubs holds two different quantities depending on
the row:

  * On most rows it is OpenAlex's works_count - the author's CAREER total, which
    counts papers we have never ingested. Verified exact on every decrease sampled
    2026-08-14 (Powell 455=455, Zhang 299=299, Rubin 1538=1538, Wang 1464=1464).
  * On others it is a flat union over author_pub_flat taken on the day the HCP was
    minted by create_hcps_v2.py:454-482 - an IN-CORPUS count, frozen thereafter.
    The only refresh path (create_hcps_v2.refresh_existing_hcp_derived_fields) is
    called at create_hcps_v2.py:1299-1308 iterating ONLY plan.link_inserts, so an
    HCP whose EXISTING shards accumulate more papers is never refreshed.

Writing the corpus aggregate over that column would have silently redefined it for
the first group, and moved the >=10 publication ranking gate in scoring_pipeline.py
as a side effect. So the aggregate - which is correct, and is unchanged from the
cancelled version - now lands in its own column with its own name.

total_career_pubs is left UNTOUCHED by this script.

WHAT THE TWO COLUMNS MEAN
-------------------------
  in_corpus_pub_count  what WE hold          measured here, from author_pub_flat
  total_career_pubs    the wider literature  from OpenAlex, mixed provenance today

WHAT READS in_corpus_pub_count
------------------------------
Nothing yet. CohortLedger.tsx:1395/1403 is scheduled to swap from
total_career_pubs to this column AFTER this backfill has run - swapping first
would blank the ledger's count for everyone, since the column ships all-NULL.

This column feeds NO ranking gate. scoring_pipeline.passes_ranking_publication_
threshold continues to read total_career_pubs and is unaffected by this stage.

METHOD
------
  in_corpus_pub_count = COUNT(DISTINCT f.pub_id)
                        FROM hcp_openalex_authors_v2 l
                        JOIN author_pub_flat f ON f.author_id = l.openalex_author_id
                        GROUP BY l.hcp_id

HCPs with no shard, or shards with no flattened publications, are NOT staged and
are left NULL. We have not measured zero publications for them - we have not
measured them at all. Absence is never zero.

Idempotent: the first run populates from NULL; later runs write only the rows
whose count actually moved.

Interface:
  python scripts/enrich/recompute_in_corpus_pub_count.py [--dry-run|--execute]
      [--summary-out ingest_run_summary.json] [--preview-limit 20]

Env: DATABASE_URL (service role) via .env.
Exit codes: 0 success, 1 failure (including a partial write). Never prints SUCCESS
on a partial run - the verify step below must agree with the staged row count.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import click
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

TARGET_COLUMN = "in_corpus_pub_count"
STAGING_TABLE = "hcp_in_corpus_pub_count_v1"

# The aggregate, materialised once so the dry-run preview and the UPDATE read the
# same rows rather than computing it twice (it is a ~48s scan).
BUILD_STAGING_SQL = f"""
DROP TABLE IF EXISTS {STAGING_TABLE};
CREATE TABLE {STAGING_TABLE} AS
SELECT l.hcp_id, count(DISTINCT f.pub_id)::int AS computed
FROM hcp_openalex_authors_v2 l
JOIN author_pub_flat f ON f.author_id = l.openalex_author_id
GROUP BY l.hcp_id;
ALTER TABLE {STAGING_TABLE} ADD PRIMARY KEY (hcp_id);
"""

# NOTE the deliberate absence of COALESCE(stored, 0). On a freshly added column
# every stored value is NULL, and NULL is not zero: conflating them would report
# 246k HCPs as having "increased from 0", and would make the delta arithmetic a
# statement about a number we never held.
STAGED_CTE = f"""
WITH staged AS (
  SELECT s.hcp_id,
         s.computed,
         h.{TARGET_COLUMN} AS stored,
         h.total_career_pubs AS career
  FROM {STAGING_TABLE} s
  JOIN hcps_v2 h ON h.id = s.hcp_id
),
changed AS (
  SELECT * FROM staged WHERE computed IS DISTINCT FROM stored
)
"""


def get_required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


def write_funnel(summary_path: Path, payload: dict) -> None:
    """Merge funnel counters into the run summary.

    MERGE, never overwrite: ingest_run_summary.json is stage 1's file (see
    reingest_cycle.py:649) and clobbering it would destroy the ingest funnel this
    cycle depends on. Counters land under a namespaced key.
    """
    existing = {}
    if summary_path.exists():
        try:
            existing = json.loads(summary_path.read_text(encoding="utf-8")) or {}
        except (json.JSONDecodeError, OSError) as exc:
            # A summary we cannot parse is not a reason to lose this stage's
            # counters, but it IS worth saying out loud rather than silently
            # starting a fresh file over the top of something.
            print(f"  [warn] could not read {summary_path} ({exc}); writing counters alongside.")
            existing = {}
    if not isinstance(existing, dict):
        print(f"  [warn] {summary_path} is not a JSON object; writing counters alongside.")
        existing = {}
    existing["stage_8f_in_corpus_pub_count"] = payload
    summary_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    print(f"  Funnel counters -> {summary_path} (key: stage_8f_in_corpus_pub_count)")


@click.command()
@click.option("--dry-run", is_flag=True, help="Compute + preview, write nothing (default).")
@click.option("--execute", is_flag=True, help="Run the UPDATE.")
@click.option("--summary-out", "summary_out", default="ingest_run_summary.json",
              help="Funnel-counter JSON. Merged, not overwritten.")
@click.option("--preview-limit", default=20, type=int, help="Largest counts to show.")
def main(dry_run: bool, execute: bool, summary_out: str, preview_limit: int) -> None:
    load_dotenv()
    db_url = get_required_env("DATABASE_URL")
    write = execute and not dry_run  # dry-run is the safe default
    started = datetime.now(timezone.utc)

    print("=" * 72)
    print(f"  STAGE 8f - populate hcps_v2.{TARGET_COLUMN}")
    print("=" * 72)
    print("  Source:  hcp_openalex_authors_v2 JOIN author_pub_flat (distinct pub_id)")
    print("  Leaves total_career_pubs untouched.")
    print(f"  Mode:    {'EXECUTE (writes)' if write else 'DRY-RUN (no writes)'}")
    print("=" * 72)

    try:
        with psycopg.connect(db_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = '30min'")

                # Fail loudly if the migration has not been applied, rather than
                # surfacing a bare UndefinedColumn from deep inside the aggregate.
                cur.execute("""
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='hcps_v2' AND column_name=%(c)s
                """, {"c": TARGET_COLUMN})
                if cur.fetchone() is None:
                    raise RuntimeError(
                        f"hcps_v2.{TARGET_COLUMN} does not exist. Apply "
                        f"migrations/2026_08_14_in_corpus_pub_count.sql first."
                    )

                print("\nBuilding staging table (full-corpus aggregate, ~48s)...")
                cur.execute(BUILD_STAGING_SQL)
                cur.execute(f"SELECT count(*) AS n FROM {STAGING_TABLE}")
                staged = cur.fetchone()["n"]
                cur.execute("SELECT count(*) AS n FROM hcps_v2")
                hcps_total = cur.fetchone()["n"]
                if staged == 0:
                    raise RuntimeError(
                        "staging table is empty - author_pub_flat or the shard links are "
                        "missing. Refusing to proceed (this would look like a no-op run)."
                    )

                # --- Funnel ---
                cur.execute(STAGED_CTE + """
                    SELECT
                      (SELECT count(*) FROM changed)                          AS to_write,
                      (SELECT count(*) FROM changed WHERE stored IS NULL)     AS populated_from_null,
                      (SELECT count(*) FROM changed WHERE stored IS NOT NULL) AS value_changed,
                      (SELECT min(computed) FROM staged)                      AS min_count,
                      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY computed)
                         FROM staged)                                         AS median_count,
                      (SELECT max(computed) FROM staged)                      AS max_count
                """)
                f = cur.fetchone()
                not_staged = hcps_total - staged

                print("\nFunnel:")
                print(f"  HCPs total                          : {hcps_total:,}")
                print(f"  staged (>=1 flattened publication)  : {staged:,}")
                print(f"  NOT staged, left NULL (absence)     : {not_staged:,}")
                print(f"  rows to write                       : {f['to_write']:,}")
                print(f"    populated from NULL               : {f['populated_from_null']:,}")
                print(f"    existing value changed            : {f['value_changed']:,}")
                print(f"    already correct (no write)        : {staged - f['to_write']:,}")
                print(f"  in-corpus count  min / median / max : "
                      f"{f['min_count']:,} / {float(f['median_count']):.0f} / {f['max_count']:,}")

                # --- Diagnostic, not a change: how far total_career_pubs sits from
                # the corpus. Nothing here is written; it is the evidence for the
                # parked decision about repopulating that column from one source.
                cur.execute(STAGED_CTE + """
                    SELECT
                      count(*) FILTER (WHERE career IS NULL)     AS career_null,
                      count(*) FILTER (WHERE career = computed)  AS career_equal,
                      count(*) FILTER (WHERE career IS NOT NULL
                                         AND career <> computed) AS career_differs,
                      count(*) FILTER (WHERE career IS NOT NULL
                                         AND career > computed)  AS career_higher,
                      count(*) FILTER (WHERE career IS NOT NULL
                                         AND career < computed)  AS career_lower
                    FROM staged
                """)
                d = cur.fetchone()
                print("\nDiagnostic - total_career_pubs vs the corpus (nothing written):")
                print(f"  equal                               : {d['career_equal']:,}")
                print(f"  differs                             : {d['career_differs']:,}")
                print(f"    career total higher (expected)    : {d['career_higher']:,}")
                print(f"    career total LOWER (stale freeze) : {d['career_lower']:,}")
                print(f"  total_career_pubs NULL              : {d['career_null']:,}")

                cur.execute(STAGED_CTE + """
                    SELECT c.hcp_id, h.first_name, h.last_name, c.stored, c.computed, c.career
                    FROM changed c JOIN hcps_v2 h ON h.id = c.hcp_id
                    ORDER BY c.computed DESC LIMIT %(lim)s
                """, {"lim": preview_limit})
                movers = cur.fetchall()
                print(f"\nLargest {len(movers)} in-corpus counts to be written:")
                print(f"  {'name':32} {'stored':>8} {'new':>8} {'career':>8}")
                for m in movers:
                    nm = f"{m['first_name'] or ''} {m['last_name'] or ''}".strip()[:32]
                    stored = "-" if m["stored"] is None else f"{m['stored']:,}"
                    career = "-" if m["career"] is None else f"{m['career']:,}"
                    print(f"  {nm:32} {stored:>8} {m['computed']:>8,} {career:>8}")

                payload = {
                    "mode": "execute" if write else "dry_run",
                    "started_at": started.isoformat(),
                    "target_column": TARGET_COLUMN,
                    "hcps_total": hcps_total,
                    "staged_hcps": staged,
                    "not_staged_left_null": not_staged,
                    "rows_to_write": f["to_write"],
                    "populated_from_null": f["populated_from_null"],
                    "value_changed": f["value_changed"],
                    "min_count": f["min_count"],
                    "median_count": float(f["median_count"]),
                    "max_count": f["max_count"],
                    "career_equal": d["career_equal"],
                    "career_differs": d["career_differs"],
                    "career_higher": d["career_higher"],
                    "career_lower": d["career_lower"],
                    "career_null": d["career_null"],
                }
                to_write = f["to_write"]

                if not write:
                    conn.rollback()  # drop the staging table with the transaction
                    payload["rows_updated"] = 0
                    payload["verified"] = None
                    payload["status"] = "dry_run"
                    write_funnel(Path(summary_out), payload)
                    print("\n[DRY-RUN] No rows written. Re-run with --execute to write.")
                    return

                # --- Execute. UPDATE ... FROM staging: a set-based write that touches
                # only in_corpus_pub_count + updated_at, so no NOT NULL column on
                # hcps_v2 is left unset (the failure mode a bulk upsert would hit).
                # total_career_pubs is not in the SET list and cannot be disturbed.
                print("\nApplying UPDATE ... FROM staging...")
                cur.execute(f"""
                    UPDATE hcps_v2 h
                    SET {TARGET_COLUMN} = s.computed,
                        updated_at = now()
                    FROM {STAGING_TABLE} s
                    WHERE h.id = s.hcp_id
                      AND s.computed IS DISTINCT FROM h.{TARGET_COLUMN}
                """)
                updated = cur.rowcount

                # VERIFY BEFORE COMMIT: every staged row must now agree with hcps_v2.
                # A partial write fails the run rather than reporting success.
                cur.execute(f"""
                    SELECT count(*) AS n FROM {STAGING_TABLE} s JOIN hcps_v2 h ON h.id = s.hcp_id
                    WHERE s.computed IS DISTINCT FROM h.{TARGET_COLUMN}
                """)
                still_diff = cur.fetchone()["n"]
                if still_diff != 0:
                    raise RuntimeError(
                        f"PARTIAL WRITE: {still_diff:,} staged rows still disagree with hcps_v2 "
                        f"after the UPDATE. Rolling back - nothing committed."
                    )
                if updated != to_write:
                    raise RuntimeError(
                        f"COUNT MISMATCH: UPDATE touched {updated:,} rows but {to_write:,} were "
                        f"expected to differ. Rolling back - nothing committed."
                    )

                cur.execute(f"DROP TABLE IF EXISTS {STAGING_TABLE}")
                conn.commit()

                payload["rows_updated"] = updated
                payload["verified"] = True
                payload["status"] = "ok"
                write_funnel(Path(summary_out), payload)
                print(f"\n{updated:,} rows updated.")
                print("VERIFY: 0 staged rows disagree with hcps_v2. OK.")

    except Exception as exc:  # noqa: BLE001 - any failure must exit non-zero
        print(f"\nFAILED: {exc}", file=sys.stderr)
        try:
            write_funnel(Path(summary_out), {
                "mode": "execute" if write else "dry_run",
                "started_at": started.isoformat(),
                "target_column": TARGET_COLUMN,
                "status": "failed",
                "error": str(exc),
            })
        except Exception:  # noqa: BLE001 - never mask the original failure
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
