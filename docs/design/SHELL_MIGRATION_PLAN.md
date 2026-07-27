# Shell migration plan — AppLayout / TopBar / GlobalFooter

**Planning document. No code changed producing it.** Companion to `MIGRATION_AUDIT.md`
(§2 flagged the shell as the biggest fork-or-flag risk; §5 ranks it row 2). The shell is the
highest-leverage single migration because every authenticated page renders some part of it —
one careful pass warms the chrome of the entire app at once, including pages that won't be
individually migrated for months.

Scope of "shell" here = the five components that render together as page chrome:

| Component | File | Lines | Role |
|---|---|---|---|
| `AppLayout` | `components/AppLayout.tsx` | 113 | Page ground + width container + breadcrumbs; composes TopBar & GlobalFooter |
| `TopBar` | `components/TopBar.tsx` | 118 | 48px bar: wordmark, inline/overlay SearchBar mount, Invites CTA, UserMenu |
| `GlobalFooter` | `components/GlobalFooter.tsx` | 162 | Disclaimer, ©, utility links, wordmark |
| `UserMenu` | `components/UserMenu.tsx` | 364 | Avatar button + dropdown nav (inside TopBar) |
| `InviteColleaguesButton` | `components/InviteColleaguesButton.tsx` | 175 | Amber pill + invite modal (inside TopBar) |

`SearchBar` (audit row 1) mounts inside TopBar and shares its surfaces; it is sequenced
**with** this pass (step 2 below) so the bar doesn't ship half-warm.

---

## 1. Who inherits the shell

Three inheritance paths — a shell change ships to all of them simultaneously.

### Via `<AppLayout>` (full shell: ground + TopBar + breadcrumbs + footer)

| Page | Route | Call site | maxWidth | Audit state of page body |
|---|---|---|---|---|
| Home | `/me` | `HomePage.tsx:185` | 960 | UNTOUCHED |
| HCP profile | `/hcp/:id` (route mode) | `DetailScreen.tsx:1182` | 960 | **DONE (warm)** |
| Brief | `/hcp/:id/brief` | `BriefPage.tsx:63` | 960 | UNTOUCHED |
| Watchlists | `/me/watchlists` | `WatchlistsPage.tsx:123` | 960 | UNTOUCHED |
| Follow-ups | `/me/follow-ups` | `FollowUpsPage.tsx:138` | 960 | UNTOUCHED |
| Field Insights | `/me/insights` | `FieldInsightsScreen.tsx:138` | 960 | UNTOUCHED |
| Institutions index | `/institutions/:ta` | `InstitutionsIndexRoute.tsx:114` | 1100 | UNTOUCHED |
| Publications list | `/institution/:slug/publications` | `PublicationsListPage.tsx:97` | 1100 | UNTOUCHED |
| Admin | `/admin` | `AdminPage.tsx:80, :90` | 1120 | PARTIAL — **deliberately cool body** |
| Methodology | `/methodology` | `MethodologyPage.tsx:88` | 960 | UNTOUCHED |

### Via direct `<TopBar>` (no AppLayout wrapper)

| Surface | Call site | Notes |
|---|---|---|
| Feed (`/`, `/:ta/:dashboard/:indication`) | `App.tsx:704` | **DONE (warm)** body; own 720px `fm-screen` container, cool `#0A0A0B` ground in App.tsx |
| FI thread (`/:ta/field-intelligence/thread/:id`) | `App.tsx:1308` | Cool body; own 720px container |

### Via direct `<GlobalFooter>` (no AppLayout wrapper)

| Surface | Call site | Notes |
|---|---|---|
| Feed | `App.tsx:1046` | passes `onToast` (FI toast plumbing) |
| FI thread | `App.tsx:1314` | passes `onToast` |
| Landscape route | `LandscapeRoute.tsx:137` | UNTOUCHED body |
| Institution detail | `InstitutionRoute.tsx:340` | UNTOUCHED body |

**Corrections to the audit while verifying this list:**
- **Settings (`/me/settings`) does NOT inherit the shell.** `ProfileScreen.tsx` imports none of
  AppLayout/TopBar/GlobalFooter (audit §2 lists it under AppLayout — stale). It renders its own header.
