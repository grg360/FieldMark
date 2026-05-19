# Post-NPPES Backfill SQL Sequence

**Created:** May 18, 2026
**Run after:** `nppes_api_backfill.py` completes (all ~27K HCPs processed)
**Purpose:** Re-classify cohorts using complete NPPES taxonomy data, then refresh cohort scores

---

## Step 0: Verify backfill completion

Before doing anything, confirm the backfill finished and review coverage:

```sql
-- Backfill summary
SELECT 
  COUNT(*) FILTER (WHERE npi_taxonomy_enrichment_status = 'enriched') AS newly_enriched,
  COUNT(*) FILTER (WHERE npi_taxonomy_enrichment_status = 'no_data') AS no_data,
  COUNT(*) FILTER (WHERE npi_taxonomy_enrichment_status = 'api_error') AS api_error,
  COUNT(*) FILTER (WHERE npi_taxonomy_enrichment_status = 'invalid_npi') AS invalid_npi,
  COUNT(*) FILTER (WHERE npi_taxonomy_enrichment_status IS NOT NULL) AS total_processed
FROM hcps;
```

```sql
-- Total taxonomy coverage now
SELECT 
  COUNT(*) FILTER (WHERE npi_number IS NOT NULL) AS has_npi,
  COUNT(*) FILTER (WHERE npi_taxonomy IS NOT NULL) AS has_taxonomy,
  COUNT(*) FILTER (WHERE npi_number IS NOT NULL AND npi_taxonomy IS NULL) AS npi_no_taxonomy,
  ROUND(100.0 * COUNT(*) FILTER (WHERE npi_taxonomy IS NOT NULL) / COUNT(*) FILTER (WHERE npi_number IS NOT NULL), 1) AS taxonomy_coverage_pct
FROM hcps;
```

Expected outcome: 90%+ taxonomy coverage for HCPs with NPI. Some NPIs return 'no_data' from NPPES — those will stay NULL on taxonomy.

If success rate looks healthy, proceed. If api_error count is high, investigate before proceeding.

---

## Step 1: Define taxonomy exclusion list

Identify the taxonomy codes that should be excluded from clinical practitioner cohorts (Community, Workhorse, Rising Star).

### Non-clinical or non-patient-facing taxonomies to exclude

Run this query first to see how many HCPs each excluded taxonomy affects across cohorts:

```sql
SELECT 
  npi_taxonomy,
  npi_specialty,
  cohort_classification,
  COUNT(*) AS count
FROM hcps
WHERE npi_taxonomy IN (
  -- Students / trainees
  '390200000X',  -- Student in an Organized Health Care Education/Training Program
  
  -- Behavior / non-clinical roles
  '106S00000X',  -- Behavior Technician
  '174400000X',  -- Specialist (generic, often non-clinical)
  
  -- Allied health (not MSL targets for HCP cohorts)
  '363A00000X',  -- Physician Assistant
  '363LF0000X',  -- Nurse Practitioner, Family (variable — judgment call)
  '363L00000X',  -- Nurse Practitioner (generic)
  
  -- Pathology (no direct patient contact)
  '207ZP0102X',  -- Pathology, Anatomic Pathology & Clinical Pathology
  '207ZP0101X',  -- Pathology, Anatomic Pathology
  '207ZP0105X',  -- Pathology, Clinical Pathology/Laboratory Medicine
  '207ZC0500X',  -- Pathology, Cytopathology
  '207ZH0000X',  -- Pathology, Hematology
  '207ZD0900X',  -- Pathology, Dermatopathology
  '207ZN0500X',  -- Pathology, Neuropathology
  '207ZF0201X',  -- Pathology, Forensic Pathology
  
  -- Radiology (no direct patient decision-making for most therapeutic areas)
  '2085R0202X',  -- Radiology, Diagnostic Radiology
  '2085R0001X',  -- Radiology, Radiation Oncology (kept? remove from list if RT-relevant)
  '2085R0204X',  -- Radiology, Vascular & Interventional Radiology
  '2085B0100X',  -- Radiology, Body Imaging
  '2085P0229X',  -- Radiology, Pediatric Radiology
  '2085N0700X',  -- Radiology, Neuroradiology
  '2085N0904X',  -- Radiology, Nuclear Radiology
  
  -- Anesthesiology (not typically MSL targets for our TAs)
  '207L00000X',  -- Anesthesiology
  '207LA0401X',  -- Anesthesiology, Addiction Medicine
  '207LC0200X',  -- Anesthesiology, Critical Care
  '207LH0002X',  -- Anesthesiology, Hospice and Palliative Medicine
  '207LP2900X',  -- Anesthesiology, Pain Medicine
  '207LP3000X'   -- Anesthesiology, Pediatric Anesthesiology
)
GROUP BY npi_taxonomy, npi_specialty, cohort_classification
ORDER BY count DESC;
```

