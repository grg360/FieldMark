-- NSCLC evidence-tier resolution. Assigns every US community NSCLC-cohort HCP to
-- exactly ONE tier, first-match-wins, plus the display attributes the ledger and
-- the profile evidence line need. Reasoning: docs/design/NSCLC_COHORT_EVIDENCE_TIERS.md.
--
-- A VIEW, deliberately (not materialised): measured 35 ms full-cohort (6,480 rows)
-- and 0.36 ms for a single hcp_id, the latter via index-only scans because the
-- hcp_id predicate pushes through the GROUP BY into the PK indexes. Cheap for both
-- the full-cohort ledger scan and the per-profile single-hcp lookup.
--
-- TIER ORDER (first match wins): anchored -> supported -> heme_dominant ->
-- candidate -> unresolved. Anchoring is anchor_grade='strict' resolved PER
-- program_year in hcp_part_d_oncology_v1 (never a drug-level flag): a stem strict
-- in 2023 and cross_indication in 2024 anchors 2023 only.
--
-- ORAL-MIX DENOMINATOR FLOOR (params.oral_floor — one line to change): both the
-- heme_dominant classification and the lung_weighted flag require the year being
-- evaluated to hold at least this many oral-oncology 30-day fills. A share off a
-- denominator of one or two fills is a small-base artifact, not a practice pattern.
-- Applied as a REQUIREMENT, not a post-filter: below the floor the mix is not
-- computable, so the HCP falls through to whatever tier it would otherwise receive.
-- It matters most for heme_dominant, which is an EXCLUSION — a false positive would
-- hide a physician from the default ledger on the strength of a single fill, an
-- asymmetric cost. 24 ~= two patient-years of a monthly oral.

CREATE OR REPLACE VIEW public.hcp_nsclc_evidence_tier_v1 AS
WITH ta AS (SELECT id FROM therapeutic_areas WHERE name = 'NSCLC'),
params AS (SELECT 24::numeric AS oral_floor),  -- min oral-oncology 30-day fills in the year evaluated; raise here
cohort AS (
  SELECT c.hcp_id, h.npi_number AS npi
  FROM hcp_community_scores_v2 c
  JOIN hcps_v2 h ON h.id = c.hcp_id
  CROSS JOIN ta
  WHERE c.therapeutic_area_id = ta.id AND h.country = 'US'
),
pd AS (  -- Part D oral oncology, grade already resolved per program_year in the table
  SELECT hcp_id,
    count(*)                                                     AS pd_rows,
    count(*) FILTER (WHERE anchor_grade = 'strict')              AS strict_rows,
    count(DISTINCT program_year) FILTER (WHERE anchor_grade = 'strict') AS years_anchored,
    count(*) FILTER (WHERE anchor_grade = 'dominant')            AS dominant_rows,
    count(*) FILTER (WHERE anchor_grade = 'cross_indication')    AS cross_rows,
    count(*) FILTER (WHERE anchor_grade = 'supporting')          AS supporting_grade_rows,
    count(*) FILTER (WHERE drug_group = 'lung')                  AS lung_rows
  FROM hcp_part_d_oncology_v1
  GROUP BY hcp_id
),
pb AS (  -- Part B administered drugs
  SELECT hcp_id,
    bool_or(hcpcs_code IN ('J9305','J9304')) AS has_pemetrexed,
    bool_or(hcpcs_code = 'J9173')            AS has_durvalumab,
    bool_or(hcpcs_drug_indicator = 'Y')      AS has_any_partb_drug
  FROM hcp_hcpcs_detail
  GROUP BY hcp_id
),
pd_year AS (  -- per-year oral-mix fills
  SELECT hcp_id, program_year,
    sum(tot_30day_fills)                                  AS total_fills,
    sum(tot_30day_fills) FILTER (WHERE drug_group='heme') AS heme_fills,
    sum(tot_30day_fills) FILTER (WHERE drug_group='lung') AS lung_fills
  FROM hcp_part_d_oncology_v1
  GROUP BY hcp_id, program_year
),
heme_flag AS (  -- heme > 70% of oral fills in a year holding at least params.oral_floor fills
  SELECT hcp_id, bool_or(total_fills >= (SELECT oral_floor FROM params)
                         AND heme_fills > 0.70 * total_fills) AS heme_dominant_year
  FROM pd_year GROUP BY hcp_id
),
recent_oral AS (  -- lung_share in the most recent year with any oral oncology row
  SELECT DISTINCT ON (hcp_id) hcp_id,
    program_year AS oral_recent_year,
    total_fills  AS oral_denominator,
    CASE WHEN total_fills > 0 THEN coalesce(lung_fills, 0) / total_fills END AS lung_share
  FROM pd_year
  WHERE total_fills IS NOT NULL
  ORDER BY hcp_id, program_year DESC
)
SELECT
  co.hcp_id,
  co.npi,
  t.tier,
  -- anchored attributes (NULL for other tiers)
  CASE WHEN t.tier = 'anchored' THEN coalesce(pd.years_anchored, 0) END AS years_anchored,
  CASE WHEN t.tier = 'anchored'
       THEN CASE WHEN coalesce(pd.years_anchored, 0) >= 2 THEN 'recurs' ELSE 'single_year' END
  END AS recurrence_band,
  -- supported evidence (NULL for other tiers); rank 1 strongest .. 5 weakest
  CASE WHEN t.tier = 'supported' THEN t.supported_rank END AS supported_evidence_rank,
  CASE WHEN t.tier = 'supported' THEN (ARRAY[
      'pemetrexed (Part B)',
      'durvalumab, thoracic-enriched (Part B)',
      'lung-dominant oral',
      'cross-indication targeted oral',
      'cross-indication targeted therapy observed'  -- group 5: never "NSCLC prescribing observed"
    ])[t.supported_rank] END AS supported_evidence,
  -- oral-mix attributes (present whenever the HCP has any oral oncology row)
  ro.lung_share,
  ro.oral_denominator,
  ro.oral_recent_year,
  -- lung_weighted honours the same floor: a 30%+ share is only trusted on a base of
  -- at least params.oral_floor fills. lung_share / oral_denominator stay raw so a
  -- small-base share is still visible, just not flagged.
  coalesce(ro.lung_share >= 0.30 AND ro.oral_denominator >= (SELECT oral_floor FROM params), false) AS lung_weighted
