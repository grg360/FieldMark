-- hcp_profile_brief: drop vs_cohort_mean and the full-table average behind it.
-- Date: 2026-08-19. Branch: resurfacing.
-- Revert: sql/revert/2026_08_19_hcp_profile_brief_drop_delta_REVERT.sql
--
-- WHY THE FIELD GOES RATHER THAN GETS RELABELLED. cohort_score is a weighted mean of
-- PERCENTILE RANKS, and a percentile rank is uniform on 0..100 with mean 50. The cohort
-- mean is therefore ~50 BY CONSTRUCTION -- a fixed point of the metric, not a property
-- of any cohort. Measured 2026-08-19: global 50.15, US 51.96, EUROPE 50.29, and the
-- medians all sit near 48.
--
-- So vs_cohort_mean was `index - 50`: a near-constant transform of the number displayed
-- beside it. It read +49.5 to +49.9 for the ENTIRE global top 30 while presenting as a
-- distinguishing figure, and it moved by two points for the same physician between the
-- US and global boards for a reason that has nothing to do with them.
--
-- A longer, more honest label ("against a distribution whose mean is 50 by
-- construction") does not rescue a number that cannot vary. Same call the ledger made
-- on the SCI/NET ceiling columns: delete rather than annotate.
--
-- IT ALSO COST SOMETHING. The cohort_mean CTE aggregated every row in scope -- 17,041
-- for a global resolution -- on every single profile load, to produce a constant.
--
-- No data is written. STABLE, read-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.hcp_profile_brief(p_hcp_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ta uuid;
  v_result json;
begin
  select id into v_ta from therapeutic_areas where slug = 'nsclc';

  with h as (
    select id, first_name, last_name,
           coalesce(institution_canonical, institution_normalized) as institution,
           nppes_practice_city as city,
           coalesce(nppes_practice_state, derived_state) as state,
           npi_number, npi_specialty,
           -- Effective country, for the US-only section gates (2026-08-19). Same
           -- expression the ledger and rising_board place people by. The profile had
           -- no country at all, so Medicare / Open Payments / Federal Funding -- all
           -- three US registries -- rendered their absence states for non-US records.
           nullif(btrim(coalesce(current_country, country)), '') as effective_country
    from hcps_v2 where id = p_hcp_id
  ),
  est as (
    -- US ROW IF THERE IS ONE, OTHERWISE GLOBAL (2026-08-19). This was pinned to
    -- region/US, so every HCP without a US row rendered INDEX, SCI, NET and PHARMA
    -- as em-dashes -- Martin Reck, global #3 with a cohort_score of 99.968, showed
    -- four blanks. The global rank was already being read two CTEs down; only the
    -- scores were US-only.
    --
    -- GLOBAL IS THE FALLBACK, not the person's own region: every Established HCP has
    -- exactly one global row by construction, so this can never blank again, and the
    -- profile has no territory selector to honour the way the ledger does.
    --
    -- scope_label follows the LEDGER'S PRECEDENT rather than inventing a second
    -- convention -- it names the POOL the rank was computed against, so the surface
    -- can say "#3 GLOBAL" instead of implying US. The caller must render it; a rank
    -- shown without its pool is the defect this fix exists to remove.
    select r.rank, r.scientific_influence_pctile sci, r.network_influence_pctile net,
           r.pharma_engagement_pctile ph, r.cohort_score idx,
           case when r.scope_type = 'global' then 'GLOBAL' else r.scope_value end as scope_label,
           r.scope_type
    from hcp_established_ranks_v3 r
    where r.hcp_id = p_hcp_id and r.therapeutic_area_id = v_ta
      and (r.scope_type = 'global' or (r.scope_type = 'region' and r.scope_value = 'US'))
    order by case when r.scope_type = 'region' then 0 else 1 end
    limit 1
  ),
  gl as (
    select r.rank gr from hcp_established_ranks_v3 r
    where r.hcp_id = p_hcp_id and r.therapeutic_area_id = v_ta and r.scope_type = 'global'
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
    -- Cohort-keyed read (2026-08-06): the established brief reads the established
    -- narrative row only. The legacy universal v1.0 rows were backfilled to
    -- cohort='established' for board members, so pre-regeneration prose still
    -- renders; a dual-board member's rising narrative is never consulted here.
    select narrative_text, prompt_version, generated_at, cohort from hcp_narratives_v2
    where hcp_id = p_hcp_id and therapeutic_area_slug = 'nsclc'
      and cohort = 'established'
    order by generated_at desc limit 1
  )
  select json_build_object(
    'hcp', (select json_build_object(
        'id', p_hcp_id, 'first_name', first_name, 'last_name', last_name,
        'name', trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')),
        'institution', institution, 'city', city, 'state', state,
        'npi', npi_number, 'specialty', npi_specialty,
        'country', effective_country) from h),
    'scores', (select json_build_object(
        'index', est.idx, 'rank', est.rank, 'global_rank', (select gr from gl),
        'sci', est.sci, 'net', est.net, 'pharma', est.ph,
        'scope_label', est.scope_label,
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
    'signal_summary', (select narrative_text from narr),
    'signal_summary_version', (select prompt_version from narr),
    'signal_summary_generated_at', (select generated_at from narr),
    'signal_summary_is_current', (select narrative_is_current(cohort, prompt_version) from narr)
  ) into v_result;

  return v_result;
end;
$function$

;

COMMIT;