**Review the output.** If anything looks wrong, adjust the list before continuing. Specifically:
- `2085R0001X` (Radiation Oncology) may want to KEEP if you care about RT-relevant HCPs in Oncology
- Some Nurse Practitioner subspecialties may be MSL-relevant (NP-Oncology, NP-Hepatology)
- Pediatric specialties may be relevant depending on TA

Adjust the exclusion list above based on what you see, then proceed.

---

## Step 2: Reset existing cohort classifications

Clear current cohort assignments so we can re-classify cleanly:

```sql
-- Backup current state before nuking
CREATE TABLE IF NOT EXISTS hcps_cohort_backup_20260518 AS
SELECT id, cohort_classification, cohort_score 
FROM hcps 
WHERE cohort_classification IS NOT NULL;

-- Verify backup
SELECT COUNT(*) FROM hcps_cohort_backup_20260518;

-- Clear all current classifications
UPDATE hcps 
SET cohort_classification = NULL, 
    cohort_score = NULL
WHERE cohort_classification IS NOT NULL;

-- Verify cleared
SELECT 
  cohort_classification, COUNT(*) 
FROM hcps 
GROUP BY cohort_classification;
```

After this, all `cohort_classification` and `cohort_score` values are NULL. Backup table exists if we need to roll back.

---

## Step 3: Re-apply Established classification (4 paths)

The Established methodology should run first because it has priority over Rising Star / Community.

> Note: The original 4-path Established SQL was developed across earlier sessions. Re-running it now will pick up any HCPs that were newly enriched via NPPES backfill and might newly qualify. The exact SQL needs to be retrieved from project history — search for "PATH 1" or "established four paths" if needed. The structure was approximately:

```sql
-- Path 1: Top-tier publication volume (career_pubs >= 800)
UPDATE hcps h
SET cohort_classification = 'established'
WHERE h.cohort_classification IS NULL
  AND h.total_career_pubs >= 800
  AND h.derived_state IN (...US states...);

-- Path 2: Sustained career + meaningful volume (career_years >= 15 AND career_pubs >= 200)
UPDATE hcps h
SET cohort_classification = 'established'
WHERE h.cohort_classification IS NULL
  AND h.nppes_career_stage_years >= 15
  AND h.total_career_pubs >= 200
  AND h.derived_state IN (...US states...);

-- Path 3: Pharma engagement total (top-tier Open Payments)
UPDATE hcps h
SET cohort_classification = 'established'
FROM hcp_open_payments_summary ops
WHERE h.id = ops.hcp_id
  AND h.cohort_classification IS NULL
  AND ops.total_payments_lifetime >= 500000  -- threshold from earlier session
  AND ops.distinct_companies_lifetime >= 10
  AND h.derived_state IN (...US states...);

-- Path 4: Combined signals (moderate everything)
-- [specific criteria from earlier session]
```

**Recommended approach:** Run the Established classification SQL from earlier sessions exactly as it was. If you remember the specific paths, use those. Otherwise, the 615 Established HCPs from the previous run are credible (we validated Hepatology and NSCLC), so re-running with the same logic should produce similar results plus any newly-enriched HCPs.

After running:

```sql
-- Verify Established cohort size and credibility
SELECT 
  cohort_classification,
  COUNT(*) AS count
FROM hcps
WHERE cohort_classification IS NOT NULL
GROUP BY cohort_classification;

-- Expected: ~615-650 Established (slight uptick from backfill)
```

---

## Step 4: Re-apply Rising Star classification (REFINED)

This is the major refinement work. New filters added to fix the "researchers, PhDs, advocates appearing as Rising Stars" problem.

