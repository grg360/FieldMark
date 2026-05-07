# FieldMark — Priority Action Items

**Captured:** May 2, 2026 evening
**Last updated:** May 5, 2026 Tuesday afternoon
**Source:** Mobile testing session, methodology integrity audit, foundation audit, Sunday data foundation expansion, Monday Orbit foundation work + trials pipeline refactor, Tuesday scoring foundation rebuild + clinician filter + TA framework

## Where we are — Tuesday update (May 5)

A long Tuesday session (~10am-5pm Eastern, multiple workstreams) executed three foundation rebuilds and one major architectural workstream. The day moved the platform from "scoring is broken without our knowing" to "scoring runs cleanly on current data, methodology documented, classification reproducible." Documentation framework established for therapeutic area extensibility.

**Tuesday workstreams (in order):**

1. **Stage 2 trial matcher applied to production:** 848 verified site_contact matches landed at confidence 65-95 from the dry-run launched Monday overnight. Spot-check showed 93% accuracy on matched_unique rows. Database now has 8,338 verified HCP-trial linkages (6,345 overall_official + 1,993 site_contact). Top trial-active HCPs validated: Aminah Jatoi (Mayo, 92 trials), Eric Jonasch (MD Anderson, 66), David Spigel (Tennessee Oncology, 61), and many others.

