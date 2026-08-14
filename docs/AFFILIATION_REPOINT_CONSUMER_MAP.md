# Location consumer map — repointing Established/Rising to `current_country`

**Date:** 2026-08-14 · **REPORT ONLY — nothing changed.**

**Headline:** the repoint is **not a frontend change**. Board scope is baked into
`hcp_established_ranks_v3.scope_value` by the scorer, which reads `hcps_v2.country`
directly. Pointing the UI at `current_country` without rescoring changes nothing; rescoring
moves 674 people between regional boards. Separately, the **"Other" region filter is already
broken** and will block any EU work until fixed.

---

## 1. Consumer map

### 1a. Ranking / eligibility — the load-bearing tier

| Consumer | Reads | How it's used | Cohort |
|---|---|---|---|
| `scripts/score/recompute_established_ranks_v3.py:99,151` | `hcps_v2.country` | **Writes `scope_value`.** Every Established HCP gets a `scope_type='global'` row (unconditional); those with non-null country *also* get `scope_type='region', scope_value=<code>`. | Established |
| `hcp_rising_star_ranks_v3.country` + `.us_rank` | denormalized snapshot | Rising carries its own country column and a separate `us_rank`. Currently 0 drift vs `hcps_v2.country`. | Rising |
| `lib/api.ts:99-100` | `scope_value` | `.in("scope_value", scopeValues)` — the regional board query. Reads the **rank table**, never `hcps_v2.country`. | Established |
| `lib/api.ts:594` | `p_scope_values` | Same values into the count/rows RPCs. | Shared |

### 1b. Filter / query plumbing

| Consumer | Reads | How it's used | Cohort |
|---|---|---|---|
| `lib/regions.ts` | country codes | The regional taxonomy: US / EU5 / EU / UK / APAC / LATAM / MENA / Other / Global. **EU and EU5 buckets already exist.** | Shared |
| `lib/rank-filters.ts:34-35` | `filters.country` | Country scope overrides region scope. | Shared |
| `lib/rank-filters.ts:60-82` | `filters.states` | `shouldApplyStates` — only true when scope includes US. | Shared |
| `lib/rank-filters.ts:87-104` | `nppes_practice_state` | Post-filters rank rows by US state. | Shared |
| `lib/api.ts:36-68` | region → countries | `resolveRpcScopeParams`; `states` only populated when `scopeIncludesUs`. | Shared |
| `lib/filter-context.tsx:108-135` | region/states | Region persists to localStorage; states deliberately do **not** (avoids silently re-hiding null-state HCPs). | Shared |
| `lib/home.ts:758,871`, `lib/homeWhatMoved.ts:97-103` | `nppes_practice_state` | Territory scoping on Home. | Shared |
| `lib/api.ts:4628,4818`, `TheWeekPage.tsx:80-104` | `nppes_practice_state` | State aggregation for institution/week rollups. | Shared |

### 1c. Display

| Consumer | Reads | How it's used | Cohort |
|---|---|---|---|
| `HCPCard.tsx:460,576-582` | `hcp.country` | `getCountryCode()` → flag image from flagcdn. No flag when null. | Shared |
| `HCPCard.tsx:764` | `hcp.country` | Rank scope label. **`(hcp.country ?? "US").toUpperCase()` — silently prints "US" for anyone with no country.** | Established / Community |
| `RisingLedger.tsx:118,133,429-430` | `r.country` / `r.state` | `region === "EU" ? r.country : r.state` — **an EU mode already exists.** Falls back to "NOT IN REGISTRY". | Rising |
| `RisingHcpProfile.tsx:369` | both | `nppes_practice_state \|\| country \|\| "GEOGRAPHY NOT ON RECORD"` | Rising |
| `ContactAccessCard.tsx:130-131` | `country` | `[city, state, country]` location line. | Shared |
| `lib/subline.ts:139-165` | NPPES city/state only | Affiliation subline. **Never reads country** — international HCPs get institution with no location. | Shared |
| `HCPChip.tsx` | — | **Reads no location at all** (name·cohort·rank). Unaffected by the repoint. | Shared |
| `CommunityExplorer.tsx:141,190` | `practice_state` | Roster state column. | **Community — held** |

---

## 2. Territory filter interaction

**The good news: non-US locations do not break the US state filter.** State filtering is
gated on `scopeIncludesUs` (`api.ts:59-64`, `rank-filters.ts:78-80`), so selecting EU/EU5
simply never applies a state predicate. Nothing gets hidden by state logic.

**The bad news: the "Other" bucket is already broken.**

