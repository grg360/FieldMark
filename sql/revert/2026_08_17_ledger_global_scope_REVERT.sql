-- REVERT ARTIFACT for migrations/2026_08_17_ledger_global_scope.sql
-- Date: 2026-08-17   Branch: resurfacing
--
-- WRITTEN AFTER THE FACT. The migration was already applied when this file was
-- created, so the prior definitions were no longer in the live database and had
-- to be reconstructed. That is a process failure on my part -- the revert should
-- have been captured before applying, as it was for the other migrations in this
-- branch -- and it is recorded here rather than quietly fixed.
--
-- RECONSTRUCTED FROM TWO INDEPENDENT SOURCES, WHICH AGREE EXACTLY:
--   A. git -- migrations/2026_08_15_ta_resolve_by_slug.sql carries full
--      CREATE OR REPLACE bodies for both functions, and nothing between that
--      commit and 2026-08-17 modified either one.
--   B. the pg_get_functiondef output captured from the live database BEFORE the
--      migration was applied (verifiably pre-change: no 'scope_label', no
--      'is_global').
-- Diffed ignoring trailing whitespace and blank lines: IDENTICAL for both
-- functions. The bodies below are that agreed text, verbatim.
--
-- WHAT THIS UNDOES (the migration's complete diff, nothing else):
--   established_ledger -- 4 changes
--     * the `sel` sentinel CTE ('__global__' = any(p_countries))
--     * scored_country: coalesce(r.scope_value, hs.country) -> r.scope_value
--     * scope predicate: the is_global CASE -> hardcoded scope_type = 'region'
--     * rows: drops scope_label, restores unconditional gl.gr as global_rank
--   rising_ledger -- 3 changes
--     * the same `sel` CTE
--     * where (sel.is_global or rk.eff = any(...)) -> where rk.eff = any(...)
--     * drops scope_label
--
-- NO SIGNATURE CHANGE either way. Both functions keep
--   (p_limit integer, p_after_rank integer, p_states text[], p_countries text[])
-- which is why the migration used a '__global__' sentinel inside p_countries
-- rather than adding a parameter, and why this revert is a plain CREATE OR
-- REPLACE with no DROP and no PostgREST overload window.
--
-- ‼ CONSUMER NOTE -- REVERT THE FRONTEND IN THE SAME STEP.
-- Reverting removes `scope_label` from both payloads and restores `global_rank`
-- on every row. The ledger must lose its Global territory node at the same time:
--   * cohortLedger.ts -- the `global` TerritoryNode, GLOBAL_SCOPE_SENTINEL,
--     scopeIsGlobal(), the "global" branch of scopeFromKey(), and the
--     scopeLabel field + its mapping
--   * CohortLedger.tsx -- the rank chip falls back to `scoredCountry` (harmless),
--     but the row.globalRank != null guards can stay: global_rank is non-null on
--     every row again, so both rails render as they did before.
-- Left as-is, the menu offers a Global option the RPC no longer serves: the
-- selection sends p_countries = {'__global__'}, matches no scope_value, and the
-- ledger returns zero rows with no error.
--
-- VERIFIED 2026-08-17: applied inside a transaction, pg_get_functiondef diffed
-- against both pre-change captures (0 differences), rolled back, and the live
-- functions confirmed still on the post-migration definitions afterwards.

BEGIN;

CREATE OR REPLACE FUNCTION public.established_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc'),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx, r.scope_value as scored_country
    from hcp_established_ranks_v3 r
    join hcps_v2 hs on hs.id = r.hcp_id
    cross join ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'region'
      and r.scope_value = any(p_countries)
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
        select top.rank, gl.gr as global_rank,
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
