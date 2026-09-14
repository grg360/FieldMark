/* ==== 31. DE-PIN THE LEDGER READ PATH: board_meta's COM arm + a TA-taking
        community_ledger ====

   WHY NOW. frontend/src/lib/cohortLedger.ts:241 carries
   boardTaSlugs: ["nsclc", "colorectal-cancer"], so a colorectal Community mount
   now reaches this read path. The comment at cohortLedger.ts:793-806 says what
   happens next and is correct: the functions behind that mount are NSCLC-pinned,
   so the tab renders LUNG rows under a colorectal heading. This block is the fix.
   The frontend list is NOT narrowed.

   ------------------------------------------------------------------------
   ONE CORRECTION TO THE BRIEF, MEASURED ON THE LIVE CATALOG 2026-09-14.

   The plan was to add ledger_meta(p_ta_id uuid, p_cohort text) alongside
   ledger_meta(p_cohort text). That overload already exists under another name.
   ledger_meta(text) holds no board logic at all -- it is already a pinned shim,
   in full:

       select public.board_meta(
         (select id from therapeutic_areas where slug = 'nsclc'), p_cohort);

   The NSCLC-pinned COM arm (`from community_board_nsclc_v1 b where b.qualifies`)
   and the RAISE that refuses a non-NSCLC COM request both live in
   board_meta(p_ta_id uuid, p_cohort text) -- which IS the signature the brief
   asked to create, already granted to all three roles and already called by the
   frontend's EST/RS branch.

   So adding ledger_meta(uuid, text) would mean a second copy of board_meta's
   three arms, with the EST and RS arms duplicated for no reason and free to
   drift. Instead the COM arm is de-pinned WHERE IT ACTUALLY LIVES, and no new
   meta overload is created. Confirmed with Garrett before writing this file.

   board_meta is CREATE OR REPLACE at an UNCHANGED SIGNATURE: no DROP, so its
   ACL survives untouched (proved by the AFTER check at the foot of this file).
   Its EST and RS arms are transcribed character for character.
   ------------------------------------------------------------------------

   WHAT THIS FILE DOES

     1. CREATE OR REPLACE board_meta(uuid, text)
          - COM arm: community_board_nsclc_v1 -> community_board_v1, bounded by
            b.ta_id = ta.id.
          - the `cohort COM is NSCLC-only` RAISE is deleted -- it existed to stop
            exactly the lung-under-colorectal answer that the line above now
            makes impossible. The unknown-TA RAISE above it STAYS.
          - EST and RS arms unchanged.

     2. CREATE community_ledger(p_ta_id uuid, <the existing six>)
          A NEW OVERLOAD. The six-argument signature is untouched and keeps its
          grants. Three changes to the transcribed body, and nothing else:
            community_board_nsclc_v1   -> community_board_v1, + b.ta_id = p_ta_id
            hcp_nsclc_evidence_tier_v1 -> hcp_evidence_tier_v1, joined on BOTH
                                          hcp_id AND ta_id
            narrative filter 'nsclc'   -> the slug resolved from p_ta_id
          Column lists, ORDER BY, the composite cursor, the tier_priority CASE,
          filtered_total / cohort_total and the return type are transcribed
          unchanged.

   NO DROP ANYWHERE IN THIS FILE.

   WHY THE TIER JOIN NEEDS ta_id. hcp_evidence_tier_v1 is keyed (ta_id, hcp_id).
   7,513 HCPs hold a tier row in more than one TA (measured 2026-09-14), so
   joining on hcp_id alone attaches a LUNG recurrence_band, anchor_stem,
   anchor_years and lung_weighted to a colorectal row for every one of them --
   silently, in the columns the evidence rail reads. Verification 4 tests this
   specifically rather than trusting the join by eye.

   ON THE UNKNOWN-TA CASE. community_ledger stays LANGUAGE sql, so it cannot
   RAISE on an id that resolves to no TA the way board_meta does; it returns an
   empty roster. That is acceptable here and only here: loadLedgerMeta calls
   board_meta for the SAME taId on the same mount, so an unresolvable id raises
   there first and the ledger never renders the empty answer. Logged, not fixed
   -- turning this into plpgsql is a bigger change than a de-pin.

   ON THE ORDER BY. The tier_priority CASE still spells the nsclc_v1 vocabulary
   (anchored 1, supported 2, heme_dominant 3, candidate 4, else 5). Unchanged
   here for the reason block 28 gives: it is a correct TOTAL order over both live
   vocabularies, and moving it into ta_evidence_tier_config would change the live
   lung board's order, which is not this file's job. */


