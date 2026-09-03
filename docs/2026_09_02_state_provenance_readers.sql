/* ============================================================================
   STATE PROVENANCE: readers, the merge invariant, and the artifact cleanup
   2026-09-02

   Blocks 1 to 6 of docs/2026_09_02_state_provenance_separation.sql are applied:
   institution_state (14,676), institution_state_source (11,557 ROR-confirmed /
   3,119 legacy) and institution_city (2,436) are populated, and nothing reads
   them. nppes_practice_state still holds its 14,678 unsupportable values.

   THIS FILE PREPARES THE READERS. It changes no data except S1. It must run,
   and the frontend must ship, BEFORE block 7 clears the old column, or 999
   NSCLC and 724 colorectal board members lose their location chip with nothing
   in its place.

   ORDER: S0 (grant snapshot), S1, S2, S2b, S2c, S3, S4, S5, then S0 again and
   count 18. Deploy the frontend and confirm the ledger AND the People feed load.
   S6 to S8 add the constraints and may run any time after S1. Block 7 of the
   earlier file is LAST, and only once both surfaces are confirmed loading.
   ============================================================================ */


/* ==== S0. GRANT SNAPSHOT, RUN BEFORE S2 AND AGAIN AFTER S4 ====

   COUNT THE ROWS. This must return 18: seventeen functions and one view.

   DROPPED AND RECREATED BY THIS FILE, so every one of these loses its ACL and has it
   re-granted. These are what the after-run is checking:

     board_established                       1   S2
     board_rising                            1   S2
     get_community_filtered                  2   S2b  (6-arg impl, 7-arg wrapper)
     get_established_filtered                2   S2b
     get_rising_composite_filtered           2   S2b
     get_rising_star_filtered                1   S2b
     institution_ta_roster_v1                1   S4   (a view, so relacl not proacl)
                                            ==
                                            10 objects dropped

   NOT DROPPED, LISTED AS CONTROLS. If any of these changes between the two runs, something
   ran that is not in this file:

     merge_hcp_pair                          1   S3 replaces it in place, no drop
     get_community_filtered_count            2   scalar return, untouched by S2b
     get_established_filtered_count          2   scalar return, untouched
     get_rising_composite_filtered_count     2   scalar return, untouched
     get_rising_star_filtered_count          1   scalar return, untouched
                                            ==
                                             8 controls

   WHY THE _count FUNCTIONS ARE HERE AT ALL. They cannot take the new columns, because a
   column cannot be added to an integer, and their WHERE clause is unchanged. They are listed
   because they are the other half of every overload pair S2b touches: if a drop ever caught
   the wrong signature, this is where it shows.

   GRANTS DO NOT SURVIVE A DROP. PostgREST reaches all of these as anon/authenticated, so a
   missing grant is a permission error that renders as an EMPTY SURFACE rather than as a
   failure. A lost grant on get_established_filtered is an empty People feed that reads as a
   data problem.

   Every function row must show anon=X, authenticated=X, service_role=X; the view row must
   show r for the same three. The BEFORE run is the record of what to restore; the AFTER run
   is the proof nothing was lost. */

SELECT 'function' AS kind, p.proname AS object,
       pg_get_function_identity_arguments(p.oid) AS signature,
       coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('board_established', 'board_rising', 'merge_hcp_pair',
                    'get_community_filtered', 'get_community_filtered_count',
                    'get_established_filtered', 'get_established_filtered_count',
                    'get_rising_composite_filtered', 'get_rising_composite_filtered_count',
                    'get_rising_star_filtered', 'get_rising_star_filtered_count')
UNION ALL
SELECT 'view', c.relname, '',
       coalesce(array_to_string(c.relacl, ' | '), '(default: PUBLIC)')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'institution_ta_roster_v1'
ORDER BY 1, 2, 3;


/* ==== S1. NULL THE ARTIFACTS IN institution_state ====
   54 migrated values are not US state codes. Two kinds, both wrong here:

     PROVINCES, correct but not US   ON 9, BC 3, QLD 2, AP 1
     PARSE ARTIFACTS, not places     SAR 8, ABC 8, BG 6, CH 4, KP 4, CV 4,
                                     TS 2, ERN 2, KSA 1

   ERN is the tail of "CHU de Caen". ABC is a slice of an institution name.

   They are inert today because nothing reads institution_state. Once S2 ships
   they become a new false value in a new column, which is the defect this whole
   change exists to remove.

   ONE OF THE 54 IS 'institution_ror_confirmed' (a BC row): the ROR registry
   genuinely says British Columbia. Nulling it discards a true fact rather than
   a wrong one, but institution_state feeds a US state filter, and a Canadian
   province in it is a category error however it got there. The rollback table
   holds every value.

   Expect 54 rows updated. */

UPDATE public.hcps_v2
SET institution_state = NULL, institution_state_source = NULL
WHERE institution_state IS NOT NULL
  AND institution_state NOT IN ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
    'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
    'WI','WY','DC','PR','VI','GU','AS','MP');


/* ==== S1b. institution_city: REVIEWED, DELIBERATELY NOT TOUCHED ====
   No statement here on purpose. The review you asked for, before anything is
   nulled:

   2,436 values. Only 96 have a ROR city to check against, and of those just 15
   agree with the registry; 81 disagree. 740 are longer than 30 characters, so
   they cannot be city names. 1,286 contain an organisation word (University,
   Hospital, Institute, Centre, Ltd, GmbH, Azienda, Krankenhaus, Inserm). The
   union of those two tests is 1,326 that are CERTAINLY not cities, leaving
   1,110 that plausibly are.

   SO IT IS A MIXTURE, NOT A UNIFORM ERROR, which is why nothing is nulled here.
   Real cities in the set: San Diego 59, Beijing 26, New York 23, Durham 21,
   Madrid 17, Buffalo 4. Certainly not cities: "Muhimbili National Hospital-
   Mloganzila" 33, "Ltd" 23, "Memorial Sloan Kettering Cancer Center" 21,
   "Fudan University" 17, "Centrum fuer Haematologie und Onkologie am
   Bethanien-Krankenhaus", "Garscube Estate", "Inserm CIC 1413".

   The substring test that looked decisive is not: 2,396 of 2,436 appear inside
   their own institution_normalized, but so does "San Diego" inside "University
   of California, San Diego". It separates nothing.

   DECIDED 2026-09-02: STORE IT, NEVER DISPLAY IT. Nothing is nulled, and no
   institution city is rendered anywhere in this release. Guessing in either
   direction is the error: nulling discards 1,110 real cities, keeping and
   showing asserts 1,326 institution names as places people work.

   Block 7 nulls nppes_practice_city for these 2,436 rows, so the community
   ledger's city chip goes blank for them. THAT IS THE CORRECT OUTCOME and it
   must not be back-filled from institution_city. The guard is written at the
   render site, cohortLedger.ts, next to the line that would be tempted.
   Verified: institution_city is referenced nowhere in the frontend.

   City returns when it is DERIVED from the ROR registry rather than salvaged.
   attach_institution_city (targeted_nppes_enrichment.py:228-263) already joins
   institution_geo_lookup for exactly this, and institution_geo_lookup carries a
   city column for 7,468 institutions. */


