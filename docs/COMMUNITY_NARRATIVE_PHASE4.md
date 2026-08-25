# Community narrative generation is dead — Phase 4 record

**Status as of 2026-08-20: no community narrative can be generated, for any HCP,
in any TA.** A run selects its HCPs, passes the cohort cross-check, reports
`Filtered to N HCP×TA membership pairs`, then reports `Built 0 HCP×TA contexts`
and writes nothing. The two obvious one-line fixes both fail. This file records
why, what was verified against live, and what Phase 4 has to do.

Every figure below was checked against the live database on 2026-08-20 unless
marked otherwise.

---

## 1. The immediate cause: a missing config key

`COHORT_SCORE_CONFIG["community"]` lost its `score_fields` key in **`122ac3f`**
(Phase 2, 2026-08-11, *"kill community composite"*). The context loop in
`load_hcp_contexts()` gates on the **presence** of that key, not on anything in
it — `generate_narratives_v2.py:1433`:

```python
    for cohort, cohort_scores in scores_by_cohort.items():
        if cohort == "established":
            continue
        config = COHORT_SCORE_CONFIG[cohort]
        if "score_fields" not in config:
            continue          # <-- community exits here, every time
```

The same guard appears at `:1415` for the percentile-distribution pass. Rising
and established are unaffected: they are appended by separate blocks (`:1487`,
`:1520`) that never consult `score_fields`.

`composite_score` being NULL is **not** the exclusion condition. The guard never
reads a value. Community would build zero contexts with every score column full.

## 2. Restoring the key verbatim FAILS at runtime

The obvious fix — restore the dict as `122ac3f` removed it — does not work. The
four columns it maps **do not exist in the live table**:

```python
        "score_fields": {
            "pharma_engagement": "pharma_engagement_score",
            "engagement_breadth": "engagement_breadth_score",
            "medicare_volume": "medicare_volume_score",
            "career_stage": "career_stage_score",
        },
```

Restoring it puts all four into `scores_select` at `:1369-1371`, and PostgREST
returns **42703 (`undefined_column`)**. The run dies at score loading, before
context assembly — a worse failure than the silent zero it replaces.

**This was attempted and reverted on 2026-08-20. Do not re-attempt it.**

## 3. `sql/schema_full.sql` IS STALE FOR THIS TABLE — do not trust it

The dump lists all four `*_score` columns at `sql/schema_full.sql:6334-6337`,
which is what made the verbatim restore look safe. It is wrong, and it has
drifted **in both directions**:

| | Columns |
|---|---|
| In the dump, **absent** from live | `pharma_engagement_score`, `engagement_breadth_score`, `medicare_volume_score`, `career_stage_score` |
| In live, **absent** from the dump | `nsclc_spend_3yr`, `nsclc_volume_2023_est`, `spend_signal`, `volume_signal` |

Verify columns against `information_schema.columns`, not against the dump. This
is a general warning, not a `hcp_community_scores_v2` one: if this table drifted
in both directions, others may have too, and the dump gives no signal that it is
behind.

## 4. What the live table actually carries

`hcp_community_scores_v2`, verified 2026-08-20 — **83,078 rows across all TAs,
49,380 of them NSCLC**:

| Column | Non-null (all TAs) |
|---|---|
| `composite_score` | **0** |
| `normalized_score` | **0** |
| `patient_volume` | 83,078 |
| `pharma_engagement` | populated |
| `group_practice_signal` | populated |
| `career_years` | populated |
| `publication_signal` | populated |
| `nsclc_spend_3yr` | 6,433 |
| `nsclc_volume_2023_est` | 6,433 |
| `spend_signal` | 6,433 |
| `volume_signal` | 6,433 |

Also present: `patient_volume_signal`, `pharma_signal`, `career_years_signal`,
`scored_at`, `scoring_run_id`.

