# Pulse Data Foundation — Technical Design v2

Status: DESIGN. Supersedes `PULSE_DATA_FOUNDATION_DESIGN.md` (v1). No migrations or DB writes are
part of this document. Revised 2026-07-24 following corpus audit + two rounds of advisor review.

## Governing statements

**Destination:** The goal is not to detect publication velocity; the goal is to identify
scientifically meaningful shifts that are actionable for Medical Affairs.

**Current implementation:** Scientific Pulse identifies meaningful shifts in the scientific
literature's attention within a therapeutic area, using statistically stable rolling windows and
AI synthesis grounded in transparent evidence.

Both belong in the spec. The first defines where this goes; the second constrains what may be
claimed today.

---

## 0. What changed from v1, and why

Five findings from the corpus audit invalidate or redirect parts of v1.

**§2.2 signature derivation is VOID, not amended.** `theme_to_canonical_v1` has **0 rows**. Both
the primary (data-driven via `example_pmids`) and augment (LLM) paths in v1 §2.2 routed through
it. There is no path from a canonical theme to a publication.

Populating it is not viable either: `hcp_research_themes_v2` holds 10,640 NSCLC rows with **9,768
distinct `theme_name` values** — 92% unique free text, generated per-HCP with no reuse. It is
per-HCP prose, not a taxonomy. It cannot support aggregation, and anything in the roadmap
assuming otherwise needs revisiting — including Card 3 (Emerging Voices), which the roadmap
justified on the basis that `extract_research_themes` already writes cohort themes. It does not
write anything aggregatable.

**Concept filtering rule established empirically.** Pre-flight over 83,338 NSCLC pubs
(1.22M concept assignments, 12,433 distinct concepts):

- Rule: `concept_level >= 2 AND concept_score >= 0.4 AND corpus_share < 0.40`
- Result: **median 5 discriminative concepts/pub, only 5.4% of pubs with <=1** (4,520 / 83,338)

Two refinements tested and rejected: `level >= 3` raises the starved fraction to 27%, and a 2%
lower frequency bound raises it to 30% — the sub-2% tail is where specificity lives. Do not
re-add either. Note also that `CONCEPT_SCORE_THRESHOLD = 0.4` inherited from
`ta_tagging_rebuild_v2` is **correct** for this task: score rises monotonically with level from
level 1 up (level 5 concepts are 92.8% above 0.4; level 1 only 40.7%), so the threshold removes
weak generic noise rather than discriminative signal.

**Blocklists required.** `Stage (stratigraphy)` (8,663 pubs) and `Paleontology` (8,769) are
homonym artifacts — OpenAlex maps cancer *staging* to geological stratigraphy. Same failure
family as the `career_first_pub_year_v2` homonym problem. Blocklist by concept id.

**Concepts alone cannot label the canonical set.** Louvain clustering over the filtered graph
(267 nodes, 2,956 edges) yields 15 top-level / 44 sub-clusters. Reconciled against the 25 rows in
`theme_canonical_v1`: **8 clean matches, 9 partial, 8 with no cluster at all.** The 8 unmatched
are disproportionately the frontier themes MSLs most value. Their vocabulary is not merely
sparse — it is **absent from the OpenAlex concept ontology**: zero nodes for sotorasib,
adagrasib, G12C, amivantamab, exon 20, HER2, RET, BRAF, NRG1, TROP2, deruxtecan,
antibody-drug conjugate, STK11, KEAP1, tumor mutational burden, persister, SEER, segmentectomy.
OpenAlex concepts are a frozen legacy vocabulary that lags the literature by years — precisely
the window Pulse sells.

**The canonical set is sound and must not be revised toward the clusters.** The 25 canonicals are
clinically framed and MSL-relevant. The clusters describe what the literature *was*; the
canonicals describe what the field *is*. One exception: `Drug-Tolerant Persisters` has 44
supporting pubs and should be folded into an EGFR or IO resistance theme.

---

## 1. `pub_date` backfill

**v1 §1.4 forward fix is DONE — strike it.** The `pubmed_pipeline` refactor (commit `ad27ade`)
populates `pub_date` at ingest; verified 311/311 on the acceptance-test run.

Remaining work is the historical backfill only (v1 §1.2/§1.3 stand: OpenAlex `publication_date`
first, PubMed `parse_pub_date` fallback, update-only-where-NULL, chunked and resumable).

**Sequencing:** run the backfill **after** the wide catch-up re-ingest completes. The catch-up
re-persists thousands of rows with dates already populated; backfilling first wastes API calls
and produces a residual count that cannot be trusted. Re-count NULLs after catch-up, then scope.

