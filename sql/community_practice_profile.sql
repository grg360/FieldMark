-- community_practice_profile — practice-reality payload for PracticeFirstProfile
-- (captured from live 2026-08-11 via pg_get_functiondef; editor-applied object,
-- previously restorable from nowhere — this file is now its source of record).
--
-- PRE-FREEZE RE-KEY (2026-08-11): the coverage CTE's top-200 sample was
-- ORDER BY normalized_score DESC — the frozen column. It now samples the
-- top-200 QUALIFYING board members by Medicare reach (patient_volume DESC
-- from community_board_nsclc_v1), so every coverage percentage reads
-- "across the top-200 by Medicare reach". Output shape unchanged — the
-- consumer is agnostic to the re-key.

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

GRANT EXECUTE ON FUNCTION public.community_practice_profile(uuid) TO anon, authenticated, service_role;
