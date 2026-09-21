/* ==== 00. COUNTRY SPELLING -- BLAST RADIUS, RE-MEASURED ====
   READ-ONLY. Supersedes docs/crc_community/44_country_blast_radius.sql for the
   purpose of deciding whether to normalise.

   WHY 44 CANNOT BE QUOTED. It ran 2026-09-11, before cohort_classification_v2 and
   community_scoring were re-run for colorectal on the 12th. Its section C reported
   zero nsclc and zero colorectal rows joining a board on normalisation, and that was
   a true statement about a 52,167-row hcp_community_scores_v2. The table is now
   78,658 rows and the evidenced colorectal physicians have scores rows they did not
   have then. 44 stays where it is as the record of what was true on the 11th; this
   file is what the decision is made on.

   WHAT 44 ALSO CANNOT ANSWER, structurally rather than by age:
     - it measures nsclc only in section C, and colorectal is the reason this job exists
     - it predates partb_practice_v1 (docs/crc_community/52), so it has no concept of
       which TIER an added colorectal row would land in
     - it buckets every non-US value into one row, which is the right shape for a
       blast radius and the wrong shape for "does a third spelling exist"

   THE GATE THIS FILE GUARDS. nsclc additions MUST be zero. 4,915 is the regression
   oracle for the whole CRC build, and a cleanup that moves a live board is a
   production change wearing a cleanup costume. If section B is not zero, stop.

   SCOPE. One value, two spellings: USA -> US. NULL rows and genuinely-foreign rows
   are NOT in scope and are measured here only to show they are being left alone. */


/* ---- A. EVERY SPELLING, UNBUCKETED ----
   The question is "does anything beyond US / USA / NULL / clearly-foreign exist", and
   a bucketed count cannot answer it. So: the shape of the whole column, then every
   value that is not a bare ISO-3166-1 alpha-2 code.

   EXPECT from the 2026-09-11 measurement, unchanged:
     US 92,611 · USA 19,304 · NULL 21,717 · other 266,740 */
SELECT 'A1. column shape' AS section,
       count(*)                                                          AS rows,
       count(*) FILTER (WHERE country = 'US')                            AS us,
       count(*) FILTER (WHERE country = 'USA')                           AS usa,
       count(*) FILTER (WHERE country IS NULL)                           AS nulls,
       count(*) FILTER (WHERE country IS NOT NULL
                          AND country NOT IN ('US','USA'))               AS other,
       count(DISTINCT country)                                           AS distinct_values,
       count(DISTINCT upper(btrim(country)))                             AS distinct_normalised,
       count(*) FILTER (WHERE country <> btrim(country))                 AS with_whitespace,
       count(*) FILTER (WHERE btrim(country) = '')                       AS empty_string
FROM public.hcps_v2;

/* distinct_values = distinct_normalised is the load-bearing equality above: if any two
   values differed only by case or padding ('USA' vs 'Usa' vs ' USA '), upper(btrim())
   would collapse them and the two counts would diverge. They do not, so the only
   variation in this column is genuinely different strings.

   A2 lists every one of those that is not a two-letter code. EXPECT 19 rows: USA plus
   18 full country names, every one of them unambiguously foreign. */
SELECT 'A2. non-ISO2 values' AS section,
       h.country,
       count(*) AS hcps,
       (upper(btrim(h.country)) IN ('US','USA','U.S.','U.S.A.','UNITED STATES',
                                    'UNITED STATES OF AMERICA')) AS is_a_us_spelling
FROM public.hcps_v2 h
WHERE h.country IS NOT NULL AND length(btrim(h.country)) <> 2
GROUP BY h.country
ORDER BY is_a_us_spelling DESC, count(*) DESC;


/* ---- B. NSCLC ADDITIONS -- THE GATE ----
   A USA row joins the nsclc board on normalisation if it has an nsclc
   hcp_community_scores_v2 row AND satisfies community_board_v1.qualifies, which is
   `patient_volume > 0 OR EXISTS(hcp_part_d_oncology_v1 row)`. The country test is the
   only thing currently keeping it out, so this is exactly the set that would appear.

   EXPECT 0 added. If it is not 0, STOP -- do not run 02. */
