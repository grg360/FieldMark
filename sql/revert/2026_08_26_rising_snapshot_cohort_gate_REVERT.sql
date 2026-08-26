-- REVERT migrations/2026_08_26_rising_snapshot_cohort_gate.sql
-- Date: 2026-08-26.
--
-- Drops the pool-provenance column. Additive migration, so the revert loses only
-- the provenance itself -- no score, rank or percentile is touched.
--
-- DO NOT RUN THIS WHILE take_weekly_snapshot.py STILL WRITES cohort_gate_applied.
-- The writer names the column in RISING_INSERT; dropping it fails every capture.
-- Revert the Python in the same step, or not at all.
--
-- The max_career_years_applied comment is restored to the schema's original text.

BEGIN;

ALTER TABLE hcp_rising_board_snapshots
  DROP COLUMN IF EXISTS cohort_gate_applied;

COMMENT ON COLUMN hcp_rising_board_snapshots.max_career_years_applied IS NULL;

COMMIT;
