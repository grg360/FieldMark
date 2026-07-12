# Version Consistency Audit — FieldMark DB

**Purpose:** Catalog every versioned table (`_v1`/`_v2`/`_v3`) in the FieldMark
database and every consumer of it (Postgres RPCs, Python scripts, frontend
TypeScript reads), record which VERSION each consumer targets, and flag
version mismatches — especially the "paired consumers diverge" bug class that
froze the AD Established feed.

**Date:** 2026-07-11
**Nature:** Read-only snapshot. All figures are live row counts / grep+DB
evidence at time of audit. No DB writes, no pipeline runs, no source edits.

**Headline:** 50 versioned tables in 50 base families. **Only 2 families have
2+ coexisting versions with live rows** — `hcp_established_ranks` (v2+v3) and
`hcp_rising_star_ranks` (v2 + deduped_v2 + v3). **Both diverge.** The other 48
families are single-version and clean. Five distinct mismatches found; the two
highest are frozen-feed bugs for the **hepatology** TA, structurally identical
to the already-fixed AD Established bug.

---

## Section 1 — Versioned table families

Only families with 2+ live versions are analyzed in depth (Sections 2–3). The
full inventory of single-version families is in Section 4.

### Multi-version families (the risk surface)

| Family | Live versions (rows) | Per-TA coverage | Canonical version |
|---|---|---|---|
| **hcp_established_ranks** | v2 (44,728), v3 (27,280) | v2 = nsclc 22,364 + hepatology 22,364 · v3 = nsclc 22,364 + atopic-dermatitis 4,916 | **v3** is canonical (all live consumers read it), but v3 **omits hepatology** |
| **hcp_rising_star_ranks** | v2 (234,758), deduped_v2 (234,749), v3 (1,581) | v2/deduped = hepatology 158k + nsclc 76.7k + rare-disease 3 · v3 = nsclc 1,581 only | **v3** is canonical, but v3 covers **nsclc only** |

Key coverage facts (from `therapeutic_area_id` breakdowns):

- **hcp_established_ranks_v3** contains **nsclc + atopic-dermatitis**. It does
  **NOT** contain hepatology. The old v2 contains nsclc + hepatology (no AD).
  So v2→v3 was a *swap*, not a superset: AD was added, hepatology was dropped.
- **hcp_rising_star_ranks_v3** contains **nsclc only** (1,581 rows). The old
  v2/deduped_v2 hold hepatology (158k), nsclc (76.7k), rare-disease (3). v3 is
  an early/partial re-score covering one TA.
- `hcp_rising_star_ranks_v2` and `hcp_rising_star_ranks_deduped_v2` are
  near-identical (234,758 vs 234,749 rows) — a raw + deduped pair. **No live
  code reads either** (see Section 3-D).

### Cohort-count sources (relevant because counts gate the feeds)

These non-rank tables supply the cohort tile counts the UI shows *before* a
feed loads, so they must agree with the rank tables the feed reads:

| Table | Per-TA rows | Feeds which count |
|---|---|---|
| hcp_established_scores_v2 | hepatology 11,390 · nsclc 11,390 (no AD) | `getTACounts` Established tile (api.ts:1158) |
| hcp_community_scores_v2 | rare-disease 13,298 · hepatology 20,400 · nsclc 6,480 | `getTACounts` Community tile (api.ts:1160) |
| hcp_score_ranks_v2 (cohort=rising) | hepatology 158,034 · nsclc 76,721 · rare-disease 3 | `getTACounts` rising **pool** + total (api.ts:1132–1147) |
| hcp_rising_composite_v1 | atopic-dermatitis 5,719 only | AD rising composite (not wired to the v3 feed) |

TAs exposed in the UI (`TA_ID_MAP`, api.ts:621): rare-disease, hepatology,
nsclc, oncology, immunology, atopic-dermatitis. (oncology/immunology have no
rank rows in any version → dormant.)

---

## Section 2 — Consumer catalog

### Family: `hcp_established_ranks`