/* ==== S2. board_established AND board_rising: THE OPT-IN TERRITORY FLAG ====

   DROP THEN CREATE, NOT CREATE OR REPLACE, AND THIS IS THE WHOLE RISK OF S2.
   CREATE OR REPLACE cannot add a parameter. Adding p_include_institution_placed
   with a DEFAULT while the five-argument function still exists makes every
   existing five-argument call AMBIGUOUS: Postgres raises 42725 rather than
   choosing, so the ledger breaks for every user until the old one is gone. The
   old signature is therefore dropped immediately before each create, in the
   same session.

   GRANTS DO NOT SURVIVE A DROP. These are SECURITY DEFINER functions reached by
   PostgREST as anon/authenticated; the live ACL is anon=X, authenticated=X,
   service_role=X, and it is re-granted below. Without that the ledger returns a
   permission error, which on screen looks exactly like an empty board.

   WHAT CHANGES BEYOND THE PARAMETER:
     * the FILTER widens to institution_state only when the flag is true
     * `state` now falls back to institution_state ALWAYS, flag or not, because
       the chip must be able to say where someone is on the national board too
     * a new `state_basis` field ('nppes' | 'institution' | null) rides beside
       it. THE QUALIFIER TRAVELS AS DATA, NOT AS A STRING: "TX . INSTITUTION" in
       the state field would break every consumer that compares state to a code
       and could not be parsed back into its parts. The frontend composes the
       label from the pair. */

DROP FUNCTION IF EXISTS public.board_established(uuid, integer, integer, text[], text[]);

CREATE OR REPLACE FUNCTION public.board_established(p_ta_id uuid, p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[], p_include_institution_placed boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
BEGIN
/* REQUIRED, NO DEFAULT, AND VERIFIED. p_ta_id has no default because a default is the */
/* silent-wrong this whole change exists to remove. An id that resolves to no TA RAISES */
/* rather than returning an empty board: an empty board reads as "this TA has no members", */
/* which is a claim about the data, not about the call. */
  SELECT slug INTO v_slug FROM therapeutic_areas WHERE id = p_ta_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'board_established: unknown therapeutic_area_id %', p_ta_id
      USING ERRCODE = '22023'; /* invalid_parameter_value -> PostgREST 400 */
  END IF;

  RETURN (

  with ta as (select p_ta_id as id),
/* THE AGGREGATE REGIONS, from data (2026-08-18). This replaced a literal test on */
/* 'EUROPE'. Any region flagged regions.aggregate_scope is a POOL rather than a */
/* place: its scope_value is a region key, not an ISO country code, so it must not */
/* reach the rail's location chip. Adding LATAM later is an UPDATE on regions, not */
/* an edit here — which is the whole point of the generalisation. */
  agg as (select region_key from regions where aggregate_scope),
/* GLOBAL SELECTION SENTINEL (2026-08-17). p_countries carrying '__global__' */
/* selects the global scope instead of a set of country scopes. A sentinel */
/* rather than a new parameter because adding one changes the signature, which */
/* means DROP + CREATE on a live SECURITY DEFINER RPC and a PostgREST overload */
/* window; '__global__' is not a country code and already means exactly this in */
/* hcp_established_board_snapshots.scope_value. */
  sel as (select ('__global__' = any(p_countries)) as is_global),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx,
/* AGGREGATE SCOPES ARE POOLS, NOT PLACES (2026-08-18). Two scope rows */
/* name a pool rather than a country: global (scope_value NULL) and the */
/* EUROPE bucket. Both must still show the person's OWN country here, */
/* because the rail uses scored_country as the row's LOCATION chip — */
/* an all-Europe board that reads "EUROPE - Charite" for all 3,849 rows */
/* has thrown away the only geography it had. The rank chip gets the */
/* pool name from scope_label below; one field cannot be both, which is */
/* the same split the global scope needed on 2026-08-17. */
           case when r.scope_value in (select region_key from agg) then hs.country
                else coalesce(r.scope_value, hs.country) end as scored_country,
/* The raw bucket, carried so scope_label can name the pool after */
/* scored_country has been resolved back to the person's country. */
           r.scope_value as scope_bucket
    from hcp_established_ranks_v3 r
    join hcps_v2 hs on hs.id = r.hcp_id
    cross join ta
    cross join sel
    where r.therapeutic_area_id = ta.id
      and case when sel.is_global
               then r.scope_type = 'global'
               else r.scope_type = 'region' and r.scope_value = any(p_countries)
          end
      and (cardinality(p_states) = 0 or
           case when p_include_institution_placed
                then coalesce(hs.nppes_practice_state, hs.derived_state, hs.institution_state)
                else coalesce(hs.nppes_practice_state, hs.derived_state)
           end = any(p_states))
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
    'include_institution_placed', p_include_institution_placed,
    'countries', p_countries,
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank,
/* On a global selection the scope rank IS the global rank, so the */
/* companion column would duplicate it. NULL suppresses the rail's */
/* "#n GLOBAL" line (which the frontend guard now honours) rather */
/* than printing the same number twice. */
               case when (select is_global from sel) then null else gl.gr end as global_rank,
/* The pool this rank was computed against, as a LABEL. Distinct from */
/* scored_country, which the rail also uses as the row's location chip: */
/* on a global board every row needs its own country there, but the */
/* rank chip must say GLOBAL. One field cannot be both. */
/* EUROPE joins GLOBAL as a pool name: on those selections the rank */
/* was computed against the aggregate, so the chip must say so rather */
/* than repeat the row's country (which is now what scored_country */
/* holds). A per-country selection is unchanged — scope_bucket and */
/* scored_country are the same code there. */
               case when (select is_global from sel) then 'GLOBAL'
                    else coalesce(top.scope_bucket, top.scored_country) end as scope_label,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state, h.institution_state) as state,
               case when coalesce(h.nppes_practice_state, h.derived_state) is not null then 'nppes'
                    when h.institution_state is not null then 'institution'
                    else null end as state_basis,
/* scored_country is the authoritative chip for Established: the pool this */
/* rank was actually computed against. current_country is carried alongside */
/* for the hedge, NOT for placement. */
               top.scored_country,
               h.country, h.current_country,
               h.affiliation_confidence, h.affiliation_as_of,
/* sci/net STAY on the payload after the 2026-08-18 column swap took them */
/* off the ledger's face. They are no longer rendered as columns, but */
/* estEngine() in CohortLedger.tsx reads both to decide network-led vs */
/* scientific-led for the drawer's spine text and its neighbour lines. */
/* Dropping them from here would silently blank that narrative, because */
/* mapRow builds row.scores from cfg.cols alone. */
               top.sci, top.net, top.ph, top.idx, top.hcp_id,
/* THE DISPLAYED QUANTITIES (2026-08-18). Both are evidence BESIDE the */
/* ranking, not the ranking: the order is still cohort_score, which is */
/* 0.60*sci + 0.40*net. They replace the SCI/NET percentile columns, */
/* which read 99.9 for the whole head — on the Europe board the top five */
/* all printed 99.9 against true values of 99.976 down to 99.892. */
/*  */
/* sencit  senior-authored citations, all-time in this TA. Chosen over */
/* senior_pub_count, which looks like the more direct quantity */
/* and is not: small integers repeat, so it carries 47 distinct */
/* values across the top 500 (modal value on 10% of rows) where */
/* citations carry 351. It also survives deeper — 0% zero */
/* through rank 500 against senior_pub_count's 1% by 500 and */
/* 13% by 1,500. */
/* collab  distinct co-authors, 10-year window. 99.9% populated on the */
/* board, never zero where present, 345 distinct in the top 500. */
/*  */
/* Both are counts on a unique (hcp_id, therapeutic_area_id) grain */
/* (verified: 19,449 rows / 19,449 keys and 113,829 / 113,829), so the */
/* LEFT JOINs below cannot fan a row out. */
               pl.senior_pub_total_citations as sencit,
               nc.collaborator_count as collab,
               coalesce(
                 (
                   select case when o.body ~ '^\s*\{' then (o.body::jsonb ->> 'headline') else null end
                   from hcp_ai_overviews o
                   where o.hcp_id = top.hcp_id
                     and o.synthesis_type = 'scientific_positions'
                     and lower(o.therapeutic_area) = v_slug
                   limit 1
                 ),
/* fallback: the established narrative's single-sentence */
/* strongest-signal line — for HCPs whose record holds no */
/* qualifying paper for positions synthesis */
                 (
                   select coalesce(n.why_now, n.narrative_text)
                   from hcp_narratives_v2 n
                   where n.hcp_id = top.hcp_id
                     and n.therapeutic_area_slug = v_slug
                     and n.cohort = 'established'
                   limit 1
                 )
               ) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = v_slug
                   and n.cohort = 'established'
                 limit 1) as summary_is_current
        from top
        join hcps_v2 h on h.id = top.hcp_id
