# Multi-TA Selector — Pre-Design Audit

Read-only map of the current state ahead of building a "Multi-TA Selector" (let entitled users switch
between TAs coherently, showing only the TAs they can access). FieldMark currently has **two built TAs**:
Oncology→**NSCLC** and Immunology→**Atopic Dermatitis (AD)**. Nothing was changed to produce this doc.

## TL;DR verdicts

| # | Question | Verdict |
|---|----------|---------|
| 2 | Single source of truth for "current TA"? | **NO app-wide TA state.** The URL (`/:ta/:dashboard/:indication`) is the de-facto source for **feed** pages; detail/secondary pages derive TA ad hoc (`?ta=` param, `location.state`, `resolvePrimaryTaId`, or hardcoded `nsclc`). `track` has a global context; **TA does not.** Needs consolidating. |
| 3 | User→TA entitlement modeled? | **UNMODELED.** No user↔TA table, allow-list, subscription, tier, or RLS scoping. Every authenticated user can reach every TA. "Show only my TAs" must be **built from scratch.** |
| 1 | Hardcoded-TA inventory | ~8 genuine bugs + ~8 latent default params, catalogued below. |
| 4 | Canonical TA registry? | **Scattered** across ≥6 parallel maps in 2 files + the indication catalog. No single "all TAs" structure. |
| 5 | Natural home for the selector | **`TopBar`** (already TA-aware via `currentTaId`, rendered by both chrome shells) — or promote `TAFilterChips` out of the feed-only block. |

---

## Q1 — Hardcoded-TA inventory (the un-hardcoding scope)

Classification: **(a)** genuine bug (a user-selected TA is ignored / silently forced to NSCLC); **(b)** benign
(marketing/mock copy, TA-aware default, or correctly-threaded mapping).

### Core bugs — highest priority (a)

| file:line | Hardcodes | Surface | Correct TA source |
|---|---|---|---|
| `frontend/src/lib/home.ts:7` | `TA_SLUG_TO_UUID = { NSCLC: "c0065b03…" }` (NSCLC only) | Home coverage/territory tiles, Coverage % — any non-NSCLC profile TA maps to no UUID → tiles silently empty | full registry / reuse `TA_ID_MAP` |
| `frontend/src/components/HomePage/CoverageGapsTile.tsx:54` | `getHcpOverview(hcp_id, "NSCLC")` | AI overview per coverage-gap HCP | the gap's own TA (`context.taUuids`) |
| `frontend/src/components/HomePage/YourInstitutionsTile.tsx:65,92` | `navigate("/institutions/nsclc")` | "Browse all" + empty-state links | user-selected TA |
| `frontend/src/lib/institutionPins.ts:86` | `therapeuticArea = "NSCLC"` default | pinned-institution stats resolved against NSCLC index (only caller relies on default) | caller-threaded TA |
| `frontend/src/components/PublicationsListPage/PublicationsListPage.tsx:41` | `getPublicationsByTheme(inst, theme, "NSCLC", 50)` | Publications-by-theme page carries **no** TA at all | thread a TA param through the route |
| `frontend/src/components/UserMenu.tsx:187,199,211,224` | `/oncology/{established,rising-stars,community}/nsclc`, `/institutions/nsclc` | User-menu nav targets | user-selected TA/indication |
| `frontend/src/components/LandscapeRoute.tsx:17` | `const taSlug = ta ?? "nsclc"` | Landscape route fallback | active/selected TA |
| `frontend/src/components/InstitutionsIndexRoute.tsx:14` | `const taSlug = ta ?? "nsclc"` | Institutions index fallback | active indication slug |
| `frontend/src/App.tsx:780` | `/landscape/${indSlug === "all" ? "nsclc" : indSlug}` | Landscape button forces nsclc when indication = "All" | `taLabelToApiSlug(selectedTA)` |

### Latent (a) — default params that silently produce NSCLC if a caller forgets to thread TA

