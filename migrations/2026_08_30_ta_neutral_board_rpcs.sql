-- TA-neutral board RPCs: board_established, board_rising, board_meta.
-- Date: 2026-08-30. Branch: foundation-rebuild. Phase 1 of docs/canonical/TA_NEUTRAL_DB_LAYER.md.
-- Revert: sql/revert/2026_08_30_ta_neutral_board_rpcs_REVERT.sql
--
-- WHAT CHANGES. Three new functions take p_ta_id uuid, required, no default. The three
-- existing functions keep their exact signatures and become one-line wrappers passing
-- NSCLC's id, so nothing breaks at deploy and the frontend cuts over on its own schedule.
--
-- NEW NAMES, NOT NEW OVERLOADS. PostgREST resolves an overload by ARGUMENT NAME, so adding
-- p_ta_id to established_ledger would leave supabase.rpc("established_ledger", {p_limit: 50})
-- resolving to the old NSCLC-pinned body -- a frontend that looks migrated and is not.
-- Distinct names make the cutover a visible, greppable edit.
--
-- BODIES COPIED FROM THE LIVE CATALOG, NOT FROM THE REPO (pg_get_functiondef, 2026-08-30).
-- See the LIVE-VS-REPO note at the foot of this file: for established_ledger the newest
-- migration BY FILENAME is not what is running.
--
-- OUT OF SCOPE, DELIBERATELY: community_ledger and get_community_filtered. Both reach
-- hcp_nsclc_evidence_tier_v1, whose ladder is a clinical model needing per-TA curation
-- (Phase 3). board_meta's COM arm is the one place that boundary shows: it RAISES for a
-- non-NSCLC TA rather than answering with lung numbers.
--
-- ==========================================================================================
-- THE THREE TA-TEXT FORMS. The real work, and none of it guessed -- every rule was MEASURED
-- against the live table on 2026-08-30 before it was written.
--
--   1. therapeutic_area_id (uuid)  -- hcp_established_ranks_v3, hcp_rising_star_ranks_v3,
--      hcp_publication_leadership_v2, hcp_network_centrality_v2.
--      RESOLUTION: p_ta_id directly. The `ta` CTE stays, now `select p_ta_id as id`, so
--      every `cross join ta` and `(select id from ta)` below is untouched. Smallest
--      possible delta from the live body, which is the point -- these are 154-line
--      functions and a rewrite is a bug surface.
--
--   2. therapeutic_area_slug (text) -- hcp_narratives_v2.
--      RESOLUTION: = v_slug, EXACT. Measured: 8,013 of 8,013 rows equal a
--      therapeutic_areas.slug exactly ('nsclc', 'hepatology', 'colorectal-cancer',
--      'atopic-dermatitis', 'rare-disease'). One convention, no casing drift. It is also the
--      second column of hcp_narratives_v2_hcp_ta_cohort_key, so the comparison stays sargable.
--
--   3. therapeutic_area (text) -- hcp_ai_overviews. THE SITE THE BRIEF IS ABOUT.
--      The column holds 'NSCLC' (598 rows), 'atopic-dermatitis' (87) and 'colorectal-cancer'
--      (15): upper-cased slug for one TA, plain slug for the other two. From a uuid there is
--      no derivable answer, so it was not derived -- it was counted.
--      RESOLUTION: lower(o.therapeutic_area) = v_slug, CASE-INSENSITIVE.
--        * exact for the whole table today: 700 of 700 rows match a registered slug
--          case-insensitively, and 0 rows match any therapeutic_areas.name form.
--        * NOT `in (v_slug, upper(v_slug))`, which would stay sargable but would hard-code
--          the two casings that happen to exist this week.
--        * index cost is nil: idx_hcp_ai_overviews_lookup leads on (hcp_id, synthesis_type),
--          and this subquery is correlated on hcp_id with LIMIT 1 -- the TA predicate filters
--          a handful of rows per HCP, it never drives the scan.
--        * Phase 4 normalises the column and this collapses back to `=`.
--
--      A JOIN BACK TO therapeutic_areas PER TABLE WAS CONSIDERED AND REJECTED for this site:
--      there is no column in therapeutic_areas holding 'NSCLC'. slug is 'nsclc' and name is
--      'Lung Cancer' (renamed 2026-08-15). A join would have to be ON an expression anyway,
--      so it buys a join and no correctness.
-- ==========================================================================================
--
-- NOTHING IS WRITTEN. All five functions are STABLE, read-only, SECURITY DEFINER with
-- search_path pinned -- matching the functions they replace. Grants replicate the existing
-- ACL exactly (anon, authenticated, service_role).

