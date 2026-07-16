# Data-Completeness Audit — TA-scoping issues in the data/pipeline layer

**Date:** 2026-07-16 · **Scope:** `scripts/**/*.py` + `frontend/src/lib/api.ts` (data layer only; frontend hardcoded-TA sweep is in `MULTI_TA_AUDIT.md`, not here). **Method:** read-only grep (Categories A/C/D) + `SELECT` count matrix (Category B). Nothing changed.

**The one pattern:** NSCLC-era code that reads GLOBAL / TA-independent data (the `hcps_v2.cohort_classification` / `cohort_score` columns, legacy `hcp_score_ranks_v2` / `hcp_established_scores_v2` tables, or per-TA tables populated for only some TAs) where it should read per-TA scoped data — never migrated when AD / Hepatology arrived.

**Visible+active TAs (what actually surfaces): AD, Hepatology, NSCLC.** Rare Disease is not in `therapeutic_area_ingestion_config` → its lopsided tables are dead data, not bugs. This bounds the audit.

---

## Prioritized findings (worst-first)

| # | File:line | Cat | Pattern | TA(s) | Severity | Fix type | Status |
|---|-----------|-----|---------|-------|----------|---------|--------|
| 1 | `api.ts:1654` (`:1904`) | A | `getHCPDetail` passes global `hcps_v2.cohort_score` through untouched — never resolved per-TA — on a per-TA detail page | AD (null), all | **VISIBLE-WRONG** | query-repoint | **OPEN · NEW** |
| 2 | `api.ts:1653` (`:1892`) | A | `getHCPDetail` cohort only *upgrades* to `established` via v3 probe; rising/community never resolved per-TA → AD-only HCP shows null/global class | AD rising/community | **VISIBLE-WRONG** | query-repoint | **OPEN · NEW** |
| 3 | `trial_ta_mapping.py:204` (const `:30-31`) | B+D | trial-TA classifier emits ONLY `HEP_TA_ID`/`NSCLC_TA_ID` → `clinical_trials_ta_v2` has **0 AD rows**; AD trial signals/counts absent everywhere downstream | AD | **LATENT** | back-fill (extend classifier per-TA) | **OPEN · NEW** |
| 4 | `hcp_*` new per-TA tables (Hep=0) | B | Hepatology is visible+active but has **0 rows** in `established_ranks_v3`, `publication_leadership_v2`, `network_centrality_v2`, `cohort_classification_v2`, `research_themes_v2`, `scientific_positions_v1` — lives only on legacy + community + 2,344 stale narratives; config still `is_visible_in_ui=true` | Hepatology | **LATENT** | back-fill or de-visible | **OPEN · NEW** |
| 5 | `established_scoring.py:37` (`:301`,`:454`) | A+D | `TARGET_TA_IDS=[HEP,NSCLC]` hardcoded list (no `--ta`), reads global `cohort_classification` → (HCP×TA) cartesian; re-running re-contaminates + silently excludes any new TA | NSCLC (was), new | **LATENT** (data rebuilt) | retire/guard the script | **KNOWN #1 · script OPEN** |
| 6 | `api.ts:4642` | C | `.in("institution_canonical", <all cohort institutions>)` unchunked (~1,000+ ids) → PostgREST 400 at scale | all | **LATENT** | chunk | **OPEN · NEW** |
| 7 | `api.ts:3423` | C | `fetchHcpNameMap` `.in("id", hcpIds)` unchunked (~600, landscape union) | all | **LATENT** | chunk | **OPEN · NEW** |
| 8 | `generate_narratives_v2.py:836` | A | single-HCP regen gates cohort off global `hcps_v2.cohort_classification` (null for AD-only) → misclassify/abort | AD | **LATENT** | query-repoint (probe per-TA rank tables) | **OPEN · NEW** |
| 9 | `api.ts:3988/4111/4296/4387` | D | institution fns default `taSlug = "nsclc"` — a slug-omitted call silently scopes to NSCLC | new/AD | **LATENT** | back-fill (require taSlug) | **OPEN · NEW** |
| 10 | `bucket_themes.py:469`, `extract_scientific_positions.py:271`, `generate_scientific_position_synthesis.py:73` | D | `--ta` is a `Choice`/`TA_CONFIGS` whitelist → hard-rejects any unlisted TA at the CLI (blocks new-TA onboarding) | new TA | **LATENT** | back-fill (config-driven TA list) | **OPEN · NEW** |
| 11 | `generate_narratives_v2.py:1062` (`:1368`) | A | community narrative prompt fact uses global `cohort_score` (selection is per-TA, printed score is not) | all community | **COSMETIC** | query-repoint | **OPEN · NEW** |
| 12 | `rising_star_scoring.py:85` | A | global `cohort_classification='rising_star'` population select; likely superseded by per-TA `cohort_classification_v2` | new | **LATENT** | query-repoint | **OPEN · NEW (candidate — confirm live)** |
| 13 | `hcps_v2.institution_canonical` | B | AD canonical **26.3%** populated vs 99.5% normalized; workaround reads normalized for AD | AD | LATENT | worked-around (`institutionColumnForTa`) | **KNOWN #5 · handled** |
| 14 | `hcp_rising_star_ranks_v3` (AD=0) | B | AD absent; 4 surfaces repointed to `rising_composite_v1` | AD | LATENT | worked-around | **KNOWN #6 · handled** |
| 15 | `generate_narratives_v2.py` community selector | A | read global `cohort_classification` → 84% non-NSCLC on `--ta nsclc` | NSCLC | (was VISIBLE) | query-repoint | **FIXED #2** |
| 16 | `getTACounts` est-count / `getHCPDetail` est-rank / telescope | A/C | read legacy `hcp_established_scores_v2` / `hcp_score_ranks_v2` established slice | NSCLC | (was VISIBLE) | query-repoint | **FIXED #3,#4** |
| 17 | narrative open-payments `.in()` | C | unbatched → 400 at 697 ids | all | (was VISIBLE) | chunk | **FIXED #7** |
| — | `api.ts:1399` (+`:1362/:1469` unchunked `.in()`), `generate_community_narratives.py` (NSCLC-hardcoded, no `--ta`) | C/D | `getAllTACounts`/`getTACounts` output is never rendered (`TASelectionScreen` unimported; `taCounts` state unread); `generate_community_narratives.py` has no live caller | — | **DEAD** | none | dead / superseded |
| — | ~17 `--ta default=` sites (network/pharma/leadership/momentum/collaborators/nppes/etc.), `TA_ID_MAP` (`api.ts:724`), `community_scoring` global-tier select, id→name/label maps | D/A | overridable via `--ta` (bare run targets one TA); central slug→UUID registry; community is a genuinely global NPPES-directory tier; cosmetic labels | — | INTENTIONAL / COSMETIC | none | **OK** |

