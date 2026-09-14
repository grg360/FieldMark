/* ==== 42. WHAT STANDS BETWEEN THE 506 AND THE BOARD ====
   Read-only. No writes, no DDL.

   The community board (blocks 25-28) admits an HCP through TWO gates:
     1. a colorectal row in hcp_community_scores_v2, US
     2. qualifies = patient_volume > 0 OR any hcp_part_d_oncology_v1 row

   The evidence measurement (blocks 40-41) admits an HCP through THREE:
     1. a colorectal link in hcp_therapeutic_areas_v2
     2. a Part B claims pattern in hcp_hcpcs_detail
     3. the Med Onc / Heme-Onc taxonomy gate

   These share almost nothing. Part B infusion billing and Part D oral
   prescribing are different behaviours by different providers, and the scores
   table is a third population again. This file measures the overlap instead of
   assuming it. */

WITH crc AS (
  SELECT x.hcp_id
  FROM public.hcp_therapeutic_areas_v2 x
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
anchored AS (
  SELECT DISTINCT hcp_id FROM flagged WHERE onc_taxonomy AND (anchor_a OR anchor_b)
),
supported AS (
  SELECT DISTINCT f.hcp_id FROM flagged f
  WHERE f.onc_taxonomy AND (f.supported_a OR f.supported_b)
    AND f.hcp_id NOT IN (SELECT hcp_id FROM anchored)
),
scored AS (
  SELECT c.hcp_id
  FROM public.hcp_community_scores_v2 c
  JOIN public.therapeutic_areas ta
    ON ta.id = c.therapeutic_area_id AND ta.slug = 'colorectal-cancer'
),
us AS (SELECT id AS hcp_id FROM public.hcps_v2 WHERE country = 'US'),
partd AS (SELECT DISTINCT hcp_id FROM public.hcp_part_d_oncology_v1),
board AS (
  SELECT s.hcp_id FROM scored s
  JOIN us ON us.hcp_id = s.hcp_id
  JOIN partd p ON p.hcp_id = s.hcp_id
)

SELECT 1 AS ord, 'board today (blocks 25-28)'                       AS population, count(*) AS hcps FROM board
UNION ALL SELECT 2, 'anchored, gated (block 41)',                   count(*) FROM anchored
UNION ALL SELECT 3, 'anchored AND US',                              count(*) FROM anchored a JOIN us ON us.hcp_id = a.hcp_id
UNION ALL SELECT 4, 'anchored AND US AND already on the board',      count(*) FROM anchored a JOIN board b ON b.hcp_id = a.hcp_id
UNION ALL SELECT 5, 'anchored AND US AND scored, not on board',     count(*) FROM anchored a JOIN us ON us.hcp_id = a.hcp_id JOIN scored s ON s.hcp_id = a.hcp_id WHERE a.hcp_id NOT IN (SELECT hcp_id FROM board)
UNION ALL SELECT 6, 'anchored AND US, NEVER SCORED',                count(*) FROM anchored a JOIN us ON us.hcp_id = a.hcp_id WHERE a.hcp_id NOT IN (SELECT hcp_id FROM scored)
UNION ALL SELECT 7, 'supported-only, gated',                        count(*) FROM supported
UNION ALL SELECT 8, 'supported-only AND US, NEVER SCORED',          count(*) FROM supported s2 JOIN us ON us.hcp_id = s2.hcp_id WHERE s2.hcp_id NOT IN (SELECT hcp_id FROM scored)
UNION ALL SELECT 9, 'UNION: board today + anchored US + supported US', count(*) FROM (
  SELECT hcp_id FROM board
  UNION SELECT a.hcp_id FROM anchored a JOIN us ON us.hcp_id = a.hcp_id
  UNION SELECT s2.hcp_id FROM supported s2 JOIN us ON us.hcp_id = s2.hcp_id
) u
ORDER BY 1;
