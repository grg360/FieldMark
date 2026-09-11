/* ==== 24. GRANT SNAPSHOT, BEFORE ====
   Read-only. Run this FIRST and keep the output. 29_grant_check_AFTER.sql asks
   the same question after the build and the two are compared row for row.

   WHY THIS EXISTS AS ITS OWN STEP. Grants do not survive a DROP. Every object
   in blocks 25-28 is dropped and recreated, and PostgREST reaches all of them
   as anon or authenticated. A grant that is not restored does not raise an
   error in the application -- get_community_filtered returns permission denied,
   the frontend swallows it, and the Community tab renders EMPTY. That is
   indistinguishable from "this TA has no members", which is the exact failure
   this whole build is trying to stop telling the truth badly about.

   PASS = 6 rows, every boolean true.

   The six are the objects that exist BEFORE the build. The new objects
   (community_board_v1, hcp_evidence_tier_v1, ta_evidence_tier_config) cannot
   appear here; they are checked in 29 only. */

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
  AND c.relname IN ('community_board_nsclc_v1', 'hcp_nsclc_evidence_tier_v1')
ORDER BY 1, 2, 3;

/* ==== BASELINE THE ORACLE IN THE SAME BREATH ====
   NSCLC is the regression oracle. Capture its numbers here, before anything is
   dropped, so 30_verify_counts.sql compares against a value read from this
   database rather than against a number quoted in a document.

   MEASURED 2026-09-07, live: 13,048 board rows, 4,915 qualifying.

   NOTE THE 4,915. CRC_COMMUNITY_BUILD.md phase 6 and the community gate header
   in sql/community_qualification_gate.sql both say the NSCLC board is 4,913.
   It is 4,915 today, before this build touches anything. The board is a view
   over hcp_community_scores_v2 and hcp_part_d_oncology_v1; either can move
   under it without anyone editing SQL, and one of them has. The oracle for this
   build is therefore "whatever this query returns now", captured here -- not
   the literal 4,913. Do not "fix" a 4,915 in step 30 by editing it to 4,913. */

SELECT 'nsclc_board_baseline' AS metric,
       count(*)                          AS board_rows,
       count(*) FILTER (WHERE qualifies) AS qualifying_members
FROM public.community_board_nsclc_v1;

SELECT coalesce(evidence_tier, '(null)')  AS evidence_tier,
       count(*)                           AS board_rows,
       count(*) FILTER (WHERE qualifies)  AS qualifying_members
FROM public.community_board_nsclc_v1
GROUP BY 1
ORDER BY 1;
