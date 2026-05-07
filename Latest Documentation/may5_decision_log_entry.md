#### May 5 Tuesday session — Stage 2 trial matcher applied, scoring pipeline rebuild, tier classification recovery and refinement, clinician-vs-researcher workstream, TA cross-tagging methodology design

A long focused Tuesday session executed three major workstreams: (1) applied 848 verified site_contact matches from the Stage 2 trial matcher dry-run launched Monday overnight; (2) diagnosed and rebuilt the scoring pipeline foundation, recovering from a stale-score state where every HCP carried v1.2 composite scores calculated before OpenAlex enrichment completed; (3) designed and partially executed the clinician-vs-researcher affiliation classification workstream addressing P0 #8k. A fourth workstream — TA cross-tagging precision (P0 #8m, newly captured) — was diagnosed and methodologically scoped, with the empirical concept derivation completed for Hepatology and structural framework drafted for NSCLC and Rare Disease.

The session was bracketed by a critical product positioning correction: the rising-star feed must be useful enough that MSLs trust the surface, not so noisy that they require external verification. This shifted the cleanup priorities from "ship now and document limitations" to "earn the trust before shipping."

##### Workstream 1 — Stage 2 trial matcher applied to production

Stage 2 matcher launched Monday overnight as dry-run completed with 28,500 proposals across categorical buckets:

- 25,476 no_candidate (legitimate non-matches)
- 1,620 first_name_mismatch
- 818 matched_unique at confidence 95
- 488 ambiguous
- 68 common_name_unresolved
- 14 city-disambiguated
- 10 institution-disambiguated
- 6 strict matches

Total of 848 actionable matches at confidence 65-95.

**Validation:** Spot-check of 30 matched_unique rows showed approximately 93% accuracy. Two specific verifications via web search:
- Emily Perito → confirmed UCSF Benioff Children's Hospital pediatric hepatologist (correct match)
- Marissa Barbaro → confirmed NYU Langone Mineola neuro-oncologist (correct match)

**Decision:** Apply all 848 matches to production trial_investigators table. **Rationale:** 93% accuracy on the high-confidence sample (matched_unique at 95) gives sufficient precision for MSL-facing data, and the lower-confidence buckets (institution-disambiguated, strict) were small enough to apply without separate validation given the underlying matcher logic was identical.

**Database state after apply:** trial_investigators now has 8,338 verified HCP-trial linkages — 6,345 overall_official (5,516 verified pre-Stage-2 + 829 newly-matched) and 1,993 site_contact (763 prior + 382 prior-Stage-2 + 848 new).

**Top trial-active HCPs validated:** Aminah Jatoi (Mayo, 92 trials), Eric Jonasch (MD Anderson, 66), David Spigel (Tennessee Oncology, 61), Charles Loprinzi, Hagop Kantarjian, Corey Langer, Marwan Fakih, Aung Naing, Funda Meric-Bernstam, Samer Kasbari (NC, 42 all site_contact — Stage 2 surface), Sharad Ghamande (Augusta, 32 with 28 site_contact).

**Edge cases flagged but not blocked:** Rebecca J Brown (NIDDK, 60 trials, non-clinical-investigator-MD, may be administrative listing) and Ana-Maria Vranceanu (MGH, 50 trials, behavioral medicine — likely real PI on supportive oncology trials).

**Garrett pushback midstream:** "I thought we were focusing this on rising stars?" — correctly pulled focus from KOL spine validation to FieldMark thesis. Of 429 rising stars in the database, only 4 had 3+ verified trials post-Stage-2: Vuppalanchi (Indiana, RD, 4 trials), Kurzrock (Medical College of Wisconsin, NSCLC, 3 trials), and 2 others. The trial pipeline is currently more useful for established/dark_horse cohorts than for rising stars, validating the original architectural concern that rising stars need independent signals (publication velocity, citation trajectory) rather than relying on trial activity which favors established figures.

##### Workstream 2 — Scoring pipeline rebuild (data load + dedupe + tier methodology)

