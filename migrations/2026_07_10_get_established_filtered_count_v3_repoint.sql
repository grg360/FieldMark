CREATE OR REPLACE FUNCTION public.get_established_filtered_count(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[]
)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND er.scope_type = p_scope_type
    AND er.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$function$;

CREATE OR REPLACE FUNCTION public.get_established_filtered_count(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[]
)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND er.scope_type = p_scope_type
    AND er.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = er.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$function$;

NOTIFY pgrst, 'reload schema';
