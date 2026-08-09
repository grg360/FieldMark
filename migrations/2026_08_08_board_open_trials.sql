-- 2026_08_08 — cohort-agnostic open-trial read for ledger badges.
--
-- rising_board_flags computes on_open_trial FROM hcp_scientific_momentum_v1
-- (a rising-pipeline spine holding only 175 of the 2,990 Established/US
-- HCPs), so it cannot serve the Established ledger — calling it there would
-- badge ~6% of rows and silently skip the rest. This read keys directly on
-- hcp_id: any cohort, no spine. 720 of 2,990 Established/US NSCLC HCPs carry
-- >= 1 rendered open trial at write time.
--
-- SHAPED FOR THE FUTURE TRIALS LINK (decided 2026-08-08): not a bare EXISTS.
-- Returns the count plus the distinct trial_ids, so a per-HCP trials surface
-- can be added later by fetching those ids — without rebuilding this read.
-- The trials surface itself is NOT built here.
--
-- Same meaning + disclosure as the rising badge: named investigator on >= 1
-- trial in the confidence-gated trial_investigators_rendered_v1 view; the
-- registry labels every site lead PI, so role is disclosed, not asserted.
-- Never a score input. SECURITY DEFINER because the rendered view is not
-- anon-readable (same as rising_board_flags).

-- STATUS GATE (added 2026-08-08 before first run): trial_investigators_rendered_v1
-- is confidence-gated but NOT status-gated — 9,298 of its 24,687 trials are
-- COMPLETED (+1,668 TERMINATED, 561 WITHDRAWN). A bare EXISTS badges 720
-- Established/US HCPs; status-gated the honest count is 460. The status set is
-- the platform's canonical OPEN_TRIAL_STATUSES (theWeek.ts). NOTE: the live
-- rising_board_flags has the SAME ungated EXISTS — its badge currently
-- over-claims; fixing it is a separate decision.
CREATE OR REPLACE FUNCTION board_open_trials(p_hcp_ids uuid[])
RETURNS TABLE (hcp_id uuid, open_trial_count int, trial_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.hcp_id,
         COUNT(DISTINCT t.trial_id)::int AS open_trial_count,
         array_agg(DISTINCT t.trial_id)  AS trial_ids
  FROM trial_investigators_rendered_v1 t
  JOIN clinical_trials_v2 ct ON ct.id = t.trial_id
  WHERE t.hcp_id = ANY(p_hcp_ids)
    AND ct.status IN ('RECRUITING', 'ACTIVE_NOT_RECRUITING',
                      'NOT_YET_RECRUITING', 'ENROLLING_BY_INVITATION')
  GROUP BY t.hcp_id
$$;

GRANT EXECUTE ON FUNCTION board_open_trials(uuid[]) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
