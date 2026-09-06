/* ==== 17. THE 54 BLOCK 13 COULD NOT REACH ====
   Block 13 matches on institution_state = nppes_practice_state. S1 had already
   nulled institution_state for the 54 non-US artifacts, so those rows fell
   outside block 13's WHERE and kept their values. This finishes them.

   Verified by 16 before writing this: all 54 carry ZERO of the six NPPES
   corroborators (nppes_enriched_at, nppes_practice_zip, npi_taxonomy,
   npi_specialty, nppes_practice_setting, npi_source). The two genuine rows
   (MA, PA) carry five of six each and are US codes, so the US-code test below
   excludes them without needing to name them.

   Thirteen codes, 54 rows: ON 9, ABC 8, SAR 8, BG 6, CH 4, CV 4, KP 4, BC 3,
   ERN 2, QLD 2, TS 2, AP 1, KSA 1.

   Expect 54 rows. */

UPDATE public.hcps_v2
SET nppes_practice_state = NULL
WHERE nppes_practice_state IS NOT NULL
  AND npi_number IS NULL
  AND nppes_practice_state NOT IN ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
    'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
    'WI','WY','DC','PR','VI','GU','AS','MP');
