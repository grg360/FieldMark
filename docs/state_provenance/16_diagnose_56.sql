/* ==== 16. WHO ARE THE 56? ====
   Read-only. Block 13 could not reach 54 rows because S1 had already nulled
   the institution_state it matches on. This shows what is left and whether
   any NPPES corroborator supports it.

   Expect 56 rows. The 2 with a corroborator are the genuine ones and must be
   left alone. The rest should be non-US codes with no corroborator. */

SELECT nppes_practice_state AS state,
       count(*)                                                      AS rows,
       count(nppes_enriched_at)                                      AS has_enriched_at,
       count(nppes_practice_zip)                                     AS has_zip,
       count(npi_taxonomy)                                           AS has_taxonomy,
       count(npi_specialty)                                          AS has_specialty,
       count(nppes_practice_setting)                                 AS has_setting,
       count(npi_source)                                             AS has_source,
       (nppes_practice_state IN ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
         'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
         'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA',
         'WA','WV','WI','WY','DC','PR','VI','GU','AS','MP'))         AS is_us_code
FROM public.hcps_v2
WHERE nppes_practice_state IS NOT NULL
  AND npi_number IS NULL
GROUP BY nppes_practice_state
ORDER BY is_us_code DESC, rows DESC, state;
