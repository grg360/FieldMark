-- ============================================================
-- FieldMark HCP Dedup v1 — DIAGNOSTIC ONLY
-- ============================================================
-- Reports duplicate HCP records and proposed canonical selection.
-- NO DATA CHANGES. Run this first to verify the merge plan.
--
-- Scope: HCPs with country IN ('USA', 'US') sharing first_name + last_name
-- Goal: Each duplicate group gets one canonical record; others merge into it.
-- ============================================================


-- ============================================================
-- SECTION 1: Identify duplicate groups and rank records within each group
-- ============================================================
-- For each (first_name, last_name) duplicate group, rank records by:
--   1. Has cohort_classification (classified records win)
--   2. country = 'USA' beats 'US'
--   3. Has NPI number (real US HCPs)
--   4. Has institution_full populated
--   5. Most existing publication links (tiebreaker)
--
-- The rank=1 record in each group becomes the canonical.
-- ============================================================

WITH duplicate_groups AS (
  SELECT 
    first_name, 
    last_name
  FROM hcps
  WHERE country IN ('USA', 'US')
  GROUP BY first_name, last_name
  HAVING COUNT(*) > 1
),
hcp_pub_counts AS (
  SELECT 
    hcp_id, 
    COUNT(DISTINCT publication_id) AS linked_pubs
  FROM publication_authors
  GROUP BY hcp_id
),
ranked_records AS (
  SELECT 
    h.id,
    h.first_name,
    h.last_name,
    h.country,
    h.cohort_classification,
    h.cohort_score,
    h.npi_number,
    h.institution_full,
    h.institution,
    h.updated_at,
    COALESCE(hpc.linked_pubs, 0) AS linked_pubs,
    ROW_NUMBER() OVER (
      PARTITION BY h.first_name, h.last_name
      ORDER BY 
        CASE WHEN h.cohort_classification IS NOT NULL THEN 0 ELSE 1 END,  -- classified wins
        CASE WHEN h.country = 'USA' THEN 0 ELSE 1 END,                     -- USA over US
        CASE WHEN h.npi_number IS NOT NULL THEN 0 ELSE 1 END,              -- has NPI wins
        CASE WHEN h.institution_full IS NOT NULL THEN 0 ELSE 1 END,        -- has institution wins
        COALESCE(hpc.linked_pubs, 0) DESC,                                 -- more pubs wins
        h.updated_at DESC NULLS LAST                                       -- recency tiebreaker
    ) AS rank_in_group
  FROM hcps h
  JOIN duplicate_groups dg 
    ON dg.first_name = h.first_name 
    AND dg.last_name = h.last_name
  LEFT JOIN hcp_pub_counts hpc ON hpc.hcp_id = h.id
  WHERE h.country IN ('USA', 'US')
)
SELECT 
  COUNT(*) FILTER (WHERE rank_in_group = 1) AS canonical_count,
  COUNT(*) FILTER (WHERE rank_in_group > 1) AS records_to_merge,
  COUNT(DISTINCT first_name || '|' || last_name) AS duplicate_groups,
  SUM(linked_pubs) FILTER (WHERE rank_in_group > 1) AS pubs_to_remap
FROM ranked_records;

-- Expected output (rough):
--   canonical_count:    ~1880 (one canonical per group)
--   records_to_merge:   ~2150 (the duplicates)
--   duplicate_groups:   ~1880
--   pubs_to_remap:      several thousand


-- ============================================================
-- SECTION 2: Sample of merge plan — top 30 canonicals by pubs_to_remap
-- ============================================================
-- For each duplicate group with the most "stranded" pubs,
-- show which record becomes canonical and which get merged in.
-- ============================================================

