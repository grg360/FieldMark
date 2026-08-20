-- REVERT for migrations/2026_08_20_rising_snapshot_key_widen.sql
-- Date: 2026-08-20. Branch: resurfacing.
--
-- READ THIS BEFORE RUNNING. This revert is NOT loss-free, and cannot be made so.
--
-- The narrow key (snapshot_date, hcp_id, therapeutic_area_id) can only hold ONE
-- board state per calendar day. If any day now holds two -- which is the entire
-- point of the migration, and is true of 2026-08-20 the moment the re-capture
-- runs -- then restoring the narrow key REQUIRES DELETING one of them. There is
-- no ordering of these statements that avoids it.
--
-- The guard below refuses rather than choosing for you. To proceed you must
-- decide which capture survives and delete the other explicitly.
--
-- For 2026-08-20 specifically the two states are:
--   source_computed_at 2026-08-19 14:14  -> pre-gate board, 251 on board,
--                                           min_velocity_delta_applied = 3
--   source_computed_at 2026-08-20 15:56  -> coherence gate + V3, 336 on board,
--                                           min_component_percentile_applied = 50
-- Both are real states of a board that shipped. Neither is reconstructible from
-- the scoring tables, which are overwritten in place every run.

BEGIN;

-- Refuse if any (snapshot_date, hcp_id, TA) would collide under the narrow key.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT snapshot_date, hcp_id, therapeutic_area_id
    FROM hcp_rising_board_snapshots
    GROUP BY 1,2,3 HAVING count(*) > 1
  ) x;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'REFUSING TO REVERT: % (snapshot_date, hcp_id, TA) group(s) hold more than one '
      'board state. Restoring the narrow key would delete one. Choose which capture '
      'to keep and DELETE it by source_computed_at first, then re-run this file.',
      dup_count;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_rising_board_snapshots_date;

ALTER TABLE hcp_rising_board_snapshots
  DROP CONSTRAINT hcp_rising_board_snapshots_pkey;

ALTER TABLE hcp_rising_board_snapshots
  ADD CONSTRAINT hcp_rising_board_snapshots_pkey
  PRIMARY KEY (snapshot_date, hcp_id, therapeutic_area_id);

-- source_computed_at stays NOT NULL and stays backfilled on legacy rows. Undoing
-- the backfill would re-introduce NULLs that carry no more information than the
-- created_at they were filled from, and 'legacy' in the source column already
-- marks those rows.
ALTER TABLE hcp_rising_board_snapshots
  ALTER COLUMN source_computed_at DROP NOT NULL;

COMMENT ON COLUMN hcp_rising_board_snapshots.source_computed_at IS NULL;
COMMENT ON COLUMN hcp_rising_board_snapshots.snapshot_date IS NULL;

COMMIT;

-- The writer must be reverted with git in the same operation:
--   scripts/utilities/take_weekly_snapshot.py
--     - ON CONFLICT target back to (snapshot_date, hcp_id, therapeutic_area_id) DO NOTHING
--     - the batch-total row counter back to the per-batch rowcount
-- Leaving the widened ON CONFLICT against a narrow key raises
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
