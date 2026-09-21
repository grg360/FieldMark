/* ==== 01. SNAPSHOT THE AFFECTED IDS BEFORE ANYTHING IS WRITTEN ====
   A revert has to exist before the thing it reverts. This records exactly which
   rows 02 is about to touch, so the update can be undone against the recorded set
   rather than against `WHERE country = 'US'` -- which after 02 also matches the
   92,611 rows that were always 'US' and must never be sent back to 'USA'.

   A PLAIN TABLE, NOT A TEMP TABLE. run_sql.py opens a connection per invocation, so
   a temp table would not survive to 02. It is also the point: the revert must still
   exist tomorrow, from a different session, after this terminal is closed.

   IT IS A FULL ROW COPY, not just ids. If something downstream turns out to have
   depended on the old value, the answer to "what did this row look like" is in the
   snapshot rather than in a reconstruction. 19,304 rows is cheap.

   IDEMPOTENT BY REFUSAL, NOT BY REPLACEMENT. If the table already exists this file
   stops rather than overwriting it -- a second run after 02 would capture zero rows
   and quietly destroy the only copy of the pre-update state. */

DO $$
BEGIN
  IF to_regclass('public.hcps_v2_country_usa_snapshot_20260915') IS NOT NULL THEN
    RAISE EXCEPTION
      'snapshot table already exists -- 01 has run. Refusing to overwrite the only '
      'copy of the pre-update state. Inspect it, and drop it deliberately if you '
      'really mean to re-snapshot.'
      USING ERRCODE = '42P07';   -- duplicate_table
  END IF;
END $$;

CREATE TABLE public.hcps_v2_country_usa_snapshot_20260915 AS
SELECT h.*, now() AS snapshot_taken_at
FROM public.hcps_v2 h
WHERE h.country = 'USA';

CREATE INDEX ON public.hcps_v2_country_usa_snapshot_20260915 (id);

COMMENT ON TABLE public.hcps_v2_country_usa_snapshot_20260915 IS
  'Full row copy of every hcps_v2 row holding country = ''USA'' immediately before '
  'docs/country_normalisation/02 normalised them to ''US''. The revert is '
  'UPDATE hcps_v2 SET country = ''USA'' FROM this table WHERE id matches -- run it '
  'against the recorded id set, never against country = ''US'', which after 02 also '
  'matches the 92,611 rows that were always US. Drop when the change is settled; it '
  'is a backup, not a source. NEEDS NO ta_neutrality_allowlist.tsv ROW: the name '
  'carries no TA token, and validate_ta_neutrality.py was re-run after 05 and still '
  'reports the same single pre-existing NEW finding.';

/* Grants deliberately NOT given to anon or authenticated: this is operational state,
   not application data, and nothing should be able to read a stale country off it. */
GRANT SELECT ON public.hcps_v2_country_usa_snapshot_20260915 TO service_role;

/* EXPECT 19,304 rows, every one of them 'USA', and the live table still holding the
   same 19,304 -- nothing has been changed yet. */
SELECT 'snapshot' AS check,
       (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915)                      AS snapshot_rows,
       19304                                                                                    AS expect_rows,
       (SELECT count(*) FROM public.hcps_v2_country_usa_snapshot_20260915 WHERE country <> 'USA') AS not_usa_expect_0,
       (SELECT count(*) FROM public.hcps_v2 WHERE country = 'USA')                              AS live_usa_rows_still,
       (SELECT count(*) FROM public.hcps_v2 WHERE country = 'US')                               AS live_us_rows_before;
