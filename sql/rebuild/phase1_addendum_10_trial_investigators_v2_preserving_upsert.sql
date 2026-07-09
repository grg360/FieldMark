-- ============================================================================
-- Phase 1 Addendum 10: match-preserving upsert for trial_investigators_v2
-- Date: 2026-07-06
--
-- Fixes: blanket Supabase upsert was overwriting matched hcp_id with NULL when
-- a raw roster row re-ingested on the same conflict key.
--
-- Run via:
--   python scripts/utilities/run_sql.py --file sql/rebuild/phase1_addendum_10_trial_investigators_v2_preserving_upsert.sql
-- ============================================================================

ALTER TABLE trial_investigators_v2
  ADD COLUMN IF NOT EXISTS investigator_raw_middle_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_trial_investigators_v2_identity
  ON trial_investigators_v2 (
    trial_id,
    investigator_raw_first_name,
    investigator_raw_last_name,
    role,
    source
  );

CREATE OR REPLACE FUNCTION upsert_trial_investigators_v2_preserving_match(rows_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO trial_investigators_v2 (
    hcp_id,
    trial_id,
    role,
    investigator_name,
    investigator_raw_first_name,
    investigator_raw_middle_name,
    investigator_raw_last_name,
    investigator_raw_affiliation,
    investigator_raw_facility,
    investigator_raw_city,
    investigator_raw_state,
    investigator_raw_country,
    match_confidence,
    source
  )
  SELECT
    NULLIF(r.hcp_id, '')::uuid,
    r.trial_id::uuid,
    r.role,
    r.investigator_name,
    r.investigator_raw_first_name,
    r.investigator_raw_middle_name,
    r.investigator_raw_last_name,
    r.investigator_raw_affiliation,
    r.investigator_raw_facility,
    r.investigator_raw_city,
    r.investigator_raw_state,
    r.investigator_raw_country,
    r.match_confidence,
    r.source
  FROM jsonb_to_recordset(rows_data) AS r(
    hcp_id text,
    trial_id text,
    role text,
    investigator_name text,
    investigator_raw_first_name text,
    investigator_raw_middle_name text,
    investigator_raw_last_name text,
    investigator_raw_affiliation text,
    investigator_raw_facility text,
    investigator_raw_city text,
    investigator_raw_state text,
    investigator_raw_country text,
    match_confidence integer,
    source text
  )
  ON CONFLICT (trial_id, investigator_raw_first_name, investigator_raw_last_name, role, source)
  DO UPDATE SET
    hcp_id = COALESCE(EXCLUDED.hcp_id, trial_investigators_v2.hcp_id),
    match_confidence = GREATEST(
      COALESCE(EXCLUDED.match_confidence, 0),
      COALESCE(trial_investigators_v2.match_confidence, 0)
    ),
    source = CASE
      WHEN EXCLUDED.hcp_id IS NOT NULL THEN EXCLUDED.source
      ELSE trial_investigators_v2.source
    END,
    investigator_name = COALESCE(EXCLUDED.investigator_name, trial_investigators_v2.investigator_name),
    investigator_raw_middle_name = COALESCE(
      EXCLUDED.investigator_raw_middle_name,
      trial_investigators_v2.investigator_raw_middle_name
    ),
    investigator_raw_affiliation = COALESCE(
      EXCLUDED.investigator_raw_affiliation,
      trial_investigators_v2.investigator_raw_affiliation
    ),
    investigator_raw_facility = COALESCE(
      EXCLUDED.investigator_raw_facility,
      trial_investigators_v2.investigator_raw_facility
    ),
    investigator_raw_city = COALESCE(
      EXCLUDED.investigator_raw_city,
      trial_investigators_v2.investigator_raw_city
    ),
    investigator_raw_state = COALESCE(
      EXCLUDED.investigator_raw_state,
      trial_investigators_v2.investigator_raw_state
    ),
    investigator_raw_country = COALESCE(
      EXCLUDED.investigator_raw_country,
      trial_investigators_v2.investigator_raw_country
    );
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_trial_investigators_v2_preserving_match(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_trial_investigators_v2_preserving_match(jsonb) TO service_role;
