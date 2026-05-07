# P0 Status Updates — May 5 Tuesday

The following P0 items have status changes from today's work. These are change instructions for editing the priority action items doc, not a replacement document.

## P0 #8a — Established KOLs composite missing

**Heading change:**
```
### 8a. Established KOLs composite missing from implementation ✅ RESOLVED via tier methodology rebuild (May 5 Tuesday)
```

**Add to top of body (before existing "Problem"):**
```
**Status update May 5 Tuesday:** Resolved via the v1.3 scoring rebuild and tier classification methodology refresh. The dual-composite architecture originally proposed (parallel `established_composite_score` and `established_tier` columns) was not the path taken; instead, the existing `composite_score` and `tier` columns were retained with refined CASE logic. The established tier branch now uses career_pubs >= 250 as a fallback signal when first_pub_year is unreliable due to OpenAlex Phase B inflation (P0 #8j). Final v1.3 distribution: 341 established HCPs in Hepatology, 553 in NSCLC, 128 in Rare Disease — populated with real recognized KOLs (Loomba, Sanyal, Chalasani, Heymach, Kantarjian, etc.). The "established tier is empty cohort" problem is solved. The original proposal of dual-composite parallel columns may still be valuable in v1.5+ if Established KOLs view requires different score components, but is not v1 launch-blocking.
```

## P0 #8c — Eligibility gate excludes trial-active HCPs

**Heading change:**
```
### 8c. Eligibility gate excludes trial-active HCPs ✅ RESOLVED via tier rebuild (May 5 Tuesday)
```

**Add to top of body:**
```
**Status update May 5 Tuesday:** Resolved via the v1.3 scoring rebuild. The tier classification now correctly places trial-active HCPs based on their normalized composite score, regardless of whether they meet the original 10-publication eligibility gate. HCPs with verified trials but few publications now appear in their appropriate tiers when their composite score warrants. Validation: top trial-active HCPs by trial count (Aminah Jatoi, Eric Jonasch, David Spigel, Aung Naing) are correctly classified across established/dark_horse/rising_star based on their composite scores rather than excluded entirely.
```

## P0 #8f — Trials pipeline

**Heading change (extend existing):**
```
### 8f. Trials pipeline architectural refactor — Stage 1 + 1.5 + 2 substantially complete (UPDATED May 5 Tuesday)
```

**Add to top of body:**
```
**Status update May 5 Tuesday:** Stage 2 matcher dry-run from Monday overnight produced 28,500 proposals across categorical buckets. 848 high-confidence matches (matched_unique at 95, plus institution-disambiguated and city-disambiguated buckets) applied to production trial_investigators table after spot-check showed 93% accuracy. Database now has 8,338 verified HCP-trial linkages (6,345 overall_official + 1,993 site_contact). Top trial-active HCPs validated (Aminah Jatoi 92 trials, Eric Jonasch 66, David Spigel 61). Remaining 15K unmatched site_contacts pending HTTP/2 reconnection logic improvement to handle long-running matcher sessions.
```

## P0 #8g — Industry exclusion gap

**Heading change:**
```
### 8g. Industry exclusion gap — pharma affiliations slipping through (ACTIVE WORKSTREAM May 5 Tuesday)
```

**Add to top of body:**
```
**Status update May 5 Tuesday:** Active workstream via affiliation_profiler.py. v1.1 of the script (running at session pause) addresses two earlier bugs: (1) per-author scoping fixed so co-author affiliations don't leak (Katharine Price at Mayo no longer falsely classified industry due to a Roche co-author); (2) industry classification thresholds tightened to require multi-publication evidence rather than single-occurrence company institution flag (Loomba no longer falsely classified industry due to one stray company-tagged institution out of 81 total). Yang Wang at Pfizer Medicine Design correctly classified industry under v1.1 logic. Full reclassification of 87,000 HCPs in progress; ETA late Tuesday evening. Once complete, classification will be integrated into tier classification UPDATE to exclude industry from rising_star and dark_horse cohorts.
```

## P0 #8k — Non-clinician research scientists ranked as rising stars

**Heading change:**
```
### 8k. Non-clinician research scientists ranked as clinical rising stars (ACTIVE WORKSTREAM May 5 Tuesday)
```

**Add to top of body:**
```
**Status update May 5 Tuesday:** Active workstream. NPI-based filtering analysis revealed only 18% of established hepatology HCPs have NPI numbers — too sparse for reliable clinician filter. Credentials field essentially empty. Built affiliation_profiler.py to derive clinician_score from OpenAlex affiliation data per-HCP. Two iterations of bug fixing (per-author scoping leak, then over-aggressive industry classification on single company-typed institution). v1.1 designed with multi-publication evidence requirement and major-pharma keyword check. Full reclassification running; will integrate with tier classification once complete.

The classification produces five buckets: clinician (positive clinician_score, primarily clinical signals), mixed (balanced clinical + research signals), researcher (primarily research signals), industry (multi-publication industry evidence), insufficient_data (affiliation strings missing or unmatched, ~46% of cohort due to OpenAlex data sparsity for some HCPs). 

Open methodological question: how to handle the insufficient_data bucket. Options: (a) exclude from rising_star/dark_horse feeds (conservative, misses real clinicians whose data wasn't captured); (b) include in feeds but flag for manual verification; (c) supplement with NPPES backfill (P0 #8l) which would directly address the data sparsity. Decision deferred until classification completes and we can size each bucket against the rising_star cohort.
```

