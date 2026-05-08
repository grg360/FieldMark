# FieldMark Frontend — Community Track UI Design

**Version:** v1.0 working draft  
**Author:** Garrett with Claude as design thought partner  
**Date drafted:** May 7, 2026  
**Status:** Working draft for v1 scaffolding. Two open questions noted; both should be confirmed before implementation begins.

---

## Purpose

This document specifies the UI primitives needed to extend FieldMark's existing rising-star-focused frontend into a seamless dual-track experience supporting both Rising Stars (academic) and Community (regional/practicing HCPs) tracks.

The existing frontend (HCPCard, DetailScreen, ScoreModal, StatPillWithTooltip, supporting CSS) is production-quality. This is not a rebuild. It's a thoughtful extension that parameterizes the existing components to support a second track sharing the same visual language and navigation primitives.

## Strategic positioning

User-confirmed product principles guiding this design:

1. **Track switch as primary UX gate.** Top-level Rising Stars / Community toggle. Filters apply within the selected view.
2. **Same visual language across tracks.** Same orange-on-dark palette, same card pattern, same modal patterns, same navigation. Different vocabulary and signal foregrounding.
3. **Sophisticated per-track filtering.** Each track gets its own filter primitives matched to the data and decisions that track serves.
4. **Cross-track signaling.** HCPs that score well in both tracks get a marker indicating dual-track relevance; user can toggle to see them through either lens.
5. **Single search across tracks.** A single search box returns results from both tracks, letting users find someone regardless of which track they're currently viewing.
6. **Dark Horse as cross-track status concept.** Same purple visual treatment, parameterized criteria narrative.

## Open questions requiring confirmation

**Question 1: Soft filter vs hard mode?**

When a user toggles Rising Stars → Community, does the universe of HCPs change or just the ranking and visible signals?

- **Soft filter (recommended):** Same universe; track changes which signals are foregrounded. An HCP can appear in both tracks with different scores. Same card patterns, just different stat pills. Search returns results from both tracks.
- **Hard mode:** Toggle completely changes the feed contents, available filters, card visuals, language. Two distinct products under one shell.

Recommendation: soft filter. Users get a richer experience and the data model already supports this (separate hcp_scores and hcp_community_scores tables can coexist).

**Question 2: Cross-track marker approach?**

For an HCP that scores well in BOTH tracks, what's the user experience?

- **Show only in current track:** simpler, but loses information
- **Show in both tracks with prioritized signals:** richest, more complex
- **Show in current track with a marker indicating "high in other track too":** middle ground

Recommendation: middle ground. Discrete visual marker on cards for HCPs scoring well in both tracks. Tooltip shows the other track's score. Invites the user to toggle and see them through the other lens without forcing them to.

## Component architecture

### Existing components to parameterize (no replacement needed)

These components stay in place but get track-aware parameters:

- **HCPCard** — receives a `track` prop ('rising-stars' | 'community'); stat pill row varies by track
- **DetailScreen** — receives a `track` prop; section list varies by track
- **ScoreModal** — receives a `track` prop; breakdown text varies
- **StatPillWithTooltip** — unchanged; reused across tracks
- **MetricPill** — unchanged; reused across tracks

### New components to build

- **TrackSwitch** — top-level Rising Stars / Community toggle pill
- **CommunityFilterBar** — community-specific filter chips
- **RisingStarFilterBar** — rising-star-specific filter chips (extracted from current implicit filtering)
- **CommunityHCPSections** — composed sections for community detail page (Practice profile, Engagement profile, Therapeutic specialization)
- **CrossTrackMarker** — small visual indicator for HCPs scoring well in both tracks
- **CommunityNarrativeSection** — community-tone narrative variant

### State management

Track selection should:

- Persist across navigation (user toggles to Community → views profile → returns to feed → still in Community)
- Not persist across sessions in v1 (default to Community on each session start, given strategic priority on Track #1)
- Be reflected in URL parameters for direct linking and reload behavior
- Trigger a re-fetch of feed data when toggled

Recommended approach: React context with localStorage or URL parameter persistence. Given the existing app structure uses standard React patterns, a TrackContext provider wrapping the app should suffice.

## Visual specifications

### Track switch

Visual: pill-style horizontal toggle near the top of the screen.

```
[ Rising Stars  |  Community ]
```

Active state styling:
- Selected: orange background (#E8A020), dark text (#0A0A0B), bold
- Inactive: dark background (#1E1E22), gray text (#6B6A65), regular weight
- Border around the entire pill: 1px solid #1E1E22
- Border radius: 4px (consistent with existing component patterns)
- Height: 36px

Position: directly under the navigation header, above the TA filter row.

Persistence: state persists across navigation within a session.

### TA filter (existing pattern, reused)

The TA selection chips already implemented work identically in both tracks. No change needed.

Therapeutic areas: Rare Disease, NSCLC, Hepatology, Oncology, Immunology.

### Track-specific filter chips

Horizontal scrollable row of filter chips below the TA filter. Each chip is an interactive element that opens a modal or expands inline to reveal filter options.

**Community track filter chips:**

```
[Setting ▾] [Career stage ▾] [Region ▾] [Volume ▾] [Engagement ▾]
```

Filter primitives:

- **Setting**: multi-select among academic_medical_center, hospital_affiliated, group_practice, solo_practice, ambiguous_group, small_group
- **Career stage**: multi-select among early_career (≤7 years), mid_career (8-20 years), established (21+ years)
- **Region**: state picker (single or multi-select); metro area picker deferred to v1.5
- **Volume**: single-select among "top 10%", "top 25%", "top 50%" within TA + region
- **Engagement**: single-select Open Payments tier — high, moderate, low, none

**Rising Stars track filter chips:**

```
[Pub velocity ▾] [Citation traj ▾] [Trial activity ▾] [Career age ▾] [Affiliation tier ▾]
```

Filter primitives:

- **Pub velocity**: range slider (0-10x peer baseline)
- **Citation trajectory**: signed range slider (-50% to +200% YoY)
- **Trial activity**: count threshold (1+, 2+, 3+, 5+ active trials)
- **Career age**: range slider (0-30 years)
- **Affiliation tier**: multi-select (top-20 academic, top-50 academic, other academic, non-academic)

Visual styling for chips:
- Same orange-bordered pill pattern as existing components
- Active filter shows a count or value summary (e.g., "Setting: 3" or "Volume: top 10%")
- Inactive filter shows just the label
- Tap to open modal/expansion
- Clear-all button at the end of the row

### HCP card variant — Community track

Same shell as the existing rising-star card. Same orange left border (3px solid #E8A020). Same name + country flag + score badge layout. Same narrative section.

What changes: the stat pill row.

**Rising Stars card stat pills (current):**

```
[PUB VEL: 3.2x] [CIT TRAJ: +47%] [TRIALS: 4 active]
```

**Community card stat pills (new):**

```
[VOLUME: top 8%] [SETTING: AMC] [EXP: 22 yrs]
```

Where:
- VOLUME = practice volume percentile within TA + region (e.g., "top 8%" or "top 25%")
- SETTING = abbreviation of nppes_practice_setting (AMC = academic_medical_center, Hosp = hospital_affiliated, Group = group_practice, Solo = solo_practice)
- EXP = years_in_practice (from career stage derivation)

Both card variants reuse the same StatPillWithTooltip component. Same tooltip mechanism. Same modal pattern when score badge is tapped.

**Tooltip text per track:**

For PUB VEL (rising stars): "Publications in the last 24 months relative to peer baseline. 3.2x means three times more recent activity than typical for this career age."

For VOLUME (community): "Practice volume percentile within the therapeutic area and region. Top 8% means this HCP treats more patients than 92% of peers in this TA in their region."

Tooltip pattern matches existing implementation.

### Cross-track marker

For HCPs scoring well in BOTH tracks, a small visual indicator appears on the card.

Visual: small filled circle or diamond (◆) in the upper-right corner of the card, near the score badge. Color: muted orange (#9E6E15) to distinguish from the primary score badge orange.

Tap behavior: shows tooltip "Also scores [score] in [other track]."

The threshold for cross-track marking: composite score 75+ in the OTHER track. Adjustable in code.

### Score modal — track-aware breakdown text

The existing ScoreModal component opens when a user taps the score badge. The modal currently shows the rising star score breakdown. Update to be track-aware.

**Rising Stars score modal text:**

> Rising Star Score: 87.3
>
> This score reflects publication velocity (94), citation trajectory (88), trial activity (81), and career age multiplier (76). Higher scores indicate stronger emerging trajectory.

**Community score modal text:**

> Community Score: 82.4
>
> This score reflects practice volume (40%), engagement signal (30%), practice setting (15%), career stage (10%), and publication context (5%) — weighted to identify high-impact community HCPs that traditional KOL databases consistently miss.

Both modals use the same component. Pass `track` and `score` props; component selects the appropriate template.

### Detail page — Community track section list

The existing DetailScreen renders rising-star-specific sections. Replace those sections with community-specific ones when the track is Community.

**Community detail page sections:**

1. **Header** (same as current — name, institution, primary affiliation, score badge, country flag)
2. **Why this HCP** (community narrative version, replacing "Why rising star")
3. **Practice profile** (NEW)
   - Practice setting badge (large, color-coded)
   - Years in practice
   - Primary location with state and metro area
   - Practice volume percentile in TA + region
   - Top procedures from Medicare HCPCS data (ranked list of top 5)
4. **Engagement profile** (NEW)
   - Open Payments tier badge
   - Top engagement categories (consulting, speaking, royalty, food/beverage, research)
   - Manufacturer relationships (top 3-5)
   - Recent engagement trend (chart showing last 4 quarters)
5. **Therapeutic specialization** (NEW)
   - Top conditions treated (Medicare ICD diagnoses, when available)
   - Top drugs prescribed/used (Medicare Part D, when available — v1.5)
6. **Score breakdown** (community weights — practice volume 40%, engagement 30%, setting 15%, career stage 10%, publications 5%)
7. **Field validation** (same UX pattern as existing — MSL contributors validate signal)
8. **Publication context** (smaller section than rising stars — count + recent papers list, no timeline)

**Rising Stars detail page sections (existing, unchanged):**

1. Header
2. Why rising star (narrative)
3. Score breakdown (rising star weights)
4. Publication timeline (5-year bar chart)
5. Field validation
6. Dark Horse callout (when criteria met)

### Dark Horse callout — Community variant

Same purple visual treatment as existing Dark Horse callout. Different criteria narrative.

**Rising Stars Dark Horse callout (existing):**

> ♞ Dark Horse · top 8% of rising stars
>
> Dr. X meets all four Dark Horse criteria — composite score 85+, citation trajectory +40%, 2+ active trials, and career age under 8 years. Fewer than 1 in 12 rising stars qualify.

**Community Dark Horse callout (new):**

> ♞ Community Dark Horse · top 10% of community HCPs
>
> Dr. X is a Community Dark Horse — top 10% practice volume in TA and region, located outside major academic clusters, high recent therapy adoption, and demonstrated therapeutic specialization. These are the practitioners traditional KOL databases consistently miss.

Same purple ♞ symbol. Same callout component. Pass `track` and HCP data; component selects the appropriate criteria narrative.

### Search behavior — single bar across tracks

Single search input at the top of the screen, persistent across both tracks.

Results show HCPs from both tracks. Each result card indicates which track(s) they score well in:

```
Dr. Rohit Loomba
University of California, San Diego
Rising Stars (87.4) · Community (74.2)

Dr. Sarah Smith
Banner Health, Phoenix
Community (82.3)

Dr. James Jones
Mayo Clinic
Rising Stars (78.9)
```

Tapping a card takes the user to the detail page in their currently-active track context. If they want to see the same HCP through the other track's lens, they toggle the track switch and re-tap.

Search backend: separate calls to both rising star and community indices, merged in the frontend. Calls happen in parallel. Results combined and sorted by composite score.

## Language and tone differences

The same UX surface uses different language per track. This is intentional — language anchors the user's mental frame.

**Rising Stars vocabulary:**
- "Rising star score"
- "Publication velocity"
- "Citation trajectory"
- "Dark Horse" (rising stars criteria narrative)
- "Trial activity"
- "Career age multiplier"
- "Why rising star"
- "Publication timeline"

**Community vocabulary:**
- "Community score"
- "Practice volume"
- "Engagement signal"
- "Community Dark Horse" (community criteria narrative)
- "Practice setting"
- "Years in practice"
- "Why this HCP"
- "Practice profile"

The shift is not just terminology — it's the framing of WHY this HCP matters. Rising stars are about emerging trajectory. Community HCPs are about current practice impact.

## Onboarding flow

When a user first lands on FieldMark, default to **Community** track.

Rationale: Community is the strategic priority Track #1. Most MSL teams targeting community engagement land here. Rising stars (academic) is the secondary track.

Visual indicator that the user is in Community track is clearly visible (the track switch shows Community as active). User can toggle immediately if they want.

## Mobile responsiveness

All components must work in the existing mobile-first responsive design. The track switch:

- Sits above the TA filter row at all viewport sizes
- Pill format stays consistent (Rising Stars / Community)
- Touch target meets the 44px minimum for mobile

Filter chips:
- Horizontal scroll on mobile if they overflow
- Tap target maintains 44px minimum
- Modal opens for filter values (already handled by existing patterns)

Cards:
- Same responsive behavior as existing rising star cards
- 2-column grid on tablet+ landscape (existing pattern)
- Single column on mobile portrait

Detail page:
- Sections stack on mobile (existing pattern)
- 2-column layout on tablet+ landscape (existing pattern)

## Implementation phasing for the frontend extension

Phase A (today/tonight): scaffolding only. Shell components, dummy data, navigation working.

- TrackSwitch component
- TrackContext provider
- Route-aware track persistence
- Filter chip placeholders (non-functional for now)
- HCP card stat pill variant logic
- Score modal track-aware text
- Defaults: Community track on session start

Phase B (after community composite scoring v1 lands): connect real data.

- Community feed fetches from hcp_community_scores table
- Filter chips become functional (Setting, Career stage, Region, Volume, Engagement)
- Cross-track marker computation
- Detail page section list switching by track

Phase C (after Phase 1 publication backfill validates): publication context updates.

- Detail page publication section uses publication_authors join table
- Publication count reflects full bibliography for academics
- Publication timeline (Rising Stars detail page) uses the new join data

Phase D (after community Dark Horse criteria computation): Dark Horse callout extends to community.

- Community Dark Horse criteria query in scoring pipeline
- is_dark_horse boolean populated for community HCPs
- Detail page callout renders for both tracks
- Card-level Dark Horse badge appears in both tracks

Phase E (operational hygiene):

- Search backend support for cross-track search
- Result merging in frontend
- Cross-track marker hookup on cards

## Document maintenance

This document is the source of truth for community track UI design. Changes require:

1. Append a Change Log entry
2. Justification for the change
3. Date and rationale

Document lives at `Latest Documentation/community_track_ui_design.md`. Version controlled via git.
