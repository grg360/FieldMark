# AD_PARITY_CHECKLIST.md — Atopic Dermatitis enrichment parity vs NSCLC

**Purpose:** Definition-of-done checklist for the AD (ta_id `9e4139d2-e062-4a58-8728-cdabb2d7dca1`)
build, measured layer-by-layer against the reference TA (NSCLC, `c0065b03-a25e-4e9a-bde4-4b4d0db7827d`)
across the two KOL cohorts (Established, Rising).

**Snapshot:** 2026-07-10 (measured read-only from the live DB).

**Update 2026-07-10 (later same day):** AD Established Belief Profiles COMPLETED — full top-100 run:
2,676 positions across 87 HCPs (13 of the top-100 had no paper clearing the ≥800-char / 2020+ /
senior-or-first filter), then 87/87 Belief Profiles synthesized (56 deep / 14 focused / 17 signal_moment),
all tagged `atopic-dermatitis`, 0 errors. The Belief Profile row below is updated to reflect this.

**Update 2026-07-11:** AD Established Top Collaborators COMPLETED — `compute_top_collaborators.py --ta
atopic-dermatitis` wrote 84,455 rows across 19,925 HCPs; Established coverage 445/447 (99.6%). Tag/scope
(ta_id UUID + `window_type='10yr'`) matches the frontend read — renders in the Established score breakdown.

**Coverage metric:** `distinct cohort HCPs with a row in the layer (TA-scoped where applicable) /
distinct HCPs in that cohort's rank table for the TA`.

---

## Headline

