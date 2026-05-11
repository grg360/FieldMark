# Social Track v1.0 — Implementation Log

**Created:** May 8, 2026
**Source session:** Social track design + buildout
**Status:** Frontend v1.0 mock implementation complete; backend pipeline pending

---

## Purpose

This document captures what was actually built during the Social track v1.0 buildout — components, mock data, design decisions, and the v1.0 → v1.1 → v1.5 hardwire roadmap. When work resumes on this track (whether next week or in three months), start here.

For deferred work, see the companion document `v1_1_enhancements_backlog.md`.

---

## What ships in v1.0

### A fourth track: "Social"

The Track Switch component now has four buttons:
- Community
- Rising Stars
- Established
- **Social** (new)

Visual differentiation: Social uses blue active-state styling (`#1A2530` bg, `#6BA3D8` fg, `#2A3848` border) while the other three use orange (`#E8A020`). The blue palette signals "different kind of cohort" — not credentialed, signal-based.

### Disclosure language (the linchpin)

Every entry into the Social track surfaces this disclosure card:

> **SOCIAL SIGNAL · PREVIEW**
>
> Identifying digital opinion leaders is hard. There's no authoritative list — and traditional KOL databases mostly don't try.
>
> This view captures voices active in [TA] conversations on Twitter/X and Bluesky. Some entries are credentialed clinicians whose identity we've verified through publications, trials, or NPPES. Others are accounts we've captured but haven't matched to credentialed identity yet — they may be HCPs, fellows, researchers, or other participants in the public dialogue.
>
> Each card shows our algorithmic confidence assessment based on bio analysis. MSL community verification is coming in v1.1 — when LinkedIn-verified MSL identity launches, MSLs will be able to tag HCPs they recognize as verified clinicians.
>
> **We're showing you our work, including the parts that aren't finished. That's the deal.**

The closing line is deliberate. It frames imperfection as transparency rather than a gap. This language should not be edited without strategic discussion — it's the core of the platform's positioning on Social.

### Social candidate cards

Each card displays:

| Element | Source in v1.0 | Source in v1.1+ |
|---|---|---|
| Display name + handle | Mock data | Real captured `social_users` |
| Affiliation + specialty | Mock data | Bio extraction or credentialed match |
| Bio snippet | Mock data | Real Twitter/Bluesky bio |
| Confidence tier (Likely / Possibly / Unverified) | Hardcoded per candidate | Bio-text regex (v1.1) → Claude API (v1.5) |
| Credentialed match pill (when applicable) | Hardcoded for 3 candidates | Real `dol_matches` join |
| MSL verification placeholder | "Coming in v1.1" text | Real aggregate count |
| Per-card narrative | Pre-written per candidate | Claude API generated (v1.1) |
| Followers / Engage / Posts/90d / Source | Mock data | Real captured metrics |

Three confidence tiers shown across the mock data:
- **Likely HCP** (blue) — strong signals: real name, credentials in bio, named institution
- **Possibly HCP** (amber) — weaker signals: no institution, sparse bio, fellow status
- **Unverified** (gray) — sparse or non-clinical bio

Three credentialed-match cards seeded for demo: Choueiri, Shadman, Prelaj. These show the cross-cohort case — visible in Social AND credentialed in Established/Rising Stars cohorts.

### Analytics layer (mocked)

The `SocialAnalyticsBanner` component sits above the candidate cards with two visualizations side-by-side:

**Left: Voice SOV pie chart**
- Engagement-weighted (not raw post count)
- Score per candidate = `engagementRate × postsLast90Days`
- Top 5 voices + Others slice
- Donut chart (innerRadius 28, outerRadius 50)
- Legend with name + percentage inline

**Right: Hot topics horizontal bars**
- Topic share bars (amber color `#C49A4A`)
- 5-6 topics per TA + Other
- Bar fill = percentage of conversation
- Hardcoded topics per TA (KRAS G12C combos, Trop-2 ADCs, etc. for oncology; MASLD trial readouts, GLP-1 etc. for hepatology)

**Below: Topic emergence strip**
- Trending terms with directional arrows (↑ surging, → steady, ↓ fading)
- 4 topics per TA, hardcoded with directions
- Different from the topic share — emergence is direction over time, share is current state

### Suggest a hashtag CTA

A "+ Suggest a hashtag" button appears below the disclosure card. Tapping opens a modal with v1.1-coming-soon messaging:

> **Coming in v1.1**
>
> When LinkedIn-verified MSL identity launches in v1.1, you'll be able to suggest hashtags for FieldMark to monitor in your therapeutic area. Submissions are reviewed before being added to the active capture rotation.
>
> This is part of the v1.1 crowdsourcing release — MSL community verification, hashtag submission, and a personal contribution view will all land together.