| Consumer | Type | Version | Location |
|---|---|---|---|
| `get_established_filtered` (rows) | RPC | **v3** | live pg_proc; def in migrations/2026_05_28_get_established_filtered_v3.sql (superseded, see 3-F) |
| `get_established_filtered_count` (count) | RPC | **v3** | migrations/2026_07_10_get_established_filtered_count_v3_repoint.sql (the fix) |
| feed reads / detail / watchlist | Frontend | **v3** | frontend/src/lib/api.ts:90, 982, 1696, 1803, 1938, 1946, 2014, 3526, 3666, 4089, 4269 |
| `recompute_established_ranks_v3.py` | Script (WRITER) | **v3** | scripts/score/recompute_established_ranks_v3.py:200 |
| `generate_narratives_v2.py` | Script (read) | **v3** | scripts/narrative/generate_narratives_v2.py:90, 448, 565, 574, 710, 1075 |
| `established_npi_resolver.py` | Script (read) | **v3** | scripts/enrich/established_npi_resolver.py:220, 279, 331 |
| `take_weekly_snapshot.py` | Script (read) | **v3** | scripts/utilities/take_weekly_snapshot.py:116 |
| `extract_scientific_positions.py` | Script (read) | **v3** | scripts/narrative/extract_scientific_positions.py:107 |
| `dedup_merge.py` | Script (dedup target) | **v3** | scripts/dedup/dedup_merge.py:437 |
| **`scrape_leadership_signals.py`** | **Script (read)** | **v2** ⚠ | **scripts/social/scrape_leadership_signals.py:331** |
| `extend_rpcs_themes.sql` | SQL (stale defn of live RPC) | **v2** ⚠ | backend/scripts/sql/extend_rpcs_themes.sql:51, 85 |

### Family: `hcp_rising_star_ranks` (+ deduped_v2)

| Consumer | Type | Version | Location |
|---|---|---|---|
| `get_rising_star_filtered` (rows) | RPC | **v3** | live pg_proc |
| `get_rising_star_filtered_count` (count) | RPC | **v3** | live pg_proc |
| feed / counts / home / watchlist | Frontend | **v3** | api.ts:940, 1108, 1113, 1119, 1737, 3130, 3224–3253, 3510, 3650, 3699, 3728, 4080, 4259; home.ts:667, 758, 1205; watchlists.ts:403 |
| `rising_star_scoring.py` | Script (WRITER) | **v3** | scripts/score/rising_star_scoring.py:243 |
| `generate_narratives_v2.py` | Script (read) | **v3** | scripts/narrative/generate_narratives_v2.py:87, 343, 396, 1055 |
| `extract_research_themes.py` | Script (read) | **v3** | scripts/classify/extract_research_themes.py:56 |
| `extract_scientific_positions.py` | Script (read) | **v3** | scripts/narrative/extract_scientific_positions.py:99 |
| `extract_external_links.py` | Script (read) | **v3** | scripts/social/extract_external_links.py:95, 106 |
| `extract_web_signals.py` | Script (read) | **v3** | scripts/social/extract_web_signals.py:174, 185 |
| `take_weekly_snapshot.py` | Script (read) | **v3** | scripts/utilities/take_weekly_snapshot.py:56 |
| `extend_rpcs_themes.sql` | SQL (stale defn of live RPC) | **v2** ⚠ | backend/scripts/sql/extend_rpcs_themes.sql:144, 178 |
| `hcp_rising_star_ranks_v2` / `_deduped_v2` | — | — | **no live consumer reads these tables** |

### Cross-cutting: Established/Rising "count" consumers that read NON-rank tables

The count that the UI shows for a cohort tile does **not** come from the rank
table — it comes from a *scores* / *score_ranks* table. This is where the
divergence bites even though the RPC row/count pair now agree:

| "Established count" consumer | Reads | Version |
|---|---|---|
| `getTACounts` tile (api.ts:1158) | hcp_established_scores_v2 | v2 (hepatology + nsclc) |
| `get_established_filtered_count` (feed) | hcp_established_ranks_v3 | v3 (nsclc + AD) |

| "Rising count" consumer | Reads | Version |
|---|---|---|
| `getTACounts` pool/total (api.ts:1132) | hcp_score_ranks_v2 cohort=rising | v2 (hepatology + nsclc + rare) |
| `getTACounts` selected (api.ts:1108) & feed | hcp_rising_star_ranks_v3 | v3 (nsclc only) |

---

## Section 3 — MISMATCHES & RISKS (the payload)

### Reference (ALREADY FIXED): Established count/rows version split

`get_established_filtered` (rows) read `hcp_established_ranks_v3` while
`get_established_filtered_count` (count) still read `hcp_established_ranks_v2`.
For **atopic-dermatitis** — a v3-only TA — the count RPC returned 0, so the
paginated feed believed there were 0 results and froze, even though v3 held
4,916 AD rows. Fixed by `migrations/2026_07_10_get_established_filtered_count_v3_repoint.sql`
(count RPC repointed to v3). The two RPCs now agree on v3. **Use this as the
template for the new findings below.**

---

### MISMATCH #1 — HIGH — hepatology **Established** feed is frozen (mirror of the AD bug)

- **Family:** hcp_established_ranks
- **Diverging consumers:** cohort tile count `getTACounts` → `hcp_established_scores_v2`
  (hepatology = 11,390 rows, tile shows a populated cohort) **vs** the feed
  `get_established_filtered` / `_count` → `hcp_established_ranks_v3`
  (hepatology = **0 rows**).
