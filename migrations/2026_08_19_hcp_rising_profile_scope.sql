-- hcp_rising_profile: resolve est_us US-else-global, and carry the country.
-- Date: 2026-08-19. Branch: resurfacing.
-- Revert: sql/revert/2026_08_19_hcp_rising_profile_scope_REVERT.sql
--
-- Companion to migrations/2026_08_19_hcp_profile_brief_scope.sql -- the same two
-- defects in the rising profile's own RPC:
--
-- 1. est_us was pinned to region/US, so a dual-board member with no US row fell into
--    the ESTABLISHED STANDING card's empty branch, which prints "NOT ON THE
--    ESTABLISHED BOARD" and a chip reading "NO ESTABLISHED RANK" -- directly above
--    body text stating the person's global established rank. The heading was wrong and
--    the paragraph beneath it was right.
--
-- 2. The payload carried `country` (historical) but not the effective country the rest
--    of the product places people by, so the Federal Funding section had nothing to
--    gate on.
--
-- No data is written. STABLE, read-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.hcp_rising_profile(p_hcp_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH ta AS (
  SELECT id FROM therapeutic_areas WHERE slug = 'nsclc' LIMIT 1
),
r AS (
  SELECT * FROM hcp_rising_star_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
h AS (
  SELECT id, first_name, last_name, preferred_display_name,
         institution_normalized, country, nppes_practice_state,
         nppes_practice_city, career_first_pub_year, npi_number,
         -- Effective country for the US-only section gates (2026-08-19). `country`
         -- above is the HISTORICAL value; this is what the ledger and rising_board
         -- place people by, and it is what Federal Funding / Medicare / Open Payments
         -- must gate on so a non-US record stops rendering a US registry's absence.
         nullif(btrim(coalesce(current_country, country)), '') AS effective_country
  FROM hcps_v2 WHERE id = p_hcp_id
),
sm AS (
  SELECT * FROM hcp_scientific_momentum_v1
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
nm AS (
  SELECT * FROM hcp_network_momentum_v1
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
nar AS (
  -- Cohort-keyed read: this surface renders the rising spine, so it reads the
  -- rising narrative. A dual-board member's established narrative coexists on
  -- its own row and is never consulted here.
  SELECT narrative_text, generated_at, prompt_version, source_enrichment_run_id,
         narrative_is_current('rising_star', prompt_version) AS is_current
  FROM hcp_narratives_v2
  WHERE hcp_id = p_hcp_id AND therapeutic_area_slug = 'nsclc'
    AND cohort = 'rising_star'
  LIMIT 1
),
est_us AS (
  -- US ROW IF THERE IS ONE, OTHERWISE GLOBAL (2026-08-19), with the scope named.
  -- Pinned to region/US this returned nothing for a non-US dual-board member, so the
  -- ESTABLISHED STANDING card fell to its empty branch and printed "NOT ON THE
  -- ESTABLISHED BOARD" above body text that said, correctly, that the person was
  -- ranked on the global board. The heading contradicted its own paragraph.
  --
  -- scope_label follows the ledger's convention. THE CARD MUST RENDER IT: its numerals
  -- and prose hardcode "US" in four places, and with this fallback in place an
  -- unmodified card would print "#3 US" for a German -- a false claim in place of a
  -- blank, which is worse. The name est_us is kept so the payload key does not move.
  SELECT rank, cohort_score,
         CASE WHEN scope_type = 'global' THEN 'GLOBAL' ELSE scope_value END AS scope_label
  FROM hcp_established_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND (scope_type = 'global' OR (scope_type = 'region' AND scope_value = 'US'))
  ORDER BY CASE WHEN scope_type = 'region' THEN 0 ELSE 1 END
  LIMIT 1
),
est_gl AS (
  SELECT rank, cohort_score FROM hcp_established_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND scope_type = 'global'
),
pos AS (
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE author_role = 'first_author')::int AS first_basis,
         count(*) FILTER (WHERE author_role = 'senior_author')::int AS senior_basis
  FROM hcp_scientific_positions_v1
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
lead AS (
  SELECT senior_pub_count, first_pub_count FROM hcp_publication_leadership_v2
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
collab_total AS (
  SELECT count(*)::int AS n FROM hcp_top_collaborators_v2
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND window_type = '10yr'
),
band AS (
  -- archetype mix inside this HCP's rank band, for the archetype panel note
  SELECT count(*)::int AS band_total,
         count(*) FILTER (WHERE b.archetype = (SELECT archetype FROM r))::int AS band_same_archetype
  FROM hcp_rising_star_ranks_v3 b
  WHERE b.therapeutic_area_id = (SELECT id FROM ta)
    AND CASE
          WHEN (SELECT rank FROM r) <= 100 THEN b.rank <= 100
          WHEN (SELECT rank FROM r) <= 300 THEN b.rank > 100 AND b.rank <= 300
          WHEN (SELECT rank FROM r) <= 600 THEN b.rank > 300 AND b.rank <= 600
          ELSE b.rank > 600
        END
),
collabs AS (
  SELECT jsonb_agg(jsonb_build_object(
           'rank', c.rank,
           'hcp_id', c.collaborator_hcp_id,
           'name', trim(coalesce(ch.first_name, '') || ' ' || coalesce(ch.last_name, '')),
           'institution', ch.institution_normalized,
           'shared_publications', c.shared_publications,
           'est_us_rank', eu.rank,
           'est_us_score', eu.cohort_score,
           'est_global_rank', eg.rank,
           'est_global_score', eg.cohort_score,
           'rising_us_rank', rr.us_rank,
           'rising_global_rank', rr.rank,
           'cohort_class', cc.cohort
         ) ORDER BY c.rank) AS arr
  FROM hcp_top_collaborators_v2 c
  JOIN hcps_v2 ch ON ch.id = c.collaborator_hcp_id
  LEFT JOIN hcp_established_ranks_v3 eu
    ON eu.hcp_id = c.collaborator_hcp_id
   AND eu.therapeutic_area_id = c.therapeutic_area_id
   AND eu.scope_type = 'region' AND eu.scope_value = 'US'
  LEFT JOIN hcp_established_ranks_v3 eg
    ON eg.hcp_id = c.collaborator_hcp_id
   AND eg.therapeutic_area_id = c.therapeutic_area_id
   AND eg.scope_type = 'global'
  LEFT JOIN hcp_rising_star_ranks_v3 rr
    ON rr.hcp_id = c.collaborator_hcp_id
   AND rr.therapeutic_area_id = c.therapeutic_area_id
  LEFT JOIN LATERAL (
    SELECT cohort FROM hcp_cohort_classification_v2 x
    WHERE x.hcp_id = c.collaborator_hcp_id LIMIT 1
  ) cc ON true
  WHERE c.hcp_id = p_hcp_id
    AND c.therapeutic_area_id = (SELECT id FROM ta)
    AND c.window_type = '10yr'
    AND c.rank <= 5
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM r) THEN NULL
ELSE jsonb_build_object(
  'hcp',                 (SELECT to_jsonb(h) FROM h),
  'rising',              (SELECT to_jsonb(r) FROM r),
  'momentum',            (SELECT to_jsonb(sm) FROM sm),
  'network',             (SELECT to_jsonb(nm) FROM nm),
  'narrative',           (SELECT to_jsonb(nar) FROM nar),
  'narrative_current',   (SELECT (nar.source_enrichment_run_id IS NOT DISTINCT FROM sm.enrichment_run_id)
                          FROM nar, sm),
  'established_us',      (SELECT to_jsonb(est_us) FROM est_us),
  'established_global',  (SELECT to_jsonb(est_gl) FROM est_gl),
  'positions',           (SELECT to_jsonb(pos) FROM pos),
  'leadership',          (SELECT to_jsonb(lead) FROM lead),
  'collaborators',       coalesce((SELECT arr FROM collabs), '[]'::jsonb),
  'collaborator_rows_10yr', (SELECT n FROM collab_total),
  'band_total',          (SELECT band_total FROM band),
  'band_same_archetype', (SELECT band_same_archetype FROM band)
) END
$function$

;

COMMIT;
