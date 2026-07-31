# Known issues

## Asset matcher — unhyphenated orthographic variants evade containment stripping

**Status:** flagged 2026-07-31, not fixed. Low severity for NSCLC. Residual from the paclitaxel/nab-paclitaxel containment fix in `build_asset_matches.py`.

**The problem.** The containment fix strips containing terms exactly as they appear in the roster (`nab-paclitaxel`, `albumin-bound paclitaxel`) before testing whether the shorter term (`paclitaxel`) still appears independently. Abstracts also render the drug unhyphenated as `nab paclitaxel` (space, not hyphen), which is not one of the stripped roster terms — so `paclitaxel` survives the removal as apparently-standalone and still counts toward Paclitaxel.

**Scope.** Residual inflation is unquantified but expected to be small for NSCLC, where the hyphenated forms dominate the corpus. Low severity here.

**Why it rises for breast.** This climbs in priority for the breast-cancer roster, where taxane and trastuzumab-family naming variants are substantially messier and the containment guard will fire more often. Each unstripped orthographic variant (spacing, hyphenation) is a fresh bleed-through path, so the gap widens as the roster grows into that territory.

## Asset matcher — Paclitaxel = 1,144 not yet verified from a native rebuild

**Status:** verification pending 2026-07-31, not a defect. Confirm on the next full rebuild of `asset_publication_v1`.

**The gap.** The current live Paclitaxel value (1,144) was produced by a targeted DELETE of 226 spurious edges, not by the fixed matcher running end to end. The pre-fix audit and the post-fix simulation shared the same predicate construction (strip `nab-paclitaxel` / `albumin-bound paclitaxel`, then require standalone `paclitaxel` or `taxol`), so they agreed *by construction* rather than independently.

**To confirm.** On the next full rebuild of `asset_publication_v1`, confirm Paclitaxel returns 1,144 natively, with Nab-paclitaxel 318, Osimertinib 3,310, and Pembrolizumab 2,978 unchanged. Until then, treat 1,144 as verified-by-DELETE, not verified-by-rebuild.

## `score_ranks_v2.cohort` is not a cohort — it's three independent gates (platform-wide, deferred)

**Status:** flagged 2026-07-31, NOT built. Separate from the Telescope rising-layer re-point (that fix is local to `export_telescope_data.py` and does not touch this). This is the platform-wide root cause.

**The problem.** `hcp_score_ranks_v2.cohort` (values `rising`/`established`/`community`) is written by three *independent* scoring scripts keyed off *different* criteria, so the three "cohorts" are neither mutually exclusive nor exhaustive:

- **rising** — `scoring_pipeline.py` gates purely on a career-age band (`career_age ∈ [3,10]` with non-null first-pub-year and TA membership; `scripts/score/scoring_pipeline.py:891–923`). It never reads the cohort label. This is a DEMOGRAPHIC gate — any mid-career HCP with ≥1 TA pub — so it swells to ~234k rows / ~72,557 global / ~10,497 US "rising," with meaningless global ranks (e.g. Joao V. Alessi #23,852). Quality only affects rank/tier, not membership.
- **established** — `established_scoring.py` reads the persisted label `hcps_v2.cohort_classification='established'`.
- **community** — `community_scoring.py` reads `hcps_v2.cohort_classification='community'` (positive gate: US + NPI + payments/Medicare footprint + not AMC-linked).

Because rising ignores the label while established/community read it, the same US mid-career publishing clinician can land in BOTH `rising` and `community`. HCPs with null/garbage first-pub-year, or career_age <3 / >10 but unlabeled, fall through into NO cohort (implicit "unclassified", silently dropped).

**The fix (deferred, platform-wide).** `score_ranks.cohort` should be derived from the POSITIVE `cohort_classification` labels (`established` / `rising_star` / `community`) with an explicit `uncategorized` value, enforced mutually exclusive and exhaustive — every HCP forced into exactly one, none silently dropped. This touches every cohort surface, not just Telescope; scope and sequence it deliberately.

## Rising-star table graveyard — prune the demographic tables after confirming no readers (deferred)

**Status:** flagged 2026-07-31, NOT built. Audit-then-deprecate.

**The landscape:**
- `hcp_score_ranks_v2` (cohort='rising') / `..._deduped_v2` — the ~234k-row career-age DEMOGRAPHIC gate above. NOT authoritative rising-star signal.
- `hcp_rising_star_ranks_v3` — **authoritative NSCLC** rising star: trajectory-based (Scientific/Network Momentum + Visibility → composite), gated on `cohort_classification='rising_star'`, US-scoped via `us_rank`. 1,588 rows (209 US). Writer: `rising_star_scoring.py`.
- `hcp_rising_composite_v1` — **authoritative AD** rising star (2-axis: Scientific Emergence + Network Influence). 5,719 rows / 3,052 HCPs. Writer: `rising_composite_scoring.py`.

**The move.** After the Telescope re-point lands, grep every reader (frontend RPCs, `api.ts`, other exports/scripts) of `hcp_score_ranks_v2` cohort='rising' and `..._deduped_v2`. Once confirmed no live surface depends on the demographic rising slice, mark v2/deduped_v2 rising for deprecation. v3 (NSCLC) and composite_v1 (AD) are the keepers. (Note: `score_ranks_v2` established/community slices and the established/community readers are a separate question — this note is scoped to the rising slice.)

## Telescope focus data — split to a lazily-loaded file if mobile bundle feels heavy (deferred)

**Status:** deferred optimization, not built (2026-07-30). Flagged when the focus enrichment landed.

**Context.** `export_telescope_data.py` now bakes each node's real top-5 collaborators (`focus_collaborators`) into `telescope_nsclc_nodes.json` for the focus view — this took the NSCLC nodes file from ~367 KB to ~1.9 MB (top-5, no per-collaborator institution; institution is recovered by hcp_id lookup on focus). Overview (nodes + edges) is unchanged; the focus data is additive and imported statically, so every client downloads it up front.

**The deferred move.** If the mobile bundle feels heavy, split the focus data into a SEPARATE JSON keyed by node id, lazily loaded when a node is focused. The overview file drops back to ~367 KB (light first paint); focus loads on demand. Not needed yet — 1.9 MB static is acceptable for now — but this is the escape hatch, and the export already computes the data in a shape that's trivial to emit as a side file keyed by `id`.

## #1 scoring enhancement — REGIMEN-AWARE community scoring (do not build yet)

**Status:** specced by oncology-advisor review 2026-07-30; deliberately deferred to post-launch. The flat drug-set signal ships first.

**The insight.** Isolated HCPCS drug codes are individually weak NSCLC signals — the advisor confirmed all the curated agents are NSCLC-relevant but cross-indication (claims carry no diagnosis). CO-ADMINISTRATION patterns are strong: pemetrexed + platinum + pembrolizumab together is near-diagnostic for NSCLC practice; carboplatin alone is nearly uninformative. Same-provider, same-day or tightly-clustered drug combinations detected from claims would substantially outperform the flat set that drives the 2026-07 re-score.

**The build (post-launch):** co-administration detection over `hcp_hcpcs_detail` (or richer claim-line data if per-day granularity is needed — the current PUF is annual per provider×code, so true same-day clustering may require the claims-line files; scope this first), a regimen→NSCLC-specificity weighting, and a scored regimen signal replacing/augmenting the flat spend+volume blend.

**Spec artifact:** the advisor's full regimen→signal-strength table is NOT yet in the repo — only the two anchor examples above were relayed. Obtain the table and commit it (e.g. `docs/nsclc_regimen_signal_table.md`) before building; the examples alone are not a spec.

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

## Community scoring — normalized_score is per-TA (cross-TA incomparable) and the snapshot is stale

**Status:** flagged, not fixed. Report only (community score reconciliation, 2026-07-30).

**The property (by design, but a standing misreading trap).** `hcp_community_scores_v2.normalized_score` is a min-max rescale of `composite_score` computed **per therapeutic area** (`community_scoring.py:normalize_0_100`, applied per `ta_id`). Exactly one row per TA reads 100 — the TA's composite max. Verified 2026-07-30: the table holds exactly 3 rows at normalized = 100, one per TA: Guy Young (Rare Disease, composite 77.02), Maen Hussein (NSCLC, composite 67.52), David Dies (Hepatology, composite 67.50). Within a TA, normalized and composite produce **identical ordering** (monotonic transform); across TAs, neither normalized NOR composite is comparable (each TA's inputs are min-max normalized within that TA before weighting). A cross-TA query like `where normalized_score = 100` returns multiple rows and reads like duplicate cohort leaders — it is not; it is one leader per TA. Any future surface that mixes TAs must not rank or compare on either column.

