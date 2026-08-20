-- ============================================================================
-- Ledger RPCs: admit a GLOBAL selection scope. Date: 2026-08-17
-- Branch: resurfacing
--
-- Revert: sql/revert/2026_08_17_ledger_global_scope_REVERT.sql
--
-- WHY THIS IS PLUMBING, NOT SCORING
-- hcp_established_ranks_v3 already holds 16,976 global-scope rows for NSCLC --
-- more than 5x the 2,990 US rows -- correctly scored and never selectable. The
-- RPC hardcoded `r.scope_type = 'region'` in its selection CTE and joined the
-- global scope only as a companion DISPLAY column, so a Global selection
-- returned zero rows. Nothing is rescored here.
--
-- Rising needs no new rows at all: its rank is already a read-time row_number()
-- over the stored global rank, so a global selection is the whole 251-row board.
--
-- Community is NOT included: community_ledger has no country parameter
-- (p_limit, p_after_*, p_tiers, p_states) and the board is US-only by
-- construction -- every member is derived from US Medicare claims. A Global
-- option there would either duplicate the US national view or return nothing,
-- so the territory tree continues to offer United States alone for COM.
--
-- HOW A GLOBAL SELECTION IS SIGNALLED
-- p_countries carrying the sentinel '__global__'. Chosen over a new p_scope_type
-- parameter because adding a parameter changes the function signature: that means
-- DROP + CREATE on a live SECURITY DEFINER RPC and a window where PostgREST can
-- see two overloads. The sentinel keeps both signatures byte-identical, and
-- '__global__' already carries exactly this meaning in
-- hcp_established_board_snapshots.scope_value (it is not a country code).
--
-- TWO DISPLAY FIELDS, NOT ONE
-- scored_country was doing double duty: the rank-scope label AND the row's
-- location chip. Those diverge on a global board -- the rank chip must read
-- GLOBAL while each row still needs its own country. This adds `scope_label`
-- for the former and leaves scored_country as the latter (falling back to the
-- HCP's own country, since global rows carry scope_value = NULL).
-- Without that split the frontend's `row.scoredCountry ?? "US"` would have
-- labelled all 16,976 global rows "US".
--
-- The companion global_rank is returned NULL on a global selection, because the
-- scope rank IS the global rank there and the rail would otherwise print the
-- same number twice.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.established_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc'),
  -- GLOBAL SELECTION SENTINEL (2026-08-17). p_countries carrying '__global__'
  -- selects the global scope instead of a set of country scopes. A sentinel
  -- rather than a new parameter because adding one changes the signature, which
  -- means DROP + CREATE on a live SECURITY DEFINER RPC and a PostgREST overload
  -- window; '__global__' is not a country code and already means exactly this in
  -- hcp_established_board_snapshots.scope_value.
  sel as (select ('__global__' = any(p_countries)) as is_global),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx,
           -- global rows carry scope_value = NULL; fall back to the HCP's own
           -- country so the location chip stays informative on a global board.
           coalesce(r.scope_value, hs.country) as scored_country
    from hcp_established_ranks_v3 r
    join hcps_v2 hs on hs.id = r.hcp_id
    cross join ta
    cross join sel
    where r.therapeutic_area_id = ta.id
      and case when sel.is_global
               then r.scope_type = 'global'
               else r.scope_type = 'region' and r.scope_value = any(p_countries)
          end
      and (cardinality(p_states) = 0 or coalesce(hs.nppes_practice_state, hs.derived_state) = any(p_states))
  ),
  gl as (
    select r.hcp_id, r.rank as gr
    from hcp_established_ranks_v3 r, ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'global'
  ),
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'states', p_states,
    'countries', p_countries,
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank,
               -- On a global selection the scope rank IS the global rank, so the
               -- companion column would duplicate it. NULL suppresses the rail's
               -- "#n GLOBAL" line (which the frontend guard now honours) rather
               -- than printing the same number twice.
               case when (select is_global from sel) then null else gl.gr end as global_rank,
               -- The pool this rank was computed against, as a LABEL. Distinct from
               -- scored_country, which the rail also uses as the row's location chip:
               -- on a global board every row needs its own country there, but the
               -- rank chip must say GLOBAL. One field cannot be both.
               case when (select is_global from sel) then 'GLOBAL' else top.scored_country end as scope_label,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               -- scored_country is the authoritative chip for Established: the pool this
               -- rank was actually computed against. current_country is carried alongside
               -- for the hedge, NOT for placement.
               top.scored_country,
               h.country, h.current_country,
               h.affiliation_confidence, h.affiliation_as_of,
               top.sci, top.net, top.ph, top.idx, top.hcp_id,
               coalesce(
                 (
                   select case when o.body ~ '^\s*\{' then (o.body::jsonb ->> 'headline') else null end
                   from hcp_ai_overviews o
                   where o.hcp_id = top.hcp_id
                     and o.synthesis_type = 'scientific_positions'
                     and o.therapeutic_area = 'NSCLC'
                   limit 1
                 ),
                 -- fallback: the established narrative's single-sentence
                 -- strongest-signal line — for HCPs whose record holds no
                 -- qualifying paper for positions synthesis
                 (
                   select coalesce(n.why_now, n.narrative_text)
                   from hcp_narratives_v2 n
                   where n.hcp_id = top.hcp_id
                     and n.therapeutic_area_slug = 'nsclc'
                     and n.cohort = 'established'
                   limit 1
                 )
               ) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'established'
                 limit 1) as summary_is_current
        from top
        join hcps_v2 h on h.id = top.hcp_id
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  );
$function$

;

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
  sel as (select ('__global__' = any(p_countries)) as is_global),
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
    where (sel.is_global or rk.eff = any(p_countries))
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
               case when (select is_global from sel) then 'GLOBAL' else top.eff end as scope_label,
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
