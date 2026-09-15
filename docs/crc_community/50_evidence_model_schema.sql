/* ==== 50. CRC EVIDENCE MODEL -- SCHEMA AND PART D VOCABULARY ====
   The applied copy of docs/npi_enrichment/05_evidence_model_schema.sql, written
   2026-09-09 and never run. Verified never run against the live catalog
   2026-09-14: ta_hcpcs_codes has 12 columns and none of them is
   specificity_grade, never_upgrades, valid_from or valid_to.

   It is COPIED here rather than run in place so that the applied version is the
   one in this sequence and the sequence is the record. 05 stays where it is,
   unedited, as the written-not-applied original.

   ------------------------------------------------------------------------
   FOUR DEVIATIONS FROM THE ORIGINAL, ALL DELIBERATE. The fourth was forced by a
   measurement taken while running this file; it is written up in full at section D.

   1. THE EXPLICIT BEGIN/COMMIT PAIRS ARE REMOVED. 05 wraps its DDL in one
      transaction and its Part D relocation in another. run_sql.py sends a file
      as ONE implicit transaction, so an inner COMMIT would end it and leave
      everything after the commit in a second, separately-committed transaction
      -- which is precisely the partial application the run sheet says cannot
      happen. Removing them makes the file atomic as promised. Nothing else in
      the transaction shape changes.

   2. standalone_attribution_eligible IS ADDED. Specified; see section E.

   3. pattern_role IS ADDED, AND THE BRIEF ASKED FOR ONE COLUMN, NOT TWO.
      Stated plainly because it is a real departure. Block 52 requires that
      branch 3 read its code lists from this table rather than carry HCPCS
      literals in the view body. The composite it implements needs a THREE-way
      distinction -- a VEGF agent, a backbone, a fluoropyrimidine -- and no
      column in ta_hcpcs_codes can carry it:

        code_category      is a SERVICE-TYPE axis (drug_admin / em / imaging /
                           procedure, verified across all 97 live rows). All ten
                           colorectal codes are drug_admin.
        specificity_grade  cannot separate them either: the brief grades
                           oxaliplatin, irinotecan AND fluorouracil all
                           cross_indication, so the grade collapses backbone and
                           partner into one value.
        never_upgrades     separates the two corroborators and nothing else.

      Without a role column, "a backbone AND a fluoropyrimidine" can only be
      written as "at least two cross_indication codes", which admits
      oxaliplatin + irinotecan with no fluoropyrimidine. That is a different
      model, not the specified one. So the role is data, for the same reason
      block 25 made the tier model data.
   ------------------------------------------------------------------------


   ============================================================================
   THE FINDING THAT CHANGES THE MODEL -- transcribed from 05, unchanged
   ============================================================================

   J9303 panitumumab, J9400 ziv-aflibercept and J9055 cetuximab have ZERO ROWS in the
   CMS Physician & Other Practitioners file for 2021, 2022 and 2023. Verified against
   the SOURCE parquets (27,620,857 rows, 6,353 distinct HCPCS codes) BEFORE any join to
   our NPIs. The file is a full extract, not a filtered one.

     1. CRC HAS NO ANCHOR TIER AVAILABLE FROM A SINGLE PART B CODE. Both codes
        designated to carry `strict` are unavailable, and the `dominant` cetuximab with
        them. The anchor arm is not thin -- it is empty, and no amount of ingest changes
        that.
     2. FRUQUINTINIB GIVES SEVEN WEEKS OF 2023 (FDA 2023-11-08). A real anchor and a
        nearly empty one.
     3. THE REGIMEN FINGERPRINT IS NOT A SUPPLEMENT TO THE MODEL -- IT IS THE MODEL.
        Same-provider/same-year co-occurrence is the only colorectal-specific Part B
        evidence that exists. Blocks 40 and 41 measure it; block 52 implements it.
     4. THE SURGICAL ARM HAS THE SAME PROBLEM. 44140 partial colectomy: 2 providers in
        the entire 2023 source. Major resection is inpatient, billed elsewhere. The
        surgical arm needs a different source, not a different code list.

   ============================================================================ */


/* -- A. specificity_grade ---------------------------------------------------
   FOUR LEVELS, NOT A BOOLEAN. is_primary_signal is a boolean and
   NSCLC_COHORT_EVIDENCE_TIERS.md section 1 already found it miscalibrated -- set true
   for cisplatin, docetaxel and both bevacizumab biosimilars, all broadly
   cross-indication, so it distinguishes something, but not indication specificity.

   THE BOOLEAN IS UNTOUCHED, deliberately. Four readers depend on its current meaning:
   hcp_administered_volume(uuid,uuid), medicare_aggregator.py,
   open_payments_aggregator.py and aggregate_community_payments.py. Two of those read
   `NOT is_primary_signal`, so redefining it would silently move numbers in
   hcp_medicare_by_ta_v2 and the AD community payment arm. */
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS specificity_grade text;

