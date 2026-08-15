-- TA resolved by SLUG, not name (2026-08-15): therapeutic_areas.name became
-- 'Lung Cancer'; the slug stays 'nsclc' and is the stable key. Resolving by
-- name here would return NULL and this would silently emit empty results.
-- established_ledger v2 — the Established ledger RPC (source of record, captured from live
-- 2026-08-12 via pg_get_functiondef; editor-applied object previously
-- restorable from nowhere). DRAFT, NOT YET APPLIED.
--
-- v2 adds TERRITORY SCOPING: p_states text[] DEFAULT '{}' filters members by
-- practice state (coalesce(nppes_practice_state, derived_state) — the same
-- coalesce the rows DISPLAY, so a filter can never exclude a row that shows a
-- matching state). Empty array = national (current behavior).
--
-- RANKS STAY NATIONAL: this is a member FILTER, not a re-rank. No
-- territory-scoped row_number() — a Northeast view shows each member at their
-- real national rank with honest gaps. cohort_total derives from the filtered
-- base, so a scoped view carries scoped counts. Rank-keyset pagination
-- (p_after_rank) advances within the filtered set.
--
-- APPLY NOTE: the DROP is REQUIRED — CREATE OR REPLACE at the new 3-param
-- signature would create an overload beside the 2-param one, making named-
-- argument calls that omit p_states ambiguous. p_states defaults, so existing
-- callers keep working after the drop+create.

DROP FUNCTION IF EXISTS public.established_ledger(integer, integer);

CREATE OR REPLACE FUNCTION public.established_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc'),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx
    from hcp_established_ranks_v3 r
    join hcps_v2 hs on hs.id = r.hcp_id
    cross join ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'region' and r.scope_value = 'US'
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

GRANT EXECUTE ON FUNCTION public.established_ledger(integer, integer, text[]) TO anon, authenticated, service_role;
