# Rising US rank reads `h.country`, not the effective country

**Status:** open, logged 2026-08-20. Affects US ranking only, not board membership.
**Same class as:** the `us_rank_eff` repoint of 2026-08-17 (rising_board), and the
institution-band issue in `institution-band-located-rank`.

## The defect

`scripts/score/rising_star_scoring.py`, `fetch_input_signals`:

```sql
JOIN hcps_v2 h ON h.id = sm.hcp_id
...
h.country
```

The value is carried through `build_results` into `hcp_rising_star_ranks_v3.country`
and is the sole basis for `us_rank`:

```python
us_sorted = [r for r in sorted_by_raw if r.get("country") == "US"]
```

Every other consumer on the platform resolves country as
`coalesce(current_country, country)` — the ledger, the profile RPCs, the established
board's scope resolution, and every measurement in the coherence-gate work. `country`
is the older, less-maintained column; `current_country` is what the affiliation
re-derivation of 2026-08-14 populates.

## Measured

On the live 336-member board (2026-08-20, post-V3):

| definition | US members |
|---|---|
| `h.country = 'US'` (what the scorer uses) | **73** |
| `coalesce(current_country, country) = 'US'` (everywhere else) | **76** |
| disagree between the two | **10** |

10 rows disagree; the net is 3 because it runs in both directions — people whose
`country` says US and whose effective country does not, and vice versa.

## Why it matters and why it is not urgent

`us_rank` is a display and selection artifact: the Rising quadrant, the US board view,
and any "top N US" cut read it. A person whose effective country is US but whose
stored `country` is not gets **no US rank at all** and is invisible to those surfaces
despite being on the global board — the same failure mode as Misako Nagasaka in the
08-17 rising repoint, where a NULL stored `us_rank` hid a global #18.

Board **membership** is unaffected: the gate is four component percentiles and never
reads country. Only the ordering within the US slice moves.

## The fix, when taken

Change the projection to `coalesce(h.current_country, h.country) AS country` in
`fetch_input_signals`, then re-run `rising_star_scoring.py`. One line, one re-run,
no migration — `hcp_rising_star_ranks_v3.country` is rewritten wholesale by the
upsert.

Worth doing in the same pass: `hcp_network_momentum_v1`'s new `norm_country` (added
2026-08-20 for the eigenvector normalisation) already uses the `coalesce` form, so
the two scorers currently disagree with each other about what country an HCP is in.

**Not folded into the V3 change** because it moves `us_rank` for 10 people on a board
that was being changed for unrelated reasons, and separating the two keeps the
before/after capture readable.
