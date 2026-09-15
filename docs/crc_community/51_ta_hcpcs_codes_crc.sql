/* ==== 51. COLORECTAL INTO ta_hcpcs_codes ====
   Ten codes. Content from the advisor grading; the same vocabulary the composite
   in blocks 40 and 41 measures.

   TWO THINGS THIS FILE DOES, and they are worth separating because only one of
   them is about tiers.

   1. IT GIVES BLOCK 52 ITS CODE LISTS. Branch 3 reads pattern_role from here, so
      the composite is defined in data and the view body carries no HCPCS
      literals.

   2. IT TURNS THE ADMINISTERED-VOLUME SURFACE ON FOR COLORECTAL. Three RPCs
      INNER JOIN this table -- community_practice_profile(uuid),
      hcp_administered_volume(uuid,uuid) and administered_therapy(uuid,uuid) --
      and colorectal has had ZERO rows in it, so all three have been answering
      about an empty set for every colorectal HCP.

      ONE CORRECTION TO THE BRIEF HERE, and it is in our favour.
      hcp_administered_volume does NOT currently return no_set_activity on the
      empty join; it returns 'no_code_set', via an explicit guard added at
      correction 3:

          IF v_set_codes_total = 0 THEN RETURN ... 'state', 'no_code_set'

      whose own comment says an empty ta_hcpcs_codes "collapses cannot-assess
      into assessed-as-nothing and states something false about every HCP in the
      area". So that defect was already found and already fixed, and colorectal
      has been reading cannot-assess rather than assessed-as-nothing. This file
      still changes the answer -- from 'no_code_set' to real claims -- but it is
      not repairing a live lie, and block 53 reports the before/after rather than
      claiming one.

   ------------------------------------------------------------------------
   NO CODE IN THIS TABLE IS standalone_attribution_eligible.

   Colorectal has no single-molecule anchor. That is not a gap in the grading,
   it is the finding that forced the practice-pattern model: the two codes
   designated to carry `strict` (J9303 panitumumab, J9400 ziv-aflibercept) and
   the `dominant` J9055 cetuximab have ZERO rows in the CMS practitioner file
   for 2021, 2022 and 2023. And it must be visible IN THE DATA rather than only
   in a comment, because a comment cannot be queried and a future grader adding
   an eleventh code will read the column, not this paragraph.

   Every row below therefore sets the column explicitly to false rather than
   leaning on the DEFAULT. A column that is false because nobody thought about
   it and a column that is false because somebody decided it are the same byte
   and different facts; writing it makes this the second one.
   ------------------------------------------------------------------------

   WHY BEVACIZUMAB IS strict AND STILL NOT STANDALONE. The grade says the agent
   is colorectal-specific in combination -- which it is, in this composite.
   Attribution strength is the other axis and it is measured, not assumed:
   J9035 has 1,840 national billers of whom 15 are oncology. Anchoring on
   bevacizumab alone admits an ophthalmology practice ahead of a colorectal one.
   Wet AMD is bevacizumab's other life and it is the larger one by provider
   count.

   THE BIOSIMILARS ARE NOT OPTIONAL. Q5107, Q5118, Q5126 and Q5129 carry the
   same grade and the same role as J9035, because a board built on the reference
   product alone is hollow by an amount nobody has measured. Block 53 measures
   it. Treating the five as one family is the rule in blocks 40 and 41 too.

   LEUCOVORIN AND THE PUMP ARE CORROBORATORS, never_upgrades TRUE, and the
   reason is a measurement rather than a preference: requiring J0640 collapses
   the FOLFOX-like population roughly six-fold -- 23 against 140 on the same
   data. Leucovorin is cheap and frequently bundled into the administration
   rather than billed separately, so its ABSENCE is weak evidence it was not
   given. A gate built on it measures billing practice, not clinical practice.

   ON THE DATES. valid_from is the date the CODE became billable, and it is
   load-bearing only inside the data window we hold (program years 2021-2023).
   Two of these dates bind and come from block 05's own text: Q5126 from
   2023-01-01 and Q5129 from 2023-04-01. Rounding Q5129 to "2023" would claim a
   quarter of billing that could not have happened. The rest are recorded at the
   precision we are confident of and sit years before the window, so they
   constrain nothing today -- recorded rather than left NULL because NULL here
   would read as "not curated", which is the one thing these rows are not.
   valid_to is NULL throughout: every code is still current. */

