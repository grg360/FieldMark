# Pulse Data Foundation — Technical Design (spec, not build)

Status: DESIGN / for review. No code, no migrations, no DB writes are part of this document.
Companion to `docs/SCIENTIFIC_PULSE_STRATEGY.md` and `docs/INCREMENTAL_REINGEST_SEQUENCE.md`.

## Purpose

Build the data foundation that makes "Scientific Pulse" momentum **real and retroactive** — a
publication-velocity time-series per theme — rather than accrued-from-zero. From the Pulse gap audit,
three pieces are needed, in dependency order:

1. **`pub_date` backfill** — repopulate the ~17K NULL `publications_v2.pub_date` (the weekly ingest
   path never stored it) so we have a sub-annual time axis, and stop losing it going forward.
2. **pub→theme labeler** — a durable, per-publication attribution to canonical themes
   (`theme_canonical_v1`), which does not exist today (theme membership is HCP-level LLM output;
   only ≤3 example PMIDs survive per theme).
3. **`theme_momentum_snapshot`** — a canonical-theme × TA × period aggregate the Pulse cards query for
   WoW %, the 6-month curve, and declining themes.

### Non-goals (explicitly out of scope for this foundation)

- Social / conference chatter momentum (forward-only; `social_posts_v2` isn't theme-classified and has
  no pre-capture history). Not part of this foundation.
- Congress abstract/session signal (no source table exists).
- Sub-theme hierarchy (SHP2/SOS1/MET under KRAS) — no data model; separate future work.
- The TA-level LLM synthesis prose ("This Week's Movement", "Consensus Snapshot" narration). Separate.

### Granularity decision (load-bearing)

`ingest_publications.parse_pub_date` (and PubMed itself) is **month-precision** — day defaults to `01`
when PubMed omits it. OpenAlex `publication_date` is often full-precision. Therefore:

- **Monthly** is the honest primary grain for the historical/backfilled series and the 6-month curve.
- "Momentum vs 30-day baseline" is computed as a **rolling trailing window** over the daily/collected
  data forward, but for backfilled months we approximate the "↑%" as **latest-month vs
  trailing-3-month average** (month-over-month), NOT a true 30-day window, because backfilled days are
  unreliable. This distinction must surface in the UI copy ("vs 3-mo baseline" for historical).

---

## 1. `pub_date` backfill (do this FIRST — cheapest, unblocks everything)

### 1.1 The problem

- `pubmed_pipeline.py` `_publication_v2_row` writes `"pub_date": None` (line ~1274) — the **weekly
  orchestrator's ingest path**, so the recent months (exactly the window Pulse needs) are date-NULL.
- `openalex_pipeline.py` enrichment fetches the OpenAlex work payload but **does not extract
  `publication_date`** — so enrichment doesn't repair it either.
- `ingest_publications.py` *does* populate `pub_date` via `parse_pub_date` (month-precision) — proof
  the date is parseable from the source we already hit.
- Net: `pub_date` is **recoverable**, not lost. Two upstream sources carry it.

### 1.2 Source priority

For each pub with `pub_date IS NULL`:

1. **OpenAlex `publication_date`** (full YYYY-MM-DD, most precise) — available for pubs with a DOI that
   were OpenAlex-enriched. This is the preferred source.
2. **PubMed `PubDate`** via `parse_pub_date` (month-precision) — fallback for pubs without a DOI /
   without an OpenAlex match, keyed by `pubmed_id`.
3. If neither resolves, leave NULL and count it (a pub with no recoverable date is excluded from the
   momentum series; report the residual).

### 1.3 One-pass backfill job (new utility)

- Scope: `SELECT id, pubmed_id, doi FROM publications_v2 WHERE pub_date IS NULL` (the ~17K).
- For DOI-bearing rows: batch-fetch OpenAlex works (reuse the batch fetch already in
  `openalex_pipeline.py`), read `work_payload["publication_date"]`, write `pub_date`.
- For the remainder: batch EFetch from PubMed by `pubmed_id`, reuse `parse_pub_date`.
- Write policy: **update only where `pub_date IS NULL`** (never overwrite an existing date). Chunked,
  idempotent, resumable (checkpoint by id range), rate-limited to the same polite limits the existing
  OpenAlex/PubMed clients use.
