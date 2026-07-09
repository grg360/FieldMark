-- ============================================================================
-- AD career_first_pub_year_v2 population — "sustained onset" method, scoped to Atopic Dermatitis.
-- Method recovered July 7 2026 (see career_first_pub_year_v2_method.sql for full annotation).
-- Snapshot: 2026-07-07 (the AD author-metrics fetch run July 7). Scoped to AD ta_id only (frozen-safe).
-- COMMIT as sql/backfill/ad_career_first_pub_year_v2.sql
-- PREREQUISITE: AD author-metrics fetch (openalex_author_enrichment.py --ta atopic-dermatitis) must be
-- complete so counts_by_year exists at snapshot 2026-07-07 for AD's HCPs.
-- VALIDATE first via the SELECT-preview (Silverberg ~mid-2000s) before running this UPDATE.
-- ============================================================================
WITH yearly AS (
  SELECT m.hcp_id, (elem->>'year')::int AS year, (elem->>'works_count')::int AS works
  FROM hcp_author_metrics_v2 m
  CROSS JOIN LATERAL jsonb_array_elements(m.counts_by_year) AS elem
  WHERE m.snapshot_date = '2026-07-07'
    AND m.hcp_id IN (
      SELECT hcp_id FROM hcp_therapeutic_areas_v2
      WHERE therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
    )
),
windowed AS (
  SELECT hcp_id, year, works,
    LEAD(works,1) OVER (PARTITION BY hcp_id ORDER BY year) AS n1w,
    LEAD(works,2) OVER (PARTITION BY hcp_id ORDER BY year) AS n2w,
    LEAD(year,1) OVER (PARTITION BY hcp_id ORDER BY year) AS n1y,
    LEAD(year,2) OVER (PARTITION BY hcp_id ORDER BY year) AS n2y
  FROM yearly
),
sustained AS (
  SELECT hcp_id, MIN(year) AS start_sustained FROM windowed
  WHERE works >= 2 AND n1w >= 2 AND n1y = year+1 AND n2w >= 2 AND n2y = year+2
  GROUP BY hcp_id
),
two_paper AS (
  SELECT hcp_id, MIN(year) AS start_2paper FROM yearly WHERE works >= 2 GROUP BY hcp_id
),
earliest AS (
  SELECT hcp_id, MIN(year) AS start_earliest FROM yearly GROUP BY hcp_id
),
resolved AS (
  SELECT e.hcp_id,
    COALESCE(s.start_sustained, t.start_2paper, e.start_earliest) AS new_start
  FROM earliest e
  LEFT JOIN sustained s ON s.hcp_id = e.hcp_id
  LEFT JOIN two_paper t ON t.hcp_id = e.hcp_id
)
UPDATE hcps_v2 h
SET career_first_pub_year_v2 = r.new_start
FROM resolved r
WHERE r.hcp_id = h.id;
