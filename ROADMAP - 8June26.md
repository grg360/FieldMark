# FieldMark Product Roadmap

**Last updated:** 2026-06-09
**Status:** Active development. Updated after each shipped milestone.

---

## Strategic framing

FieldMark is becoming a **CRM + Intelligence Layer for Medical Affairs**.

The rankings get users in the door. The workflow keeps them there.

Most KOL platforms live in the "discover" step of the MSL job loop. FieldMark
aims to occupy the full loop: discover → prioritize → prepare → engage →
capture → iterate.

This roadmap is sequenced to add workflow layers on top of the data layer,
turning a research tool into a daily-use product.

---

## Where we are

**Shipped (as of 2026-06-09):**

- Cohort feeds (Rising Star / Established / Community)
- HCP detail pages (Top Collaborators, Network Trajectory, Research Themes, Field Intelligence, Score Breakdowns, Drug Engagement)
- Landscape quadrant scatter page
- Institution detail pages (leaderboards, Top Internal Collaborations, Top External Partner Institutions with top-pair callouts)
- Institutions index (sortable table with Talent Density + Yield + External Partners)
- Cross-page navigation (Landscape → Institution → HCP detail → Institution)
- Snapshot infrastructure (Sunday weekly cron capturing Rising Star, Established, Community ranks)
- Web enrichment for top US Rising Stars (Tavily + Claude → Contact & Access cards)
- Data hygiene: institution_canonical column consolidating naming duplicates

---

## Tier 1: Personal ownership

The features that turn a database into "my database."

### 1. Authentication (IN PROGRESS — 2026-06-09)

Supabase email+password auth. Custom-created accounts for demo users.

- Email/password form on landing page above LinkedIn button
- First-time setup wizard (name + company + region + states covered)
- `msl_profiles` table with future-room schema
- Profile page wired to read/write
- Auth wrapper + protected routes
- Header avatar + dropdown
- Personalized dashboard with welcome banner
- Institutions-in-your-territory panel on dashboard
- PostHog analytics

**Lift:** ~6-7 hours. Status: tonight.

### 2. Watchlists

The single highest-ROI workflow feature. Users save HCPs and institutions
into named lists.

- Star button on HCP cards and institution cards
- Single watchlist v1; named multiple lists v1.5 ("EGFR NSCLC Targets",
  "ASCO 2027 Prospects", "Pennsylvania Academic Centers")
- Watchlist view at `/me/watchlist`
- Filter cohort feeds to "only watched"

**Lift:** M (3-4 hrs). Tables: `msl_watchlists`, `msl_watchlist_items`.

### 3. Private Notes

Per-HCP private notes. The note IS the workflow.

- Note input on HCP detail page (right rail)
- Notes list per HCP with timestamps
- Edit/delete
- Default visibility: private to user
- Foundation for team sharing later

**Lift:** M (3-4 hrs). Schema: extend `msl_contributions` with `visibility`
enum + `note_text` field.

### 4. Tags

User-defined tags applied to HCPs.

- v1 = personal tags only (avoid team-taxonomy chaos until needed)
- Filterable on cohort feed
- Common starter set: "High Priority", "Trial Candidate", "Speaker Potential",
  "Difficult Access", "Friendly", "New to Territory"

**Lift:** S-M (2-3 hrs). Schema: `msl_tags`, `msl_hcp_tags`.

### 5. Relationship Status + Next Action

**Advisor-flagged as the missing critical feature.** Turns the research
tool into a CRM.

- Status enum per HCP per user: Not Engaged / Aware / Developing / Active / Strategic
- Last interaction date (manual or auto-derived from notes)
- Next action text field
- Optional next action date
- Surfaced on HCP card and HCP detail page

**Lift:** M (4-5 hrs). Schema: `msl_hcp_relationships`.

---

## Tier 2: Workflow magic

### 6. Generate Brief

The demo screenshot moment. One click → 2-minute prep brief.

- Button on HCP detail page
- Auto-assembled brief: Rising Star score, momentum trends, top collaborators,
  recent papers, Open Payments, field notes, institution context, social activity
- Web view + printable PDF
- Uses Claude API for narrative synthesis

**Lift:** L (6-8 hrs). Highest demo leverage of any single feature.

---

## Tier 3: Territory

### 7. Territory Workspace

Foundation built during auth night (Institutions-in-territory panel).
Full version is a dedicated workspace.

- `/my-territory` page
- HCP count in territory (tracked + total)
- Rising Star count
- Score increases this week (requires snapshots)
- New publications this week
- Notes added by team members
- "What changed" feed

