/* ==== 26. hcp_evidence_tier_v1 -- THE TA-PARAMETERISED EVIDENCE TIER ====
   CRC_COMMUNITY_BUILD.md phase 5 item 2. TA_NEUTRAL_DB_LAYER.md section B.2
   row 2, section E.

   WHAT THIS IS: a dispatcher. One row per (therapeutic area, HCP), carrying a
   ta_id, with the tier computed by whichever model that TA's config row names.
   Two models exist today (block 25); the view is a UNION ALL of one branch per
   model, so a third model is a third branch and not a rewrite.

   WHAT THIS IS NOT: it is not a rename of hcp_nsclc_evidence_tier_v1, and the
   shim does not point the way section B.2 assumes.

   THE DEVIATION, STATED PLAINLY. Section B.2 has hcp_nsclc_evidence_tier_v1
   becoming hcp_evidence_tier_v1 with the old name surviving as a shim over the
   new view -- the same shape as the board in block 27. That shape cannot be
   built here, and the reason is section E.2's own finding: the NSCLC tier
   content is irreducibly lung-specific and there is no colorectal equivalent to
   put beside it. A neutral view cannot be the source of a lung tier it has no
   lung-free way to compute. So the direction is inverted for this object only:

       hcp_evidence_tier_v1        neutral DISPATCHER, new, has ta_id
         -> nsclc_v1 branch        SELECTs FROM hcp_nsclc_evidence_tier_v1
         -> partd_presence_v1      computed here, no TA-specific content

   hcp_nsclc_evidence_tier_v1 is therefore left exactly as it is -- not dropped,
   not altered, not shimmed. It stops being an object the read path names and
   becomes the implementation of one model, reached only through the dispatcher.
   Its name still trips validator rule 2 and it keeps its allowlist entry.

   WHY THAT IS THE SAFE ORDER AND NOT JUST THE EASY ONE. NSCLC is the regression
   oracle. If the lung tier were recomputed here -- even transcribed literally --
   any transcription error in a five-way CASE, two window functions and a
   0.70 heme-share test moves 4,915 members' tiers with no error anywhere. Not
   touching the lung SQL is the only version of this change with a zero-sized
   surface for that failure. The transcription happens when there is a second
   ladder to check it against, which is section E.3 Phase 3, which is blocked on
   curation. */

DROP VIEW IF EXISTS public.hcp_evidence_tier_v1;

CREATE VIEW public.hcp_evidence_tier_v1 AS

/* ---- BRANCH 1: tier_model = 'nsclc_v1' ----
   Pass-through. Every column comes from hcp_nsclc_evidence_tier_v1 untouched;
   the only thing added is ta_id, taken from the config row rather than from a
   slug lookup so that no TA literal appears in this body.

   The join is on tier_model, not on a slug, and it is safe to join that way
   ONLY because block 25's partial unique index makes nsclc_v1 a singleton. If
   that index is ever dropped, this branch starts multiplying lung rows across
   every nsclc_v1 TA. The index is the guard; this comment is the reason it
   exists. */
SELECT cfg.therapeutic_area_id      AS ta_id,
       e.hcp_id,
       e.npi,
       e.tier,
       e.years_anchored,
       e.recurrence_band,
       e.anchor_stem,
       e.anchor_stems,
       e.anchor_years,
       e.supported_evidence_rank,
       e.supported_evidence,
       e.lung_share,
       e.oral_denominator,
       e.oral_recent_year,
       e.lung_weighted
FROM public.hcp_nsclc_evidence_tier_v1 e
JOIN public.ta_evidence_tier_config cfg
  ON cfg.tier_model = 'nsclc_v1'

UNION ALL

