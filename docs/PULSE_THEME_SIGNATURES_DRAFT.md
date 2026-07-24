# Pulse theme signatures — NSCLC — DRAFT FOR CURATION

Draft only. Concept lists are taken from real clusters (`NSCLC_CONCEPT_CLUSTERS.md`, volumes in
parens). Keyword lists are drawn from general domain knowledge, **not** from your corpus, and are
the part most in need of correction — particularly for agents that emerged after early 2026.

Conventions:
- **Method** = `concept` | `keyword` | `mesh` | `hybrid` (concept primary, keyword boost)
- Keywords match case-insensitively against `title`, and `abstract` where noted
- Every keyword must be unambiguous in an NSCLC corpus. Reject anything that could match
  incidentally (e.g. bare "MET", bare "RET")

---

## Precedence (needed because themes share vocabulary)

Overlapping themes resolve in this order. **This is a guess and needs your judgment — it is the
single most likely source of wrong labels.**

1. **Specific agent beats setting.** A pub matching `sotorasib` goes to KRAS (3) even if it also
   matches `adjuvant`.
2. **Trial acronym is decisive.** ADAURA -> 18, PACIFIC -> 13, CheckMate 816 / AEGEAN /
   KEYNOTE-671 -> 12, IMpower010 / ALINA -> 18.
3. **Within C8** (surgical/perioperative): `neoadjuvant|perioperative|chemoimmunotherapy` -> 12;
   `adjuvant` + targeted/IO agent -> 18; pure operative technique -> 14.
4. **Within C7** (radiation/metastatic): `oligometastatic|oligoprogressive|metastasectomy` -> 17;
   `brain|CNS|leptomeningeal` -> 16; otherwise radiation technique -> 15.
5. Multi-label is allowed in `publication_theme_v1`; precedence sets `is_primary` only.

---

## EXCLUSIONS (not themes — must not compete for labels)

- **C1.2, C1.3, C1.4** — pure study-design vocabulary (hazard ratio, proportional hazards,
  nomogram, ROC, univariate/multivariate). Volume 32,638. Unblocklisted these would be the #1
  "theme" in NSCLC. **Exception: C1.1 is retained for theme 23.**
- **C6.1** — Adenocarcinoma (13,190), Lung (11,667). Histology-generic, non-thematic.
- **Homonyms** — `Stage (stratigraphy)`, `Paleontology`, and note also `Infiltration (HVAC)`,
  `Refractory (planetary science)`, `Context (archaeology)`, `Incidence (geometry)`,
  `Docking (animal)` appear in real clusters and are OpenAlex disambiguation artifacts. Harmless
  where they sit but should not enter signatures.
- **Publication types excluded from counts:** Published Erratum, Retracted Publication,
  English Abstract.

---

## 0. EGFR Resistance Mechanisms — `hybrid`
- **Concepts:** Osimertinib (2,901), T790M (2,143), Acquired resistance (535), Drug resistance (846)
- **Keywords:** C797S, MET amplification, bypass signaling, small cell transformation,
  histologic transformation, third-generation EGFR, resistance to osimertinib
- Note: C4.5 (rec 48%) is the highest-recency sub-cluster in C4 — this theme is genuinely active.

## 1. EGFR-Mutant NSCLC Treatment — `concept`
- **Concepts:** Epidermal growth factor receptor (6,620), Tyrosine kinase (2,723),
  Tyrosine-kinase inhibitor (1,662), Gefitinib (2,561), Erlotinib (2,180), Afatinib (1,166),
  Receptor tyrosine kinase (598), EGFR inhibitors (1,115), Erlotinib Hydrochloride (461)
- **Keywords:** dacomitinib, icotinib, uncommon EGFR, atypical EGFR, L861Q, G719X
- Note: C4.3 is your lowest-recency sub-cluster (rec 23%). Expect a declining curve — correct,
  not a bug.

## 2. EGFR Exon 20 Insertion — `keyword` (title match: 423)
- **Keywords:** exon 20 insertion, exon20ins, amivantamab, mobocertinib, poziotinib,
  sunvozertinib, zipalertinib, CLN-081
- **VERIFY:** agents post-2025 almost certainly missing.

## 3. KRAS-Mutant NSCLC Therapeutics — `hybrid` (title match: 375)
- **Concepts:** KRAS (3,205) — support only, spans 30 years and is not G12C-specific
- **Keywords:** G12C, G12D, sotorasib, adagrasib, divarasib, olomorasib, AMG 510, MRTX849,
  pan-RAS, SOS1, SHP2
- Note: G12C plateaued in your corpus (82/77/73 in 2023–25). Expect "Steady", not "Emerging".

## 4. ALK and ROS1 Targeted Therapy — `concept` (cleanest match in the set)
- **Concepts:** entire C10 — Anaplastic lymphoma kinase (2,410), Crizotinib (2,283),
  Alectinib (933), ALK inhibitor (892), Ceritinib (523), ROS1 (1,201), Fusion gene (544),
  Fluorescence in situ hybridization (332)
