/* ==== 05. CRC EVIDENCE MODEL -- SCHEMA AND PART D VOCABULARY ====
   Written 2026-09-09. Data and schema only. THE TIER VIEW IS NOT BUILT HERE and must
   not be built until workstream B has run -- see THE FINDING below for why.

   Four changes, all additive except the Part D relocation, which is a relabel:
     A  ta_hcpcs_codes.specificity_grade  -- four-level grade beside the boolean
     B  ta_hcpcs_codes.never_upgrades     -- a code that can corroborate but never promote
     C  ta_hcpcs_codes.valid_from/valid_to -- real dates beside approval_year
     D  regorafenib + trifluridine moved from gi_renal to a colorectal drug_group


   ============================================================================
   THE FINDING THAT CHANGES THE MODEL -- read before designing anything on top
   ============================================================================

   J9303 panitumumab, J9400 ziv-aflibercept and J9055 cetuximab have ZERO ROWS in the
   CMS Physician & Other Practitioners file for 2021, 2022 and 2023. Verified against
   the SOURCE parquets (Medicare/medicare_provider_service_<year>.parquet, 27,620,857
   rows, 6,353 distinct HCPCS codes) BEFORE any join to our NPIs. The file is a full
   extract, not a filtered one: J9035, J9271, J9299, 44140 and 44145 are all present.
   These three codes specifically are not.

   THIS IS NOT A POPULATION ARTIFACT, and it is worth being precise because the
   neighbouring number IS one. J9035 bevacizumab has 1,842 providers in the 2023 source
   and we hold 3 of them -- 0.2%, against 79.9% for colonoscopy 45380 in the same file
   under the same join. That gap is ours: hcp_hcpcs_detail is 53.2% gastroenterology
   (14,164 of 26,620) and 15.0% medical/hem-onc (3,986), because the only population
   ingest ever run was hepatology's. Workstream B fixes that one. It cannot fix a code
   that is not in the source.

   CONSEQUENCES FOR THE ADVISOR'S MODEL:

     1. CRC HAS NO ANCHOR TIER AVAILABLE FROM PART B. Both codes designated to carry
        `strict` are unavailable, and the `dominant` cetuximab with them. The anchor arm
        is not thin -- it is empty, and no amount of ingest changes that.

     2. FRUQUINTINIB GIVES SEVEN WEEKS OF 2023. FDA approval 2023-11-08, so the Part D
        `strict` oral covers 08 Nov - 31 Dec of the latest year we hold. It is a real
        anchor and a nearly empty one.

     3. THE REGIMEN FINGERPRINT IS NOT A SUPPLEMENT TO THE MODEL -- IT IS THE MODEL.
        With the anchors unavailable, same-provider/same-year co-occurrence is the only
        colorectal-specific Part B evidence that exists. Measured on today's CRC-linked
        population (1,615 with an NPI, 1,029 with any claims row): FOLFOX-like
        (oxaliplatin + 5-FU + leucovorin, one NPI-year) 23 HCPs; FOLFIRI-like
        (irinotecan + 5-FU + leucovorin) 18. Small because the population is 15%
        oncology, but the component codes survive whatever suppresses the anchors --
        J9190 on 685 providers, J9263 on 371.

        The NSCLC tier view has no concept of co-occurrence. That is the design gap, and
        it is now load-bearing rather than an enhancement.

     4. THE SURGICAL ARM HAS THE SAME PROBLEM. 44140 partial colectomy: 2 providers in
        the entire 2023 source file. Major resection is essentially absent from the
        practitioner file -- it is inpatient, billed elsewhere. The surgical_supported
        tier needs a different source, not a different code list.

   Worth putting to the advisor: whether these absences are CMS's <11-beneficiary
   suppression, or these agents being predominantly hospital-outpatient billed under
   Part B FACILITY rather than practitioner claims. The distinction decides whether
   another dataset would recover them.


   ============================================================================ */

BEGIN;

