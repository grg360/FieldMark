# Community Track UI Design — v1.1 Update Notes

**Version:** v1.1 update notes (to be incorporated into community_track_ui_design.md)  
**Date drafted:** May 7, 2026 (evening)  
**Status:** Append to existing UI design document or replace v1.0 sections as noted.

---

## Why this update exists

The original UI design document described two tracks: Rising Stars and Community. During the late-afternoon session on May 7, the framework evolved to three distinct cohorts (Rising Stars / Community / Established). This update reflects that evolution.

The document name remains "Community Track UI Design" for now since Community is the primary v1 focus, but the design itself supports all three tracks.

## Three-track framework

**Rising Stars** — emerging academics, primary differentiated value proposition  
**Community** — practicing HCPs in regional settings, primary differentiated value proposition  
**Established** — senior recognized figures, comprehensive coverage (table stakes)

Track switch is the primary UX gate. Each track has its own filter primitives, card variants, detail page sections, score modal text, and narrative tone.

## Track switch component update

Three options, not two. Visual ordering communicates priority.

```
[ Rising Stars  |  Community  |  Established ]
```

**Default landing track:** Community (Track #1 priority).

**Visual styling:** unchanged from v1.0 spec. Pill-style toggle with orange active state and gray inactive states. Persists across navigation within session.

**Implementation:** TrackContext provider (React context) with sessionStorage backing. Three-way toggle in TrackSwitch component.

## HCP card variants — three patterns

Same shell as the existing rising-star card. Same orange left border, name + country flag + score badge layout, narrative section.

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
- VOLUME = practice volume percentile within TA + region
- SETTING = abbreviation of nppes_practice_setting (AMC, Hosp, Group, Solo)
- EXP = years_in_practice

**Established card stat pills (new):**
```
[PUBS: 234] [CITATIONS: 8.2k] [TRIALS: 12 PI]
```

Where:
- PUBS = total cumulative publication count
- CITATIONS = total cumulative citation count
- TRIALS = total trial PI roles (career)

For Established, the metrics are CUMULATIVE (the established figure's lifetime footprint), not velocity-based or current-state-based.

All three card variants reuse the same StatPillWithTooltip component. Same tooltip mechanism. Same modal pattern when score badge is tapped.

## Tooltip text per track

For PUB VEL (Rising Stars): "Publications in the last 24 months relative to peer baseline. 3.2x means three times more recent activity than typical for this career age."

For VOLUME (Community): "Practice volume percentile within the therapeutic area and region. Top 8% means this HCP treats more patients than 92% of peers in this TA in their region."

For PUBS (Established): "Total cumulative publication count from OpenAlex. Establishes the figure's research footprint over their career."

For CITATIONS (Established): "Total citations across all publications. Captures field-level recognition and influence."

For TRIALS (Established): "Total trial principal investigator roles, ever. Indicates research portfolio breadth."

## Score modal — three variants

The existing ScoreModal component opens when a user taps the score badge. Update to be track-aware.

**Rising Stars score modal:**

> Rising Star Score: 87.3
>
> This score reflects publication velocity, citation trajectory, trial activity, and career age multiplier. Higher scores indicate stronger emerging trajectory.

**Community score modal:**

> Community Score: 82.4
>
> This score reflects practice volume (40%), engagement signal (30%), practice setting (15%), career stage (10%), and publication context (5%) — weighted to identify high-impact community HCPs that traditional KOL databases consistently miss.

**Established score modal:**

> Established Score: 91.6
>
> This score reflects total publication impact, citation accumulation, trial portfolio breadth, and current institutional standing. Established figures are widely recognized across pharma; this score provides a unified view of their measurable footprint.

All three modals use the same component. Pass `track` and `score` props; component selects the appropriate template.

## Detail page — three section list variants

Each track has its own composition of sections matched to what makes sense for that cohort.

### Rising Stars detail page sections (existing, unchanged)

1. Header (name, institution, primary affiliation, score badge, country flag)
2. Why rising star (narrative)
3. Score breakdown (rising star weights)
4. Publication timeline (5-year bar chart)
5. Field validation
6. Dark Horse callout (when criteria met)

### Community detail page sections (new)

1. Header (same as Rising Stars)
2. Why this HCP (community narrative variant)
3. Practice profile (NEW)
   - Practice setting badge (large, color-coded)
   - Years in practice
   - Primary location with state and metro area
   - Practice volume percentile in TA + region
   - Top procedures from Medicare HCPCS data (top 5)
4. Engagement profile (NEW)
   - Open Payments tier badge
   - Top engagement categories
   - Manufacturer relationships (top 3-5)
   - Recent engagement trend (chart, last 4 quarters)
5. Therapeutic specialization (NEW)
   - Top conditions treated (Medicare ICD diagnoses, when available)
   - Top drugs prescribed/used (Medicare Part D, when available)
6. Score breakdown (community weights)
7. Field validation (same UX pattern as Rising Stars)
8. Publication context (smaller section: count + recent papers list, no timeline)
9. Dark Horse callout (when community criteria met)

### Established detail page sections (new)

1. Header (same)
2. About this figure (Established narrative variant — different tone, focused on prominence and contributions)
3. Career profile (NEW)
   - Current institution
   - Career age
   - Practice setting
   - Society memberships and roles (when available)
4. Research portfolio (NEW)
   - Total publication count
   - H-index or equivalent (when computable)
   - Top journals / venues
   - Top citation accruers (most-cited papers)
   - Publication timeline (lifetime, not 5-year)
5. Trial portfolio (NEW)
   - Total trial PI roles
   - Active vs completed breakdown
   - Recent / current trials list
6. Industry footprint (NEW — important for Established)
   - Engagement breadth (manufacturer count)
   - Total cumulative engagement
   - Top categories (consulting, speaking, royalty)
   - Sustained over time vs episodic
7. Score breakdown (Established weights, when methodology lands)
8. Field validation (same UX pattern as other tracks)
9. NO Dark Horse callout for Established

The Established detail page is the most "comprehensive view" — captures the full known footprint of a recognized figure rather than a discovery-oriented "why this person" framing.

## Narrative tone differences

The same UX surface uses different language per track. This is intentional — language anchors the user's mental frame.

**Rising Stars vocabulary:**
- "Rising star score"
- "Publication velocity"
- "Citation trajectory"
- "Why rising star"
- "Publication timeline"

**Community vocabulary:**
- "Community score"
- "Practice volume"
- "Engagement signal"
- "Why this HCP"
- "Practice profile"

**Established vocabulary:**
- "Established score"
- "Research portfolio"
- "Trial portfolio"
- "Industry footprint"
- "About this figure"

The shift is not just terminology — it's the framing of WHY this HCP matters. Rising stars are about emerging trajectory. Community HCPs are about current practice impact. Established figures are about cumulative recognition and footprint.

## Dark Horse extends to two tracks (not three)

Dark Horse is a cross-track status marker but only for Rising Stars and Community. Same purple visual treatment, parameterized criteria narrative.

**Rising Stars Dark Horse callout:**

> ♞ Dark Horse · top 8% of rising stars
>
> Dr. X meets all four Dark Horse criteria — composite score 85+, citation trajectory +40%, 2+ active trials, and career age under 8 years. Fewer than 1 in 12 rising stars qualify.

**Community Dark Horse callout:**

> ♞ Community Dark Horse · top 10% of community HCPs
>
> Dr. X is a Community Dark Horse — top 10% practice volume in TA and region, located outside major academic clusters, high recent therapy adoption, and demonstrated therapeutic specialization. These are the practitioners traditional KOL databases consistently miss.

**Established does NOT get a Dark Horse callout.** By definition, Established figures are not "missed" by traditional intelligence platforms. The Dark Horse concept doesn't apply to this track.

## Filter primitives — three variants

### Rising Stars track filter chips

```
[Pub velocity ▾] [Citation traj ▾] [Trial activity ▾] [Career age ▾] [Affiliation tier ▾]
```

Filter primitives:
- Pub velocity: range slider (0-10x peer baseline)
- Citation trajectory: signed range slider (-50% to +200% YoY)
- Trial activity: count threshold (1+, 2+, 3+, 5+ active trials)
- Career age: range slider (0-15 years for Rising Stars)
- Affiliation tier: multi-select (top-20 academic, top-50 academic, other academic, non-academic)

### Community track filter chips

```
[Setting ▾] [Career stage ▾] [Region ▾] [Volume ▾] [Engagement ▾]
```

Filter primitives:
- Setting: multi-select (academic_medical_center, hospital_affiliated, group_practice, solo_practice, ambiguous_group, small_group)
- Career stage: multi-select (early_career, mid_career, established)
- Region: state picker (single or multi-select)
- Volume: single-select ("top 10%", "top 25%", "top 50%" within TA + region)
- Engagement: single-select Open Payments tier (high, moderate, low, none)

### Established track filter chips

```
[Institution tier ▾] [Pub count ▾] [Recent activity ▾] [Region ▾] [Trial portfolio ▾]
```

Filter primitives:
- Institution tier: multi-select (top-10 academic, top-50 academic, other academic, non-academic)
- Pub count: range slider or threshold (100+, 200+, 500+ cumulative publications)
- Recent activity: yes/no (active in last 24 months — distinguishes still-active from semi-retired)
- Region: state picker
- Trial portfolio: count threshold (1+, 5+, 10+ trial PI roles)

## Cross-track marker

For HCPs scoring well in multiple tracks, a small visual marker indicates dual-track relevance.

Under the three-cohort framework, mutual exclusivity means most HCPs appear in exactly one track. The cross-track marker handles the rare overlap cases:

- Rising Star + Community overlap (rare — Rising Star definition includes academic focus; Community is non-academic). Possible for academics with significant clinical practice.
- Rising Star + Established overlap — IMPOSSIBLE by definition (career age disjoint)
- Community + Established overlap — possible but uncommon. A community physician with substantial publications and recognition.

Threshold for cross-track marking: composite score 80+ in the OTHER track.

Marker visual: small filled diamond (◆) in the upper-right corner of the card, near the score badge. Color: muted orange (#9E6E15).

Tap behavior: tooltip shows other-track score.

## Search behavior — across all three tracks

Single search input at the top of the screen, persistent across all three tracks.

Results show HCPs from all three tracks. Each result card indicates the HCP's track classification and score:

```
Dr. Rohit Loomba
University of California, San Diego
Established (91.6)

Dr. Sarah Smith
Banner Health, Phoenix
Community (82.3)

Dr. James Jones
Mayo Clinic
Rising Stars (78.9)
```

Tapping a card takes the user to the detail page in the HCP's primary cohort context. The current track switch state is overridden temporarily — viewing an Established HCP after searching, regardless of which track was active, takes you to the Established detail page.

After viewing, returning to the feed restores the user's previously-selected track.

## Onboarding flow

When a user first lands on FieldMark, default to Community track.

Rationale: Community is the strategic priority Track #1. Most MSL teams targeting field engagement land here.

Visual indicator that user is in Community track is clearly visible (the track switch shows Community as active). User can toggle immediately if they want.

## Mobile responsiveness

All components must work in the existing mobile-first responsive design.

Track switch:
- Sits above the TA filter row at all viewport sizes
- Three-button pill format stays consistent
- On mobile portrait, may need to use abbreviated labels ("Comm" / "Rising" / "Est") if three full labels overflow — implementation should test for this and adapt
- Touch target meets 44px minimum

Filter chips:
- Horizontal scroll on mobile if they overflow
- Same pattern for all three tracks
- Tap target maintains 44px minimum

Cards:
- Same responsive behavior as existing rising star cards
- 2-column grid on tablet+ landscape
- Single column on mobile portrait

Detail pages:
- Sections stack on mobile (existing pattern)
- 2-column layout on tablet+ landscape
- Established detail page may have more sections; mobile scrolling considerations

## Implementation phasing — updated for three-track framework

**Phase A (today/tonight): scaffolding for all three tracks.**

- TrackContext provider
- TrackSwitch component (three options)
- HCPCard stat pill variants for all three tracks (placeholder values for Community / Established)
- ScoreModal three text variants
- Defaults: Community track on session start

**Phase B (after community composite scoring v1 lands): connect Community real data.**

- Community feed fetches from hcp_community_scores table
- Community filter chips functional
- Community card stat pills wired to real data
- Community detail page sections built and populated

**Phase C (after Phase 1 publication backfill validates): Rising Stars detail page enhancements.**

- Publication timeline uses publication_authors join table
- Publication count reflects fuller bibliography for academics
- Cross-track marker computation begins

**Phase D (after Established score methodology designed and computed): connect Established real data.**

- Established feed fetches from hcp_established_scores table (new)
- Established filter chips functional
- Established card stat pills wired to real data
- Established detail page sections built and populated

**Phase E (after Dark Horse criteria computation): Dark Horse callout extends to community.**

- Community Dark Horse criteria query in scoring pipeline
- is_dark_horse boolean populated for community HCPs
- Card-level Dark Horse badge appears in both Rising Stars and Community tracks
- Established remains without Dark Horse marker

**Phase F (operational hygiene):**

- Search backend support for cross-track search
- Result merging in frontend
- Cross-track marker hookup on cards

## Open question — answered post-v1.0

The v1.0 doc raised two open questions:

1. **Soft filter vs hard mode for the track switch?** — User answered: soft filter. Same universe, track changes which signals are foregrounded.

2. **Cross-track marker approach?** — User answered: middle ground. Show in current view with marker indicating other-track relevance. Threshold 80+ in the other track.

Both confirmed in the late-session conversation.

## Document maintenance

This v1.1 update should be incorporated into the master community_track_ui_design.md document. Either:

- **Option A:** Append this update as a "v1.1 Update" section to the existing v1.0 doc
- **Option B:** Rewrite the master doc to v1.1 with this content integrated and v1.0 archived

Option A is faster. Option B produces a cleaner authoritative reference. Either is valid.
