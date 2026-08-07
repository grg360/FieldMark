-- Established ledger summary fallback (2026-08-07).
--
-- The row summary is the scientific-positions synthesis headline
-- (hcp_ai_overviews). Six of the US top 200 (ranks 60, 82, 118, 124, 187, 194
-- at the time of writing) have NO qualifying first/senior-authored NSCLC paper
-- with a full abstract — the 2026-08-07 --skip-existing extraction run returned
-- "0 papers, 0 positions" for all six — so a positions headline is structurally
-- impossible for them and the scrolled ledger rendered blank summary rows.
--
-- Fix: coalesce to the ESTABLISHED narrative's why_now (narrative_text as its
-- own fallback) — the same headline convention the rising ledger adopted in
-- 2026_08_06_rising_ledger_momentum_headline.sql. All six carry an
-- established_v3.0 narrative, and with this fallback the US top 200 has zero
-- blank summaries. Positions headline stays first: where the synthesis exists
-- it is the sharper line.
--
-- Requires 2026_08_06_narratives_cohort_key.sql (cohort column).

CREATE OR REPLACE FUNCTION public.established_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where name = 'NSCLC'),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx
    from hcp_established_ranks_v3 r, ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'region' and r.scope_value = 'US'
  ),
  gl as (
    select r.hcp_id, r.rank as gr
    from hcp_established_ranks_v3 r, ta
    where r.therapeutic_area_id = ta.id and r.scope_type = 'global'
  ),
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, gl.gr as global_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
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
               ) as summary
        from top
        join hcps_v2 h on h.id = top.hcp_id
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  );
$function$;
