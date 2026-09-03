/* ==== 14. VERIFY THE CLEAR ====
   Read-only. The number that matters is state_without_npi.

   state_without_npi MUST BE 2. Those are the two genuine NPPES states that
   arrived without an NPI on file. Any other number means the clear did not do
   what it was supposed to. Stop and roll back rather than ship. */

SELECT
  (SELECT count(*) FROM public.hcps_v2
     WHERE nppes_practice_state IS NOT NULL
       AND npi_number IS NULL)                  AS state_without_npi,
  (SELECT count(*) FROM public.hcps_v2
     WHERE nppes_practice_state IS NOT NULL)    AS nppes_state_total,
  (SELECT count(*) FROM public.hcps_v2
     WHERE institution_state IS NOT NULL)       AS institution_state_total,
  (SELECT count(*) FROM public.hcps_v2
     WHERE nppes_practice_city IS NOT NULL
       AND npi_number IS NULL)                  AS city_without_npi;
