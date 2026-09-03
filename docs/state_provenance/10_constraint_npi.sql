/* ==== S6. THE INVARIANT, ENFORCED ====

   After block 7 the rule is: a populated nppes_practice_state implies an npi_number. Nothing
   enforces that today, which is exactly how 14,678 rows acquired a provenance they did not
   have. A comment is not enforcement, and the next producer will not read this file.

   NOT VALID, AND THAT IS THE RECOMMENDATION RATHER THAN A COMPROMISE. NOT VALID skips the
   scan of existing rows but IS ENFORCED ON EVERY INSERT AND UPDATE from the moment it is
   added, which is the whole requirement: no future producer can reintroduce this silently.

   TWO ROWS CANNOT SATISFY IT AND ARE GRANDFATHERED ON PURPOSE. Both carry real NPPES
   evidence (zip, taxonomy, specialty, nppes_enriched_at 2026-05-26) with no npi_number, and
   the NPI is UNRECOVERABLE: neither has a row in nppes_enrichment_log, npi_match_proposals or
   hcp_nppes_detail_v2, and neither has an NPI-bearing twin that would make it dedup residue.

     865eae68-5d72-474d-8434-1431d6a26715   Pasi Antero Janne    MA  02115      207RX0202X
     236b29a2-4403-447f-b86d-92278f265764   Kuchikula Reddy      PA  191045127  207RG0100X

   They are named here and in the completeness manifest because NOT VALID says exceptions
   exist without saying WHICH, and whoever runs VALIDATE CONSTRAINT one day should not have to
   rediscover them. Deleting or falsifying them to make a constraint pass would be worse than
   the constraint. */

ALTER TABLE public.hcps_v2
  ADD CONSTRAINT nppes_state_implies_npi
  CHECK (nppes_practice_state IS NULL OR npi_number IS NOT NULL) NOT VALID;
