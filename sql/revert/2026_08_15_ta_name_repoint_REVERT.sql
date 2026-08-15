-- REVERT ARTIFACT — pg_get_functiondef captured 2026-08-15, BEFORE the
-- NSCLC -> Lung Cancer rename repoint. These are the 10 live functions that
-- resolved the TA by literal name and would have returned EMPTY (not errored)
-- once therapeutic_areas.name changed. Restoring this file restores the
-- pre-repoint definitions exactly.

-- ══ asset_authors(text,integer) ══
CREATE OR REPLACE FUNCTION public.asset_authors(p_generic text, p_limit integer DEFAULT 6)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  ),
  auth as (
    select pa.hcp_id, count(*) as c
    from publication_authors_v2 pa
    join pubs on pubs.id = pa.publication_id
    where pa.hcp_id is not null
    group by pa.hcp_id
  ),
  ranked as (
    select a.hcp_id, a.c, h.first_name, h.last_name,
           r.rank as board_rank, r.scope_value, r.scope_type
    from auth a
    join hcps_v2 h on h.id = a.hcp_id
    left join lateral (
      select rank, scope_value, scope_type
      from hcp_established_ranks_v3 r
      where r.hcp_id = a.hcp_id
        and r.therapeutic_area_id = (select id from therapeutic_areas where name = 'NSCLC')
      order by rank asc
      limit 1
    ) r on true
  )
  select json_build_object(
    'authors', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select hcp_id, c, first_name, last_name, board_rank, scope_value, scope_type
        from ranked order by c desc, board_rank asc nulls last limit p_limit
      ) t
    ),
    'resolved', (select count(*) from auth),
    'board_ranked', (select count(*) from ranked where board_rank is not null),
    'author_strings', (
      select coalesce(sum(jsonb_array_length(coalesce(v.pubmed_authorships, '[]'::jsonb))), 0)
      from publications_v2 v join pubs on pubs.id = v.id
    )
  );
$function$;

-- ══ asset_overview(text) ══
CREATE OR REPLACE FUNCTION public.asset_overview(p_generic text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  ),
  p as (
    select v.* from publications_v2 v join pubs on pubs.id = v.id
  ),
  themed as (
    select distinct pt.publication_id
    from publication_theme_v1 pt
    join pubs on pubs.id = pt.publication_id
    where pt.is_primary
  ),
  auth as (
    select pa.hcp_id
    from publication_authors_v2 pa
    join pubs on pubs.id = pa.publication_id
    where pa.hcp_id is not null
    group by pa.hcp_id
  )
  select json_build_object(
    'generic', p_generic,
    'total_pubs', (select count(*) from p),
    'ytd_2026', (select count(*) from p where pub_year >= 2026),
    'themed', (select count(*) from themed),
    'open_access', (select count(*) from p where (open_access->>'is_oa')::boolean is true),
    'authors_resolved', (select count(*) from auth),
    'board_ranked', (
      select count(distinct a.hcp_id) from auth a
      join hcp_established_ranks_v3 r on r.hcp_id = a.hcp_id
      where r.therapeutic_area_id = (select id from therapeutic_areas where name = 'NSCLC')
    ),
    'author_strings', (
      select coalesce(sum(jsonb_array_length(coalesce(pubmed_authorships, '[]'::jsonb))), 0) from p
    ),
    'earliest_year', (select min(pub_year) from p),
    'trajectory_resolved', (
      select count(*) from p
      where citation_counts_by_year is not null
        and jsonb_array_length(citation_counts_by_year) > 0
    )
  );
$function$;