/* ---- GRANT SNAPSHOT, BEFORE ----
   Same question as block 24, narrowed to what this file touches. Expect 3 rows,
   all three booleans true. community_ledger reports once per overload; before
   this file runs there is only one. */

SELECT 'BEFORE' AS phase,
       p.proname AS object,
       pg_get_function_identity_arguments(p.oid) AS signature,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('board_meta', 'community_ledger', 'ledger_meta')
ORDER BY 2, 3;


/* ---- 1 of 2: board_meta, COM arm de-pinned ----
   CREATE OR REPLACE at the identical signature. No DROP, so the ACL is carried
   forward rather than restored. ledger_meta(p_cohort text) keeps delegating here
   with the nsclc id and keeps answering 4,915 -- verification 1 proves it. */

CREATE OR REPLACE FUNCTION public.board_meta(p_ta_id uuid, p_cohort text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
BEGIN
  -- REQUIRED, NO DEFAULT, AND VERIFIED. p_ta_id has no default because a default is the
  -- silent-wrong this whole change exists to remove. An id that resolves to no TA RAISES
  -- rather than returning an empty board: an empty board reads as "this TA has no members",
  -- which is a claim about the data, not about the call.
  SELECT slug INTO v_slug FROM therapeutic_areas WHERE id = p_ta_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'board_meta: unknown therapeutic_area_id %', p_ta_id
      USING ERRCODE = '22023';   -- invalid_parameter_value -> PostgREST 400
  END IF;

  -- COM IS NO LONGER NSCLC-PINNED (block 31, 2026-09-14). The arm below counted
  -- community_board_nsclc_v1 -- a TA-named view with no ta column -- and the RAISE that
  -- stood here refused a non-NSCLC COM request rather than answering it with lung numbers.
  -- Refusing was right while the count could only be a lung count. It is now wrong: the
  -- COM arm counts community_board_v1 bounded by ta_id, so the answer is this TA's answer
  -- for every TA with a ta_evidence_tier_config row. What bounds that to lung and
  -- colorectal is the config join inside community_board_v1 (block 27), not a slug here.
  --
  -- The unknown-TA RAISE above is untouched and is still the only refusal on this path.

  RETURN (

  with ta as (select p_ta_id as id)
  select case upper(p_cohort)
    when 'EST' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object(
          'sci', max(r.scientific_influence_pctile),
          'net', max(r.network_influence_pctile)
        )
      )
      from hcp_established_ranks_v3 r
      join hcps_v2 h on h.id = r.hcp_id, ta
      where r.therapeutic_area_id = ta.id and r.scope_type = 'region' and r.scope_value = 'US'
    )
    when 'RS' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object(
          'scimom', max(r.scientific_momentum_percentile),
          'netmom', max(r.network_momentum_percentile),
          'scivis', max(r.scientific_visibility_percentile),
          'netvis', max(r.network_visibility_percentile)
        )
      )
      from hcp_rising_star_ranks_v3 r
      join hcps_v2 h on h.id = r.hcp_id, ta
      where r.therapeutic_area_id = ta.id
        and nullif(btrim(coalesce(h.current_country, h.country)), '') = 'US'
    )
    when 'COM' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object() -- no percentile columns; nothing suppresses
      )
      from community_board_v1 b, ta
      where b.qualifies and b.ta_id = ta.id
    )
    else null
  end
  );
END;
$function$;


/* ---- 2 of 2: community_ledger, new p_ta_id overload ----
   The six-argument signature is NOT dropped and NOT replaced. This adds a
   seventh-argument sibling whose first parameter is the TA. p_ta_id carries no
   DEFAULT, which is also what keeps the two overloads unambiguous: a call that
   names p_ta_id can only be this one, and a call that does not can only be the
   old one. The remaining six defaults are transcribed from the live definition
   so a call that supplies only p_ta_id behaves exactly as today's call that
   supplies nothing. */

