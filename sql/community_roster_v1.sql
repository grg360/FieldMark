-- Community roster — Phase 3 Commit 1 DDL (DRAFT 2026-08-11, NOT YET APPLIED).
-- The roster is territory-scoped (p_states), tier-banded, beneficiary-volume
-- ordered, and carries NO rank and NO score. Membership is
-- community_board_nsclc_v1.qualifies (the Phase 1 gate) — joined, never
-- re-derived.
--
-- ORDER (both overloads): tier band priority (anchored 1 → supported 2 →
-- heme_dominant 3 → candidate 4 → unresolved 5), then patient_volume DESC
-- (within-band reach fact), then hcp_id (stable tiebreak). No score anywhere.
--
-- NON-NSCLC TAs: return EMPTY (decided 2026-08-11). The POC roster is
-- NSCLC-only; the board and tier views carry no other TA. A future TA gets
-- its own board view + a revisit here, not a degraded fallback.
--
-- DEPLOY COUPLING (hard): applying these definitions breaks the deployed
-- frontend mapper (api.ts consumes rank / scope_size / normalized_score from
-- the old shape) and the profile readers (score / has_score). Apply live ONLY
-- together with the Commit 2 frontend conversion deploy.
--
-- On landing, these two get_community_filtered definitions supersede the ones
-- in sql/community_qualification_gate.sql (which keeps the two _count
-- overloads); update that file in the same commit for source-of-record parity.

DROP FUNCTION IF EXISTS public.get_community_filtered(uuid, text, text[], text[], integer, integer);
DROP FUNCTION IF EXISTS public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, evidence_tier text, patient_volume numeric, part_d_present boolean, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_career_stage_years integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT b.hcp_id, b.evidence_tier, b.patient_volume, b.part_d_present,
         h.country, h.first_name, h.last_name, h.institution_normalized,
         h.career_first_pub_year, h.total_career_pubs, h.nppes_career_stage_years,
         h.nppes_practice_city, h.nppes_practice_state, h.nppes_practice_setting, h.npi_specialty
  FROM community_board_nsclc_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE p_ta_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid
    AND b.qualifies
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY CASE b.evidence_tier WHEN 'anchored' THEN 1 WHEN 'supported' THEN 2 WHEN 'heme_dominant' THEN 3 WHEN 'candidate' THEN 4 ELSE 5 END,
           COALESCE(b.patient_volume, 0) DESC, b.hcp_id
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, evidence_tier text, patient_volume numeric, part_d_present boolean, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_career_stage_years integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text, cited_by_count integer, h_index integer, works_count integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.*, am.cited_by_count, am.h_index, am.works_count
  FROM get_community_filtered(p_ta_id, p_scope_type, p_scope_values, p_states, 2147483647, 0) r
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r.hcp_id
  WHERE (
    cardinality(p_canonical_theme_ids) = 0
    OR EXISTS (
      SELECT 1
      FROM hcp_research_themes_v2 rt
      JOIN theme_to_canonical_v1 ttc
        ON ttc.raw_theme_name = rt.theme_name
        AND ttc.therapeutic_area = rt.therapeutic_area
      WHERE rt.hcp_id = r.hcp_id
        AND ttc.canonical_id = ANY(p_canonical_theme_ids)
        AND rt.centrality IN ('core', 'supporting')
    )
  )
  ORDER BY CASE r.evidence_tier WHEN 'anchored' THEN 1 WHEN 'supported' THEN 2 WHEN 'heme_dominant' THEN 3 WHEN 'candidate' THEN 4 ELSE 5 END,
           COALESCE(r.patient_volume, 0) DESC, r.hcp_id
  LIMIT p_limit OFFSET p_offset;
$function$;

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
    select narrative_text, why_now, engagement_angle, signal_strength, caution_flags
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
        'caution', (select array_to_string(caution_flags, ' ')) ) from narr)
  ) into v_result;

  return v_result;
end;
$function$;

DROP FUNCTION IF EXISTS public.community_ledger(integer, integer, text[]);

CREATE OR REPLACE FUNCTION public.community_ledger(p_limit integer DEFAULT 1000, p_after_tier_priority integer DEFAULT 0, p_after_patient_volume numeric DEFAULT 0, p_after_hcp_id uuid DEFAULT '00000000-0000-0000-0000-000000000000', p_tiers text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with sel as (select coalesce(p_tiers, array['anchored','supported']) as tiers),
  base as (
    select b.hcp_id,
           b.evidence_tier,
           coalesce(b.patient_volume, 0) as patient_volume,
           b.part_d_present,
           case b.evidence_tier when 'anchored' then 1 when 'supported' then 2
                                when 'heme_dominant' then 3 when 'candidate' then 4
                                else 5 end as tier_priority,
           h.first_name, h.last_name, h.npi_specialty as specialty,
           h.nppes_practice_city as city, h.nppes_practice_state as state,
           h.nppes_career_stage_years as years,
           e.recurrence_band, e.supported_evidence, e.supported_evidence_rank,
           e.lung_weighted, e.anchor_stem, e.anchor_stems, e.anchor_years
    from community_board_nsclc_v1 b
    join hcps_v2 h on h.id = b.hcp_id
    left join hcp_nsclc_evidence_tier_v1 e on e.hcp_id = b.hcp_id
    where b.qualifies
  ),
  filtered as (
    select * from base cross join sel where base.evidence_tier = any(sel.tiers)
  ),
  page as (
    select * from filtered f
    where (f.tier_priority, -f.patient_volume, f.hcp_id)
        > (p_after_tier_priority, -p_after_patient_volume, p_after_hcp_id)
    order by f.tier_priority, -f.patient_volume, f.hcp_id
    limit p_limit
  )
  select json_build_object(
    'cohort_total',   (select count(*) from base),
    'filtered_total', (select count(*) from filtered),
    'tier_counts',    (select json_object_agg(evidence_tier, cnt) from (select evidence_tier, count(*) cnt from base group by evidence_tier) g),
    'tiers',          (select tiers from sel),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.tier_priority, t.patient_volume desc, t.hcp_id), '[]'::json) from (
        select page.hcp_id, page.tier_priority, page.patient_volume, page.part_d_present,
               page.first_name, page.last_name, page.specialty, page.city, page.state,
               s.total_payments_lifetime     as eng,
               s.distinct_companies_lifetime as companies,
               page.years,
               page.evidence_tier as tier, page.recurrence_band, page.supported_evidence,
               page.supported_evidence_rank, page.lung_weighted,
               page.anchor_stem, page.anchor_stems, page.anchor_years,
               (select n.narrative_text from hcp_narratives_v2 n
                 where n.hcp_id = page.hcp_id and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'community'
                 limit 1) as summary
        from page
        left join hcp_open_payments_summary_v2 s on s.hcp_id = page.hcp_id
      ) t
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.community_ledger(integer, integer, numeric, uuid, text[]) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_hcp_profile(uuid) TO anon, authenticated, service_role;
