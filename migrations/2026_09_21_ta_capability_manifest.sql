-- ta_capability_manifest() -- the single authority for what each TA has.
-- Date: 2026-09-21. Branch: foundation-rebuild. Stage 1 of the TA switcher.
--
-- WHAT THIS REPLACES. The frontend currently holds four independent hand-maintained
-- answers to "which TAs have which cohorts":
--   cohortLedger.ts:249  boardTaSlugs      -- Community only, a literal pair
--   cohortLedger.ts:466  COM_TIER_MODELS   -- tier vocabulary per TA, a literal map
--   PeopleNavStrip:152   domainLive        -- (d) => d === "Oncology"
--   IndicationFilter:21  INDICATIONS_BY_TA -- live/planned + the taId for two TAs
-- Each drifts independently. This RPC is what they become.
--
-- AVAILABILITY IS DERIVED, NOT STORED. A stored per-cohort flag would be a fifth
-- mirror with the same failure mode as boardTaSlugs: it goes stale silently and the
-- symptom is a wrong board, not an error. EXISTS cannot drift.
--
-- EXISTS, NEVER COUNT. hcp_established_ranks_v3 holds one row per HCP PER SCOPE --
-- 67,550 rows for colorectal across ~25 country scopes. Counting them to establish a
-- fact the first row settles would scan the table on every session establishment.
-- EXISTS stops at the first row.
--
-- SCOPE-INDEPENDENT ON PURPOSE. board_meta's RS arm counts only rows whose
-- coalesce(current_country, country) = 'US', and its EST arm only scope_value = 'US'.
-- Those answer "how big is the US board", which is not this question. nsclc Rising is
-- 149 rows globally and 40 in the US; a manifest keyed on the US slice would call a TA
-- unavailable the moment its US slice emptied while a healthy global board stood
-- behind it. So no scope predicate appears below.
--
-- ADMITTED, NOT MERELY PRESENT. Every flag is ANDed with the TA's ingestion config
-- being both is_visible_in_ui and is_active. A TA mid-build must not become offerable
-- because its first scored row landed -- the pipeline writes rows long before a board
-- is fit to show, and derived-only availability would flip the switch at row one.
-- COALESCE(..., false): a TA with NO config row is NOT admitted. Absence of an
-- explicit admission is not admission.
--
-- COMMUNITY COMES FROM ta_evidence_tier_config. Not from community_board_v1 and not
-- from a literal. The config is the declarative authority -- community_board_v1 joins
-- it internally (docs/crc_community/27), so "has a config row" and "has board rows"
-- are the same set today, and the config is both cheaper and the thing an operator
-- actually edits. com_tier_model rides along on the same row, which is what lets
-- COM_TIER_MODELS be deleted rather than re-sourced.
--
-- LEAF-NESS IS DERIVED. A TA that parents another TA in this result is a grouping, not
-- a board -- that drops oncology and immunology without naming them. Same rule
-- loadAddressableTas applied client-side (ledgerTa.ts:95-98), moved to where the
-- registry lives.
--
-- ALL LEAF TAs ARE RETURNED, including ones with nothing available. Consumers filter
-- on (est OR rs OR com). Returning the full registry with honest flags is what makes
-- "this TA has no cohorts" a statable fact rather than an absence the caller has to
-- infer from a missing row. mesothelioma is the live example: it is a real
-- therapeutic_areas row, has no board anywhere, no config row, and appears here with
-- three false flags and drops out of every picker with no literal naming it.
--
-- surfaces IS A RESERVED SLOT, DELIBERATELY EMPTY. Telescope, Assets, Trials, Congress
-- and Landscape are per-SURFACE capabilities, each independently lung-pinned today.
-- They are not cohorts and the three booleans cannot express them. The column exists
-- so adding them later is a function replacement rather than a shape change at every
-- consumer. It returns '{}' and nothing reads it.
--
-- ADDITIVE. Creates one function. Nothing is dropped, altered or backfilled, and no
-- existing row changes.

CREATE OR REPLACE FUNCTION public.ta_capability_manifest()
RETURNS TABLE (
  slug            text,
  label           text,
  parent_slug     text,
  parent_label    text,
  ta_id           uuid,
  est_available   boolean,
  rs_available    boolean,
  com_available   boolean,
  com_tier_model  text,
  surfaces        jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with ta as (
    select t.id, t.slug, t.name, t.parent_ta_id
    from public.therapeutic_areas t
  ),
  -- A TA that parents another TA is a grouping. Computed over the same set that is
  -- returned, so it needs no list and no maintenance.
  parents as (
    select distinct parent_ta_id as id from ta where parent_ta_id is not null
  ),
  leaf as (
    select ta.* from ta where ta.id not in (select id from parents)
  ),
  admitted as (
    select l.id,
           coalesce(c.is_visible_in_ui and c.is_active, false) as ok
    from leaf l
    left join public.therapeutic_area_ingestion_config c
      on c.therapeutic_area_id = l.id
  )
  select
    l.slug::text,
    l.name::text,
    p.slug::text,
    p.name::text,
    l.id,
    (a.ok and exists (
       select 1 from public.hcp_established_ranks_v3 r
       where r.therapeutic_area_id = l.id
    ))                                                   as est_available,
    (a.ok and exists (
       select 1 from public.hcp_rising_star_ranks_v3 r
       where r.therapeutic_area_id = l.id
    ))                                                   as rs_available,
    (a.ok and exists (
       select 1 from public.ta_evidence_tier_config e
       where e.therapeutic_area_id = l.id
    ))                                                   as com_available,
    -- NULL unless Community is actually available: a tier model for a TA whose board
    -- is not offerable is a vocabulary with nothing to describe, and a consumer that
    -- reads it would be reading a config row the UI has no route to.
    (select e.tier_model from public.ta_evidence_tier_config e
      where e.therapeutic_area_id = l.id and a.ok)::text  as com_tier_model,
    '{}'::jsonb                                           as surfaces
  from leaf l
  join admitted a on a.id = l.id
  left join ta p on p.id = l.parent_ta_id
  order by p.name nulls first, l.name;
$function$;

COMMENT ON FUNCTION public.ta_capability_manifest() IS
  'The single authority for which cohorts each therapeutic area has. One row per LEAF '
  'TA (leaf-ness derived: a TA that parents another is a grouping). Each *_available is '
  'EXISTS on that cohort''s own source AND the TA being admitted by '
  'therapeutic_area_ingestion_config (is_visible_in_ui AND is_active), so a TA mid-build '
  'does not become offerable when its first row lands. Community reads '
  'ta_evidence_tier_config, which community_board_v1 joins internally, and carries its '
  'tier_model. No scope predicate: availability is "has any rows", not "has US rows". '
  'surfaces is a reserved empty slot for per-surface capabilities (Telescope, Assets, '
  'Trials, Congress, Landscape) and is not populated.';

-- Granted as the board RPCs are (board_established / board_rising / board_meta all hold
-- EXECUTE for these three). This is read at TAProvider mount, which runs before auth
-- resolves, so anon must be able to call it or the app establishes no TA at all.
GRANT EXECUTE ON FUNCTION public.ta_capability_manifest() TO anon;
GRANT EXECUTE ON FUNCTION public.ta_capability_manifest() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ta_capability_manifest() TO service_role;
