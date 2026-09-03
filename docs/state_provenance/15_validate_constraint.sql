/* ==== 15. VALIDATE THE NPI CONSTRAINT ====
   Run only after 14 confirms state_without_npi = 2.

   nppes_state_implies_npi was added NOT VALID because 14,678 rows violated it
   at the time. It has guarded new writes since. Once the clear has removed
   those rows, this proves it against the whole table and closes the loop.

   It takes a SHARE UPDATE EXCLUSIVE lock, not an ACCESS EXCLUSIVE one, so
   reads and writes continue while it runs.

   If this errors, the clear did not fully do its job. Do not force it. */

ALTER TABLE public.hcps_v2 VALIDATE CONSTRAINT nppes_state_implies_npi;