/* LEFT, not inner: a board row with no publication-leadership or centrality */
/* row must still render. The columns dash; the row does not vanish. */
        left join hcp_publication_leadership_v2 pl
               on pl.hcp_id = top.hcp_id and pl.therapeutic_area_id = (select id from ta)
        left join hcp_network_centrality_v2 nc
               on nc.hcp_id = top.hcp_id and nc.therapeutic_area_id = (select id from ta)
              and nc.window_type = '10yr'
        left join gl on gl.hcp_id = top.hcp_id
      ) t
    )
  )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.board_established(uuid, integer, integer, text[], text[], boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.board_established(uuid, integer, integer, text[], text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_established(uuid, integer, integer, text[], text[], boolean) TO service_role;


DROP FUNCTION IF EXISTS public.board_rising(uuid, integer, integer, text[], text[]);

CREATE OR REPLACE FUNCTION public.board_rising(p_ta_id uuid, p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[], p_include_institution_placed boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
BEGIN
/* REQUIRED, NO DEFAULT, AND VERIFIED. p_ta_id has no default because a default is the */
/* silent-wrong this whole change exists to remove. An id that resolves to no TA RAISES */
/* rather than returning an empty board: an empty board reads as "this TA has no members", */
/* which is a claim about the data, not about the call. */
  SELECT slug INTO v_slug FROM therapeutic_areas WHERE id = p_ta_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'board_rising: unknown therapeutic_area_id %', p_ta_id
      USING ERRCODE = '22023'; /* invalid_parameter_value -> PostgREST 400 */
  END IF;

  RETURN (

  with ta as (select p_ta_id as id),
/* Same '__global__' sentinel as established_ledger. Rising's rank is already a */
/* read-time row_number() over the stored global rank, so a global selection is */
/* simply the whole board with no country predicate — no new scoring needed. */
/* EUROPE AGGREGATE SENTINEL (2026-08-18), the same shape as '__global__' above */
/* and for the same reason: a sentinel inside p_countries rather than a new */
/* parameter, which would mean DROP + CREATE on a live SECURITY DEFINER RPC. */
/* 'EUROPE' is not an ISO country code, so it cannot collide with a real country. */
/*  */
/* WHY RISING NEEDS AN EXPANSION WHERE ESTABLISHED NEEDS A BUCKET. Rising's rank */
/* is a read-time row_number() over whatever pool is selected, so all-Europe is */
/* correct the moment the predicate admits the 33 countries — nothing is scored */
/* or stored. Established ranks are normalised WITHIN a stored scope, so its */
/* all-Europe board had to be scored as its own bucket by */
/* recompute_established_ranks_v3.py. Same selector key, two different mechanisms. */
/* ANY AGGREGATE REGION, from data (2026-08-18). This was a literal test for the */
/* 'EUROPE' sentinel; APAC would have matched no country and returned an EMPTY */
/* LEDGER, silently — the exact failure the Europe revert artifact warned about. */
/* agg_key is the selected aggregate's region key, or NULL when the selection is a */
/* plain country list. sort_order breaks a tie if a caller ever sends two aggregates; */
/* the menu cannot produce that, and picking the first is better than a cross join. */
  sel as (select ('__global__' = any(p_countries)) as is_global,
                 (select g.region_key from regions g
                   where g.aggregate_scope and g.region_key = any(p_countries)
                   order by g.sort_order, g.region_key limit 1) as agg_key),
  europe as (select country_code from region_countries where region_key = 'EUROPE'),
/* The whole board with its effective country, once. Both auxiliary ranks are computed */
/* over THIS set (the full board), never over the current selection — so they do not */
/* change as the user slices. */
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
    cross join sel
/* Three ways in, checked in widening order: the whole board, the geographic */
/* Europe set expanded from region_countries, or an explicit country list. The */
/* sentinel is expanded HERE rather than by the caller so the country list has */
/* exactly one home (region_countries) shared with rising_board and the scorer. */
    where (sel.is_global
           or (sel.agg_key is not null
               and rk.eff in (select rc.country_code from region_countries rc
                               where rc.region_key = sel.agg_key))
           or rk.eff = any(p_countries))
  ),
  us as (
    select b.*
    from base b
    join hcps_v2 hs on hs.id = b.hcp_id
    where (cardinality(p_states) = 0 or
           case when p_include_institution_placed
                then coalesce(hs.nppes_practice_state, hs.derived_state, hs.institution_state)
                else coalesce(hs.nppes_practice_state, hs.derived_state)
           end = any(p_states))
  ),
  top as (select * from us where rank > p_after_rank order by rank limit p_limit)
  select json_build_object(
    'cohort_total', (select count(*) from us),
    'states', p_states,
    'include_institution_placed', p_include_institution_placed,
    'countries', p_countries,
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.rank), '[]'::json) from (
        select top.rank, top.global_rank, top.country_rank, top.europe_rank,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state, h.institution_state) as state,
               case when coalesce(h.nppes_practice_state, h.derived_state) is not null then 'nppes'
                    when h.institution_state is not null then 'institution'
                    else null end as state_basis,
               top.eff as scored_country,
/* The POOL this rank was computed against. EUROPE joins GLOBAL as a */
/* pool name; scored_country below still carries the person's own */
/* country, so the rail shows "#12 EUROPE" against "GERMANY - Charite" */
/* rather than losing the geography to the label. */
               case when (select is_global from sel) then 'GLOBAL'
                    when (select agg_key from sel) is not null then (select agg_key from sel)
                    else top.eff end as scope_label,
               h.country, h.current_country,
               h.affiliation_confidence, h.affiliation_as_of,
               top.scimom, top.netmom, top.scivis, top.netvis, top.idx, top.archetype, top.hcp_id,
/* Momentum narrative headline: why_now (single-sentence strongest */
/* signal), narrative_text as fallback. Same artifact the rising */
/* profile shows; cohort-keyed to the rising row. */
               (
                 select coalesce(n.why_now, n.narrative_text)
                 from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id
                   and n.therapeutic_area_slug = v_slug
                   and n.cohort = 'rising_star'
                 limit 1
               ) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = top.hcp_id and n.therapeutic_area_slug = v_slug
                   and n.cohort = 'rising_star'
                 limit 1) as summary_is_current
        from top
        join hcps_v2 h on h.id = top.hcp_id
      ) t
    )
  )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.board_rising(uuid, integer, integer, text[], text[], boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.board_rising(uuid, integer, integer, text[], text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_rising(uuid, integer, integer, text[], text[], boolean) TO service_role;


/* ==== S2b. THE FILTERED FAMILY CARRIES THE PROVENANCE TOO ====

   S2 taught board_established and board_rising to fall back to institution_state and to emit
   state_basis. This does the same for the row-returning half of the get_%filtered family, so
   the two families agree on what a state is and where it came from.

   WHAT WAS ENUMERATED, because the count in the brief was close but not right. Fourteen
   functions matching get_%filtered% touch nppes_practice_state:

     SEVEN RETURN ROWS and are rewritten below.
       get_community_filtered           (6-arg implementation, 7-arg wrapper)
       get_established_filtered         (6-arg, 7-arg)
       get_rising_composite_filtered    (6-arg, 7-arg)
       get_rising_star_filtered         (7-arg)

     SEVEN RETURN A SCALAR COUNT and are NOT touched, because a column cannot be added to an
     integer. They use nppes_practice_state only in their WHERE clause, which is unchanged.
       get_community_filtered_count         (4-arg, 5-arg)
       get_established_filtered_count       (4-arg, 5-arg)
       get_rising_composite_filtered_count  (4-arg, 5-arg)
       get_rising_star_filtered_count       (5-arg)

   get_community_directory_filtered and its _count are a DIFFERENT FAMILY (p_state text, the
   AD directory behind CommunityExplorer) and never read nppes_practice_state. Out of scope.

   NO SIGNATURE CHANGE. p_include_institution_placed stays on board_established and
   board_rising only. These seven keep their argument lists exactly as they are, so the
   _filtered/_count overload pairs that already differ only by a trailing uuid[] are not
   given a second axis to be ambiguous on. Only the RETURNS TABLE grows.

   DROP + CREATE, NOT CREATE OR REPLACE. CREATE OR REPLACE cannot change a return type, and
   RETURNS TABLE is a return type. Every drop loses its ACL; every function is re-granted to
   anon, authenticated and service_role immediately after its create. A lost grant here is an
   empty People feed that reads as a data problem rather than a permissions one.

   nppes_practice_state IS KEPT WHERE IT WAS. Two of the seven (get_community_filtered) return
   it and still do. The other five never did and still do not: they take state_basis and
   institution_state only. That asymmetry is deliberate rather than an oversight. state_basis
   is readable without the NPPES value: 'nppes' means "the value you already hold is a
   practice registration", 'institution' means "use institution_state and qualify it", null
   means there is no state at all.

   THE WRAPPER IS ORDER-SENSITIVE. get_community_filtered's 7-arg form is
   `SELECT r.*, am.cited_by_count, am.h_index, am.works_count` over the 6-arg form, so r.*
   expands the delegate's columns IN ORDER and the two new ones land between npi_specialty and
   the author-metrics trio. Its RETURNS TABLE below says exactly that. Reordering either
   function's column list without the other silently shifts every column after the seam.

   SCOPE NOTE, SO NOBODY RE-DERIVES IT LATER. This block is not what keeps the People feed
   from going blank after block 7. The frontend never read the state from these RPCs: it
   hydrates every cohort from a direct hcps_v2 select (api.ts:177-199) and merges at :558 as
   `rr.x ?? hcp.x`, and institution_state was threaded into that path alongside this work.
   What S2b buys is that the RPCs are self-sufficient and the two families agree, so a future
   consumer reading these functions directly gets the provenance rather than a bare code. */

DROP FUNCTION IF EXISTS public.get_community_filtered(uuid, text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, evidence_tier text, patient_volume numeric, part_d_present boolean, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_career_stage_years integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT b.hcp_id, b.evidence_tier, b.patient_volume, b.part_d_present,
         h.country, h.first_name, h.last_name, h.institution_normalized,
         h.career_first_pub_year, h.total_career_pubs, h.nppes_career_stage_years,
         h.nppes_practice_city, h.nppes_practice_state, h.nppes_practice_setting, h.npi_specialty,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
  FROM community_board_nsclc_v1 b
  JOIN hcps_v2 h ON h.id = b.hcp_id
  WHERE p_ta_id = 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid
    AND b.qualifies
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY CASE b.evidence_tier WHEN 'anchored' THEN 1 WHEN 'supported' THEN 2 WHEN 'heme_dominant' THEN 3 WHEN 'candidate' THEN 4 ELSE 5 END,
           COALESCE(b.patient_volume, 0) DESC, b.hcp_id
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, evidence_tier text, patient_volume numeric, part_d_present boolean, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_career_stage_years integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text, institution_state text, state_basis text, cited_by_count integer, h_index integer, works_count integer)
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

GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_established_filtered(uuid, text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r3.scope_type = 'global')
      OR (r3.scope_type = p_scope_type AND r3.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer, works_count integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs,
    am.cited_by_count, am.h_index, am.works_count,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r3.scope_type = 'global')
      OR (r3.scope_type = p_scope_type AND r3.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = r3.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, rising_composite_score double precision, emergence_pctile double precision, network_influence_pctile double precision, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r.hcp_id,
    r.rank,
    NULL::integer AS scope_size,
    r.rising_composite_score::numeric AS normalized_score,
    r.rising_composite_score::numeric AS composite_score,
    NULL::numeric AS trial_score,
    r.rising_composite_score,
    r.emergence_pctile,
    r.network_influence_pctile,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year_v2 AS career_first_pub_year,
    h.total_career_pubs,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, rising_composite_score double precision, emergence_pctile double precision, network_influence_pctile double precision, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer, works_count integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r.hcp_id,
    r.rank,
    NULL::integer AS scope_size,
    r.rising_composite_score::numeric AS normalized_score,
    r.rising_composite_score::numeric AS composite_score,
    NULL::numeric AS trial_score,
    r.rising_composite_score,
    r.emergence_pctile,
    r.network_influence_pctile,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year_v2 AS career_first_pub_year,
    h.total_career_pubs,
    am.cited_by_count,
    am.h_index,
    am.works_count,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
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
  ORDER BY r.rank ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;


DROP FUNCTION IF EXISTS public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_rising_star_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer)
 RETURNS TABLE(hcp_id uuid, rank integer, us_rank integer, rising_star_percentile numeric, momentum_component numeric, visibility_component numeric, scientific_momentum_percentile numeric, network_momentum_percentile numeric, scientific_visibility_percentile numeric, network_visibility_percentile numeric, archetype text, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, scope_rank integer, institution_state text, state_basis text)
 LANGUAGE sql
 STABLE
AS $function$

  SELECT

    r.hcp_id,

    r.rank,

    r.us_rank,

    r.rising_star_percentile,

    r.momentum_component,

    r.visibility_component,

    r.scientific_momentum_percentile,

    r.network_momentum_percentile,

    r.scientific_visibility_percentile,

    r.network_visibility_percentile,

    r.archetype,

    h.country,

    h.first_name,

    h.last_name,

    h.institution_normalized,

    h.career_first_pub_year_v2 AS career_first_pub_year,

    h.total_career_pubs,

    CASE

      WHEN p_scope_type = 'global' THEN r.rank

      WHEN p_scope_type = 'region' AND 'US' = ANY(p_scope_values) THEN r.us_rank

      ELSE r.rank

    END AS scope_rank,
    h.institution_state,
    CASE WHEN COALESCE(h.nppes_practice_state, h.derived_state) IS NOT NULL THEN 'nppes'
         WHEN h.institution_state IS NOT NULL THEN 'institution'
         ELSE NULL::text END AS state_basis

  FROM hcp_rising_star_ranks_v3 r

  JOIN hcps_v2 h ON h.id = r.hcp_id

  WHERE r.therapeutic_area_id = p_ta_id

    AND (

      p_scope_type = 'global'

      OR (p_scope_type = 'region' AND h.country = ANY(p_scope_values))

    )

    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))

    /* p_canonical_theme_ids accepted but not yet wired (v1.1) */

  ORDER BY 

    CASE

      WHEN p_scope_type = 'global' THEN r.rank

      WHEN p_scope_type = 'region' AND 'US' = ANY(p_scope_values) THEN r.us_rank

      ELSE r.rank

    END ASC NULLS LAST

  LIMIT p_limit OFFSET p_offset;