---

## 2. pub->theme labeler [KEYSTONE — unchanged in necessity, changed in method]

Still the keystone. Nothing in the advisor discussion changes this: every downstream idea
(rolling windows, share of attention, composition, confidence stack) requires a durable
pub->theme link. Build it.

### 2.1 Signal priority is PER-THEME, not global

v1's global ordering (concept primary, MeSH secondary, title "tertiary/weak tie-break") is wrong
for this corpus. Each canonical theme is assigned a **signature type**:

| class | count | discriminator | examples |
|---|---|---|---|
| Established biology | ~8 | concept signature | ALK/ROS1, ctDNA/liquid biopsy, TME |
| Frontier agents | ~8 | **title/abstract keyword** | sotorasib, amivantamab, deruxtecan |
| Clinical setting | ~6 | MeSH + title | perioperative vs adjuvant vs early-stage |
| Methodology-adjacent | ~3 | concept subset | SEER, propensity matching |

The cheapest tier is the primary discriminator for the highest-value themes. Frontier drug names
are unambiguous strings with near-zero false-positive rates — no LLM required. Title-only match
counts confirm real support: KRAS G12C 375, exon 20 423, ADC 276, rare drivers 534, IO biomarker
347. (Persisters 44 — fold, see §0.)

### 2.2 Signature derivation [REPLACES the void v1 §2.2]

Derive concept signatures from **corpus co-occurrence structure**, not from
`theme_to_canonical_v1`. Cluster the filtered concept graph, then label clusters against the 25
canonical names. Support becomes the whole corpus rather than <=3 LLM-cited PMIDs, and the
circularity disappears — this checks whether the canonicals describe the data rather than
assuming it.

Where a canonical has no matching cluster, hand-author the signature (keyword and/or MeSH) from
its `description`. This is a one-time, ~25-row curation task and should be treated as such —
it is the highest-leverage hour in the whole build.

Weight signature derivation toward the recent window (`pub_year >= 2023` available now;
`pub_date` after backfill). Whole-corpus derivation over-weights historical volume and
under-resolves emerging themes.

Persist as `theme_concept_signature_v1` (v1 §2.2 schema stands) plus a parallel
`theme_keyword_signature_v1` for the title/MeSH themes.

### 2.3 Output schema

v1 §2.3 `publication_theme_v1` stands, with `method` extended to include `keyword` and `mesh`
alongside `concept` / `title` / `llm_tiebreak`. Add `therapeutic_area_id` (uuid) per v1 §2.6 —
recommendation confirmed.

### 2.4 Exclusions at label time

Exclude from momentum counts (retain rows, flag them): `Published Erratum` (386),
`Retracted Publication` (296), `English Abstract` (710). Case Reports (6,499, 7.7%) should be
counted separately, not folded into primary research — a case-report surge is a different signal
from a research surge.

A **retraction landing in a theme** is worth surfacing as an event in its own right.

---

## 3. `theme_momentum_snapshot_v1` [SCHEMA REVISED — do not build v1's version]

### 3.1 Period model

**Rolling 90-day windows, refreshed weekly.** Refresh cadence and analysis window are
independent knobs; v1 conflated them. The page changes every Monday; the comparison is trailing
90 days vs prior 90 days.

This is what makes the statistics defensible. ADC — the strongest emerging theme in the corpus —
runs ~8 pubs/month. At monthly grain the Poisson SD is +/-37% and signal-to-noise is roughly 1:8.
At 90-day grain the same theme is ~24 per window, SD +/-20%, and it clears a 20-count display gate.

`period_type` must therefore support `rolling_90d`, not only `month`. Retain `month` for the
long-run curve; `rolling_90d` drives the surfaced comparison.

### 3.2 Metric primitive: share of attention

Primary metric is the theme's **share of TA attention** in the window, not raw count and not raw
percent-change. Share normalizes mature against frontier (EGFR at 80/month is not news; KRAS
moving 3% -> 7% of TA attention is).

**Share solves comparability, not variance.** These are orthogonal and must both be handled: use
share **with** the 90-day window, never as a substitute for it. A share figure computed on a
6-pub numerator carries identical Poisson noise while *looking* precise to three significant
figures — that is worse than a raw count, not better.

### 3.3 Display gating

