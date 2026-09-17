/* ==== 60. SCOPE THE LUNG LADDER'S GRADE COUNTS BY drug_group ====

   THE DEFECT, AND WHY IT WAS INVISIBLE. hcp_part_d_oncology_v1.anchor_grade is a
   per-(drug, TA) column: it is resolved at ingest by joining part_d_oncology_drugs_v1
   on stem AND program_year, and it grades the drug FOR THE TA THAT DRUG BELONGS TO.
   hcp_nsclc_evidence_tier_v1 is a single-TA consumer -- its cohort CTE is hardcoded to
   the nsclc slug -- and it counts that column with no drug_group predicate:

       count(*) FILTER (WHERE anchor_grade = 'dominant')         AS dominant_rows
       count(*) FILTER (WHERE anchor_grade = 'cross_indication') AS cross_rows
       count(*) FILTER (WHERE anchor_grade = 'supporting')       AS supporting_grade_rows

   so it reads "graded for its own TA" as "graded for lung". The predicate was never
   NEEDED because every graded row in the table was a lung row, and it was never MISSED
   because a correct answer and an accidentally-correct answer are the same output. Two
   sibling counters in the same CTE -- lung_rows, and heme_fills in pd_year -- do filter
   on drug_group explicitly, which is what makes this an omission rather than a design.

   IT HAS ALREADY COST ONCE. docs/crc_community/50 deviation 4: grading trifluridine
   'dominant' and regorafenib 'cross_indication' moved lung supported 94 -> 244, giving
   130 physicians supported_evidence reading "lung-dominant oral" on the strength of
   prescribing a colorectal drug. Block 50 had to withhold the grades from the
   denormalised copy to undo it -- treating the symptom, because block 26 had ruled the
   ladder untouchable: 4,915 members' tiers can move with no error anywhere.

   WHY IT IS SAFE TO TOUCH TODAY, AND ONLY TODAY. That risk is a property of the DATA,
   not of the edit. The ladder can only mis-tier someone if a non-lung row carries a
   grade, and block 50's withholding means none does. Measured 2026-09-17:

       lung        3,934 rows   3,934 graded
       heme       31,618 rows       0 graded
       breast     28,876 rows       0 graded
       prostate   11,112 rows       0 graded
       gi_renal    4,076 rows       0 graded
       colorectal    372 rows       0 graded
       -- non-lung rows carrying any grade: 0

   With that table, `AND drug_group = 'lung'` cannot change a single tier, because every
   row the filter would remove is already excluded by carrying no grade. The change is
   provably inert, and this file proves it per-HCP rather than asserting it.

   THE WINDOW CLOSES ON THE NEXT INGEST. part_d_oncology_ingest.py --dry-run measured
   2026-09-15 that a run would write 1,662 non-lung-graded rows across five colorectal
   stems, touching 369 HCPs on the lung board. After that the fix stops being inert and
   starts being a tier migration. Run this first.

   WHAT CHANGES: three FILTER clauses. Everything else is transcribed verbatim from
   pg_get_viewdef read 2026-09-17 -- the CASE ladder, the supported_rank ordering, the
   0.70 heme share, the oral_floor of 24, pd_year, recent_oral, the anchor CTE, the
   DISTINCT ON orderings and every output column. lung_rows and heme_fills are untouched
   because they already carry the predicate.

   ------------------------------------------------------------------------
   ONE PATH IS DELIBERATELY LEFT OPEN, AND IT IS THE WORST ONE. SEE SECTION E.

   strict_rows -- and with it years_anchored, anchor_years, anchor_stems and the anchor
   CTE -- filters on `anchor_grade = 'strict'` with no drug_group predicate, exactly as
   the three counters below did. It is NOT scoped here, because this file was specified
   as three counters and this change has to stay independently revertable.

   It is the same defect on the arm that produces ANCHORED rather than supported, and
   part_d_oncology_drugs_v1 already grades a colorectal stem strict (fruquintinib). The
   dry run measured 65 rows / 65 HCPs, 19 of them on the lung board today. Section E
   measures the gap rather than closing it, so the next person reads a number instead of
   rediscovering the class. It is inert under the same window and for the same reason,
   so it costs one more line whenever it is wanted -- but only before the ingest.
   ------------------------------------------------------------------------ */


