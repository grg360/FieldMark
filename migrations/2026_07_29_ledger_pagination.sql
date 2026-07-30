-- Cohort Ledger — Fix 2: rank-keyed pagination on all three row RPCs.
--
-- PostgREST caps a call at 1000 rows and offset pagination over an unstable order
-- duplicates/skips, so every *_ledger RPC now takes a p_after_rank cursor and returns
-- the next page by KEY: rows with rank > p_after_rank, ordered by rank, limited to
-- p_limit. First page passes p_after_rank => 0; each subsequent page passes the last
-- rank it received. cohort_total stays on the payload but the frontend reads the count
-- from ledger_meta (computed once) — the per-page count here is harmless and cheap.
--
-- Suppression ceilings do NOT live here — they come from ledger_meta, so paging never
-- changes a dash decision.

-- Drop the stage-1/2 single-arg signatures so the new (int, int) versions are the only
-- overload PostgREST can resolve.
drop function if exists public.established_ledger(int);
drop function if exists public.rising_ledger(int);
drop function if exists public.community_ledger(int);

-- ── Established ──────────────────────────────────────────────────────────────
create or replace function public.established_ledger(p_limit int default 1000, p_after_rank int default 0)
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
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, gl.gr as global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               top.sci, top.net, top.ph, top.idx, top.hcp_id,
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
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  );
$$;

grant execute on function public.established_ledger(int, int) to anon, authenticated;

-- ── Rising Star ──────────────────────────────────────────────────────────────
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
           r.rising_star_percentile           as idx
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
               top.scimom, top.netmom, top.scivis, top.netvis, top.idx, top.hcp_id,
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

-- ── Community ────────────────────────────────────────────────────────────────
-- Built on the base table hcp_community_scores_v2 with one window pass (the view times
-- out on anon — see the stage-2 note). The cursor filters the computed rank after the
-- window; the whole cohort is US, so global rank == US rank.
create or replace function public.community_ledger(p_limit int default 1000, p_after_rank int default 0)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  ranked as (
    select c.hcp_id,
           row_number() over (order by c.normalized_score desc) as rank,
           c.normalized_score as idx,
           h.first_name, h.last_name, h.npi_specialty as specialty,
           h.nppes_practice_city as city, h.nppes_practice_state as state,
           coalesce(h.nppes_career_stage_years, c.career_years::int) as years
    from hcp_community_scores_v2 c
    join hcps_v2 h on h.id = c.hcp_id, ta
    where c.therapeutic_area_id = ta.id and h.country = 'US'
  ),
  top as (select * from ranked where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from ranked),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank,
               top.rank as global_rank, -- US-only cohort: global rank == US rank
               top.first_name, top.last_name, top.specialty, top.city, top.state,
               s.total_payments_lifetime     as eng,
               s.distinct_companies_lifetime as companies,
               top.years, top.idx, top.hcp_id,
               (select n.narrative_text from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                 limit 1) as summary
        from top
        left join hcp_open_payments_summary_v2 s on s.hcp_id = top.hcp_id
      ) t
    )
  );
$$;

grant execute on function public.community_ledger(int, int) to anon, authenticated;
