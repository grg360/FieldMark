-- Cohort Ledger — ledger_meta (Fix 1: scope-independent suppression).
--
-- Suppression is ceiling-saturation, not a page property: a score cell dashes iff its
-- value sits within the window of that column's WHOLE-COHORT ceiling (its max). The
-- ceiling is a cohort-level fact and MUST be computed once, over the full cohort, by a
-- cheap max() aggregate — never by scanning the loaded rows (which is what made the
-- decision flip by scroll position, and what timed Community out). This RPC returns
-- exactly that: the cohort total and each ranking column's whole-cohort max. It runs
-- once per cohort load, independent of row pagination.
--
-- Only percentile ranking columns have a ceiling. Pharma (Established) and Engagement
-- (Community) are informational/not-ranked and never suppress, so they are absent here.
-- Community has no percentile columns at all, so its ceilings object is empty.

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
      from hcp_established_ranks_v3 r, ta
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
      from hcp_rising_star_ranks_v3 r, ta
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
