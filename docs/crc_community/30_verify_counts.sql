/* ==== 30. VERIFICATION ====
   Read-only. Every number here was derived from the live database on
   2026-09-07, BEFORE any of blocks 25 to 28 were applied, by running their
   predicates as plain SELECTs. If a number below comes back different, the
   build did something the design did not predict -- do not adjust the
   expectation to match the output.

   ---- 1. THE ORACLE ----
   nsclc must not move. Expect 13,048 board rows and 4,915 qualifying.

   4,915, NOT 4,913. CRC_COMMUNITY_BUILD.md phase 6 says the NSCLC board must
   still return 4,913 and sql/community_qualification_gate.sql's header says the
   G2 cutover produced 4,913. The live board returned 4,915 on 2026-09-07 with
   nothing from this build applied. The board is a view over
   hcp_community_scores_v2 and hcp_part_d_oncology_v1 and either can move
   beneath it without a line of SQL changing, so a figure recorded in a document
   in August is a historical reading and not an invariant. The invariant is
   "unchanged across this build", and block 24 captures the value to hold it to. */

SELECT 'oracle_nsclc' AS check,
       count(*)                          AS board_rows,
       count(*) FILTER (WHERE qualifies) AS qualifying_members
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
WHERE ta.slug = 'nsclc';

/* Tier distribution, nsclc. Expect exactly, from block 24's baseline:
     anchored        980 rows,   980 qualifying
     candidate     2,797 rows, 2,748 qualifying
     heme_dominant   629 rows,   629 qualifying
     supported        94 rows,    94 qualifying
     unresolved    8,548 rows,   464 qualifying
   Any movement here means the tier dispatcher changed a lung answer, which is
   the one thing block 26 was built specifically not to be able to do. */
SELECT ta.slug,
       coalesce(b.evidence_tier, '(null)')  AS evidence_tier,
       count(*)                             AS board_rows,
       count(*) FILTER (WHERE b.qualifies)  AS qualifying_members
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
WHERE ta.slug = 'nsclc'
GROUP BY ta.slug, b.evidence_tier
ORDER BY b.evidence_tier;

/* The shim must agree with the neutral view exactly. Expect 0 and 0. */
SELECT 'shim_divergence' AS check,
       (SELECT count(*) FROM public.community_board_nsclc_v1)
         - (SELECT count(*) FROM public.community_board_v1 b
            JOIN public.therapeutic_areas ta ON ta.id = b.ta_id WHERE ta.slug = 'nsclc')
         AS row_delta,
       (SELECT count(*) FROM public.community_board_nsclc_v1 WHERE qualifies)
         - (SELECT count(*) FROM public.community_board_v1 b
            JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
            WHERE ta.slug = 'nsclc' AND b.qualifies)
         AS qualifying_delta;

/* ---- 2. THE CRC BOARD ----
   Expect 7,454 board rows and 116 qualifying, all 116 tiered candidate.

   116, NOT 238. The instruction for this build expects 238, which is the figure
   block 23 measures and CRC_COMMUNITY_BUILD.md's measurement table records:
   colorectal-linked HCPs that already have a hcp_part_d_oncology_v1 row. That
   is a population count, not a board count. The board's cohort base is
   hcp_community_scores_v2, the same base the NSCLC board and tier view have
   always used, and it is narrower. Measured 2026-09-07:

       238   colorectal-linked HCPs with a Part D oncology row
       236   of those with country = 'US'                      (2 non-US)
       117   of those with a colorectal hcp_community_scores_v2 row
       116   both US and scored                                <- the board

   121 people are colorectal-linked, hold Part D evidence, and have never been
   scored for colorectal, so there is no cohort row for them to be a member
   through. Nothing in blocks 25 to 28 can reach them; they are not excluded by a
   filter, they are absent from the base.

   THIS IS NOT A DEFECT IN THIS BUILD AND MUST NOT BE PATCHED IN THE READ LAYER.
   Widening the board's base to hcp_therapeutic_areas_v2 would lift CRC to 236
   and would simultaneously redefine NSCLC membership, moving the oracle. Two
   different membership definitions keyed on TA would be a second silent-wrong of
   exactly the shape this build removes. The route to 236 is one
   community_scoring.py run for colorectal -- upstream, and excluded from this
   build by instruction. */

SELECT 'crc_board' AS check,
       count(*)                          AS board_rows,
       count(*) FILTER (WHERE qualifies) AS qualifying_members
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
WHERE ta.slug = 'colorectal-cancer';

/* Expect two tiers and only two: candidate 116 qualifying, unresolved 0
   qualifying. A colorectal row tiered anchored or supported means the
   dispatcher sent it to the wrong model. */
