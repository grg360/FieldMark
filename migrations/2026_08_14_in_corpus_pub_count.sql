-- ============================================================================
-- hcps_v2.in_corpus_pub_count — the count of publications we actually hold.
-- Date: 2026-08-14   Branch: resurfacing
--
-- NOT YET APPLIED.
--
-- No conflict with the other unapplied migrations on this branch
-- (2026_08_13_trials_surface_global_ranks.sql -> get_nsclc_trials_surface();
--  2026_08_14_profile_spine_board_membership.sql -> hcp_profile_spine();
--  2026_08_14_narrative_prompt_versions.sql -> narrative RPCs + a new table).
-- This one adds a column to hcps_v2 and touches no function. Disjoint objects,
-- so all four are order-independent.
--
-- ── Why a new column instead of fixing the old one ──────────────────────────
-- total_career_pubs holds TWO DIFFERENT QUANTITIES depending on the row:
--
--   * On most rows it is OpenAlex's works_count — the author's CAREER total,
--     counting papers we have never ingested. Verified exact on every decrease
--     sampled 2026-08-14 (Powell 455=455, Zhang 299=299, Rubin 1538=1538,
--     C. Smith 1537=1537, Wang 1464=1464).
--   * On others it is a flat union over author_pub_flat taken on the day the
--     HCP was minted by create_hcps_v2.py:454-482 — an IN-CORPUS count, frozen,
--     and never refreshed for an HCP whose existing shards later gained papers.
--
-- Recomputing the column from the corpus would silently REDEFINE it for the
-- rows currently holding a career total, and would move the >=10 publication
-- ranking gate in scoring_pipeline.py as a side effect. That was scoped, then
-- cancelled, for exactly that reason.
--
-- So the in-corpus quantity gets its own column and its own name, and
-- total_career_pubs is left untouched pending a separate decision about
-- repopulating it from a single source (see PROPOSAL B, parked: 244,263 of
-- 290,480 HCPs have a works_count; 42,646 currently-populated rows would
-- become NULL).
--
-- ── Why NULL and not 0 for the un-staged rows ───────────────────────────────
-- ~43.7k HCPs have no OpenAlex shard or no flattened publications. We have not
-- measured zero publications for them; we have not measured them at all. The
-- backfill leaves those rows NULL and every read path must treat NULL as
-- absence, not as a count of nothing.
--
-- ── Populated by ────────────────────────────────────────────────────────────
-- scripts/enrich/recompute_in_corpus_pub_count.py, wired into ta_cycle.py (was reingest_cycle.py)
-- as stage 8f (after 8c, before 8d/8e). Idempotent: the first run populates
-- from NULL, later runs write only rows whose count actually moved.
--
-- ── Read by ─────────────────────────────────────────────────────────────────
-- Nothing yet. CohortLedger.tsx:1395/1403 is scheduled to swap from
-- total_career_pubs to this column AFTER the backfill has run — swapping first
-- would blank the ledger's count for every HCP.
-- ============================================================================

ALTER TABLE public.hcps_v2
  ADD COLUMN IF NOT EXISTS in_corpus_pub_count integer;

COMMENT ON COLUMN public.hcps_v2.in_corpus_pub_count IS
  'Distinct publications for this HCP present in FieldMark''s ingested corpus '
  '(count(DISTINCT author_pub_flat.pub_id) across the HCP''s OpenAlex shards). '
  'NOT a career total — see total_career_pubs. NULL when the HCP has no shard '
  'or no flattened publications: that is absence, not zero.';
