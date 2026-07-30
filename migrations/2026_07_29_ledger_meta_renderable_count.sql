-- Cohort Ledger — ledger_meta: count the RENDERABLE cohort, not the raw rank rows.
--
-- The row RPCs inner-join hcps_v2 (a rank with no hcps_v2 row cannot render — no name).
-- ledger_meta.cohort_total must use the SAME join so the header never claims more rows
-- than the ledger can show. Rising Star's rank table has dangling hcp_ids (ranks whose
-- HCP was deleted from hcps_v2 after the 2026-06-22 rank compute and never rebuilt), so
-- its raw count (209) overstated the 208 renderable rows. Established and Community have
-- no such gap, so their counts are unchanged — but they get the join too, so the count
-- is defined by "will it render", not by cohort, for every cohort.

create or replace function public.ledger_meta(p_cohort text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with ta as (select id from therapeutic_areas where name = 'NSCLC')
  select case upper(p_cohort)
    when 'EST' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object(
          'sci', max(r.scientific_influence_pctile),
          'net', max(r.network_influence_pctile)
        )
      )
      from hcp_established_ranks_v3 r
      join hcps_v2 h on h.id = r.hcp_id, ta
      where r.therapeutic_area_id = ta.id and r.scope_type = 'region' and r.scope_value = 'US'
    )
    when 'RS' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object(
          'scimom', max(r.scientific_momentum_percentile),
          'netmom', max(r.network_momentum_percentile),
          'scivis', max(r.scientific_visibility_percentile),
          'netvis', max(r.network_visibility_percentile)
        )
      )
      from hcp_rising_star_ranks_v3 r
      join hcps_v2 h on h.id = r.hcp_id, ta
      where r.therapeutic_area_id = ta.id and r.country = 'US' and r.us_rank is not null
    )
    when 'COM' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object() -- no percentile columns; nothing suppresses
      )
      from hcp_community_scores_v2 c
      join hcps_v2 h on h.id = c.hcp_id, ta
      where c.therapeutic_area_id = ta.id and h.country = 'US'
    )
    else null
  end;
$$;

grant execute on function public.ledger_meta(text) to anon, authenticated;
