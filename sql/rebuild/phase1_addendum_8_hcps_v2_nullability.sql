-- ============================================================
-- FieldMark v2 — Phase 1 Addendum 8: hcps_v2 nullability fix
-- ============================================================
-- Date applied: 2026-05-22
-- Branch: foundation-rebuild
--
-- Purpose:
-- Drop NOT NULL constraints on hcps_v2.country and hcps_v2.first_name.
--
-- Context:
-- Discovered during the first attempted real Step C run on 2026-05-22.
-- The script writes hcps_v2 rows with null country when ROR->country
-- lookup returns no mapping (~8% of HCPs based on dry-run distribution
-- analysis), and writes hcps_v2 rows with null first_name when the
-- OpenAlex display_name is single-token (e.g., "Almazov" with no
-- given name). Both are legitimate data states.
--
-- The first run failed with PostgreSQL error 23502 on all batch
-- inserts that contained a single null-country row. The row-by-row
-- fallback correctly persisted only the non-null-country rows
-- (752 HCPs landed), but the bulk of clusters could not be inserted.
--
-- Decision: drop the NOT NULL constraints rather than synthesize
-- magic values ("Unknown" country, "" first_name). Data should
-- represent reality; downstream queries should handle nulls.
--
-- last_name remains NOT NULL because the Step C script defends
-- against missing last_name by forcing "Unknown" as a sentinel.
-- Defensive script + defensive schema is the right pairing for
-- last_name; not for country or first_name.
--
-- Migration approach:
-- This addendum captures the ALTER statements that were applied
-- interactively via the Supabase SQL editor during the failed-Step-C
-- diagnosis. After applying, the 752 partial rows were deleted and
-- Step C was re-run cleanly to produce 229,252 hcps_v2 rows.
--
-- For schema rebuild from scratch (replaying all addenda), this
-- file ensures the NOT NULL constraints are dropped before any
-- Step C attempt against fresh hcps_v2.
-- ============================================================


-- ============================================================
-- Section 1: Drop NOT NULL constraints
-- ============================================================
-- country: ~8% of HCPs have no resolvable country from ROR mapping.
-- first_name: single-token OpenAlex display names produce null first_name.
ALTER TABLE hcps_v2
  ALTER COLUMN country DROP NOT NULL,
  ALTER COLUMN first_name DROP NOT NULL;


-- ============================================================
-- Section 2: Verification
-- ============================================================
-- Verify the constraint changes took effect.
-- Expected result after running:
--   country     | YES
--   first_name  | YES
--   last_name   | NO  (intentionally unchanged)
--
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public'
--   AND table_name='hcps_v2'
--   AND column_name IN ('country', 'first_name', 'last_name')
-- ORDER BY column_name;


-- ============================================================
-- End-of-migration state
-- ============================================================
-- v2 table count unchanged at 23.
-- hcps_v2 schema: column count unchanged at 36.
-- Only nullability of country and first_name changed.