-- ══ community_hcp_profile(uuid) ══
CREATE OR REPLACE FUNCTION public.community_hcp_profile(p_hcp_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ta uuid;
  v_result json;
begin
  select id into v_ta from therapeutic_areas where name = 'NSCLC';

  with h as (
    select id, first_name, last_name,
           trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) as name,
           npi_number, npi_specialty,
           coalesce(institution_canonical, institution_normalized) as institution,
           nppes_practice_city as city,
           coalesce(nppes_practice_state, derived_state) as state,
           nppes_practice_setting, nppes_career_stage_years, total_career_pubs
    from hcps_v2 where id = p_hcp_id
  ),
  board as (
    select qualifies, patient_volume, part_d_present, evidence_tier
    from community_board_nsclc_v1 where hcp_id = p_hcp_id limit 1
  ),
  tierdetail as (
    select tier, recurrence_band, anchor_stem, anchor_stems, anchor_years,
           supported_evidence, lung_weighted
    from hcp_nsclc_evidence_tier_v1 where hcp_id = p_hcp_id limit 1
  ),
  crank as (
    select career_years
    from hcp_community_scores_v2
    where hcp_id = p_hcp_id and therapeutic_area_id = v_ta limit 1
  ),
  sigs as (
    select nsclc_spend_3yr, nsclc_volume_2023_est, spend_signal, volume_signal
    from hcp_community_scores_v2
    where hcp_id = p_hcp_id and therapeutic_area_id = v_ta limit 1
  ),
  medcorr as (
    select total_paid_3yr_corrected from hcp_medicare_summary_v2 where hcp_id = p_hcp_id
  ),
  drugs as (
    select drug_name, manufacturer_name, total_amount_usd, payment_count,
           most_recent_payment_date, year_over_year_trend_pct,
           py2022_total, py2023_total, py2024_total
    from hcp_open_payments_by_drug_v2 where hcp_id = p_hcp_id
  ),
  sum2 as (
    select distinct_companies_lifetime, total_payments_lifetime,
           py2022_total, py2023_total, py2024_total,
           consulting_3yr, speaker_bureau_3yr, food_beverage_3yr, honoraria_3yr,
           travel_lodging_3yr, education_3yr, royalty_3yr
    from hcp_open_payments_summary_v2 where hcp_id = p_hcp_id limit 1
  ),
  entities as (
    select manufacturer_name nm, total_amount_usd amt, payment_count cnt,
           most_recent_payment_date rec, rank_by_amount rk
    from hcp_open_payments_top_companies_v2 where hcp_id = p_hcp_id order by rank_by_amount limit 10
  ),
  narr as (
    select narrative_text, why_now, engagement_angle, signal_strength, caution_flags,
           narrative_is_current('community', prompt_version) as is_current
    from hcp_narratives_v2 where hcp_id = p_hcp_id and therapeutic_area_slug = 'nsclc'
      and cohort = 'community' limit 1
  )
  select json_build_object(
    'hcp', (select json_build_object('id', p_hcp_id, 'name', name, 'first_name', first_name,
        'last_name', last_name, 'specialty', npi_specialty, 'institution', institution, 'city', city, 'state', state, 'npi', npi_number) from h),
    'practice_shape', (select json_build_object(
        'patient_volume', (select patient_volume from board),
        'setting', nppes_practice_setting,
        'career_years', coalesce(nppes_career_stage_years, (select career_years::int from crank)),
        'drug_breadth', (select count(*) from drugs),
        'total_career_pubs', total_career_pubs) from h),
    'standing', (select json_build_object(
        'qualifies', qualifies,
        'evidence_tier', evidence_tier,
        'patient_volume', patient_volume,
        'part_d_present', part_d_present,
        'recurrence_band', (select recurrence_band from tierdetail),
        'anchor_stem', (select anchor_stem from tierdetail),
        'anchor_stems', (select anchor_stems from tierdetail),
        'anchor_years', (select anchor_years from tierdetail),
        'supported_evidence', (select supported_evidence from tierdetail),
        'lung_weighted', (select lung_weighted from tierdetail)) from board),
    'nsclc', (select json_build_object(
        'spend_3yr', nsclc_spend_3yr, 'volume_2023_est', nsclc_volume_2023_est,
        'spend_signal', spend_signal, 'volume_signal', volume_signal) from sigs),
    'medicare_paid_corrected', (select total_paid_3yr_corrected from medcorr),
    'engagement', json_build_object(
        'has_record', (select exists(select 1 from drugs)),
        'distinct_drugs', (select count(*) from drugs),
        'lifetime_total', (select total_payments_lifetime from sum2),
        'distinct_companies', (select distinct_companies_lifetime from sum2),
        'products', (select json_agg(json_build_object(
            'drug', drug_name, 'entity', manufacturer_name, 'amount', total_amount_usd,
            'payments', payment_count, 'most_recent', most_recent_payment_date,
            'trend_pct', year_over_year_trend_pct,
            'py2022', py2022_total, 'py2023', py2023_total, 'py2024', py2024_total)
          order by total_amount_usd desc) from drugs)
    ),
    'mix', (select case when sum2 is null then null else json_build_array(
        json_build_object('label','Consulting','amount', consulting_3yr),
        json_build_object('label','Speaker bureau','amount', speaker_bureau_3yr),
        json_build_object('label','Food & beverage','amount', food_beverage_3yr),
        json_build_object('label','Honoraria','amount', honoraria_3yr),
        json_build_object('label','Travel, lodging, education','amount', coalesce(travel_lodging_3yr,0)+coalesce(education_3yr,0)),
        json_build_object('label','Royalty','amount', royalty_3yr)
      ) end from sum2),
    'entities', (select json_agg(json_build_object('name', nm, 'amount', amt, 'payments', cnt,
        'most_recent', rec, 'rank', rk) order by rk) from entities),
    'timeline', (select case when sum2 is null then null else json_build_array(
        json_build_object('year', 2022, 'total', py2022_total),
        json_build_object('year', 2023, 'total', py2023_total),
        json_build_object('year', 2024, 'total', py2024_total)) end from sum2),
    'narrative', (select json_build_object('why_this', narrative_text, 'signal_strength', signal_strength,
        'why_now', why_now, 'engagement_angle', engagement_angle,
        'caution', (select array_to_string(caution_flags, ' ')), 'is_current', is_current ) from narr)
  ) into v_result;

  return v_result;
