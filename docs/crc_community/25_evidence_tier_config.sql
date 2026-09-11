/* ==== 25. ta_evidence_tier_config -- WHICH TIER MODEL A TA USES ====
   CRC_COMMUNITY_BUILD.md phase 5 item 2, executing TA_NEUTRAL_DB_LAYER.md
   section E.3. This is the config table that section specifies; it is created
   here because block 26 cannot be written without it.

   WHY A TABLE AND NOT A CASE IN THE VIEW. The view in block 26 has to behave
   differently for lung than for colorectal. Writing that as
   `CASE WHEN ta.slug = 'nsclc' THEN ... ELSE ... END` would reproduce, inside
   the replacement, the exact defect the replacement exists to remove -- a TA
   slug literal in a function body, rule 1 of the section D validator. The
   branch has to be data. So the branch is a column.

   THE THREE THINGS THIS TABLE DECIDES

   1. WHICH TAs HAVE A COMMUNITY BOARD AT ALL. Block 27's board view joins this
      table, so a TA with no row here has no community board. That is not
      incidental -- it is the safety property that makes block 28 safe to apply.
      Removing the NSCLC uuid literal from get_community_filtered (block 28)
      removes the thing that was, by accident, bounding the board to one TA.
      Without a replacement bound, four TAs have rows in hcp_community_scores_v2
      and all four would acquire a community board the moment the literal came
      out. MEASURED 2026-09-07, US rows that would qualify:

          nsclc               4,915   intended, already live
          colorectal-cancer     116   intended, the point of this build
          hepatology         13,191   NOT INTENDED
          rare-disease           87   NOT INTENDED

      A 13,191-member hepatology community board appearing unannounced is a
      bigger event than the CRC board this build is for, and nothing in section
      B or C says what stops it. This table is that stop. See the report note:
      "what bounds the board's TA set once the literal is gone" is an amendment
      to TA_NEUTRAL_DB_LAYER.md, not a decision this file should be making on
      its own -- it is made here because the file cannot be correct without it.

   2. WHICH TIER MODEL COMPUTES THE TIER. tier_model, one row per TA.

   3. WHERE THE PER-TA CLINICAL CONTENT WILL LIVE when it exists. The
      partb_/oral_floor/share_floor/exclusion_group columns are section E.3's
      shape, populated for NSCLC from the live view and left NULL for CRC
      because CRC's values are founder input and are not invented here. */

CREATE TABLE IF NOT EXISTS public.ta_evidence_tier_config (
  therapeutic_area_id     uuid PRIMARY KEY REFERENCES public.therapeutic_areas(id),
  tier_model              text NOT NULL,
  partb_anchor_codes      text[],
  partb_supporting_codes  text[],
  oral_floor              numeric,
  share_floor             numeric,
  exclusion_group         text,
  notes                   text
);

/* THE VOCABULARY IS TWO VALUES BECAUSE TWO MODELS EXIST. It is a CHECK and not
   an enum so that adding a third model is one ALTER rather than a type
   migration -- "leave the tier vocabulary extensible" is the instruction, and
   the extension point is here, at the model, not inside the view body.

     nsclc_v1            the five-tier ladder anchored > supported >
                         heme_dominant > candidate > unresolved, implemented
                         today by the view hcp_nsclc_evidence_tier_v1. Its
                         content (pemetrexed J9305/J9304, durvalumab J9173,
                         anchor_grade on part_d_oncology_drugs_v1, oral_floor
                         24, lung_share 0.30) is lung-specific and is NOT yet
                         driven by the columns in this table -- see the
                         singleton index below.

     partd_presence_v1   two tiers. candidate = the HCP has any
                         hcp_part_d_oncology_v1 row. unresolved = none. No
                         anchored, no supported, no exclusion group.

   WHY CRC GETS partd_presence_v1 AND NOT A CRC LADDER. anchored and supported
   are claims about WHICH DRUGS a physician prescribes for THIS disease. Making
   those claims for colorectal needs the CRC drug vocabulary graded against
   colorectal -- which stems are strict, which are cross-indication, which Part
   B codes anchor, and the capecitabine question CRC_COMMUNITY_BUILD.md phase 4
   flags (it spans colorectal and breast; graded strict it would anchor breast
   prescribers onto a CRC board). That grading is founder input and is not
   guessable. A two-tier model says less and says it accurately. */
ALTER TABLE public.ta_evidence_tier_config
  DROP CONSTRAINT IF EXISTS ta_evidence_tier_config_known_model;
ALTER TABLE public.ta_evidence_tier_config
  ADD CONSTRAINT ta_evidence_tier_config_known_model
  CHECK (tier_model IN ('nsclc_v1', 'partd_presence_v1'));

/* nsclc_v1 IS A SINGLETON, AND THE INDEX SAYS SO RATHER THAN A COMMENT SAYING
   SO. Block 26 implements the nsclc_v1 branch by selecting from
   hcp_nsclc_evidence_tier_v1, whose own cohort CTE is hardcoded to the nsclc
   slug. So that branch can only ever be correct for ONE TA. If a second row
   ever carried tier_model = 'nsclc_v1' the view would emit that TA's ta_id over
   lung's rows -- a wrong-TA board, silently. The index makes that unwritable.

   It comes out when the nsclc_v1 content moves into the columns above and the
   branch becomes genuinely parameterised. That is section E.3's Phase 3 and it
   is blocked on curation, not on code. */
