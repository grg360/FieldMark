/* ==== 15. SUPERSEDED BY 18 -- DO NOT RUN ====
   This validates nppes_state_implies_npi, which cannot pass: the 2 genuine
   NPPES rows have a state and no NPI, which is exactly what makes them the 2.
   18 replaces the constraint with the rule that is actually true and validates
   on creation. Kept only so the run log makes sense.

ALTER TABLE public.hcps_v2 VALIDATE CONSTRAINT nppes_state_implies_npi;
