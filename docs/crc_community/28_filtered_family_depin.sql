/* ==== 28. REMOVE THE NSCLC UUID FROM THE FOUR COMMUNITY OVERLOADS ====
   CRC_COMMUNITY_BUILD.md phase 5 item 3. Closes TA_GENERALIZATION_INVENTORY.md
   W3.

   THE DEFECT. All four overloads take p_ta_id and then ignore it:

       WHERE p_ta_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid

   That is not a filter on the data, it is a filter on the ARGUMENT. Pass the
   colorectal uuid and the predicate is false, so the function returns zero rows
   -- correctly typed, correctly granted, empty. TA_NEUTRAL_DB_LAYER.md section
   A.3 calls this the sharpest illustration in the codebase of why the rename
   and the parameter have to land together: parameterising alone produced a
   function that ACCEPTS a TA and IGNORES it.

   The literal survived the 2026-09-02 filtered-family rewrite -- see
   docs/state_provenance/04_filtered_family.sql:73, which is the current text
   these bodies are diffed against. A rewrite is not a de-pin.

   WHAT CHANGES IN EACH BODY, AND NOTHING ELSE CHANGES:
     1.  FROM community_board_nsclc_v1 b   ->   FROM community_board_v1 b
     2.  WHERE p_ta_id = '<nsclc uuid>'    ->   WHERE b.ta_id = p_ta_id
   Column lists, join order, ORDER BY, LIMIT/OFFSET, the theme EXISTS subquery
   and the return types are transcribed unchanged from the live definitions read
   on 2026-09-07.

   THE ARGUMENT BECOMES LOAD-BEARING, WHICH IS THE POINT AND ALSO THE RISK. Once
   `b.ta_id = p_ta_id` is a real predicate, every TA with a board is reachable
   through these functions. What stops that from being four TAs instead of two is
   the ta_evidence_tier_config join inside community_board_v1 (block 27), not
   anything in this file. Applying this file WITHOUT blocks 25 to 27 would give
   hepatology a 13,191-member community board. Run them in order.

   ON THE ORDER BY. The tier ranking below still spells the nsclc_v1 vocabulary:
   anchored 1, supported 2, heme_dominant 3, candidate 4, everything else 5. It
   is left as it is because it happens to be a correct TOTAL order over both
   vocabularies -- partd_presence_v1 emits only candidate and unresolved, which
   land on 4 and 5 in the right relative order. That is a coincidence that holds
   for two models and will not survive a third with a tier between supported and
   candidate. Tier priority belongs in ta_evidence_tier_config next to
   tier_model; it is not put there today because doing so would change the
   ORDER BY of the live lung board, and this file's job is to not do that. Logged
   as an amendment. */

/* ---- 1 of 4: get_community_filtered, six arguments ---- */

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
  FROM community_board_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE b.ta_id = p_ta_id
    AND b.qualifies
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY CASE b.evidence_tier WHEN 'anchored' THEN 1 WHEN 'supported' THEN 2 WHEN 'heme_dominant' THEN 3 WHEN 'candidate' THEN 4 ELSE 5 END,
           COALESCE(b.patient_volume, 0) DESC, b.hcp_id
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO service_role;

/* ---- 2 of 4: get_community_filtered, seven arguments (themed) ----
   THIS ONE NEVER HELD THE LITERAL. It delegates to the six-argument overload
   above and inherits the de-pin from it. It is recreated anyway so that this
   file is the complete source of record for the family -- and because it is
   dropped and recreated, its three grants are restored below like the rest.
   Body transcribed unchanged; p_scope_type and p_scope_values are forwarded and,
   as in the live definition, do no filtering. */

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

/* ---- 3 of 4: get_community_filtered_count, four arguments ----
   Live text from sql/community_count_rpc_board_repoint.sql. Unlike the rows
   overload this one DOES filter on country via p_scope_values, and that clause
   is preserved verbatim. It is redundant while community_board_v1 is US-only,
   and it is left in place because removing a redundant filter and removing a
   wrong one look identical in a diff. */

DROP FUNCTION IF EXISTS public.get_community_filtered_count(uuid, text, text[], text[]);

CREATE OR REPLACE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[])
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM community_board_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE b.qualifies
    AND b.ta_id = p_ta_id
    AND p_scope_type = 'region'
    AND h.country = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$function$;

GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[]) TO service_role;

/* ---- 4 of 4: get_community_filtered_count, five arguments (themed) ---- */

DROP FUNCTION IF EXISTS public.get_community_filtered_count(uuid, text, text[], text[], uuid[]);

CREATE OR REPLACE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM community_board_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE b.qualifies
    AND b.ta_id = p_ta_id
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

GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[], uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered_count(uuid, text, text[], text[], uuid[]) TO service_role;

/* Both counts, both TAs, US scope -- the numbers the Community tab will show.
   Expect nsclc 4,915 and colorectal-cancer 116. */
SELECT ta.slug,
       public.get_community_filtered_count(ta.id, 'region', ARRAY['US'], ARRAY[]::text[]) AS us_members
FROM public.therapeutic_areas ta
WHERE ta.slug IN ('nsclc', 'colorectal-cancer')
ORDER BY ta.slug;
