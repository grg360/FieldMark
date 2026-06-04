# Filter System — Spec

**Status:** ready for build. Locked decisions inline; open questions at the bottom.
**Target files:** new `frontend/src/components/FilterDrawer.tsx`, modifications to `api.ts`, `App.tsx`, and the cohort feed query functions.
**Sister documents:** supersedes `fieldmark_filter_scope.md` from May 2 (the prior scope predated the v2 rebuild; data coverage has shifted materially).
**Date drafted:** Jun 4, 2026

---

## Purpose

A unified, drawer-based filter system that lets MSLs slice the feed cohort along multiple dimensions. Replaces the implicit "global ranking, top 20" view with a personalized, territory-aware feed. The first dimension shipped is geography (US default + state + region multi-select); subsequent filter dimensions plug into the same drawer, state model, and URL serialization without restructuring.

This is the highest-leverage feature for converting FieldMark from "interesting demo" to "usable product." A feed an MSL can't slice doesn't replace the spreadsheet they're maintaining today.

---

## Defaults

- **Country:** United States. The platform is US-focused. Other countries are accessible via the filter drawer but US is the visible default.
- **State:** all US states. User can multi-select to narrow.
- **Region:** none active by default. Selecting a region (e.g., "Northeast") implicitly multi-selects its constituent states.
- **Career age band:** all bands.
- **Indication:** matches the existing indication chip selection (no change to current behavior).
- **Tier (cohort):** matches the existing cohort tab selection (no change to current behavior).

When no filters are active beyond country, the drawer's filter button reads "Filters" with no count. Active non-default filters increment a count badge ("Filters (3)").

---

## Filter dimensions

### Tier 1 — ship in v1.5

These have viable data coverage and direct MSL workflow relevance.

| Dimension | Data source | Coverage (top 200 US NSCLC Est.) | UI pattern |
|---|---|---|---|
| Country | `hcps_v2.country` | 100% | Multi-select, default US |
| State | `hcps_v2.nppes_practice_state` | 85% | Multi-select, only active when country includes US |
| Region | Derived from state via mapping table | 85% (inherits state) | Multi-select, selecting expands to states |
| Career age band | `hcps_v2.career_first_pub_year_v2` | 100% | Range slider or band chips: 0-5 / 5-10 / 10-20 / 20+ years |
| Indication | Existing TA / indication system | 100% on current implementations | Already wired — surfaced in drawer for consistency |

### Tier 2 — ship in v1.5.x or v1.6

Data coverage is meaningful but not universal. Filters work but exclude HCPs without the underlying data. Worth shipping with a clear "Filtered subset" indicator so users know they're not seeing everyone.

| Dimension | Data source | Coverage | UI pattern |
|---|---|---|---|
| Research themes | `hcp_research_themes_v2` | 80% | Multi-select theme tags |
| Trial activity | `trial_investigators_v2` | 44% | Toggle: "Has active trials" |
| Open Payments engagement | `hcp_open_payments_summary_v2` | 52% | Toggle: "Has industry payments" + range |
| Specific company | `hcp_open_payments_top_companies_v2` | 52% | Multi-select pharma companies |
| Specific drug | `hcp_open_payments_by_drug_v2` | 40% | Multi-select drug names |

### Tier 3 — deferred (data needed)

- **City:** 7% coverage, not buildable
- **Institution tier (academic/community/industry):** 0% from `nppes_practice_setting`. Would need derivation from institution name via lookup table or LLM classification. Real data work, not a UI build.
- **DOL status:** `dol_matches_v2` table not yet created; depends on social features build
- **Saved by me:** depends on user notes / bookmarks infrastructure
- **Sponsor type history:** derivable from `trial_investigators_v2` joined to trial sponsor field — needs new aggregation
- **MSL territory from profile:** profile schema exists but feed query doesn't read it. Plumbing work, not a filter dimension per se.

---

## UI pattern

**Drawer-based.** A "Filters" button in the feed header opens a right-side slide-in drawer (~380px wide on desktop, full-width on mobile). Drawer contains all filter dimensions stacked vertically with section headers. Apply/Cancel buttons sticky at the bottom.

**Why drawer over inline chips:** the existing header is already crowded (cohort tabs + indication tabs + count + "Updated just now"). Adding 5-7 more filter rows makes the header overwhelming. A drawer pattern scales cleanly to 10+ dimensions and keeps the feed list visible while filters are applied.

**Header changes:**
- "Filters" button placed adjacent to the indication chip row
- Active count badge appears when ≥1 non-default filter is set ("Filters (3)")
- The existing "20 of 3,907 identified" count updates to reflect the filtered total

**Drawer sections (top to bottom):**
1. Country (multi-select)
2. Region (multi-select, US-only)
3. State (multi-select, US-only)
4. Career age band (chip group)
5. Research themes (multi-select, scrollable list)
6. Industry engagement (toggles + multi-selects for company/drug — Tier 2)
7. Trial activity (toggle — Tier 2)

Sections lazy-load their option lists (e.g., the themes multi-select fetches available themes for the current TA when the drawer first opens).

---

## URL serialization

Filters serialize to URL search params so views are shareable and back/forward navigation preserves state.

Example: `/oncology/established/nsclc?country=US&state=NY,NJ,PA&career=mid&themes=egfr-resistance,immunotherapy-combinations`

Multi-value filters use comma-separated values. Default filters (country=US) are omitted from the URL to keep clean. Career age bands use short slugs (`emerging`, `early`, `mid`, `established`).

Restoring filters from URL on page load happens before the first feed fetch so the user sees their filtered results immediately, not the default view flashing first.

---

