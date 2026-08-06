-- Narratives cohort key (2026-08-06).
--
-- THE OVERWRITE: hcp_narratives_v2 was unique on (hcp_id, therapeutic_area_slug),
-- so a dual-board member (78 on NSCLC: US established board ∩ rising board) could
-- hold only ONE narrative — and the last cohort run to write won. The 2026-08-06
-- 00:07–00:10 UTC rising batch overwrote the established prose for all 78; 18 of
-- those were fresh established_v3.0 narratives from the 17:19–17:27 run the same
-- day (the run covered US ranks 1–200; 182 survive). Narrative text is not
-- snapshotted anywhere, so the overwritten prose is regenerated, not restored.
--
-- THE FIX: cohort joins the unique key. A dual-board member holds BOTH narratives
-- — they describe different things (momentum vs standing) — and each reader RPC
-- picks by the spine it renders: the rising profile/ledger read the rising row,
-- the established brief reads the established row, the community profile/ledger
-- read the community row. No precedence rule, because there is no conflict.
--
-- cohort (not prompt_version) is the discriminator: prompt versions churn on
-- every wording revision (v1.0 → established_v2.0 → v3.0 in five weeks), while
-- cohort is exactly the axis the rendering surfaces select on.
--
-- Backfill: prompt_version prefix where it encodes cohort (rising_star_*,
-- established_*); the legacy universal-prompt v1.0 rows are labelled by current
-- board membership (established board first, then rising board, else community)
-- — the same rule the readers use, so nothing a surface shows today disappears.
--
-- Readers repointed here: hcp_rising_profile, hcp_profile_brief,
-- community_hcp_profile, community_ledger. rising_ledger changes in its own
-- migration (2026_08_06_rising_ledger_momentum_headline.sql) — its summary slot
-- moves artifacts at the same time. established_ledger reads hcp_ai_overviews,
-- not narratives, and is untouched.
--
-- Writers updated in the same change: generate_narratives_v2.py and
-- spot_check_narratives.py stamp cohort and upsert on the 3-column key;
-- dedup_merge.py carries cohort in its conflict scope.

-- ── 1. Column ─────────────────────────────────────────────────────────────────
ALTER TABLE hcp_narratives_v2 ADD COLUMN IF NOT EXISTS cohort text;

-- ── 2. Backfill ───────────────────────────────────────────────────────────────
UPDATE hcp_narratives_v2
SET cohort = 'rising_star'
WHERE cohort IS NULL AND prompt_version LIKE 'rising_star%';

UPDATE hcp_narratives_v2
SET cohort = 'established'
WHERE cohort IS NULL AND prompt_version LIKE 'established%';

-- v1.0 universal-prompt rows: label by current board membership, in the order
-- the surfaces prefer them. Slug joins therapeutic_areas.slug — the same value
-- the generator writes.
UPDATE hcp_narratives_v2 n
SET cohort = 'established'
WHERE n.cohort IS NULL
  AND EXISTS (
    SELECT 1 FROM hcp_established_ranks_v3 e
    JOIN therapeutic_areas t ON t.id = e.therapeutic_area_id
    WHERE e.hcp_id = n.hcp_id AND t.slug = n.therapeutic_area_slug
      AND e.scope_type = 'region' AND e.scope_value = 'US'
  );

UPDATE hcp_narratives_v2 n
SET cohort = 'rising_star'
WHERE n.cohort IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM hcp_rising_star_ranks_v3 r
      JOIN therapeutic_areas t ON t.id = r.therapeutic_area_id
      WHERE r.hcp_id = n.hcp_id AND t.slug = n.therapeutic_area_slug
    )
    OR EXISTS (
      SELECT 1 FROM hcp_rising_composite_v1 rc
      JOIN therapeutic_areas t ON t.id = rc.therapeutic_area_id
      WHERE rc.hcp_id = n.hcp_id AND t.slug = n.therapeutic_area_slug
    )
  );

UPDATE hcp_narratives_v2 SET cohort = 'community' WHERE cohort IS NULL;

-- ── 3. Constraints ────────────────────────────────────────────────────────────
ALTER TABLE hcp_narratives_v2 ALTER COLUMN cohort SET NOT NULL;

ALTER TABLE hcp_narratives_v2
  ADD CONSTRAINT hcp_narratives_v2_cohort_check
  CHECK (cohort IN ('rising_star', 'established', 'community'));

ALTER TABLE hcp_narratives_v2
  DROP CONSTRAINT hcp_narratives_v2_hcp_id_therapeutic_area_slug_key;

ALTER TABLE hcp_narratives_v2
  ADD CONSTRAINT hcp_narratives_v2_hcp_ta_cohort_key
  UNIQUE (hcp_id, therapeutic_area_slug, cohort);

-- ── 4. Readers pick by spine ──────────────────────────────────────────────────
-- Full live definitions (pg_get_functiondef, captured 2026-08-06) with only the
-- narrative reads changed — running this file restores the functions outright.

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
  SELECT narrative_text, generated_at, prompt_version, source_enrichment_run_id
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
$function$;

GRANT EXECUTE ON FUNCTION public.hcp_rising_profile(uuid) TO anon, authenticated, service_role;

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
    select narrative_text, prompt_version from hcp_narratives_v2
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
    'signal_summary_version', (select prompt_version from narr)
  ) into v_result;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.hcp_profile_brief(uuid) TO anon, authenticated, service_role;

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
    -- Cohort-keyed read (2026-08-06): the community profile reads the community
    -- narrative row only.
    select narrative_text, why_now, engagement_angle, signal_strength, caution_flags
    from hcp_narratives_v2 where hcp_id = p_hcp_id and therapeutic_area_slug = 'nsclc'
      and cohort = 'community' limit 1
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
$function$;

GRANT EXECUTE ON FUNCTION public.community_hcp_profile(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.community_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_tiers text[] DEFAULT NULL::text[])
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
           e.supported_evidence_rank, e.lung_weighted,
           e.anchor_stem, e.anchor_stems, e.anchor_years
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
    'tier_counts',    (select json_object_agg(tier, cnt) from (select tier, count(*) cnt from base group by tier) g),
    'tiers',          (select tiers from sel),
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank,
               top.rank as global_rank,
               top.first_name, top.last_name, top.specialty, top.city, top.state,
               s.total_payments_lifetime     as eng,
               s.distinct_companies_lifetime as companies,
               top.years, top.idx, top.hcp_id,
               top.tier, top.recurrence_band, top.supported_evidence,
               top.supported_evidence_rank, top.lung_weighted,
               top.anchor_stem, top.anchor_stems, top.anchor_years,
               -- Cohort-keyed read (2026-08-06): community rows show community prose.
               (select n.narrative_text from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = 'nsclc'
                   and n.cohort = 'community'
                 limit 1) as summary
        from top
        left join hcp_open_payments_summary_v2 s on s.hcp_id = top.hcp_id
      ) t
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.community_ledger(integer, integer, text[]) TO anon, authenticated;

-- PostgREST: pick up the new column for table-level reads/writes.
NOTIFY pgrst, 'reload schema';
