-- HCP Profile redesign (direction 1a "Brief") — stage 1. Read-only SECURITY DEFINER
-- aggregation of the PUBLIC/derived sections. Per-user Field Presence (msl_hcp_notes)
-- is fetched separately by the authenticated client under RLS — it is not here, because
-- SECURITY DEFINER would leak other MSLs' notes.
--
-- Source of fact, per section (reported):
--   header/scores  → hcps_v2 + hcp_established_ranks_v3 (same values the ledger uses)
--   belief profile → hcp_ai_overviews.scientific_positions (synthesis tiers, real) +
--                    hcp_scientific_positions_v1 (raw per-publication positions, real) +
--                    publications_v2 (real citation rows via representative_position_ids)
--   the record     → publication_authors_v2 + publications_v2 (counts/timeline),
--                    hcp_publication_leadership_v2 (senior/guideline),
--                    hcp_open_payments_top_companies_v2 + _summary_v2 (pharma + mix)
--   signal summary → hcp_narratives_v2.narrative_text (generated prose)
--
-- Everything returns real counts so the frontend can apply Design's render "ladder"
-- (positions 1+, synthesis 4+, silence 12+, lens 6+) — thresholds live in the client as
-- config, not hard-coded here. Composed frame elements with NO backing field
-- (co-author network, podium count, position-state deltas, silence topic, field-intel
-- chips, field corroboration tallies) are simply absent and render their honest state.