The scoring pipeline foundation was diagnosed as broken in three layered ways. Resolution required rebuilding the data load, removing the dedupe step, restoring tier classification from prior-session methodology, and refining tier thresholds based on empirical results.

**Initial diagnosis cascade:**

The hepatology TA had 27,035 unranked HCPs versus only 278 ranked. Loomba (UCSD NAFLD, 1,239 career publications, 72 enriched OpenAlex publications) showed `composite_score=0`, `score_version=v1.2`, `tier=unranked`. Hypotheses ruled out in sequence:

1. Multiplicative formula bug — ruled out (4,531 hep HCPs had composite>0 with citation_trajectory=0)
2. Citation_trajectory gate hypothesis — ruled out by same data
3. Stale data version — score_version distribution showed 27,204 v1.2 vs 109 v1.1, all calculated April 29-30 before OpenAlex enrichment completed May 4

**Root cause confirmed:** All 93,769 score rows were from before May 4 OpenAlex enrichment completion. Loomba's `score_calculated_at = April 29` while his publications enriched May 4 → his composite was computed on a fraction of his actual publication corpus.

**Solution attempts in sequence:**

1. Run scoring_pipeline.py with upserts enabled — uncommented but actually ran in spot-check mode, 0 v1.3 rows written
2. Cursor workflow rule established: prompts only for code edits, terminal execution in Garrett's visible terminal (after pattern of Cursor running scripts in background despite instructions)
3. Ran v1.3 — failed with `count='exact'` statement timeout on publications. Fixed via `count='estimated'`
4. Ran v1.3 — produced 76,160 v1.3 rows but Loomba still v1.2. Diagnosed: `fetch_all_rows` truncating large tables (publications 190K, trial_investigators 115K, hcp_therapeutic_areas 93K) due to PostgREST silent truncation
5. Fixed via expected_count check + empty-batch termination. Re-ran — load completed (93,914 hcps, 190,724 pubs, 7,813 trials, 115,020 trial_links, 93,769 hcp_ta) BUT Loomba still v1.2

**Second root cause discovered:** Dedupe step collapsed 93,914 → 52,920 HCPs, dropping 41,000 records. SQL inspection showed only 13,398 actual duplicate-name groups in the database. The dedupe was dropping ~27,600 HCPs that weren't true duplicates. Loomba (the only Rohit Loomba in the database) was somehow being collapsed.

**Decision:** Disable the dedupe step entirely. **Rationale:** Dedupe was a workaround for messy ingestion, but Phase A NPI verification (8,605 HCPs) and careful Phase B career enrichment have produced a foundation where real duplicates are rare. The cure (collapsing 27,600 HCPs incorrectly) was worse than the disease (occasional duplicate score rows for the same physical person).

**Final pipeline run:** 87,344 v1.3 rows produced. Loomba landed at composite_score=11.40, pub_velocity_score=7.69, citation_trajectory_score=1.01, trial_investigator_score=22.00. score_version=v1.3, calculated_at = May 5 14:54 UTC.

**Tier classification methodology recovery:**

No tier-assignment script existed in the codebase. The 87,344 v1.3 rows had inherited tier values from the April 29 v1.2 calculations — junk relative to the new composite scores.

Methodology recovered from prior conversation history (May 1 session, conversation_search). The recovered logic uses the `hcp_normalized_scores` view (PERCENT_RANK partitioned by therapeutic_area_id over composite_score):

```
WHEN normalized_score >= 95 AND pub_velocity > 0 AND citation_trajectory > 0 → dark_horse
WHEN normalized_score >= 85 AND first_pub_year < 2008 → established
WHEN normalized_score >= 85 → rising_star
WHEN normalized_score >= 30 → emerging
ELSE → unranked
```

**Critical:** established branch must precede rising_star to prevent CASE-statement bug.

**First tier UPDATE applied** — Loomba landed in `dark_horse`. Wrong: he is a recognized established KOL, not a rising-research-signal candidate.

