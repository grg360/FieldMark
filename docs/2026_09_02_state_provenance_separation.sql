/* ============================================================================
   SEPARATE THE PROVENANCE: institution state out of an NPPES-named column
   2026-09-02

   hcps_v2.nppes_practice_state holds 14,678 values that cannot have come from
   NPPES: the row has no npi_number, and for all but 2 of them no
   nppes_enriched_at, no zip, no taxonomy, no specialty, no practice setting and
   no career stage either. The values are institution states (Northwestern IL,
   Johns Hopkins MD, Dana-Farber MA); the ROR registry independently agrees with
   11,557 of them.

   The column is read by 22 functions and 1 view, displayed as a practice
   location and used as the territory filter. This moves the uncorroborated
   values to a column whose name matches what they are, and leaves
   nppes_practice_state containing only what its name claims.

   Run the blocks in order. Blocks 3 and 8 are SELECTs and must be READ, not
   just executed. Block 1 captures rollback state and must run FIRST.
   Nothing here is destructive while block 1's table survives.
   ============================================================================ */


/* ==== 1. ROLLBACK CAPTURE, RUN THIS FIRST ====
   Every value blocks 6 and 7 will clear, stored with its id before anything
   moves. Block 9 restores from this table verbatim.

   IF THIS BLOCK IS SKIPPED THE MIGRATION IS NOT REVERSIBLE. The values being
   moved have no other home: they are not derivable from ROR (2,538 of them
   disagree with the registry, 581 have no ROR at all), so a lost value is lost.

   Expect 14,676 rows. */

CREATE TABLE IF NOT EXISTS public.hcps_v2_state_provenance_rollback_20260902 AS
SELECT id,
       nppes_practice_state AS old_nppes_practice_state,
       nppes_practice_city  AS old_nppes_practice_city,
       derived_state        AS old_derived_state,
       now()                AS captured_at
FROM public.hcps_v2
WHERE npi_number IS NULL
  AND nppes_enriched_at IS NULL
  AND nppes_practice_zip IS NULL
  AND npi_taxonomy IS NULL
  AND npi_specialty IS NULL
  AND nppes_practice_setting IS NULL
  AND nppes_career_stage_years IS NULL
  AND (nppes_practice_state IS NOT NULL OR nppes_practice_city IS NOT NULL);


/* ==== 2. ADD THE COLUMNS ====
   institution_state_source is the point of the exercise. npi_source already
   does this for npi_number: the value and the claim about where it came from
   are two different facts, and collapsing them is what produced this defect.

   Nothing reads these columns. Populating them changes no surface until a
   reader opts in, which is deliberate. */

ALTER TABLE public.hcps_v2
  ADD COLUMN IF NOT EXISTS institution_state        TEXT,
  ADD COLUMN IF NOT EXISTS institution_state_source TEXT,
  ADD COLUMN IF NOT EXISTS institution_city         TEXT;


/* ==== 3. PRE-CHECK, READ THIS BEFORE RUNNING BLOCK 4 ====
   migratable_state must equal the row count from block 1's state arm (14,676)
   and corroborated must be 2. Those 2 rows carry real NPPES evidence with no
   npi_number and are DELIBERATELY EXCLUDED from every block below: they are the
   counter-example to the migration's premise, and moving them would assert an
   institution origin the data contradicts.

   Measured 2026-09-02: migratable_state 14,676, corroborated 2,
   migratable_city 2,436. */

SELECT
  count(*) FILTER (
    WHERE nppes_practice_state IS NOT NULL AND npi_number IS NULL
      AND nppes_enriched_at IS NULL AND nppes_practice_zip IS NULL
      AND npi_taxonomy IS NULL AND npi_specialty IS NULL
      AND nppes_practice_setting IS NULL AND nppes_career_stage_years IS NULL) AS migratable_state,
  count(*) FILTER (
    WHERE nppes_practice_state IS NOT NULL AND npi_number IS NULL
      AND (nppes_enriched_at IS NOT NULL OR nppes_practice_zip IS NOT NULL
           OR npi_taxonomy IS NOT NULL OR npi_specialty IS NOT NULL
           OR nppes_practice_setting IS NOT NULL OR nppes_career_stage_years IS NOT NULL)) AS corroborated,
  count(*) FILTER (
    WHERE nppes_practice_city IS NOT NULL AND npi_number IS NULL
      AND nppes_enriched_at IS NULL AND nppes_practice_zip IS NULL
      AND npi_taxonomy IS NULL AND npi_specialty IS NULL
      AND nppes_practice_setting IS NULL AND nppes_career_stage_years IS NULL) AS migratable_city
FROM public.hcps_v2;


/* ==== 4. COPY THE STATE ACROSS ====
   Source label is 'legacy_nppes_column' and not 'institution': what is provable
   is WHERE THE VALUE WAS FOUND and that NPPES cannot have put it there. Block 5
   upgrades the ones the ROR registry independently confirms. Naming an origin
   this migration cannot prove would be the same mistake in a new column.

   Expect 14,676 rows updated. */

UPDATE public.hcps_v2
SET institution_state        = nppes_practice_state,
    institution_state_source = 'legacy_nppes_column'