**Lift:** M (4-5 hrs to expand beyond tonight's scope). Leverages snapshots
+ msl_contributions.

---

## Tier 4: Team

### 8. Team Intelligence

The advisor's identified moat: shared field intelligence.

- Notes optionally shared with team
- Team roster
- HCP ownership ("Sarah owns Singh")
- Manager visibility of team activity
- Aggregated team intelligence per HCP

**Lift:** L (8-10 hrs). Schema: `msl_teams`, `team_members`. Extends
`msl_contributions.visibility` to include 'team'.

**Blocks on:** admin tooling (Tier 6), which blocks on first pharma team
expressing interest.

---

## Tier 5: Engagement

### 9. Notifications

Pulls users back to the platform.

- Weekly Sunday digest email (powered by snapshot deltas)
- "Score changes on saved HCPs" alerts
- "New rising stars in your TA" weekly digest
- In-app notification badge

**Lift:** M (4-5 hrs). Blocks on email infrastructure setup (~1 hr).

---

## Tier 6: Admin

### 10. Admin tooling

Triggered when a pharma director says "can I add my team?"

- Invite MSLs to team via email
- Assign territories
- View team roster
- Deactivate accounts
- See team-wide activity

**Lift:** L (10-15 hrs).

---

## Tier 7: Cross-functional

### 11. PostHog analytics (TONIGHT)

Event tracking, session replays, retention cohorts.

**Lift:** S (15 min). Status: tonight.

### 12. LinkedIn OAuth (v2 auth)

Verified MSL identity. Replaces email/password as primary auth path.

- LinkedIn app registration
- OAuth flow
- Profile role verification (current job title contains "MSL", "Medical
  Science Liaison", "Medical Affairs", etc.)
- Migration from email/password accounts via email match

**Lift:** L (6-8 hrs).

### 13. TA expansion

Per the existing TA_EXPANSION_ROADMAP.md.

Targets:
- Hepatology (already partially built, needs validation)
- Immunology (planned)
- Rare Disease (planned)
- Breast Oncology (priority: triggered by first MSL demo feedback)

**Lift:** 5-7 calendar days per TA, ~1.5 days operator time. See
TA_EXPANSION_ROADMAP.md for full runbook.

---

## Tier 8: Polish (ongoing)

### 14. Onboarding tour
Shepherd.js coach-marks for first-time visitors. 5-step walkthrough.

**Lift:** M (3-4 hrs).

### 15. Tooltips
Hover help on Talent Density, Yield, Archetype, Network Momentum, Rising
Star, and other domain terms.

**Lift:** S (1-2 hrs).

### 16. Mobile testing pass
Every new page checked on mobile width. Fix layout breaks.

**Lift:** M (2-3 hrs).

### 17. Methodology page
Dedicated `/methodology` explaining scoring math, archetypes, talent density,
yield computation, snapshot/momentum mechanics.

**Lift:** M (3-4 hrs).

### 18. Bug backlog
- 400 errors on `publication_therapeutic_areas_v2` (column reference mismatch)
- 400 errors on `trial_investigators_v2`
- Various known-issues from KNOWN_ISSUES.md

**Lift:** Variable.

---

## Suggested execution sequence

### This week

- **Mon 6/8:** Landscape + Institutions (done)
- **Tue 6/9:** Auth + Profile + Personalized dashboard + PostHog (tonight)
- **Wed 6/10:** Watchlists + Private Notes (Tier 1 items 2 + 3)
- **Thu 6/11:** Relationship Status + Tags (Tier 1 items 4 + 5)
- **Fri 6/12:** Generate Brief (Tier 2 item 6)
- **Sun 6/14:** Snapshot #2 lands automatically → momentum indicators light up across platform

### Next week

- **Mon 6/15:** Wire momentum indicators (Rising Star deltas, Institution rank changes)
- **Tue 6/16:** Onboarding tour + Tooltips
- **Wed 6/17:** Territory Workspace (Tier 3 item 7)
- **Thu 6/18:** Mobile pass + bug backlog
- **Fri 6/19:** Methodology page + Hepatology TA pre-flight

### Week 3

- LinkedIn OAuth
- First MSL demo sessions (target: 2026-06-22 week)
- Adjustments based on real feedback

---

## Strategic checkpoints

After each shipped milestone, ask:
1. Does this feature create a reason to return tomorrow?
2. Does it move us further from "LinkedIn for HCPs" toward "CRM + Intelligence Layer"?
3. Is the schema designed to hold what's coming next, or will we migrate?

Re-read this document at the start of every work session.