**The real defect: staleness.** The entire community scoring snapshot was materialized `scored_at 2026-05-27` (run `3e626506-8894-46ec-a2fb-5b1e6f61341d`) — it pre-dates the July Open Payments and profile work. A rescore (`scripts/score/community_scoring.py`) is owed; ranks derive live from the materialized columns, so the rescore alone refreshes every surface.

**Display note (2026-07-30):** all three community surfaces (card, ledger, profile) render `normalized_score`, reconciled 2026-07-30. Hussein reads 100/#1 on all three — correct within NSCLC on both scales (his composite 67.52 leads Divers 63.47). Whether to display raw composite instead (an absolute 0–100-bounded scale where the NSCLC top is ~67.5) is a product decision; it would change the numeral on every community surface but not any ordering.

## Paid-vs-administered overlay — real alignment needs the full claim set (data task)

**Status:** flagged, not built. The practice-first profile ships the honest reduced version (report, 2026-07-30).

**The limit.** The practice-first community profile's PAID AROUND vs ADMINISTERED overlay compares Open Payments products against the administered record — but the administered side is only `hcp_medicare_summary_v2.top_hcpcs_codes` (**10 codes**, rank order, no per-code volumes) out of ~130 distinct codes billed, and HCPCS→agent-name mapping via `ta_hcpcs_codes` is **32% complete** across the top-200 cohort's held codes (the reference is NSCLC-scoped; supportive-care/NOC codes don't resolve). So "ALIGNED: 0" inside that window is an artifact of incomplete data on both sides — an alignment could exist at code #15 and never show. Per-code beneficiaries/services/dollars are also not retained, so alignment cards cannot carry magnitudes.

**What ships until then (data-gated):** buckets render only when the current HCP's data populates them — 1, 2, or 3 buckets per HCP, never an empty bucket, a "0", or an apology. The ROUTE SPLIT (oral · Part-D-invisible vs injectable · no-claim vs route-unknown) is computed from the paid-around side alone via `config/assets.json` + `config/drug_routes.json` — complete data, genuinely valid. ALIGNED renders only on a real non-empty intersection with the named top codes. Meaningful absences (no engagement record at all, no Part B claims) keep their honest states; neutral data gaps drop silently.

**Upgrade path — the data is ALREADY ON DISK, free (2026-07-30):** `Medicare/medicare_provider_service_20{21,22,23}.parquet` (~375MB each, downloaded May 6) hold the FULL per-NPI × per-HCPCS claim detail — `hcpcs_code`, `hcpcs_description`, `hcpcs_drug_indicator`, `place_of_service`, `total_beneficiaries`, `total_services`, payment averages. This is not expensive claims data as previously assumed; the next data task is a deliberate per-HCP HCPCS-detail ingest joined by NPI (all ~130 codes with volumes), which unlocks real alignment + the frame's magnitude bars as drawn.

**Step 1 DONE (2026-07-30):** `hcpcs_descriptors` lookup table built from the three parquets — 6,353 distinct codes, CMS official descriptions, most-recent-year-wins dedup (5,661 from 2023, 409 from 2022, 283 from 2021). Join format verified against `top_hcpcs_codes` (5-char uppercase, exact equality, no normalization needed); all 10 of Hussein's top codes resolve (vs 3/10 via the NSCLC-scoped `ta_hcpcs_codes`). DDL+grants in `migrations/2026_07_30_hcpcs_descriptors.sql`. NOT yet wired into any profile surface — profile join is a separate brief.

## hcp_medicare_summary_v2 — two semantics defects, exposed by the claims-detail cross-check

**Status:** flagged, not fixed. Found 2026-07-30 while verifying `hcp_hcpcs_detail` against the summary (Hussein reconstruction, exact-match proof).

**Defect 1 — `total_medicare_payment_3yr` is not "Medicare paid."** The stored value reconstructs EXACTLY (ratio 1.000) as `Σ(avg_medicare_payment × total_beneficiaries)` — a per-SERVICE average multiplied by patient count, which is not a total of anything. True paid (`Σ(avg × total_services)`, now stored as `hcp_hcpcs_detail.total_paid_est`) is **$12.16M** for Hussein over 3 years vs the summary's **$1.28M** — understated ~9.5×. Every surface rendering "Medicare paid" from the summary (practice-first header + Scale & Setting) shows the broken figure. This is the per-service-average-as-total trap, already committed by the legacy aggregation.

**Defect 2 — `beneficiaries_2021/22/23` are per-code sums, not unique patients.** Each year's stored count equals `Σ tot_benes` across that year's code rows EXACTLY (all three years) — a patient counted once per code billed. So the yearly numbers are beneficiary-CODE instances, the "UNIQUE BENEFICIARIES PER YEAR" chart label is false, and even "beneficiary-years" understates the duplication. `total_beneficiaries_3yr_unique_est` (20,879 for Hussein; derivation unverified) is the only person-scale figure. The −57% slope survives as a RELATIVE signal (identical semantics each year), but the axis labels and "patient panel" figures need rework in the next profile brief.

**Remediation (not now):** recompute the summary from `hcp_hcpcs_detail` (true paid = Σ total_paid_est; label yearly counts as code-summed instances or derive honest uniques where possible), then re-label the practice-first Practice Reality panel accordingly. Do not fix display-side only — the summary table is the defect.

## Field-intel & data-issue submissions persist nothing (both HCP surfaces)

**Status:** flagged, not fixed. Report only (found during the HCP profile migration, 2026-07-30).

**The gap.** The field-intelligence review and data-issue controls present as functional but have **no write path** — an MSL fills them in, hits submit, sees a success acknowledgement, and nothing is saved. This is true on **both** the old and new HCP surfaces:

- **DetailScreen (being sunset):** the "Submit validation" button is a literal no-op — `onClick={() => {}}`. Contextualize ("Add context"), opt-out/claim, and report-data-issue submit handlers are **toast-only** (`showFiToast(...)`) with no persistence. The `field_intel_*` tables are **SELECT-only** (read grants only; `lib/fieldIntelligence.ts` exposes reads exclusively), so there is nowhere for a write to land.
- **New two-spine profile (`ProfileSecondaryControls`):** faithfully reproduces this non-persistence, by design, with **honest toasts** that say the submission path is not wired (e.g. "Field review recorded — the submission path is not yet wired; stored locally only") rather than faking success. `ContactAccessCard` is the one genuinely-live read in that block.

**Impact.** Across the whole product, MSLs submitting field-intel reviews (Data-matches-field-reality / Engagement / Credibility / Momentum) and data-issue reports are **saving nothing** — the aggregate FI chips therefore stay UNRATED forever, and reported data issues are lost. The controls invite contribution the system cannot retain. (Note capture via `FieldInsights` → `createNote` → `msl_hcp_notes` DOES persist — this gap is specifically the field-intel validation and the issue/context/opt-out flows.)

**Needs a persistence decision (not now):** a write path for field-intel reviews and data-issue/opt-out/context submissions — tables with write grants (or an RPC), an aggregation model for the FI chips (how N reviews roll up to a rating), and identity handling ("contributor UUID only"). When built, **both** the new profile's `ProfileSecondaryControls` and the retained (sunset) DetailScreen logic adopt the same path. Until then the honest toasts stand; do not present these as working submissions.
