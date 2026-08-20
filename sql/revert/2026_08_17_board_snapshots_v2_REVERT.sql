-- REVERT ARTIFACT for migrations/2026_08_17_board_snapshots_v2.sql
-- Date: 2026-08-17
--
-- The migration is PURELY ADDITIVE: it creates two new tables and one new view,
-- and reads (never writes) hcp_rising_star_snapshots / hcp_established_snapshots
-- / hcps_v2 / therapeutic_areas. Nothing existing is altered or dropped, so the
-- revert is a clean drop of what was created.
--
-- WHAT THIS DESTROYS: every captured snapshot in the two new tables, including
-- any real captures taken after the migration was applied. The gating variables
-- CANNOT be regenerated -- hcp_scientific_momentum_v1 and
-- hcp_network_momentum_v1 are overwritten in place on every scoring cycle, so a
-- dropped capture is gone permanently, not recomputable.
--
-- Before running this, export anything already captured:
--   \copy (SELECT * FROM public.hcp_rising_board_snapshots)      TO 'rising_board_snapshots.csv'      CSV HEADER
--   \copy (SELECT * FROM public.hcp_established_board_snapshots) TO 'established_board_snapshots.csv' CSV HEADER
--
-- The legacy backfill rows (source='legacy') ARE reproducible -- they derive
-- from hcp_rising_star_snapshots / hcp_established_snapshots, which this file
-- does not touch. Only source='capture' rows are unrecoverable.

BEGIN;

DROP VIEW  IF EXISTS public.hcp_board_movement_v1;
DROP TABLE IF EXISTS public.hcp_established_board_snapshots;
DROP TABLE IF EXISTS public.hcp_rising_board_snapshots;

COMMIT;
