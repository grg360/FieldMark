/* ==== S0. GRANT SNAPSHOT, RUN BEFORE S2 AND AGAIN AFTER S4 ====

   COUNT THE ROWS. This must return 18: seventeen functions and one view.

   DROPPED AND RECREATED BY THIS FILE, so every one of these loses its ACL and has it
   re-granted. These are what the after-run is checking:

     board_established                       1   S2
     board_rising                            1   S2
     get_community_filtered                  2   S2b  (6-arg impl, 7-arg wrapper)
     get_established_filtered                2   S2b
     get_rising_composite_filtered           2   S2b
     get_rising_star_filtered                1   S2b
     institution_ta_roster_v1                1   S4   (a view, so relacl not proacl)
                                            ==
                                            10 objects dropped

   NOT DROPPED, LISTED AS CONTROLS. If any of these changes between the two runs, something
   ran that is not in this file:

     merge_hcp_pair                          1   S3 replaces it in place, no drop
     get_community_filtered_count            2   scalar return, untouched by S2b
     get_established_filtered_count          2   scalar return, untouched
     get_rising_composite_filtered_count     2   scalar return, untouched
     get_rising_star_filtered_count          1   scalar return, untouched
                                            ==
                                             8 controls

   WHY THE _count FUNCTIONS ARE HERE AT ALL. They cannot take the new columns, because a
   column cannot be added to an integer, and their WHERE clause is unchanged. They are listed
   because they are the other half of every overload pair S2b touches: if a drop ever caught
   the wrong signature, this is where it shows.

   GRANTS DO NOT SURVIVE A DROP. PostgREST reaches all of these as anon/authenticated, so a
   missing grant is a permission error that renders as an EMPTY SURFACE rather than as a
   failure. A lost grant on get_established_filtered is an empty People feed that reads as a
   data problem.

   Every function row must show anon=X, authenticated=X, service_role=X; the view row must
   show r for the same three. The BEFORE run is the record of what to restore; the AFTER run
   is the proof nothing was lost. */

SELECT 'function' AS kind, p.proname AS object,
       pg_get_function_identity_arguments(p.oid) AS signature,
       coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('board_established', 'board_rising', 'merge_hcp_pair',
                    'get_community_filtered', 'get_community_filtered_count',
                    'get_established_filtered', 'get_established_filtered_count',
                    'get_rising_composite_filtered', 'get_rising_composite_filtered_count',
                    'get_rising_star_filtered', 'get_rising_star_filtered_count')
UNION ALL
SELECT 'view', c.relname, '',
       coalesce(array_to_string(c.relacl, ' | '), '(default: PUBLIC)')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'institution_ta_roster_v1'
ORDER BY 1, 2, 3;
