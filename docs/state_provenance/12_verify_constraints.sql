/* ==== S8. VERIFY THE CONSTRAINTS ====
   Both must appear. nppes_state_implies_npi must show convalidated = false, which is what
   records that the two rows above are exceptions rather than that the constraint is inactive.
   institution_state_has_a_source must show convalidated = true. */

SELECT con.conname, con.convalidated, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'hcps_v2'
  AND con.conname IN ('nppes_state_implies_npi', 'institution_state_has_a_source')
ORDER BY con.conname;
