# Known Issues

Running list of deferred items, data quality gaps, and tech debt. Append as discovered. Most recent issues at top within each section.

Last updated: Jun 6, 2026 (end of marathon scoring + visualization session)

---

## 🔴 Critical — affects product credibility or core methodology

### Customer avoidance is the primary project risk
**Discovered:** Recurring; surfaced explicitly Jun 5, 2026

**Symptom:** Platform is demo-ready. Methodology is sound. Architecture is validated. But Garrett has not shown the product to real prospective MSL customers. Each session pushes the demo further toward perfection while customer feedback remains absent.

**Path forward:** First outreach to **biotech or specialty pharma** MSLs (not top-tier pharma). Top-tier pharma MSLs with H1 access represent ~25-30% of MSL universe and create harder buyer evaluation context. Founder advisor and Garrett both aligned on this sequencing.

**Status:** Pending. Not blocked by anything technical.

---

### Trial signal has a structural CT.gov data ceiling
**Discovered:** Jun 4, 2026; confirmed Jun 5

**Symptom:** Heymach (major NSCLC trialist at MD Anderson) shows `trial_score = 3.7037` ("TRIAL SCORE 4") despite being PI/co-PI on dozens of major trials. Trial scoring is mathematically correct against `trial_investigators_v2` — but that table has only 1 row for Heymach.

**Root cause (verified Jun 5 across 5 NSCLC trials):** CT.gov v2 API surfaces 0-1 `overallOfficials` per trial. `responsibleParty` returns `type: SPONSOR` for industry-sponsored trials (most major NSCLC trials) with no named investigator. The named-investigator data is not published by CT.gov for industry trials.

**Status:** Acknowledged via tooltip language. `backfill_trial_investigators.py` exists but NOT to be run. Trial Activity reframed as informational, replaced as primary score by three-signal Influence architecture (Jun 5).

**Path forward — alternative data sources:**
- NIH RePORTER for grant PIs (post-launch target)
- Conference abstract scraping (not started)
- Manual MSL contributions (platform thesis)
- Publication-derived leadership signals — SHIPPED Jun 5 in `hcp_publication_leadership_v2`

---

### Themes filter UI ships but pass 2 not committed
**Discovered:** Jun 4, 2026

**Symptom:** Drawer shows 25 canonical NSCLC themes. User can select/deselect, hit Apply. Feed does NOT actually narrow because `theme_to_canonical_v1` is empty — pass 2 was run with `--dry-run` and never committed.

**Path forward:**
- Run `python bucket_themes.py --ta nsclc --pass 2 --pass-2-batch-size 100` (without `--dry-run`)
- Handle failed batch 1 (529 overloaded error during dry run)
- Spot-check 50 random raw themes for sensible canonical assignments

**Status:** Still pending Jun 6.

---

## 🟡 Data quality

### Industry employees appearing in academic cohorts
**Discovered:** Jun 6, 2026

**Symptom:** When running US Established momentum analysis, names like "Anne Shah (AstraZeneca)" and "Natasja Brooijmans (Blueprint Medicines)" appear in cohort. These are pharma industry researchers, not academic investigators. Affects Rising Star scoring credibility most acutely — also a broader cohort cleanup issue.

**Path forward:** Build institution-normalization filter or flag. Query like:
```sql
SELECT COUNT(*) FROM hcps_v2 
WHERE institution_normalized ILIKE ANY (ARRAY[
  '%AstraZeneca%', '%Pfizer%', '%Genentech%', '%Merck%', 
  '%Bristol-Myers%', '%Novartis%', '%Blueprint%', '%Gilead%',
  '%Roche%', '%Eli Lilly%', '%GSK%', '%Sanofi%', '%Bayer%'
]);
```
Then either tag as `is_industry_employee` column or exclude from cohort scoring.

**Status:** Recognized, deferred to Rising Star session.

---

### Xiuning Le not in v3 ranks (likely Rising Star candidate)
**Discovered:** Jun 6, 2026

**Symptom:** Xiuning Le, MD Anderson, appears as a top-5 collaborator of Heymach with 62 shared papers. She's NOT in `hcp_established_ranks_v3` at all (no scope_type, no rank, no cohort_score). The cohort score badge correctly shows nothing — authentic signal.

**Hypothesis:** She likely qualifies as Rising Star (younger career, accelerating). Once Rising Star scoring lands, she should validate as a top candidate.

**Status:** Use as a validation HCP when Rising Star scoring is built. If she doesn't appear in Rising Star top tier either, that's a methodology gap.

---

### OpenAlex conflation flag is too aggressive
**Discovered:** Jun 4, 2026

**Symptom:** `hcp_author_metrics_latest_v2` excludes 639 HCPs with `conflation_suspected: true`. Spot-check showed 100% false-positive rate. The `pubs_per_year_excessive` heuristic catches legitimately prolific HCPs.

