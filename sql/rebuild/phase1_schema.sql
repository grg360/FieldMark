-- ============================================================================
-- FieldMark Foundation Rebuild - Phase 1: Schema Creation
-- Date: 2026-05-21
-- Creates _v2 tables alongside existing tables (strangler-fig pattern)
-- ============================================================================

-- 1. hcps_v2: Canonical HCP records
CREATE TABLE IF NOT EXISTS hcps_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_hash TEXT UNIQUE NOT NULL,
  npi_number TEXT UNIQUE,
  orcid TEXT UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  name_suffix TEXT,
  preferred_display_name TEXT,
  institution_normalized TEXT,
  institution_raw TEXT,
  institution_secondary TEXT,
  institution_history JSONB,
  country TEXT NOT NULL DEFAULT 'USA',
  career_first_pub_year INTEGER,
  total_career_pubs INTEGER,
  latest_pub_year INTEGER,
  career_age_years INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN latest_pub_year IS NOT NULL AND career_first_pub_year IS NOT NULL 
      THEN latest_pub_year - career_first_pub_year + 1
      ELSE NULL
    END
  ) STORED,
  identity_confidence_score NUMERIC,
  identity_method TEXT,
  quality_flags TEXT[] DEFAULT ARRAY[]::TEXT[],
  cohort_classification TEXT,
  cohort_score NUMERIC,
  is_verified_dol BOOLEAN DEFAULT false,
  verified_dol_at TIMESTAMPTZ,
  npi_specialty TEXT,
  nppes_practice_city TEXT,
  nppes_practice_state TEXT,
  nppes_practice_setting TEXT,
  nppes_career_stage_years INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ingestion_run_id UUID
);

CREATE INDEX IF NOT EXISTS idx_hcps_v2_npi ON hcps_v2(npi_number) WHERE npi_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hcps_v2_orcid ON hcps_v2(orcid) WHERE orcid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hcps_v2_country ON hcps_v2(country);
CREATE INDEX IF NOT EXISTS idx_hcps_v2_is_verified_dol ON hcps_v2(is_verified_dol) WHERE is_verified_dol = true;
CREATE INDEX IF NOT EXISTS idx_hcps_v2_cohort ON hcps_v2(cohort_classification) WHERE cohort_classification IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hcps_v2_last_name ON hcps_v2(LOWER(last_name));

-- 2. publications_v2
CREATE TABLE IF NOT EXISTS publications_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  pmid TEXT,
  doi TEXT,
  openalex_work_id TEXT,
  title TEXT,
  pub_year INTEGER NOT NULL,
  journal TEXT,
  abstract TEXT,
  author_position TEXT,
  is_first_author BOOLEAN,
  is_senior_author BOOLEAN,
  total_authors INTEGER,
  citation_count INTEGER,
  source TEXT NOT NULL,
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publications_v2_hcp_year ON publications_v2(hcp_id, pub_year);
CREATE INDEX IF NOT EXISTS idx_publications_v2_year ON publications_v2(pub_year);
CREATE INDEX IF NOT EXISTS idx_publications_v2_pmid ON publications_v2(pmid) WHERE pmid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_publications_v2_doi ON publications_v2(doi) WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_publications_v2_hcp_pmid_unique 
  ON publications_v2(hcp_id, pmid) WHERE pmid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_publications_v2_hcp_doi_unique 
  ON publications_v2(hcp_id, doi) WHERE doi IS NOT NULL;

-- 3. hcp_therapeutic_areas_v2: Strict TA tagging (≥3 publication threshold)
CREATE TABLE IF NOT EXISTS hcp_therapeutic_areas_v2 (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  publication_count INTEGER NOT NULL DEFAULT 0,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hcp_id, therapeutic_area_id),
  CHECK (publication_count >= 3)
);

CREATE INDEX IF NOT EXISTS idx_hcp_ta_v2_ta_id ON hcp_therapeutic_areas_v2(therapeutic_area_id);

-- 4. hcp_openalex_authors_v2: Multi-shard linkage
CREATE TABLE IF NOT EXISTS hcp_openalex_authors_v2 (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  openalex_author_id TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  match_confidence NUMERIC NOT NULL,
  match_method TEXT NOT NULL,
  first_seen_pub_year INTEGER,
  last_seen_pub_year INTEGER,
  corpus_pub_count INTEGER,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hcp_id, openalex_author_id)
);

CREATE INDEX IF NOT EXISTS idx_hcp_openalex_v2_primary ON hcp_openalex_authors_v2(hcp_id) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_hcp_openalex_v2_author_id ON hcp_openalex_authors_v2(openalex_author_id);

-- 5. hcp_scores_v2
CREATE TABLE IF NOT EXISTS hcp_scores_v2 (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  composite_score NUMERIC,
  normalized_score NUMERIC,
  pub_velocity_score NUMERIC,
  citation_trajectory_score NUMERIC,
  trial_investigator_score NUMERIC,
  career_age_multiplier NUMERIC,
  tier TEXT,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  scoring_run_id UUID,
  PRIMARY KEY (hcp_id, therapeutic_area_id)
);

CREATE INDEX IF NOT EXISTS idx_hcp_scores_v2_ta_score ON hcp_scores_v2(therapeutic_area_id, normalized_score DESC);

-- 6. hcp_narratives_v2
CREATE TABLE IF NOT EXISTS hcp_narratives_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_slug TEXT NOT NULL,
  narrative_text TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model_used TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (hcp_id, therapeutic_area_slug)
);

CREATE INDEX IF NOT EXISTS idx_hcp_narratives_v2_hcp ON hcp_narratives_v2(hcp_id);

-- 7. trial_investigators_v2
CREATE TABLE IF NOT EXISTS trial_investigators_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  trial_id UUID,
  nct_number TEXT NOT NULL,
  role TEXT,
  phase TEXT,
  status TEXT,
  match_method TEXT,
  match_confidence NUMERIC,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hcp_id, nct_number)
);

CREATE INDEX IF NOT EXISTS idx_trial_investigators_v2_hcp ON trial_investigators_v2(hcp_id);
CREATE INDEX IF NOT EXISTS idx_trial_investigators_v2_nct ON trial_investigators_v2(nct_number);

-- 8. pipeline_runs
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  rows_processed INTEGER DEFAULT 0,
  rows_succeeded INTEGER DEFAULT 0,
  rows_flagged INTEGER DEFAULT 0,
  rows_failed INTEGER DEFAULT 0,
  metrics JSONB,
  error_message TEXT,
  triggered_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_name_started ON pipeline_runs(pipeline_name, started_at DESC);

-- 9. dol_canonical_overrides
CREATE TABLE IF NOT EXISTS dol_canonical_overrides (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  social_user_id UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  PRIMARY KEY (hcp_id, social_user_id)
);

-- 10. tracked_conferences
CREATE TABLE IF NOT EXISTS tracked_conferences (
  slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  hashtag_patterns TEXT[] NOT NULL,
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tracked_conferences (slug, display_name, hashtag_patterns, start_date, end_date, active)
VALUES
  ('asco', 'ASCO', ARRAY['#asco', '#asco26', '#asco2026'], '2026-05-29', '2026-06-02', true),
  ('easl', 'EASL', ARRAY['#easl', '#easl26', '#easl2026'], '2026-06-17', '2026-06-20', true),
  ('esmo', 'ESMO', ARRAY['#esmo', '#esmo26', '#esmo2026'], '2026-09-19', '2026-09-23', true),
  ('aasld', 'AASLD', ARRAY['#aasld', '#aasld26', '#aasld2026'], '2026-11-13', '2026-11-17', true)
ON CONFLICT (slug) DO NOTHING;