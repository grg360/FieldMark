-- Migration: create hcp_score_ranks_v2
-- Date: 2026-05-27
-- Purpose: Unified precomputed ranks table for all three score cohorts
--          (rising / established / community) across all scope levels
--          (country / region / global). Enables fast frontend filter queries
--          without runtime aggregation.
--
-- Design notes:
-- - One row per (hcp_id, therapeutic_area_id, cohort, scope_type, scope_value).
-- - scope_value is a country code (e.g. 'US'), a region key (e.g. 'EU5'),
--   or NULL for scope_type='global'.
-- - rank is 1-based within scope. percentile is 0.00-100.00.
-- - scope_size and score_at_rank are denormalized for single-row display reads.
-- - scoring_run_id links to the run that produced the underlying score.
-- - rank_run_id links to the rank computation run (may differ from scoring_run_id
--   when ranks are recomputed independently of scoring, e.g. after a regions
--   taxonomy change).

BEGIN;

CREATE TABLE IF NOT EXISTS hcp_score_ranks_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id) ON DELETE CASCADE,
  cohort TEXT NOT NULL CHECK (cohort IN ('rising', 'established', 'community')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('country', 'region', 'global')),
  scope_value TEXT,  -- country code, region key, or NULL for global
  rank INTEGER NOT NULL CHECK (rank >= 1),
  percentile NUMERIC(5,2) NOT NULL CHECK (percentile >= 0 AND percentile <= 100),
  scope_size INTEGER NOT NULL CHECK (scope_size >= 1),
  score_at_rank NUMERIC NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scoring_run_id UUID,
  rank_run_id UUID NOT NULL,
  
  -- One rank per HCP per TA per cohort per scope. The NULLS NOT DISTINCT
  -- clause ensures global rows (where scope_value IS NULL) are deduplicated
  -- correctly. Requires Postgres 15+.
  CONSTRAINT hcp_score_ranks_v2_unique
    UNIQUE NULLS NOT DISTINCT (hcp_id, therapeutic_area_id, cohort, scope_type, scope_value),
  
  -- Global rows must have NULL scope_value; non-global rows must have a value
  CONSTRAINT hcp_score_ranks_v2_scope_consistency CHECK (
    (scope_type = 'global' AND scope_value IS NULL)
    OR (scope_type IN ('country', 'region') AND scope_value IS NOT NULL)
  )
);

-- Primary query path: "top N in this TA + cohort + scope, ordered by rank"
CREATE INDEX IF NOT EXISTS idx_hcp_score_ranks_v2_query
  ON hcp_score_ranks_v2 (therapeutic_area_id, cohort, scope_type, scope_value, rank);

-- Reverse lookup: "all ranks for this HCP across cohorts and scopes"
CREATE INDEX IF NOT EXISTS idx_hcp_score_ranks_v2_hcp
  ON hcp_score_ranks_v2 (hcp_id, therapeutic_area_id);

-- Rank-run lineage: "all ranks from this rank computation run"
CREATE INDEX IF NOT EXISTS idx_hcp_score_ranks_v2_rank_run
  ON hcp_score_ranks_v2 (rank_run_id);

-- Add a comment for self-documentation
COMMENT ON TABLE hcp_score_ranks_v2 IS
  'Precomputed ranks for HCP scores across cohorts (rising/established/community) and scopes (country/region/global). Refreshed on every scoring run. See migrations/2026-05-27_create_hcp_score_ranks_v2.sql.';

COMMIT;

-- Verification
SELECT
  tablename,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'hcp_score_ranks_v2') AS column_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'hcp_score_ranks_v2') AS index_count
FROM pg_tables
WHERE tablename = 'hcp_score_ranks_v2';