- **The audit's Flag-1 SearchBar score bug is already fixed.** `SearchBar.tsx:45` now routes through
  `formatScoreFloor1` (commented "Score-honesty fix"), not `Math.round`. The SearchBar item is now
  purely visual.
- `DetailScreen.tsx:26` imports `GlobalFooter` but never renders it — dead import, delete in this pass.

Pages **outside** the shell (unaffected): Settings, HcpPublications/Pair/Positions pages, Welcome,
Signup, Landing, Demo, Pulse, CityFeed overlay, DetailScreen when rendered as the in-feed overlay.

---

## 2. Style-cluster inventory → design-system role mapping

Token source: `frontend/src/lib/designTokens.ts` (`COLOR` / `FONT` / `TYPE` / `ELEVATION` / `RADIUS` / `SPACE`).

### 2a. AppLayout (`AppLayout.tsx`)

| Cluster | Current value | Design-system role | Note |
|---|---|---|---|
| Page ground | `#0A0A0B` (:33) | `COLOR.ground` `#0a0a0a` | Perceptually identical (1-bit blue delta) — the "warming" of the ground is free; the visible shift comes from hairlines + type |
| Page font | `system-ui, -apple-system` (:35) | `FONT.sans` (IBM Plex Sans) | Cascades to every child that says `fontFamily: "inherit"` — the widest-reaching single line of the migration |
| Container | `maxWidth` 960/1100/1120, `padding: 16` (:40–44) | keep; padding → `SPACE.lg` | Layout, not skin — do not change values |
| Breadcrumb text | 12px `#9B9892` (:60–61) | `TYPE.bodyUI` at 12px, `COLOR.ink3` | `#9B9892` ≈ `ink3 #928E86` |
| Breadcrumb link hover | `#E8E6DF` (:88) | `COLOR.ink1` | JS mouseenter handler — keep pattern or move to a class |
| Current crumb | `#E8E6DF` (:97) | `COLOR.ink1` | |
| Separator `›` | `#3A3A3F` (:100) | `COLOR.ink5` `#57534b` | Cool grey → warm; slightly lighter, acceptable |

### 2b. TopBar (`TopBar.tsx`)

| Cluster | Current value | Design-system role | Note |
|---|---|---|---|
| Bar surface | `#0A0A0B`, height 48 (:50–52) | `COLOR.ground`; height unchanged | Bar sits ON the ground, not a card |
| Bottom border | `1px solid #1E1E22` (:51) | `COLOR.hairStrong` `rgba(255,255,255,0.10)` | The single most-seen cool artifact in the app. Design rule says hairlines contain, never separate — the bar's bottom edge is a legitimate containment edge; use `hair` if `hairStrong` reads too loud over warm pages |
| Wordmark | 20px w500 `#E8A020`, ls 0.09em, system-ui (:69–77) | `COLOR.amber` (already exact) + `FONT.sans` | Hover `#F5D060` has **no token** — see Risk 6 |
| Search icon strokes | `#6B6A65` (:99–100) | `COLOR.ink4` `#77736B` | Same swap inside SearchBar's inline icon |
| Right cluster gap | `gap: 10` (:90) | `SPACE.sm`–`md` | cosmetic |
| Mobile overrides | `.fm-topbar` / `.fm-logo` / svg sizing, `index.css:206–216` | keep classNames untouched | CSS keys off these class names with `!important`; renaming or restructuring the DOM silently breaks the ≤768px bar (56px height, 14px logo) |

### 2c. SearchBar (`SearchBar.tsx`) — migrated with the bar

| Cluster | Current value | Design-system role | Note |
|---|---|---|---|
| Input field | bg `#111113`, border `#1E1E22`, radius 4 (:316–327, :373–383) | `COLOR.surfaceWell` + `COLOR.hair`, `RADIUS.well` (8) | Recessed input = well semantics; text `#E8E6DF` → `ink1`, placeholder stays UA-styled |
| Dropdown panel | bg `#111113`, border `#1E1E22`, shadow `0 8px 24px` (:331–345, :403–417) | `ELEVATION.card` (surfaceCard `#171512`) | A floating panel is a raised card, not a well — this is the biggest visible warm shift in the shell |
| Result row hover | bg `#111113` (:80) | `COLOR.surfaceRaised` `#1b1915` | via mouseenter handler, same pattern |
| Row divider | `#1E1E22` (:73) | `COLOR.hair` | |
| Result name / institution / muted | `#E8E6DF` / `#6B6A65` (:89, :96, :221–228) | `ink1` / `ink4`; helper text `TYPE.bodyUI` | |
| Score display | 12px monospace `#6B6A65` (:123–130) | `TYPE.dataValue` (Plex Mono, ink2) at 12px | Score-floor fix already present (:45) — don't touch the data path |
| Section header "Also found…" | 11px uppercase `#6B6A65` (:244–251) | `TYPE.microLabel` | |
| **Cohort badges + hover accent** | `#FFD700` / `#9B6DFF` / `#4ECDC4` / `#6B6A65` (:13–28) | **NO design-system role — keep hexes as-is** | See Risk 5. The migrated HCPCard kept these exact hexes inline (`HCPCard.tsx:787` — "cohort colors are untouched per the redesign scope"). Do not map to `estGreen`/`violet` |

