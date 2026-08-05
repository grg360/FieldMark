# FieldMark Frontend — De-Facto Design System Audit

**Date:** 2026-08-04 · **Branch:** foundation-rebuild · **Scope:** `frontend/src/components/**` (179 `.tsx`/`.ts` files) plus the global shell (`AppLayout`, `NavBar`, `GlobalFooter`, `index.css`, `index.html`, `lib/designTokens.ts`).
**Method:** static regex extraction of every color / font / spacing declaration, plus a manual structural read of each top-level surface. Report only — nothing was modified.

**Counting caveat.** Counts come from literal inline values. Declarations routed through per-file helper constants (`const SERIF = "'Spectral', Georgia, serif"`, `mono(size, color, ls)` helpers) or the `font:` shorthand are attributed in §4/§6 by reading the files, but are undercounted in the §1–§3 tables. The real totals are higher than shown; the *shape* of the distribution is not affected.

**One orientation fact before the numbers.** `lib/designTokens.ts` exists and is imported by 70 of 179 files — but adoption is shallow: the raw constants are used heavily (`COLOR.ink*` 463×, `COLOR.amber` 83×, `FONT.sans` 75×, `FONT.mono` 67×, `FONT.serif` 55×) while the composed roles are nearly untouched (`TYPE.eyebrow` 11×, `TYPE.display` 3×, `SPACE.*` 3× total, `ELEVATION.card` 11×). Meanwhile the redesigned "frame" surfaces (Ledger, Profiles, Drugs index, Trials, Pulse, Social, Home, Forum) deliberately bypass the tokens with their own local palettes. So there are **three** layers in the codebase: pre-token hardcodes, the token layer, and post-token frame palettes.

---

## 1. COLOR

**Headline numbers.** 778 distinct color values across the component tree. **450 appear exactly once; 149 exactly twice** — 77% of all distinct values are used in at most two places. Roughly 25 values do the real work.

### 1.1 The workhorses (≥20 uses)

| Value | Uses | Files | Role / origin |
|---|---|---|---|
| `#6b6a65` | 275 | 69 | legacy muted-grey text. Top files: DetailScreen ×21, LandscapeScreen ×18, InsightComposer ×11, NoteEntryScreen ×10, ActionTray ×9 |
| `#1e1e22` | 174 | 53 | legacy border/surface (cool near-black). DetailScreen ×18, InsightComposer ×10, ScientificNarrativeSection ×8, ScoringExplainedModal ×8 |
| `#e8a020` | 157 raw + 83 as `COLOR.amber` | 53 + | **token amber** — the one accent both generations share. LandscapeScreen ×14, HCPCard ×10, ProfileScreen ×8 |
| `#e8e6df` | 153 | 66 | legacy primary text (parchment). InsightComposer ×11, DetailScreen ×7, WelcomeWizard ×7 |
| `#9b9892` | 128 | 54 | legacy secondary text. InsightComposer ×9, TrackedHcpsList ×8, HCPCard ×7 |
| `#9b6dff` | 82 | 30 | **saturated purple — off-token** (token violet is `#8B78E8`, used 0× raw). HCPCard ×8, ScientificNarrativeSection ×8, CoverageGapsTile ×8, TelescopeLegend ×6 |
| `#0a0a0b` | 66 | 38 | legacy page ground (vs token `ground #0a0a0a`) |
| `#ffffff` | 54 | 20 | raw white (plus `#fff` ×1 in FieldIntelligenceShared) |
| `#0d0d10` | 46 | 23 | legacy card surface (vs token `surfaceWell #0d0c0b`) |
| `#3fb8af` | 33 | 22 | **saturated teal — off-token.** HCPCard ×6, LandscapeQuadrantChart ×3, spread thin across 22 files |
| `rgba(255,255,255,0.08)` | 28 | 16 | ad-hoc hairline (token hairlines are 0.045 and 0.10) |
| `#111113` | 23 | 16 | another legacy surface black |
| `#3a3a3f` | 22 | 13 | legacy border grey |
| `#b8b4ac` | 22 | 9 | legacy mid text. ScoringExplainedModal ×8 |
| `#1d9e75` | 20 | 7 | saturated green — off-token (token `estGreen #5FA97E` appears 3× raw) |

### 1.2 Two neutral ramps coexist

- **Legacy ramp** (dominant by raw count): ground `#0a0a0b` → surfaces `#0d0d10`, `#111113`, `#1e1e22` → borders `#2a2a30`, `#3a3a3f` → text `#6b6a65`, `#9b9892`, `#b8b4ac`, `#e8e6df`. Cool-neutral, slightly blue.
- **Token ramp** (designTokens.ts, warm): ground `#0a0a0a` → `#0d0c0b`, `#161515`, `#1b1915` → ink `#57534b`, `#77736b`, `#928e86`, `#c7c3ba`, `#f4f2ec`. Reached mostly via `COLOR.*` (463 `COLOR.ink*` references), rarely hardcoded.

The two ramps are close enough to look identical in screenshots and far enough to never be interchangeable in code.

### 1.3 The accent census

| Family | Values in use | Notes |
|---|---|---|
| **Amber/gold** | token `#e8a020` (157 raw + 83 token refs) · frame golds `#e0a75e` (ledger/profiles), `#c9903c` (drugs index), `#c8892e` (trials), `#c9a35c` (institutions), `#d69a3c`/`#d99a3c` (practice profile / insights), `#d8a949`/`#d8a34a`/`#d8a94b` (social/pubs/people-strip), `#c9a25f`/`#c9a45e`/`#c9a55f` (home/week/pulse), `#c9962f`, `#c9973f`, `#c98d33`, `#be914d`, `#b98f45`, `#e0a544`, `#e0a94a`, `#e0aa4a`, `#e0b063`, `#ffd89b` (skyview) | **~24 distinct golds.** Each frame surface minted its own; most appear 1–2× each. See §5. |
| Purple | `#9b6dff` (82) · token `#8B78E8` (0 raw) · `#8a7fb8`, `#c3a9ff` | the 82-use purple is not the token |
| Teal | `#3fb8af` (33) · `#4ecdc4` (12) · `#7fb3bb` (5) · `#7fb1b5` (1) | all off-token |
| Green | `#1d9e75` (20) · `#5a9b7f` (8) · token `#5fa97e` (3) · `#4e9e6a`, `#57a878`, `#6e8f76` (sage) | six greens for one semantic job |
| Blue | `#6ba3d8` (12, Social) · `#4a90e2` (8, insights tiles) · `#7b9ebd` (6) · `#5b8dd9`/`#5b8fd6` · token indigo `#5566e8` family (forum/congress) | |
| Red | `#e84545` (12) · token `danger #e8704e` (7) · `#ef4444` (2, DOLListingModal) · `#b8574a`, `#d85a30` (filters) | |
| Yellow | `#ffd700` (17 — TelescopeLegend ×8, SearchBar ×3) | pure gold-yellow, nowhere near the amber family |

### 1.4 White-alpha hairlines — thirteen steps for two jobs

`rgba(255,255,255,X)` appears at alphas **0.03, 0.04, 0.045, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.12, 0.14** (plus `.06`/`0.06`-style string twins). The token file defines exactly two: `hair` 0.045 and `hairStrong` 0.10. Everything else is drift around them.

Two parallel parchment-alpha families do the same job in light-on-dark text: `rgba(232,230,223,0.3…1)` (~8 steps, forms/drawers/telescope) and `rgba(237,234,227,.18….3)` (8 steps, **all inside LinkedInAuthScreen.tsx**).

### 1.5 Near-identical clusters (accidental drift)

The clustering pass (channel distance ≤10) found 34 clusters. The two big ones first:

- **The dark continuum.** ~230 distinct values from `#02030a` to `#7f857f` form one connected chain — every value is within ~10 RGB points of a neighbour. There is no discrete dark scale; each surface minted its own blacks (`#08090a` ledger, `#0a0b0b` practice, `#0b0a09` trials/week, `#0a0a09` drugs, `#0c0c0b` home, `#0e1013` profile cards, `#0e0e11` institutions bands, `#101317` pulse, `#0a0c0e` forum…). Same story at every step up the ramp.
- **The parchment continuum.** ~36 off-whites from `#dad7cf` to `#f6f2e8` — `#e8e6df` (153×) surrounded by `#e6e3da`, `#e9e6df`, `#ede8dd`, `#ece7dd`, `#f0ebe1`, `#f2f0ea`, `#f4f2ec` (the token ink1!), each surface's own white.

Smaller clusters worth acting on (full membership in Appendix A):

| Cluster | Members (uses) | Verdict |
|---|---|---|
| Frame gold #1 | `#c8892e` (1, Trials) · `#c98d33` (1, Ledger) · `#c9903c` (1, Drugs) · `#c9962f` (1, Social) · `#c9973f` (1, Forum) | five surfaces, five hexes, one intended color — the exact drift the audit was looking for |
| Frame gold #2 | `#c9a25f` (1, Home) · `#c9a35c` (2, Institutions) · `#c9a45e` (1, Week) · `#c9a55f` (1, Pulse) | same again, lighter register |
| Frame gold #3 | `#d8a34a` (2) · `#d8a949` (1) · `#d8a94b` (1) · `#e0a544` (1) · `#e0a94a` (1) · `#e0aa4a` (1) | same again |
| Amber-dim | `#e0a75e` (4) vs `#e0b063` (1, Forum) | |
| Practice gold | `#d69a3c` (2) vs `#d99a3c` (2) | one digit apart, four files |
| Reds | `#e84545` (12) vs `#ef4444` (2) | DOLListingModal drifted |
| White | `#fff` (1) vs `#ffffff` (54) | spelling |
| Muted grey | `#8f8b83` (16) vs `#8a8884` (8) vs `#928e86` (6, = token ink3) + 12 one-off neighbours | |
| Text grey | `#b8b4ac` (22) vs `#b6b2aa` (4) vs `#bdb9b0` (6, = TYPE.bodyProse color) + ~14 one-offs | |
| Sage/green chips | `#8caf94` / `#8fa38c` / `#8fa88c` — three files, three hexes | |
| Steel blues | `#8aa0ac` / `#8f96ab` / `#8fa3ab` / `#93a9ad` / `#98a0a8` / `#9aa0a8` / `#9aa1a9` | one per surface |
| Salmon | `#e79880` (LinkedInAuth) vs `#f0997b` (FilterDrawer) | |
| Blue-links | `#5b8dd9` (Practice) vs `#5b8fd6` (Community) | sibling profiles, one digit apart |

**Tailwind arbitrary values:** none found — the codebase is inline-style, not Tailwind.

---

## 2. TYPOGRAPHY

### 2.1 Font families actually in use

**Serif — four different families:**

| Family | Where | How declared |
|---|---|---|
| **Source Serif 4** | Ledger, all three Profile variants, Drugs index, Trials, Pulse, Forum index (+1 raw use in InsightComposer) | per-file `SERIF` consts / `serif()` helpers |
| **IBM Plex Serif** (`FONT.serif`, 55 refs in 18 files) | Institutions (both routes), Congress (both pages), ThreadPage, DetailScreen, HCPCard, ScientificNarrativeSection, Assets/RightRail, PulseSynthesis, PublicationCard, fiUi | design token |
| **Spectral** | HomePage, PublicConversation (Social), AdministeredVolumeBlock | per-file consts / `font:` shorthand |
| **Newsreader** | LinkedInAuthScreen, PeopleNavStrip, TheWeekPage | per-file consts |

All four are loaded in `index.html` from Google Fonts. Nothing else loads a serif. **Spectral is not "the" serif** — it is on two surfaces; Source Serif 4 is the majority frame serif and IBM Plex Serif is the token serif.

**Mono — one family, seven spellings:** `'IBM Plex Mono', ui-monospace, monospace` (7) · `'IBM Plex Mono',ui-monospace,monospace` (3) · `'IBM Plex Mono', monospace` (1) · `'IBM Plex Mono',monospace` (1) · bare `monospace` (58 uses in 22 files — DetailScreen ×11, LandscapeScreen ×9, HCPCard ×8) · `ui-monospace, SFMono-Regular, Menlo, …` (1, ScoringExplainedModal) · `'JetBrains Mono','IBM Plex Mono',…` (PracticeFirstProfile only). Plus `FONT.mono` (67 refs in 19 files).

**Sans:** `FONT.sans` / raw IBM Plex Sans stacks (75 token refs + 30 raw) — the AppLayout default, so "no fontFamily" resolves to IBM Plex Sans. But 122 declarations **explicitly override back to system fonts**: `system-ui, sans-serif` (64 in 28 files), `system-ui, -apple-system, sans-serif` (57 in 29 files), `system-ui` (1). This override is the single clearest legacy tell (see §6). `Inter` appears **nowhere** in the codebase. One `'IBM Plex Sans Condensed'` (CohortLedger rank numerals). One `Jost` (TelescopeField — the entire Skyview surface).

**Neither serif nor mono (system-ui voice):** the DOL modals, FilterDrawer/FilterButton, SocialTrackEmpty, FieldIntelligenceShared, InsightComposer/FollowUps family, SearchScreen, StatusEditor, WelcomeWizard, SignupScreen, ActionTray, TelescopeLegend, OpportunityCard — the legacy set.

### 2.2 Sizes

1,271 `fontSize` declarations captured. **The platform is an 10–13px UI:** `11` (245), `12` (240), `13` (233), `10` (125) — those four are 66% of all declarations. Then `14` (88), `15` (37), `9` (36), `16` (31), `18` (28), `20` (11), `22` (10). Display sizes are one-offs per surface: 24, 26, 27, 28, 30, 34, 36, 38, 40, 42, 44, 46, 48, 52, 88 (SignupScreen), `clamp(48px…)` (LinkedInAuth).

**Fractional sizes are a de-facto convention, not noise:** `12.5` (29 uses, 15 files), `9.5` (16 — PeopleNavStrip ×11), `14.5` (12), `13.5` (11), `11.5` (8), `15.5` (6), `10.5` (3), `16.5` (2), `17.5` (1), `8.5` (2). A full half-step scale has grown beside the integer one.

### 2.3 Weights

`600` (206) and `500` (168) carry the UI; `700` (16), `400` (9 explicit + the browser default everywhere else), `300` (3 — Institutions hero + Spectral home title), `200` (3 — LinkedInAuthScreen only).

### 2.4 Letter-spacing

62 distinct values. The eyebrow/mono-caps registers dominate: `0.06em` (45), `0.14em`+`.14em` (36+43 = **79**), `0.1em`+`.1em` (32+39 = **71**), `0.16em`+`.16em` (34+13), `0.18em`+`.18em` (34+12), `0.12em`+`.12em` (27+19), `0.08em`+`.08em` (25+25), `0.04em`+`.04em` (24+22), `0.02em`/`.02em` (10+17), `0.2em`/`.2em` (10+7), `0.22em`/`.22em` (1+8). Negative tracking on display type: `-0.01em` (18), `-0.02em` (7), `-0.015em`/`-.015em` (2+4).

Note the systematic **string-twin problem**: nearly every value exists in both `.14em` and `0.14em` spellings (leading-zero vs not), so any grep for one form finds half the uses. Extremes: LinkedInAuthScreen goes to `.34em`; TelescopeField to `0.42em`; three files use unitless numbers (`0.2`, `0.3`, `0.5` → px) and TelescopeDrawer uses `0.5px`.

### 2.5 Combinations (family × size × weight × tracking, ≥10 uses)

`(inherit)` = no fontFamily in the style object → resolves to the surface's container font (IBM Plex Sans under AppLayout, mono/serif inside the frame surfaces).

| Family | Size | Weight | Tracking | Uses |
|---|---|---|---|---|
| (inherit) | 12 | default | — | 133 |
| (inherit) | 13 | default | — | 129 |
| (inherit) | 11 | default | — | 116 |
| (inherit) | 14 | default | — | 33 |
| (inherit) | 10 | default | — | 24 |
| mono stack | 12 | default | — | 21 |
| (inherit) | 12.5 | default | — | 21 |
| `inherit` (explicit) | 13 | default | — | 20 |
| system-ui | 12 | default | — | 17 |
| FONT.mono | 11 | default | — | 15 |
| (inherit) | 13 | 500 | — | 14 |
| (inherit) | 18 | default | — | 13 |
| system-ui | 13 | default | — | 12 |
| (inherit) | 16 | 500 | — | 12 |
| FONT.sans / (inherit) | 11 | 600 | 0.18em | 11+11 — this is `TYPE.eyebrow`, half the time re-typed by hand |
| (inherit) | 11 | default | 0.06em | 10 |
| mono stack | 11 | default | — | 10 |
| FONT.serif | 15 | default | — | 10 |

318 distinct combinations in total; 254 of them appear fewer than 5 times.

---

## 3. SPACING

739 distinct property:value pairs; 564 distinct bare values (most compound paddings are one-offs).

### 3.1 Gap (the healthiest area)

`8` (164), `10` (127), `6` (120), `12` (119), `4` (61), `14` (60), **`9` (48)**, `16` (45), **`7` (42)**, `20` (26), `24` (25), `5` (23), `2` (22), `1` (21), `18`/`3`/`11` (13 each). The 4-px grid holds for the big numbers, but the odd values 9, 7, 5, 11 total 126 uses across ~60 files — a parallel "odd-pixel" register, not an accident in any single file.

### 3.2 Margins

`marginBottom`: 12 (86), 8 (85), 16 (46), 4 (45), 6 (41), 10 (34), 14 (34), 20 (17), 24 (16), plus 7 (11), 9 (6), 5 (6). `marginTop`: 8 (64), 12 (60), 4 (43), 6/16 (32), 14 (29), 2 (26), 10 (26), plus 5 (12), 9 (11), 11 (10), 3 (8), 7 (7). `margin: 0` (56), `margin: 0 auto` (30 — the centering idiom), `margin: 0 0 16px 0` (9).

### 3.3 Padding

Uniform: `0` (69), `16` (25), `12` (25), `4` (17), `24` (13), `20` (11). Two-value chip/button paddings are where combinations explode: `3px 8px` (26), `10px 12px` (26), `8px 12px` (20), `2px 6px` (18), `8px 14px` (16), `4px 8px` (15), `3px 7px` (14), `6px 10px` (14), `6px 12px` (13), `16px 18px` (13), `8px 10px` (12)… — **28 distinct chip-scale paddings** with ≥5 uses each, and a long tail of ~400 one-off compound values. `SPACE.*` tokens: 3 uses total in the whole tree.

Full inventory in Appendix B.

---

## 4. STRUCTURAL PATTERNS

Two shells exist:
- **`AppLayout`** (`AppLayout.tsx:36-57`): `COLOR.ground #0a0a0a`, `FONT.sans` default, NavBar on top, content clamped to `CONTENT_WIDTH` (`reading` 880 / `standard` 1120 / `wide` 1440), 16px side padding, **`GlobalFooter` always appended**.
- **Self-contained frame surfaces**: own `<div background:#08-#0b… minHeight:100vh>` + NavBar + own `maxWidth:1440` wrapper, own fonts, usually **no footer**.

`GlobalFooter` (`GlobalFooter.tsx`): `<footer>` with `borderTop 1px COLOR.hairStrong`, FIELDMARK wordmark in amber 14px/500/0.09em, "verified MSL use" line, © Bessel Analytics, About·Methodology·Privacy; responsive via `matchMedia(640px)`.

| Surface | Page header | Footer | Band/section device | Container / max-width | Mobile mechanism |
|---|---|---|---|---|---|
| **People/ledger** `CohortLedger` | no page title; card header w/ 3px cohort marker + mono-caps tag + mono meta (`:784`) | **none** | yes — `BandHeader` mono-caps 9.5px `.16em` + hairline rule; column heads | own frame `#08090A`, **1440** | local `useIsMobile` (767) + `MobileRow` |
| **Profile** `HcpProfileBrief` | bordered card, 3px sage edge, mono 34px index numeral + serif 24px name | **none** | sage tick + mono-caps `SectionHead` | own frame `#08090A`, **1440** | `useIsDesktop` |
| **Profile** `CommunityHcpProfile` | 3-cell card, 3px rose edge, serif 31px name, hairline mono-caps chips | **none** | rose glyph `SectionHead` | same shell, **1440** | none — flex-wrap only |
| **Profile** `PracticeFirstProfile` | 3-cell, serif 34px name, blue/amber chips | **none** | ◆ amber `SectionTag` mono 9px `.2em` | own frame `#0a0b0b`, **1440**, JetBrains Mono | none — flex-wrap only |
| **Profile (old)** `DetailScreen` | **unrouted** — `App.tsx:1239-1242`: "DetailScreen / HCPDetailRoute are DISCONNECTED — retained in the codebase, unrouted, for recovery" | GlobalFooter (direct) | partial | own scroll screen | window-width checks |
| **Drugs** `AssetsIndexPage` | eyebrow `.24em` + serif 30px H1 + serif dek | **own** mono footer row (`:290`) | yes — `SECTION 01/02/03` gold-tick device | own frame `#0a0a09`, **full-bleed, 34px gutters, desktop minWidth 1120** | `useMediaQuery` (767) |
| **Drugs** `AssetPage` | mono eyebrow + **sans 40px** H1 | none | ruled full-width bands, mono-caps eyebrows | token shell `#0a0a0a`, **1440** | `useMediaQuery` (767) + `MobileSection` |
| **Trials** `TrialsPage` | mono kicker `.18em` + serif 27px title + amber-dim mono subtitle + stat readout | **own** mono bar (`:271`) *and* GlobalFooter via AppLayout | yes — 104px label-cell bands (TERRITORY / PHASE / STATUS) | `AppLayout wide` (1440) + inner board `#0b0a09` | `useMediaQuery` (767) + `MobileBoard` |
| **Congresses** Calendar / Detail | mono-caps kicker + **sans 19–34px** titles + serif society line | GlobalFooter via AppLayout | group headers / eyebrow blocks, no numbered bands | `AppLayout standard` (**1120**) | `useMediaQuery` (**640**) |
| **Institutions** Index / Record | 2px amber left-edge block; serif (Plex) 38px hero name; mono-caps eyebrows | **GlobalFooter** (direct) | yes — `BandHeader` `#0e0e11` bands, BAND A–D, cohort bands | own frame `#0a0a0b`, **1440** | `useMediaQuery` (767) |
| **Intelligence** ForumIndex | masthead: mono kicker `.2em` gold + **Source Serif 46px** title + stat columns | **own `ForumFooter` + GlobalFooter = double footer** | yes — DisclosureBand, gold ticks, numbered steps 01–03 | `AppLayout wide` + panel `#0a0c0e` | `useMediaQuery` (900) |
| **Intelligence** ThreadPage | no masthead; indigo-edged anchor card, Plex Serif 27px question | GlobalFooter via AppLayout | none — reading column of rounded cards | `AppLayout reading` (**880**) | `useMediaQuery` |
| **Social** `PublicConversation` | title band: gold `PUB` chip + Spectral 19px title + mono provenance line | GlobalFooter via AppLayout; own mono paging strip | yes — full-width bands (honesty panel, GroupHead A/B bronze `.18em`) | `AppLayout wide` + panel `#0f0e0d` | `useMediaQuery` (767) passed as prop |
| **Pulse** `PulsePage` | masthead: mono eyebrow `.28em` + **Source Serif 52px** TA title + stat blocks | GlobalFooter via AppLayout | yes — the reference: gold-tick `PanelHeader`, `SectionBand`, methodology 01–06 | `AppLayout wide` + panel `#0e1013`, desktop padding 44/64 | `useMediaQuery` (**900**) + Mobile components |
| **Skyview** `TelescopeField` | none — floating title over full-bleed SVG sky | GlobalFooter rendered but covered | **none** — free-camera canvas | inside FeedLayout (880 col) but escapes full-bleed; world 3400×1900 | `ResizeObserver` + `box.w<760`; desktop-only gate at 767 |
| **Home** `HomePage` | territory band + `Good morning` **Spectral 300 44px** + mono metric blocks | GlobalFooter via AppLayout | yes — green-tick bands, `SectionHead`, BAND A/B, numbered 01–03 actions | `AppLayout standard` (**1120**) + panel `#0c0c0b` | `useIsDesktop` |
| **Feed** `/` (`FeedLayout` in DashboardTabs) | NavBar + PeopleNavStrip (Newsreader serif register) + DOLHeroPanel | GlobalFooter | none — card grid | `.fm-screen` maxWidth **880**, `system-ui` | `useMediaQuery` (767) |

