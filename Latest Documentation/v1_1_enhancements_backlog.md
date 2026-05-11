# FieldMark v1.1 Enhancements Backlog

**Created:** May 8, 2026
**Source session:** Social track design + buildout

---

## Purpose

This document captures everything explicitly deferred from v1.0 to v1.1 (or v1.5+) during the Social track design and buildout. It's the canonical "what we said we'd come back to" list. When v1.1 work begins, start here.

The v1.1 release is the **crowdsourcing release** — everything that requires LinkedIn-verified MSL identity bundles together and ships as one cohesive feature set rather than dribbling out across multiple minor releases.

---

## v1.1 — The Crowdsourcing Release

### Theme

> *"FieldMark v1.1: the platform learns from its users."*

The v1.0 launch establishes credibility as a credentialed-cohort intelligence platform. The v1.1 release establishes the platform's central thesis — that MSL community contribution makes the product better than either pure data or pure expert curation could.

### Prerequisites

LinkedIn OAuth authentication must land before any v1.1 user-facing feature can ship. This is its own workstream and includes:

- Privacy policy
- Terms of service
- Marketing site
- LinkedIn OAuth integration
- MSL identity verification flow (verifying MSL/field medical role from LinkedIn data)
- Anonymization layer (MSL identity is verified but anonymous to other users)

This is significant infrastructure work, not a sprint. Plan accordingly.

---

## v1.1 Features (in priority order)

### 1. MSL community verification (HCP tagging)

**What ships:**

