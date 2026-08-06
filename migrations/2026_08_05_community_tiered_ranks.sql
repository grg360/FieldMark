-- Portfolio chip ranks (2026-08-05): community chips must show the SAME number
-- as the community ledger, whose default view ranks anchored+supported members
-- by tier, recurrence, supported-evidence rank, then normalized score. Same
-- ORDER BY as community_ledger's filtered CTE, so one person never carries
-- two numbers on two surfaces.
CREATE OR REPLACE FUNCTION community_tiered_ranks(p_hcp_ids uuid[])
RETURNS TABLE (hcp_id uuid, tiered_rank int, tier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ta AS (SELECT id FROM therapeutic_areas WHERE name = 'NSCLC'),
  ranked AS (
    SELECT c.hcp_id,
           e.tier,
           row_number() OVER (
             ORDER BY
               CASE e.tier WHEN 'anchored' THEN 1 WHEN 'supported' THEN 2
                           WHEN 'candidate' THEN 3 WHEN 'heme_dominant' THEN 4
                           ELSE 5 END,
               CASE e.recurrence_band WHEN 'recurs' THEN 0 WHEN 'single_year' THEN 1
                           ELSE 0 END,
               COALESCE(e.supported_evidence_rank, 0),
               c.normalized_score DESC,
               c.hcp_id
           )::int AS tiered_rank
    FROM hcp_community_scores_v2 c
    JOIN hcps_v2 h ON h.id = c.hcp_id
    JOIN hcp_nsclc_evidence_tier_v1 e ON e.hcp_id = c.hcp_id
    CROSS JOIN ta
    WHERE c.therapeutic_area_id = ta.id AND h.country = 'US'
      AND e.tier IN ('anchored', 'supported')
  )
  SELECT r.hcp_id, r.tiered_rank, r.tier FROM ranked r
  WHERE r.hcp_id = ANY(p_hcp_ids)
$$;
GRANT EXECUTE ON FUNCTION community_tiered_ranks(uuid[]) TO anon, authenticated, service_role;
