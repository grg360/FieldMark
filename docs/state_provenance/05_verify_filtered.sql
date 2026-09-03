/* ==== S2c. VERIFY S2b, READ THE OUTPUT ====
   Seven rows. Every one must show has_institution_state and has_state_basis true, and an acl
   naming anon, authenticated and service_role. A missing grant here is silent at the database
   and total at the surface. */

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       (pg_get_function_result(p.oid) ~ 'institution_state text') AS has_institution_state,
       (pg_get_function_result(p.oid) ~ 'state_basis text')       AS has_state_basis,
       coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proretset
  AND p.proname IN ('get_community_filtered', 'get_established_filtered',
                    'get_rising_composite_filtered', 'get_rising_star_filtered')
ORDER BY p.proname, args;
