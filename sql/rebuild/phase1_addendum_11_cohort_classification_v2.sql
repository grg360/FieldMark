-- ============================================================================
-- Phase 1 Addendum 11: hcp_cohort_classification_v2
-- Date: 2026-07-07
--
-- Per-(hcp_id, therapeutic_area_id) career-structure cohort assignment.
-- Populated by scripts/classify/cohort_classification_v2.py.
-- Does NOT store normalized_score; rising sub-tiers are assigned later.
--
-- Run via:
--   python scripts/utilities/run_sql.py --file sql/rebuild/phase1_addendum_11_cohort_classification_v2.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS hcp_cohort_classification_v2 (
  hcp_id uuid NOT NULL,
  therapeutic_area_id uuid NOT NULL,
  cohort text NOT NULL,
  cohort_reason text NOT NULL,
  career_first_pub_year_v2 int,
  total_career_pubs int,
  career_age int,
  tier_inputs jsonb NOT NULL,
  threshold_version text NOT NULL,
  classified_at timestamptz NOT NULL,
  classification_run_id uuid NOT NULL,
  PRIMARY KEY (hcp_id, therapeutic_area_id)
);

CREATE INDEX IF NOT EXISTS idx_hcp_cohort_classification_v2_ta_cohort
  ON hcp_cohort_classification_v2 (therapeutic_area_id, cohort);

CREATE INDEX IF NOT EXISTS idx_hcp_cohort_classification_v2_cohort
  ON hcp_cohort_classification_v2 (cohort);

-- Grants + schema reload (required for API/script access; added 2026-07-08).
-- Without these, the classifier's upsert fails with 'permission denied' (code 42501).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hcp_cohort_classification_v2 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hcp_cohort_classification_v2 TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
