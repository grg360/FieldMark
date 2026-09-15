/* ==== 53. VERIFY 50-52 ====
   READ-ONLY with respect to every persistent object. Every query REPORTS; none
   asserts, and nothing here stops the sequence. The expected value is printed
   beside the measured one so the comparison is in the output rather than in
   someone's memory.

   The one that is a STOP rather than a note: if colorectal anchored is far from
   121, the taxonomy gate or the pattern join has moved, and the sort label and
   Part B column that come next are both built on it.

   ------------------------------------------------------------------------
   WHY THIS FILE BUILDS TEMP TABLES FIRST.

   community_board_v1 LEFT JOINs hcp_evidence_tier_v1, which since block 52
   computes a co-occurrence composite over hcp_hcpcs_detail. Postgres does not
   cache that between statements, so the first draft of this file recomputed it
   nine times and one statement ran past the cap.

   AND THE CAP IS NOT THE ONE THE RUN SHEET ASSUMES. run_sql.py's
   --statement-timeout flag is SILENTLY INEFFECTIVE on this database: it passes
   statement_timeout in the libpq startup options, and the connection reaches
   Postgres through a pooler that drops them. Measured 2026-09-14 --
   `SHOW statement_timeout` returns 2min with the flag and 2min without it. The
   real budget for any single statement here is two minutes. Logged; the flag is
   worth either fixing (send `SET statement_timeout` as its own statement) or
   removing, and this file works within the real cap either way.

   The two tables below are TEMP -- session-local, dropped at disconnect, and no
   persistent object is written. Building them takes about three seconds and
   makes every report afterwards a scan of a few thousand rows.
   ------------------------------------------------------------------------ */

CREATE TEMP TABLE v53_board AS
SELECT ta.slug,
       b.ta_id,
       b.hcp_id,
       b.qualifies,
       b.evidence_tier      AS board_tier,
       e.tier               AS view_tier,
       (e.lung_share IS NOT NULL OR e.lung_weighted IS NOT NULL
        OR e.anchor_stem IS NOT NULL OR e.anchor_stems IS NOT NULL
        OR e.anchor_years IS NOT NULL OR e.recurrence_band IS NOT NULL
        OR e.supported_evidence IS NOT NULL OR e.supported_evidence_rank IS NOT NULL
        OR e.years_anchored IS NOT NULL OR e.oral_denominator IS NOT NULL
        OR e.oral_recent_year IS NOT NULL) AS any_lung_column
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
LEFT JOIN public.hcp_evidence_tier_v1 e
       ON e.hcp_id = b.hcp_id AND e.ta_id = b.ta_id;

CREATE INDEX ON v53_board (slug, qualifies);
ANALYZE v53_board;


/* ---- 1. NSCLC IS THE REGRESSION ORACLE, AND IT MUST NOT HAVE MOVED ----
   Blocks 50-52 touch three things lung could feel: the ta_hcpcs_codes columns (added,
   never populated for nsclc), the tier-model CHECK (widened), and the view (branch 1
   transcribed). A fourth nearly did -- see block 50 deviation 4, where 05's Part D
   grading moved 150 lung HCPs into supported before it was scoped back out. That is
   exactly why block 26 refused to recompute the lung ladder, and exactly why this check
   is first.

   EXPECT  board 13,048 rows / 4,915 qualifying
           anchored 980 | candidate 2,798 | heme_dominant 629 | supported 94 |
           unresolved 8,547 */
SELECT 'nsclc board' AS check,
       count(*)                            AS board_rows,
       13048                               AS expect_rows,
       count(*) FILTER (WHERE qualifies)   AS qualifying,
       4915                                AS expect_qualifying,
       (count(*) = 13048 AND count(*) FILTER (WHERE qualifies) = 4915) AS unchanged
FROM v53_board WHERE slug = 'nsclc';

SELECT 'nsclc tiers' AS check,
       board_tier,
       count(*) AS measured,
       CASE board_tier WHEN 'anchored' THEN 980 WHEN 'candidate' THEN 2798
                       WHEN 'heme_dominant' THEN 629 WHEN 'supported' THEN 94
                       WHEN 'unresolved' THEN 8547 END AS expected,
       (count(*) = CASE board_tier WHEN 'anchored' THEN 980 WHEN 'candidate' THEN 2798
                       WHEN 'heme_dominant' THEN 629 WHEN 'supported' THEN 94
                       WHEN 'unresolved' THEN 8547 END) AS unchanged
