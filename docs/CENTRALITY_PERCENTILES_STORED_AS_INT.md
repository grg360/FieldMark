# Centrality percentiles keep exact 0 and 100 — they are stored as integers

**Status:** open, deliberately deferred. Logged 2026-08-18.
**Columns:** `hcp_network_centrality_v2.degree_percentile`, `.eigenvector_percentile`,
`.betweenness_percentile`.
**Related:** `docs/PERCENTILE_CONVENTION.md` — this is the one place that convention does
not reach.

## The defect

The 2026-08-18 percentile convention replaced `100 × (rank − 1) / (n − 1)` with the Weibull
plotting position `100 × (n + 1 − rank) / (n + 1)` at nine sites, so that no percentile
reports a first member at exactly 100.0 or a last member at exactly 0.0 — endpoints that are
artifacts of a finite list rather than claims the data supports.

`network_centrality_scoring.py` carries the corrected formula, but its three percentile
columns are cast to integers at the write (`:174-176`):

```python
int(round(r["degree_percentile"])),
int(round(r["eigenvector_percentile"])),
int(round(r["betweenness_percentile"])),
```

The largest population is 93,906 nodes, so the new bottom value is `100/93907 = 0.001065`,
which `int(round(...))` returns as **0**, and the new top is `99.9989`, which returns as
**100**. The convention change is absorbed entirely by the rounding.

Verified against the live table 2026-08-18 — all three columns hold 101 distinct values
(0…100) and **zero rows with a fractional part**, across 471,761 rows.

## Why it was not fixed with the convention

Re-running the job would write back byte-identical values in these columns while costing more
than half an hour of graph computation (93,906 nodes, betweenness sampled at k=1000; a dry run
did not complete inside 1800s). `network_centrality_scoring` was therefore dropped from the
rescore chain — the code edit stands and takes effect whenever the job next runs for its own
reasons.

Raising the write to `round(percentile, 4)` was considered and declined for the same reason:
it would not help without also widening the stored column, so it belongs with the schema
change rather than ahead of it.

## Consumers

The frontend reads all three: `frontend/src/lib/api.ts:2351` (select list) and `:2448`
(`degree_percentile: network.data.degree_percentile ?? 0` — note the `?? 0`, which is the
missing-versus-lowest conflation described in the convention doc, in a column where 0 is
still a value the data can produce).

`network_influence_score` is computed from the **unrounded** percentiles at `:387-391`, so it
is unaffected by the integer cast and does shift under the new convention — by about 0.001,
which the Established scorer re-percentiles within scope in any case.

## Fix, when taken

1. Widen the three columns from integer to `numeric` (schema migration).
2. Drop the `int(round(...))` casts at `network_centrality_scoring.py:174-176`.
3. Re-run the job — 471,761 rows rewritten, upwards of half an hour of graph work.
4. Check the two frontend read sites render a fractional percentile sensibly, and replace the
   `?? 0` at `api.ts:2448` with an explicit absent state, since 0 will no longer be a value
   the formula can emit.

Steps 1–3 are one change; step 4 can precede it.
