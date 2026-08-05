-- Rising surface RPCs (2026-08-05). Layout authority: docs/design/Rising Surface.dc.html
--
-- hcp_rising_profile(p_hcp_id): everything the rising profile renders, one call.
--   NULL when the HCP is not on the rising board (dispatch treats that as
--   "not rising"). Collaborators carry the four-state standing resolution:
--   ESTABLISHED (US row) → ESTABLISHED·GLOBAL (global row only) → RISING (on
--   the rising board) → EARLIER (no row at any board; cohort classification
--   attached so the surface can say "rising-eligible", never render a blank).
--
-- rising_board(): the full board for the rising ledger — per-row identity,
--   archetype, composite percentile, components (for the quadrant), region
--   tags (US = us_rank present; EU = hcps_v2.country in region_countries 'EU')
--   with an EU-scoped rank computed by row_number, plus the board-wide
--   archetype-by-band mix.
--
-- SECURITY DEFINER + explicit grants: same pattern as hcp_profile_brief /
-- hcp_profile_spine — the underlying tables are not all anon-readable.

CREATE OR REPLACE FUNCTION public.hcp_rising_profile(p_hcp_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
         nppes_practice_city, career_first_pub_year, npi_number
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
  SELECT narrative_text, generated_at, prompt_version, source_enrichment_run_id
  FROM hcp_narratives_v2
  WHERE hcp_id = p_hcp_id AND therapeutic_area_slug = 'nsclc'
  LIMIT 1
),
est_us AS (
  SELECT rank, cohort_score FROM hcp_established_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND scope_type = 'region' AND scope_value = 'US'
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
$$;

GRANT EXECUTE ON FUNCTION public.hcp_rising_profile(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rising_board()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH ta AS (
  SELECT id FROM therapeutic_areas WHERE slug = 'nsclc' LIMIT 1
),
eu_countries AS (
  SELECT country_code FROM region_countries WHERE region_key = 'EU'
),
board AS (
  SELECT r.hcp_id, r.rank, r.us_rank, r.archetype,
         r.rising_star_percentile, r.momentum_component, r.visibility_component,
         trim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')) AS name,
         h.institution_normalized AS institution,
         h.country, h.nppes_practice_state AS state, h.career_first_pub_year
  FROM hcp_rising_star_ranks_v3 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = (SELECT id FROM ta)
),
eu_ranked AS (
  SELECT hcp_id, row_number() OVER (ORDER BY rank) AS eu_rank
  FROM board WHERE country IN (SELECT country_code FROM eu_countries)
),
band_mix AS (
  SELECT CASE WHEN rank <= 100 THEN '1-100'
              WHEN rank <= 300 THEN '101-300'
              WHEN rank <= 600 THEN '301-600'
              ELSE '600+' END AS band,
         archetype, count(*)::int AS n
  FROM board GROUP BY 1, 2
)
SELECT jsonb_build_object(
  'rows', (SELECT jsonb_agg(jsonb_build_object(
             'hcp_id', b.hcp_id, 'rank', b.rank, 'us_rank', b.us_rank,
             'eu_rank', e.eu_rank,
             'archetype', b.archetype,
             'pctl', b.rising_star_percentile,
             'mom', b.momentum_component, 'vis', b.visibility_component,
             'name', b.name, 'institution', b.institution,
             'country', b.country, 'state', b.state,
             'career_first_pub_year', b.career_first_pub_year
           ) ORDER BY b.rank)
           FROM board b LEFT JOIN eu_ranked e ON e.hcp_id = b.hcp_id),
  'band_mix', (SELECT jsonb_agg(jsonb_build_object(
                 'band', band, 'archetype', archetype, 'n', n))
               FROM band_mix)
)
$$;

GRANT EXECUTE ON FUNCTION public.rising_board() TO anon, authenticated, service_role;