WITH duplicate_groups AS (
  SELECT first_name, last_name
  FROM hcps
  WHERE country IN ('USA', 'US')
  GROUP BY first_name, last_name
  HAVING COUNT(*) > 1
),
hcp_pub_counts AS (
  SELECT hcp_id, COUNT(DISTINCT publication_id) AS linked_pubs
  FROM publication_authors
  GROUP BY hcp_id
),
ranked_records AS (
  SELECT 
    h.id,
    h.first_name,
    h.last_name,
    h.country,
    h.cohort_classification,
    h.cohort_score,
    h.institution,
    COALESCE(hpc.linked_pubs, 0) AS linked_pubs,
    ROW_NUMBER() OVER (
      PARTITION BY h.first_name, h.last_name
      ORDER BY 
        CASE WHEN h.cohort_classification IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN h.country = 'USA' THEN 0 ELSE 1 END,
        CASE WHEN h.npi_number IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN h.institution_full IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(hpc.linked_pubs, 0) DESC,
        h.updated_at DESC NULLS LAST
    ) AS rank_in_group
  FROM hcps h
  JOIN duplicate_groups dg 
    ON dg.first_name = h.first_name 
    AND dg.last_name = h.last_name
  LEFT JOIN hcp_pub_counts hpc ON hpc.hcp_id = h.id
  WHERE h.country IN ('USA', 'US')
),
group_summary AS (
  SELECT 
    first_name,
    last_name,
    SUM(linked_pubs) FILTER (WHERE rank_in_group > 1) AS pubs_on_duplicates
  FROM ranked_records
  GROUP BY first_name, last_name
)
SELECT 
  rr.first_name,
  rr.last_name,
  rr.rank_in_group,
  CASE WHEN rr.rank_in_group = 1 THEN 'CANONICAL' ELSE 'merge_into_canonical' END AS role,
  rr.country,
  rr.cohort_classification,
  rr.cohort_score,
  rr.linked_pubs,
  LEFT(rr.institution, 60) AS institution_excerpt,
  gs.pubs_on_duplicates
FROM ranked_records rr
JOIN group_summary gs 
  ON gs.first_name = rr.first_name 
  AND gs.last_name = rr.last_name
WHERE gs.pubs_on_duplicates > 50  -- focus on high-value merges
ORDER BY gs.pubs_on_duplicates DESC, rr.first_name, rr.last_name, rr.rank_in_group
LIMIT 100;


-- ============================================================
-- SECTION 3: Foreign-key impact assessment
-- ============================================================
-- For records that will be merged AWAY (rank > 1), how many rows in
-- each related table point to them? This tells us exactly what foreign
-- keys we need to remap during the merge.
-- ============================================================

WITH duplicate_groups AS (
  SELECT first_name, last_name
  FROM hcps
  WHERE country IN ('USA', 'US')
  GROUP BY first_name, last_name
  HAVING COUNT(*) > 1
),
hcp_pub_counts AS (
  SELECT hcp_id, COUNT(DISTINCT publication_id) AS linked_pubs
  FROM publication_authors
  GROUP BY hcp_id
),
ranked_records AS (
  SELECT 
    h.id,
    ROW_NUMBER() OVER (
      PARTITION BY h.first_name, h.last_name
      ORDER BY 
        CASE WHEN h.cohort_classification IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN h.country = 'USA' THEN 0 ELSE 1 END,
        CASE WHEN h.npi_number IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN h.institution_full IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(hpc.linked_pubs, 0) DESC,
        h.updated_at DESC NULLS LAST
    ) AS rank_in_group
  FROM hcps h
  JOIN duplicate_groups dg 
    ON dg.first_name = h.first_name 
    AND dg.last_name = h.last_name
  LEFT JOIN hcp_pub_counts hpc ON hpc.hcp_id = h.id
  WHERE h.country IN ('USA', 'US')
),
duplicate_ids AS (
  SELECT id FROM ranked_records WHERE rank_in_group > 1
)
SELECT 'publication_authors' AS table_name, COUNT(*) AS rows_to_remap
FROM publication_authors WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'publications (primary hcp_id)', COUNT(*)
FROM publications WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'hcp_scores', COUNT(*)
FROM hcp_scores WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'hcp_therapeutic_areas', COUNT(*)
FROM hcp_therapeutic_areas WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'hcp_open_payments_summary', COUNT(*)
FROM hcp_open_payments_summary WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'hcp_open_payments_by_ta', COUNT(*)
FROM hcp_open_payments_by_ta WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'hcp_medicare_summary', COUNT(*)
FROM hcp_medicare_summary WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'hcp_narratives', COUNT(*)
FROM hcp_narratives WHERE hcp_id IN (SELECT id FROM duplicate_ids)
UNION ALL
SELECT 'trial_investigator (if exists)', COUNT(*)
FROM trial_investigator WHERE hcp_id IN (SELECT id FROM duplicate_ids)
ORDER BY rows_to_remap DESC;