DROP INDEX IF EXISTS public.ta_evidence_tier_config_nsclc_v1_singleton;
CREATE UNIQUE INDEX ta_evidence_tier_config_nsclc_v1_singleton
  ON public.ta_evidence_tier_config ((tier_model))
  WHERE tier_model = 'nsclc_v1';

COMMENT ON TABLE public.ta_evidence_tier_config IS
  'One row per therapeutic area that has a community board. Presence of a row '
  'is what gives a TA a board (community_board_v1 joins this table); tier_model '
  'is what decides how its evidence tier is computed (hcp_evidence_tier_v1). '
  'The partb_/floor/exclusion columns are the per-TA clinical content from '
  'TA_NEUTRAL_DB_LAYER.md section E.3 -- recorded for nsclc, NULL for any TA '
  'whose content has not been curated.';

COMMENT ON COLUMN public.ta_evidence_tier_config.tier_model IS
  'nsclc_v1 = five-tier lung ladder, implemented by hcp_nsclc_evidence_tier_v1, '
  'singleton. partd_presence_v1 = two tiers, candidate if the HCP has any '
  'hcp_part_d_oncology_v1 row else unresolved.';

COMMENT ON COLUMN public.ta_evidence_tier_config.oral_floor IS
  'Minimum 30-day fills in a program year for an oral-share test to be allowed '
  'to speak. Read by the nsclc_v1 model only; NULL under partd_presence_v1, '
  'which runs no share test.';

/* ==== SEED ====
   Two rows, because two TAs are intended to have a community board.

   THE NSCLC ROW RECORDS WHAT THE LIVE VIEW ALREADY DOES. Every value here was
   read out of hcp_nsclc_evidence_tier_v1 on 2026-09-07 -- J9305/J9304 as the
   supported-rank-1 Part B anchor, J9173 as rank 2, oral_floor 24, share floor
   0.30, exclusion group heme. NOTHING READS THESE COLUMNS YET. They are written
   now so that the move of that content out of the view body is a change to one
   branch of one view, with the destination values already in place and already
   verified against the source. */
INSERT INTO public.ta_evidence_tier_config
  (therapeutic_area_id, tier_model, partb_anchor_codes, partb_supporting_codes,
   oral_floor, share_floor, exclusion_group, notes)
SELECT ta.id,
       'nsclc_v1',
       ARRAY['J9305', 'J9304'],
       ARRAY['J9173'],
       24,
       0.30,
       'heme',
       'Values transcribed from the live hcp_nsclc_evidence_tier_v1 body on '
       '2026-09-07 and NOT yet read by anything. The nsclc_v1 branch of '
       'hcp_evidence_tier_v1 still gets this content from that view. Moving it '
       'here is TA_NEUTRAL_DB_LAYER.md section E.3 Phase 3.'
FROM public.therapeutic_areas ta
WHERE ta.slug = 'nsclc'
ON CONFLICT (therapeutic_area_id) DO UPDATE
  SET tier_model             = EXCLUDED.tier_model,
      partb_anchor_codes     = EXCLUDED.partb_anchor_codes,
      partb_supporting_codes = EXCLUDED.partb_supporting_codes,
      oral_floor             = EXCLUDED.oral_floor,
      share_floor            = EXCLUDED.share_floor,
      exclusion_group        = EXCLUDED.exclusion_group,
      notes                  = EXCLUDED.notes;

/* THE CRC ROW CARRIES NO CLINICAL CONTENT, ON PURPOSE. Every column that would
   assert something about colorectal drugs is NULL, and NULL here means
   "not curated", not "none". A zero or an empty array would read as a curated
   answer of nothing, which is a different and false claim. */
INSERT INTO public.ta_evidence_tier_config
  (therapeutic_area_id, tier_model, partb_anchor_codes, partb_supporting_codes,
   oral_floor, share_floor, exclusion_group, notes)
SELECT ta.id,
       'partd_presence_v1',
       NULL, NULL, NULL, NULL, NULL,
       'Two tiers only. anchored and supported need colorectal drug grading '
       '(which stems are strict vs cross-indication, which Part B codes anchor, '
       'and the capecitabine breast/colorectal split) -- founder input, see '
       'CRC_COMMUNITY_BUILD.md phase 4. NULL in the columns above means NOT '
       'CURATED, never none.'
FROM public.therapeutic_areas ta
WHERE ta.slug = 'colorectal-cancer'
ON CONFLICT (therapeutic_area_id) DO UPDATE
  SET tier_model             = EXCLUDED.tier_model,
      partb_anchor_codes     = EXCLUDED.partb_anchor_codes,
      partb_supporting_codes = EXCLUDED.partb_supporting_codes,
      oral_floor             = EXCLUDED.oral_floor,
      share_floor            = EXCLUDED.share_floor,
      exclusion_group        = EXCLUDED.exclusion_group,
      notes                  = EXCLUDED.notes;

/* Grants. This table is new, so nothing is being restored -- but it is read
   through two views that anon reaches, and a missing grant here is the same
   empty surface described in block 24. */
GRANT SELECT ON public.ta_evidence_tier_config TO anon;
GRANT SELECT ON public.ta_evidence_tier_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ta_evidence_tier_config TO service_role;

SELECT ta.slug,
       cfg.tier_model,
       cfg.partb_anchor_codes,
       cfg.oral_floor,
       cfg.share_floor,
       cfg.exclusion_group
FROM public.ta_evidence_tier_config cfg
JOIN public.therapeutic_areas ta ON ta.id = cfg.therapeutic_area_id
ORDER BY ta.slug;
