-- ============================================================
-- FieldMark v2 — Phase 1 Addendum 9: hcp_therapeutic_areas_v2 publication_count constraint
-- ============================================================
-- Date applied: 2026-05-23
-- Branch: foundation-rebuild
--
-- Purpose:
-- Relax the CHECK constraint on hcp_therapeutic_areas_v2.publication_count
-- from `publication_count >= 3` to `publication_count >= 0`.
--
-- Context:
-- Discovered during Workstream B (community HCP) ingestion. The original
-- constraint `publication_count >= 3` was designed for publication-evidence
-- TA tagging where the threshold filtered out HCPs with marginal evidence.
--
-- However, community HCPs ingested via NPPES taxonomy + Open Payments NPI
-- filter legitimately have publication_count = 0. They were identified by
-- specialty taxonomy AND hepatology-drug payments, not by publication
-- evidence. The constraint blocked their TA assignment, causing all 439
-- attempted TA inserts to fail with constraint violation (Error 23514).
--
-- Decision: replace `>= 3` with `>= 0`. The non-negative integer semantic
-- is preserved (integer type alone permits negatives). The "3+ publications"
-- threshold becomes a query-time filter rather than a write-time gate,
-- allowing different evidence sources to populate this table.
--
-- Migration approach:
-- This addendum was applied interactively via the Supabase SQL editor
-- during the Workstream B ingestion failure recovery. The 438 community
-- HCPs that had been inserted in hcps_v2 had their TA rows backfilled
-- via separate INSERT statement.
--
-- For schema rebuild from scratch (replaying all addenda), this file
-- ensures the constraint is set correctly from the start so that
-- Workstream B can succeed on first execution.
-- ============================================================


-- ============================================================
-- Section 1: Drop the strict publication_count constraint
-- ============================================================
ALTER TABLE hcp_therapeutic_areas_v2
  DROP CONSTRAINT hcp_therapeutic_areas_v2_publication_count_check;


-- ============================================================
-- Section 2: Add the relaxed publication_count constraint
-- ============================================================
ALTER TABLE hcp_therapeutic_areas_v2
  ADD CONSTRAINT hcp_therapeutic_areas_v2_publication_count_check
  CHECK (publication_count >= 0);


-- ============================================================
-- Section 3: Verification
-- ============================================================
-- Expected result after running:
--   constraint_definition = 'CHECK ((publication_count >= 0))'
--
-- SELECT
--   conname,
--   pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = 'hcp_therapeutic_areas_v2'::regclass
--   AND contype = 'c';


-- ============================================================
-- End-of-migration state
-- ============================================================
-- v2 table count unchanged at 23.
-- hcp_therapeutic_areas_v2 schema: column count unchanged at 4.
-- Only the publication_count CHECK threshold changed (3 -> 0).
