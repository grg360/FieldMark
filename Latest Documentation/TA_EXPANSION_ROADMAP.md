# TA Expansion Roadmap

**Last updated:** 2026-05-20
**Status:** Operational runbook, manual process
**Target reader:** Garrett, or anyone who later joins FieldMark data engineering

---

## Purpose

This document describes how to add a new therapeutic area to FieldMark. It captures the actual scripts, SQL, failure modes, and verification steps based on lessons learned through Hepatology, NSCLC, and Rare Disease launches.

Until the v1.x safeguards backlog items ship, **TA expansion is a manual, multi-step operation**. This document is the runbook for that manual process and the spec for what the automated pipeline should eventually look like.

---

## Current state: honest framing

TA expansion is not yet a one-command operation. Each expansion currently requires:

- ~6-10 hours of operator time across multiple sessions
- Multiple Python scripts run in correct order with manual verification between phases
- Several SQL blocks executed in the Supabase web editor (single-statement, no transactions)
- Spot-checking canonicals at each phase
- ~$1-5 in OpenAlex API costs

The data pipeline architecturally works. The orchestration and safeguards do not yet.

---

## Pre-expansion checklist

Before ingesting any new TA data, verify:

### 1. Taxonomy codes cover the specialty

The NPPES Workstream B ingestion (`nppes_workstream_b_ingest.py`) filters to specific provider taxonomy codes. If the new TA's primary specialty isn't in the filter, HCPs in that TA will only be created via PubMed ingestion (no NPI, no NPPES address, missing scoring inputs).

**Check:** Open `nppes_workstream_b_ingest.py` and confirm the taxonomy code list includes the new TA's specialty. Cross-reference against the NUCC taxonomy at https://taxonomy.nucc.org/.

**If missing:** Add the codes before any ingestion runs.

### 2. PubMed query is defined

The new TA needs a PubMed search query that returns relevant publications. Existing queries live in `pubmed_pipeline.py` (look for the `QUERIES` constant or per-TA config).

**Check:** Confirm the query produces 1,000+ relevant PubMed IDs in a manual test:

```powershell
# Manual test using Entrez API (not the script)
# Replace YOUR_QUERY_HERE with the query
$query = "YOUR_QUERY_HERE"
$url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=$query&retmax=10"
Invoke-WebRequest -Uri $url
```

### 3. Canonical list exists

The `canonical_hcps_snapshot` table should contain known KOLs for the new TA. These are used as ground-truth references throughout the expansion.

**Check:**

```sql
SELECT COUNT(*) FROM canonical_hcps_snapshot WHERE therapeutic_area_slug = 'new-ta-slug';
```

**If empty:** Manually curate 5-15 known canonicals for the TA before proceeding. These should be researchers any domain expert would recognize as established figures in the field.

### 4. Therapeutic area is registered

```sql
SELECT id, slug, name FROM therapeutic_areas WHERE slug = 'new-ta-slug';
```

**If missing:** Insert a row before any HCP-to-TA linkage happens.

### 5. Database backup

Before any meaningful writes:

```sql
-- Backup the tables most likely to be affected
CREATE TABLE hcps_backup_pre_<TA>_<YYYYMMDD> AS SELECT * FROM hcps;
CREATE TABLE hcp_openalex_authors_backup_pre_<TA>_<YYYYMMDD> AS SELECT * FROM hcp_openalex_authors;
CREATE TABLE publication_authors_backup_pre_<TA>_<YYYYMMDD> AS SELECT * FROM publication_authors;
CREATE TABLE hcp_scores_backup_pre_<TA>_<YYYYMMDD> AS SELECT * FROM hcp_scores;
```

Drop these after the expansion is verified healthy.

---

## The 8-phase expansion sequence

Each phase has: what to run, what to verify, what can break.

### Phase 1: PubMed publication ingestion

> **ARCHITECTURE UPDATE (v2):** `pubmed_pipeline.py` now persists **publications only** — it does NOT
> create HCPs. HCP identity is resolved OpenAlex-first, AFTER ingestion (Phase 2 → create_hcps_v2.py).
> The name-UPSERT HCP path described below is removed; the old duplicate-HCP and no-NPI failure modes
> no longer apply at ingest. Follow `docs/TA_BUILD_GUIDE.md` for the current chain.

