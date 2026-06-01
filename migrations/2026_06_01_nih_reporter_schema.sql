/* Migration: NIH RePORTER grant data schema
   Date: 2026-06-01
   Purpose: Store NIH grants, matched investigators, unmatched researchers, and merge candidates.
   Pipeline writes here only; does not touch hcps_v2 directly except via FK references.
   Editor note: use /* */ comments only; avoid -- line comments in Supabase SQL editor. */

/* --------------------------------------------------------------------------
   1. nih_grants
   -------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.nih_grants (
  core_project_num TEXT PRIMARY KEY,
  appl_id BIGINT,
  project_title TEXT,
  abstract_text TEXT,
  public_health_relevance TEXT,
  fiscal_year INTEGER,
  project_start_date DATE,
  project_end_date DATE,
  award_notice_date DATE,
  total_cost NUMERIC,
  direct_cost_amt NUMERIC,
  indirect_cost_amt NUMERIC,
  activity_code TEXT,
  administering_ic TEXT,
  funding_mechanism TEXT,
  study_section TEXT,
  org_name TEXT,
  org_city TEXT,
  org_state TEXT,
  org_country TEXT,
  org_duns TEXT,
  is_active BOOLEAN,
  is_new BOOLEAN,
  subproject_id TEXT,
  parent_project_num TEXT,
  agency_code TEXT,
  spending_categories JSONB,
  pref_terms TEXT,
  raw_payload JSONB,
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

/* raw_payload: full NIH API response. parent_project_num: self-FK to parent P30/U54/etc. */
CREATE INDEX IF NOT EXISTS idx_nih_grants_fiscal_year ON public.nih_grants(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_nih_grants_activity_code ON public.nih_grants(activity_code);
CREATE INDEX IF NOT EXISTS idx_nih_grants_parent ON public.nih_grants(parent_project_num) WHERE parent_project_num IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nih_grants_org_name ON public.nih_grants(org_name);
CREATE INDEX IF NOT EXISTS idx_nih_grants_is_active ON public.nih_grants(is_active) WHERE is_active = true;

/* --------------------------------------------------------------------------
   2. nih_grant_investigators
   -------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.nih_grant_investigators (
  core_project_num TEXT NOT NULL REFERENCES public.nih_grants(core_project_num) ON DELETE CASCADE,
  hcp_id UUID NOT NULL REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('pi', 'co_pi', 'multi_pi', 'other')),
  match_confidence TEXT NOT NULL CHECK (match_confidence IN ('high', 'medium', 'review_pending')),
  match_method TEXT NOT NULL,
  raw_nih_name TEXT NOT NULL,
  raw_nih_institution TEXT,
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (core_project_num, hcp_id, role)
);

/* raw_nih_name / raw_nih_institution preserve NIH-returned values for audit. */
CREATE INDEX IF NOT EXISTS idx_nih_investigators_hcp ON public.nih_grant_investigators(hcp_id);
CREATE INDEX IF NOT EXISTS idx_nih_investigators_confidence ON public.nih_grant_investigators(match_confidence);

/* --------------------------------------------------------------------------
   3. nih_unmatched_researchers
   -------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.nih_unmatched_researchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_project_num TEXT NOT NULL REFERENCES public.nih_grants(core_project_num) ON DELETE CASCADE,
  raw_nih_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  raw_nih_institution TEXT,
  role TEXT NOT NULL CHECK (role IN ('pi', 'co_pi', 'multi_pi', 'other')),
  unmatched_reason TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nih_unmatched_normalized_name ON public.nih_unmatched_researchers(normalized_name);
CREATE INDEX IF NOT EXISTS idx_nih_unmatched_institution ON public.nih_unmatched_researchers(raw_nih_institution);

/* --------------------------------------------------------------------------
   4. nih_merge_candidates
   Dedup byproduct: pairs of hcps_v2 records NIH matching suggests are the same person.
   -------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.nih_merge_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id_a UUID NOT NULL REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  hcp_id_b UUID NOT NULL REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  evidence_core_project_num TEXT NOT NULL REFERENCES public.nih_grants(core_project_num) ON DELETE CASCADE,
  raw_nih_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  shared_institution TEXT,
  confidence_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'confirmed_merge', 'confirmed_distinct', 'merged')),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CHECK (hcp_id_a < hcp_id_b)
);

/* CHECK (hcp_id_a < hcp_id_b) prevents duplicate (A,B) and (B,A) pairs. */
CREATE INDEX IF NOT EXISTS idx_nih_merge_status ON public.nih_merge_candidates(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nih_merge_unique_pair ON public.nih_merge_candidates(hcp_id_a, hcp_id_b);

/* --------------------------------------------------------------------------
   Row Level Security
   -------------------------------------------------------------------------- */

ALTER TABLE public.nih_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nih_grants_public_read" ON public.nih_grants FOR SELECT USING (true);

ALTER TABLE public.nih_grant_investigators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nih_grant_investigators_public_read" ON public.nih_grant_investigators FOR SELECT USING (true);

ALTER TABLE public.nih_unmatched_researchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nih_unmatched_researchers_public_read" ON public.nih_unmatched_researchers FOR SELECT USING (true);

ALTER TABLE public.nih_merge_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nih_merge_candidates_public_read" ON public.nih_merge_candidates FOR SELECT USING (true);

/* --------------------------------------------------------------------------
   Grants
   -------------------------------------------------------------------------- */

GRANT SELECT ON public.nih_grants TO anon, authenticated;
GRANT SELECT ON public.nih_grant_investigators TO anon, authenticated;
GRANT SELECT ON public.nih_unmatched_researchers TO anon, authenticated;
GRANT SELECT ON public.nih_merge_candidates TO anon, authenticated;

GRANT ALL ON public.nih_grants TO service_role;
GRANT ALL ON public.nih_grant_investigators TO service_role;
GRANT ALL ON public.nih_unmatched_researchers TO service_role;
GRANT ALL ON public.nih_merge_candidates TO service_role;