```sql
-- Get the non-clinical taxonomy exclusion array ready
-- (using the list from Step 1, adjusted based on review)

UPDATE hcps h
SET cohort_classification = 'rising_star'
WHERE h.cohort_classification IS NULL
  -- Must have NPI (clinical practitioner check)
  AND h.npi_number IS NOT NULL
  -- Must have NPPES enrichment (career stage, taxonomy)
  AND h.nppes_career_stage_years IS NOT NULL
  -- Career stage cap (rising = not senior)
  AND h.nppes_career_stage_years <= 15
  -- Publication count window (meaningful but not established by volume)
  AND COALESCE(h.total_career_pubs, 0) BETWEEN 15 AND 200
  -- Must have institutional affiliation
  AND h.institution_short IS NOT NULL
  -- Taxonomy must be clinical (not student, not pathology, not radiology, etc.)
  AND (
    h.npi_taxonomy IS NULL  -- allow if no taxonomy yet
    OR h.npi_taxonomy NOT IN (
      '390200000X',  -- Student
      '106S00000X',  -- Behavior Tech
      '174400000X',  -- Specialist (generic)
      '363A00000X',  -- PA (judgment call)
      '207ZP0102X',  -- Pathology variants
      '207ZP0101X',
      '207ZP0105X',
      '207ZC0500X',
      '207ZH0000X',
      '207ZD0900X',
      '207ZN0500X',
      '207ZF0201X',
      '2085R0202X',  -- Radiology variants
      '2085R0001X',
      '2085R0204X',
      '2085B0100X',
      '2085P0229X',
      '2085N0700X',
      '2085N0904X',
      '207L00000X',  -- Anesthesiology variants
      '207LA0401X',
      '207LC0200X',
      '207LH0002X',
      '207LP2900X',
      '207LP3000X'
    )
  )
  -- Must have Rising Star tier from scoring pipeline
  AND EXISTS (
    SELECT 1 FROM hcp_scores hs
    WHERE hs.hcp_id = h.id
      AND hs.tier = 'rising_star'
  )
  -- US-based
  AND h.derived_state IN (
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC','PR'
  );

-- Verify size
SELECT 
  cohort_classification,
  COUNT(*) AS count
FROM hcps
WHERE cohort_classification IS NOT NULL
GROUP BY cohort_classification;

-- Expected: ~400-800 Rising Stars (down from 1,945)
-- Big drop because we now require:
--   - NPI present (was: implicit via tier)
--   - NPPES enrichment present
--   - Career stage <= 15 years
--   - Career pubs 15-200
--   - Institution present
--   - Clinical taxonomy (not student/path/rad/anesth)
```

---

## Step 5: Apply Dark Horse subset

Dark Horse is the elite subset of Rising Star. Same logic as before:

```sql
UPDATE hcps h
SET cohort_classification = 'dark_horse'
WHERE h.cohort_classification = 'rising_star'
  AND EXISTS (
    SELECT 1 FROM hcp_scores hs
    WHERE hs.hcp_id = h.id
      AND hs.normalized_score >= 95
      AND (
        hs.pub_velocity_score > 0
        OR hs.trial_investigator_score > 0
      )
  );
```

---

## Step 6: Re-apply Community classification (REFINED)

Community is "real clinical practice + structural disqualification from being Established." Add the same taxonomy filter to exclude pathologists/radiologists/etc.

```sql
UPDATE hcps h
SET cohort_classification = 'community'
WHERE h.cohort_classification IS NULL
  -- Must have NPI
  AND h.npi_number IS NOT NULL
  -- Must NOT be at an AMC/COE (existing logic — institution-based)
  AND (
    h.nppes_practice_setting IN ('hospital_affiliated', 'group_practice', 'solo_practice', 'small_group')
    OR h.nppes_practice_setting IS NULL
  )
  -- Real practice activity: has Open Payments OR Medicare
  AND (
    EXISTS (SELECT 1 FROM hcp_open_payments_summary ops WHERE ops.hcp_id = h.id AND ops.total_payments_lifetime > 0)
    OR EXISTS (SELECT 1 FROM hcp_medicare_summary ms WHERE ms.hcp_id = h.id AND ms.total_beneficiaries_3yr_unique_est > 0)
  )
  -- Taxonomy filter (same as Rising Star)
  AND (
    h.npi_taxonomy IS NULL
    OR h.npi_taxonomy NOT IN (
      '390200000X','106S00000X','174400000X','363A00000X',
      '207ZP0102X','207ZP0101X','207ZP0105X','207ZC0500X','207ZH0000X',
      '207ZD0900X','207ZN0500X','207ZF0201X',
      '2085R0202X','2085R0001X','2085R0204X','2085B0100X',
      '2085P0229X','2085N0700X','2085N0904X',
      '207L00000X','207LA0401X','207LC0200X','207LH0002X',
      '207LP2900X','207LP3000X'
    )
  )
  -- US-based
  AND h.derived_state IN (
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC','PR'
  );
```

