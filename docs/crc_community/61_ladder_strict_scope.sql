/* ==== 61. CLOSE THE STRICT ARM -- SCOPE THE LAST anchor_grade READS BY drug_group ====

   Block 60 scoped dominant_rows, cross_rows and supporting_grade_rows, and measured
   this one in its section E rather than closing it: non_lung_strict_rows_now = 0,
   non_lung_strict_stems_curated = 1. This is that line paid.

   THE REMAINING SITES. Five reads of anchor_grade in hcp_nsclc_evidence_tier_v1 still
   had no drug_group predicate, all of them on 'strict':

       strict_rows      count(*) FILTER (WHERE anchor_grade = 'strict')
       years_anchored   count(DISTINCT program_year) FILTER (...)
       anchor_years     array_agg(DISTINCT program_year) FILTER (...)
       anchor_stems     array_agg(DISTINCT drug_stem) FILTER (...)
       anchor CTE       WHERE anchor_grade = 'strict'   -- supplies anchor_stem

   Same defect as 60: anchor_grade is per-(drug, TA), resolved at ingest against the TA
   the drug belongs to, and this view is a single-TA consumer that reads it as a lung
   grade.

   WHY THIS ARM IS WORSE THAN THE ONE 60 CLOSED, ON TWO COUNTS.

   FIRST, IT PRODUCES ANCHORED. strict_rows > 0 is the first branch of the CASE, so it
   outranks everything: a non-lung strict row does not nudge someone from candidate to
   supported, it puts them at the top of the lung ladder. And the four aggregates above
   are what the profile renders for an anchored row -- anchor_stem, anchor_stems,
   anchor_years, recurrence_band. An HCP anchored this way would display a colorectal
   drug, by name, as their lung anchor, with the years they prescribed it.

   SECOND, IT NEEDS LESS TO GO WRONG. Block 60's defect required the ingest to write
   grades that did not exist yet. This one does not: fruquintinib is ALREADY graded
   strict for colorectal in part_d_oncology_drugs_v1, and 65 hcp_part_d_oncology_v1 rows
   across 65 HCPs -- 19 of them on the lung board -- need only to acquire that grade in
   the denormalised copy. Which is exactly what the next part_d_oncology_ingest.py run
   does: it resolves anchor_grade from the vocabulary table and the upsert sets
   anchor_grade = EXCLUDED.anchor_grade.

   THE WINDOW IS STILL OPEN, MEASURED 2026-09-17 IMMEDIATELY BEFORE THIS RAN:

       non-lung rows carrying ANY grade:    0
       non-lung rows carrying 'strict':     0

   so every row this predicate excludes is already excluded by carrying no grade, and
   the change cannot move a tier. Block 60's reasoning exactly, on the arm that matters
   more. This file proves it per-HCP rather than asserting it.

   WHAT CHANGES: five boolean predicates. Everything else is transcribed from
   pg_get_viewdef read 2026-09-17 -- which already includes block 60's three scoped
   counters -- with no other edit. lung_rows and heme_fills were already correct and are
   untouched. Verified mechanically while generating this file: the transcription differs
   from the live definition by exactly five insertions and nothing else.

   ------------------------------------------------------------------------
   SECTION A PROVES SOMETHING ONLY ON THE FIRST RUN. Carried forward from block 60,
   because it is just as true here. v61_before is populated from whatever definition is
   live when the file starts, so once the scoped view is in place a re-run compares it
   against itself and reports four zeros for free. That is not the check regressing, it
   is the check being spent. The evidence is the first run's output and it belongs in the
   commit message. Re-running is safe and idempotent -- CREATE OR REPLACE with an
   identical body -- but only sections B, C, D and E still mean anything afterwards.

   SECTION E IS WHAT CLOSES THE CLASS. Scoping five more instances is worth little if
   the next person has to rediscover whether any remain. E enumerates every anchor_grade
   read in the live definition and asserts that none lacks the predicate -- so the
   invariant is checkable in one query instead of by reading the view.
   ------------------------------------------------------------------------ */


