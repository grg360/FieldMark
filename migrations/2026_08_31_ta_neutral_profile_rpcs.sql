-- TA-neutral profile RPCs: hcp_rising_profile_ta, hcp_profile_brief_ta, hcp_profile_spine_ta.
-- Date: 2026-08-31. Branch: foundation-rebuild. Phase 1 (profiles) of
-- docs/canonical/TA_NEUTRAL_DB_LAYER.md.
-- Revert: sql/revert/2026_08_31_ta_neutral_profile_rpcs_REVERT.sql
--
-- WHY. /hcp/:id renders one of three shells. Dispatch picks the shell, but each shell's data
-- RPC resolves its own TA -- and all three resolved 'nsclc'. The visible symptom was a CRC
-- rising star landing on the rising shell (correctly: isOnRisingBoard has no TA predicate and
-- the row exists) and then reading "Not on the rising board - this route should not have
-- dispatched here", because hcp_rising_profile could not see a colorectal row. The dispatch
-- was right and the shell blamed it.
--
-- SAME PATTERN AS migrations/2026_08_30_ta_neutral_board_rpcs.sql: new names taking p_ta_id
-- uuid (required, no default), old names kept as NSCLC-pinned wrappers so nothing breaks at
-- deploy. Suffix `_ta` rather than a `board_`-style rename because these are already
-- well-named for what they return; only their TA-resolution changes.
--
-- BODIES COPIED FROM THE LIVE CATALOG (pg_get_functiondef, 2026-08-31), never from a
-- migration file -- see the 08-30 migration's footer for why that distinction earns its keep.
--
-- THE TA-TEXT FORMS, measured again on 2026-08-31 rather than assumed from the board pass:
--   * hcp_established_ranks_v3 / hcp_rising_star_ranks_v3 -> therapeutic_area_id uuid, direct.
--   * hcp_narratives_v2.therapeutic_area_slug -> = the TA's slug, EXACT (8,013/8,013 rows
--     match a registered slug exactly).
--   * hcp_ai_overviews.therapeutic_area -> lower(...) = slug, CASE-INSENSITIVE. The column
--     holds 'NSCLC' for lung and plain slugs for the others; 700/700 rows match a registered
--     slug case-insensitively and 0 match any name form. Identical finding to the board pass.
--
-- OUT OF SCOPE: community_hcp_profile and community_practice_profile. Both reach
-- hcp_nsclc_evidence_tier_v1, whose ladder needs per-TA clinical curation (Phase 3). The
-- frontend gives a non-NSCLC community HCP an explicit named absence instead of a lung
-- profile -- see CommunityHcpProfile.tsx.
--
-- READ-ONLY: all six functions are STABLE, SECURITY DEFINER, search_path pinned. No writes.

BEGIN;

-- ==========================================================================================
-- BLOCK 1 -- hcp_profile_spine_ta -- decides WHICH SHELL renders. 14 lines, one literal.
-- ==========================================================================================
CREATE OR REPLACE FUNCTION public.hcp_profile_spine_ta(
  p_hcp_id uuid,
  p_ta_id uuid
)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when exists (
    select 1
    from hcp_established_ranks_v3 e
    where e.therapeutic_area_id = p_ta_id
      and e.hcp_id = p_hcp_id
      and e.scope_type = 'global'
  ) then 'academic' else 'community' end;
$function$;

