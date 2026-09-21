/* ==== 03. VERIFY THE COLUMN ====
   READ-ONLY apart from section F, which attempts one deliberately-illegal write
   inside a subtransaction and rolls it back whether it succeeds or fails -- net zero
   change, and the only way to show the guard bites rather than merely exists.

   Asks whether the column now holds one spelling, and whether the rows
   that changed are exactly the rows 01 recorded -- not merely the right COUNT of
   rows. A count matching by coincidence and a set matching are different facts, and
   only the second one licenses the revert.

   04 validates the constraint after this passes. */


/* ---- A. NO SECOND SPELLING SURVIVES ----
   Not just `country = 'USA'`: any casing, any padding, and the long-form spellings
   too, so this cannot pass on a value that is US-by-meaning under another name.
   EXPECT every count 0. */
SELECT 'A. us-spelling sweep' AS check,
       count(*) FILTER (WHERE country = 'USA')                                      AS exact_usa,
       count(*) FILTER (WHERE upper(btrim(country)) = 'USA')                        AS any_casing_or_padding,
       count(*) FILTER (WHERE upper(btrim(country)) IN
                              ('U.S.','U.S.A.','UNITED STATES',
                               'UNITED STATES OF AMERICA'))                         AS long_forms,
       0                                                                            AS expect_each
FROM public.hcps_v2;


/* ---- B. THE COLUMN'S NEW SHAPE ----
   EXPECT  US 111,915 (92,611 + 19,304) · NULL 21,717 · other 266,740 · 400,372 total
   and distinct_values one LOWER than before (177 -> 176), because 'USA' is gone and
   nothing new appeared. */
SELECT 'B. column shape' AS check,
       count(*)                                              AS rows,
       111915                                                AS expect_rows_us,
       count(*) FILTER (WHERE country = 'US')                AS us,
       count(*) FILTER (WHERE country IS NULL)               AS nulls,
       21717                                                 AS expect_nulls,
       count(*) FILTER (WHERE country IS NOT NULL
                          AND country <> 'US')               AS other,
       266740                                                AS expect_other,
       count(DISTINCT country)                               AS distinct_values,
       176                                                   AS expect_distinct
FROM public.hcps_v2;


/* ---- C. THE CHANGED SET IS THE RECORDED SET ----
   Every snapshot id must now read 'US', and no id outside the snapshot may have
   moved. The second half is the one that matters: it is what proves the UPDATE's
   WHERE clause did not reach further than intended.

   moved_but_not_recorded counts rows that are 'US' today, are NOT in the snapshot,
   and were not 'US' before. It cannot be computed directly after the fact -- the old
   value is gone for exactly the rows in question -- so it is expressed as the
   arithmetic identity instead: us_now must equal us_before + snapshot_rows. 00
   measured us_before as 92,611.

   EXPECT snapshot_rows 19,304 · all now US · identity holds. */
SELECT 'C. changed set' AS check,
       (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915)          AS snapshot_rows,
       (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915 s
         JOIN public.hcps_v2 h ON h.id = s.id
        WHERE h.country = 'US')                                                     AS snapshot_ids_now_us,
       (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915 s
         JOIN public.hcps_v2 h ON h.id = s.id
        WHERE h.country IS DISTINCT FROM 'US')                                      AS snapshot_ids_not_us_expect_0,
       (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915 s
         LEFT JOIN public.hcps_v2 h ON h.id = s.id
        WHERE h.id IS NULL)                                                         AS snapshot_ids_vanished_expect_0,
       (SELECT count(*) FROM public.hcps_v2 WHERE country = 'US')                   AS us_now,
       92611 + (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915)   AS expect_us_now,
       ((SELECT count(*) FROM public.hcps_v2 WHERE country = 'US')
        = 92611 + (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915)) AS identity_holds;


/* ---- D. THE SNAPSHOT STILL HOLDS THE OLD VALUE ----
   A snapshot taken as SELECT h.* is a copy, not a view, so the update must not have
   reached it. If this reads 'US' the revert is gone and the change is one-way.
   EXPECT 19,304 rows reading 'USA', 0 reading anything else. */
SELECT 'D. revert is intact' AS check,
       count(*)                                        AS snapshot_rows,
       count(*) FILTER (WHERE country = 'USA')         AS still_usa_expect_19304,
       count(*) FILTER (WHERE country <> 'USA')        AS drifted_expect_0
FROM public.hcps_v2_country_usa_snapshot_20260915;


/* ---- E. THE GUARD IS PRESENT, AND STILL NOT VALIDATED ----
   convalidated should be FALSE here -- 04 is what flips it. If it is already true,
   someone validated out of order and D above is the only thing that still proves the
   scan had something to find. */
SELECT 'E. constraint' AS check,
       con.conname,
       pg_get_constraintdef(con.oid) AS definition,
       con.convalidated              AS validated_expect_false
FROM pg_constraint con
WHERE con.conrelid = 'public.hcps_v2'::regclass
  AND con.conname = 'hcps_v2_country_not_usa';

/* ---- F. THE GUARD ACTUALLY REFUSES ----
   Asserting a constraint exists is not the same as showing it bites. This attempts a
   write the constraint must reject, inside a subtransaction that is rolled back
   either way, so nothing is left behind.
   EXPECT refused = true. A false here means the CHECK is decorative. */
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    UPDATE public.hcps_v2 SET country = 'USA'
    WHERE id = (SELECT id FROM public.hcps_v2 WHERE country = 'US' LIMIT 1);
    RAISE EXCEPTION 'probe_should_not_reach_here' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN check_violation THEN v_refused := true;
    WHEN OTHERS THEN v_refused := false;
  END;
  RAISE NOTICE 'F. guard refuses a USA write: %', v_refused;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'hcps_v2_country_not_usa did not reject a USA write -- the guard is decorative';
  END IF;
END $$;