Structural inconsistencies in one place: **six container regimes** (1440 token-wide, 1120 standard, 880 reading, full-bleed+34px gutters, 880 feed column, full-bleed sky); **four footer states** (none / GlobalFooter / own / double); **six mobile mechanisms** (`useMediaQuery` at 640, 767 and 900 breakpoints, local `useIsMobile`, `useIsDesktop`, `ResizeObserver`, bare `matchMedia`, and flex-wrap-only).

---

## 5. THE OUTLIERS (drift points — cheapest fixes)

Value used in 1–2 places while a near-identical twin is used in many:

1. **The five one-use golds** `#c98d33`, `#c9903c`, `#c9962f`, `#c9973f`, `#c8892e` — one per frame surface (Ledger, Drugs, Social, Forum, Trials), all within a few RGB points of each other, none equal to token amber `#e8a020` (240 combined uses). Same for the `#c9a2xx` quartet (Home/Institutions/Week/Pulse) and the `#d8a9xx` trio.
2. `#d69a3c` vs `#d99a3c` — the Practice/Community profiles vs the Insights pair, one digit apart.
3. `#ef4444` (2×, DOLListingModal) vs `#e84545` (12×) vs token `danger #e8704e` (7×).
4. `#fff` (1×, FieldIntelligenceShared) vs `#ffffff` (54×).
5. `#5b8dd9` (PracticeFirstProfile) vs `#5b8fd6` (CommunityHcpProfile) — sibling files, sibling hexes.
6. Sage chips `#8caf94` / `#8fa38c` / `#8fa88c` — three files, three spellings of one green.
7. `rgba(255,255,255,0.09)` (2×) and `0.07` (6×) and `0.03/0.04/0.05/0.06` (~30 combined) vs the token hairlines `0.045` / `0.10`.
8. The `rgba(237,234,227,…)` alpha family — 8 steps, ~70 uses, **entirely inside LinkedInAuthScreen.tsx**; the rest of the app uses `rgba(232,230,223,…)` for the same job.
9. **Fonts:** `Jost` (TelescopeField only); `'Source Serif 4',Georgia,serif` as a raw string in InsightComposer (1×) while every other user goes through a const; `'JetBrains Mono'` (PracticeFirstProfile only); the SFMono/Menlo stack (ScoringExplainedModal only); `'IBM Plex Sans Condensed'` (CohortLedger only). **Newsreader** is a 3-file family (LinkedInAuth, PeopleNavStrip, TheWeek). `index.html` downloads five font families; on most routes at least two are unused.
10. **Weights** `200` (LinkedInAuthScreen only) and `300` (Institutions + Home Spectral title only).
11. **Letter-spacing string twins** — `.14em` (43) vs `0.14em` (36) and the same split at every step; unitless `0.2/0.3/0.5` (px semantics, 3 files) and `0.5px` (TelescopeDrawer) vs the em convention everywhere else.
12. **Font sizes** `8.5`, `16.5`, `17.5` (1–2 uses) beside the established half-step sizes `9.5/12.5/13.5/14.5`; `11px`-as-string (5×, LandscapeScreen) vs numeric `11` (245×).
13. **Spacing** `marginTop: 9` (11×) and `11` (10×) and `gap: 9` (48×)/`7` (42×) — an odd-pixel register that is systemic; but `padding: 3px 7px` (14×) vs `3px 8px` (26×) and `2px 7px` (6×) vs `2px 6px` (18×) are chip paddings one pixel apart.
14. **Double footer** on `/field-intelligence` (own `ForumFooter` + AppLayout's GlobalFooter); Trials similarly renders its own footer bar inside AppLayout which then appends GlobalFooter.
15. **Congress mobile breakpoint 640** vs the platform's 767 (and Forum/Pulse at 900).
16. **Dead-in-tree** (their values pollute every census including this one) — verified by full import-graph trace 2026-08-05, 49 files in seven clusters: the `DetailScreen.tsx` subtree — DetailScreen plus `ScoreBreakdownV3`/`Rising`/`Community`, `ScoreKpiTile`, `ScientificNarrativeSection`, `EvidenceDrawer`, `BeliefClaimReactionPanel`, `TopPharmaCompanies`, `DrugConstellation`, root `Sparkline.tsx`, `UserMenu` (`App.tsx:1239-1242` marks DetailScreen/HCPDetailRoute DISCONNECTED; the second mount path, `CityFeedScreen`, hangs on a `feedOverlay` state machine that can never leave `null` — see §7 trace notes); the detail-flow screens `CityFeedScreen`, `NoteEntryScreen`, `BibliographyScreen`; the `ResearchThemesSection` pair (`ThemeReactionPanel`, `ResearchThemeChip`); the legacy Social cluster `SocialTrackEmpty`/`SocialCard`/`SocialAnalyticsBanner`/`RisingVoicesChart`/`SuggestHashtagModal` (zero importers); all `HomePage/*` tiles except the two invite components (`HomeHero`, `HomeTile`, `HomeNavigationRow`, `CoverageGapsTile`, `YourInstitutionsTile`, `RecentInsightsTile`, `TeamIntelligenceTile`, `NextActionsTile`, `OpenFollowUpsTile`, `OverdueFollowUpsTile`, `RecentActivityTile`, `RecentBriefsTile`, `StartHereCard`, `WelcomeShareBanner`, `InviteModal`); the old Telescope trio (`Telescope`, `TelescopeDrawer`, `TelescopeLegend`, replaced by TelescopeField) + `TopBar`; and the pre-redesign Pulse set (`PulseSynthesis`, `PulseHeader`, `PulseCaveats`, `PulseConfidence`, `PulseEvents`, `ThemeList`, `Pulse/Sparkline` — zero importers; the live PulsePage mounts none of them). **Correction to an earlier draft: `StatPillWithTooltip` is NOT dead** — it is imported by the live `HCPCard.tsx:11`. Note DetailScreen alone accounts for the single largest share of the legacy color census (§1.1).

---

## 6. GENERATION SPLIT

Primary tell = font family. Refined for this codebase: **`Inter` appears nowhere.** The legacy generation's tell is an explicit `system-ui` stack (overriding the Plex default) plus the cool grey ramp (`#6b6a65`/`#9b9892`/`#e8e6df`/`#1e1e22`) plus rounded cards, shadows and saturated cool accents (`#9b6dff`, `#3fb8af`, `#4a90e2`, `#1d9e75`, `#e84545`, `#ffd700`). The current generation's tell is a serif (Source Serif 4 / Spectral / Plex Serif) + IBM Plex Mono frame, mono-caps eyebrow labels at `.1em+`, a warm gold accent, hairline rules, band/section devices, near-zero radii.

### Current register — 9 of 11 surfaces
| Surface | Serif tell |
|---|---|
| People/ledger (`CohortLedger`) | Source Serif 4 + Plex Mono |
| Profile (`HcpProfileBrief`, `CommunityHcpProfile`, `PracticeFirstProfile`) | Source Serif 4 + mono frames |
| Drugs — index (`AssetsIndexPage`) | Source Serif 4 |
| Trials | Source Serif 4 |
| Institutions (both routes) | IBM Plex Serif (token serif, but full current structure) |
| Intelligence — index (`ForumIndexPage`) | Source Serif 4 |
| Social (`PublicConversation`) | Spectral |
| Pulse | Source Serif 4 — the reference implementation |
| Home (`HomePage`) | Spectral |

### Mixed / bespoke — the reconcile list
| Surface | Situation |
|---|---|
| **Drugs — `AssetPage`** | current structure (mono eyebrows, amber, ruled bands) but **IBM Plex Sans 40px H1**, no serif, token palette — the "sans cousin" |
| **Congresses** (both pages) | current scaffolding, but sans titles, token amber + **indigo** secondary, rounded tinted panels, and the odd 640px breakpoint |
| **Intelligence** as a whole | index is current; **ThreadPage is legacy-token** (Plex Sans/Serif, indigo pills, rounded cards, 880 column) |
| **Feed `/`** | current-register PeopleNavStrip/DOLHeroPanel above a **legacy HCPCard grid** with a green monospace load-more button |
| `DetailScreen` (old established profile) | mixed in-page, but **disconnected/unrouted** (`App.tsx:1242`) — a recovery artifact, not a live surface |
| **Skyview** (`TelescopeField`) | bespoke third register: **Jost** sans, full-bleed sky, no bands; shares only the dark ground and a warm gold `#ffd89b` |

### Legacy register — no top-level surface is purely legacy, but the legacy generation survives in the secondary surfaces
By font (`system-ui` override) and palette, still **live**: `ProfileScreen` (/me/settings), `WatchlistsPage` + TrackedHcpsList family, `FollowUpsPage` family, `FieldInsightsScreen` + the FieldInsights composer/cards (`#4a90e2`/`#5a9b7f`/`#9b6dff`/`#3fb8af`), `SearchScreen`, `LandscapeScreen`/`LandscapeRoute`, `WelcomeWizard`, `SignupScreen`, `ScoringExplainedModal`, the DOL modals, `FieldIntelligenceShared` (toasts/modals), `ActionTray`, `FilterDrawer`/`FilterButton`, `HCPCard`, `SnoozePicker`, `AddToWatchlistPopover`, `RelationshipSection/*`. Also **dead but still in-tree** and dominating the raw counts: `DetailScreen` and its subtree (see §5.16). The 275-use `#6b6a65` census in §1 is effectively a map of this generation, live and dead together.

(`LinkedInAuthScreen`, `PeopleNavStrip`, `TheWeekPage` form a small third cohort — the **Newsreader register** — visually current but on a different serif than everything else.)

---

## 7. MIXED-GENERATION PAGES

Every top-level surface's import tree was walked and each mounted child classified by font family, border-radius, and palette. Two structural facts reshape the premise before the list:

1. **The established profile has already been reconciled.** `ProfileDispatch` routes only to `HcpProfileBrief` (academic spine) or `CommunityHcpProfile` (community spine) — never to `DetailScreen`, which is disconnected (`App.tsx:1239-1242`). On the live academic spine, the RELATIONSHIP block is the **current-register** `Profile/ProfileRelationshipControls.tsx` + `Profile/ProfileSecondaryControls.tsx` (IBM Plex Mono, radius 2). The legacy relationship block (`RelationshipSection/*` — system-ui, radius 3–6, `#9b6dff`/`#3fb8af`) survives **on the community and practice spines**, not the established one.
2. **The live HomePage mounts none of the `HomePage/*` tiles.** The legacy tile set is dead-in-tree — except `InviteEmailForm`/`InviteShareCard`, which ride on the global NavBar invite dialog and therefore appear on *every* surface.

### Per-surface findings

| Surface (register from §6) | Cross-generation children live-mounted |
|---|---|
| People/ledger (current) | none — clean. Mounts only NavBar/PeopleNavStrip/SearchBar |
| Profile — `HcpProfileBrief` (current) | **`FieldInsights/*`** (FieldInsights, InsightCard, InsightComposer, InsightComposerModal, InsightThread) — system-ui root, radius 3–6, `#4a90e2`/`#5a9b7f`/`#9b6dff`/`#3fb8af`, legacy grey ramp |
| Profile — `CommunityHcpProfile` (current) | **`RelationshipSection/*`** (RelationshipSection, FollowUpsList, FollowUpItem, StatusEditor), **`FieldInsights/*`**, **`FieldIntelligenceShared`** (FiChip/FiModal/FiToast), **`ContextualizeHCPForm`**, **`OptOutRequestForm`**, **`AddToWatchlistPopover`** — all system-ui, rounded, off-palette |
| Profile — `PracticeFirstProfile` (current) | same six-component legacy set as CommunityHcpProfile |
| Drugs — index + AssetPage | none — CompositionChart/LandingNow/RightRail are all current. Clean |
| Trials (current) | none — clean |
| Congresses (mixed at page level) | no legacy children; the mixing is in the pages themselves (§6) |
| Institutions (current) | no legacy children; **palette drift only** — `#9b6dff` as the rising accent in `InstitutionsInTerritoryPanel` and `InstitutionResearchThemesPanel` (token violet is `#8B78E8`) |
| Intelligence (mixed) | forum children (`Composer`, `DiscussAffordance`, `fiUi`) are **current**, contrary to suspicion; `FieldIntelligenceShared` is *not* imported here. The mixing is ThreadPage itself (§6) |
| Social — `PublicConversation` (current) | none — the legacy Social cluster (SocialCard, SocialAnalyticsBanner, RisingVoicesChart, SuggestHashtagModal, SocialTrackEmpty) is dead-in-tree, not mounted |
| Pulse (current) | none — clean |
| Skyview (bespoke) | n/a — intentionally its own register; not a rebuild target |
| Home (current) | none of its own; but the **NavBar invite dialog** (`InviteEmailForm`, `InviteShareCard` — system-ui/monospace, `#f87171`) overlays this and every surface |
| Feed `/` (legacy container) | inverted case: a legacy host (`fontFamily: system-ui` on the container) mounting **current** chrome (NavBar, PeopleNavStrip, DOLHeroPanel header register) above legacy `HCPCard` grid, `ActionTray`, `FilterDrawer`, `ActiveFilterPills`, `CommunityExplorer`, `ScoringExplainedModal` |

### The rebuild list

Old-generation components **live-mounted inside current-generation hosts** — these, not the pages, are the units of work:

| # | Component | Live host(s) | Evidence |
|---|---|---|---|
| 1–4 | `RelationshipSection/RelationshipSection.tsx`, `FollowUpsList.tsx`, `FollowUpItem.tsx`, `StatusEditor.tsx` | CommunityHcpProfile, PracticeFirstProfile | system-ui; radius 3/4/6 + `50%` pills; `#9b6dff`/`#3fb8af`; `#0d0d10`/`#1e1e22` ramp. A current-register replacement already exists on the academic spine (`ProfileRelationshipControls`) |
| 5–9 | `FieldInsights/FieldInsights.tsx`, `InsightCard.tsx`, `InsightComposer.tsx`, `InsightComposerModal.tsx`, `InsightThread.tsx` | HcpProfileBrief, CommunityHcpProfile, PracticeFirstProfile (+ `FieldInsightsScreen` route) | system-ui roots; `#4a90e2`/`#5a9b7f`/`#9b6dff`/`#3fb8af`; InsightComposer mixes Source Serif 4 into a system-ui shell |
| 10 | `FieldIntelligenceShared.tsx` (FiChip/FiModal/FiToast) | CommunityHcpProfile, PracticeFirstProfile, FeedLayout global toast | `system-ui, sans-serif`, radius 4, `50%` |
| 11 | `ContextualizeHCPForm.tsx` | CommunityHcpProfile, PracticeFirstProfile | `system-ui, sans-serif`, radius 4 |
| 12 | `OptOutRequestForm.tsx` | CommunityHcpProfile, PracticeFirstProfile | `system-ui, -apple-system` |
| 13 | `AddToWatchlistPopover.tsx` | CommunityHcpProfile, PracticeFirstProfile | system-ui, off-palette, legacy ramp |
| 14 | `HCPCard.tsx` | Feed `/`, CityFeedScreen, SearchScreen | system-ui/bare `monospace`; `#9b6dff`, `#4ecdc4`, `#ffd700` |
| 15 | `ActionTray.tsx` | Feed `/` | `system-ui, sans-serif` |
| 16 | `FilterDrawer.tsx` | Feed `/` | system-ui ×8, legacy ramp, `#f0997b` |
| 17 | `ActiveFilterPills.tsx` | Feed `/` | `system-ui, sans-serif` |
| 18 | `DOLHeroPanel.tsx` | Feed `/` | system-ui + bare `monospace` |
| 19 | `CommunityExplorer.tsx` | Feed `/` (AD community track) | `system-ui, -apple-system`, teal `#4ecdc4` |
| 20 | `ScoringExplainedModal.tsx` | Feed `/`, via HCPCard | system-ui body, `#b8b4ac` ramp, SFMono stack |
| 21–22 | `HomePage/InviteEmailForm.tsx`, `HomePage/InviteShareCard.tsx` | **NavBar invite dialog — global, every surface** | system-ui/`monospace`, `#f87171`, `#6b6a65` |

**Palette-drift only — retint, don't rebuild:** `SearchBar.tsx` (current voice, cohort `#9b6dff`/`#4ecdc4`), `InstitutionsInTerritoryPanel.tsx`, `InstitutionResearchThemesPanel.tsx` (`#9b6dff`).

**Do not rebuild (dead-in-tree, no live mount):** the DetailScreen subtree, the detail-flow screens, the Social legacy cluster, the HomePage tile set, the old Telescope trio + TopBar, and the pre-redesign Pulse component set — verified 49-file list in §5.16 (`StatPillWithTooltip` excepted: live via HCPCard). Deleting them removes ~a third of the legacy color census at zero visual cost. Deletion prerequisite: `App.tsx` must first shed the `HCPDetailRoute` function (`:1006-1181`), the null-locked `feedOverlay` overlay branches (`:661-692`) and the four related imports (`:42-44`, `:69`).
<details>
<summary><strong>Appendix A — complete color inventory (778 values)</strong> (click to expand)</summary>

- `#6b6a65` — 275 — DetailScreen.tsx x21, LandscapeScreen.tsx x18, InsightComposer.tsx x11, NoteEntryScreen.tsx x10, ActionTray.tsx x9, SocialAnalyticsBanner.tsx x8, RelationshipSnapshot.tsx x8, FilterDrawer.tsx x7 +61 more
- `#1e1e22` — 174 — DetailScreen.tsx x18, InsightComposer.tsx x10, ScientificNarrativeSection.tsx x8, ScoringExplainedModal.tsx x8, FollowUpItem.tsx x7, FollowUpsList.tsx x7, FieldInsightsScreen.tsx x6, LandscapeScreen.tsx x6 +45 more
- `#e8a020` — 157 — LandscapeScreen.tsx x14, HCPCard.tsx x10, NoteEntryScreen.tsx x8, ProfileScreen.tsx x8, RelationshipSnapshot.tsx x8, DetailScreen.tsx x7, WelcomeWizard.tsx x7, RisingVoicesChart.tsx x6 +45 more
- `#e8e6df` — 153 — InsightComposer.tsx x11, DetailScreen.tsx x7, LandscapeScreen.tsx x7, WelcomeWizard.tsx x7, FollowUpItem.tsx x6, FieldInsightsScreen.tsx x5, SignupScreen.tsx x5, TopPharmaCompanies.tsx x5 +58 more
- `#9b9892` — 128 — InsightComposer.tsx x9, TrackedHcpsList.tsx x8, HCPCard.tsx x7, FieldInsightsScreen.tsx x6, RelationshipSnapshot.tsx x5, InsightCard.tsx x5, FollowUpsList.tsx x5, OpportunityCard.tsx x4 +46 more
- `#9b6dff` — 82 — HCPCard.tsx x8, ScientificNarrativeSection.tsx x8, CoverageGapsTile.tsx x8, LandscapeScreen.tsx x6, TelescopeLegend.tsx x6, DetailScreen.tsx x5, EvidenceDrawer.tsx x4, LandscapeQuadrantChart.tsx x3 +22 more
- `#0a0a0b` — 66 — RelationshipSnapshot.tsx x5, InsightComposer.tsx x5, LandscapeScreen.tsx x4, AddToWatchlistPopover.tsx x3, ScoringExplainedModal.tsx x3, OpportunityCard.tsx x3, InsightCard.tsx x3, AuthWrapper.tsx x2 +30 more
- `#ffffff` — 54 — TelescopeLegend.tsx x9, RelationshipSnapshot.tsx x5, InsightComposer.tsx x5, TelescopeDrawer.tsx x4, InsightCard.tsx x4, RecentInsightsTile.tsx x4, HCPCard.tsx x3, Telescope.tsx x3 +12 more
- `#0d0d10` — 46 — InsightComposer.tsx x7, FollowUpItem.tsx x5, NoteEntryScreen.tsx x4, InsightCard.tsx x4, FollowUpsList.tsx x3, FieldInsightsScreen.tsx x2, ScientificNarrativeSection.tsx x2, SocialAnalyticsBanner.tsx x2 +15 more
- `#3fb8af` — 33 — HCPCard.tsx x6, LandscapeQuadrantChart.tsx x3, AddToWatchlistPopover.tsx x2, OpportunityCard.tsx x2, RelationshipSnapshot.tsx x2, PublicationCard.tsx x2, HcpPositionsPage.tsx, LandscapeRoute.tsx +14 more
- `rgba(255,255,255,0.08)` — 28 — ProfileScreen.tsx x8, NavBar.tsx x3, TelescopeDrawer.tsx x2, TelescopeField.tsx x2, TrackedHcpsList.tsx x2, DashboardTabs.tsx, DetailScreen.tsx, FieldIntelligenceShared.tsx +8 more
- `#111113` — 23 — DOLListingModal.tsx x2, HCPCard.tsx x2, LandscapeQuadrantChart.tsx x2, LandscapeScreen.tsx x2, RisingVoicesChart.tsx x2, SearchScreen.tsx x2, adminUi.tsx x2, ActionTray.tsx +8 more
- `#3a3a3f` — 22 — SnoozePicker.tsx x5, DetailScreen.tsx x3, LandscapeScreen.tsx x2, SignupScreen.tsx x2, TrackedHcpsList.tsx x2, AddToWatchlistPopover.tsx, CityFeedScreen.tsx, CommunityExplorer.tsx +5 more
- `#b8b4ac` — 22 — ScoringExplainedModal.tsx x8, SocialTrackEmpty.tsx x4, SocialAnalyticsBanner.tsx x3, SuggestHashtagModal.tsx x2, DOLListingModal.tsx, DOLPostModal.tsx, LandscapeScreen.tsx, RisingVoicesChart.tsx +1 more
- `#1d9e75` — 20 — DetailScreen.tsx x4, NoteEntryScreen.tsx x4, LandscapeScreen.tsx x3, ProfileScreen.tsx x3, SearchScreen.tsx x3, TopPharmaCompanies.tsx x2, FieldInsightsScreen.tsx
- `#ffd700` — 17 — TelescopeLegend.tsx x8, SearchBar.tsx x3, TelescopeDrawer.tsx x3, DetailScreen.tsx, HCPCard.tsx, Telescope.tsx
- `#8f8b83` — 16 — DetailScreen.tsx x7, ScientificNarrativeSection.tsx x3, DashboardTabs.tsx, HCPCard.tsx, IndicationFilter.tsx, TAFilterChips.tsx, FieldInsights.tsx, RelationshipSection.tsx
- `#2a2a30` — 15 — SnoozePicker.tsx x5, InsightComposer.tsx x2, DetailScreen.tsx, HCPCard.tsx, RelationshipSnapshot.tsx, InsightCard.tsx, FollowUpRow.tsx, RecentInsightsTile.tsx +2 more
- `#77736b` — 15 — ProfileScreen.tsx x8, DetailScreen.tsx, HCPCard.tsx, ScoreBreakdownV3.tsx, FollowUpsBucketSection.tsx, CreateWatchlistModal.tsx, EditWatchlistModal.tsx, TrackedHcpsList.tsx
- `rgba(237,234,227,.26)` — 14 — LinkedInAuthScreen.tsx x14
- `#ffd89b` — 14 — TelescopeField.tsx x14
- `rgba(255,255,255,0.06)` — 13 — PublicConversation.tsx x5, TelescopeField.tsx x4, IndicationFilter.tsx x2, TelescopeDrawer.tsx, TrackedHcpsFilterBar.tsx
- `#e84545` — 12 — OpportunityCard.tsx x4, AddToWatchlistPopover.tsx x2, CreateWatchlistModal.tsx x2, EditWatchlistModal.tsx x2, MeetingReadinessBanner.tsx, FollowUpRow.tsx
- `#4ecdc4` — 12 — HCPCard.tsx x7, SearchBar.tsx x3, CommunityExplorer.tsx, Telescope.tsx
- `#0d0c0b` — 12 — ProfileScreen.tsx x4, SnoozePicker.tsx x2, HCPCard.tsx, FollowUpsFilterBar.tsx, CreateWatchlistModal.tsx, EditWatchlistModal.tsx, TrackedHcpsFilterBar.tsx, WatchlistDetailHeader.tsx
- `rgba(237,234,227,.2)` — 12 — LinkedInAuthScreen.tsx x12
- `#6ba3d8` — 12 — SocialAnalyticsBanner.tsx x3, RisingVoicesChart.tsx x2, SocialCard.tsx x2, SocialTrackEmpty.tsx x2, SuggestHashtagModal.tsx x2, TrackSwitch.tsx
- `#4d5468` — 12 — TelescopeField.tsx x12
- `#e8a04e` — 11 — HCPCard.tsx x5, LandscapeQuadrantChart.tsx x3, DetailScreen.tsx, HcpPositionsPage.tsx, ScoreBreakdownV3Rising.tsx
- `#2a2a2e` — 11 — RisingVoicesChart.tsx x4, LandscapeQuadrantChart.tsx x2, ScientificNarrativeSection.tsx x2, LandscapeScreen.tsx, FullCareerView.tsx, PublicationsSurface.tsx
- `rgba(232,230,223,0.5)` — 10 — TelescopeDrawer.tsx x3, DetailScreen.tsx x2, SurfaceHCPForm.tsx x2, ContextualizeHCPForm.tsx, OptOutRequestForm.tsx, ResearchThemesSection.tsx
- `rgba(237,234,227,.28)` — 10 — LinkedInAuthScreen.tsx x10
- `rgba(255,255,255,0.10)` — 10 — ProfileScreen.tsx x3, SnoozePicker.tsx x2, FollowUpRow.tsx, FollowUpsFilterBar.tsx, CreateWatchlistModal.tsx, EditWatchlistModal.tsx, TrackedHcpsFilterBar.tsx
- `rgba(255,255,255,0.12)` — 9 — WatchlistsSidebar.tsx x2, BeliefClaimReactionPanel.tsx, DetailScreen.tsx, IndicationFilter.tsx, ProfileScreen.tsx, TelescopeDrawer.tsx, TelescopeField.tsx, ThemeReactionPanel.tsx
- `#1a1a1a` — 9 — ScoreBreakdownV3Community.tsx x3, ScoreBreakdownV3Rising.tsx x3, ContactAccessCard.tsx, HCPCard.tsx, ScoreKpiTile.tsx
- `#15131a` — 9 — ScientificNarrativeSection.tsx x4, DetailScreen.tsx x2, FieldInsightsScreen.tsx, MiniCollaboratorNetwork.tsx, TopPharmaCompanies.tsx
- `rgba(255,255,255,0.05)` — 9 — PublicConversation.tsx x4, TelescopeField.tsx x2, HCPCard.tsx, CreateWatchlistModal.tsx, EditWatchlistModal.tsx
- `rgba(237,234,227,.3)` — 9 — LinkedInAuthScreen.tsx x9
- `rgba(237,234,227,.22)` — 9 — LinkedInAuthScreen.tsx x9
- `rgba(85,102,232,0.3)` — 9 — DiscussAffordance.tsx x3, ThreadPage.tsx x3, Composer.tsx, fiUi.tsx, ModerationPage.tsx
- `rgba(0,0,0,0.5)` — 8 — TelescopeField.tsx x2, AddToWatchlistPopover.tsx, DetailScreen.tsx, FilterDrawer.tsx, HCPCard.tsx, ScoringExplainedModal.tsx, TopPharmaCompanies.tsx
- `rgba(232,230,223,0.6)` — 8 — ScientificNarrativeSection.tsx x2, TelescopeDrawer.tsx x2, BeliefClaimReactionPanel.tsx, FieldIntelligenceShared.tsx, OptOutRequestForm.tsx, ThemeReactionPanel.tsx
- `#6b6760` — 8 — DetailScreen.tsx x8
- `#0a1f16` — 8 — DetailScreen.tsx x2, NoteEntryScreen.tsx x2, LandscapeScreen.tsx, ProfileScreen.tsx, SearchScreen.tsx, TopPharmaCompanies.tsx
- `#5a9b7f` — 8 — DetailScreen.tsx, HCPCard.tsx, OpportunityCard.tsx, RelationshipSnapshot.tsx, InsightCard.tsx, InsightComposer.tsx, RecentInsightsTile.tsx, CreateWatchlistModal.tsx
- `rgba(237,234,227,.24)` — 8 — LinkedInAuthScreen.tsx x8
- `#8a8884` — 8 — RisingVoicesChart.tsx x7, SocialCard.tsx
- `#4a90e2` — 8 — OpportunityCard.tsx, RelationshipSnapshot.tsx, InsightCard.tsx, InsightComposer.tsx, CoverageGapsTile.tsx, RecentInsightsTile.tsx, CreateWatchlistModal.tsx, TrackedHcpsList.tsx
- `#c6cacd` — 8 — InsightCard.tsx x2, ProfileRelationshipControls.tsx x2, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, ProfileSecondaryControls.tsx
- `#d85a30` — 7 — FilterButton.tsx x3, FilterDrawer.tsx x2, CollapsibleFilterSection.tsx, DrugConstellation.tsx
- `#edeeef` — 7 — ProfileRelationshipControls.tsx x3, ContactAccessCard.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `#6e6a62` — 7 — DetailScreen.tsx x3, InstitutionsInTerritoryPanel.tsx x3, HCPCard.tsx
- `#1a1200` — 7 — HCPCard.tsx x2, NoteEntryScreen.tsx x2, SocialCard.tsx x2, DetailScreen.tsx
- `rgba(255,255,255,0.1)` — 7 — PublicConversation.tsx x2, SurfaceHCPForm.tsx x2, FieldIntelligenceShared.tsx, OptOutRequestForm.tsx, TelescopeField.tsx
- `rgba(0,0,0,0.6)` — 7 — InfoTooltip.tsx, InviteColleaguesButton.tsx, NavBar.tsx, InsightComposerModal.tsx, InviteModal.tsx, CreateWatchlistModal.tsx, EditWatchlistModal.tsx
- `#e8704e` — 7 — SignupScreen.tsx x2, InsightComposer.tsx x2, ProfileScreen.tsx, UserMenu.tsx, WelcomeWizard.tsx
- `rgba(232,160,32,0.1)` — 7 — WelcomeWizard.tsx x2, adminUi.tsx, ModerationPage.tsx, InviteEmailForm.tsx, InviteShareCard.tsx, PublicationList.tsx
- `rgba(232,230,223,.5)` — 7 — ProfileSecondaryControls.tsx x3, CommunityHcpProfile.tsx x2, PracticeFirstProfile.tsx x2
- `rgba(232,230,223,0.45)` — 6 — BeliefClaimReactionPanel.tsx, DetailScreen.tsx, IndicationFilter.tsx, ResearchThemesSection.tsx, SurfaceHCPForm.tsx, ThemeReactionPanel.tsx
- `#7c8288` — 6 — ContactAccessCard.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, ProfileDispatch.tsx, ProfileRelationshipControls.tsx
- `#7b9ebd` — 6 — DetailScreen.tsx x3, HCPCard.tsx, HcpPositionsPage.tsx, ScientificNarrativeSection.tsx
- `#928e86` — 6 — DetailScreen.tsx x2, WatchlistDetailHeader.tsx x2, HCPCard.tsx, WatchlistsPage.tsx
- `#bdb9b0` — 6 — DetailScreen.tsx x5, PulseSynthesis.tsx
- `rgba(232,230,223,1)` — 6 — FieldIntelligenceShared.tsx x2, OptOutRequestForm.tsx x2, SurfaceHCPForm.tsx, TelescopeDrawer.tsx
- `#f2f0ea` — 6 — HCPCard.tsx, ProfileScreen.tsx, FollowUpRow.tsx, FollowUpsBucketSection.tsx, WatchlistDetailHeader.tsx, WatchlistsPage.tsx
- `rgba(255,255,255,0.07)` — 6 — PublicConversation.tsx x2, TelescopeField.tsx x2, HCPCard.tsx, TelescopeDrawer.tsx
- `#3f4658` — 6 — TelescopeField.tsx x6
- `#e6e3da` — 6 — TelescopeField.tsx x6
- `#767c81` — 6 — CohortLedger.tsx x6
- `rgba(255,255,255,.14)` — 6 — ProfileRelationshipControls.tsx x2, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, ProfileSecondaryControls.tsx
- `#111313` — 6 — PracticeFirstProfile.tsx x6
- `rgba(232,230,223,0.4)` — 5 — BeliefClaimReactionPanel.tsx x2, DetailScreen.tsx, ScientificNarrativeSection.tsx, ThemeReactionPanel.tsx
- `rgba(232,230,223,0.7)` — 5 — BeliefClaimReactionPanel.tsx, SurfaceHCPForm.tsx, TelescopeDrawer.tsx, TelescopeLegend.tsx, ThemeReactionPanel.tsx
- `#7fb3bb` — 5 — CohortLedger.tsx x2, ContactAccessCard.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `rgba(255,255,255,.06)` — 5 — HcpProfileBrief.tsx x2, ContactAccessCard.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx
- `rgba(0,0,0,0.4)` — 5 — EvidenceDrawer.tsx, FieldIntelligenceShared.tsx, InsightCard.tsx, FollowUpItem.tsx, StatusEditor.tsx
- `rgba(255,255,255,0.03)` — 5 — TelescopeDrawer.tsx x2, FieldIntelligenceShared.tsx, OptOutRequestForm.tsx, ThemeReactionPanel.tsx
- `rgba(255,255,255,0.04)` — 5 — TelescopeDrawer.tsx x2, IndicationFilter.tsx, OptOutRequestForm.tsx, SurfaceHCPForm.tsx
- `rgba(237,234,227,.18)` — 5 — LinkedInAuthScreen.tsx x5
- `#0d0d0a` — 5 — ProfileScreen.tsx x3, NoteEntryScreen.tsx x2
- `#7d786f` — 5 — PeopleNavStrip.tsx x5
- `rgba(255,255,255,.09)` — 5 — PeopleNavStrip.tsx, CohortLedger.tsx, InsightCard.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `#0f0f12` — 5 — WelcomeWizard.tsx x4, SignupScreen.tsx
- `#4ade80` — 5 — InviteEmailForm.tsx x2, InviteShareCard.tsx x2, adminUi.tsx
- `#4e4a44` — 5 — AssetsIndexPage.tsx x5
- `#08090a` — 5 — CohortLedger.tsx, AdministeredVolumeBlock.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, ProfileDispatch.tsx
- `#0e1013` — 5 — CohortLedger.tsx, InsightCard.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, PulsePage.tsx
- `#0a0c0e` — 5 — CohortLedger.tsx, ForumIndexPage.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, PulsePage.tsx
- `rgba(85,102,232,0.1)` — 5 — ThreadPage.tsx x2, Composer.tsx, DiscussAffordance.tsx, ModerationPage.tsx
- `rgba(85,102,232,0.05)` — 5 — ThreadPage.tsx x2, Composer.tsx, DiscussAffordance.tsx, ModerationPage.tsx
- `#3a3227` — 5 — ForumIndexPage.tsx x5
- `rgba(127,179,187,.3)` — 5 — HcpProfileBrief.tsx x4, CommunityHcpProfile.tsx
- `#6fa67f` — 5 — PulseEvents.tsx x2, ThemeList.tsx x2, PulseConfidence.tsx
- `rgba(155,109,255,0.15)` — 4 — BeliefClaimReactionPanel.tsx, ScientificNarrativeSection.tsx, TelescopeDrawer.tsx, CoverageGapsTile.tsx
- `#e7e8e9` — 4 — ContactAccessCard.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `#a8aeb3` — 4 — ContactAccessCard.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `#8f959a` — 4 — ContactAccessCard.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `#63696e` — 4 — ContactAccessCard.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `rgba(120,200,255,0.35)` — 4 — ContextualizeHCPForm.tsx, FieldIntelligenceShared.tsx, OptOutRequestForm.tsx, SurfaceHCPForm.tsx
- `rgba(120,200,255,1)` — 4 — ContextualizeHCPForm.tsx, FieldIntelligenceShared.tsx, OptOutRequestForm.tsx, SurfaceHCPForm.tsx
- `#aeb4f5` — 4 — DashboardTabs.tsx, DetailScreen.tsx, IndicationFilter.tsx, TAFilterChips.tsx
- `rgba(232,160,32,0.35)` — 4 — DashboardTabs.tsx x2, Composer.tsx, PublicationList.tsx
- `#dad7cf` — 4 — DetailScreen.tsx x3, HCPCard.tsx
- `#b6b2aa` — 4 — FilterButton.tsx x2, DetailScreen.tsx, InstitutionsInTerritoryPanel.tsx
- `#e05555` — 4 — DetailScreen.tsx, DOLPostModal.tsx, NoteEntryScreen.tsx, ProfileScreen.tsx
- `rgba(255,255,255,0.09)` — 4 — PublicConversation.tsx x2, DetailScreen.tsx, FilterButton.tsx
- `rgba(155,109,255,0.08)` — 4 — FieldInsightsScreen.tsx x2, InsightCard.tsx x2
- `rgba(155,109,255,0.18)` — 4 — CoverageGapsTile.tsx x2, HCPCard.tsx, FollowUpRow.tsx
- `#1e1e21` — 4 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx, FullCareerView.tsx, PublicationsSurface.tsx
- `#08080a` — 4 — LinkedInAuthScreen.tsx x2, FullCareerView.tsx, PublicationsSurface.tsx
- `rgba(237,234,227,.45)` — 4 — LinkedInAuthScreen.tsx x4
- `rgba(237,234,227,.55)` — 4 — LinkedInAuthScreen.tsx x4
- `#7a7367` — 4 — PublicConversation.tsx x4
- `#2a3848` — 4 — SuggestHashtagModal.tsx x2, SocialTrackEmpty.tsx, TrackSwitch.tsx
- `#c599ff` — 4 — Telescope.tsx x2, TelescopeDrawer.tsx x2
- `#c8d8e8` — 4 — Telescope.tsx x2, TelescopeLegend.tsx x2
- `#dcd9d0` — 4 — TelescopeField.tsx x4
- `#565d72` — 4 — TelescopeField.tsx x4
- `rgba(232,160,32,0.06)` — 4 — fiUi.tsx x2, AdminInvites.tsx, WelcomeShareBanner.tsx
- `#f4efe4` — 4 — AssetsIndexPage.tsx x4
- `#7b7b9c` — 4 — RelationshipSnapshot.tsx, InsightCard.tsx, InsightComposer.tsx, RecentInsightsTile.tsx
- `#e0a75e` — 4 — CohortLedger.tsx x2, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `rgba(232,160,32,0.5)` — 4 — fiUi.tsx x2, Composer.tsx, ThreadPage.tsx
- `#7fb094` — 4 — fiUi.tsx x2, PublicationCard.tsx x2
- `#1b1915` — 4 — CoverageGapsTile.tsx x4
- `#3a403c` — 4 — PracticeFirstProfile.tsx x4
- `#6f6d68` — 4 — FullCareerView.tsx x2, PublicationsSurface.tsx x2
- `#f0997b` — 3 — FilterDrawer.tsx x2, ActiveFilterPills.tsx
- `rgba(216,90,48,0.10)` — 3 — ActiveFilterPills.tsx, FilterButton.tsx, FilterDrawer.tsx
- `rgba(155,109,255,0.25)` — 3 — BeliefClaimReactionPanel.tsx x2, ScientificNarrativeSection.tsx
- `rgba(232,230,223,0.75)` — 3 — BeliefClaimReactionPanel.tsx, FieldIntelligenceShared.tsx, ThemeReactionPanel.tsx
- `#0f0f0f` — 3 — CommunityExplorer.tsx, HCPCard.tsx, ScoreKpiTile.tsx
- `#2a2a2a` — 3 — CommunityExplorer.tsx, HCPCard.tsx, ScoreKpiTile.tsx
- `rgba(0,0,0,.5)` — 3 — CohortLedger.tsx x2, CommunityExplorer.tsx
- `rgba(120,200,255,0.12)` — 3 — ContextualizeHCPForm.tsx, OptOutRequestForm.tsx, SurfaceHCPForm.tsx
- `rgba(85,102,232,0.12)` — 3 — DashboardTabs.tsx, IndicationFilter.tsx, TAFilterChips.tsx
- `rgba(85,102,232,0.50)` — 3 — DashboardTabs.tsx, IndicationFilter.tsx, TAFilterChips.tsx
- `#5fa97e` — 3 — TopPharmaCompanies.tsx x2, DetailScreen.tsx
- `#f4f2ec` — 3 — DetailScreen.tsx, FollowUpsHero.tsx, WatchlistsPage.tsx
- `#4dd0e1` — 3 — DOLHeroPanel.tsx, DOLListingModal.tsx, DOLPostModal.tsx
- `rgba(0,0,0,0.55)` — 3 — EvidenceDrawer.tsx, ScoringExplainedModal.tsx, Telescope.tsx
- `#c8c5be` — 3 — FieldInsightsScreen.tsx x2, FollowUpRow.tsx
- `rgba(155,109,255,0.14)` — 3 — FieldInsightsScreen.tsx, MiniCollaboratorNetwork.tsx, InsightCard.tsx
- `#0d0a1a` — 3 — HCPCard.tsx x2, LandscapeScreen.tsx
- `#0a1a18` — 3 — HCPCard.tsx x3
- `rgba(107,106,101,0.18)` — 3 — HCPCard.tsx x2, OpportunityCard.tsx
- `rgba(232,160,32,0.12)` — 3 — HCPCard.tsx, MeetingReadinessBanner.tsx, FollowUpsFilterBar.tsx
- `#3e3e42` — 3 — InstitutionsIndexRoute.tsx x2, InstitutionRoute.tsx
- `rgba(237,234,227,.4)` — 3 — LinkedInAuthScreen.tsx x3
- `rgba(237,234,227,.42)` — 3 — LinkedInAuthScreen.tsx x3
- `rgba(237,234,227,.6)` — 3 — LinkedInAuthScreen.tsx x3
- `rgba(237,234,227,.1)` — 3 — LinkedInAuthScreen.tsx x3
- `rgba(3,5,12,0.42)` — 3 — NavBar.tsx x3
- `#4e4b45` — 3 — PeopleNavStrip.tsx x3
- `#1c1b18` — 3 — ProfileScreen.tsx, AssetsIndexPage.tsx, WatchlistsSidebar.tsx
- `rgba(255,255,255,0.14)` — 3 — PublicConversation.tsx x3
- `#c84830` — 3 — SocialAnalyticsBanner.tsx x2, RisingVoicesChart.tsx
- `rgba(107,106,101,0.15)` — 3 — ScientificNarrativeSection.tsx, CoverageGapsTile.tsx, PublicationCard.tsx
- `#c49a4a` — 3 — SocialAnalyticsBanner.tsx x2, SocialCard.tsx
- `#1a1a1c` — 3 — SocialCard.tsx x3
- `#a8bdd8` — 3 — TelescopeField.tsx x3
- `#f6f2e8` — 3 — TelescopeField.tsx x3
- `#c9c6bd` — 3 — TelescopeField.tsx x3
- `#04060d` — 3 — TelescopeField.tsx x3
- `#5a6178` — 3 — TelescopeField.tsx x3
- `#343b4c` — 3 — TelescopeField.tsx x3
- `rgba(232,160,32,0.18)` — 3 — CongressCalendarPage.tsx x2, OpportunityCard.tsx
- `#0b0d10` — 3 — CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `#0a0c0f` — 3 — CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `#71787e` — 3 — CohortLedger.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `rgba(127,179,187,.35)` — 3 — CohortLedger.tsx x2, CommunityHcpProfile.tsx
- `#4b514d` — 3 — InsightCard.tsx x3
- `#0a0a0a` — 3 — Composer.tsx, fiUi.tsx, ThreadPage.tsx
- `rgba(85,102,232,0.16)` — 3 — Composer.tsx, ModerationPage.tsx, ThreadPage.tsx
- `rgba(85,102,232,0.08)` — 3 — DiscussAffordance.tsx x2, fiUi.tsx
- `rgba(232,112,78,0.3)` — 3 — ThreadPage.tsx x2, ModerationPage.tsx
- `#b0848f` — 3 — CommunityHcpProfile.tsx x2, HomePage.tsx
- `#b5836a` — 3 — ThemeList.tsx x2, PulseEvents.tsx
- `#4a3a1c` — 3 — TrialsPage.tsx x3
- `rgba(0,0,0,0.7)` — 2 — ActionTray.tsx, SuggestHashtagModal.tsx
- `rgba(216,90,48,0.40)` — 2 — ActiveFilterPills.tsx, FilterButton.tsx
- `rgba(232,230,223,0.55)` — 2 — BeliefClaimReactionPanel.tsx, ThemeReactionPanel.tsx
- `rgba(232,160,32,0.10)` — 2 — CommunityExplorer.tsx, fiUi.tsx
- `#5566e8` — 2 — DetailScreen.tsx, ScoreBreakdownV3.tsx
- `#1a0a0a` — 2 — DetailScreen.tsx, NoteEntryScreen.tsx
- `#7b2020` — 2 — DetailScreen.tsx, NoteEntryScreen.tsx
- `rgba(85,102,232,0.10)` — 2 — DetailScreen.tsx, fiUi.tsx
- `#ef4444` — 2 — DOLListingModal.tsx x2
- `rgba(0,0,0,0.8)` — 2 — DOLListingModal.tsx, DOLPostModal.tsx
- `#050507` — 2 — DrugConstellation.tsx x2
- `#b89bff` — 2 — FieldInsightsScreen.tsx, InsightCard.tsx
- `rgba(29,158,117,0.30)` — 2 — FieldInsightsScreen.tsx, InsightComposer.tsx
- `rgba(155,109,255,0.30)` — 2 — FieldInsightsScreen.tsx, InsightCard.tsx
- `rgba(13,13,16,0.98)` — 2 — FieldIntelligenceShared.tsx x2
- `rgba(120,200,255,0.15)` — 2 — FieldIntelligenceShared.tsx, ThemeReactionPanel.tsx
- `#888076` — 2 — FilterDrawer.tsx, TopPharmaCompanies.tsx
- `#57534b` — 2 — HCPCard.tsx x2
- `rgba(232,160,32,0.4)` — 2 — HCPCard.tsx, CongressCalendarPage.tsx
- `rgba(232,230,223,0.3)` — 2 — IndicationFilter.tsx x2
- `#141417` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#0e0e11` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#e6e3dc` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#98958d` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#8b887f` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#6a6862` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#575651` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#c9a35c` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#8fa3ab` — 2 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx
- `#101014` — 2 — InstitutionsIndexRoute.tsx x2
- `#1a1a1e` — 2 — LandscapeScreen.tsx, ResearchThemeChip.tsx
- `#f0b84e` — 2 — LinkedInAuthScreen.tsx x2
- `#e79880` — 2 — LinkedInAuthScreen.tsx x2
- `#090c18` — 2 — LinkedInAuthScreen.tsx x2
- `#0d0c1e` — 2 — LinkedInAuthScreen.tsx x2
- `#130d1b` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.32)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.5)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.36)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.34)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(240,184,78,.7)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(240,184,78,.55)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(233,166,59,.6)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.9)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.75)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.7)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(240,184,78,.8)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(240,184,78,.16)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(233,166,59,.06)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.16)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.045)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(233,166,59,.75)` — 2 — LinkedInAuthScreen.tsx x2
- `rgba(237,234,227,.62)` — 2 — LinkedInAuthScreen.tsx x2
- `#5b5852` — 2 — PeopleNavStrip.tsx x2
- `#6f6b64` — 2 — PeopleNavStrip.tsx x2
- `rgba(255,255,255,.07)` — 2 — PeopleNavStrip.tsx, CommunityHcpProfile.tsx
- `rgba(255,255,255,.16)` — 2 — PeopleNavStrip.tsx x2
- `rgba(216,169,75,.09)` — 2 — PeopleNavStrip.tsx x2
- `rgba(255,255,255,.08)` — 2 — PeopleNavStrip.tsx x2
- `rgba(216,169,75,.42)` — 2 — PeopleNavStrip.tsx x2
- `rgba(216,169,75,.07)` — 2 — PeopleNavStrip.tsx x2
- `#0a66c2` — 2 — ProfileScreen.tsx, SignupScreen.tsx
- `#e8e3d9` — 2 — PublicConversation.tsx, HomePage.tsx
- `#4d4a44` — 2 — PublicConversation.tsx x2
- `rgba(201,150,47,0.45)` — 2 — PublicConversation.tsx x2
- `#2b2520` — 2 — ResearchThemeChip.tsx, TopPharmaCompanies.tsx
- `#8aa0ac` — 2 — RisingVoicesChart.tsx x2
- `rgba(63,184,175,0.15)` — 2 — ScientificNarrativeSection.tsx, PublicationCard.tsx
- `rgba(232,230,223,0.15)` — 2 — ScientificNarrativeSection.tsx x2
- `#a39b7c` — 2 — SocialAnalyticsBanner.tsx x2
- `#1f1a0a` — 2 — SocialCard.tsx, TopPharmaCompanies.tsx
- `#1a2530` — 2 — SuggestHashtagModal.tsx, TrackSwitch.tsx
- `#fffcf0` — 2 — Telescope.tsx, TelescopeDrawer.tsx
- `#5a7090` — 2 — Telescope.tsx, TelescopeLegend.tsx
- `#aacbe8` — 2 — Telescope.tsx x2
- `rgba(13,13,16,${bgopacity})` — 2 — Telescope.tsx x2
- `rgba(232,230,223,${textopacity})` — 2 — Telescope.tsx x2
- `rgba(255,215,0,0.3)` — 2 — TelescopeDrawer.tsx x2
- `rgba(255,215,0,0.1)` — 2 — TelescopeDrawer.tsx x2
- `#fffaf0` — 2 — TelescopeField.tsx x2
- `#f2f7ff` — 2 — TelescopeField.tsx x2
- `#cdcac1` — 2 — TelescopeField.tsx x2
- `#7d90ad` — 2 — TelescopeField.tsx x2
- `#cfe0ff` — 2 — TelescopeField.tsx x2
- `#e6d4ff` — 2 — TelescopeField.tsx x2
- `#7c839a` — 2 — TelescopeField.tsx x2
- `#8f96ab` — 2 — TelescopeField.tsx x2
- `#05070f` — 2 — TelescopeField.tsx x2
- `#6b7288` — 2 — TelescopeField.tsx x2
- `rgba(168,189,216,0.6)` — 2 — TelescopeField.tsx x2
- `rgba(255,216,155,0.6)` — 2 — TelescopeField.tsx x2
- `rgba(8,11,24,0)` — 2 — TelescopeField.tsx x2
- `rgba(255,216,155,0.9)` — 2 — TelescopeField.tsx x2
- `rgba(255,255,255,0.045)` — 2 — TelescopeField.tsx x2
- `rgba(120,200,255,0.2)` — 2 — ThemeReactionPanel.tsx x2
- `#b07816` — 2 — TopPharmaCompanies.tsx x2
- `#f87171` — 2 — adminUi.tsx, InviteEmailForm.tsx
- `rgba(232,160,32,0.08)` — 2 — adminUi.tsx, Composer.tsx
- `#f0ebe1` — 2 — AssetsIndexPage.tsx, HomePage.tsx
- `#413d38` — 2 — AssetsIndexPage.tsx x2
- `#a09a90` — 2 — AssetsIndexPage.tsx x2
- `#d8cdb6` — 2 — AssetsIndexPage.tsx x2
- `#45413b` — 2 — AssetsIndexPage.tsx x2
- `#726d65` — 2 — AssetsIndexPage.tsx x2
- `#b99a68` — 2 — CohortLedger.tsx, CommunityHcpProfile.tsx
- `#a07b45` — 2 — CohortLedger.tsx x2
- `#0c0e11` — 2 — CohortLedger.tsx x2
- `#cdd1d4` — 2 — CohortLedger.tsx x2
- `rgba(224,167,94,.5)` — 2 — CohortLedger.tsx, HcpProfileBrief.tsx
- `#3a352f` — 2 — CongressCalendarPage.tsx, CongressDetailPage.tsx
- `#8a6524` — 2 — CongressCalendarPage.tsx x2
- `rgba(232,160,32,0.22)` — 2 — CongressCalendarPage.tsx, fiUi.tsx
- `#0a0b0b` — 2 — FieldInsights.tsx, PracticeFirstProfile.tsx
- `#d99a3c` — 2 — InsightCard.tsx, InsightComposer.tsx
- `#5f6762` — 2 — InsightCard.tsx, InsightComposer.tsx
- `rgba(232,160,32,0.2)` — 2 — Composer.tsx, ThreadPage.tsx
- `#b98f45` — 2 — fiUi.tsx x2
- `rgba(95,169,126,0.08)` — 2 — fiUi.tsx x2
- `rgba(232,160,32,0.42)` — 2 — fiUi.tsx x2
- `#e9e6df` — 2 — ForumIndexPage.tsx, PulsePage.tsx
- `rgba(232,112,78,0.05)` — 2 — ModerationPage.tsx, ThreadPage.tsx
- `#26221c` — 2 — CoverageGapsTile.tsx x2
- `#0c0c0b` — 2 — HomePage.tsx x2
- `#9dbfa4` — 2 — HomePage.tsx, TheWeekPage.tsx
- `#6e8f76` — 2 — HomePage.tsx, HcpProfileBrief.tsx
- `#16181a` — 2 — AdministeredVolumeBlock.tsx x2
- `#d69a3c` — 2 — CommunityHcpProfile.tsx, PracticeFirstProfile.tsx
- `#8a7fb8` — 2 — CommunityHcpProfile.tsx, PracticeFirstProfile.tsx
- `#6f7370` — 2 — CommunityHcpProfile.tsx x2
- `rgba(255,255,255,.28)` — 2 — CommunityHcpProfile.tsx, ProfileRelationshipControls.tsx
- `rgba(224,167,94,.4)` — 2 — HcpProfileBrief.tsx x2
- `#d8a34a` — 2 — FullCareerView.tsx, PublicationsSurface.tsx
- `#e6e3dd` — 2 — FullCareerView.tsx, PublicationsSurface.tsx
- `#c6c2bb` — 2 — FullCareerView.tsx, PublicationsSurface.tsx
- `#57554f` — 2 — FullCareerView.tsx, PublicationsSurface.tsx
- `#46443f` — 2 — FullCareerView.tsx, PublicationsSurface.tsx
- `#3f3d39` — 2 — FullCareerView.tsx, PublicationsSurface.tsx
- `#33322f` — 2 — FullCareerView.tsx, PublicationsSurface.tsx
- `#5f6670` — 2 — PulsePage.tsx x2
- `#d6d1c6` — 2 — PulsePage.tsx x2
- `#0b0a09` — 2 — TheWeekPage.tsx, TrialsPage.tsx
- `#8c7c4e` — 2 — TheWeekPage.tsx x2
- `#78736a` — 2 — TheWeekPage.tsx x2
- `#7a5a1f` — 2 — TrialsPage.tsx x2
- `#191309` — 2 — TrialsPage.tsx x2
- `#16140f` — 2 — TrialsPage.tsx x2
- `#4e3a16` — 2 — TrialsPage.tsx x2
- `#e2ddcd` — 2 — TrialsPage.tsx x2
- `rgba(0,0,0,0.9)` — 2 — CreateWatchlistModal.tsx, EditWatchlistModal.tsx
- `#ff6b6b` — 1 — BeliefClaimReactionPanel.tsx
- `rgba(155,109,255,0.22)` — 1 — BeliefClaimReactionPanel.tsx
- `rgba(155,109,255,0.05)` — 1 — BeliefClaimReactionPanel.tsx
- `rgba(255,255,255,0.7)` — 1 — BeliefClaimReactionPanel.tsx
- `rgba(155,109,255,0.2)` — 1 — BeliefClaimReactionPanel.tsx
- `rgba(232,160,32,0.40)` — 1 — CommunityExplorer.tsx
- `rgba(78,205,196,0.08)` — 1 — CommunityExplorer.tsx
- `rgba(78,205,196,0.30)` — 1 — CommunityExplorer.tsx
- `#5c7ce8` — 1 — ContactAccessCard.tsx
- `#ffb84d` — 1 — DetailScreen.tsx
- `#4a9d5f` — 1 — DetailScreen.tsx
- `#18181b` — 1 — DetailScreen.tsx
- `#71717a` — 1 — DetailScreen.tsx
- `#a1a1aa` — 1 — DetailScreen.tsx
- `#2a2730` — 1 — DetailScreen.tsx
- `rgba(85,102,232,0.35)` — 1 — DetailScreen.tsx
- `#7a7a75` — 1 — DrugConstellation.tsx
- `#a8763f` — 1 — DrugConstellation.tsx
- `#15141a` — 1 — DrugConstellation.tsx
- `rgba(29,158,117,0.10)` — 1 — FieldInsightsScreen.tsx
- `rgba(29,158,117,0.06)` — 1 — FieldInsightsScreen.tsx
- `rgba(29,158,117,0.20)` — 1 — FieldInsightsScreen.tsx
- `#fff` — 1 — FieldIntelligenceShared.tsx
- `rgba(0,0,0,0.65)` — 1 — FieldIntelligenceShared.tsx
- `rgba(120,200,255,0.4)` — 1 — FieldIntelligenceShared.tsx
- `rgba(216,90,48,0.15)` — 1 — FilterDrawer.tsx
- `#e4e1d9` — 1 — HCPCard.tsx
- `#3d3a34` — 1 — HCPCard.tsx
- `#a29e96` — 1 — HCPCard.tsx
- `rgba(63,184,175,0.18)` — 1 — HCPCard.tsx
- `rgba(232,160,78,0.18)` — 1 — HCPCard.tsx
- `rgba(0,0,0,0.45)` — 1 — HCPCard.tsx
- `rgba(139,147,242,0.35)` — 1 — HCPCard.tsx
- `#17171b` — 1 — InstitutionRoute.tsx
- `#a9a69e` — 1 — InstitutionRoute.tsx
- `#4e4d49` — 1 — InstitutionsIndexRoute.tsx
- `#2b2b30` — 1 — InstitutionsIndexRoute.tsx
- `#1d1d20` — 1 — InstitutionsIndexRoute.tsx
- `#26262a` — 1 — InstitutionsIndexRoute.tsx
- `#e7e4dc` — 1 — InstitutionsInTerritoryPanel.tsx
- `#4a4a4f` — 1 — LandscapeQuadrantChart.tsx
- `#5dcaa5` — 1 — LandscapeScreen.tsx
- `#444441` — 1 — LandscapeScreen.tsx
- `#edeae3` — 1 — LinkedInAuthScreen.tsx
- `#e9a63b` — 1 — LinkedInAuthScreen.tsx
- `#f0b39d` — 1 — LinkedInAuthScreen.tsx
- `#cb5c44` — 1 — LinkedInAuthScreen.tsx
- `#100d08` — 1 — LinkedInAuthScreen.tsx
- `#2a4e70` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,.44)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,184,78,.5)` — 1 — LinkedInAuthScreen.tsx
- `rgba(233,166,59,.45)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,184,78,.4)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,184,78,.45)` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,.8)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,184,78,.85)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,184,78,.6)` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,.65)` — 1 — LinkedInAuthScreen.tsx
- `rgba(233,166,59,.22)` — 1 — LinkedInAuthScreen.tsx
- `rgba(233,166,59,.2)` — 1 — LinkedInAuthScreen.tsx
- `rgba(58,48,112,.30)` — 1 — LinkedInAuthScreen.tsx
- `rgba(92,54,90,.16)` — 1 — LinkedInAuthScreen.tsx
- `rgba(58,48,112,.26)` — 1 — LinkedInAuthScreen.tsx
- `rgba(92,54,90,.15)` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,0)` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,.85)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,184,78,0)` — 1 — LinkedInAuthScreen.tsx
- `rgba(0,0,0,0.25)` — 1 — LinkedInAuthScreen.tsx
- `rgba(203,92,68,.45)` — 1 — LinkedInAuthScreen.tsx
- `rgba(203,92,68,.12)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,179,157,.7)` — 1 — LinkedInAuthScreen.tsx
- `rgba(240,179,157,.9)` — 1 — LinkedInAuthScreen.tsx
- `rgba(203,92,68,.07)` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,.04)` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,.08)` — 1 — LinkedInAuthScreen.tsx
- `rgba(233,166,59,.16)` — 1 — LinkedInAuthScreen.tsx
- `rgba(8,9,14,.86)` — 1 — LinkedInAuthScreen.tsx
- `rgba(8,9,14,.95)` — 1 — LinkedInAuthScreen.tsx
- `rgba(8,9,14,.72)` — 1 — LinkedInAuthScreen.tsx
- `rgba(8,9,14,.84)` — 1 — LinkedInAuthScreen.tsx
- `rgba(237,234,227,.09)` — 1 — LinkedInAuthScreen.tsx
- `#b9a6f5` — 1 — MiniCollaboratorNetwork.tsx
- `#7fb58c` — 1 — MiniCollaboratorNetwork.tsx
- `#8b93f2` — 1 — MiniCollaboratorNetwork.tsx
- `#8b93f255` — 1 — MiniCollaboratorNetwork.tsx
- `rgba(95,169,126,0.13)` — 1 — MiniCollaboratorNetwork.tsx
- `rgba(10,12,12,0.72)` — 1 — NavBar.tsx
- `#d8a94b` — 1 — PeopleNavStrip.tsx
- `#ece7dd` — 1 — PeopleNavStrip.tsx
- `#8e887e` — 1 — PeopleNavStrip.tsx
- `#5f5b54` — 1 — PeopleNavStrip.tsx
- `#57534c` — 1 — PeopleNavStrip.tsx
- `#101013` — 1 — PeopleNavStrip.tsx
- `#a49d92` — 1 — PeopleNavStrip.tsx
- `rgba(255,255,255,.12)` — 1 — PeopleNavStrip.tsx
- `rgba(255,255,255,.05)` — 1 — PeopleNavStrip.tsx
- `rgba(6,6,8,.72)` — 1 — PeopleNavStrip.tsx
- `rgba(255,255,255,.1)` — 1 — PeopleNavStrip.tsx
- `rgba(0,0,0,.6)` — 1 — PeopleNavStrip.tsx
- `rgba(255,255,255,.015)` — 1 — PeopleNavStrip.tsx
- `rgba(255,255,255,.11)` — 1 — PeopleNavStrip.tsx
- `#0f0e0d` — 1 — PublicConversation.tsx
- `#0c0b0a` — 1 — PublicConversation.tsx
- `#131110` — 1 — PublicConversation.tsx
- `#151311` — 1 — PublicConversation.tsx
- `#d8a949` — 1 — PublicConversation.tsx
- `#c9962f` — 1 — PublicConversation.tsx
- `#a07f34` — 1 — PublicConversation.tsx
- `#f0e9dc` — 1 — PublicConversation.tsx
- `#c4bdaf` — 1 — PublicConversation.tsx
- `#a49c8e` — 1 — PublicConversation.tsx
- `#9d968a` — 1 — PublicConversation.tsx
- `#8d8578` — 1 — PublicConversation.tsx
- `#6f6961` — 1 — PublicConversation.tsx
- `#5f5a52` — 1 — PublicConversation.tsx
- `#b08c39` — 1 — PublicConversation.tsx
- `#e2dcd0` — 1 — PublicConversation.tsx
- `rgba(201,150,47,0.5)` — 1 — PublicConversation.tsx
- `rgba(19,17,16,0.96)` — 1 — PublicConversation.tsx
- `rgba(160,127,52,0.5)` — 1 — PublicConversation.tsx
- `rgba(216,169,73,0.05)` — 1 — PublicConversation.tsx
- `rgba(216,169,73,0.4)` — 1 — PublicConversation.tsx
- `rgba(255,255,255,0.16)` — 1 — PublicConversation.tsx
- `rgba(216,169,73,0.35)` — 1 — PublicConversation.tsx
- `rgba(201,150,47,0.4)` — 1 — PublicConversation.tsx
- `#a8a49b` — 1 — ScientificNarrativeSection.tsx
- `#1f1a2e` — 1 — ScientificNarrativeSection.tsx
- `rgba(123,158,189,0.15)` — 1 — ScientificNarrativeSection.tsx
- `rgba(155,109,255,0.10)` — 1 — ScientificNarrativeSection.tsx
- `#3f8fd9` — 1 — ScoreBreakdownV3Community.tsx
- `#0f0f11` — 1 — ScoringExplainedModal.tsx
- `rgba(0,0,0,0.72)` — 1 — ScoringExplainedModal.tsx
- `rgba(255,255,255,0.25)` — 1 — SignupScreen.tsx
- `#7fb1b5` — 1 — SocialAnalyticsBanner.tsx
- `#8fa38c` — 1 — SocialAnalyticsBanner.tsx
- `#8b8585` — 1 — SocialAnalyticsBanner.tsx
- `#5a5a5e` — 1 — SocialAnalyticsBanner.tsx
- `#7fb87f` — 1 — SocialAnalyticsBanner.tsx
- `#0f1a24` — 1 — SocialCard.tsx
- `#0f2018` — 1 — SocialCard.tsx
- `#6fb87f` — 1 — SocialCard.tsx
- `#8e8b82` — 1 — SocialCard.tsx
- `#2a1f0a` — 1 — SocialTrackEmpty.tsx
- `#3a3a40` — 1 — StatPillWithTooltip.tsx
- `rgba(13,13,16,1)` — 1 — SurfaceHCPForm.tsx
- `rgba(232,230,223,0.85)` — 1 — SurfaceHCPForm.tsx
- `#0a0a0f` — 1 — Telescope.tsx
- `rgba(${r},${g},${b},${alpha})` — 1 — Telescope.tsx
- `rgba(255,215,0,${borderopacity})` — 1 — Telescope.tsx
- `rgba(155,109,255,${borderopacity})` — 1 — Telescope.tsx
- `#9b6dff55` — 1 — TelescopeDrawer.tsx
- `rgba(255,252,240,0.15)` — 1 — TelescopeDrawer.tsx
- `rgba(255,252,240,0.3)` — 1 — TelescopeDrawer.tsx
- `rgba(255,215,0,0.15)` — 1 — TelescopeDrawer.tsx
- `rgba(197,153,255,0.15)` — 1 — TelescopeDrawer.tsx
- `rgba(197,153,255,0.3)` — 1 — TelescopeDrawer.tsx
- `rgba(155,109,255,0.3)` — 1 — TelescopeDrawer.tsx
- `rgba(13,13,16,0.95)` — 1 — TelescopeDrawer.tsx
- `rgba(255,215,0,0.18)` — 1 — TelescopeDrawer.tsx
- `#c3a9ff` — 1 — TelescopeField.tsx
- `#7e93c6` — 1 — TelescopeField.tsx
- `#ffe6c2` — 1 — TelescopeField.tsx
- `#d5c8ff` — 1 — TelescopeField.tsx
- `#dce6ff` — 1 — TelescopeField.tsx
- `#e8c79a` — 1 — TelescopeField.tsx
- `#fff4e0` — 1 — TelescopeField.tsx
- `#f0ede4` — 1 — TelescopeField.tsx
- `#e2dfd6` — 1 — TelescopeField.tsx
- `#02030a` — 1 — TelescopeField.tsx
- `rgba(255,196,120,0.78)` — 1 — TelescopeField.tsx
- `rgba(160,116,255,0.72)` — 1 — TelescopeField.tsx
- `rgba(140,178,228,0.66)` — 1 — TelescopeField.tsx
- `rgba(140,178,228,0.72)` — 1 — TelescopeField.tsx
- `rgba(226,223,214,0.62)` — 1 — TelescopeField.tsx
- `rgba(226,223,214,0.3)` — 1 — TelescopeField.tsx
- `rgba(226,223,214,0.5)` — 1 — TelescopeField.tsx
- `rgba(255,216,155,0.85)` — 1 — TelescopeField.tsx
- `rgba(160,116,255,0.8)` — 1 — TelescopeField.tsx
- `rgba(195,169,255,0.34)` — 1 — TelescopeField.tsx
- `rgba(140,178,228,0.7)` — 1 — TelescopeField.tsx
- `rgba(168,189,216,0.55)` — 1 — TelescopeField.tsx
- `rgba(126,147,198,0.12)` — 1 — TelescopeField.tsx
- `rgba(126,147,198,0.8)` — 1 — TelescopeField.tsx
- `rgba(28,42,86,0.55)` — 1 — TelescopeField.tsx
- `rgba(52,28,76,0.42)` — 1 — TelescopeField.tsx
- `rgba(10,16,34,0.9)` — 1 — TelescopeField.tsx
- `rgba(126,150,214,0.085)` — 1 — TelescopeField.tsx
- `rgba(126,150,214,0.03)` — 1 — TelescopeField.tsx
- `rgba(126,150,214,0)` — 1 — TelescopeField.tsx
- `rgba(176,138,224,0.055)` — 1 — TelescopeField.tsx
- `rgba(176,138,224,0)` — 1 — TelescopeField.tsx
- `rgba(255,255,255,0.13)` — 1 — TelescopeField.tsx
- `rgba(255,216,155,0.5)` — 1 — TelescopeField.tsx
- `rgba(6,9,19,0.82)` — 1 — TelescopeField.tsx
- `rgba(6,9,19,0.62)` — 1 — TelescopeField.tsx
- `rgba(255,216,155,0.42)` — 1 — TelescopeField.tsx
- `rgba(30,44,88,0.6)` — 1 — TelescopeField.tsx
- `rgba(6,9,20,0)` — 1 — TelescopeField.tsx
- `rgba(195,169,255,0.5)` — 1 — TelescopeField.tsx
- `rgba(24,36,72,0.5)` — 1 — TelescopeField.tsx
- `rgba(5,7,15,0)` — 1 — TelescopeField.tsx
- `rgba(255,216,155,0.4)` — 1 — TelescopeField.tsx
- `rgba(13,13,16,0.5)` — 1 — TelescopeLegend.tsx
- `rgba(232,230,223,1.0)` — 1 — TelescopeLegend.tsx
- `rgba(120,200,255,0.22)` — 1 — ThemeReactionPanel.tsx
- `rgba(120,200,255,0.25)` — 1 — ThemeReactionPanel.tsx
- `#f5f4ef` — 1 — TopPharmaCompanies.tsx
- `#fac775` — 1 — TopPharmaCompanies.tsx
- `#c7c3ba` — 1 — TopPharmaCompanies.tsx
- `#161618` — 1 — TopPharmaCompanies.tsx
- `rgba(${bar_rgb},${baropacity})` — 1 — TopPharmaCompanies.tsx
- `rgba(${bar_rgb},${bar_overlay_active})` — 1 — TopPharmaCompanies.tsx
- `rgba(232,112,78,0.08)` — 1 — UserMenu.tsx
- `#151515` — 1 — adminUi.tsx
- `rgba(248,113,113,0.08)` — 1 — adminUi.tsx
- `#0a0a09` — 1 — AssetsIndexPage.tsx
- `#0e0d0c` — 1 — AssetsIndexPage.tsx
- `#111010` — 1 — AssetsIndexPage.tsx
- `#c9903c` — 1 — AssetsIndexPage.tsx
- `#7d6234` — 1 — AssetsIndexPage.tsx
- `#6f5629` — 1 — AssetsIndexPage.tsx
- `#e6e1d8` — 1 — AssetsIndexPage.tsx
- `#cfc9be` — 1 — AssetsIndexPage.tsx
- `#a9a399` — 1 — AssetsIndexPage.tsx
- `#8a8378` — 1 — AssetsIndexPage.tsx
- `#6b665e` — 1 — AssetsIndexPage.tsx
- `#544f49` — 1 — AssetsIndexPage.tsx
- `#302d29` — 1 — AssetsIndexPage.tsx
- `#201f1c` — 1 — AssetsIndexPage.tsx
- `#232120` — 1 — AssetsIndexPage.tsx
- `#191816` — 1 — AssetsIndexPage.tsx
- `#181611` — 1 — AssetsIndexPage.tsx
- `#3e3a35` — 1 — AssetsIndexPage.tsx
- `#6e6558` — 1 — AssetsIndexPage.tsx
- `#151310` — 1 — AssetsIndexPage.tsx
- `#242220` — 1 — AssetsIndexPage.tsx
- `#e8dcc4` — 1 — AssetsIndexPage.tsx
- `#7d776d` — 1 — AssetsIndexPage.tsx
- `#1a1917` — 1 — AssetsIndexPage.tsx
- `#171614` — 1 — AssetsIndexPage.tsx
- `#3a3630` — 1 — AssetsIndexPage.tsx
- `#2b2925` — 1 — AssetsIndexPage.tsx
- `rgba(232,69,69,0.12)` — 1 — MeetingReadinessBanner.tsx
- `rgba(63,184,175,0.12)` — 1 — MeetingReadinessBanner.tsx
- `rgba(232,69,69,0.18)` — 1 — OpportunityCard.tsx
- `#131619` — 1 — CohortLedger.tsx
- `#4a3618` — 1 — CohortLedger.tsx
- `#7a5520` — 1 — CohortLedger.tsx
- `#c98d33` — 1 — CohortLedger.tsx
- `#e0a94a` — 1 — CohortLedger.tsx
- `rgba(224,167,94,.05)` — 1 — CohortLedger.tsx
- `rgba(224,167,94,.08)` — 1 — CohortLedger.tsx
- `rgba(232,160,32,0.55)` — 1 — CongressCalendarPage.tsx
- `rgba(232,160,32,0.055)` — 1 — CongressCalendarPage.tsx
- `rgba(232,160,32,0.015)` — 1 — CongressCalendarPage.tsx
- `#1a1d1c` — 1 — FieldInsights.tsx
- `#141716` — 1 — InsightCard.tsx
- `#8caf94` — 1 — InsightCard.tsx
- `#9aa19b` — 1 — InsightCard.tsx
- `#2a2e2c` — 1 — InsightCard.tsx
- `#5c4419` — 1 — InsightCard.tsx
- `#8b918b` — 1 — InsightCard.tsx
- `#ddd8cd` — 1 — InsightCard.tsx
- `#71b3a7` — 1 — InsightCard.tsx
- `#2f4a46` — 1 — InsightCard.tsx
- `#d0af6e` — 1 — InsightComposer.tsx
- `#3f4542` — 1 — InsightComposer.tsx
- `rgba(6,6,7,0.74)` — 1 — Composer.tsx
- `rgba(85,102,232,0.22)` — 1 — DiscussAffordance.tsx
- `#26231d` — 1 — fiUi.tsx
- `rgba(95,169,126,0.24)` — 1 — fiUi.tsx
- `rgba(232,160,32,0.32)` — 1 — fiUi.tsx
- `rgba(85,102,232,0.30)` — 1 — fiUi.tsx
- `rgba(232,112,78,0.10)` — 1 — fiUi.tsx
- `rgba(232,112,78,0.30)` — 1 — fiUi.tsx
- `rgba(95,169,126,0.30)` — 1 — fiUi.tsx
- `rgba(232,160,32,0.07)` — 1 — fiUi.tsx
- `rgba(232,160,32,0.45)` — 1 — fiUi.tsx
- `rgba(85,102,232,0.4)` — 1 — fiUi.tsx
- `#0e1114` — 1 — ForumIndexPage.tsx
- `#0b0e11` — 1 — ForumIndexPage.tsx
- `#0c0f13` — 1 — ForumIndexPage.tsx
- `#16191e` — 1 — ForumIndexPage.tsx
- `#171a1f` — 1 — ForumIndexPage.tsx
- `#141719` — 1 — ForumIndexPage.tsx
- `#22272d` — 1 — ForumIndexPage.tsx
- `#1e2228` — 1 — ForumIndexPage.tsx
- `#c9973f` — 1 — ForumIndexPage.tsx
- `#b08b4e` — 1 — ForumIndexPage.tsx
- `#8a6c3a` — 1 — ForumIndexPage.tsx
- `#e0b063` — 1 — ForumIndexPage.tsx
- `#c07a2e` — 1 — ForumIndexPage.tsx
- `#ded9d0` — 1 — ForumIndexPage.tsx
- `#9aa1a9` — 1 — ForumIndexPage.tsx
- `#79818b` — 1 — ForumIndexPage.tsx
- `#c9d0d8` — 1 — ForumIndexPage.tsx
- `#6b747e` — 1 — ForumIndexPage.tsx
- `#5a636d` — 1 — ForumIndexPage.tsx
- `#4f5862` — 1 — ForumIndexPage.tsx
- `#3f4750` — 1 — ForumIndexPage.tsx
- `#cf8158` — 1 — ForumIndexPage.tsx
- `#98a0a8` — 1 — ForumIndexPage.tsx
- `#2b3138` — 1 — ForumIndexPage.tsx
- `#191d22` — 1 — ForumIndexPage.tsx
- `rgba(176,96,58,.5)` — 1 — ForumIndexPage.tsx
- `rgba(176,96,58,.17)` — 1 — ForumIndexPage.tsx
- `rgba(201,151,63,.38)` — 1 — ForumIndexPage.tsx
- `rgba(201,151,63,.07)` — 1 — ForumIndexPage.tsx
- `rgba(201,151,63,.09)` — 1 — ForumIndexPage.tsx
- `rgba(232,160,32,0.3)` — 1 — ModerationPage.tsx
- `rgba(232,112,78,0.1)` — 1 — ModerationPage.tsx
- `rgba(232,112,78,0.2)` — 1 — ModerationPage.tsx
- `rgba(232,160,32,0.05)` — 1 — ThreadPage.tsx
- `rgba(85,102,232,0.2)` — 1 — ThreadPage.tsx
- `rgba(232,112,78,0.24)` — 1 — ThreadPage.tsx
- `rgba(232,69,69,0.04)` — 1 — FollowUpsBucketSection.tsx
- `rgba(232,160,32,0.04)` — 1 — FollowUpsBucketSection.tsx
- `rgba(232,160,32,0.15)` — 1 — CoverageGapsTile.tsx
- `rgba(74,144,226,0.15)` — 1 — CoverageGapsTile.tsx
- `#111110` — 1 — HomePage.tsx
- `#232321` — 1 — HomePage.tsx
- `#1b1b19` — 1 — HomePage.tsx
- `#c9a25f` — 1 — HomePage.tsx
- `#e0aa4a` — 1 — HomePage.tsx
- `#e0c08a` — 1 — HomePage.tsx
- `#c8c3ba` — 1 — HomePage.tsx
- `#8a8681` — 1 — HomePage.tsx
- `#a5a097` — 1 — HomePage.tsx
- `#5d5a54` — 1 — HomePage.tsx
- `#3a3833` — 1 — HomePage.tsx
- `#b5705c` — 1 — HomePage.tsx
- `#93a9ad` — 1 — HomePage.tsx
- `#9a8cc8` — 1 — HomePage.tsx
- `#4a332c` — 1 — HomePage.tsx
- `#2f2c27` — 1 — HomePage.tsx
- `#33322e` — 1 — HomePage.tsx
- `#4a4438` — 1 — HomePage.tsx
- `#2f2c25` — 1 — HomePage.tsx
- `rgba(74,222,128,0.08)` — 1 — InviteEmailForm.tsx
- `rgba(74,222,128,0.12)` — 1 — InviteShareCard.tsx
- `#0e0f11` — 1 — AdministeredVolumeBlock.tsx
- `#1c1f22` — 1 — AdministeredVolumeBlock.tsx
- `#c9a227` — 1 — AdministeredVolumeBlock.tsx
- `#e8e6e1` — 1 — AdministeredVolumeBlock.tsx
- `#9aa7b8` — 1 — AdministeredVolumeBlock.tsx
- `#5d6166` — 1 — AdministeredVolumeBlock.tsx
- `#4e5257` — 1 — AdministeredVolumeBlock.tsx
- `#8fa88c` — 1 — AdministeredVolumeBlock.tsx
- `#2a2e32` — 1 — AdministeredVolumeBlock.tsx
- `rgba(201,162,39,.35)` — 1 — AdministeredVolumeBlock.tsx
- `rgba(201,162,39,.05)` — 1 — AdministeredVolumeBlock.tsx
- `#5b8fd6` — 1 — CommunityHcpProfile.tsx
- `#57a878` — 1 — CommunityHcpProfile.tsx
- `rgba(176,132,143,.4)` — 1 — CommunityHcpProfile.tsx
- `rgba(224,167,94,.35)` — 1 — CommunityHcpProfile.tsx
- `rgba(127,179,187,.45)` — 1 — CommunityHcpProfile.tsx
- `rgba(176,132,143,.5)` — 1 — CommunityHcpProfile.tsx
- `rgba(110,143,118,.55)` — 1 — HcpProfileBrief.tsx
- `rgba(255,255,255,.18)` — 1 — HcpProfileBrief.tsx
- `rgba(255,255,255,.10)` — 1 — HcpProfileBrief.tsx
- `#0b0c0c` — 1 — PracticeFirstProfile.tsx
- `#0d0e0e` — 1 — PracticeFirstProfile.tsx
- `#121414` — 1 — PracticeFirstProfile.tsx
- `#101212` — 1 — PracticeFirstProfile.tsx
- `#1c1e1e` — 1 — PracticeFirstProfile.tsx
- `#141616` — 1 — PracticeFirstProfile.tsx
- `#171919` — 1 — PracticeFirstProfile.tsx
- `#232626` — 1 — PracticeFirstProfile.tsx
- `#e6e2d8` — 1 — PracticeFirstProfile.tsx
- `#cfcbc0` — 1 — PracticeFirstProfile.tsx
- `#b6b2a8` — 1 — PracticeFirstProfile.tsx
- `#9a9f9b` — 1 — PracticeFirstProfile.tsx
- `#8a8f8c` — 1 — PracticeFirstProfile.tsx
- `#7f857f` — 1 — PracticeFirstProfile.tsx
- `#6b716e` — 1 — PracticeFirstProfile.tsx
- `#5c625f` — 1 — PracticeFirstProfile.tsx
- `#4d534f` — 1 — PracticeFirstProfile.tsx
- `#493a20` — 1 — PracticeFirstProfile.tsx
- `#5b8dd9` — 1 — PracticeFirstProfile.tsx
- `#2c3f5c` — 1 — PracticeFirstProfile.tsx
- `#4e9e6a` — 1 — PracticeFirstProfile.tsx
- `#22402f` — 1 — PracticeFirstProfile.tsx
- `#b8574a` — 1 — PracticeFirstProfile.tsx
- `#0f0d0a` — 1 — PracticeFirstProfile.tsx
- `#2e2416` — 1 — PracticeFirstProfile.tsx
- `#12202f` — 1 — PracticeFirstProfile.tsx
- `#101519` — 1 — PracticeFirstProfile.tsx
- `#181a19` — 1 — PracticeFirstProfile.tsx
- `#0f1010` — 1 — PracticeFirstProfile.tsx
- `rgba(79,163,199,0.14)` — 1 — PublicationCard.tsx
- `rgba(95,169,126,0.35)` — 1 — PublicationCard.tsx
- `#f0c477` — 1 — PublicationsSurface.tsx
- `#1a140a` — 1 — PublicationsSurface.tsx
- `#1c2026` — 1 — PulsePage.tsx
- `#14181d` — 1 — PulsePage.tsx
- `#2a2f36` — 1 — PulsePage.tsx
- `#3d444d` — 1 — PulsePage.tsx
- `#be914d` — 1 — PulsePage.tsx
- `#6b542f` — 1 — PulsePage.tsx
- `#7a6136` — 1 — PulsePage.tsx
- `#c9a55f` — 1 — PulsePage.tsx
- `#a9a396` — 1 — PulsePage.tsx
- `#c5bfb2` — 1 — PulsePage.tsx
- `#9aa0a8` — 1 — PulsePage.tsx
- `#8d939c` — 1 — PulsePage.tsx
- `#6d747d` — 1 — PulsePage.tsx
- `#7b8189` — 1 — PulsePage.tsx
- `#4d545d` — 1 — PulsePage.tsx
- `#4a4436` — 1 — PulsePage.tsx
- `#383d44` — 1 — PulsePage.tsx
- `#181c21` — 1 — PulsePage.tsx
- `#6e6552` — 1 — PulsePage.tsx
- `#4e4839` — 1 — PulsePage.tsx
- `#b9b1a1` — 1 — PulsePage.tsx
- `#544a35` — 1 — PulsePage.tsx
- `#1a1e24` — 1 — PulsePage.tsx
- `#101317` — 1 — PulsePage.tsx
- `#2c2f34` — 1 — PulsePage.tsx
- `#3f454d` — 1 — PulsePage.tsx
- `#171613` — 1 — TheWeekPage.tsx
- `#2b2823` — 1 — TheWeekPage.tsx
- `#26241f` — 1 — TheWeekPage.tsx
- `#23211d` — 1 — TheWeekPage.tsx
- `#c9a45e` — 1 — TheWeekPage.tsx
- `#e6c588` — 1 — TheWeekPage.tsx
- `#4a422c` — 1 — TheWeekPage.tsx
- `#ede8dd` — 1 — TheWeekPage.tsx
- `#c4beb0` — 1 — TheWeekPage.tsx
- `#b4ae9f` — 1 — TheWeekPage.tsx
- `#8f8a7c` — 1 — TheWeekPage.tsx
- `#7e7869` — 1 — TheWeekPage.tsx
- `#6e6a60` — 1 — TheWeekPage.tsx
- `#3a362d` — 1 — TheWeekPage.tsx
- `#0f0e0c` — 1 — TrialsPage.tsx
- `#0d0c0a` — 1 — TrialsPage.tsx
- `#1c1a15` — 1 — TrialsPage.tsx
- `#221f19` — 1 — TrialsPage.tsx
- `#2a251c` — 1 — TrialsPage.tsx
- `#c8892e` — 1 — TrialsPage.tsx
- `#e0a544` — 1 — TrialsPage.tsx
- `#8a6a2c` — 1 — TrialsPage.tsx
- `#b9762c` — 1 — TrialsPage.tsx
- `#e9e5d7` — 1 — TrialsPage.tsx
- `#c3bcac` — 1 — TrialsPage.tsx
- `#8d8778` — 1 — TrialsPage.tsx
- `#7e786b` — 1 — TrialsPage.tsx
- `#6a6558` — 1 — TrialsPage.tsx
- `#57534a` — 1 — TrialsPage.tsx
- `#4c483e` — 1 — TrialsPage.tsx
- `#a9bfc7` — 1 — TrialsPage.tsx

