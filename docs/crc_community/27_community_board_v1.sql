/* ==== 27. community_board_nsclc_v1 -> community_board_v1 + ta_id, WITH SHIM ====
   CRC_COMMUNITY_BUILD.md phase 5 item 1. TA_NEUTRAL_DB_LAYER.md sections B.1,
   B.2 row 1, B.3.

   WHY THIS IS A DROP AND CREATE AND NOT AN ALTER VIEW RENAME. Section B.1 is
   the whole reason and it is worth restating at the site: these are old-style
   SQL functions with string bodies, parsed at execution rather than definition,
   so pg_depend records exactly one edge for this view and none of the seven
   dependent functions appear in it. ALTER VIEW ... RENAME therefore SUCCEEDS
   SILENTLY and community_ledger, ledger_meta, community_hcp_profile,
   community_practice_profile, get_community_filtered and both
   get_community_filtered_count overloads begin failing at call time, on the
   next page load, for every user, with no deploy-time signal. The old name has
   to keep resolving. That is what the shim at the bottom of this file is.

   ORDER IN THIS FILE MATTERS: drop the old view, create the neutral one, then
   recreate the old NAME as a shim over it. Between the first and third
   statement the old name does not exist; run_sql.py sends the file as one
   implicit transaction, so no session outside this one observes that window. */

DROP VIEW IF EXISTS public.community_board_nsclc_v1;

/* ---- THE NEUTRAL BOARD ----
   Identical in every respect to what community_board_nsclc_v1 computed, with
   three changes and no others:

     1. therapeutic_area_id is emitted as ta_id, so the board can say which TA
        each row belongs to instead of the caller having to already know.
     2. The `WHERE c.therapeutic_area_id = '<nsclc uuid>'` predicate is gone,
        replaced by the join to ta_evidence_tier_config -- see WHAT BOUNDS THIS
        below.
     3. The tier comes from hcp_evidence_tier_v1 (block 26) and is joined on
        BOTH hcp_id and ta_id. The old view joined on hcp_id alone, which was
        sufficient only because the tier view held one TA. It now holds more
        than one, and a join on hcp_id alone would attach a lung tier to a
        colorectal row for any HCP on both boards. That is the wrong-TA class
        this whole build exists to close, one join condition away.

   qualifies is byte-for-byte the original predicate: patient_volume > 0 OR any
   hcp_part_d_oncology_v1 row. It is NOT re-derived, re-thresholded or gated on
   the tier. Membership and evidence stay separate, per COMMUNITY_ROSTER_BUILD.md.

   WHAT BOUNDS THIS TO TWO TAs. The join to ta_evidence_tier_config. Four TAs
   have rows in hcp_community_scores_v2, and without this join all four would
   have a community board the instant block 28 removes the NSCLC literal --
   hepatology would arrive with 13,191 qualifying members, unannounced. A TA
   gets a board by being given a config row, deliberately, and not by having
   been scored at some point in the past. */
CREATE VIEW public.community_board_v1 AS
SELECT c.therapeutic_area_id AS ta_id,
       c.hcp_id,
       c.patient_volume > 0::numeric
         OR (EXISTS (SELECT 1
                       FROM public.hcp_part_d_oncology_v1 pd
                      WHERE pd.hcp_id = c.hcp_id))          AS qualifies,
       c.patient_volume,
       (EXISTS (SELECT 1
                  FROM public.hcp_part_d_oncology_v1 pd
                 WHERE pd.hcp_id = c.hcp_id))               AS part_d_present,
       e.tier                                               AS evidence_tier
FROM public.hcp_community_scores_v2 c
JOIN public.hcps_v2 h
  ON h.id = c.hcp_id
JOIN public.ta_evidence_tier_config cfg
  ON cfg.therapeutic_area_id = c.therapeutic_area_id
LEFT JOIN public.hcp_evidence_tier_v1 e
  ON e.hcp_id = c.hcp_id
 AND e.ta_id  = c.therapeutic_area_id
WHERE h.country = 'US'::text;