end;
$function$;

-- ══ community_practice_profile(uuid) ══
CREATE OR REPLACE FUNCTION public.community_practice_profile(p_hcp_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ta uuid;
  v_result json;
begin
  select id into v_ta from therapeutic_areas where name = 'NSCLC';

  with med as (
    select beneficiaries_2021, beneficiaries_2022, beneficiaries_2023,
           total_beneficiaries_3yr, total_beneficiaries_3yr_unique_est,
           total_services_3yr, total_medicare_payment_3yr, total_paid_3yr_corrected,
           total_distinct_hcpcs_codes_3yr, beneficiaries_yoy_trend_pct,
           primary_place_of_service, predominant_ruca, top_hcpcs_codes
    from hcp_medicare_summary_v2 where hcp_id = p_hcp_id
  ),
  npp as (
    select nppes_organization_name, nppes_co_located_npi_count, nppes_career_stage
    from hcp_nppes_detail_v2 where hcp_id = p_hcp_id
  ),
  codes as (
    select u.code, u.ord, t.code_description, t.code_category
    from med, unnest(med.top_hcpcs_codes) with ordinality as u(code, ord)
    left join ta_hcpcs_codes t
      on t.hcpcs_code = u.code and t.therapeutic_area_id = v_ta
  ),
  cohort as (
    select b.hcp_id, coalesce(h.total_career_pubs, 0) as pubs
    from community_board_nsclc_v1 b
    join hcps_v2 h on h.id = b.hcp_id
    where b.qualifies
    order by b.patient_volume desc, b.hcp_id limit 200
  ),
  cov as (
    select
      round(100.0 * count(m.hcp_id) / greatest(count(*), 1)) as medicare_pct,
      round(100.0 * count(n.hcp_id) / greatest(count(*), 1)) as nppes_pct,
      round(100.0 * count(o.hcp_id) / greatest(count(*), 1)) as op_pct,
      round(100.0 * count(*) filter (where ch.pubs > 0) / greatest(count(*), 1)) as pubs_pct
    from cohort ch
    left join hcp_medicare_summary_v2 m on m.hcp_id = ch.hcp_id
    left join hcp_nppes_detail_v2 n on n.hcp_id = ch.hcp_id
    left join hcp_open_payments_summary_v2 o on o.hcp_id = ch.hcp_id
  ),
  hcov as (
    select round(100.0 * count(t.hcpcs_code) / greatest(count(*), 1)) as hcpcs_named_pct
    from cohort ch
    join hcp_medicare_summary_v2 m on m.hcp_id = ch.hcp_id,
    unnest(m.top_hcpcs_codes) as code
    left join ta_hcpcs_codes t on t.hcpcs_code = code and t.therapeutic_area_id = v_ta
  )
  select json_build_object(
    'has_medicare', (select exists(select 1 from med)),
    'medicare', (select json_build_object(
        'benes_2021', beneficiaries_2021, 'benes_2022', beneficiaries_2022,
        'benes_2023', beneficiaries_2023,
        'beneficiary_years_3yr', total_beneficiaries_3yr,
        'unique_benes_est', total_beneficiaries_3yr_unique_est,
        'services_3yr', total_services_3yr,
        'medicare_paid_3yr', total_medicare_payment_3yr,
        'medicare_paid_corrected', total_paid_3yr_corrected,
        'distinct_codes_3yr', total_distinct_hcpcs_codes_3yr,
        'benes_yoy_trend_pct', beneficiaries_yoy_trend_pct,
        'place_of_service', primary_place_of_service,
        'ruca', predominant_ruca) from med),
    'nppes', (select json_build_object(
        'organization', nppes_organization_name,
        'co_located_npis', nppes_co_located_npi_count,
        'career_stage', nppes_career_stage) from npp),
    'admin_codes', (select coalesce(json_agg(json_build_object(
        'code', code, 'ord', ord, 'name', code_description, 'category', code_category)
        order by ord), '[]'::json) from codes),
    'coverage', (select json_build_object(
        'medicare', cov.medicare_pct, 'nppes', cov.nppes_pct,
        'open_payments', cov.op_pct, 'publications', cov.pubs_pct,
        'hcpcs_named', (select hcpcs_named_pct from hcov)) from cov)
  ) into v_result;

  return v_result;
end;
$function$;

-- ══ established_ledger(integer,integer,text[],text[]) ══
CREATE OR REPLACE FUNCTION public.established_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx, r.scope_value as scored_country
    from hcp_established_ranks_v3 r
    join hcps_v2 hs on hs.id = r.hcp_id
    cross join ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'region'
      and r.scope_value = any(p_countries)
      and (cardinality(p_states) = 0 or coalesce(hs.nppes_practice_state, hs.derived_state) = any(p_states))
  ),
  gl as (
    select r.hcp_id, r.rank as gr
    from hcp_established_ranks_v3 r, ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'global'
  ),
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'states', p_states,
    'countries', p_countries,
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, gl.gr as global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               -- scored_country is the authoritative chip for Established: the pool this
               -- rank was actually computed against. current_country is carried alongside
               -- for the hedge, NOT for placement.
               top.scored_country,
               h.country, h.current_country,
               h.affiliation_confidence, h.affiliation_as_of,
               top.sci, top.net, top.ph, top.idx, top.hcp_id,
               coalesce(
                 (
                   select case when o.body ~ '^\s*\{' then (o.body::jsonb ->> 'headline') else null end
                   from hcp_ai_overviews o
                   where o.hcp_id = top.hcp_id
                     and o.synthesis_type = 'scientific_positions'
                     and o.therapeutic_area = 'NSCLC'
                   limit 1
                 ),
                 -- fallback: the established narrative's single-sentence
                 -- strongest-signal line — for HCPs whose record holds no
                 -- qualifying paper for positions synthesis
                 (
                   select coalesce(n.why_now, n.narrative_text)
                   from hcp_narratives_v2 n
                   where n.hcp_id = top.hcp_id
                     and n.therapeutic_area_slug = 'nsclc'
                     and n.cohort = 'established'
                   limit 1
                 )
               ) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'established'
                 limit 1) as summary_is_current
        from top
        join hcps_v2 h on h.id = top.hcp_id
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  );
$function$;

