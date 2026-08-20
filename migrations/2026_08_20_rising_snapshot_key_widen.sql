-- hcp_rising_board_snapshots: widen the primary key so a board state, not a
-- calendar day, is the unit of capture.
-- Date: 2026-08-20. Branch: resurfacing.
-- Revert: sql/revert/2026_08_20_rising_snapshot_key_widen_REVERT.sql
--
-- WHAT WENT WRONG. The key was PRIMARY KEY (snapshot_date, hcp_id,
-- therapeutic_area_id) and the writer used ON CONFLICT DO NOTHING. That encodes
-- "one board state per calendar day", which the script's own docstring called
-- idempotence. On 2026-08-20 the board changed twice -- the coherence gate
-- replaced the delta floor (251 -> 338) and then the eigenvector country
-- normalisation landed (338 -> 336). The morning capture recorded the pre-gate
-- 251. The evening capture collided on every one of its 2,232 rows and was
-- silently discarded. The mechanism that exists to make board movement
-- observable declined to record the largest movement it has ever seen, and said
-- "inserted 0 rows" while doing it.
--
-- THE KEY IS THE BUG, not the conflict action. snapshot_date is a readable axis;
-- it was never a correct identity for a board state. source_computed_at is --
-- it carries the scoring row's own computed_at, so two runs on one day are two
-- values (08-19 14:14 vs 08-20 15:56) and a re-capture of UNCHANGED scoring is
-- still one value. That preserves the property actually wanted: re-running the
-- snapshot against scoring that has not moved remains a no-op.
--
-- WHY source_computed_at IS BACKFILLED FIRST. A PRIMARY KEY cannot contain
-- NULLs, and the 2,263 legacy rows (snapshot_date 2026-08-05 and 2026-06-08,
-- source='legacy') have it NULL -- they predate the v2 capture that records it.
-- They are backfilled from created_at. THIS IS NOT THE SCORING TIME; it is the
-- capture time, and for those rows the scoring time is not recoverable. The
-- source column still reads 'legacy', which is how to tell them apart.
--
-- Verified before applying: the widened key is unique across all 6,727 existing
-- rows (0 duplicate groups), so no data is lost to the new constraint.
--
-- NOT DONE HERE: hcp_established_board_snapshots carries the same defect --
-- PRIMARY KEY (snapshot_date, hcp_id, therapeutic_area_id, scope_type,
-- scope_value), also date-keyed. It is write-on-change and moves ~monthly, so
-- the collision window is much narrower, but the failure mode is identical and
-- it is untreated.

BEGIN;

-- 1. Backfill so the column can carry NOT NULL. Legacy rows only.
UPDATE hcp_rising_board_snapshots
   SET source_computed_at = created_at
 WHERE source_computed_at IS NULL;

ALTER TABLE hcp_rising_board_snapshots
  ALTER COLUMN source_computed_at SET NOT NULL;

-- 2. Widen the key.
ALTER TABLE hcp_rising_board_snapshots
  DROP CONSTRAINT hcp_rising_board_snapshots_pkey;

ALTER TABLE hcp_rising_board_snapshots
  ADD CONSTRAINT hcp_rising_board_snapshots_pkey
  PRIMARY KEY (snapshot_date, source_computed_at, hcp_id, therapeutic_area_id);

-- 3. snapshot_date is still the axis every read groups by, and is no longer
--    covered by a leading unique index on its own.
CREATE INDEX IF NOT EXISTS idx_rising_board_snapshots_date
  ON hcp_rising_board_snapshots (snapshot_date, therapeutic_area_slug);

COMMENT ON COLUMN hcp_rising_board_snapshots.source_computed_at IS
  'The scoring row''s own computed_at -- the identity of the board state captured. '
  'Part of the primary key since 2026-08-20 so two board states in one calendar day '
  'are two captures rather than one silently discarded. On rows with source=''legacy'' '
  'this holds the CAPTURE time (backfilled from created_at), not the scoring time, '
  'which is not recoverable for those rows.';

COMMENT ON COLUMN hcp_rising_board_snapshots.snapshot_date IS
  'Readable date axis for grouping captures. NOT a uniqueness claim -- a day may '
  'hold more than one board state. See source_computed_at.';

COMMIT;
