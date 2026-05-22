# Morning Launch Sequence Runbook

**Date:** 2026-05-22
**Branch:** foundation-rebuild
**Context:** OpenAlex enrichment completes overnight. This runbook executes the foundation-rebuild launch sequence the morning after, beginning with `inventory_openalex_authors.py` and proceeding through Step C, career enrichment, and the dependent script chain.

Every step has a verification block. Do not skip verifications. Trust SQL output over script summary lines (per the openalex_pipeline.py silent-update issue documented in day_2_launch).

---

## Pre-flight

### A. Confirm enrichment complete

```sql
SELECT
  COUNT(*) FILTER (WHERE doi IS NOT NULL AND openalex_enriched_at IS NULL) AS still_unenriched,
  COUNT(*) FILTER (WHERE openalex_enriched_at IS NOT NULL) AS enriched
FROM publications_v2;
```

Expected: `still_unenriched` ≤ ~5000 (OpenAlex "not found" tier), `enriched` ≥ ~380000.

If `still_unenriched` is higher than ~5000, resume enrichment before proceeding:

```powershell
cd C:\Users\garre\Desktop\FieldMark
python openalex_pipeline.py --target-version v2 --skip-career-enrichment
```

### B. Confirm git is clean and pushed

```powershell
cd C:\Users\garre\Desktop\FieldMark
git status
git log --oneline -10
```

Expected: clean working tree, last 10 commits visible.

### C. Confirm v2 schema is at expected state

```sql
SELECT COUNT(*) AS v2_tables
FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE '%_v2';
```

Expected: 17. If different, investigate before proceeding.

---

## Step 1: Inventory OpenAlex Authors

**Purpose:** Build `openalex_author_inventory` from `publications_v2.authorships`. Required input for Step C clustering.

### Command

```powershell
cd C:\Users\garre\Desktop\FieldMark
python inventory_openalex_authors.py --target-version v2 --truncate
```

Estimated runtime: ~30 minutes.

### Verification

```sql
SELECT
  COUNT(*) AS total_inventory_authors,
  COUNT(*) FILTER (WHERE corpus_pub_count >= 5) AS five_plus_pubs,
  COUNT(*) FILTER (WHERE corpus_pub_count >= 10) AS ten_plus_pubs,
  MAX(corpus_pub_count) AS max_pubs
FROM openalex_author_inventory;
```

Expected: hundreds of thousands of inventory rows. If under 10K, the inventory didn't load enough. If `five_plus_pubs` is 0, the corpus is too thin. Investigate either condition.

```sql
SELECT * FROM openalex_author_inventory
ORDER BY corpus_pub_count DESC LIMIT 10;
```

Eyeball top inventory authors. Display names should be real-looking, ROR IDs valid, pub counts plausible.

---

## Step 2: Step C Dry-Run

**Purpose:** Preview HCP creation from clusters without writing. Validates that `build_hcp_insert_row` and `build_join_rows` produce sensible v2 payloads.

### Command

```powershell
python run_step_c_create_hcps.py --target-version v2 --dry-run --limit 100
```

Estimated runtime: ~2 minutes for 100 clusters.

### Verification

Look at the CSV output (path printed by the script). For each row, eyeball:

- `openalex_author_id` populated (from primary join row)
- `institution` populated (from `institution_normalized` in v2)
- `first_pub_year` populated (from `career_first_pub_year` in v2)
- Cluster sizes look reasonable (1-5 typical, occasional 10+)
- Primary author selection makes sense (highest corpus_pub_count)
- Country detection succeeds for known-US institutions

If any v2 columns show empty across all rows: CSV display fix didn't take. Stop, investigate.

If cluster sizes look wrong (mass of 1-row clusters, or pervasive 50+ row clusters): inventory or matching logic issue. Stop, investigate.

---

## Step 3: Step C Real Run

### Pre-check

```sql
SELECT COUNT(*) AS hcps_v2_count FROM hcps_v2;
```

Expected: 0 (fresh v2 build) or known existing count. If unexpected non-zero, decide whether to truncate or skip Step C.

### Command

```powershell
python run_step_c_create_hcps.py --target-version v2
```

Estimated runtime: 1-2 hours. Watch for batch progress.

### Verification

```sql
SELECT
  COUNT(*) AS total_hcps,
  COUNT(*) FILTER (WHERE country = 'USA') AS us_hcps,
  COUNT(*) FILTER (WHERE institution_normalized IS NOT NULL) AS has_institution,
  COUNT(*) FILTER (WHERE total_career_pubs IS NOT NULL) AS has_pub_count,
  COUNT(*) FILTER (WHERE career_first_pub_year IS NOT NULL) AS has_first_year
FROM hcps_v2;
```

Expected: total_hcps in tens of thousands. has_institution near total. has_pub_count near total. has_first_year near total.

```sql
SELECT
  COUNT(*) AS join_rows,
  COUNT(DISTINCT hcp_id) AS distinct_hcps,
  COUNT(*) FILTER (WHERE is_primary = true) AS primary_rows,
  AVG(match_confidence) AS avg_confidence
FROM hcp_openalex_authors_v2;
```