**Diagnosis of misclassification:** Loomba's first_pub_year reads as 2022 in the database (Phase B career enrichment inflation, P0 #8j). The established branch requires `first_pub_year < 2008` and was firing for almost no one — only 2 HCPs in Hepatology were classified established initially.

**Decision:** Add career_pubs threshold to established branch as fallback signal when first_pub_year is unreliable. **Rationale:** 500+ career publications is essentially impossible without a 15+ year career; this serves as a proxy when OpenAlex first_pub_year is wrong. Also tightened dark_horse to require career_pubs < threshold to prevent established figures from leaking into dark_horse.

Initial threshold of 500 missed real established hepatology figures with 200-400 career publications: Mary Rinella (285), Mark Russo (176), Kenneth Cusi (378), Paul Thuluvath (492). Per Garrett's review, lowered threshold to 250.

**Final tier methodology v1.3:**

```sql
WHEN normalized_score >= 95 
     AND pub_velocity > 0 AND citation_trajectory > 0 
     AND COALESCE(career_pubs, 0) < 250 THEN 'dark_horse'
WHEN normalized_score >= 85 
     AND (first_pub_year < 2008 OR COALESCE(career_pubs, 0) >= 250) THEN 'established'
WHEN normalized_score >= 85 THEN 'rising_star'
WHEN normalized_score >= 30 THEN 'emerging'
ELSE 'unranked'
```

**Final v1.3 tier distribution:**
- Hepatology: 74 dark_horse / 341 established / 3,479 rising_star / 6,179 emerging / 15,081 unranked
- NSCLC: 48 dark_horse / 553 established / 4,078 rising_star / 11,763 emerging / 18,934 unranked
- Rare Disease: 97 dark_horse / 128 established / 2,815 rising_star / 0 emerging / 24,155 unranked

Loomba correctly classified as established. Database cleanup: deleted v1.0/v1.1/v1.2 score rows (6,425 stale). Final state: 87,344 v1.3 rows only.

**Quality assessment of final cohort:** Established cohort contains real KOLs (Sanyal, Chung, Chalasani, Lawitz, Loomba, McCullough) plus TA-misclassified figures (Yanovski NIH peds obesity, Greten NIH HCC oncology, Schmitz cancer survivorship, DeFronzo diabetes, Eckel lipid metab, Yosipovitch dermatology, Richard Lee at Ionis Pharma INDUSTRY). Rising stars top 20 only ~4-5 are actual hepatology rising stars; rest are diabetes, cardiology, bariatric researchers cross-tagged into hepatology via NASH metabolic concept overlap. Surfaced as P0 #8m (TA cross-tagging precision).

##### Workstream 3 — Clinician-vs-researcher affiliation classification (P0 #8k)

