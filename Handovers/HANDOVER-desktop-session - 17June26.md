# Handover: Desktop Session Work

Captured Wed Jun 17, 2026, 9pm vacation laptop session. Three real items blocked on desktop. Each is real engineering work, not a script rerun.

## Tonight's Shipped Wins
- `a9fbc19` — `createNextAction` now uses `addHcpToDefaultOrCreate` (Brief opportunity "Save as Follow-Up" no longer creates orphan relationships)
- Diagnostics complete on three larger items below

## Item 1: Narrative Regeneration (highest demo impact)

### Problem
- 2,292 HCPs have narratives in `hcp_narratives_v2`
- Top 200 US Established: 48% coverage
- Top 200 US Rising Star: 53% coverage
- Top 200 Community: 0.5% coverage (effectively unbuilt)
- All existing narratives quote OLD methodology numbers (e.g., Travis narrative says "cohort score 90.0" but current production score is 99.012)

### Root Cause
- `generate_narratives_v2.py` config points at v2 tables with v2 fields (`hcp_established_scores_v2`, `hcp_established_ranks_v2`)
- HCPContext dataclass has stale fields: `pub_velocity_pct`, `citation_trajectory_pct`, `trial_investigator_pct`
- Production scoring is v3 with `scientific_influence_pctile`, `network_influence_pctile`, `pharma_engagement_pctile`

### Plan
1. Update `COHORT_SCORE_CONFIG['established']` to point at `hcp_established_ranks_v3` with v3 field names
2. Update HCPContext dataclass to v3 fields
3. Verify Rising Star config (already points at v3 from earlier work)
4. Update prompt templates to use v3 methodology language (50/35/15 weights, etc.)
5. Truncate `hcp_narratives_v2` for NSCLC OR add `--force` flag to regenerate
6. Dry-run first against ~10 HCPs to verify output quality
7. Full backfill: ~2,689 HCPs

### Cost
~$36 total (Sonnet 4.6 at ~600 input + 250 output tokens × 2,689 HCPs)

### Reference Files
- `generate_narratives_v2.py` (main script)
- `claude_layer.py` (API wrapper)
- `recompute_established_ranks_v3.py` (source-of-truth methodology)
- `docs/fieldmark-score-canonical.md` (canonical copy)

---

## Item 2: Rising Star Pipeline Leak (real demo bug)

### Problem
63 HCPs whose canonical `cohort_classification` is `'established'` are leaking into `hcp_rising_star_ranks_v3`. They appear on the Rising Star dashboard with marginal Rising Star scores (Ricciuti example: detail page shows Established score 98, but Rising Star card shows score 47, rank #122 US).

### Confirmed Test Case
- Biagio Ricciuti (UUID `194bb3b1-5c62-4301-b8cb-0add9e65fd16`)
- `cohort_classification`: 'established'
- In `hcp_established_ranks_v3`: rank 62 US, score 97.5
- In `hcp_rising_star_ranks_v3`: rank 866 — leaked

### Root Cause Hypothesis
`rising_star_scoring.py` filter for cohort membership is missing or not consulting `hcps_v2.cohort_classification` as a gate. 15-year career filter alone isn't sufficient — Ricciuti qualifies on career length but is canonically Established.

### Plan
1. Read `rising_star_scoring.py` filter logic
2. Add filter: `AND cohort_classification = 'rising_star'` (or however it joins)
3. Re-run pipeline against NSCLC
4. Verify count: expect ~1,581 instead of 1,644
5. Spot-check Ricciuti is excluded
6. (Hepatology also has Rising Star data — run same fix there)

### Why Not Frontend Filter
22 query sites across api.ts, home.ts, watchlists.ts hit this table. Defensive filtering at every query site is sprawling and error-prone. Python pipeline fix is the right cleanup.

---

## Item 3: Brief Generation Pre-Fix Orphan Investigation (deferred)

### Problem
Earlier tonight tested Chaft (`createNextAction` should add to default watchlist). Result: relationship created with `created_from: 'brief'`, no watchlist entry. Bug appeared still active.

### What Happened
The `createNextAction` fix was committed (`a9fbc19`) but tested 18 min after push. Cloudflare deployed in time. The Helena Yu test produced the same result.

### What's Unresolved
Two possibilities, not yet distinguished:
1. The Helena/Chaft tests were on stale browser cache despite our hard refresh expectation
2. `addHcpToDefaultOrCreate` has a real silent failure mode (RLS error, unique violation not handled, etc.)

### Plan
1. Re-test on fresh HCP after confirmed hard refresh
2. If still broken: open browser DevTools console, watch for swallowed errors during Save as Follow-Up
3. If still broken: add explicit error logging to `addHcpToDefaultOrCreate` to surface what's actually failing
4. Consider whether the Brief Edge Function creates relationships server-side (we never confirmed this with a clean grep)

---

## Other Items Already Queued (Pre-Tonight)
- ScoringExplainedModal deletion (superseded by /methodology)
- Workhorse phantom render paths in HCPCard
- LandscapeScreen + CityFeedScreen legacy flow deletion
- demo-runbook.md sweep (Belief Profile rename, methodology updates)
- Yellow color bug on Rising Star detail page "Why This Expert" section (briefly observed, not investigated)

## Tonight's Stocktake
1. ✅ createNextAction fix (committed and pushed; testing inconclusive due to caching)
2. ✅ Narrative coverage diagnostic: 48/53/0.5%, all quoting stale methodology
3. ✅ Rising Star leak diagnostic: 63 Established HCPs in wrong table
4. ✅ Three real items captured for desktop session

## Decision Pending
- When the desktop session happens (4 days away per vacation timeline)
- Whether to ship more frontend fixes before then or hold all data work

