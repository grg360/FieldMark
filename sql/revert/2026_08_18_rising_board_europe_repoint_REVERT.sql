-- REVERT ARTIFACT for the rising_board Europe repoint. Date: 2026-08-18
-- Branch: resurfacing
--
-- Covers: migrations/2026_08_18_rising_board_europe_repoint.sql
--
-- CAPTURED BEFORE ANYTHING WAS APPLIED, straight from pg_get_functiondef on the
-- live database. Verifiably pre-change: the body below selects the European UNION
-- region key and contains zero occurrences of the geographic EUROPE one.
--
-- WHAT THE CHANGE DID, AND WHAT THIS UNDOES
--   rising_board's eu_countries CTE read the union key (27 members). The repoint
--   moves it to the geographic key (33 codes), which is the list rising_ledger's
--   Europe selection already passes. Restoring the body below puts eu_rank back on
--   the 27-country population.
--
-- BASELINES MEASURED PRE-CHANGE (live, NSCLC):
--   rising_board  total rows            251
--                 eu_rank non-null       48   <- returns to this on revert
--                 us_rank_eff non-null   58   (untouched by this change)
--   rising_ledger eu:all (33 codes)      53
--
-- The five rows that gain an eu_rank under the change, and lose it again on revert:
--   rank 114  GB  Fabio Gomes
--   rank 127  CH  Sabine Schmid
--   rank 169  CH  Alfredo Addeo
--   rank 213  CH  Patrizia Froesch
--   rank 249  RS  Dragana J. Jovanovic
--
-- DATA: none. This is a STABLE read-only function over region_countries and
-- hcp_rising_star_ranks_v3. Nothing is rescored, nothing is stored, no row is
-- written -- eu_rank is a read-time row_number(). Reverting is complete and
-- instant; there is no data half to this change.
--
-- CONSUMER NOTE -- the frontend needs NO revert alongside this one. The payload key
-- eu_rank is unchanged, so RisingQuadrant.tsx and risingProfile.ts keep working
-- either way; they simply show 48 again instead of 53. The one frontend edit that
-- ships with this piece (CohortLedger.tsx:1280 "#N EU" -> "#N EUROPE") is a label
-- on rising_ledger's europe_rank, NOT on this function's eu_rank -- it is correct
-- independently of this repoint and does not need reverting with it.

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
