-- Practice-first community profile (frame: "Community Profile - Practice First").
-- Read-only SECURITY DEFINER aggregation of the practice-reality sections. Needed as an
-- RPC because hcp_nppes_detail_v2 and ta_hcpcs_codes have RLS enabled with no anon
-- policies (hcp_medicare_summary_v2 is public-read, included here for one round-trip).
--
-- Source of fact per section:
--   practice reality → hcp_medicare_summary_v2 (beneficiaries_2021/22/23 = unique WITHIN
--     each year; total_beneficiaries_3yr = SUM of the three = beneficiary-YEARS, not
--     people; total_beneficiaries_3yr_unique_est is the distinct-person estimate;
--     total_services_3yr, total_medicare_payment_3yr, beneficiaries_yoy_trend_pct,
--     primary_place_of_service, predominant_ruca, total_distinct_hcpcs_codes_3yr)
--   org / career → hcp_nppes_detail_v2 (organization_name, co_located_npi_count,
--     career_stage) — nullable per record, render honestly when absent
--   administered codes → unnest(top_hcpcs_codes) WITH ORDINALITY (rank order only —
--     NO per-code beneficiaries/services/dollars exist) LEFT JOIN ta_hcpcs_codes
--     (NSCLC) for code_description/code_category; unmatched codes stay as named gaps
--   coverage rail → measured across the top-200 US NSCLC community cohort (by
--     normalized_score), not this record alone
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
           total_services_3yr, total_medicare_payment_3yr,
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