ALTER TABLE public.ta_hcpcs_codes
  DROP CONSTRAINT IF EXISTS ta_hcpcs_specificity_grade_vocab;
ALTER TABLE public.ta_hcpcs_codes
  ADD CONSTRAINT ta_hcpcs_specificity_grade_vocab
  CHECK (specificity_grade IS NULL
         OR specificity_grade IN ('strict', 'dominant', 'cross_indication', 'supporting'));

COMMENT ON COLUMN public.ta_hcpcs_codes.specificity_grade IS
  'How indication-specific this code is for its TA. strict = this code alone implies the '
  'indication; dominant = mostly this indication; cross_indication = used across several; '
  'supporting = corroborates only alongside other evidence. NULL = ungraded, not "safe". '
  'Distinct from is_primary_signal, which is a boolean with four live readers and a '
  'different, miscalibrated meaning.';


/* -- B. never_upgrades ------------------------------------------------------
   A GRADE SAYS HOW SPECIFIC A CODE IS. IT DOES NOT SAY WHAT THE CODE IS FORBIDDEN TO DO.
   Colonoscopy 45380/45385 is the case that forces the distinction: it is the largest
   signal available (13,006 and 12,820 providers, 79.9% of the source population survives
   our join) and it is upstream of treating established disease. Screening and
   surveillance find colorectal cancer; they are not evidence of managing it. */
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS never_upgrades boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ta_hcpcs_codes.never_upgrades IS
  'true = this code may corroborate a tier reached on other evidence but must NEVER by '
  'itself promote an HCP into a higher tier. Set for screening/surveillance codes '
  '(colonoscopy 45380/45385), which are upstream of treating established disease.';


/* -- C. valid_from / valid_to ----------------------------------------------
   approval_year is an integer and cannot hold Q5129 bevacizumab-adcd, valid from
   2023-04-01, or Q5126 bevacizumab-maly from 2023-01-01. Rounding Q5129 to 2023 claims
   a quarter of billing that could not have happened.

   approval_year STAYS. Nothing reads it, so there is no migration risk either way, and
   leaving it is the same discipline as leaving is_primary_signal above. */
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS valid_from date;
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS valid_to date;

COMMENT ON COLUMN public.ta_hcpcs_codes.valid_from IS
  'First date this code was billable, to the day. Supersedes approval_year for precision '
  '(Q5129 = 2023-04-01, Q5126 = 2023-01-01); approval_year is retained, unread, unchanged. '
  'Grade against the therapeutic landscape of the DATA YEAR: a current label applied to '
  '2021 claims is hindsight error.';
COMMENT ON COLUMN public.ta_hcpcs_codes.valid_to IS
  'Last date this code was billable, to the day. NULL = still current.';


/* -- E. standalone_attribution_eligible ------------------------------------
   DRUG INDICATION SPECIFICITY AND CLAIM ATTRIBUTION STRENGTH ARE DIFFERENT PROPERTIES
   AND ONE FIELD CANNOT CARRY BOTH.

   The case that proves it is breast. Anastrozole is pharmacologically breast-specific --
   there is no other indication worth naming -- so its specificity_grade is strict. And an
   anastrozole claim is still not evidence that the prescriber is an active breast
   oncologist, because long-term adjuvant prescribing passes to primary care years into
   treatment. STRICT, and standalone FALSE. A single field would have to choose which of
   those two true things to record.

   DEFAULT FALSE IS THE LOAD-BEARING PART. An ungraded code -- one nobody has looked at --
   can corroborate a tier reached on other evidence, and can never establish one on its
   own. The permissive default would let a code silently acquire attribution power by
   being added to the table. */
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS standalone_attribution_eligible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ta_hcpcs_codes.standalone_attribution_eligible IS
  'true = a claim on this code ALONE is sufficient to attribute the HCP to this TA. '
  'ORTHOGONAL TO specificity_grade: anastrozole is strict for breast and standalone FALSE, '
  'because adjuvant prescribing passes to primary care. DEFAULT false, so an ungraded code '
  'can corroborate but can never establish.';


/* -- F. pattern_role -------------------------------------------------------
   WHICH PART OF A CO-OCCURRENCE COMPOSITE THIS CODE PLAYS. Per-TA clinical content, the
   same kind of thing as ta_evidence_tier_config.partb_anchor_codes, and NULL for every
   code whose TA has no composite model -- which today is all 97 existing rows.

   This is what lets block 52's branch 3 read its code lists from this table instead of
   spelling J9035/J9263/J9206/J9190 into a view body. A code list in a view body is the
   same defect as a slug in a function body: it makes the model unreadable from the data
   and unchangeable without a DDL deploy.

   THE VOCABULARY IS A CHECK, NOT AN ENUM, for block 25's reason -- a fifth role is one
   ALTER rather than a type migration. The four values are pharmacological rather than
   abstract because the composite they encode is stated pharmacologically, in blocks 40
   and 41 and in the advisor grading: a VEGF agent, plus a backbone, plus a
   fluoropyrimidine. A lung or breast composite would add its own values here. */
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS pattern_role text;