/* ---- BRANCH 2: tier_model = 'partd_presence_v1' ----
   TWO TIERS. candidate if the HCP has any hcp_part_d_oncology_v1 row,
   unresolved if not. That is the whole model.

   WHAT candidate MEANS HERE, AND WHAT IT DOES NOT. hcp_part_d_oncology_v1 is a
   CMS Part D extract of oncology prescribing. A row in it says this physician
   prescribed an oncology oral. It does NOT say the drug was for this TA's
   disease -- part_d_oncology_drugs_v1 carries anchor_grade only for lung stems,
   and every colorectal-relevant stem in it (regorafenib, trifluridine,
   capecitabine) is ungraded, for lung and for everything else. So under this
   model candidate means exactly "has an oncology Part D footprint", which is
   weaker than lung's candidate and much weaker than lung's anchored.

   The tier name is reused rather than invented because it already occupies the
   right rung of the ladder and the ordering in block 28 already ranks it
   fourth. Inventing a CRC-only tier name would need a CRC-only ordering, and a
   tier vocabulary that diverges per TA is the thing that has to stay
   extensible, not the thing to start doing today.

   EVERY LUNG-MODEL COLUMN IS NULL, NOT ZERO AND NOT FALSE. lung_share,
   lung_weighted, anchor_stem, recurrence_band and the rest are answers the
   nsclc_v1 ladder produces. Under this model they are not merely absent, they
   are inapplicable -- there is no CRC anchor because there is no CRC anchor
   vocabulary. COMMUNITY_ROSTER_BUILD.md's rule is that a missing modality reads
   UNKNOWN and never zero; lung_weighted = false would be a claim that this
   physician's prescribing was weighed and found not concentrated, which is not
   a test that was run. NULL is the honest value and the frontend already
   renders an absence for it. */
SELECT cfg.therapeutic_area_id      AS ta_id,
       c.hcp_id,
       h.npi_number                 AS npi,
       CASE
         WHEN EXISTS (SELECT 1
                        FROM public.hcp_part_d_oncology_v1 pd
                       WHERE pd.hcp_id = c.hcp_id)
         THEN 'candidate'::text
         ELSE 'unresolved'::text
       END                          AS tier,
       NULL::bigint                 AS years_anchored,
       NULL::text                   AS recurrence_band,
       NULL::text                   AS anchor_stem,
       NULL::text[]                 AS anchor_stems,
       NULL::integer[]              AS anchor_years,
       NULL::integer                AS supported_evidence_rank,
       NULL::text                   AS supported_evidence,
       NULL::numeric                AS lung_share,
       NULL::numeric                AS oral_denominator,
       NULL::integer                AS oral_recent_year,
       NULL::boolean                AS lung_weighted
FROM public.hcp_community_scores_v2 c
JOIN public.hcps_v2 h
  ON h.id = c.hcp_id
JOIN public.ta_evidence_tier_config cfg
  ON cfg.therapeutic_area_id = c.therapeutic_area_id
 AND cfg.tier_model = 'partd_presence_v1'
WHERE h.country = 'US';

/* THE COHORT BASE IS hcp_community_scores_v2, MATCHING THE nsclc_v1 BRANCH.
   hcp_nsclc_evidence_tier_v1's own cohort CTE is hcp_community_scores_v2 joined
   to US HCPs, and branch 2 uses the same base so the two branches mean the same
   thing by "in this TA's community cohort".

   THIS IS ALSO THE BUILD'S BINDING CONSTRAINT, and it is the reason the CRC
   board comes out at 116 and not 238. MEASURED 2026-09-07:

       238  colorectal-linked HCPs with a hcp_part_d_oncology_v1 row
       236  of those are country = 'US'
       117  of those have a colorectal row in hcp_community_scores_v2
       116  are both

   The 121 missing are colorectal-linked, have Part D, and have never been
   scored for colorectal, so no row in the scores table exists for them to be a
   cohort member through. Lifting 116 to 236 is one community_scoring.py run for
   colorectal -- upstream, and out of scope for this build by instruction. It is
   not a defect in anything below. */

COMMENT ON VIEW public.hcp_evidence_tier_v1 IS
  'Evidence tier per (therapeutic area, HCP). Dispatches on '
  'ta_evidence_tier_config.tier_model: nsclc_v1 passes through '
  'hcp_nsclc_evidence_tier_v1, partd_presence_v1 emits candidate/unresolved on '
  'Part D presence alone. Columns named lung_* are nsclc_v1 outputs and are '
  'NULL under any other model.';

/* Grants. New object; anon and authenticated reach it through
   community_board_v1, service_role through the scripts in section B.2. */
GRANT SELECT ON public.hcp_evidence_tier_v1 TO anon;
GRANT SELECT ON public.hcp_evidence_tier_v1 TO authenticated;
GRANT SELECT ON public.hcp_evidence_tier_v1 TO service_role;

/* Shape check. Expect exactly two tiers for colorectal-cancer (candidate,
   unresolved) and five for nsclc, and no other slug present at all. */
SELECT ta.slug,
       e.tier,
       count(*) AS rows
FROM public.hcp_evidence_tier_v1 e
JOIN public.therapeutic_areas ta ON ta.id = e.ta_id
GROUP BY ta.slug, e.tier
ORDER BY ta.slug, e.tier;
