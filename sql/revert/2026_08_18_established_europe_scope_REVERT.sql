-- REVERT ARTIFACT for the Established EUROPE scope build. Date: 2026-08-18
-- Branch: resurfacing
--
-- Covers: migrations/2026_08_18_rising_ledger_europe_sentinel.sql
--     and the region/EUROPE rows written by recompute_established_ranks_v3.py
--
-- CAPTURED BEFORE ANYTHING WAS APPLIED. The rising_ledger body below is
-- pg_get_functiondef output taken from the live database prior to the change
-- (verifiably pre-change: zero occurrences of 'is_europe').
--
-- THIS FILE UNDOES TWO THINGS.
--
-- 1. THE DATA. recompute_established_ranks_v3.py gains a bucket (74 lines, all
--    additive -- the estimate when this file was written was "three lines", before
--    the membership rules were written down) that emits a third scope row per
--    European HCP:
--      scope_type = 'region', scope_value = 'EUROPE'
--    MEASURED 2026-08-18 by dry run: 3,849 rows for NSCLC, across 31 of EUROPE's
--    33 countries (Luxembourg and Malta have no Established HCP). This header first
--    said 3,859 -- that was counted off the LIVE per-country rows, which include
--    17 rows whose HCP is no longer in the recomputed cohort and miss 7 who have
--    since joined it. The scorer writes 3,849; the 17 stale country rows are not
--    deleted by this run (upsert, no delete) and will therefore appear on their
--    country board with no EUROPE row behind them.
--    The DELETE below removes exactly those rows and nothing else. It is safe
--    because 'EUROPE' is not an ISO country code, so it cannot collide with a
--    per-country scope. Global and per-country rows are untouched -- the scorer
--    is ON CONFLICT DO UPDATE with no DELETE, so it never dropped them.
--
--    NOTE: re-running the scorer without also reverting the code will simply
--    re-create these rows. Revert the code first (git) or the DELETE is
--    cosmetic and temporary.
--
-- 2. THE RPC. rising_ledger gains an 'EUROPE' sentinel in p_countries,
--    expanded from region_countries -- mirroring the '__global__' sentinel
--    added 2026-08-17. Restoring the body below removes that expansion.
--
-- ‼ THIS FILE IS NO LONGER THE WHOLE REVERT. The 2026-08-18 build needed two
--   changes this artifact did not anticipate, each with its own artifact:
--     * established_ledger  had to stop leaking the aggregate bucket into
--       scored_country (the rail's location chip) -->
--       sql/revert/2026_08_18_established_ledger_europe_REVERT.sql
--     * lib/api.ts "Other" region board selects scope rows by NEGATION, so it
--       matched the EUROPE bucket and would have shown every European HCP there
--       twice. Fixed in the same commit; reverts with git.
--   Unwind order, if you unwind: frontend (git) -> established_ledger -> this file.
--
-- ‼ CONSUMER NOTE -- REVERT THE FRONTEND IN THE SAME STEP (git):
--    * cohortLedger.ts scopeFromKey("eu:all") must go back to returning the 33
--      EUROPE_COUNTRIES codes. Left sending ['EUROPE'], Rising matches no
--      country and returns ZERO rows -- silently, with no error.
--    * cohortLedger.ts ledgerTerritoryTree must go back to
--      selectable: cohortTag === "RS" for the eu:all node. Left true, Established
--      offers an all-Europe selection whose bucket no longer exists (0 rows).
--   Neither failure raises; both present as an empty ledger.
--
-- BASELINES MEASURED PRE-CHANGE, to verify a revert landed:
--   rising_ledger  eu:all (33 codes) -> 53      US -> 58
--   established_ledger {EUROPE}      -> 0       {DE} -> 462
--
-- POST-CHANGE, verified 2026-08-18 inside a rolled-back transaction:
--   rising_ledger  {EUROPE} sentinel -> 53, same member set as the 33 codes
--   established_ledger {EUROPE}      -> 3,849, scope_label EUROPE, location chip
--                                      the person's own country (0 leaks)
--   established_ledger {DE} and {US} payloads BYTE-IDENTICAL to pre-change
--
-- The scorer and frontend changes are git-tracked; revert those with git
-- checkout. This file covers only what git cannot: live DB state.

BEGIN;

-- 1. drop the EUROPE scope rows (all TAs; scope_value is unambiguous)
DELETE FROM public.hcp_established_ranks_v3
 WHERE scope_type = 'region' AND scope_value = 'EUROPE';

-- 2. restore rising_ledger without the EUROPE sentinel
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
