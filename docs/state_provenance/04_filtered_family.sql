/* ==== S2b. THE FILTERED FAMILY CARRIES THE PROVENANCE TOO ====

   S2 taught board_established and board_rising to fall back to institution_state and to emit
   state_basis. This does the same for the row-returning half of the get_%filtered family, so
   the two families agree on what a state is and where it came from.

   WHAT WAS ENUMERATED, because the count in the brief was close but not right. Fourteen
   functions matching get_%filtered% touch nppes_practice_state:

     SEVEN RETURN ROWS and are rewritten below.
       get_community_filtered           (6-arg implementation, 7-arg wrapper)
       get_established_filtered         (6-arg, 7-arg)
       get_rising_composite_filtered    (6-arg, 7-arg)
       get_rising_star_filtered         (7-arg)

     SEVEN RETURN A SCALAR COUNT and are NOT touched, because a column cannot be added to an
     integer. They use nppes_practice_state only in their WHERE clause, which is unchanged.
       get_community_filtered_count         (4-arg, 5-arg)
       get_established_filtered_count       (4-arg, 5-arg)
       get_rising_composite_filtered_count  (4-arg, 5-arg)
       get_rising_star_filtered_count       (5-arg)

   get_community_directory_filtered and its _count are a DIFFERENT FAMILY (p_state text, the
   AD directory behind CommunityExplorer) and never read nppes_practice_state. Out of scope.

   NO SIGNATURE CHANGE. p_include_institution_placed stays on board_established and
   board_rising only. These seven keep their argument lists exactly as they are, so the
   _filtered/_count overload pairs that already differ only by a trailing uuid[] are not
   given a second axis to be ambiguous on. Only the RETURNS TABLE grows.

   DROP + CREATE, NOT CREATE OR REPLACE. CREATE OR REPLACE cannot change a return type, and
   RETURNS TABLE is a return type. Every drop loses its ACL; every function is re-granted to
   anon, authenticated and service_role immediately after its create. A lost grant here is an
   empty People feed that reads as a data problem rather than a permissions one.

   nppes_practice_state IS KEPT WHERE IT WAS. Two of the seven (get_community_filtered) return
   it and still do. The other five never did and still do not: they take state_basis and
   institution_state only. That asymmetry is deliberate rather than an oversight. state_basis
   is readable without the NPPES value: 'nppes' means "the value you already hold is a
   practice registration", 'institution' means "use institution_state and qualify it", null
   means there is no state at all.

   THE WRAPPER IS ORDER-SENSITIVE. get_community_filtered's 7-arg form is
   `SELECT r.*, am.cited_by_count, am.h_index, am.works_count` over the 6-arg form, so r.*
   expands the delegate's columns IN ORDER and the two new ones land between npi_specialty and
   the author-metrics trio. Its RETURNS TABLE below says exactly that. Reordering either
   function's column list without the other silently shifts every column after the seam.

   SCOPE NOTE, SO NOBODY RE-DERIVES IT LATER. This block is not what keeps the People feed
   from going blank after block 7. The frontend never read the state from these RPCs: it
   hydrates every cohort from a direct hcps_v2 select (api.ts:177-199) and merges at :558 as
   `rr.x ?? hcp.x`, and institution_state was threaded into that path alongside this work.
   What S2b buys is that the RPCs are self-sufficient and the two families agree, so a future
   consumer reading these functions directly gets the provenance rather than a bare code. */

DROP FUNCTION IF EXISTS public.get_community_filtered(uuid, text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, evidence_tier text, patient_volume numeric, part_d_present boolean, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_career_stage_years integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT b.hcp_id, b.evidence_tier, b.patient_volume, b.part_d_present,
         h.country, h.first_name, h.last_name, h.institution_normalized,
         h.career_first_pub_year, h.total_career_pubs, h.nppes_career_stage_years,
         h.nppes_practice_city, h.nppes_practice_state, h.nppes_practice_setting, h.npi_specialty,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
  FROM community_board_nsclc_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE p_ta_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid
    AND b.qualifies
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY CASE b.evidence_tier WHEN 'anchored' THEN 1 WHEN 'supported' THEN 2 WHEN 'heme_dominant' THEN 3 WHEN 'candidate' THEN 4 ELSE 5 END,
           COALESCE(b.patient_volume, 0) DESC, b.hcp_id
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, evidence_tier text, patient_volume numeric, part_d_present boolean, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_career_stage_years integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text, institution_state text, state_basis text, cited_by_count integer, h_index integer, works_count integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.*, am.cited_by_count, am.h_index, am.works_count
  FROM get_community_filtered(p_ta_id, p_scope_type, p_scope_values, p_states, 2147483647, 0) r
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r.hcp_id
  WHERE (
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
  ORDER BY CASE r.evidence_tier WHEN 'anchored' THEN 1 WHEN 'supported' THEN 2 WHEN 'heme_dominant' THEN 3 WHEN 'candidate' THEN 4 ELSE 5 END,
           COALESCE(r.patient_volume, 0) DESC, r.hcp_id
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_established_filtered(uuid, text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
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

GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer, works_count integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs,
    am.cited_by_count, am.h_index, am.works_count,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
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

GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, rising_composite_score double precision, emergence_pctile double precision, network_influence_pctile double precision, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, institution_state text, state_basis text)
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
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
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

GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, rising_composite_score double precision, emergence_pctile double precision, network_influence_pctile double precision, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer, works_count integer, institution_state text, state_basis text)
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
    am.works_count,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
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

GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_rising_star_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, us_rank integer, rising_star_percentile numeric, momentum_component numeric, visibility_component numeric, scientific_momentum_percentile numeric, network_momentum_percentile numeric, scientific_visibility_percentile numeric, network_visibility_percentile numeric, archetype text, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, scope_rank integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$

  SELECT

    r.hcp_id,

    r.rank,

    r.us_rank,

    r.rising_star_percentile,

    r.momentum_component,

    r.visibility_component,

    r.scientific_momentum_percentile,

    r.network_momentum_percentile,

    r.scientific_visibility_percentile,

    r.network_visibility_percentile,

    r.archetype,

    h.country,

    h.first_name,

    h.last_name,

    h.institution_normalized,

    h.career_first_pub_year_v2 AS career_first_pub_year,

    h.total_career_pubs,

    CASE

      WHEN p_scope_type = 'global' THEN r.rank

      WHEN p_scope_type = 'region' AND 'US' = ANY(p_scope_values) THEN r.us_rank

      ELSE r.rank

    END AS scope_rank,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis

  FROM hcp_rising_star_ranks_v3 r

  JOIN hcps_v2 h ON h.id = r.hcp_id

  WHERE r.therapeutic_area_id = p_ta_id

    AND (

      p_scope_type = 'global'

      OR (p_scope_type = 'region' AND h.country = ANY(p_scope_values))

    )

    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))

    /* p_canonical_theme_ids accepted but not yet wired (v1.1) */

  ORDER BY 

    CASE

      WHEN p_scope_type = 'global' THEN r.rank

      WHEN p_scope_type = 'region' AND 'US' = ANY(p_scope_values) THEN r.us_rank

      ELSE r.rank

    END ASC NULLS LAST

  LIMIT p_limit OFFSET p_offset;

$function$;

GRANT EXECUTE ON FUNCTION public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;