INSERT INTO public.ta_hcpcs_codes
  (therapeutic_area_id, hcpcs_code, code_description, code_category,
   is_primary_signal, requires_specialty_match,
   specificity_grade, never_upgrades, standalone_attribution_eligible,
   pattern_role, valid_from, valid_to, notes)
SELECT ta.id, v.code, v.descr, v.category,
       v.primary_signal, v.specialty_match,
       v.grade, v.never_up, false,          /* standalone: false, every row, explicitly */
       v.role, v.valid_from, NULL, v.note
FROM public.therapeutic_areas ta
CROSS JOIN (VALUES

  /* ---- VEGF family. One family, five codes, one grade, one role. ---- */
  ('J9035', 'Bevacizumab injection',                  'drug_admin', true,  false,
   'strict', false, 'vegf', DATE '2005-01-01',
   'Reference product. strict for colorectal IN COMBINATION; standalone FALSE because '
   'bevacizumab has 1,840 national billers of whom 15 are oncology -- alone it admits an '
   'ophthalmology practice ahead of a colorectal one.'),
  ('Q5107', 'Bevacizumab-awwb biosimilar injection',  'drug_admin', true,  false,
   'strict', false, 'vegf', DATE '2019-07-01',
   'Mvasi. Same family, same grade, same role as J9035 -- anchoring on the reference '
   'product alone is hollow, and block 53 measures by how much.'),
  ('Q5118', 'Bevacizumab-bvzr biosimilar injection',  'drug_admin', true,  false,
   'strict', false, 'vegf', DATE '2020-01-01',
   'Zirabev. See Q5107.'),
  ('Q5126', 'Bevacizumab-maly biosimilar injection',  'drug_admin', true,  false,
   'strict', false, 'vegf', DATE '2023-01-01',
   'Alymsys. Date binds inside the data window: billable from 2023-01-01, so it cannot '
   'appear in a 2021 or 2022 claim.'),
  ('Q5129', 'Bevacizumab-adcd biosimilar injection',  'drug_admin', true,  false,
   'strict', false, 'vegf', DATE '2023-04-01',
   'Vegzelma. THE DATE THAT FORCED THE COLUMN: valid from 2023-04-01, so approval_year '
   '2023 would have claimed a quarter of billing that could not have happened.'),

  /* ---- Backbone. Either one satisfies the backbone limb. ---- */
  ('J9263', 'Oxaliplatin injection',                  'drug_admin', true,  false,
   'cross_indication', false, 'backbone', DATE '2004-01-01',
   'FOLFOX backbone. Cross-indication: also gastric and pancreatic. 371 providers in the '
   'source -- it survives whatever suppresses the anchor codes.'),
  ('J9206', 'Irinotecan injection',                   'drug_admin', true,  false,
   'cross_indication', false, 'backbone', DATE '1998-01-01',
   'FOLFIRI backbone. Cross-indication: also small-cell lung, gastric.'),

  /* ---- Fluoropyrimidine. The required partner limb. ---- */
  ('J9190', 'Fluorouracil injection',                 'drug_admin', true,  false,
   'cross_indication', false, 'fluoropyrimidine', DATE '1998-01-01',
   'The fluoropyrimidine limb. Cross-indication: also breast, gastric, head and neck. '
   '685 providers in the source.'),

  /* ---- Corroborators. never_upgrades TRUE -- they may accompany a tier, never cause one. ---- */
  ('J0640', 'Leucovorin calcium injection',           'drug_admin', false, true,
   'supporting', true,  'corroborator', DATE '1998-01-01',
   'NEVER A GATE. Requiring J0640 collapses the FOLFOX-like population roughly six-fold '
   '(23 against 140, same data). Cheap and frequently bundled into the administration '
   'rather than billed separately, so its ABSENCE is weak evidence it was not given -- a '
   'gate built on it measures billing practice, not clinical practice.'),
  ('96416', 'Chemo IV infusion, prolonged, pump initiation', 'drug_admin', false, true,
   'supporting', true,  'corroborator', DATE '2006-01-01',
   'The 46-48 hour infusional 5-FU pump -- the administration signature of FOLFOX and '
   'FOLFIRI. Corroborates strongly and gates nothing, for the same billing-practice '
   'reason as J0640.')

) AS v(code, descr, category, primary_signal, specialty_match,
       grade, never_up, role, valid_from, note)
