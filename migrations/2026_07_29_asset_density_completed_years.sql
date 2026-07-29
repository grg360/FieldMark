-- Drug Intelligence — density tier measured on completed years only (Rule B).
--
-- The density tier (index) counts how many years clear 40 themed publications.
-- Counting the in-progress index year (2026, indexed 24 Jul) against an asset
-- systematically docks otherwise-dense assets and reshuffles the legend every
-- January regardless of the corpus. So the MEASURE excludes 2026 — years 2019–2025
-- only. Content (publications, the composition chart x-axis) still renders through
-- the index date, including 2026; that split is intentional and is stated in the
-- density copy ("of 7 completed years (2019–2025); 2026 in progress").
--
-- Legend under this rule: DENSE 12 · INTERMITTENT 8 · SPARSE 23. DENSE now means
-- clearing all 7 completed years. The per-asset window remains the composition
-- chart's x-axis only — it is deliberately NOT a density rule (Rule C rejected: a
-- window drawn from an asset's first qualifying year only ever measures years it
-- was already clearing, so DENSE would stop meaning sustained).

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
    where p.pub_year between 2019 and 2025   -- completed years only; 2026 excluded from the measure
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