$function$;

GRANT EXECUTE ON FUNCTION public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;


/* ==== S2c. VERIFY S2b, READ THE OUTPUT ====
   Seven rows. Every one must show has_institution_state and has_state_basis true, and an acl
   naming anon, authenticated and service_role. A missing grant here is silent at the database
   and total at the surface. */

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       (pg_get_function_result(p.oid) ~ 'institution_state text') AS has_institution_state,
       (pg_get_function_result(p.oid) ~ 'state_basis text')       AS has_state_basis,
       coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proretset
  AND p.proname IN ('get_community_filtered', 'get_established_filtered',
                    'get_rising_composite_filtered', 'get_rising_star_filtered')
ORDER BY p.proname, args;


/* ==== S3. merge_hcp_pair: THE INVARIANT, NOT JUST THREE MORE COLUMNS ====
   CREATE OR REPLACE, no signature change, so no grant loss and no ambiguity
   window.

   The three new columns merge within their own lane, and institution_state is
   never copied into nppes_practice_state. The reasoning is written into the
   function body, next to the line it protects, so it survives this file.
   institution_state_source is resolved by a CASE rather than a COALESCE
   because it is a confidence order, not a presence test. */

CREATE OR REPLACE FUNCTION public.merge_hcp_pair(p_canonical_id uuid, p_merged_id uuid, p_pass_name text, p_signals jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$

DECLARE

  v_canonical_row hcps%ROWTYPE;

  v_merged_row hcps%ROWTYPE;

  v_fk_counts jsonb := '{}'::jsonb;

  v_remaining_refs int;

  v_log_id uuid;

BEGIN

/* Sanity checks */

  IF p_canonical_id = p_merged_id THEN

    RAISE EXCEPTION 'Cannot merge HCP into itself: %', p_canonical_id;

  END IF;

  

  SELECT * INTO v_canonical_row FROM hcps WHERE id = p_canonical_id;

  IF NOT FOUND THEN

    RAISE EXCEPTION 'Canonical HCP not found: %', p_canonical_id;

  END IF;

  

  SELECT * INTO v_merged_row FROM hcps WHERE id = p_merged_id;

  IF NOT FOUND THEN

    RAISE EXCEPTION 'Merged HCP not found: %', p_merged_id;

  END IF;

  

/* Capture pre-merge FK counts for log */

  v_fk_counts := jsonb_build_object(

    'publication_authors_canonical', (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_canonical_id),

    'publication_authors_merged', (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_merged_id),

    'publications_canonical', (SELECT COUNT(*) FROM publications WHERE hcp_id = p_canonical_id),

    'publications_merged', (SELECT COUNT(*) FROM publications WHERE hcp_id = p_merged_id),

    'hcp_therapeutic_areas_canonical', (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_canonical_id),

    'hcp_therapeutic_areas_merged', (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_merged_id),

    'hcp_scores_canonical', (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_canonical_id),

    'hcp_scores_merged', (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_merged_id),

    'hcp_open_payments_summary_canonical', (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_canonical_id),

    'hcp_open_payments_summary_merged', (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id),

    'hcp_open_payments_by_ta_canonical', (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_canonical_id),

    'hcp_open_payments_by_ta_merged', (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_merged_id),

    'hcp_medicare_summary_canonical', (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_canonical_id),

    'hcp_medicare_summary_merged', (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_merged_id),

    'hcp_medicare_by_ta_canonical', (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_canonical_id),

    'hcp_medicare_by_ta_merged', (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_merged_id),

    'hcp_narratives_canonical', (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_canonical_id),

    'hcp_narratives_merged', (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_merged_id),

    'trial_investigators_merged', (SELECT COUNT(*) FROM trial_investigators WHERE hcp_id = p_merged_id),

    'dol_matches_canonical', (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_canonical_id),

    'dol_matches_merged', (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_merged_id),

    'npi_match_proposals_canonical', (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_canonical_id),

    'npi_match_proposals_merged', (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_merged_id),

    'trial_match_proposals_merged', (SELECT COUNT(*) FROM trial_investigator_match_proposals WHERE proposed_hcp_id = p_merged_id)

  );

  

/* Step 1: Insert merge log entry */

  INSERT INTO dedup_merge_log (

    canonical_hcp_id, merged_hcp_id, merge_pass, merge_signals,

    original_canonical_data, original_merged_data, fk_updates_count

  )

  VALUES (

    p_canonical_id, p_merged_id, p_pass_name, p_signals,

    to_jsonb(v_canonical_row), to_jsonb(v_merged_row), v_fk_counts

  )

  RETURNING id INTO v_log_id;

  

/* Step 2: Resolve UNIQUE constraint conflicts */

/* For each table with UNIQUE involving hcp_id, delete merged's conflicting rows first */

  

/* hcp_therapeutic_areas: UNIQUE (hcp_id, therapeutic_area_id) */

  DELETE FROM hcp_therapeutic_areas

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_therapeutic_areas WHERE hcp_id = p_canonical_id

    );

  

