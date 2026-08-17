# Ledger EU/country slicing — plan

**Date:** 2026-08-14 · **REPORT ONLY, build held.** · Branch: `resurfacing`

**Framing (confirmed):** keep the existing cohort ledger exactly as it is — same look,
same components, same UX. Two changes only: (a) let non-US HCPs come *through* the RPCs
that currently exclude them, and (b) add region/country toggle chips at the top of the
existing ledger. Not a new surface, not a redesign, not the `/rising` register's design.

My plan matches that framing for **single-country** slicing. One thing needs a decision
because it costs more than minimal plumbing — flagged in §6.

---

## 0. Correction to my previous report

I previously said the main ledger shows 3,361 of 19,470 Established. That conflated **two
therapeutic areas** — `hcp_established_ranks_v3` holds NSCLC *and* Atopic Dermatitis, and
the ledger filters to NSCLC. Correct NSCLC-only figures:

| Cohort (NSCLC) | Total | Visible on ledger | Structurally hidden |
|---|---|---|---|
| Established | 16,976 | **2,990 (17.6%)** | 13,303 |
| Rising | 619 | **123 (19.9%)** | 496 |

The conclusion is unchanged and slightly worse: **~82% of the Established board and ~80%
of the Rising board cannot be reached from the surface users work in.**

---

## 1. The Rising per-region rank — read-time, and it is PROVEN

**Recommendation: `row_number()` at read time for all regions. Do not store a per-region rank.**

This is not a judgement call — it is provable, and I proved it:

```sql
row_number() OVER (ORDER BY rank)  -- over hcp_rising_star_ranks_v3 WHERE country='US'
```

reproduces the stored `us_rank` for **123 of 123 rows, zero mismatches**, spanning 1–123.

So `us_rank` *is* a dense read-time ranking over the global `rank`, restricted to a country
— already, today. Computing the same thing for FR/DE/IT/EU is the **identical algorithm**,
not an approximation of it. The US view after this change is guaranteed byte-identical to
the US view before it.

Why read-time rather than stored:

- **Proven equivalent** to the column we already ship.
- **No migration, no rescore, no new columns.** A stored per-region rank would need a
  rescore every time a region definition changes (EU5 membership, a country moving buckets).
- **Region taxonomy stays a frontend concern.** `REGIONS` in `regions.ts` can change freely.
- **Trivial cost** — `row_number()` over ≤619 rows.
- It also means `us_rank` is redundant. **I am not touching it in this change**, but it is
  derivable and a candidate for later cleanup.

### Established does NOT need this

`hcp_established_ranks_v3` already stores per-country region rows with **scope-local ranks**
(each country starts at rank 1: NSCLC US 2,990 rows, IT 1,051, FR 569, DE 462). For
single-country selection the plan is simply to *read the row that already exists* instead of
hardcoding `'US'`. No re-ranking at all.

I tried to reproduce the stored Established ranks from `cohort_score` and from global order
and could not match them exactly (FR 645/647, DE 620/621, US 1,329/3,361). That does **not**
matter for single-country slicing — the stored rank is authoritative and we just read it. It
matters only for multi-country aggregate regions, which is §6.

### No rescore — confirmed

| Table | Touched? |
|---|---|
| `hcp_rising_star_ranks_v3` | **No.** `rank` is the only input; row_number is a projection over it. |
| `hcp_established_ranks_v3` | **No.** Per-country rows already exist; we stop hardcoding which one we read. |
| Any scoring script | **Not run.** No `computed_at` changes. |

This is display-scope ranking only. Board membership and board scores are untouched.

---

## 2. Two-axis `LedgerScope`

Current shape is one axis — US states only:

```ts
export interface LedgerScope { key: string; label: string; states: string[] }
```

Proposed, additive:

```ts
export interface LedgerScope {
  key: string;          // selector key, unchanged
  label: string;
  countries: string[];  // NEW. [] = all countries; ["US"] ; ["DE","FR","IT","ES","GB"]
  states: string[];     // unchanged. US state codes.
}
```

**States gate:** `states` is applied only when `countries` resolves to exactly `["US"]` —
the same rule `api.ts:59-64` already uses (`scopeIncludesUs`). Selecting France cannot
also filter by "Northeast".

**One naming problem to settle:** today `"national"` means *US-wide* (`states: []`). With a
country axis it becomes ambiguous. Cleanest minimal fix: keep `"national"` meaning "all US
states" and let the country axis carry the country. The chip row then reads
`[United States ▾] [All states ▾]` where the second only appears for US — which is exactly
the "toggles at the top" the framing asks for.

---

## 3. De-hardcoding the three RPCs

| RPC | Current hardcode | Change |
|---|---|---|
| `established_ledger` | `r.scope_type='region' AND r.scope_value='US'` | add `p_countries text[] DEFAULT '{US}'`; `scope_value = any(p_countries)` |
| `rising_ledger` | `r.country='US' AND r.us_rank IS NOT NULL` | add `p_countries text[] DEFAULT '{US}'`; drop `us_rank` filter, compute `row_number()` over the filtered set |
| `community_ledger` | none (US by data construction) | **no change — Community stays US-only** |

**Community confirmed held**, per the earlier decision: 49.6% of the community board is
`affiliation_confidence = 'unknown'` (NPPES/CMS-derived, no publications), so there is no
country signal to slice on. The country chips should be **hidden, not disabled**, on the
Community tab.

Defaulting `p_countries` to `{US}` means every existing caller behaves exactly as today
without being changed — the change is additive and the US view cannot regress.

---

## 4. `LEDGER_REGION_OPTIONS`

