# FieldMark Feed Filtering — v1.5 Scoping Document

**Status:** Scoping draft, May 2 evening session
**Author:** Garrett (with Claude as drafting partner)
**Decision owner:** Garrett

---

## Problem statement

The current feed surfaces the top 20 rising stars per therapeutic area, ordered by composite score descending. For Oncology, that means showing 20 of 3,809 — which means 99.5% of the cohort is inaccessible. An MSL covering NSCLC in the Northeast doesn't necessarily care about the global top 20; they care about *their* top 20: the rising stars relevant to their territory, indication, and strategic priorities.

The product currently presents a list, not a tool. To make FieldMark useful at scale, the feed must support slicing the cohort along multiple dimensions, with a default slice that's already personalized to the MSL's role.

This document scopes what filtering should look like in v1.5 and how it should integrate with existing product surfaces.

---

## What dimensions matter

### Tier 1 (must have for v1.5 launch)

These are the dimensions an MSL would actively use on day one. Without them, the feed is not workable for real territory management.

- **Therapeutic area** — already implemented (TA chips). Continues to anchor the view.
- **Indication** — already partially implemented as chips below the TA selector, but only NSCLC is wired for Oncology. Need to define indication taxonomies for each TA and wire the data:
  - Oncology: NSCLC, CAR-T, DLBCL, Melanoma, CLL, AML, breast, prostate, GU, etc.
  - Hepatology: MASLD, MASH, HCC, AIH, PBC, PSC, hepatitis
  - Rare Disease: enzyme replacement, gene therapy, neuromuscular, lysosomal storage, mitochondrial, etc.
  - Indication tagging on HCP records is partially in `hcp_therapeutic_areas` but does not currently cascade to publication-level subspecialty
- **Geography** — country, state, region, city. The MSL's territory definition (already captured in the profile screen) should drive the default. Need:
  - Country field cleaned (state-as-country bug must be fixed first — see v1.5 backlog)
  - State field populated (NPI provides this for US; international harder)
  - Territory mapping: state list → region label → "in my territory" filter
- **Career age band** — emerging (0-5 yrs), early career (5-10), mid-career (10-18), established (18+). Slider or chip selector. Methodology already uses `first_pub_year` for tier classification; same field powers this.
- **Tier** — already implemented as Dark Horses chip, but should expand to a multi-select: Rising Star, Dark Horse, Established, Emerging. User can show one or many.

### Tier 2 (high-value, deferrable to v2)

Useful but can be cut from v1.5 without breaking the core workflow.

- **Trial activity** — has active trials / has historical trials / no trial activity / by trial phase
- **Institution tier** — top academic / regional / community / industry (requires institution tier lists for all TAs, which is itself v1.5)
- **DOL status** — verified DOL only / has social presence / no social
- **Sponsor type history** — investigator-initiated trials / industry trials / government / academic
- **Saved by me** — HCPs the MSL has bookmarked or contributed notes on

### Tier 3 (data not ready yet — defer to v2 or v3)

Methodology has these as planned components but they're not currently populated.

- **Congress activity** — speaks at conferences, frequency, last appearance
- **MSL prior interactions** — has been engaged before, recency of last touch, by which MSL
- **Specific research focus within indication** — e.g., "EGFR exon 20 insertions" within NSCLC. Requires topic modeling on publications.
- **Publication recency band** — "published in last 12 months" / "last 3 years" / etc.
- **Engagement readiness signals** — accepts industry contact, has consulting agreements disclosed

---

## Filter vs Search vs Default View

These are three distinct surfaces and the product needs all three.

### Default view (the feed)

What the user sees when they open the app and select a TA. Should already be personalized.

**Recommended default:** Rising stars in [selected TA] · [my territory] · ordered by composite score · top 20 paginated

The territory anchor is the highest-leverage default. An MSL covering Northeast doesn't want the Bay Area top 20 — they want the Northeast top 20. The profile already captures this; the feed just needs to use it.

### Filter (passive narrowing)

The user sees the default view, then refines. Filters layer on top of the default.

**Recommended UX pattern:**
- Top-bar filter chips (already established for TA, dark horse, indication) for the most common filters
- A "More filters" affordance opening a panel for less common dimensions (career age, trial activity, etc.)
- Filter state persists across navigation within the session
- Active filter count badge so users know they're in a filtered view
- Clear "Reset filters" affordance to return to default

### Search (active intentional query)

The user has a specific HCP or set of criteria in mind and types something specific. Different from filters.