- Output: a summary row — resolved-via-openalex / resolved-via-pubmed / still-null counts.
- Run once, offline (NOT while a reingest cycle is active).

### 1.4 Forward fix (so it never regresses)

Two independent guards (belt-and-suspenders):

- **`pubmed_pipeline`**: it already parses the article XML for `pub_year`; extract `pub_date` from the
  same XML (reuse the `parse_pub_date` logic) and put it in `_publication_v2_row` instead of `None`.
  This is the primary fix — new pubs get a date at ingest.
- **`openalex_pipeline`** enrichment: add `publication_date` to `extract_publication_fields` and write
  it **insert-only where NULL** (same created-by discipline already used for `ingestion_run_id`), so
  enrichment fills any date a PubMed-only ingest missed, without clobbering.

### 1.5 Pre-flight empirical checks (run before building, offline)

- `count(*) FILTER (WHERE pub_date IS NULL)` overall and `... AND pub_year >= 2026` — sizes the recent
  gap and the job.
- `openalex_concepts` non-null rate over the TA's pubs — sizes labeler coverage (see §2). (User reports
  98.5% on NSCLC — confirm per TA before extending.)

---

## 2. pub→theme labeler

### 2.1 What's missing and the approach

There is **no durable pub→theme link** today. We build one by classifying each publication to canonical
theme(s) using durable, per-pub features, mirroring the **proven concept-overlap scoring already in
`ta_tagging_rebuild_v2.score_pub_row`** (it sums a pub's `openalex_concepts` `{id, score}` against a
curated concept-id set per TA, threshold `CONCEPT_SCORE_THRESHOLD = 0.4`). We reuse that exact shape,
but the "curated set" becomes a **per-canonical-theme concept signature**.

**Signal priority per pub:**

1. **Concept-id overlap (primary).** `openalex_concepts` (98.5% NSCLC coverage). Score a pub against a
   theme = sum of the pub's concept scores (≥0.4) whose concept-id is in that theme's signature.
2. **MeSH mapping (secondary).** `mesh_terms` matched against a per-theme MeSH set — additive signal,
   and the fallback for the ~1.5% of pubs lacking `openalex_concepts`.
3. **Title keyword (tertiary, cheap).** Canonical-theme name/synonym match in `title` — weak tie-break
   and coverage for concept-less pubs.
4. **LLM tie-break (only for low-confidence / ambiguous).** For pubs where the top-1 and top-2 theme
   scores are within a margin, or all scores are below a floor, send `title` (+ `abstract` when present)
   + the candidate canonical names/descriptions to Claude (reuse `extract_research_themes.py`'s client,
   model `claude-sonnet-4-6`) for a single best-theme pick. This is a **small minority** of pubs — the
   concept path resolves the bulk cheaply; the LLM is the escalation, not the default.

### 2.2 The missing input: per-canonical-theme concept signatures

`theme_canonical_v1` has `canonical_name`, `description`, `therapeutic_area` — but **no concept-id set**.
We derive a signature per canonical theme (one-time, then refreshed):

- **Data-driven (primary):** for each canonical theme, gather the pubs already associated with its member
  raw themes (via `theme_to_canonical_v1` → `hcp_research_themes_v2.example_pmids`, and/or the raw
  theme's HCPs' TA pubs), and take the **most frequent high-score `openalex_concepts`** across those
  pubs as the theme's concept signature (with a min-support cutoff). This bootstraps signatures from the
  themes the LLM already produced.
- **LLM-assisted (augment):** optionally ask Claude to map each canonical theme's name+description to a
  short list of OpenAlex concept names / MeSH descriptors, resolved to ids. Useful for thin themes with
  few example pubs.
- Persist signatures in a small side table `theme_concept_signature_v1` (canonical_id, concept_id,
  weight, source) so the labeler is a pure lookup and signatures are auditable/tunable.

Open decision to confirm at review: **unit of momentum = canonical themes (~20–25/TA, stable)**, not raw
free-text theme names (noisier). Recommend canonical. The mockup's "42 themes" is raw-granularity; if we
want ~42 we widen the canonical set, but stability argues for canonical.