/* hcp_scores: UNIQUE (hcp_id, therapeutic_area_id) AND UNIQUE (hcp_id, therapeutic_area_id, score_version) */

/* Stricter constraint catches first; deleting by ta_id handles both */

  DELETE FROM hcp_scores

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_scores WHERE hcp_id = p_canonical_id

    );

  

/* hcp_open_payments_summary: UNIQUE (hcp_id) */

  IF EXISTS (SELECT 1 FROM hcp_open_payments_summary WHERE hcp_id = p_canonical_id) THEN

    DELETE FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id;

  END IF;

  

/* hcp_open_payments_by_ta: UNIQUE (hcp_id, therapeutic_area_id) */

  DELETE FROM hcp_open_payments_by_ta

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_open_payments_by_ta WHERE hcp_id = p_canonical_id

    );

  

/* hcp_medicare_summary: UNIQUE (hcp_id) */

  IF EXISTS (SELECT 1 FROM hcp_medicare_summary WHERE hcp_id = p_canonical_id) THEN

    DELETE FROM hcp_medicare_summary WHERE hcp_id = p_merged_id;

  END IF;

  

/* hcp_medicare_by_ta: UNIQUE (hcp_id, therapeutic_area_id) */

  DELETE FROM hcp_medicare_by_ta

  WHERE hcp_id = p_merged_id

    AND therapeutic_area_id IN (

      SELECT therapeutic_area_id FROM hcp_medicare_by_ta WHERE hcp_id = p_canonical_id

    );

  