Below ~20 pubs in the window, suppress numeric change entirely. Use qualitative labels —
"Increasing attention", "Emerging", "Steady" — which are true without implying precision the
data cannot support. Compute intervals internally; do not surface them (they raise cognitive
load without changing the MSL's decision).

**Never display the open period.** State "Updated through <date>" and exclude incomplete windows.
Publication indexing lag biases the newest period downward and would otherwise produce spurious
declines on every theme, every week.

### 3.4 Composition columns [NEW]

Publication types are 98.2% populated (83,040 / 84,590) and PubMed MeSH-vocabulary. They provide
a genuine second and third evidence stream **inside the stream already held**. Class rules
(types are multi-label; `Journal Article` at 94.7% is a universal tag, not a class):

| class | components | corpus n | usable as |
|---|---|---|---|
| Review | Review, Systematic Review, Meta-Analysis, Network Meta-Analysis | ~12,900 | **percentage** (research:review ratio = maturation index) |
| Trial | Phase I/II/III, Clinical Trial, RCT, Protocol | ~5,100 | percentage + phase mix |
| Commentary | Editorial, Comment, Letter | ~3,885 | counts; percentage only above volume floor |
| Consensus/Guideline | Practice Guideline (80), Consensus Statement (131) | 211 | **events only** |
| Case report | Case Reports | 6,499 | separate series |

**Rare types are events, not rates.** A theme's *first* practice guideline or consensus statement
is a single unambiguous occurrence needing no baseline, no variance model, and no threshold. It
is defensible at n=1 in a way "+50%" never is at n=6. This inverts the usual relationship:
frontier themes, worst-served by count velocity, are well-served by event detection — and a
guideline landing on a 400-paper theme is more newsworthy than one landing on a 12,000-paper theme.

**Do not ship four-way composition percentages.** The advisor's illustration
(Research 78 / Reviews 12 / Editorials 6 / Guidelines 4) is two orders of magnitude off this
corpus: editorials are 1.2% and guidelines 0.09%. At 24 pubs/window, "editorials 6%" is 1.4
papers and will swing wildly. One ratio (research:review) and two event types — not a pie.

### 3.5 Trial linkage — PROMOTED from v1 §3.5

v1 deferred trial->theme linkage as needing a separate `trial_theme_v1` labeler over
`clinical_trials_v2`. **Trial-phase publications make a second stream available immediately**:
~5,100 trial-flagged pubs inherit theme labels from the same labeler, with no new source and no
new link table. Phase mix within a theme (Phase I concentration vs Phase III) is itself a
maturation signal.

The registry-based `trial_theme_v1` remains worth building afterward, but is no longer the
blocker for a second confidence-stack checkmark.

---

## 4. Surface vocabulary

Name the metric **Scientific Attention**, not Momentum. Attention accommodates publications,
trials, congress, and guidelines without pretending they are interchangeable counts.

The overclaiming risk is handled **in the UI, not the documentation** — MSLs do not read docs.
The confidence stack makes scope self-disclosing at the point of use:

```
Scientific Attention · Confidence
  ✓ Publications
  ✓ Clinical trials (trial-type pubs)
  ○ Congress
  ○ Guidelines
  ○ Community
```

Greyed streams are a disclosed limitation rather than a silent one, and the widget improves
without redesign as sources land.

---

## 5. Build order

Unchanged in shape from v1 §4; the following are the only sequencing changes.

- **Phase 0** — `pub_date` backfill, **after** the wide catch-up. Forward fix already shipped.
- **Phase 1** — signature derivation: cluster + label for ~8 themes, hand-author keyword/MeSH
  signatures for the remaining ~17. One-time, offline.
- **Phase 2** — labeler: retroactive seed, then a new cycle stage (`6b label_pub_themes`).
- **Phase 3** — snapshot with the §3 revised schema, then a cycle stage (`8e`).

**Gate:** no new stages wired into `reingest_cycle.py` until one clean cron-driven weekly run
completes post-refactor. All Phase 0–3 offline work can proceed in parallel without touching the
orchestrator.

**Checkpoint discipline for the seed:** resume by counting actual `publication_theme_v1` rows in
the id range — never by trusting a processed-counter. That is the exact failure shape of the
July ingest outage, and a labeler that silently skips a chunk produces a curve with a hole in it
that reads as a real decline.

---

## 6. Open items

1. Consensus/guideline event detection needs a per-theme "first occurrence" model — trivial, but
   define what counts as an event before building the card.
2. Journal-tier weighting as a "surprise" proxy (`journal`, `citation_count` both present) —
   promising, unspecified.
3. Card 3 (Emerging Voices) needs re-justification; its stated v1 basis does not exist.
4. AD corpus has not been audited for any of the above. Every number here is NSCLC.
