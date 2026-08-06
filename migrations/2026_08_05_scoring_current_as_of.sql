-- Last scoring run date (2026-08-05): the freshest scoring timestamp across the
-- live rank tables, so surfaces that document or depend on the scoring
-- (Methodology, Admin) can state "current as of {date}" from data rather than
-- a hardcoded string. Max across established / rising / community.
CREATE OR REPLACE FUNCTION scoring_current_as_of()
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(t) FROM (
    SELECT max(computed_at) t FROM hcp_established_ranks_v3
    UNION ALL SELECT max(computed_at) FROM hcp_rising_star_ranks_v3
    UNION ALL SELECT max(scored_at) FROM hcp_community_scores_v2
  ) x;
$$;
GRANT EXECUTE ON FUNCTION scoring_current_as_of() TO anon, authenticated, service_role;
