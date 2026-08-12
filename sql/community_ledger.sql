-- community_ledger v3 — the community roster ledger RPC (source of record;
-- supersedes the v2 definition inside sql/community_roster_v1.sql).
-- DRAFT 2026-08-12, NOT YET APPLIED.
--
-- v3 adds TERRITORY SCOPING: p_states text[] DEFAULT '{}' filters
-- h.nppes_practice_state with the same predicate shape as
-- get_community_filtered. Empty array = national (current behavior).
-- cohort_total, filtered_total AND tier_counts all derive from the
-- state-filtered base CTE, so a scoped view carries scoped counts — the
-- honesty requirement. The keyset cursor (p_after_*) is unchanged; the
-- territory predicate is an additional WHERE inside base, so pagination
-- advances within the filtered set.
--
-- APPLY NOTE: the DROP below is REQUIRED. CREATE OR REPLACE with the new
-- 6-param list would create an overload beside the 5-param v2, making named-
-- argument calls that omit p_states ambiguous. Dropping v2 first keeps one
-- function; existing callers that pass no p_states keep working via the
-- DEFAULT, which decouples this apply from the frontend deploy.

DROP FUNCTION IF EXISTS public.community_ledger(integer, integer, numeric, uuid, text[]);

CREATE OR REPLACE FUNCTION public.community_ledger(p_limit integer DEFAULT 1000, p_after_tier_priority integer DEFAULT 0, p_after_patient_volume numeric DEFAULT 0, p_after_hcp_id uuid DEFAULT '00000000-0000-0000-0000-000000000000', p_tiers text[] DEFAULT NULL::text[], p_states text[] DEFAULT '{}'::text[])
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
      and (cardinality(p_states) = 0 or h.nppes_practice_state = any(p_states))
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
    'states',         p_states,
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

GRANT EXECUTE ON FUNCTION public.community_ledger(integer, integer, numeric, uuid, text[], text[]) TO anon, authenticated, service_role;
