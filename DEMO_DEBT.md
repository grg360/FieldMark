# DEMO DEBT

Running list of bugs, polish items, and product issues surfaced during Larry/John demo prep. Append as discovered.

Last updated: 2026-06-23

---

## Blocking (must fix before Larry/John get credentials)

(none currently)

---

## High priority (should fix before demo or address in email framing)

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

### TOP COLLABORATORS section missing on HCP detail page
Heymach detail page does not render the TOP COLLABORATORS section. Network tab confirms `hcp_top_collaborators_v2` returns 200 OK with data (5 rows for Heymach), so it's not a data/RLS issue. Likely a conditional render bug in MiniCollaboratorNetwork or DetailScreen's right rail. Worth investigating before demo - this was meant to be a visible value-add on Established HCP profiles.

### TOP PHARMA COMPANIES card padding inconsistent
The collapsed company row and the expanded detail panel below it have different left/right padding, making the visual hierarchy feel broken. Pre-existing UI bug. Affects all Established HCP detail pages.

### Cohort feed filter: Northeast territory keeps re-applying after clearing
On the Established (and likely other cohort) feeds, clearing the Northeast territory filter doesn't stick. After refresh, the filter re-applies automatically. Filter state is probably being re-derived from msl_profiles on each load rather than respecting the user's explicit clear action. Worth adding persistence to the cleared state, possibly via localStorage or session-level state.

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

## Security (deferred to dedicated session)

See conversation context from 2026-06-23 night session. Summary:
- 5 tables have RLS disabled entirely (Supabase Advisors email)
- 7 SECURITY DEFINER views need conversion to security_invoker
- 60+ tables have RLS enabled with zero policies (currently working because frontend uses anon key + service_role bypasses appropriately, but vulnerable if grant model changes)
- anon role has DELETE/INSERT/UPDATE/TRUNCATE on 98+ tables - needs grant audit and revocation
- This is a real grant model rethink, not a few SQL statements. Needs fresh-head dedicated session.

---
