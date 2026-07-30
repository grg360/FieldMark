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

## Rising Star ranks — canonical deletions with no audit trail (data-integrity pattern)

**Status:** flagged, not fixed. Report only (cohort ledger stage 2/3 investigation).

**Raised:** 2026-07-29, from the cohort ledger Rising Star build.

**The pattern to watch.** `hcp_rising_star_ranks_v3` is a 2026-06-22 snapshot that was never rebuilt after later `hcps_v2` changes. It carries **5 dangling `hcp_id` references** — ranks whose HCP no longer exists in `hcps_v2` (all NSCLC: US us_rank 113 `49ce5233-…527428`; and global-only ES `5d611abd`, IT `fd873eed`, JP `1c456ac1`, NL `c4e9c377`). Only the US one reaches the ledger (drops the US Rising cohort from 209 to 208 renderable).

The staleness is the mild part. The concerning part: **those 5 ids were deleted from the canonical `hcps_v2` with no audit trail** — they are absent from `dedup_map`, `dedup_merge_log`, AND the 2026-07-20 `nsclc_oracle_merges_20260720`. Records left the canonical table with nothing recording why they were removed or what surviving record (if any) they became. Established (`hcp_established_ranks_v3`) and Community (`hcp_community_scores_v2`) have **0 orphans** — they reflect current `hcps_v2` — so this is isolated to the un-rebuilt Rising snapshot, but the *deletion-without-record* is a canonical-table integrity concern beyond this one table.

**Remediation (not now):** rebuild `hcp_rising_star_ranks_v3` against current `hcps_v2`. `hcp_rising_star_ranks_deduped_v2` exists but does NOT contain these ids — verify it covers the current cohort before adopting it.

## Rising Star — duplicate us_rank (scoring defect)

**Status:** flagged, not fixed. Report only.

**Raised:** 2026-07-29, cohort ledger stage 3.

**The problem.** In the US NSCLC Rising Star cohort, `us_rank = 113` is held by **two** rows: the orphan `49ce5233-…527428` and a real HCP, Aadel A. Chaudhuri (`06c08fbb-…0f0f62`). Rank should be unique within a cohort/scope. The two are unrelated to each other (the orphan does not map to Chaudhuri in any merge table) — the shared rank is a coincidence of a scoring defect, not a merge artifact.

**Impact today:** low. Rising is a single page (208 < 1000), so rank-keyed pagination never splits at 113 and no row is skipped. But duplicate ranks would break key-pagination for any cohort large enough to page across the tie, and they read wrong to users.

**Remediation (not now):** same rebuild of `hcp_rising_star_ranks_v3` against current `hcps_v2` should re-derive unique ranks; verify uniqueness after.