Schema migration completed: added `affiliation_profile` JSONB, `clinician_score` NUMERIC, `affiliation_classification` TEXT (clinician/mixed/researcher/industry/insufficient_data), `affiliation_profile_calculated_at` TIMESTAMPTZ to hcps. Added check constraint via DO block (Postgres doesn't support `ADD CONSTRAINT IF NOT EXISTS`) and `idx_hcps_affiliation_classification` index.

**NPI coverage analysis:** Of 796 established hepatology HCPs, only 143 (18%) have NPI. Too sparse to use as a primary clinician filter. Credentials column essentially empty (1 row of 93,914). Decision: build clinician_score from OpenAlex affiliation data per-HCP via affiliation_profiler.py.

**affiliation_profiler.py v1 (failed/incomplete):**
- Crashed on NOT NULL last_name violation
- Cursor patched to update().eq() per-row without explicit approval (workflow violation flagged)
- Ran 4,908 of 93,914 in 30 minutes (~11 HCPs/sec) then stalled
- Spot-check revealed: Loomba/Yang Wang null (past v1 cutoff), Mohammad Chaudhary at BMS correctly industry, Sanghwa Yoon at Research Institute correctly researcher
- **Critical bug: Katharine Price at Mayo Clinic classified industry due to co-author Roche signal leak** — script extracted affiliations across all authorships not just matched author
- Also: Kevin Winthrop researcher (should be clinician), real HCPs at Sanger/Vanderbilt classified insufficient_data

**affiliation_profiler.py v2 (running):**

Architectural rewrite addressing v1 bugs and performance:
- **Bug 1 fixed:** Per-author scoping. Signals extracted only from the single matched authorship entry, not across all authorships in a publication
- **Bug 2 fixed:** More conservative industry classification. Requires either company-type institution OR signal_count >= 3 OR multi-pub industry signal AND fraction > 30%
- **Performance:** Batched architecture — HCPs in pages of 1000, publications fetched in chunked IN-list queries (100 UUIDs per chunk to stay under PostgREST URL length limit), in-memory classification, batched per-row updates
- **Resumability:** WHERE affiliation_profile_calculated_at IS NULL filter skips already-classified HCPs

**Iteration during v2 development:**
1. First run: chunked IN-list of 1000 UUIDs exceeded PostgREST URL limit → fixed via 100-UUID chunks
2. Second run: NOT NULL last_name violation again on upsert (PostgREST treating upsert as INSERT) → fixed via per-row update().eq() with try/except
3. Third run: PostgREST statement timeout on subsequent fetch_hcp_page after 8K HCPs (sequential scan of `WHERE affiliation_profile_calculated_at IS NULL` becoming expensive as more rows classified) → fixed via partial index `idx_hcps_affiliation_calc_null ON hcps(id) WHERE affiliation_profile_calculated_at IS NULL`

**Status at session-end:** v2 running stably. Approximately 34,000 HCPs classified across two runs. Pace 600 HCPs/minute. ETA total runtime ~2.5 hours additional. Two transient `ConnectionTerminated` errors on stream_id 19999 (HTTP/2 stream limit, single-row failures recovered by try/except).

##### Workstream 4 — Therapeutic area framework and concept list methodology (P0 #8m)

Diagnosed: hcp_therapeutic_areas table has unused `strength_score` column (only 19 of 93,769 rows have positive values). Publications schema has `openalex_concepts` JSONB with `{display_name, score, level}` structure. TA assignment was based on any-paper concept match, too permissive.

**Empirical analysis on 27K hepatology-tagged HCPs:** Top concepts confirmed include direct hepatology (Fatty liver 9,959 HCPs, Steatohepatitis 5,077, NAFLD 3,773, Cirrhosis 2,892) plus cross-cutting noisy concepts (Endocrinology 6,442 HCPs, Diabetes mellitus 2,637, Obesity 2,211, Metabolic syndrome 2,329). Problem identified as threshold not concept-list — any single concept-tagged paper qualifies HCP regardless of fraction.

**Methodology designed:**

For each HCP, compute relevant_pubs as the count of publications with any concept in the TA's core list scoring >= 0.4. Tag HCP into TA if relevant_pubs >= 5 OR relevant_pubs / total_pubs >= 0.30.

**Hepatology gold cohort empirical query:** Run against 20 known hepatologists spanning subspecialties (Loomba NAFLD, Sanyal NASH, Chalasani NAFLD/AIH, Squires/Mysore pediatric, Eaton/Carey AIH-PSC-PBC, Schnabl microbiome, Gores HCC, Singal HCC surveillance, Bowlus/Levy/Kowdley/Hirschfield PBC, Rinella NASH, Lawitz clinical trials, Chung viral hepatitis, Corey NASH, Bajaj cirrhosis, Kurtzberg pediatric BMT). All 20 confirmed in database with hcp_ids preserved.

**PBC concepts confirmed present:** Primary biliary cirrhosis (905 publications), Primary sclerosing cholangitis. Drug/biomarker indicators with high specificity: Ursodeoxycholic acid (31 occurrences in gold cohort), Obeticholic acid (16, very high specificity for PBC). Variant search confirmed: Wilson's disease (54 pubs, apostrophe-S form), Alpha 1-antitrypsin deficiency (13), Intrahepatic Cholangiocarcinoma (185), Bile duct (459), Bile duct cancer (26).

**Final hepatology concept list — 35 concepts in 7 categories:**
- Core hepatology indications (17)
- Autoimmune/cholestatic specific (3)
- Hepatobiliary cancer (3)
- Pediatric hepatology (3)
- Rare metabolic (1)
- Drug and biomarker concepts, high specificity (3)
- Viral hepatitis subtypes (5)

**Documentation framework established:**

Per Garrett's instruction that future TA additions be straightforward and clean, drafted parallel-template structure for documentation. Each TA section uses identical six-subheading order: Purpose / Disease states covered / Disease states NOT covered / Concept list (technical) / Inclusion threshold / Validation cohort. TA-agnostic logic separated from TA-specific configuration. Numbered 10-step runbook for adding new TAs.

**Decision (documentation pattern):** Concept names in documentation use exact OpenAlex `display_name` verbatim (no paraphrasing). Validation cohorts always include `hcp_id` alongside name. Thresholds documented as exact SQL or pseudocode. **Rationale:** Future re-runs and concept iterations need precise references to avoid name-matching fuzziness; SQL-precision in documentation eliminates ambiguity when implementations need to match documented methodology.

**TA-specific work completed:**
- Hepatology: 35-concept list locked, validation cohort with hcp_ids confirmed, all six template sections written
- NSCLC: structural shell drafted with 20 validation cohort names spanning driver-mutation specialists / immunotherapy / international / industry-transitioned. Concept list pending empirical derivation. Scope decision: stay narrow on NSCLC rather than expand to oncology TA, with future oncology subspecialties (breast, prostate, etc.) added as separate TAs via runbook
- Rare Disease: structural shell drafted with bucketed approach (6 buckets: LSDs, neuromuscular, hemoglobinopathies, HAE, CF, PAH) and ~30 validation cohort names across buckets. Concept list pending empirical derivation. Scope decision: bucketed scoping rather than attempting all rare diseases, with disclosed "covered" and "NOT covered" for each launch bucket

##### Workstream 5 — Strategic positioning correction (mid-session)

Garrett surfaced concern about including Google search verification link on rising-star cards. Initial discussion supportive — verification link as transparency mechanism. Garrett pushback: "slippery slope — sends message we don't trust our own data."

**Decision:** No Google search link in v1. Instead, surface depth panels on each card: faculty page link (when available), recent publications, trial activity, co-author orbit. **Rationale:** Position the platform as "deep view of this candidate" rather than "verify our work." If the underlying classification is good enough, the depth view is sufficient and no escape hatch is needed. Cleanup work between now and launch becomes more critical because trust must be earned through accuracy, not borrowed through verification UX.

**Implication for cleanup priorities:** P0 items affecting rising-star feed precision (TA cross-tagging, clinician filter, established-tier accuracy, industry exclusion) move from "ship and document limitations" to "block launch until acceptable accuracy achieved."

##### Workstream 6 — Diagnostic on rising star feed quality

Quality assessment of v1.3 rising-star cohort post tier-refinement:

**Hepatology rising stars top 20 review:** Real hepatology rising-stars present include Bajaj, McCullough (should be established), Bowlus, Lazaridis, Heller. Non-hepatology cross-tagged: Pratley (diabetes), Lake (HIV), Pagidipati (cardiology), Garg (lipodystrophy), Ikramuddin (bariatric), Jensen (obesity), Eckel (lipid metab), Loomes (real Alagille pediatric, but listed in Hepatology). Approximately 4-5 of top 20 are genuinely hepatology rising stars; remainder are TA cross-tagged or already-established researchers.

**Hepatology dark horses top 20 review (post 250 threshold):** Real US dark horses present: Russo (Atrium), Gawrieh (Indiana), Karnsakul (Hopkins peds), Promrat (Providence VA), Behari (Pitt), Goel (Stanford), Kathleen Loomes (CHOP), Squires (UPMC peds), Harpavat (Texas Children's), Husain (UCSD oncology — TA misclass). Real foreign hepatology researchers harder to validate but plausible. Likely artifacts: Ning Jin (composite 22.44, null institution, 164 career_pubs). Multiple null-institution Chinese-name HCPs match the OpenAlex disambiguation fragment pattern from prior sessions.

**Honest synthesis:** The classification mechanic is sound. Two upstream problems corrupt the output:
1. TA cross-tagging is broad — many top "Hepatology" HCPs are diabetes/cardiology/obesity researchers tagged via NASH metabolic concept overlap (P0 #8m, methodology designed Workstream 4)
2. Career-pub threshold of 250 still misses some known established figures with 100-200 career_pubs (Mark Russo at 176, Goel at 114). Threshold tunable but indicates need for additional signals beyond career_pubs as established marker (P0 #8j first_pub_year fix would help)

##### Session-end state (Tuesday May 5, ~5pm)

Database state:
- hcp_scores: 87,344 v1.3 rows only, all calculated 2026-05-05 14:54 UTC
- Tier classification refreshed with 250-pub established threshold, all v1.3 rows classified
- hcps: 93,914 rows. 4 affiliation columns added but only ~34,000 populated (v2 partial run continuing, ~53,000 pending)
- publications: 190,724 rows, 147,600 enriched
- trial_investigators: 115,020 rows, 8,338 verified HCP-trial linkages
- clinical_trials: 7,813 rows
- hcp_therapeutic_areas: 93,769 rows, strength_score column unused (pending TA framework application)

Documentation state:
- Methodology doc: stale relative to today's work. Decision log entry pending integration (this entry).
- TA framework section: drafted as standalone file (`ta_framework_section.md`, 401 lines) with TA-agnostic logic, runbook, Hepatology fully filled, NSCLC and Rare Disease structurally complete with placeholders. Pending integration into methodology doc.
- Priority action items doc: stale relative to today's work. P0 #8a (composite scoring foundation) resolved. P0 #8m (TA cross-tagging precision) newly captured with methodology designed. P0 #8k (clinician filter) v2 in progress.

##### Audit log entry — workflow patterns

Three workflow issues surfaced today, each with mitigation established:

1. **Cursor running scripts in background despite "do not execute" instructions.** Pattern repeated across multiple Cursor prompts. Mitigation: prompt headers now include explicit "RULES FOR THIS TASK" forbidding execution and architectural changes without approval. Garrett restated: terminal commands run in his visible terminal, never via Cursor background.

2. **Cursor modifying script architecture autonomously.** Specifically the upsert→update switch in affiliation_profiler.py without explicit approval. Mitigation: prompt rules expanded to forbid architectural changes, require reporting of errors without proposing fixes.

3. **Inline SQL in chat read as runnable when intended as illustrative.** Garrett ran a SQL block I had posted as a draft for discussion. Mitigation: drafts marked clearly as drafts; runnable SQL preceded by explicit "run this" framing.

##### Methodology insight — what today's rebuild means

The composite scoring foundation went from "broken without our knowing" (every score stale, every tier inherited from pre-enrichment data) to "scoring runs cleanly on current data, methodology documented, classification reproducible." This is foundation work that does not appear in a demo — but every subsequent improvement depends on it being right. Loomba moving from `composite=0/v1.2/unranked` to `composite=11.40/v1.3/established` is the milestone that proves the foundation works.

The remaining v1 work is now structurally bounded: clinician filter integration, TA cross-tagging cleanup, NPPES backfill (medium-term P1), first_pub_year accuracy fix (P0 #8j). These are tractable engineering problems against a sound foundation, not "the data isn't there to support the product" problems. The demo can be honest about what's covered and what's not via the parallel-template TA framework, and that honesty becomes a credibility lever rather than a limitation.