Pulls publications matching the new TA's PubMed query into `publications_v2` (keyed by pubmed_id), tagging
`source_therapeutic_area_id` + `publication_therapeutic_areas_v2` and storing raw `pubmed_authorships`
(JSONB) for later OpenAlex-driven author resolution. No `hcps_v2` or `hcp_therapeutic_areas_v2` writes.

```powershell
python scripts/ingest/pubmed_pipeline.py --ta new-ta-slug --reset-checkpoint
```

**Verify:**

```sql
-- How many publications were persisted for this TA?
SELECT COUNT(*) FROM publications_v2 p
JOIN publication_therapeutic_areas_v2 pta ON pta.publication_id = p.id
JOIN therapeutic_areas ta ON ta.id = pta.therapeutic_area_id
WHERE ta.slug = 'new-ta-slug';
```

Expected: hundreds-to-thousands of publications. HCP counts come LATER, after create_hcps_v2.py (Phase 2).

### Phase 2: NPPES Workstream B ingestion

Pulls NPPES individual provider records matching the TA's taxonomy codes. Creates HCP rows or updates existing ones with NPI + NPPES fields.

```powershell
python nppes_workstream_b_ingest.py
```

**Verify:**

```sql
SELECT source, COUNT(*) FROM hcps
WHERE created_at >= '<today_date>' OR updated_at >= '<today_date>'
GROUP BY source;
```

Expected: increases in both `publication_ingestion` (from Phase 1) and `nppes_workstream_b`.

**What can break:**

- **Taxonomy filter too narrow.** If the new TA's specialty isn't in the taxonomy code list, no NPPES HCPs get ingested. Validate via the pre-flight checklist.
- **Duplicates with Phase 1.** Some HCPs may exist from PubMed ingestion with same name + institution. The script should handle this via merge logic; verify by checking for unexpected duplicate counts.

### Phase 3: NPI Discovery (for publication-ingested HCPs)

This phase catches HCPs that were created via Phase 1 (PubMed) but have no NPI because their specialty isn't in Phase 2's taxonomy filter. Without this, Sanyal-class canonicals score artificially low in Established cohort.

```powershell
# First, verify candidates exist
# (Run as SQL, not PowerShell)
```

```sql
SELECT COUNT(*) AS candidate_count
FROM hcps
WHERE npi_number IS NULL
  AND openalex_author_id IS NOT NULL
  AND total_career_pubs >= 500
  AND derived_state IS NOT NULL
  AND first_name IS NOT NULL
  AND last_name IS NOT NULL;
```

Then dry-run:

```powershell
# Edit targeted_nppes_enrichment.py main():
#   dry_run = True
#   sample_limit = None
python targeted_nppes_enrichment.py *> nppes_dryrun_<YYYYMMDD>.log
```

Review the log:

```powershell
Get-Content .\nppes_dryrun_<YYYYMMDD>.log -Tail 20
(Select-String -Path .\nppes_dryrun_<YYYYMMDD>.log -Pattern "HIGH_CONFIDENCE").Count
(Select-String -Path .\nppes_dryrun_<YYYYMMDD>.log -Pattern "AMBIGUOUS").Count
(Select-String -Path .\nppes_dryrun_<YYYYMMDD>.log -Pattern "NO_MATCH").Count
```

Spot-check canonical decisions (where Sanyal/Wakelee should show up as `HIGH_CONFIDENCE`):

```powershell
Select-String -Path .\nppes_dryrun_<YYYYMMDD>.log -Pattern "<canonical_last_name>" -Context 1,3
```

If clean, flip to live:

```powershell
# Edit targeted_nppes_enrichment.py main():
#   dry_run = False
python targeted_nppes_enrichment.py *> nppes_live_<YYYYMMDD>.log
```

**What can break:**

