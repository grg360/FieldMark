/* ==== 08. GRANT CHECK, AFTER ====
   Same question as 01, asked so the answer does not need eyeballing against a
   screenshot. Postgres is asked directly whether each role can reach each
   object, and answers in booleans.

   PASS = 18 rows, and every one of the three boolean columns true on all 18.

   Any false is a grant that did not survive a DROP. PostgREST reaches these as
   anon/authenticated, so a missing grant is not an error in the app -- it is an
   EMPTY SURFACE. A lost grant on get_established_filtered is an empty People
   feed that reads as a data problem. Send me the output if anything is false. */

SELECT 'function' AS kind,
       p.proname   AS object,
       pg_get_function_identity_arguments(p.oid) AS signature,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('board_established', 'board_rising', 'merge_hcp_pair',
                    'get_community_filtered', 'get_community_filtered_count',
                    'get_established_filtered', 'get_established_filtered_count',
                    'get_rising_composite_filtered', 'get_rising_composite_filtered_count',
                    'get_rising_star_filtered', 'get_rising_star_filtered_count')
UNION ALL
SELECT 'view',
       c.relname,
       '',
       has_table_privilege('anon',          c.oid, 'SELECT'),
       has_table_privilege('authenticated', c.oid, 'SELECT'),
       has_table_privilege('service_role',  c.oid, 'SELECT')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'institution_ta_roster_v1'
ORDER BY 1, 2, 3;
