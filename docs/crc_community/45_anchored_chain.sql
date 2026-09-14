/* ==== 45. WHERE THE EVIDENCED PHYSICIANS STAND IN THE THREE-LINK CHAIN ====
   Read-only.

       hcp_cohort_classification_v2 (cohort='community', this TA)
           -> community_scoring.py writes a row (no country filter)
       hcp_community_scores_v2
           -> country='US' AND (patient_volume>0 OR Part D row)
       community_board_v1

   A physician with a verified colorectal Part B practice pattern reaches the
   board only by passing all three. This reports where each one currently stops.
   'classified' is the gate scoring reads; without it, a scoring run does not
   reach them and the board cannot either. */

WITH crc AS (
  SELECT x.hcp_id FROM public.hcp_therapeutic_areas_v2 x
  JOIN public.therapeutic_areas ta
    ON ta.id = x.therapeutic_area_id AND ta.slug = 'colorectal-cancer'
),
onc AS (
  SELECT h.id AS hcp_id
  FROM public.hcps_v2 h
  LEFT JOIN public.hcp_nppes_detail_v2 d ON d.hcp_id = h.id
  WHERE CASE
          WHEN d.nppes_taxonomies IS NULL
            THEN h.npi_taxonomy IN ('207RX0202X','207RH0000X','207RH0003X')
          ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(d.nppes_taxonomies) e
                        WHERE e ->> 'code' IN ('207RX0202X','207RH0000X','207RH0003X'))
        END
),
yr AS (
  SELECT d.hcp_id, d.program_year,
         bool_or(d.hcpcs_code IN ('J9035','Q5107','Q5118','Q5126','Q5129')) AS vegf,
         bool_or(d.hcpcs_code = 'J9263') AS oxaliplatin,
         bool_or(d.hcpcs_code = 'J9206') AS irinotecan,
         bool_or(d.hcpcs_code = 'J9190') AS fluorouracil
  FROM public.hcp_hcpcs_detail d
  JOIN crc ON crc.hcp_id = d.hcp_id
  GROUP BY d.hcp_id, d.program_year
),
flagged AS (
  SELECT yr.*, (onc.hcp_id IS NOT NULL) AS onc_taxonomy,
         (vegf AND oxaliplatin AND fluorouracil) AS anchor_a,
         (vegf AND irinotecan  AND fluorouracil) AS anchor_b,
         (oxaliplatin AND fluorouracil AND NOT vegf) AS supported_a,
         (irinotecan  AND fluorouracil AND NOT vegf) AS supported_b
  FROM yr LEFT JOIN onc ON onc.hcp_id = yr.hcp_id
),
evidenced AS (
  SELECT hcp_id, bool_or(anchor_a OR anchor_b) AS is_anchored
  FROM flagged
  WHERE onc_taxonomy AND (anchor_a OR anchor_b OR supported_a OR supported_b)
  GROUP BY hcp_id
),
ta AS (SELECT id FROM public.therapeutic_areas WHERE slug = 'colorectal-cancer'),
chain AS (
  SELECT e.hcp_id,
         e.is_anchored,
         upper(btrim(coalesce(h.country,''))) IN ('US','USA') AS us_any_spelling,
         upper(btrim(coalesce(h.country,''))) = 'US'          AS us_exact,
         EXISTS (SELECT 1 FROM public.hcp_cohort_classification_v2 k, ta
                  WHERE k.hcp_id = e.hcp_id
                    AND k.therapeutic_area_id = ta.id
                    AND k.cohort = 'community')               AS classified,
         EXISTS (SELECT 1 FROM public.hcp_community_scores_v2 c, ta
                  WHERE c.hcp_id = e.hcp_id
                    AND c.therapeutic_area_id = ta.id)        AS scored,
         EXISTS (SELECT 1 FROM public.hcp_part_d_oncology_v1 pd
                  WHERE pd.hcp_id = e.hcp_id)                 AS part_d
  FROM evidenced e
  JOIN public.hcps_v2 h ON h.id = e.hcp_id
)

SELECT CASE WHEN is_anchored THEN '1 anchored' ELSE '2 supported-only' END AS band,
       CASE
         WHEN NOT us_any_spelling                 THEN 'a. country is not US in any spelling'
         WHEN NOT classified                      THEN 'b. NOT classified community for CRC'
         WHEN NOT scored                          THEN 'c. classified, never scored'
         WHEN NOT us_exact                        THEN 'd. scored, but country spelled USA'
         WHEN NOT part_d                          THEN 'e. scored+US, fails qualifies (no Part D)'
         ELSE                                          'f. ON THE BOARD'
       END AS stops_at,
       count(*) AS hcps
FROM chain
GROUP BY 1, 2
ORDER BY 1, 2;