WHERE nppes_practice_state IS NOT NULL
  AND npi_number IS NULL
  AND nppes_enriched_at IS NULL
  AND nppes_practice_zip IS NULL
  AND npi_taxonomy IS NULL
  AND npi_specialty IS NULL
  AND nppes_practice_setting IS NULL
  AND nppes_career_stage_years IS NULL;


/* ==== 5. UPGRADE THE ONES THE REGISTRY CONFIRMS ====
   institution_geo_lookup resolves the HCP's institution ROR to a state. Where
   that state equals the migrated value, a second independent source agrees and
   the row earns a stronger label.

   NOTE THE ROR FORMAT MISMATCH, which is why regexp_replace is here:
   hcps_v2.current_institution_ror holds a BARE id ('01jfd9z49') and
   institution_geo_lookup.ror_id holds the FULL URL
   ('https://ror.org/0000yrh61'). A plain equality join returns ZERO rows and
   reads as "the registry does not cover these institutions".

   Expect 11,557 upgraded. The remainder stay 'legacy_nppes_column': 2,538 where
   the registry disagrees and 581 with no ROR to check against. Both are kept,
   not deleted, and both are now visibly weaker than the confirmed set. */

UPDATE public.hcps_v2 h
SET institution_state_source = 'institution_ror_confirmed'
FROM public.institution_geo_lookup g
WHERE regexp_replace(g.ror_id, '^https?://ror\.org/', '') = h.current_institution_ror
  AND h.institution_state_source = 'legacy_nppes_column'
  AND g.state_code = h.institution_state;


/* ==== 6. COPY THE CITY ACROSS ====
   Same defect, same column family, worse values: the migratable cities include
   'CHU de Caen', 'Chaitanya Deemed to be University' and 'Center for Natural
   and Human Sciences', which are institution NAMES rather than cities. Six
   display functions read nppes_practice_city.

   Expect 2,436 rows updated. */

UPDATE public.hcps_v2
SET institution_city = nppes_practice_city
WHERE nppes_practice_city IS NOT NULL
  AND npi_number IS NULL
  AND nppes_enriched_at IS NULL
  AND nppes_practice_zip IS NULL
  AND npi_taxonomy IS NULL
  AND npi_specialty IS NULL
  AND nppes_practice_setting IS NULL
  AND nppes_career_stage_years IS NULL;


/* ==== 7. CLEAR THE NPPES COLUMNS ====
   THIS IS THE BLOCK THAT CHANGES WHAT USERS SEE. After it, 999 NSCLC and 724
   colorectal established-board members lose their location chip and drop out of
   every territory filter, because none of them has a derived_state to fall back
   to. Do not run it until the reader changes are agreed, or the ledger will
   simply show fewer people in Texas with no explanation.

   Guarded on institution_state / institution_city being already populated, so
   it cannot clear a value block 4 or 6 did not capture. */

UPDATE public.hcps_v2
SET nppes_practice_state = NULL
WHERE institution_state IS NOT NULL
  AND institution_state = nppes_practice_state
  AND npi_number IS NULL;

UPDATE public.hcps_v2
SET nppes_practice_city = NULL
WHERE institution_city IS NOT NULL
  AND institution_city = nppes_practice_city
  AND npi_number IS NULL;


/* ==== 8. VERIFY, AND READ THE OUTPUT ====
   state_without_npi must be 2, and those 2 are the corroborated rows block 3
   counted. Any other number means the predicate admitted something it should
   not have.

   institution_state_total must be 14,676, split 11,557 confirmed and 3,119
   legacy. rollback_rows must match block 1. */

SELECT
  (SELECT count(*) FROM public.hcps_v2
    WHERE nppes_practice_state IS NOT NULL AND npi_number IS NULL)          AS state_without_npi,
  (SELECT count(*) FROM public.hcps_v2 WHERE institution_state IS NOT NULL) AS institution_state_total,
  (SELECT count(*) FROM public.hcps_v2
    WHERE institution_state_source = 'institution_ror_confirmed')           AS ror_confirmed,
  (SELECT count(*) FROM public.hcps_v2
    WHERE institution_state_source = 'legacy_nppes_column')                 AS legacy_only,
  (SELECT count(*) FROM public.hcps_v2 WHERE institution_city IS NOT NULL)  AS institution_city_total,
  (SELECT count(*) FROM public.hcps_v2_state_provenance_rollback_20260902)  AS rollback_rows;


/* ==== 9. ROLLBACK, ONLY IF NEEDED ====
   Restores every captured value and clears the new columns. Safe to run more
   than once. Drop the rollback table only once the change has been live long
   enough to trust. */

UPDATE public.hcps_v2 h
SET nppes_practice_state = r.old_nppes_practice_state,
    nppes_practice_city  = r.old_nppes_practice_city
FROM public.hcps_v2_state_provenance_rollback_20260902 r
WHERE r.id = h.id;

UPDATE public.hcps_v2
SET institution_state = NULL, institution_state_source = NULL, institution_city = NULL
WHERE institution_state IS NOT NULL OR institution_city IS NOT NULL;