### 2.3 Output schema — `publication_theme_v1` (proposed, not a migration)

| column | type | notes |
|---|---|---|
| `publication_id` | uuid | FK → `publications_v2(id)`, ON DELETE CASCADE |
| `canonical_id` | uuid | FK → `theme_canonical_v1(id)` |
| `therapeutic_area` | text | denormalized TA tag (matches theme tables' TEXT keying; see §2.6) |
| `score` | real | summed concept(+mesh) match score |
| `confidence` | text | `high` / `medium` / `low` (see §2.4) |
| `method` | text | `concept` / `mesh` / `title` / `llm_tiebreak` — provenance of the assignment |
| `is_primary` | boolean | true for the top-scoring theme of the pub (argmax); a pub may map to >1 theme but has exactly one primary |
| `labeled_at` | timestamptz | run wall-clock |
| `labeler_run_id` | uuid | one per labeler invocation |

- **Primary key:** `(publication_id, canonical_id)`.
- **Indexes:** `(canonical_id)`, `(therapeutic_area, canonical_id)`, `(publication_id)`, and a partial
  index on `is_primary` for the momentum aggregation.
- **Grants/RLS:** public-read RLS like the other theme tables; if ever rebuilt via DROP+CREATE, restore
  `GRANT SELECT ... TO service_role` (the `author_pub_flat` lesson). Prefer upsert-in-place over rebuild
  so grants/indexes persist.
- A pub maps to **1..N** themes (multi-label), but momentum counts use `is_primary` to avoid
  double-counting; the multi-label rows remain for source-composition / drill-down.

### 2.4 Confidence scoring

- `high`: top theme's `score` ≥ a high floor AND margin over the 2nd theme ≥ a separation threshold.
- `medium`: above the floor but ambiguous margin (these are candidates for the LLM tie-break, which
  then upgrades/relabels and sets `method='llm_tiebreak'`).
- `low`: only title/mesh signal, or below floor — retained but flagged; excluded from momentum by
  default (configurable), surfaced in QA.
- Thresholds live in config, tuned against a labeled sample (reuse the ta_tagging both-modes validation
  discipline — spot-check the primary assignment for a sample per TA before trusting counts).

### 2.5 Retroactive vs incremental execution

- **Retroactive (one-time seed):** run the labeler over the **entire TA corpus** (`publications_v2` ⋈
  `publication_therapeutic_areas_v2`), producing `publication_theme_v1` for all historical pubs. This is
  what makes the 6-month curve real. Chunked, resumable, offline. Cost is dominated by the LLM tie-break
  minority; the concept path is pure DB/compute.
- **Incremental (per cycle):** label only **this cycle's batch pubs** — the authoritative
  `primary_pmids.txt` → `batch_pubs.txt` set the orchestrator already computes — resolved to
  `publication_id`s. Upsert into `publication_theme_v1`. This is the same batch-scoping pattern used by
  compute_affected / authorship stages.

### 2.6 Keying inconsistency to resolve (flag)

`theme_canonical_v1` / `hcp_research_themes_v2` key TA as **`therapeutic_area` TEXT** ('NSCLC'), while
`publication_therapeutic_areas_v2` keys by **`therapeutic_area_id` UUID**. The labeler joins pubs→TA via
the UUID table but writes the TEXT tag to stay consistent with the theme tables. Design decision:
maintain a single TA slug↔id↔text resolver (already implicit in `reingest_cycle.resolve_ta_id` +
`therapeutic_areas.name/slug`) and store both `therapeutic_area` (text) and, preferably, a
`therapeutic_area_id` (uuid) on `publication_theme_v1` to avoid text-join fragility. Recommend adding the
uuid column even though the older theme tables lack it.

---

## 3. `theme_momentum_snapshot`

### 3.1 Table schema — `theme_momentum_snapshot_v1` (proposed, not a migration)

Grain: **one row per (canonical theme × TA × period)**. Period = calendar month (primary).

| column | type | notes |
|---|---|---|
| `canonical_id` | uuid | FK → `theme_canonical_v1(id)` |
| `therapeutic_area_id` | uuid | TA (uuid; keep the text tag too if needed for joins) |
| `period_type` | text | `month` (primary); reserve `week` for forward-only precise data |
| `period_start` | date | first day of the month (or ISO week start) |
| `pub_count` | int | primary pubs (`is_primary`) attributed to the theme with `pub_date` in the period |
| `pub_count_all` | int | all attributions (multi-label) — for source-composition denominators |
| `rising_star_pub_count` | int | of `pub_count`, those authored by a current rising-star HCP (join `publication_authors_v2` → `hcp_rising_star_ranks_v3`) — powers "Emerging Voices" |
| `new_trial_count` | int | trials (`clinical_trials_v2.start_date` in period) attributed to the theme (needs the trial→theme link; see §3.5) |
| `concept_share` | real | this theme's share of TA attention in the period (pub_count / TA total) — powers Consensus Snapshot |
| `computed_at` | timestamptz | when this row was (re)computed |
| `source` | text | `backfill` vs `cycle` (provenance of the row) |

- **Primary key:** `(canonical_id, therapeutic_area_id, period_type, period_start)`.
- **Indexes:** `(therapeutic_area_id, period_start)` for card range scans; `(canonical_id, period_start)`
  for a single theme's curve.
- Upsert-in-place (never rebuild) so history and grants persist; public-read RLS.

### 3.2 Seeding (last ~6 months, from backfilled dates)

After §1 (dates) and §2 (labels) exist:

- For each month in the seed window (recommend last **12 months** so a 6-month curve has a full
  trailing baseline), aggregate `publication_theme_v1` (`is_primary`) joined to `publications_v2.pub_date`
  bucketed to month, per TA, per canonical theme → `pub_count`, `concept_share`, `rising_star_pub_count`,
  `new_trial_count`. Write rows with `source='backfill'`.
- This is a single offline aggregation pass; the momentum series exists immediately, no waiting.

### 3.3 Forward maintenance (per cycle)

Each weekly cycle, after the incremental labeler (§2.5) has labeled the batch pubs:

- Recompute (upsert) the **current month's** row per affected theme (a month is re-derived until it
  closes, since new pubs land mid-month). Only touched themes/months need recompute — scope by the
  batch's themes.