This is Level 1 dummy — visible-but-disabled UI, sets expectation, no fake data.

### Tooltips

Stat pills (Followers / Engage / Posts/90d / Source) and cohort badges (Established · 91.2 / Rising Stars · 78.4 / Community · 65.0) all have tooltips on click/hover. Implementation reuses existing `StatPillWithTooltip` component shared across Rising Stars / Community / Established cards.

Tooltip content explains:
- What each metric means
- Calibration baselines ("1% engagement is typical baseline; above 4% is notable")
- How to interpret the data ("low post counts don't necessarily mean low impact")

---

## What's hidden on the Social track

When `track === "social"`, the following UI elements are suppressed:

- Dark Horse filter chip (Dark Horse is a credentialed-cohort concept)
- DOL Hero Panel (Social track is the dedicated home for that data)
- Section header right side: count + Landscape button
- Card grid (replaced by `SocialTrackEmpty` rendering)

This was implemented via `track !== "social"` conditional wrappers in App.tsx.

The TA filter chips remain visible — therapeutic area scoping still applies.

---

## Files added or modified

### New files
- `frontend/src/components/SocialTrackEmpty.tsx` — entry component for the Social track (renders disclosure, CTA, banner, cards, or empty state)
- `frontend/src/components/SocialCard.tsx` — card variant for Social track candidates
- `frontend/src/components/SocialAnalyticsBanner.tsx` — SOV + topics + emergence visualizations
- `frontend/src/components/SuggestHashtagModal.tsx` — v1.1 coming-soon modal
- `frontend/src/data/socialMockData.ts` — 11 mock candidates with full metadata + narratives

### Modified files
- `frontend/src/lib/TrackContext.tsx` — added `'social'` to Track type, sessionStorage validation
- `frontend/src/components/TrackSwitch.tsx` — fourth button with blue active styling
- `frontend/src/App.tsx` — Social track integration (early returns in fetchHCPs / useEffect / loadMore; conditional rendering of Dark Horse chip, DOLHeroPanel, section header right side, and card grid)
- `frontend/src/components/StatPillWithTooltip.tsx` — added tooltip definitions for Followers, Engage, Posts/90d, Source, cohort_established, cohort_rising_stars, cohort_community
- `frontend/src/components/SocialCard.tsx` — wired StatPillWithTooltip on stat pills + cohort badge
- `frontend/src/components/HCPCard.tsx` — wired StatPillWithTooltip on cohort badge