/* ---- BEFORE: the pre-change answer, per HCP, materialised ----
   The per-HCP diff has to be computed against the OLD DEFINITION, not against the
   headline totals. A total that matches while two people swapped tiers is not zero
   delta, and only a row-level comparison can tell those apart. run_sql.py sends this
   file as one transaction, so this snapshot is taken before the CREATE OR REPLACE below
   and survives to be compared against after it. */
CREATE TEMP TABLE v60_before AS
SELECT * FROM public.hcp_nsclc_evidence_tier_v1;
CREATE INDEX ON v60_before (hcp_id);
ANALYZE v60_before;


/* ---- THE CHANGE ----
   CREATE OR REPLACE, not DROP: hcp_evidence_tier_v1 branch 1 selects from this view and
   community_board_v1 selects from that, so a DROP fails on the dependency and a CASCADE
   would silently take the board. The column list and types are identical, which is what
   CREATE OR REPLACE requires and what keeps both dependents valid. Grants ride through. */

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
            count(*) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS strict_rows,
            count(DISTINCT hcp_part_d_oncology_v1.program_year) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS years_anchored,
            array_agg(DISTINCT hcp_part_d_oncology_v1.program_year ORDER BY hcp_part_d_oncology_v1.program_year) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS anchor_years,
            array_agg(DISTINCT hcp_part_d_oncology_v1.drug_stem ORDER BY hcp_part_d_oncology_v1.drug_stem) FILTER (WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text) AS anchor_stems,
            /* SCOPED 2026-09-17 (block 60). The three grade counts that feed the
               `supported` arm now read LUNG grades only. anchor_grade is per-(drug, TA)
               and this view is a single-TA consumer; without the predicate a colorectal
               'dominant' row is counted as lung evidence. */
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
          WHERE hcp_part_d_oncology_v1.anchor_grade = 'strict'::text
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
                END AS supported_rank) t;


/* ======================= VERIFY -- ZERO DELTA IS THE PASS ======================= */


/* ---- A. THE PER-HCP DIFF. THIS IS THE CHECK; THE REST ARE CORROBORATION ----
   Compared against v60_before, which holds the pre-change definition's own output, so a
   swap is caught where a total would hide it. Three counts, all of which must be 0:
   tier changed, the row changed in ANY column, and the cohort itself gained or lost
   someone.

   The second is stricter than the brief asks for and is free: supported_evidence_rank
   and supported_evidence are both derived from the three counters this file touched, so
   a rank could in principle move from 3 to 4 while the tier stayed 'supported'. That
   would be a real change wearing a zero-delta disguise.

   THIS SECTION PROVES SOMETHING ONLY ON THE FIRST RUN. v60_before is populated from
   whatever definition is live when the file starts, so once the scoped view is in place
   a re-run compares it against itself and reports four zeros for free. That is not a
   regression of the check, it is the check being spent: the evidence lives in the first
   run's output, recorded in the commit message. Re-running this file is safe and
   idempotent -- CREATE OR REPLACE with an identical body -- but sections B, C and D are
   what still mean anything afterwards. */
SELECT 'A. per-HCP diff' AS check,
       (SELECT count(*) FROM v60_before b
          JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
         WHERE a.tier IS DISTINCT FROM b.tier)                                  AS tier_changed_must_be_0,
       (SELECT count(*) FROM v60_before b
          JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
         WHERE to_jsonb(a.*) IS DISTINCT FROM to_jsonb(b.*))                    AS any_column_changed_must_be_0,
       (SELECT count(*) FROM v60_before b
          LEFT JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
         WHERE a.hcp_id IS NULL)                                                AS hcps_lost_must_be_0,
       (SELECT count(*) FROM public.hcp_nsclc_evidence_tier_v1 a
          LEFT JOIN v60_before b ON b.hcp_id = a.hcp_id
         WHERE b.hcp_id IS NULL)                                                AS hcps_gained_must_be_0;

