CREATE OR REPLACE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[])
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM community_board_nsclc_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE b.qualifies
    AND p_ta_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid
    AND p_scope_type = 'region'
    AND h.country = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$function$;

CREATE OR REPLACE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM community_board_nsclc_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE b.qualifies
    AND p_ta_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid
    AND p_scope_type = 'region'
    AND h.country = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = b.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$function$;
