-- hcp_rising_board_snapshots: record the coherence-gate threshold.
-- Date: 2026-08-20. Branch: resurfacing.
-- Revert: sql/revert/2026_08_20_rising_coherence_gate_snapshot_column_REVERT.sql
--
-- WHY A NEW COLUMN RATHER THAN REUSING THE OLD ONE. The rising gate changed from
-- MIN_VELOCITY_DELTA (a count of senior-author papers, >=3) to
-- MIN_COMPONENT_PERCENTILE (a percentile floor, >=50, applied to all four
-- components). Writing 50 into min_velocity_delta_applied would silently
-- reinterpret every historical row: the 2026-08-17 and 2026-08-20 captures
-- record 3 there and mean "three papers". A percentile and a paper count are not
-- the same quantity and must not share a column.
--
-- min_velocity_delta_applied is KEPT and left populated on historical rows. It is
-- the only surviving record of what gated the 619 -> 251 board, and those rows
-- are not reproducible -- the momentum tables they were read from are overwritten
-- in place every cycle. New captures write NULL there and populate the new column.
--
-- No data is rewritten. Additive only.

BEGIN;

ALTER TABLE hcp_rising_board_snapshots
  ADD COLUMN IF NOT EXISTS min_component_percentile_applied numeric;

COMMENT ON COLUMN hcp_rising_board_snapshots.min_component_percentile_applied IS
  'Coherence gate in force at capture time: minimum percentile required on ALL FOUR '
  'components (scientific momentum, network momentum, scientific visibility, network '
  'visibility). Set from rising_star_scoring.MIN_COMPONENT_PERCENTILE. NULL on captures '
  'before 2026-08-20, which were gated by min_velocity_delta_applied instead.';

COMMENT ON COLUMN hcp_rising_board_snapshots.min_velocity_delta_applied IS
  'SUPERSEDED 2026-08-20 by min_component_percentile_applied. Senior-author paper '
  'delta required between rolling windows. Populated on the 2026-08-17 and 2026-08-20 '
  'captures (value 3) and NULL thereafter. Retained because those captures are the only '
  'record of the gate that produced the 251-member board.';

COMMIT;

-- NOTIFY not required: no RPC or view reads these columns.
