-- ############################################################################
-- SUPERSEDED (2026-08-12) — DO NOT APPLY. Every body below reads
-- hcp_community_ranks_v2, which is retired (DROP staged in
-- drop_hcp_community_ranks_v2.sql). Live sources of record:
--   * get_community_filtered (rows, both overloads)  -> sql/community_roster_v1.sql
--   * get_community_filtered_count (both overloads)  -> sql/community_count_rpc_board_repoint.sql
-- Kept for the G2-cutover history recorded in the header below.
-- ############################################################################
--
-- Community qualification gate — read layer only, NSCLC ONLY.
--
-- G2 CUTOVER (2026-08-11): membership truth moved to the view
-- community_board_nsclc_v1 (one row per US-NSCLC-scored HCP; qualifies =
-- patient_volume > 0 OR any hcp_part_d_oncology_v1 row — 4,913 members).
-- These RPCs no longer re-derive a predicate; they defer to the view:
--
--     AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid
--          OR EXISTS (SELECT 1 FROM community_board_nsclc_v1 b
--                     WHERE b.hcp_id = cr.hcp_id AND b.qualifies))
--
-- The superseded inline predicate (patient_volume >= 500 OR
-- pharma_engagement > 0, 2026-07-25, 5,3xx members) double-counted pharma
-- (gate + scoring weight) and was blind to D-only prescribers; G2 admits 543
-- claims-footprint joiners and drops 989 pharma-only qualifiers (zero
-- volume-qualified members leave).
--
-- TA SCOPING unchanged: G2 is NSCLC-only ('c0065b03-…' = NSCLC; the leading
-- <> branch keeps every other TA ungated — rare disease is inherently
-- low-volume, a blanket floor cut its board by 71%).
--
-- hcp_community_ranks_v2 / hcp_community_scores_v2 are NOT modified — this is
-- a WHERE clause on reads. All FOUR overloads across both RPCs carry the
-- membership check: get_community_filtered (legacy 6-param and themed
-- 7-param) and get_community_filtered_count (legacy 4-param and themed
-- 5-param). Functions carrying it:
--   * public.get_community_filtered(p_ta_id, p_scope_type, p_scope_values, p_states, p_limit, p_offset)
--   * public.get_community_filtered(p_ta_id, p_scope_type, p_scope_values, p_states, p_canonical_theme_ids, p_limit, p_offset)
--   * public.get_community_filtered_count(p_ta_id, p_scope_type, p_scope_values, p_states)
--   * public.get_community_filtered_count(p_ta_id, p_scope_type, p_scope_values, p_states, p_canonical_theme_ids)
--
-- STATUS: these G2 definitions are the PROPOSED source of record — NOT yet
-- applied to the live DB (live functions still carry the 2026-07-25 inline
-- predicate). On cutover approval, apply by running this file: every
-- statement is CREATE OR REPLACE + GRANT, idempotent, no hand-editing needed.
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
    -- Community membership (read-layer), NSCLC ONLY: G2, served by
    -- community_board_nsclc_v1.qualifies — the single source of membership.
    -- Other TAs stay ungated (the leading <> branch is their no-op).
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR EXISTS (SELECT 1 FROM community_board_nsclc_v1 b WHERE b.hcp_id = cr.hcp_id AND b.qualifies))
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
    -- Community membership (read-layer), NSCLC ONLY: G2, served by
    -- community_board_nsclc_v1.qualifies — the single source of membership.
    -- Other TAs stay ungated (the leading <> branch is their no-op).
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR EXISTS (SELECT 1 FROM community_board_nsclc_v1 b WHERE b.hcp_id = cr.hcp_id AND b.qualifies))
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
    -- Community membership (read-layer), NSCLC ONLY: G2, served by
    -- community_board_nsclc_v1.qualifies — the single source of membership.
    -- Other TAs stay ungated (the leading <> branch is their no-op).
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR EXISTS (SELECT 1 FROM community_board_nsclc_v1 b WHERE b.hcp_id = cr.hcp_id AND b.qualifies));
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
    -- Community membership (read-layer), NSCLC ONLY: G2, served by
    -- community_board_nsclc_v1.qualifies — the single source of membership.
    -- Other TAs stay ungated (the leading <> branch is their no-op).
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR EXISTS (SELECT 1 FROM community_board_nsclc_v1 b WHERE b.hcp_id = cr.hcp_id AND b.qualifies))
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