SELECT ta.slug,
       coalesce(b.evidence_tier, '(null)')  AS evidence_tier,
       count(*)                             AS board_rows,
       count(*) FILTER (WHERE b.qualifies)  AS qualifying_members
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
WHERE ta.slug = 'colorectal-cancer'
GROUP BY ta.slug, b.evidence_tier
ORDER BY b.evidence_tier;

/* CRC qualifies entirely through the Part D arm, because ta_hcpcs_codes has no
   colorectal rows so hcp_medicare_by_ta_v2 has none so patient_volume is 0 for
   every colorectal HCP. Expect via_volume 0, via_partd 116. This is the
   modality absence CRC_COMMUNITY_BUILD.md phase 6 requires be stated rather
   than shown as a zero. */
SELECT 'crc_qualifying_arms' AS check,
       count(*) FILTER (WHERE b.patient_volume > 0)  AS via_volume,
       count(*) FILTER (WHERE b.part_d_present)      AS via_partd
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
WHERE ta.slug = 'colorectal-cancer' AND b.qualifies;

/* ---- 3. THE BOUND ----
   Expect exactly two slugs: colorectal-cancer and nsclc. Nothing else.

   Four TAs have rows in hcp_community_scores_v2. If hepatology (13,191
   qualifying) or rare-disease (87) appears here, the ta_evidence_tier_config
   join in community_board_v1 is not doing its job and two therapeutic areas
   have just acquired a community board that nobody decided to give them. */
SELECT ta.slug,
       count(*)                            AS board_rows,
       count(*) FILTER (WHERE b.qualifies) AS qualifying_members
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
GROUP BY ta.slug
ORDER BY ta.slug;

/* ---- 4. THE RPCs, WHICH IS WHAT THE TAB ACTUALLY CALLS ----
   Everything above reads the views directly. This reads them the way the
   frontend does. Expect nsclc 4,915 and colorectal-cancer 116 in us_members,
   and first_rows equal to LEAST(us_members, 20).

   The four-argument count and the six-argument rows overload are the pair
   App.tsx sends for an unfiltered US community feed. */
SELECT ta.slug,
       public.get_community_filtered_count(ta.id, 'region', ARRAY['US'], ARRAY[]::text[]) AS us_members,
       (SELECT count(*) FROM public.get_community_filtered(ta.id, 'region', ARRAY['US'], ARRAY[]::text[], 20, 0)) AS first_page_rows
FROM public.therapeutic_areas ta
WHERE ta.slug IN ('nsclc', 'colorectal-cancer')
ORDER BY ta.slug;

/* The themed overloads, with an empty theme array, must agree with the plain
   ones. Expect both deltas 0. A non-zero delta means the theme EXISTS clause is
   filtering when it was handed nothing to filter on. */
SELECT ta.slug,
       public.get_community_filtered_count(ta.id, 'region', ARRAY['US'], ARRAY[]::text[], ARRAY[]::uuid[])
         - public.get_community_filtered_count(ta.id, 'region', ARRAY['US'], ARRAY[]::text[]) AS themed_count_delta
FROM public.therapeutic_areas ta
WHERE ta.slug IN ('nsclc', 'colorectal-cancer')
ORDER BY ta.slug;

/* ---- 5. THE WRONG-TA CHECK ----
   community_board_v1 joins the tier view on hcp_id AND ta_id. If that join were
   on hcp_id alone -- as the pre-2026-09-07 board's join was, correctly, when the
   tier view held one TA -- an HCP on both boards would carry lung's tier on the
   colorectal row. Expect 0.

   This is the same defect class as the narrative bleed fixed in the frontend on
   2026-09-06: a per-TA fact attached to a row of a different TA, rendering as
   confident prose with nothing marking it as borrowed. */
SELECT 'cross_ta_tier_leak' AS check,
       count(*) AS rows_whose_tier_is_not_their_own_tas_tier
FROM public.community_board_v1 b
LEFT JOIN public.hcp_evidence_tier_v1 e
  ON e.hcp_id = b.hcp_id
 AND e.ta_id  = b.ta_id
WHERE b.evidence_tier IS DISTINCT FROM e.tier;

/* And the population that makes that check meaningful: HCPs carrying a tier in
   more than one TA. If this is 0 the check above cannot fail and proves nothing;
   record the number so the check's strength is known rather than assumed. */
SELECT 'dual_ta_tier_holders' AS check,
       count(*) AS hcps_with_a_tier_in_more_than_one_ta
FROM (SELECT hcp_id
      FROM public.hcp_evidence_tier_v1
      GROUP BY hcp_id
      HAVING count(DISTINCT ta_id) > 1) d;