/* hcp_narratives: UNIQUE (hcp_id, therapeutic_area_id, model_version) */

  DELETE FROM hcp_narratives

  WHERE hcp_id = p_merged_id

    AND (therapeutic_area_id, model_version) IN (

      SELECT therapeutic_area_id, model_version FROM hcp_narratives WHERE hcp_id = p_canonical_id

    );

  

/* publication_authors: UNIQUE (publication_id, hcp_id) */

  DELETE FROM publication_authors

  WHERE hcp_id = p_merged_id

    AND publication_id IN (

      SELECT publication_id FROM publication_authors WHERE hcp_id = p_canonical_id

    );

  

/* publications: UNIQUE (hcp_id, pubmed_id) — newly handled */

  DELETE FROM publications

  WHERE hcp_id = p_merged_id

    AND pubmed_id IN (

      SELECT pubmed_id FROM publications WHERE hcp_id = p_canonical_id AND pubmed_id IS NOT NULL

    );

  

/* dol_matches: UNIQUE (hcp_id, social_user_id) */

  DELETE FROM dol_matches

  WHERE hcp_id = p_merged_id

    AND social_user_id IN (

      SELECT social_user_id FROM dol_matches WHERE hcp_id = p_canonical_id

    );

  

/* npi_match_proposals: UNIQUE (hcp_id) — newly handled */

  IF EXISTS (SELECT 1 FROM npi_match_proposals WHERE hcp_id = p_canonical_id) THEN

    DELETE FROM npi_match_proposals WHERE hcp_id = p_merged_id;

  END IF;

  

/* Step 3: Update FKs in remaining (non-conflicting) rows from merged_id to canonical_id */

  

  UPDATE publication_authors SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE publications SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_therapeutic_areas SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_scores SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_open_payments_summary SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_open_payments_by_ta SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_medicare_summary SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_medicare_by_ta SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_claims SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE hcp_narratives SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE trial_investigators SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE dol_matches SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE npi_match_proposals SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE trial_investigator_match_proposals SET proposed_hcp_id = p_canonical_id WHERE proposed_hcp_id = p_merged_id;