### 2d. GlobalFooter (`GlobalFooter.tsx`)

| Cluster | Current value | Design-system role | Note |
|---|---|---|---|
| Top border | `rgba(255,255,255,0.08)` (:49) | `COLOR.hairStrong` (0.10) | Nearly identical already |
| Muted text (disclaimer, ©, links) | 11px `rgba(232,230,223,0.5)`, system-ui (:10–17) | `TYPE.bodyUI` at 11px, `COLOR.ink4` | `ink4 #77736B` ≈ the 0.5-alpha warm grey |
| Link hover | `rgba(232,230,223,0.75)` (:129) | `COLOR.ink2` | |
| `·` separator | `rgba(232,230,223,0.35)` (:110) | `COLOR.ink5` | |
| Wordmark | 14px w500 `#E8A020` ls 0.09em (:141–156) | `COLOR.amber` + `FONT.sans` | Match TopBar wordmark treatment exactly — same letterform at two sizes |
| Toast fallback | `FiToast` from `FieldIntelligenceShared` (:2, :159) | none — leave | See Risk 8 |
| Grid / narrow breakpoint (640px) | matchMedia layout (:27–33, :58–67) | keep | Layout, not skin |

### 2e. UserMenu (`UserMenu.tsx`)

| Cluster | Current value | Design-system role | Note |
|---|---|---|---|
| Avatar button | 32px circle, border/color `#E8A020` (:46–59) | `COLOR.amber` (already exact) | keep `.fm-pill-button` class (min-height escape, `index.css:431`) |
| Dropdown panel | bg `#0F0F12`, border `#1E1E22`, radius 6, shadow (:66–78) | `ELEVATION.card` (`surfaceCard`, `RADIUS.card`) | Same "floating panel = card" rule as the search dropdown; the two must match |
| Item hover | `#1E1C26 !important` via inline `<style>` (:80–90) | `COLOR.surfaceRaised` | The cool violet-grey hover is the most visible cool leak once the panel is warm |
| Menu items | 13px `#E8E6DF`, system-ui (:318–328) | `TYPE.bodyUI` sized 13, `COLOR.ink1` | |
| Sub-items | 12px `#C8C5BE` (:330–340) | `COLOR.ink2` | |
| Section labels (WORKSPACE…) | 10px w600 uppercase `#6B6A65` ls 0.06em (:342–350) | `TYPE.microLabel` | Token ls is 0.11em — adopt token value |
| Profile header text | `#9B9892` / `#6B6A65` (:91–107) | `ink3` / `ink4` | |
| Dividers | `#1E1E22` (:360–364) | `COLOR.hair` | |
| Sign Out | `#E8704E` + hover `rgba(232,112,78,0.08)` (:87–89, :308) | **no token — gap** | See Risk 6 |
| Chevron `▸` | `#6B6A65` (:171) | `ink4` | |
| Dead code | `subsectionLabelStyle` (:352) unused | delete | |

### 2f. InviteColleaguesButton (`InviteColleaguesButton.tsx`)

