-- hcp_nsclc_evidence_tier_v1 -> resolve the TA by SLUG, 2026-08-15.
--
-- WHY. The TA rename (4849c27, 12:40 today) changed therapeutic_areas.name from
-- 'NSCLC' to 'Lung Cancer'. The companion migration 2026_08_15_ta_resolve_by_slug
-- repointed TEN FUNCTIONS to resolve by slug, but this object is a VIEW, so it was
-- not in that sweep — it kept `name = 'NSCLC'` and silently began returning ZERO
-- rows. Nothing errored at the view; the failure surfaced two joins downstream:
--   view empty -> community_board_nsclc_v1.evidence_tier NULL on all 12,970 rows
--   -> community_ledger's json_object_agg(evidence_tier, cnt) gets a NULL KEY
--   -> SQLSTATE 22004 "null value not allowed for object key" -> RPC 400s
--   -> the Community ledger renders "could not be loaded" and 0 OF 0 HCP.
-- Established and Rising were unaffected: neither reads this view.
--
-- The slug 'nsclc' is the stable key and is explicitly NOT changing (see the
-- header of 2026_08_15_ta_resolve_by_slug.sql). Resolving by slug is what the ten
-- RPCs already do; this brings the view into line with them.
--
-- Revert: sql/revert/2026_08_15_evidence_tier_slug_REVERT.sql (restores the broken
-- name-keyed definition verbatim).

