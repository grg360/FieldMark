# `regions.ts` duplicates `region_countries`

**Status:** open. Logged 2026-08-18.
**File:** `frontend/src/lib/regions.ts` — the `REGIONS` map.
**Class:** same drift risk as `EUROPE_COUNTRIES`, which the 2026-08-18 sentinel work moved
into the database. This is the remaining copy.

## The duplication

`REGIONS` hardcodes country membership for every region key, and `region_countries` holds the
same membership in the database. Verified 2026-08-18 — **APAC agrees exactly today**:

```
regions.ts REGIONS.APAC   JP KR CN TW HK AU NZ SG IN TH MY ID PH VN     (14)
region_countries APAC     AU CN HK ID IN JP KR MY NZ PH SG TH TW VN     (14)
```

Same set, different order. Nothing is broken right now. The risk is that the two are edited
independently: a country added to the database board does not appear in the frontend filter,
or the reverse, and neither side errors — the board simply returns a different population than
the filter claims to select.

This is the failure `sql/ledger_territory/03_europe_region_and_rising_ranks.sql` called out when
it created the EUROPE key: *"the country list lives HERE, in the database, so the RPC that
computes the Europe rank and the frontend chips cannot drift apart."* `EUROPE_COUNTRIES` was
reduced to selector labels when `scopeFromKey` moved to the sentinel. `REGIONS` was not.

## Why it was not fixed with the tree

The territory tree can read the database. `REGIONS` currently cannot — see below — and it has
two consumers beyond the ledger:

* `FilterDrawer.tsx` — the region filter UI, via `REGION_ORDER` / `REGION_LABELS`.
* `lib/api.ts` — `countriesForRegion()` and `ALL_REGION_COUNTRIES`, the latter being the
  negation list for the "Other" region board.

So removing it is a wider change than the ledger work it would have ridden along with.

## Blocker: the client cannot read these tables

`regions` and `region_countries` both have **RLS enabled with zero policies**, while `SELECT` is
granted to `anon` and `authenticated`:

```
regions           rls=true  grantees={anon,authenticated,postgres,service_role}  policies=0
region_countries  rls=true  grantees={anon,authenticated,postgres,service_role}  policies=0
```

Under Postgres, RLS enabled with no policy returns **zero rows** to any role that does not bypass
RLS. The grant is therefore inert for the browser client. The SECURITY DEFINER RPCs
(`rising_ledger`, `rising_board`, and the scorer's direct connection) are unaffected, which is
why nothing has failed yet — every reader of these tables today runs as a definer or as
`postgres`.

Anything that reads `regions` from the client renders an **empty list, silently**. This is the
same shape as the 2026-07-09 Atopic Dermatitis RLS finding, inverted: there, tables were readable
that should not have been; here, reference data is unreadable that should be.

## Fix, when taken

1. Add a permissive read policy to both tables (`FOR SELECT USING (true)`) — they are public
   reference data, not user data.
2. Add a regions loader in the frontend and point `REGIONS`, `REGION_LABELS`, `REGION_ORDER`,
   `countriesForRegion` and `ALL_REGION_COUNTRIES` at it.
3. Delete the hardcoded map.

Step 1 is a prerequisite for the data-driven territory tree and should ship with it.
