# FieldMark v2 Tech Debt

## Canonical UUIDs in v2 scripts still reference v1
Several v2 Python scripts hardcode v1 canonical KOL UUIDs. Underlying data aggregation works correctly via NPI matching — only in-script validation/canonical_check blocks fail.

Scripts affected: open_payments_aggregator.py, medicare_aggregator.py

Real v2 UUIDs:
- Loomba: 8a5ed89d-df8a-4b7c-a5f7-37f602b63577
- Sanyal: be751618-9371-4ce1-8760-c579599fd30e (publication-keyed; separate stub 4f51954e has NPI)
- Chalasani: 22388b63-dc82-44d7-abaa-24ab8f4ab8eb (separate stub 0731986d has 43 authorships; ad708363 has NPI)
- Kowdley: 272ff3bc-0464-499b-9ab2-1ceae503e415 (separate stub 043409e4 has NPI)

## community_scoring.py needs rebuild
Original script was never saved to disk. Needs rebuild with geographic gate (not metro area) per May 26 reframe. Defer to post-dedup.

## Dedup work pending
12,312 candidate clusters identified yesterday. Score-first approach: dedup only top scorers fragmented across stubs. Approach A smart merge per 5 rules. Real fragmented canonicals: Sanyal, Chalasani, Kowdley.

## Established cohort_score not differentiated
Path-based bucketing produces only 5 distinct scores. 4,092 HCPs all have score=95. Per-TA scores in hcp_established_scores_v2 are differentiated; hcps_v2.cohort_score remains path-based.

## Trial-to-TA mapping ~2-3% false-positive rate
Liver metastases of non-Hep cancers tag as Hep; Selpercatinib thyroid trials tag as NSCLC via drug. Acceptable for demo.

## Frontend cleanup deferred
- Dark Horse / Workhorse rendering cleanup
- Tier nomenclature in hcp_scores_v2  
- Republish auth screen tagline
- DOL workstream wiring against dol_matches_v2

## Shadow KOL cohort (new classification, post-ASCO)

A new HCP cohort sitting between Established and Community. The pattern surfaces in the current community scoring output: HCPs with very high pharma engagement (e.g., Guy Young at $344K lifetime, Glenn Davis at $1.97M, Maya Srivastava at $1.2M) who are NOT at AAMC medical schools or NCI cancer centers, so they fall through Established classification, but who clearly aren't "doctors in the wild" community practitioners either. They're industry-engaged specialists at large private systems, pediatric hem/onc programs, regional referral centers — already on competitors' radar but invisible to academic-KOL frameworks.

Why this matters:
- From an MSL prospecting perspective, these are some of the highest-value targets — heavily engaged by industry, geographically distributed, often the regional opinion leaders that academic KOL databases miss.
- Including them in Community pollutes the community list (Community is supposed to be community practitioners, not industry-engaged specialists with $1M+ in payments).
- Excluding them entirely would discard valuable signal.
- They are NOT the same as Dark Horse / Workhorse, which were just labels for the top 5% of Rising / Community. Shadow KOL is a fundamentally different classification boundary, not a within-cohort tier.

Design questions to resolve post-ASCO:
- Threshold for $X pharma engagement: TBD. Need to analyze distribution of community pharma engagement and pick a defensible cut. Probably $100K-$500K lifetime.
- Scoring formula: likely heavier pharma weighting, lighter on Medicare patient volume vs current community formula.
- Classification mechanics: new cohort_classification value ('shadow_kol'), new scoring table hcp_shadow_kol_scores_v2 mirroring the other three, or a flag on existing community scores. Lean toward separate cohort for cleaner downstream queries.
- Gate from Community: HCPs that qualify as Shadow KOL are excluded from Community feed and surfaced separately.

MSL crowdsourcing tie-in:
This cohort is the ideal first surface for structured MSL contributions. "Is this person a true Shadow KOL or just an HCP with one big pharma relationship?" — that binary question is structured, queryable, and exactly the kind of field-intelligence signal that academic data alone can't produce. Field validations against this cohort would build credibility for the broader contribution system.

Sequence: Build this after the ranking foundation lands and the frontend filter framework is in place. Likely Phase 3 work.