CREATE OR REPLACE VIEW public.hcp_nsclc_evidence_tier_v1 AS
WITH ta AS (
         SELECT therapeutic_areas.id
           FROM therapeutic_areas
          WHERE therapeutic_areas.slug = 'nsclc'::text
        ), params AS (
         SELECT 24::numeric AS oral_floor
        ), cohort AS (
         SELECT c.hcp_id,
            h.npi_number AS npi
           FROM hcp_community_scores_v2 c
             JOIN hcps_v2 h ON h.id = c.hcp_id
             CROSS JOIN ta
          WHERE c.therapeutic_area_id = ta.id AND h.country = 'US'::text
        ), pd AS (
         SELECT hcp_part_d_oncology_v1.hcp_id,
            count(*) AS pd_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS strict_rows,
            count(DISTINCT hcp_part_d_oncology_v1.program_year) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS years_anchored,
            array_agg(DISTINCT hcp_part_d_oncology_v1.program_year ORDER BY hcp_part_d_oncology_v1.program_year) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS anchor_years,
            array_agg(DISTINCT hcp_part_d_oncology_v1.drug_stem ORDER BY hcp_part_d_oncology_v1.drug_stem) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS anchor_stems,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'dominant'::text) AS dominant_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'cross_indication'::text) AS cross_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'supporting'::text) AS supporting_grade_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS lung_rows
           FROM hcp_part_d_oncology_v1
          GROUP BY hcp_part_d_oncology_v1.hcp_id
        ), pb AS (
         SELECT hcp_hcpcs_detail.hcp_id,
            bool_or(hcp_hcpcs_detail.hcpcs_code = ANY (ARRAY['J9305'::text, 'J9304'::text])) AS has_pemetrexed,
            bool_or(hcp_hcpcs_detail.hcpcs_code = 'J9173'::text) AS has_durvalumab,
            bool_or(hcp_hcpcs_detail.hcpcs_drug_indicator = 'Y'::text) AS has_any_partb_drug
           FROM hcp_hcpcs_detail
          GROUP BY hcp_hcpcs_detail.hcp_id
        ), pd_year AS (
         SELECT hcp_part_d_oncology_v1.hcp_id,
            hcp_part_d_oncology_v1.program_year,
            sum(hcp_part_d_oncology_v1.tot_30day_fills) AS total_fills,
            sum(hcp_part_d_oncology_v1.tot_30day_fills) FILTER (WHERE hcp_part_d_oncology_v1.drug_group = 'heme'::text) AS heme_fills,
            sum(hcp_part_d_oncology_v1.tot_30day_fills) FILTER (WHERE hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS lung_fills
           FROM hcp_part_d_oncology_v1
          GROUP BY hcp_part_d_oncology_v1.hcp_id, hcp_part_d_oncology_v1.program_year
        ), heme_flag AS (
         SELECT pd_year.hcp_id,
            bool_or(pd_year.total_fills >= (( SELECT params.oral_floor
                   FROM params)) AND pd_year.heme_fills > (0.70 * pd_year.total_fills)) AS heme_dominant_year
           FROM pd_year
          GROUP BY pd_year.hcp_id
        ), recent_oral AS (
         SELECT DISTINCT ON (pd_year.hcp_id) pd_year.hcp_id,
            pd_year.program_year AS oral_recent_year,
            pd_year.total_fills AS oral_denominator,
                CASE
                    WHEN pd_year.total_fills > 0::numeric THEN COALESCE(pd_year.lung_fills, 0::numeric) / pd_year.total_fills
                    ELSE NULL::numeric
                END AS lung_share
           FROM pd_year
          WHERE pd_year.total_fills IS NOT NULL
          ORDER BY pd_year.hcp_id, pd_year.program_year DESC
        ), anchor AS (
         SELECT DISTINCT ON (hcp_part_d_oncology_v1.hcp_id) hcp_part_d_oncology_v1.hcp_id,
            hcp_part_d_oncology_v1.drug_stem AS anchor_stem
           FROM hcp_part_d_oncology_v1
          WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text
          GROUP BY hcp_part_d_oncology_v1.hcp_id, hcp_part_d_oncology_v1.drug_stem
          ORDER BY hcp_part_d_oncology_v1.hcp_id, (count(DISTINCT hcp_part_d_oncology_v1.program_year)) DESC, hcp_part_d_oncology_v1.drug_stem
        )
 SELECT co.hcp_id,
    co.npi,
    t.tier,
        CASE
            WHEN t.tier = 'anchored'::text THEN COALESCE(pd.years_anchored, 0::bigint)
            ELSE NULL::bigint
        END AS years_anchored,
        CASE
            WHEN t.tier = 'anchored'::text THEN
            CASE
                WHEN COALESCE(pd.years_anchored, 0::bigint) >= 2 THEN 'recurs'::text
                ELSE 'single_year'::text
            END
            ELSE NULL::text
        END AS recurrence_band,
        CASE
            WHEN t.tier = 'anchored'::text THEN a.anchor_stem
            ELSE NULL::text
        END AS anchor_stem,
        CASE
            WHEN t.tier = 'anchored'::text THEN pd.anchor_stems
            ELSE NULL::text[]
        END AS anchor_stems,
        CASE
            WHEN t.tier = 'anchored'::text THEN pd.anchor_years
            ELSE NULL::integer[]
        END AS anchor_years,
        CASE
            WHEN t.tier = 'supported'::text THEN t.supported_rank
            ELSE NULL::integer
        END AS supported_evidence_rank,
        CASE
            WHEN t.tier = 'supported'::text THEN (ARRAY['pemetrexed (Part B)'::text, 'durvalumab, thoracic-enriched (Part B)'::text, 'lung-dominant oral'::text, 'cross-indication targeted oral'::text, 'cross-indication targeted therapy observed'::text])[t.supported_rank]
            ELSE NULL::text
        END AS supported_evidence,
    ro.lung_share,
    ro.oral_denominator,
    ro.oral_recent_year,
    COALESCE(ro.lung_share >= 0.30 AND ro.oral_denominator >= (( SELECT params.oral_floor
           FROM params)), false) AS lung_weighted
   FROM cohort co
     LEFT JOIN pd ON pd.hcp_id = co.hcp_id
     LEFT JOIN pb ON pb.hcp_id = co.hcp_id
     LEFT JOIN heme_flag hf ON hf.hcp_id = co.hcp_id
     LEFT JOIN recent_oral ro ON ro.hcp_id = co.hcp_id
     LEFT JOIN anchor a ON a.hcp_id = co.hcp_id
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN COALESCE(pd.strict_rows, 0::bigint) > 0 THEN 'anchored'::text
                    WHEN COALESCE(pb.has_pemetrexed, false) OR COALESCE(pb.has_durvalumab, false) OR (COALESCE(pd.dominant_rows, 0::bigint) + COALESCE(pd.cross_rows, 0::bigint) + COALESCE(pd.supporting_grade_rows, 0::bigint)) > 0 THEN 'supported'::text
                    WHEN COALESCE(hf.heme_dominant_year, false) AND COALESCE(pd.lung_rows, 0::bigint) = 0 THEN 'heme_dominant'::text
                    WHEN COALESCE(pd.pd_rows, 0::bigint) > 0 OR COALESCE(pb.has_any_partb_drug, false) THEN 'candidate'::text
                    ELSE 'unresolved'::text
                END AS tier,
                CASE
                    WHEN COALESCE(pb.has_pemetrexed, false) THEN 1
                    WHEN COALESCE(pb.has_durvalumab, false) THEN 2
                    WHEN COALESCE(pd.dominant_rows, 0::bigint) > 0 THEN 3
                    WHEN COALESCE(pd.cross_rows, 0::bigint) > 0 THEN 4
                    WHEN COALESCE(pd.supporting_grade_rows, 0::bigint) > 0 THEN 5
                    ELSE NULL::integer
                END AS supported_rank) t;

GRANT SELECT ON public.hcp_nsclc_evidence_tier_v1 TO anon;
GRANT SELECT ON public.hcp_nsclc_evidence_tier_v1 TO authenticated;
GRANT SELECT ON public.hcp_nsclc_evidence_tier_v1 TO service_role;
