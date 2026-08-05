-- Narrative provenance stamp (2026-08-05).
--
-- WHY: narratives are generated from hcp_scientific_momentum_v1 /
-- hcp_rising_star_ranks_v3 rows that are OVERWRITTEN IN PLACE on every scoring
-- recompute. The staleness audit (docs/design + 2026-08-05 session) showed 96.7%
-- of narratives quoted a snapshot that no longer exists, with no way to tell
-- which snapshot a narrative read. This column records it.
--
-- source_enrichment_run_id = hcp_scientific_momentum_v1.enrichment_run_id at
-- generation time (rising cohort). NULL for cohorts whose source tables carry
-- no run id (established ranks v3 has none — a known gap), and for all rows
-- generated before this migration.
--
-- A narrative is STALE exactly when its source_enrichment_run_id differs from
-- the current momentum row's enrichment_run_id for the same hcp/TA.

ALTER TABLE public.hcp_narratives_v2
  ADD COLUMN IF NOT EXISTS source_enrichment_run_id uuid;

COMMENT ON COLUMN public.hcp_narratives_v2.source_enrichment_run_id IS
  'enrichment_run_id of the hcp_scientific_momentum_v1 row this narrative was generated from; NULL = pre-stamp narrative or cohort without a run id. Stale when != the current momentum row''s enrichment_run_id.';
