-- ============================================================
-- FieldMark v2 — Phase 1 Addendum 4: Schema Reconciliation
-- ============================================================
-- Date applied: 2026-05-22
-- Branch: foundation-rebuild
-- Backup point: May 21, 2026 8:19 AM ET (pre-existing safety net)
--
-- Purpose:
-- Reconciles v2 schema with the requirements of Day 3-5 scripts
-- (Step B, trials_pipeline, scoring_pipeline, NPPES enrichment,
-- open_payments_aggregator, generate_narratives_v2,
-- trial_investigator_matcher).
--
-- Audit of those scripts surfaced:
--   - Missing component scores on hcp_scores_v2
--   - Narrative subfields collapsed into a single text column
--   - Open Payments summary fields incomplete
--   - Open Payments by-TA and top-companies breakdowns absent
--   - NPPES detail had no home (10 columns hcps_v2 doesn't track)
--   - NPI match proposals and NPPES enrichment log absent
--   - Matcher denormalized helper columns absent
--   - identity_hash NOT NULL forced Step C to invent placeholders
--   - credentials column missing
--
-- Design philosophy:
--   v2's design defends against the v1 duplication catastrophe
--   structurally. Every addition here was evaluated for whether
--   it reintroduces a v1 integrity hazard.
--
--   Specifically rejected (and intentionally NOT in this migration):
--     - Restoring openalex_author_id as flat column on hcps_v2.
--       OpenAlex shards live in hcp_openalex_authors_v2 only.
--       (Run-step-b script needs patching to honor this.)
--     - Plain lower-case helper columns. Used generated columns
--       instead so they cannot drift from source columns.
--     - trial_investigator_match_proposals and wipe_candidates_audit
--       tables. Direct-apply workflow in v2; v1 proposals-and-audit
--       pattern did not prevent duplication, just tracked it.
-- ============================================================


-- ============================================================
-- Section 1: Component scores on hcp_scores_v2
-- ============================================================
ALTER TABLE hcp_scores_v2
  ADD COLUMN congress_score numeric,
  ADD COLUMN msl_signal_score numeric;

COMMENT ON COLUMN hcp_scores_v2.congress_score IS
  'Conference/congress activity signal. v1.4 placeholder weight 10%, default 0.0.';
COMMENT ON COLUMN hcp_scores_v2.msl_signal_score IS
  'MSL contribution signal. v1.4 placeholder weight 10%, default 0.0.';


-- ============================================================
-- Section 2: Drop NOT NULL on hcps_v2.identity_hash
-- ============================================================
-- Step C cannot compute identity_hash at HCP creation because NPI
-- is not known until NPPES backfill. Schema must permit NULL so
-- the column can be populated post-creation by enrichment passes.
ALTER TABLE hcps_v2 ALTER COLUMN identity_hash DROP NOT NULL;

COMMENT ON COLUMN hcps_v2.identity_hash IS
  'Dedup fingerprint, populated post-creation by enrichment passes. '
  'NOT a stable identity - id (UUID) is the only stable identifier. '
  'May be recomputed when NPI/canonical fields change.';


-- ============================================================
-- Section 3: Narrative subfields on hcp_narratives_v2
-- ============================================================
-- generate_narratives_v2.py produces 5 structured outputs. v1's
-- single narrative_text column collapsed structure the frontend
-- needs. why_now is the most important field per script design.
ALTER TABLE hcp_narratives_v2
  ADD COLUMN why_now text,
  ADD COLUMN engagement_angle text,
  ADD COLUMN signal_strength text,
  ADD COLUMN caution_flags text[] DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN hcp_narratives_v2.why_now IS
  'Most important field - explains current timing signal for engagement.';
COMMENT ON COLUMN hcp_narratives_v2.engagement_angle IS
  'Suggested approach or topic for MSL engagement.';
COMMENT ON COLUMN hcp_narratives_v2.signal_strength IS
  'Qualitative strength assessment of the rising-star signal.';
COMMENT ON COLUMN hcp_narratives_v2.caution_flags IS
  'Array of caveats or risks for this HCP profile.';


-- ============================================================
-- Section 4: Open Payments summary fields
-- ============================================================
ALTER TABLE hcp_open_payments_summary_v2
  ADD COLUMN total_payments_3yr numeric,
  ADD COLUMN total_payments_count_lifetime integer,
  ADD COLUMN most_recent_payment_date date,
  ADD COLUMN year_over_year_trend_pct numeric;


-- ============================================================
-- Section 5: Open Payments by-TA and top-companies tables
-- ============================================================
-- v1 had these; v2 omitted them. Recreated with integrity additions:
--   - FK constraints to hcps_v2(id) with ON DELETE CASCADE
--     (v1 had no FK - orphaned rows accumulated)
--   - UNIQUE constraints (v1 lacked these; contributed to 32%-
--     duplicate hcp_scores bug pattern)
--   - ingestion_run_id for pipeline_runs traceability
--   - Renamed calculated_at -> aggregated_at for consistency
CREATE TABLE hcp_open_payments_by_ta_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id uuid NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id uuid NOT NULL REFERENCES therapeutic_areas(id),
  ta_payments_3yr numeric,
  ta_payments_count_3yr integer,
  ta_distinct_drugs_3yr integer,
  ta_distinct_companies_3yr integer,
  ta_speaker_bureau_3yr numeric,
  ta_consulting_3yr numeric,
  ta_honoraria_3yr numeric,
  aggregated_at timestamp with time zone DEFAULT now(),
  ingestion_run_id uuid,
  UNIQUE(hcp_id, therapeutic_area_id)
);

