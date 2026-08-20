-- ============================================================================
-- rising_board() — add us_rank_eff, the US read-time rank over the EFFECTIVE
-- country set. Date: 2026-08-17   Branch: resurfacing
--
-- Revert: sql/revert/2026_08_17_rising_board_us_rank_eff_REVERT.sql
--
-- ── The asymmetry this closes ───────────────────────────────────────────────
-- This function already computes eu_rank at read time from effective_country
-- (COALESCE(current_country, country)) — see sql/affiliation/04_rising_board_
-- current_country.sql. It had no US counterpart, so the US side had only the
-- STORED us_rank on hcp_rising_star_ranks_v3, which places by the historical
-- `country` the board was scored against.
--
-- The result was two definitions of "US" on one screen. RisingQuadrant filtered
-- and sorted on the stored column and showed 57; rising_ledger scopes on the
-- effective country and shows 58, as does ledger_meta since
-- migrations/2026_08_17_ledger_meta_country_repoint.sql. That migration's own
-- note flagged the quadrant as KNOWN, NOT FIXED — "repointing it needs a
-- replacement sort key, not just a replacement filter." us_rank_eff IS that
-- replacement sort key.
--
-- The three rows that differ, measured 2026-08-17:
--   Misako Nagasaka  country JP -> current US  (effective US, no stored us_rank)
--   Aliyah Pabani    country CA -> current US  (effective US, no stored us_rank)
--   Ruyang Zhang     country US -> current CN  (stored us_rank 53, effective CN)
--   57 - 1 + 2 = 58.
--
-- ── Why this is not a board change ──────────────────────────────────────────
-- us_ranked is the eu_ranked CTE with its country predicate changed, nothing
-- more: the same row_number() over the same stored global `rank`, taken within
-- the effective-country set. This makes the US path match what EU has always
-- done rather than introducing a new pattern.
--
-- hcp_rising_star_ranks_v3.us_rank is NOT touched and is STILL RETURNED in the
-- payload, unchanged, alongside the new key. It is a scored artifact and the
-- Tier-1 migration deferred it deliberately; consumers that want membership-as-
-- scored keep reading it. This migration adds a key and removes none, so it is
-- additive for every existing reader.
--
-- Supersedes nothing in 04_rising_board_current_country.sql: its statement that
-- "us_rank is deliberately LEFT ALONE" remains true of the stored column. What
-- changes is that the function now also offers the effective-country reading,
-- which 04 computed for EU only.
-- ============================================================================

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
$function$;
