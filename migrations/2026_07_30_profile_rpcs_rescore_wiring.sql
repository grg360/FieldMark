-- Display wiring for the 2026-07-30 community re-score. Adds to both profile RPCs:
--   • community_hcp_profile: 'nsclc' object (raw spend/volume + the two stored signals —
--     traceable, never blended into one opaque number) and 'medicare_paid_corrected'.
--   • community_practice_profile: medicare.medicare_paid_corrected.
-- The new score columns live on hcp_community_scores_v2 (base table), NOT in the
-- hcp_community_ranks_v2 view — read them directly. Additive JSON keys only.

create or replace function public.community_hcp_profile(p_hcp_id uuid)
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
           trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) as name,
           npi_number, npi_specialty,
           coalesce(institution_canonical, institution_normalized) as institution,
           nppes_practice_city as city,
           coalesce(nppes_practice_state, derived_state) as state
    from hcps_v2 where id = p_hcp_id
  ),
  crank as (
    select composite_score, normalized_score, rank, scope_size,
           patient_volume, pharma_engagement, career_years, publication_signal,
           nppes_practice_setting, nppes_career_stage_years, total_career_pubs
    from hcp_community_ranks_v2
    where hcp_id = p_hcp_id and therapeutic_area_id = v_ta
      and scope_type = 'region' and scope_value = 'US' limit 1
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
    select narrative_text, why_now, engagement_angle, signal_strength, caution_flags
    from hcp_narratives_v2 where hcp_id = p_hcp_id and therapeutic_area_slug = 'nsclc' limit 1
  )
  select json_build_object(
    'hcp', (select json_build_object('id', p_hcp_id, 'name', name, 'first_name', first_name,
        'last_name', last_name, 'specialty', npi_specialty, 'institution', institution, 'city', city, 'state', state, 'npi', npi_number) from h),
    'practice_shape', (select json_build_object(
        'patient_volume', patient_volume, 'setting', nppes_practice_setting,
        'career_years', coalesce(nppes_career_stage_years, career_years::int),
        'drug_breadth', (select count(*) from drugs), 'total_career_pubs', total_career_pubs) from crank),
    'nsclc', (select json_build_object(
        'spend_3yr', nsclc_spend_3yr, 'volume_2023_est', nsclc_volume_2023_est,
        'spend_signal', spend_signal, 'volume_signal', volume_signal) from sigs),
    'medicare_paid_corrected', (select total_paid_3yr_corrected from medcorr),
    'score', (select json_build_object(
        'composite', round(composite_score::numeric, 0), 'normalized', normalized_score,
        'rank', rank, 'scope_size', scope_size,
        'publication_signal', publication_signal, 'total_career_pubs', total_career_pubs) from crank),
    'has_score', (select composite_score is not null from crank),
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
        'caution', (select array_to_string(caution_flags, ' ')) ) from narr)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.community_hcp_profile(uuid) to anon, authenticated;

-- practice-first RPC: corrected paid beside the defective figure
create or replace function public.community_practice_profile(p_hcp_id uuid)
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
    select c.hcp_id, coalesce(h.total_career_pubs, 0) as pubs
    from hcp_community_scores_v2 c
    join hcps_v2 h on h.id = c.hcp_id
    where c.therapeutic_area_id = v_ta and h.country = 'US'
    order by c.normalized_score desc limit 200
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
$$;

grant execute on function public.community_practice_profile(uuid) to anon, authenticated;