/* -- A. specificity_grade ---------------------------------------------------
   FOUR LEVELS, NOT A BOOLEAN. is_primary_signal is a boolean and
   NSCLC_COHORT_EVIDENCE_TIERS.md section 1 already found it miscalibrated -- set true
   for cisplatin, docetaxel and both bevacizumab biosimilars, all broadly
   cross-indication, so it distinguishes something, but not indication specificity.

   THE BOOLEAN IS UNTOUCHED, deliberately. Four readers depend on its current meaning:
   the hcp_administered_volume(uuid,uuid) function (the only live DB object reading it,
   splitting volume into primary/non-primary buckets), medicare_aggregator.py,
   open_payments_aggregator.py and aggregate_community_payments.py. Two of those read
   `NOT is_primary_signal`, so redefining it would silently move numbers in
   hcp_medicare_by_ta_v2 and the AD community payment arm. A new column costs nothing
   and breaks nothing; overloading the old one would do neither cheaply. */
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
   surveillance find colorectal cancer; they are not evidence of managing it. Grading it
   `supporting` would still let enough of it accumulate to promote someone.

   So the prohibition is a property of the row, not a convention in whatever reads it.
   Any future tier logic must treat never_upgrades as a hard stop on promotion, while
   still allowing the code to corroborate a tier reached on other evidence. */
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

   approval_year STAYS. Nothing reads it -- verified: no DB function, no view, no script;
   it appears only in schema_full.sql and the seed migrations that populate it -- so
   there is no migration risk either way, and leaving it is the same discipline as
   leaving is_primary_signal above. Deprecating it is a separate decision from needing a
   date. */
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS valid_from date;
ALTER TABLE public.ta_hcpcs_codes
  ADD COLUMN IF NOT EXISTS valid_to date;

COMMENT ON COLUMN public.ta_hcpcs_codes.valid_from IS
  'First date this code was billable, to the day. Supersedes approval_year for precision '
  '(Q5129 = 2023-04-01, Q5126 = 2023-01-01); approval_year is retained, unread, unchanged.';
COMMENT ON COLUMN public.ta_hcpcs_codes.valid_to IS
  'Last date this code was billable, to the day. NULL = still current.';

COMMIT;


/* ==== D. PART D: MOVE regorafenib AND trifluridine TO colorectal ============
   THIS RELOCATES THE EXISTING 238, IT DOES NOT CHANGE THEM.

   238 CRC-linked HCPs are already in hcp_part_d_oncology_v1; 36 of them via regorafenib
   or trifluridine specifically. Across all TAs the two stems have 278 distinct
   prescribers over 372 rows. Not one of those people gains or loses Part D presence
   here. What changes is which group the drug is filed under and that it acquires a
   grade -- both currently NULL for every gi_renal row.

   WHY MOVE RATHER THAN DUPLICATE: a colorectal row alongside the gi_renal one would
   double-count every prescriber the moment anything aggregates by drug_group, and the
   two rows would drift the first time one was regraded. gi_renal's remaining members --
   axitinib, cabozantinib, everolimus, lenvatinib, pazopanib, sorafenib, sunitinib -- are
   renal and hepatic agents, so the group is more coherent after the move, not less.

   THE DENORMALISED COPY. hcp_part_d_oncology_v1 carries its OWN drug_group and
   anchor_grade columns, populated at ingest. Updating only the vocabulary table would
   leave 372 hcp-level rows still saying gi_renal -- a stale copy that reads as live.
   Both are updated here, in one transaction. */

BEGIN;

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

/* The denormalised hcp-level copy, kept in step. 372 rows, 278 HCPs. */
UPDATE public.hcp_part_d_oncology_v1 h
SET drug_group = d.drug_group, anchor_grade = d.anchor_grade
FROM public.part_d_oncology_drugs_v1 d
WHERE d.drug_stem = h.drug_stem
  AND d.drug_group = 'colorectal'
  AND (h.drug_group IS DISTINCT FROM d.drug_group
    OR h.anchor_grade IS DISTINCT FROM d.anchor_grade);

COMMIT;


/* ==== VERIFY ===============================================================
   Expected:
     ta_hcpcs_codes gains 4 columns; 0 rows change; is_primary_signal untouched
     part_d_oncology_drugs_v1: colorectal = 5 stems, gi_renal = 7 (was 9)
     hcp_part_d_oncology_v1:   372 rows relabelled, 278 distinct HCPs, none added or lost */

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ta_hcpcs_codes'
  AND column_name IN ('specificity_grade', 'never_upgrades', 'valid_from', 'valid_to',
                      'is_primary_signal', 'approval_year')
ORDER BY column_name;

SELECT drug_group, anchor_grade, count(*) AS stems,
       string_agg(drug_stem, ', ' ORDER BY drug_stem) AS drugs
FROM public.part_d_oncology_drugs_v1
WHERE drug_group IN ('colorectal', 'gi_renal')
GROUP BY 1, 2 ORDER BY 1, 2;

SELECT drug_group, count(*) AS rows, count(DISTINCT hcp_id) AS hcps
FROM public.hcp_part_d_oncology_v1
WHERE drug_stem IN ('regorafenib', 'trifluridine')
GROUP BY 1;