/* Empty tables (no rows currently) — safe to update for future-proofing */

  UPDATE hcp_watchlist SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE msl_contributions SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  UPDATE cohort_overrides SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;

  

/* Step 4: Field merge — fill-if-null from merged into canonical for null fields, */

/* numeric maximums for count fields, numeric minimum for first_pub_year */

  UPDATE hcps c SET

    npi_number = COALESCE(c.npi_number, m.npi_number),

    middle_name = COALESCE(c.middle_name, m.middle_name),

    credentials = COALESCE(c.credentials, m.credentials),

    twitter_handle = COALESCE(c.twitter_handle, m.twitter_handle),

    bluesky_handle = COALESCE(c.bluesky_handle, m.bluesky_handle),

    orcid = COALESCE(c.orcid, m.orcid),

    nppes_enumeration_date = COALESCE(c.nppes_enumeration_date, m.nppes_enumeration_date),

    nppes_practice_address = COALESCE(c.nppes_practice_address, m.nppes_practice_address),

    nppes_practice_city = COALESCE(c.nppes_practice_city, m.nppes_practice_city),

    nppes_practice_state = COALESCE(c.nppes_practice_state, m.nppes_practice_state),

    /* ==== THE PROVENANCE INVARIANT (2026-09-02) ====
       A REAL NPPES STATE ALWAYS WINS, AND institution_state IS NEVER COPIED INTO
       nppes_practice_state. After the block-7 clear, "nppes_practice_state is populated"
       implies "NPPES sourced it", and merge is the ONLY path that can break that: it is the
       one place two rows with different provenance become one row. A COALESCE across the two
       columns here would put an institution's state into the NPPES column on the first merge
       and quietly undo the whole separation.

       The three columns below therefore merge WITHIN their own lane. They are listed
       immediately after nppes_practice_state so the pairing is visible to the next reader. */
    institution_state = COALESCE(c.institution_state, m.institution_state),
    institution_city  = COALESCE(c.institution_city,  m.institution_city),

    /* NOT A COALESCE, deliberately. The source is a CONFIDENCE ORDER, not a presence test:
       'institution_ror_confirmed' means a second registry agreed, 'legacy_nppes_column' means
       only that the value was found in the old column. A plain COALESCE takes whichever row
       happens to be canonical, so merging a confirmed row with a legacy row could DOWNGRADE a
       corroborated value to an uncorroborated one and lose the corroboration silently.

       The source must also follow the value it describes: if institution_state resolves to
       m's value, the source must be m's, or the merged row claims a confirmation that was
       about a different state. */
    institution_state_source = CASE
      WHEN c.institution_state IS NOT NULL AND m.institution_state IS NOT NULL THEN
        CASE WHEN 'institution_ror_confirmed' IN (c.institution_state_source, m.institution_state_source)
               AND c.institution_state = m.institution_state
             THEN 'institution_ror_confirmed'
             ELSE COALESCE(c.institution_state_source, m.institution_state_source)
        END
      WHEN c.institution_state IS NOT NULL THEN c.institution_state_source
      WHEN m.institution_state IS NOT NULL THEN m.institution_state_source
      ELSE NULL
    END,

    nppes_practice_zip = COALESCE(c.nppes_practice_zip, m.nppes_practice_zip),

    nppes_organization_name = COALESCE(c.nppes_organization_name, m.nppes_organization_name),

    nppes_organization_npi = COALESCE(c.nppes_organization_npi, m.nppes_organization_npi),

    nppes_career_stage = COALESCE(c.nppes_career_stage, m.nppes_career_stage),

    nppes_career_stage_years = COALESCE(c.nppes_career_stage_years, m.nppes_career_stage_years),

    nppes_enriched_at = COALESCE(c.nppes_enriched_at, m.nppes_enriched_at),

/* For count fields: numeric max via direct compare (cleaner than GREATEST with COALESCE) */

    total_career_pubs = CASE 

      WHEN c.total_career_pubs IS NULL THEN m.total_career_pubs

      WHEN m.total_career_pubs IS NULL THEN c.total_career_pubs

      ELSE GREATEST(c.total_career_pubs, m.total_career_pubs)

    END,

    scholar_citations_total = CASE 

      WHEN c.scholar_citations_total IS NULL THEN m.scholar_citations_total

      WHEN m.scholar_citations_total IS NULL THEN c.scholar_citations_total

      ELSE GREATEST(c.scholar_citations_total, m.scholar_citations_total)

    END,

/* For first_pub_year: minimum (earliest) */

    first_pub_year = CASE 

      WHEN c.first_pub_year IS NULL THEN m.first_pub_year

      WHEN m.first_pub_year IS NULL THEN c.first_pub_year

      ELSE LEAST(c.first_pub_year, m.first_pub_year)

    END

  FROM hcps m

  WHERE c.id = p_canonical_id AND m.id = p_merged_id;

  

/* Step 5: Verify zero remaining FK references */

  SELECT 

    (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM publications WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_claims WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM trial_investigators WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM trial_investigator_match_proposals WHERE proposed_hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM hcp_watchlist WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM msl_contributions WHERE hcp_id = p_merged_id) +

    (SELECT COUNT(*) FROM cohort_overrides WHERE hcp_id = p_merged_id)

  INTO v_remaining_refs;

  

  IF v_remaining_refs > 0 THEN

    RAISE EXCEPTION 'Cannot delete merged HCP %: % FK refs still pointing at it', p_merged_id, v_remaining_refs;

  END IF;

  

/* Step 6: Delete merged hcp row */

  DELETE FROM hcps WHERE id = p_merged_id;

  

  RETURN jsonb_build_object(

    'success', true,

    'log_id', v_log_id,

    'canonical_id', p_canonical_id,

    'merged_id', p_merged_id,

    'fk_counts', v_fk_counts

  );

END;

$function$;


/* ==== S4. institution_ta_roster_v1: DROP THE DEAD COLUMN ====
   The view selects h.nppes_practice_state and its only consumer never asks for
   it: institutionRegistry.ts:59-62 lists fourteen columns and takes
   primary_state from institution_primary_links_v1 instead. It is a dead output
   that put itself on the reader list.

   CREATE OR REPLACE VIEW cannot drop a column, so this is DROP then CREATE.
   The view has no dependents. Grants are re-applied for the same reason as S2. */

DROP VIEW IF EXISTS public.institution_ta_roster_v1;

