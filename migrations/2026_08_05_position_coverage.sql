-- Position coverage per cohort (2026-08-05): powers the Scientific Positions
-- empty state — how many of a cohort's ranked US physicians carry >= 1
-- extracted position, so absence is stated as a pipeline fact, not a blank.
CREATE OR REPLACE FUNCTION count_hcps_with_positions(p_ta_id uuid, p_cohort text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT board.hcp_id)::int
  FROM (
    SELECT hcp_id FROM hcp_established_ranks_v3
      WHERE therapeutic_area_id = p_ta_id AND scope_type = 'region' AND scope_value = 'US' AND p_cohort = 'established'
    UNION
    SELECT hcp_id FROM hcp_rising_star_ranks_v3
      WHERE therapeutic_area_id = p_ta_id AND us_rank IS NOT NULL AND p_cohort = 'rising'
  ) board
  WHERE EXISTS (
    SELECT 1 FROM hcp_scientific_positions_v1 p
    WHERE p.hcp_id = board.hcp_id AND p.therapeutic_area_id = p_ta_id
  );
$$;
GRANT EXECUTE ON FUNCTION count_hcps_with_positions(uuid, text) TO anon, authenticated, service_role;
