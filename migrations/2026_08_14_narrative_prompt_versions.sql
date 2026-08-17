-- ============================================================================
-- narrative_prompt_versions — one source of truth for the current prompt version
-- per cohort, plus is_current on every narrative-returning RPC.
-- Date: 2026-08-14   Branch: resurfacing
--
-- NOT YET APPLIED.
--
-- No conflict with the other unapplied migrations on this branch:
--   2026_08_13_trials_surface_global_ranks.sql  -> get_nsclc_trials_surface()
--   2026_08_14_profile_spine_board_membership.sql -> hcp_profile_spine()
-- Neither object is touched here. All three are order-independent.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The current prompt version per cohort lived as three Python literals in
-- generate_narratives_v2.py (PROMPT_VERSION / ESTABLISHED_PROMPT_VERSION /
-- RISING_STAR_PROMPT_VERSION). Any consumer wanting to know whether a stored
-- narrative is stale had to duplicate those literals, and a duplicate cannot be
-- kept in sync by anything but discipline. The generator and every reader now
-- read the same row.
--
-- Note the values are NOT globally comparable: 'v1.0' is CURRENT for community
-- and SUPERSEDED for established. Staleness is only meaningful per cohort, which
-- is why the key is the cohort and the helper takes both arguments.
--
-- ── is_current is returned and deliberately NOT acted on ────────────────────
-- Every narrative-returning RPC now reports is_current alongside the narrative.
-- No display gate is wired: the frontend receives the flag and ignores it. That
-- is intentional — gating display would today suppress 1,478 stored narratives
-- (1,106 of them US established on the superseded 'v1.0'), which is a product
-- decision, not a migration. Shipping the signal first lets that decision be
-- made against a surface that already reports the truth.
-- ============================================================================

CREATE TABLE IF NOT EXISTS narrative_prompt_versions (
  cohort          text PRIMARY KEY,
  current_version text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE narrative_prompt_versions IS
  'Current narrative prompt version per cohort. Read by generate_narratives_v2.py at '
  'startup and by narrative_is_current(). Bump the row in the same migration that '
  'changes the prompt.';

-- Seeded from generate_narratives_v2.py as of 2026-08-14 (lines 67, 82, 88).
-- Idempotent: re-running refreshes the value without duplicating rows.
INSERT INTO narrative_prompt_versions (cohort, current_version) VALUES
  ('community',   'v1.0'),
  ('established', 'established_v3.0'),
  ('rising_star', 'rising_star_v4.1')
ON CONFLICT (cohort) DO UPDATE
  SET current_version = EXCLUDED.current_version, updated_at = now();

GRANT SELECT ON public.narrative_prompt_versions TO service_role;

-- Returns NULL (not false) when the cohort is unknown or either argument is
-- NULL: "we cannot say" is not the same claim as "this is stale", and a caller
-- that renders a staleness badge should be able to tell them apart.
CREATE OR REPLACE FUNCTION public.narrative_is_current(p_cohort text, p_prompt_version text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN p_cohort IS NULL OR p_prompt_version IS NULL THEN NULL
           ELSE (SELECT v.current_version = p_prompt_version
                 FROM narrative_prompt_versions v WHERE v.cohort = p_cohort)
         END;
$function$;

-- ── Narrative-returning RPCs, each gaining is_current ───────────────────────
-- Generated from the live definitions with a single verified anchor per patch;
-- every other line is byte-identical to what is deployed today.

-- ── established_ledger ─────────────────────────────────────────────
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
$function$
;

-- ── rising_ledger ─────────────────────────────────────────────
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
$function$
;

-- ── community_ledger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_ledger(p_limit integer DEFAULT 1000, p_after_tier_priority integer DEFAULT 0, p_after_patient_volume numeric DEFAULT 0, p_after_hcp_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, p_tiers text[] DEFAULT NULL::text[], p_states text[] DEFAULT '{}'::text[])
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
                 limit 1) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = page.hcp_id and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'community'
                 limit 1) as summary_is_current
        from page
        left join hcp_open_payments_summary_v2 s on s.hcp_id = page.hcp_id
      ) t
    )
  );
$function$
;

-- ── hcp_profile_brief ─────────────────────────────────────────────
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
$function$
;

