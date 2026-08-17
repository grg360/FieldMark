-- REVERT ARTIFACT — pg_get_functiondef captured 2026-08-17, BEFORE us_rank_eff was
-- added (migrations/2026_08_17_rising_board_us_rank_eff.sql).
--
-- What this file restores:
--   The payload WITHOUT the 'us_rank_eff' key and WITHOUT the us_ranked CTE. Every
--   other key -- including the stored `us_rank` -- is byte-identical either side of
--   that migration, which adds a key and removes nothing.
--
-- CONSUMER NOTE: restoring this file makes rows[].us_rank_eff undefined. The only
-- reader is RisingQuadrant.tsx (region scoping + usCount); with the key gone its US
-- scope goes empty rather than falling back, so revert the component in the same
-- step. Nothing else on the platform reads us_rank_eff.
--
-- NOT restored by this file, because the migration never touched it:
--   hcp_rising_star_ranks_v3.us_rank -- the stored, scored column. No board write
--   happened, so there is no board state to roll back.
--
-- Restoring this file restores the pre-migration definition exactly.

CREATE OR REPLACE FUNCTION public.rising_board()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         -- Institution must agree with the country the row is PLACED by, or the cell
         -- contradicts itself: one mover rendered as "Biomarker Technologies (China) · FR"
         -- because the geo cell followed current_country while this column still read the
         -- historical institution. current_institution is constrained to the winning
         -- country by the re-derivation, so the two are coherent by construction.
         COALESCE(h.current_institution, h.institution_normalized) AS institution,
         h.institution_normalized AS institution_historical,
         h.country,
         h.current_country,
         -- The location the ledger actually places this person by.
         NULLIF(BTRIM(COALESCE(h.current_country, h.country)), '') AS effective_country,
         h.affiliation_confidence,
         h.affiliation_as_of,
         h.nppes_practice_state AS state,
         h.career_first_pub_year
  FROM hcp_rising_star_ranks_v3 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = (SELECT id FROM ta)
),
eu_ranked AS (
  SELECT hcp_id, row_number() OVER (ORDER BY rank) AS eu_rank
  FROM board WHERE effective_country IN (SELECT country_code FROM eu_countries)
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
             'institution_historical', b.institution_historical,
             'country', b.country,
             'current_country', b.current_country,
             'effective_country', b.effective_country,
             'affiliation_confidence', b.affiliation_confidence,
             'affiliation_as_of', b.affiliation_as_of,
             'state', b.state,
             'career_first_pub_year', b.career_first_pub_year
           ) ORDER BY b.rank)
           FROM board b LEFT JOIN eu_ranked e ON e.hcp_id = b.hcp_id),
  'band_mix', (SELECT jsonb_agg(jsonb_build_object(
                 'band', band, 'archetype', archetype, 'n', n))
               FROM band_mix)
)
$function$

;
