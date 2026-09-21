/* ==== 05. VERIFY THE BOARDS ====
   READ-ONLY. Run after 04.

   TWO DIFFERENT NUMBERS LIVE IN THE PHRASE "THE BOARD", AND THIS CHANGE MOVES ONE OF
   THEM. Stating that up front because the step-6 expectation reads "13,048 / 4,915
   ... UNCHANGED" and only the second of those can hold.

     BOARD MEMBERS  = community_board_v1 rows WHERE qualifies. This is what the
                      Community tab renders and what 4,915 / 4,794 refer to. It MUST
                      NOT MOVE, and block 00 section B proved in advance that it
                      cannot: qualifies is `patient_volume > 0 OR EXISTS(part D row)`,
                      and not one of the 19,304 'USA' rows has a
                      hcp_part_d_oncology_v1 row in any TA.

     COHORT ROWS    = every community_board_v1 row, qualifying or not. 13,048 and
                      14,896 are these. community_board_v1 carries
                      `WHERE h.country = 'US'`, so normalising necessarily admits the
                      previously-excluded rows as NON-QUALIFYING members of the
                      cohort. nsclc +261, colorectal +19,043. Nothing renders these;
                      they are the denominator, not the board.

   The same split applies to the five-tier and four-tier distributions: the
   980/2,798/629/94/8,547 figure quoted in step 6 is a COHORT distribution summing to
   13,048, so it moves with the cohort. Its on-board counterpart --
   980/2,748/629/94/464, summing to 4,915 -- is the one that must not.

   Section A therefore checks board members and section B reports cohort rows as a
   measured delta rather than an expectation. A failure in A is a stop. A change in B
   is the arithmetic of the fix.

   BEFORE values are from a measurement taken 2026-09-15 immediately prior to 01. */

CREATE TEMP TABLE v05 AS
SELECT ta.slug, b.qualifies, b.evidence_tier
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id;
CREATE INDEX ON v05 (slug, qualifies);
ANALYZE v05;


/* ---- A. BOARD MEMBERS -- THE STOP ----
   EXPECT nsclc 4,915 and colorectal 4,794, both unchanged. */
SELECT 'A. board members' AS check,
       slug,
       count(*) FILTER (WHERE qualifies)                                   AS members_now,
       CASE slug WHEN 'nsclc' THEN 4915 WHEN 'colorectal-cancer' THEN 4794 END AS members_before,
       (count(*) FILTER (WHERE qualifies)
        = CASE slug WHEN 'nsclc' THEN 4915 WHEN 'colorectal-cancer' THEN 4794 END) AS unchanged
FROM v05
GROUP BY slug ORDER BY slug;

/* The on-board tier distributions, which are the ones a reader actually sees.
   EXPECT, both unchanged:
     nsclc       anchored 980 · candidate 2,748 · heme_dominant 629 · unresolved 464 · supported 94
     colorectal  candidate 4,474 · supported 199 · anchored 121 · unresolved 0 */
SELECT 'A2. on-board tiers' AS check,
       slug, evidence_tier,
       count(*) FILTER (WHERE qualifies) AS on_board_now,
       CASE slug || '/' || coalesce(evidence_tier, '(null)')
         WHEN 'nsclc/anchored' THEN 980 WHEN 'nsclc/candidate' THEN 2748
         WHEN 'nsclc/heme_dominant' THEN 629 WHEN 'nsclc/unresolved' THEN 464
         WHEN 'nsclc/supported' THEN 94
         WHEN 'colorectal-cancer/candidate' THEN 4474
         WHEN 'colorectal-cancer/supported' THEN 199
         WHEN 'colorectal-cancer/anchored' THEN 121
         WHEN 'colorectal-cancer/unresolved' THEN 0
       END AS on_board_before
FROM v05
GROUP BY slug, evidence_tier
ORDER BY slug, count(*) FILTER (WHERE qualifies) DESC;


/* ---- B. COHORT ROWS -- THE MEASURED DELTA ----
   EXPECT nsclc 13,048 -> 13,309 (+261) and colorectal 14,896 -> 33,939 (+19,043).
   These are the rows the country gate was excluding. They are all non-qualifying;
   section A is what proves that. */
SELECT 'B. cohort rows' AS check,
       slug,
       count(*)                                                                  AS cohort_now,
       CASE slug WHEN 'nsclc' THEN 13048 WHEN 'colorectal-cancer' THEN 14896 END AS cohort_before,
       count(*) - CASE slug WHEN 'nsclc' THEN 13048 WHEN 'colorectal-cancer' THEN 14896 END AS delta,
       CASE slug WHEN 'nsclc' THEN 261 WHEN 'colorectal-cancer' THEN 19043 END   AS expect_delta,
       count(*) FILTER (WHERE NOT qualifies)                                     AS non_qualifying_now
FROM v05
GROUP BY slug ORDER BY slug;


/* ---- C. THE 526, WHICH IS WHY THIS JOB WAS RAISED ----
   211 anchored and 315 supported colorectal physicians sat behind the country gate.
   They now have an hcp_evidence_tier_v1 row where they had none -- the tier model can
   finally see them. They are still NOT on the board, because qualifies reads Part D
   presence and patient_volume, and they have neither.

   EXPECT tiered_now 211 / 315, on_board_now 0 / 0. That second column is the finding,
   not a failure: the country gate was one of two gates in front of these people and
   this change opened the first.

   Restricted to the ids the snapshot recorded, which is exactly the population this
   change admitted. */
SELECT 'C. the 526 (snapshot ids)' AS check,
       b.evidence_tier,
       count(*)                              AS tiered_now,
       count(*) FILTER (WHERE b.qualifies)   AS on_board_now,
       CASE b.evidence_tier WHEN 'anchored' THEN 211 WHEN 'supported' THEN 315 END AS expect_tiered
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id AND ta.slug = 'colorectal-cancer'
JOIN public.hcps_v2_country_usa_snapshot_20260915 s ON s.id = b.hcp_id
GROUP BY b.evidence_tier
ORDER BY count(*) DESC;


/* ---- D. GRANTS ----
   Nothing here dropped or recreated an object, so nothing should have moved. Asked
   rather than assumed: a lost grant on any of these renders as an empty Community tab,
   which reads as "this TA has no members". EXPECT every boolean true.

   The snapshot table is deliberately absent from this list -- it is operational state
   and is granted to service_role only. */
SELECT 'D. grants' AS check,
       c.relname AS object,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated,
       has_table_privilege('service_role',  c.oid, 'SELECT') AS service_role
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('hcps_v2', 'community_board_v1', 'hcp_evidence_tier_v1',
                    'ta_evidence_tier_config', 'ta_hcpcs_codes')
ORDER BY c.relname;
