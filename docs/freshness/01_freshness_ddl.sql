/* Freshness gate DDL. Authored 2026-09-18. NOT APPLIED.
   Two independent changes. Run block 1 before deploying the take_weekly_snapshot change,
   and block 2 before deploying the pipeline_log / ta_cycle changes. Each block is
   standalone and idempotent. */

/* BLOCK 1 - refreshed_at on hcp_rising_board_snapshots.

   WHY A NEW COLUMN RATHER THAN UPDATING created_at. take_weekly_snapshot.py:743 reports
   count(DISTINCT created_at) AS write_passes, a live diagnostic that detects a capture
   completed in more than one physical pass. created_at is documented at :729 as honest
   row-level provenance - when each row was physically written - and is explicitly never
   grouped on. Making ON CONFLICT DO UPDATE touch it would collapse write_passes to 1 and
   move first_written forward, breaking the instrument that exists to catch exactly that
   class of error.

   WHY THIS TABLE AND NOT hcp_established_board_snapshots. Rising upserts ON CONFLICT
   (capture_id, hcp_id, therapeutic_area_id) DO UPDATE (:299) - a deliberate refresh in
   place when find_existing_capture_id reuses an id - and on that path the row's data
   changes while created_at does not. Established is ON CONFLICT ... DO NOTHING (:620), so
   it has no update path at all: a new capture always inserts new rows with a fresh
   created_at, and a same-date re-run correctly writes nothing. Established is NOT a
   category-B artifact and needs no column. */

ALTER TABLE public.hcp_rising_board_snapshots
  ADD COLUMN IF NOT EXISTS refreshed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hcp_rising_board_snapshots_ta_refreshed
  ON public.hcp_rising_board_snapshots (therapeutic_area_id, refreshed_at DESC);

/* BLOCK 2 - pipeline_runs gains a TA key and an artifact name.

   therapeutic_area_id IS NULLABLE AND NULL MEANS NOT TA-SCOPED, NEVER ALL TAS. A job with
   no TA dimension (social_capture, dedup) legitimately writes NULL. The gate must never
   read NULL as covering every TA; see freshness.py.

   target_artifact is required because pipeline_name identifies the PRODUCER, and the
   comparison needs the ARTIFACT. reingest_diff.py writes three tables from one run and
   generate_narratives_v2 writes one table for three cohorts; without this a single run
   stamps an ambiguous set. */

ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS therapeutic_area_id uuid;

ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS target_artifact text;

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_artifact_ta
  ON public.pipeline_runs (target_artifact, therapeutic_area_id, completed_at DESC);

/* BLOCK 3 - verification, read only. Expect refreshed_at present and null on every
   existing row (the watermark in freshness.py is what stops those nulls being read as
   fresh), and pipeline_runs carrying both new columns. */

SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
  AND ((c.relname = 'hcp_rising_board_snapshots' AND a.attname = 'refreshed_at')
    OR (c.relname = 'pipeline_runs' AND a.attname IN ('therapeutic_area_id', 'target_artifact')))
ORDER BY c.relname, a.attname;