BEGIN;

-- ==========================================================================================
-- NEW: board_established
-- ==========================================================================================
CREATE OR REPLACE FUNCTION public.board_established(
  p_ta_id uuid,
  p_limit integer DEFAULT 1000,
  p_after_rank integer DEFAULT 0,
  p_states text[] DEFAULT '{}'::text[],
  p_countries text[] DEFAULT '{US}'::text[]
)
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
    RAISE EXCEPTION 'board_established: unknown therapeutic_area_id %', p_ta_id
      USING ERRCODE = '22023';   -- invalid_parameter_value -> PostgREST 400
  END IF;

  RETURN (

  with ta as (select p_ta_id as id),
  -- THE AGGREGATE REGIONS, from data (2026-08-18). This replaced a literal test on
  -- 'EUROPE'. Any region flagged regions.aggregate_scope is a POOL rather than a
  -- place: its scope_value is a region key, not an ISO country code, so it must not
  -- reach the rail's location chip. Adding LATAM later is an UPDATE on regions, not
  -- an edit here -- which is the whole point of the generalisation.
  agg as (select region_key from regions where aggregate_scope),
  -- GLOBAL SELECTION SENTINEL (2026-08-17). p_countries carrying '__global__'
  -- selects the global scope instead of a set of country scopes. A sentinel
  -- rather than a new parameter because adding one changes the signature, which
  -- means DROP + CREATE on a live SECURITY DEFINER RPC and a PostgREST overload
  -- window; '__global__' is not a country code and already means exactly this in
  -- hcp_established_board_snapshots.scope_value.
  sel as (select ('__global__' = any(p_countries)) as is_global),
  us as (
    select r.hcp_id, r.rank, r.scientific_influence_pctile as sci,
           r.network_influence_pctile as net, r.pharma_engagement_pctile as ph,
           r.cohort_score as idx,
           -- AGGREGATE SCOPES ARE POOLS, NOT PLACES (2026-08-18). Two scope rows
           -- name a pool rather than a country: global (scope_value NULL) and the
           -- EUROPE bucket. Both must still show the person's OWN country here,
           -- because the rail uses scored_country as the row's LOCATION chip --
           -- an all-Europe board that reads "EUROPE - Charite" for all 3,849 rows
           -- has thrown away the only geography it had. The rank chip gets the
           -- pool name from scope_label below; one field cannot be both, which is
           -- the same split the global scope needed on 2026-08-17.
           case when r.scope_value in (select region_key from agg) then hs.country
                else coalesce(r.scope_value, hs.country) end as scored_country,
           -- The raw bucket, carried so scope_label can name the pool after
           -- scored_country has been resolved back to the person's country.
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
        select top.rank,
               -- On a global selection the scope rank IS the global rank, so the
               -- companion column would duplicate it. NULL suppresses the rail's
               -- "#n GLOBAL" line (which the frontend guard now honours) rather
               -- than printing the same number twice.
               case when (select is_global from sel) then null else gl.gr end as global_rank,
               -- The pool this rank was computed against, as a LABEL. Distinct from
               -- scored_country, which the rail also uses as the row's location chip:
               -- on a global board every row needs its own country there, but the
               -- rank chip must say GLOBAL. One field cannot be both.
               -- EUROPE joins GLOBAL as a pool name: on those selections the rank
               -- was computed against the aggregate, so the chip must say so rather
               -- than repeat the row's country (which is now what scored_country
               -- holds). A per-country selection is unchanged -- scope_bucket and
               -- scored_country are the same code there.
               case when (select is_global from sel) then 'GLOBAL'
                    else coalesce(top.scope_bucket, top.scored_country) end as scope_label,
               h.first_name, h.last_name,
               coalesce(h.institution_canonical, h.institution_normalized, h.institution_raw) as institution,
               coalesce(h.nppes_practice_state, h.derived_state) as state,
               -- scored_country is the authoritative chip for Established: the pool this
               -- rank was actually computed against. current_country is carried alongside
               -- for the hedge, NOT for placement.
               top.scored_country,
               h.country, h.current_country,
               h.affiliation_confidence, h.affiliation_as_of,
               -- sci/net STAY on the payload after the 2026-08-18 column swap took them
               -- off the ledger's face. They are no longer rendered as columns, but
               -- estEngine() in CohortLedger.tsx reads both to decide network-led vs
               -- scientific-led for the drawer's spine text and its neighbour lines.
               -- Dropping them from here would silently blank that narrative, because
               -- mapRow builds row.scores from cfg.cols alone.
               top.sci, top.net, top.ph, top.idx, top.hcp_id,
               -- THE DISPLAYED QUANTITIES (2026-08-18). Both are evidence BESIDE the
               -- ranking, not the ranking: the order is still cohort_score, which is
               -- 0.60*sci + 0.40*net. They replace the SCI/NET percentile columns,
               -- which read 99.9 for the whole head — on the Europe board the top five
               -- all printed 99.9 against true values of 99.976 down to 99.892.
               --
               --   sencit  senior-authored citations, all-time in this TA. Chosen over
               --           senior_pub_count, which looks like the more direct quantity
               --           and is not: small integers repeat, so it carries 47 distinct
               --           values across the top 500 (modal value on 10% of rows) where
               --           citations carry 351. It also survives deeper — 0% zero
               --           through rank 500 against senior_pub_count's 1% by 500 and
               --           13% by 1,500.
               --   collab  distinct co-authors, 10-year window. 99.9% populated on the
               --           board, never zero where present, 345 distinct in the top 500.
               --
               -- Both are counts on a unique (hcp_id, therapeutic_area_id) grain
               -- (verified: 19,449 rows / 19,449 keys and 113,829 / 113,829), so the
               -- LEFT JOINs below cannot fan a row out.
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
                 -- fallback: the established narrative's single-sentence
                 -- strongest-signal line — for HCPs whose record holds no
                 -- qualifying paper for positions synthesis
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
        -- LEFT, not inner: a board row with no publication-leadership or centrality
        -- row must still render. The columns dash; the row does not vanish.
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

-- ==========================================================================================
-- NEW: board_rising
-- ==========================================================================================
CREATE OR REPLACE FUNCTION public.board_rising(
  p_ta_id uuid,
  p_limit integer DEFAULT 1000,
  p_after_rank integer DEFAULT 0,
  p_states text[] DEFAULT '{}'::text[],
  p_countries text[] DEFAULT '{US}'::text[]
)
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
    RAISE EXCEPTION 'board_rising: unknown therapeutic_area_id %', p_ta_id
      USING ERRCODE = '22023';   -- invalid_parameter_value -> PostgREST 400
  END IF;

  RETURN (

  with ta as (select p_ta_id as id),
  -- Same '__global__' sentinel as established_ledger. Rising's rank is already a
  -- read-time row_number() over the stored global rank, so a global selection is
  -- simply the whole board with no country predicate -- no new scoring needed.
  -- EUROPE AGGREGATE SENTINEL (2026-08-18), the same shape as '__global__' above
  -- and for the same reason: a sentinel inside p_countries rather than a new
  -- parameter, which would mean DROP + CREATE on a live SECURITY DEFINER RPC.
  -- 'EUROPE' is not an ISO country code, so it cannot collide with a real country.
  --
  -- WHY RISING NEEDS AN EXPANSION WHERE ESTABLISHED NEEDS A BUCKET. Rising's rank
  -- is a read-time row_number() over whatever pool is selected, so all-Europe is
  -- correct the moment the predicate admits the 33 countries -- nothing is scored
  -- or stored. Established ranks are normalised WITHIN a stored scope, so its
  -- all-Europe board had to be scored as its own bucket by
  -- recompute_established_ranks_v3.py. Same selector key, two different mechanisms.
  -- ANY AGGREGATE REGION, from data (2026-08-18). This was a literal test for the
  -- 'EUROPE' sentinel; APAC would have matched no country and returned an EMPTY
  -- LEDGER, silently -- the exact failure the Europe revert artifact warned about.
  -- agg_key is the selected aggregate's region key, or NULL when the selection is a
  -- plain country list. sort_order breaks a tie if a caller ever sends two aggregates;
  -- the menu cannot produce that, and picking the first is better than a cross join.
  sel as (select ('__global__' = any(p_countries)) as is_global,
                 (select g.region_key from regions g
                   where g.aggregate_scope and g.region_key = any(p_countries)
                   order by g.sort_order, g.region_key limit 1) as agg_key),
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
    cross join sel
    -- Three ways in, checked in widening order: the whole board, the geographic
    -- Europe set expanded from region_countries, or an explicit country list. The
    -- sentinel is expanded HERE rather than by the caller so the country list has
    -- exactly one home (region_countries) shared with rising_board and the scorer.
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
               -- The POOL this rank was computed against. EUROPE joins GLOBAL as a
               -- pool name; scored_country below still carries the person's own
               -- country, so the rail shows "#12 EUROPE" against "GERMANY - Charite"
               -- rather than losing the geography to the label.
               case when (select is_global from sel) then 'GLOBAL'
                    when (select agg_key from sel) is not null then (select agg_key from sel)
                    else top.eff end as scope_label,
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

-- ==========================================================================================
-- NEW: board_meta
-- ==========================================================================================
CREATE OR REPLACE FUNCTION public.board_meta(
  p_ta_id uuid,
  p_cohort text
)
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

  -- COM IS STILL NSCLC-PINNED. The community arm below counts community_board_nsclc_v1, a
  -- TA-NAMED view with no ta column, and generalising it is blocked on the evidence-tier
  -- curation (Phase 3 of docs/canonical/TA_NEUTRAL_DB_LAYER.md). Refusing is the honest option: this
  -- function now ACCEPTS a TA, so answering a colorectal COM request with lung numbers would
  -- be precisely the defect the parameter was added to prevent.
  IF upper(p_cohort) = 'COM' AND v_slug <> 'nsclc' THEN
    RAISE EXCEPTION 'board_meta: cohort COM is NSCLC-only until the evidence tier is generalised (Phase 3); asked for %', v_slug
      USING ERRCODE = '0A000';   -- feature_not_supported
  END IF;

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
      from community_board_nsclc_v1 b
      where b.qualifies
    )
    else null
  end
  );