- `source='cycle'`. Idempotent upsert on the PK.

### 3.4 How the Pulse cards query it

- **Rising Themes ↑/↓% (card 2):** for a TA, take each theme's latest closed month `pub_count` vs its
  trailing-3-month average → `pct = (latest - baseline) / baseline`. Rank desc; negative = declining
  themes (same query, negative sign). "vs baseline" copy must read "vs 3-mo baseline" for historical.
- **6-month curve (card 7 detail):** select a single `canonical_id`'s last 6 `period_start` rows
  ordered by date → the sparkline / area chart, indexed to the first month = 100.
- **Consensus Snapshot topic-share (card 5):** latest month's `concept_share` per theme for the TA →
  treemap. (Pure aggregation; no history needed — this card can ship from `publication_theme_v1`
  directly even before the snapshot table exists.)
- **Emerging Voices (card 3):** latest month's `rising_star_pub_count` for the theme; the "+N" delta =
  vs prior month.
- **What Changed (card 6):** "theme entered top-5" = a theme's rank (by `pub_count`) crossing into top-5
  between consecutive months — derived from the snapshot; "new trial" from `new_trial_count`.

### 3.5 Trial→theme dependency (note)

`new_trial_count` needs a trial→canonical-theme link, which does not exist (`clinical_trials_v2` is
TA-linked only). Design a parallel, smaller `trial_theme_v1` labeler reusing the same signature approach
over `conditions` / `interventions` text, OR ship the snapshot with `new_trial_count` NULL/omitted in v1
and add it in a follow-up. Recommend: omit trials from the first snapshot; add `trial_theme_v1` next.

---

## 4. Build order + wiring into `reingest_cycle.py`

Everything below reuses existing orchestrator conventions: subprocess stages via `run_stage`
(fail-fast, completion-marker), SQL via `run_sql.py` (`--param`, `--statement-timeout`), batch scoping
via `primary_pmids.txt`/`batch_pubs.txt`, `service_role` grants + index recreation on any rebuilt
table, and the quiet-week gate short-circuiting before billed work.

### Phase 0 — dates (one-time + forward fix). No new cycle stage yet.

