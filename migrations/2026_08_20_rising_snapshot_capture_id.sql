-- hcp_rising_board_snapshots: capture_id as the capture identity, and repair the
-- provenance damage done by the superseded key.
-- Date: 2026-08-20. Branch: resurfacing.
-- Revert: sql/revert/2026_08_20_rising_snapshot_capture_id_REVERT.sql
-- SUPERSEDES: migrations/2026_08_20_rising_snapshot_key_widen.sql (applied, wrong)
--
-- WHY THE PREVIOUS FIX FAILED. That migration keyed on source_computed_at,
-- believing it identified a capture. It does not -- it is PER ROW. Board members
-- take it from hcp_rising_star_ranks_v3.computed_at; off-board pool members take
-- it from hcp_scientific_momentum_v1.computed_at. So when only the rising scorer
-- re-runs, off-board rows keep the OLD momentum timestamp and still collide. The
-- 2026-08-20 evening capture inserted 463 rows and silently UPDATED the rest of
-- the morning capture, leaving neither state complete:
--
--   created_at 13:14 (morning)  src 14:14:40  1,769 rows  mvd=3     mcp=50  <- contaminated
--   created_at 13:14 (morning)  src 14:14:40    212 rows  mvd=3     mcp=NULL
--   created_at 13:14 (morning)  src 14:15:00    251 rows  mvd=3     mcp=NULL  (board)
--   created_at 17:08 (evening)  src 14:14:40    127 rows  mvd=NULL  mcp=50
--   created_at 17:08 (evening)  src 15:56:50    336 rows  mvd=NULL  mcp=50    (board)
--
-- CAPTURE_ID IS A STATEMENT, NOT AN INFERENCE. created_at happens to be constant
-- per capture because now() is transaction-stable, and would work today. A uuid
-- minted once per run says what it is and cannot be quietly broken by someone
-- changing a column default or writing rows outside a single transaction.
--
-- IDEMPOTENCE MOVES OUT OF THE KEY. A fresh uuid per invocation means a re-run
-- against unchanged scoring would insert a duplicate capture. The writer now does
-- a pre-insert fingerprint lookup instead: if a capture already exists for this
-- (snapshot_date, TA) whose BOARD rows carry the same source_computed_at as the
-- scoring about to be captured, it reuses that capture_id and refreshes in place.
-- Identity from the uuid, idempotence from the check -- neither borrowed from the
-- other. See take_weekly_snapshot.py.
--
-- Verified before applying: (snapshot_date, created_at) partitions all 7,190 rows
-- into exactly 5 capture groups with no cross-contamination, so the backfill below
-- assigns one uuid per real capture.

BEGIN;

-- 1. Identity column, backfilled one uuid per real capture.
ALTER TABLE hcp_rising_board_snapshots
  ADD COLUMN IF NOT EXISTS capture_id uuid;

WITH groups AS (
  SELECT DISTINCT snapshot_date, created_at FROM hcp_rising_board_snapshots
), assigned AS (
  SELECT snapshot_date, created_at, gen_random_uuid() AS cid FROM groups
)
UPDATE hcp_rising_board_snapshots s
   SET capture_id = a.cid
  FROM assigned a
 WHERE s.snapshot_date = a.snapshot_date
   AND s.created_at   = a.created_at
   AND s.capture_id IS NULL;

ALTER TABLE hcp_rising_board_snapshots
  ALTER COLUMN capture_id SET NOT NULL;

-- 2. Re-key. capture_id already implies snapshot_date, so the date leaves the key
--    entirely and goes back to being a readable axis with an index of its own.
ALTER TABLE hcp_rising_board_snapshots
  DROP CONSTRAINT hcp_rising_board_snapshots_pkey;

ALTER TABLE hcp_rising_board_snapshots
  ADD CONSTRAINT hcp_rising_board_snapshots_pkey
  PRIMARY KEY (capture_id, hcp_id, therapeutic_area_id);

CREATE INDEX IF NOT EXISTS idx_rising_board_snapshots_date
  ON hcp_rising_board_snapshots (snapshot_date, therapeutic_area_slug);

-- 3. PROVENANCE REPAIR. The 1,769 contaminated rows belong to the MORNING capture,
--    which ran under MIN_VELOCITY_DELTA = 3 before the coherence gate existed --
--    min_component_percentile_applied was not even a column then. mvd = 3 is the
--    true value and is KEPT; mcp = 50 leaked in from the evening capture's
--    DO UPDATE and is nulled. The 2026-08-17 capture (2,232 rows, mvd=3,
--    mcp=NULL throughout) is the reference shape this restores.
UPDATE hcp_rising_board_snapshots
   SET min_component_percentile_applied = NULL
 WHERE therapeutic_area_slug = 'nsclc'
   AND snapshot_date = '2026-08-20'
   AND created_at = '2026-08-20 13:14:03.851319+00'
   AND min_velocity_delta_applied = 3
   AND min_component_percentile_applied = 50;

COMMENT ON COLUMN hcp_rising_board_snapshots.capture_id IS
  'Identity of one capture run. Minted once per invocation of take_weekly_snapshot.py '
  'and constant across every row it writes. THE primary key component -- a calendar '
  'day may hold several captures. Re-running against unchanged scoring reuses an '
  'existing capture_id via the writer''s fingerprint lookup rather than minting a new one.';

COMMENT ON COLUMN hcp_rising_board_snapshots.source_computed_at IS
  'The SOURCE ROW''s computed_at -- board members from hcp_rising_star_ranks_v3, '
  'off-board pool members from hcp_scientific_momentum_v1. PER ROW, not per capture: '
  'it does NOT identify a capture and must not be used as a key (it was, on 2026-08-20, '
  'and the collision cost half of two captures). Use capture_id. On source=''legacy'' '
  'rows this holds the capture time, backfilled from created_at.';

COMMENT ON COLUMN hcp_rising_board_snapshots.snapshot_date IS
  'Readable date axis for grouping captures. NOT a uniqueness claim and not part of '
  'the key -- a day may hold more than one board state. See capture_id.';

COMMIT;
