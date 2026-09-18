-- community_hcp_profile -- p_ta_id overload: board-gated narrative, TA-resolved reads.
-- Date: 2026-09-18. Branch: foundation-rebuild.
--
-- TWO DEFECTS IN ONE FUNCTION, both measured against the live DB on 2026-09-18.
--
-- 1. THE NARRATIVE WAS NOT GATED ON THE BOARD. The `narr` CTE did not reference
--    `board`. It fetched on (hcp_id, therapeutic_area_slug, cohort) alone, so an HCP
--    who is not a qualifying member of the community board still got their prose --
--    with `standing` serialising to null underneath it, because the board CTE was
--    empty. Confident synthesis with the membership fact that would contextualise it
--    missing.
--
--    3,005 nsclc community narratives hold live text. 939 belong to qualifying board
--    members. The other 2,066 are stranded: 306 have a board row that does NOT
--    qualify, 1,760 have no board row at all. Of those 2,066, 1,659 were reachable
--    through ProfileDispatch at /hcp/:id (the rest route to the established or rising
--    shells, which read their own cohort's narrative and never consult this one), and
--    all 2,066 were reachable at /hcp/:id/practice, which bypasses dispatch entirely.
--
--    MEMBERSHIP MEANS `qualifies`, NOT "has a row". That is the predicate
--    community_ledger and get_community_filtered already use, and it is what makes the
--    306 stranded rather than merely unranked.
--
-- 2. IT WAS LUNG-PINNED. `community_board_nsclc_v1`, `hcp_nsclc_evidence_tier_v1`, and
--    a literal 'nsclc' in `narr`. A colorectal community HCP resolved lung board data
--    and lung narratives. Verified before this change: the first anchored colorectal
--    board member returns `standing: null` from the one-argument function, because the
--    lung shim has no row for them.
--
-- THE ONE-ARGUMENT SIGNATURE IS NOT DROPPED AND NOT REPLACED, exactly as block 31 did
-- for community_ledger. It keeps its ACL and its callers; this adds a sibling whose
-- first parameter is the TA. Arity differs and neither overload has defaults, so
-- resolution is unambiguous, and PostgREST binds by argument NAME -- {p_hcp_id} can
-- only reach the old one, {p_ta_id, p_hcp_id} only this one.
--
-- CONSEQUENCE, STATED PLAINLY: the one-argument function still renders stranded
-- narratives. It is superseded, not fixed. Both frontend callers move to this overload
-- in the same commit; nothing else calls it.
--
-- =========================================================================
-- tierdetail: THE THIRD LUNG PIN, AND WHY IT MOVED TOO
-- =========================================================================
-- The change list for this fix named the board view and the narr slug. `tierdetail`
-- read `hcp_nsclc_evidence_tier_v1` -- lung-only, no TA -- and feeds six fields of the
-- `standing` block: recurrence_band, anchor_stem, anchor_stems, anchor_years,
-- supported_evidence, lung_weighted.
--
-- Leaving it would have shipped a NEW cross-TA leak rather than an old one. Repointing
-- only the board means a colorectal profile renders colorectal tier/volume/part_d
-- beside LUNG anchor stems and lung years, in the same chip row --
-- PracticeFirstProfile.tsx:278-280 renders exactly those three. That is another TA's
-- evidence presented as this one's, which lib/communityProfile.ts already calls worse
-- than a missing line, having fixed the same defect in the frontend read on
-- 2026-09-17. And PracticeFirstProfile has no COMMUNITY_PROFILE_TA_SLUGS gate, so it
-- is the one surface where a non-lung TA reaches this function today.
--
-- `hcp_evidence_tier_v1` is the TA-neutral union (ta_id + hcp_id). Repointing is
-- provably inert for lung: over the seven columns tierdetail selects, its nsclc arm is
-- row-for-row identical to hcp_nsclc_evidence_tier_v1 -- 13,309 rows each, EXCEPT in
-- both directions returns 0. Measured 2026-09-18, immediately before this migration.
--
-- Its non-nsclc arms select anchor_stem, anchor_stems, anchor_years,
-- supported_evidence and lung_weighted as NULL by construction. A colorectal profile
-- therefore renders those five as absent rather than as lung -- correct, and the
-- reason a caller must describe a tier from its MODEL, never from these fields. See
-- COM_EVIDENCE_MODELS in lib/cohortLedger.ts.
--
-- =========================================================================
-- WHAT DELIBERATELY DID NOT CHANGE
-- =========================================================================
-- * The `board` CTE still selects a row whether or not it qualifies, so `standing`
--   keeps rendering `qualifies: false` for a non-qualifying member. Only the NARRATIVE
--   is gated. Suppressing standing too would delete a true fact to fix a false one.
-- * The JSON key 'nsclc' and the nsclc_* column names on hcp_community_scores_v2 are
--   left alone. They are a naming problem on a TA-keyed table, not a scoping one --
--   `sigs` and `crank` were already TA-parameterised through v_ta, which is now
--   p_ta_id. Renaming the key would break the frontend type in the same commit as a
--   defect fix, for no correctness gain.
-- * Everything else is transcribed verbatim from pg_get_functiondef read live.
--
-- STRANDED ROWS ARE NOT DELETED HERE. Once narr is board-gated they are unreachable,
-- and deleting them is a separate decision with its own restore file.
-- scripts/narrative/sweep_stranded_narratives.py:66 excludes community deliberately,
-- on the premise that nothing was writing community rows -- but these 2,066 PREDATE
-- that block (oldest 2026-05-29, newest 2026-08-07, all before the 2026-08-11 Phase 4
-- context-assembly stop) rather than being prevented by it, so the sweep has never
-- seen this set. The sweep is unchanged; see docs/canonical/COMMUNITY_STRANDED_NARRATIVES.md.

CREATE OR REPLACE FUNCTION public.community_hcp_profile(p_ta_id uuid, p_hcp_id uuid)
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
  -- Was: select id into v_ta from therapeutic_areas where slug = 'nsclc'.
  -- The TA now arrives as an argument; the slug is resolved FROM it, so the slug and
  -- the id can never name different areas. An unknown p_ta_id leaves v_slug null, narr
  -- matches nothing, and the profile renders its honest absence rather than lung.
  v_ta := p_ta_id;
  select slug into v_slug from therapeutic_areas where id = p_ta_id;

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
    -- community_board_v1 + ta_id, not the community_board_nsclc_v1 shim.
    -- qualifies is SELECTED, not filtered on: standing must keep reporting a
    -- non-qualifying membership as the false it is. The narrative gate below is what
    -- reads it.
    select qualifies, patient_volume, part_d_present, evidence_tier
    from community_board_v1 where hcp_id = p_hcp_id and ta_id = p_ta_id limit 1
  ),
  tierdetail as (
    -- hcp_evidence_tier_v1 + ta_id. ON BOTH KEYS: 7,513 HCPs hold a tier in more than
    -- one TA, and on hcp_id alone every one of them carries another TA's evidence into
    -- this block.
    select tier, recurrence_band, anchor_stem, anchor_stems, anchor_years,
           supported_evidence, lung_weighted
    from hcp_evidence_tier_v1 where hcp_id = p_hcp_id and ta_id = p_ta_id limit 1
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
    -- GATED ON THE BOARD. The prose asserts a standing; membership is what makes that
    -- assertion true, so the two travel together or neither renders. No qualifying
    -- board row for THIS TA -> no narrative, and the surface falls to the absence it
    -- already draws.
    --
    -- v_slug, not 'nsclc'. The slug is the narrative table's TA key and is resolved
    -- from p_ta_id above.
    select narrative_text, why_now, engagement_angle, signal_strength, caution_flags,
           narrative_is_current('community', prompt_version) as is_current
    from hcp_narratives_v2 where hcp_id = p_hcp_id and therapeutic_area_slug = v_slug
      and cohort = 'community'
      and exists (select 1 from board where board.qualifies)
      limit 1
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
$function$;

-- New overload only. The one-argument signature was never dropped and keeps the ACL it
-- already had. A missing grant here renders as a community profile that will not load
-- for anon -- indistinguishable from a missing HCP -- which is why the AFTER check
-- asks Postgres rather than assuming these three lines ran.
GRANT EXECUTE ON FUNCTION public.community_hcp_profile(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.community_hcp_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_hcp_profile(uuid, uuid) TO service_role;
