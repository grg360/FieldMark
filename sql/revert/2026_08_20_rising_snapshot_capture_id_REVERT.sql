-- REVERT for migrations/2026_08_20_rising_snapshot_capture_id.sql
-- Date: 2026-08-20. Branch: resurfacing.
--
-- THIS DOES NOT REVERT TO A GOOD STATE. It reverts to the superseded key
-- (snapshot_date, source_computed_at, hcp_id, therapeutic_area_id), which is the
-- one that let the 2026-08-20 evening capture overwrite half the morning capture.
-- Reverting re-arms that defect. It exists for completeness, not because there is
-- a reason to run it.
--
-- Reverting further -- to the original date-only key -- additionally requires
-- deleting one of the two 2026-08-20 captures; see
-- sql/revert/2026_08_20_rising_snapshot_key_widen_REVERT.sql, whose guard refuses
-- rather than choosing.
--
-- THE PROVENANCE REPAIR IS NOT UNDONE. Restoring min_component_percentile_applied
-- = 50 on 1,769 morning rows would re-assert that a capture taken under
-- MIN_VELOCITY_DELTA = 3 was gated at percentile 50. That claim was never true;
-- it was an artifact of the superseded key's DO UPDATE. Undoing a repair to
-- reinstate a falsehood is not a revert, so this file deliberately leaves it.

BEGIN;

DROP INDEX IF EXISTS idx_rising_board_snapshots_date;

ALTER TABLE hcp_rising_board_snapshots
  DROP CONSTRAINT hcp_rising_board_snapshots_pkey;

ALTER TABLE hcp_rising_board_snapshots
  ADD CONSTRAINT hcp_rising_board_snapshots_pkey
  PRIMARY KEY (snapshot_date, source_computed_at, hcp_id, therapeutic_area_id);

CREATE INDEX IF NOT EXISTS idx_rising_board_snapshots_date
  ON hcp_rising_board_snapshots (snapshot_date, therapeutic_area_slug);

ALTER TABLE hcp_rising_board_snapshots
  DROP COLUMN IF EXISTS capture_id;

COMMENT ON COLUMN hcp_rising_board_snapshots.source_computed_at IS NULL;
COMMENT ON COLUMN hcp_rising_board_snapshots.snapshot_date IS NULL;

COMMIT;

-- The writer must be reverted with git in the same operation:
--   scripts/utilities/take_weekly_snapshot.py
--     - find_existing_capture_id() removed
--     - capture_id dropped from the INSERT column list and the row tuples
--     - ON CONFLICT target back to
--       (snapshot_date, source_computed_at, hcp_id, therapeutic_area_id)
-- Leaving the capture_id ON CONFLICT against a key that no longer has the column
-- raises "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
