/* ==== 43. WHAT country SAYS ABOUT PHYSICIANS WITH US MEDICARE CLAIMS ====
   Read-only. Single statement -- a WITH block binds to one statement only.

   Every hcp_id below has at least one hcp_hcpcs_detail row. That table is the
   CMS Physician & Other Practitioners file -- Medicare Part B. A provider
   cannot appear in it without being a US Medicare-enrolled practitioner.

   So for this population, country is not an open question with a missing
   answer. The claims ARE the answer, and any value other than US is either
   stale, inherited from an institution string, or never resolved.

   Section A separates NULL from a populated wrong value; those need different
   repairs and conflating them is how the 17 Wuhan/Harbin writes happened.
   Section B shows what institution the non-US rows carry. */

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
evidenced AS (
  SELECT hcp_id,
         bool_or(anchor_a OR anchor_b) AS is_anchored
  FROM flagged
  WHERE onc_taxonomy AND (anchor_a OR anchor_b OR supported_a OR supported_b)
  GROUP BY hcp_id
),
ev AS (
  SELECT e.hcp_id, e.is_anchored, h.country, h.institution_normalized, h.npi_number
  FROM evidenced e JOIN public.hcps_v2 h ON h.id = e.hcp_id
)

SELECT 'A. country'                                      AS section,
       CASE WHEN is_anchored THEN 'anchored' ELSE 'supported-only' END AS key1,
       coalesce(country, '(null)')                       AS key2,
       count(*)                                          AS hcps,
       count(*) FILTER (WHERE npi_number IS NOT NULL)    AS with_npi
FROM ev
GROUP BY 1, 2, 3

UNION ALL

SELECT 'B. non-US institutions',
       coalesce(country, '(null)'),
       coalesce(institution_normalized, '(none)'),
       count(*),
       count(*) FILTER (WHERE npi_number IS NOT NULL)
FROM ev
WHERE country IS DISTINCT FROM 'US'
GROUP BY 1, 2, 3

ORDER BY 1, 4 DESC, 2, 3;
