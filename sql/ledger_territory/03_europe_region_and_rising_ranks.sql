-- TA resolved by SLUG, not name (2026-08-15): therapeutic_areas.name became
-- 'Lung Cancer'; the slug stays 'nsclc' and is the stable key. Resolving by
-- name here would return NULL and this would silently emit empty results.
-- Ledger territory, STAGE 3 — the Europe region as reference data, and the 3-score
-- Rising model (country rank / Europe rank / global rank).
--
-- WHY A NEW REGION KEY: 'EU' already exists and means the European UNION (27 members).
-- The ledger territory axis is GEOGRAPHY — the UK, Switzerland, Norway, Iceland, Serbia
-- and Ukraine are Europe regardless of membership. Rather than overload 'EU' (which
-- rising_board() already uses for its own eu_rank) we add 'EUROPE' alongside it. Both
-- coexist; neither is redefined.
--
-- SINGLE SOURCE OF TRUTH: the country list lives HERE, in the database, so the RPC that
-- computes the Europe rank and the frontend chips cannot drift apart. lib/cohortLedger.ts
-- EUROPE_COUNTRIES mirrors this list for the selector labels only — the rank itself is
-- always computed from this table.
--
-- REINGEST-READY:
--   * Both seeds are ON CONFLICT DO UPDATE / DO NOTHING keyed on the natural key, so
--     re-running is a no-op and can never duplicate a row.
--   * No DELETE: a country dropped from this file is NOT removed from the table. That is
--     deliberate — silent removal would silently shrink a board. Removals are explicit.
--   * The RPC below is STABLE, read-only and a pure function of the data.

-- 1. The region itself (FK parent of region_countries).
INSERT INTO regions (region_key, display_name, sort_order, is_global, is_catchall)
VALUES ('EUROPE', 'Europe', 3, false, false)
ON CONFLICT (region_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      sort_order   = EXCLUDED.sort_order,
      is_global    = EXCLUDED.is_global,
      is_catchall  = EXCLUDED.is_catchall;

-- 2. Membership. Geography, not the EU: GB / CH / NO / IS / RS / UA included.
INSERT INTO region_countries (region_key, country_code)
SELECT 'EUROPE', cc FROM unnest(ARRAY[
  'GB','DE','FR','IT','ES','NL','BE','AT','IE','PT','CH','SE','DK','NO',
  'FI','IS','PL','CZ','HU','GR','RO','BG','SK','SI','HR','EE','LV','LT',
  'LU','MT','CY','RS','UA'
]) AS cc
ON CONFLICT (region_key, country_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- rising_ledger — adds country_rank and europe_rank to every row.
-- ─────────────────────────────────────────────────────────────────────────────
-- THE 3-SCORE MODEL. A European rising HCP now carries the same shape a US one does:
--
--     US     : (state territory is a filter, not a rank) · us national rank · global rank
--     Europe : country rank                              · Europe rank      · global rank
--
--   country_rank — row_number over the HCP's OWN effective country
--   europe_rank  — row_number over the whole EUROPE set, NULL for non-European HCPs
--   global_rank  — the stored board rank, untouched
--   rank         — rank within the CURRENT selection; drives ordering and keyset paging.
--                  For a single-country selection it equals country_rank; for Europe (all)
--                  it equals europe_rank. Kept separate so paging never depends on which
--                  of the three a surface happens to display.
--
-- All three are read-time row_number() projections over the stored global rank. This is
-- the same operation that provably reproduces the stored us_rank (123/123). NOTHING is
-- rescored, no board table is written, and no migration stores a derived rank — so these
-- are automatically correct after any reingest that rewrites the board, with no weekly
-- step of their own.
CREATE OR REPLACE FUNCTION public.rising_ledger(
  p_limit integer DEFAULT 1000,
  p_after_rank integer DEFAULT 0,
  p_states text[] DEFAULT '{}'::text[],
  p_countries text[] DEFAULT '{US}'::text[]
)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc'),
  europe as (select country_code from region_countries where region_key = 'EUROPE'),
  -- The whole board with its effective country, once. Both auxiliary ranks are computed
  -- over THIS set (the full board), never over the current selection — so they do not
  -- change as the user slices.
  allb as (
    select r.hcp_id,
           r.rank as global_rank,
           nullif(btrim(coalesce(h.current_country, h.country)), '') as eff,
           r.scientific_momentum_percentile   as scimom,
           r.network_momentum_percentile      as netmom,
           r.scientific_visibility_percentile as scivis,
           r.network_visibility_percentile    as netvis,
           r.rising_star_percentile           as idx,
           r.archetype
    from hcp_rising_star_ranks_v3 r
    join hcps_v2 h on h.id = r.hcp_id
    cross join ta
    where r.therapeutic_area_id = ta.id
  ),
  ranked as (
    select a.*,
           row_number() over (partition by a.eff order by a.global_rank) as country_rank,
           case when a.eff in (select country_code from europe)
                then row_number() over (
                       partition by (a.eff in (select country_code from europe))
                       order by a.global_rank)
           end as europe_rank
    from allb a
  ),
  base as (
    select rk.*, row_number() over (order by rk.global_rank) as rank
    from ranked rk
    where rk.eff = any(p_countries)
  ),
  us as (
    select b.*
    from base b
    join hcps_v2 hs on hs.id = b.hcp_id
    where (cardinality(p_states) = 0 or coalesce(hs.nppes_practice_state, hs.derived_state) = any(p_states))
  ),
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'states', p_states,
    'countries', p_countries,
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, top.global_rank, top.country_rank, top.europe_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               top.eff as scored_country,
               h.country, h.current_country,
               h.affiliation_confidence, h.affiliation_as_of,
               top.scimom, top.netmom, top.scivis, top.netvis, top.idx, top.archetype, top.hcp_id,
               -- Momentum narrative headline: why_now (single-sentence strongest
               -- signal), narrative_text as fallback. Same artifact the rising
               -- profile shows; cohort-keyed to the rising row.
               (
                 select coalesce(n.why_now, n.narrative_text)
                 from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id
                   and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'rising_star'
                 limit 1
               ) as summary
        from top
        join hcps_v2 h on h.id = top.hcp_id
      ) t
    )
  );
$function$;