WHERE ta.slug = 'colorectal-cancer'
ON CONFLICT (therapeutic_area_id, hcpcs_code) DO UPDATE
  SET code_description                = EXCLUDED.code_description,
      code_category                   = EXCLUDED.code_category,
      is_primary_signal               = EXCLUDED.is_primary_signal,
      requires_specialty_match        = EXCLUDED.requires_specialty_match,
      specificity_grade               = EXCLUDED.specificity_grade,
      never_upgrades                  = EXCLUDED.never_upgrades,
      standalone_attribution_eligible = EXCLUDED.standalone_attribution_eligible,
      pattern_role                    = EXCLUDED.pattern_role,
      valid_from                      = EXCLUDED.valid_from,
      valid_to                        = EXCLUDED.valid_to,
      notes                           = EXCLUDED.notes;

/* ON is_primary_signal AND requires_specialty_match, which this file has to set because
   is_primary_signal DEFAULTS TO TRUE and a default would have decided it silently.

   These two are the OLD axis and they mean something different from the new grades.
   Their live reader is hcp_administered_volume, where is_primary_signal AND
   code_category = 'drug_admin' selects the "primary drug agents" panel: the per-code
   rows, the 3-year paid total, and the seam percentage against practice scale. So the
   question the flag actually answers is "is this one of the chemotherapy agents whose
   dollars are this TA's administered volume", not "is this code indication-specific".

   Answered that way: the eight agents are true, the two corroborators are false.
   Leucovorin is a rescue agent and the pump is an administration service; counting
   either as primary colorectal drug volume would inflate the seam figure with dollars
   that are not the therapy. requires_specialty_match mirrors it, following the live
   nsclc convention where the two are exact complements across all 49 rows. */

/* ==== VERIFY ====
   Expect 10 rows, all standalone FALSE, roles 5/2/1/2, and exactly two codes carrying
   never_upgrades. */
SELECT t.hcpcs_code, t.pattern_role, t.specificity_grade,
       t.standalone_attribution_eligible AS standalone, t.never_upgrades,
       t.is_primary_signal AS primary_sig, t.valid_from
FROM public.ta_hcpcs_codes t
JOIN public.therapeutic_areas ta ON ta.id = t.therapeutic_area_id
WHERE ta.slug = 'colorectal-cancer'
ORDER BY t.pattern_role, t.hcpcs_code;

SELECT count(*) AS crc_codes,
       count(*) FILTER (WHERE standalone_attribution_eligible) AS standalone_eligible,
       count(*) FILTER (WHERE never_upgrades) AS never_upgrades,
       count(*) FILTER (WHERE pattern_role = 'vegf') AS vegf,
       count(*) FILTER (WHERE pattern_role = 'backbone') AS backbone,
       count(*) FILTER (WHERE pattern_role = 'fluoropyrimidine') AS fluoropyrimidine,
       count(*) FILTER (WHERE pattern_role = 'corroborator') AS corroborator
FROM public.ta_hcpcs_codes t
JOIN public.therapeutic_areas ta ON ta.id = t.therapeutic_area_id
WHERE ta.slug = 'colorectal-cancer';

/* Nothing else moved: the other three TAs keep their counts and stay ungraded. */
SELECT ta.slug, count(*) AS codes,
       count(*) FILTER (WHERE t.pattern_role IS NOT NULL) AS roled,
       count(*) FILTER (WHERE t.standalone_attribution_eligible) AS standalone
FROM public.ta_hcpcs_codes t
JOIN public.therapeutic_areas ta ON ta.id = t.therapeutic_area_id
GROUP BY ta.slug ORDER BY ta.slug;
