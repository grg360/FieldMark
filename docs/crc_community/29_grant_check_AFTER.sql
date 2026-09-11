/* ==== 29. GRANT CHECK, AFTER ====
   Read-only. The same question block 24 asked, asked again after every drop and
   recreate, so the answer does not need eyeballing against a screenshot.
   Postgres is asked directly whether each role can reach each object and answers
   in booleans.

   PASS = 9 rows, and every one of the three boolean columns true on all 9.

   Block 24 returned 6 rows. The three new ones are community_board_v1,
   hcp_evidence_tier_v1 and ta_evidence_tier_config. Every one of the original 6
   was dropped and recreated somewhere in blocks 25 to 28.

   ANY FALSE IS A GRANT THAT DID NOT SURVIVE A DROP. PostgREST reaches these as
   anon and authenticated, so a missing grant is not an error in the app -- it is
   an EMPTY SURFACE. A lost grant on get_community_filtered renders as a
   Community tab with no members, which is exactly what a TA with no board looks
   like. On this build, on this week, that is the single most confusable failure
   available. Send me the output if anything is false.

   ONE PRE-EXISTING FALSE, EXPECTED, NOT CAUSED HERE: hcp_part_d_oncology_v1 has
   service_role = false today (measured 2026-09-07, before this build). It is not
   in the list below because nothing in blocks 25 to 28 drops it. Views are
   permission-checked against the VIEW OWNER rather than the caller, so
   community_board_v1 reads it without service_role needing the grant. Worth
   fixing separately; it is not this build's to fix and not this build's to hide. */

SELECT 'function' AS kind,
       p.proname   AS object,
       pg_get_function_identity_arguments(p.oid) AS signature,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_community_filtered', 'get_community_filtered_count')
UNION ALL
SELECT 'view',
       c.relname,
       '',
       has_table_privilege('anon',          c.oid, 'SELECT'),
       has_table_privilege('authenticated', c.oid, 'SELECT'),
       has_table_privilege('service_role',  c.oid, 'SELECT')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('community_board_nsclc_v1', 'community_board_v1',
                    'hcp_nsclc_evidence_tier_v1', 'hcp_evidence_tier_v1',
                    'ta_evidence_tier_config')
ORDER BY 1, 2, 3;
