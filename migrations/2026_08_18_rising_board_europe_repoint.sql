-- rising_board: repoint eu_ranked from the European UNION to geographic EUROPE.
-- Date: 2026-08-18. Branch: resurfacing.
-- Revert: sql/revert/2026_08_18_rising_board_europe_repoint_REVERT.sql
--
-- THE DEFECT. Two surfaces answered "how many Europeans are on the rising board?"
-- with two different numbers, and both were live:
--   RisingQuadrant.tsx region="EU"  filters eu_rank != null   -> 48
--   ledger territory  "Europe"      rising_ledger, 33 codes   -> 53
-- Same board, same effective_country expression
-- (NULLIF(BTRIM(COALESCE(current_country, country)), '')), different country list:
-- the union key is 27 members, the geographic one is 33 codes.
--
-- THE FIX is one token in the eu_countries CTE. Everything else in this file is the
-- unchanged pg_get_functiondef body, reproduced so the migration is a single
-- self-contained CREATE OR REPLACE.
--
-- EXPECTED AFTER: eu_rank non-null 48 -> 53; the 5 rows in the gap (GB 1, CH 3,
-- RS 1) gain a rank; rising_board's Europe membership becomes set-equal to
-- rising_ledger's eu:all. us_rank_eff (58) and the global rank are untouched.
--
-- No data is written. STABLE, read-only, no rescore.

BEGIN;

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
  -- GEOGRAPHY, not the European Union (repointed 2026-08-18). This CTE read the
  -- region key for the 27 UNION members, while the ledger's Europe selection has
  -- always passed the 33 geographic EUROPE codes from this same table. Same
  -- effective_country expression on both sides, different country list: the
  -- quadrant showed 48 Europeans against the ledger's 53, and the five in the gap
  -- (GB 1, CH 3, RS 1) carried eu_rank = NULL on a board that placed them in
  -- Europe. sql/ledger_territory/03 added the EUROPE key alongside the union one
  -- rather than overloading it, and named this function as the remaining consumer
  -- of the old key; this is that repoint. Both keys still exist, neither redefined.
  --
  -- Symmetric with us_rank_eff: one country list, read from region_countries, so
  -- rising_board and rising_ledger agree BY CONSTRUCTION rather than by matching
  -- two hand-maintained lists.
  --
  -- The CTE name, the eu_ranked CTE and the eu_rank payload key are DELIBERATELY
  -- unchanged: RisingQuadrant.tsx and risingProfile.ts read eu_rank, and renaming
  -- the key would break both for a cosmetic gain.
  SELECT country_code FROM region_countries WHERE region_key = 'EUROPE'
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
-- Symmetric with eu_ranked above: same row_number() over the stored global rank,
-- taken within the effective-country set. The US set is a single country, so the
-- predicate is an equality where EU's is a membership test; that is the only
-- difference between the two CTEs.
us_ranked AS (
  SELECT hcp_id, row_number() OVER (ORDER BY rank) AS us_rank_eff
  FROM board WHERE effective_country = 'US'
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
             'hcp_id', b.hcp_id, 'rank', b.rank,
             -- STORED, scored against the historical country. Untouched, still here.
             'us_rank', b.us_rank,
             -- READ-TIME, over effective_country. The EU-symmetric reading.
             'us_rank_eff', u.us_rank_eff,
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
           FROM board b
           LEFT JOIN eu_ranked e ON e.hcp_id = b.hcp_id
           LEFT JOIN us_ranked u ON u.hcp_id = b.hcp_id),
  'band_mix', (SELECT jsonb_agg(jsonb_build_object(
                 'band', band, 'archetype', archetype, 'n', n))
               FROM band_mix)
)
$function$

;

COMMIT;