/* ---- BEFORE: the pre-change answer, per HCP, materialised ----
   The diff must be computed against the OLD DEFINITION, not against headline totals: a
   total that matches while two people swapped tiers is not zero delta. run_sql.py sends
   this file as one transaction, so this snapshot is taken before the CREATE OR REPLACE
   below and survives to be compared against after it. */
CREATE TEMP TABLE v61_before AS
SELECT * FROM public.hcp_nsclc_evidence_tier_v1;
CREATE INDEX ON v61_before (hcp_id);
ANALYZE v61_before;


/* ---- THE CHANGE ----
   CREATE OR REPLACE, not DROP: hcp_evidence_tier_v1 branch 1 selects from this view and
   community_board_v1 selects from that, so a DROP fails on the dependency and a CASCADE
   would silently take the board. Column list and types are identical, which is what
   CREATE OR REPLACE requires and what keeps both dependents valid. Grants ride through.

   The five added predicates all read
       AND hcp_part_d_oncology_v1.drug_group = 'lung'::text
   appended to an existing anchor_grade = 'strict' test -- four inside FILTER (WHERE ...)
   and one in the anchor CTE's WHERE. Both are boolean contexts, so the shape of each
   clause is unchanged. */

CREATE OR REPLACE VIEW public.hcp_nsclc_evidence_tier_v1 AS
WITH ta AS (
         SELECT therapeutic_areas.id
           FROM therapeutic_areas
          WHERE therapeutic_areas.slug = 'nsclc'::text
        ), params AS (
         SELECT 24::numeric AS oral_floor
        ), cohort AS (
         SELECT c.hcp_id,
            h.npi_number AS npi
           FROM hcp_community_scores_v2 c
             JOIN hcps_v2 h ON h.id = c.hcp_id
             CROSS JOIN ta
          WHERE c.therapeutic_area_id = ta.id AND h.country = 'US'::text
        ), pd AS (
         SELECT hcp_part_d_oncology_v1.hcp_id,
            count(*) AS pd_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS strict_rows,
            count(DISTINCT hcp_part_d_oncology_v1.program_year) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS years_anchored,
            array_agg(DISTINCT hcp_part_d_oncology_v1.program_year ORDER BY hcp_part_d_oncology_v1.program_year) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS anchor_years,
            array_agg(DISTINCT hcp_part_d_oncology_v1.drug_stem ORDER BY hcp_part_d_oncology_v1.drug_stem) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS anchor_stems,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'dominant'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS dominant_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'cross_indication'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS cross_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'supporting'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS supporting_grade_rows,
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS lung_rows
           FROM hcp_part_d_oncology_v1
          GROUP BY hcp_part_d_oncology_v1.hcp_id
        ), pb AS (
         SELECT hcp_hcpcs_detail.hcp_id,
            bool_or(hcp_hcpcs_detail.hcpcs_code = ANY (ARRAY['J9305'::text, 'J9304'::text])) AS has_pemetrexed,
            bool_or(hcp_hcpcs_detail.hcpcs_code = 'J9173'::text) AS has_durvalumab,
            bool_or(hcp_hcpcs_detail.hcpcs_drug_indicator = 'Y'::text) AS has_any_partb_drug
           FROM hcp_hcpcs_detail
          GROUP BY hcp_hcpcs_detail.hcp_id
        ), pd_year AS (
         SELECT hcp_part_d_oncology_v1.hcp_id,
            hcp_part_d_oncology_v1.program_year,
            sum(hcp_part_d_oncology_v1.tot_30day_fills) AS total_fills,
            sum(hcp_part_d_oncology_v1.tot_30day_fills) FILTER (WHERE hcp_part_d_oncology_v1.drug_group = 'heme'::text) AS heme_fills,
            sum(hcp_part_d_oncology_v1.tot_30day_fills) FILTER (WHERE hcp_part_d_oncology_v1.drug_group = 'lung'::text) AS lung_fills
           FROM hcp_part_d_oncology_v1
          GROUP BY hcp_part_d_oncology_v1.hcp_id, hcp_part_d_oncology_v1.program_year
        ), heme_flag AS (
         SELECT pd_year.hcp_id,
            bool_or(pd_year.total_fills >= (( SELECT params.oral_floor
                   FROM params)) AND pd_year.heme_fills > (0.70 * pd_year.total_fills)) AS heme_dominant_year
           FROM pd_year
          GROUP BY pd_year.hcp_id
        ), recent_oral AS (
         SELECT DISTINCT ON (pd_year.hcp_id) pd_year.hcp_id,
            pd_year.program_year AS oral_recent_year,
            pd_year.total_fills AS oral_denominator,
                CASE
                    WHEN pd_year.total_fills > 0::numeric THEN COALESCE(pd_year.lung_fills, 0::numeric) / pd_year.total_fills
                    ELSE NULL::numeric
                END AS lung_share
           FROM pd_year
          WHERE pd_year.total_fills IS NOT NULL
          ORDER BY pd_year.hcp_id, pd_year.program_year DESC
        ), anchor AS (
         SELECT DISTINCT ON (hcp_part_d_oncology_v1.hcp_id) hcp_part_d_oncology_v1.hcp_id,
            hcp_part_d_oncology_v1.drug_stem AS anchor_stem
           FROM hcp_part_d_oncology_v1
          WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text AND hcp_part_d_oncology_v1.drug_group = 'lung'::text
          GROUP BY hcp_part_d_oncology_v1.hcp_id, hcp_part_d_oncology_v1.drug_stem
          ORDER BY hcp_part_d_oncology_v1.hcp_id, (count(DISTINCT hcp_part_d_oncology_v1.program_year)) DESC, hcp_part_d_oncology_v1.drug_stem
        )
 SELECT co.hcp_id,
    co.npi,
    t.tier,
        CASE
            WHEN t.tier = 'anchored'::text THEN COALESCE(pd.years_anchored, 0::bigint)
            ELSE NULL::bigint
        END AS years_anchored,
        CASE
            WHEN t.tier = 'anchored'::text THEN
            CASE
                WHEN COALESCE(pd.years_anchored, 0::bigint) >= 2 THEN 'recurs'::text
                ELSE 'single_year'::text
            END
            ELSE NULL::text
        END AS recurrence_band,
        CASE
            WHEN t.tier = 'anchored'::text THEN a.anchor_stem
            ELSE NULL::text
        END AS anchor_stem,
        CASE
            WHEN t.tier = 'anchored'::text THEN pd.anchor_stems
            ELSE NULL::text[]
        END AS anchor_stems,
        CASE
            WHEN t.tier = 'anchored'::text THEN pd.anchor_years
            ELSE NULL::integer[]
        END AS anchor_years,
        CASE
            WHEN t.tier = 'supported'::text THEN t.supported_rank
            ELSE NULL::integer
        END AS supported_evidence_rank,
        CASE
            WHEN t.tier = 'supported'::text THEN (ARRAY['pemetrexed (Part B)'::text, 'durvalumab, thoracic-enriched (Part B)'::text, 'lung-dominant oral'::text, 'cross-indication targeted oral'::text, 'cross-indication targeted therapy observed'::text])[t.supported_rank]
            ELSE NULL::text
        END AS supported_evidence,
    ro.lung_share,
    ro.oral_denominator,
    ro.oral_recent_year,
    COALESCE(ro.lung_share >= 0.30 AND ro.oral_denominator >= (( SELECT params.oral_floor
           FROM params)), false) AS lung_weighted
   FROM cohort co
     LEFT JOIN pd ON pd.hcp_id = co.hcp_id
     LEFT JOIN pb ON pb.hcp_id = co.hcp_id
     LEFT JOIN heme_flag hf ON hf.hcp_id = co.hcp_id
     LEFT JOIN recent_oral ro ON ro.hcp_id = co.hcp_id
     LEFT JOIN anchor a ON a.hcp_id = co.hcp_id
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN COALESCE(pd.strict_rows, 0::bigint) > 0 THEN 'anchored'::text
                    WHEN COALESCE(pb.has_pemetrexed, false) OR COALESCE(pb.has_durvalumab, false) OR (COALESCE(pd.dominant_rows, 0::bigint) + COALESCE(pd.cross_rows, 0::bigint) + COALESCE(pd.supporting_grade_rows, 0::bigint)) > 0 THEN 'supported'::text
                    WHEN COALESCE(hf.heme_dominant_year, false) AND COALESCE(pd.lung_rows, 0::bigint) = 0 THEN 'heme_dominant'::text
                    WHEN COALESCE(pd.pd_rows, 0::bigint) > 0 OR COALESCE(pb.has_any_partb_drug, false) THEN 'candidate'::text
                    ELSE 'unresolved'::text
                END AS tier,
                CASE
                    WHEN COALESCE(pb.has_pemetrexed, false) THEN 1
                    WHEN COALESCE(pb.has_durvalumab, false) THEN 2
                    WHEN COALESCE(pd.dominant_rows, 0::bigint) > 0 THEN 3
                    WHEN COALESCE(pd.cross_rows, 0::bigint) > 0 THEN 4
                    WHEN COALESCE(pd.supporting_grade_rows, 0::bigint) > 0 THEN 5
                    ELSE NULL::integer
                END AS supported_rank) t;;


