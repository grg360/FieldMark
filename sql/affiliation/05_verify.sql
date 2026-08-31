-- Affiliation re-derivation — AFTER capture + verification. READ-ONLY except for its own
-- snapshot rows.
--
-- RUN THIS LAST, after 03_apply.sql. Companion: 00_snapshot.sql, which must have been run
-- BEFORE 02_build_staging.sql -- without the 'before' phase every check below degrades to a
-- bare count with nothing to compare it against.
--
-- NOTE ON 04_rising_board_current_country.sql: it is NOT a step in this pass. It is a
-- CREATE OR REPLACE of the rising_board() display function, it is already live, and it reads
-- current_country at query time -- so it picks the re-derivation up with no re-apply. It is
-- also hardcoded to slug='nsclc' and cannot serve another TA. Do not run it.
--
-- WHY EVERY CHECK IS ONE UNIONED RESULT SET. run_sql.py prints only the LAST statement's
-- rows, so a file of six separate SELECTs would silently show you the sixth. One labelled
-- union means no check can be lost by the harness.
--
-- EVERY DIFF JOINS ON row_key, the single non-null identity 00_snapshot builds. The natural
-- key has two nullable columns, and IS NOT DISTINCT FROM on them defeats the hash join: the
-- first draft of this file planned a nested loop over 114k x 114k and had to be killed at
-- ten minutes. With row_key and its index the whole file runs in seconds.
--
-- READ THE `verdict` COLUMN. (The label column is check_name, not check -- reserved word.) Anything that is not OK is described in its own row.

SET statement_timeout = '10min';

DELETE FROM affiliation_rerun_snapshot WHERE phase = 'after';

INSERT INTO affiliation_rerun_snapshot
SELECT 'after', now(),
       'EST:' || ta.slug || ':' || r.hcp_id::text || ':'
       || COALESCE(r.scope_type, '') || ':' || COALESCE(r.scope_value, ''),
       'EST', ta.slug, r.hcp_id, r.rank, NULL::int,
       r.scope_type, r.scope_value,
       h.country, h.current_country, h.affiliation_confidence, h.affiliation_as_of,
       NULLIF(BTRIM(COALESCE(h.current_country, h.country)), ''),
       (NULLIF(BTRIM(COALESCE(h.current_country, '')), '') IS NOT NULL
        AND lower(COALESCE(h.affiliation_confidence, '')) = 'high')
FROM hcp_established_ranks_v3 r
JOIN hcps_v2 h ON h.id = r.hcp_id
JOIN therapeutic_areas ta ON ta.id = r.therapeutic_area_id
WHERE ta.slug IN ('nsclc', 'colorectal-cancer')
UNION ALL
SELECT 'after', now(),
       'RS:' || ta.slug || ':' || r.hcp_id::text || '::',
       'RS', ta.slug, r.hcp_id, r.rank, r.us_rank,
       NULL, NULL,
       h.country, h.current_country, h.affiliation_confidence, h.affiliation_as_of,
       NULLIF(BTRIM(COALESCE(h.current_country, h.country)), ''),
       (NULLIF(BTRIM(COALESCE(h.current_country, '')), '') IS NOT NULL
        AND lower(COALESCE(h.affiliation_confidence, '')) = 'high')
FROM hcp_rising_star_ranks_v3 r
JOIN hcps_v2 h ON h.id = r.hcp_id
JOIN therapeutic_areas ta ON ta.id = r.therapeutic_area_id
WHERE ta.slug IN ('nsclc', 'colorectal-cancer');

-- The diff below joins 114k rows to 114k rows. Fresh statistics are what keep that a hash
-- join; without them the planner has no idea how big the new phase is.
ANALYZE affiliation_rerun_snapshot;

WITH b AS (SELECT * FROM affiliation_rerun_snapshot WHERE phase = 'before'),
     a AS (SELECT * FROM affiliation_rerun_snapshot WHERE phase = 'after'),