- MSL tagging UI on every HCP card and detail page (currently shown as a "coming in v1.1" placeholder on Social cards)
- Three structured tag types: Verify HCP (✓), Flag (⚠), Neutral (no opinion)
- Aggregate display on cards: "✓ 3 MSLs verified" / "⚠ 1 MSL flagged"
- Tag-driven graduation logic: when N MSLs verify a `social_candidates` entry, graduate to `hcps` with appropriate metadata
- Tag scoping by therapeutic area (an MSL's tag in oncology context is independent of hepatology)

**Schema (created in v1.0, populated in v1.1):**

- `msl_users` — LinkedIn-verified MSL identity
- `hcp_msl_tags` — tags on credentialed HCPs
- `social_candidate_msl_tags` — tags on social-discovered candidates

**Constraints:**

- One tag per MSL per HCP per TA per type (enforced via UNIQUE constraint)
- Tags are anonymous in aggregate display but verified via LinkedIn-MSL identity
- TA-scoped — MSLs can verify within their domain, not across all medicine

**UX implication for v1.0 cards:** the tag slot is already laid out on Social cards as "MSL verification — coming in v1.1." When v1.1 ships, that slot becomes interactive without redesigning the card.

### 2. MSL hashtag submission

**What ships:**

- "Suggest a hashtag" button (currently shown on Social track with v1.1 modal placeholder)
- Submission form (hashtag input, optional TA scoping, optional one-sentence intent context)
- Status tracking: pending → approved / rejected → active in captures
- Notification to submitting MSL when status changes
- Admin review queue (Garrett-only or designated admin) for v1.1; algorithmic auto-validation deferred to v1.5

**Schema (created in v1.0, populated in v1.1):**

- `msl_hashtag_submissions` — pending/approved submissions
- `active_capture_hashtags` — populated in v1.0 with core hashtags; in v1.1 grows from MSL submissions

**Architectural improvement landing in v1.0:** the capture pipeline reads from `active_capture_hashtags` rather than hardcoded lists. This means MSL-submitted hashtags can be added in v1.1 without code changes — just admin approval flips a row's `active` flag to true.

### 3. MSL personal-impact view

**What ships:**

- Private dashboard showing the MSL's own contribution stats:
  - "You've verified N HCPs"
  - "You've submitted N hashtags, M approved"
  - "Your verifications have been seen N times by other MSLs"
- Private only — not a leaderboard, not visible to other MSLs
- Personal-only metrics; no ranking pressure

**Why personal-impact instead of leaderboard:**

Public leaderboard was discussed and deferred to v1.5+ for three reasons:
- Compliance asymmetry — MSLs at pharma companies face compliance review of any platform that gamifies their public-facing behavior
- Anonymity tension — leaderboards by definition de-anonymize, conflicting with the platform's MSL anonymity architecture
- Behavior shaping risk — gamifying contribution before quality-score data exists means rewarding volume over judgment

The personal-impact view captures most of the engagement value without these risks. Revisit leaderboard concept in v1.5+ once contribution_quality_score has real data.

### 4. Real social analytics (replacing v1.0 mocks)

**What ships:**

- SOV pie chart wired to real captured data (engagement-weighted, computed from `social_posts` and engagement counts)
- Topic share bars wired to real data (requires topic extraction pipeline — see v1.5 for full version)
- Engagement rate per Social card computed from real metrics
- Per-card narrative generated by Claude API instead of hardcoded
- Topic emergence direction computed from time-windowed comparisons

**Schema additions for v1.1:**

- Time-series aggregates table (post counts per HCP per day/week/month)
- Aggregation pipeline that runs after each capture
- Caching layer for chart data

**v1.0 → v1.1 transition:** every analytics surface in v1.0 is labeled "preview · uses sample data." When real data populates, the labels come off. Mock data is genuinely temporary scaffolding, not permanent.

### 5. Methodology page (single canonical doc)

**What ships:**

- Single platform-wide methodology page accessible from settings or top nav
- Explains all cohorts (Rising Stars, Community, Established, Social), scoring methodologies, confidence tiers, capture pipeline
- Tooltips link to specific anchors

**Why deferred:**

Real product work, not a sprint addition. Needs design attention. v1.0 ships with the disclosure card on the Social track + StatPillWithTooltip pattern across the app — methodology is accessible but distributed.

### 6. Slide-up explainer panels for cohort/confidence terms

**What ships:**

- Tap on cohort badge ("Established · 91.2") opens slide-up panel with full methodology explanation
- Tap on confidence tier ("Likely HCP" / "Possibly HCP" / "Unverified") opens slide-up explaining the three tiers and bio-text classification
- Tap on credentialed match pill opens slide-up explaining matching logic

**Status in v1.0:** cohort badge tooltips were shipped using the StatPillWithTooltip pattern. They explain the cohort and scoring at a high level. The slide-up pattern with fuller methodology is the v1.1 upgrade — same trigger, richer content.

---

## v1.5+ Features (further deferred)

### 1. Twitter-first HCP discovery

**The architectural gap:**

Today's pipeline matches captured social_users only against existing `hcps` (credentialed via publications, NPPES, trials). HCPs who are genuinely active on social but haven't published much, aren't trial PIs, and don't bill Medicare are invisible to the matching layer.

**The v1.5 fix:**

- NPI cross-reference verification for Twitter-first HCPs
- Extract claimed name + institution from bio
- Search NPPES NPI registry for that name + institution combination
- Only graduate to `hcps` after NPI match
- Verified HCPs joined `hcps` via this path are tagged with `discovered_via_social` provenance

**Why deferred from v1.1:**

Verification at scale is genuinely hard. Bio claims are easy to fake. Verification logic needs design work that competes with the v1.1 crowdsourcing focus. The cohort_classification work (also v1.1) is a prerequisite for placing Twitter-first HCPs into the right cohort bucket.

### 2. Claude API bio classification

**What ships:**

- Replace v1.0 regex/keyword-based confidence assessment with Claude API per-bio classification
- More accurate "Likely HCP / Possibly HCP / Unverified" assessment
- Process captured social_users in batches, store result, surface in confidence meter

**Why deferred:**

Adds API cost per candidate. v1.0 regex approach gets 80% of the way there at zero ongoing cost. Once captured social_users volume justifies the spend, switch over.

### 3. TA expertise tagging

**What ships:**

- Fourth MSL tag type beyond Verify/Flag/Neutral: "TA expertise" — "this person is genuinely an expert in [TA], not just a clinician active on social"
- Differentiates "real oncologist who tweets" from "real oncologist actively shaping the lung cancer conversation"
- Aggregates separately from verify_hcp tags

**Why deferred:**

Adds complexity to v1.1 tagging UX. Better to ship Verify/Flag/Neutral cleanly first, see how it's used, add TA expertise as a refinement once the simpler taxonomy is stable.

### 4. MSL trust calibration

**What ships:**

- `contribution_quality_score` populated based on tag agreement patterns
- MSLs whose tags correlate with eventual ground truth (manual verification, downstream signals) get higher trust scores
- Tag aggregation can weight by trust score in v1.5+

**Why deferred:**

Requires longitudinal data we don't have yet. v1.0 schema captures `contribution_quality_score` field but it stays null. v1.1 collects the contribution data. v1.5+ derives the trust calibration.

### 5. Topic emergence detection (real version)

**What ships:**

- Time-windowed term frequency analysis comparing this period vs. last period
- Surfaces "these terms appeared in <10% of posts last month and >40% of posts this month"
- Conversation network mapping: who replies to whom, who gets cited
- Engagement-weighted SOV (instead of v1.1's simpler engagement-weighted by candidate)
- Cross-platform amplification signals

**Why deferred:**

This is the differentiator vs. competitors who'd ship a static word cloud. Requires real captured volume + NLP pipeline. v1.1 ships honest stub versions; v1.5 ships the differentiated analytics layer.

### 6. Cross-platform identity stitching

**What ships:**

- Detection that the same person has both a Twitter handle and a Bluesky handle
- Single social_candidate row representing the person across platforms
- Aggregated metrics across both

**Why deferred:**

v1.0 treats each platform handle as a separate candidate. Stitching is a real product feature but requires identity-matching heuristics. Defer until both Twitter and Bluesky capture volume justify the work.

### 7. Public MSL leaderboard (revisit, not commit)

**What ships:**

- Quality-weighted public recognition mechanism for MSL contributors
- Built on `contribution_quality_score` data (which exists by v1.5+)
- Compliance review and design thinking required before commit

**Status:** explicitly NOT committed. Personal-impact view in v1.1 captures most engagement value. Public leaderboard remains backpocket — revisit only if compelling MSL community demand emerges and quality-score data supports it.

### 8. Per-MSL-team impact measurement

**What ships:**

- Integration points for MSL teams to measure FieldMark's impact on their KPIs
- "% of new HCPs engaged sourced from FieldMark"
- "Engagement quality lift" (correlated with downstream prescribing or trial participation)
- Self-reported "early-signal capture" tracking

**Why deferred:**

Real ROI measurement requires CRM integration and longitudinal data. This is a 12-18 month sales conversation, not a v1.0 or v1.1 feature. Mentioned here because it's the ultimate "so what" — when customers eventually ask, the platform should support telling that story.

---

## Tooling and process improvements deferred

### 1. Cursor revert resilience

Three times during this session, Cursor reverted prior changes when running new prompts (TrackContext, TrackSwitch, App.tsx all reverted between Sittings). Root cause not identified — possibilities include Cursor's auto-sync behavior, TypeScript-error auto-revert, or git state mismatch.

**Mitigation in place:**

- Commit after every successful Cursor prompt before running another (`.\quick_commit.ps1`)
- Verify previous-Sitting work is still in place before each new prompt
- Ask Cursor to report TypeScript errors rather than auto-fix by reverting

**Workflow improvement to investigate:**

- Whether Cursor has a setting to disable auto-revert on TypeScript errors
- Whether using `git stash` between sessions would prevent revert
- Whether smaller, more atomic prompts reduce revert risk

### 2. Real ASCO 2025 lookback (deferred — API constraint)

X API recent-search only goes back ~7 days. Cannot directly capture historical ASCO 2025 hashtag stream. Substitute strategy documented in capture strategy:

- Conference faculty / presenter lists are public — manual extraction
- ASCO Voices / social media advocates list is public — manual extraction
- User-timeline lookups for known accounts (cheap at $0.01 each)
- Re-process the existing April 27 capture (256 unique handles unprocessed for Social cohort)

Treat this as the historical-seeding workstream when capture pipeline is ready.

---

## Cross-cutting v1.1 work

### Documentation owed

- Single canonical methodology page (mentioned above as v1.1 feature)
- "Known issues" section in geographic enrichment v1.1 addendum reflecting the Chalasani Phase A bug discovery
- Short writeup of scoring compression issue (99.8 normalization across many top oncology HCPs)

### Schema migrations

The following tables need to exist before v1.1 functionality can be wired:

- `msl_users` (created in v1.0, empty)
- `hcp_msl_tags` (created in v1.0, empty)
- `social_candidate_msl_tags` (created in v1.0, empty)
- `msl_hashtag_submissions` (created in v1.0, empty)
- `active_capture_hashtags` (created in v1.0, populated with core hashtags)
- `social_candidates` (created in v1.0, populated by capture pipeline)

All schema DDL is in `social_track_schema_v1_0.md` (companion doc).

---

## Decision archive

Decisions explicitly made and locked in during the design session:

| Decision | Status |
|---|---|
| Fourth track called "Social" (not new cohort, parallel UX track) | Locked v1.0 |
| Provocative-but-honest disclosure language ("we're showing you our work — that's the deal") | Locked v1.0 |
| 3-tier algorithmic confidence meter (Likely / Possibly / Unverified) | Locked v1.0 |
| Bio-text regex/keyword for v1.0 confidence assessment | Locked v1.0 |
| Claude API bio classification | Deferred to v1.5 |
| Parallel `social_candidates` table (not flag in `hcps`) | Locked v1.0 |
| MSL tagging schema present in v1.0, populated in v1.1 | Locked |
| Hashtag submission UI present in v1.0 with v1.1 modal placeholder | Locked v1.0 |
| Personal-impact view as MSL recognition mechanism in v1.1 | Locked v1.1 |
| Public leaderboard | Deferred — backpocket |
| Engagement-weighted SOV (not raw post count) | Locked v1.0 |
| Topic share bars (not word cloud) | Locked v1.0 |
| Word clouds entirely | Skipped — methodologically weak |
| Twitter as paid pay-per-use, Bluesky as free continuous | Locked v1.0 |
| Capture cadence: weekly continuous + conference burst | Locked v1.0 |
| ASCO + EASL only for v1.0; ESMO/ASH/AASLD added in fall | Locked v1.0 |
| ~$425/year total Twitter API budget for v1.0 social workstream | Locked v1.0 |

---

*End of v1.1 enhancements backlog.*
