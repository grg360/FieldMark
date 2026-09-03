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
