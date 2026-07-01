# TA Expansion Audit — Synthesized Findings

**Generated:** 2026-06-30
**Source:** TA_AUDIT_RAW.md (PowerShell inventory script)
**Purpose:** Identify what needs to change in the codebase to ship a second therapeutic area.

---

## Real Headline

The architecture is **mostly TA-parametric where it matters**, but it's **explicitly NSCLC-hardcoded in the frontend surface**. The data layer and Python pipelines threaded `therapeutic_area_id` and `therapeutic_area_slug` from day one. The UI didn't — every detail page, list page, and feature surface has `"NSCLC"` as a string literal somewhere.

This is real, not catastrophic. The bounded list of things that need to change is in the dozens, not hundreds. The 246 `nsclc` / `NSCLC` references concentrate in ~74 files; the meaningful structural changes are in ~10-15 of them.

The 7-10 day TA replication estimate from the demo email is **plausible** if the work is sequenced right.

---

## Layer-by-Layer Findings

### 1. Database layer — Mostly clean

- `therapeutic_area_slug` and `therapeutic_area_id` are referenced 200+ times across SQL files, migrations, and views — meaning the schema was built TA-aware
- Tables like `hcp_narratives_v2`, `hcp_established_ranks_v3`, `hcp_community_ranks_v2`, `hcp_rising_star_ranks_v2` all key on `therapeutic_area_id`
- Materialized views (`mv_social_voice_emergence_by_ta`, etc.) include TA in their grain
- 1 hardcoded NSCLC UUID in a migration file: `2026_05_28_get_established_filtered_v3.sql` (lines 68, 162) — needs review but likely intentional default

**Verdict:** TA-parametric. New TA needs only data, not schema changes.

### 2. Backend Python pipelines — Mixed

**TA-parametric (good):** `established_scoring.py` (43 references), `scoring_pipeline.py` (29), `community_scoring.py` (24), `trial_ta_mapping.py` (23), `ingest_publications.py` (36), `medicare_aggregator.py` (26), `open_payments_aggregator.py` (24), `network_centrality_scoring.py` (11), `network_momentum_scoring.py` (11), `rising_star_scoring.py` (13), `pubmed_pipeline.py` (9)

**TA-hardcoded (needs parameterization):**
- `trial_ta_mapping.py` — 17 hardcoded NSCLC references despite also having parametric paths. Inconsistent.
- `generate_community_narratives.py` — 11 NSCLC references including `NSCLC_TA_SLUG` and `NSCLC_TA_ID` constants. We touched this today.
- `generate_seed_insights.py` — 4 references, hardcoded HCP roster
- `nppes_workstream_b_ingest.py` — 10 references
- `extract_research_themes.py` — 8 references

**Verdict:** Most pipelines accept TA as a parameter. A handful of scripts have NSCLC-as-default that needs to become NSCLC-as-argument. Real but bounded work — ~5-8 script edits.

### 3. Frontend — This is where the work concentrates

**74 files** have hardcoded `NSCLC` or `nsclc` strings. The pattern across them:
- React components passing `therapeuticArea="NSCLC"` as a prop
- Route navigation calls hardcoded to `/institutions/nsclc`
- Slug → display mappings: `if (slug === "nsclc") return "NSCLC"`
- API call sites passing `"NSCLC"` as the TA parameter
- Mock data files seeded with NSCLC HCPs

**High-density offenders:**
- `App.tsx` (12 refs) — routing layer, contains the TA list and label formatter
- `mockFieldIntelligencePosts.ts` (8 refs) — mock data, can be deprioritized
- `ScoreBreakdownV3.tsx` (6 refs) — score tooltip copy hardcoded
- `api.ts` (6 refs) — has `resolveTASlug` and `resolveTAId` resolver functions but also direct NSCLC fallbacks
- `routeSlugs.ts` (4 refs) — central routing map
- `DOLListingModal.tsx`, `IndicationFilter.tsx`, `HcpPositionsPage.tsx` — feature surfaces

**Architectural pattern:** Most frontend "TA support" appears to be **NSCLC-with-fallback** rather than **TA-parametric throughout**. The TA picker exists in the UI (`TASelectionScreen.tsx`, `IndicationFilter.tsx`) but downstream components default to NSCLC strings.

**Verdict:** This is the real work. Not refactoring — pattern is well-established — but systematic find-and-replace plus picker-driven propagation. Real estimate: 2-3 days of focused frontend work.

### 4. Data sources / ingestion — Already TA-aware

PubMed pipeline, ClinicalTrials.gov, Open Payments aggregator, NPPES ingestion all thread TA through their queries. Social ingestion (Twitter/Bluesky) uses TA-specific hashtag lists which need new TA equivalents.

**Verdict:** New TA needs new substance:
- PubMed search terms for the TA
- ClinicalTrials.gov condition filters
- Social hashtag set
- Drug list for engagement detection

Real work but not engineering work — it's substantive domain configuration.

### 5. Scoring pipelines — TA-parametric

All three cohort scorers (Established, Rising Star, Community) accept TA as parameter. They write to `hcp_*_ranks_v* / hcp_*_scores_v*` tables that are TA-scoped. Run-per-TA pattern.