</details>

<details>
<summary><strong>Appendix B — complete spacing inventory (739 property:value pairs)</strong> (click to expand)</summary>

- `gap: 8` — 164 — CommunityHcpProfile.tsx x12, PracticeFirstProfile.tsx x12, CohortLedger.tsx x6, PublicConversation.tsx x5, ModerationPage.tsx x5 +69 more
- `gap: 10` — 127 — CommunityHcpProfile.tsx x16, HcpProfileBrief.tsx x13, ThreadPage.tsx x9, HomePage.tsx x9, TrialsPage.tsx x4 +44 more
- `gap: 6` — 120 — HcpProfileBrief.tsx x8, DetailScreen.tsx x7, CommunityHcpProfile.tsx x7, TrialsPage.tsx x6, PracticeFirstProfile.tsx x5 +57 more
- `gap: 12` — 119 — PeopleNavStrip.tsx x8, TheWeekPage.tsx x8, PracticeFirstProfile.tsx x6, FieldInsightsScreen.tsx x5, PulsePage.tsx x5 +61 more
- `marginBottom: 12` — 86 — PracticeFirstProfile.tsx x11, DetailScreen.tsx x4, CongressDetailPage.tsx x4, FieldInsightsScreen.tsx x3, LandscapeScreen.tsx x3 +49 more
- `marginBottom: 8` — 85 — DetailScreen.tsx x9, PracticeFirstProfile.tsx x7, NoteEntryScreen.tsx x5, WelcomeWizard.tsx x5, ProfileScreen.tsx x4 +38 more
- `padding: 0` — 69 — GlobalFooter.tsx x4, ScoreBreakdownV3Rising.tsx x3, FollowUpItem.tsx x3, DetailScreen.tsx x2, DOLListingModal.tsx x2 +44 more
- `marginTop: 8` — 64 — PulsePage.tsx x6, ForumIndexPage.tsx x5, HCPCard.tsx x4, PeopleNavStrip.tsx x3, ProfileScreen.tsx x3 +33 more
- `gap: 4` — 61 — DrugConstellation.tsx x6, CoverageGapsTile.tsx x5, DetailScreen.tsx x3, HCPCard.tsx x3, SearchScreen.tsx x3 +31 more
- `marginTop: 12` — 60 — ScoringExplainedModal.tsx x14, ForumIndexPage.tsx x6, PracticeFirstProfile.tsx x4, CompositionChart.tsx x3, DetailScreen.tsx x2 +23 more
- `gap: 14` — 60 — TelescopeField.tsx x6, HomePage.tsx x6, PublicConversation.tsx x5, TheWeekPage.tsx x5, HcpProfileBrief.tsx x4 +25 more
- `margin: 0` — 56 — GlobalFooter.tsx x4, ThreadPage.tsx x4, ScoringExplainedModal.tsx x3, HomePage.tsx x3, AdministeredVolumeBlock.tsx x3 +32 more
- `gap: 9` — 48 — PublicConversation.tsx x5, CohortLedger.tsx x5, ForumIndexPage.tsx x5, CompositionChart.tsx x4, HomePage.tsx x4 +15 more
- `marginBottom: 16` — 46 — PracticeFirstProfile.tsx x5, ProfileScreen.tsx x4, ContactAccessCard.tsx x3, DetailScreen.tsx x2, ScoreBreakdownV3.tsx x2 +26 more
- `marginBottom: 4` — 45 — ContactAccessCard.tsx x4, CongressCalendarPage.tsx x4, PracticeFirstProfile.tsx x4, TelescopeDrawer.tsx x3, InviteModal.tsx x3 +24 more
- `gap: 16` — 45 — TheWeekPage.tsx x7, PublicConversation.tsx x3, ForumIndexPage.tsx x3, FullCareerView.tsx x3, FieldInsightsScreen.tsx x2 +23 more
- `marginTop: 4` — 43 — CommunityExplorer.tsx x2, DOLPostModal.tsx x2, LandscapeScreen.tsx x2, ScoreBreakdownV3.tsx x2, SearchBar.tsx x2 +31 more
- `gap: 7` — 42 — TrialsPage.tsx x10, PeopleNavStrip.tsx x3, CohortLedger.tsx x3, ModerationPage.tsx x3, HomePage.tsx x3 +14 more
- `marginBottom: 6` — 41 — ScoringExplainedModal.tsx x9, InsightComposer.tsx x3, ContactAccessCard.tsx x2, DetailScreen.tsx x2, LandingNow.tsx x2 +19 more
- `marginBottom: 10` — 34 — PracticeFirstProfile.tsx x13, LandscapeScreen.tsx x3, PublicConversation.tsx x2, SignupScreen.tsx x2, SuggestHashtagModal.tsx x2 +11 more
- `marginBottom: 14` — 34 — PracticeFirstProfile.tsx x12, DetailScreen.tsx x4, RightRail.tsx x3, PeopleNavStrip.tsx x2, ScoreBreakdownV3Rising.tsx x2 +10 more
- `marginTop: 16` — 32 — ForumIndexPage.tsx x5, DetailScreen.tsx x4, CompositionChart.tsx x4, LandscapeScreen.tsx x3, ProfileScreen.tsx x2 +13 more
- `marginTop: 6` — 32 — ScoringExplainedModal.tsx x5, HCPCard.tsx x3, ScoreBreakdownV3.tsx x3, PulsePage.tsx x3, DOLListingModal.tsx x2 +16 more
- `margin: 0 auto` — 30 — CommunityExplorer.tsx x5, InstitutionRoute.tsx x2, NavBar.tsx x2, ProfileScreen.tsx x2, AssetPage.tsx x2 +17 more
- `marginTop: 14` — 29 — ForumIndexPage.tsx x5, PracticeFirstProfile.tsx x5, InsightComposer.tsx x4, PublicConversation.tsx x2, ScoreBreakdownV3Rising.tsx x2 +10 more
- `gap: 20` — 26 — PracticeFirstProfile.tsx x3, InstitutionsIndexRoute.tsx x2, NavBar.tsx x2, PublicConversation.tsx x2, PublicationsSurface.tsx x2 +15 more
- `marginTop: 2` — 26 — PracticeFirstProfile.tsx x3, DetailScreen.tsx x2, ScoreBreakdownV3.tsx x2, CohortLedger.tsx x2, HCPCard.tsx +16 more
- `padding: 3px 8px` — 26 — CoverageGapsTile.tsx x4, HCPCard.tsx x3, BriefHeader.tsx x3, DetailScreen.tsx x2, OpportunityCard.tsx x2 +9 more
- `padding: 10px 12px` — 26 — DetailScreen.tsx x3, HCPCard.tsx x2, SurfaceHCPForm.tsx x2, DOLPostModal.tsx, FieldInsightsScreen.tsx +17 more
- `marginTop: 10` — 26 — ForumIndexPage.tsx x5, SocialCard.tsx x3, DiscussAffordance.tsx x3, PracticeFirstProfile.tsx x3, CompositionChart.tsx x2 +10 more
- `padding: 16` — 25 — FilterDrawer.tsx x3, AddToWatchlistPopover.tsx x2, ScoreBreakdownV3.tsx x2, FollowUpsBucketSection.tsx x2, DetailScreen.tsx +15 more
- `padding: 12` — 25 — LandscapeScreen.tsx x3, TelescopeDrawer.tsx x3, SearchScreen.tsx x2, InsightCard.tsx x2, InsightComposer.tsx x2 +11 more
- `gap: 24` — 25 — BriefPage.tsx x3, ForumIndexPage.tsx x3, CommunityHcpProfile.tsx x3, PracticeFirstProfile.tsx x3, TheWeekPage.tsx x3 +7 more
- `gap: 5` — 23 — CohortLedger.tsx x3, HomePage.tsx x3, AssetsIndexPage.tsx x2, CompositionChart.tsx x2, ForumIndexPage.tsx x2 +10 more
- `gap: 2` — 22 — PracticeFirstProfile.tsx x4, PulsePage.tsx x3, CongressCalendarPage.tsx x2, PublicationsSurface.tsx x2, HCPCard.tsx +10 more
- `gap: 1` — 21 — ForumIndexPage.tsx x6, CompositionChart.tsx x4, PracticeFirstProfile.tsx x3, HCPCard.tsx x2, InstitutionRoute.tsx +5 more
- `padding: 8px 12px` — 20 — InsightCard.tsx x5, EditWatchlistModal.tsx x2, FieldInsightsScreen.tsx, FieldIntelligenceShared.tsx, NoteEntryScreen.tsx +10 more
- `marginLeft: auto` — 18 — ForumIndexPage.tsx x3, FullCareerView.tsx x3, PublicationsSurface.tsx x3, HomePage.tsx x2, CommunityExplorer.tsx +6 more
- `padding: 2px 6px` — 18 — fiUi.tsx x4, TrackedHcpsList.tsx x2, CommunityExplorer.tsx, HCPCard.tsx, MiniCollaboratorNetwork.tsx +9 more
- `padding: 4` — 17 — CohortLedger.tsx x2, BeliefClaimReactionPanel.tsx, CityFeedScreen.tsx, DetailScreen.tsx, DOLListingModal.tsx +11 more
- `marginBottom: 20` — 17 — DetailScreen.tsx x4, WelcomeWizard.tsx x4, NoteEntryScreen.tsx x3, EvidenceDrawer.tsx, AdminPage.tsx +4 more
- `padding: 8px 14px` — 16 — DashboardTabs.tsx x3, FollowUpRow.tsx x3, Composer.tsx x2, SocialTrackEmpty.tsx, fiUi.tsx +6 more
- `marginBottom: 24` — 16 — FieldInsightsScreen.tsx x2, HcpPositionsPage.tsx x2, ScientificNarrativeSection.tsx x2, SignupScreen.tsx x2, TelescopeDrawer.tsx x2 +6 more
- `padding: 4px 8px` — 15 — DetailScreen.tsx x2, FollowUpItem.tsx x2, TrialsPage.tsx x2, AddToWatchlistPopover.tsx, HCPCard.tsx +7 more
- `paddingTop: 12` — 14 — PracticeFirstProfile.tsx x3, RisingVoicesChart.tsx x2, HcpProfileBrief.tsx x2, ActionTray.tsx, DOLListingModal.tsx +5 more
- `padding: 3px 7px` — 14 — PublicConversation.tsx x5, InstitutionsIndexRoute.tsx x2, CommunityHcpProfile.tsx x2, CommunityExplorer.tsx, InstitutionRoute.tsx +3 more
- `padding: 6px 10px` — 14 — DiscussAffordance.tsx x3, PeopleNavStrip.tsx x2, FollowUpsList.tsx x2, FieldInsightsScreen.tsx, HcpPositionsPage.tsx +5 more
- `paddingTop: 2` — 14 — TrialsPage.tsx x3, CohortLedger.tsx x2, ForumIndexPage.tsx x2, CommunityHcpProfile.tsx x2, HcpProfileBrief.tsx x2 +3 more
- `padding: 0 16px` — 13 — LandscapeQuadrantChart.tsx x3, SearchScreen.tsx x2, ActionTray.tsx, CityFeedScreen.tsx, DOLHeroPanel.tsx +5 more
- `padding: 24` — 13 — Composer.tsx x2, AuthWrapper.tsx, FieldIntelligenceShared.tsx, InviteColleaguesButton.tsx, NavBar.tsx +7 more
- `padding: 12px 0` — 13 — TelescopeField.tsx x2, BeliefClaimReactionPanel.tsx, DetailScreen.tsx, DrugConstellation.tsx, PeopleNavStrip.tsx +7 more
- `gap: 3` — 13 — TelescopeField.tsx x2, HcpProfileBrief.tsx x2, DrugConstellation.tsx, HCPCard.tsx, ScientificNarrativeSection.tsx +6 more
- `padding: 6px 12px` — 13 — IndicationFilter.tsx x2, NoteEntryScreen.tsx x2, ProfileScreen.tsx x2, FilterDrawer.tsx, InstitutionsIndexRoute.tsx +5 more
- `padding: 16px 18px` — 13 — ForumIndexPage.tsx x2, PracticeFirstProfile.tsx x2, HcpPositionsPage.tsx, InstitutionsInTerritoryPanel.tsx, CompositionChart.tsx +6 more
- `gap: 11` — 13 — TelescopeField.tsx x4, ForumIndexPage.tsx x3, LinkedInAuthScreen.tsx, CongressDetailPage.tsx, Composer.tsx +3 more
- `gap: 18` — 13 — TheWeekPage.tsx x3, ForumIndexPage.tsx x2, ThreadPage.tsx x2, NavBar.tsx, PeopleNavStrip.tsx +4 more
- `padding: 8px 10px` — 12 — InviteModal.tsx x3, AddToWatchlistPopover.tsx, BeliefClaimReactionPanel.tsx, LandscapeLeaderboard.tsx, ThemeReactionPanel.tsx +5 more
- `padding: 10px 0` — 12 — CompositionChart.tsx x3, PeopleNavStrip.tsx x2, DrugConstellation.tsx, AssetsIndexPage.tsx, CollapsibleSection.tsx +4 more
- `paddingTop: 10` — 12 — CohortLedger.tsx x5, AssetsIndexPage.tsx x2, FieldInsightsScreen.tsx, PublicConversation.tsx, SocialAnalyticsBanner.tsx +2 more
- `marginTop: 5` — 12 — PulsePage.tsx x7, HCPCard.tsx, LandscapeScreen.tsx, SearchScreen.tsx, CompositionChart.tsx +1 more
- `padding: 20` — 11 — SocialAnalyticsBanner.tsx x5, ModerationPage.tsx x2, BeliefClaimReactionPanel.tsx, SuggestHashtagModal.tsx, adminUi.tsx +1 more
- `marginTop: 24` — 11 — SignupScreen.tsx x2, BriefPage.tsx x2, ContextualizeHCPForm.tsx, SearchScreen.tsx, AdminInvites.tsx +4 more
- `marginBottom: 7` — 11 — DetailScreen.tsx x4, PracticeFirstProfile.tsx x3, InstitutionsIndexRoute.tsx, AssetsIndexPage.tsx, CongressCalendarPage.tsx +1 more
- `padding: 24px 0` — 11 — DOLPostModal.tsx x3, HcpPublicationsPage.tsx x3, EvidenceDrawer.tsx x2, HcpPositionsPage.tsx x2, DetailScreen.tsx
- `paddingTop: 16` — 11 — DOLPostModal.tsx x2, ForumIndexPage.tsx x2, PulsePage.tsx x2, DetailScreen.tsx, CongressDetailPage.tsx +3 more
- `padding: 12px 14px` — 11 — ModerationPage.tsx x2, ThreadPage.tsx x2, NavBar.tsx, SearchBar.tsx, TopPharmaCompanies.tsx +4 more
- `marginTop: 9` — 11 — ForumIndexPage.tsx x5, PulsePage.tsx x4, PublicConversation.tsx, CompositionChart.tsx
- `padding: 8px 16px` — 11 — FollowUpRow.tsx x2, StartHereCard.tsx x2, BriefPage.tsx, EmptyInsightsState.tsx, FieldInsights.tsx +4 more
- `marginTop: 11` — 10 — AssetsIndexPage.tsx x2, InsightCard.tsx x2, ForumIndexPage.tsx x2, CommunityExplorer.tsx, PublicConversation.tsx +2 more
- `padding: 16px 16px 12px` — 10 — DetailScreen.tsx x7, DOLListingModal.tsx, NoteEntryScreen.tsx, ResearchThemesSection.tsx
- `padding: 14px 16px` — 10 — AssetPage.tsx x2, CongressDetailPage.tsx x2, DetailScreen.tsx, ScoringExplainedModal.tsx, ForumIndexPage.tsx +3 more
- `padding: 2px 8px` — 10 — HCPCard.tsx x6, DOLPostModal.tsx, HcpPositionsPage.tsx, TeamIntelligenceTile.tsx, PublicationCard.tsx
- `padding: 0 12px` — 10 — InsightComposer.tsx x3, InviteColleaguesButton.tsx, NavBar.tsx, SearchBar.tsx, SignupScreen.tsx +3 more
- `padding: 20px 22px` — 10 — PracticeFirstProfile.tsx x6, CongressCalendarPage.tsx x2, HomePage.tsx, CommunityHcpProfile.tsx
- `padding: 18px 20px` — 9 — CongressDetailPage.tsx x4, PeopleNavStrip.tsx x2, FieldInsightsScreen.tsx, ScientificNarrativeSection.tsx, HomePage.tsx
- `margin: 0 0 16px 0` — 9 — OpportunityCard.tsx, HomeHero.tsx, InviteModal.tsx, StartHereCard.tsx, TeamIntelligenceTile.tsx +4 more
- `paddingBottom: 8` — 8 — ActionTray.tsx, FieldInsightsScreen.tsx, PublicConversation.tsx, TopPharmaCompanies.tsx, AdminKillSwitch.tsx +3 more
- `marginTop: 3` — 8 — CommunityExplorer.tsx x2, LinkedInAuthScreen.tsx, SignupScreen.tsx, CohortLedger.tsx, CongressCalendarPage.tsx +2 more
- `gap: 26` — 8 — ForumIndexPage.tsx x2, InstitutionRoute.tsx, PeopleNavStrip.tsx, CongressDetailPage.tsx, HomePage.tsx +2 more
- `paddingTop: 4` — 8 — HcpProfileBrief.tsx x2, InstitutionsIndexRoute.tsx, PublicConversation.tsx, AssetsIndexPage.tsx, ModerationPage.tsx +2 more
- `padding: 9px 0` — 8 — PulsePage.tsx x2, PeopleNavStrip.tsx, CongressDetailPage.tsx, CommunityHcpProfile.tsx, PracticeFirstProfile.tsx +2 more
- `padding: 48px 0` — 8 — HomePage.tsx x2, PublicationsListPage.tsx x2, AdminPage.tsx, FollowUpsPage.tsx, TrackedHcpsList.tsx +1 more
- `padding: 18px 22px` — 8 — HcpProfileBrief.tsx x4, CommunityHcpProfile.tsx x3, AdministeredVolumeBlock.tsx
- `paddingTop: 8` — 7 — CohortLedger.tsx x2, CollapsibleFilterSection.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, PracticeFirstProfile.tsx +1 more
- `padding: 8px 0` — 7 — DetailScreen.tsx, InstitutionResearchThemesPanel.tsx, NoteEntryScreen.tsx, PeopleNavStrip.tsx, TelescopeField.tsx +2 more
- `marginTop: 7` — 7 — PulsePage.tsx x3, HCPCard.tsx, AssetPage.tsx, CongressDetailPage.tsx, ForumIndexPage.tsx
- `paddingBottom: 9` — 7 — PulsePage.tsx x2, PeopleNavStrip.tsx, CompositionChart.tsx, RightRail.tsx, CohortLedger.tsx +1 more
- `padding: 10px 14px` — 6 — AddToWatchlistPopover.tsx, HCPCard.tsx, SocialTrackEmpty.tsx, PracticeFirstProfile.tsx, FollowUpItem.tsx +1 more
- `marginLeft: 8` — 6 — LandscapeScreen.tsx x2, AddToWatchlistPopover.tsx, MiniCollaboratorNetwork.tsx, RisingVoicesChart.tsx, UserMenu.tsx
- `paddingBottom: 12` — 6 — HomePage.tsx x2, PracticeFirstProfile.tsx x2, CollapsibleFilterSection.tsx, PulsePage.tsx
- `padding: 2px 7px` — 6 — CommunityExplorer.tsx x2, ResearchThemeChip.tsx, TopPharmaCompanies.tsx, ModerationPage.tsx, ThreadPage.tsx
- `padding: 12px 16px` — 6 — FieldInsightsScreen.tsx, InstitutionCollaborationsPanel.tsx, InstitutionResearchThemesPanel.tsx, TelescopeLegend.tsx, AssetPage.tsx +1 more
- `margin: 0 0 12px 0` — 6 — InviteColleaguesButton.tsx, NavBar.tsx, InviteModal.tsx, TeamIntelligenceTile.tsx, CreateWatchlistModal.tsx +1 more
- `gap: 22` — 6 — TrialsPage.tsx x2, LinkedInAuthScreen.tsx, PeopleNavStrip.tsx, ModerationPage.tsx, PublicationsSurface.tsx
- `marginBottom: 9` — 6 — PublicConversation.tsx x4, AssetsIndexPage.tsx, CongressCalendarPage.tsx
- `paddingBottom: 6` — 6 — FullCareerView.tsx x2, TelescopeField.tsx, CollapsibleSection.tsx, HcpProfileBrief.tsx, PublicationsSurface.tsx
- `gap: 40` — 6 — HomePage.tsx x2, AssetPage.tsx, CompositionChart.tsx, AdministeredVolumeBlock.tsx, HcpProfileBrief.tsx
- `padding: 24px 26px` — 6 — TheWeekPage.tsx x3, RightRail.tsx x2, ForumIndexPage.tsx
- `paddingTop: 14` — 6 — CohortLedger.tsx x2, PublicationsSurface.tsx x2, FullCareerView.tsx, TrialsPage.tsx
- `marginBottom: 5` — 6 — CongressDetailPage.tsx x5, PulseCaveats.tsx
- `padding: 11px 14px` — 6 — TrialsPage.tsx x4, PracticeFirstProfile.tsx x2
- `marginRight: 8` — 5 — StatusEditor.tsx x2, AddToWatchlistPopover.tsx, ProfileScreen.tsx, FollowUpItem.tsx
- `padding: 0 24px` — 5 — CommunityExplorer.tsx, SearchScreen.tsx, SignupScreen.tsx, WelcomeWizard.tsx, ForumIndexPage.tsx
- `margin: 0 0 16px` — 5 — AssetsIndexPage.tsx x2, ContextualizeHCPForm.tsx, SuggestHashtagModal.tsx, adminUi.tsx
- `marginTop: 20` — 5 — DetailScreen.tsx, DOLPostModal.tsx, InstitutionRoute.tsx, ForumIndexPage.tsx, PulsePage.tsx
- `marginBottom: 0` — 5 — DrugConstellation.tsx, ScientificNarrativeSection.tsx, ScoreBreakdownV3Rising.tsx, WelcomeWizard.tsx, FollowUpsHero.tsx
- `padding: 3px 10px` — 5 — ScientificNarrativeSection.tsx x2, FieldInsightsScreen.tsx, AdminInvites.tsx, AdminUsers.tsx
- `marginTop: 40` — 5 — PulsePage.tsx x3, FieldIntelligenceShared.tsx, SignupScreen.tsx
- `padding: 10px 16px` — 5 — FilterDrawer.tsx x2, ForumIndexPage.tsx x2, PracticeFirstProfile.tsx
- `padding: 6px 14px` — 5 — IndicationFilter.tsx, SuggestHashtagModal.tsx, TAFilterChips.tsx, adminUi.tsx, InsightComposer.tsx
- `paddingLeft: 14` — 5 — PulsePage.tsx x2, InstitutionsIndexRoute.tsx, WelcomeWizard.tsx, PracticeFirstProfile.tsx
- `padding: 0 14px` — 5 — PulsePage.tsx x4, NavBar.tsx
- `padding: 3px 6px` — 5 — PublicConversation.tsx x2, CongressDetailPage.tsx x2, InsightCard.tsx
- `margin: 0 0 12px` — 5 — AssetsIndexPage.tsx x2, ScoringExplainedModal.tsx, SuggestHashtagModal.tsx, CompositionChart.tsx
- `paddingLeft: 20` — 5 — ScoringExplainedModal.tsx x2, ThreadPage.tsx x2, TeamIntelligenceTile.tsx
- `padding: 1px 6px` — 5 — HcpProfileBrief.tsx x3, AdminUsers.tsx, CohortLedger.tsx
- `marginTop: 18` — 5 — ForumIndexPage.tsx x2, AssetPage.tsx, CongressCalendarPage.tsx, PracticeFirstProfile.tsx
- `marginTop: 13` — 5 — ForumIndexPage.tsx x3, AssetsIndexPage.tsx, RightRail.tsx
- `margin: 0 0 8px 0` — 5 — WatchlistsEmptyState.tsx x2, HomeHero.tsx, InviteModal.tsx, TeamIntelligenceTile.tsx
- `padding: 14px 20px` — 5 — HomePage.tsx x3, AdministeredVolumeBlock.tsx, CommunityHcpProfile.tsx
- `paddingBottom: 14` — 5 — PulsePage.tsx x2, CommunityHcpProfile.tsx, PracticeFirstProfile.tsx, PublicationsSurface.tsx
- `padding: 7px 13px` — 5 — HcpProfileBrief.tsx x3, PracticeFirstProfile.tsx, ProfileRelationshipControls.tsx
- `marginBottom: 18` — 5 — PracticeFirstProfile.tsx x5
- `padding: 22px 28px 26px` — 5 — PracticeFirstProfile.tsx x5
- `padding: 6px 8px` — 4 — AddToWatchlistPopover.tsx, SocialCard.tsx, PracticeFirstProfile.tsx, TrackedHcpsFilterBar.tsx
- `padding: 4px 10px` — 4 — AddToWatchlistPopover.tsx, ScientificNarrativeSection.tsx, TelescopeDrawer.tsx, YourInstitutionsTile.tsx
- `padding: 16px` — 4 — BibliographyScreen.tsx, RisingVoicesChart.tsx, FieldInsights.tsx, RelationshipSection.tsx
- `padding: 7px 12px` — 4 — CommunityExplorer.tsx x3, PublicationList.tsx
- `padding: 20px 0` — 4 — adminUi.tsx x2, CommunityExplorer.tsx, ScientificNarrativeSection.tsx
- `columnGap: 16` — 4 — AdministeredVolumeBlock.tsx x2, DetailScreen.tsx, GlobalFooter.tsx
- `marginTop: 1` — 4 — DetailScreen.tsx, MiniCollaboratorNetwork.tsx, ForumIndexPage.tsx, PulseEvents.tsx
- `margin: 0 0 8px` — 4 — ScoringExplainedModal.tsx x2, DetailScreen.tsx, FieldInsightsScreen.tsx
- `paddingLeft: 16` — 4 — DetailScreen.tsx x2, GlobalFooter.tsx, InstitutionRoute.tsx
- `marginLeft: 2` — 4 — FieldInsightsScreen.tsx, HCPCard.tsx, InsightCard.tsx, PulsePage.tsx
- `margin: 0 16px 12px` — 4 — SocialTrackEmpty.tsx x2, HCPCard.tsx, SocialAnalyticsBanner.tsx
- `padding: 16px 0` — 4 — YourInstitutionsTile.tsx x2, InstitutionResearchThemesPanel.tsx, PulsePage.tsx
- `paddingTop: 3` — 4 — InstitutionRoute.tsx, InstitutionsIndexRoute.tsx, HomePage.tsx, PulsePage.tsx
- `paddingTop: 6` — 4 — InstitutionRoute.tsx, CommunityHcpProfile.tsx, HcpProfileBrief.tsx, PulsePage.tsx
- `paddingBottom: 4` — 4 — InstitutionsInTerritoryPanel.tsx, PeopleNavStrip.tsx, HcpProfileBrief.tsx, WatchlistsSidebar.tsx
- `marginBottom: 32` — 4 — LandscapeQuadrantChart.tsx, LandscapeScreen.tsx, ScientificNarrativeSection.tsx, WelcomeWizard.tsx
- `padding: 16px 16px 8px` — 4 — SearchScreen.tsx x2, LandscapeRoute.tsx, ThemeList.tsx
- `margin-top: 4px` — 4 — LandscapeScreen.tsx x4
- `marginLeft: 6` — 4 — LandscapeScreen.tsx, OverdueFollowUpsTile.tsx, StartHereCard.tsx, PracticeFirstProfile.tsx
- `paddingBottom: 10` — 4 — LandscapeScreen.tsx x2, HomePage.tsx, HcpProfileBrief.tsx
- `gap: 30` — 4 — LinkedInAuthScreen.tsx, AssetsIndexPage.tsx, ForumIndexPage.tsx, TheWeekPage.tsx
- `gap: 13` — 4 — TelescopeField.tsx x2, LinkedInAuthScreen.tsx, TheWeekPage.tsx
- `marginTop: 22` — 4 — ForumIndexPage.tsx x2, PeopleNavStrip.tsx, ThemeList.tsx
- `gap: 32` — 4 — PeopleNavStrip.tsx, SocialAnalyticsBanner.tsx, TelescopeField.tsx, PracticeFirstProfile.tsx
- `padding: 4px 0` — 4 — ScoreBreakdownV3.tsx x2, PulsePage.tsx, TheWeekPage.tsx
- `marginBottom: 2` — 4 — SocialAnalyticsBanner.tsx, CoverageGapsTile.tsx, NextActionsTile.tsx, OverdueFollowUpsTile.tsx
- `padding: 14` — 4 — TelescopeField.tsx, ModerationPage.tsx, ThreadPage.tsx, PracticeFirstProfile.tsx
- `gap: 28` — 4 — TelescopeField.tsx, AssetsIndexPage.tsx, PracticeFirstProfile.tsx, PulsePage.tsx
- `gap: 0` — 4 — TrackSwitch.tsx, BriefPage.tsx, InsightCard.tsx, PulsePage.tsx
- `marginTop: 32` — 4 — WelcomeWizard.tsx x2, FollowUpsPage.tsx x2
- `padding: 3px 0` — 4 — AssetsIndexPage.tsx x3, TrialsPage.tsx
- `padding: 4px 6px` — 4 — LandingNow.tsx x2, HomePage.tsx, PracticeFirstProfile.tsx
- `padding: 8` — 4 — InsightComposer.tsx, SnoozePicker.tsx, FollowUpItem.tsx, FollowUpsList.tsx
- `gap: 36` — 4 — ForumIndexPage.tsx x2, FollowUpsPage.tsx, HcpProfileBrief.tsx
- `marginTop: 28` — 4 — PulsePage.tsx x3, ForumIndexPage.tsx
- `padding: 4px 9px` — 4 — TrialsPage.tsx x3, ThreadPage.tsx
- `padding: 16px 20px` — 4 — HcpProfileBrief.tsx x2, FollowUpRow.tsx, AdministeredVolumeBlock.tsx
- `padding: 4px 7px` — 4 — HomePage.tsx, FullCareerView.tsx, PublicationsSurface.tsx, PulsePage.tsx
- `padding: 40px 24px` — 4 — CommunityHcpProfile.tsx x2, HcpProfileBrief.tsx x2
- `padding: 13px 0` — 4 — HcpProfileBrief.tsx, FullCareerView.tsx, PublicationsSurface.tsx, TheWeekPage.tsx
- `padding: 22px 28px 24px` — 4 — PracticeFirstProfile.tsx x4
- `paddingRight: 14` — 4 — PulsePage.tsx x4
- `paddingBottom: 24` — 3 — CityFeedScreen.tsx, SocialTrackEmpty.tsx, FollowUpsHero.tsx
- `marginRight: 3` — 3 — CommunityExplorer.tsx x2, ThemeList.tsx
- `marginLeft: 4` — 3 — CommunityExplorer.tsx, SocialAnalyticsBanner.tsx, SocialTrackEmpty.tsx
- `padding: 7px 10px` — 3 — CommunityExplorer.tsx, AssetPage.tsx, CohortLedger.tsx
- `padding: 9px 12px` — 3 — DetailScreen.tsx, AssetsIndexPage.tsx, TrialsPage.tsx
- `padding: 10` — 3 — DOLListingModal.tsx, LandscapeQuadrantChart.tsx, SocialCard.tsx
- `marginLeft: 12` — 3 — EvidenceDrawer.tsx, InstitutionExternalPartnersPanel.tsx, TopPharmaCompanies.tsx
- `paddingTop: 24` — 3 — ThreadPage.tsx x2, GlobalFooter.tsx
- `padding: 48px 28px` — 3 — InstitutionsIndexRoute.tsx x2, InstitutionRoute.tsx
- `paddingTop: 1` — 3 — LandscapeLeaderboard.tsx, CohortLedger.tsx, ForumIndexPage.tsx
- `paddingBottom: 2` — 3 — LinkedInAuthScreen.tsx, NoteEntryScreen.tsx, TrialsPage.tsx
- `padding: 7px 11px` — 3 — DiscussAffordance.tsx x2, PeopleNavStrip.tsx
- `padding: 0 20px` — 3 — PeopleNavStrip.tsx x2, SignupScreen.tsx
- `padding: 13px 20px` — 3 — PeopleNavStrip.tsx, ForumIndexPage.tsx, HomePage.tsx
- `padding: 6px 11px` — 3 — PublicationsSurface.tsx x2, PeopleNavStrip.tsx
- `padding: 20px 16px 16px` — 3 — ProfileScreen.tsx x3
- `marginTop: auto` — 3 — PublicConversation.tsx, ScoreKpiTile.tsx, CongressCalendarPage.tsx
- `margin: 14px 0 0` — 3 — AssetsIndexPage.tsx x2, ResearchThemesSection.tsx
- `margin: 0 16px` — 3 — SearchBar.tsx, HomePage.tsx, TrialsPage.tsx
- `margin: 0 0 6px` — 3 — SocialTrackEmpty.tsx x3
- `padding: 11px 18px` — 3 — HomePage.tsx x2, TelescopeField.tsx
- `padding: 0 22px` — 3 — TelescopeField.tsx x3
- `padding: 13px 22px` — 3 — TelescopeField.tsx x2, ForumIndexPage.tsx
- `margin: 0 0 14px` — 3 — AssetsIndexPage.tsx x2, ThemeList.tsx
- `padding: 7px 0` — 3 — AssetsIndexPage.tsx, CohortLedger.tsx, CommunityHcpProfile.tsx
- `padding: 14px 0` — 3 — LandingNow.tsx, HcpProfileBrief.tsx, TheWeekPage.tsx
- `padding: 11px 0` — 3 — RightRail.tsx, PulseEvents.tsx, PulsePage.tsx
- `padding: 1px 5px` — 3 — CohortLedger.tsx, PublicationCard.tsx, TrialsPage.tsx
- `padding: 11px 20px` — 3 — PulsePage.tsx x2, CohortLedger.tsx
- `margin: 20px 22px 0` — 3 — ForumIndexPage.tsx x3
- `padding: 18` — 3 — ThreadPage.tsx x2, HomePage.tsx
- `margin: 0 20px` — 3 — HomePage.tsx x3
- `margin: 0 28px` — 3 — TrialsPage.tsx x2, HomePage.tsx
- `padding: 10px 20px` — 3 — AdministeredVolumeBlock.tsx, CommunityHcpProfile.tsx, PublicationsListPage.tsx
- `padding: 22px 24px 20px` — 3 — CommunityHcpProfile.tsx x3
- `padding: 16px 22px` — 3 — CommunityHcpProfile.tsx x3
- `padding: 40px 28px` — 3 — PracticeFirstProfile.tsx x2, TrialsPage.tsx
- `padding: 16px 18px 18px` — 3 — PracticeFirstProfile.tsx x3
- `margin: 0 -8px` — 3 — PracticeFirstProfile.tsx x3
- `padding: 5px 10px` — 3 — PracticeFirstProfile.tsx, PulseConfidence.tsx, TrialsPage.tsx
- `padding: 9` — 3 — PracticeFirstProfile.tsx x3
- `padding: isDesktop ? "28px 32px" : "22px` — 3 — TheWeekPage.tsx x3
- `padding: 8px 20px` — 2 — AuthWrapper.tsx, CommunityHcpProfile.tsx
- `padding: 12px 16px 8px` — 2 — CityFeedScreen.tsx, rightRailStyles.ts
- `padding: 8px 16px 12px` — 2 — DashboardTabs.tsx, SearchBar.tsx
- `margin: 0 8px` — 2 — DetailScreen.tsx, InstitutionCollaborationsPanel.tsx
- `padding: isWide ? 24 : 0` — 2 — DOLListingModal.tsx, DOLPostModal.tsx
- `margin: isWide ? undefined : "0 auto` — 2 — DOLListingModal.tsx, DOLPostModal.tsx
- `paddingBottom: 16` — 2 — DOLPostModal.tsx, GlobalFooter.tsx
- `padding: 4px 12px` — 2 — DrugConstellation.tsx, ProfileScreen.tsx
- `paddingBottom: 1` — 2 — EvidenceDrawer.tsx x2
- `padding: 64px 24px` — 2 — FieldInsightsScreen.tsx, PulsePage.tsx
- `marginBottom: -1` — 2 — FieldInsightsScreen.tsx, TelescopeField.tsx
- `padding: 12px 20px` — 2 — FieldIntelligenceShared.tsx, CommunityHcpProfile.tsx
- `padding: 24px 16px` — 2 — FieldIntelligenceShared.tsx, EmptyInsightsState.tsx
- `padding: 0 4px` — 2 — FilterDrawer.tsx, InsightCard.tsx
- `padding: 0 16px 12px` — 2 — IndicationFilter.tsx, TelescopeLegend.tsx
- `padding: 20px 24px` — 2 — InstitutionResearchThemesPanel.tsx, HcpProfileBrief.tsx
- `paddingTop: 5` — 2 — InstitutionRoute.tsx, CohortLedger.tsx
- `padding: 22px ${pad` — 2 — InstitutionRoute.tsx x2
- `padding: 24px ${pad` — 2 — InstitutionRoute.tsx x2
- `padding: 15px 16px` — 2 — InstitutionsIndexRoute.tsx, HomePage.tsx
- `padding: isMobile ? "12px 16px" : "14px 28px` — 2 — InstitutionsIndexRoute.tsx x2
- `margin: 0 16px 16px` — 2 — InstitutionsInTerritoryPanel.tsx, RisingVoicesChart.tsx
- `margin: 16px 0 12px` — 2 — InviteColleaguesButton.tsx, NavBar.tsx
- `padding: 16px 16px 0` — 2 — LandscapeScreen.tsx, SearchScreen.tsx
- `gap: isMobile ? 10 : 12` — 2 — LinkedInAuthScreen.tsx x2
- `gap: isMobile ? 6 : 8` — 2 — LinkedInAuthScreen.tsx x2
- `padding: 0 15px` — 2 — LinkedInAuthScreen.tsx x2
- `padding: 6px 0` — 2 — MiniCollaboratorNetwork.tsx, CohortLedger.tsx
- `paddingBottom: 3` — 2 — NavBar.tsx, CommunityHcpProfile.tsx
- `padding: 12px` — 2 — NoteEntryScreen.tsx, TrackedHcpsList.tsx
- `padding: 12px 16px 0` — 2 — PeopleNavStrip.tsx x2
- `paddingBottom: 11` — 2 — PeopleNavStrip.tsx x2
- `padding: 48px 24px` — 2 — PublicConversation.tsx x2
- `padding: 14px 18px` — 2 — PublicConversation.tsx, TelescopeField.tsx
- `padding: 16px ${narrow ? 18 : 28` — 2 — PublicConversation.tsx x2
- `padding: narrow ? "12px 18px" : "16px 22px` — 2 — PublicConversation.tsx x2
- `padding: 2px 0 2px 20px` — 2 — PublicConversation.tsx x2
- `padding: 20px 24px 0` — 2 — ScientificNarrativeSection.tsx x2
- `marginBottom: 22` — 2 — ScientificNarrativeSection.tsx, HcpPublicationsPage.tsx
- `padding: 8px 6px` — 2 — ScoreBreakdownV3.tsx, ThemeList.tsx
- `margin: 24px 0` — 2 — ScoringExplainedModal.tsx, SignupScreen.tsx
- `margin: 0 16px 8px` — 2 — SearchScreen.tsx, SocialCard.tsx
- `marginTop: 48` — 2 — SearchScreen.tsx, SignupScreen.tsx
- `margin: 0 0 20px` — 2 — SurfaceHCPForm.tsx, ThemeReactionPanel.tsx
- `padding: 18px 0` — 2 — TelescopeField.tsx, ThreadPage.tsx
- `gap: narrow ? 16 : 26` — 2 — TelescopeField.tsx, ForumIndexPage.tsx
- `margin: 6px 0 0` — 2 — AdminPage.tsx, TrialsPage.tsx
- `margin: 0 0 10px` — 2 — AssetPage.tsx, FollowUpRow.tsx
- `padding: 18px 24px` — 2 — AssetPage.tsx, InsightCard.tsx
- `padding: 20px 16px` — 2 — AssetPage.tsx x2
- `padding: 48px 34px` — 2 — AssetsIndexPage.tsx x2
- `margin: 10px 0 0` — 2 — AssetsIndexPage.tsx, PulseHeader.tsx
- `padding: 5px 0` — 2 — AssetsIndexPage.tsx, TrialsPage.tsx
- `gap: full ? 16 : 12` — 2 — CompositionChart.tsx x2
- `paddingRight: 12` — 2 — CohortLedger.tsx x2
- `padding: 2px 0` — 2 — CohortLedger.tsx, WatchlistDetailHeader.tsx
- `padding: 7px 20px 7px 23px` — 2 — CohortLedger.tsx x2
- `padding: 28px 23px` — 2 — CohortLedger.tsx x2
- `paddingTop: 20` — 2 — CongressCalendarPage.tsx, ForumIndexPage.tsx
- `padding: 11px 13px` — 2 — Composer.tsx, ThreadPage.tsx
- `padding: 9px 16px` — 2 — fiUi.tsx, PracticeFirstProfile.tsx
- `padding: 9px 14px` — 2 — ForumIndexPage.tsx, PracticeFirstProfile.tsx
- `margin: 16px 40px 0` — 2 — ForumIndexPage.tsx x2
- `padding: 20px 26px` — 2 — ForumIndexPage.tsx, HomePage.tsx
- `marginLeft: 34` — 2 — ThreadPage.tsx x2
- `margin: 8px 0 0` — 2 — ThreadPage.tsx, PulseHeader.tsx
- `padding: 72px 24px` — 2 — FollowUpsEmptyState.tsx x2
- `margin: 0 26px` — 2 — HomePage.tsx x2
- `padding: 6px 9px` — 2 — HomePage.tsx x2
- `padding: 14px 26px` — 2 — HomePage.tsx x2
- `padding: 12px 18px` — 2 — HomePage.tsx x2
- `padding: SPACE.xl` — 2 — HomeTile.tsx, StartHereCard.tsx
- `margin: 0 0 20px 0` — 2 — InviteModal.tsx, EditWatchlistModal.tsx
- `padding: 0 0 12px` — 2 — CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `padding: 2px 0 2px 14px` — 2 — CommunityHcpProfile.tsx, PulseCaveats.tsx
- `padding: 20px 24px 120px` — 2 — CommunityHcpProfile.tsx, HcpProfileBrief.tsx
- `padding: 12px 20px 6px` — 2 — CommunityHcpProfile.tsx x2
- `marginRight: 5` — 2 — CommunityHcpProfile.tsx, PulseConfidence.tsx
- `padding: 6px 20px` — 2 — CommunityHcpProfile.tsx x2
- `paddingRight: 10` — 2 — CommunityHcpProfile.tsx x2
- `padding: 9px 20px` — 2 — CommunityHcpProfile.tsx x2
- `padding: 22px 26px` — 2 — PracticeFirstProfile.tsx x2
- `padding: 9px 10px` — 2 — PracticeFirstProfile.tsx, TrialsPage.tsx
- `padding: 0 26px` — 2 — PulsePage.tsx x2
- `padding: 10px 14px 9px` — 2 — PulsePage.tsx x2
- `padding: 9px 14px 10px` — 2 — PulsePage.tsx, TrialsPage.tsx
- `paddingRight: 26` — 2 — PulsePage.tsx x2
- `padding: 10px 0 11px` — 2 — PulsePage.tsx x2
- `paddingTop: 13` — 2 — TheWeekPage.tsx x2
- `margin: 20px 28px 0` — 2 — TrialsPage.tsx x2
- `margin: 14px 16px 0` — 2 — TrialsPage.tsx x2
- `margin: 4px 0 0 0` — 2 — WatchlistDetailHeader.tsx, WatchlistsPage.tsx
- `padding: 48px 16px` — 2 — WatchlistsEmptyState.tsx x2
- `paddingBottom: env(safe-area-inset-bottom` — 1 — ActionTray.tsx
- `padding: 4px 16px 12px` — 1 — ActionTray.tsx
- `margin: 0 0 0 0` — 1 — ActionTray.tsx
- `padding: 2px 6px 2px 8px` — 1 — ActiveFilterPills.tsx
- `margin: 8px 16px 12px` — 1 — ActiveFilterPills.tsx
- `padding: 12px 14px 8px 14px` — 1 — AddToWatchlistPopover.tsx
- `marginRight: 10` — 1 — AddToWatchlistPopover.tsx
- `padding: 0 14px 8px 38px` — 1 — AddToWatchlistPopover.tsx
- `padding: 6px 4px` — 1 — AddToWatchlistPopover.tsx
- `padding: SPACE.lg` — 1 — AppLayout.tsx
- `margin: 0 0 24px` — 1 — AuthWrapper.tsx
- `marginTop: expanded ? 12 : 0` — 1 — BeliefClaimReactionPanel.tsx
- `marginBottom: qIndex < BELIEF_CLAIM_QUESTIONS.length - 1 ? 20 : 16` — 1 — BeliefClaimReactionPanel.tsx
- `padding: 12px 16px 4px` — 1 — BibliographyScreen.tsx
- `padding: 8px 16px 8px` — 1 — BibliographyScreen.tsx
- `padding: 32px 16px` — 1 — BibliographyScreen.tsx
- `padding: 0 16px 32px` — 1 — BibliographyScreen.tsx
- `padding: 0 0 40px` — 1 — CommunityExplorer.tsx
- `padding: 14px 22px 0` — 1 — CommunityExplorer.tsx
- `padding: 9px 34px` — 1 — CommunityExplorer.tsx
- `padding: 22px 24px 12px` — 1 — CommunityExplorer.tsx
- `padding: 6px 24px 14px` — 1 — CommunityExplorer.tsx
- `padding: 5` — 1 — CommunityExplorer.tsx
- `padding: 2px 24px 14px` — 1 — CommunityExplorer.tsx
- `padding: 14px 15px` — 1 — CommunityExplorer.tsx
- `padding: 8px 9px` — 1 — CommunityExplorer.tsx
- `padding: 8px 18px` — 1 — CommunityExplorer.tsx
- `padding: 50px 0` — 1 — CommunityExplorer.tsx
- `padding: 16px 12px` — 1 — DetailScreen.tsx
- `rowGap: 8` — 1 — DetailScreen.tsx
- `margin: 4px 0 0` — 1 — DetailScreen.tsx
- `margin: 0 16px 24px 16px` — 1 — DetailScreen.tsx
- `marginTop: -4` — 1 — DetailScreen.tsx
- `padding: 0 16px 8px` — 1 — DOLHeroPanel.tsx
- `padding: 0 16px 24px` — 1 — DOLPostModal.tsx
- `padding: 24px 24px 20px` — 1 — EvidenceDrawer.tsx
- `padding: 20px 24px 28px` — 1 — EvidenceDrawer.tsx
- `paddingBottom: 20` — 1 — EvidenceDrawer.tsx
- `marginBottom: insight.why_it_matters ? 12 : 12` — 1 — FieldInsightsScreen.tsx
- `padding: 40px 0` — 1 — FieldInsightsScreen.tsx
- `padding: 5px 12px 5px 10px` — 1 — FilterButton.tsx
- `paddingRight: 16` — 1 — GlobalFooter.tsx
- `rowGap: ROW_GAP` — 1 — GlobalFooter.tsx
- `padding: 11px 13px 12px` — 1 — HCPCard.tsx
- `padding: 18px 20px 40px` — 1 — HCPCard.tsx
- `margin: 15px 0 0` — 1 — HCPCard.tsx
- `padding: 5px 12px` — 1 — HcpPositionsPage.tsx
- `marginLeft: 10` — 1 — HcpPositionsPage.tsx
- `margin: 8` — 1 — InfoTooltip.tsx
- `marginLeft: 30` — 1 — InstitutionResearchThemesPanel.tsx
- `padding: isMobile ? "32px 16px" : "48px 28px` — 1 — InstitutionRoute.tsx
- `padding: 20px ${pad` — 1 — InstitutionRoute.tsx
- `padding: 11px ${pad` — 1 — InstitutionRoute.tsx
- `gap: isMobile ? 6 : 20` — 1 — InstitutionRoute.tsx
- `padding: 17px ${pad` — 1 — InstitutionRoute.tsx
- `gap: isMobile ? 10 : 3` — 1 — InstitutionRoute.tsx
- `paddingLeft: isMobile ? 0 : undefined` — 1 — InstitutionRoute.tsx
- `paddingTop: isMobile ? 0 : 8` — 1 — InstitutionRoute.tsx
- `padding: 12px ${pad` — 1 — InstitutionRoute.tsx
- `gap: isMobile ? 20 : 48` — 1 — InstitutionRoute.tsx
- `padding: 34px ${pad` — 1 — InstitutionRoute.tsx
- `gap: 20px 28px` — 1 — InstitutionRoute.tsx
- `padding: 0 ${pad` — 1 — InstitutionRoute.tsx
- `gap: isMobile ? 10 : 16` — 1 — InstitutionsIndexRoute.tsx
- `paddingTop: isMobile ? 0 : 5` — 1 — InstitutionsIndexRoute.tsx
- `paddingLeft: 48` — 1 — InstitutionsIndexRoute.tsx
- `padding: dense ? "16px 28px" : "18px 28px` — 1 — InstitutionsIndexRoute.tsx
- `padding: isMobile ? "9px 16px" : "11px 28px` — 1 — InstitutionsIndexRoute.tsx
- `gap: isMobile ? 10 : 20` — 1 — InstitutionsIndexRoute.tsx
- `padding: isMobile ? "13px 16px" : "13px 28px 13px 44px` — 1 — InstitutionsIndexRoute.tsx
- `padding: isMobile ? "18px 16px 14px" : "26px 28px 0` — 1 — InstitutionsIndexRoute.tsx
- `padding: isMobile ? "10px 16px" : "16px 28px 12px` — 1 — InstitutionsIndexRoute.tsx
- `padding: 22px 28px 9px` — 1 — InstitutionsIndexRoute.tsx
- `padding: isMobile ? "16px" : "20px 28px 26px` — 1 — InstitutionsIndexRoute.tsx
- `marginRight: 6` — 1 — LandscapeQuadrantChart.tsx
- `margin: { top: 8` — 1 — LandscapeQuadrantChart.tsx
- `margin: 8px 0 4px` — 1 — LandscapeRoute.tsx
- `padding: 0 16px 16px` — 1 — LandscapeRoute.tsx
- `padding: [32` — 1 — LandscapeScreen.tsx
- `margin-top: 8px` — 1 — LandscapeScreen.tsx
- `padding: 0 !important` — 1 — LandscapeScreen.tsx
- `margin: 10px 12px !important` — 1 — LandscapeScreen.tsx
- `padding: isMobile ? "12px 13px" : "14px 16px` — 1 — LinkedInAuthScreen.tsx
- `gap: isMobile ? 12 : 14` — 1 — LinkedInAuthScreen.tsx
- `margin: 2px 0` — 1 — LinkedInAuthScreen.tsx
- `margin: 2px 0 0` — 1 — LinkedInAuthScreen.tsx
- `marginTop: isMobile ? 0 : 12` — 1 — LinkedInAuthScreen.tsx
- `paddingTop: isMobile ? 0 : 20` — 1 — LinkedInAuthScreen.tsx
- `padding: 26px 24px 0` — 1 — LinkedInAuthScreen.tsx
- `padding: 24px 24px 18px` — 1 — LinkedInAuthScreen.tsx
- `padding: 56px 64px` — 1 — LinkedInAuthScreen.tsx
- `marginBottom: 120` — 1 — LinkedInAuthScreen.tsx
- `marginBottom: 26` — 1 — LinkedInAuthScreen.tsx
- `margin: 28px 0 0` — 1 — LinkedInAuthScreen.tsx
- `padding: 56` — 1 — LinkedInAuthScreen.tsx
- `marginLeft: auto (no spacer child) leave ~9px true slack against the` — 1 — NavBar.tsx
- `padding: 0 18px` — 1 — NavBar.tsx
- `marginLeft: auto reclaims it. With` — 1 — NavBar.tsx
- `padding: 10px 18px` — 1 — NavBar.tsx
- `padding: 0 11px` — 1 — NavBar.tsx
- `padding: 16px 16px 32px` — 1 — NoteEntryScreen.tsx
- `padding: 6px 16px 13px` — 1 — PeopleNavStrip.tsx
- `padding: 14px 0 12px` — 1 — PeopleNavStrip.tsx
- `padding: 11px 16px 13px` — 1 — PeopleNavStrip.tsx
- `padding: 15px 16px 12px` — 1 — PeopleNavStrip.tsx
- `marginBottom: 11` — 1 — PeopleNavStrip.tsx
- `gap: 2px 24px` — 1 — PeopleNavStrip.tsx
- `padding: 17px 0 15px` — 1 — PeopleNavStrip.tsx
- `padding: 16px 20px 0` — 1 — PeopleNavStrip.tsx
- `padding: 24px 16px 16px` — 1 — ProfileScreen.tsx
- `paddingTop: i === 0 ? 0 : 12` — 1 — ProfileScreen.tsx
- `paddingBottom: i < arr.length - 1 ? 12 : 0` — 1 — ProfileScreen.tsx
- `padding: 20px 16px 32px` — 1 — ProfileScreen.tsx
- `gap: narrow ? 8 : 14` — 1 — PublicConversation.tsx
- `padding: narrow ? "14px 18px" : "15px 28px` — 1 — PublicConversation.tsx
- `padding: narrow ? "18px 18px 18px 20px" : "24px 28px 26px 28px` — 1 — PublicConversation.tsx
- `marginLeft: narrow ? 16 : 26` — 1 — PublicConversation.tsx
- `padding: narrow ? "16px 18px" : "24px 28px` — 1 — PublicConversation.tsx
- `paddingBottom: i < arr.length - 1 ? 8 : 0` — 1 — PublicConversation.tsx
- `padding: 22px ${narrow ? 18 : 28` — 1 — PublicConversation.tsx
- `margin: 18px ${narrow ? 18 : 28` — 1 — PublicConversation.tsx
- `gap: narrow ? 12 : 28` — 1 — PublicConversation.tsx
- `padding: 8px ${narrow ? 18 : 28` — 1 — PublicConversation.tsx
- `paddingRight: 6` — 1 — PublicConversation.tsx
- `margin: on ? "-5.5px 0 0 -5.5px" : "-3.5px 0 0 -3.5px` — 1 — PublicConversation.tsx
- `padding: narrow ? "8px 10px" : "10px 14px` — 1 — PublicConversation.tsx
- `gap: narrow ? 5 : 7` — 1 — PublicConversation.tsx
- `gap: narrow ? "4px 8px" : "6px 12px` — 1 — PublicConversation.tsx
- `padding: narrow ? "14px 18px" : "16px 24px` — 1 — PublicConversation.tsx
- `padding: 14px 0 12px 28px` — 1 — PublicConversation.tsx
- `padding: 14px 32px 12px 0` — 1 — PublicConversation.tsx
- `padding: 14px 28px 12px 28px` — 1 — PublicConversation.tsx
- `padding: 14px ${narrow ? 18 : 28` — 1 — PublicConversation.tsx
- `padding: 9px ${narrow ? 18 : 28` — 1 — PublicConversation.tsx
- `padding: narrow ? "18px 18px 0" : "26px 0 26px 26px` — 1 — PublicConversation.tsx
- `marginTop: narrow ? 0 : 8` — 1 — PublicConversation.tsx
- `marginTop: narrow ? 0 : 16` — 1 — PublicConversation.tsx
- `marginTop: narrow ? 0 : 4` — 1 — PublicConversation.tsx
- `padding: narrow ? "12px 18px 18px" : "24px 34px 26px 0` — 1 — PublicConversation.tsx
- `padding: narrow ? "0 18px 18px" : "26px 28px` — 1 — PublicConversation.tsx
- `paddingBottom: i < arr.length - 1 ? 7 : 0` — 1 — PublicConversation.tsx
- `padding: 13px 28px` — 1 — PublicConversation.tsx
- `padding: 34px 28px 38px 30px` — 1 — PublicConversation.tsx
- `marginLeft: 26` — 1 — PublicConversation.tsx
- `padding: 34px 28px` — 1 — PublicConversation.tsx
- `paddingRight: 36` — 1 — ResearchThemeChip.tsx
- `margin: { top: 16` — 1 — RisingVoicesChart.tsx
- `marginBottom: 36` — 1 — ScientificNarrativeSection.tsx
- `paddingLeft: 12` — 1 — ScoreBreakdownV3.tsx
- `padding: mobile ? 0 : 16` — 1 — ScoringExplainedModal.tsx
- `padding: 16px 18px 28px` — 1 — ScoringExplainedModal.tsx
- `marginBottom: i < FAQ_ITEMS.length - 1 ? 18 : 0` — 1 — ScoringExplainedModal.tsx
- `padding: 8px 12px 4px` — 1 — SearchBar.tsx
- `padding: 0 12px 0 32px` — 1 — SearchBar.tsx
- `margin: 8px 16px 24px` — 1 — SearchScreen.tsx
- `marginTop: 88` — 1 — SignupScreen.tsx
- `marginBottom: 3` — 1 — SocialAnalyticsBanner.tsx
- `paddingRight: 8` — 1 — SocialAnalyticsBanner.tsx
- `paddingTop: 64` — 1 — SocialPage.tsx
- `margin: 32px 16px` — 1 — SocialTrackEmpty.tsx
- `padding: 1` — 1 — Sparkline.tsx
- `margin: 20px 0 16px` — 1 — SurfaceHCPForm.tsx
- `padding: 12px 16px 12px` — 1 — TAFilterChips.tsx
- `paddingRight: 32` — 1 — TelescopeDrawer.tsx
- `marginTop: 32px` — 1 — TelescopeDrawer.tsx
- `marginBottom: 12px` — 1 — TelescopeDrawer.tsx
- `gap: 6px` — 1 — TelescopeDrawer.tsx
- `gap: 10px` — 1 — TelescopeDrawer.tsx
- `marginLeft: 8px` — 1 — TelescopeDrawer.tsx
- `gap: narrow ? 14 : 18` — 1 — TelescopeField.tsx
- `gap: narrow ? 16 : 20` — 1 — TelescopeField.tsx
- `padding: 0 2px 11px` — 1 — TelescopeField.tsx
- `padding: narrow ? "24px 24px 22px" : "30px 30px 26px` — 1 — TelescopeField.tsx
- `gap: narrow ? 18 : 22` — 1 — TelescopeField.tsx
- `gap: narrow ? 16 : 32` — 1 — TelescopeField.tsx
- `paddingBottom: 5` — 1 — TelescopeField.tsx
- `padding: 26px 22px 16px` — 1 — TelescopeField.tsx
- `padding: 15px 0` — 1 — TelescopeField.tsx
- `padding: 0 0 20px` — 1 — TelescopeField.tsx
- `padding: 6px 22px 0` — 1 — TelescopeField.tsx
- `marginTop: expanded ? 8 : 0` — 1 — ThemeReactionPanel.tsx
- `marginBottom: qIndex < THEME_QUESTIONS.length - 1 ? 24 : 20` — 1 — ThemeReactionPanel.tsx
- `margin: 12px 16px 8px` — 1 — TrackSwitch.tsx
- `padding: 2` — 1 — TrackSwitch.tsx
- `padding: 8px 4px` — 1 — TrackSwitch.tsx
- `padding: 5px 12px 5px 24px` — 1 — UserMenu.tsx
- `padding: 8px 12px 2px` — 1 — UserMenu.tsx
- `margin: 4px 0` — 1 — UserMenu.tsx
- `marginTop: 64` — 1 — WelcomeWizard.tsx
- `marginBottom: subtitle ? 4 : 16` — 1 — adminUi.tsx
- `padding: 0 12px 8px 0` — 1 — adminUi.tsx
- `padding: 10px 12px 10px 0` — 1 — adminUi.tsx
- `padding: mobile ? "20px 16px 16px" : "26px 32px 22px` — 1 — AssetPage.tsx
- `padding: mobile ? "20px 16px 28px" : "20px 32px 24px` — 1 — AssetPage.tsx
- `padding: 60px 24px` — 1 — AssetPage.tsx
- `padding: isMobile ? "32px 16px" : "40px 32px` — 1 — AssetPage.tsx
- `padding: 28px 32px 30px` — 1 — AssetPage.tsx
- `padding: 26px 32px 30px` — 1 — AssetPage.tsx
- `columnGap: 7` — 1 — AssetsIndexPage.tsx
- `padding: 5px 6px 6px 4px` — 1 — AssetsIndexPage.tsx
- `padding: 4px 0 1px` — 1 — AssetsIndexPage.tsx
- `padding: 5px 11px` — 1 — AssetsIndexPage.tsx
- `paddingBottom: 0` — 1 — AssetsIndexPage.tsx
- `padding: isMobile ? "22px 16px 0" : "30px 34px 0` — 1 — AssetsIndexPage.tsx
- `gap: isMobile ? 22 : 56` — 1 — AssetsIndexPage.tsx
- `margin: isMobile ? "22px 16px 0" : "26px 34px 0` — 1 — AssetsIndexPage.tsx
- `margin: isMobile ? "20px 16px 0" : "24px 34px 0` — 1 — AssetsIndexPage.tsx
- `gap: isMobile ? 24 : 34` — 1 — AssetsIndexPage.tsx
- `columnGap: 32` — 1 — AssetsIndexPage.tsx
- `margin: 0 0 22px` — 1 — AssetsIndexPage.tsx
- `padding: 0 6px 5px 4px` — 1 — AssetsIndexPage.tsx
- `margin: 0 6px 6px 4px` — 1 — AssetsIndexPage.tsx
- `columnGap: 30` — 1 — AssetsIndexPage.tsx
- `padding: 16px 14px 18px` — 1 — AssetsIndexPage.tsx
- `margin: 11px 0 0` — 1 — AssetsIndexPage.tsx
- `margin: isMobile ? "26px 16px 0" : "26px 34px 0` — 1 — AssetsIndexPage.tsx
- `padding: 12px 0 0` — 1 — AssetsIndexPage.tsx
- `margin: 16px 0 0` — 1 — AssetsIndexPage.tsx
- `padding: isMobile ? "12px 16px 26px" : "12px 34px 26px` — 1 — AssetsIndexPage.tsx
- `padding: 15px 14px 16px` — 1 — AssetsIndexPage.tsx
- `marginBottom: 13` — 1 — AssetsIndexPage.tsx
- `padding: 9px 0 0` — 1 — AssetsIndexPage.tsx
- `columnGap: 8` — 1 — AssetsIndexPage.tsx
- `padding: 3px 0 4px` — 1 — AssetsIndexPage.tsx
- `padding: 8px 11px` — 1 — AssetsIndexPage.tsx
- `paddingBottom: 22` — 1 — CompositionChart.tsx
- `gap: full ? 40 : 32` — 1 — CompositionChart.tsx
- `gap: full ? 2 : 1` — 1 — CompositionChart.tsx
- `paddingTop: full ? 11 : 0` — 1 — CompositionChart.tsx
- `padding: full ? "14px 16px" : "12px 0 0` — 1 — CompositionChart.tsx
- `paddingLeft: 22` — 1 — CompositionChart.tsx
- `marginLeft: 20` — 1 — CompositionChart.tsx
- `gap: 10px 26px` — 1 — CompositionChart.tsx
- `padding: 26px 26px 24px` — 1 — RightRail.tsx
- `margin: 8px 0 7px` — 1 — RightRail.tsx
- `paddingBottom: i < threads.length - 1 ? 12 : 0` — 1 — RightRail.tsx
- `padding: 12px 0 10px 0` — 1 — CollapsibleSection.tsx
- `padding: mobile ? "3px 8px" : "4px 9px` — 1 — CohortLedger.tsx
- `padding: 5px 9px` — 1 — CohortLedger.tsx
- `padding: 10px 20px 8px 23px` — 1 — CohortLedger.tsx
- `padding: 13px 20px 13px 23px` — 1 — CohortLedger.tsx
- `paddingRight: 24` — 1 — CohortLedger.tsx
- `padding: 3px 2px` — 1 — CohortLedger.tsx
- `gap: 48` — 1 — CohortLedger.tsx
- `padding: 6px 20px 22px 127px` — 1 — CohortLedger.tsx
- `padding: 13px 16px 14px 19px` — 1 — CohortLedger.tsx
- `gap: 5px 16px` — 1 — CohortLedger.tsx
- `padding: 9px 11px` — 1 — CohortLedger.tsx
- `padding: 4px 16px 18px 19px` — 1 — CohortLedger.tsx
- `paddingBottom: 7` — 1 — CohortLedger.tsx
- `paddingTop: 9` — 1 — CohortLedger.tsx
- `padding: 8px 16px 0` — 1 — CohortLedger.tsx
- `padding: 24px 20px 96px` — 1 — CohortLedger.tsx
- `gap: isMobile ? 6 : 0` — 1 — CohortLedger.tsx
- `padding: isMobile ? "12px 16px" : "14px 20px` — 1 — CohortLedger.tsx
- `padding: 12px 23px` — 1 — CohortLedger.tsx
- `padding: 14px 20px 16px 23px` — 1 — CohortLedger.tsx
- `gap: 1.5` — 1 — CongressCalendarPage.tsx
- `padding: 7px 14px` — 1 — CongressCalendarPage.tsx
- `padding: 10px 11px` — 1 — CongressCalendarPage.tsx
- `padding: 16px 18px 12px` — 1 — CongressCalendarPage.tsx
- `padding: 0 5px` — 1 — CongressCalendarPage.tsx
- `padding: 0 12px 8px` — 1 — CongressCalendarPage.tsx
- `padding: 18px 12px 8px` — 1 — CongressCalendarPage.tsx
- `padding: 13px 12px` — 1 — CongressCalendarPage.tsx
- `paddingTop: 28` — 1 — CongressDetailPage.tsx
- `margin: 2px 0 6px` — 1 — CongressDetailPage.tsx
- `paddingLeft: 11` — 1 — CongressDetailPage.tsx
- `paddingTop: 40` — 1 — CongressDetailPage.tsx
- `marginLeft: typeStyle ? 6 : 0` — 1 — InsightCard.tsx
- `margin: 0 6px` — 1 — InsightCard.tsx
- `padding: 0 2px` — 1 — InsightCard.tsx
- `padding: 0 0 2px` — 1 — InsightCard.tsx
- `padding: 13px 24px` — 1 — InsightComposer.tsx
- `paddingRight: 28` — 1 — InsightComposerModal.tsx
- `gap: variant === "ledger" ? 0 : 8` — 1 — InsightThread.tsx
- `padding: small ? "1px 5px" : "2px 6px` — 1 — fiUi.tsx
- `padding: 15px 40px` — 1 — ForumIndexPage.tsx
- `padding: 24px 22px 0` — 1 — ForumIndexPage.tsx
- `margin: 12px 0 0` — 1 — ForumIndexPage.tsx
- `padding: 46px 40px 0` — 1 — ForumIndexPage.tsx
- `gap: 64` — 1 — ForumIndexPage.tsx
- `margin: 34px 40px 0` — 1 — ForumIndexPage.tsx
- `padding: 20px 26px 18px` — 1 — ForumIndexPage.tsx
- `gap: 34` — 1 — ForumIndexPage.tsx
- `margin: 18px 0 14px` — 1 — ForumIndexPage.tsx
- `padding: narrow ? "9px 0" : "9px 18px` — 1 — ForumIndexPage.tsx
- `margin: narrow ? "20px 22px 0" : "36px 40px 0` — 1 — ForumIndexPage.tsx
- `padding: 3` — 1 — ForumIndexPage.tsx
- `padding: 24px 26px 20px` — 1 — ForumIndexPage.tsx
- `margin: 14px 0` — 1 — ForumIndexPage.tsx
- `margin: 0 -12px` — 1 — ForumIndexPage.tsx
- `margin: 18px 22px 0` — 1 — ForumIndexPage.tsx
- `padding: 18px 26px 12px` — 1 — ForumIndexPage.tsx
- `margin: 14px 22px 0` — 1 — ForumIndexPage.tsx
- `margin: 18px 40px 0` — 1 — ForumIndexPage.tsx
- `padding: 0 22px 10px` — 1 — ForumIndexPage.tsx
- `padding: 0 22px 12px` — 1 — ForumIndexPage.tsx
- `padding: 15px 22px` — 1 — ForumIndexPage.tsx
- `marginTop: narrow ? 22 : 34` — 1 — ForumIndexPage.tsx
- `padding: narrow ? "14px 0" : "18px 0` — 1 — ForumIndexPage.tsx
- `padding: 24px 20px` — 1 — ForumIndexPage.tsx
- `padding: 13px 16px` — 1 — ForumIndexPage.tsx
- `padding: 44px 48px 40px` — 1 — ForumIndexPage.tsx
- `marginTop: 34` — 1 — ForumIndexPage.tsx
- `padding: 44px 40px 40px` — 1 — ForumIndexPage.tsx
- `paddingTop: 18` — 1 — ForumIndexPage.tsx
- `margin: 44px 40px 0` — 1 — ForumIndexPage.tsx
- `padding: 26px 40px 44px` — 1 — ForumIndexPage.tsx
- `paddingBottom: narrow ? 24 : 0` — 1 — ForumIndexPage.tsx
- `padding: narrow ? "40px 22px" : "60px 40px` — 1 — ForumIndexPage.tsx
- `margin: narrow ? "16px 22px 0" : "16px 40px 0` — 1 — ForumIndexPage.tsx
- `margin: narrow ? "20px 22px 0" : "34px 40px 0` — 1 — ForumIndexPage.tsx
- `padding: narrow ? "16px 18px" : "18px 26px` — 1 — ForumIndexPage.tsx
- `padding: isMobile ? "12px 14px" : 20` — 1 — ThreadPage.tsx
- `gap: isMobile ? 8 : 12` — 1 — ThreadPage.tsx
- `marginBottom: sourceConfig ? 8 : 10` — 1 — FollowUpRow.tsx
- `padding: 80px 24px` — 1 — FollowUpsEmptyState.tsx
- `padding: isDesktop ? "13px 30px" : "11px 16px` — 1 — HomePage.tsx
- `padding: isDesktop ? "34px 30px 22px" : "20px 16px 14px` — 1 — HomePage.tsx
- `gap: isDesktop ? 46 : 24` — 1 — HomePage.tsx
- `margin: isDesktop ? "0 30px" : "0 16px` — 1 — HomePage.tsx
- `gap: isDesktop ? 40 : 28` — 1 — HomePage.tsx
- `padding: isDesktop ? "32px 30px 56px" : "24px 16px 32px` — 1 — HomePage.tsx
- `padding: 13px 18px` — 1 — HomePage.tsx
- `gap: isDesktop ? 22 : 8` — 1 — HomePage.tsx
- `padding: isDesktop ? "20px 26px" : "16px 18px` — 1 — HomePage.tsx
- `gap: isDesktop ? 20 : 12` — 1 — HomePage.tsx
- `padding: 9px 18px` — 1 — HomePage.tsx
- `margin: 0 18px` — 1 — HomePage.tsx
- `padding: 6px 7px` — 1 — HomePage.tsx
- `padding: 26px 28px` — 1 — HomePage.tsx
- `padding: 8px 0 10px` — 1 — HomePage.tsx
- `gap: isDesktop ? 26 : 14` — 1 — HomePage.tsx
- `padding: isDesktop ? "26px 28px 16px" : "18px 16px 10px` — 1 — HomePage.tsx
- `paddingLeft: 26` — 1 — HomePage.tsx
- `gap: 9px 14px` — 1 — HomePage.tsx
- `padding: 11px 15px` — 1 — HomePage.tsx
- `padding: 10px 15px` — 1 — HomePage.tsx
- `padding: 16px 0 10px` — 1 — HomePage.tsx
- `gap: isDesktop ? 26 : 8` — 1 — HomePage.tsx
- `padding: isDesktop ? "20px 28px" : "14px 16px` — 1 — HomePage.tsx
- `gap: 7px 12px` — 1 — HomePage.tsx
- `padding: 7px 16px` — 1 — InviteEmailForm.tsx
- `margin: 12px 0 0 0` — 1 — StartHereCard.tsx
- `margin: 0 0 14px 0` — 1 — WelcomeShareBanner.tsx
- `padding: 12px 20px 16px` — 1 — AdministeredVolumeBlock.tsx
- `padding: 14px 20px 4px` — 1 — AdministeredVolumeBlock.tsx
- `margin: 0 5px 0 12px` — 1 — CommunityHcpProfile.tsx
- `marginTop: -6` — 1 — CommunityHcpProfile.tsx
- `padding: 16px 24px` — 1 — HcpProfileBrief.tsx
- `padding: 0 24px 14px` — 1 — HcpProfileBrief.tsx
- `gap: 4px 16px` — 1 — HcpProfileBrief.tsx
- `padding: 10px 28px` — 1 — PracticeFirstProfile.tsx
- `padding: 20px 28px 24px` — 1 — PracticeFirstProfile.tsx
- `margin: 0 -10px` — 1 — PracticeFirstProfile.tsx
- `gap: 2px 14px` — 1 — PracticeFirstProfile.tsx
- `margin: 0 -6px` — 1 — PracticeFirstProfile.tsx
- `padding: 7px 8px` — 1 — PracticeFirstProfile.tsx
- `margin: 14px 0 8px` — 1 — PracticeFirstProfile.tsx
- `padding: 5px 8px` — 1 — PracticeFirstProfile.tsx
- `padding: 20px 24px 18px` — 1 — PracticeFirstProfile.tsx
- `padding: 20px 22px 18px` — 1 — PracticeFirstProfile.tsx
- `marginRight: 2` — 1 — PracticeFirstProfile.tsx
- `gap: !c.name` — 1 — PracticeFirstProfile.tsx
- `padding: 7px 4px` — 1 — PracticeFirstProfile.tsx
- `padding: 0 0 12px 96px` — 1 — FullCareerView.tsx
- `gap: isMobile ? 12 : 20` — 1 — PublicationCard.tsx
- `marginBottom: rest.length > 0 ? 16 : 0` — 1 — PulseCaveats.tsx
- `padding: 16px 16px 6px` — 1 — PulseEvents.tsx
- `marginLeft: 5` — 1 — PulseEvents.tsx
- `gap: 0 8px` — 1 — PulseEvents.tsx
- `gap: narrow ? 22 : 60` — 1 — PulsePage.tsx
- `padding: narrow ? "12px 20px 12px 0" : "0 26px` — 1 — PulsePage.tsx
- `padding: 0 0 0 26px` — 1 — PulsePage.tsx
- `padding: 22px 20px 20px` — 1 — PulsePage.tsx
- `padding: 12px 14px 11px` — 1 — PulsePage.tsx
- `paddingTop: narrow ? 0 : 14` — 1 — PulsePage.tsx
- `padding: 26px 20px 0` — 1 — PulsePage.tsx
- `margin: 26px 20px 0` — 1 — PulsePage.tsx
- `padding: 12px 0 14px` — 1 — PulsePage.tsx
- `padding: 10px 0 9px` — 1 — PulsePage.tsx
- `marginLeft: 82` — 1 — PulsePage.tsx
- `padding: 10px 0 9px 14px` — 1 — PulsePage.tsx
- `padding: 9px 0 10px 14px` — 1 — PulsePage.tsx
- `padding: 0 14px 0 0` — 1 — PulsePage.tsx
- `padding: 2px 8px 2px 0` — 1 — PulsePage.tsx
- `padding: 13px 0 14px` — 1 — PulsePage.tsx
- `paddingLeft: 32` — 1 — PulsePage.tsx
- `padding: 12px 0 13px` — 1 — PulsePage.tsx
- `marginLeft: 32` — 1 — PulsePage.tsx
- `padding: 18px 20px 20px` — 1 — PulsePage.tsx
- `padding: 16px 20px 20px` — 1 — PulsePage.tsx
- `padding: 12px 0 11px` — 1 — PulsePage.tsx
- `padding: 10px 0 12px 18px` — 1 — PulsePage.tsx
- `gap: 0 40px` — 1 — PulsePage.tsx
- `padding: 6px 20px 20px` — 1 — PulsePage.tsx
- `margin: 12px auto 0` — 1 — PulsePage.tsx
- `padding: narrow ? "20px 16px 32px" : "0 0 8px` — 1 — PulsePage.tsx
- `padding: narrow ? 0 : "44px 64px 0` — 1 — PulsePage.tsx
- `padding: 18px 18px 16px` — 1 — PulseSynthesis.tsx
- `padding: 2px 0 16px 18px` — 1 — ThemeList.tsx
- `padding: 2px 4px` — 1 — FollowUpItem.tsx
- `padding: 60px 0` — 1 — TheWeekPage.tsx
- `gap: isDesktop ? 56 : 30` — 1 — TheWeekPage.tsx
- `padding: isDesktop ? "48px 40px 56px" : "26px 18px 34px` — 1 — TheWeekPage.tsx
- `gap: 15` — 1 — TheWeekPage.tsx
- `padding: 24px 28px` — 1 — TheWeekPage.tsx
- `padding: isDesktop ? "26px 30px" : "22px` — 1 — TheWeekPage.tsx
- `padding: 9px 15px` — 1 — TheWeekPage.tsx
- `padding: 2px 0 2px 16px` — 1 — TheWeekPage.tsx
- `padding: 16px 4px` — 1 — TheWeekPage.tsx
- `padding: 24px 28px 0` — 1 — TrialsPage.tsx
- `gap: 16px 40px` — 1 — TrialsPage.tsx
- `margin: 22px 28px 0` — 1 — TrialsPage.tsx
- `padding: 13px 14px` — 1 — TrialsPage.tsx
- `margin: 16px 28px 0` — 1 — TrialsPage.tsx
- `margin: 10px 28px 0` — 1 — TrialsPage.tsx
- `padding: 14px 0 15px 14px` — 1 — TrialsPage.tsx
- `margin: 26px 28px 0` — 1 — TrialsPage.tsx
- `gap: 10px 40px` — 1 — TrialsPage.tsx
- `margin: 22px 0 0` — 1 — TrialsPage.tsx
- `padding: 12px 28px` — 1 — TrialsPage.tsx
- `padding: 11px 16px` — 1 — TrialsPage.tsx
- `padding: 18px 16px 0` — 1 — TrialsPage.tsx
- `margin: 16px 16px 0` — 1 — TrialsPage.tsx
- `padding: 9px 12px 10px` — 1 — TrialsPage.tsx
- `rowGap: 6` — 1 — TrialsPage.tsx
- `margin: 4px 16px 0` — 1 — TrialsPage.tsx
- `margin: 14px 16px 6px` — 1 — TrialsPage.tsx
- `padding: 30px 16px` — 1 — TrialsPage.tsx
- `padding: 12px 0 13px 12px` — 1 — TrialsPage.tsx
- `padding: 1px 4px` — 1 — TrialsPage.tsx
- `margin: 18px 16px 0` — 1 — TrialsPage.tsx
- `paddingBottom: 18` — 1 — TrialsPage.tsx
- `padding: 3px 9px` — 1 — WatchlistDetailHeader.tsx
- `gap: isDesktop ? 24 : 12` — 1 — WatchlistsPage.tsx
- `padding: isMobile ? "8px 12px" : "10px 12px` — 1 — WatchlistsSidebar.tsx

</details>