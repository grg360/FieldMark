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

## Bookmark control reads isSaved (has-relationship), not watchlist membership

**Status:** flagged, not fixed. Report only (cohort ledger stage 3 investigation, 2026-07-29).

**The bug.** `RelationshipsContext.isSaved(hcpId)` returns `relationshipMap.has(hcpId)` — true for **any HCP with a `msl_hcp_relationships` row**, not only HCPs in a watchlist. A relationship row is created by `getOrCreateRelationship` on *any* first touch: setting a status, adding a note/insight, a follow-up, a brief — not just tracking. Untracking (`removeFromWatchlist`) deletes only the `msl_watchlist_items` row and leaves the relationship row. So `isSaved` is true in cases where the HCP is not tracked.

**Blast radius — two surfaces render a bookmark off `isSaved`:**
- **`HCPCard.tsx`** (`saved = isSaved(hcpId)` → `BookmarkCheck` filled vs `Bookmark` outline; toggle `toggleSave(hcpId,"cohort_card")`). The feed/list card — highest traffic.
- **`DetailScreen.tsx`** (`saved = isSaved(hcpId)` → same; toggle `"hcp_detail"`). The HCP profile page.

Both exhibit **both** wrong-states:
1. **Filled after untracking** — untrack removes the watchlist item but the relationship row persists, so the bookmark stays filled; the click reads as a no-op.
2. **Filled for a status-only HCP** — any HCP given a status/note/follow-up/brief but never tracked shows a filled bookmark on load.

**Not affected:** `CohortLedger` (stage 3 uses the new `isTracked`, watchlist-truth). `WatchlistsPage`/`TrackedHcpsList` (renders watchlist items directly — inherently correct). `HomePage` (no `isSaved` bookmark). `OpportunityCard`/`StrategicOpportunities` `isSaved` is an unrelated local prop (brief opportunities by index), a name collision only.

**Live blast radius (2026-07-29):** 73 relationship rows, 34 watchlisted → **39 rows render a wrong-state filled bookmark** (38 `targeted`, 1 `engaged`), across **5 users** (the entire current userbase). Not a corner case — essentially every "targeted" HCP shows as bookmarked.

**Fix (recommended fix-now — one line, low risk):** point `isSaved` at the watchlist set (`savedHcpIds.has(hcpId)`, same source as the ledger's `isTracked`); both `HCPCard` and `DetailScreen` then read correctly, no per-consumer change.

**Caveat the fix must settle:** `savedHcpIds` is currently loaded from the **default watchlist only** (`getWatchlistItems(userId, defaultList.id)`), so it — and the ledger's `isTracked`, and the recommended fix — treat "tracked" as "in the default watchlist," missing HCPs held only in a non-default watchlist. Decide whether "tracked" means default-list or any-list before landing the fix; if any-list, load `savedHcpIds` from all watchlists.

## Field-intel & data-issue submissions persist nothing (both HCP surfaces)

**Status:** flagged, not fixed. Report only (found during the HCP profile migration, 2026-07-30).

**The gap.** The field-intelligence review and data-issue controls present as functional but have **no write path** — an MSL fills them in, hits submit, sees a success acknowledgement, and nothing is saved. This is true on **both** the old and new HCP surfaces:

- **DetailScreen (being sunset):** the "Submit validation" button is a literal no-op — `onClick={() => {}}`. Contextualize ("Add context"), opt-out/claim, and report-data-issue submit handlers are **toast-only** (`showFiToast(...)`) with no persistence. The `field_intel_*` tables are **SELECT-only** (read grants only; `lib/fieldIntelligence.ts` exposes reads exclusively), so there is nowhere for a write to land.
- **New two-spine profile (`ProfileSecondaryControls`):** faithfully reproduces this non-persistence, by design, with **honest toasts** that say the submission path is not wired (e.g. "Field review recorded — the submission path is not yet wired; stored locally only") rather than faking success. `ContactAccessCard` is the one genuinely-live read in that block.

**Impact.** Across the whole product, MSLs submitting field-intel reviews (Data-matches-field-reality / Engagement / Credibility / Momentum) and data-issue reports are **saving nothing** — the aggregate FI chips therefore stay UNRATED forever, and reported data issues are lost. The controls invite contribution the system cannot retain. (Note capture via `FieldInsights` → `createNote` → `msl_hcp_notes` DOES persist — this gap is specifically the field-intel validation and the issue/context/opt-out flows.)

**Needs a persistence decision (not now):** a write path for field-intel reviews and data-issue/opt-out/context submissions — tables with write grants (or an RPC), an aggregation model for the FI chips (how N reviews roll up to a rating), and identity handling ("contributor UUID only"). When built, **both** the new profile's `ProfileSecondaryControls` and the retained (sunset) DetailScreen logic adopt the same path. Until then the honest toasts stand; do not present these as working submissions.