### Dependencies added
- `recharts` — installed during Sitting 3 (was assumed installed but wasn't; Vite resolution error caught it)

---

## Schema state

The full schema design lives separately as `social_track_schema_v1_0.md` (note: that file should be created if it doesn't exist; schema details are in the May 8 chat transcript).

**Tables that need to exist before v1.0 backend work:**
- `social_candidates` — promoted social_users, populated by capture pipeline
- `msl_users` — empty in v1.0, populated when LinkedIn auth ships in v1.1
- `hcp_msl_tags` — empty in v1.0, populated in v1.1
- `social_candidate_msl_tags` — empty in v1.0, populated in v1.1
- `msl_hashtag_submissions` — empty in v1.0, populated in v1.1
- `active_capture_hashtags` — populated in v1.0 with core hashtag list

**Architectural change for v1.0:** capture pipeline reads hashtag list from `active_capture_hashtags` table rather than hardcoded lists in scripts. Enables v1.1 hashtag submission to land without code changes.

**Schema NOT yet executed.** SQL was drafted but not run during this session. Phase A geographic enrichment was running during the design session and we agreed to wait until it finished before introducing schema changes. Run when Phase A completes.

---

## Mock data calibration

The 11 mock candidates were calibrated for demo purposes. Specifically:

- Choueiri: 44.5k followers × 4.2% engagement × 42 posts → high voice SOV anchor
- Shadman: 3.0k followers × 8.4% engagement × 31 posts → engagement-weighted leader
- Prelaj: 1.3k followers × 12.1% engagement × 12 posts → "punching above weight" demo case
- Hornstein: 12.4k followers × 4.2% engagement × 18 posts → mid-tier likely HCP
- Park: low-volume oncology fellow → Possibly HCP demo
- Kumar: sparse bio → Unverified demo

The engagement-weighted SOV math produces:
- Shadman ~37%
- Choueiri ~25%
- Prelaj ~21%
- Hornstein ~11%
- Park ~5%
- Others ~1%

This tells the demo story: "follower count alone doesn't tell you who's shaping the conversation. Engagement-weighted analysis reveals voices like Shadman and Prelaj punching above their weight."

When real data lands in v1.1, the math changes but the visualization stays. Mock candidates can be cleared.

---

## Known issues / debt

### 1. Mobile responsiveness on the analytics banner

The two-column grid (`gridTemplateColumns: "1fr 1fr"`) gets cramped at narrow viewports (<400px). Acceptable for desktop demo; needs media-query breakpoint for production mobile use. Defer to v1.1 polish.

### 2. Tooltip vertical position bug fix

The `StatPillWithTooltip` component had a position bug where tooltips appeared `scrollY` pixels too far below the trigger when the page was scrolled. Cause: `position: fixed` element using document-relative top calculation (added `window.scrollY`). Fixed during this session by removing the `scrollY` term.

This bug was latent across the platform — affected Rising Stars / Community / Established cohort cards too, just less visibly because those cards are usually visible without scrolling. Fix is now platform-wide.

### 3. "MSL verification — coming in v1.1" appears on every card

Repetition is intentional for now — sets v1.1 expectation unmistakably. May trim to once-per-session or move to disclosure-only in a polish pass before v1.0 launch.

### 4. Cohort badge in HCPCard.tsx

When wiring tooltips, cohort badge tooltip key derivation in HCPCard.tsx required matching the existing label logic. If the label logic ever changes, the tooltip key derivation must update in lockstep. Note for future maintenance.

---

## Capture strategy (designed but not executed)

Drafted during design session, ready to execute when Phase A finishes:

### Mode 1: Continuous low-volume captures
- Cadence: weekly
- Twitter hashtags per TA:
  - Oncology: `#LCSM`, `#hemonc`, `#OncoTwitter`
  - Hepatology: `#livertwitter`, `#MASLD`, `#NAFLD`
  - Rare Disease: `#raredisease`, `#rarechat`, `#raredz`
- Bluesky parallel for same hashtags ($0 cost)
- ~$300/year on Twitter API

### Mode 2: Conference burst captures
- Cadence: daily during 5-7 day conference window
- 2026 conferences: ASCO (May 29-June 2), EASL (June 17-20), then ESMO/ASH/AASLD in fall
- Per conference: 2 hashtag variants × 200 posts × 5-7 days = ~$15-20
- ~$125/year

### Mode 3: Historical seeding (one-time)
- ASCO Voices / social media advocates list (publicly available, manual extraction)
- Conference faculty pages (publicly available)
- Manual curation of known accounts (Rajkumar, Goodman, Lewis for oncology; Chalasani, Loomba, Rinella for hepatology)
- Re-process April 27 capture (256 unique handles in `social_users` not yet promoted to `social_candidates`)

**Total v1.0 social workstream cost:** ~$425/year on Twitter API + $0 on Bluesky.

**Pre-ASCO checklist before May 28:**
- Test capture script ($1-2 small capture to verify after dormancy since April 27)
- Verify checkpoint logic (April 27 had a bug where re-running same hashtag was treated as "completed")
- Build Bluesky capture script (planned, not built)
- Build promotion script (raw `social_users` → `social_candidates` with bio-text confidence)

---

## Critical strategic decisions locked in this session

These decisions are not lightly reversible — changing any of them affects the platform's positioning or architecture meaningfully.

1. **Social is a fourth track in the UI, not a fourth cohort.** Cohorts are credentialed; tracks are UX. Social UX is parallel to cohorts but operates on different data quality bar.

2. **The disclosure language is the linchpin.** "We're showing you our work — that's the deal." Frames imperfection as transparency, not as a gap. Strategic positioning hinges on this tone.

3. **Engagement-weighted SOV, not raw count.** Raw count means biggest-audience-wins, which is uninformative. Engagement-weighted reveals voices that punch above weight, which is the actual product value.

4. **MSL crowdsourcing is the v1.1 differentiator.** Tagging + hashtag submission + personal-impact view all bundle as the "platform learns from its users" release. Backend prerequisite is LinkedIn OAuth.

5. **Public MSL leaderboard is deferred indefinitely.** Compliance asymmetry, anonymity tension, and behavior-shaping risk make it the wrong move at v1.1 scale. Personal-impact view delivers most engagement value without these risks.

6. **Bluesky is the primary capture platform; Twitter is selective.** Cost: $0 vs. $300+/year. Quality: medical Bluesky is earlier-adopter and less industry-saturated. Future-proof: if X degrades further, Bluesky is already invested.

7. **Twitter-first HCP discovery is v1.5, not v1.1.** Architecture gap is real but the verification problem (NPI cross-reference at scale) needs design time. v1.1 focus stays on crowdsourcing.

---

*End of Social track v1.0 implementation log.*
