-- Community profile RPC: engagement-record redesign (trend-free, magnitude/breadth).
-- The entities payload gains the two columns hcp_open_payments_top_companies_v2 already
-- holds but the RPC dropped: most_recent_payment_date (recency — these are current
-- relationships) and rank_by_amount (the table's own ranking). Top-N raised 8 → 10.
-- Additive JSON keys only — older frontends ignore them. Everything else unchanged from
-- 2026_07_29_community_hcp_profile_rpc.sql.

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
