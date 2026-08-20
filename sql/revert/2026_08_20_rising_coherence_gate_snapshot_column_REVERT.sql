-- REVERT for migrations/2026_08_20_rising_coherence_gate_snapshot_column.sql
-- Date: 2026-08-20. Branch: resurfacing.
--
-- SCOPE: this reverts the SNAPSHOT COLUMN ONLY. The gate change itself lives in
-- Python and is reverted with git, not with SQL:
--
--   scripts/score/rising_star_scoring.py        MIN_COMPONENT_PERCENTILE -> MIN_VELOCITY_DELTA = 3,
--                                               delta predicate restored to fetch_input_signals(),
--                                               gate removed from build_results(),
--                                               vis_window default -> 'recent_2021_2025'
--   scripts/utilities/take_weekly_snapshot.py   THRESHOLD_SOURCES key, gate reconstruction re-armed
--   scripts/score/network_momentum_scoring.py   derive_window_dates() removed
--   frontend/src/pages/MethodologyPage.tsx      gate copy
--
-- AND THE BOARD ITSELF IS NOT REVERTED BY EITHER. hcp_rising_star_ranks_v3 is
-- rewritten in place by the scorer (upsert + de-list delete). Reverting the code
-- and re-running restores the delta>=3 board; running nothing leaves whatever the
-- last scorer run wrote. The pre-change board is preserved independently in
-- hcp_rising_board_snapshots at snapshot_date '2026-08-20' (2,232 pool rows, 251
-- on board, gate inputs captured) -- that capture is the recovery path, because
-- the momentum tables it was derived from are overwritten every cycle.
--
-- DROPPING THE COLUMN DISCARDS DATA written by any capture taken after the
-- migration. Those rows' threshold provenance is not recoverable afterwards.
-- If any post-08-20 capture exists, prefer leaving the column in place: it is
-- additive, nullable, and read by nothing.

BEGIN;

-- Restore the prior comment on the retained column.
COMMENT ON COLUMN hcp_rising_board_snapshots.min_velocity_delta_applied IS NULL;

ALTER TABLE hcp_rising_board_snapshots
  DROP COLUMN IF EXISTS min_component_percentile_applied;

COMMIT;