## MSL contributions layer (must land before demo)

The crowdsourced MSL contribution layer is what turns FieldMark from a data product into a platform. Without it, FieldMark is "better KOL data than Veeva/H1/IQVIA." With it, FieldMark is the network where MSLs make sense of rising stars together — the score is the substrate, MSL field intelligence is the interpretive layer. This is the differentiated long-term position and must be demo-able before the first investor/strategic conversation.

Decision: Level 2 fidelity for demo. Beyond simple reactions (Level 1) but short of full discussion threads (Level 3). Structured contributions only — no free-form discussion until post-funding.

### Schema (proposed, refine before building)

New table: msl_contributions_v2

Fields:
- id (UUID PK)
- hcp_id (FK to hcps_v2)
- msl_id (FK to users — anonymous to other users, verified to platform via LinkedIn OAuth)
- therapeutic_area_id (FK to therapeutic_areas) — contributions are TA-scoped
- reaction (enum: 'confirms' | 'disputes' | 'adds_context')
- observation_tags (text array, multi-select): therapeutic_focus_narrower | different_specialty | industry_engaged | trial_experience | conference_activity | career_stage_update | other
- confidence (enum: 'direct_interaction' | 'indirect_secondhand' | 'public_information')
- notes (text, 280 char limit)
- created_at, updated_at (TIMESTAMPTZ)
- visibility (enum: 'platform_aggregate' | 'msl_only_detail') — default aggregate

Constraint: one contribution per (hcp_id, msl_id, therapeutic_area_id). An MSL can update their contribution but not have multiple.

### Demo seeding strategy

Pre-populate 5-10 structured contributions per top rising star, attributed to anonymized MSL personas:
- "MSL at large pharma — Hep franchise — Northeast territory"
- "MSL at mid-size biotech — NSCLC focus — West Coast"
- etc.

Demo audiences won't expect these to be real users. What they'll evaluate is whether the *shape* of contributions is credible and whether it suggests a viable contribution system at scale.

### Demo-ready surfaces

Three places contributions must show up:

1. **HCP detail page** — Full contribution list with reaction breakdown ("12 confirm, 3 dispute, 2 add context"), observation tags aggregated, individual notes browsable.
2. **Rising star list (dashboard view)** — Badge showing contribution count next to rank ("Rank #3 • 8 MSL contributions"). Hover/tap reveals quick summary.
3. **Score explainer modal** — Add an "MSL field intelligence" section showing whether the field is confirming or disputing the algorithmic ranking.

### Why this sequence matters

Steps 5-7 (FilterState + frontend refactor + region selector) must complete first because contributions are layered on the HCP detail page, which is currently broken (v1 join chain causing 404s). Fix the foundation, then add the contribution surface on top.

Steps 8-10 (schema + display + list surface) before any external demo conversation.

### Open questions for resolution before build

- Anonymization model: aggregate counts only, or persona attribution ("MSL at large pharma")? Lean: persona attribution adds credibility but raises privacy questions for the first 50 MSL signups. Probably aggregate-only at launch.
- Editability window: can MSLs change their contribution at any time, or only within 30 days? Lean: always editable, with edit timestamp visible.
- Upvotes on contributions: in-scope for Level 2, or defer? Lean: defer. Adds discussion-system complexity that belongs in Level 3.
- LinkedIn OAuth integration is the identity prerequisite. Already on the roadmap (was Phase 8 in older planning); now becomes a hard blocker for the demo.

### Effort estimate

- Schema + migration: 2 hours
- Backend: contribution write/read/aggregate functions: 4 hours
- HCP detail page contribution surface: 4 hours
- List view badge + tooltip: 2 hours
- Score explainer modal addition: 2 hours
- Demo seeding script with anonymized personas: 3 hours
- LinkedIn OAuth (if not already in place): 1 day

Total: ~3 days of focused work, plus LinkedIn OAuth which is a prerequisite for the whole feature working with real users.

## Dark Horse / Workhorse deprecation

Dark Horse (top 5% of Rising Stars) and Workhorse (top 5% of Community) were product labels in v1 that have been retired. They were never differentiated cohorts — just within-cohort tier badges that didn't carry independent product meaning. The Shadow KOL cohort (separate TECH_DEBT entry) is structurally different and replaces any conceptual need for sub-tiers.

