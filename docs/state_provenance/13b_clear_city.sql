/* ==== 13b. THE CLEAR, CITY ====
   Run immediately after 13. Expect roughly 2,436 rows.

   The community ledger's city chip goes blank for these rows. That is the
   correct outcome. It must not be back-filled from institution_city -- see
   the S1b decision note in the readers file.

   THE LAST PREDICATE IS A GUARD, ADDED 2026-09-03 AFTER THIS BLOCK FAILED.
   nppes_state_implies_npi is a NOT VALID constraint: it does not police rows
   at rest, but Postgres re-checks it on any row this UPDATE touches. Touching
   a row that still holds a state with no NPI aborts the whole statement.
   Requiring nppes_practice_state IS NULL means this block can only touch rows
   block 13 (and 17) have already cleared, so it cannot trip the constraint.
   It also correctly skips the 2 genuine NPPES rows, whose state stays. */

UPDATE public.hcps_v2
SET nppes_practice_city = NULL
WHERE institution_city IS NOT NULL
  AND institution_city = nppes_practice_city
  AND npi_number IS NULL
  AND nppes_practice_state IS NULL;