FROM cohort co
LEFT JOIN pd        ON pd.hcp_id = co.hcp_id
LEFT JOIN pb        ON pb.hcp_id = co.hcp_id
LEFT JOIN heme_flag hf ON hf.hcp_id = co.hcp_id
LEFT JOIN recent_oral ro ON ro.hcp_id = co.hcp_id
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN coalesce(pd.strict_rows, 0) > 0 THEN 'anchored'
      WHEN coalesce(pb.has_pemetrexed, false)
        OR coalesce(pb.has_durvalumab, false)
        OR coalesce(pd.dominant_rows, 0) + coalesce(pd.cross_rows, 0) + coalesce(pd.supporting_grade_rows, 0) > 0
        THEN 'supported'
      WHEN coalesce(hf.heme_dominant_year, false) AND coalesce(pd.lung_rows, 0) = 0 THEN 'heme_dominant'
      WHEN coalesce(pd.pd_rows, 0) > 0 OR coalesce(pb.has_any_partb_drug, false) THEN 'candidate'
      ELSE 'unresolved'
    END AS tier,
    CASE  -- strongest supported evidence present (independent of tier; used only when tier='supported')
      WHEN coalesce(pb.has_pemetrexed, false) THEN 1
      WHEN coalesce(pb.has_durvalumab, false) THEN 2
      WHEN coalesce(pd.dominant_rows, 0) > 0 THEN 3
      WHEN coalesce(pd.cross_rows, 0) > 0 THEN 4
      WHEN coalesce(pd.supporting_grade_rows, 0) > 0 THEN 5
    END AS supported_rank
) t;

-- ---------------------------------------------------------------------------
-- Run these two as separate statements after the view exists.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.hcp_nsclc_evidence_tier_v1 TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
