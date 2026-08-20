-- REVERT ARTIFACT for regions.aggregate_scope. 2026-08-18. Branch: resurfacing.
-- Covers: migrations/2026_08_18_regions_aggregate_scope.sql
--
-- PRE-CHANGE STATE, verified on the live database before the migration was written:
-- the column DID NOT EXIST on public.regions (information_schema returned 0 rows for
-- column_name='aggregate_scope'). There is therefore no prior value to restore -- the
-- revert is a DROP, and it is complete.
--
-- ORDER MATTERS. Drop this column LAST, after the readers are gone:
--   1. frontend (git)  -- the tree stops asking for it
--   2. ledger_regions()             sql/revert/2026_08_18_ledger_regions_rpc_REVERT.sql
--   3. established_ledger / rising_ledger  (their own revert artifacts)
--   4. recompute_established_ranks_v3.py (git)
--   5. THIS FILE
-- Dropping it first makes every reader fail at once: the two ledger RPCs reference
-- regions.aggregate_scope in their WHERE clauses and would raise UndefinedColumn on
-- every ledger page load, not just on aggregate selections.
--
-- THE APAC ROWS ARE NOT REMOVED HERE. This file drops the flag, not the boards it
-- authorised. To remove the scored bucket as well:
--   DELETE FROM hcp_established_ranks_v3 WHERE scope_type='region' AND scope_value='APAC';
-- left commented below deliberately -- deleting 8,771 scored rows is a separate,
-- explicit decision from unwinding a schema column.

BEGIN;

ALTER TABLE public.regions DROP COLUMN IF EXISTS aggregate_scope;

-- DELETE FROM public.hcp_established_ranks_v3
--  WHERE scope_type = 'region' AND scope_value = 'APAC';

COMMIT;
