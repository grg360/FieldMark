-- Repoint get_established_filtered to hcp_established_ranks_v3.
-- Run each statement below as a STANDALONE query in Supabase SQL editor.
-- Do NOT wrap in BEGIN/COMMIT.

-- =============================================================================
-- 1. Six-arg overload (no themes filter)
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_established_filtered(
  uuid, text, text[], text[], integer, integer
);

CREATE OR REPLACE FUNCTION public.get_established_filtered(
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
    r3.hcp_id,
    r3.rank,
    NULL::integer AS scope_size,
    r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score,
    er2.trial_score,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year,
    h.total_career_pubs
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  LEFT JOIN hcp_established_ranks_v2 er2
    ON er2.hcp_id = r3.hcp_id
    AND er2.therapeutic_area_id = r3.therapeutic_area_id
    AND er2.scope_type = r3.scope_type
    AND er2.scope_value IS NOT DISTINCT FROM r3.scope_value
  WHERE r3.therapeutic_area_id = p_ta_id
    AND r3.scope_type = p_scope_type
    AND r3.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

-- Sanity check (run after statement 1):
-- SELECT hcp_id, rank, composite_score FROM get_established_filtered(
--   'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid,
--   'region', ARRAY['US'], ARRAY[]::text[], 5, 0
-- );
-- Expected top 5 (rank 1-5):
--   cbb24fad-0ab0-4a3f-aa48-39af1a7ca25a  (Jänne)
--   71b51a2d-0f56-434f-abf4-f6755c796eaf  (Ramalingam)
--   d2b9c397-d426-469d-8eab-00f02f21cad4  (Riely)
--   1f8e627b-ac6d-4637-aaa1-de1c54fb8051  (Ou)
--   d5fb18b6-1e17-41bd-a87b-9346211e6098  (Herbst)

-- =============================================================================
-- 2. Seven-arg overload (with themes filter)
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_established_filtered(
  uuid, text, text[], text[], uuid[], integer, integer
);

CREATE OR REPLACE FUNCTION public.get_established_filtered(
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
    r3.hcp_id,
    r3.rank,
    NULL::integer AS scope_size,
    r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score,
    er2.trial_score,
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
  LEFT JOIN hcp_established_ranks_v2 er2
    ON er2.hcp_id = r3.hcp_id
    AND er2.therapeutic_area_id = r3.therapeutic_area_id
    AND er2.scope_type = r3.scope_type
    AND er2.scope_value IS NOT DISTINCT FROM r3.scope_value
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
$function$;

-- Sanity check (run after statement 2):
-- SELECT hcp_id, rank, composite_score FROM get_established_filtered(
--   'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid,
--   'region', ARRAY['US'], ARRAY[]::text[], 5, 0
-- );

-- =============================================================================
-- 3. Reload PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';
