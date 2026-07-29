# Known issues

## Drug Intelligence — INTERMITTENT density tier conflates rising and declining assets

**Status:** flagged, not built. Needs a proper design pass (touches the index legend, the row tooltip, and probably the asset detail page). Do NOT bolt onto the density threshold fix.

**Raised:** 2026-07-29, after applying Rule B (density measured on completed years 2019–2025; DENSE 12 · INTERMITTENT 8 · SPARSE 23).

**The problem.** The INTERMITTENT tier (8 assets under Rule B) holds two opposite trajectories under one label:

- **Rising** — Amivantamab (clears 40 themed in 2024 and 2025, both years since it crossed the gate) and Sotorasib (2023, 2024, 2025). Young assets accelerating through the gate.
- **Declining / scattered** — Brigatinib (clears 5 of 7 completed years, dropping off recently) and Ceritinib (clears 3 of 7, then declines out).

For a platform built on rising-star identification, filing an accelerating asset and a fading one under the same "INTERMITTENT" badge is backwards — the two most decision-relevant trajectories are made to look identical.

**Likely answer (to be designed, not assumed):** an **EMERGING** state distinct from INTERMITTENT — an asset on a short but unbroken recent run of gate-clearing years (rising), versus INTERMITTENT for scattered/declining. This is a new tier boundary; it must be specified deliberately (what run length qualifies, how it reads in the legend/tooltip, whether the detail page reflects it) rather than derived from the threshold.

**Explicitly rejected as the fix:** Rule C (window each asset from its first qualifying year). Under Rule C an asset is only ever measured over years it was already clearing, so DENSE stops meaning *sustained* and starts meaning *hasn't failed yet* — Lazertinib on one windowed year would carry the same DENSE label as osimertinib on seven. The per-asset window remains the composition chart's x-axis only; it is not a density rule.

**Measurement on record (Rule B, 43 deployment assets):**
- DENSE 12, INTERMITTENT 8, SPARSE 23.
- INTERMITTENT members: rising — Amivantamab, Sotorasib; declining/scattered — Brigatinib, Ceritinib; single-year — Lazertinib, Selpercatinib, Tislelizumab; plus Lorlatinib (6 of 7, misses only its thin first year 2019).