These references remain in the codebase and need cleanup:

### Schema and types
- TACounts interface in frontend/src/lib/types.ts retains dark_horses and workhorses fields. getTACounts currently returns them as 0 to preserve type compatibility. Future pass: remove from the type, remove all consumers.
- hcp_scores_v2.tier column still accepts 'dark_horse' as a value via assign_tier() in scoring_pipeline.py. TIER_DARK_HORSE_THRESHOLD = 95.0 remains unchanged after the rising star recalibration. The threshold produces ~4 HCPs globally — effectively vestigial. Decide: drop dark_horse from assign_tier() entirely, or leave as archaeology since nothing reads it.

### Code references to audit and clean
- Yesterday's HANDOFF.md flagged "Dark Horse / Workhorse rendering cleanup" as a known frontend issue. Search frontend/src for "dark_horse", "Dark Horse", "workhorse", "Workhorse" — any remaining UI strings should be removed.
- Yesterday's chat noted the cache table ta_cohort_counts_cache has dark_horses and workhorses columns. The table is no longer the source of truth (replaced by hcp_score_ranks_v2 via getTACounts rewrite). Drop the table entirely once we confirm nothing reads it.
- Search api.ts and other frontend files for any logic that maps cohort_classification = 'dark_horse' or = 'workhorse' to anything. Those values were never written to cohort_classification in v2, but stale mapping code may still exist.
- searchHCPs in api.ts has a mapSearchCohortClassification helper that maps "dark_horse" → "rising_star" and "workhorse" → "community". This was a v1-compatibility shim. After full deprecation, simplify.

### Tier column itself (broader question)
With ranks now precomputed in hcp_score_ranks_v2, the tier column in hcp_scores_v2 has only one remaining job: serving the threshold-selected Rising Star membership count (tier = 'rising_star' filter). Everything else — display ranking, percentile, scope-aware filtering — is rank-driven.

Two possible futures:
1. Keep tier as the canonical "Rising Star membership flag." Single source of truth for "is this person a Rising Star?" Useful, queryable, stable.
2. Compute Rising Star membership at query time via a percentile or score threshold on the ranks table. More flexible (thresholds can be tuned without re-running scoring) but distributed across more code.

Lean toward keeping tier as the membership flag. Threshold tuning is rare; consistency of the cohort definition matters more than tuning convenience.

### Sequence
1. (Optional, low-risk) Remove dark_horses/workhorses fields from TACounts in types.ts and downstream consumers. ~1 hour.
2. (Low-risk) Search frontend for any UI strings or dead code referencing Dark Horse / Workhorse. ~30 min.
3. (Medium-risk) Drop ta_cohort_counts_cache table once confirmed unused. ~15 min.
4. (Defer) Decision on dark_horse value in assign_tier() — keep as archaeology or remove from the enum. Not blocking anything.

Total cleanup effort: ~2-3 hours of focused work. Not demo-blocking. Best done in a single focused session after the frontend refactor stabilizes.

## dark_horse tier threshold inconsistency

