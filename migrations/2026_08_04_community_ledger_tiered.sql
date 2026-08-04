-- community_ledger: tiered by NSCLC evidence. Keeps everything it did (name,
-- specialty, location, years, index, Open Payments, narrative, rank-keyed
-- pagination) and joins hcp_nsclc_evidence_tier_v1 to add tier / recurrence_band /
-- supported_evidence(_rank) / lung_weighted, re-sort by tier, and default-filter to
-- anchored + supported (1,068 of 6,480).
--
-- SORT (all keys, deterministic): tier (anchored<supported<candidate<heme_dominant
-- <unresolved) -> recurrence_band (recurs<single_year, anchored only) ->
-- supported_evidence_rank asc (supported only) -> normalized_score desc -> hcp_id.
-- The hcp_id tiebreak is REQUIRED: without a deterministic last key the ranking is
-- nondeterministic between calls (the bug that made the view and ledger disagree
-- for 3,582 HCPs). Do not remove it.
--
-- PAGINATION: rank is row_number() over the FILTERED set, so it is a contiguous
-- 1..N monotonic sequence for the given p_tiers, and `rank > p_after_rank limit
-- p_limit` neither skips nor duplicates. A different p_tiers is a different
-- population and a different ranking — page within one filter setting.
--
-- COUNTS: cohort_total is the full 6,480 (pre-filter); filtered_total is the count
-- for the active p_tiers. The surface returns both so it can say "1,068 of 6,480"
-- rather than showing a shrunken number that reads as data loss.
--
-- The (int,int) overload is dropped so the 3-arg form is unambiguous for the
-- existing 2-arg callers (p_tiers defaults to the anchored+supported view).

DROP FUNCTION IF EXISTS public.community_ledger(integer, integer);

CREATE OR REPLACE FUNCTION public.community_ledger(
  p_limit      integer  DEFAULT 1000,
  p_after_rank integer  DEFAULT 0,
  p_tiers      text[]   DEFAULT NULL   -- NULL => default view {anchored, supported}; pass tiers to widen
)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  sel as (select coalesce(p_tiers, array['anchored','supported']) as tiers),
  base as (
    select c.hcp_id,
           c.normalized_score as idx,
           h.first_name, h.last_name, h.npi_specialty as specialty,
           h.nppes_practice_city as city, h.nppes_practice_state as state,
           coalesce(h.nppes_career_stage_years, c.career_years::int) as years,
           e.tier, e.recurrence_band, e.supported_evidence,
           e.supported_evidence_rank, e.lung_weighted
    from hcp_community_scores_v2 c
    join hcps_v2 h on h.id = c.hcp_id
    join hcp_nsclc_evidence_tier_v1 e on e.hcp_id = c.hcp_id
    cross join ta
    where c.therapeutic_area_id = ta.id and h.country = 'US'
  ),
  filtered as (
    select b.*,
           row_number() over (
             order by
               case b.tier when 'anchored' then 1 when 'supported' then 2
                            when 'candidate' then 3 when 'heme_dominant' then 4
                            else 5 end,
               case b.recurrence_band when 'recurs' then 0 when 'single_year' then 1
                            else 0 end,
               coalesce(b.supported_evidence_rank, 0),
               b.idx desc,
               b.hcp_id
           ) as rank
    from base b
    cross join sel
    where b.tier = any(sel.tiers)
  ),
  top as (select * from filtered where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total',   (select count(*) from base),
    'filtered_total', (select count(*) from filtered),
    'tiers',          (select tiers from sel),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank,
               top.rank as global_rank,   -- US-only cohort: unchanged shape; now the tiered rank
               top.first_name, top.last_name, top.specialty, top.city, top.state,
               s.total_payments_lifetime     as eng,
               s.distinct_companies_lifetime as companies,
               top.years, top.idx, top.hcp_id,
               top.tier, top.recurrence_band, top.supported_evidence,
               top.supported_evidence_rank, top.lung_weighted,
               (select n.narrative_text from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                 limit 1) as summary
        from top
        left join hcp_open_payments_summary_v2 s on s.hcp_id = top.hcp_id
      ) t
    )
  );
$function$;

-- ---------------------------------------------------------------------------
-- Run these two as separate statements after the function exists.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.community_ledger(integer, integer, text[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
