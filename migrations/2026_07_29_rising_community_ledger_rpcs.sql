-- Cohort Ledger — Rising Star + Community (stage 2). Read-only SECURITY DEFINER
-- aggregations, same shape as established_ledger (stage 1): one json object with
-- cohort_total + a rows array, ordered by US rank. Suppression / bands / drawer
-- "why" stay COMPUTED in the frontend from these values — nothing is decided here.
--
-- Rising Star  — source of fact: hcp_rising_star_ranks_v3 (US country cohort, us_rank
--   is the in-cohort rank, rank is the global rank), the four percentile columns
--   (scientific/network × momentum/visibility), rising_star_percentile as the index,
--   hcps_v2 for name/institution/state, and hcp_ai_overviews scientific_positions →
--   body.headline for the generated summary — the same summary source Established uses.
--
-- Community    — source of fact: hcp_community_ranks_v2 (CMS-derived composite:
--   volume 40% / engagement 30% / setting 15% / career 10% / publication 5%),
--   normalized_score as the index, name/specialty/city/state carried on the rank row.
--   Engagement dollars + distinct companies come from hcp_open_payments_summary_v2
--   (lifetime), which is ABSENT for HCP with no Open Payments record — that absence
--   is the Buroker case: engagement → null (renders "NONE RECORDED"), companies →
--   null (renders em-dash). The summary is hcp_narratives_v2.narrative_text, because
--   community HCP have no scientific_positions synthesis (they publish little) — a
--   deliberate different summary source for this cohort, flagged in the report.

-- ── Rising Star ──────────────────────────────────────────────────────────────
create or replace function public.rising_ledger(p_limit int default 60)
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
  top as (select * from us order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, top.global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               top.scimom, top.netmom, top.scivis, top.netvis, top.idx,
               top.hcp_id,
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

grant execute on function public.rising_ledger(int) to anon, authenticated;

-- ── Community ────────────────────────────────────────────────────────────────
-- NOTE: hcp_community_ranks_v2 is a VIEW, not a table — it recomputes TWO full
-- window-function passes (global + US region, ~6,480 rows each) on every call, and a
-- "limit 60" can't push past a window, so the whole ranking materialises regardless.
-- That trips the anon role's statement_timeout (a superuser psql session has none,
-- which is why the view read fine by hand but times out from the frontend). This RPC
-- goes straight to the base table hcp_community_scores_v2 with ONE window pass (~55ms).
-- The entire community cohort is US country (6,480/6,480), so global rank == US rank;
-- global_rank is emitted equal to rank and revisited if a non-US community HCP ever
-- appears. Flagged in the report.
create or replace function public.community_ledger(p_limit int default 60)
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
  top as (select * from ranked order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from ranked),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank,
               top.rank as global_rank, -- US-only cohort: global rank == US rank
               top.first_name, top.last_name,
               top.specialty,
               top.city, top.state,
               -- engagement + companies are lifetime Open Payments; NULL where CMS
               -- holds no record (the row simply has no summary_v2 match — Buroker case)
               s.total_payments_lifetime     as eng,
               s.distinct_companies_lifetime as companies,
               top.years,
               top.idx,
               top.hcp_id,
               (select n.narrative_text from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                 limit 1) as summary
        from top
        left join hcp_open_payments_summary_v2 s on s.hcp_id = top.hcp_id
      ) t
    )
  );
$$;

grant execute on function public.community_ledger(int) to anon, authenticated;