TIER_DARK_HORSE_THRESHOLD = 95.0 in scoring_pipeline.py, but assign_tier()
appears to apply the threshold against a different score field than
normalized_score (or there's a separate normalization step). Empirical
behavior: dark_horse fires at normalized_score ≥ 80, not 95.

Impact: dark_horse cohort is ~30x larger than the constant suggests (121
vs expected ~4). Does not affect rising_star count or any user-facing
surface since dark_horse is deprecated as a product concept.

Investigate when: cleaning up the broader Dark Horse / Workhorse
deprecation. Not blocking.

## URL parameter synchronization for FilterState

The region selector (Step 5) persists user selection to localStorage but does not sync to URL parameters. This means:
- Users cannot bookmark a filtered view (e.g., "US Hep Rising Stars" vs "APAC Hep Rising Stars")
- Sharing a link does not preserve the filter context
- Browser back/forward navigation does not restore prior filter state
- Server-side or static rendering cannot pre-scope the page based on URL

Implementation plan when ready:
- Add a useFilterSync() hook that reads/writes URL search params for region, country, ta, scope
- Sync direction: URL is the source of truth on initial load; React Context updates URL on user changes
- Use the existing routing library (react-router, Next.js router, etc.) — verify which is in use before designing
- Preserve the current localStorage behavior as a fallback when no URL params present

Edge cases:
- Multi-tab behavior: changing region in tab A should not affect tab B's URL — only the localStorage which acts as a cross-tab cache
- Deep links that include a region the user lacks access to (future role-based view): silently fall back to DEFAULT_REGION
- Stale URL params after a refactor (e.g., old region codes): validate against REGIONS map and ignore invalid values

Effort: ~3-4 hours. Not demo-blocking. Sequence after the basic dashboards are working end-to-end.

## Region persistence: migrate from localStorage to Supabase user_preferences

The region selector currently persists via localStorage (key: "fieldmark.user.region"). This is correct for the pre-auth phase but has limits:

- localStorage is per-device — a user on phone and laptop sees different defaults
- No way to seed sensible defaults based on user attributes (e.g., default APAC region for users with APAC employer)
- No telemetry on actual region usage patterns across the user base
- localStorage can be cleared by user accidentally

Migration prerequisite: LinkedIn OAuth must be in place so users have stable identity to attach preferences to.

Implementation plan when LinkedIn OAuth lands:
- Create user_preferences table (user_id PK, region, ta_default, dashboard_layout_json, updated_at)
- Hydration order in FilterProvider: (1) check Supabase, (2) fall back to localStorage if no Supabase row, (3) fall back to DEFAULT_REGION
- Write-through: setRegion updates Context immediately, writes localStorage immediately, writes Supabase async (debounced)
- Handle offline gracefully: localStorage remains source of truth if Supabase write fails

Eventual schema (refine before building):
  CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    region TEXT NOT NULL DEFAULT 'US',
    default_therapeutic_area TEXT,
    last_viewed_hcp_id UUID,
    dashboard_settings JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

This is a Phase 8+ item — tied to identity infrastructure, not to filter UX.

Effort: ~4-6 hours once LinkedIn OAuth is in place. Not demo-blocking.

## v2 enrichment audit (May 28, 2026)

Audit of v2 table population revealed several enrichment workstreams that were structurally rebuilt but not run-to-completion. The link tables exist; the payload fetches did not finish.

### Empty v2 tables (zero rows):
- `hcp_narratives_v2` (Claude API narrative regeneration pending; ~3 hours runtime, ~$15)
- `hcp_affiliation_profile_v2` (purpose unclear — investigate before populating)
- `dol_matches_v2` (DOL matching layer never ran)
- `npi_match_proposals_v2` (NPI matching proposals never generated or merged)
- `trial_investigator_match_proposals_v2` (trial investigator matching never ran or merged)

### Partially populated tables (link exists, payload missing):
- `hcp_openalex_authors_v2`: 239,306 rows, BUT `corpus_pub_count`, `first_seen_pub_year`, `last_seen_pub_year` are 0% populated. The author identity resolution (Step C) completed but the author payload fetch (citations, h-index, works count, career year range) never ran. Being addressed in the OpenAlex author metrics enrichment work (separate TECH_DEBT entry).

### Sparsely populated tables (expected, monitored):
- `social_posts_v2`: 914 rows. Twitter capture is active but new; #ASCO26 capture should grow this rapidly through the conference.
- `social_users_v2`: 392 rows. Growing alongside posts.

### Action items in priority order:
1. OpenAlex author metrics enrichment (separate entry — actively building)
2. Narratives regeneration (~3 hours Claude API run, ~$15) — high visual impact on detail pages
3. Investigate `hcp_affiliation_profile_v2` purpose — schema exists but no documentation of intended population
4. Audit `dol_matches_v2`, `npi_match_proposals_v2`, `trial_investigator_match_proposals_v2` for whether they're abandoned or intended-but-not-yet-run

Lesson: Future v2-style rebuilds need a completion checklist that distinguishes "schema migrated" from "data populated" from "downstream consumers wired." All three states must be tracked separately.

## Citation source decision: OpenAlex primary, Scholar/Scopus deferred

After evaluation, OpenAlex is the chosen primary citation source for FieldMark. Decision rationale and the deferred alternatives are documented here for future reference.

### Why OpenAlex (primary):
- Free at any scale, no commercial license restrictions
- Stable API contract, predictable rate limits with paid key
- Identity resolution already complete: `hcp_openalex_authors_v2` has 239K HCP-to-author mappings
- Author payload returns four useful fields in one call: `cited_by_count`, `works_count`, `summary_stats.h_index`, `summary_stats.i10_index`, plus `counts_by_year` time series
- Methodology is reproducible, peer-reviewed corpus only (no grey literature inflation)
- Redistribution unrestricted — appropriate for commercial B2B SaaS

### Why Scholar was rejected (for now):
- API access is brittle: Google actively blocks scrapers, requires ScraperAPI ($150/mo at scale)
- Author matching is heuristic (name + institution); ambiguity rate ~5-15% with no clean resolution path
- Dual-source attribution risk: if Scholar and OpenAlex disambiguate the same name differently, we'd display competing numbers attributed to different humans — worse than showing no Scholar data
- Methodology mixes grey literature, conference abstracts, theses — inflates numbers in ways that are not auditable
- Could be added as a Phase 8+ supplementary source against threshold-selected Rising Stars + Established only, with explicit second-field labeling and cross-validation logic

### Why Scopus was rejected:
- Commercial API license: $50K-$250K/year, "contact us for pricing" enterprise sales motion
- Redistribution restrictions: cannot display Scopus-derived data to non-Scopus-subscribers, blocking most MSL prospects
- Termination clause risk: Elsevier owns SciVal, which competes directly with FieldMark's positioning; access could be revoked
- Free tier is academic/non-commercial only — FieldMark is commercial B2B SaaS, ineligible
- Even at full pricing, the redistribution and termination risks remain

### Methodology framing for product copy:
"FieldMark uses OpenAlex as our citation backbone. OpenAlex applies algorithmic author disambiguation, indexes only peer-reviewed content, and provides openly auditable methodology. This stands in contrast to Scopus (paywalled, contractually restrictive) and Google Scholar (no formal methodology, includes grey literature). Our choice reflects a commitment to reproducible, transparent intelligence."

Surface this on a future Methodology page (Phase 8).

## Snapshot-based author metrics architecture

Author metrics (citation count, h-index, works count) are deliberately stored as time-stamped snapshots, not as inline rollups on `hcps_v2` or extensions to `hcp_openalex_authors_v2`.

### Decision: new table `hcp_author_metrics_v2`, PRIMARY KEY (hcp_id, snapshot_date)

### Rationale:
- Metrics change continuously (citations accumulate, h-index increments). Inline rollup is always slightly stale.
- Time-series data IS the rising-star detection signal. "Citation velocity over the last 90 days" requires snapshots, not point-in-time values.
- Collaborative Orbit and Network Intelligence features (Phase 2) will read from this table for "what changed" displays
- Snapshot history accumulates value: 6 months from now we have 26 weeks of trajectory per HCP. 1 year, 52 weeks. The longer the platform runs, the richer the temporal signal.
- Re-runs are safe: new snapshot row, old snapshots preserved.

### Schema (to be migrated separately):
```sql
CREATE TABLE hcp_author_metrics_v2 (
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  openalex_author_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cited_by_count INTEGER,
  works_count INTEGER,
  h_index INTEGER,
  i10_index INTEGER,
  counts_by_year JSONB,
  two_yr_mean_citedness NUMERIC,
  enrichment_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hcp_id, snapshot_date)
);

CREATE INDEX hcp_author_metrics_v2_hcp_idx ON hcp_author_metrics_v2 (hcp_id);
CREATE INDEX hcp_author_metrics_v2_snapshot_idx ON hcp_author_metrics_v2 (snapshot_date DESC);
```

### Read pattern for frontend:
A view or materialized view `hcp_author_metrics_latest_v2` returns the most recent snapshot per HCP. The `getRisingStars` and `getEstablished` functions read from this view. Refresh after each enrichment run.

### Future:
- Weekly refresh pipeline (Phase 8)
- "Citation velocity over last N days" computed from snapshot deltas
- Wire to Collaborative Orbit ("growing connection" detection)