# Final Pre-Demo Tech Debt List

Updated Wed Jun 18, 2026 ~11pm (laptop vacation session).

**Definition of done:** When this list is empty, Larry and John emails go out.

---

## Tonight's Shipped Wins (Jun 18 polish session)
- Institutions button removed from cohort dashboard filter row (now via GG menu)
- "Rising" -> "Rising Stars" label on Institutions index
- "NSCLC landscape" -> "NSCLC Landscape" capitalization
- "In territory (N states)" -> "Territory (N states)"
- WelcomeBanner belly band deleted from cohort dashboards
- "X of Y identified" counter removed from filter row (redundant with /me Coverage Gaps tile)
- DASHBOARDS order: Established -> Rising Stars -> Community (cohort gradient flow)
- Row order: TA -> Indication -> Cohort (proper drill-down)
- "INDICATION" label span removed from Indication filter row
- Cohort row centered with all 6 tabs visible at desktop widths (resolved CSS specificity bug)

---

## Quick Wins Remaining

### Cursor Pointer Audit
- Problem: Some clickable non-button elements (GG avatar, chip X buttons, possibly others) render the default text I-beam cursor instead of pointer cursor
- Fix: Either add `cursor: "pointer"` to each offending element's inline style, OR add a global CSS rule covering clickable non-button classes
- Time: 15-30 min in fresh session

