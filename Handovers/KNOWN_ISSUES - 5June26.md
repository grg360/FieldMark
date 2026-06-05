# Known Issues

Running list of deferred items, data quality gaps, and tech debt. Append as discovered. Most recent issues at top within each section.

Last updated: Jun 5, 2026 (mid-session — Influence Score reframe + leadership scrape + drug engagement sparklines in flight)

---

## 🔴 Critical — affects product credibility or core methodology

### Trial signal has a structural CT.gov data ceiling
**Discovered:** Jun 4, 2026 (diagnosed late session); confirmed Jun 5 with 5-trial verification

**Symptom:** Heymach (major NSCLC trialist at MD Anderson) shows `trial_score = 3.7037` on his Established card, mapping to "TRIAL SCORE 4". The scoring is mathematically correct against `trial_investigators_v2` — but that table has only 1 row for Heymach despite him being PI/co-PI on dozens of major trials in reality.

**Root cause (verified Jun 5 across 5 NSCLC trials):** CT.gov v2 API surfaces 0-1 `overallOfficials` per trial. `responsibleParty` returns `type: SPONSOR` for industry-sponsored trials (which is most major NSCLC trials), with no named investigator. `locations[].contacts` field is absent on location objects — even on a 192-site trial. The named-investigator data we want simply isn't published by CT.gov for industry trials.

**What we tested:** NCT03217747, NCT03088540, NCT05012358, NCT04267237, NCT04379336. Pattern was consistent.

**Status of the backfill workstream:** `backfill_trial_investigators.py` exists in repo but is NOT to be run. Would add minimal value given the ceiling.

**Path forward — alternative data sources (needs strategic decision):**
- Publication-derived signals (senior authorship + guideline papers — diagnostics done Jun 5, in flight)
- Web-scraped leadership signals (production scrape running Jun 5 on top 200 NSCLC Established)
- NIH RePORTER for grant PIs (not started)
- Conference abstract scraping (not started)
- Manual MSL contributions (already in platform thesis)

**Mitigation shipped Jun 4:** Trial Score label + tooltip rewritten to honestly note data coverage limitations.

**Reframe in progress (Jun 5):** "Trial Activity" as a discrete card metric is being deprecated in favor of an "Influence Score" composite that blends Scientific Output, Scientific Impact, Network Influence (Telescope), Industry Engagement, and Leadership Signals.

---

### Themes filter UI ships but pass 2 not committed
**Discovered:** Jun 4, 2026

**Symptom:** Drawer shows 25 canonical NSCLC themes. User can select/deselect, hit Apply. Feed does NOT actually narrow because `theme_to_canonical_v1` is empty — pass 2 was run with `--dry-run` and never committed.

**Path forward:**
- Run `python bucket_themes.py --ta nsclc --pass 2 --pass-2-batch-size 100` (without `--dry-run`)
- Handle failed batch 1 (529 overloaded error during the dry run)
- Spot-check 50 random raw themes for sensible canonical assignments

---

## 🟡 Data quality

### OpenAlex conflation flag is too aggressive
**Discovered:** Jun 4, 2026

**Symptom:** `hcp_author_metrics_latest_v2` view excludes 639 HCPs with `conflation_suspected: true`. Spot-check of top 20 US NSCLC Established showed every flagged HCP had numbers consistent with their stature. False-positive rate was 100% in the sample. The `pubs_per_year_excessive` heuristic catches legitimately prolific HCPs.

**Workaround applied Jun 4:** New view `hcp_author_metrics_for_cards_v2` ignores the flag. Cards now show citations for everyone.

**Path forward:** Re-tune the conflation heuristic. Cross-source check (OpenAlex h-index vs Scholar h-index) would be a stronger signal than pubs-per-year alone.

---

### Established HCPs ranked in multiple unrelated TAs
**Discovered:** Jun 4, 2026

**Symptom:** Heymach has rows in `hcp_established_ranks_v2` for both Hepatology AND NSCLC. The Hep row has `trial_score=0`. HCP-to-TA assignment is too liberal — any publication mentioning a TA keyword may be qualifying him.

**Impact:** Mostly invisible because frontend filters by indication, but inflates HCP counts in some scopes.

---

### Trial-to-TA tagging is incomplete
**Discovered:** Jun 4, 2026

**Symptom:** Detail page Clinical Trial Activity section query references `clinical_trials_v2.source_therapeutic_area_id` which doesn't exist on `clinical_trials_v2` — TA mapping lives in separate join table `clinical_trials_ta_v2`. Query path is broken.

**Path forward:** Audit `getHCPDetail` trial query in api.ts (~line 1396). Either fix the join or drop the TA filter.

---

### Chalasani 3-way dedup partial
**Discovered:** May 2026

**Symptom:** Per memory, Sanyal and Kowdley fully merged but Chalasani remains a 3-way partial merge.

---

## 🟢 Frontend / UX

### Count fallback to global when scoped count is 0
**Discovered:** Jun 4, 2026

**Symptom:** When feed returns 0 rows under a filter, count display falls back to unfiltered cohort count. Shows "14,372 identified" while no cards render.