/* ======================= VERIFY -- ZERO DELTA IS THE PASS ======================= */


/* ---- A. THE PER-HCP DIFF. THIS IS THE CHECK; B THROUGH D CORROBORATE ----
   Against v61_before, which holds the pre-change definition's own output. Four counts,
   all of which must be 0.

   any_column_changed is a to_jsonb whole-row comparison rather than a tier test, and on
   THIS arm that is not merely extra rigour -- it is the point. The four aggregates this
   file scopes (years_anchored, anchor_years, anchor_stems, and anchor_stem via the
   anchor CTE) are all rendered on an anchored row, and every one of them could change
   while the tier stayed 'anchored'. A tier-only diff would report zero while an HCP's
   displayed anchor drug silently changed. */
SELECT 'A. per-HCP diff' AS check,
       (SELECT count(*) FROM v61_before b
          JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
         WHERE a.tier IS DISTINCT FROM b.tier)                                  AS tier_changed_must_be_0,
       (SELECT count(*) FROM v61_before b
          JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
         WHERE to_jsonb(a.*) IS DISTINCT FROM to_jsonb(b.*))                    AS any_column_changed_must_be_0,
       (SELECT count(*) FROM v61_before b
          LEFT JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
         WHERE a.hcp_id IS NULL)                                                AS hcps_lost_must_be_0,
       (SELECT count(*) FROM public.hcp_nsclc_evidence_tier_v1 a
          LEFT JOIN v61_before b ON b.hcp_id = a.hcp_id
         WHERE b.hcp_id IS NULL)                                                AS hcps_gained_must_be_0;

