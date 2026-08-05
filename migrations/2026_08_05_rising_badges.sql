-- Rising board flags (2026-08-05): the RECENT SENIOR AUTHORSHIP event badge
-- (zero senior papers in the early rolling window, >= 3 in the recent — a
-- claim about the windows, not the whole career) and the open-trial flag
-- (>= 1 row in the gated trial_investigators_rendered_v1 view; inherits its
-- confidence gating and the registry role disclosure). Neither is a score
-- input. SECURITY DEFINER because the underlying tables are not anon-readable.
CREATE OR REPLACE FUNCTION rising_board_flags(p_hcp_ids uuid[])
RETURNS TABLE (hcp_id uuid, senior_transition boolean, recent_senior_pubs int, on_open_trial boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.hcp_id,
         (s.early_senior_pubs = 0 AND s.recent_senior_pubs >= 3) AS senior_transition,
         s.recent_senior_pubs::int,
         EXISTS (SELECT 1 FROM trial_investigators_rendered_v1 t WHERE t.hcp_id = s.hcp_id) AS on_open_trial
  FROM hcp_scientific_momentum_v1 s
  WHERE s.hcp_id = ANY(p_hcp_ids)
$$;
GRANT EXECUTE ON FUNCTION rising_board_flags(uuid[]) TO anon, authenticated, service_role;
