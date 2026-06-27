# DEMO DEBT

Running list of bugs, polish items, and product issues surfaced during Larry/John demo prep. Append as discovered.

Last updated: 2026-06-25

---

## Resolved

### TOP COLLABORATORS section missing on HCP detail page (2026-06-24)
Was gated to `isRisingStarCohort` only despite the data existing for Established. Added parallel Established branch in DetailScreen.tsx. Renders correctly across all cohorts.

### TOP PHARMA COMPANIES card padding inconsistent (2026-06-24)
Was using bespoke padding wrapper instead of shared `RIGHT_RAIL_SECTION_STYLE`. Aligned to shared style; also resolved the gap above DRUG ENGAGEMENT.

### View Follow-Ups button route (2026-06-24)
HomeHero button navigated to `/follow-ups` (unregistered) instead of `/me/follow-ups`. One-line fix.

### Publication NULL titles - 1543 rows (2026-06-24)
PubMed efetch backfill via `backfill_publication_titles.py`. All 1,543 NULL titles now populated. Heymach's Wistuba-coauthored Cancer Discovery paper among the fixes.

### Bookmark icon not filling for seeded accounts (2026-06-25)
Bookmark icon read from `savedHcpIds` (watchlist items) while portfolio chips read from `relationshipMap`. Seeded accounts had no watchlist items so bookmark stayed empty despite the HCP being tracked. Changed `isSaved` to read from `relationshipMap`. Bookmark now reflects portfolio state correctly.

### Cohort score visual continuity across Established/Rising Star/Community (2026-06-25)
Three cohorts had three different score header treatments and three different section names ("Cohort Score" / "Rising Star Score" / "Score Breakdown"). Now unified: each cohort renders the same header structure (cohort-prefixed score heading, "N / 100" framing, rank subtext), with cohort-appropriate content below. Extracted ScoreKpiTile shared primitive. Built ScoreBreakdownV3Community.tsx.

### Field Intelligence section column inconsistency (2026-06-25)
Established + Community rendered FIELD INTELLIGENCE in left column while Rising Star rendered it in right column. Now consolidated to right column under FIELD NOTES across all cohorts.

### Cohort feed filter: Northeast territory re-applies (2026-06-24)
Could not reproduce after 5-7 minutes of attempts. Likely heisenbug tied to specific timing or stale state. Watch for recurrence with detailed repro steps.

---

## Blocking (must fix before Larry/John get credentials)

(none currently)

---

## High priority (should fix before demo or address in email framing)

### Rising Voices scatter chart dots too small for reliable hover
The dots on the Rising Voices engagement-per-follower scatter chart are visually small and require precision cursor placement to trigger hover. Demo dry runs failed twice trying to land on a single dot mid-narration. Standard fix: render an invisible larger hit-target circle (2-3x visual radius) over each dot to expand the interaction zone without changing the visual. Pattern is well-documented in d3/recharts. Real demo blocker for any walkthrough that wants to highlight a specific Rising Voice investigator on the chart.

### Co-authored paper counts on Network Influence collaborator list not clickable
On the ESTABLISHED SCORE / Network Influence section, each top collaborator row shows their co-authored paper count (e.g., "97 co-authored papers" for Jianjun Zhang). These counts should link to a filtered publication list showing those specific co-authored papers, matching the pattern we shipped recently for the publication-level click-through. Currently the count is display-only. Same UX pattern as the Heymach publication count link added 2026-06-24. Real fix: wrap the count span in a button or Link, navigate to publications view filtered by `hcp_id IN (heymach, zhang)` or equivalent intersection query. Backend likely supports this already via existing publication queries.

### Territory Opportunities tile - Rising Star-only framing
The tile header says "1 of 66 Rising Stars tracked" even though the tracking chip row shows all tracked HCPs across Established, Rising Star, and Community cohorts. Misrepresents the user's actual portfolio. Two problems:
- Count line is filtered to Rising Stars only, ignoring tracked Established and Community HCPs
- Even within Rising Stars, count appears to filter to in-territory only (Larry tracks 2 RS - Singh PA and Patil CO - but tile shows "1 of 66")

Fix direction: either rename the tile to be Rising-Star-specific and add parallel Established/Community tiles, or generalize the count to reflect all tracked HCPs across cohorts.

### Tracked HCP count off by one in TerritoryCoverageStats
`getTerritoryCoverageStats` in `home.ts` line 820 filters tracked relationships to in-territory HCPs only. Same product issue we removed from `getTrackedHcpsInTerritory` earlier today. Out-of-territory tracked Rising Stars should still count.

### Other territory-state filters in home.ts (lines 690 and 796)
Two additional `.in("nppes_practice_state", territoryStates)` filters exist beyond the one we fixed. Need product review to determine which are legitimate territory scoping versus same bug pattern.

### Scroll landing on Belief Profile chip
Verified working tonight after settle-delay fix, but the 800ms wait may feel slow to some users. Worth iterating on timing or finding a more deterministic ready signal.

### Larry's tracking_status backfill
The seed script creates relationships with status `targeted`. Once Larry actually clicks Track in the UI, the status changes via platform code. Pre-seeded relationships have status semantics that may differ from naturally-created relationships. Worth confirming demo viewers see expected status badges.

---

## Medium priority (post-demo polish)

### Pattern detection feature
Advisor specifically named insight pattern detection ("17 investigators raised concerns about X") as potentially the most valuable AI feature in the platform. Requires meaningful data volume (advisor said ~500 insights). Out of scope for first demo but should be on Phase 2 roadmap.