`frontend/src/lib/api.ts:3942,4065,4250,4341` (`getInstitutionSummary/Leaderboards/Collaborations/ExternalPartners`
`taSlug = "nsclc"`), `frontend/src/lib/institutionThemes.ts:20` & `frontend/src/lib/aiOverviews.ts:11` &
`frontend/src/lib/publicationsList.ts:43` (`therapeuticArea = "NSCLC"`). Their only production caller today
(`InstitutionRoute.tsx`) threads a resolved TA, so these are dormant — but they're footguns for any new caller.

### Known (already flagged, excluded from "find the rest")

- `frontend/src/components/InstitutionRoute.tsx:111-112` — `?? "nsclc"` / `|| "NSCLC"` **last-resort** fallback
  after the `resolveInstitutionPrimaryTaId` chain (Piece 1). Correct-by-design fallback, not a silent force.
- `frontend/src/components/UserMenu.tsx:257` + Field Intelligence — goes straight to Oncology/NSCLC.

### Benign (b) — sampling (full list in sweep)

Marketing/mock/tooltip copy (`DemoPage`, `MethodologyPage`, `ScoreBreakdownV3*`, `WelcomeBanner`,
`mockFieldIntelligencePosts`), form option lists (`SurfaceHCPForm`, `ProfileScreen`, `NoteEntryScreen`,
`ContextualizeHCPForm`), TA-aware defaults (`Telescope`/`TelescopeDrawer` default NSCLC JSON for non-AD),
and the registry maps themselves. `DetailScreen.tsx:1574` is a slug→display mapping (`nsclc`→"NSCLC"), TA is
threaded — not a force.

---

## Q2 — Current-TA state: **no single source of truth**

**What exists globally (root providers, `frontend/src/main.tsx` → `FilterProvider` → App → `TrackProvider`):**
- `TrackContext` (`frontend/src/lib/TrackContext.tsx`) — holds the **track** (established/community/rising/
  telescope/social/field-intelligence), sessionStorage-backed. A real global source of truth… but for track,
  **not TA.**
- `FilterProvider` (`frontend/src/lib/filter-context.tsx`) — region / states / territory / themeIds
  (localStorage-backed, `hydrateFromProfile`). **No TA.**

**How TA is actually derived (fragmented):**
1. **Feed pages** — from the **URL** route params `/:ta/:dashboard/:indication`, parsed by `resolveFeedRoute`
   (`frontend/src/lib/routeSlugs.ts:241`) each render in `App.tsx`. Exposed as locals `selectedTA =
   route.taLabel`, `selectedIndication = route.indicationLabel`, `indicationTaId = getIndicationTaId(...)` and
   **prop-drilled** down. Selecting a TA/indication = **`navigate()` to a new URL** (no setState).
2. **Detail / secondary pages** (outside `/:ta/…`) — derive TA independently, in priority order that varies by
   page: `?ta=` query param → `location.state` nav state → data-derivation (`resolvePrimaryTaId` for HCPs,
   `resolveInstitutionPrimaryTaId` for institutions) → hardcoded `nsclc`.
3. **Data layer** resolves label/slug→UUID through `resolveLandscapeTaId` / `TA_ID_MAP` (see Q4).

**Verdict:** There is a *de-facto* source for feeds (the URL) but **no app-wide TA context** every surface
reads, and detail pages don't use the URL TA at all. **State needs consolidating before a single selector can
drive it.** Cleanest path: introduce a `TAContext` (mirroring `TrackContext`) as the single writable source,
seed it from the URL on feed pages and from the per-page resolve chain on detail pages, and have the selector
write to it (and to the URL for feed routes).

---

## Q3 — Entitlement model: **UNMODELED (build from scratch)**

- **User model:** `auth.users` (Supabase identity) + **`msl_profiles`** (app profile, keyed by `user_id`;
  shape in `frontend/src/lib/authHelpers.ts:4-20`). The legacy `users` table (`schema.sql`) is stale/unqueried.