- **`nppes_enrichment_log` table doesn't exist.** Live run errors mid-flight. Check first:

  ```sql
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'nppes_enrichment_log');
  ```

  If false, create:

  ```sql
  CREATE TABLE IF NOT EXISTS public.nppes_enrichment_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hcp_id uuid REFERENCES public.hcps(id),
    matched_npi text,
    match_confidence text CHECK (match_confidence IN ('high_confidence', 'ambiguous')),
    match_reason text,
    candidates_considered jsonb,
    enriched_at timestamp DEFAULT NOW(),
    reverted_at timestamp NULL
  );
  ```

- **Wrong-person matches for common names.** The script's verification is strong (first-name exact, last-name exact, taxonomy exclusion, institution disambiguation) but not bulletproof. For common Chinese, Korean, South Asian surnames with no institution_short, false positives possible. Mitigation: spot-check the high_confidence decisions for common names before live run.
- **OpenAlex aggregation.** Some OpenAlex author IDs aggregate multiple real people. The verification logic catches this when institution disambiguates, but for common-name HCPs at institutions sharing the same name as the aggregate, false matches occur. Lives downstream in cohort_score anti-inflation guard (Phase 8).

### Phase 4: NPPES taxonomy backfill

For HCPs that now have an NPI but missing `npi_taxonomy` / `npi_specialty`, fetch from NPPES API.

```powershell
python nppes_api_backfill.py
```

**Verify:**

```sql
SELECT 
  npi_taxonomy_enrichment_status,
  COUNT(*)
FROM hcps
WHERE npi_number IS NOT NULL
GROUP BY npi_taxonomy_enrichment_status;
```

Expected: most are `enriched`, small number `no_data` or `api_error`.

### Phase 5: OpenAlex author linkage (Step B)

Links HCPs to OpenAlex author IDs via ROR-anchored cluster gate. This is where the inflated-cluster bug was fixed on 2026-05-20.

```powershell
python run_step_b_matching.py
```

**Verify:**

```sql
-- Distribution of authors per HCP
SELECT
  CASE 
    WHEN n = 1 THEN '1'
    WHEN n BETWEEN 2 AND 4 THEN '2-4'
    WHEN n BETWEEN 5 AND 9 THEN '5-9'
    WHEN n BETWEEN 10 AND 19 THEN '10-19'
    ELSE '20+'
  END AS author_count_bucket,
  COUNT(*) AS hcp_count
FROM (
  SELECT hcp_id, COUNT(*) AS n
  FROM hcp_openalex_authors
  GROUP BY hcp_id
) t
GROUP BY 1
ORDER BY 1;
```

Expected: 90%+ in the `1` bucket, small tail in `2-4`. Anything in `20+` is a red flag.

**Spot-check canonicals:**

```sql
SELECT hoa.openalex_author_id, oai.display_name, oai.last_known_institution
FROM hcps h
JOIN hcp_openalex_authors hoa ON hoa.hcp_id = h.id
LEFT JOIN openalex_author_inventory oai ON oai.openalex_author_id = hoa.openalex_author_id
WHERE h.id IN (SELECT id FROM canonical_hcps_snapshot WHERE therapeutic_area_slug = 'new-ta-slug');
```

Each canonical should have 1-5 linked authors, all at recognizable institutions.

**What can break:**

- **Common-name aggregation in OpenAlex.** Authors like "Kai Wang" are clustered by OpenAlex's own disambiguation into single author IDs spanning multiple real people. The Step B logic gates by ROR which helps but doesn't fully solve. Downstream guard in Phase 8 catches the rest.
- **Stale rows from prior runs.** The script uses delete-then-insert per HCP (fixed 2026-05-20). If running an older version that uses UPSERT without delete, expect orphan rows.

### Phase 6: Publication-to-HCP attribution (Step F)

Rebuilds `publication_authors` from current `hcp_openalex_authors` linkage.

```powershell
# Dry-run first
python run_step_f_rebuild_publication_authors.py --dry-run

# If clean, live run
python run_step_f_rebuild_publication_authors.py --confirm-wipe
```

**Verify:**

