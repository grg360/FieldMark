# FieldMark Session Handoff — May 12, 2026

**For:** Next Claude session
**From:** Tuesday May 12 session (Community cohort scoring + UI polish complete)
**Project owner:** Garrett (Avalere Health, global leadership team, 20+ years medical communications)
**Current state:** v1.0 development. Frontend deployed to app.besselanalytics.com.

---

## Working preferences (carryover from May 11 — refined)

**Push back when something's wrong.** Strategic and technical pushback, not agreement. Garrett will tell you when you're being unhelpful. He values being told "I'm not confident this will work" over confident-sounding plans that don't pan out.

**Be honest about uncertainty.** When unsure if an approach will work, say so. The NPPES enrichment workstream on May 11 went poorly because of optimistic estimates that masked real risk. Today went better partly because we surfaced uncertainty earlier.

**Acknowledge wins before moving on.** Don't plow forward past meaningful moments. When the Wakelee methodology validated, when RLS policy was the bug all along, when the composite scoring landed — name those moments. Garrett tracks momentum and progress through them.

**Stop pushing when debugging is spiraling.** This happened on May 11 — we made 8+ commits in 2 hours chasing layered bugs. Pattern is "fix A surfaces B, fix B surfaces C, fix C breaks A." When you see this pattern, stop and re-baseline rather than continuing to iterate. The right move is sometimes a fresh session.

**Don't estimate time unless asked.** Claude is bad at estimating session length. When asked, qualify heavily.

**Cohort framing principle.** Garrett rejects the "perfect database" frame. Platform is built on community refinement — flag UI lets MSLs disagree with classifications. Imperfect data is a feature, not a bug, as long as methodology is principled and disagreement mechanism is in place.

**Cursor workflow.** Don't write code directly — write Cursor prompts that Garrett pastes into Cursor's AI chat. Format: clear === CURSOR PROMPT === markers, specific requirements, what to paste back for verification. Garrett executes the prompt and reports back.

**Supabase workflow.** Schema changes, SQL queries, updates go through Supabase SQL editor. Garrett pastes results back. Watch for column-name drift between TypeScript types and DB schema (we hit this multiple times).

**Deployment.** Push to GitHub via `.\quick_commit.ps1` then `git push origin main` → Cloudflare Pages auto-deploys to app.besselanalytics.com. Hard-refresh required after deploys (Ctrl+Shift+R).

---

## Where the project stands (end of May 12)

### Cohort classification — complete and refined

Four-cohort architecture (Established / Rising Stars + Dark Horse / Community + Workhorse) is locked, populated, validated, frontend-wired, deployed.

**Current counts (US-only):**
- Established: 610 (was 615 before industry filter)
- Rising Stars: 1,945
- Dark Horse: 158
- Community: 14,844 (was 14,895 before industry filter)
- Workhorse: 568
- Unclassified: 28,992

**Industry contamination cleared today.** 51 industry-affiliated HCPs removed from Community, 5 from Established. They were qualifying for Community because they have NPIs and pharma engagement records. SQL pattern matched institution_short for known pharma/biotech company names. Documented patterns excluded false positives like academic departments containing "therapeutics" or institutions in Rochester (which earlier matched "%roche%").

**Composite scoring built today.** Both Community and Workhorse cohorts now have a `cohort_score` (numeric column on hcps, 0-100, percentile-rank based).

Community formula:
```
0.45 * percentile(total_payments_lifetime)
+ 0.25 * percentile(distinct_companies_lifetime)
+ 0.15 * percentile(total_beneficiaries_3yr_unique_est)
+ 0.15 * percentile(nppes_career_stage_years)
```

Workhorse formula (different because pharma engagement is by definition low):
```
0.60 * percentile(total_beneficiaries_3yr_unique_est)
+ 0.40 * percentile(nppes_career_stage_years)
```

Cards sort by `cohort_score DESC` for Community/Workhorse views. Score displays in top-right of card. Hover tooltip explains the formula.

### Frontend polish landed today

- Cards sort by composite score (Community/Workhorse) — highest score on top
- Score chip displays the composite (e.g., "96.70")
- Hover tooltip explains the score methodology
- Subline normalized — "Institution, City, State" when institution_short is clean, fallback to practice setting label ("Hospital-Affiliated Practice, City, State") when not
- Narrative hidden on Community/Workhorse cards (avoided confusion when Community HCPs had Rising-Stars-flavored narratives), kept on profile detail view
- Green SVG plus button replacing text "+" on cards
- Tooltip width fix
- Middle initial periods added (database UPDATE, transformed "A A Vaporciyan" → "A. A. Vaporciyan")
- Workhorses count badge on TA selection screen

### Data flow root cause from yesterday — RESOLVED

The May 11 session ended in a debugging spiral over Open Payments and Medicare data not displaying on Community cards. Today we found the real cause in 15 minutes:

**The two summary tables (`hcp_medicare_summary` and `hcp_open_payments_summary`) had RLS enabled but no SELECT policies.** PostgREST silently returned null arrays instead of erroring. All the other attempted fixes (column name drift, embed syntax, !inner vs !left, separate queries vs embeds) were workarounds for this root cause.

Fix was two CREATE POLICY statements adding `USING (true)` SELECT access for the anon role. Matched the pattern already used on the `hcps` table.

This is documented context for v1.1 prevention work — any new summary tables need matching RLS policies added.

---

## Documents to review (in `Latest Documentation/` folder)

### Critical for context
1. **`session_handoff_2026_05_11.md`** — yesterday's handoff doc. Has cohort methodology details, working preferences origin, list of decisions locked in.

### Methodology
2. **`hcp_dedup_completion_plan.md`** — dedup workstream roadmap (substantively complete, 5 passes executed)
3. **`hcp_deduplication_design.md`** — full original dedup design
4. **`hcp_dedup_prevention_addendum.md`** — v1.1 prevention scope for future ingestion