ALTER TABLE public.ta_hcpcs_codes
  DROP CONSTRAINT IF EXISTS ta_hcpcs_pattern_role_vocab;
ALTER TABLE public.ta_hcpcs_codes
  ADD CONSTRAINT ta_hcpcs_pattern_role_vocab
  CHECK (pattern_role IS NULL
         OR pattern_role IN ('vegf', 'backbone', 'fluoropyrimidine', 'corroborator'));

COMMENT ON COLUMN public.ta_hcpcs_codes.pattern_role IS
  'Role this code plays in its TA co-occurrence composite: vegf / backbone / '
  'fluoropyrimidine / corroborator. NULL = this TA has no composite model, or this code is '
  'not part of it. Read by hcp_evidence_tier_v1 branch 3 (partb_practice_v1) so the code '
  'lists live in data rather than in the view body.';


/* ==== D. PART D: MOVE regorafenib AND trifluridine TO colorectal ============
   THIS RELOCATES THE EXISTING 238, IT DOES NOT CHANGE THEM. Transcribed from 05.

   238 CRC-linked HCPs are already in hcp_part_d_oncology_v1; 36 of them via regorafenib
   or trifluridine specifically. Not one person gains or loses Part D presence here. What
   changes is which group the drug is filed under and that it acquires a grade.

   WHY MOVE RATHER THAN DUPLICATE: a colorectal row alongside the gi_renal one would
   double-count every prescriber the moment anything aggregates by drug_group, and the two
   rows would drift the first time one was regraded.

   THE DENORMALISED COPY. hcp_part_d_oncology_v1 carries its OWN drug_group and
   anchor_grade columns, populated at ingest. Both are updated here, in the same
   transaction as everything else in this file.

   NOTE ON MEMBERSHIP: community_board_v1.qualifies is
   `patient_volume > 0 OR EXISTS(hcp_part_d_oncology_v1 row)` -- it reads PRESENCE, never
   drug_group or anchor_grade. Relabelling rows therefore cannot move the board. Block 53
   checks the 4,794 anyway rather than relying on this paragraph. */

INSERT INTO public.part_d_oncology_drugs_v1
  (drug_stem, drug_group, anchor_grade, valid_from_year, valid_to_year, note)
VALUES
  ('fruquintinib',  'colorectal', 'strict', 2023, NULL,
   'FDA approval 2023-11-08. The only strict CRC oral -- and it covers seven weeks of the '
   'latest Part D year we hold, so it anchors almost nobody yet.'),
  ('encorafenib',   'colorectal', 'cross_indication', 2022, NULL,
   'BRAF V600E: colorectal with cetuximab, but also melanoma and NSCLC. Cross-indication.'),
  ('capecitabine',  'colorectal', 'cross_indication', 2022, NULL,
   'THE ONE THAT MATTERS. Highest-volume colorectal oral there is, and it spans colorectal '
   'and breast. Grading it strict would put breast oncologists on a colorectal board -- the '
   'same defect shape as is_primary_signal being true for cisplatin. cross_indication is '
   'the grade; the tier logic weights it.')
ON CONFLICT DO NOTHING;

UPDATE public.part_d_oncology_drugs_v1
SET drug_group = 'colorectal', anchor_grade = 'dominant'
WHERE drug_stem = 'trifluridine';

UPDATE public.part_d_oncology_drugs_v1
SET drug_group = 'colorectal', anchor_grade = 'cross_indication'
WHERE drug_stem = 'regorafenib';

