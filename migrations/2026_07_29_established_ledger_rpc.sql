-- Cohort Ledger — Established (stage 1). Read-only SECURITY DEFINER aggregation.
--
-- Source of fact: hcp_established_ranks_v3 (US-region NSCLC cohort membership + rank
-- + the three established percentiles + composite), the global-scope row for the
-- global rank, hcps_v2 for name/institution/state, and hcp_ai_overviews
-- (scientific_positions → body.headline) for the generated summary line. Everything
-- the ledger shows comes from here; the frame's names/scores/counts are placeholders.
--
-- Suppression, resolution bands and the drawer "why" are COMPUTED in the frontend
-- from these values (assetLogic-style pure functions) — not stored here.

create or replace function public.established_ledger(p_limit int default 60)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx
    from hcp_established_ranks_v3 r, ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'region' and r.scope_value = 'US'
  ),
  gl as (
    select r.hcp_id, r.rank as gr
    from hcp_established_ranks_v3 r, ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'global'
  ),
  top as (select * from us order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank,
               gl.gr as global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               top.sci, top.net, top.ph, top.idx,
               top.hcp_id,
               (
                 select case
                   when o.body ~ '^\s*\{' then (o.body::jsonb ->> 'headline')
                   else null
                 end
                 from hcp_ai_overviews o
                 where o.hcp_id = top.hcp_id
                   and o.synthesis_type = 'scientific_positions'
                   and o.therapeutic_area = 'NSCLC'
                 limit 1
               ) as summary
        from top
        join hcps_v2 h on h.id = top.hcp_id
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  );
$$;

grant execute on function public.established_ledger(int) to anon, authenticated;
