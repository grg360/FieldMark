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