-- ── hcp_rising_profile ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hcp_rising_profile(p_hcp_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH ta AS (
  SELECT id FROM therapeutic_areas WHERE slug = 'nsclc' LIMIT 1
),
r AS (
  SELECT * FROM hcp_rising_star_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
h AS (
  SELECT id, first_name, last_name, preferred_display_name,
         institution_normalized, country, nppes_practice_state,
         nppes_practice_city, career_first_pub_year, npi_number
  FROM hcps_v2 WHERE id = p_hcp_id
),
sm AS (
  SELECT * FROM hcp_scientific_momentum_v1
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
nm AS (
  SELECT * FROM hcp_network_momentum_v1
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
nar AS (
  -- Cohort-keyed read: this surface renders the rising spine, so it reads the
  -- rising narrative. A dual-board member's established narrative coexists on
  -- its own row and is never consulted here.
  SELECT narrative_text, generated_at, prompt_version, source_enrichment_run_id,
         narrative_is_current('rising_star', prompt_version) AS is_current
  FROM hcp_narratives_v2
  WHERE hcp_id = p_hcp_id AND therapeutic_area_slug = 'nsclc'
    AND cohort = 'rising_star'
  LIMIT 1
),
est_us AS (
  SELECT rank, cohort_score FROM hcp_established_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND scope_type = 'region' AND scope_value = 'US'
),
est_gl AS (
  SELECT rank, cohort_score FROM hcp_established_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND scope_type = 'global'
),
pos AS (
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE author_role = 'first_author')::int AS first_basis,
         count(*) FILTER (WHERE author_role = 'senior_author')::int AS senior_basis
  FROM hcp_scientific_positions_v1
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
lead AS (
  SELECT senior_pub_count, first_pub_count FROM hcp_publication_leadership_v2
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
collab_total AS (
  SELECT count(*)::int AS n FROM hcp_top_collaborators_v2
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND window_type = '10yr'
),
band AS (
  -- archetype mix inside this HCP's rank band, for the archetype panel note
  SELECT count(*)::int AS band_total,
         count(*) FILTER (WHERE b.archetype = (SELECT archetype FROM r))::int AS band_same_archetype
  FROM hcp_rising_star_ranks_v3 b
  WHERE b.therapeutic_area_id = (SELECT id FROM ta)
    AND CASE
          WHEN (SELECT rank FROM r) <= 100 THEN b.rank <= 100
          WHEN (SELECT rank FROM r) <= 300 THEN b.rank > 100 AND b.rank <= 300
          WHEN (SELECT rank FROM r) <= 600 THEN b.rank > 300 AND b.rank <= 600
          ELSE b.rank > 600
        END
),
collabs AS (
  SELECT jsonb_agg(jsonb_build_object(
           'rank', c.rank,
           'hcp_id', c.collaborator_hcp_id,
           'name', trim(coalesce(ch.first_name, '') || ' ' || coalesce(ch.last_name, '')),
           'institution', ch.institution_normalized,
           'shared_publications', c.shared_publications,
           'est_us_rank', eu.rank,
           'est_us_score', eu.cohort_score,
           'est_global_rank', eg.rank,
           'est_global_score', eg.cohort_score,
           'rising_us_rank', rr.us_rank,
           'rising_global_rank', rr.rank,
           'cohort_class', cc.cohort
         ) ORDER BY c.rank) AS arr
  FROM hcp_top_collaborators_v2 c
  JOIN hcps_v2 ch ON ch.id = c.collaborator_hcp_id
  LEFT JOIN hcp_established_ranks_v3 eu
    ON eu.hcp_id = c.collaborator_hcp_id
   AND eu.therapeutic_area_id = c.therapeutic_area_id
   AND eu.scope_type = 'region' AND eu.scope_value = 'US'
  LEFT JOIN hcp_established_ranks_v3 eg
    ON eg.hcp_id = c.collaborator_hcp_id
   AND eg.therapeutic_area_id = c.therapeutic_area_id
   AND eg.scope_type = 'global'
  LEFT JOIN hcp_rising_star_ranks_v3 rr
    ON rr.hcp_id = c.collaborator_hcp_id
   AND rr.therapeutic_area_id = c.therapeutic_area_id
  LEFT JOIN LATERAL (
    SELECT cohort FROM hcp_cohort_classification_v2 x
    WHERE x.hcp_id = c.collaborator_hcp_id LIMIT 1
  ) cc ON true
  WHERE c.hcp_id = p_hcp_id
    AND c.therapeutic_area_id = (SELECT id FROM ta)
    AND c.window_type = '10yr'
    AND c.rank <= 5
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM r) THEN NULL
ELSE jsonb_build_object(
  'hcp',                 (SELECT to_jsonb(h) FROM h),
  'rising',              (SELECT to_jsonb(r) FROM r),
  'momentum',            (SELECT to_jsonb(sm) FROM sm),
  'network',             (SELECT to_jsonb(nm) FROM nm),
  'narrative',           (SELECT to_jsonb(nar) FROM nar),
  'narrative_current',   (SELECT (nar.source_enrichment_run_id IS NOT DISTINCT FROM sm.enrichment_run_id)
                          FROM nar, sm),
  'established_us',      (SELECT to_jsonb(est_us) FROM est_us),
  'established_global',  (SELECT to_jsonb(est_gl) FROM est_gl),
  'positions',           (SELECT to_jsonb(pos) FROM pos),
  'leadership',          (SELECT to_jsonb(lead) FROM lead),
  'collaborators',       coalesce((SELECT arr FROM collabs), '[]'::jsonb),
  'collaborator_rows_10yr', (SELECT n FROM collab_total),
  'band_total',          (SELECT band_total FROM band),
  'band_same_archetype', (SELECT band_same_archetype FROM band)
) END
$function$
;

-- ── community_hcp_profile ─────────────────────────────────────────────
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
$function$
;