COMMENT ON VIEW public.community_board_v1 IS
  'Community board membership, one row per (therapeutic area, US HCP). '
  'qualifies = patient_volume > 0 OR any hcp_part_d_oncology_v1 row -- unchanged '
  'from community_board_nsclc_v1. A TA appears here only if it has a '
  'ta_evidence_tier_config row; that join is what bounds the board, replacing '
  'the NSCLC uuid literal removed in block 28.';

GRANT SELECT ON public.community_board_v1 TO anon;
GRANT SELECT ON public.community_board_v1 TO authenticated;
GRANT SELECT ON public.community_board_v1 TO service_role;

/* ---- THE SHIM ----
   The old name, the old five columns, in the old order, over the lung slice.
   Section B.3: NSCLC is live and calling all of this right now, and Cloudflare
   auto-deploys foundation-rebuild, so the database change and the frontend
   change cannot land in the same instant. This is what makes them separable.

   COLUMN LIST IS EXPLICIT AND ORDERED, NOT `SELECT *`. community_board_v1 leads
   with ta_id; a star here would put a uuid in the first position of a view whose
   consumers read hcp_id there. Every one of those consumers is a string-bodied
   function that would not fail until it ran.

   WHO IS STILL ON THE SHIM AFTER THIS BUILD. Block 28 migrates the four
   get_community_filtered / _count overloads to community_board_v1. These stay
   on the old name and keep working unchanged:

     DB        community_ledger, ledger_meta, community_hcp_profile,
               community_practice_profile
     frontend  lib/api.ts x2 .from(), lib/home.ts x1
     scripts   generate_cycle.py, narrative/generate_narratives_v2.py,
               narrative/sweep_stranded_narratives.py, score/community_scoring.py,
               social/extract_web_signals.py, ta_cycle.py,
               utilities/export_telescope_data.py

   They are not migrated here because each is pinned to lung by its OWN slug
   literal as well (the `ta as (select id ... where slug = 'nsclc')` CTEs in
   section A.3), so repointing them at the neutral board would change the object
   they read without changing the TA they serve -- motion, not progress. They
   move in Phase 1 with their literals.

   THE SHIM NEEDS A DATED ALLOWLIST ENTRY, per section D.3: an expiry, not a
   TODO. Suggested reason `shim`, expiry the date the frontend cutover ships. */
CREATE VIEW public.community_board_nsclc_v1 AS
SELECT b.hcp_id,
       b.qualifies,
       b.patient_volume,
       b.part_d_present,
       b.evidence_tier
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta
  ON ta.id = b.ta_id
WHERE ta.slug = 'nsclc'::text;

COMMENT ON VIEW public.community_board_nsclc_v1 IS
  'SHIM. The lung slice of community_board_v1, in the pre-2026-09-07 column '
  'shape, so that the seven string-bodied callers listed in '
  'TA_NEUTRAL_DB_LAYER.md section B.2 keep resolving across the deploy gap. '
  'Drop when no caller names it. Allowlist reason shim, with an expiry.';

/* GRANTS DO NOT SURVIVE A DROP. This view was dropped at the top of this file
   with anon/authenticated/service_role all true (measured in block 24), so all
   three are restored here. A lost grant on this object does not error -- it
   empties the Community tab and reads as "no members". */
GRANT SELECT ON public.community_board_nsclc_v1 TO anon;
GRANT SELECT ON public.community_board_nsclc_v1 TO authenticated;
GRANT SELECT ON public.community_board_nsclc_v1 TO service_role;

/* Immediate oracle check, in the same file that could break it. The shim must
   return what block 24 recorded: 13,048 rows, 4,915 qualifying. */
SELECT 'shim_matches_baseline' AS check,
       count(*)                          AS board_rows,
       count(*) FILTER (WHERE qualifies) AS qualifying_members
FROM public.community_board_nsclc_v1;

SELECT ta.slug,
       count(*)                            AS board_rows,
       count(*) FILTER (WHERE b.qualifies) AS qualifying_members
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
GROUP BY ta.slug
ORDER BY ta.slug;
