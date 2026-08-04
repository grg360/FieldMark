-- ============================================================================
-- Trials surface read RPC. Frame: docs/design/Trials Surface.dc.html.
-- Date: 2026-08-04   Branch: foundation-rebuild
--
-- Returns SET 1 — open lung (NSCLC-TA) trials naming >=1 ranked NSCLC investigator
-- in the GATED view trial_investigators_rendered_v1 (never trial_investigators_v2).
-- The frontend computes every derived figure (open count, industry, phase/status,
-- roster assets, territory, roster overlay) from this set, so the header count is
-- whatever SET 1 is on the day — not a fixed number. The bulk noInvs / roster-asset
-- tier is intentionally NOT included (verified 2026-08-04: it is 286 trials, not an
-- edge case, and its 271-industry union contradicts the surface's own 69 figure).
--
-- "Open" = RECRUITING / ACTIVE_NOT_RECRUITING / ENROLLING_BY_INVITATION.
-- Investigator territory is the HCP's practice state, not the trial's sites.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_nsclc_trials_surface()
RETURNS TABLE (
  trial_id uuid,
  nct_id text,
  title text,
  phase text,
  status text,
  sponsor text,
  lead_sponsor_class text,
  start_date date,
  completion_date date,
  interventions jsonb,
  investigators jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH nsclc AS (SELECT 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid AS ta),
  -- ranked NSCLC cohort, best cohort/rank per HCP (established preferred, then lowest rank)
  ranked AS (
    SELECT DISTINCT ON (hcp_id) hcp_id, cohort, rnk
    FROM (
      SELECT hcp_id, 'established' AS cohort, rank AS rnk, 0 AS pri
      FROM hcp_established_ranks_v3, nsclc
      WHERE therapeutic_area_id = nsclc.ta AND scope_type = 'region' AND scope_value = 'US'
      UNION ALL
      SELECT hcp_id, 'rising' AS cohort, us_rank AS rnk, 1 AS pri
      FROM hcp_rising_star_ranks_v3, nsclc
      WHERE therapeutic_area_id = nsclc.ta
    ) u
    ORDER BY hcp_id, pri, rnk NULLS LAST
  ),
  -- gated-view investigators that are in the ranked cohort
  trial_invs AS (
    SELECT ti.trial_id, ti.hcp_id, ti.match_confidence, r.cohort, r.rnk
    FROM trial_investigators_rendered_v1 ti
    JOIN ranked r ON r.hcp_id = ti.hcp_id
  ),
  -- SET 1 trial ids: open + NSCLC-TA + has a ranked investigator
  set1 AS (
    SELECT DISTINCT c.id
    FROM clinical_trials_v2 c
    JOIN clinical_trials_ta_v2 ta ON ta.trial_id = c.id AND ta.therapeutic_area_id = (SELECT ta FROM nsclc)
    WHERE c.status IN ('RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION')
      AND EXISTS (SELECT 1 FROM trial_invs ti WHERE ti.trial_id = c.id)
  )
  SELECT
    c.id, c.nct_id, c.title, c.phase, c.status, c.sponsor, c.lead_sponsor_class,
    c.start_date, c.completion_date, c.interventions,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'hcp_id', h.id,
          'name', NULLIF(trim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')), ''),
          'state', h.nppes_practice_state,
          'institution', h.institution_normalized,
          'cohort', ti.cohort,
          'rank', ti.rnk,
          'confidence', ti.match_confidence
        )
        ORDER BY ti.rnk NULLS LAST, ti.match_confidence DESC
      )
      FROM trial_invs ti
      JOIN hcps_v2 h ON h.id = ti.hcp_id
      WHERE ti.trial_id = c.id
    ) AS investigators
  FROM clinical_trials_v2 c
  JOIN set1 ON set1.id = c.id;
$$;

GRANT EXECUTE ON FUNCTION get_nsclc_trials_surface() TO anon;
GRANT EXECUTE ON FUNCTION get_nsclc_trials_surface() TO authenticated;
GRANT EXECUTE ON FUNCTION get_nsclc_trials_surface() TO service_role;

NOTIFY pgrst, 'reload schema';