**Workaround applied:** `hcp_author_metrics_for_cards_v2` view ignores the flag.

**Path forward:** Re-tune conflation heuristic. Cross-source check (OpenAlex h-index vs Scholar h-index) would be a stronger signal than pubs-per-year alone.

---

### Established HCPs ranked in multiple unrelated TAs
**Discovered:** Jun 4, 2026

**Symptom:** Heymach has rows in `hcp_established_ranks_v3` for both Hepatology AND NSCLC. The Hep row has different stats but he shouldn't really qualify there. HCP-to-TA assignment is too liberal.

**Impact:** Mostly invisible (frontend filters by indication) but inflates HCP counts in some scopes.

---

### Trial-to-TA tagging is incomplete
**Discovered:** Jun 4, 2026

**Symptom:** Detail page Clinical Trial Activity section query references `clinical_trials_v2.source_therapeutic_area_id` which doesn't exist on `clinical_trials_v2`. TA mapping lives in separate `clinical_trials_ta_v2` join table.

**Path forward:** Audit `getHCPDetail` trial query in api.ts (~line 1396). Either fix the join or drop the TA filter.

---

### Chalasani 3-way dedup partial
**Discovered:** May 2026

**Symptom:** Per memory, Sanyal and Kowdley fully merged but Chalasani remains a 3-way partial merge.

---

### Dedup gap for Mark Awad, Pasi Jänne
**Discovered:** Jun 5, 2026

**Symptom:** Each has two HCP rows — one with publications, one with pharma. Not merged. Affects scoring accuracy.

---

## 🟢 Frontend / UX

### InfoTooltip hover behavior needs verification
**Discovered:** Jun 6, 2026

**Symptom:** Custom InfoTooltip component just shipped at end of session. Should appear immediately on hover with no native delay. Native `title` attributes were unreliable; replaced with portal-rendered fixed-position div.

**Verification needed:** First thing next session — hover on Cohort Score, three subscore labels, all 8 KPI tiles. Confirm tooltip appears, content correct, dismisses on mouse leave, edge cases at viewport edges work.

---

### Cohort Score badges only show for US Established collaborators
**Discovered:** Jun 6, 2026

**Symptom:** MiniCollaboratorNetwork chip list shows yellow cohort score badge when collaborator is in `hcp_established_ranks_v3` with scope_type='region' and scope_value='US'. Collaborators not in v3 (Rising Stars, non-US, or unclassified) show no badge.

**Status:** Intentional for now — informative absence. Future enhancement: show Rising Star purple badge when Rising Star scoring lands. Could also enable global scope rendering as a settings option.

---

### Count fallback to global when scoped count is 0
**Discovered:** Jun 4, 2026

**Symptom:** When feed returns 0 rows under a filter, count display falls back to unfiltered cohort count. Shows "14,372 identified" while no cards render.

**Path forward:** App.tsx — when feedTotal is 0, show "0 identified" or "No HCPs match your filters."

---

### Multi-region simultaneous querying deferred
**Discovered:** Jun 4, 2026

**Symptom:** Filter drawer's region selector is multi-select UI, but backend uses only `regions[0]`. User picking US + EU5 sees US-only data.

---

### Sort feature not built
**Discovered:** Jun 4, 2026

**Symptom:** Ordering fixed to `normalized_score DESC`. MSL users may want to sort by citations, publications, recency.

---

### Profile-to-feed territory threading
**Discovered:** May 2026

**Symptom:** User profile schema captures region/state list, but filter context defaults to "US" rather than reading the user's stored territory.

---

## 🔵 Methodology / strategic

### Rising Star scoring framework designed, not implemented
**Discovered:** Jun 5, 2026 (advisor proposal); refined Jun 6

**Framework:**
- Rising Star Score = 70% Momentum + 30% Visibility
- Momentum = 40% Scientific Momentum + 30% Network Momentum
- Visibility = current Scientific Influence + current Network Influence
- Trajectory: Breakout Candidate ↑↑ / Accelerating ↑ / Steady → / Plateauing ↓

**Implementation gaps:**
1. True historical centrality (papers 2016-2021 vs 2021-2026 properly bounded, not just 5yr/10yr proxies)
2. Industry employee filter (data quality, applies broader)
3. Scientific Momentum scoring script
4. Rising Star cohort recompute
5. Trajectory threshold determination (empirical, requires distribution review)
6. HCPCard rendering for Rising Star (new layout)
7. ScoreBreakdownV3Rising variant for detail page

**Estimated effort:** 4-6 hour focused session.

**Status:** Next session candidate.

---