---

## Category B — by-TA population matrix (evidence)

Rows per per-TA table (visible TAs bold; **0** on a visible TA = gap):

| Table | NSCLC | AD | Hepatology |
|---|---|---|---|
| established_ranks_v3 | 33,121 | 4,916 | **0** |
| publication_leadership_v2 | 16,906 | 2,546 | **0** |
| network_centrality_v2 | 302,529 | 19,925 | **0** |
| cohort_classification_v2 | 79,904 | 15,847 | **0** |
| research_themes_v2 | 10,640 | 3,499 | **0** |
| scientific_positions_v1 | 6,354 | 2,676 | **0** |
| narratives_v2 | 3,366 | 297 | 2,344 |
| community_ranks_v2 | 12,960 | **0** (directory) | 40,800 |
| rising_star_ranks_v3 | 1,581 | **0** (#6) | 0 |
| rising_composite_v1 | 0 (model split) | 5,719 | 0 |
| clinical_trials_ta_v2 | 2,463 | **0** (#3) | 4,313 |
| institution_canonical (of members) | 91.5% | **26.3%** (#5) | 87.7% |
| _legacy_ established_scores_v2 / score_ranks_v2 | present | 0 | present |

Two shapes: **AD gaps** (community/rising_star/trials/canonical — mostly known/handled) and **Hepatology's total absence** from every new per-TA table (row 4 — the biggest new finding).

---

## Summary

**17 distinct TA-scoping issues catalogued** (plus a dead/intentional tail needing no fix).

- **4 FIXED this session** (#2 community selector, #3 getTACounts/getHCPDetail est reads, #4 telescope, #7 open-payments batching).
- **13 remain open**: **10 NEW** (rows 1–4, 6–11) + **3 pre-existing** (row 5 established-scorer *script* still un-retired though its data was rebuilt; rows 13–14 the AD `institution_canonical` and `rising_star_ranks_v3` workarounds), plus **1 unconfirmed candidate** (row 12, `rising_star_scoring.py`).

**The family is essentially bounded** — the Python pipeline has **0 remaining unchunked large `.in_()`** and **0 remaining `hcp_established_scores_v2` readers**; every `hcp_score_ranks_v2` read is already `therapeutic_area_id`-filtered. What's left is (a) the `getHCPDetail` per-TA cohort gap, (b) Hepatology never migrated to the v3 pipeline, (c) AD trials never tagged, and (d) a handful of `api.ts` `.in()` chunk gaps and new-TA CLI whitelists.

**Single worst:** **`getHCPDetail` (`api.ts:1653/1654`)** — the only NEW VISIBLE-WRONG, surfacing a global/null `cohort_score` and unresolved cohort classification on live AD detail pages. Fix mirrors the established v3-probe already in that function, extended to rising/community.

**13 total TA-scoping issues remain open, of which 10 are new** (plus 1 unconfirmed candidate).
