/* ==== 18. THE CONSTRAINT, STATED CORRECTLY ====
   Supersedes 15, which cannot pass and should not be run again.

   nppes_state_implies_npi says: a state in nppes_practice_state implies an NPI.
   That is very nearly right and wrong at the edge. The 2 genuine NPPES rows
   (MA, PA) carry nppes_enriched_at, nppes_practice_zip, npi_taxonomy,
   npi_specialty and nppes_practice_setting -- five independent NPPES signals --
   but no npi_number, because the guarded write never landed. They are the most
   NPPES-sourced rows in the table and the old constraint calls them violations.

   THE ACTUAL INVARIANT: a value in nppes_practice_state must be backed by NPPES
   provenance. npi_number is the usual evidence. nppes_enriched_at is direct
   evidence of the enrichment run that produced the value. Either satisfies it;
   neither present means the value came from somewhere else and does not belong
   in this column.

   The name changes with the rule. A constraint whose name overstates what it
   checks is the same class of defect as a column whose name overstates what it
   holds -- which is the defect this whole repair exists to remove.

   No NOT VALID here. Every row satisfies this now, so it validates on creation
   and is enforced from this moment for every future write. */

ALTER TABLE public.hcps_v2
  DROP CONSTRAINT IF EXISTS nppes_state_implies_npi;

ALTER TABLE public.hcps_v2
  ADD CONSTRAINT nppes_state_has_nppes_provenance
  CHECK (nppes_practice_state IS NULL
         OR npi_number IS NOT NULL
         OR nppes_enriched_at IS NOT NULL);