/* On a failure, name the people rather than the count -- and show the anchor columns,
   since those are the ones this file can move without touching the tier. 0 rows on a
   pass. ANY ROW HERE IS A STOP: it means a non-lung strict grade is already in the
   table and the inert window has closed. */
SELECT 'A2. movers (expect 0 rows)' AS check,
       b.hcp_id,
       b.tier AS tier_before,          a.tier AS tier_after,
       b.anchor_stem AS stem_before,   a.anchor_stem AS stem_after,
       b.anchor_stems AS stems_before, a.anchor_stems AS stems_after,
       b.years_anchored AS years_before, a.years_anchored AS years_after
FROM v61_before b
JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
WHERE to_jsonb(a.*) IS DISTINCT FROM to_jsonb(b.*)
ORDER BY b.hcp_id
LIMIT 20;


/* ---- B. BOARD MEMBERS ----  EXPECT 4,915, unchanged. */
SELECT 'B. board members' AS check,
       count(*) FILTER (WHERE b.qualifies)          AS members,
       4915                                         AS expected,
       (count(*) FILTER (WHERE b.qualifies) = 4915) AS unchanged
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
WHERE ta.slug = 'nsclc';


/* ---- C. ON-BOARD TIERS ----
   EXPECT anchored 980 · candidate 2,748 · heme_dominant 629 · unresolved 464 ·
   supported 94, summing to 4,915. */