create or replace function public.hcp_profile_brief(p_hcp_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ta uuid;
  v_result json;
begin
  select id into v_ta from therapeutic_areas where name = 'NSCLC';

  with h as (
    select id, first_name, last_name,
           coalesce(institution_canonical, institution_normalized) as institution,
           nppes_practice_city as city,
           coalesce(nppes_practice_state, derived_state) as state,
           npi_number, npi_specialty
    from hcps_v2 where id = p_hcp_id
  ),
  est as (
    select r.rank, r.scientific_influence_pctile sci, r.network_influence_pctile net,
           r.pharma_engagement_pctile ph, r.cohort_score idx
    from hcp_established_ranks_v3 r
    where r.hcp_id = p_hcp_id and r.therapeutic_area_id = v_ta
      and r.scope_type = 'region' and r.scope_value = 'US'
  ),
  gl as (
    select r.rank gr from hcp_established_ranks_v3 r
    where r.hcp_id = p_hcp_id and r.therapeutic_area_id = v_ta and r.scope_type = 'global'
  ),
  cohort_mean as (
    select avg(cohort_score) m from hcp_established_ranks_v3
    where therapeutic_area_id = v_ta and scope_type = 'region' and scope_value = 'US'
  ),
  -- raw positions (real per-publication) → source counts + depth
  rawpos as (
    select p.id, p.publication_id, p.author_role, p.pub_year, p.citation_count,
           p.position_category, p.position_text, p.evidence_excerpt
    from hcp_scientific_positions_v1 p
    where p.hcp_id = p_hcp_id and p.therapeutic_area_id = v_ta
  ),
  depth as (
    select count(*) sources, count(distinct publication_id) papers,
           min(pub_year) oldest, max(pub_year) newest
    from rawpos
  ),
  -- synthesis body (may be absent for a thin HCP)
  synth as (
    select body::jsonb b from hcp_ai_overviews
    where hcp_id = p_hcp_id and synthesis_type = 'scientific_positions'
      and therapeutic_area = 'NSCLC' and body ~ '^\s*\{' limit 1
  ),
  -- leadership / publication counts for THE RECORD
  lead as (
    select senior_pub_count, senior_pub_recent_5yr, first_pub_count,
           guideline_pub_count, review_senior_count
    from hcp_publication_leadership_v2
    where hcp_id = p_hcp_id and therapeutic_area_id = v_ta limit 1
  ),
  pubs as (
    select count(*) total from publication_authors_v2 where hcp_id = p_hcp_id
  ),
  timeline as (
    select pub.pub_year yr, count(*) n
    from publication_authors_v2 pa join publications_v2 pub on pub.id = pa.publication_id
    where pa.hcp_id = p_hcp_id and pub.pub_year is not null
    group by pub.pub_year
  ),
  pharma as (
    select manufacturer_name nm, total_amount_usd amt, payment_count cnt
    from hcp_open_payments_top_companies_v2
    where hcp_id = p_hcp_id order by rank_by_amount limit 5
  ),
  opsum as (
    select consulting_3yr, speaker_bureau_3yr, travel_lodging_3yr, honoraria_3yr,
           education_3yr, royalty_3yr, food_beverage_3yr
    from hcp_open_payments_summary_v2 where hcp_id = p_hcp_id limit 1
  ),
  narr as (
    select narrative_text from hcp_narratives_v2
    where hcp_id = p_hcp_id and therapeutic_area_slug = 'nsclc' limit 1
  )
  select json_build_object(
    'hcp', (select json_build_object(
        'id', p_hcp_id, 'first_name', first_name, 'last_name', last_name,
        'name', trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')),
        'institution', institution, 'city', city, 'state', state,
        'npi', npi_number, 'specialty', npi_specialty) from h),
    'scores', (select json_build_object(
        'index', est.idx, 'rank', est.rank, 'global_rank', (select gr from gl),
        'sci', est.sci, 'net', est.net, 'pharma', est.ph,
        'vs_cohort_mean', round((est.idx - (select m from cohort_mean))::numeric, 1),
        'basis_papers', (select papers from depth),
        'basis_senior', (select senior_pub_count from lead)) from est),
    'record_depth', (select json_build_object(
        'sources', sources, 'papers', papers, 'oldest', oldest, 'newest', newest) from depth),
    'belief', json_build_object(
        'has_synthesis', (select b is not null from synth),
        'headline', (select b->>'headline' from synth),
        'synth_position_count', (select (jsonb_array_length(b->'strongly_advocates') +
                                        jsonb_array_length(b->'frequently_raises')) from synth),
        'synth_paper_count', (select (b->>'paper_count')::int from synth),
        'synth_source_count', (select (b->>'position_count')::int from synth),
        'source_count', (select sources from depth),
        'paper_count', (select papers from depth),
        'tiers', (select case when (select b from synth) is null then null else
          json_build_array(
            json_build_object('key','strongly_advocates','label','STRONGLY ADVOCATES',
              'positions', (select json_agg(hcp_profile_tier_positions(t))
                            from jsonb_array_elements((select b->'strongly_advocates' from synth)) t)),
            json_build_object('key','frequently_raises','label','FREQUENTLY RAISES',
              'positions', (select json_agg(hcp_profile_tier_positions(t))
                            from jsonb_array_elements((select b->'frequently_raises' from synth)) t))
          ) end),
        -- raw positions for the thin path (no synthesis): grouped one card per raw position
        'raw_positions', (select json_agg(json_build_object(
              'category', position_category, 'text', position_text,
              'excerpt', evidence_excerpt, 'role', author_role, 'year', pub_year,
              'citation_count', citation_count,
              'source', (select json_build_object('journal', pub.journal, 'title', pub.title,
                          'year', pub.pub_year, 'doi', pub.doi)
                         from publications_v2 pub where pub.id = rawpos.publication_id))
            order by pub_year desc) from rawpos)
    ),
    'record', json_build_object(
        'publications_total', (select total from pubs),
        'senior_pub_count', (select senior_pub_count from lead),
        'senior_recent_5yr', (select senior_pub_recent_5yr from lead),
        'guideline_count', (select guideline_pub_count from lead),
        'first_pub_count', (select first_pub_count from lead),
        'timeline', (select json_agg(json_build_object('year', yr, 'count', n) order by yr) from timeline),
        'pharma_companies', (select json_agg(json_build_object('name', nm, 'amount', amt, 'count', cnt)) from pharma),
        'engagement_mix', (select case when opsum is null then null else
            json_build_object('consulting', consulting_3yr, 'speaker', speaker_bureau_3yr,
              'travel', travel_lodging_3yr, 'honoraria', honoraria_3yr, 'education', education_3yr,
              'royalty', royalty_3yr, 'food', food_beverage_3yr) end from opsum)
    ),
    'signal_summary', (select narrative_text from narr)
  ) into v_result;

  return v_result;
end;
$$;

-- helper: shape one synthesis tier item into a position card with its real citation rows
create or replace function public.hcp_profile_tier_positions(t jsonb)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'theme', t->>'theme',
    'summary', t->>'summary',
    'evidence_count', (t->>'evidence_count')::int,
    'paper_count', (t->>'supporting_paper_count')::int,
    'confidence', (t->>'confidence')::numeric,
    'categories', t->'primary_position_categories',
    'sources', (
      select json_agg(row_to_json(s) order by s.pub_year desc, s.citation_count desc) from (
        select distinct on (pub.id) pub.journal, pub.title, pub.pub_year, pub.doi,
               p.author_role, p.citation_count
        from jsonb_array_elements_text(t->'representative_position_ids') rid
        join hcp_scientific_positions_v1 p on p.id = rid::uuid
        join publications_v2 pub on pub.id = p.publication_id
        order by pub.id, p.citation_count desc
      ) s
    )
  );
$$;

grant execute on function public.hcp_profile_tier_positions(jsonb) to anon, authenticated;
grant execute on function public.hcp_profile_brief(uuid) to anon, authenticated;
