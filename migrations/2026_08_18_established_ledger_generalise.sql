-- established_ledger: recognise ANY aggregate region, not the EUROPE literal.
-- Date: 2026-08-18. Branch: resurfacing.
-- Revert: sql/revert/2026_08_18_established_ledger_generalise_REVERT.sql
-- Requires: migrations/2026_08_18_regions_aggregate_scope.sql (regions.aggregate_scope)
--
-- WHAT CHANGES. This function learned on 2026-08-18 that an aggregate scope_value must
-- not leak into scored_country, which the rail uses as the row's LOCATION chip -- an
-- all-Europe board otherwise reads "EUROPE" for all 3,849 rows instead of Germany,
-- France, Italy. That fix was written as `r.scope_value = 'EUROPE'`. APAC would have
-- reproduced the defect exactly, for 8,771 rows.
--
-- The literal is now a membership test against regions.aggregate_scope. The EUROPE
-- special case is REPLACED, not paralleled: the string 'EUROPE' no longer appears in
-- this function.
--
-- BEHAVIOUR IS UNCHANGED FOR EVERY EXISTING SELECTION. EUROPE is flagged, so it takes
-- the same branch it took before; per-country, US and global selections never matched
-- the literal and do not match the subquery either. Verified by diffing full {DE},
-- {US}, {EUROPE} and global payloads before and after.
--
-- No data is written. STABLE, read-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.established_ledger(p_limit integer DEFAULT 1000, p_after_rank integer DEFAULT 0, p_states text[] DEFAULT '{}'::text[], p_countries text[] DEFAULT '{US}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc'),
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
  );
$function$

;

COMMIT;
