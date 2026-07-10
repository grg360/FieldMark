-- ============================================================================
-- 2026_07_10_dedupe_ad_established_ranks_v3_global.sql
-- Remove duplicate global-scope rows in hcp_established_ranks_v3 for Atopic
-- Dermatitis, and harden the unique constraint so it can't recur.
--
-- ROOT CAUSE
--   The table's unique constraint
--     hcp_established_ranks_v3_hcp_id_therapeutic_area_id_scope_t_key
--     = UNIQUE (hcp_id, therapeutic_area_id, scope_type, scope_value)
--   uses default NULLS DISTINCT semantics. Global-scope rows have
--   scope_value = NULL, so under NULLS DISTINCT they never collide. The
--   recompute script (recompute_established_ranks_v3.py) upserts via
--   INSERT ... ON CONFLICT (hcp_id, therapeutic_area_id, scope_type, scope_value)
--   DO UPDATE — but the ON CONFLICT can't match NULL scope_value rows, so every
--   re-run INSERTs a fresh global row instead of updating. AD's recompute ran
--   twice on 2026-07-08 (15:46:57 partial global run, then 18:16:34 full run),
--   leaving 2,546 global HCPs with two rows each. Region rows (non-null
--   scope_value) upsert correctly and are unaffected; NSCLC/other TAs ran once
--   and never re-triggered the escape, so this is AD-global-only.
--
-- WHAT THIS DOES (atomic transaction)
--   1. Delete the 2,546 rows from the 15:46:57 partial run (AD, global scope).
--      Keeps the complete 18:16:34 generation. Verified: every deleted row has a
--      surviving 18:16:34 twin (0 orphans); the 18:16:34 set has 0 internal dups.
--   2. Swap the unique constraint to NULLS NOT DISTINCT so global (NULL
--      scope_value) rows collide going forward. This ALSO makes the recompute's
--      existing ON CONFLICT ... DO UPDATE work for global rows — no script change
--      needed. Requires Postgres 15+ (this DB is 17.6).
--
-- HOW TO RUN
--   Paste the whole block into the Supabase SQL editor and run it. It is one
--   transaction: confirm the DELETE reports "DELETE 2546" before it commits. If
--   the count is anything other than 2546, do NOT proceed — investigate first.
--
-- EXPECTED RESULT
--   AD global rows: 5,131 -> 2,585 (2,585 distinct HCPs, one row each).
-- ============================================================================

BEGIN;

-- 1. Remove the leftover partial-run (15:46:57) global rows for AD.
--    Must report exactly: DELETE 2546
DELETE FROM hcp_established_ranks_v3
WHERE therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
  AND scope_type = 'global'
  AND computed_at = '2026-07-08 15:46:57.287626+00';

-- 2. Harden the unique constraint: NULL scope_values must now collide.
ALTER TABLE hcp_established_ranks_v3
  DROP CONSTRAINT hcp_established_ranks_v3_hcp_id_therapeutic_area_id_scope_t_key;

ALTER TABLE hcp_established_ranks_v3
  ADD CONSTRAINT hcp_established_ranks_v3_hcp_ta_scope_uq
  UNIQUE NULLS NOT DISTINCT (hcp_id, therapeutic_area_id, scope_type, scope_value);

COMMIT;

-- ============================================================================
-- POST-RUN VERIFICATION (run after COMMIT)
--
--   -- (a) No duplicate groups remain anywhere in the table (expect 0 rows):
--   SELECT therapeutic_area_id, hcp_id, scope_type, scope_value, count(*)
--   FROM hcp_established_ranks_v3
--   GROUP BY 1,2,3,4 HAVING count(*) > 1;
--
--   -- (b) AD global is deduped (expect rows = distinct_hcps = 2585):
--   SELECT count(*) AS rows, count(DISTINCT hcp_id) AS distinct_hcps
--   FROM hcp_established_ranks_v3
--   WHERE therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
--     AND scope_type = 'global';
--
--   -- (c) The NULLS NOT DISTINCT constraint exists:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.hcp_established_ranks_v3'::regclass AND contype = 'u';
--
--   -- (d) Recurrence check: re-run the recompute twice (dry-run first) and
--   --     confirm query (a) still returns 0 rows:
--   --     python scripts/score/recompute_established_ranks_v3.py --ta atopic-dermatitis --dry-run
--   --     python scripts/score/recompute_established_ranks_v3.py --ta atopic-dermatitis
-- ============================================================================