1. Offline **`pub_date` backfill** utility (§1.3) — run once, not during an active cycle.
2. Forward fix in **`pubmed_pipeline`** (parse `pub_date` at ingest) and **`openalex_pipeline`**
   (insert-only `publication_date`) — §1.4. These are edits to existing stage-1/1b scripts; no new
   stage. Verify with the standard verify skill before a real cycle.

### Phase 1 — canonical concept signatures (one-time). No cycle stage.

3. Build `theme_concept_signature_v1` (§2.2), offline, from existing theme data. Refresh only when
   `theme_canonical_v1` changes (rare).

### Phase 2 — pub→theme labeler.

4. **Retroactive seed** (§2.5) — offline one-pass over the corpus → `publication_theme_v1`.
5. **New cycle stage** — insert a labeler stage that runs on the batch pubs. Natural position:
   **after stage 6 (authorship) / before/near stage 8 (career)**, because it only needs the batch pubs
   labeled and their concepts (which exist post-enrich at stage 1b). It does NOT depend on
   ta_tagging/dedup. Concretely: a new stage (e.g. "6b label_pub_themes") consuming `batch_pubs.txt`,
   mirroring the `cmd_authorship` pattern. Fail-fast; recorded in the completion marker.

### Phase 3 — momentum snapshot.

6. **Seed** `theme_momentum_snapshot_v1` (§3.2) — offline aggregation over the labeled corpus, once.
7. **New cycle stage** — insert a snapshot-refresh stage **after the labeler stage and after stage 8
   (career/cohort)** so `rising_star_pub_count` sees fresh cohorts. It reads `publication_theme_v1` +
   `publications_v2.pub_date` + rising-star ranks, upserts the current month's rows. Implement as a
   `run_sql.py --file` SQL aggregation (like the inventory upsert) or a small script; TA-scoped via the
   cycle's `--ta`. Runs late in the cycle, unbilled.

### Resulting cycle shape (additions marked ►)

```
1  ingest            (+ pub_date forward fix)
1b openalex enrich   (+ publication_date insert-only)
1c flatten · 1d inventory
2  create_hcps · 3 affected · 4 ta_tagging · 5 step_f · 6 authorship
► 6b label_pub_themes        (batch pubs → publication_theme_v1)   [new]
7  dedup
8  career (8a–8d incl. cohort)
► 8e refresh_theme_momentum  (upsert current month for touched themes) [new]
9  score
```

### Sequencing rationale

- Dates (Phase 0) must precede everything — no time axis otherwise.
- Signatures (Phase 1) precede the labeler.
- The labeler seed (Phase 2.4) and the snapshot seed (Phase 3.6) are **one-time offline** jobs that make
  Pulse launch with real history; the two new cycle stages then keep it current.
- Trials (§3.5) and the TA-level LLM synthesis are explicitly deferred.

## Open decisions for review

1. Momentum unit: **canonical themes** (recommend) vs raw theme names (~42, noisier).
2. Period grain: **month** primary (recommend, given month-precision dates) — accept that "↑% vs
   baseline" is month-over-3-month for historical data and label it honestly.
3. Multi-label vs single-label counting: use `is_primary` for momentum, keep multi-label for
   source-composition. Confirm.
4. LLM tie-break budget: acceptable to spend Claude calls on the ambiguous minority during the
   retroactive seed? (One-time cost.)
5. Trials in v1 snapshot: omit `new_trial_count` initially (recommend) vs build `trial_theme_v1` now.
6. Add `therapeutic_area_id` (uuid) to the new theme tables to fix the TEXT-vs-UUID TA keying
   inconsistency (recommend yes).

## Guardrails (carried from prior fixes)

- Any table built via DROP+CREATE must re-`GRANT SELECT ... TO service_role` and recreate its indexes in
  the same SQL (the `author_pub_flat` incident). Prefer upsert-in-place for all three new tables.
- New SQL run via `run_sql.py` with `--statement-timeout`; bound params via `--param` (double any
  literal `%` in the SQL).
- New cycle stages inherit `run_stage` (fail-fast, `stdin=DEVNULL`, completion-marker) — no interactive
  prompts.
- Do NOT run the backfill or seeds while a reingest cycle is active against the DB.