/* ---- DEVIATION 4: THE DENORMALISED COPY TAKES drug_group AND NOT anchor_grade ----
   MEASURED, NOT ANTICIPATED. 05 writes both columns onto hcp_part_d_oncology_v1. Running
   it that way on 2026-09-14 moved the LUNG board:

       supported      94  ->  244   (+150)
       candidate   2,798  -> 2,669  (-129)
       heme_dominant 629  ->   608  ( -21)

   130 lung physicians acquired supported_evidence reading "lung-dominant oral", and 24
   "cross-indication targeted oral", on the strength of prescribing TRIFLURIDINE and
   REGORAFENIB -- colorectal drugs.

   WHY. hcp_nsclc_evidence_tier_v1's supported arm is

       WHEN has_pemetrexed OR has_durvalumab
         OR (dominant_rows + cross_rows + supporting_grade_rows) > 0 THEN 'supported'

   and those three counts are `count(*) FILTER (WHERE anchor_grade = ...)` over
   hcp_part_d_oncology_v1 with NO drug_group predicate. Only lung_rows is scoped by group.
   So the ladder reads anchor_grade as "lung anchor grade" while the column is declared as
   a grade for whatever TA the drug belongs to. Every grade was a lung grade until this
   file, so the ambiguity had never cost anything.

   THIS IS A LATENT DEFECT IN THE LUNG LADDER, NOT IN 05'S GRADING. Any non-lung stem
   acquiring a grade triggers it -- a breast or prostate curation would have done the same.
   The real fix is to scope those three counts by drug_group, which means editing
   hcp_nsclc_evidence_tier_v1, which block 26 refused to do for the reason that applies
   here more than anywhere: lung is the regression oracle and 4,915 members' tiers move
   with no error anywhere. That edit is a decision, not a transcription, and it is logged
   for Garrett rather than taken here.

   SO THIS FILE HOLDS THE INVARIANT THE LADDER ASSUMES: in the denormalised copy,
   anchor_grade is lung-scoped, and a non-lung row carries NULL. drug_group IS relabelled,
   because the ladder filters lung_rows and heme_fills on it explicitly and gi_renal ->
   colorectal touches neither -- verified, lung is bit-identical after this statement.

   THE CURATED GRADES ARE NOT LOST. They live in part_d_oncology_drugs_v1 above, which is
   the vocabulary table and the thing a future colorectal ORAL model reads. What is
   withheld is the copy on the hcp rows, which today has exactly one reader and that reader
   means something else by it.

   Idempotent: it repairs a database where 05 was already run as written. */
UPDATE public.hcp_part_d_oncology_v1 h
SET drug_group   = d.drug_group,
    anchor_grade = NULL
FROM public.part_d_oncology_drugs_v1 d
WHERE d.drug_stem = h.drug_stem
  AND d.drug_group = 'colorectal'
  AND (h.drug_group IS DISTINCT FROM d.drug_group
    OR h.anchor_grade IS NOT NULL);


/* ==== VERIFY ===============================================================
   Expected:
     ta_hcpcs_codes gains 6 columns (05's four, plus the two this file adds)
     0 existing ta_hcpcs_codes rows change; is_primary_signal untouched
     part_d_oncology_drugs_v1: colorectal = 5 stems, gi_renal = 7 (was 9)
     hcp_part_d_oncology_v1:   372 rows relabelled, 278 distinct HCPs, none added or lost,
                               and 0 of them graded -- see deviation 4
     hcp_nsclc_evidence_tier_v1 UNMOVED: 980/2,798/629/94/8,547 */

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ta_hcpcs_codes'
  AND column_name IN ('specificity_grade', 'never_upgrades', 'valid_from', 'valid_to',
                      'standalone_attribution_eligible', 'pattern_role',
                      'is_primary_signal', 'approval_year')
ORDER BY column_name;

/* Every pre-existing row must still be ungraded and non-standalone: this file adds
   columns, it does not grade anything. Expect ungraded = 97, standalone = 0, roled = 0. */
SELECT count(*) AS existing_rows,
       count(*) FILTER (WHERE specificity_grade IS NULL) AS ungraded,
       count(*) FILTER (WHERE standalone_attribution_eligible) AS standalone,
       count(*) FILTER (WHERE pattern_role IS NOT NULL) AS roled,
       count(*) FILTER (WHERE never_upgrades) AS never_upgrades
FROM public.ta_hcpcs_codes;

SELECT drug_group, anchor_grade, count(*) AS stems,
       string_agg(drug_stem, ', ' ORDER BY drug_stem) AS drugs
FROM public.part_d_oncology_drugs_v1
WHERE drug_group IN ('colorectal', 'gi_renal')
GROUP BY 1, 2 ORDER BY 1, 2;

SELECT drug_group, count(*) AS rows, count(DISTINCT hcp_id) AS hcps,
       count(*) FILTER (WHERE anchor_grade IS NOT NULL) AS graded_expect_0
FROM public.hcp_part_d_oncology_v1
WHERE drug_stem IN ('regorafenib', 'trifluridine')
GROUP BY 1;

/* THE INVARIANT DEVIATION 4 EXISTS TO HOLD: no non-lung row in the denormalised copy
   carries a grade, because hcp_nsclc_evidence_tier_v1 counts anchor_grade without a
   drug_group predicate and would read it as lung evidence. EXPECT 0. */
SELECT count(*) AS non_lung_graded_rows_expect_0
FROM public.hcp_part_d_oncology_v1
WHERE drug_group <> 'lung' AND anchor_grade IS NOT NULL;

/* And the oracle itself. EXPECT 980 / 2,798 / 629 / 94 / 8,547. */
SELECT tier, count(*) AS rows FROM public.hcp_nsclc_evidence_tier_v1
GROUP BY 1 ORDER BY 2 DESC;
