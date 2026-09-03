/* ==== 13b. THE CLEAR, CITY ====
   Run immediately after 13. Expect roughly 2,436 rows.

   The community ledger's city chip goes blank for these rows. That is the
   correct outcome. It must not be back-filled from institution_city -- see
   the S1b decision note in the readers file. */

UPDATE public.hcps_v2
SET nppes_practice_city = NULL
WHERE institution_city IS NOT NULL
  AND institution_city = nppes_practice_city
  AND npi_number IS NULL;
