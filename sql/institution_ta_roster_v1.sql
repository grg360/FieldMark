-- institution_ta_roster_v1 — per-(institution, TA, cohort) HCP roster rows.
-- Source of record per the sql/ README rule — previously an editor-applied
-- object restorable from nowhere. Captured and revised 2026-08-11.
--
-- ACADEMIC-ONLY (Phase 3 decision, 2026-08-11): the community arm is REMOVED
-- entirely — community does not belong on institution rosters. Rationale:
-- with G2 membership, only 295 of 4,913 qualifying community clinicians held
-- a primary institution link (18 of 980 anchored); the old arm's 4,388
-- community rows were overwhelmingly the gated-out pharma-only/academic-
-- adjacent tail. Community clinicians are practice-based; the institutions
-- surface is an academic surface. The old arm also carried this view's ONLY
-- normalized_score read (max(normalized_score) AS index_score) — removing it
-- keeps the freeze gate clear: normalized_score appears nowhere below.
--
-- DROP + CREATE (not OR REPLACE): this revision REMOVES columns relative to
-- the transient 20-column version applied earlier on 2026-08-11, which
-- CREATE OR REPLACE cannot do.

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
            'rising'::text,
            min(hcp_rising_star_ranks_v3.us_rank),
            min(hcp_rising_star_ranks_v3.rank),
            max(hcp_rising_star_ranks_v3.rising_star_percentile)
           FROM hcp_rising_star_ranks_v3
          GROUP BY hcp_rising_star_ranks_v3.hcp_id, hcp_rising_star_ranks_v3.therapeutic_area_id
        UNION ALL
         SELECT hcp_rising_composite_v1.hcp_id,
            hcp_rising_composite_v1.therapeutic_area_id,
            'rising'::text,
            min(hcp_rising_composite_v1.rank) FILTER (WHERE hcp_rising_composite_v1.scope_type = 'region'::text AND hcp_rising_composite_v1.scope_value = 'US'::text),
            min(hcp_rising_composite_v1.rank) FILTER (WHERE hcp_rising_composite_v1.scope_type = 'global'::text),
            max(hcp_rising_composite_v1.rising_composite_score)
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
    h.last_name,
    h.nppes_practice_state
   FROM institution_primary_links_v1 p
     JOIN cohort_members m ON m.hcp_id = p.hcp_id
     JOIN hcps_v2 h ON h.id = p.hcp_id;

GRANT SELECT ON public.institution_ta_roster_v1 TO anon;
GRANT SELECT ON public.institution_ta_roster_v1 TO authenticated;
GRANT SELECT ON public.institution_ta_roster_v1 TO service_role;