The two NULL columns are **NULL by design, not by neglect**.
`scripts/score/community_scoring.py` writes them as explicit NULLs on every row
(`:434-435`), and says why (`:423-427`): omitting them would let an upsert
preserve stale values, "a frozen column that looks live". Community is not
ranked; there is no composite to restore.

## 5. The prompt is thin even when it runs

`format_hcp_facts_community` (`generate_narratives_v2.py:1791`) reads **none** of
the live quantities above. Three specific defects:

- **It is told to reference facts it is never given.** The prompt instructs
  "Reference practice setting and patient volume" (`:2254`), and
  `patient_volume` — populated on all 83,078 rows — is not selected into
  `scores_select` and not read by the formatter.
- **The `Cohort:` line asserts a ranking that no longer exists**: *"Community
  (top visible board by cohort_score within TA)"*. Community is not ranked;
  selection is `community_ledger`'s tier-then-volume order.
- **`Cohort Score:` reads the wrong table.** It is `ctx.cohort_score`, built from
  `hcps_v2.cohort_score` (`:1474`) — an unmaintained column, **29.3% populated
  (84,791 of 289,454)**. It is *not* `hcp_community_scores_v2.composite_score`,
  which is loaded into `ctx.composite_score` (`:1475`) and never read by the
  community formatter. For most HCPs this line renders `Unknown`.

The four percentile lines are gated on `percentile_data` keys, which the null
columns leave empty. So even a working `score_fields` produces no percentile
line — the fact block is six lines, two of them wrong, plus up to two Open
Payments lines.

## 6. Consequence

The existing community narratives — **3,005 for NSCLC, 5,540 across all TAs**
(hepatology 2,343, rare-disease 168, atopic-dermatitis 24) — were generated from
this already-thin block before the key was removed. Latest community
`generated_at` is **2026-08-07**, four days before `122ac3f`.

They cannot be regenerated, and **any newly-qualifying community HCP renders
with no summary at all**. The ledger and profile show an empty narrative slot
with no way to fill it.

## 7. What Phase 4 has to do

1. **Decouple context construction from `score_fields`.** Either point the key at
   columns that exist, or — better — replace the presence-guard with an explicit
   per-cohort flag, so "can this cohort build a context?" stops being an
   accidental side effect of which percentile columns a cohort happens to map.
2. **Feed the live raw quantities to the formatter**: `patient_volume`,
   `pharma_engagement`, `group_practice_signal`, `career_years`,
   `publication_signal`, and for NSCLC the four `nsclc_*` / `*_signal` columns
   (note their 6,433-row coverage — they are NSCLC-only and must degrade
   cleanly). Add them to `scores_select` and read them in
   `format_hcp_facts_community`.
3. **Fix the two false lines**: drop the `cohort_score` ranking claim from the
   `Cohort:` string, and either remove `Cohort Score:` or repoint it. It reads an
   unmaintained column today.
4. **Bump the prompt version in the same migration.** Any change to what the
   prompt is given is a prompt change. Per `narrative_prompt_versions`'
   own `COMMENT`: *"Bump the row in the same migration that changes the
   prompt."*

   **Community has never bumped and sits at `v1.0`** — the only cohort with a
   single version in the table (established has 3, rising 2). Without a bump the
   regenerated prose is indistinguishable from the 2026-08-07 corpus by
   `prompt_version`, and `narrative_is_current('community', …)` reports both as
   current.

Note also that `upsert_narrative` writes on conflict
`hcp_id,therapeutic_area_slug,cohort` — a regen **overwrites** existing prose in
place. Copy the current corpus out before the first Phase 4 run if it is wanted
for comparison.

## Related

- `docs/DRAWER_COVERAGE_SUBLINES_REMOVED.md` — same class of defect: a figure
  that stopped being computed but kept rendering.
- `scripts/score/community_scoring.py:11-15` — carries a **DO NOT RUN** warning
  about readers still ordering by `normalized_score`. The columns are already
  NULL live, so either that scrub landed or those orderings are already
  degraded. Confirm before running the scorer as part of Phase 4.
