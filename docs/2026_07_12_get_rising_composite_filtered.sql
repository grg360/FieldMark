/* get_rising_composite_filtered + _count
   Mirrors get_established_filtered against hcp_rising_composite_v1 (2-axis scope-row model).
   Scope-row filtering (scope_type/scope_value) copied from established; NOT the old us_rank CASE trick.
   Old model (get_rising_star_filtered / hcp_rising_star_ranks_v3) left intact for frozen NSCLC.

   STATUS: NOT YET APPLIED to the live DB. Fresh migration (the rising RPC was never in version control).

   GLOBAL BRANCH (corrected 2026-07-12): global rows are stored scope_type='global', scope_value=NULL.
   The plain established pattern `scope_value = ANY(p_scope_values)` returns 0 rows for global (NULL = ANY
   is never TRUE, and the frontend passes p_scope_values=[] for global). So each predicate is a two-arm OR:
     (p_scope_type='global' AND scope_type='global')  -- keys on scope_type alone, ignores NULL scope_value
     OR (scope_type=p_scope_type AND scope_value=ANY(p_scope_values))  -- region/country path
   The SAME defect exists in the live get_established_filtered/_count (Established global is stranded too);
   apply the same OR branch there if AD Established is to show its ~2,585 international rows. */

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_canonical_theme_ids uuid[],
  p_limit integer,
  p_offset integer
)
RETURNS TABLE(
  hcp_id uuid,
  rank integer,
  scope_size integer,
  normalized_score numeric,
  composite_score numeric,
  trial_score numeric,
  rising_composite_score double precision,
  emergence_pctile double precision,
  network_influence_pctile double precision,
  country text,
  first_name text,
  last_name text,
  institution_normalized text,
  career_first_pub_year integer,
  total_career_pubs integer,
  cited_by_count integer,
  h_index integer,
  works_count integer
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    r.hcp_id,
    r.rank,
    NULL::integer AS scope_size,
    r.rising_composite_score::numeric AS normalized_score,
    r.rising_composite_score::numeric AS composite_score,
    NULL::numeric AS trial_score,
    r.rising_composite_score,
    r.emergence_pctile,
    r.network_influence_pctile,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year_v2 AS career_first_pub_year,
    h.total_career_pubs,
    am.cited_by_count,
    am.h_index,
    am.works_count
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = r.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY r.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered(
  p_ta_id uuid,
  p_scope_type text,
  p_scope_values text[],
  p_states text[],
  p_limit integer,
  p_offset integer
)
RETURNS TABLE(
  hcp_id uuid,
  rank integer,
  scope_size integer,
  normalized_score numeric,
  composite_score numeric,
  trial_score numeric,
  rising_composite_score double precision,
  emergence_pctile double precision,
  network_influence_pctile double precision,
  country text,
  first_name text,
  last_name text,
  institution_normalized text,
  career_first_pub_year integer,
  total_career_pubs integer
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    r.hcp_id,
    r.rank,
    NULL::integer AS scope_size,
    r.rising_composite_score::numeric AS normalized_score,
    r.rising_composite_score::numeric AS composite_score,
    NULL::numeric AS trial_score,
    r.rising_composite_score,
    r.emergence_pctile,
    r.network_influence_pctile,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year_v2 AS career_first_pub_year,
    h.total_career_pubs
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered_count(
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
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = r.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered_count(
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
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$function$;

GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered_count(uuid, text, text[], text[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered_count(uuid, text, text[], text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