| Cluster | Current value | Design-system role | Note |
|---|---|---|---|
| Pill CTA | bg `rgba(232,160,32,0.10)`, border `rgba(232,160,32,0.45)`, text `#E8A020` (:45–60) | `COLOR.amberSoft` (0.16) bg + `COLOR.amber`; `RADIUS.pill` | 0.10→0.16 bg tint is a visible (intentional) brightening; border alpha 0.45 has no token — derive from amber, don't invent a new hex |
| Count text | `#9B9892` (:64) | `ink3` | |
| Modal scrim | `rgba(0,0,0,0.6)` (:89) | keep | |
| Modal panel | bg `#0D0D10`, border `#1E1E22`, radius 8 (:102–112) | `ELEVATION.card` | Frame only — see Risk 7 for the interior |
| Modal labels/body | `#6B6A65` / `#9B9892` (:125–131, :152) | `TYPE.microLabel` / `TYPE.bodyUI` | |
| Interior | `InviteShareCard` + `InviteEmailForm` (HomePage-owned, cool) | **out of scope** | Migrate with Home (audit row 3) |

---

## 3. Risk points

1. **The two DONE surfaces are the shell's most exposed canvases.** The warm feed
   (`App.tsx:704/:1046`) and warm profile (`DetailScreen.tsx:1182`) already render this chrome —
   today's cool `#1E1E22` borders sit visibly on top of migrated pages. Any shell regression ships
   to the flagship surfaces first. Verify against feed + profile before anything else.
2. **Three mount patterns, one component.** TopBar renders inside AppLayout's 960–1120px
   container, but also inside App.tsx's 720px `fm-screen` wrappers (feed, FI thread) whose ground
   is hard-coded `#0A0A0B` *in App.tsx, not in the shell*. Warming the shell does **not** warm
   those two grounds — either accept the (imperceptible) mismatch or update the two `fm-screen`
   wrappers in the same pass. TopBar itself must stay width- and container-agnostic.
3. **Mobile CSS contract.** `index.css` targets `.fm-topbar`, `.fm-logo`, `.fm-topbar svg`,
   `.fm-pill-button` with `!important` (≤768px: 56px bar, 14px logo, 20px icons, 44px tap-target
   escape). Keep all classNames and DOM structure; if type roles change sizes, update the CSS
   overrides in the same commit or mobile silently diverges.
4. **Font swap is the real diff.** system-ui → IBM Plex Sans changes metrics everywhere at once:
   the 0.09em-tracked FIELDMARK wordmark gets wider (48px bar with inline search + Invites pill +
   avatar is already tight on ~768–900px viewports — check wrap), menu items reflow, footer
   baselines shift. Screenshot-diff at 375 / 768 / 1280 widths.
5. **Cohort-color exposure (SearchBar only).** The dropdown's badge/accent hexes
   (`#FFD700` established, `#9B6DFF` rising, `#4ECDC4` community) are the product's cohort
   identity, NOT design-system colors. The migrated HCPCard deliberately kept them inline
   (`HCPCard.tsx:787`). Rule for this pass: **cohort hexes are frozen** — never remap to
   `COLOR.estGreen`/`COLOR.violet`, never invent replacements. Migrate the surfaces around them.
6. **Two missing tokens — resolve before coding, don't improvise mid-edit:**
   - *Amber hover* — logo hover `#F5D060` (TopBar:71). Options: add `COLOR.amberHover` to
     designTokens.ts, or drop the color shift and keep the existing opacity dip only.
   - *Danger* — Sign Out `#E8704E` (UserMenu:308). The palette has no destructive color. Add
     `COLOR.danger` (recommended — Landscape/Follow-ups will need it later) or leave the one-off
     hex with a comment. Either is fine; deciding it in the tokens file keeps the shell PR clean.
7. **Invite modal is a warm frame around cool guts.** The modal interior reuses
   `InviteShareCard`/`InviteEmailForm` from HomePage. Migrating the frame here and the interior
   with Home (audit row 3) leaves an interim mixed modal — acceptable, but say so in the PR
   description so it isn't filed as a bug.
8. **GlobalFooter → FiToast coupling.** The footer's fallback toast imports from
   `FieldIntelligenceShared` (cool, FI-owned). The toast is transient chrome; leave the dependency
   and note it. Do not restyle `FiToast` here — it renders on FI surfaces too (fork-or-flag).
9. **Admin stays deliberately cool.** A warm TopBar over Admin's documented cool utility body is
   expected and fine (`adminUi.tsx` documents the choice). Don't "fix" the contrast.
10. **Behavioral no-touch list.** `onToast` plumbing (App.tsx feed/thread), SearchBar's
    `formatScoreFloor1` call and search/debounce logic, UserMenu routes, invite logic,
    breadcrumb API (`BreadcrumbItem`), `maxWidth` values. This pass is skin only — zero prop or
    routing changes, so all ten AppLayout call sites recompile untouched.

