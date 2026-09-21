/* ==== 02. USA -> US, AND CLOSE THE DOOR IN THE SAME TRANSACTION ====
   The write. run_sql.py sends this file as ONE implicit transaction, so the update
   and the guard commit together or not at all.

   WHY THE CHECK IS HERE AND NOT IN ITS OWN FILE. If the constraint were added after
   03 verified a clean table, there would be a window -- minutes, or however long the
   sequence takes -- in which the table is clean and still writable with 'USA'. Any
   ingest running in that window re-dirties it and 03 would have passed on state that
   no longer exists. Cleaning the data and making the old value unwritable is one
   operation; splitting it is what lets the split come back.

   NOT VALID IS DELIBERATE AND IS NOT A SHORTCUT. It makes the constraint enforce on
   every INSERT and UPDATE from this moment, without the full-table scan an immediate
   validation would take under ACCESS EXCLUSIVE. The scan happens in 04, after 03 has
   reported, under a weaker lock. If that validation fails, a row exists that this
   file did not expect and that is a finding -- it is not something to force past with
   NOT VALID left permanently in place.

   THE CHECK REJECTS ANY CASING, AND ANY PADDING. upper(btrim(country)) <> 'USA'
   catches 'usa', 'Usa', ' USA '. Section A of block 00 showed none of those exist
   today (distinct_values = distinct_normalised = 177, zero padded rows), which is
   exactly why the guard should cover them: the cheap time to refuse a value is
   before anyone writes it.

   NULL IS EXPLICITLY ALLOWED. 21,717 rows hold NULL and they are out of scope --
   country IS NULL means "not known", which is a different and honest claim from a
   wrong spelling. A CHECK returning NULL passes anyway, but the predicate says so
   out loud rather than relying on three-valued logic to do it quietly.

   THIS DOES NOT ADD ANYONE TO A BOARD. Measured in 00: zero nsclc rows and zero
   colorectal rows are added, because community_board_v1.qualifies is
   `patient_volume > 0 OR EXISTS(part D row)` and NOT ONE of the 19,304 USA rows has
   a hcp_part_d_oncology_v1 row, in any TA. What changes is that 19,043 colorectal
   and 261 nsclc rows become VISIBLE to the board view as non-qualifying rows, and
   526 colorectal physicians (211 anchored, 315 supported) acquire an evidence-tier
   row they did not have. They still do not appear on the board. See 05. */


/* ---- THE UPDATE ----
   EXPECT 19,304 rows affected. */
UPDATE public.hcps_v2
SET country = 'US'
WHERE country = 'USA';


/* ---- THE GUARD ---- */
ALTER TABLE public.hcps_v2
  DROP CONSTRAINT IF EXISTS hcps_v2_country_not_usa;
ALTER TABLE public.hcps_v2
  ADD CONSTRAINT hcps_v2_country_not_usa
  CHECK (country IS NULL OR upper(btrim(country)) <> 'USA')
  NOT VALID;

COMMENT ON CONSTRAINT hcps_v2_country_not_usa ON public.hcps_v2 IS
  'hcps_v2.country holds ONE spelling of the United States: US. The boards '
  '(community_board_v1, hcp_evidence_tier_v1) and the whole get_community_filtered '
  'family compare `= ''US''`, so a row written ''USA'' is invisible to every one of '
  'them regardless of what its claims say. 19,304 rows were normalised by '
  'docs/country_normalisation/02 on 2026-09-15. Documenting that did not stop it '
  'recurring -- two producers wrote the second spelling and four readers queried it, '
  'so neither side ever looked wrong. This constraint is the mechanism; the comment '
  'is not. It guards ONE value: the long-name/ISO-2 split for 18 other countries '
  '(1,172 rows) is the same defect, out of scope, and measured in block 00 section E.';


/* EXPECT zero 'USA' rows, and us_after = 92,611 + 19,304 = 111,915. */
SELECT 'post-update' AS check,
       count(*) FILTER (WHERE country = 'USA')                       AS usa_remaining_expect_0,
       count(*) FILTER (WHERE country = 'US')                        AS us_after,
       111915                                                        AS expect_us_after,
       count(*) FILTER (WHERE country IS NULL)                       AS nulls_untouched_expect_21717,
       count(*)                                                      AS total_rows_expect_400372
FROM public.hcps_v2;