END;
$function$;

-- ==========================================================================================
-- PINNED WRAPPERS. Same names, same signatures, same ACL -- only the body changes.
-- ==========================================================================================
CREATE OR REPLACE FUNCTION public.established_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- PINNED WRAPPER, TEMPORARY. Keeps every caller working across the deploy: the frontend
  -- and six scripts call this name today, and the DB change and the frontend change cannot
  -- land in the same instant on a branch that auto-deploys. The 'nsclc' literal here is the
  -- only remaining slug literal on this path, and it is deliberate -- it is what makes this
  -- a pin rather than a second implementation. Deleted at cutover; the Phase 0 allowlist
  -- carries a DATED row for it so it cannot quietly become permanent.
  select public.board_established(
    (select id from therapeutic_areas where slug = 'nsclc'),
    p_limit, p_after_rank, p_states, p_countries);
$function$;

CREATE OR REPLACE FUNCTION public.rising_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- PINNED WRAPPER, TEMPORARY. Keeps every caller working across the deploy: the frontend
  -- and six scripts call this name today, and the DB change and the frontend change cannot
  -- land in the same instant on a branch that auto-deploys. The 'nsclc' literal here is the
  -- only remaining slug literal on this path, and it is deliberate -- it is what makes this
  -- a pin rather than a second implementation. Deleted at cutover; the Phase 0 allowlist
  -- carries a DATED row for it so it cannot quietly become permanent.
  select public.board_rising(
    (select id from therapeutic_areas where slug = 'nsclc'),
    p_limit, p_after_rank, p_states, p_countries);