1. **AD Established is essentially done — and cleaner than NSCLC** on the core scientific-authority
   layers (98–99% vs NSCLC's 57–58%). AD used the TA-anchored 2,586-KOL cohort (§0d of the playbook);
   NSCLC's 11,390 is the looser legacy set. **Denominators are NOT apples-to-apples** — AD does not need
   to "catch up" to NSCLC's percentages.
2. **AD Rising does not exist yet.** 0 scored. Candidates are classified (**3,234 `rising_eligible`**),
   but the rising scoring chain has never run for AD. The entire AD Rising column is blocked on that
   one step.
3. Two real AD Established gaps beyond Belief Profiles: **Top Collaborators (0)** and **Research Themes (0)**.

---

## Cohort populations & classification

| | NSCLC | AD |
|---|---|---|
| Established (rank table) | 11,390 | 2,586 |
| Rising (rank table) | 1,581 | **0 (unbuilt)** |
| Classification mechanism | legacy path (not in `hcp_cohort_classification_v2`) | `hcp_cohort_classification_v2` |
| AD classification breakdown | — | established 2,586 · rising_eligible 3,234 · community 9,562 · too_young 465 |

NSCLC being absent from `hcp_cohort_classification_v2` is **not a gap** — it predates that table (the v2
classifier was built during the AD build) and classifies via the legacy path.

---

## Parity matrix

Coverage = cohort HCPs with a row / cohort population. **⏳ = in progress at snapshot.**

| Layer | NSCLC Est | AD Est | NSCLC Rising | AD Rising |
|---|---|---|---|---|
| **— Established authority (full-cohort target) —** | | | | |
| Publication leadership (`hcp_publication_leadership_v2`) | 58% | **98%** ✅ | n/a | n/a |
| Network centrality 10yr (`hcp_network_centrality_v2`) | 57% | **99%** ✅ | n/a | n/a |
| Pharma engagement — display-only, US (`hcp_pharma_engagement_v2`) | 1% | 3% | n/a | n/a |
| Established composite rank (`hcp_established_ranks_v3`) | ✅ | ✅ (deduped 2026-07-10) | n/a | n/a |
| **— Rising chain (full-cohort target) —** | | | | |
| Rising ranks (`hcp_rising_star_ranks_v3`) | ✅ 1,581 | n/a | ✅ 1,581 | **❌ 0 — unbuilt** |
| Network momentum (`hcp_network_momentum_v1`) | n/a | n/a | 100% ✅ | ❌ blocked |
| Rising score pool (`hcp_score_ranks_v2`, cohort=rising) | n/a | n/a | 38% | ❌ 0 |
| **— OpenAlex metrics (full-cohort target) —** | | | | |
| Author metrics (`hcp_author_metrics_latest_v2`) | 94% | **99%** ✅ | 99% ✅ | ❌ blocked |
| **— Collaborator network —** | | | | |
| Top collaborators (`hcp_top_collaborators_v2`) | 57% | **✅ 99.6%** (445/447, 2026-07-11) | 99% | ❌ blocked |
| **— Top-KOL intelligence overlays (NOT full-cohort) —** | | | | |
| Belief Profiles — Stage 1+2 (`hcp_scientific_positions_v1` / `hcp_ai_overviews`) | ~104 HCPs | **✅ 87** (top-100; 13 no corpus) | 81 | ❌ blocked |
| Narratives (`hcp_narratives_v2`) | 1,356 | 198 (partial) | 274 | ❌ 0 |
| Research themes (`hcp_research_themes_v2`) | 222 | **❌ 0 — GAP** | 155 | ❌ 0 |
| Web signals (`hcp_web_signals_v1`) | 28 | 0 | 208 | ❌ 0 |
| **— US clinical/commercial (bounded by US %; AD ~82% intl) —** | | | | |
| Medicare (`hcp_medicare_summary_v2`) | 7% | ~0% (2) | 6% | ❌ 0 |
| Open Payments (`hcp_open_payments_summary_v2`) | 7% | 4% | 4% | ❌ 0 |
| Verified DOL / social (`dol_matches_v2`) | 51 | 0 | 7 | ❌ 0 |

---

## Remaining-work punch list

### AD Established (near-done)
1. **Belief Profiles** — ✅ DONE (2026-07-10). Top-100 Established: 87 profiles (13 no extractable corpus),
   56 deep / 14 focused / 17 signal_moment. Pipeline parameterized by `--ta atopic-dermatitis` (commit `d91e8e4`).
2. **Top Collaborators** — ✅ DONE (2026-07-11). `compute_top_collaborators.py --ta atopic-dermatitis`
   (pure SQL, already multi-TA, no code change): 84,455 rows / 19,925 HCPs; Established coverage 445/447
   (99.6%). Writes `therapeutic_area_id` (ta_id UUID) + `window_type='10yr'` — matches the frontend read.
3. **Research Themes** — ❌ not built (0). NSCLC Est has 222. Needs the theme generator for AD. *Net-new run.*
4. **Narratives** — ⚠️ partial (198/2,586). Extend to the intended top-KOL slice (NSCLC-parity is a
   *slice*, not 100%).
5. Web signals / Medicare / Open Payments / DOL — ⚠️ structurally sparse (US-gated or opportunistic).
   Acceptable as display-only for an intl-heavy TA; not blockers.

### AD Rising (entirely unbuilt — the biggest chunk)
- **Run the rising scoring chain for AD** — `scoring_pipeline.py` (rising) → `hcp_rising_star_ranks_v3`,
  then `hcp_network_momentum_v1`. This unblocks the whole column (3,234 eligible candidates waiting).
- Then the same overlays as Established (author-metrics link, narratives, Belief Profiles, themes) for
  the rising set. **Everything in this column is blocked until the rank exists.**

---

## How to read the numbers
- **Full-cohort layers** (classification, pub leadership, network, author metrics) *should* approach 100%
  — AD Established does (98–99%); AD Rising is 0 because unbuilt.
- **Overlay layers** (Belief Profiles, narratives, themes, web signals) are **top-KOL by design** — low %
  is expected even when "done." Judge them by top-N depth, not cohort %.
- **US clinical/commercial** (Medicare, Open Payments) are coverage-capped by the US fraction; AD being
  ~82% intl makes low coverage structural, not a defect — hence pharma is weight-0 / display-only per the
  scoring doctrine (`TA_NEW_PLAYBOOK.md` §ESTABLISHED SCORING).
- **NSCLC's own gaps** (58% pub leadership, legacy classification) reflect its larger un-anchored
  denominator — not a bar AD must match.

---

*Reproduce this matrix:* `scratchpad/parity_matrix.py` (read-only coverage counts) against the live DB.
*Grounding docs:* `docs/canonical/TA_NEW_PLAYBOOK.md` (canonical pipeline + scoring doctrine), `docs/TA_BUILD_DEBT.md`.