/* And if any of those is non-zero, name the people rather than the count. 0 rows on a
   pass; on a failure, the first 20 movers with both tiers. ANY ROW HERE IS A STOP -- it
   means a non-lung grade is already in the table and the inert window has closed. */
SELECT 'A2. movers (expect 0 rows)' AS check,
       b.hcp_id, b.tier AS tier_before, a.tier AS tier_after,
       b.supported_evidence AS evidence_before, a.supported_evidence AS evidence_after
FROM v60_before b
JOIN public.hcp_nsclc_evidence_tier_v1 a ON a.hcp_id = b.hcp_id
WHERE to_jsonb(a.*) IS DISTINCT FROM to_jsonb(b.*)
ORDER BY b.hcp_id
LIMIT 20;


/* ---- B. BOARD MEMBERS ----
   EXPECT 4,915, unchanged. */
SELECT 'B. board members' AS check,
       count(*) FILTER (WHERE b.qualifies) AS members,
       4915                                AS expected,
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
   The whole-cohort distribution, which is the figure block 50 deviation 4 moved.

   THE unresolved EXPECTATION IS 8,808, NOT 8,547, AND THAT IS NOT THIS FILE'S DOING.
   8,547 was measured before docs/country_normalisation/02 ran on 2026-09-15. That
   normalised 19,304 hcps_v2 rows from 'USA' to 'US', and this view's cohort CTE filters
   `h.country = 'US'`, so 261 previously-invisible nsclc-scored HCPs entered the cohort --
   exactly the delta docs/country_normalisation/05 predicted and measured.

   ATTRIBUTED RATHER THAN ASSUMED (2026-09-17): every one of the 261 joins the country
   snapshot table, every one lands in `unresolved`, and the other four tiers contain zero
   of them. 8,547 + 261 = 8,808; anchored 980, candidate 2,798, heme_dominant 629 and
   supported 94 are untouched. None of the 261 qualifies, which is why section B and
   section C -- the numbers a reader actually sees -- are unmoved.

   Quoting 8,547 here would have left a stale expectation that fails on every future run
   for a reason that has nothing to do with this change.

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
          WHERE s.id = e.hcp_id))                                     AS of_which_country_normalised
FROM public.hcp_nsclc_evidence_tier_v1 e
GROUP BY tier
ORDER BY count(*) DESC;


/* ---- E. THE PATH THIS FILE DID NOT CLOSE ----
   strict_rows, years_anchored, anchor_years, anchor_stems and the anchor CTE still read
   `anchor_grade = 'strict'` across every drug_group. Same defect, same column, and the
   arm it feeds produces ANCHORED -- the top tier -- rather than supported. A colorectal
   stem is already graded strict in part_d_oncology_drugs_v1.

   non_lung_strict_rows_now is 0 today, which is the whole reason section A can report
   zero delta. The other two columns are what arrives with the next ingest.

   EXPECT 0 / 1 / 65 -- and the moment the first is non-zero, this file's premise is
   gone and so is the window to fix the strict arm inertly. */
SELECT 'E. strict arm, unscoped' AS check,
       (SELECT count(*) FROM public.hcp_part_d_oncology_v1
         WHERE anchor_grade = 'strict' AND drug_group <> 'lung')          AS non_lung_strict_rows_now,
       (SELECT count(*) FROM public.part_d_oncology_drugs_v1
         WHERE anchor_grade = 'strict' AND drug_group <> 'lung')          AS non_lung_strict_stems_curated,
       65                                                                 AS rows_the_next_ingest_would_write,
       19                                                                 AS of_which_on_the_lung_board;
