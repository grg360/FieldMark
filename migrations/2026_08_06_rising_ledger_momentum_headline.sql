-- Rising ledger summary → the momentum narrative headline (2026-08-06).
--
-- The rising view's row summary was the scientific-positions synthesis headline
-- (hcp_ai_overviews), which exists for 73 of the 123-member US rising board
-- (59%) — a row summary that explains nothing for the other 41% is the wrong
-- artifact for the slot. Positions stay where positions live: on the profile.
--
-- The slot now reads the momentum narrative — the same artifact the rising
-- profile renders, 123/123 coverage (Marmarelis and Vokes fill in) — via its
-- headline field: why_now is the single-sentence strongest-signal line the
-- prompt generates for exactly this kind of compact slot (HCPCard's insight
-- band already uses why_now ?? narrative as its headline convention; the same
-- fallback applies here). Cohort-keyed to the rising row, so a dual-board
-- member's established prose never leaks into the rising ledger.
--
-- Requires 2026_08_06_narratives_cohort_key.sql (the cohort column).

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
$$;

grant execute on function public.rising_ledger(int, int) to anon, authenticated;