-- ══ hcp_administered_therapy(uuid) ══
CREATE OR REPLACE FUNCTION public.hcp_administered_therapy(p_hcp_id uuid)
 RETURNS TABLE(program_year integer, hcpcs_code text, hcpcs_desc text, tot_benes integer, total_bene_day_services integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.program_year, d.hcpcs_code, d.hcpcs_desc, d.tot_benes, d.total_bene_day_services
  FROM hcp_hcpcs_detail d
  WHERE d.hcp_id = p_hcp_id
    AND d.hcpcs_drug_indicator = 'Y'
    AND d.place_of_service = 'O'
    AND (d.hcpcs_code LIKE 'J%' OR d.hcpcs_code LIKE 'Q%')
    AND d.hcpcs_code NOT IN ('J0897', 'J9217')
    AND EXISTS (
      SELECT 1 FROM ta_hcpcs_codes t
      WHERE t.hcpcs_code = d.hcpcs_code
        AND t.code_category = 'drug_admin'
        AND t.therapeutic_area_id = (SELECT id FROM therapeutic_areas WHERE name = 'NSCLC')
    );
$function$;

-- ══ hcp_profile_brief(uuid) ══
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
    'signal_summary', (select narrative_text from narr),
    'signal_summary_version', (select prompt_version from narr),
    'signal_summary_generated_at', (select generated_at from narr),
    'signal_summary_is_current', (select narrative_is_current(cohort, prompt_version) from narr)
  ) into v_result;

  return v_result;
