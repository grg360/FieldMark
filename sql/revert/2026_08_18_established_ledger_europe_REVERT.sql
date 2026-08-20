-- REVERT ARTIFACT for the established_ledger EUROPE-aggregate change. 2026-08-18.
-- Branch: resurfacing
-- Covers: migrations/2026_08_18_established_ledger_europe.sql
--
-- CAPTURED BEFORE ANYTHING WAS APPLIED, from pg_get_functiondef on the live
-- database. Verifiably pre-change: no scope_bucket column, and scored_country is
-- the bare coalesce(r.scope_value, hs.country).
--
-- WHAT REVERTING COSTS YOU. Restoring this body does NOT break a EUROPE selection
-- -- the rows are still found and ranked correctly -- but every row on an all-Europe
-- board reads its location chip as "EUROPE" instead of its own country, because
-- scored_country goes back to carrying the bucket. Per-country, US and global
-- selections are unaffected either way.
--
-- ORDERING NOTE. If you are unwinding the whole Europe scope, revert this FIRST or
-- in the same transaction as the bucket delete in
-- sql/revert/2026_08_18_established_europe_scope_REVERT.sql. Leaving this version
-- installed with no EUROPE rows present is harmless (nothing selects the bucket),
-- so the order only matters for tidiness, not correctness.
--
-- DATA: none. STABLE, read-only function.

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

COMMIT;
