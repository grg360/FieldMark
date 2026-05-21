-- ============================================================================
-- Phase 1 Addendum 6: clinical_trials_v2 + trial_investigators_v2 correction
-- Date: 2026-05-21
--
-- The initial trial_investigators_v2 schema was wrong - missing raw_* fields
-- needed by trials_pipeline.py. Dropping and recreating with correct shape.
-- Also creating clinical_trials_v2 (missed in Phase 1).
-- ============================================================================

DROP TABLE IF EXISTS trial_investigators_v2 CASCADE;

CREATE TABLE clinical_trials_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nct_id TEXT UNIQUE NOT NULL,
  title TEXT,
  phase TEXT,
  status TEXT,
  sponsor TEXT,
  lead_sponsor_class TEXT,
  study_type TEXT,
  responsible_party_type TEXT,
  start_date DATE,
  completion_date DATE,
  collaborators JSONB,
  conditions TEXT[],
  interventions JSONB,
  source TEXT NOT NULL DEFAULT 'clinicaltrials_gov_v2',
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clinical_trials_v2_nct ON clinical_trials_v2(nct_id);
CREATE INDEX idx_clinical_trials_v2_phase ON clinical_trials_v2(phase);
CREATE INDEX idx_clinical_trials_v2_status ON clinical_trials_v2(status);
CREATE INDEX idx_clinical_trials_v2_sponsor_class ON clinical_trials_v2(lead_sponsor_class);

ALTER TABLE clinical_trials_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinical_trials_v2_public_read" ON clinical_trials_v2 FOR SELECT USING (true);

CREATE TABLE trial_investigators_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID REFERENCES hcps_v2(id) ON DELETE SET NULL,
  trial_id UUID NOT NULL REFERENCES clinical_trials_v2(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  investigator_name TEXT,
  investigator_raw_first_name TEXT,
  investigator_raw_last_name TEXT,
  investigator_raw_affiliation TEXT,
  investigator_raw_facility TEXT,
  investigator_raw_city TEXT,
  investigator_raw_state TEXT,
  investigator_raw_country TEXT,
  match_confidence INTEGER,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trial_investigators_v2_hcp ON trial_investigators_v2(hcp_id) WHERE hcp_id IS NOT NULL;
CREATE INDEX idx_trial_investigators_v2_trial ON trial_investigators_v2(trial_id);
CREATE INDEX idx_trial_investigators_v2_role ON trial_investigators_v2(role);
CREATE INDEX idx_trial_investigators_v2_confidence 
  ON trial_investigators_v2(match_confidence) WHERE match_confidence IS NOT NULL;

ALTER TABLE trial_investigators_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trial_investigators_v2_public_read" ON trial_investigators_v2 FOR SELECT USING (true);