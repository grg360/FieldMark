-- rising_ledger: expand ANY aggregate region sentinel, not the EUROPE literal.
-- Date: 2026-08-18. Branch: resurfacing.
-- Revert: sql/revert/2026_08_18_rising_ledger_generalise_REVERT.sql
-- Requires: migrations/2026_08_18_regions_aggregate_scope.sql (regions.aggregate_scope)
--
-- WHAT CHANGES. p_countries carrying a region key (rather than ISO codes) selects that
-- region's whole country set. That was written for EUROPE as a literal on 2026-08-18;
-- an APAC sentinel would have matched no country and returned an empty ledger with no
-- error. The test is now membership in regions.aggregate_scope, so APAC -- and any
-- region flagged later -- works without touching this function again.
--
-- scope_label follows the same generalisation: it names the selected aggregate
-- (EUROPE, APAC, ...) instead of the hardcoded string.
--
-- europe_rank IS DELIBERATELY LEFT EUROPE-SPECIFIC. It is a COMPANION rank -- the
-- "#12 EUROPE" chip a European carries on any board -- not a scope, and generalising
-- it means a per-row region lookup and a dynamic chip label on the frontend. An APAC
-- row therefore carries no aggregate companion rank today. Separate change.
--
-- BEHAVIOUR IS UNCHANGED FOR EVERY EXISTING SELECTION: EUROPE is flagged, so the
-- sentinel resolves as before; US and plain country lists never matched the literal.
-- Verified by diffing full {US}, {DE}, {EUROPE} and global payloads before and after.
--
-- No data is written. STABLE, read-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.rising_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc'),
  -- Same '__global__' sentinel as established_ledger. Rising's rank is already a
  -- read-time row_number() over the stored global rank, so a global selection is
  -- simply the whole board with no country predicate -- no new scoring needed.
  -- EUROPE AGGREGATE SENTINEL (2026-08-18), the same shape as '__global__' above
  -- and for the same reason: a sentinel inside p_countries rather than a new
  -- parameter, which would mean DROP + CREATE on a live SECURITY DEFINER RPC.
  -- 'EUROPE' is not an ISO country code, so it cannot collide with a real country.
  --
  -- WHY RISING NEEDS AN EXPANSION WHERE ESTABLISHED NEEDS A BUCKET. Rising's rank
  -- is a read-time row_number() over whatever pool is selected, so all-Europe is
  -- correct the moment the predicate admits the 33 countries -- nothing is scored
  -- or stored. Established ranks are normalised WITHIN a stored scope, so its
  -- all-Europe board had to be scored as its own bucket by
  -- recompute_established_ranks_v3.py. Same selector key, two different mechanisms.
  -- ANY AGGREGATE REGION, from data (2026-08-18). This was a literal test for the
  -- 'EUROPE' sentinel; APAC would have matched no country and returned an EMPTY
  -- LEDGER, silently -- the exact failure the Europe revert artifact warned about.
  -- agg_key is the selected aggregate's region key, or NULL when the selection is a
  -- plain country list. sort_order breaks a tie if a caller ever sends two aggregates;
  -- the menu cannot produce that, and picking the first is better than a cross join.
  sel as (select ('__global__' = any(p_countries)) as is_global,
                 (select g.region_key from regions g
                   where g.aggregate_scope and g.region_key = any(p_countries)
                   order by g.sort_order, g.region_key limit 1) as agg_key),
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
    cross join sel
    -- Three ways in, checked in widening order: the whole board, the geographic
    -- Europe set expanded from region_countries, or an explicit country list. The
    -- sentinel is expanded HERE rather than by the caller so the country list has
    -- exactly one home (region_countries) shared with rising_board and the scorer.
    where (sel.is_global
           or (sel.agg_key is not null
               and rk.eff in (select rc.country_code from region_countries rc
                               where rc.region_key = sel.agg_key))
           or rk.eff = any(p_countries))
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
               -- The POOL this rank was computed against. EUROPE joins GLOBAL as a
               -- pool name; scored_country below still carries the person's own
               -- country, so the rail shows "#12 EUROPE" against "GERMANY - Charite"
               -- rather than losing the geography to the label.
               case when (select is_global from sel) then 'GLOBAL'
                    when (select agg_key from sel) is not null then (select agg_key from sel)
                    else top.eff end as scope_label,
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
               ) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'rising_star'
                 limit 1) as summary_is_current
        from top
        join hcps_v2 h on h.id = top.hcp_id
      ) t
    )
  );
$function$

;

COMMIT;
