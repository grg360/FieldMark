/* get_established_filtered + _count — GLOBAL BRANCH PATCH
   Reproduces the four LIVE overloads verbatim (from pg_get_functiondef) and changes ONLY the scope
   predicate: adds a global arm keyed on scope_type alone, because global rows are scope_type='global',
   scope_value=NULL (measured: AD established global = 2,585 NULL-scope_value rows). The plain
   `scope_value = ANY(p_scope_values)` form cannot match them (NULL = ANY = NULL, never TRUE; and the
   frontend passes p_scope_values=[] for global). Region/country behavior is BYTE-IDENTICAL — the second
   OR-arm is the original predicate unchanged, so NSCLC region/US is unaffected.

   STATUS: NOT YET APPLIED. Before applying, diff each function body below against the LIVE
   pg_get_functiondef; the ONLY delta must be the scope predicate turning into the two-arm OR. If any
   OTHER line differs, STOP — the live body drifted from this reconstruction.

   NOTE: this patch does NOT touch the career_first_pub_year display bug (est reads plain, not _v2 —
   logged separately, §30fc). Single-purpose: scope only. */

-- 6-param rows overload (no themes)
CREATE OR REPLACE FUNCTION public.get_established_filtered(
  p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric,
   trial_score numeric, country text, first_name text, last_name text, institution_normalized text,
   career_first_pub_year integer, total_career_pubs integer)
 LANGUAGE sql STABLE
AS $function$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r3.scope_type = 'global')
      OR (r3.scope_type = p_scope_type AND r3.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

-- 7-param rows overload (themes + author metrics)
CREATE OR REPLACE FUNCTION public.get_established_filtered(
  p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[],
  p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric,
   trial_score numeric, country text, first_name text, last_name text, institution_normalized text,
   career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer,
   works_count integer)
 LANGUAGE sql STABLE
AS $function$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs,
    am.cited_by_count, am.h_index, am.works_count
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r3.scope_type = 'global')
      OR (r3.scope_type = p_scope_type AND r3.scope_value = ANY(p_scope_values))
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
        WHERE rt.hcp_id = r3.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

-- 4-param count overload (no themes)
CREATE OR REPLACE FUNCTION public.get_established_filtered_count(
  p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[])
 RETURNS integer LANGUAGE sql STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND er.scope_type = 'global')
      OR (er.scope_type = p_scope_type AND er.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$function$;

-- 5-param count overload (themes)
CREATE OR REPLACE FUNCTION public.get_established_filtered_count(
  p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[])
 RETURNS integer LANGUAGE sql STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND er.scope_type = 'global')
      OR (er.scope_type = p_scope_type AND er.scope_value = ANY(p_scope_values))
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
        WHERE rt.hcp_id = er.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$function$;

NOTIFY pgrst, 'reload schema';