CREATE INDEX idx_hcp_open_payments_by_ta_v2_hcp_id
  ON hcp_open_payments_by_ta_v2(hcp_id);
CREATE INDEX idx_hcp_open_payments_by_ta_v2_ta_id
  ON hcp_open_payments_by_ta_v2(therapeutic_area_id);

CREATE TABLE hcp_open_payments_top_companies_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id uuid NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  manufacturer_name text NOT NULL,
  total_amount_usd numeric NOT NULL DEFAULT 0,
  payment_count integer NOT NULL DEFAULT 0,
  most_recent_payment_date date,
  rank_by_amount integer NOT NULL,
  aggregated_at timestamp with time zone DEFAULT now(),
  ingestion_run_id uuid,
  UNIQUE(hcp_id, manufacturer_name)
);

CREATE INDEX idx_hcp_open_payments_top_companies_v2_hcp_id
  ON hcp_open_payments_top_companies_v2(hcp_id);
CREATE INDEX idx_hcp_open_payments_top_companies_v2_rank
  ON hcp_open_payments_top_companies_v2(hcp_id, rank_by_amount);


-- ============================================================
-- Section 6: NPPES detail sidecar
-- ============================================================
-- nppes_enrichment.py produces 10+ columns of NPPES detail that
-- hcps_v2 intentionally does not track. Sidecar table keeps hcps_v2
-- lean (the v2 design goal) while preserving the enrichment data.
--
-- hcp_id is PK - one detail row per HCP - structurally precludes
-- duplicates by NPPES enrichment runs.
CREATE TABLE hcp_nppes_detail_v2 (
  hcp_id uuid PRIMARY KEY REFERENCES hcps_v2(id) ON DELETE CASCADE,
  nppes_enumeration_date date,
  nppes_is_sole_proprietor boolean,
  nppes_practice_address text,
  nppes_practice_zip text,
  nppes_organization_name text,
  nppes_organization_npi text,
  nppes_organization_match_quality text,
  nppes_co_located_npi_count integer,
  nppes_career_stage text,
  npi_taxonomy text,
  npi_taxonomy_enrichment_status text,
  npi_taxonomy_enriched_at timestamp with time zone,
  nppes_enriched_at timestamp with time zone DEFAULT now(),
  ingestion_run_id uuid
);

