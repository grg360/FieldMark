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
$function$


(1 row)