end;
$function$;

-- ══ hcp_profile_spine(uuid) ══
CREATE OR REPLACE FUNCTION public.hcp_profile_spine(p_hcp_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when exists (
    select 1
    from hcp_established_ranks_v3 e
    join therapeutic_areas ta on ta.id = e.therapeutic_area_id and ta.name = 'NSCLC'
    where e.hcp_id = p_hcp_id
      and e.scope_type = 'global'
  ) then 'academic' else 'community' end;
$function$;

-- ══ ledger_meta(text) ══
CREATE OR REPLACE FUNCTION public.ledger_meta(p_cohort text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ══ rising_ledger(integer,integer,text[],text[]) ══
CREATE OR REPLACE FUNCTION public.rising_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  europe as (select country_code from region_countries where region_key = 'EUROPE'),
  -- The whole board with its effective country, once. Both auxiliary ranks are computed
  -- over THIS set (the full board), never over the current selection — so they do not
  -- change as the user slices.
  allb as (
    select r.hcp_id,
           r.rank as global_rank,
           nullif(btrim(coalesce(h.current_country, h.country)), '') as eff,
           r.scientific_momentum_percentile   as scimom,
           r.network_momentum_percentile      as netmom,
           r.scientific_visibility_percentile as scivis,
           r.network_visibility_percentile    as netvis,
           r.rising_star_percentile           as idx,
           r.archetype
    from hcp_rising_star_ranks_v3 r
    join hcps_v2 h on h.id = r.hcp_id
    cross join ta
    where r.therapeutic_area_id = ta.id
  ),
  ranked as (
    select a.*,
           row_number() over (partition by a.eff order by a.global_rank) as country_rank,
           case when a.eff in (select country_code from europe)
                then row_number() over (
                       partition by (a.eff in (select country_code from europe))
                       order by a.global_rank)
           end as europe_rank
    from allb a
  ),
  base as (
    select rk.*, row_number() over (order by rk.global_rank) as rank
    from ranked rk
    where rk.eff = any(p_countries)
  ),
  us as (
    select b.*
    from base b
    join hcps_v2 hs on hs.id = b.hcp_id
    where (cardinality(p_states) = 0 or coalesce(hs.nppes_practice_state, hs.derived_state) = any(p_states))
  ),
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'states', p_states,
    'countries', p_countries,
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, top.global_rank, top.country_rank, top.europe_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               top.eff as scored_country,
               h.country, h.current_country,
               h.affiliation_confidence, h.affiliation_as_of,
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
               ) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'rising_star'
                 limit 1) as summary_is_current
        from top
        join hcps_v2 h on h.id = top.hcp_id
      ) t
    )
  );
$function$;