### Backlog
5. **`v1_1_backlog_updated_may10.md`** — v1.1 priority list
6. **`v1_1_enhancements_backlog.md`** — older backlog (may be superseded)

### Other workstreams
7. **`deployment_linkedin_oauth_readiness_brief.md`** — May 8 doc. OAuth submission target ~May 15. Affects MSL crowdsourcing release timeline.
8. **`social_track_v1_0_implementation_log.md`** — May 8. Social media DOL track is separate workstream, mostly complete.

---

## Things to NOT re-litigate

- Four-cohort architecture (Established / Rising Stars + Dark Horse / Community + Workhorse)
- US-only filter for cohort classification
- Mutually exclusive cohort application order (Established > Rising Stars > Community, with Dark Horse and Workhorse as subset values not flags)
- Dark Horse and Workhorse stored as own classification values (not flags on parent)
- Frontend display logic: Rising Stars view = `IN ('rising_star', 'dark_horse')`, Community view = `IN ('community', 'workhorse')`
- "Workhorse" name (Garrett picked it; animal metaphor pairing with Dark Horse)
- Manual NPPES enrichment script (parked at May 11 — too high false-positive rate for v1.0 timeline)
- The flag UI mechanism as the answer to classification disagreements (decided, not yet built)
- Composite scoring methodology (4-component Community, 2-component Workhorse, percentile-rank normalized)
- Industry exclusion pattern for cohort classification (51 + 5 cleared, list of patterns documented in the May 12 transcript)
- Subline format (Institution, City, State with practice setting fallback)

---

## Next workstreams (Garrett's stated priority order)

### 1. Flag/Dispute UI

The crowdsourcing premise of FieldMark. Garrett wants this next.

**Scope:**
- New database table `cohort_feedback` with columns: id, hcp_id, current_classification, proposed_classification, reason (nullable text), flagged_by_user_id, flagged_at
- Flag affordance on every HCP card (small icon, separate from the green plus action button)
- Modal/sheet opens on tap with options: "Should be Established / Rising Star / Community / Something else"
- Optional "Why?" text field
- Submit creates `cohort_feedback` row
- Toast confirms submission
- For v1.0: data accumulates, doesn't yet auto-update classifications

**Open question:** Does the user need authentication for v1.0 flag submission? Currently there's a fake LinkedIn auth flow at the start. If still demo mode, capture anonymous user_id or skip user attribution.

### 2. Filtering workstream

Original "next session" item from May 10 before May 11 cohort work consumed the day.

**Scope:**
- Filter dimensions: TA (multi-select?), cohort (Established / Rising / Dark Horse / Community / Workhorse), geography (state? region?), maybe institution type or career stage
- UI pattern: filter chips, sidebar, or bottom sheet (mobile-first matters)
- URL state encoding for shareable filtered views
- Result count display ("238 HCPs match your filters")
- Empty state design
- Interaction with existing TrackSwitch (does TrackSwitch become a filter too, or stay separate?)

Garrett wants to slice Workhorse views by TA specifically — that's per-TA slicing on top of the cohort filter.

### 3. Tooltip width fix

If not landed in the May 12 final Cursor run (sequential with the workhorses badge prompt).

---

## Open items / known issues

### Score data quality
- `citation_trajectory_score`, `congress_score`, `msl_signal_score` in `hcp_scores` are mostly null/zero. This is why Dark Horse uses pub_velocity + trial_investigator only.
- Worth investigating in v1.1.

### TypeScript / DB column-name drift
- Frontend types in `types.ts` reference fields without `_score` suffix; DB columns have it.
- Fixed in API queries but not reconciled in type definitions. Post-v1.0 cleanup.

### International researchers wrongly classified as US
- `derived_state` is generated from `institution_state_code` (parsed from publication affiliation).
- Some international researchers' affiliations parse to US state codes incorrectly. Llovet shows CT, Rosell shows CT, Banach shows MD.
- Real but bounded. v1.1.

### Wakelee data correction
- Manually set `institution_state_code = 'CA'` on May 11 to get her into US filter.
- Documented data correction, not a methodology hack. Worth knowing.

### RLS policy completeness
- Today's fix added SELECT policies for `hcp_medicare_summary` and `hcp_open_payments_summary`.
- Any future summary tables need matching policies. Document this in v1.1 prevention work.

### MSL crowdsourcing release
- Blocked on LinkedIn OAuth approval. Submission planned for ~May 15.
- Affects flag UI rollout (anonymous vs authenticated submissions).

---

## Recommended session flow for next session

1. Read this doc (5 min)
2. Glance at `v1_1_backlog_updated_may10.md` for context (5 min)
3. Confirm cohort classification + scoring is live by checking app.besselanalytics.com (2 min)
4. Garrett will likely state direction at start — wait for that signal. Don't assume previous priority order dictates today.

If Garrett opens with "let's do the flag UI" → start with database schema design, then card affordance, then capture flow.

If Garrett opens with filtering → start with dimension scoping conversation. Don't jump to UI implementation.

Either way: design first, code second. The day that went best so far (May 12) was the day where we paused at every meaningful decision point.

---

## Final state of frontend repo (end of May 12)

- HEAD on `main` branch, fully pushed to origin
- Latest commits:
  - "Add workhorses count badge to TA selection screen"
  - "Update middle initial formatting"
  - "Subline normalization with practice setting fallback"
  - "Cohort score tooltip width fix"
  - "Hide narrative on Community/Workhorse cards"
  - "Green SVG plus button"
  - "Composite scoring frontend wiring"
- All Cursor changes committed and deployed
- Live site stable

---

*End of handoff document.*
