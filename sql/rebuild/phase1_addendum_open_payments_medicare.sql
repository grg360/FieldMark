-- ============================================================================
-- FieldMark Foundation Rebuild - Phase 1 Addendum
-- Date: 2026-05-21
-- Adds hcp_open_payments_summary_v2 and hcp_medicare_summary_v2 tables
-- These were missed in initial Phase 1; added after data inventory review
-- ============================================================================

CREATE TABLE IF NOT EXISTS hcp_open_payments_summary_v2 (
  hcp_id UUID PRIMARY KEY REFERENCES hcps_v2(id) ON DELETE CASCADE,
  distinct_companies_lifetime INTEGER,
  total_payments_lifetime NUMERIC,
  py2022_total NUMERIC,
  py2023_total NUMERIC,
  py2024_total NUMERIC,
  speaker_bureau_3yr NUMERIC,
  consulting_3yr NUMERIC,
  honoraria_3yr NUMERIC,
  education_3yr NUMERIC,
  royalty_3yr NUMERIC,
  food_beverage_3yr NUMERIC,
  travel_lodging_3yr NUMERIC,
  aggregated_at TIMESTAMPTZ DEFAULT NOW(),
  ingestion_run_id UUID
);

CREATE INDEX IF NOT EXISTS idx_open_payments_v2_total ON hcp_open_payments_summary_v2(total_payments_lifetime DESC);

CREATE TABLE IF NOT EXISTS hcp_medicare_summary_v2 (
  hcp_id UUID PRIMARY KEY REFERENCES hcps_v2(id) ON DELETE CASCADE,
  total_beneficiaries_3yr_unique_est INTEGER,
  beneficiaries_2021 INTEGER,
  beneficiaries_2022 INTEGER,
  beneficiaries_2023 INTEGER,
  total_services_3yr INTEGER,
  drug_services_3yr INTEGER,
  aggregated_at TIMESTAMPTZ DEFAULT NOW(),
  ingestion_run_id UUID
);

CREATE INDEX IF NOT EXISTS idx_medicare_v2_beneficiaries ON hcp_medicare_summary_v2(total_beneficiaries_3yr_unique_est DESC);

-- RLS policies (run once on initial setup)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hcp_open_payments_summary_v2' AND policyname = 'hcp_open_payments_summary_v2_public_read') THEN
    EXECUTE 'ALTER TABLE hcp_open_payments_summary_v2 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "hcp_open_payments_summary_v2_public_read" ON hcp_open_payments_summary_v2 FOR SELECT USING (true)';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hcp_medicare_summary_v2' AND policyname = 'hcp_medicare_summary_v2_public_read') THEN
    EXECUTE 'ALTER TABLE hcp_medicare_summary_v2 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "hcp_medicare_summary_v2_public_read" ON hcp_medicare_summary_v2 FOR SELECT USING (true)';
  END IF;
END $$;