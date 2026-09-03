/* ==== S5. VERIFY S1 TO S4, AND READ THE OUTPUT ====
   artifacts_left must be 0.
   board_signature and rising_signature must each end in ', boolean'.
   roster_has_state must be false.
   institution_state_total must be 14,622 (14,676 less the 54 from S1). */

SELECT
  (SELECT count(*) FROM public.hcps_v2
     WHERE institution_state IS NOT NULL
       AND institution_state NOT IN ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
         'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
         'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
         'WI','WY','DC','PR','VI','GU','AS','MP'))                          AS artifacts_left,
  (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'board_established')          AS board_signature,
  (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'board_rising')               AS rising_signature,
  (SELECT pg_get_viewdef('institution_ta_roster_v1'::regclass, true) ~ 'nppes_practice_state')
                                                                            AS roster_has_state,
  (SELECT count(*) FROM public.hcps_v2 WHERE institution_state IS NOT NULL)  AS institution_state_total;
