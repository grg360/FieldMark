-- REVERT ARTIFACT for ledger_regions(). 2026-08-18. Branch: resurfacing.
-- Covers: migrations/2026_08_18_ledger_regions_rpc.sql
--
-- PRE-CHANGE STATE, verified on the live database before the migration was written:
-- NO FUNCTION public.ledger_regions EXISTED (pg_proc returned 0 rows for that name in
-- the public schema). The revert is therefore a DROP, and it is complete -- there is
-- no prior definition to restore.
--
-- DROP also removes the grants made in the migration; they do not need unwinding
-- separately.
--
-- CONSUMER NOTE: revert the FRONTEND FIRST (git). The territory tree calls this RPC
-- to build its region nodes. With the function dropped and the new tree still shipped,
-- the call 404s and the menu falls back to whatever the loader's error path returns --
-- verify that path renders the US and Global nodes rather than an empty menu before
-- relying on this ordering.
--
-- DATA: none. Read-only function over reference tables; it writes nothing.

BEGIN;

DROP FUNCTION IF EXISTS public.ledger_regions();

COMMIT;
