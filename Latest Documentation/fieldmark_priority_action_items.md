# FieldMark — Priority Action Items

**Captured:** May 2, 2026 evening
**Last updated:** May 4, 2026 Monday afternoon
**Source:** Mobile testing session, methodology integrity audit, foundation audit, Sunday data foundation expansion, Monday Orbit foundation work + trials pipeline refactor

## Where we are — Monday afternoon update (May 4)

Monday afternoon session (~12:30pm-5pm Eastern) executed the trials pipeline architectural refactor (Stage 1 + Stage 1.5) that was scoped this morning as a P0 blocker. Substantially completed in one focused work session vs. the 2-3 day estimate. Stage 2 (matching pipeline) is now the remaining work; algorithm specification empirically validated and ready for implementation tomorrow.

**Afternoon workstreams (in order):**

1. **Publication-side Orbit proof-of-concept on Krupa R Mysore (pediatric hepatology):** Validated. 15 collaborators returned with topically and institutionally coherent network (pediatric children's hospitals — Texas Children's, Baylor, Cincinnati Children's, Lurie, Cincinnati). Recognizable pediatric hepatology figures (Karpen, Alonso, Miethke). Heat scoring and position-pattern heuristics produced reasonable output. Mechanics work; product utility for the Mysore-style HCP profile is genuine.

2. **Publication-side Orbit on Eric Samorodnitsky (NSCLC #1 rising_star):** Output revealed that Samorodnitsky is a Research Scientist Ph.D. at OSU Wexner, NOT a clinical investigator. His Orbit correctly surfaced his single-lab cluster (13 of 15 collaborators at OSU, dominated by mentor Sameek Roychowdhury). This led to discovery of P0 #8k — non-clinician researchers ranked as clinical rising stars across all three launch TAs.

3. **Trials pipeline Stage 1 implementation:** Schema migration + `extract()` + `insert_links()` refactor + `splitn()` parser fix. Allowed trial_investigators rows to record every official with valid role, with hcp_id NULL for non-matches. Validated on 5-HCP and 50-HCP tests. ~14 malformed rows from a parser bug discovered + cleaned up via two-step preview/delete SQL.

4. **Stage 1.5 (site-level investigator capture) — discovered mid-afternoon as critical expansion:** Investigated CT.gov locations data structure for NCT05675410 (Hodgkin Lymphoma phase 3) — found 404 locations with 397 site PIs that the Stage 1 capture missed. Site PIs live in `locations[].contacts[]`, not `overallOfficials[]`. Stage 1.5 added second pass over locations array, captured site-level investigators with structured `facility/city/state/country` data. Schema expanded with location columns + `source` discriminator. 50-HCP test produced 17,385 trial_investigator links (vs. 28 from pre-1.5 5-HCP test — three orders of magnitude richer).

5. **Stage 2 algorithm specification:** Tier 1 prototype query against current 38,891 site_contact rows. Identified the 81%/12%/5%/2% candidate distribution (1 / 2-3 / 4-9 / 10+ candidates per row) that anchors the matching algorithm design. Empirically validated approach: deterministic match for single-candidate cases, city + first_name + institution disambiguation for multi-candidate. Decisions locked: confidence floor 75, add `match_status` column, skip prefix-name handling for v1.

6. **Full re-run launched:** ~5,860 NPI HCPs queued. Crashed mid-run on a `clinical_trials` upsert statement timeout (large JSONB locations payload exceeded Postgres timeout). Fix applied: chunk `upsert_trials()` into 10-row batches. Resume from checkpoint working. Run is in progress as of session pause.

**OpenAlex re-run status (verified Monday afternoon):**
- Completed cleanly: 136,207 publications updated, 0 unchanged, 338 not found, 13 failed
- Total enriched in database: 147,600 of 190,724 publications (77% coverage)
- Bug fix from morning validated: zero unchanged-path skips on this run

**Updated strategic state:**
- Phase 1 (data foundation expansion): substantially complete. OpenAlex re-run done. Trials pipeline Stage 1 + 1.5 done.
- Phase 2 (matching pipeline): tomorrow's primary workstream. Algorithm specified, scope ~1 day implementation + runtime.
- Orbit feature timeline compression: 4-6 weeks projected this morning, now closer to 3-5 weeks given Stage 1 + 1.5 compression.

**New P0 items added Monday afternoon:**
- **P0 #8l:** HCP ingestion expansion. Empirical finding from Stage 2 design — only 25% of HCPs have state populated. Caps trial-investigator matching at ~10% resolution rate. Without state coverage expansion (NPPES backfill), most US clinical site PIs cannot be resolved to HCP profiles, capping Orbit completeness and blocking the credential-validation signal needed for P0 #8k.

**Updated P0 items:**
- **P0 #8f** marked as Stage 1 + 1.5 substantially complete; Stage 2 is the remaining work with empirically-validated algorithm.

**Operational notes:**
- Supabase auto-backup confirmed at 04 May 10:57 UTC (this morning, before today's schema work). Manual snapshot deferred per user instruction; momentum prioritized over redundant backup.
- Today's productive output justifies "in it to win it" framing — what was scoped this morning as a 2-3 day blocker compressed to one afternoon, with deeper data foundation work (Stage 1.5) completed alongside.

**Monday end-of-day items:**
- This priority doc update (in progress)
- Methodology doc afternoon entry
- Watch full re-run completion (likely overnight or Tuesday morning depending on resumed pace)

---

## Where we are — Monday morning update (May 4)

Monday morning session (~8am-12pm Eastern) discovered two significant bugs from Sunday's overnight work, killed Scholar enrichment after confirming zero yield, ran OpenAlex re-run to recover the unchanged-path bug victims, and conducted Orbit foundation analysis that surfaced a third architectural issue in the trials pipeline. Three new findings; one workstream pivot.

**Sunday overnight outcomes (verified Monday):**
- **Scholar enrichment:** 12+ hour runtime, 3,800 HCPs processed, **0 matched, 0 failed**. ScraperAPI consumed ~105K credits (10.5% of monthly budget) for zero h-index gain. Killed Monday morning. Root cause: most queue HCPs (Boerwinkle, Vasan, Van Cutsem, Steg, etc.) don't have findable Google Scholar profiles. Sunday's diagnostic conclusion was correct; the empirical data confirmed it. Scholar is a dead path for the remaining cohort.
- **OpenAlex re-run:** Completed reporting 82,056 processed / 28,567 updated / 53,305 unchanged / 176 not found / 8 failed. **Database verification revealed only 51,770 publications actually got new JSONB fields written.** Root cause: the script's "unchanged" path (citation_count returned by OpenAlex matched existing null/0) was skipping the entire database write, including the new JSONB fields. The 53,305 "unchanged" publications were processed but had no new data written.

**Monday morning recovery work:**
- **OpenAlex re-run with bug fix:** Filter expanded from `citation_count IS NULL` to `openalex_enriched_at IS NULL`, catching both unchanged-path bug victims (~32K) and original-pipeline-only cohort (~105K). Update logic rewritten to always write JSONB fields when OpenAlex returns data. Validation slice (603 publications) confirmed fix works — every JSONB field populated for every enriched row including the citation_zero_population that the bug previously skipped. Full run launched ~10am, currently ~75% complete (102,552 enriched as of last check), expected completion ~12:30pm.

**Orbit foundation work (Monday morning):**
- **Trials pipeline architectural issue surfaced.** The script (`trials_pipeline.py`) is investigator-first architecture (already fixed from earlier April broken state), with name matching + affiliation confidence ≥40 gate producing 552 verified trial linkages across 567 launch-TA HCPs. Coverage by TA: NSCLC 321, Rare Disease 140, Hepatology 106. Distribution shows healthy long-tail (top HCPs with 24, 23, 22 trial linkages; many in 5-15 range; long tail of 1-3). HOWEVER: the script processes one HCP at a time and only records that HCP's link to each trial. **Other co-investigators on the same trial are visible in the API response but never written to the database.** Co-investigator pair computation is impossible from current `trial_investigators` data — every trial has only ONE investigator linkage in our database, even though CT.gov shows 3-5 investigators per trial. This is the actual blocker for Orbit-via-trials.
- **Publication-side Orbit data foundation is in place.** OpenAlex re-run captures `authorships` JSONB on ~135K publications by ~12:30pm. Each authorship contains canonical OpenAlex author IDs, ORCIDs when present, author position, institutions with ROR identifiers and country codes. This enables publication-side co-author network computation directly. Capture rate per HCP varies by career stage — established researchers like Gregory Gores show ~5% capture (97 publications visible vs 1,013 in `total_career_pubs`), but for the rising star cohort that Orbit actually serves (mid-career, 30-200 career pubs), capture rate is substantially higher.
- **Orbit methodology decision (per Garrett):** Trials side weighted more heavily than publications side, but both incorporated into the composite Orbit relationship score. Use case: MSL identifies a Rising Star → clicks Orbit → sees connections with "heat" → spots someone they know (e.g., "Oh, Hua Zhang is connected to Dr. Patel — let me reach out to her for an introduction"). Visual is non-negotiable.

**Other findings worth noting:**
- **Industry exclusion gap.** Yang Wang at "Medicine Design" (Hepatology #1 by composite, 72.04) and Ruihan Guo at "Helixon US Inc." (NSCLC #4) suggest pharma/biotech affiliations slipping through the industry exclusion filter. Possibly broader pattern.
- **TA classification breadth.** David E Kleiner (NCI pathologist) and Razelle Kurzrock (early-phase oncology trials, broad cancers) both ranked top-5 in NSCLC. Real researchers but not specifically NSCLC clinicians. May be working as designed (broad TA classification) or a methodology gap.
- **Duplicate publication rows.** 8 rows for a 6-author Hepatology paper (DOI `10.1093/HEP.0000000000000004`). Two HCPs (Linda Henry, James M Paik) have duplicate `hcps.id` entries that didn't get deduplicated, producing extra publication-author rows. Affects every aggregate query that touches publications — pub velocity, citation totals, journal counts. Surfaces during Orbit work because per-DOI deduplication is required to avoid inflating co-publication counts.

**Strategic state:**
- Phase 1 (data foundation expansion) is largely landed once today's OpenAlex re-run completes
- Phase 2 (methodology design) and Phase 3 (architecture implementation) work as previously planned
- New workstream: trials pipeline refactor for Orbit (2-3 days focused work) — separate from main Phase 2/3 sequence
- Orbit feature itself: 4-6 weeks of focused work distributed across trials pipeline refactor, `hcps.id ↔ openalex_author_id` mapping infrastructure, `hcp_relationships` table computation, methodology integration, and frontend visualization

**Today's anchor (afternoon):**
- OpenAlex re-run completion stats — update methodology doc Workstream 4 numbers
- Decision on trials pipeline refactor sequencing (today, this week, or scheduled into Phase 2/3)
- Optional: publication-side Orbit proof-of-concept on a Rising Star (Aalam Sohal, Raj Vuppalanchi) to validate publication-side foundation

**Operational reminders:**
- Supabase backup overdue — last backup was several days ago. Substantial schema/data changes since (country normalization, 7 new JSONB columns on publications, 51K+ enrichment writes). Manual snapshot before next major pipeline work.

---

## Where we are — Sunday-Monday transition note (May 3 evening)

Sunday evening session (~7:30pm-11:00pm) executed five workstreams: country field normalization completed for buyer-relevant cohort, feed pagination shipped to product, OpenAlex pipeline refactored with expanded data capture (7 fields per publication, run completing ~11pm), Scholar enrichment relaunched after diagnostic correction, and pub velocity plateau elevated from deferred v1.5 item to active P0 due to product visibility.

**Strategic state:** Under accuracy-first product framing (no rush to market, polish over speed for sophisticated buyer scrutiny), the remediation path is 6-10 weeks of focused work across four phases. Phase 1 is data foundation expansion (largely landed Sunday evening — country normalization done, OpenAlex re-pass with rich field capture done). Phase 2 is methodology design (pub velocity formula, classic trial matrix, data-presence weighting, h-index path). Phase 3 is architecture implementation (Established composite, dual-path eligibility, schema and SQL changes). Phase 4 is validation against curated cohort.

**Monday morning anchor:** Verify OpenAlex completion (count enriched publications), check Scholar progress (count new h-index values), then update methodology and priority docs based on actual yields. Don't restart on scoring pipeline work, tier rebuild SQL, or composite formula iteration until Phase 2 design phase has been deliberately worked.

**Audit log status:** Methodology doc has the May 3 Sunday evening session subsection (5 workstreams, full empirical detail, plus Workstreams that did NOT execute and why). Priority doc has updated P0 #7 (country normalization marked complete), new P0 items 8a-8e (Established composite, pub velocity elevated, dual-path eligibility, data-presence weighting, OpenAlex coverage gap). Both docs reflect actual state as of session close.

**Open items to address Monday:**
- Scholar diagnostic remains open. Sunday's first-run output looked broken (250 processed / 0 matched), but actual cause is most queue HCPs don't have findable Scholar profiles, not a script bug. Need actual yield data Monday to decide whether Scholar continues or whether OpenAlex-derived h-index becomes the primary path.
- OpenAlex completion stats (final enriched count, journal coverage breakdown) need to update P0 8e and methodology doc Workstream 4.
- Pub velocity redesign (P0 8b) needs to schedule its own focused methodology design session.

---

## Roadmap context

- **v1.3 (current):** Frontend tier alignment, methodology integrity audit, percentile display, view migration. Shipped May 2, 2026.
- **v1.5:** Foundation hardening — methodology calibration, country normalization, industry exclusion, narrative cleanup, DetailScreen wiring, Collaborative Orbit data foundation, methodology evolution signals (author position, editorial activity, IIT count).
- **v1.6:** Strategic feature surfacing — Collaborative Orbit feature launch, Established KOLs view with h-index data, full filtering UX, methodology evolution refinements.
- **v2.0:** Public launch.

This document is the working priority list. Items are ordered by criticality to v2.0 launch credibility, not by ease of implementation. Most P0 items will land across v1.5 and v1.6; none can ship v2.0 unresolved.

---

This document captures the prioritized backlog as of end of session. Items are ordered by criticality to launch credibility, not by ease of implementation.

---

## P0 — v2.0 launch blockers

These must be resolved before v2.0 (public launch). Each independently undermines product credibility. Most can be addressed across v1.5 and v1.6 — they don't all need to land in a single sprint, but none can ship v2.0 unresolved.

### 1. Industry employees appearing in rising star feed ✅ TACTICAL FIX SHIPPED, ARCHITECTURAL HARDENING DEFERRED TO v1.5

**Problem:** Sylvie Perez (Pfizer Research & Development, Cambridge MA) and Sudha S Shankar (Pfizer Sacramento) appeared as rising stars in the Hepatology cohort. Both are industry-employed pharma researchers. They are not MSL-engageable — they *are* the audience for FieldMark, not the targets.

**Methodology gap:** The current scoring treats anyone with a publication footprint as a candidate HCP. But for an MSL the relevant cohort is researchers at academic institutions, hospitals, clinical practices, and government/NIH — explicitly excluding pharma, biotech, and contract research organizations.

**Status (May 2 evening):** Tactical query-time exclusion shipped. INDUSTRY_PATTERNS constant in api.ts excludes 41+ pharma, biotech, and CRO companies. Filter applied in both `getRisingStars` (cards) and `getTACounts` (chip counts). Pre-fix audit: 469 industry-employed researchers across rising_star + dark_horse tiers (Hepatology 88, NSCLC 316, Rare Disease 65). Post-fix: industry employees no longer surface in any user-visible feed.

**Architectural follow-up deferred to v1.5:** Add `industry_employed` boolean column on hcps, populate via affiliation matching + ROR (Research Organization Registry) institution-type lookup. Replaces the query-time pattern matching with a proper data model. Surface industry-employed flag as a future filter dimension when filtering UI lands, allowing competitive intelligence use cases ("show me Pfizer's rising rare disease research function") without contaminating the default MSL feed.

### 2. Narrative refusal contamination ✅ CLEANUP SHIPPED, PIPELINE PATCH DEFERRED TO v1.5

**Problem:** Peter Kan's HCP card displayed the text "I cannot write these sentences as requested because there appears to be a significant mismatch in the information provided. Dr. Peter..." This was Claude refusing to generate a narrative due to data inconsistency in the prompt, and the refusal text was stored verbatim in the `hcp_narratives.narrative` column rather than being detected and rejected.

**Status (May 2 evening):** Audit identified 15 contaminated narratives across the database. Cleanup SQL nulled all 15 records. Detail screen falls back to "Narrative generating — check back soon" placeholder, which is honest. Re-audit confirmed zero remaining refusal contamination.

**Pipeline patch deferred to v1.5:** Narrative generation pipeline must detect refusals via regex match before storage; either retry with adjusted prompt or skip the HCP and log. Without this, future narrative generation runs will re-introduce the same contamination class. Estimated effort: 1-2 hours.

**Note on Peter Kan specifically:** His HCP record was likely the cause of the original refusal — Claude refused because the data passed in had inconsistencies. Worth a manual investigation as part of the cross-state same-person consolidation backlog item to determine whether his record is fragmented or has stale data that should be cleaned.

### 3. Dark Horse cohort turnover and methodology calibration ✅ RESOLVED VIA ELIGIBILITY GATE FIX

**Outcome:** The diagnostic process surfaced a much more significant finding than the original calibration question. The Dark Horse cohort wasn't too small — the methodology had a foundation gap that was suppressing the cohort. Specifically: the documented `MIN_TOTAL_CAREER_PUBS = 10` eligibility gate was not being applied in the scoring pipeline, which had two compounding effects:

1. The pub_velocity_score formula plateau at 19.7-19.8x for low-publication-count HCPs was admitting noise into rising_star and dark_horse tiers
2. The rising star tier (9,960 HCPs) was 96% under-eligible noise; only 4% (435) were legitimately ≥10 pubs
3. Tonight's afternoon tier rebuild produced 17 dark horses partly because of unstable concurrent data state and partly because the eligibility gate was missing

**Resolution:** Re-ran tier classification with eligibility gate enforced (`pub_count >= 10`) AND known-career-age guards on rising_star and emerging tiers (`first_pub_year IS NOT NULL AND first_pub_year >= 2008`). New tier distribution: **148 dark_horse, 429 rising_star, 59 established, 39 emerging across all three TAs.** Validation queries confirm all 148 dark horses and all 429 rising stars pass every methodology gate. Publication count distributions are healthy.

**Cohort turnover question, separately resolved:** With 148 dark horses and 51 "almost dark horse" candidates in the wings (NSCLC 45, Hepatology 6), natural turnover from monthly scoring reruns is structurally easy. The methodology has the right turnover mechanics; operational cadence (monthly scoring rerun) becomes the real lever.

**Decision:** Methodology unchanged. Eligibility gate now enforced. No methodology gate loosening required. The cohort calibration question resolved itself once the implementation gap was closed.

**Methodology copy correction:** Previous "fewer than 1 in 12 rising stars qualify" rarity framing is no longer accurate at the new ratio. Actual ratio: 148 dark horses / 429 rising stars = 1 in 2.9. Update DetailScreen Dark Horse callout copy accordingly.

**Operational follow-up:** Monthly scoring pipeline rerun cadence still needs scheduler infrastructure. Without it, cohort turnover is dependent on manual reruns. Half-day work to set up.

### 4. Filtering and slicing the feed cohort

**Problem:** Oncology has 3,809 rising stars. The feed shows ~20. The other 3,789 are inaccessible. An MSL cannot do their job with a list of 20 HCPs surfaced by a global ranking that doesn't reflect their territory or strategic priorities.

**Discoverable independent of full filtering — pagination gap (NEW finding May 2 evening):** With the cleaner cohort post-eligibility-fix, the count/render mismatch became immediately visible. Hepatology Dark Horses chip shows "106 identified" but the feed renders only 20 cards. NSCLC Rising Stars shows "250 identified" but renders 20. Every tier feed has the same issue — the database has cohort, the feed shows top 20 by score. A user scrolling and seeing the count not match the rendered cards immediately distrusts both numbers.

**Pagination subitem shipped May 3 Sunday evening ✅:**
- Backend: parameterized the hardcoded `.limit(200)` cap in `getRisingStars`. Added `options.offset` parameter. Returns `{ rows, total }` shape with separate count query before row query.
- Frontend: added `feedOffset`, `feedTotal`, `loadingMore` state in App.tsx. Added "Load more" button at bottom of card list that appends pages. Section header shows "X of Y identified" when partial, total only when fully loaded. Useeffect resets offset on TA/darkHorse change. Manual refresh resets to first page. Button styled green (#1A3D2E bg, #4ADE80 border/text).
- Critical product finding from pagination work: past row 20-30 the publication velocity plateau becomes visible. Captured as P0 8b above (pub velocity formula redesign elevated to active P0).

**Full filtering remains v1.5 dedicated workstream.** Scoped in fieldmark_filter_scope.md. Estimated 3-4 week workstream. Depends on country normalization (now ✅ for buyer-relevant cohort), indication taxonomy completion, career age backfill, and profile-to-feed territory threading. Country normalization unblocked May 3 Sunday — territory filter no longer blocked at the data layer.

**Why P0 (filtering broadly):** Without filtering, FieldMark is a demo of methodology, not a usable product. A buyer's first question after seeing the feed will be "how do I find the people in *my* territory?" There's no good answer today.

### 5. DetailScreen and score tooltip contain hardcoded placeholders that contradict card data

**Problem:** Tapping a card opens a Detail screen with:
- Career age "4.2 yrs" hardcoded across every HCP (card shows real value, e.g., "0 yrs" for Colton G Brown)
- Score breakdown bars 94/88/81/76 hardcoded across every HCP
- Publication timeline showing fake 2020-2024 bars even for researchers whose career started in 2026
- "Top 8% of rising stars" leftover copy that contradicts the body text saying "Top 5%"
- Citation trajectory showing full precision (+2.4197%) instead of rounded (+2.4%) like the card
- Rising star score showing raw composite (19.8) while the card shows percentile badge ("Top 5%")

**Additional surface (NEW finding May 2 evening):** The score badge tooltip (accessible via the score chip on the upper right of each HCP card) opens "RISING STAR SCORE 48.8/100" with a "HOW THIS SCORE IS CALCULATED" breakdown. Same hardcoded 94 for "Publication velocity (35% of score)" appears regardless of HCP. This is a third surface (cards, DetailScreen, score tooltip) all sharing the same placeholder bug. The methodology weight labels (35% pub velocity, etc.) are correctly named but the per-HCP values are placeholder.

**Status:** All v1.5 backlog items, but they cluster as "score breakdown wiring" and should be done together — same data flow, three rendering surfaces.

**Why P0:** The Detail screen is where a buyer goes to verify "is this real?" A buyer who taps three Dark Horse cards and sees the same 4.2 yrs, same 94/88/81/76 bars, same 2020-2024 publication timeline immediately concludes the data is fake. The score tooltip is *more* visible than DetailScreen — it appears on every card hover/tap — so its placeholder values are an even higher-frequency credibility issue.

**Estimated effort:** 60-90 minutes once the column-name bug in `getHCPDetail` is fixed. May be longer if `getHCPDetail` has additional issues we haven't surfaced. Score tooltip may share components with DetailScreen — if so, single fix covers both.

### 6. getHCPDetail and searchHCPs have wrong column names

**Problem:** Both functions reference `pub_velocity` / `citation_trajectory` / `trial_score` in their SELECT lists. Actual column names are `pub_velocity_score` / `citation_trajectory_score` / `trial_investigator_score`. Likely produces silent failures on detail screen open.

**Status:** Known v1.5 backlog. Same fix as the `getRisingStars` work tonight.

**Why P0:** Blocks DetailScreen wiring (P0 #5). Also blocks search screen functionality (currently unknown if search works at all).

**Estimated effort:** 20 minutes.

### 7. Country field normalization ✅ COMPLETED FOR BUYER-RELEVANT COHORT (May 3 Sunday evening)

**Problem (original):** Country values are corrupted across multiple distinct classes, more severely than originally documented. Discovered during May 2 evening Hepatology dark horse review (106-horse cohort surfaced 60+ "China" rows alongside multiple data corruption patterns).

**Classes of corruption observed:**
1. **US states stored as countries** — "Idaho", "Texas" etc. (already documented)
2. **Trailing punctuation** — "China.", "PR China.." (mostly fixed in afternoon SQL pass)
3. **Country aliases** — "China", "PR China", "People's Republic of China" all coexist as distinct values for the same country
4. **Email and affiliation bleed-through** (NEW finding) — PubMed affiliation parser is grabbing entire trailing strings including email addresses into the country field. Real examples observed:
  - `India. ajoyshetty@gmail.com`
  - `PR China.. Electronic address: iwangtiantian@126.com`
  - `China. weichangchen@126.com`
  - `China. Electronic address: gypan@simm.ac.cn`
5. **NULL country with publication evidence** — 14 of 106 Hepatology dark horses have NULL country despite having geographic information embedded in their institution string

**Why severity matters:** This is not just cosmetic flag-rendering issues. Country corruption directly blocks territory filtering (P0 #4), produces wrong country flags on cards (Thi Hai Yen Nguyen showing French flag), and prevents the territory-default feed framing (see new item #25 below). The email bleed-through specifically suggests the PubMed affiliation parser needs revisiting at the ingestion layer — SQL patches on existing data won't catch new ingestions.

**Why P0:** Blocks geography filtering (P0 #4), blocks territory-default feed framing (P3 #22), produces visibly wrong country flags on cards (credibility issue), reveals data parsing bugs at the ingestion layer.

**Status (May 3 Sunday evening):** Five-phase SQL cleanup completed. Distinct country values reduced from ~5,790 to ~1,500 (74% decrease). USA cohort: 32,029 → 34,007. China cohort: 14,568 (split across 5 variants) → 18,004 (single canonical value). Roughly 4,000-5,000 country values changed across all phases. Buyer-relevant cohort (US, EU, established research countries) substantially cleaner. See methodology doc "May 3 Sunday evening session — Workstream 1" for full phase-by-phase audit.

**Residual: ingestion-layer fix.** ~715 long-string corruption rows remain (full affiliation strings stored in country field for non-buyer-relevant countries, pure email-domain values, etc.). Root cause is the PubMed affiliation parser writing entire affiliation blocks to the country field at ingestion. SQL patches on existing data don't prevent new corruption. Captured as v1.5+ ingestion-pipeline fix backlog item below.

**v1.5+ backlog (PubMed affiliation parser revision):**
- Revise PubMed affiliation parsing to extract country independently of the affiliation string
- Re-ingest publications captured under broken parser and update `hcps.country` for affected HCPs
- NPI-based US state population for HCPs with US affiliations (separate workstream)

### 8. Trademark conflict on FIELDMARK

**Problem:** USPTO has an active LIVE/PENDING application for FIELDMARK (serial 99703320, filed March 15, 2026) in Class 042 for "Software as a service (SAAS) services featuring software for project management; Artificial intelligence as a service (AIAAS) services." Direct overlap with the FieldMark product class and description.

**Status:** Discovered tonight. Owner is Lawrence W Rudd, Arcadia CA, individual filing.

**Why P0:** Launching under FieldMark with an active conflicting USPTO application is high legal risk. Even if the examiner doesn't catch the conflict, the filing party can oppose during publication or sue post-launch. Renaming pre-launch is materially cheaper than rebranding post-launch under legal pressure.

**Action items:**
- Trademark attorney consultation Monday (~$400 for clearance opinion)
- Generate 3-5 alternative name candidates that fit the scientist audience — current direction: Vector / Cohort / Stratum / Vantage / similar. Avoid Nebula (consumer-app vibes).
- USPTO search each finalist in Class 042 before committing
- Domain availability check per finalist
- Decide on name no later than mid-week before more brand assets accumulate

---

### 8a. Established KOLs composite missing from implementation (NEW May 3 Sunday)

**Problem:** Methodology commits to dual-composite architecture (Rising Stars + Established KOLs) at methodology lines 234-247. Implementation has only Rising Stars. The `established` tier values currently in `hcp_scores.tier` are an artifact of the Rising Stars cascade (top-15% Rising Stars composite + first_pub_year < 2008), not a separate Established KOLs view.

**Empirical evidence (May 3 morning audit Foundation Issue 1):** Across the three launch TAs, the `established` tier contains 1 HCP in Hepatology (median career pubs = 26), 19 in NSCLC (median = 41), 11 in Rare Disease (median = 147). The `unranked` tier contains the actual senior figures with maximum career pubs of 11,067, 13,988, and 3,600 respectively. The current `established` tier is not the methodology's Established KOLs view; it is a leftover band of the Rising Stars composite cascade.

**Architectural decision (documented in May 3 morning audit):** Dual-composite via parallel columns on `hcp_scores`. Add `established_composite_score` and `established_tier` columns alongside existing `composite_score` and `tier` (which retain Rising Stars semantics). Established tier vocabulary: `kol`, `emerging_kol`, `unranked`. No `first_pub_year` guard on Established tier classification.

**Why P0:** Without the Established view working, the product surfaces only Rising Stars credibly. A buyer toggling to Established KOLs view sees the broken cohort.

**Dependencies:** Requires Foundation Issue 7 (classic trial matrix specification, 1-2 days methodology design) and Foundation Issue 5 (data-presence weighting, 2-3 days implementation) before it can be built correctly.

**Estimated effort:** 1 week of focused implementation once dependencies clear.

### 8b. Pub velocity formula degeneracy — ELEVATED (NEW May 3 Sunday)

**Problem:** Current formula returns 0 for HCPs with fewer than 3 active publication years, flat year-over-year output, or low-baseline recent windows. Global normalization plateaus all zeros at identical normalized score (~19.78). 55% of the rising_star + dark_horse cohort across three TAs share this identical score, including HCPs with structurally different publication histories (Hua Zhang 2,601 career pubs, Beilei Guo 4 career pubs, Chao-Dong Huang 1 career pub all at pub_vel = ~19.78).

**Why elevated to P0 May 3 Sunday evening:** Pagination shipped tonight made the plateau visible in product. Past row 20-30 in any TA cohort, every HCP card shows identical composite=47.3, pub_vel=62.7x, cit_traj=+0.0%, trials=—. **The product cannot be demoed past row 20 without producing a wall of identical 47.3 cards.** Originally sequenced as v1.5 deferred methodology design item; now product-blocking.

**Status:** Methodology design work, not parameter tweak. Multiple plausible replacement formulations exist (compound annual growth rate, z-score relative to peers in same career age band, weighted regression slope of pub count over time). Selection requires distribution analysis on enriched data and empirical comparison against validation cohort. The OpenAlex `counts_by_year` data captured Sunday evening provides per-publication year-by-year citation deltas which are part of the redesign input.

**Estimated effort:** 1-2 weeks methodology design plus iteration. Validation depends on validation cohort building (8e below).

### 8c. Eligibility gate excludes trial-active HCPs (NEW May 3 Sunday)

**Problem:** Methodology's central thesis (early-phase trial activity is leading indicator of rising-star status, methodology lines 17-29, 77-91) contradicts the eligibility gate (`total_career_pubs >= 10`). 97 trial-active HCPs across three launch TAs sit in `unranked` because they fail the publication-count gate despite having legitimate verified trial linkages.

**Empirical evidence (May 3 morning audit Foundation Issue 4):** 14 trial-active HCPs in Hepatology, 38 in NSCLC, 45 in Rare Disease, all in unranked. Mix of established KOLs (Joanne Kurtzberg, Amy Paller, Michael Knowles, Karl Anderson, Stefano Pileri, Surinder Batra, Thomas Witzig) and early-career trialists. Both populations are currently invisible to the product.

**Architectural decision:** Dual-path eligibility gate. Publication path (existing) OR trial path (new). Trial path: verified PI/Sub-I/Study Chair/Study Director on trial within last 5 years AND `first_pub_year >= 2008 OR first_pub_year IS NULL` (relaxed career age guard for trial-only candidates).

**Why P0:** Direct contradiction with documented methodology thesis. Trial-path candidates include established KOLs (who should land in `kol` tier) and early-career trialists (who should land in `rising_star`).

**Dependencies:** Validation against named test cases requires Established composite (8a) to be available. SQL change is small but validation has to wait.

**Estimated effort:** 1-2 days for SQL change + validation; depends on 8a for proper validation.

### 8d. Data-presence-weighted formula committed but not implemented (NEW May 3 Sunday)

**Problem:** Methodology decision log line 350 commits: "a component with no data should not silently penalize the HCP." Implementation does penalize — components without populated data contribute 0 to the composite, shrinking the score's theoretical range for HCPs missing those components. The v1.3 Rising Stars formula committed during May 3 evening session (Cursor Prompts 1-4) explicitly violates this principle.

**Why P0:** Affects every composite score in the system. Structural correctness issue, not localized. Required for v1.3+ correctness, not v1.5 backlog. The v1.3 rescore is deferred until data-presence weighting lands.

**Implementation pattern:** Track which components have non-null populated data per HCP × TA pair; compute the sum of nominal weights for populated components; rescale each populated component's weight by `nominal_weight / sum_of_populated_weights` so the rescaled weights sum to 1.0. Apply rescaled weights to populated component scores.

**Why this blocks naive eligibility gate tightening:** Sunday evening session considered tightening the documented gate (`total_career_pubs IS NULL OR < 10` → demote to unranked). Volume preview matched expected 120 demotions across 3 TAs, but name-level preview revealed top-cohort HCPs would be incorrectly demoted (Yang Wang at composite 72.04, Michael Trauner, Amit Singal — all real researchers whose null career_pubs is OpenAlex enrichment incompleteness, not thin actual record). Naive gate cannot distinguish "data foundation incomplete" from "thin actual record." Data-presence weighting solves this by lifting composite scores for data-incomplete HCPs without affecting plateau-bug HCPs.

**Estimated effort:** 2-3 days implementation across both Rising Stars and Established composites plus validation.

### 8e. OpenAlex coverage gap on recent publications (NEW May 3 Sunday)

**Problem:** 50.9% of 2026 publications are unenriched. 43.2% of 2025. 36.4% of 2024. Pattern is OpenAlex coverage lag on recent publications, not script-side failure (May 3 morning audit Foundation Issue 8). Methodology doc's prior characterization at line 654 attributed the gap to script issues, which was incomplete.

**Status post-May 3 Sunday evening:** OpenAlex pipeline refactor and re-run captured 80,000+ publications enriched with 7 fields. The remaining unenriched cohort is primarily OpenAlex coverage gap (papers OpenAlex hasn't indexed yet), not script failure. Significantly fewer than expected — script failures were a smaller share than morning audit assumed.

**Three remediation paths:**
1. **Quarterly OpenAlex refresh cadence** — operational scheduling, not single-session intervention. As OpenAlex catches up on recent publications over coming months, refresh runs progressively close coverage gap.
2. **Secondary citation source** (CrossRef and/or Semantic Scholar) — different citation graphs have different coverage characteristics. Fallback source for OpenAlex 404s could close some immediate gap. 2-4 days script work.
3. **OpenAlex pipeline further refactor** — script-side issues now handled (Sunday evening refactor). Quarterly cadence handles the rest.

**Why P0:** Constrains every downstream signal that depends on citation data — pub velocity formula redesign (8b), h-index path decision, validation cohort scoring. Until coverage matures, dependent decisions are made on incomplete data.

**Estimated effort:** Quarterly refresh is operational. Secondary citation source 2-4 days. Coverage maturation via OpenAlex's own indexing is months, not days.

### 8f. Trials pipeline architectural refactor — Stage 1 + 1.5 SUBSTANTIALLY COMPLETE, Stage 2 next (UPDATED May 4 Monday afternoon)

**Status update May 4 afternoon:** Stage 1 (capture all overall_official investigators) and Stage 1.5 (capture site-level investigators from `locations[].contacts[]`) implemented and validated against 5-HCP and 50-HCP test runs. Full re-run against ~5,860 NPI HCPs is in progress; one mid-run statement timeout was resolved by reducing `clinical_trials` upsert batch size from unbounded to 10 trials per batch. Resume-from-checkpoint is working. Stage 2 (matching pipeline) is the remaining workstream; algorithm specification empirically validated this afternoon and ready for implementation.

**Original problem (May 4 morning):** Current `trials_pipeline.py` is investigator-first architecture (queries CT.gov per HCP) with name matching + affiliation confidence ≥ 40 gate. Produces 552 verified trial linkages across 567 HCPs in launch TAs (NSCLC 321, Rare Disease 140, Hepatology 106). Distribution is healthy long-tail (top HCPs at 24, 23, 22 trial linkages; many in 5-15 range). Coverage by TA is workable, even strong for NSCLC.

**HOWEVER:** the script processes one HCP at a time and only records the *queried* HCP's link to each trial. Other co-investigators on the same trial are visible in the API response (CT.gov shows 3-5 investigators per trial typically) but never written to the database. Co-investigator pair computation is impossible from current `trial_investigators` data — every trial has only ONE investigator linkage in our database.

**Why P0:** Direct blocker for Orbit-via-trials, which is the heavier-weighted half of the Orbit composite. Without co-investigator data, Orbit-via-trials does not compute. Empirically validated Monday morning — single-HCP orbit query against current trials data returned zero co-investigators for the highest-link HCP.

**Stage 1 implementation (May 4 afternoon, complete):**
- Schema migration: `trial_investigators.hcp_id` made nullable; added `match_confidence INTEGER`, `investigator_raw_first_name`, `investigator_raw_last_name`, `investigator_raw_affiliation` columns
- Existing 552 verified rows preserved with `match_confidence = 100` set by migration UPDATE
- Unique constraint added on `(trial_id, raw_first_name, raw_last_name, role)` for upsert idempotency
- `extract()` function modified to record EVERY official with valid role (PI, Sub-I, Study Chair, Study Director), not just queried-HCP matches
- `insert_links()` modified to use upsert with `on_conflict` semantics
- `splitn()` parser fix to handle multi-credential names ("Rebecca J Brown, M.D., Ph.D." was previously parsing as `first_name="m d"`, fixed to handle repeated trailing credential stripping)
- Cleanup of 14 malformed legacy rows from initial test run (where parser bug had created `first_name="m d"` rows alongside corrected versions)

**Stage 1.5 implementation (May 4 afternoon, complete):**
- Discovered during 5-HCP test that average ~1.36 investigators per trial ingested vs. the 3-5 I had projected — investigated by inspecting NCT05675410 (Hodgkin Lymphoma phase 3) directly. The trial had **404 locations with 397 site PIs**, none of which we were capturing because they live in `locations[].contacts[]`, not `overallOfficials[]`.
- Site-level capture is the actual unlock for Orbit: site PIs are the treating-physician investigators MSLs care about, vs. trial-level Study Chairs which are typically just 1-2 per trial.
- Schema migration: added `investigator_raw_facility`, `investigator_raw_city`, `investigator_raw_state`, `investigator_raw_country`, `source` columns
- Unique constraint expanded to include `source` and `investigator_raw_facility` for proper differentiation between overall_official and site_contact rows of same investigator
- `extract()` function adds second pass over `locations[]`, captures every site contact with valid role
- 50-HCP test produced 17,385 trial_investigator links (vs. 28 from pre-1.5 5-HCP test — three orders of magnitude richer data)
- 13,594 site_contact rows captured with full structured location data populated
- Site_contact rows show 17,005 PRINCIPAL_INVESTIGATOR + 346 SUB_INVESTIGATOR, validating the structural insight

**Trial-level investigator distribution (post-Stage-1.5, 50-HCP test):**
- 6 trials with 100+ investigators (cooperative-group oncology trials: Olaparib ovarian 665, EQUATE myeloma 527, BRCA1 surgical 484, breast radiotherapy 412, Hodgkin Lymphoma 399, MyeloMATCH 221)
- 2 trials with 50-99 investigators
- 1 trial with 20-49
- 1 trial with 2-4
- Long tail of single-investigator trials (mostly NIH-sponsored or industry phase 1)

**Stage 2 algorithm specification (May 4 afternoon, ready for implementation):**

Tier 1 matching pipeline empirically validated against 44,019 unmatched US site_contact rows. Of those:
- 4,381 have at least one HCP candidate by last_name + state (10% match ceiling on current data)
- Among matchable rows: 3,546 (81%) have exactly 1 candidate, 538 (12%) have 2-3, 207 (5%) have 4-9, 90 (2%) have 10+

Decision tree:
- 0 candidates → status='no_candidate', confidence=NULL
- 1 candidate → require first_name match (full or initial-with-confirmation, NOT initial-only-shared-letter to avoid Derek/Deborah false positives) → MATCH @ 95
- 2-3 candidates → city match required + first_name pass → MATCH @ 85; else institution token overlap → MATCH @ 75
- 4-9 candidates → require all of: city + first_name + institution → MATCH @ 70
- 10+ candidates → strict three-way match → MATCH @ 65 floor

**Decisions locked May 4 afternoon for Stage 2:**
- Add `match_status` column to `trial_investigators` (cheap, useful for audit)
- Confidence floor 75 for accepting matches (conservative, false-positive prevention)
- Skip prefix-name handling ("Del Priore", "Van Cutsem") for v1 — accept those as unmatched until v1.5
- Single matcher script `trial_investigator_matcher.py`, runs as separate workstream from ingestion
- Group queries by `(last_name, state)` key for performance — one candidate query per unique key, not per row

**Honest framing on matching ceiling:** Approximately 10% of unmatched US site_contacts will resolve to HCPs in current data state. The other 90% are real clinical investigators who simply don't exist in our HCPs database (most US site PIs aren't published-author-driven HCPs in our table) or whose `state` field is null (75% of HCPs lack state — see P0 #8l). Resolving the 90% requires HCP database expansion (P0 #8l), not matching algorithm improvements.

**Estimated effort remaining:** Stage 2 implementation + runtime: 1 day. Then `hcp_relationships` table computation + Orbit composite scoring methodology design + frontend work as separate Orbit feature workstreams.


### 8g. Industry exclusion gap — pharma affiliations slipping through (NEW May 4 Monday)

**Problem:** Top-cohort HCPs in launch TAs include researchers with pharma/biotech affiliations that the industry exclusion filter (P0 #1) should catch but doesn't. Empirical examples surfaced Monday morning during Orbit candidate selection:
- **Yang Wang** at "Medicine Design" — Hepatology #1 by composite (72.04, dramatically higher than #2 Gores at 31.30). "Medicine Design" is plausibly a pharma R&D department name (Pfizer Medicine Design exists).
- **Ruihan Guo** at "Helixon US Inc." — NSCLC #4 (composite 30.30). Helixon is an AI-drug-discovery biotech.

**Why P0:** Industry researchers ranking in the rising star feed undermines the product's central claim of identifying clinical opinion leaders. A buyer notices this immediately — pharma scientists have no place in MSL engagement targeting.

**Hypothesis on cause:** P0 #1 industry exclusion shipped tactical fix only (`INDUSTRY_PATTERNS` list applied in `getRisingStars`). Pattern list may be incomplete (missing "Medicine Design", "Helixon", possibly other modern pharma/biotech naming patterns). Architectural hardening was deferred to v1.5.

**Decision needed:** Audit `INDUSTRY_PATTERNS` list against current top-cohort HCPs. Expand pattern list. Consider whether institution-type signal from OpenAlex (`institutions[].type`) provides a more robust filter than string pattern matching.

**Estimated effort:** 1 day for pattern audit + expansion. v1.5 architectural hardening is the proper fix.

### 8h. Duplicate publication rows inflate aggregate queries (NEW May 4 Monday)

**Problem:** `publications` table stores one row per HCP-author pair, not one row per unique publication. A 6-author paper with 6 tracked HCPs has 6 rows, all with same DOI. Surfaces during Orbit work — DOI `10.1093/HEP.0000000000000004` (Younossi 2024 Hepatology paper, 6 authors) has 8 rows in our database, because two of the authors (Linda Henry, James M Paik) have duplicate `hcps.id` records that didn't merge during dedup. Each row represents a different (publication, hcp_id) pair.

**Why P0:** Affects every aggregate query touching publications. Counting publications gives publication-author-pair count, not unique publications. Pub velocity, citation totals, journal counts, citation_trajectory_score — all potentially inflated by the duplication factor (varies per HCP based on co-author overlap).

**Hypothesis on scope:** Likely affects scoring computations already, in ways not yet audited. The Linda Henry / James M Paik duplicate `hcps.id` records suggest Category C dedupe backlog (6,174 unmerged groups documented elsewhere) is producing this issue at scale.

**Two possible fixes:**
1. **Deduplicate publications table** — collapse to one row per unique DOI. Requires choosing canonical hcp_id (or making publications-to-hcps a proper junction table).
2. **Audit aggregate queries** — ensure all publication aggregates use `COUNT(DISTINCT doi)` rather than `COUNT(*)`. Doesn't fix the underlying data model but prevents inflation.

**Estimated effort:** Approach 1 is 1-2 days schema change + migration. Approach 2 is half-day audit.

### 8i. OpenAlex unchanged-path bug — recovered Monday morning (NEW May 4 Monday)

**Problem (now fixed):** Sunday evening's OpenAlex re-run reported 82,056 publications processed but only 51,770 actually got new JSONB fields written. Bug: the script's "unchanged citation_count" path was skipping the entire database write, including the new JSONB fields. 53,305 publications were processed by the API but had no new data written.

**Root cause:** The optimization "if citation_count matches old value, skip update" was correct when the only field being written was citation_count. After Sunday's refactor added 6 new JSONB fields plus a timestamp, the optimization became incorrect — it was now skipping rich data writes based on a comparison that was no longer the only relevant column.

**Status:** Fixed Monday morning. Cursor refactor applied two changes: (1) filter expanded from `citation_count IS NULL` to `openalex_enriched_at IS NULL`, catching both unchanged-path bug victims (~32K) and original-pipeline-only cohort (~105K); (2) update logic rewritten to always write JSONB fields when OpenAlex returns data, regardless of citation_count comparison. Validation slice (603 publications) confirmed fix works.

**Why captured here:** Post-mortem documentation. Bug was a side effect of preserving "existing logic where possible" during Sunday's refactor without auditing whether that logic was still appropriate after the field set changed. Worth flagging in audit pattern: when adding new fields to an existing write path, audit the conditional write logic for assumptions that may no longer hold.

**Estimated effort:** Fix complete. No further action needed beyond completion validation when the re-run finishes.

### 8j. Phase B career enrichment producing inflated `total_career_pubs` for substantial cohort (NEW May 4 Monday)

**Problem:** Capture-rate analysis across 5 candidate Rising Star HCPs (Mysore, Samorodnitsky, Sohal, Vuppalanchi, Gores) shows publications-in-database divided by `total_career_pubs` ranges from 91% (small career: 58 career_pubs) down to 1.2% (large career: 1,013 career_pubs). The pattern is monotonic: smaller career = higher capture, larger career = lower capture.

**Specific case suggesting Phase B issue:** Aalam Sohal (`hcps.id = 4b0b2a21-3ed3-4ebb-a825-f12c91bd28d5`) has `total_career_pubs = 192` with `first_pub_year = 2023`. Three years of publishing → 192 career publications would average 64 publications/year, well above hyperprolific researcher rates. By comparison, his actual visible publications (10 in our database) show consistent first-author hepatology papers in legitimate venues at ~3-5 publications/year — a more plausible rising-star trajectory.

**Hypothesis:** The broken Phase B career enrichment script (`pick_confident_author_match` in `openalex_pipeline.py`, fuzzy-name-only matching with no institution disambiguation) is producing two distinct false-positive patterns:
1. **Joanne Kurtzberg pattern (already documented):** `first_pub_year` corruption — match picks up an early-career researcher with the same name, overwriting the senior researcher's actual publication start year.
2. **Sohal pattern (newly suspected):** `total_career_pubs` inflation — match picks up a different researcher with the same name who has a substantially larger publication footprint, inflating the career publication count.

Both patterns originate from the same architectural issue: name-only fuzzy matching with no institution gating in the Phase B career enrichment.

**Why P0:**
- `total_career_pubs` feeds the eligibility gate (`total_career_pubs >= 10`), so inflated values let HCPs pass the gate who shouldn't, and depressed values block HCPs who should pass.
- Capture-rate metric is now corrupted as a diagnostic — we can't distinguish "low capture because of PubMed ingestion gap" from "low capture because Phase B inflated the denominator." This makes data foundation diagnostics unreliable.
- The Established composite (P0 #8a) depends on `total_career_pubs` and `first_pub_year` for tier classification. If those values are corrupted by Phase B for senior researchers, the Established cohort will misclassify.
- Affects an unknown share of the HCP database — but the capture-rate pattern across the 5 candidates suggests it's substantial.

**Required investigation:**
- Audit the Phase B career enrichment write logs to identify which HCPs had `total_career_pubs` and `first_pub_year` written by Phase B vs. populated through other means (PubMed direct, manual entry, Scholar enrichment).
- For Phase B-populated HCPs, validate against alternative sources: ORCID lookup, OpenAlex direct query with institution gating, sanity check against `first_pub_year` vs. `total_career_pubs` plausibility.
- Determine the correct corrective action: rewrite Phase B with institution gating, then re-run to overwrite corrupted values; or null out Phase B-populated values pending the architectural fix.

**Estimated effort:** 2-3 days investigation + Phase B refactor + re-run + validation. The Phase B refactor is itself the same disambiguation work needed for Orbit's `hcps.id ↔ openalex_author_id` mapping infrastructure (P1 #14, Phase 2). Worth combining the workstreams.

### 8k. Non-clinician research scientists ranked as clinical rising stars (NEW May 4 Monday afternoon)

**Problem:** Academic research scientists (Ph.D. postdoctoral fellows, lab-based research scientists) are being classified as clinical rising stars in launch TA cohorts. Empirical case surfaced May 4 afternoon during Orbit proof-of-concept on Eric Samorodnitsky:

- **Eric Samorodnitsky** — NSCLC #1 rising star by composite (30.59). External verification (LinkedIn, ResearchGate): Research Scientist at OSU Wexner Medical Center, Postdoctoral Fellow Ph.D., works in Sameek Roychowdhury's precision oncology lab on RNA sequencing assay validation. Not a clinician. Does not see NSCLC patients. His relationship to NSCLC is "publishes research about NSCLC molecular profiling."
- His Orbit shows the expected pattern for a lab researcher: 13 of 15 collaborators at OSU, dominated by a single PI (Roychowdhury, classified mentor) and lab members. Topically coherent for precision oncology, but not the multi-institutional consortium pattern characteristic of clinical investigators.

**Distinct from existing exclusion gaps:**
- **Different from P0 #1 industry exclusion** (Yang Wang at "Medicine Design", Ruihan Guo at "Helixon US Inc.") — Samorodnitsky is at an academic medical center, not a pharma/biotech company.
- **Different from TA classification breadth observation** (Kleiner/Kurzrock in NSCLC) — those are real clinical investigators with broader-than-NSCLC scope. Samorodnitsky is a research scientist, not a clinician at any TA.

**Pattern across three launch TAs is consistent:**
- Hepatology #1: Yang Wang at "Medicine Design" (industry-suspected, P0 #8g)
- NSCLC #1: Eric Samorodnitsky (research scientist, P0 #8k) and #4 Ruihan Guo at "Helixon US Inc." (industry, P0 #8g)
- Rare Disease: top 3 verified clinical (Kowdley, Vuppalanchi, Christiani), but positions 4-9 dominated by null-institution / null-career_pubs HCPs at the pub_velocity plateau

**Why P0:** Research scientists and industry researchers ranking at the top of the rising star feed directly compromises the product's central credibility claim ("we identify rising star HCPs that traditional KOL databases miss"). A buyer who opens the rising star feed and sees a Ph.D. postdoctoral fellow ranked #1 in NSCLC will not give the product credibility. This is immediately disqualifying for sophisticated buyer scrutiny.

**Signals for distinguishing clinicians from research scientists:**
- **NPI presence:** Clinicians have NPIs; research scientists generally don't. Strongest single signal — but `hcps.id` query against current data shows mixed coverage.
- **Trial-investigator role on phase 2/3 clinical trials:** Clinical PIs/Sub-Is appear in CT.gov investigator records; pure research scientists generally don't. Currently blocked by P0 #8f trials pipeline issue.
- **Author position patterns:** Research scientists are typically middle authors on consortium papers; clinical PIs are last authors on patient-facing studies.
- **Institution role within institution:** Department/division ("Hepatology," "Pulmonary and Critical Care") vs. lab/center ("Roychowdhury Lab," "Comprehensive Cancer Center Research"). Captured in OpenAlex `authorships[].institutions[].lineage` array.

**Recommended filter design:**
Cleanest filter for v1.0: **HCPs without NPI AND without trial-investigator role on at least one phase 2/3 clinical trial → exclude from rising star feed.** Combination signal is more robust than any single feature. The trial-investigator path requires P0 #8f to be solved first.

**Required investigation:**
- Audit all top-N rankings (top 50 per TA) for clinician vs. research scientist split. Determine prevalence of the issue.
- Validate filter design hypothesis on a sample — does NPI + trial role correctly distinguish clinicians from researchers in the audit cohort?
- Decide v1.0 patch (string-pattern exclusion of postdoctoral / research scientist titles where available) vs. v1.5 architectural fix (proper credential/role classification).

**Estimated effort:** 1 day audit + filter design. 2-3 days implementation. Combines naturally with P0 #8g (industry exclusion gap) since both are "non-clinician HCPs in feed" issues with overlapping fix architectures.

### 8l. HCP ingestion expansion — state coverage gap caps trial matching at 10% (NEW May 4 Monday afternoon)

**Problem:** Empirical analysis during Stage 2 design surfaced that only 25.3% of HCPs (23,791 of 93,914) have `state` populated. Among NPI-verified HCPs (8,605 total), 99.99% have state — so the gap is concentrated in the non-NPI cohort (~85K HCPs without state). This caps the trial-investigator matching pipeline at ~10% resolution rate against current data because state is the strongest disambiguation signal.

**Why P0:** Three downstream effects compound:
1. **Trial matching ceiling:** Of 44,019 unmatched US site_contact rows from today's ingestion, only 4,381 (10%) have any HCP candidate by last_name + state. Without state on 75% of HCPs, the matching pipeline cannot distinguish "John Smith at Mayo Clinic Rochester MN" from "John Smith at Cleveland Clinic OH" except via institution string fuzzy matching, which is much noisier.
2. **Orbit graph completeness:** Most US clinical trial site PIs (community oncologists, COG site PIs at children's hospitals) won't resolve to HCP profiles in Orbit because matching can't find them. They appear as text-only nodes ("Dr. Smith at Camden Clark Medical Center, WV") rather than click-through HCP profiles.
3. **Credential validation (P0 #8k) is blocked:** The `has_trial_role` signal that distinguishes clinicians from research scientists requires successful site_contact-to-HCP matching. Without resolved matches, the signal is sparse (only 1 of 167 top-cohort HCPs had `has_trial_role=true` per today's audit, vs. an expected ~40-60% if matching were complete).

**Hypothesis on cause:**
- PubMed-derived HCPs (the bulk of `hcps`) lack state because PubMed affiliation strings are inconsistent ("Mayo Clinic" with no city/state, vs. "Mayo Clinic, Rochester, MN, USA"). Affiliation parser may not extract state reliably.
- NPPES (NPI registry) does have state for every NPI HCP — but ingestion may have only used NPPES for HCPs already linked to publications, leaving non-publication NPI HCPs not pulled.
- International HCPs legitimately have no US state — but US researchers without state are a coverage bug.

**Required investigation:**
- Audit PubMed affiliation parser logic for state extraction quality
- Inspect `hcps` rows with `country='United States' AND state IS NULL` — are these real US researchers or country-classification noise from the residual data integrity issues we've been working through?
- Determine whether NPPES bulk pull (covering all NPI clinicians regardless of publication status) is feasible — would expand HCP database by potentially hundreds of thousands of NPI clinicians not currently in our table

**Recommended fix path:**
- **v1.0 short-term:** Backfill state from NPPES for existing NPI HCPs where `state IS NULL`. Should immediately move matching ceiling from 10% to ~25-30%.
- **v1.5 expansion:** NPPES bulk pull to ingest all US NPI clinicians who run trials but don't publish. This addresses the "site PI exists in CT.gov but not in our HCPs table" problem at scale. Could expand `hcps` from 93K to several hundred thousand.
- **v1.5 international:** Geocode international institutions to populate state/region for non-US researchers. Lower priority unless international Orbit becomes a launch focus.

**Estimated effort:**
- Short-term NPPES state backfill: 1-2 days
- v1.5 NPPES bulk pull: 3-5 days plus validation
- International geocoding: 2-3 days plus methodology decisions on regional taxonomy

**Note on architecture:** This finding strengthens the case for the publication-side AND trial-side composite Orbit framing (per the May 4 methodology weighting decision). Even with thin trial-side matching, the publication-side data foundation captured by the OpenAlex re-run today is independent of NPI/state coverage gaps. Both signals together produce more complete orbits than either alone.

### 8m. NIH RePORTER ingestion — federal grant data as credential and TA signal (NEW May 5 Tuesday morning)

**Problem:** FieldMark currently lacks federal grant data despite NIH RePORTER being a freely available public API. Grant funding is one of the strongest possible signals of "real clinical researcher with sustained funded program" and provides multiple layers of value to the methodology that publication and trial data alone cannot supply.

**What NIH RePORTER provides:** All NIH-funded research grants, queryable by PI, institution, fiscal year, IC (institute/center), and study section. Each record includes project number, PI(s), institution, total funding amount, project dates, full abstract, and MeSH/RCDC categories (NIH's structured TA classification). Free public REST API, well-documented, no rate-limit concerns at FieldMark's scale.

**Why P0:** Five distinct value layers that compound across multiple existing P0 items:

1. **Credential validation strengthens (addresses P0 #8k):** Active R01 holders are by definition independently-funded clinical researchers. Non-clinician research scientists like Eric Samorodnitsky should not appear as NIH PIs in clinical TA categories. Industry employees like Yang Wang should not appear at all. Grant data provides direct cross-validation of "is this person a real clinical investigator" that the current credential signals (NPI, has_trial_role) cannot.

2. **TA classification strengthens (addresses methodology gaps):** NIH RCDC categories (Lung Cancer, Liver Disease, Rare Diseases, etc.) provide structured TA labels that complement publication-MeSH-derived labels. Cross-validation reduces false positives like David E Kleiner (NCI pathologist) appearing in NSCLC top-5.

3. **Rising star signal — K-awards specifically:** K01, K08, K23, K99/R00 are NIH's investment in early-career investigators. K-award holders are by definition rising stars in NIH's framing. This may be a more credible institutional signal than pub velocity trajectory (which has degeneracy issues per P0 #8b). Worth examining whether K-award status should be a Tier 1 signal in the rising star formula.

4. **Current research interest inference:** Grant abstracts plus MeSH terms tell you what the HCP is *currently working on* (vs. what they published 5 years ago). For MSL workflow ("what is this person investigating?"), grant data is more current than backward-looking publication history.

5. **Funded vs. unfunded researcher distinction supports tight-and-refined:** Many HCPs publish without independent NIH funding. Independently-funded PIs are a smaller, more selective cohort. Aligns directly with the "tight and refined" curation thesis — every HCP earns their place through demonstrated research activity, and active R01/U01/P01 funding is among the highest evidence bars.

**Implementation scope:**
- Schema: new `grants` table + `grant_investigators` table mirroring `clinical_trials`/`trial_investigators` architectural pattern
- Ingestion script: per-HCP query by PI name (similar pattern to current `trials_pipeline.py`)
- Could be designed to record all grants for each HCP plus all co-investigators on those grants (mirror of Stage 1.5 expansion just completed for trials)
- API integration straightforward — RePORTER returns clean JSON, paginated
- Co-investigator capture provides additional Orbit signal layer (grant collaboration is often more current than publication collaboration)

**Estimated effort:** 2-3 days for schema + ingestion script + initial validation. Similar shape and complexity to trials pipeline work just completed.

**Sequencing consideration:** Could fit naturally after Stage 2 matcher application and before pub velocity redesign (P0 #8b). The grant data may inform pub velocity redesign by surfacing whether K-award status and recent R01 activity should be incorporated as alternative rising-star signals when pub velocity is sparse.

**Adjacent grant sources to consider in scope decision:**
- **CDMRP (DoD congressionally-directed research):** Substantial cancer-specific funding, public database, includes BCRP, LCRP, etc. Worth ~1 day add-on after NIH RePORTER pattern is established.
- **CIRM (California regenerative medicine), CPRIT (Texas cancer):** State-level funding bodies with public databases. ~1 day each. Lower priority but valuable for specific TA coverage.
- **Foundation grants (ASCO Conquer Cancer, AACR, LLS, ALSF, etc.):** No central API. Per-society scraping. Probably v2.0+ unless one specific foundation matters disproportionately for a launch TA.

### 8n. Open Payments / Sunshine Act data — strategically loaded, methodology decision required (NEW May 5 Tuesday morning)

**Problem:** The Open Payments program (CMS, mandated by the Physician Payments Sunshine Act of 2010) publishes all financial relationships between drug/device manufacturers and US physicians. The data is fully public, has both bulk CSV downloads and a documented REST API at openpaymentsdata.cms.gov, and provides per-physician records of consulting fees, speaking fees, research payments, royalties, and ownership interests. **Technical access is not the constraint. Strategic positioning is.**

**Why this is captured as a P0 (rather than a backlog item):** The data is genuinely informative for MSL workflows — knowing who else is paying Dr. Patel and how much is actionable competitive intelligence. But surfacing it prominently triggers exactly the controversy mitigation concern called out in the project's foundational framing ("potential controversy around pharma industry influence on HCP identification needs proactive mitigation"). This isn't a build-it question; it's a should-it question that needs to be answered before any architectural decisions.

**The strategic loading explained:**

1. **Buyer awareness asymmetry:** Pharma medical affairs already knows Open Payments exists and checks it on individual HCPs. But integrating it into a curated database alongside rising-star scoring shifts the workflow from "research individual HCPs as needed" to "systematically map competitor engagement across the database." Some buyers love this. Others get nervous about appearing to systematically map competitor relationships, which has antitrust optics.

2. **HCP perception risk:** When physicians discover FieldMark exists and surfaces their financial relationships with industry, the reaction can be hostile even if the underlying data is fully public. "Curated database that includes my pharma payments" reads differently to an HCP than "public CMS database where my payments live among everyone else's."

3. **Methodology trap:** Tempting to incorporate Open Payments into rising-star scoring (high research payments = high industry engagement = high score). This conflates "industry has paid attention" with "scientifically meaningful." The signal reflects industry strategy, not necessarily clinical importance. Including it in scoring would corrupt the editorial claim that ranking reflects research activity, not commercial relationships.

4. **The non-controversy controversy:** Open Payments integration is exactly the kind of feature that triggers the project's central perception risk. Even if used responsibly, it creates the appearance that FieldMark's purpose is to map pharma-physician financial networks rather than identify rising-star research leaders.

**Three architectural options for how to handle Open Payments:**

**Option A — Don't ingest. Direct users to Open Payments themselves.**
FieldMark provides Rising Star ranking + Orbit relationships. Industry payment lookups happen at openpaymentsdata.cms.gov. Clean separation of concerns.
- Pro: No controversy attached to FieldMark. Simplest narrative defense.
- Con: Adds friction to MSL workflow. Misses an obvious signal that competitors will integrate.

**Option B — Ingest but display only on the HCP detail page, never in ranking or feed.**
Industry payments appear as a "Disclosures" tab on the HCP profile, alongside publications and trials. Not factored into Rising Star score. Not used for sorting or filtering.
- Pro: Captures the signal without polluting ranking. Buyer convenience without methodology corruption.
- Con: Still creates "FieldMark surfaces pharma payments" optics issue. HCP perception risk persists.

**Option C — Ingest as internal validation signal only, never expose to users.**
Use Open Payments as credential validation cross-check (does this person have evidence of being an engaged researcher beyond publications?) and as an industry-employee filter (are they receiving payments that look more like employment than research engagement?). Internal to scoring methodology, not displayed.
- Pro: Captures analytical value. No user-facing controversy.
- Con: Loses buyer-utility benefit. Buyer can't see what they'd actually want to see.

**Recommended path:** Option B is likely the right answer, but only after FieldMark has established credibility on its core promise (curated rising-star database). Open Payments integration is a v1.5+ feature, not a launch feature. Premature integration risks defining FieldMark as "the pharma payments database" instead of "the rising star database that also has pharma payment data." The launch positioning is fragile until the curation claim is established by other signals.

**Decision needed before implementation:** Garrett-level call on which option to pursue. Methodology and architectural implications differ across the three options. This is not an engineering question; it's a product positioning question.

**Estimated effort if approved:** 3-5 days for ingestion + schema + UI integration depending on option chosen. Option B is the most engineering work; Option C is the least (no UI).

---

## P1 — High-impact, ship across v1.5 and v1.6

These are not v2.0 launch blockers but each materially improves the product before launch. Several are the strategic features that give the product a continued narrative arc through v1.5 and v1.6.

### 9. Mobile navigation gaps

**Problem:** Multiple navigation issues surfaced during mobile testing tonight:
- Dark Horse filter has no clear "off" affordance — user has to know to re-tap the same chip
- FM logo in TopBar is not tappable; should function as "home" / reset to default feed
- Hardware back button behavior on mobile not verified — single-page React apps often lack browser history integration

**Estimated effort:** 30-60 min for the visible affordances, possibly 2-4 hours if browser history needs proper React Router integration.

### 10. DOL panel placement on dark horse view

**Problem:** Currently hidden when dark horse filter is active (correct). But on the rising stars view, the DOL panel takes vertical space above the feed even when scrolling, pushing content down. May benefit from being collapsible or moved.

**Status:** Decorative concern, not a bug. Worth a UX review.

### 11. Profile screen interactive features and LinkedIn data surfacing

**Problem (existing):** Profile screen shows territory selection (Northeast/Southeast/etc.), default TA picker, default indication picker, notification toggles. Verified that none of these flow into actual queries — the territory shown isn't a real filter. This is "decoration as feature."

**Problem (NEW finding May 2 evening):** Profile screen shows MSL identity as initials avatar + name + role + "Verified via LinkedIn" badge, but exposes no other LinkedIn-derived data. Adding the user's company name (e.g., "Ipsen") visibly to the profile would:
1. Reinforce the LinkedIn verification claim with concrete evidence
2. Provide MSL company context that becomes useful for future features (industry exclusion personalization — an Ipsen MSL should not see Ipsen-employed researchers as candidates)
3. Establish a foundation for surfacing more LinkedIn data over time (current role title, years in industry, therapeutic area focus, LinkedIn profile URL)

**Recommended display additions:**
- Company name (primary employer from LinkedIn work history) — most valuable single field
- Optional secondary: role title, years in current role
- Avoid: profile photo (privacy concerns at scale), LinkedIn URL link (encourages off-platform navigation)

**Status:** Three paths converge here:
- (a) Wire the profile to actually drive feed defaults — part of filtering workstream (P0 #4)
- (b) Strip non-functional UI to avoid making implicit promises (interim fix)
- (c) Surface LinkedIn-derived data once OAuth integration lands (P3 #23) — gates on OAuth

For demo purposes pre-OAuth, hardcoded company name on the profile (e.g., "Ipsen" for Priya Nair test profile) demonstrates the concept without requiring the full OAuth integration.

**Estimated effort:** Hardcoded demo display: 30 min. Full OAuth-driven LinkedIn data flow: 1-2 days post-OAuth integration.

### 12. Narrative coverage for rebuilt dark horse cohort

**Problem:** The 21 dark horses post-rebuild may not have narratives generated. Detail screen for Colton G Brown showed "Narrative generating — check back soon," which is the EMPTY_HCP fallback string, not a real generation-in-progress status.

**Status:** Need to verify whether `hcp_narratives` table contains rows for the new dark horse hcp_ids. If not, narrative generation pipeline needs to re-run against the rebuilt cohort.

**Estimated effort:** Diagnosis 15 min, narrative regeneration depends on Claude API costs and pipeline state.

### 13. OpenAlex citation backfill completion review

**Problem:** OpenAlex script was running in background overnight, expected to finish enriching `citation_count` on 33,959 unique DOIs. Need to verify completion, success rate, and decide whether scoring pipeline should re-run against newly-complete citation data.

**Status:** Pending verification. May have completed by the time this document is read.

**Implications if rescoring:** Tier classification will likely shift. Some current dark horses will move out, some new ones will move in. Methodology absorbs this — but dark horse cohort size may grow or shrink. Worth knowing the new distribution before any demo.

### 14. Collaborative Orbit — foundation work for v1.5, surface as v1.6

**Status update May 4 Monday:** Methodology weighting decision made — trials side weighted more heavily than publications side, both incorporated into composite Orbit relationship score. Architectural blocker on the trials side surfaced (P0 #8f) — current trials pipeline only records the queried HCP per trial, not all co-investigators. Publication-side data foundation is in place after Monday's OpenAlex re-run completion (~135K publications with `authorships` JSONB capturing canonical OpenAlex author IDs, ORCIDs, author positions, institutions with ROR/country codes).

**Concept:** A network feature that maps relationships between HCPs through co-investigated clinical trials and co-authored publications. Surfaces *who works with whom* — and specifically, when an established KOL repeatedly co-investigates with a rising researcher, that KOL is implicitly validating the rising star. An MSL with an existing relationship to the established KOL gets a warm pathway into a cold relationship with the emerging one.

**Strategic significance:** This is the moat. Most FieldMark features are better versions of things competitors could replicate. Orbit is structurally different — networks have value that grows non-linearly with database size, and they expose patterns that human review can't surface at scale. It converts FieldMark from "a ranking" into "an intelligence platform."

**Why MSLs will care:** The hardest problem MSLs face isn't identifying rising stars — it's getting to them. Cold engagement is hard in medical affairs. Orbit converts cold to warm. The MSL identifies a Rising Star → clicks Orbit → sees connections with "heat" → spots someone they know ("Oh, Hua Zhang is connected to Dr. Patel — let me reach out to her for an introduction"). Visual is non-negotiable per Garrett's design direction.

**Methodology weighting (decided May 4):**
- **Trial co-investigation (heavier weight):** Two HCPs appearing as PI/Sub-I/Co-I on the same trial. Stronger signal because clinical trial collaboration implies institutional commitment, IRB co-sign, ongoing protocol coordination.
- **Publication co-authorship (lighter weight):** Two HCPs appearing in a publication's `authorships` array. Useful supplementary signal but noisier — 30+ author consortium papers produce many spurious "relationships."

**Technical scope:**
- **Data foundation — trials side:** `trial_investigators` table exists but architecturally captures only the queried HCP per trial (P0 #8f). Refactor required to record all investigators per trial plus separate matching pass. 2-3 days focused work.
- **Data foundation — publications side:** Publication-side `authorships` JSONB is now captured for ~135K publications post-Monday OpenAlex re-run. Computable directly — co-author pairs extractable via SQL/Python aggregation. No additional ingestion work needed.
- **`hcps.id ↔ openalex_author_id` mapping infrastructure:** Required to query "all publications where Dr. X appears" via canonical author ID. Build once via batch fuzzy matching with disambiguation (institution + co-publication patterns). 1-2 days. Caveat: existing `pick_confident_author_match` in `openalex_pipeline.py` Phase B has fuzzy-name-only matching producing silent false positives (Joanne Kurtzberg `first_pub_year=2025` is the example). New mapping infrastructure must use institution gating, not just fuzzy name.
- **`hcp_relationships` table:** Computes co-investigator pairs (trials side, weighted high) plus co-author pairs (publication side, weighted low) into one weighted relationship score per HCP-pair. Relational table is sufficient — graph database overkill at this scale.
- **Orbit score component:** New scoring contribution — HCPs co-investigating with established KOLs get an "orbit bonus." Most-connected node in a rising star cluster flagged differently than isolated researchers. Affects composite score. Methodology design needed for formula and weight.
- **Capture rate caveat:** Publication-side capture varies by HCP career stage. Established researchers (Gregory Gores: 1,013 career_pubs but only ~5% visible in our database) produce sparse orbits. Rising stars (target use case for Orbit, typically 30-200 career pubs) have much higher capture rates. Frame as feature, not bug — Orbit is most valuable for the cohort MSLs need help reaching, which is precisely where capture is best.

**Visual design (per Garrett direction May 4):**
- Modal popup from HCP detail screen — "Orbit" link surfaces from card
- Target HCP at center, collaborators arranged radially
- Heat encoded via distance-from-center, node size, edge thickness — making "strength" visually scannable in seconds
- Each node shows name + institution + country flag
- 10-15 collaborator ceiling — anything more becomes noise the MSL can't process
- Click-through to collaborator's HCP detail screen if they're a tracked HCP, or basic OpenAlex info if not (Option X from May 4 design discussion — accept that some nodes show as text-only with no profile link, defensible because surfacing publication-side network visibility regardless of FieldMark coverage)
- Affiliation must be visible on every node (Garrett's required disambiguation field — common-name HCPs need institution to verify identity)

**Privacy considerations:** Orbit aggregates implicit relationships between named professionals. None of the data is private — all derived from public registries — but the aggregation is novel from an optics standpoint. Methodology already commits to opt-out flows; this is an extension. Disclosure language: "Orbit relationships derived from public clinical trial co-investigation records and peer-reviewed publication co-authorship. HCPs may opt out at any time."

**Sequencing:**
- **Phase 1 — Trials pipeline refactor (P0 #8f):** 2-3 days. Required before Orbit-via-trials computes.
- **Phase 2 — `hcps.id ↔ openalex_author_id` mapping:** 1-2 days. Enables querying publications by canonical author ID.
- **Phase 3 — `hcp_relationships` table computation:** 0.5-1 day. SQL/Python aggregates trials-side and publication-side relationships into weighted composite scores.
- **Phase 4 — Orbit scoring component:** Methodology design + implementation. Composite score gets new orbit component; tier classification may use orbit signal.
- **Phase 5 — Frontend Orbit feature:** Visual implementation per design above. v1.6 surface.

**Estimated total effort to v1.6 ship:** 4-6 weeks of focused work distributed across the five phases. Calendar time longer if interrupted.

**UX considerations:** Per Garrett May 4 — visual is non-negotiable. Lists alone don't convey "heat" sufficient to support the MSL workflow. Radial visual maps "heat" to ring placement and node size, making relative connection strength scannable. Mobile-first — bounded count (10-15 nodes) fits one screen, no zoom/pan/hover required.

**Open questions remaining:**
- Heat score formula: frequency × recency weighting, with what exact coefficients? Empirical tuning needed once data is computable.
- Position pattern interpretation: "they're senior on your shared papers" → mentor signal; "they're peer" → collaborator. Surfacing this in the visual without overloading the design.
- Trials weight vs publication weight in composite Orbit score: 70/30? 80/20? 60/40? Methodology decision pending validation against real cohort data.

**Why P1 not P0:** Orbit doesn't block launch. Launch needs the foundation work (P0) and the v1.5 hardening. Orbit is the v1.6 headline feature that gives the product a continued narrative beyond launch — "what's new in FieldMark" for the next quarterly update.

**Open question for Garrett:** Naming — Collaborative Orbit is the working name. Chess metaphors ("Discovered Attack," "Knight" for crossover researchers) were considered. Decision deferred until MSL feedback in pilot.

### 15. Methodology evolution — additive signals to sharpen the cohort

A cluster of related methodology improvements that share a common theme: making the methodology *more selective on quality*, not *less restrictive on data*. The right direction for a credibility-first product. None of these loosens existing gates; all of them add new positive signals that help identify *better* rising stars and dark horses.

**Candidate signals, ranked by impact-to-effort:**

**(a) Author position weighting** — Almost certainly already in the publications data (PubMed always exposes first/last/middle author position). Update `pub_velocity_score` to weight first-author and last-author papers more heavily than middle-author papers. Distinguishes "doing original work" from "appearing on collaborative papers." Could also add as a dark horse gate ("must have N first-author or last-author papers in last 3 years"). Probably the highest-value addition.

**(b) Editorial / review activity from PubMed publication types.** PubMed exposes publication types including "Editorial," "Comment," "Letter," "Review." A researcher being invited to write *editorials and reviews* in their field — especially as first author — is a strong "the field is asking for their take" signal. Different from research output. Often precedes wider recognition. Free signal already in the publications table as `publication_type` or similar.

**(c) IIT count surfaced as standalone dark horse signal.** Methodology already identifies investigator-initiated trials via `lead_sponsor_class != INDUSTRY`. Surfacing IIT count as a tier criterion (e.g., "1+ IIT in last 3 years" as additional positive signal in the dark horse CASE branch) sharpens identification toward truly original researchers vs. industry-trial executors.

**(d) NIH RePORTER grant data.** Free, structured, authoritative. Adding signals like "received first R01 in last 5 years" or "PI on active K99/R00 transition" is a strong rising-star marker. Requires a separate ingestion pipeline (1-2 days work), but data shape is straightforward.

**(e) H-index from OpenAlex author endpoint.** Methodology weights h-index 5% in Rising Stars (minimal) and 25% in Established KOLs (heavy). Currently sparse data — only 1,907 HCPs have Scholar h-index from prior ScraperAPI run. OpenAlex `summary_stats.h_index` may be available free via author endpoint if existing pipeline isn't capturing it. Verify before considering ScraperAPI Premium $149/mo spend. If OpenAlex covers it, targeted enrichment of ~800 HCPs (top rising stars + likely-established + DOLs) is sufficient. Quarterly refresh cadence — h-index is slow-moving and doesn't need monthly updates. **Note:** H-index does NOT help dark horse identification (structurally favors established researchers); this is exclusively for the Established KOLs view (25% weight there).

**(f) Citation velocity (vs. trajectory).** Trajectory measures rate change. Velocity measures *current* rate. A dark horse with 200 recent citations and flat trajectory might be doing important work that has stabilized. A rising star with 30 citations and steep trajectory might still be ahead of the curve. Both signals matter; methodology currently captures only trajectory.

**(g) Trial phase mix shift.** Captures researchers transitioning from Sub-I roles on Phase 3 trials to PI roles on Phase 1 trials — a textbook emerging-influence pattern. Currently the trial_investigator_score captures recency-weighted matrix statically but doesn't surface this trajectory.

**(h) Regional pub velocity bias investigation (NEW finding May 2 evening).** Hepatology dark horse cohort post-eligibility-fix is 62% PRC-based (66 of 106 dark horses, with substantial corruption-tail variants like "PR China" and email-bleed rows). Two competing hypotheses must be tested:

1. **Real signal hypothesis:** Hepatology research has genuinely shifted toward Asia-Pacific over the past decade — hepatitis B endemic regions, MASLD prevalence trends, large patient populations, government investment. The cohort accurately reflects where the field is growing.
2. **Formula bias hypothesis:** Chinese institutional research output skews toward high paper counts per researcher (academic incentive structures, larger team sizes, publication-count promotion criteria). Our `pub_velocity_score` rewards exactly that pattern — so even if Chinese hepatologists are 30% of *active* hepatology researchers globally, they may be 60% of *high pub velocity* researchers, inflating them in our scoring.

**Investigation approach:**
- Compare APAC vs Western pub velocity within career-age band — if Chinese researchers consistently 2-3x higher across all bands, that's evidence of incentive-structure bias
- Compare per-paper citation impact across regions — if Chinese hepatology papers have higher pub count but lower per-paper citation impact, methodology is rewarding volume over influence
- Geographic peer-group normalization — compute `pub_velocity` within geographic peer groups rather than globally, surface top 5% per region
- Look at established KOLs by region as a reference distribution — if 40% of established hepatology KOLs are PRC-based, then 62% dark horse APAC concentration is signal; if 15% are PRC-based, formula bias is more likely

**Why this matters strategically:** A US-based pharma MSL covering Northeast hepatology shown 60+ Chinese dark horses is methodologically served but operationally failed. Even if the methodology is correct, the *user* needs territory-relevant cohorts. This is the data-side argument for territory-default feed framing (see new P3 item). Methodology evolution and product framing are coupled here.

**Recommended sequencing within this workstream:** (a) and (b) first — both are essentially free and use data already in the publications table. (c) is a tier classification SQL change — small. (d) requires a new ingestion pipeline — medium. (e) depends on OpenAlex audit. (f) and (g) are calibration refinements for v2. (h) requires investigation before action — gather data, then decide whether methodology change or only product-framing change.

**Why P1:** Each of these is a methodology improvement, not a launch blocker. But they cluster naturally as a "v1.5 methodology calibration" workstream that complements the Orbit foundation work. Together, the methodology gets meaningfully sharper without loosening any existing constraint.

**Estimated total effort:** 1-2 weeks for items (a) through (d). Items (e) through (h) are extensions for v1.5 or v2.

### 16. Landscape feature — placeholder-driven, needs full data wiring

**Problem:** The Landscape view (accessible via "Landscape" chip from the feed) presents three tabs — Map, Momentum, Summary — that are currently a mix of partially-working and entirely-mocked surfaces. Discovered during May 2 evening Hepatology review.

**Findings per tab:**

**Summary tab — almost entirely hardcoded:**
- TOTAL RESEARCHERS: 847 — placeholder (Hepatology actually has 3,300+ rising stars + emerging tier HCPs)
- AVG RISING STAR SCORE: 74.2 — needs verification, possibly hardcoded
- AVG CAREER AGE: 6.4 yrs — uses old "Career Age" label; should use "Pub Years" terminology; value almost certainly hardcoded
- ACTIVE TRIALS: 312 — suspicious given total trial coverage is 552 HCPs across all TAs
- DARK HORSES: 47 — **wrong**. Hepatology has 106 dark horses post-eligibility-fix. The Landscape view is reading from a different data source than the Feed
- "top 8% of rising stars" copy — outdated, should be top 5%
- TOP INSTITUTIONS list (Boston Children's / Johns Hopkins / Mayo / UCSF / Columbia) — generic prestigious institutions, not derived from actual Hepatology HCP data. Given Hepatology cohort is 62% PRC-based, real top institutions for Hepatology research would include Chinese institutions
- TOP JOURNALS list (NEJM / Nature Medicine / Lancet / Blood / JIMD) — top medical journals generally, not Hepatology-specific. Field-specific journals (Journal of Hepatology, Hepatology, Gastroenterology, Liver International) are absent
- SCORE DISTRIBUTION buckets — needs verification, plausible shape
- FIELD MOMENTUM copy: "Lysosomal storage disorders and gene therapy are driving the acceleration" — hardcoded copy that's actually about Rare Disease, not Hepatology. Cross-TA contamination.

**Map tab — possibly working but US-only:**
- Shows clusters in California, Texas/Mexico, Midwest, Northeast US only
- An honest map of Hepatology research would show massive China cluster given 62% APAC concentration in dark horse cohort
- Either map is hardcoded to US-only, or data is filtered (possibly leftover USA filter we missed)

**Momentum tab — most likely partially working:**
- Plots researchers on citation trajectory vs. another axis (visibility/velocity)
- Names appear genuine and diverse: Kim, Tanaka, Wei, Delacroix, Hoffman, Omondi, Sorensen, Eriksson, Nair, Salave'a
- Color coding suggests tier classification
- "Platinum tier" / "High visibility" framing labels suggest real wiring partially in place

**Scope of work to fix:**
- Backend: new aggregation queries for landscape (institution rankings by HCP count per TA, journal rankings, score distribution buckets, regional breakdowns, dark horse counts)
- Map: data source decision — institution geocoding, country-level only, or both. Currently appears US-only
- Momentum: validate it's actually wired and not also placeholder
- Summary: comprehensive copy update + data wiring + cross-TA contamination cleanup
- Tie all data to therapeutic area selection consistently (currently the Feed and Landscape views show divergent dark horse counts, which is a credibility issue)

**Why P1:** Landscape is a secondary view, not the primary feed surface. Most users won't tap it before being convinced by the feed. But for an MSL or buyer who *does* tap it, the inconsistencies (47 vs 106 dark horses, generic top institutions, cross-TA copy contamination) immediately undermine trust in everything they just saw on the feed. Either the surface needs full wiring or it needs to be hidden until it's real.

**Estimated effort:** 1-2 weeks of focused work to wire all three tabs to real data with consistent therapeutic-area filtering.

**Alternative recommendation:** Hide the Landscape entry point until the feature is properly wired. Better to have a smaller, fully-working product than a larger product with credibility-undermining surfaces. This is a one-line change in the feed UI.

---

## P2 — Methodology depth, ship for v2.0 launch

These don't block initial pilot demos but become important as the product gets used by real MSLs at scale. Target v1.5 / v1.6 incorporation for v2.0 launch.

### 17. Institution tier weighting decision

**Problem:** Methodology weights institution_tier_score at 5% in Rising Stars composite and 15% in Established KOLs composite. Tier lists exist for Rare Disease only. NSCLC and Hepatology are unweighted, meaning the institution component is effectively zero for those TAs.

**Decision needed:** Either (a) zero the weight outside Rare Disease and document, (b) build NSCLC and Hepatology tier lists.

### 18. DOL scoring as composite component

**Problem:** Verified DOLs are identified separately from scoring. They appear in the hero panel but their social influence does not contribute to composite_score. Methodology commits to "v1.5+ DOL signal as a scoring component."

**Status:** Architectural decision. Requires defining how social influence translates to score weight.

### 19. Trial coverage expansion and trial_investigator_score zero-handling

**Problem (existing — coverage):** Only 552 of 93,769 HCPs have linked trial activity (0.6%). Trial signal is therefore essentially dark across most of the product. Methodology limits trial matching to NPI-verified HCPs (5,878 total), of which ~9.5% match a trial.

**Problem (NEW finding May 2 evening — score formula behavior):** `trial_investigator_score` is weighted 25% of the Rising Stars composite. For 99.4% of HCPs (those without matched trial activity), this 25% slot computes to zero. Two competing interpretations:

1. **Correct behavior:** Researchers without trial activity have zero trial-investigator score — that's accurate. They don't have trial activity to score on. The 25% weight is structurally correct.
2. **Suppressed behavior:** Researchers without *matched* trial activity (because our linkage pipeline couldn't connect them) are being penalized by a 25% slot reading zero, when the real-world reason is data incompleteness. We're punishing researchers for our pipeline's limitations.

The first interpretation is methodologically pure. The second is operationally honest — for the vast majority of HCPs, the formula effectively shrinks to 75% of its theoretical range, and high-trial-activity HCPs get an outsized advantage in the composite.

**Investigation approach:**
- Look at distribution of trial_investigator_score across the rising star tier — is it truly zero for most, or are there ranges?
- Compare composite score distributions for trial-matched vs trial-unmatched HCPs — is there visible "advantage" for the trial-matched cohort?
- Decide between three paths:
  - (a) Keep current behavior — trial signal is real, missing it is missing it
  - (b) Reweight composite to handle missing trial signal — e.g., when no trial data, redistribute the 25% across other components (pub velocity, citation trajectory, h-index)
  - (c) Improve coverage instead — fix the pipeline so more HCPs are matched to trials

**Recommendation:** Path (c) where possible (increase trial linkage via the Collaborative Orbit foundation work in P1 #14, which expands trials pipeline cap from 1,000 to ~5,000-10,000 per TA and fixes HCP matching). Then revisit whether residual zero-handling needs (b).

**Possible remediations for coverage:**
- Expand NPI verification beyond US (challenging — international physician registries are fragmented)
- Use ORCID as secondary identifier when present
- Use co-investigator inference (if A is matched and A co-investigates trial X with B, B is also on trial X — useful even if B isn't NPI-verified)
- Accept the gap and document clearly that trial signal is partial

### 20. Indication taxonomy completion

Per the filter scope doc — Oncology has CAR-T/DLBCL/etc. as decorative chips but no real HCP-to-indication mappings beyond NSCLC. Hepatology and Rare Disease lack any indication taxonomy at all.

### 21. Cross-state same-person consolidation

**Problem:** Major researchers with multi-affiliation careers may still appear as multiple records (~50-150 estimated). Younossi, Noureddin flagged from prior sessions.

**Status:** Methodology v1 dedupe consolidated 45,487 fragmented rows; Category C 6,174-group manual review backlog remains.

---

## P3 — Operational and strategic

### 22. Territory-default feed framing — product positioning decision (NEW finding May 2 evening)

**Problem:** With cleaner cohorts post-eligibility-fix, geographic distribution patterns became clearly visible. Hepatology dark horse cohort is 62% PRC-based. Whether or not this reflects real signal (see methodology evolution item #15(h)), a US-based MSL using FieldMark to cover Northeast hepatology is shown global rising stars dominated by HCPs in territories they cannot engage. The product is methodologically correct but operationally failed for that user.

**Strategic question — two product framings:**

**Option A: FieldMark surfaces global rising stars with territory filtering for local relevance.**
- Honest, methodologically sound
- Positions product as "global intelligence with local lens"
- Requires territory filtering to land before product is usable for daily MSL workflow
- Risk: first-time users see overwhelming geographic mismatch and disengage

**Option B: FieldMark surfaces regional rising stars with global view as expansion.**
- Default to user's territory (US MSL → US dark horses by default)
- "Show global" toggle expands the cohort
- Positions product as "MSL territory tool with global expansion when needed"
- Methodology unchanged
- Matches actual MSL workflow — they engage HCPs in territory, not globally
- Risk: less impressive on first impression ("only 22 NSCLC dark horses?" vs "250 globally")

**Recommendation:** Option B for v2.0 launch. MSL workflow is fundamentally territory-bound; defaulting to global creates more friction than insight.

**Dependencies:**
- Country normalization (P0 #7) must complete first — territory filtering can't work on a corrupted country field
- Profile screen territory selection must thread into the feed query (currently decorative)
- Filter UX must support "expand to global" affordance

**Status:** Strategic decision pending. Capture as a near-term decision, decide in advance of v1.5 filtering work so the architecture supports both framings.

**Estimated effort:** Decision is fast (an hour of thinking). Implementation is part of the broader filtering workstream (P0 #4) — adding territory-default behavior is a small overlay on filtering infrastructure, ~1 day on top of filtering.

### 23. LinkedIn OAuth integration

**Prerequisites:** Privacy policy, terms of service, marketing site URL, finalized brand name. None of these are ready.

**Estimated total effort:** 2-3 days of writing/setup, plus the OAuth integration itself (~half day).

### 24. Marketing site

**Problem:** Vercel deployment URL (`field-mark.vercel.app`) is the only public URL. No marketing/landing page exists.

**Action items:**
- Decide name first (tied to P0 #8)
- Single-page placeholder with product description, privacy/terms links, contact info
- Domain registration once name is settled

### 25. Privacy policy and terms of service

**Status:** Methodology commits to opt-out and profile claiming. Terms need to formalize:
- What data FieldMark collects about HCPs (publication metadata, trial data, social presence — all public)
- What data FieldMark collects about MSL users (LinkedIn profile, contributed notes, usage)
- Data retention and deletion
- HCP opt-out flow
- MSL anonymity guarantees
- Pharma compliance considerations

**Recommended:** Start with a SaaS template, then $400-800 attorney review given pharma/HCP data sensitivity.

### 26. Domain decisions

Methodology mentions fieldmark.health as investigated. Pending name finalization.

---

## What's recommended for tonight (60-90 min)

Given the scope of the larger workstreams, tonight's session should focus on diagnostics and quick fixes that surface tonight's findings cleanly. Each item should produce information that informs the bigger workstream decisions.

1. **Verify OpenAlex completion** — 5 min diagnostic SQL
2. **Run narrative refusal audit query** (P0 #2) — 5 min, sizes the contamination scope
3. **Run Dark Horse diagnostic queries** (P0 #3, all three queries) — 5 min, informs cohort calibration decision
4. **Run industry employee audit query** — count rising stars at major pharma — 5 min, sizes the exclusion scope
5. **Methodology doc append** capturing whatever the audits surfaced — 15 min
6. **Quick wins from P0 if time permits:**
   - Null contaminated narratives (P0 #2 cleanup) — 10 min
   - Two navigation UX fixes (P1 #9: Dark Horse exit, FM logo as home) — 20-30 min

The diagnostic queries are the highest-leverage part of this session — they convert open methodology questions into data-informed decisions for next week.

Industry employee audit query:
```sql
SELECT 
  ta.slug,
  COUNT(*) as industry_employed_in_rising_stars
FROM hcp_scores s
JOIN hcps h ON h.id = s.hcp_id
JOIN therapeutic_areas ta ON ta.id = s.therapeutic_area_id
WHERE s.tier IN ('rising_star', 'dark_horse')
  AND (
    h.institution ILIKE '%pfizer%' OR
    h.institution ILIKE '%merck%' OR
    h.institution ILIKE '%novartis%' OR
    h.institution ILIKE '%roche%' OR
    h.institution ILIKE '%genentech%' OR
    h.institution ILIKE '%astrazeneca%' OR
    h.institution ILIKE '%glaxosmithkline%' OR
    h.institution ILIKE '%gsk%' OR
    h.institution ILIKE '%sanofi%' OR
    h.institution ILIKE '%bristol myers%' OR
    h.institution ILIKE '%bristol-myers%' OR
    h.institution ILIKE '%eli lilly%' OR
    h.institution ILIKE '%johnson & johnson%' OR
    h.institution ILIKE '%janssen%' OR
    h.institution ILIKE '%abbvie%' OR
    h.institution ILIKE '%vertex%' OR
    h.institution ILIKE '%regeneron%' OR
    h.institution ILIKE '%amgen%' OR
    h.institution ILIKE '%biogen%' OR
    h.institution ILIKE '%moderna%' OR
    h.institution ILIKE '%gilead%'
  )
GROUP BY ta.slug
ORDER BY ta.slug;
```

Defer to dedicated workstreams:
- Industry exclusion implementation (P0 #1) — once audit shows scope, this is a 2-4 hour fix
- Filter implementation (P0 #4, 3-4 week workstream)
- DetailScreen wiring (P0 #5, requires P0 #6 column-name fix first)
- Country normalization (P0 #7, 1-2 day workstream)
- Trademark / naming decisions (P0 #8, Monday with attorney)
- LinkedIn OAuth (gated on name + privacy/terms)
- Indication taxonomy (multi-day)

---

## Notes on tonight's session

What got done tonight (May 2, 2026):
- Dark horse UI alignment with backend tier (deleted three dead isDarkHorse functions)
- "Top 5%" honorary badge replacing raw composite for dark horses
- USA filter removal — international HCPs now flow through the feed
- taCounts useEffect wired (chip count was perma-stuck on em-dash)
- Migrated getRisingStars from hcp_scores to hcp_normalized_scores view
- Solved URL-length bomb on tier pre-fetch (single query against view + tier)
- Added tier column to hcp_normalized_scores view via DROP+CREATE
- Career age pill replacing TRIALS pill on dark horse cards (data-driven, not hardcoded)
- Disabled state for inactive TAs (Immunology) and indications (CAR-T, DLBCL, Melanoma, CLL, AML)
- Removed false "your territory" claim from Dark Horse chip
- Trailing-period country normalization (China./China collapsed, etc.)
- DetailScreen Dark Horse callout copy updated to match recovered methodology
- Methodology integrity audit: deduped 44,001 rows from hcp_scores (32% of table), added unique constraint, rebuilt tier classification with null-handling guards
- Validated: 21 truly emerging dark horses across all TAs (down from 2,205 contradictory)
- Methodology doc bumped to v1.3 with full session capture
- Production deployed to Vercel with all of the above

What was discovered tonight requiring follow-up:
- Industry-employed researchers (Pfizer R&D scientists) appearing in rising star feed — RESOLVED via INDUSTRY_PATTERNS query-time filter
- Narrative refusal contamination (15 Claude refusals stored verbatim as narratives) — RESOLVED via SQL UPDATE setting narrative = NULL
- Dark Horse cohort question reframed: not "is 21 too small" but "is the eligibility gate enforced" — RESOLVED via tier rebuild with publication count guard, cohort recovered to 148 dark horses methodology-clean
- "Career age" label confused users into reading biological age — RESOLVED via "PUB YEARS" rename
- Hepatology dark horse cohort 62% PRC-based — captured as P1 #15(h) regional bias investigation; informs P3 #22 territory-default feed framing decision
- Country field corruption broader than known — email/affiliation strings bleeding into country values, severity upgraded for P0 #7
- Pagination gap — feeds render only top 20 cards regardless of cohort size; promoted to P0 #4 subitem with possible independent v1.5 sprint
- Score badge tooltip is a third placeholder surface (alongside cards and DetailScreen) — folded into P0 #5
- trial_investigator_score zero-handling for the 99.4% of HCPs without matched trial activity — folded into P2 #19 as an investigation question
- Landscape feature placeholder-driven across all three tabs (Map, Momentum, Summary) — captured as P1 #16 with recommendation to either fully wire or hide entry point
- Profile screen LinkedIn data surfacing opportunity — captured as expansion of P1 #11 with company name as the priority field to display
- Trademark conflict on FIELDMARK
- DetailScreen extensively placeholder-driven
- Mobile navigation gaps — partially resolved tonight (Dark Horse exit X icon, FM logo as home button)
- Narrative coverage gap for rebuilt dark horse cohort — separate from refusal contamination, needs verification post-cohort-rebuild
- Collaborative Orbit reaffirmed as the strategic moat feature — sequenced as v1.5 foundation work / v1.6 surfacing
- Methodology evolution backlog clustered as a coherent v1.5 workstream — author position weighting, editorial activity, IIT count, NIH grants, h-index from OpenAlex, regional bias investigation, regional bias investigation

---

*This document is the working priority list. Items move between tiers as situation changes.*