## P0 #8m — TA cross-tagging precision (NEW)

**New section to add after P0 #8n:**

```
### 8m. TA cross-tagging precision — concept-based assignment too permissive (NEW May 5 Tuesday)

**Problem:** The `hcp_therapeutic_areas` table assigns HCPs into therapeutic areas based on OpenAlex publication-level concept tagging, but the threshold is too permissive — any single concept-tagged publication qualifies the HCP for the TA. Result: hepatology cohort contains substantial cross-tagged researchers from diabetes, cardiology, obesity research, dermatology, and other adjacent fields whose publications happen to mention NASH metabolic concepts. Top hepatology established list includes Yanovski (NIH pediatric obesity), DeFronzo (UTSW diabetes), Yosipovitch (Miami dermatology), Schmitz (Hershey cancer survivorship), Eckel (Colorado lipid metabolism), and Richard Lee at Ionis Pharmaceuticals (industry researcher). Approximately 4-5 of the top 20 hepatology rising stars are genuinely hepatology-focused; the rest are TA cross-tagged.

**Empirical evidence (May 5 Tuesday diagnostic):** Of 27K hepatology-tagged HCPs, top concepts in their publications include genuine hepatology (Fatty liver 9,959 distinct HCPs, Steatohepatitis 5,077, NAFLD 3,773, Cirrhosis 2,892) but also cross-cutting noisy concepts (Endocrinology 6,442, Diabetes mellitus 2,637, Obesity 2,211, Metabolic syndrome 2,329). The strength_score column on hcp_therapeutic_areas exists but is essentially unused (19 of 93,769 rows have positive values, max 50, average 0.01).

**Methodology designed:** For each HCP, compute relevant_pubs = count of publications where any concept in TA's core list has score >= 0.4. Tag HCP into TA if relevant_pubs >= 5 OR relevant_pubs / total_pubs >= 0.30. The two-condition threshold accommodates prolific researchers (5+ TA-relevant pubs regardless of fraction) and focused early-career researchers (high concentration with smaller body of work).

**Hepatology concept list locked:** 35 concepts across 7 categories — core hepatology indications (17), autoimmune/cholestatic specific (3), hepatobiliary cancer (3), pediatric hepatology (3), rare metabolic (1), drug/biomarker high-specificity (3), viral hepatitis subtypes (5). Empirically derived from 20-HCP gold cohort spanning Loomba/Sanyal/Chalasani (NAFLD/NASH), Carey/Eaton/Bowlus/Levy/Kowdley/Hirschfield (PBC/PSC), Chung (viral hepatitis), Squires/Mysore (pediatric), Gores/Singal (HCC). All 35 concept names verified to exist in OpenAlex with valid publication counts.

**NSCLC and Rare Disease concept lists pending:** Empirical derivation queries against gold cohorts blocked by database load while affiliation_profiler runs. NSCLC validation cohort located (19 of 21 in database). Rare Disease validation cohort located (23 of 25 across 5 buckets — PAH bucket dropped from v1 after gold cohort lookup found zero researchers in database).

**Why P0:** Without TA precision, the rising-star feed surfaces non-TA researchers prominently. An MSL viewing the hepatology rising stars feed sees diabetes researchers and dermatologists in the top 20. Combined with the clinician filter (P0 #8k), this is the upstream cleanup that determines whether the v1 product is credible to MSLs.

**Dependencies:** Concept derivation queries require database load reduction (waiting on affiliation_profiler completion). Application of strength_score values to hcp_therapeutic_areas requires concept lists locked for all three launch TAs.

**Estimated effort:** 1-2 hours per TA for concept derivation + verification + spot-check once database is available. Strength_score application is one SQL UPDATE per TA. Filter integration into rising star query is small. Total: half-day of focused work once unblocked.
```

## Bottom-of-doc maintenance

The "What's recommended for tonight" section at the bottom (lines 897-958 of current doc) should be removed or replaced — it's stale Monday recommendations. Suggest replacing with:

```
## What's recommended next session

1. Validate affiliation_profiler v1.1 output once complete. Spot-check Loomba (should be clinician), Yang Wang (should be industry), random samples from each bucket.
2. Integrate clinician_score / affiliation_classification into tier classification UPDATE — exclude industry, deprioritize researcher, keep clinician + mixed.
3. Run NSCLC and Rare Disease concept derivation queries (gold cohort against publications.openalex_concepts).
4. Lock NSCLC and Rare Disease concept lists, document in TA framework section.
5. Apply strength_score values to hcp_therapeutic_areas using locked concept lists.
6. Modify rising star query to filter by strength_score threshold, exclude non-clinicians.
7. Spot-check the resulting cleaned cohort against validation cohorts.
8. Integrate TA framework section + May 5 decision log entry into methodology doc.
```
