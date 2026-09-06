/* ==== 19. FINAL CONSTRAINT STATE ====
   Read-only. Two rows, both convalidated true:

     institution_state_has_a_source
     nppes_state_has_nppes_provenance

   nppes_state_implies_npi must be GONE. If it is still listed, 18 did not
   apply and nothing after it should be trusted. */

SELECT con.conname,
       con.convalidated,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'hcps_v2'
  AND con.contype = 'c'
  AND con.conname IN ('nppes_state_implies_npi',
                      'nppes_state_has_nppes_provenance',
                      'institution_state_has_a_source')
ORDER BY con.conname;
