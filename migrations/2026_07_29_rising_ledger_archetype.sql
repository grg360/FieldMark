-- Cohort Ledger stage 3: expose the Rising Star archetype on rising_ledger.
--
-- The archetype chip (Emerging Leader / Scientific Accelerator / Balanced Rising Star)
-- is a physician attribute shown inline with the name, Rising Star only. It is the real
-- hcp_rising_star_ranks_v3.archetype value — NOT the frame's 2-value BALANCED/SCIENCE
-- placeholder. Only rising_ledger changes; the (int,int) paging signature is preserved.

create or replace function public.rising_ledger(p_limit int default 1000, p_after_rank int default 0)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  us as (
    select r.hcp_id, r.us_rank as rank, r.rank as global_rank,
           r.scientific_momentum_percentile   as scimom,
           r.network_momentum_percentile      as netmom,
           r.scientific_visibility_percentile as scivis,
           r.network_visibility_percentile    as netvis,
           r.rising_star_percentile           as idx,
           r.archetype
    from hcp_rising_star_ranks_v3 r, ta
    where r.therapeutic_area_id = ta.id and r.country = 'US' and r.us_rank is not null
  ),
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, top.global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               top.scimom, top.netmom, top.scivis, top.netvis, top.idx, top.archetype, top.hcp_id,
               (
                 select case when o.body ~ '^\s*\{' then (o.body::jsonb ->> 'headline') else null end
                 from hcp_ai_overviews o
                 where o.hcp_id = top.hcp_id
                   and o.synthesis_type = 'scientific_positions'
                   and o.therapeutic_area = 'NSCLC'
                 limit 1
               ) as summary
        from top
        join hcps_v2 h on h.id = top.hcp_id
      ) t
    )
  );
$$;

grant execute on function public.rising_ledger(int, int) to anon, authenticated;