Expected: join_rows ≥ total_hcps. distinct_hcps = total_hcps. primary_rows = total_hcps. avg_confidence near 0.9.

```sql
SELECT first_name, last_name, institution_normalized, total_career_pubs, career_first_pub_year
FROM hcps_v2
ORDER BY total_career_pubs DESC NULLS LAST
LIMIT 20;
```

Eyeball top 20 by career pubs. If you see "Wei Wang" with 50K pubs, that's the Chinese name conflation bug — Kai Wang fix didn't hold. Stop, investigate.

---

## Step 4: Career Enrichment

**Purpose:** Update HCPs with multi-shard career data from OpenAlex authors.

### Command

```powershell
python career_enrichment_from_clusters.py --target-version v2
```

Estimated runtime: ~6 hours. Can run in background.

### Mid-run check (after 1 hour)

```sql
SELECT
  COUNT(*) FILTER (WHERE total_career_pubs > 0) AS has_pubs,
  AVG(total_career_pubs) AS avg_pubs,
  MAX(total_career_pubs) AS max_pubs,
  MIN(career_first_pub_year) AS earliest_year,
  MAX(career_first_pub_year) AS latest_year
FROM hcps_v2;
```

Expected: avg_pubs in dozens to hundreds. max_pubs plausibly in the thousands for established researchers. earliest_year ≥ 1950, latest_year ≤ current year.

### Final verification (when complete)

Same query as mid-run, plus:

```sql
SELECT
  career_first_pub_year,
  COUNT(*) AS hcp_count
FROM hcps_v2
WHERE career_first_pub_year IS NOT NULL
GROUP BY career_first_pub_year
ORDER BY career_first_pub_year DESC
LIMIT 15;
```

Eyeball year distribution. Years 2024, 2023, 2022 should have lower counts than 2010-2020. If 2025-2026 dominates, career enrichment did not properly update — that would mean the v1 ingestion-date artifact bug is back.

---

## Downstream Sequence

After Step 4 completes, the v2 HCP table is populated with publications, OpenAlex linkages, and career data. Default order for downstream scripts:

1. **trials_pipeline.py** — populates `clinical_trials_v2` + `trial_investigators_v2`
2. **scoring_pipeline.py** — produces `hcp_scores_v2` (depends on trials for trial_investigator_score component)
3. **nppes_workstream_b_ingest.py** — adds community HCPs
4. **nppes_enrichment.py** then **nppes_api_backfill.py** then **targeted_nppes_enrichment.py** — enriches NPPES data
5. **open_payments_aggregator.py** — produces payments summaries
6. **generate_narratives_v2.py** — produces narratives (depends on scoring)
7. **trial_investigator_matcher.py** — produces match proposals (review-only, does not write to production)

DOL deferred to Day 5-6 per scope lock. Schema migration and script patches for `social_users_v2`, `social_posts_v2`, `dol_matches_v2` deferred to that phase.

---

## Critical reminders

- **Don't trust openalex_pipeline.py summary lines.** Verify via SQL.
- **Verify `git status` is clean before each script run.** This makes it explicit what code is running.
- **Integrity defenses in place:** Kai Wang ROR-anchored matching in `preview_step_b_matching.py`, identity_hash made nullable so Step C doesn't invent placeholders, generated columns for matcher case-insensitive lookups, FK + UNIQUE constraints on all v2 aggregation tables.
- **Don't run NPPES enrichment scripts before scoring.** They share helpers but write to different tables. Out-of-order runs may overwrite v2 data with stale inputs.
- **trial_investigator_matcher writes proposals only.** No production writes. Review proposals before deciding to apply.
- **Step B (`run_step_b_matching.py`) and Step B+ (`run_step_b_plus_reconcile.py`) can run after Step C completes.** They populate join rows for HCPs that already exist. Patched for v2 routing but not yet exercised against real v2 data.

---

## Deferred items (revisit later in v2 rebuild)

- **pipeline_runs integration for scoring_run_id.** scoring_pipeline.py currently writes a fresh UUID per run; doesn't insert a parent pipeline_runs row. Acceptable for now.
- **v2 canonical_hcps_snapshot.** Step B `--canonicals-only` path reads the v1 canonical snapshot. Decide if v2 needs its own.
- **Step B+ wipe_candidates_audit read.** Script reads v1 audit table that won't have v2 data. Will likely return zero rescue candidates in v2. May not block demo.
- **openalex_pipeline.py silent-update fix.** Cursor prompt drafted to add `response.data` check after `.update()`. Apply before next enrichment run.
- **DOL Day 5-6 scope.** Migrate `social_users` (809), `social_posts` (1526), `dol_matches` (66) to v2; patch capture/cleanup/matching scripts; frontend cutover. Build `bluesky_capture.py` from the outline (substantial work, not just routing). Decide fate of `social_cleanup_stage1/2.py` (read v1 hcps columns that don't exist in v2).