CREATE INDEX idx_hcp_nppes_detail_v2_org_npi
  ON hcp_nppes_detail_v2(nppes_organization_npi);


-- ============================================================
-- Section 7: NPPES enrichment log and NPI match proposals
-- ============================================================
-- nppes_enrichment_log_v2: workflow log for targeted_nppes_enrichment.py
--   - Upgraded enriched_at/reverted_at to timestamptz (v1 used
--     timestamp without time zone, inconsistent with rest of schema)
--   - Added FK + ON DELETE SET NULL (log retained even if HCP deleted)
CREATE TABLE nppes_enrichment_log_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id uuid REFERENCES hcps_v2(id) ON DELETE SET NULL,
  matched_npi text,
  match_confidence text,
  match_reason text,
  candidates_considered jsonb,
  enriched_at timestamp with time zone DEFAULT now(),
  reverted_at timestamp with time zone
);

CREATE INDEX idx_nppes_enrichment_log_v2_hcp_id
  ON nppes_enrichment_log_v2(hcp_id);
CREATE INDEX idx_nppes_enrichment_log_v2_npi
  ON nppes_enrichment_log_v2(matched_npi);

-- npi_match_proposals_v2: matcher decision data only.
--   v1 stored 9 columns of NPPES detail in the proposal table that
--   duplicated data already on hcps. v2 stores only the match decision;
--   NPPES detail is re-fetched at apply time. Smaller, no drift risk.
CREATE TABLE npi_match_proposals_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id uuid NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  npi text NOT NULL,
  match_tier integer,
  match_confidence integer,
  match_status text,
  candidates_found integer,
  match_calculated_at timestamp with time zone DEFAULT now(),
  applied_at timestamp with time zone,
  UNIQUE(hcp_id, npi)
);

CREATE INDEX idx_npi_match_proposals_v2_hcp_id
  ON npi_match_proposals_v2(hcp_id);
CREATE INDEX idx_npi_match_proposals_v2_status
  ON npi_match_proposals_v2(match_status);


-- ============================================================
-- Section 8: Generated columns for matcher lookups
-- ============================================================
-- trial_investigator_matcher.py needs case-insensitive lookups
-- by last_name and state. Generated columns are auto-updated by
-- Postgres on every INSERT/UPDATE - cannot drift from source.
-- v1 maintained these as plain columns via triggers that could
-- be skipped or fail silently.
ALTER TABLE hcps_v2
  ADD COLUMN last_name_lower text GENERATED ALWAYS AS (lower(last_name)) STORED,
  ADD COLUMN state_lower text GENERATED ALWAYS AS (lower(nppes_practice_state)) STORED;

CREATE INDEX idx_hcps_v2_last_name_lower ON hcps_v2(last_name_lower);
CREATE INDEX idx_hcps_v2_state_lower ON hcps_v2(state_lower);
CREATE INDEX idx_hcps_v2_last_name_state
  ON hcps_v2(last_name_lower, state_lower);


-- ============================================================
-- Section 9: Credentials column on hcps_v2
-- ============================================================
ALTER TABLE hcps_v2 ADD COLUMN credentials text;

COMMENT ON COLUMN hcps_v2.credentials IS
  'Professional credentials string from NPPES (e.g., MD, DO, PhD, MD PhD).';


-- ============================================================
-- End-of-migration verification (informational, not destructive)
-- ============================================================
-- Expected state after migration:
--   - v2 table count: 17 (was 12)
--   - hcps_v2 column count: 36 (was 33)
--   - hcp_narratives_v2 column count: 11 (was 7)
--   - hcp_scores_v2 column count: 13 (was 11)
--   - hcp_open_payments_summary_v2 column count: 19 (was 15)
--
-- New tables added (5):
--   hcp_open_payments_by_ta_v2
--   hcp_open_payments_top_companies_v2
--   hcp_nppes_detail_v2
--   nppes_enrichment_log_v2
--   npi_match_proposals_v2
