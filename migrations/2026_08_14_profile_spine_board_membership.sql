-- ============================================================================
-- hcp_profile_spine — route on BOARD MEMBERSHIP, not extractor coverage.
-- Date: 2026-08-14   Branch: resurfacing
--
-- NOT YET APPLIED.
--
-- No conflict with the other unapplied migration on this branch
-- (2026_08_13_trials_surface_global_ranks.sql): that one touches exactly one
-- object, get_nsclc_trials_surface(); this one touches only hcp_profile_spine().
-- Disjoint objects, so the two are order-independent.
--
-- ── The defect ──────────────────────────────────────────────────────────────
-- The shipped function decides which PROFILE an HCP gets by asking whether our
-- extractors have run on them:
--
--   select case when exists (select 1 from hcp_scientific_positions_v1 …)
--             or exists (select 1 from hcp_research_themes_v2 …)
--          then 'academic' else 'community' end;
--
-- That conflates two unrelated questions. Extractor coverage should decide which
-- BLOCKS populate on a profile; board membership should decide which profile the
-- HCP gets at all. Because both extractors are hardcoded to US scope, every
-- non-US HCP fails the test.
--
-- Measured 2026-08-14 against live data: of the 3,905 European HCPs now
-- reachable through the ledger's territory axis, 0 have NSCLC scientific
-- positions and 0 have research themes. All 3,905 therefore route to the
-- community spine — the Medicare / Open Payments / NPPES surface — including
-- Martin Reck, rank #1 on the German Established board with 280 publications.
-- Those blocks all guard their absence correctly and render "—" rather than $0,
-- so nothing is currently FALSE on screen; the defect is that an Established
-- KOL is shown a practice-economics profile instead of an academic one.
--
-- ── The change ──────────────────────────────────────────────────────────────
-- Membership of the Established board decides the academic spine. The global
-- scope row is written unconditionally for every Established HCP by
-- recompute_established_ranks_v3.py, so it is the membership fact — using the
-- 'region' rows instead would re-introduce a US-scope dependency.
--
-- ── Deliberately NOT returning 'rising' ─────────────────────────────────────
-- The contract stays two-valued ('academic' | 'community'). Rising is already
-- routed upstream in ProfileDispatch.tsx by isOnRisingBoard(), which reads
-- hcp_rising_star_ranks_v3 directly and is therefore ALREADY board-membership
-- based and already correct; it runs before loadProfileSpine and returns early.
-- Adding a third return value would require a paired frontend change
-- (loadProfileSpine's Promise<"academic" | "community"> signature coerces any
-- non-'academic' value to 'community'), so a 'rising' return applied alone would
-- silently route rising HCPs to the community spine — worse than today. Keeping
-- two values means this migration is safe to apply on its own.
--
-- TA scope: NSCLC, matching the function it replaces (whose positions arm was
-- already NSCLC-scoped). Revisit when a second TA gets an academic spine.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hcp_profile_spine(p_hcp_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when exists (
    select 1
    from hcp_established_ranks_v3 e
    join therapeutic_areas ta on ta.id = e.therapeutic_area_id and ta.name = 'NSCLC'
    where e.hcp_id = p_hcp_id
      and e.scope_type = 'global'
  ) then 'academic' else 'community' end;
$function$;
