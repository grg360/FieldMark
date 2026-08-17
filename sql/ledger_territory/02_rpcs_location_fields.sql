-- TA resolved by SLUG, not name (2026-08-15): therapeutic_areas.name became
-- 'Lung Cancer'; the slug stays 'nsclc' and is the stable key. Resolving by
-- name here would return NULL and this would silently emit empty results.
-- Ledger territory, STAGE 2 — location fields on the row payload, and the decided
-- country-field split between the two cohorts.
--
-- THE SPLIT (deliberate, and the two cohorts CAN disagree for a mover):
--
--   RISING slices on the RE-DERIVED location, COALESCE(current_country, country).
--     Safe because the Rising rank is derived at read time by row_number() over the
--     sliced pool — so whatever pool we select, the rank is honest against THAT pool.
--     Effect: US Rising moves 123 -> 125. That is the intended consequence of placing
--     people where they actually are; it is not a regression.
--
--   ESTABLISHED slices on scope_value — the country it was SCORED in.
--     Its stored rank is scope-local AND the composite behind it is normalised within
--     that scope (the network component). Slicing Established by current_country would
--     pair a stored rank with a pool it was never computed against — a mover would show
--     a German rank on the Italian board. Reconciled only when the Established scorer
--     runs an additive scope (deferred).
--
-- Both RPCs now return country, current_country, affiliation_confidence and
-- affiliation_as_of so the frontend can hedge the displayed location via lib/location.ts
-- (only ~10% of re-derived country corrections are high-confidence). ADDITIVE ONLY:
-- no existing field is removed or renamed, so an un-updated caller is unaffected.
--
-- REINGEST-READY: unchanged from stage 1 — STABLE, SECURITY DEFINER, writes nothing,
-- pure function of the data, CREATE OR REPLACE is idempotent. No new weekly step.
--
-- DEPENDENCY (report, not a change): the Rising slice now reads hcps_v2.current_country,
-- which is produced by the affiliation re-derivation. If that becomes a weekly step it
-- must run BEFORE anything that reads the Rising ledger for the week to be current;
-- if it does not run, the column simply goes stale (it never empties), so the ledger
-- degrades to last week's locations rather than breaking.

-- ─────────────────────────────────────────────────────────────────────────────
-- established_ledger — slices on scope_value (scored country). Location fields added.
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
               ) as summary
        from top
        join hcps_v2 h on h.id = top.hcp_id
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rising_ledger — slices on the RE-DERIVED location. Location fields added.
-- ─────────────────────────────────────────────────────────────────────────────
-- The hcps_v2 join moves INTO the base CTE so the slice happens before row_number(),
-- keeping the rank honest against the selected pool. The US-state filter still applies
-- after ranking (a state selection hides rows, it does not renumber them) — unchanged.
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
    join hcps_v2 hb on hb.id = r.hcp_id
    cross join ta
    where r.therapeutic_area_id = ta.id
      and coalesce(hb.current_country, hb.country) = any(p_countries)
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
        select top.rank, top.global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               -- Rising places by the re-derived location, so scored_country IS the
               -- effective country here (same expression the slice uses).
               coalesce(h.current_country, h.country) as scored_country,
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