FROM v53_board WHERE slug = 'nsclc'
GROUP BY board_tier ORDER BY count(*) DESC;


/* ---- 2. COLORECTAL MEMBERSHIP DOES NOT MOVE ----
   qualifies is `patient_volume > 0 OR EXISTS(part D row)` and never reads evidence_tier,
   so a new tier model cannot add or remove a member. Measured rather than argued.

   null_tier_rows is the one that would catch a branch failing to cover the whole cohort:
   the board LEFT JOINs the tier view, so a gap arrives as a silent NULL, not an error.

   EXPECT  14,896 rows / 4,794 qualifying / 0 null tiers. */
SELECT 'colorectal board' AS check,
       count(*)                                      AS board_rows,
       14896                                         AS expect_rows,
       count(*) FILTER (WHERE qualifies)             AS qualifying,
       4794                                          AS expect_qualifying,
       count(*) FILTER (WHERE board_tier IS NULL)    AS null_tier_rows,
       0                                             AS expect_null_tier,
       (count(*) FILTER (WHERE qualifies) = 4794
        AND count(*) FILTER (WHERE board_tier IS NULL) = 0) AS ok
FROM v53_board WHERE slug = 'colorectal-cancer';


/* ---- 3. THE COLORECTAL TIER DISTRIBUTION -- THE NUMBER THAT MATTERS ----
   EXPECT  anchored 121 | supported 199 | candidate 4,474 | unresolved 0, summing to 4,794.

   unresolved is 0 ON THE BOARD and large off it: an HCP with neither a Part B pattern nor
   a Part D row also has no patient_volume, so qualifies is false and they sit in the
   14,896 but not the 4,794. Both columns print so that is visible rather than surprising.

   IF anchored IS FAR FROM 121, STOP. Candidates for what moved, in order of likelihood:
   the taxonomy gate (a shape change in nppes_taxonomies, or 207RH0003X dropped), the
   pattern_role rows in block 51, or the valid_from year filter excluding a code it should
   admit. */
SELECT 'colorectal tiers' AS check,
       board_tier,
       count(*) FILTER (WHERE qualifies) AS on_board,
       CASE board_tier WHEN 'anchored' THEN 121 WHEN 'supported' THEN 199
                       WHEN 'candidate' THEN 4474 WHEN 'unresolved' THEN 0 END AS expect_on_board,
       count(*)                          AS whole_cohort
FROM v53_board WHERE slug = 'colorectal-cancer'
GROUP BY board_tier ORDER BY count(*) FILTER (WHERE qualifies) DESC;

/* The 320 who moved off candidate. Reported because the sort label that comes next will
   claim this order is meaningful. EXPECT 320. */
SELECT 'promoted off candidate' AS check,
       count(*) FILTER (WHERE board_tier = 'anchored')  AS anchored,
       count(*) FILTER (WHERE board_tier = 'supported') AS supported,
       count(*) FILTER (WHERE board_tier IN ('anchored','supported')) AS total_promoted,
       320 AS expect_total
FROM v53_board WHERE slug = 'colorectal-cancer' AND qualifies;


/* ---- 4. CROSS-TA TIER LEAK ----
   Three distinct ways a lung tier could arrive under a colorectal row, measured
   separately because they fail differently.

   a) VOCABULARY. heme_dominant is an nsclc_v1 tier and partb_practice_v1 cannot emit it.
      A colorectal row carrying it came from branch 1.
   b) LUNG COLUMNS. Every lung_* column is NULL under branch 3 by construction. A non-NULL
      one means branch 1 rows reached a colorectal ta_id -- the failure block 25's
      singleton index exists to prevent.
   c) THE BOARD'S OWN JOIN, on (hcp_id, ta_id). If it joined on hcp_id alone, every HCP
      holding a tier in more than one TA would carry the other TA's answer.

   EXPECT 0, 0, 0. */
