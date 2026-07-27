-- Community qualification gate — read layer only, NSCLC ONLY (2026-07-25).
--
-- An NSCLC HCP qualifies for the Community board only if:
--     patient_volume >= 500 OR pharma_engagement > 0
--
-- Rationale: ~1,414 NSCLC HCPs have zero patient volume AND zero pharma
-- engagement, ranking onto the board via the career-stage floor alone —
-- misclassified academics (Ozols, Karp, Shanafelt), not community clinicians.
-- The 500 floor also removes the sub-500 volume tail scoring on the same
-- floor. NSCLC: 4,722 of 6,480 qualify.
--
-- TA SCOPING: the 500 floor was derived from NSCLC's patient-volume
-- distribution ONLY. Other TAs are deliberately ungated (rare disease is
-- inherently low-volume — a blanket 500 floor cut its board by 71%). When a TA
-- becomes visible, examine its distribution and set its own floor, extending
-- the predicate per-TA.
--
-- hcp_community_ranks_v2 / hcp_community_scores_v2 are NOT modified — this is
-- a WHERE clause on reads. All FOUR overloads across both RPCs carry the gate:
-- get_community_filtered (legacy 6-param and themed 7-param) and
-- get_community_filtered_count (legacy 4-param and themed 5-param). The line
-- added to each, immediately after the p_states clause, is:
--
--     AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid
--          OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0)
--
-- ('c0065b03-…' = NSCLC. The leading <> branch makes the gate a no-op for
-- every other TA's rows.) Functions carrying the gate:
--   * public.get_community_filtered(p_ta_id, p_scope_type, p_scope_values, p_states, p_limit, p_offset)
--   * public.get_community_filtered(p_ta_id, p_scope_type, p_scope_values, p_states, p_canonical_theme_ids, p_limit, p_offset)
--   * public.get_community_filtered_count(p_ta_id, p_scope_type, p_scope_values, p_states)
--   * public.get_community_filtered_count(p_ta_id, p_scope_type, p_scope_values, p_states, p_canonical_theme_ids)
--
-- Applied to the live DB on 2026-07-25 via CREATE OR REPLACE on each
-- function's pg_get_functiondef output. The full live definitions (captured
-- 2026-07-27 via pg_get_functiondef) follow below with their grants — running
-- this file restores all four functions outright; no hand-editing needed.
--
-- The same TA-scoped predicate exists at the app read layer (as the PostgREST
-- .or() string `therapeutic_area_id.neq.<nsclc-id>,patient_volume.gte.500,
-- pharma_engagement.gt.0`, shared constant COMMUNITY_GATE_OR):
--   frontend/src/lib/api.ts — profile cohort resolution (hcp_community_ranks_v2 read)
--   frontend/src/lib/api.ts — getCommunityScoreBreakdown (global-scope rank read)
--   frontend/src/lib/api.ts — searchHCPs (post-filter on community-classified matches)
--   scripts/narrative/generate_narratives_v2.py — fetch_community_top_hcp_ids (batch)
--   scripts/narrative/generate_narratives_v2.py — single-HCP community cross-check
--
-- Deliberately ungated: scripts/utilities/take_weekly_snapshot.py (archives raw
-- table state) and watchlist/tracked-HCP chips (user-curated relationships).

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, patient_volume numeric, pharma_engagement numeric, group_practice_signal numeric, career_years numeric, publication_signal numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT 
    cr.hcp_id, cr.rank, cr.scope_size, cr.normalized_score, cr.composite_score,
    cr.patient_volume, cr.pharma_engagement, cr.group_practice_signal,
    cr.career_years, cr.publication_signal,
    cr.country, cr.first_name, cr.last_name, cr.institution_normalized,
    cr.career_first_pub_year, cr.total_career_pubs,
    cr.nppes_practice_city, cr.nppes_practice_state, cr.nppes_practice_setting, cr.npi_specialty
  FROM hcp_community_ranks_v2 cr
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0)
  ORDER BY cr.rank
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, patient_volume numeric, pharma_engagement numeric, group_practice_signal numeric, career_years numeric, publication_signal numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text, cited_by_count integer, h_index integer, works_count integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT 
    cr.hcp_id, cr.rank, cr.scope_size, cr.normalized_score, cr.composite_score,
    cr.patient_volume, cr.pharma_engagement, cr.group_practice_signal,
    cr.career_years, cr.publication_signal,
    cr.country, cr.first_name, cr.last_name, cr.institution_normalized,
    cr.career_first_pub_year, cr.total_career_pubs,
    cr.nppes_practice_city, cr.nppes_practice_state, cr.nppes_practice_setting, cr.npi_specialty,
    am.cited_by_count, am.h_index, am.works_count
  FROM hcp_community_ranks_v2 cr
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = cr.hcp_id
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0)
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = cr.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY cr.normalized_score DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[])
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM hcp_community_ranks_v2 cr
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0);
$function$;

CREATE OR REPLACE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM hcp_community_ranks_v2 cr
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0)
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = cr.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[], uuid[]) TO anon, authenticated;