$function$;

CREATE OR REPLACE FUNCTION public.ledger_meta(p_cohort text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- PINNED WRAPPER, TEMPORARY. Keeps every caller working across the deploy: the frontend
  -- and six scripts call this name today, and the DB change and the frontend change cannot
  -- land in the same instant on a branch that auto-deploys. The 'nsclc' literal here is the
  -- only remaining slug literal on this path, and it is deliberate -- it is what makes this
  -- a pin rather than a second implementation. Deleted at cutover; the Phase 0 allowlist
  -- carries a DATED row for it so it cannot quietly become permanent.
  select public.board_meta(
    (select id from therapeutic_areas where slug = 'nsclc'),
    p_cohort);
$function$;

-- ------------------------------------------------------------------------------------------
-- GRANTS. The three wrapped functions carry EXECUTE for anon, authenticated and service_role;
-- the new ones must match or the wrapper works while the direct call 404s through PostgREST.
-- ------------------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.board_established(uuid, integer, integer, text[], text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.board_rising(uuid, integer, integer, text[], text[])      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.board_meta(uuid, text)                                    TO anon, authenticated, service_role;

COMMIT;

-- ------------------------------------------------------------------------------------------
-- LIVE-VS-REPO, checked before this file was written. All three bodies above came from
-- pg_get_functiondef; none came from a migration file.
--
--   established_ledger  LIVE == migrations/2026_08_18_established_ledger_generalise.sql
--                       LIVE != migrations/2026_08_18_established_ledger_quantities.sql
--                       Both dated 08-18. `quantities` sorts LAST by filename and is NOT what
--                       is running -- `generalise` was applied after it. The live body has the
--                       `agg as (select region_key from regions where aggregate_scope)` CTE
--                       and the `r.scope_value in (select region_key from agg)` test;
--                       `quantities` still carries the `r.scope_value = 'EUROPE'` literal that
--                       `generalise` replaced. Copying the newest filename would have silently
--                       REVERTED the Europe generalisation for every TA.
--   rising_ledger       LIVE == migrations/2026_08_18_rising_ledger_generalise.sql (exact).
--   ledger_meta         LIVE == migrations/2026_08_17_ledger_meta_country_repoint.sql (exact).
--
-- So for these three nothing is missing from the repo -- but filename order is not apply
-- order, which is the same trap wearing a different coat. (The genuinely-behind case is still
-- community_ledger: 2026_08_04_community_ledger_tiered.sql defines it with
-- `where name = 'NSCLC'`, a literal that has matched zero rows since therapeutic_areas.name
-- became 'Lung Cancer' on 08-15, and the live body has no such CTE at all.)

-- ------------------------------------------------------------------------------------------
-- AT APPLY TIME -- Phase 0 allowlist, scripts/utilities/ta_neutrality_allowlist.tsv.
-- The validator reads the LIVE catalog, so these edits belong with the apply, not with this
-- file. Applying without them leaves the wrappers filed as open debt with no end date, and
-- reports board_meta as a NEW violation.
--
--   1. Retag the three wrappers from `debt` to `shim` and give each an EXPIRY -- the date the
--      frontend cutover is due. A shim past its expiry is reported as a violation again,
--      which is the mechanism that stops a temporary wrapper becoming permanent:
--        function:established_ledger  rules 1,3
--        function:rising_ledger       rules 1,3
--        function:ledger_meta         rules 1,3
--
--   2. ADD two rows for board_meta, which is genuinely new debt:
--        function:board_meta  rule 1  debt  -  Phase 3: the `v_slug <> 'nsclc'` COM guard
--        function:board_meta  rule 4  debt  -  Phase 3: reads community_board_nsclc_v1
--      Both disappear when the COM arm moves to the generalised evidence tier.
--
--   3. board_established and board_rising need NO rows. They carry no slug literal, take
--      p_ta_id, and reach no TA-named object -- clean against all four rules. That is the
--      whole point of the phase, and it should be visible in the allowlist as an absence.
--
-- Expected validator delta after apply: KNOWN 96 -> 98, NEW 0 (unchanged).