SELECT 'leak: nsclc vocabulary on crc rows' AS check,
       count(*) AS measured, 0 AS expected
FROM v53_board
WHERE slug = 'colorectal-cancer'
  AND board_tier IS NOT NULL
  AND board_tier NOT IN ('anchored', 'supported', 'candidate', 'unresolved');

SELECT 'leak: lung columns on crc rows' AS check,
       count(*) AS measured, 0 AS expected
FROM v53_board WHERE slug = 'colorectal-cancer' AND any_lung_column;

SELECT 'leak: board tier != same-TA view tier' AS check,
       count(*) AS measured, 0 AS expected
FROM v53_board WHERE board_tier IS DISTINCT FROM view_tier;

/* How many people those three zeros actually have to discriminate between. If this were
   small they would be cheap. EXPECT well above zero. */
SELECT 'hcps holding a tier in >1 TA' AS check, count(*) AS measured
FROM (SELECT hcp_id FROM v53_board WHERE view_tier IS NOT NULL
      GROUP BY hcp_id HAVING count(DISTINCT ta_id) > 1) x;


/* ---- 5. ta_hcpcs_codes COVERAGE ----
   How many of the 4,794 now have any Part B row against the colorectal code set -- the
   population the new Part B column can speak about at all. Printed next to the tiers so
   the gap between "has claims" and "clears a limb set" stays visible: having a row is not
   having a pattern. */
CREATE TEMP TABLE v53_cov AS
SELECT b.hcp_id,
       count(*)                          AS code_rows,
       count(DISTINCT d.program_year)    AS years,
       count(DISTINCT d.hcpcs_code)      AS codes
FROM v53_board b
JOIN public.hcp_hcpcs_detail d ON d.hcp_id = b.hcp_id
JOIN public.ta_hcpcs_codes k
  ON k.hcpcs_code = d.hcpcs_code AND k.therapeutic_area_id = b.ta_id
WHERE b.slug = 'colorectal-cancer' AND b.qualifies
GROUP BY b.hcp_id;
ANALYZE v53_cov;

SELECT 'crc part B coverage' AS check,
       (SELECT count(*) FROM v53_board WHERE slug='colorectal-cancer' AND qualifies) AS on_board,
       count(*)                                  AS with_any_set_row,
       round(100.0 * count(*) /
             (SELECT count(*) FROM v53_board WHERE slug='colorectal-cancer' AND qualifies), 1)
                                                 AS pct_with_set_row,
       count(*) FILTER (WHERE years > 1)         AS in_more_than_one_year,
       count(*) FILTER (WHERE codes >= 3)        AS with_three_or_more_codes
FROM v53_cov;

/* Per code, so a role with no claims behind it is visible rather than averaged away. */
SELECT 'crc code usage' AS check,
       k.hcpcs_code, k.pattern_role, k.specificity_grade, k.never_upgrades,
       count(DISTINCT b.hcp_id) AS board_hcps_billing_it
FROM public.ta_hcpcs_codes k
JOIN public.therapeutic_areas ta ON ta.id = k.therapeutic_area_id
LEFT JOIN public.hcp_hcpcs_detail d ON d.hcpcs_code = k.hcpcs_code
LEFT JOIN v53_board b ON b.hcp_id = d.hcp_id AND b.ta_id = k.therapeutic_area_id AND b.qualifies
WHERE ta.slug = 'colorectal-cancer'
GROUP BY k.hcpcs_code, k.pattern_role, k.specificity_grade, k.never_upgrades
ORDER BY k.pattern_role, k.hcpcs_code;


/* ---- 6. WHAT THE BIOSIMILARS ARE WORTH ----
   Block 51 says anchoring on the reference product alone is hollow and that the amount is
   measured, not assumed. This is the measurement: anchored HCPs whose ONLY VEGF code is a
   biosimilar are exactly the ones a J9035-only family would lose. */
