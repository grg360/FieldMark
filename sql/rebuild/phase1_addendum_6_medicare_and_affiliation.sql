-- ============================================================
-- FieldMark v2 — Phase 1 Addendum 6: Medicare expansion + Affiliation sidecar
-- ============================================================
-- Date applied: 2026-05-22
-- Branch: foundation-rebuild
--
-- Purpose:
-- Resolves two more v2 schema gaps surfaced during script audits:
--   1. hcp_medicare_summary_v2 was undersized vs what medicare_aggregator.py
--      writes (missing 12 columns of summary statistics)
--   2. hcp_medicare_by_ta_v2 didn't exist (v1 had it)
--   3. Affiliation classification data had no home in v2 (4 columns
--      dropped from hcps_v2 by deliberate-or-accidental design)
--
-- Pattern consistency:
-- Section 1+2 mirror the Open Payments addendum (4§4-5) — extend summary
-- table + create by-TA breakdown table with FK+UNIQUE constraints.
-- Section 3 mirrors the NPPES detail sidecar pattern (4§6) — derived
-- analysis lives in sidecar, not on hcps_v2.
--
-- Architectural rationale:
-- v1 denormalized 4 affiliation columns directly onto hcps. v2 keeps
-- hcps_v2 focused on core identity. Affiliation classification is
-- computed from publication authorships (multiple inputs); proper
-- sidecar candidate matching the pattern used for Open Payments,
-- Medicare, NPPES detail.
-- ============================================================


-- ============================================================
-- Section 1: Extend hcp_medicare_summary_v2
-- ============================================================
-- medicare_aggregator.py writes 12 keys that the original 9-column
-- v2 schema did not have. Frontend displays these (top_hcpcs_codes,
-- predominant_specialty, etc.). Adding them matches v1 schema.
ALTER TABLE hcp_medicare_summary_v2
  ADD COLUMN npi text,
  ADD COLUMN total_beneficiaries_3yr integer,
  ADD COLUMN total_medicare_payment_3yr numeric,
  ADD COLUMN total_distinct_hcpcs_codes_3yr integer,
  ADD COLUMN beneficiaries_yoy_trend_pct numeric,
  ADD COLUMN primary_place_of_service text,
  ADD COLUMN predominant_specialty text,
  ADD COLUMN predominant_state text,
  ADD COLUMN predominant_ruca text,
  ADD COLUMN top_hcpcs_codes text[],
  ADD COLUMN medicare_calculated_at timestamp with time zone,
  ADD COLUMN medicare_program_years integer[];


-- ============================================================
-- Section 2: Create hcp_medicare_by_ta_v2
-- ============================================================
-- v1 had hcp_medicare_by_ta; v2 schema omitted it. Recreated with
-- integrity additions matching addendum 4 §5 pattern:
--   - FK to hcps_v2 with ON DELETE CASCADE
--   - UNIQUE(hcp_id, therapeutic_area_id)
--   - ingestion_run_id for pipeline_runs traceability
--   - Renamed calculated_at -> aggregated_at for consistency
CREATE TABLE hcp_medicare_by_ta_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id uuid NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id uuid NOT NULL REFERENCES therapeutic_areas(id),
  ta_beneficiaries_3yr_high_confidence integer,
  ta_services_3yr_high_confidence integer,
  ta_payments_3yr_high_confidence numeric,
  ta_distinct_codes_3yr_high_confidence integer,
  ta_beneficiaries_3yr_total integer,
  ta_services_3yr_total integer,
  ta_payments_3yr_total numeric,
  ta_distinct_codes_3yr_total integer,
  ta_drug_admin_volume_3yr integer,
  ta_procedure_volume_3yr integer,
  ta_beneficiaries_yoy_trend_pct numeric,
  aggregated_at timestamp with time zone DEFAULT now(),
  ingestion_run_id uuid,
  UNIQUE(hcp_id, therapeutic_area_id)
);

CREATE INDEX idx_hcp_medicare_by_ta_v2_hcp_id
  ON hcp_medicare_by_ta_v2(hcp_id);
CREATE INDEX idx_hcp_medicare_by_ta_v2_ta_id
  ON hcp_medicare_by_ta_v2(therapeutic_area_id);


-- ============================================================
-- Section 3: Create hcp_affiliation_profile_v2 sidecar
-- ============================================================
-- v1 stored 4 affiliation columns directly on hcps:
--   affiliation_profile (jsonb), clinician_score, affiliation_classification,
--   affiliation_profile_calculated_at
-- v2 dropped these from hcps_v2. Restoring as sidecar instead of
-- columns on hcps_v2 because:
--   - Affiliation classification is derived analysis, not core identity
--   - Re-running affiliation_profiler.py shouldn't touch hcps_v2
--   - Matches sidecar pattern used for NPPES detail, Open Payments,
--     Medicare
--
-- PRIMARY KEY hcp_id (not separate UUID id) ensures one profile per HCP
-- structurally; no duplicate-profile risk from repeat runs.
CREATE TABLE hcp_affiliation_profile_v2 (
  hcp_id uuid PRIMARY KEY REFERENCES hcps_v2(id) ON DELETE CASCADE,
  affiliation_profile jsonb,
  clinician_score numeric,
  affiliation_classification text,
  profile_version text,
  affiliation_profile_calculated_at timestamp with time zone DEFAULT now(),
  ingestion_run_id uuid
);

CREATE INDEX idx_hcp_affiliation_profile_v2_classification
  ON hcp_affiliation_profile_v2(affiliation_classification);
CREATE INDEX idx_hcp_affiliation_profile_v2_clinician_score
  ON hcp_affiliation_profile_v2(clinician_score);

COMMENT ON TABLE hcp_affiliation_profile_v2 IS
  'Affiliation classification derived from publication authorships. '
  'Sidecar to hcps_v2: kept separate because classification is computed '
  'analysis, not core HCP identity. Matches pattern of hcp_nppes_detail_v2, '
  'hcp_open_payments_summary_v2.';
COMMENT ON COLUMN hcp_affiliation_profile_v2.affiliation_classification IS
  'One of: clinician, mixed, researcher, industry, insufficient_data';
COMMENT ON COLUMN hcp_affiliation_profile_v2.clinician_score IS
  'Ratio of clinical signals to total signals (clinical+research). '
  'Null when insufficient data or industry-classified.';


-- ============================================================
-- End-of-migration state
-- ============================================================
-- Expected state after migration:
--   - v2 table count: 20 (was 18)
--   - hcp_medicare_summary_v2 column count: 21 (was 9)
--   - New tables: hcp_medicare_by_ta_v2, hcp_affiliation_profile_v2
