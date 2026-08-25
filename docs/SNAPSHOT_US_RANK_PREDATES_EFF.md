# The snapshot's `us_rank` predates the effective-country repoint

**Status:** open, accepted. Logged 2026-08-20; downgraded the same day (see *Scope* below).
**Columns:** `hcp_rising_board_snapshots.us_rank` vs `rising_board().us_rank_eff` (the
source of a live `RS n` chip).
**Consumers:** `frontend/src/lib/home.ts` → `getTrackedHcpsInTerritory`, fifth ladder rung;
rendered by `components/HCPChip.tsx`.
**Related:** `migrations/2026_08_17_rising_board_us_rank_eff.sql`,
`sql/affiliation/04_rising_board_current_country.sql`.

## Scope — smaller than when first logged

This was logged while the portfolio chip rendered a de-listed person's prior rank as
`WAS RS 12`, sitting inches from a live `RS 12` computed a different way. That chip text was
dropped the same day: a de-listed person now renders as **name alone, no tag, no fill**, and
the prior rank survives only in the hover title. So the drift no longer puts two
differently-derived numbers side by side in the reading flow — it is confined to one
tooltip.

It is still worth closing, for the fall-through described under *When it would bite*, which is
a missing chip state rather than a wrong number and is unaffected by where the figure is shown.

## The drift

The two figures are not computed the same way.

* **Live `RS n`** is `us_rank_eff` off the `rising_board()` RPC: `row_number()` over the
  stored global rank, within the set whose **effective** country
  (`COALESCE(current_country, country)`) is `US`. Computed at read time. Added 2026-08-17 so
  that a rising star who has moved to the US is placed where they are now rather than where
  the board was scored against.

* **The hover figure** is `hcp_rising_board_snapshots.us_rank` — what the scoring run
  materialised at snapshot time, which places by the **historical** `country` column alone.

The snapshot table does carry `effective_country_at_snapshot` alongside `country_at_snapshot`,
so the inputs for a corrected figure are present. What it does **not** carry is a recomputed
`us_rank` over that effective set. The stored `us_rank` was never repointed.

## Size of the gap

On-board rows where the two country fields disagree:

| snapshot | on board | country ≠ effective | US by effective | US by stored |
|---|---|---|---|---|
| 2026-06-08 | 1,644 | 71 | 240 | 231 |
| 2026-08-05 | 619 | 26 | 125 | 123 |
| 2026-08-17 | 251 | 11 | 58 | 57 |

So on the 2026-08-05 snapshot — the one the fifth rung reads for every currently de-listed
tracked HCP — the US set is 125 people by the live definition and 123 by the stored one. Two
people are in one set and not the other, and every rank below the first disagreement is
shifted by the difference.

## Why it does not bite today

All seven de-listed HCPs on the demo portfolio are `US` by **both** definitions on their last
on-board snapshot:

```
Singh, Dagogo-Jack, Sands, Luo, Offin, Lau, Hung
  country_at_snapshot = US, effective_country_at_snapshot = US, differs = false
```

So for these seven the stored `us_rank` and a recomputed `us_rank_eff` would place them in the
same set. The figures the hover carries — US #5, #12, #23, #59, #64, #68, #92 — are sound.

## When it would bite

Any de-listed HCP whose country changed, or whose `current_country` was re-derived after the
snapshot was taken. The 2026-08-05 snapshot holds 26 such rows. A person who was scored as
non-US but is now US would have **no** stored `us_rank` at all and fall through the fifth rung
entirely — rendering `UNRANKED` again, the exact failure this rung was added to fix. This is
the same shape as the Misako Nagasaka case that motivated the live repoint (see the comment at
`home.ts` in the rising-rank block): a null `us_rank` does not just drop a number, it drops the
person off the ladder.

## What would close it

Either:

* **Recompute at read time**, as `rising_board()` does — a `row_number()` over
  `global_rank` within `effective_country_at_snapshot = 'US'`, partitioned by `snapshot_date`.
  The snapshot carries both columns, so this needs no new data. It is the option that makes
  the two chips comparable by construction.
* **Or backfill** a `us_rank_eff` column onto `hcp_rising_board_snapshots` and have
  `take_weekly_snapshot.py` write it going forward.

The read-time option is preferred for the same reason the live board chose it: a second stored
copy is a second thing to drift.

Until then, the hover figure should be read as "the US rank they were carrying when they were
last on the board", not as one directly comparable to a live `RS n` on a neighbouring chip.
