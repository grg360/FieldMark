-- ============================================================================
-- Phase 1 Addendum 12: hcp_publication_leadership_v2
-- Date: 2026-07-08 (canonical DDL generated from live schema — the table was
--   originally created ad-hoc with no committed DDL; this backfills it so the
--   table is reproducible for future TA builds / a rebuild.)
--
-- Scientific Authority subscore, per (hcp_id, therapeutic_area_id).
-- Populated by scripts/score/publication_leadership_scoring.py.
--
-- IMPORTANT: percentile_rank is DOUBLE PRECISION, not integer. An integer
-- column silently rounds the continuous percentile, tying the entire top ~1%
-- of KOLs at 100 and collapsing scientific discrimination in the composite
-- (cost hours to diagnose 2026-07-08 — see TA_BUILD_DEBT §29am/§29an). Keep it
-- double precision, and keep the percentile formula continuous in the scorer.
--
-- Run via:
--   python scripts/utilities/run_sql.py --file sql/rebuild/phase1_addendum_12_publication_leadership_v2.sql
-- ============================================================================
CREATE TABLE IF NOT EXISTS hcp_publication_leadership_v2 (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hcp_id uuid NOT NULL,
  therapeutic_area_id uuid,
  senior_pub_count integer,
  senior_pub_total_citations integer,
  senior_pub_recent_5yr integer,
  first_pub_count integer,
  first_pub_total_citations integer,
  guideline_pub_count integer,
  guideline_pub_senior integer,
  guideline_pub_first integer,
  editorial_senior_count integer,
  review_senior_count integer,
  raw_score numeric,
  normalized_score numeric,
  percentile_rank double precision,   -- MUST be double precision (see header note)
  computed_at timestamptz,
  CONSTRAINT hcp_publication_leadership_v2_pkey PRIMARY KEY (id),
  CONSTRAINT hcp_publication_leadership_v2_hcp_id_therapeutic_area_id_key
    UNIQUE (hcp_id, therapeutic_area_id)   -- the scorer's ON CONFLICT target
);

CREATE INDEX IF NOT EXISTS idx_hcp_pub_leadership_hcp
  ON hcp_publication_leadership_v2 USING btree (hcp_id);
CREATE INDEX IF NOT EXISTS idx_hcp_pub_leadership_ta
  ON hcp_publication_leadership_v2 USING btree (therapeutic_area_id, normalized_score DESC);
CREATE INDEX IF NOT EXISTS idx_hcp_pub_leadership_percentile
  ON hcp_publication_leadership_v2 USING btree (therapeutic_area_id, percentile_rank DESC);

-- Grants + schema reload (required for API/script access).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hcp_publication_leadership_v2 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hcp_publication_leadership_v2 TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
