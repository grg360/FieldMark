-- REVERT migrations/2026_08_28_seed_ta_drug_keywords_crc.sql
-- Date: 2026-08-28.
--
-- Removes the 29 Colorectal Cancer drug-keyword rows and the natural-key index the seed added.
--
-- SCOPED TO CRC BY therapeutic_area_id. The other 105 rows (NSCLC 21, hepatology 23,
-- rare-disease 47, atopic-dermatitis 14) are untouched.
--
-- CONSEQUENCE OF RUNNING THIS: open_payments_aggregator's TA slice for CRC returns to zero
-- rows -- its INNER JOIN on drug_keywords has nothing to match -- so hcp_open_payments_by_ta_v2
-- loses its CRC rows on the next run and community payment facts blank for CRC. That is the
-- pre-seed state, not a new fault. generate_cycle's G6 precondition will again refuse with
-- "ta_drug_keywords has 0 rows for colorectal-cancer", which is the intended loud failure.
--
-- THE INDEX DROP IS SEPARABLE and usually unwanted. ta_drug_keywords_ta_drug_uniq is the
-- natural key that makes every seed's ON CONFLICT DO NOTHING actually idempotent; without it
-- a re-run duplicates rows, because id defaults to gen_random_uuid() and the PK can never
-- collide. Keep it unless you are reverting the whole idea. Delete the DROP INDEX line to
-- remove only the CRC data.

BEGIN;

DELETE FROM public.ta_drug_keywords
 WHERE therapeutic_area_id = 'a2b28e54-0e0e-48a7-98e1-504f48e45d81';

-- Optional, and usually NOT wanted -- see the note above.
DROP INDEX IF EXISTS public.ta_drug_keywords_ta_drug_uniq;

COMMIT;