### Brief Cache Investigation
- Problem: Verify cache check fires BEFORE the LLM API call, not after (so cached briefs don't incur API costs)
- Fix: Read code path in Brief generation, confirm cache hit returns early
- Time: 10-15 min diagnostic only

### Research Themes Cleanup
- Problem: Some themes show count of 1 - is a single-paper theme really a theme?
- Fix: Run diagnostic SQL counting themes with frequency=1, assess impact if pulled
- Time: 5 min SQL diagnostic, then product decision

### "Why This Expert" Color Bug on Rising Star Detail Page
- Problem: Jamie E. Chaft is a Rising Star but "Why This Expert" section renders yellow (Established gold) instead of purple (Rising Star)
- Fix: Frontend conditional, single file (likely DetailScreen.tsx)
- Time: 10-15 min

### Flag Organizations in Social Feature
- Problem: Social feature surfaces organizational accounts (OncoAlert, likely ESMO/ASCO/etc.) mixed in with individual HCPs/experts. They produce relevant content but conflate "voice" with "person."
- Fix: Add an org-vs-individual flag to social data (likely a column on the underlying handle/account table or a derived classification). Render org accounts with a distinct visual treatment (different badge, "ORG" label, or muted styling) so MSLs can tell at a glance.
- Open Questions: Where does the org classification live - database column on the existing handle table, or a separate orgs lookup table? Are there other org accounts beyond the obvious ones (OncoAlert, ESMO, ASCO) that need cataloging? Manual list to start, or automated detection?
- Time: 30-60 min if scoping stays small; longer if it becomes a real classification project

---

## Desktop Session Required (Python Pipeline Work)

### Narrative Regeneration (highest demo impact)
- Problem: 2,292 HCPs have narratives in `hcp_narratives_v2`. Top 200 US Established 48% coverage, Top 200 US Rising Star 53%, Top 200 Community 0.5%. All existing narratives quote OLD methodology numbers (e.g., Travis narrative says "cohort score 90.0" but current production score is 99.012).
- Root Cause: `generate_narratives_v2.py` config points at v2 tables with v2 fields. Production scoring is v3 with `scientific_influence_pctile`, `network_influence_pctile`, `pharma_engagement_pctile`.
- Plan:
  1. Update `COHORT_SCORE_CONFIG['established']` to point at `hcp_established_ranks_v3` with v3 field names
  2. Update HCPContext dataclass to v3 fields
  3. Update prompt templates to use v3 methodology language (50/35/15 weights)
  4. Truncate `hcp_narratives_v2` for NSCLC OR add `--force` flag
  5. Dry-run ~10 HCPs first
  6. Full backfill: ~2,689 HCPs
- Cost: ~$36 (Sonnet 4.6, ~600 input + 250 output tokens x 2,689 HCPs)
- Time: 60-90 min focused desktop work

### Rising Star Pipeline Leak
- Problem: 63 HCPs whose canonical `cohort_classification` is `'established'` are leaking into `hcp_rising_star_ranks_v3`. They appear on Rising Star dashboard with marginal scores. Confirmed test case: Biagio Ricciuti shows Established 98 on detail page but Rising Star 47 on cohort card.
- Root Cause: `rising_star_scoring.py` filter is missing the cohort_classification gate
- Plan:
  1. Read filter logic in `rising_star_scoring.py`
  2. Add filter consulting `hcps_v2.cohort_classification = 'rising_star'`
  3. Re-run pipeline against NSCLC (and Hepatology if applicable)
  4. Verify count: expect ~1,581 instead of 1,644
  5. Spot-check Ricciuti is excluded
- Why not frontend filter: 22 query sites across api.ts/home.ts/watchlists.ts hit this table - sprawling and error-prone vs single pipeline fix
- Time: 30-45 min focused desktop work

### Brief Generation Pre-Fix Orphan Investigation
- Problem: Earlier diagnostic tests (Chaft, Helena Yu) showed `createNextAction` fix may have caching/silent-failure issues
- Plan:
  1. Re-test on fresh HCP after confirmed hard refresh
  2. If still broken: browser DevTools console for swallowed errors during Save as Follow-Up
  3. If still broken: add explicit error logging to `addHcpToDefaultOrCreate` to surface failures
  4. Confirm Brief Edge Function doesn't create relationships server-side
- Time: 30-60 min

---

## Frontend Work (Could Be Laptop, Could Be Desktop)

### Institutions Page Performance
- Problem: Page takes 22-35 seconds to load
- Investigation Needed: N+1 queries, missing indexes, 1000-row PostgREST cap, or all three
- Time Estimate: 30 min if simple, 3 hours if deep
- Defer to desktop for fresh-head investigation

### Watchlists Feature: Include Tracked Institutions
- Problem: Watchlists page only shows HCPs. Should also show institutions being tracked
- Scope: Real product/schema work - institution watchlist items, mixed-type UI
- Decision Points: Same watchlist or separate? Same UI patterns or differentiated?
- Defer to desktop for product design

---

## Pre-Existing Cleanup Items

### ScoringExplainedModal Deletion
- 421-line modal now superseded by `/methodology` page
- Entry point already hidden in TopBar
- Just delete file + imports + onScoringExplainedPress prop chain
- Time: ~30 min surgical work

### LandscapeScreen + CityFeedScreen Legacy Deletion
- Old methodology Landscape page (Publication Velocity vs Citation Trajectory)
- Live route goes to v3 (LandscapeRoute/LandscapeQuadrantChart)
- Legacy flow reachable only via CityFeed back button -> stale chart
- Multi-file delete: LandscapeScreen.tsx, CityFeedScreen.tsx, state machine in App.tsx
- Time: 60-90 min careful surgery

### Workhorse Phantom Render Paths in HCPCard
- Workhorse cohort retired but render branches remain
- Delete dead branches, orphan tooltips, workhorseColor variable
- Time: 20-30 min

### demo-runbook.md Sweep
- Belief Profile rename (was Scientific Narrative)
- Methodology references should match canonical doc
- Time: 20-30 min writing

### TrackSwitch.tsx Dead File
- Component defined but not imported anywhere in active routes
- Likely superseded by DashboardTabs
- Verify zero usages, delete file
- Time: 10 min

### Other Callers of getOrCreateRelationship to Audit
- We fixed createNote (Tuesday) and createNextAction (Wednesday)
- Other callers in relationships.ts may still have orphan-relationship bug
- Original grep showed potential issues at lines 388, 532, 707, 750, 861 (line numbers may have shifted)
- Time: 30-60 min to audit all paths

---

## Definition of Done

When everything above is complete:
1. Run final visual smoke test on demo flow (Heymach -> Singh -> Janne walkthrough)
2. Update demo-runbook.md
3. Draft Larry email
4. Draft John email
5. Send.