## Region taxonomy

Region is a derived dimension — selecting a region multi-selects its states. The mapping table:

| Region | States |
|---|---|
| Northeast | CT, ME, MA, NH, NJ, NY, PA, RI, VT |
| Southeast | AL, AR, DE, FL, GA, KY, LA, MD, MS, NC, SC, TN, VA, WV, DC |
| Midwest | IL, IN, IA, KS, MI, MN, MO, NE, ND, OH, SD, WI |
| Southwest | AZ, NM, OK, TX |
| West | AK, CA, CO, HI, ID, MT, NV, OR, UT, WA, WY |

These match census-style regional groupings adjusted for typical MSL territory definitions. Worth a one-time review before shipping in case any state assignment surprises a user (DC is grouped with Southeast here, not its own region; some platforms put it in Northeast).

User selecting "Northeast" sets state filter to the 9 Northeast states. Deselecting any single state from the implicit set converts the region filter back to discrete state multi-select.

---

## Backend changes

`getEstablished`, `getCommunity`, and `getRisingStars` each accept a richer `filters` parameter:

```typescript
interface FeedFilters {
  therapeuticArea: string;
  countries: string[];        // default ['US']
  states?: string[];          // only applied if countries includes 'US'
  careerBand?: 'emerging' | 'early' | 'mid' | 'established';
  themes?: string[];          // theme IDs
  hasTrials?: boolean;
  hasOpenPayments?: boolean;
  paidByCompanies?: string[];
  paidForDrugs?: string[];
}
```

Each filter that's set adds a WHERE clause to the rank query. Filters that require joins to other tables (themes, trials, drugs) JOIN those tables. Pagination respects the filtered total — `loadMore` continues to walk the filtered cohort, not the global one.

A new `getFilterOptions(ta: string)` function returns available themes, companies, and drugs for the current TA, so the drawer's multi-selects show only options that exist for the current view.

---

## Locked decisions

1. **Drawer UI**, not inline chips. ✓
2. **US default**, with country multi-select to access other markets. ✓
3. **Region taxonomy included** as derived dimension over state. ✓
4. **URL serialization** for shareable filtered views. ✓
5. **State filter applies only when country includes US.** Other countries don't have state-level data in the v2 base. ✓
6. **Existing TA/cohort/indication remain header-level**, not in the drawer. They're navigation, not filters. Drawer contains filters layered on top of a chosen TA/cohort/indication view. ✓
7. **Tier 1 first**, then Tier 2 as separate follow-up build. ✓

---

## Build order

**Stage 1 — Foundation (largest single piece of work).** All scaffolding plus geography (the most data-supported, most universally relevant filter).
- New `FilterDrawer.tsx` component with drawer chrome + first three sections (Country, Region, State)
- New `lib/filter-state.ts` for filter state shape, URL serialization, default values
- Modify the three cohort fetch functions to accept and apply the new filter parameters
- Header "Filters" button with active-count badge
- Region → states expansion logic
- Validate against Rudin / Heymach / Loomba pages and the Established/Rising Stars/Community feeds

**Stage 2 — Career age band.** Single-dimension addition once Stage 1 is solid.
- Career band chip group in drawer
- `career_first_pub_year_v2` band derivation
- Add to URL serialization

**Stage 3 — Tier 2 additions.** Themes, trials, payments, companies, drugs. Each is a drawer section + backend filter clause. Independently shippable, can prioritize whichever MSLs ask for first.

**Stage 4 — Polish.** Active-filter pills shown above the feed (clickable to remove). "Reset all" button. "Save this view" if profile-derived defaults land later.

---

## Open questions

1. **Region default behavior on first open:** if the user is in the Northeast (per their profile, when that plumbing lands), should the feed open with Northeast pre-applied? My lean: yes, but only after profile-to-feed threading lands in a v1.5.x. For v1.5 launch, default to all US states.

2. **"Other" / unknown bucket:** the 15% of US Established NSCLC HCPs without state data — do they appear when no state filter is active (current behavior) and disappear when any state is selected? Or do we show them as "Location unknown" so MSLs know they exist? My lean: hide when state filter is active. Users selecting NY don't want to also see HCPs whose location we can't verify.

3. **Cohort badge on the count line:** "20 of 35 identified" if 35 US-NSCLC-Established HCPs match the filters. Should we also show "(of 3,907 globally)" as context, or stop at the US-filtered total? My lean: stop at filtered total. Global context is a distraction once the user is in their filtered view.

---

## Out of scope for v1.5

- Saved filter presets ("My territory" / "My focus drugs" / etc.)
- Filter combinations as shareable team views
- Filter analytics (which filters do MSLs actually use)
- Per-cohort filter defaults (Established users may default differently than Rising Star users)
- City filter (data coverage too thin)
- Institution tier filter (data not derivable from current schema)

---

## Validation plan

After Stage 1 lands:
- US-default feed: top 200 NSCLC Established US HCPs in order — Heymach #1, Spira #2, Neal #3, etc. Matches earlier diagnostic.
- Multi-state filter: select NY+NJ+PA, feed updates to ~10-15 HCPs from those three states. Rank order preserved within the filtered subset.
- Region filter: select "Northeast," states populate to the 9 NE states, feed updates accordingly. Deselect NY: feed updates, region filter degrades to "8 selected states" rather than "Northeast."
- URL serialization: filter, share URL with a tab open elsewhere, see same view.
- Cross-cohort: filters persist when switching between Established / Rising Stars / Community tabs (within the same TA).
- Filters reset when switching TA (Oncology → Hepatology) because different TAs have different data shapes (specialty filters, themes, etc.).