SELECT 'B. nsclc additions' AS section,
       count(*)                                                 AS usa_scored_rows,
       count(*) FILTER (WHERE q.qualifies)                       AS would_be_added,
       0                                                         AS expect_added,
       (count(*) FILTER (WHERE q.qualifies) = 0)                 AS gate_holds
FROM public.hcp_community_scores_v2 c
JOIN public.hcps_v2 h ON h.id = c.hcp_id
JOIN public.therapeutic_areas ta ON ta.id = c.therapeutic_area_id AND ta.slug = 'nsclc'
CROSS JOIN LATERAL (
  SELECT (c.patient_volume > 0
          OR EXISTS (SELECT 1 FROM public.hcp_part_d_oncology_v1 pd WHERE pd.hcp_id = c.hcp_id))
         AS qualifies
) q
WHERE h.country = 'USA';


/* ---- C. COLORECTAL ADDITIONS ----
   Same test, colorectal. This is the number the job exists for. Reported alongside
   today's board so the delta is legible rather than a bare count. */
SELECT 'C. colorectal additions' AS section,
       (SELECT count(*) FROM public.community_board_v1 b
        JOIN public.therapeutic_areas t2 ON t2.id = b.ta_id
        WHERE t2.slug = 'colorectal-cancer')                     AS board_rows_today,
       (SELECT count(*) FROM public.community_board_v1 b
        JOIN public.therapeutic_areas t2 ON t2.id = b.ta_id
        WHERE t2.slug = 'colorectal-cancer' AND b.qualifies)     AS qualifying_today,
       count(*)                                                  AS usa_scored_rows,
       count(*) FILTER (WHERE q.qualifies)                       AS would_be_added
FROM public.hcp_community_scores_v2 c
JOIN public.hcps_v2 h ON h.id = c.hcp_id
JOIN public.therapeutic_areas ta ON ta.id = c.therapeutic_area_id AND ta.slug = 'colorectal-cancer'
CROSS JOIN LATERAL (
  SELECT (c.patient_volume > 0
          OR EXISTS (SELECT 1 FROM public.hcp_part_d_oncology_v1 pd WHERE pd.hcp_id = c.hcp_id))
         AS qualifies
) q
WHERE h.country = 'USA';


/* ---- D. WHICH TIER THE COLORECTAL ADDITIONS WOULD LAND IN ----
   hcp_evidence_tier_v1's partb_practice_v1 branch also carries `WHERE h.country = 'US'`,
   so a USA row produces no tier row at all today -- it is invisible to the model, not
   tiered-and-hidden. This recomputes branch 3 for those rows exactly as block 52
   defines it, so the per-tier breakdown of the additions is a prediction of what the
   board would show rather than a lookup of something already computed.

   Transcribed from docs/crc_community/52: roles from ta_hcpcs_codes.pattern_role, the
   never_upgrades stop, the valid_from/valid_to year window, the full-set taxonomy gate
   with the primary as fallback, and anchored/supported collapsed with bool_or across
   program years. The ONLY change is the country predicate.

   NOTE ON patient_volume. It is 0 for every colorectal row in hcp_community_scores_v2,
   so qualification here is entirely Part D presence -- an added row is one that has a
   hcp_part_d_oncology_v1 row, whatever its Part B pattern says. A physician can clear
   the anchored limb set and still not qualify, and D reports that case separately
   rather than folding it into the tier counts. */