2. **Scoring pipeline rebuild — three layered diagnoses:** Loomba initially read as composite=0/v1.2/unranked despite being a major NAFLD/NASH KOL. Diagnosis cascade revealed (a) all 93,769 score rows were stale relative to OpenAlex enrichment that completed May 4, (b) `fetch_all_rows` was silently truncating large tables due to PostgREST `count='exact'` timeouts, (c) the dedupe step was collapsing 27,600 valid HCPs by name. Fixed via `count='estimated'`, expected_count check with empty-batch termination, and disabled the dedupe step entirely (it was a workaround for messy ingestion that's no longer needed). Final pipeline run produced 87,344 v1.3 rows. **Loomba landed at composite=11.40, pub_velocity=7.69, citation_trajectory=1.01, trial_investigator=22.00.**

3. **Tier classification methodology recovery and refinement:** No tier-assignment script existed in codebase. Methodology recovered from May 1 conversation history: PERCENT_RANK partitioned by therapeutic_area_id with CASE order (dark_horse → established → rising_star → emerging → unranked). Initial UPDATE classified Loomba as dark_horse — wrong, he's an established KOL. Root cause: his `first_pub_year` reads as 2022 due to OpenAlex Phase B inflation (P0 #8j). Refined methodology added career_pubs threshold of 250 as fallback signal: HCPs with career_pubs >= 250 enter established branch even if first_pub_year is unreliable. Loomba now correctly classified established. Final v1.3 tier distribution: Hepatology 74 dark / 341 established / 3,479 rising_star / 6,179 emerging / 15,081 unranked. NSCLC 48/553/4,078/11,763/18,934. Rare Disease 97/128/2,815/0/24,155.

4. **Clinician-vs-researcher affiliation classification (P0 #8k):** Schema migration completed (affiliation_profile JSONB + clinician_score + affiliation_classification + affiliation_profile_calculated_at on hcps). NPI coverage analysis revealed only 18% of established hepatology HCPs have NPI — too sparse for a primary filter. Credentials field essentially empty. Built affiliation_profiler.py that derives classification from OpenAlex affiliation data per-HCP. v1 of script crashed and had per-author scoping bug (Katharine Price at Mayo classified industry due to co-author Roche signal leak). v2 rewrite fixed scoping but discovered second bug: any single "company" institution_type flips entire HCP to industry — Loomba landed industry due to one stray company-tagged institution out of 81 total. v1.1 fix designed: industry classification requires multi-publication evidence (company_count >= 2 AND share >= 30%, OR major-pharma keyword AND publications_matched >= 1, OR industry signal_count >= 3 AND share >= 30%). v1.1 script running at session pause; expected ~2.5 hour runtime to reclassify all 87,000 HCPs.

5. **TA cross-tagging precision (P0 #8m, NEW):** Diagnosed `hcp_therapeutic_areas` table assignment as too permissive — any single concept-tagged paper qualifies HCP regardless of fraction. Designed strength-based methodology: tag HCP into TA if relevant_pubs >= 5 OR relevant_pubs/total_pubs >= 0.30, where relevant means concept score >= 0.4 in TA's core concept list. **Hepatology concept list locked at 35 concepts** across 7 categories (core hepatology, autoimmune/cholestatic, hepatobiliary cancer, pediatric, rare metabolic, drug/biomarkers, viral hepatitis subtypes). Empirically derived from 20-HCP gold cohort + AASLD-domain coverage cross-reference. Verified all 35 concepts exist in OpenAlex with valid publication counts. NSCLC and Rare Disease concept lists pending — empirical derivation queries blocked by database load while affiliation profiler runs.

6. **TA framework documentation (per Garrett's runbook requirement):** Drafted `ta_framework_section.md` (386 lines) with parallel-template structure for all three launch TAs. TA-agnostic assignment logic separated from TA-specific configuration. 10-step runbook for adding new therapeutic areas in future versions. Each TA section uses identical six-subheading order: Purpose / Disease states covered / Disease states NOT covered / Concept list / Inclusion threshold / Validation cohort. Concept names use exact OpenAlex display_name verbatim; validation cohorts include hcp_id alongside name.

7. **Strategic positioning correction:** Garrett surfaced concern about including a Google search verification link on rising-star cards. Decision: no Google link in v1. Position the platform as "deep view of this candidate" (faculty page + recent publications + trial activity + co-author orbit) rather than "verify our work." If the underlying classification is good enough, the depth view is sufficient. Implication: cleanup work (clinician filter, TA precision, established-tier accuracy, industry exclusion) shifts from "ship and document limitations" to "block launch until acceptable accuracy achieved."

8. **Gold cohort lookups for NSCLC and Rare Disease:** Validation cohorts for both TAs queried against the database. NSCLC: 19 of 21 originally-scoped researchers located (Naiyer Rizvi and Vassiliki Papadimitrakopoulou not in database — both industry-transitioned). Rare Disease: 23 of 25 originally-scoped researchers located across 5 buckets (Stuart Orkin in Hemoglobinopathies and Nicholas Antos in CF not in database). PAH bucket originally proposed as 6th Rare Disease bucket dropped from v1 scope after gold cohort lookup found zero PAH researchers in our database — added to "NOT covered" with rationale and v1.5 plan. Heavy fragmentation observed across both cohorts (Tony Mok in 6 rows, Caicun Zhou in 11 rows, Jerry Mendell affiliated with Sarepta Therapeutics in his canonical row).

**OpenAlex coverage state (no change since Monday):**
- 147,600 of 190,724 publications enriched (77% coverage)
- 4% capture for Singal (P0 #8e remains)

**Updated strategic state:**
- Phase 1 (data foundation expansion): complete
- Phase 2 (matching pipeline): Stage 1 + 1.5 + 2 substantially complete (~85% of site_contacts matched, remaining 15K await reconnection-logic improvement)
- Phase 3 (scoring foundation): rebuilt today, v1.3 complete
- Phase 4 (clinician filter): in progress, v1.1 reclassification running
- Phase 5 (TA precision): methodology designed, hepatology concept list locked, NSCLC/Rare Disease pending
- Documentation framework established for extensibility

**New P0 items added Tuesday:**
- **P0 #8m:** TA cross-tagging precision. Methodology designed (strength-based filtering with concept lists). Hepatology concept list locked at 35 concepts. NSCLC and Rare Disease concept derivation pending database load reduction.

**Updated P0 items:**
- **P0 #8a (Established KOLs composite missing)** ✅ RESOLVED via dual-axis tier methodology (career_pubs threshold + first_pub_year fallback). Established tier now contains real KOLs.
- **P0 #8c (Eligibility gate excludes trial-active HCPs)** ✅ RESOLVED via tier rebuild. Trial-active HCPs without 10+ pubs now ranked correctly.
- **P0 #8f (Trials pipeline)** Stage 2 site_contacts substantially complete. 848 high-confidence matches applied; ~15K unmatched site_contacts pending HTTP/2 reconnection logic improvement.
- **P0 #8g (Industry exclusion)** Active workstream via affiliation_profiler.py v1.1. Yang Wang at Pfizer Medicine Design correctly classified industry. Reclassification of all HCPs running.
- **P0 #8j (Phase B career enrichment inflation)** Workaround in place via career_pubs >= 250 threshold for established tier. Proper fix (re-enrich first_pub_year from PubMed first-author year ranges) deferred to v1.5+.
- **P0 #8k (Non-clinician research scientists ranked as rising stars)** Active workstream via affiliation_profiler.py. v1.1 fixes the per-author scoping and over-aggressive industry classification. Will integrate with tier classification once reclassification completes.

**Operational notes:**
- Cursor workflow rule established this session: prompts only for code edits, terminal execution in Garrett's visible terminal. After multiple incidents of Cursor running scripts in background despite instructions, prompt headers now include explicit "RULES FOR THIS TASK" forbidding execution and architectural changes without approval.
- Two transient ConnectionTerminated errors on stream_id 19999 during affiliation_profiler runs — single-row failures recovered by try/except, do not block the run.

**Tuesday end-of-day items:**
- Watch affiliation_profiler v1.1 run completion (ETA late Tuesday evening)
- Validate Loomba and Yang Wang classifications post-v1.1
- This priority doc update (in progress)
- Methodology doc decision log entry (drafted, pending integration)
- TA framework section (drafted, pending integration into methodology doc)

---