- **Keywords:** lorlatinib, brigatinib, entrectinib, repotrectinib, ensartinib, taletrectinib
- Note: rec 26% — lowest in the corpus. Mature theme; declining curve is the true signal.

## 5. Rare Oncogenic Drivers — `keyword` (title match: 534)
- **Keywords:** MET exon 14, METex14, capmatinib, tepotinib, savolitinib, RET fusion,
  selpercatinib, pralsetinib, NRG1 fusion, BRAF V600, dabrafenib, trametinib, encorafenib,
  ERBB2 mutation, HER2 mutation
- **Do NOT** use bare `MET`, `RET`, or `HER2` — false-positive rate is unacceptable.

## 6. Antibody-Drug Conjugates — `keyword` (title match: 276)
- **Keywords:** antibody-drug conjugate, antibody drug conjugate, deruxtecan, datopotamab,
  patritumab, telisotuzumab, tusamitamab, sacituzumab, TROP2, TROP-2, B7-H3, ifinatamab,
  anetumab, mesothelin ADC
- **THE emerging theme in your corpus:** 15 -> 20 -> 36 -> 46 -> 82, annualizing ~96 for 2026.
  Sustained near-doubling. This is the story Pulse should be telling, not KRAS.
- Overlap with 5: trastuzumab deruxtecan matches both. Precedence rule 1 sends it here.

## 7. Immunotherapy Biomarkers — `hybrid`
- **Concepts:** PD-L1 (1,531), Immune checkpoint (2,157), Biomarker (3,174)
- **Keywords:** tumor mutational burden, TMB, STK11, KEAP1, tumor proportion score,
  combined positive score, TPS, CPS, PD-L1 expression
- Note: `Biomarker` is broad — consider requiring a second signature hit.

## 8. Immune Checkpoint Inhibitor Combinations — `hybrid`
- **Concepts:** Nivolumab (2,734), Pembrolizumab (2,717), Atezolizumab (1,151),
  Ipilimumab (693), Durvalumab (950), Combination therapy (459)
- **Keywords:** chemoimmunotherapy, dual checkpoint, tremelimumab, cemiplimab, tislelizumab,
  toripalimab, sintilimab, CTLA-4 combination
- Overlap with 10 and 13 — both live in C3.1. See precedence.

## 9. Immunotherapy Resistance Mechanisms — `keyword` — **THIN, FLAGGED**
- **Keywords:** primary resistance, acquired resistance to immunotherapy, hyperprogression,
  immunotherapy resistance, resistance to PD-1, resistance to PD-L1, immune evasion,
  immune escape
- No dedicated cluster. Support unmeasured. **Run a title count before committing** — this may
  be a fold candidate like Persisters.

## 10. Immune-Related Adverse Event Management — `hybrid`
- **Concepts:** Pneumonitis (995), Interstitial lung disease (377), Adverse effect (4,155),
  Discontinuation (686)
- **Keywords:** immune-related adverse event, irAE, checkpoint inhibitor pneumonitis,
  myocarditis, immune colitis, thyroiditis, hypophysitis
- `Adverse effect` is very broad — require a second hit, or restrict to keyword-only.

## 11. Tumor Microenvironment & Immune Biology — `concept`
- **Concepts:** Tumor microenvironment (2,884), CD8 (1,460), Cytotoxic T cell (1,080),
  T cell (788), Tumor-infiltrating lymphocytes (328), Stromal cell (461), Macrophage (186),
  Cytokine (294), Chemokine (242), Immunity (253)
- **Keywords:** tertiary lymphoid structure, single-cell RNA, scRNA-seq, spatial transcriptomics
- Note: C5.1 rec 51% — highest-recency cluster in the corpus.

## 12. Perioperative Immunotherapy in Resectable NSCLC — `hybrid`
- **Concepts:** Neoadjuvant therapy (1,040), Chemoimmunotherapy (505), Pathological (1,491),
  Complete response (165), Perioperative (781)
- **Keywords:** pathologic complete response, major pathologic response, pCR, MPR,
  CheckMate 816, AEGEAN, KEYNOTE-671, NEOTORCH, neoadjuvant nivolumab, perioperative durvalumab
- Note: C8.2 rec 54% — the highest-recency sub-cluster in the entire corpus. Strong candidate for
  a genuine "Increasing attention" label at launch.

## 13. Stage III NSCLC Multimodality — `hybrid`
- **Concepts:** Chemoradiotherapy (1,209), Durvalumab (950)
- **Keywords:** stage III, PACIFIC trial, consolidation immunotherapy, unresectable stage III,
  LAURA
- Durvalumab is shared with 8 — precedence rule 2 (trial acronym) resolves most cases.

## 14. Early-Stage NSCLC Surgical Management — `hybrid`
- **Concepts:** Surgical oncology (1,657), Pneumonectomy (889), Resection (496),
  Cardiothoracic surgery (433), Wedge resection (296), Lymph node (1,368),
  Mediastinal lymph node (294), Dissection (medical) (305)