```sql
SELECT match_method, COUNT(*) FROM publication_authors GROUP BY match_method;
SELECT COUNT(*) AS total_rows, COUNT(DISTINCT hcp_id) AS distinct_hcps FROM publication_authors;
```

Expected:
- `step_f_unique_hcp` dominates (90%+ of rows)
- `step_f_misattributed_cluster_disambiguated_by_ror` makes up most of the rest
- Tiny counts for `step_f_misattributed_cluster_disambiguated_by_institution_name` and `step_f_misattributed_cluster_disambiguated_by_country`

**What can break:**

- **The wipe loop short-page bug.** Fixed 2026-05-20 in `wipe_publication_authors_batched`. If running an older version, the wipe stops at 1,000 rows due to PostgREST cap. Verify the fix is present.
- **`orphaned_authorships_audit` table missing.** Not a blocker but loses audit visibility. Optional to create.

### Phase 7: Cohort classification

Assigns each HCP a `cohort_classification` value (`established`, `rising_star`, `community`, or NULL). This SQL currently lives in chat history, not in repo files — **v1.x backlog item**. Until extracted, copy from the most recent expansion session and run as standalone queries.

Sketch (actual SQL is more involved):

```sql
-- Established: 4-path qualification (NCI/COE/AMC affiliation + career_pubs threshold + 
-- engagement breadth + canonical list inclusion)
UPDATE hcps SET cohort_classification = 'established'
WHERE [qualification logic];

-- Rising Star: NPPES taxonomy match for TA + career window + filters
UPDATE hcps SET cohort_classification = 'rising_star'
WHERE [classification logic];

-- Community: US-only NPI providers in the TA's taxonomy with low publication output
UPDATE hcps SET cohort_classification = 'community'
WHERE [community logic];
```

**Verify:**

```sql
SELECT cohort_classification, COUNT(*) FROM hcps
WHERE id IN (
  SELECT hcp_id FROM hcp_therapeutic_areas hta
  JOIN therapeutic_areas ta ON ta.id = hta.therapeutic_area_id
  WHERE ta.slug = 'new-ta-slug'
)
GROUP BY cohort_classification;
```

Expected sizes proportional to NSCLC/Hepatology/Rare Disease baselines.

### Phase 8: Scoring and cohort_score

Runs the Rising Star scoring pipeline, then runs cohort_score SQL blocks for Established, Community, and Rising Star/Dark Horse.

**Rising Star scoring (writes to `hcp_scores`):**

```powershell
# Dry-run first to validate
python scoring_pipeline.py --dry-run

# If output looks right, live run
python scoring_pipeline.py
```

**Cohort score SQL blocks** (each as a standalone single-statement query in Supabase SQL editor):

```sql
-- Block 1: Established with anti-inflation guard
WITH established_metrics AS (
  SELECT 
    h.id,
    -- Anti-inflation guard: when OpenAlex's cached total_career_pubs diverges 
    -- absurdly from in-corpus count (>50x ratio AND >50 absolute), substitute 
    -- 2x the in-corpus count. Catches common-name aggregation (Kai Wang 7206 
    -- vs 1 corpus pub) without affecting real researchers.
    CASE 
      WHEN COALESCE(h.total_career_pubs, 0) > 50
        AND COALESCE(h.total_career_pubs, 0) > 50 * GREATEST(1, (SELECT COUNT(*) FROM publication_authors pa WHERE pa.hcp_id = h.id))
      THEN 2 * (SELECT COUNT(*) FROM publication_authors pa WHERE pa.hcp_id = h.id)
      ELSE COALESCE(h.total_career_pubs, 0)
    END AS career_pubs,
    COALESCE(h.nppes_career_stage_years, 0) AS career_years,
    COALESCE(ops.total_payments_lifetime, 0) AS engagement,
    COALESCE(ops.distinct_companies_lifetime, 0) AS companies
  FROM hcps h
  LEFT JOIN hcp_open_payments_summary ops ON ops.hcp_id = h.id
  WHERE h.cohort_classification = 'established'
),
percentile_ranks AS (
  SELECT 
    id,
    100.0 * PERCENT_RANK() OVER (ORDER BY career_pubs) AS pubs_pct,
    100.0 * PERCENT_RANK() OVER (ORDER BY career_years) AS years_pct,
    100.0 * PERCENT_RANK() OVER (ORDER BY engagement) AS engagement_pct,
    100.0 * PERCENT_RANK() OVER (ORDER BY companies) AS companies_pct
  FROM established_metrics
)
UPDATE hcps h
SET cohort_score = ROUND((
  0.40 * pr.pubs_pct + 0.20 * pr.years_pct + 
  0.25 * pr.engagement_pct + 0.15 * pr.companies_pct
)::numeric, 2)
FROM percentile_ranks pr
WHERE h.id = pr.id;
```