- **`msl_profiles` fields:** `first_name, last_name, company, role, region, states_covered text[],
  default_ta_slug, default_indication_slug, onboarded_at, last_active_at, notify_* , linkedin_verified_at`.
- **No entitlement anywhere:** no `allowed_ta`, `entitlement`, `subscription`, `license`, `tier`, `plan`,
  `seat`, or `user_therapeutic_area` field/table in `schema*.sql`, `migrations/`, `supabase/`, or `sql/`. The
  `therapeutic_areas` table (`schema2.sql:10-19`) is a pure `id/name/slug` lookup; the only per-entity join is
  `hcp_therapeutic_areas` (HCP↔TA), never user↔TA.
- **TA availability is gated by data-existence only, not user:** `TAFilterChips.tsx:14` hardcodes
  `TA_CHIPS = ["Oncology","Immunology"]` (Hepatology/Rare Disease retired for empty data); `isTelescopeAvailable`
  / `isInstitutionsAvailable` key on TA/indication **names**, no user arg. RLS is open —
  `migrations/2026_07_09_ad_tables_rls_lockdown.sql` documents `SELECT TO authenticated USING (true)`.
- **Closest hook to extend:** add `allowed_ta_slugs text[]` on **`msl_profiles`**, mirroring the existing
  many-valued `states_covered text[]` territory pattern. `default_ta_slug` already proves the profile↔TA-slug
  linkage (single default → generalize to an allow-list). Ideally enforce in RLS too (currently `USING (true)`).

**Verdict:** "show only my TAs" is a **new feature**, not a query against existing data. Until built, the
selector would show all *built* TAs (Oncology, Immunology) to everyone.

---

## Q4 — TA registry: **scattered, no canonical "all TAs" structure**

The registry is spread across parallel record literals that must be hand-kept in sync. Key stores:

- **`TA_ID_MAP`** (`frontend/src/lib/api.ts:724-731`) — slug→UUID, the closest thing to canonical. **6 slugs /
  4 parent TAs:** `rare-disease, hepatology, nsclc, oncology, immunology, atopic-dermatitis`. `nsclc` and
  `atopic-dermatitis` are **indication-level** slugs with their own UUIDs sitting alongside parents. Oncology
  has both a parent UUID (`095bc902…`) and its NSCLC data UUID (`c0065b03…`). Inverse: `SLUG_BY_TA_ID`;
  accessors `apiSlugForTaId` / `taIdForApiSlug`.
- **Two display-name maps:** `TA_DISPLAY_NAME_BY_SLUG` (slug→name, `api.ts:745-752`) and `TA_DISPLAY_BY_ID`
  (UUID→name, `api.ts:2443-2450`) — the latter maps **both** `c0065b03…` and `095bc902…` → "Oncology".
- **Routing label↔slug** (parent TAs only): `TA_SLUG_TO_LABEL` / `TA_LABEL_TO_SLUG` (`routeSlugs.ts:8-20`).
- **`taLabelToApiSlug`** (`routeSlugs.ts:119-132`) — label→**data** slug bridge; critically **Oncology → `nsclc`**
  (data lives at the indication). A near-duplicate resolver `resolveTASlug`/`resolveTAId` exists in
  `api.ts:949-966`, and a sixth inline slug→name map `landscapeTaSlugToName` at `api.ts:3339-3348`.
- **`INDICATIONS_BY_TA`** (`frontend/src/components/IndicationFilter.tsx:15-60`) — **the parent→indication tree**
  with `{label, active, count?, taId?}`. Only **Immunology's** active options carry an explicit `taId` (AD UUID);
  every other TA resolves its taId indirectly. This is the map the selector's indication tree would read.
- **Per-TA indication slug↔label maps** (`routeSlugs.ts:40-108`) — a fifth place indication lists live
  (superset incl. coming-soon).