---

## Step 7: Apply Workhorse subset (REFINED)

Workhorse = high Medicare volume + low pharma engagement, with taxonomy filter:

```sql
UPDATE hcps h
SET cohort_classification = 'workhorse'
FROM hcp_medicare_summary ms
LEFT JOIN hcp_open_payments_summary ops ON ops.hcp_id = ms.hcp_id
WHERE h.id = ms.hcp_id
  AND h.cohort_classification = 'community'
  AND ms.total_beneficiaries_3yr_unique_est >= 2221  -- top 10% Medicare
  AND (ops.total_payments_lifetime <= 430 OR ops.total_payments_lifetime IS NULL)
  AND (ops.distinct_companies_lifetime <= 2 OR ops.distinct_companies_lifetime IS NULL);
```

---

## Step 8: Compute cohort_score for each cohort

Once classifications are stable, compute scores per cohort. Each cohort uses its own formula.

### Established score (percentile-rank composite)

```sql
WITH established_metrics AS (
  SELECT 
    h.id,
    COALESCE(h.total_career_pubs, 0) AS career_pubs,
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
SET cohort_score = (
  0.40 * pr.pubs_pct +
  0.20 * pr.years_pct +
  0.25 * pr.engagement_pct +
  0.15 * pr.companies_pct
)
FROM percentile_ranks pr
WHERE h.id = pr.id;
```

### Community score (percentile-rank composite — pharma-engagement weighted)

```sql
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
SET cohort_score = (
  0.45 * pr.engagement_pct +
  0.25 * pr.companies_pct +
  0.15 * pr.volume_pct +
  0.15 * pr.years_pct
)
FROM percentile_ranks pr
WHERE h.id = pr.id;
```

### Workhorse score (percentile-rank — volume + career stage only)

```sql
WITH workhorse_metrics AS (
  SELECT 
    h.id,
    COALESCE(ms.total_beneficiaries_3yr_unique_est, 0) AS volume,
    COALESCE(h.nppes_career_stage_years, 0) AS years
  FROM hcps h
  LEFT JOIN hcp_medicare_summary ms ON ms.hcp_id = h.id
  WHERE h.cohort_classification = 'workhorse'
),
percentile_ranks AS (
  SELECT 
    id,
    100.0 * PERCENT_RANK() OVER (ORDER BY volume) AS volume_pct,
    100.0 * PERCENT_RANK() OVER (ORDER BY years) AS years_pct
  FROM workhorse_metrics
)
UPDATE hcps h
SET cohort_score = (
  0.60 * pr.volume_pct +
  0.40 * pr.years_pct
)
FROM percentile_ranks pr
WHERE h.id = pr.id;
```

### Rising Star score (uses hcp_scores.normalized_score from scoring pipeline)

Rising Star scores are computed by `scoring_pipeline.py` and live in `hcp_scores.normalized_score`. The frontend orders Rising Stars by `normalized_score`, not by `cohort_score`. So no separate score computation needed here.

If you want a unified cohort_score for consistency:

```sql
UPDATE hcps h
SET cohort_score = (
  SELECT MAX(hs.normalized_score)
  FROM hcp_scores hs
  WHERE hs.hcp_id = h.id
)
WHERE h.cohort_classification IN ('rising_star', 'dark_horse');
```

---

## Step 9: Final verification queries

### Cohort sizes after re-classification

```sql
SELECT 
  cohort_classification,
  COUNT(*) AS count,
  ROUND(MIN(cohort_score)::numeric, 2) AS min_score,
  ROUND(PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY cohort_score)::numeric, 2) AS median_score,
  ROUND(MAX(cohort_score)::numeric, 2) AS max_score
FROM hcps
WHERE cohort_classification IS NOT NULL
GROUP BY cohort_classification
ORDER BY count DESC;
```