## 4. Suggested execution order (one branch, per the token-migration ground rules)

Small reviewable commits on a dedicated branch (`redesign/shell-chrome`), Cloudflare previews
off `foundation-rebuild` only after review:

1. **Tokens prep** — settle Risk 6 (amberHover / danger) in `designTokens.ts`; delete
   DetailScreen's dead GlobalFooter import and UserMenu's dead `subsectionLabelStyle`.
2. **SearchBar visual** (audit row 1) — wells/card/inks per §2c; cohort hexes frozen.
3. **GlobalFooter** — smallest blast radius; establishes the wordmark treatment TopBar will echo.
4. **AppLayout** — ground + FONT.sans + breadcrumbs. The font cascade lands here; screenshot-diff
   all three viewport widths before proceeding.
5. **TopBar + UserMenu + InviteColleaguesButton** — the bar and its two poppers together, so the
   two floating panels (menu, search dropdown) ship with identical `ELEVATION.card` treatment.
6. **Verify matrix** — feed (DONE, direct TopBar), profile (DONE, AppLayout), Watchlists
   (UNTOUCHED), Admin (PARTIAL, deliberately cool), FI thread (direct mounts), at 375/768/1280;
   footer narrow breakpoint at ≤640.

---

## 5. Top-3 surfaces by visibility × effort (audit §5) — migration sketches

Per the audit's ranking: **1. SearchBar, 2. the shared shell, 3. Home.**

### 1 — SearchBar (global, low effort)

One component, mounted only by TopBar (inline ≥768px, overlay below), so there are no
fork-or-flag call sites beyond the shell itself; its only shared dependencies are data-layer
(`lib/api.searchHCPs`, `lib/cohort-metrics.formatScoreFloor1` — the audit's stray-integer flag is
already closed at `SearchBar.tsx:45`, leaving a purely visual job). Cohort-color exposure is the
highest of any small component in the app: the badge triple `#FFD700`/`#9B6DFF`/`#4ECDC4` plus the
hover left-border accent are frozen product identity (the migrated HCPCard kept the same hexes
inline), so the migration recolors everything *around* them — input to `surfaceWell`+`hair`,
dropdown to `ELEVATION.card`, inks and mono score per §2c — and leaves the four cohort hexes
byte-identical. The warm/cool boundary is unusually favorable: because the dropdown floats over
whatever page is beneath, warming it improves the two DONE surfaces immediately and merely
pre-warms one floating panel on cool pages, which reads as polish rather than inconsistency.

### 2 — The shared shell (this document)

Covered in full above; boundary summary: shared-component dependencies are the five shell
components plus two external couplings (FiToast from FI-shared, the HomePage invite forms inside
the modal), cohort-color exposure lives solely in the embedded SearchBar dropdown (frozen hexes),
and the warm/cool boundary inverts app-wide on merge — chrome becomes uniformly warm while
seventeen-odd page bodies stay cool, which is the correct direction because warm chrome over cool
bodies reads as progressive polish, whereas today's cool chrome over the warm feed/profile reads
as a defect on the two flagship surfaces.

### 3 — Home `/me` (high visibility, medium effort)

`HomePage.tsx` (247 lines) plus ~17 tile components, wrapped in AppLayout, so it inherits the
shell for free once rows 1–2 land; its shared-component dependencies run in the *other*
direction — Home owns `InviteShareCard`/`InviteEmailForm`, which the shell's invite modal reuses,
so migrating Home's invite tiles retroactively completes the modal interior (Risk 7), and any
restyle of those two must be checked in both mounts. Cohort-color exposure is moderate:
tiles carry violet/amber cohort badges and counts (no scores — counts only, no floor-format work),
and the same frozen-hex rule applies wherever a badge names a cohort. The warm/cool boundary
makes Home the natural third move: it is the post-login landing page (warm shell + cool body will
be most noticed here), it contains the flagged **AI-Synthesis block** (`CoverageGapsTile.tsx:293–334`)
which should receive the serif/provenance narrative treatment (audit §4) as part of the pass rather
than a token-only repaint, and completing it means the default logged-in path — Home → feed →
profile — is warm end-to-end.
