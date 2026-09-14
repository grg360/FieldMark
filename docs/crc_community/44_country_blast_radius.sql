/* ==== 44. COUNTRY SPELLING -- BLAST RADIUS BEFORE ANY NORMALISATION ====
   Read-only. Bucketed: every non-US value collapses to one row, so this stays
   readable regardless of how many countries the table holds. */

WITH tagged AS (
  SELECT h.id,
         h.country,
         CASE
           WHEN h.country IS NULL                                   THEN '(null)'
           WHEN btrim(h.country) = ''                               THEN '(empty)'
           WHEN upper(btrim(h.country)) IN
                ('US','USA','U.S.','U.S.A.','UNITED STATES',
                 'UNITED STATES OF AMERICA')                        THEN upper(btrim(h.country))
           ELSE '(other, non-US)'
         END AS spelling
  FROM public.hcps_v2 h
)

SELECT 'A. us-spellings across hcps_v2' AS section,
       spelling                          AS value,
       ''                                AS ta,
       count(*)                          AS hcps
FROM tagged
GROUP BY 1, 2, 3

UNION ALL

SELECT 'B. scored rows, boarded TAs only',
       t.spelling,
       ta.slug,
       count(*)
FROM public.hcp_community_scores_v2 c
JOIN tagged t ON t.id = c.hcp_id
JOIN public.therapeutic_areas ta ON ta.id = c.therapeutic_area_id
WHERE ta.slug IN ('nsclc', 'colorectal-cancer')
GROUP BY 1, 2, 3

UNION ALL

SELECT 'C. nsclc rows that would JOIN the board',
       t.spelling,
       'nsclc',
       count(*) FILTER (
         WHERE c.patient_volume > 0
            OR EXISTS (SELECT 1 FROM public.hcp_part_d_oncology_v1 pd WHERE pd.hcp_id = c.hcp_id)
       )
FROM public.hcp_community_scores_v2 c
JOIN tagged t ON t.id = c.hcp_id
JOIN public.therapeutic_areas ta ON ta.id = c.therapeutic_area_id AND ta.slug = 'nsclc'
WHERE t.spelling <> 'US'
GROUP BY 1, 2, 3

ORDER BY 1, 4 DESC, 2, 3;