Currently six US territory entries. Proposed: keep them, add a country axis alongside,
driven by the region taxonomy that already exists in `regions.ts` (`REGIONS`, `EU5`, `EU`).

Volumes that justify which entries earn a chip (NSCLC):

| | Established | Rising |
|---|---|---|
| US | 2,990 | 123 |
| CN | (large) | 261 |
| IT | 1,051 | 45 |
| FR | 569 | 23 |
| DE | 462 | 17 |
| ES | ~304 | 14 |
| GB | ~348 | — |
| NL | — | 12 |

Suggested chips: **United States · EU5 · EU · United Kingdom · Japan · China · Global**,
with a country sub-select for the long tail. Exact list is a design call, not a technical one.

---

## 5. Merging the `/rising` register

After the country chips land on the ledger, the register has **nothing unique left**. I
checked feature by feature:

| Feature | `/rising` register | Main ledger |
|---|---|---|
| SENIOR SINCE badge | yes | **yes** (same `rising_board_flags` RPC) |
| OPEN TRIAL badge | yes | **yes** (same `board_open_trials` RPC) |
| Band grouping | yes | **yes** (`type Band` in `cohortLedger.ts:361`) |
| Region/country chips | yes | **after this change** |
| Relationship tracking, drawers, trials popup, virtualization | no | yes |
| **Quadrant mode** | **yes** | **no — genuinely unique** |

Clean retirement, in order:

1. Land the country chips on the ledger (stages below).
2. Point `/rising` → redirect to `/cohorts/ledger/rising-stars`, **preserving
   `?mode=quadrant`** → a quadrant route.
3. Keep the quadrant. Either leave it at `/rising/quadrant` or add it as a ledger view mode.
   Recommend leaving it standalone initially — it is a different visual form and folding it
   into the ledger is a redesign, which the framing excludes.
4. Update the one inbound link (`RisingHcpProfile.tsx:663`, which deep-links to
   `?mode=quadrant`) to the quadrant route.
5. Delete the register half of `RisingLedger.tsx` only after the ledger view is confirmed at
   parity.

`rising_board()` stays — the quadrant needs it.

---

## 6. What costs MORE than minimal plumbing — your call

**Multi-country aggregate regions (EU5, EU) for Established.**

Single-country is free: read the stored scope-local rank. But EU5 is five countries, each
with its own rank starting at 1 — five rank-1s. Showing them as one list needs a rank that
does not exist, and Established's stored ranks are **not reproducible** from `cohort_score`
or global order (I tried; see §1), so I cannot re-derive a correct merged ranking at read
time the way I can for Rising.

Three options:

| Option | Cost | Consequence |
|---|---|---|
| **A. Single-country only** (recommended) | Minimal — matches the framing exactly | Chips are US / DE / FR / IT / ES / GB / JP / CN… No "EU5" or "EU" aggregate for Established. Rising can still do aggregates (its rank is derivable). |
| **B. Aggregate ranked by global rank** | Small | EU5 list ordered by global standing. Honest and simple, but the rank numbers won't match any stored per-country rank — needs a column label like "EU5 order" not "rank". |
| **C. Score EU5/EU as real scopes** | **Rescore** — new scope rows in the rank table | True EU5 ranks. Violates "no rescore" and is a scoring change, not plumbing. |

**Recommendation: A for Established, aggregates allowed for Rising.** It matches the
framing, needs no rescore, and gets the 13,303 hidden Established KOLs reachable. If you
want a real EU5 leaderboard later, that's option C and a deliberate scoring decision.

One smaller flag: `rising_ledger` currently filters on the **rank table's** `country`
column, which has **11 NULLs** — the same 11 the re-derivation resolved. Slicing off
`hcps_v2.current_country` instead would make them placeable, but would also move 3 people
out of US and 4 in. Recommend slicing off the rank table's `country` for this change (pure
plumbing, zero movement) and treating the `current_country` repoint as the separate Tier-2
decision it already is.

---

## 7. Staged build

| Stage | Work | Risk |
|---|---|---|
| **1** | `established_ledger` + `rising_ledger`: add `p_countries text[] DEFAULT '{US}'`, drop hardcodes, `row_number()` for Rising. Verify US output byte-identical. | Low — default preserves current behaviour |
| **2** | `LedgerScope.countries` + `loadLedgerPage` passes `p_countries`. No UI yet. | Low |
| **3** | Country chip row at the top of the existing ledger header, next to the territory selector. Hidden on Community. | Low — additive UI |
| **4** | `/rising` → redirect; quadrant preserved; inbound link updated. | Medium — user-visible nav change |
| **5** | Delete the register half of `RisingLedger.tsx`. | Low — after parity confirmed |

Stages 1–3 deliver the whole goal. Stage 4–5 are the cleanup and can wait.

---

## Decisions needed before I build

1. **Option A / B / C** for multi-country Established aggregates (§6). Recommend **A**.
2. **Slice Rising off the rank table's `country` (no movement) or `current_country`
   (+11 placeable, 7 people move)?** Recommend the rank table's `country` for this change.
3. **Quadrant destination** — standalone route, or a ledger view mode? Recommend standalone.

## Working-tree state note

The Tier 1 frontend edits were reverted at some point — `git status` shows only
`frontend/src/lib/location.ts` (untracked) surviving; the 8 modified files are back at HEAD.
The DB side is still live: `rising_board()` remains repointed to `current_country`
(revert at `sql/affiliation/rising_board.PREVIOUS.sql`). So right now the RPC returns
`effective_country` that no frontend reads. Worth settling deliberately before stage 1.