SELECT 'C. on-board tiers' AS check,
       b.evidence_tier,
       count(*) AS on_board,
       CASE b.evidence_tier
         WHEN 'anchored' THEN 980 WHEN 'candidate' THEN 2748
         WHEN 'heme_dominant' THEN 629 WHEN 'unresolved' THEN 464
         WHEN 'supported' THEN 94 END AS expected
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id
WHERE ta.slug = 'nsclc' AND b.qualifies
GROUP BY b.evidence_tier
ORDER BY count(*) DESC;


/* ---- D. COHORT TIERS ----
   unresolved is 8,808 and not the 8,547 that predates docs/country_normalisation/02:
   that normalised 19,304 hcps_v2 rows from 'USA' to 'US' and this view's cohort CTE
   filters h.country = 'US', so 261 previously-invisible nsclc-scored HCPs entered the
   cohort. All 261 land in unresolved and none of them qualifies, which is why B and C
   are unmoved. Attributed in the last column rather than asserted, exactly as block 60
   does.

   EXPECT anchored 980 · candidate 2,798 · heme_dominant 629 · supported 94 ·
   unresolved 8,808, summing to 13,309. */
SELECT 'D. cohort tiers' AS check,
       tier,
       count(*) AS rows,
       CASE tier
         WHEN 'anchored' THEN 980 WHEN 'candidate' THEN 2798
         WHEN 'heme_dominant' THEN 629 WHEN 'supported' THEN 94
         WHEN 'unresolved' THEN 8808 END AS expected,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.hcps_v2_country_usa_snapshot_20260915 s
          WHERE s.id = e.hcp_id))        AS of_which_country_normalised
FROM public.hcp_nsclc_evidence_tier_v1 e
GROUP BY tier
ORDER BY count(*) DESC;


/* ---- E. THE CLASS, NOT THE INSTANCE ----
   Every read of anchor_grade in the LIVE definition, with whether it carries a
   drug_group predicate. Read from pg_get_viewdef rather than from this file, so it
   describes what is deployed and not what was intended.

   This is the invariant blocks 60 and 61 exist to establish, and it is the thing worth
   keeping: any future edit that adds an unscoped anchor_grade read shows up here as a
   FALSE. Re-run it any time -- it needs nothing from the snapshot above.

   EXPECT 8 sites, 8 scoped, 0 unscoped -- 5 from this file, 3 from block 60. */
WITH occ AS (
  SELECT (regexp_matches(
            pg_get_viewdef('public.hcp_nsclc_evidence_tier_v1'::regclass, true),
            '(anchor_grade = ''[a-z_]+''::text( AND hcp_part_d_oncology_v1\.drug_group = ''lung''::text)?)',
            'g')) AS m
)
SELECT 'E. anchor_grade sites' AS check,
       count(*)                                    AS sites,
       8                                           AS expect_sites,
       count(*) FILTER (WHERE m[2] IS NOT NULL)    AS scoped,
       count(*) FILTER (WHERE m[2] IS NULL)        AS unscoped_must_be_0
FROM occ;

/* And the sites themselves, so a non-zero above is readable without a second query.
   EXPECT 8 rows, every scoped = true. */
WITH occ AS (
  SELECT (regexp_matches(
            pg_get_viewdef('public.hcp_nsclc_evidence_tier_v1'::regclass, true),
            '(anchor_grade = ''[a-z_]+''::text( AND hcp_part_d_oncology_v1\.drug_group = ''lung''::text)?)',
            'g')) AS m
)
SELECT 'E2. site detail' AS check,
       m[1]                    AS site,
       (m[2] IS NOT NULL)      AS scoped
FROM occ
ORDER BY (m[2] IS NOT NULL), m[1];

/* The data-side half of the same invariant: the predicate only matters because the
   table can hold a non-lung grade. It does not today, and that is why A can report zero
   delta. After the next ingest these stop being 0 and the predicates start earning
   their keep. EXPECT 0 / 0 today. */
SELECT 'E3. non-lung grades in the table' AS check,
       count(*) FILTER (WHERE anchor_grade IS NOT NULL)          AS any_grade,
       count(*) FILTER (WHERE anchor_grade = 'strict')           AS strict_grade
FROM public.hcp_part_d_oncology_v1
WHERE drug_group <> 'lung';
