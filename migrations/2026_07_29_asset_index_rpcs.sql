-- Drug Intelligence — assets index (grouped by target) RPCs.
--
-- Two facts the grouped index needs that cannot be derived client-side:
--   1. Per-group distinct-publication union. A group total is NOT the sum of its
--      members' publication_count — publications mentioning two assets in the same
--      group would double-count. Must be count(distinct publication_id) over the
--      group's members, so it takes the membership (config-defined) as input.
--   2. Density tier per asset — how many years (2019–2026) clear 40 themed
--      publications. Predicts which page archetype the asset renders (0 → pooled).
--
-- Read-only, SECURITY DEFINER with a pinned search_path (anon reaches the un-FK'd
-- v1 tables only through these). "Themed" = an is_primary row in
-- publication_theme_v1. Group totals do not partition and are never summed.

create or replace function public.asset_group_distinct(p_groups jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, cnt), '{}'::jsonb)
  from (
    select g->>'key' as key,
      (
        select count(distinct ap.publication_id)
        from asset_publication_v1 ap
        where ap.asset_generic in (
          select jsonb_array_elements_text(g->'generics')
        )
      ) as cnt
    from jsonb_array_elements(p_groups) g
  ) s;
$$;

create or replace function public.asset_density_tiers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with py as (
    select ap.asset_generic g, p.pub_year y,
           count(distinct case when pt.publication_id is not null then ap.publication_id end) as themed
    from asset_publication_v1 ap
    join publications_v2 p on p.id = ap.publication_id
    left join (select publication_id from publication_theme_v1 where is_primary) pt
      on pt.publication_id = ap.publication_id
    where p.pub_year between 2019 and 2026
    group by ap.asset_generic, p.pub_year
  ),
  base as (select distinct asset_generic g from asset_publication_v1),
  cnt as (
    select b.g, coalesce(sum(case when py.themed >= 40 then 1 else 0 end), 0) as yrs
    from base b left join py on py.g = b.g
    group by b.g
  )
  select coalesce(jsonb_object_agg(g, yrs), '{}'::jsonb) from cnt;
$$;

grant execute on function public.asset_group_distinct(jsonb) to anon, authenticated;
grant execute on function public.asset_density_tiers()       to anon, authenticated;