```sql
-- Block 2: Community
WITH community_metrics AS (
  SELECT 
    h.id,
    COALESCE(ops.total_payments_lifetime, 0) AS engagement,
    COALESCE(ops.distinct_companies_lifetime, 0) AS companies,
    COALESCE(ms.total_beneficiaries_3yr_unique_est, 0) AS volume,
    COALESCE(h.nppes_career_stage_years, 0) AS career_years
  FROM hcps h
  LEFT JOIN hcp_open_payments_summary ops ON ops.hcp_id = h.id
  LEFT JOIN hcp_medicare_summary ms ON ms.hcp_id = h.id
  WHERE h.cohort_classification = 'community'
),
percentile_ranks AS (
  SELECT 
    id,
    100.0 * PERCENT_RANK() OVER (ORDER BY engagement) AS engagement_pct,
    100.0 * PERCENT_RANK() OVER (ORDER BY companies) AS companies_pct,
    100.0 * PERCENT_RANK() OVER (ORDER BY volume) AS volume_pct,
    100.0 * PERCENT_RANK() OVER (ORDER BY career_years) AS years_pct
  FROM community_metrics
)
UPDATE hcps h
SET cohort_score = ROUND((
  0.45 * pr.engagement_pct + 0.25 * pr.companies_pct + 
  0.15 * pr.volume_pct + 0.15 * pr.years_pct
)::numeric, 2)
FROM percentile_ranks pr
WHERE h.id = pr.id;
```

```sql
-- Block 3: Rising Star / Dark Horse
UPDATE hcps h
SET cohort_score = (
  SELECT ROUND(MAX(hs.normalized_score)::numeric, 2)
  FROM hcp_scores hs
  WHERE hs.hcp_id = h.id
)
WHERE h.cohort_classification IN ('rising_star', 'dark_horse');
```

**Note:** Workhorse cohort was cut from v1.0 (2026-05-19). If reintroduced, add a fourth block.

### Phase 9: Cache refresh and frontend deploy

```sql
-- Refresh the TA cohort counts cache (used by the TA selection screen)
-- The actual refresh SQL is in chat history; v1.x backlog to extract.
-- Sketch:
TRUNCATE ta_cohort_counts_cache;
INSERT INTO ta_cohort_counts_cache (therapeutic_area_id, total_hcps, rising_stars, dark_horses, community, workhorses)
SELECT 
  ta.id, 
  COUNT(*),
  COUNT(*) FILTER (WHERE h.cohort_classification = 'rising_star'),
  COUNT(*) FILTER (WHERE h.cohort_classification = 'dark_horse'),
  COUNT(*) FILTER (WHERE h.cohort_classification = 'community'),
  COUNT(*) FILTER (WHERE h.cohort_classification = 'workhorse')
FROM therapeutic_areas ta
LEFT JOIN hcp_therapeutic_areas hta ON hta.therapeutic_area_id = ta.id
LEFT JOIN hcps h ON h.id = hta.hcp_id
GROUP BY ta.id;
```

No frontend deploy needed for a TA addition unless the TA selection screen needs UI updates for the new TA. If so:

```powershell
.\quick_commit.ps1 "Add <new TA> to TA selection screen"
```

Cloudflare auto-deploys in 30-60s.

---

## Post-expansion verification

After all 9 phases complete:

### Verify canonical leaderboard

```sql
-- Top 10 Established for the new TA — should be recognizable real KOLs
SELECT 
  h.first_name, h.last_name,
  LEFT(h.institution, 60) AS institution,
  h.total_career_pubs,
  h.cohort_score
FROM hcps h
JOIN hcp_therapeutic_areas hta ON hta.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = hta.therapeutic_area_id
WHERE ta.slug = 'new-ta-slug'
  AND h.cohort_classification = 'established'
  AND h.country = 'USA'
ORDER BY h.cohort_score DESC
LIMIT 10;
```

**Red flags:** common-name HCPs at top (Kai Wang, Hui Wang, Jing Li), HCPs at irrelevant institutions, HCPs in unrelated specialties. If any appear, investigate before declaring done.

### Verify no inflation cases

```sql
-- HCPs whose cached total_career_pubs is wildly disconnected from in-corpus count
SELECT 
  h.first_name, h.last_name,
  LEFT(h.institution, 50) AS institution,
  h.total_career_pubs,
  (SELECT COUNT(*) FROM publication_authors pa WHERE pa.hcp_id = h.id) AS in_corpus,
  h.cohort_score
FROM hcps h
JOIN hcp_therapeutic_areas hta ON hta.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = hta.therapeutic_area_id
WHERE ta.slug = 'new-ta-slug'
  AND h.cohort_classification = 'established'
  AND h.total_career_pubs > 50 * GREATEST(1, (SELECT COUNT(*) FROM publication_authors pa WHERE pa.hcp_id = h.id));
```

Any HCP returning here is being caught by the anti-inflation guard. Verify their cohort_score is appropriately low.

### Visual check on frontend

1. Hard refresh app.besselanalytics.com
2. Navigate to the new TA's Established leaderboard
3. Confirm top 10 looks defensible
4. Open a canonical's detail screen, verify the Score Breakdown displays the 4 Established metrics correctly
5. Spot-check Rising Star leaderboard for the new TA

---

## Known failure modes

Documented from real expansion sessions. Watch for these.

### 1. Common-name aggregation in OpenAlex
**Symptom:** A single HCP record shows `total_career_pubs` in the thousands while `publication_authors` count is in the single digits.
**Cause:** OpenAlex's author disambiguation aggregates multiple real people with the same common name into one OpenAlex author ID.
**Mitigation:** Anti-inflation guard in Phase 8 Block 1 caps `effective career_pubs` at 2x in-corpus count when ratio exceeds 50x. Lives in this doc and in chat history. **v1.x backlog: extract to versioned SQL file.**

### 2. HCPs missing NPI
**Symptom:** Real canonicals (e.g., academic chairs) show NULL `npi_number`, NULL `nppes_career_stage_years`, NULL engagement data. They score artificially low in Established cohort_score.
**Cause:** HCPs are created OpenAlex-first by `create_hcps_v2.py` (Phase 2) without NPIs — pubmed_pipeline.py no longer creates HCPs at all. NPPES Workstream B only catches HCPs whose taxonomy is in its filter; specialties outside the filter never get NPI-matched.
**Mitigation:** Phase 3 (NPI Discovery via `targeted_nppes_enrichment.py`) catches these. Confirm it ran successfully.

### 3. UPSERT-without-delete orphan rows
**Symptom:** After a Step B re-run, an HCP has both new linkage rows AND old stale rows from a previous run.
**Cause:** Older Step B versions used UPSERT on `(hcp_id, openalex_author_id)` which UPDATEs or INSERTs but never DELETEs.
**Mitigation:** Confirm `run_step_b_matching.py` uses delete-then-insert per HCP (fixed 2026-05-20).

### 4. PostgREST wipe loop short-page heuristic
**Symptom:** Step F wipe reports "Delete operations removed up to 1,000 row id(s)" and bails when the table has millions of rows.
**Cause:** PostgREST caps SELECT responses at 1,000 rows. The wipe loop interpreted a short page as end-of-table.
**Mitigation:** Confirm `wipe_publication_authors_batched` exits only when SELECT returns 0 rows (fixed 2026-05-20).