- **DB table:** `therapeutic_areas` is queried in exactly one place — `resolveLandscapeTaId` (`api.ts:3350-3361`),
  and only as a fallback when `TA_ID_MAP` misses.

**Built vs coming-soon** is expressed two ways: indication-level `active` flag in `INDICATIONS_BY_TA`
(gates feeds via `isIndicationDataActive`), and parent-level hard-disable `TA_CHIPS = ["Oncology","Immunology"]`
(`TAFilterChips.tsx:14`; echoed in `getAllTACounts` `["nsclc","immunology"]` and `TASelectionScreen`). Live
surface = **Oncology(via NSCLC) + Immunology(via AD)**.

**Hazard for the selector:** the parent↔indication split (Oncology≠its data slug `nsclc`; one display name from
two UUIDs). The selector must decide if it selects a **parent TA** (drives chips/routing) or a **specific
indication with its own taId** (drives data). The active-data path is always
`label → taLabelToApiSlug → TA_ID_MAP[slug] → UUID`.

---

## Q5 — Nav structure & where the selector lives

**Two chrome shells:**
1. **Feed shell** (inline in `App.tsx:699-724`): `TopBar` → `TAFilterChips` → `IndicationFilter` →
   `DashboardTabs` → feed. This is the **only** place TA/indication nav renders today.
2. **`AppLayout`** (`frontend/src/components/AppLayout.tsx`) — reusable shell for non-feed pages:
   `TopBar` → optional breadcrumbs → children → footer. **Does NOT render TAFilterChips/IndicationFilter.**

**The nav components:**
- **`TAFilterChips`** — renders `TA_CHIPS` (Oncology/Immunology) as buttons; click →
  `resolveIndicationForTaSwitch` (keep indication if still active, else first active) → `navigate(buildFeedPath(...))`.
  **Pure navigation, no setState.**
- **`IndicationFilter`** — renders `INDICATIONS_BY_TA[ta]` as a scrolling pill row (active vs greyed);
  click → `navigate(buildFeedPath(...))`.
- **`DashboardTabs`** — the track tabs.

**`TopBar`** (`frontend/src/components/TopBar.tsx`) — 48px bar: logo (→`/me`), optional centered `SearchBar`,
`UserMenu`. **Already receives `currentTaId`** and is rendered by **both** shells.

**Insertion guidance:** put the global TA selector in **`TopBar`** — it already knows the TA (`currentTaId`) and
appears app-wide (feed + `AppLayout`), so a selector there is automatically global. Alternatively promote
`TAFilterChips` out of the feed-only block. Either way its data source must be a **unified registry** it doesn't
have today (it needs `TA_CHIPS` + `INDICATIONS_BY_TA` + `TA_ID_MAP`/`taLabelToApiSlug` combined), and — once Q3
is built — filtered by the user's `allowed_ta_slugs`.

---

## Implications for the selector workstream (derived from the above)

1. **Consolidate TA state first (Q2).** Introduce a single writable TA source (a `TAContext` peer to
   `TrackContext`); make the selector and the URL both drive it; retire per-page ad-hoc derivation where possible.
2. **Build entitlement (Q3).** Add `allowed_ta_slugs text[]` to `msl_profiles` (+ RLS); selector filters the
   registry by it. Until then, show all *built* TAs.
3. **Unify the registry (Q4).** Collapse the ≥6 parallel maps into one canonical structure
   (slug ↔ UUID ↔ display ↔ parent ↔ indications ↔ active) the selector reads — the current scatter is the main
   correctness hazard, especially the Oncology↔nsclc / Immunology↔AD split.
4. **Un-hardcode the surfaces (Q1).** Fix the ~8 core bugs + ~8 latent defaults so every surface respects the
   selected TA instead of falling back to NSCLC.
5. **Home the selector in `TopBar` (Q5)** so it's global across both chrome shells.