### Naming consideration: "Field Insights" vs "Field Intelligence"
Advisor suggested "Field Intelligence" or "Emerging Signals" better reflects the strategic weight of the surface than "Field Insights" which reads more like notes. Defer until after Larry/John feedback.

### Other category card display
When `insight_category = 'other'`, the InsightCard shows just the "OTHER" badge without rendering the `insight_category_other_label` text. Should show something like "Other: [label]" to give viewers the actual category specificity.

### Belief Profile linkage suggestion during capture
Currently, claim_key is only populated by the seed script. The manual InsightComposer doesn't surface suggested Belief Profile claims while an MSL types. Phase 2 feature - AI-suggested linkage during capture.

### Auto-scroll on Belief Profile chip - polish
800ms settle delay works but is approximate. Better to detect when async data has actually settled and scroll then.

---

## Low priority / known issues

### Legacy hcps table is a footgun
Stale, differently keyed than hcps_v2. Logged in KNOWN_ISSUES from prior sessions. Should rename or otherwise prevent accidental queries.

### Chalasani 3-way partial dedup
Hepatology validation set, low priority since Hepatology is deprioritized.

### OpenAlex misattribution ~4.6%
Common names especially East Asian researchers. `hcp_openalex_authors` is many-to-many by design.

### ScoreBreakdownV3 mobile rendering bug
Renders on Heymach but not other Established HCPs on mobile. Likely taSlug propagation issue.

### Therapeutic_areas case sensitivity (now fixed but worth noting)
WelcomeWizard wrote `["nsclc"]` (lowercase) while Garrett's profile had `["NSCLC"]` (uppercase). Fixed in home.ts by normalizing to uppercase at lookup. Worth a code-wide audit for similar case-sensitive comparisons against profile data.

---

## Architecture cleanup (post-demo)

### savedHcpIds is now dead state in RelationshipsContext
After the bookmark fix on 2026-06-25, `isSaved` reads from `relationshipMap` rather than `savedHcpIds`. The `savedHcpIds` Set is still populated on load and updated by `toggleSave`, but no UI reads from it. Memory cost negligible but it's clutter and a footgun for future contributors. Delete in a cleanup pass: remove the state, remove the watchlist-items load on mount, remove the setter calls in `toggleSave`.

### toggleSave semantic mismatch
Clicking the bookmark icon currently calls `toggleSave`, which adds a watchlist item and (as a side effect) creates a relationship. The relationship creation is what makes the bookmark visually fill after the fix. But the function is still named and shaped around "save to watchlist," not "toggle relationship." Real architectural decision needed: should the bookmark click toggle relationship directly, or is the watchlist add a legitimate paired side effect? Affects naming, the watchlists table's role in the product, and how users mentally model "tracking" vs "saving."

### Dead Field Intelligence branch in DetailScreen.tsx
The left-column FIELD INTELLIGENCE render is now gated on `false &&` rather than deleted, to keep the surgical edit small. Delete the entire dead block in a cleanup pass.

### Stale Dagogo-Jack UUID in generate_seed_insights.py
Garrett's hardcoded roster references `51760cb9-3694-4e5c-a7e5-937c477c495f` as Dagogo-Jack (RS), but her actual UUID is `688b09af-ef70-4fef-bcab-fc4614fac3e7` and she is classified community in current data. The 51760... UUID may not exist in `hcps_v2` at all. Re-running seed for Garrett would either no-op or write to a stale entity. Worth resolving when next touching that script.

### DetailScreen re-render storm
Console showed 50+ instances of the bookmark debug log firing on page load before auth resolved. Probably means the component re-renders on every state change in RelationshipsContext. Real performance issue worth profiling. Not visible to users today but compounds as more state lands in the context.

---

## Community cohort coverage (Phase 2)

### Community narratives only generated for top 200
The top 200 NSCLC Community HCPs (by rank) have AI-generated "Why This Practitioner" narratives. The other ~4,300 NSCLC Community HCPs with Open Payments data still show "Narrative generating, check back soon" placeholder. Production-grade coverage requires a full background run (~$10-15 estimated based on the $1.12 cost for 200). Schedule as a low-attention background job post-launch validation.

### Community p95 reference values hardcoded in component
`ScoreBreakdownV3Community.tsx` hardcodes the four p95 reference values (P95_PATIENTS=12421, P95_LIFETIME_PAYMENTS=99871, P95_COMPANIES=52, P95_DRUGS=11) used for bar scaling. Computed once on 2026-06-25 from NSCLC Community NSCLC cohort. Becomes stale as data evolves. Real fix: cache layer or daily re-compute writing to a `cohort_signal_references_v1` table. Frontend reads from cache rather than holding constants.

### Community page layout
With Community now having a real intelligence layer (narrative + score header + tiles), the existing page sections that are publication-based (Belief Profile, Top Collaborators, Research Themes) render mostly empty for Community HCPs. Sections should be conditionally hidden for Community cohort. Replaced by Community-appropriate sections: a richer DRUG ENGAGEMENT visual, PATIENT VOLUME breakdown, and PRACTICE PROFILE pulling NPPES + Medicare data. ~90-120 min refactor in DetailScreen.tsx.

---

## Security (deferred to dedicated session)

See conversation context from 2026-06-23 night session. Summary:
- 5 tables have RLS disabled entirely (Supabase Advisors email)
- 7 SECURITY DEFINER views need conversion to security_invoker
- 60+ tables have RLS enabled with zero policies (currently working because frontend uses anon key + service_role bypasses appropriately, but vulnerable if grant model changes)
- anon role has DELETE/INSERT/UPDATE/TRUNCATE on 98+ tables - needs grant audit and revocation
- This is a real grant model rethink, not a few SQL statements. Needs fresh-head dedicated session.

---