Expected ranges:
- Established: ~615-650
- Rising Star: ~400-800 (down from 1,945 due to filters)
- Dark Horse: ~50-150 (subset of Rising Star)
- Community: ~12,000-14,000 (down from 14,844 due to taxonomy filter)
- Workhorse: ~400-550 (down from 568 due to taxonomy filter)

### Validate canonicals still in Established

```sql
-- Hepatology canonicals
SELECT 
  h.first_name, h.last_name,
  h.cohort_classification,
  h.cohort_score
FROM hcps h
WHERE LOWER(h.last_name) IN ('loomba', 'sanyal', 'chalasani', 'rinella', 'younossi')
ORDER BY h.cohort_score DESC NULLS LAST;

-- NSCLC canonicals
SELECT 
  h.first_name, h.last_name,
  h.cohort_classification,
  h.cohort_score
FROM hcps h
WHERE LOWER(h.last_name) IN ('heymach', 'janne', 'herbst', 'ramalingam', 'wakelee')
ORDER BY h.cohort_score DESC NULLS LAST;
```

All should be `established`.

### Validate Rising Stars are credible

```sql
SELECT 
  h.first_name, h.last_name, h.institution_short,
  h.npi_number IS NOT NULL AS has_npi,
  h.npi_specialty,
  h.nppes_career_stage_years AS career_years,
  h.total_career_pubs,
  s.normalized_score
FROM hcps h
JOIN hcp_scores s ON s.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = s.therapeutic_area_id
WHERE ta.name = 'Hepatology'
  AND h.cohort_classification = 'rising_star'
ORDER BY s.normalized_score DESC NULLS LAST
LIMIT 20;
```

Every row should have:
- has_npi = true
- npi_specialty populated and clinical (not Student, not Pathology, not Radiology)
- career_years <= 15
- total_career_pubs between 15 and 200
- Institution present
- Real-looking name (not orphan researchers)

### Validate Workhorse no longer contains radiologists/pathologists

```sql
SELECT 
  h.first_name, h.last_name, h.institution_short,
  h.npi_specialty,
  ms.total_beneficiaries_3yr_unique_est AS medicare_volume,
  COALESCE(ops.total_payments_lifetime, 0) AS pharma_payments
FROM hcps h
LEFT JOIN hcp_medicare_summary ms ON ms.hcp_id = h.id
LEFT JOIN hcp_open_payments_summary ops ON ops.hcp_id = h.id
JOIN hcp_therapeutic_areas hta ON hta.hcp_id = h.id
JOIN therapeutic_areas ta ON ta.id = hta.therapeutic_area_id
WHERE ta.name = 'Hepatology'
  AND h.cohort_classification = 'workhorse'
ORDER BY h.cohort_score DESC
LIMIT 20;
```

Should not see Pathology, Radiology, or Anesthesiology specialties.

---

## Rollback procedure

If anything goes wrong:

```sql
-- Restore from backup
UPDATE hcps h
SET 
  cohort_classification = b.cohort_classification,
  cohort_score = b.cohort_score
FROM hcps_cohort_backup_20260518 b
WHERE h.id = b.id;

-- Verify restore
SELECT 
  cohort_classification, COUNT(*) 
FROM hcps 
GROUP BY cohort_classification 
ORDER BY count DESC;
```

---

## Notes and open considerations

1. **The Established 4-path SQL needs to be retrieved from project history before running Step 3.** The structure is documented but the exact thresholds were tuned in prior sessions. Search project for "PATH 1" or "Wakelee" to find it.

2. **The taxonomy exclusion list in Step 1 is a starting point.** Review the diagnostic output and adjust based on what's actually polluting cohorts. Some taxonomies (NP variants, Radiation Oncology) are judgment calls.

3. **Rising Star filter is strict.** Requiring NPPES enrichment + specific career window + taxonomy filter will significantly shrink the cohort. That's intentional — prioritizing credibility over quantity.

4. **The Rising Star scoring_pipeline.py methodology refinement is deferred.** This SQL refinement at the classification layer addresses the immediate cohort_classification credibility problem. The deeper composite formula refinement (career multiplier recalibration, component weight rebalancing) is v1.1+ work.

5. **Frontend tagging for unverified specialty.** With the new `npi_taxonomy_enrichment_status` column, the frontend can show transparency about data coverage. v1.1 frontend backlog item.

---

*End of post-NPPES backfill SQL sequence.*
