-- Institutions surface data layer (2026-08-03).
--
-- institution_primary_links_v1 — ONE registry link per HCP, computed, never
-- stored: the ladder nci_cancer_center > pediatric_facility > transplant_center
-- > va_facility > teaching_hospital > aamc_medical_school > community_idn >
-- academic_idn, ties broken deterministically on larger overall record
-- membership then id. hcp_institutions_v2 is NOT modified — secondary links
-- remain queryable there (the record page's "also:" facts). tie_broken flags
-- every ladder tie so the pair is loggable/auditable from the view itself.
--
-- institution_ta_roster_v1 — one row per (registry record, TA, ranked HCP):
-- the primary link joined to the three cohort boards (established v3, rising
-- v3 + AD composite, community v2). Index and record pages read ONLY this.
--
-- Views are definer-style (no security_invoker) so anon can read them without
-- base-table policies; access is via GRANT SELECT below.

CREATE OR REPLACE VIEW public.institution_primary_links_v1 AS
WITH ranked_links AS (
  SELECT
    l.hcp_id,
    l.reference_institution_id,
    r.canonical_name,
    r.institution_type,
    r.nci_designation,
    r.is_coe,
    r.primary_state,
    r.network_parent,
    CASE r.institution_type
      WHEN 'nci_cancer_center'   THEN 0
      WHEN 'pediatric_facility'  THEN 1
      WHEN 'transplant_center'   THEN 2
      WHEN 'va_facility'         THEN 3
      WHEN 'teaching_hospital'   THEN 4
      WHEN 'aamc_medical_school' THEN 5
      WHEN 'community_idn'       THEN 6
      WHEN 'academic_idn'        THEN 7
      ELSE 8
    END AS type_precedence,
    count(*) OVER (PARTITION BY l.reference_institution_id) AS record_membership
  FROM public.hcp_institutions_v2 l
  JOIN public.reference_institutions r ON r.id = l.reference_institution_id
),
scored AS (
  SELECT
    rl.*,
    row_number() OVER (
      PARTITION BY rl.hcp_id
      ORDER BY rl.type_precedence, rl.record_membership DESC, rl.reference_institution_id
    ) AS pick,
    count(*) OVER (PARTITION BY rl.hcp_id, rl.type_precedence) AS same_tier_links
  FROM ranked_links rl
)
SELECT
  hcp_id,
  reference_institution_id,
  canonical_name,
  institution_type,
  nci_designation,
  is_coe,
  primary_state,
  network_parent,
  (same_tier_links > 1) AS tie_broken
FROM scored
WHERE pick = 1;

CREATE OR REPLACE VIEW public.institution_ta_roster_v1 AS
WITH cohort_members AS (
  SELECT hcp_id, therapeutic_area_id, 'established'::text AS cohort,
         min(rank) FILTER (WHERE scope_type = 'region' AND scope_value = 'US') AS us_rank,
         min(rank) FILTER (WHERE scope_type = 'global') AS global_rank,
         max(cohort_score) AS index_score
  FROM public.hcp_established_ranks_v3
  GROUP BY 1, 2
  UNION ALL
  SELECT hcp_id, therapeutic_area_id, 'rising',
         min(us_rank), min(rank), max(rising_star_percentile)
  FROM public.hcp_rising_star_ranks_v3
  GROUP BY 1, 2
  UNION ALL
  SELECT hcp_id, therapeutic_area_id, 'rising',
         min(rank) FILTER (WHERE scope_type = 'region' AND scope_value = 'US'),
         min(rank) FILTER (WHERE scope_type = 'global'),
         max(rising_composite_score)
  FROM public.hcp_rising_composite_v1
  GROUP BY 1, 2
  UNION ALL
  SELECT hcp_id, therapeutic_area_id, 'community',
         min(rank) FILTER (WHERE scope_type = 'region' AND scope_value = 'US'),
         min(rank) FILTER (WHERE scope_type = 'global'),
         max(normalized_score)
  FROM public.hcp_community_ranks_v2
  GROUP BY 1, 2
)
SELECT
  p.reference_institution_id,
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
FROM public.institution_primary_links_v1 p
JOIN cohort_members m ON m.hcp_id = p.hcp_id
JOIN public.hcps_v2 h ON h.id = p.hcp_id;

GRANT SELECT ON public.institution_primary_links_v1 TO anon, authenticated;
GRANT SELECT ON public.institution_ta_roster_v1     TO anon, authenticated;
GRANT SELECT ON public.institution_primary_links_v1 TO service_role;
GRANT SELECT ON public.institution_ta_roster_v1     TO service_role;

NOTIFY pgrst, 'reload schema';