**Search box already exists** in TopBar — a search icon next to the profile icon. Need to verify what it does today (we didn't dig into it tonight) and confirm it's wired to the database. If not, this is the right time to wire it.

**Search use cases for MSLs:**
- "Find Dr. Smith" — name lookup (most common)
- "Show me anyone working on KRAS G12C" — research topic search (requires topic modeling, v2+)
- "Anyone in Boston working on rare neuromuscular disease" — geography + indication combined

For v1.5, name search is the minimum. Topic search is v2.

### How they interact

Default view → user adds filters → user can promote to search at any time. Search results respect any active filters (so searching "Smith" while in NSCLC filtered view returns NSCLC Smiths, not all Smiths). Filters can be saved as named slices for repeat use ("My territory NSCLC" preset).

---

## UX pattern recommendation

For mobile-first B2B SaaS with multi-dimensional filtering, the cleanest pattern is:

1. **Persistent top filters** for the 2-3 most-used dimensions (already in place: TA, dark horse, indication)
2. **"Filters" button** opening a bottom sheet or modal panel with everything else
3. **Active filter chip row** below the top filters showing what's applied, each with a × to remove
4. **Filter state surfaced in the section header** ("Showing 47 NSCLC rising stars in your territory" instead of "3,809 identified")
5. **Saved filter sets** as a v1.5 stretch goal — "My usual view" preset

Avoid:
- A persistent left sidebar (kills mobile UX)
- Modal-on-modal filter chains (frustrating)
- Filters that silently exclude without showing the user (always show "47 of 3,809" so the user knows the filter is doing something)

---

## Pagination / scrolling

Once filters are applied, the cohort might still be hundreds of HCPs. The feed needs:

- **Infinite scroll** as the primary pattern (load 20 more on scroll-end)
- **"Showing X of Y"** counter at the section header so the user knows how deep they are
- **"Jump to top"** button after the user has scrolled
- Possibly a **"Load all" / "Show top 100"** affordance for power users

Server-side pagination via Supabase `range()` or offset/limit. Existing query in `getRisingStars` already uses `.limit(200)` which is hard-capped — needs to become parameterized.

---

## Backend query implications

The current `getRisingStars` accepts `(therapeuticArea, limit, options.tier)`. Will need to expand to accept a richer filter object:

```typescript
interface RisingStarsQuery {
  therapeutic_area: string;
  tier?: string | string[];
  career_age_band?: 'emerging' | 'early' | 'mid' | 'established';
  states?: string[];
  countries?: string[];
  has_trials?: boolean;
  is_verified_dol?: boolean;
  indication_slug?: string;
  search_text?: string;
  sort_by?: 'normalized_score' | 'recent_activity' | 'pub_count' | 'citation_total';
  limit?: number;
  offset?: number;
}
```

This is a meaningful query refactor. The hcps and hcp_scores tables are already indexed for tier and TA; new filters will require additional indexes. The unique constraint added tonight (`hcp_scores_hcp_ta_unique`) makes this safer to extend without duplicate-row complications.

---

## Dependencies and prerequisites

Filters can't be built before the underlying data is clean. This is the realistic dependency chain:

1. **Country/state field normalization** (v1.5 backlog already) — must complete before geography filters work. State-as-country bug currently makes country filtering produce wrong results.
2. **Indication taxonomy completion** — Oncology needs CAR-T, DLBCL, etc. wired with real HCP-to-indication mappings. Hepatology and Rare Disease need their own indication lists. Currently only NSCLC is populated.
3. **Career age data completeness** — `first_pub_year` is required. 71% of HCPs had null first_pub_year as of tonight (per the dark horse audit). Backfill is a v1.5 workstream.
4. **Search screen audit** — verify what's currently wired vs decorative. May already be partially built.
5. **Profile territory threading** — the profile captures Northeast / state list, but it doesn't flow to queries. Need to surface this as a context the feed reads.

Order of operations:
1. Country/state normalization (week 1)
2. Indication taxonomy (week 1-2, parallel)
3. Career age backfill (week 2)
4. Profile-to-feed territory threading (week 2)
5. Filter backend (week 2-3)
6. Filter UX (week 3)
7. Search audit and wiring (week 3-4)

Realistic v1.5 scope: 3-4 weeks of focused work, separate from main launch prep.

---

## Open questions for Garrett

1. **Should filters be saved across sessions, or fresh each open?** Saved is more power-user; fresh is simpler.
2. **Should the default feed be territory-filtered automatically, or all-territory by default?** Territory-default is more useful but might confuse first-time users who don't realize they're seeing a slice.
3. **Indication taxonomy — who owns the canonical list per TA?** This is a methodology question, not a code question. The right indications for Oncology aren't "what's in PubMed MeSH" — they're "what pharma companies actually have indication-specific medical teams for."
4. **Is the search screen something we want for v1.5, or v2?** Depends on whether name lookup is critical for the launch demo.
5. **Should saved filters / presets ship in v1.5 or v2?** Stretch goal — useful but not critical.

---

## Recommendation summary

Filtering is the highest-leverage v1.5 product workstream. Without it, the feed is a demo, not a tool. With it, FieldMark goes from "interesting concept" to "thing an MSL would actually use every day."

This is bigger than 60-90 minutes. It's a 3-4 week workstream that depends on data cleanup the methodology already commits to. Worth scoping carefully before building, hence this document.

For tonight: capture this scope, do the smaller hardening work, defer filter implementation to a dedicated v1.5 sprint.