**Path forward:** App.tsx — when feedTotal is 0, show "0 identified" or "No HCPs match your filters."

### Drug Engagement needs sparklines (in flight)
**Discovered:** Jun 5, 2026
**Status:** Quarterly aggregation pipeline being rebuilt. `payments_by_quarter` JSONB column added. Aggregator running. Sparkline component drafted.

### Multi-region simultaneous querying deferred
**Discovered:** Jun 4, 2026

**Symptom:** Filter drawer's region selector is multi-select UI, but backend uses only `regions[0]`. User picking US + EU5 sees US-only data.

### Sort feature not built
**Discovered:** Jun 4, 2026

**Symptom:** Mentioned during Tier 2 planning. Ordering is fixed to `normalized_score DESC`. MSL users may want to sort by citations, publications, recency, etc.

### Profile-to-feed territory threading
**Discovered:** May 2026

**Symptom:** User profile schema captures Region/state list, but filter context defaults to "US" rather than reading the user's stored territory.

---

## 🔵 Methodology / strategic

### Influence Score reframe in progress
**Discovered:** Jun 5, 2026
**Status:** Founder friend proposed new composite: Scientific Output (30%), Scientific Impact (25%), Network Influence/Telescope (25%), Industry Engagement (10%), Leadership Signals (10%). Validation work underway:
- Leadership scraping pipeline built and running on top 200 NSCLC Established (avg 6.4 evidence items per HCP)
- Publication-derived leadership signals diagnosed (senior authorship + guideline papers)
- Career Years to be dropped from composite
- Trial Activity to be separated into its own card section with confidence labeling

**Open questions:**
- Final weight calibration
- How Influence Score interacts with Rising Star scoring (different weights likely needed)
- Telescope graph methodology (network influence is the largest gap)

### Stage 2 Tier 2 filters not built
**Status:** Themes in flight; others deferred:
- Trial activity filter (blocked on trial signal data strategy)
- Open Payments engagement filter
- Specific company filter
- Specific drug filter

### TA #2 (Hepatology) build will be substantial
**Estimated effort:** 2-4 days compute + validation. Pipeline includes PubMed enrichment, OpenAlex linkage, trial-investigator matching (ceiling-limited), NPPES backfill, rank computation across 3 cohorts × 7+ regions, narrative generation, theme extraction, open payments aggregation, theme taxonomy generation.

**Sequencing rec:** Hepatology second (Loomba/Sanyal/Kowdley/Chalasani validated), then Immunology, then Rare Disease.

---

## ⚪ Pipeline / ops

### Pass 2 failed batch 1 not reprocessed
**Discovered:** Jun 4, 2026

**Symptom:** Pass 2 of theme bucketing hit a 529 overloaded error on batch 1 (themes 1-100). Logged to `failed_batches_NSCLC.json`. When pass 2 is rerun for real, those 100 themes need a `--resume` pass.

### Trial backfill script in repo but should not be run
**Discovered:** Jun 4-5, 2026
**File:** `backend/scripts/backfill_trial_investigators.py`
**Status:** Functional but unused. Diagnostic confirmed CT.gov data ceiling makes it minimally useful. Either delete or keep as record.

### Anthropic prompt caching not enabled
**Discovered:** May 27, 2026
**Symptom:** Could meaningfully reduce API spend on narrative generation and bucket assignment.
**Path forward:** Enable in any future Claude API script.

### Drug-level quarterly payment aggregation (in flight)
**Discovered:** Jun 5, 2026
**Status:** ALTER TABLE added `payments_by_quarter jsonb`. Aggregator modified and running. Will give 12 data points per drug-HCP pair for sparkline rendering. Estimated 20-40 min runtime.

### Leadership scraping on top 200 (in flight)
**Discovered:** Jun 5, 2026
**Status:** Running. 79/200 HCPs processed at last check, 576 evidence rows. ETA ~30 more minutes. Average 6.4 evidence items per HCP, well above the validation threshold. Faculty-page-first strategy keeping Phase 2 unneeded for most.

---

## How to use this doc

1. When deferring an issue, add it here. Brief is fine — date + symptom + one path forward line.
2. When fixing an issue, move it to a "Resolved" section at the bottom (or just delete — git history captures it).
3. Review at the start of any new working session to surface what's worth tackling.
4. The 🔴 Critical items should be the first place a fresh-context Claude looks when asked "what should I work on."

---

## Resolved (recent)

### Trials column was labeled "TRIALS" but rendered trial_score — Jun 4
Fixed by relabeling to "TRIAL SCORE" with tooltip noting data limitations.

### Citations showed "—" for top KOLs — Jun 4
Fixed by creating `hcp_author_metrics_for_cards_v2` view bypassing the conflation_suspected filter.

### Themes filter drawer Clear button didn't deselect chips — Jun 4
Fixed via revised chip rendering logic.

### Detail screen right column not scrolling with left — Jun 5
Fixed by removing `position: sticky` from `.fm-detail-right` desktop CSS.

### Drug Constellation chart looked elementary, mislabeled — Jun 5
Replaced with ranked-bar layout. Renamed to "DRUG ENGAGEMENT". Stable rows hide the noisy "0%" — just show the arrow.
