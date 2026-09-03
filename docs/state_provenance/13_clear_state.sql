/* ==== 13. THE CLEAR, STATE ====
   This is block 7 of docs/2026_09_02_state_provenance_separation.sql.
   RUN ONLY after 01-12 are done, the frontend has shipped, and both the
   Cohort Ledger and the People feed are confirmed loading with states visible.

   It empties the institution-derived values out of nppes_practice_state.
   After this, nppes_practice_state means one thing only: a state from NPPES.

   Expect roughly 14,676 rows. Rollback is block 9 of the separation file,
   which restores from the snapshot table. Do not drop that snapshot table. */

UPDATE public.hcps_v2
SET nppes_practice_state = NULL
WHERE institution_state IS NOT NULL
  AND institution_state = nppes_practice_state
  AND npi_number IS NULL;