-- 1. COVERAGE. The whole point of the pass: no TA may still hold never-processed HCPs.
cover AS (
  SELECT ta.name AS k,
         count(*) - count(h.affiliation_derived_at) AS n
  FROM hcp_therapeutic_areas_v2 m
  JOIN hcps_v2 h ON h.id = m.hcp_id
  JOIN therapeutic_areas ta ON ta.id = m.therapeutic_area_id
  GROUP BY 1
),

-- 2. THE CANARY. NULL affiliation_confidence means "never processed"; 'unknown' means
--    "processed, no ROR'd evidence". Running 03 against a STALE staging table would stamp
--    'unknown' over ~92k never-processed rows and destroy that distinction irreversibly.
--    A healthy run leaves ZERO NULLs and a plausible 'unknown' count.
canary AS (
  SELECT count(*) FILTER (WHERE affiliation_confidence IS NULL)      AS still_null,
         count(*) FILTER (WHERE affiliation_confidence = 'unknown')  AS unknown_now
  FROM hcps_v2
),

-- 3. ESTABLISHED MUST NOT MOVE. Same (hcp_id, scope) pair, different rank = a real problem.
est_move AS (
  SELECT count(*) AS n
  FROM b JOIN a ON a.row_key = b.row_key
  WHERE b.board = 'EST' AND a.rank IS DISTINCT FROM b.rank
),

-- 4. RISING STORED RANKS MUST NOT MOVE either. rank and us_rank are columns, not read-time
--    computations -- only the country slicing is allowed to change.
rs_move AS (
  SELECT count(*) AS n
  FROM b JOIN a ON a.row_key = b.row_key
  WHERE b.board = 'RS'
    AND (a.rank IS DISTINCT FROM b.rank OR a.us_rank IS DISTINCT FROM b.us_rank)
),

-- 5. RISING PLACEMENT IS EXPECTED TO MOVE. Reported, never failed: board_rising slices on
--    coalesce(current_country, country) at read time, so this is the pass working.
rs_country AS (
  SELECT count(*) AS n
  FROM b JOIN a ON a.row_key = b.row_key
  WHERE b.board = 'RS' AND a.effective_country IS DISTINCT FROM b.effective_country
),

-- 6. THE HEADLINE: flag rate before vs after, per board and TA.
flags AS (
  SELECT b.board, b.ta,
         count(*) FILTER (WHERE b.flag_eligible) AS before_n,
         count(*) FILTER (WHERE a.flag_eligible) AS after_n,
         count(*) AS rows
  FROM b JOIN a ON a.row_key = b.row_key
  GROUP BY 1, 2
)

SELECT * FROM (
  SELECT 1 AS ord, 'coverage: ' || k AS check_name,
         n::text AS value,
         CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL - HCPs still never processed' END AS verdict
  FROM cover
  UNION ALL
  SELECT 2, 'canary: affiliation_confidence still NULL',
         still_null::text,
         CASE WHEN still_null = 0 THEN 'OK'
              ELSE 'FAIL - 03 did not cover every row' END
  FROM canary
  UNION ALL
  SELECT 3, 'canary: affiliation_confidence = unknown',
         unknown_now::text,
         CASE WHEN unknown_now > 80000
              THEN 'SUSPECT - 03 may have run against STALE staging; see 00_snapshot header'
              ELSE 'OK' END
  FROM canary
  UNION ALL
  SELECT 4, 'established rank moved (must be 0)', n::text,
         CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL - stored scope ranks changed' END
  FROM est_move
  UNION ALL
  SELECT 5, 'rising stored rank/us_rank moved (must be 0)', n::text,
         CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL - stored ranks changed' END
  FROM rs_move
  UNION ALL
  SELECT 6, 'rising effective_country changed (expected > 0)', n::text,
         'INFO - read-time slicing will re-order country and EUROPE selections'
  FROM rs_country
  UNION ALL
  SELECT 7, 'flags ' || board || ' ' || ta,
         before_n || ' -> ' || after_n || ' of ' || rows
         || ' (' || round(100.0 * before_n / rows, 1) || '% -> '
         || round(100.0 * after_n / rows, 1) || '%)',
         CASE WHEN after_n >= before_n THEN 'OK'
              ELSE 'REGRESSION - fewer flags than before' END
  FROM flags
) t
ORDER BY ord, check_name;