CREATE OR REPLACE FUNCTION public.community_ledger(
  p_ta_id uuid,
  p_limit integer DEFAULT 1000,
  p_after_tier_priority integer DEFAULT 0,
  p_after_patient_volume numeric DEFAULT 0,
  p_after_hcp_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  p_tiers text[] DEFAULT NULL::text[],
  p_states text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ta_slug joins sel rather than sitting inline at the two narrative subqueries: one
  -- resolution, one place to read, and no slug literal anywhere in this body.
  with sel as (select coalesce(p_tiers, array['anchored','supported']) as tiers,
                      (select ta.slug from therapeutic_areas ta where ta.id = p_ta_id) as ta_slug),
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
    from community_board_v1 b
    join hcps_v2 h on h.id = b.hcp_id
    -- ON BOTH KEYS. e.ta_id = b.ta_id rather than = p_ta_id: the tier is tied to the board
    -- row it decorates, so it stays correct no matter what the WHERE below is later asked
    -- to do. 7,513 HCPs hold a tier in more than one TA; on hcp_id alone every one of them
    -- would carry another TA's evidence into this row.
    left join hcp_evidence_tier_v1 e on e.hcp_id = b.hcp_id and e.ta_id = b.ta_id
    where b.qualifies
      and b.ta_id = p_ta_id
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
                 where n.hcp_id = page.hcp_id and n.therapeutic_area_slug = (select ta_slug from sel)
                   and n.cohort = 'community'
                 limit 1) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = page.hcp_id and n.therapeutic_area_slug = (select ta_slug from sel)
                   and n.cohort = 'community'
                 limit 1) as summary_is_current
        from page
        left join hcp_open_payments_summary_v2 s on s.hcp_id = page.hcp_id
      ) t
    )
  );
$function$;

/* New overload only. The six-argument signature was never dropped and keeps the ACL it
   already had. A missing grant here would render as a Community tab with no members --
   indistinguishable from a TA with no board -- which is why the AFTER check below asks
   Postgres rather than assuming these three lines ran. */