CREATE VIEW public.institution_ta_roster_v1 AS
 WITH cohort_members AS (
         SELECT hcp_established_ranks_v3.hcp_id,
            hcp_established_ranks_v3.therapeutic_area_id,
            'established'::text AS cohort,
            min(hcp_established_ranks_v3.rank) FILTER (WHERE hcp_established_ranks_v3.scope_type = 'region'::text AND hcp_established_ranks_v3.scope_value = 'US'::text) AS us_rank,
            min(hcp_established_ranks_v3.rank) FILTER (WHERE hcp_established_ranks_v3.scope_type = 'global'::text) AS global_rank,
            max(hcp_established_ranks_v3.cohort_score) AS index_score
           FROM hcp_established_ranks_v3
          GROUP BY hcp_established_ranks_v3.hcp_id, hcp_established_ranks_v3.therapeutic_area_id
        UNION ALL
         SELECT hcp_rising_star_ranks_v3.hcp_id,
            hcp_rising_star_ranks_v3.therapeutic_area_id,
            'rising'::text AS text,
            min(hcp_rising_star_ranks_v3.us_rank) AS min,
            min(hcp_rising_star_ranks_v3.rank) AS min,
            max(hcp_rising_star_ranks_v3.rising_star_percentile) AS max
           FROM hcp_rising_star_ranks_v3
          GROUP BY hcp_rising_star_ranks_v3.hcp_id, hcp_rising_star_ranks_v3.therapeutic_area_id
        UNION ALL
         SELECT hcp_rising_composite_v1.hcp_id,
            hcp_rising_composite_v1.therapeutic_area_id,
            'rising'::text AS text,
            min(hcp_rising_composite_v1.rank) FILTER (WHERE hcp_rising_composite_v1.scope_type = 'region'::text AND hcp_rising_composite_v1.scope_value = 'US'::text) AS min,
            min(hcp_rising_composite_v1.rank) FILTER (WHERE hcp_rising_composite_v1.scope_type = 'global'::text) AS min,
            max(hcp_rising_composite_v1.rising_composite_score) AS max
           FROM hcp_rising_composite_v1
          GROUP BY hcp_rising_composite_v1.hcp_id, hcp_rising_composite_v1.therapeutic_area_id
        )
 SELECT p.reference_institution_id,
    p.canonical_name,
    p.institution_type,
    p.nci_designation,
    p.is_coe,
    p.primary_state,
    p.network_parent,
    p.tie_broken,
    m.hcp_id,
    m.therapeutic_area_id,
    m.cohort,
    m.us_rank,
    m.global_rank,
    m.index_score,
    h.first_name,
    h.last_name
   FROM institution_primary_links_v1 p
     JOIN cohort_members m ON m.hcp_id = p.hcp_id
     JOIN hcps_v2 h ON h.id = p.hcp_id;

GRANT SELECT ON public.institution_ta_roster_v1 TO anon;
GRANT SELECT ON public.institution_ta_roster_v1 TO authenticated;
GRANT SELECT ON public.institution_ta_roster_v1 TO service_role;


/* ==== S5. VERIFY S1 TO S4, AND READ THE OUTPUT ====
   artifacts_left must be 0.
   board_signature and rising_signature must each end in ', boolean'.
   roster_has_state must be false.
   institution_state_total must be 14,622 (14,676 less the 54 from S1). */

SELECT
  (SELECT count(*) FROM public.hcps_v2
     WHERE institution_state IS NOT NULL
       AND institution_state NOT IN ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
         'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
         'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
         'WI','WY','DC','PR','VI','GU','AS','MP'))                          AS artifacts_left,
  (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'board_established')          AS board_signature,
  (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'board_rising')               AS rising_signature,
  (SELECT pg_get_viewdef('institution_ta_roster_v1'::regclass, true) ~ 'nppes_practice_state')
                                                                            AS roster_has_state,
  (SELECT count(*) FROM public.hcps_v2 WHERE institution_state IS NOT NULL)  AS institution_state_total;


/* ==== S6. THE INVARIANT, ENFORCED ====

   After block 7 the rule is: a populated nppes_practice_state implies an npi_number. Nothing
   enforces that today, which is exactly how 14,678 rows acquired a provenance they did not
   have. A comment is not enforcement, and the next producer will not read this file.

   NOT VALID, AND THAT IS THE RECOMMENDATION RATHER THAN A COMPROMISE. NOT VALID skips the
   scan of existing rows but IS ENFORCED ON EVERY INSERT AND UPDATE from the moment it is
   added, which is the whole requirement: no future producer can reintroduce this silently.

   TWO ROWS CANNOT SATISFY IT AND ARE GRANDFATHERED ON PURPOSE. Both carry real NPPES
   evidence (zip, taxonomy, specialty, nppes_enriched_at 2026-05-26) with no npi_number, and
   the NPI is UNRECOVERABLE: neither has a row in nppes_enrichment_log, npi_match_proposals or
   hcp_nppes_detail_v2, and neither has an NPI-bearing twin that would make it dedup residue.

     865eae68-5d72-474d-8434-1431d6a26715   Pasi Antero Janne    MA  02115      207RX0202X
     236b29a2-4403-447f-b86d-92278f265764   Kuchikula Reddy      PA  191045127  207RG0100X

   They are named here and in the completeness manifest because NOT VALID says exceptions
   exist without saying WHICH, and whoever runs VALIDATE CONSTRAINT one day should not have to
   rediscover them. Deleting or falsifying them to make a constraint pass would be worse than
   the constraint. */

ALTER TABLE public.hcps_v2
  ADD CONSTRAINT nppes_state_implies_npi
  CHECK (nppes_practice_state IS NULL OR npi_number IS NOT NULL) NOT VALID;


/* ==== S7. THE PROVENANCE COLUMN'S OWN INVARIANT ====
   FULLY VALID, no NOT VALID needed: measured 2026-09-02, zero rows have a value without a
   source and zero have a source without a value.

   BOTH DIRECTIONS, on purpose. A value with no source is a provenance split that has become
   decorative. A source with no value is the same failure inverted: a claim about the origin
   of nothing. The equality form states the pairing rather than testing one half of it. */

ALTER TABLE public.hcps_v2
  ADD CONSTRAINT institution_state_has_a_source
  CHECK ((institution_state IS NULL) = (institution_state_source IS NULL));


/* ==== S8. VERIFY THE CONSTRAINTS ====
   Both must appear. nppes_state_implies_npi must show convalidated = false, which is what
   records that the two rows above are exceptions rather than that the constraint is inactive.
   institution_state_has_a_source must show convalidated = true. */

SELECT con.conname, con.convalidated, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'hcps_v2'
  AND con.conname IN ('nppes_state_implies_npi', 'institution_state_has_a_source')
ORDER BY con.conname;