- **What breaks:** The Established tile for hepatology advertises ~11k HCPs;
  clicking in calls the v3 feed RPC, which has no hepatology rows → 0 results,
  empty/frozen feed. Identical failure mode to the fixed AD bug, but in the
  opposite direction: there, v3 had the data and the count lagged on v2; here,
  the counts have the data (v2) and the feed moved to v3 which was never
  materialized for hepatology.
- **Root cause:** `hcp_established_ranks_v3` was populated for nsclc + AD only;
  hepatology was left behind in v2. All live Established consumers were
  repointed to v3.
- **Severity:** HIGH — hepatology is a live, exposed TA (`TA_ID_MAP`) and is
  the single most data-rich TA in the DB. Caveat: HIGH *if* hepatology
  Established is meant to be a live cohort. If hepatology Established was
  intentionally retired, this downgrades to "stale v2 rows + misleading tile
  count" (fix = stop counting from scores_v2, or hide the cohort).

### MISMATCH #2 — HIGH — hepatology & rare-disease **Rising Star** feeds are frozen

- **Family:** hcp_rising_star_ranks
- **Diverging consumers:** `getTACounts` rising **pool/total** →
  `hcp_score_ranks_v2` cohort=rising (hepatology = 158,034; rare-disease = 3)
  **vs** the selected-count + feed → `hcp_rising_star_ranks_v3` (hepatology =
  **0**, rare-disease = **0**; v3 has nsclc only, 1,581 rows).
- **What breaks:** For hepatology and rare-disease, the platform reports a
  non-zero rising pool in totals, but the Rising Star selected count and the
  feed (RPC + all frontend reads) read v3, which contains only nsclc → 0 rows.
  Rising Star feed empty for every TA except nsclc.
- **Root cause:** `hcp_rising_star_ranks_v3` is an early re-score covering
  nsclc only (1,581 rows), while consumers were fully cut over to v3. The
  populated hepatology/rare-disease rising data still sits in v2/deduped_v2,
  which nothing live reads.
- **Severity:** HIGH for hepatology (large, live TA), LOW-in-magnitude for
  rare-disease (only 3 rising rows even in v2). Same "confirm the cohort is
  meant to be live" caveat as #1. Note also **AD Rising** is unserved by this
  path: v3 has no AD, and AD rising lives in `hcp_rising_composite_v1` (5,719)
  which is not wired to `get_rising_star_filtered` — consistent with MEMORY's
  note that AD Rising repoint is still in progress.

### MISMATCH #3 — MEDIUM — `scrape_leadership_signals.py` reads the OLD Established version

- **Family:** hcp_established_ranks
- **Diverging consumer:** `scripts/social/scrape_leadership_signals.py:331`
  reads `hcp_established_ranks_v2` while every other Established consumer
  (RPCs, frontend, narratives, npi_resolver, snapshots, dedup) reads v3.
- **What breaks:** This enrichment picks its "top N Established HCPs per TA +
  scope" from the stale v2 cohort. Concretely it (a) **entirely misses
  atopic-dermatitis** (AD is v3-only, absent from v2) so no leadership signals
  are ever scraped for AD Established, and (b) still processes hepatology
  (dropped from v3). The evidence set it produces is silently scoped to the
  wrong cohort.
- **Severity:** MEDIUM — it is a backend enrichment script, not a user-facing
  feed, so it fails quietly (wrong/missing evidence rows) rather than freezing
  a screen. It is the clearest "one consumer left behind on v2" instance of
  the bug class.

### MISMATCH #4 — MEDIUM (latent landmine) — `extend_rpcs_themes.sql` redefines the LIVE RPCs against v2

- **Family:** both (established + rising)
- **Issue:** `backend/scripts/sql/extend_rpcs_themes.sql` contains full
  `CREATE OR REPLACE FUNCTION` bodies for `get_established_filtered`,
  `get_established_filtered_count`, `get_rising_star_filtered`, and
  `get_rising_star_filtered_count` — all hard-wired to
  `hcp_established_ranks_v2` / `hcp_rising_star_ranks_v2`. These are the exact
  function signatures that are live in prod (currently on v3).
- **What breaks:** Re-running this file against prod (its header literally says
  "Run each CREATE OR REPLACE below … in Supabase SQL editor") would silently
  revert the v3 repoint and **re-introduce the exact AD frozen-feed bug** that
  2026_07_10 just fixed, plus revert rising to v2. It is a loaded gun sitting
  in the repo.
- **Severity:** MEDIUM — inert until someone runs it, but zero guardrails.
  Recommend updating the bodies to v3 or moving the file to an archive folder
  with a "SUPERSEDED" banner.
- **✅ RESOLVED 2026-07-11 (commit `15cd2d0`):** file **deleted**. It could not be
  cleanly repointed to v3 — its `get_established_filtered` body selects v2-only
  columns (`pub_volume_score`, `lead_density_score`, …) absent from `ranks_v3`, so
  the live v3 functions are a different schema owned by the dated migrations. No
  runner/code referenced it (docs only); git history + `pg_get_functiondef`
  preserve the definitions. Community RPCs remain v2 (consistent, unaffected).