### 5. Supabase SQL editor BEGIN/COMMIT unreliability
**Symptom:** Multi-statement transactional SQL runs partially, leaves database in inconsistent state.
**Cause:** Supabase web SQL editor doesn't reliably honor BEGIN/COMMIT.
**Mitigation:** Run each UPDATE/DELETE/INSERT as a standalone single-statement query.

### 6. `nppes_enrichment_log` table missing
**Symptom:** `targeted_nppes_enrichment.py` live run errors mid-flight on log insert after HCP update succeeded.
**Cause:** Table doesn't exist; script documents the CREATE TABLE statement but doesn't auto-create.
**Mitigation:** Verify table exists in pre-flight checklist. Create if missing.

### 7. `total_career_pubs = 0` hardcoded for NPPES HCPs
**Symptom:** NPPES-ingested HCPs have `total_career_pubs = 0`, then `career_enrichment.py` skips them because it filters for NULL.
**Cause:** `nppes_workstream_b_ingest.py` line ~150 sets `"total_career_pubs": 0` for every new HCP.
**Mitigation:** **v1.x backlog: change hardcoded 0 to NULL.**

### 8. TA tagging via publication co-authorship is noisy
**Symptom:** Researchers from unrelated specialties (e.g., oncologists in Hepatology, materials scientists in NSCLC) appear in TA leaderboards.
**Cause:** `hcp_therapeutic_areas` is populated when an HCP co-authors any TA-tagged paper. Co-authoring once doesn't make someone a TA expert.
**Mitigation:** None currently. **v1.x backlog: tighten TA tagging logic — require N+ TA-tagged papers, or require first/last authorship.**

---

## v1.x safeguards backlog

These workstreams would move TA expansion from manual to substantially automated. Each is a focused half-day to multi-day session.

### a) Extract cohort_score SQL to versioned files

**Scope:** Create `sql/classification/` folder with:
- `01_established_cohort_score.sql` (with anti-inflation guard inline)
- `02_community_cohort_score.sql`
- `03_rising_star_dark_horse_cohort_score.sql`
- `04_ta_cohort_counts_cache_refresh.sql`

Each is the canonical SQL for that operation. Future runs reference the file, not chat history.

**Effort:** ~2 hours. Mostly copy-paste from this document plus testing.

**Why this matters:** Current SQL lives only in chat history and this doc. If either is lost or fragmented, the operational knowledge is gone.

### b) Build weekly refresh pipeline orchestrator

**Scope:** A Python script (`weekly_refresh.py`) that runs in order:
1. PubMed ingestion (new publications only)
2. NPPES re-ingestion (only changed records, if NPPES dataset updated)
3. NPI Discovery for any new HCPs with NULL NPI
4. NPPES taxonomy backfill
5. Step B matching (HCPs with new authors only)
6. Step F rebuild (publications since last refresh only)
7. Cohort classification SQL
8. Scoring pipeline
9. Cohort_score SQL blocks
10. Cache refresh
11. Summary report

Cron-runnable. Idempotent. Logged to a refresh history table for audit.

**Effort:** 2-3 days. Plus ongoing tuning.

**Why this matters:** Today's expansion took 10 hours. Weekly refresh should take 30 minutes unattended.

### c) TA expansion pre-flight script

**Scope:** A Python script (`ta_expansion_preflight.py <ta_slug>`) that runs the checklist programmatically:
1. Confirm taxonomy codes exist in `nppes_workstream_b_ingest.py` for the TA's specialties
2. Confirm `canonical_hcps_snapshot` has 5+ entries for the TA
3. Confirm `therapeutic_areas` has the TA row
4. Confirm PubMed query for the TA returns expected volume
5. Create database backups for affected tables
6. Print go/no-go status

**Effort:** ~1 day.

**Why this matters:** Catches expansion blockers before any data writes.

### d) Tighten `hcp_therapeutic_areas` tagging logic