-- ==========================================================================================
-- BLOCK 2 -- hcp_rising_profile_ta -- the shell that was failing for CRC.
-- ==========================================================================================
CREATE OR REPLACE FUNCTION public.hcp_rising_profile_ta(
  p_hcp_id uuid,
  p_ta_id uuid
)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH ta AS (
  SELECT p_ta_id AS id
),
r AS (
  SELECT * FROM hcp_rising_star_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
),
h AS (
  SELECT id, first_name, last_name, preferred_display_name,
         institution_normalized, country, nppes_practice_state,
         nppes_practice_city, career_first_pub_year, npi_number,
         -- Effective country for the US-only section gates (2026-08-19). `country`
         -- above is the HISTORICAL value; this is what the ledger and rising_board
         -- place people by, and it is what Federal Funding / Medicare / Open Payments
         -- must gate on so a non-US record stops rendering a US registry's absence.
         nullif(btrim(coalesce(current_country, country)), '') AS effective_country
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
  WHERE hcp_id = p_hcp_id AND therapeutic_area_slug = (SELECT slug FROM therapeutic_areas WHERE id = p_ta_id)
    AND cohort = 'rising_star'
  LIMIT 1
),
est_us AS (
  -- US ROW IF THERE IS ONE, OTHERWISE GLOBAL (2026-08-19), with the scope named.
  -- Pinned to region/US this returned nothing for a non-US dual-board member, so the
  -- ESTABLISHED STANDING card fell to its empty branch and printed "NOT ON THE
  -- ESTABLISHED BOARD" above body text that said, correctly, that the person was
  -- ranked on the global board. The heading contradicted its own paragraph.
  --
  -- scope_label follows the ledger's convention. THE CARD MUST RENDER IT: its numerals
  -- and prose hardcode "US" in four places, and with this fallback in place an
  -- unmodified card would print "#3 US" for a German -- a false claim in place of a
  -- blank, which is worse. The name est_us is kept so the payload key does not move.
  SELECT rank, cohort_score,
         CASE WHEN scope_type = 'global' THEN 'GLOBAL' ELSE scope_value END AS scope_label
  FROM hcp_established_ranks_v3
  WHERE hcp_id = p_hcp_id AND therapeutic_area_id = (SELECT id FROM ta)
    AND (scope_type = 'global' OR (scope_type = 'region' AND scope_value = 'US'))
  ORDER BY CASE WHEN scope_type = 'region' THEN 0 ELSE 1 END
  LIMIT 1
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
$function$;

-- ==========================================================================================
-- BLOCK 3 -- hcp_profile_brief_ta -- the academic shell.
-- ==========================================================================================
CREATE OR REPLACE FUNCTION public.hcp_profile_brief_ta(
  p_hcp_id uuid,
  p_ta_id uuid
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ta uuid;
  v_slug text;
  v_result json;
begin
  -- REPLACED a slug lookup. v_slug is carried alongside because two of the reads below
  -- key on a TEXT column rather than the uuid -- see the header.
  v_ta := p_ta_id;
  select slug into v_slug from therapeutic_areas where id = p_ta_id;
  if v_slug is null then
    raise exception 'hcp_profile_brief: unknown therapeutic_area_id %', p_ta_id
      using errcode = '22023';
  end if;

  with h as (
    select id, first_name, last_name,
           coalesce(institution_canonical, institution_normalized) as institution,
           nppes_practice_city as city,
           coalesce(nppes_practice_state, derived_state) as state,
           npi_number, npi_specialty,
           -- Effective country, for the US-only section gates (2026-08-19). Same
           -- expression the ledger and rising_board place people by. The profile had
           -- no country at all, so Medicare / Open Payments / Federal Funding -- all
           -- three US registries -- rendered their absence states for non-US records.
           nullif(btrim(coalesce(current_country, country)), '') as effective_country
    from hcps_v2 where id = p_hcp_id
  ),
  est as (
    -- US ROW IF THERE IS ONE, OTHERWISE GLOBAL (2026-08-19). This was pinned to
    -- region/US, so every HCP without a US row rendered INDEX, SCI, NET and PHARMA
    -- as em-dashes -- Martin Reck, global #3 with a cohort_score of 99.968, showed
    -- four blanks. The global rank was already being read two CTEs down; only the
    -- scores were US-only.
    --
    -- GLOBAL IS THE FALLBACK, not the person's own region: every Established HCP has
    -- exactly one global row by construction, so this can never blank again, and the
    -- profile has no territory selector to honour the way the ledger does.
    --
    -- scope_label follows the LEDGER'S PRECEDENT rather than inventing a second
    -- convention -- it names the POOL the rank was computed against, so the surface
    -- can say "#3 GLOBAL" instead of implying US. The caller must render it; a rank
    -- shown without its pool is the defect this fix exists to remove.
    select r.rank, r.scientific_influence_pctile sci, r.network_influence_pctile net,
           r.pharma_engagement_pctile ph, r.cohort_score idx,
           case when r.scope_type = 'global' then 'GLOBAL' else r.scope_value end as scope_label,
           r.scope_type
    from hcp_established_ranks_v3 r
    where r.hcp_id = p_hcp_id and r.therapeutic_area_id = v_ta
      and (r.scope_type = 'global' or (r.scope_type = 'region' and r.scope_value = 'US'))
    order by case when r.scope_type = 'region' then 0 else 1 end
    limit 1
  ),
  gl as (
    select r.rank gr from hcp_established_ranks_v3 r
    where r.hcp_id = p_hcp_id and r.therapeutic_area_id = v_ta and r.scope_type = 'global'
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
      and lower(therapeutic_area) = v_slug and body ~ '^\s*\{' limit 1
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
    where hcp_id = p_hcp_id and therapeutic_area_slug = v_slug
      and cohort = 'established'
    order by generated_at desc limit 1
  )
  select json_build_object(
    'hcp', (select json_build_object(
        'id', p_hcp_id, 'first_name', first_name, 'last_name', last_name,
        'name', trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')),
        'institution', institution, 'city', city, 'state', state,
        'npi', npi_number, 'specialty', npi_specialty,
        'country', effective_country) from h),
    'scores', (select json_build_object(
        'index', est.idx, 'rank', est.rank, 'global_rank', (select gr from gl),
        'sci', est.sci, 'net', est.net, 'pharma', est.ph,
        'scope_label', est.scope_label,
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

-- ==========================================================================================
-- BLOCK 4 -- PINNED WRAPPERS -- same names, same signatures, same ACL.
-- ==========================================================================================
-- PINNED WRAPPERS, TEMPORARY. The frontend calls these three names today; the DB change and
-- the frontend change cannot land in the same instant on an auto-deploying branch. The
-- 'nsclc' literal in each is deliberate -- it is what makes these pins rather than second
-- implementations. Deleted at cutover.
CREATE OR REPLACE FUNCTION public.hcp_profile_spine(p_hcp_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.hcp_profile_spine_ta(
    p_hcp_id, (select id from therapeutic_areas where slug = 'nsclc'));
$function$;

CREATE OR REPLACE FUNCTION public.hcp_rising_profile(p_hcp_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.hcp_rising_profile_ta(
    p_hcp_id, (select id from therapeutic_areas where slug = 'nsclc'));
$function$;

CREATE OR REPLACE FUNCTION public.hcp_profile_brief(p_hcp_id uuid)
 RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.hcp_profile_brief_ta(
    p_hcp_id, (select id from therapeutic_areas where slug = 'nsclc'));
$function$;

-- ==========================================================================================
-- BLOCK 5 -- GRANTS + COMMIT
-- ==========================================================================================
-- GRANTS. The three wrapped functions carry EXECUTE for anon, authenticated and service_role;
-- the new ones must match or the wrapper works while the direct call 404s through PostgREST.
GRANT EXECUTE ON FUNCTION public.hcp_profile_spine_ta(uuid, uuid)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hcp_rising_profile_ta(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hcp_profile_brief_ta(uuid, uuid)  TO anon, authenticated, service_role;

COMMIT;