### MISMATCH #5 — LOW / cleanup — orphaned rising-star v2 tables

- **Family:** hcp_rising_star_ranks
- **Issue:** `hcp_rising_star_ranks_v2` (234,758 rows) and
  `hcp_rising_star_ranks_deduped_v2` (234,749 rows) have **no live consumer**
  (only the stale SQL in #4 names v2; nothing names deduped_v2 at all). ~469k
  rows of dead data, plus a confusing raw/deduped pair.
- **What breaks:** Nothing at runtime, but the twin near-identical tables are a
  version-confusion hazard: a future author "fixing" rising by pointing at
  `_v2` vs `_deduped_v2` could reintroduce duplicates or stale scores.
- **Severity:** LOW — cleanup. Do not drop until MISMATCH #2 is resolved
  (hepatology/rare-disease rising data currently exists *only* in these v2
  tables; they are the sole surviving copy of that cohort's scores).

### MISMATCH #6 — LOW / historical — superseded `get_established_filtered_v3` migration

- **Family:** hcp_established_ranks
- **Issue:** `migrations/2026_05_28_get_established_filtered_v3.sql` is named
  "v3" but its body `LEFT JOIN hcp_established_ranks_v2 er2` (lines 53, 133).
  The live function no longer matches this file (live def is v3-only per
  pg_proc).
- **Severity:** LOW — historical artifact only; the live RPC has since been
  replaced. Noted for completeness so a reader doesn't trust the migration
  file as current.

---

## Section 4 — Clean families (single live version, all consumers agree)

The following 48 families expose exactly one version, so no version divergence
is possible. Listed with row counts for reference.

| Family | Version | Rows |
|---|---|---|
| clinical_trials | v2 | 134,122 |
| clinical_trials_ta | v2 | 6,776 |
| dol_matches | v2 | 239 |
| hcp_affiliation_profile | v2 | 0 |
| hcp_author_metrics | v2 | 473,291 |
| hcp_author_metrics_for_cards | v2 | 240,390 |
| hcp_author_metrics_latest | v2 | 239,741 |
| hcp_cohort_classification | v2 | 15,847 |
| hcp_community_ranks | v2 | 80,356 |
| hcp_community_scores | v2 | 40,178 |
| hcp_established_scores | v2 | 22,780 |
| hcp_industry_classification | v1 | 268,886 |
| hcp_institutions | v2 | 31,370 |
| hcp_medicare_by_ta | v2 | 19,379 |
| hcp_medicare_summary | v2 | 25,999 |
| hcp_narratives | v2 | 5,922 |
| hcp_network_centrality | v2 | 322,454 |
| hcp_network_momentum | v1 | 3,531 |
| hcp_nppes_detail | v2 | 48,760 |
| hcp_open_payments_by_drug | v2 | 29,093 |
| hcp_open_payments_by_ta | v2 | 14,040 |
| hcp_open_payments_summary | v2 | 30,185 |
| hcp_open_payments_top_companies | v2 | 153,249 |
| hcp_openalex_authors | v2 | 253,024 |
| hcp_pharma_engagement | v2 | 12,941 |
| hcp_publication_leadership | v2 | 9,194 |
| hcp_research_themes | v2 | 10,640 |
| hcp_rising_composite | v1 | 5,719 |
| hcp_scientific_emergence | v1 | 3,052 |
| hcp_scientific_momentum | v1 | 1,907 |
| hcp_scientific_positions | v1 | 9,030 |
| hcp_score_ranks | v2 | 425,510 |
| hcp_scores | v2 | 79,518 |
| hcp_therapeutic_areas | v2 | 279,295 |
| hcp_top_collaborators | v2 | 519,384 |
| hcp_web_signals | v1 | 2,424 |
| hcps | v2 | 282,464 |
| npi_match_proposals | v2 | 0 |
| nppes_enrichment_log | v2 | 10,097 |
| publication_authors | v2 | 1,983,185 |
| publication_therapeutic_areas | v2 | 523,455 |
| publications | v2 | 414,892 |
| social_posts | v2 | 18,526 |
| social_users | v2 | 5,700 |
| theme_canonical | v1 | 25 |
| theme_to_canonical | v1 | 0 |
| trial_investigator_match_proposals | v2 | 0 |
| trial_investigators | v2 | 415,333 |

**Note on `hcp_community_ranks` / `get_community_filtered` pair:** both the
rows RPC and the count RPC read `hcp_community_ranks_v2`, and the frontend
reads v2 (api.ts:1036, 2098) — fully consistent, single version. This is the
one rows/count RPC pair that was never at risk.