**Verdict:** Run the same scripts with `--ta hepatology` (or similar). No code changes needed, just compute time.

### 6. Narrative generation — Has the new TA infrastructure but not data

`generate_narratives_v2.py` (1,713 lines) is highly TA-parametric (86 references to `therapeutic_area_slug` / `therapeutic_area_id`). `generate_community_narratives.py` we already touched today — has constants but accepts override patterns.

**Verdict:** Pipelines run per-TA. Prompt copy may need TA-specific tuning (NSCLC has very different vocabulary than hepatology).

### 7. Seed scripts and demo data

`generate_seed_insights.py` and `generate_seed_followups.py` contain hardcoded HCP rosters and insight content. For a new TA, you'd need a new roster of canonical HCPs to seed mentor accounts for that TA.

**Verdict:** Real work but bounded — produce a new TA's roster of ~15 HCPs with seed insights, briefs, follow-ups. Maybe 2-3 hours of curation per TA.

---

## Real Sequenced Roadmap for TA #2

### Phase 0 — TA selection (1 hour)
Pick the TA. Candidates: Rare Disease, Hepatology (substrate work partially done already), Immunology, broader Oncology. Selection criteria:
- Which has the strongest substrate already in DB
- Which has the largest MSL audience (commercial opportunity)
- Which has the cleanest competitive landscape for FieldMark's positioning

### Phase 1 — Substrate ingest (1-2 days)
- Run PubMed pipeline for new TA
- Run ClinicalTrials.gov ingest for new TA
- Run Open Payments aggregator for new TA
- Run social capture for new TA hashtags
- Verify HCP classification produces sensible Established / Rising Star / Community splits

### Phase 2 — Scoring (1 day, mostly wall-clock)
- Run all three cohort scoring pipelines for new TA
- Spot-check top 10 HCPs in each cohort for reasonableness
- Generate narratives for top 200-300 community HCPs (~$5-10 in Claude API)

### Phase 3 — Frontend parameterization (2-3 days)
This is the real engineering work. Three workstreams:

**3a. TA-aware routing.** Update `App.tsx`, `routeSlugs.ts`, `IndicationFilter.tsx` to drive all child routes from the active TA selection rather than NSCLC defaults. Pattern: `/institutions/${activeTASlug}` instead of `/institutions/nsclc`.

**3b. Prop drilling cleanup.** Every component that takes `therapeuticArea="NSCLC"` as a hardcoded prop needs to receive it from a TA context or route param. Components include `ScientificNarrativeSection`, `HcpPositionsPage`, `HcpPublicationsPage`, `DetailScreen`, several Institution components.

**3c. Display string parameterization.** `DOLListingModal`, `ScoreBreakdownV3`, `InstitutionCollaborationsPanel`, `IndicationFilter.tsx`, `WelcomeBanner.tsx`, `TASelectionScreen.tsx` — places where "NSCLC" appears in user-visible strings need TA-driven labels.

### Phase 4 — Seed mentor data for new TA (3-4 hours)
- Curate roster of ~15 HCPs for the new TA (mix of Established / Rising Star / Community)
- Generate seed insights, briefs, follow-ups
- Provision mentor accounts with the new TA's seeded data

### Phase 5 — Smoke test and demo (1 day)
- Walk through demo script with the new TA
- Verify all surfaces render correctly
- Update marketing/demo page to mention multi-TA support

---

## Real Honest Caveats

1. **The 7-10 day estimate is plausible for Phases 1-5 collectively if executed solo with focused days.** It's tight. A single Cursor session can knock out maybe 8-12 of the frontend hardcode fixes; full Phase 3 will probably take longer than estimated.

2. **The first TA expansion will reveal hidden NSCLC assumptions** the audit didn't catch. Things like score normalization thresholds calibrated to NSCLC's distribution, prompt phrasing tuned to NSCLC's vocabulary, UI layouts that assume NSCLC-shaped data volumes. Plan for a "shake-out" day where issues surface and get fixed.

3. **Cleanup work that surfaces during expansion is best done THEN, not now.** Trying to clean everything before TA #2 will burn weeks. The audit shows the codebase is workable, not pristine. Use TA expansion as the forcing function for cleanup.

4. **The legacy `hcps` table** still gets queried in places (23 references). Real footgun. Worth a focused session to eliminate any code that queries `hcps` instead of `hcps_v2` BEFORE TA expansion adds more references.

---

## What I'd Do First, In Order

1. **Decide the TA.** This is the gating choice. Until selected, everything else is hypothetical.
2. **Single focused session to eliminate legacy `hcps` references.** ~2 hours. Reduces footguns before adding TA complexity.
3. **Run Phase 1 ingest for the chosen TA.** Substrate work in parallel with engineering planning.
4. **Begin Phase 3 frontend parameterization** in 2-3 day Cursor sprint.
5. **Phase 4 seed data while scoring runs.** Wall-clock parallelism.
6. **Phase 5 demo walkthrough.** Validates the full loop.

Total real estimate: **10-14 calendar days** for a clean first expansion. The demo email estimate of 7-10 days is aspirational but defensible — you can hit it if everything goes right.