GRANT EXECUTE ON FUNCTION public.community_ledger(uuid, integer, integer, numeric, uuid, text[], text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.community_ledger(uuid, integer, integer, numeric, uuid, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_ledger(uuid, integer, integer, numeric, uuid, text[], text[]) TO service_role;


/* ======================= VERIFICATION =======================
   Every check below is read-only and states its own PASS condition. */


/* ---- V1. The lung meta answer did not move ----
   board_meta(nsclc, 'COM') is the de-pinned arm; ledger_meta('COM') is the old
   shim reaching it through the nsclc literal; community_board_nsclc_v1 is the
   TA-named view this file stopped reading and did NOT touch. All three must say
   4,915, and ceilings must stay an empty object.

   PASS: all_three_agree = true, cohort_total = 4915. */

WITH nsclc AS (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc')
SELECT (public.board_meta((SELECT id FROM nsclc), 'COM')->>'cohort_total')::int AS board_meta_com,
       (public.ledger_meta('COM')->>'cohort_total')::int                        AS ledger_meta_shim_com,
       (SELECT count(*)::int FROM community_board_nsclc_v1 WHERE qualifies)     AS pinned_view_baseline,
       public.board_meta((SELECT id FROM nsclc), 'COM')->'ceilings'             AS ceilings,
       ( (public.board_meta((SELECT id FROM nsclc), 'COM')->>'cohort_total')::int
         = (public.ledger_meta('COM')->>'cohort_total')::int
         AND (public.board_meta((SELECT id FROM nsclc), 'COM')->>'cohort_total')::int
         = (SELECT count(*)::int FROM community_board_nsclc_v1 WHERE qualifies) ) AS all_three_agree;


/* ---- V1b. COM now answers for colorectal instead of raising, and EST/RS are untouched ----
   PASS: crc_com = 4794, and the EST/RS numbers match whatever they were before
   this file ran (their arms are transcribed unchanged, so this is a smoke test,
   not an equivalence proof). */

SELECT ta.slug,
       (public.board_meta(ta.id, 'COM')->>'cohort_total')::int AS com_total,
       (public.board_meta(ta.id, 'EST')->>'cohort_total')::int AS est_total,
       (public.board_meta(ta.id, 'RS')->>'cohort_total')::int  AS rs_total
FROM therapeutic_areas ta
WHERE ta.slug IN ('nsclc', 'colorectal-cancer')
ORDER BY ta.slug;


/* ---- V2. The lung ledger page 1 is byte-identical ----
   Old six-argument overload vs new overload called with the nsclc id, both at
   their defaults. Compared as jsonb so the comparison is semantic rather than
   whitespace.

   PASS: rows_identical, tier_counts_identical and totals_identical all true. */

WITH nsclc AS (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc'),
     old AS (SELECT public.community_ledger() AS j),
     new AS (SELECT public.community_ledger(p_ta_id => (SELECT id FROM nsclc)) AS j)
SELECT json_array_length(old.j->'rows')                                    AS old_rows,
       json_array_length(new.j->'rows')                                    AS new_rows,
       (old.j->>'cohort_total')::int                                       AS old_cohort_total,
       (new.j->>'cohort_total')::int                                       AS new_cohort_total,
       (old.j->>'filtered_total')::int                                     AS old_filtered_total,
       (new.j->>'filtered_total')::int                                     AS new_filtered_total,
       ( (old.j->>'cohort_total') IS NOT DISTINCT FROM (new.j->>'cohort_total')
         AND (old.j->>'filtered_total') IS NOT DISTINCT FROM (new.j->>'filtered_total') ) AS totals_identical,
       ((old.j->'tier_counts')::jsonb = (new.j->'tier_counts')::jsonb)      AS tier_counts_identical,
       ((old.j->'rows')::jsonb = (new.j->'rows')::jsonb)                    AS rows_identical
FROM old, new;


/* ---- V2b. ...and if it is not, name the row ----
   Row-by-row at the same ordinal. PASS: 0 rows. */

WITH nsclc AS (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc'),
     old AS (SELECT public.community_ledger() AS j),
     new AS (SELECT public.community_ledger(p_ta_id => (SELECT id FROM nsclc)) AS j),
     o AS (SELECT t.ord, t.val FROM old, json_array_elements(old.j->'rows') WITH ORDINALITY AS t(val, ord)),
     n AS (SELECT t.ord, t.val FROM new, json_array_elements(new.j->'rows') WITH ORDINALITY AS t(val, ord))
SELECT COALESCE(o.ord, n.ord)  AS position,
       o.val->>'hcp_id'        AS old_hcp_id,
       n.val->>'hcp_id'        AS new_hcp_id,
       o.val->>'tier'          AS old_tier,
       n.val->>'tier'          AS new_tier
FROM o FULL OUTER JOIN n ON n.ord = o.ord
WHERE o.val::jsonb IS DISTINCT FROM n.val::jsonb
ORDER BY 1;


/* ---- V3. Colorectal returns colorectal people ----
   p_tiers is passed explicitly because the transcribed default is
   ('anchored','supported') and the colorectal tier model (partd_presence_v1)
   emits neither -- its whole qualifying board is 'candidate'. See the note in
   the handover: this is why the frontend tier vocabulary had to become per-TA.

   PASS: filtered_total = 4794, and every spot-checked HCP is linked to
   colorectal-cancer in hcp_therapeutic_areas_v2. */

WITH crc AS (SELECT id FROM therapeutic_areas WHERE slug = 'colorectal-cancer'),
     j AS (SELECT public.community_ledger(p_ta_id => (SELECT id FROM crc),
                                          p_tiers => ARRAY['candidate','unresolved']) AS j)
SELECT (j.j->>'cohort_total')::int   AS cohort_total,
       (j.j->>'filtered_total')::int AS filtered_total,
       j.j->'tier_counts'            AS tier_counts,
       json_array_length(j.j->'rows') AS rows_returned
FROM j;

WITH crc AS (SELECT id FROM therapeutic_areas WHERE slug = 'colorectal-cancer'),
     nsclc AS (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc'),
     j AS (SELECT public.community_ledger(p_ta_id => (SELECT id FROM crc),
                                          p_tiers => ARRAY['candidate','unresolved']) AS j),
     r AS (SELECT t.ord, (t.val->>'hcp_id')::uuid AS hcp_id,
                  t.val->>'first_name' AS fn, t.val->>'last_name' AS ln,
                  t.val->>'state' AS st, t.val->>'tier' AS tier
           FROM j, json_array_elements(j.j->'rows') WITH ORDINALITY AS t(val, ord)
           WHERE t.ord <= 3)
SELECT r.ord,
       r.fn || ' ' || r.ln                       AS ledger_name,
       h.first_name || ' ' || h.last_name        AS hcps_v2_name,
       r.st, r.tier,
       EXISTS (SELECT 1 FROM hcp_therapeutic_areas_v2 x
                WHERE x.hcp_id = r.hcp_id AND x.therapeutic_area_id = (SELECT id FROM crc)) AS linked_to_crc,
       EXISTS (SELECT 1 FROM community_board_v1 b
                WHERE b.hcp_id = r.hcp_id AND b.ta_id = (SELECT id FROM nsclc) AND b.qualifies) AS also_on_lung_board
FROM r JOIN hcps_v2 h ON h.id = r.hcp_id
ORDER BY r.ord;


/* ---- V4. Zero colorectal rows carrying an nsclc evidence tier ----
   The columns at risk are the ones the LEFT JOIN supplies: recurrence_band,
   anchor_stem, anchor_stems, anchor_years, supported_evidence,
   supported_evidence_rank, lung_weighted. Each returned row's values are
   compared against hcp_evidence_tier_v1 for the COLORECTAL ta_id (must match)
   and against the same view for the NSCLC ta_id (must not be the source).

   also_hold_an_nsclc_tier is printed to show the test has teeth: if it were 0,
   V4 would pass on a board where no row could have been mis-joined anyway.

   PASS: not_from_crc = 0 AND carrying_the_nsclc_tier = 0, with
   also_hold_an_nsclc_tier well above 0. */

WITH crc AS (SELECT id FROM therapeutic_areas WHERE slug = 'colorectal-cancer'),
     nsclc AS (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc'),
     j AS (SELECT public.community_ledger(p_ta_id => (SELECT id FROM crc),
                                          p_tiers => ARRAY['candidate','unresolved']) AS j),
     r AS (SELECT (t.val->>'hcp_id')::uuid AS hcp_id,
                  t.val->>'recurrence_band'   AS band,
                  t.val->>'anchor_stem'       AS stem,
                  t.val->>'supported_evidence' AS sup,
                  (t.val->>'lung_weighted')::boolean AS lw
           FROM j, json_array_elements(j.j->'rows') WITH ORDINALITY AS t(val, ord))
SELECT count(*) AS crc_rows_checked,
       count(*) FILTER (
         WHERE r.band IS DISTINCT FROM ec.recurrence_band
            OR r.stem IS DISTINCT FROM ec.anchor_stem
            OR r.sup  IS DISTINCT FROM ec.supported_evidence
            OR r.lw   IS DISTINCT FROM ec.lung_weighted
       ) AS not_from_crc,
       count(*) FILTER (WHERE en.hcp_id IS NOT NULL) AS also_hold_an_nsclc_tier,
       count(*) FILTER (
         WHERE en.hcp_id IS NOT NULL
           AND ( r.band IS NOT DISTINCT FROM en.recurrence_band
              OR r.stem IS NOT DISTINCT FROM en.anchor_stem )
           AND ( r.band IS DISTINCT FROM ec.recurrence_band
              OR r.stem IS DISTINCT FROM ec.anchor_stem )
       ) AS carrying_the_nsclc_tier
FROM r
LEFT JOIN hcp_evidence_tier_v1 ec ON ec.hcp_id = r.hcp_id AND ec.ta_id = (SELECT id FROM crc)
LEFT JOIN hcp_evidence_tier_v1 en ON en.hcp_id = r.hcp_id AND en.ta_id = (SELECT id FROM nsclc);


/* ---- V5. GRANT CHECK, AFTER ----
   Expect 4 rows: board_meta (ACL carried through CREATE OR REPLACE),
   ledger_meta (never touched), and community_ledger TWICE -- the old
   six-argument signature and the new seven-argument one. Every boolean true on
   all four. Any false is a grant that did not survive, and renders as an empty
   Community tab rather than an error. */

SELECT 'AFTER' AS phase,
       p.proname AS object,
       pg_get_function_identity_arguments(p.oid) AS signature,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('board_meta', 'community_ledger', 'ledger_meta')
ORDER BY 2, 3;