- **Keywords:** segmentectomy, lobectomy, sublobar resection, VATS, video-assisted thoracoscopic,
  RATS, robotic-assisted, JCOG0802, CALGB 140503
- Note: `segmentectomy` and `lobectomy` are ABSENT from OpenAlex concepts despite being central
  to this theme — a clear demonstration of why per-theme signature types are necessary.

## 15. SBRT and Radiation Oncology — `hybrid`
- **Concepts:** Radiation therapy (5,707), Radiosurgery (999), Toxicity (701)
- **Keywords:** SBRT, stereotactic body radiotherapy, SABR, ablative radiotherapy, proton therapy,
  hypofractionated

## 16. CNS Metastases Management — `hybrid`
- **Concepts:** Brain metastasis (1,576), Radiosurgery (999), Magnetic resonance imaging (295)
- **Keywords:** leptomeningeal, whole brain radiotherapy, WBRT, CNS metastases, intracranial
  response, CNS-active, brain penetrant
- Radiosurgery shared with 15 — precedence rule 4.

## 17. Oligometastatic NSCLC Local Therapy — `keyword` — **THIN**
- **Concepts:** Metastasectomy (333), Primary tumor (605)
- **Keywords:** oligometastatic, oligoprogressive, oligoprogression, local consolidative therapy,
  LCT, SINDAS, oligorecurrent
- Support unmeasured. Count before committing.

## 18. Adjuvant and Targeted Therapy in Early-Stage — `hybrid`
- **Concepts:** Adjuvant (952), Adjuvant therapy (462)
- **Keywords:** ADAURA, adjuvant osimertinib, IMpower010, adjuvant atezolizumab, ALINA,
  adjuvant alectinib, KEYNOTE-091, adjuvant chemotherapy
- Heavy overlap with 12 and 14. Trial acronyms are the reliable discriminator.

## 19. Liquid Biopsy and ctDNA — `concept` (excellent match)
- **Concepts:** Liquid biopsy (1,152), Biopsy (1,365), Circulating tumor cell (559),
  Circulating tumor DNA (338), Digital polymerase chain reaction (318), Microvesicles (466),
  DNA sequencing (385), Concordance (797)
- **Keywords:** minimal residual disease, MRD, ctDNA clearance, molecular residual disease,
  plasma genotyping

## 20. Drug-Tolerant Persisters — **FOLD (44 pubs corpus-wide)**
- Merge into 0 (EGFR Resistance) or 9 (IO Resistance). Do not ship as a standalone theme.
- If retained anyway: autophagy (664) is the only meaningful concept anchor.

## 21. SCLC Biology and Treatment — **SCOPE DECISION NEEDED**
- Only 231 + 103 concept-tagged pubs. This is an NSCLC therapeutic area; SCLC appears incidentally.
- If in scope: **Keywords:** small cell lung cancer, SCLC, lurbinectedin, tarlatamab, DLL3,
  ASCL1, NEUROD1, extensive-stage
- Decide before writing the signature.

## 22. Mesothelioma — **SCOPE DECISION NEEDED**
- **Concepts:** Mesothelioma (1,196), Pleural effusion (555), Malignant pleural effusion (316)
- **Keywords:** BAP1, pleural mesothelioma, MPM, pleurectomy, asbestos
- Better-supported than SCLC (1,196 pubs), but the same in-scope question applies.

## 23. Real-World Outcomes and Population Research — `hybrid`
- **THE legitimate use of C1.** Do not exclude C1.1 for this theme.
- **Concepts:** Retrospective cohort study (4,055), Cohort (3,549), Population (2,950),
  Cancer registry (402), Propensity score matching (1,013), Observational study (365),
  Medical record (239), Comorbidity (269)
- **Keywords:** SEER, NCDB, National Cancer Database, Veterans Affairs, Flatiron, real-world
  evidence, real-world outcomes, claims data
- Risk: concepts alone will over-capture (any retrospective study). Consider requiring a keyword
  hit and using concepts only as a boost.

## 24. Lung Cancer Screening and Health Disparities — `hybrid`
- **Concepts:** Lung cancer screening (393), Incidence (geometry) (1,463), Epidemiology (576)
- **Keywords:** low-dose CT, LDCT, screening eligibility, USPSTF, NLST, NELSON, disparities,
  racial disparities, socioeconomic, access to care, stage migration, second primary
- Two distinct ideas fused in one canonical (screening + disparities). Consider splitting.

---

## Open questions for curation

1. Themes 21 and 22 — in scope for an NSCLC TA at all?
2. Theme 20 — confirm the fold target.
3. Themes 9 and 17 — run title counts; fold if under ~100.
4. Theme 24 — split screening from disparities?
5. Precedence rules 3 and 4 — do they match how an MSL would categorize?
6. Every keyword list needs a pass for post-2025 agents.
