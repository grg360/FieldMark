-- ============================================================================
-- ledger_meta — repoint the RS and COM branches to the sources their row RPCs
-- already use. Date: 2026-08-17   Branch: foundation-rebuild
--
-- Revert: sql/revert/2026_08_17_ledger_meta_country_REVERT.sql
--
-- ── RS: the off-by-one ──────────────────────────────────────────────────────
-- The ledger rendered 58 US rows under a header reading 57. Two RPCs, two
-- definitions of "US":
--
--   rising_ledger  rows   nullif(btrim(coalesce(h.current_country, h.country)),'')
--   ledger_meta    header r.country = 'US' AND r.us_rank IS NOT NULL
--
-- The header read the STORED column on the rank table; the rows read the
-- re-derived affiliation. sql/affiliation/04_rising_board_current_country.sql
-- moved display to current_country and said so explicitly -- "us_rank is
-- deliberately LEFT ALONE ... repointing it would be a board change (Tier 2)" --
-- but only the row path was repointed. This is the count path catching up.
--
-- The three rows that differ, measured 2026-08-17:
--   Misako Nagasaka  country JP -> current US  (in the rows, absent from the count)
--   Aliyah Pabani    country CA -> current US  (in the rows, absent from the count)
--   Ruyang Zhang     country US -> current CN  (in the count, absent from the rows)
--   57 - 1 + 2 = 58.
--
-- The expression below is rising_ledger's `eff` VERBATIM, so the two agree by
-- construction rather than by coincidence. Note this also makes the existing
-- `join hcps_v2 h` load-bearing in this branch -- it was previously a dead join,
-- because every predicate read r.*.
--
-- NOT a board change: us_rank is untouched, no rank is recomputed. The ledger's
-- displayed rank is row_number() over global_rank within the selection and never
-- read us_rank, so Nagasaka and Pabani already rendered at ordinary positions
-- (4 and 27). The header simply stops disagreeing with them.
--
-- KNOWN, NOT FIXED HERE: RisingQuadrant filters on us_rank != null AND SORTS by
-- it, so it still shows 57 with different membership than this ledger's 58.
-- Repointing it needs a replacement sort key, not just a replacement filter.
--
-- ── COM: wrong source, 2.6x ─────────────────────────────────────────────────
-- ledger_meta counted hcp_community_scores_v2 (12,970 US) while community_ledger
-- counts the qualifying board (4,913). The count RPCs were repointed to
-- community_board_nsclc_v1 when hcp_community_ranks_v2 was retired; this branch
-- was missed. It is DISCARDED by the UI today -- CohortLedger.tsx:1880 reads
--   const cohortTotal = isCom ? rpcCohortTotal : (meta?.cohortTotal ?? rows.length)
-- so COM takes the page RPC's figure -- which is exactly why it was easy to miss.
-- Repointed anyway: the next consumer will not know it is 2.6x wrong.
-- The board view carries no country column and is US-only by construction
-- (NPPES/Medicare derived), so `qualifies` is the whole predicate, matching
-- community_ledger's `where b.qualifies`.
--
-- ── EST: deliberately unchanged ─────────────────────────────────────────────
-- Both ledger_meta and established_ledger scope by the rank table's own region
-- rows (scope_type='region' AND scope_value='US' / r.scope_value = any(...)).
-- They already agree at 2,990. established_ledger documents the choice: it places
-- by the scope the rank was COMPUTED against, carrying current_country alongside
-- for display. That is coherent, not an oversight, and is left alone.
--
--   ‼ CORRECTION 2026-08-18 — THE PARAGRAPH ABOVE IS WRONG, and the reasoning is
--     wrong for RS and COM too. ledger_meta takes ONE argument, p_cohort. It has no
--     scope axis, so it cannot "scope by" anything the caller selected: its EST
--     branch is hardcoded to scope_value='US' and its RS branch to effective
--     country 'US'. The agreement at 2,990 was two constants matching on the
--     DEFAULT US view, not two functions applying the same rule.
--
--     established_ledger DOES take the selection (r.scope_value = any(p_countries)),
--     so the two diverge the moment the territory selector moves off the US. The
--     German board has been rendering 462 rows under a 2,990/2,992 header for as
--     long as the country axis has existed; the EUROPE aggregate scope added
--     2026-08-18 (3,849 rows) is simply the first board big enough to make it
--     obvious. RS shows the same defect at 58 over a 53-row Europe board -- this
--     migration's repoint fixed WHICH country RS counts, never THAT it counts one.
--
--     FIXED IN THE FRONTEND, not here: CohortLedger.tsx now reads the
--     selection-scoped cohort_total the row RPC already returns (rpcCohortTotal),
--     for all three cohorts. Giving ledger_meta the selection would have meant
--     DROP + CREATE on a live SECURITY DEFINER function -- a signature change
--     cannot go through CREATE OR REPLACE -- to recompute a number the ledger RPC
--     hands back on every call. ledger_meta's remaining output (ceilings) feeds
--     thresholds(), whose value cellDisplay has ignored since 2026-07-31.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ledger_meta(p_cohort text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc')
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
  end;
$function$;
