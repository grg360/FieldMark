-- ROLLBACK ARTIFACT: live get_established_filtered / _count definitions BEFORE the global patch.
-- Captured 2026-07-12 (Phase 0 step 1). To revert the global patch, re-run these CREATE OR REPLACE statements.

-- get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r3.hcp_id,
    r3.rank,
    NULL::integer AS scope_size,
    r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score,
    NULL::numeric AS trial_score,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year,
    h.total_career_pubs
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND r3.scope_type = p_scope_type
    AND r3.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$
;

-- get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
CREATE OR REPLACE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer, works_count integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r3.hcp_id,
    r3.rank,
    NULL::integer AS scope_size,
    r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score,
    NULL::numeric AS trial_score,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year,
    h.total_career_pubs,
    am.cited_by_count,
    am.h_index,
    am.works_count
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND r3.scope_type = p_scope_type
    AND r3.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = r3.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$
;

-- get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[])
CREATE OR REPLACE FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[])
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
$function$
;

-- get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[])
CREATE OR REPLACE FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[])
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
$function$
;