WITH crc AS (SELECT id FROM public.therapeutic_areas WHERE slug = 'colorectal-cancer'),
usa_cohort AS (
  SELECT c.hcp_id,
         (c.patient_volume > 0
          OR EXISTS (SELECT 1 FROM public.hcp_part_d_oncology_v1 pd WHERE pd.hcp_id = c.hcp_id))
         AS qualifies
  FROM public.hcp_community_scores_v2 c
  JOIN public.hcps_v2 h ON h.id = c.hcp_id
  WHERE c.therapeutic_area_id = (SELECT id FROM crc) AND h.country = 'USA'
),
onc_taxonomy AS (
  SELECT h.id AS hcp_id
  FROM public.hcps_v2 h
  LEFT JOIN public.hcp_nppes_detail_v2 nd ON nd.hcp_id = h.id
  WHERE CASE
          WHEN nd.nppes_taxonomies IS NULL
            THEN h.npi_taxonomy IN ('207RX0202X', '207RH0000X', '207RH0003X')
          ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(nd.nppes_taxonomies) e
                        WHERE e ->> 'code' IN ('207RX0202X', '207RH0000X', '207RH0003X'))
        END
),
partb_year AS (
  SELECT d.hcp_id, d.program_year,
         bool_or(k.pattern_role = 'vegf')             AS vegf,
         bool_or(k.pattern_role = 'backbone')         AS backbone,
         bool_or(k.pattern_role = 'fluoropyrimidine') AS fluoropyrimidine
  FROM public.ta_hcpcs_codes k
  JOIN public.hcp_hcpcs_detail d
    ON d.hcpcs_code = k.hcpcs_code
   AND (k.valid_from IS NULL OR d.program_year >= EXTRACT(YEAR FROM k.valid_from))
   AND (k.valid_to   IS NULL OR d.program_year <= EXTRACT(YEAR FROM k.valid_to))
  WHERE k.therapeutic_area_id = (SELECT id FROM crc)
    AND k.pattern_role IS NOT NULL
    AND NOT k.never_upgrades
  GROUP BY d.hcp_id, d.program_year
),
partb_pattern AS (
  SELECT y.hcp_id,
         bool_or(y.vegf AND y.backbone AND y.fluoropyrimidine)     AS anchored,
         bool_or(y.backbone AND y.fluoropyrimidine AND NOT y.vegf) AS supported
  FROM partb_year y
  JOIN onc_taxonomy o ON o.hcp_id = y.hcp_id
  GROUP BY y.hcp_id
),
tiered AS (
  SELECT u.hcp_id, u.qualifies,
         CASE
           WHEN p.anchored  THEN 'anchored'
           WHEN p.supported THEN 'supported'
           WHEN EXISTS (SELECT 1 FROM public.hcp_part_d_oncology_v1 pd WHERE pd.hcp_id = u.hcp_id)
                          THEN 'candidate'
           ELSE 'unresolved'
         END AS tier
  FROM usa_cohort u
  LEFT JOIN partb_pattern p ON p.hcp_id = u.hcp_id
)
SELECT 'D. colorectal additions by tier' AS section,
       tier,
       count(*)                                  AS usa_cohort_rows,
       count(*) FILTER (WHERE qualifies)         AS would_join_the_board,
       count(*) FILTER (WHERE NOT qualifies)     AS clears_the_tier_but_does_not_qualify
FROM tiered
GROUP BY tier
ORDER BY count(*) FILTER (WHERE qualifies) DESC;


/* ---- E. THE ADJACENT SPLIT, MEASURED AND NOT TOUCHED ----
   A2 shows 18 full country names alongside their ISO-2 codes -- China/CN, Japan/JP,
   Spain/ES and so on. That is the SAME defect as US/USA and it is explicitly out of
   scope: no board tests those values, so nothing is hidden by them today. Measured
   here so the number exists before someone asks, and so the CHECK added in 04 is
   understood as guarding one value rather than solving the class. */
SELECT 'E. long-name / ISO2 pairs (out of scope)' AS section,
       count(*)                       AS affected_rows,
       count(DISTINCT h.country)      AS affected_spellings
FROM public.hcps_v2 h
WHERE h.country IS NOT NULL
  AND length(btrim(h.country)) <> 2
  AND upper(btrim(h.country)) <> 'USA';
