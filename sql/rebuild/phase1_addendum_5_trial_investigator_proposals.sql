-- ============================================================
-- FieldMark v2 — Phase 1 Addendum 5: Trial Investigator Match Proposals
-- ============================================================
-- Date applied: 2026-05-22
-- Branch: foundation-rebuild
--
-- Purpose:
-- Creates trial_investigator_match_proposals_v2 to support the
-- propose-then-apply workflow for trial_investigator_matcher.py.
--
-- Design rationale:
-- v2's general design philosophy is direct-apply (no proposals tables)
-- because v1's proposal pattern didn't prevent the duplication catastrophe.
-- This script is the one exception: it operates on low-confidence inputs
-- (site_contact rows where structured investigator data is missing).
-- Confidence floor 65-95 with name-based matching has inherent error rate
-- that warrants human review before writing to trial_investigators_v2.hcp_id.
--
-- Changes from v1:
--   - Added FK constraints (v1 had none) with appropriate cascade behavior
--   - UNIQUE(trial_investigator_id) ensures one proposal per investigator row
--   - Renamed hcp_institution_short -> hcp_institution_normalized (v2 column)
--   - Renamed match_calculated_at -> proposed_at
--   - Added applied_at to track when/if a proposal is promoted to live
--   - Dropped columns that duplicate trial_investigators_v2 data
-- ============================================================

CREATE TABLE trial_investigator_match_proposals_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_investigator_id uuid NOT NULL REFERENCES trial_investigators_v2(id) ON DELETE CASCADE,
  proposed_hcp_id uuid REFERENCES hcps_v2(id) ON DELETE SET NULL,
  proposed_match_confidence integer,
  proposed_match_status text NOT NULL,
  candidate_count integer,
  decision_path text,
  raw_first_name text,
  raw_last_name text,
  raw_facility text,
  raw_city text,
  raw_state text,
  hcp_first_name text,
  hcp_last_name text,
  hcp_institution_normalized text,
  hcp_city text,
  hcp_state text,
  proposed_at timestamp with time zone DEFAULT now(),
  applied_at timestamp with time zone,
  UNIQUE(trial_investigator_id)
);

CREATE INDEX idx_tim_proposals_v2_ti_id
  ON trial_investigator_match_proposals_v2(trial_investigator_id);
CREATE INDEX idx_tim_proposals_v2_hcp_id
  ON trial_investigator_match_proposals_v2(proposed_hcp_id);
CREATE INDEX idx_tim_proposals_v2_status
  ON trial_investigator_match_proposals_v2(proposed_match_status);