`countriesForRegion("Other")` returns `[]` (regions.ts:76-79, with the comment "Caller must
filter accordingly"). No caller does. The chain:

```
countriesForRegion("Other") → []
  → resolveRpcScopeParams: countries.length === 0 → scopeValues = []  (scopeType stays "region")
    → api.ts:99  if (scopeValues.length > 0) … .in("scope_value", …)   ← SKIPPED
      → query returns EVERY regional row, all countries
```

Selecting "Other" shows **all regions**, not the other bucket. This is a live bug today,
not something the repoint introduces — but it sits directly in the EU path. **785 Established
HCPs across 32 distinct countries** currently live in that bucket and are unreachable via the
intended filter.

**What EU work actually needs:**

1. **Fix "Other"** — needs a `NOT IN (all known codes)` predicate, which PostgREST `.in()`
   can't express against a rank table. Either add a `region` column to the rank tables at
   score time, or send the negated country list explicitly.
2. **International location display** — non-US HCPs have **1.2% NPPES state coverage**
   (197 of 16,119) vs 74.9% for US. `buildSubline()` reads NPPES city/state only, so a French
   KOL renders as institution-with-no-location. Country/city would have to come from the ROR
   record instead. This is the real EU display gap, and it is independent of the repoint.
3. EU/EU5 region buckets and the Rising ledger's EU mode already exist — no new taxonomy needed.

---

## 3. Ranking dependency — quantified

### Board *membership* does not depend on location

Established eligibility is `hcp_cohort_classification_v2.cohort = 'established'` plus the
industry filter (ACADEMIC, or GOVERNMENT at NCI/NIH). Country appears **only** in the scope-row
expansion, and the `scope_type='global'` row is written unconditionally. **Nobody falls off a
board by being relocated.** What changes is *which regional board* they appear on.

### Established (19,470 distinct; 18,540 with a region row)

| Effect | Count |
|---|---|
| Would move to a different regional board | **674** |
| …of those, `affiliation_confidence = 'high'` | **205** |
| Leaves the US board | 252 |
| Joins the US board | 139 |
| Currently global-only, would **gain** a region row | **917** |
| Would lose their region row | 0 |

Board sizes: **US 3,361 → 3,338 (−23)** · **EU5 3,334 → 3,538 (+204, +6.1%)**

### Rising (619)

| Effect | Count |
|---|---|
| Would move | **15** |
| …`high` confidence | 10 |
| Leaves US | 3 |
| Joins US | 4 |

Rising's rank-table `country` column currently shows **zero drift** from `hcps_v2.country`.

### The risk that actually matters

**A repoint requires a rescore.** `scope_value` is materialized. Changing the frontend alone
is a no-op; changing the scorer re-runs ranking, and because rank is computed *within* each
scope, the 674 movers **shift the rank ordering of everyone else in both the board they leave
and the board they join**. A US KOL who never moved can still see their US rank change.

That is the single highest-risk property here, and it argues for gating the scorer on
confidence (§4) rather than repointing wholesale.

---

## 4. Confidence signal plan

The re-derivation stamped `affiliation_confidence` (high / medium / stale / unknown) and
`affiliation_as_of` on every row. Where each surface should carry it:

| Surface | Today | With confidence |
|---|---|---|
| **`HCPCard.tsx:764` scope label** | `(country ?? "US")` — prints "US" for unknowns | Highest-value fix. `high` → plain code; `medium`/`stale` → code + muted "as of {year}"; `unknown` → "—", never "US". **This is a lie today and worth fixing independent of the repoint.** |
| **`HCPCard` flag (576-582)** | flag or nothing | `high` → flag as-is; `medium`/`stale` → flag at reduced opacity + title "as of {year}"; `unknown` → no flag (already correct) |
| **`RisingHcpProfile.tsx:369` geo line** | `state \|\| country \|\| "GEOGRAPHY NOT ON RECORD"` | Natural home for the full statement: "Zurich, CH · current" vs "Erlangen, DE · as of 2021" |
| **`RisingLedger.tsx:430` EU mode** | country or "NOT IN REGISTRY" | Add a stale marker; ledger is 96.4% high-confidence so this is mostly cosmetic |
| **`ContactAccessCard.tsx:130`** | city/state/country line | Where a stale location does real damage — an MSL routing a visit. Should hedge explicitly. |
| **The scorer** | n/a | **Gate the regional scope row on `affiliation_confidence = 'high'`**, falling back to `country` otherwise. Cuts the movers from 674 → 205 (Established) and 15 → 10 (Rising), and keeps thin-evidence corrections out of board composition entirely. |

**Where it matters most:** `ContactAccessCard` (someone acts on it) and the scorer gate
(it changes rankings). The card flag is cosmetic by comparison.

---

## 5. Recommended repoint order

**Do first — no rescore, no board movement:**

1. **`HCPCard.tsx:764` null→"US" fix.** A pure bug fix; today the card asserts "US" for every
   HCP with no country. Independent of the repoint and shippable now.
2. **Rising ledger EU mode display.** 619 people, 96.4% high confidence, the `region === "EU"`
   code path already exists. Read-only, smallest blast radius, and it exercises the confidence
   display pattern on the safest cohort.
3. **Fix the "Other" region bucket.** An existing bug that blocks EU work regardless. Needs
   the rank-table `region` column or a negated country list.

**Do next — rescore, gated:**

4. **Established scorer repoint, gated on `affiliation_confidence = 'high'`.** 205 movers
   instead of 674. Rerun `recompute_established_ranks_v3.py`, diff the US and EU5 boards
   before publishing. Expect US ≈ flat, EU5 +6%.

**Hold:**

- **Ungated repoint** (all 674). 77% of corpus corrections rest on ~1.3 papers; letting the
  medium tier drive board composition imports that noise into rankings.
- **Community** — 49.6% `unknown`. Confidence is not a usable signal there, as agreed.
- **International location display** (§2.2). Real work: needs ROR-derived city/country in
  `buildSubline`, not a repoint.
- **`nppes_practice_state`** — leave alone entirely. It is a US regulatory field, unrelated
  to publication affiliation, and 74.9% covered where it applies. The repoint should not touch it.

### One thing to decide

Whether the regional board should follow `current_country` at *all* for medium-confidence
people. My recommendation is no — gate on `high`, and let `current_country` drive **display**
(hedged) everywhere while it drives **board scope** only where the evidence is strong. That
splits the honest-display win from the ranking risk, and they do not have to ship together.
