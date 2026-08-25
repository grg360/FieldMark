# `getTrackedHcpsInTerritory` does not filter by territory

**Status:** open. Logged 2026-08-19.
**Function:** `frontend/src/lib/home.ts` → `getTrackedHcpsInTerritory(userId)`
**Symptom in CI:** standing `TS6133` at `src/lib/home.ts(1233,11)` —
`'territoryStates' is declared but its value is never read`.
**Surface:** Home, the YOUR PORTFOLIO rail (`components/HomePage/HomePage.tsx:462-505`).

## The defect

The function reads the MSL's territory and then never applies it:

```ts
const territoryStates = profile.territory_states as string[];   // :1233 — never read again
```

It is used twice, and neither use is a filter. It gates an early return — a profile with no
`territory_states` returns `[]` — and that is all. Every subsequent query is keyed on
`hcpIdsInTerritory`, which is built from `allHcps.map(h => h.id)`, i.e. **every HCP the user
has a relationship row for**, regardless of state. The variable name asserts a narrowing that
the code does not perform; `nppes_practice_state` is selected onto `HcpRow` and likewise never
compared against anything.

So the name is wrong in both halves: it is not "in territory", and the early return means a
user with no territory set sees an empty portfolio rather than their tracked people.

## Why it has not surfaced as a visible bug

The demo user (`f0a8352f-…`) carries a Northeast territory (`CT MA ME NH NY RI VT NJ PA`) and
44 relationship rows, and the rail renders 39 of them — but the 39 is not a territory cut. It
comes from a *different* filter one layer up, at `HomePage.tsx:196`:

```ts
setPortfolioChips(chipsD.filter((c) => trackedIds.has(c.hcp_id)));
```

`trackedIds` is `getTrackedHcpIds` (watchlist membership: `msl_watchlist_items` joined to
non-archived `msl_watchlists`). 44 relationship rows, 39 on a live watchlist. The five that
drop — Maen Hussein, Naim Nazha, Richard D. Hall, Stephen Divers, Ticiana Leal — are dropped
for having no watchlist row, not for sitting outside the Northeast.

A tracked HCP outside the territory therefore renders today. Nothing on this surface would
tell you.

## What it would take

Decide which the surface means, because they are different products:

* **Filter** — apply `territoryStates` against a located field and rename nothing. Note that
  `nppes_practice_state` is null for most non-US rows, so a naive `IN` drops every
  international tracked HCP; the located field the rest of the surface uses is
  `COALESCE(current_country, country)` (see `sql/affiliation/04_rising_board_current_country.sql`),
  which is a country, not a state.
* **Or drop the pretence** — rename to `getTrackedHcps`, delete `territoryStates` and the
  early return, and let a user with no territory still see their portfolio.

The second is closer to what the surface already does and removes the TS6133 outright. The
first is a behaviour change and needs a decision about what "in territory" means for an HCP
whose practice state is unknown.

## Related

* `docs/REGIONS_FRONTEND_DUPLICATE_LIST.md` — the other place territory/region vocabulary is
  duplicated on the frontend rather than read from `region_countries`.
