-- Profile spine dispatch — two-tier completion (research-themes wiring, 2026-07-30).
-- The academic (belief-led) spine previously required ≥1 sourced position, which sent
-- publication-active HCPs with zero extracted positions (~15% of top-200 Established;
-- e.g. Boris Sepesi — 119 pubs, 0 positions, 12 themes) to the COMMUNITY spine, where
-- they have no rank row and nothing renders sensibly. With research themes now wired
-- into the academic profile as the INVOLVEMENT tier, an HCP with ranked themes has a
-- publication-led profile to show — dispatch them academic. Positions OR ranked themes
-- → academic; neither → community (the spine that renders without publications).

create or replace function public.hcp_profile_spine(p_hcp_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (
    select 1 from hcp_scientific_positions_v1 p
    join therapeutic_areas ta on ta.id = p.therapeutic_area_id and ta.name = 'NSCLC'
    where p.hcp_id = p_hcp_id
  ) or exists (
    select 1 from hcp_research_themes_v2 t
    where t.hcp_id = p_hcp_id and t.display_rank is not null
  ) then 'academic' else 'community' end;
$$;

grant execute on function public.hcp_profile_spine(uuid) to anon, authenticated;