### Stage 2 Tier 2 filters not built
**Status:** Themes in flight (pass 2 pending); others deferred:
- Trial activity filter (blocked on trial signal data strategy)
- Open Payments engagement filter
- Specific company filter
- Specific drug filter

---

### TA #2 (Hepatology) build will be substantial
**Estimated effort:** 2-4 days compute + validation. Pipeline includes PubMed enrichment, OpenAlex linkage, trial-investigator matching (ceiling-limited), NPPES backfill, rank computation across 3 cohorts × 7+ regions, narrative generation, theme extraction, open payments aggregation, theme taxonomy generation.

**Sequencing rec:** Hepatology second (Loomba/Sanyal/Kowdley/Chalasani validated), then Immunology, then Rare Disease.

---

### Telescope full integration deferred
**Status:** MiniCollaboratorNetwork chip list shipped as the low-fi version. Full Telescope graph is its own separate component. Future integration could embed Telescope's force-directed graph in the detail page as an expandable section. For now, chip list serves MSL field use perfectly.

---

## ⚪ Pipeline / ops

### Tavily quota exhausted on leadership scrape
**Discovered:** Jun 5, 2026

**Symptom:** Production leadership scrape paused at ~140/200 HCPs with HTTP 432 errors. Final captured: 955 evidence rows.

**Path forward:** Pay for Tavily Basic (~$30/mo for 4K searches). Resume with `--resume` flag. Add support for resume to script.

---

### Pass 2 failed batch 1 not reprocessed
**Discovered:** Jun 4, 2026

**Symptom:** Pass 2 of theme bucketing hit a 529 overloaded error on batch 1 (themes 1-100). Logged to `failed_batches_NSCLC.json`. When pass 2 is rerun for real, those 100 themes need a `--resume` pass.

---

### Trial backfill script in repo but should not be run
**Discovered:** Jun 4-5, 2026
**File:** `backend/scripts/backfill_trial_investigators.py`
**Status:** Functional but unused. Diagnostic confirmed CT.gov data ceiling. Either delete or keep as record.

---

### Anthropic prompt caching not enabled
**Discovered:** May 27, 2026

**Symptom:** Could meaningfully reduce API spend on narrative generation and bucket assignment. ~30-50% cost reduction potential.

**Path forward:** Enable in any future Claude API script.

---

## How to use this doc

1. When deferring an issue, add it here. Brief is fine — date + symptom + one path forward line.
2. When fixing an issue, move it to a "Resolved" section at the bottom (or just delete — git history captures it).
3. Review at the start of any new working session to surface what's worth tackling.
4. The 🔴 Critical items should be the first place a fresh-context Claude looks when asked "what should I work on."

---

## Resolved (recent — Jun 5-6 session)

### Cohort Score architecture rebuilt — Jun 5
Replaced opaque "publications + years + pharma + trial" composite with three-signal decomposition: Scientific Influence + Network Influence + Pharma Engagement. New tables: `hcp_publication_leadership_v2`, `hcp_network_centrality_v2`, `hcp_pharma_engagement_v2`, `hcp_top_collaborators_v2`, `hcp_established_ranks_v3`. Cohort Score formula locked at 60% Sci + 40% Net (Pharma informational).

### ScoreBreakdownV3 component shipped — Jun 5
New three-section UI on detail page with KPI tile evidence, indigo progress bars, collaborator chip list with cohort score badges. Replaced old four-bar Score Breakdown.

### Drug Engagement redesign — Jun 5
Replaced scatter plot with ranked bars. Added quarterly sparklines. Stable rows hide "0%" noise. Renamed "Drug Constellation" → "Drug Engagement".

### HCP feed cards refactored — Jun 5
Established cohort pills changed from PUBS/CITATIONS/TRIAL SCORE to SCIENTIFIC/NETWORK/PHARMA. Tooltips wired via StatPillWithTooltip.

### Top Pharma Companies threshold corrected — Jun 5
Active threshold bumped 18→24mo; dormant 36→48mo. Accounts for CMS Open Payments reporting lag.

### Narrative collapse on mobile — Jun 6
"Why This Expert" truncates to ~180 chars on mobile <768px with Read more/Show less toggle. Desktop unchanged.

### InfoTooltip custom component — Jun 6
Replaced native HTML title attributes with custom hover tooltip component. Immediate response, dark styled, edge detection, fixed positioning. Applied to Cohort Score, three subscores, all 8 KPI tiles.

### Trials column was labeled "TRIALS" but rendered trial_score — Jun 4
Fixed by relabeling to "TRIAL SCORE" with honest tooltip.

### Citations showed "—" for top KOLs — Jun 4
Fixed by creating `hcp_author_metrics_for_cards_v2` view bypassing conflation_suspected filter.

### Detail screen right column not scrolling with left — Jun 5
Fixed by removing `position: sticky` from `.fm-detail-right` desktop CSS.
