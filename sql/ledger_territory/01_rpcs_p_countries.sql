-- Ledger territory, STAGE 1 — de-hardcode the country from established_ledger and
-- rising_ledger. Plumbing only: no visible change, no board write, no rescore.
--
-- BOTH functions gain `p_countries text[] DEFAULT '{US}'`. The default means every
-- existing caller (which passes no such argument) behaves EXACTLY as before, so the US
-- view cannot regress. Community is deliberately untouched — it stays US-only.
--
-- REINGEST-READY:
--   * CREATE OR REPLACE FUNCTION is idempotent by definition — re-running this file any
--     number of times converges on the same definition. Nothing to guard.
--   * These are STABLE, SECURITY DEFINER, read-only functions. They write nothing, so a
--     reingest cycle cannot duplicate or corrupt anything through them.
--   * They are a PURE FUNCTION OF THE DATA: every value is read live from
--     hcp_*_ranks_v3 / hcps_v2 at call time. A reingest that rewrites those tables is
--     picked up on the next call with no redeploy and no weekly step of its own.
--   * No hardcoded cohort values remain in the country dimension; the caller
--     parameterizes it.
--
-- NOTE ON MULTI-COUNTRY (established): established ranks are SCOPE-LOCAL — each country's
-- rows are ranked from 1 independently, and the composite behind them is normalised within
-- scope (network component). Passing >1 country therefore yields several rank-1 rows and is
-- NOT a valid leaderboard. The frontend passes exactly one country for Established; a true
-- multi-country Established rank needs an additive scorer run (deferred, see the plan doc).
-- rising_ledger has no such limit: its rank is derived at read time, so any country set works.

-- ─────────────────────────────────────────────────────────────────────────────
-- established_ledger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.established_ledger(
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
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx
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
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, gl.gr as global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
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
               ) as summary
        from top
        join hcps_v2 h on h.id = top.hcp_id
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rising_ledger
-- ─────────────────────────────────────────────────────────────────────────────
-- The stored us_rank is REPLACED by a read-time row_number() over the global rank,
-- restricted to the selected countries. This is not an approximation: over country='US'
-- it reproduces the stored us_rank for 123 of 123 rows exactly (verified), because
-- us_rank IS that dense projection. Computing it for any other country set is the same
-- operation, so no per-region rank needs storing and no rescore is implied.
--
-- Rank is computed over the FULL country set BEFORE the US-state filter is applied —
-- matching the previous semantics, where the stored us_rank was national and a state
-- selection simply hid rows (leaving rank gaps) rather than renumbering them.
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
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  base as (
    select r.hcp_id,
           row_number() over (order by r.rank) as rank,
           r.rank as global_rank,
           r.scientific_momentum_percentile   as scimom,
           r.network_momentum_percentile      as netmom,
           r.scientific_visibility_percentile as scivis,
           r.network_visibility_percentile    as netvis,
           r.rising_star_percentile           as idx,
           r.archetype
    from hcp_rising_star_ranks_v3 r
    cross join ta
    where r.therapeutic_area_id = ta.id
      and r.country = any(p_countries)
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
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, top.global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the superseded 3-argument overloads.
--
-- CREATE OR REPLACE FUNCTION matches on the ARGUMENT LIST, so adding p_countries
-- created a second overload rather than replacing the original. Two overloads whose
-- signatures differ only by a defaulted trailing argument make an unqualified call
-- ambiguous ("function established_ledger() is not unique"), which PostgREST surfaces
-- as a 300-level error at runtime — a silent breakage of the live ledger. The old
-- signatures must go.
--
-- IDEMPOTENT: IF EXISTS makes re-running this file safe, and once dropped the
-- statements are no-ops.
DROP FUNCTION IF EXISTS public.established_ledger(integer, integer, text[]);
DROP FUNCTION IF EXISTS public.rising_ledger(integer, integer, text[]);