WITH vegf AS (
  SELECT d.hcp_id,
         bool_or(d.hcpcs_code =  'J9035') AS has_reference,
         bool_or(d.hcpcs_code <> 'J9035') AS has_biosimilar
  FROM public.hcp_hcpcs_detail d
  JOIN public.ta_hcpcs_codes k
    ON k.hcpcs_code = d.hcpcs_code AND k.pattern_role = 'vegf'
  JOIN public.therapeutic_areas ta
    ON ta.id = k.therapeutic_area_id AND ta.slug = 'colorectal-cancer'
  GROUP BY d.hcp_id
)
SELECT 'vegf family composition' AS check,
       count(*)                                                        AS anchored_total,
       count(*) FILTER (WHERE v.has_reference)                         AS uses_j9035,
       count(*) FILTER (WHERE v.has_biosimilar)                        AS uses_a_biosimilar,
       count(*) FILTER (WHERE v.has_biosimilar AND NOT v.has_reference) AS biosimilar_only
FROM v53_board b
LEFT JOIN vegf v ON v.hcp_id = b.hcp_id
WHERE b.slug = 'colorectal-cancer' AND b.qualifies AND b.board_tier = 'anchored';


/* ---- 7. WHAT 207RH0003X IS WORTH ----
   The internal-medicine-subspecialty encoding of Heme-Onc, whose omission has cost us
   three times. Reported so the next person to "tidy" the gate sees the number first. */
WITH promoted AS (
  SELECT hcp_id FROM v53_board
  WHERE slug = 'colorectal-cancer' AND qualifies AND board_tier IN ('anchored','supported')
),
gate AS (
  SELECT p.hcp_id,
         (EXISTS (SELECT 1 FROM public.hcp_nppes_detail_v2 nd
                  CROSS JOIN LATERAL jsonb_array_elements(nd.nppes_taxonomies) e
                  WHERE nd.hcp_id = p.hcp_id AND e ->> 'code' IN ('207RX0202X','207RH0000X'))
          OR h.npi_taxonomy IN ('207RX0202X','207RH0000X'))            AS without_rh0003,
         (EXISTS (SELECT 1 FROM public.hcp_nppes_detail_v2 nd
                  CROSS JOIN LATERAL jsonb_array_elements(nd.nppes_taxonomies) e
                  WHERE nd.hcp_id = p.hcp_id AND e ->> 'code' = '207RH0003X')
          OR h.npi_taxonomy = '207RH0003X')                            AS has_rh0003
  FROM promoted p JOIN public.hcps_v2 h ON h.id = p.hcp_id
)
SELECT 'taxonomy gate: 207RH0003X' AS check,
       count(*)                                                      AS promoted_total,
       count(*) FILTER (WHERE has_rh0003 AND NOT without_rh0003)     AS reachable_only_via_rh0003
FROM gate;


/* ---- 8. THE ADMINISTERED-VOLUME SURFACE ----
   Block 51's second job. Before this sequence colorectal had zero ta_hcpcs_codes rows and
   hcp_administered_volume returned 'no_code_set' for every colorectal HCP -- cannot-assess,
   which was already the honest answer thanks to the correction-3 guard, so this is an
   improvement rather than a repair. It should now return a real state for anyone with
   claims, and 'no_code_set' for nobody.

   Sampled over 200 board members: the function is per-HCP plpgsql and this is a smoke
   test, not a census. */
WITH crc AS (SELECT id FROM public.therapeutic_areas WHERE slug = 'colorectal-cancer'),
sample AS (
  SELECT hcp_id FROM v53_board
  WHERE slug = 'colorectal-cancer' AND qualifies
  ORDER BY hcp_id LIMIT 200
)
SELECT 'administered_volume states (200 sampled)' AS check,
       public.hcp_administered_volume(s.hcp_id, (SELECT id FROM crc)) ->> 'state' AS state,
       count(*) AS hcps
FROM sample s
GROUP BY 2 ORDER BY 3 DESC;


/* ---- 9. GRANTS ----
   The view was CREATE OR REPLACEd rather than dropped, so nothing should have moved.
   Asked rather than assumed: a lost grant renders as an empty Community tab, which reads
   as "this TA has no members". EXPECT every boolean true on all four rows. */
SELECT 'grants' AS check,
       c.relname AS object,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated,
       has_table_privilege('service_role',  c.oid, 'SELECT') AS service_role
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('hcp_evidence_tier_v1', 'community_board_v1',
                    'ta_evidence_tier_config', 'ta_hcpcs_codes')
ORDER BY c.relname;