**Scope:** Replace "tagged if co-author on any TA paper" with stricter criteria:
- Require ≥3 TA-tagged papers, OR
- Require first/last authorship on ≥1 TA-tagged paper, OR
- Require a manual `verified_ta` flag set by domain expert

**Effort:** ~1 day to spec, build, and re-run for existing TAs.

**Why this matters:** Wrong-TA leakage is the most visible scoring artifact remaining. Lenz in Hepatology rankings, Aminah Jatoi as NSCLC #1 — both real today.

### e) NPI Discovery rate limit and resumability

**Scope:** Add to `targeted_nppes_enrichment.py`:
- Resume state file similar to Step F
- Configurable rate limit
- Retry-with-backoff on NPPES API failures
- Pause-resume capability for long runs

**Effort:** ~half-day.

**Why this matters:** Current script runs ~2 hours for 1,694 candidates with no resume. A network blip is restart-from-zero.

### f) Convert `total_career_pubs = 0` to NULL in NPPES ingest

**Scope:** Change `nppes_workstream_b_ingest.py` line ~150 from `"total_career_pubs": 0` to `"total_career_pubs": None`. Then run a one-time SQL to convert existing 0s to NULL for NPPES-source HCPs.

**Effort:** ~1 hour.

**Why this matters:** Career enrichment skips HCPs with NULL `total_career_pubs`. HCPs with 0 get skipped silently and never get their career data populated.

---

## Quick reference: file inventory

| File | Phase | Purpose |
|------|-------|---------|
| `pubmed_pipeline.py` | 1 | PubMed publication ingestion (publications_v2 only; no HCP creation) |
| `nppes_workstream_b_ingest.py` | 2 | NPPES individual provider ingestion (taxonomy-filtered) |
| `targeted_nppes_enrichment.py` | 3 | NPI discovery for publication-ingested HCPs |
| `nppes_api_backfill.py` | 4 | NPPES taxonomy backfill for HCPs with NPI |
| `nppes_enrichment.py` | 4 | NPPES address/org/career_stage enrichment |
| `career_enrichment.py` | 4 | OpenAlex `works_count` and `first_pub_year` backfill (name-only search) |
| `career_enrichment_from_clusters.py` | 4 | Cluster-aware career enrichment (uses hcp_openalex_authors) |
| `preview_step_b_matching.py` | 5 | Step B matching logic preview (used by `run_step_b_matching.py`) |
| `run_step_b_matching.py` | 5 | OpenAlex author linkage (ROR-anchored cluster gate) |
| `run_step_f_rebuild_publication_authors.py` | 6 | Publication-to-HCP attribution rebuild |
| Cohort classification SQL | 7 | Manual SQL blocks (v1.x backlog: extract to files) |
| `scoring_pipeline.py` | 8 | Rising Star composite scoring + per-TA normalization + tier |
| Cohort score SQL blocks | 8 | Per-cohort score calculation (in this doc, also v1.x backlog) |
| `ta_cohort_counts_cache_refresh` SQL | 9 | TA selection screen cache (v1.x backlog) |
| `quick_commit.ps1` | 9 | Frontend git commit + push (Cloudflare auto-deploys) |

---

## Open methodology questions (not blockers)

These are deferred to v1.1+ methodology work:

- **Dark Horse redefinition.** Current implementation is decorative (top X% of Rising Star). Needs distinct methodology — possibly "hiddenness" signal: low pharma engagement + rising publication velocity.
- **Workhorse cohort.** Cut from v1.0 (2026-05-19). Reintroduction requires per-TA practice volume normalization with broader criteria.
- **Rising Star scoring weight calibration.** Current weights produce trial-heavy ranking artifacts (e.g., Li Zhang ranked top by trial-only signal). Needs investigation.
- **Citation trajectory edge cases.** Requires ≥2 qualifying papers; HCPs with thin publication histories default to 0.
- **Manual canonical override table.** For ~50-100 canonicals where automated NPI matching fails or returns wrong person. Out-of-band corrections without modifying pipeline scripts.

---

*End of TA Expansion Roadmap. Maintain this document during each expansion — append lessons learned, update file inventory, mark completed v1.x backlog items.*
