-- REVERT migrations/2026_08_28_open_payments_primary_signal.sql
-- Date: 2026-08-28.
--
-- Additive migration, so this loses only the primary-signal companion columns. No existing
-- column is touched and no consumer reads the dropped ones.
--
-- DO NOT RUN THIS WHILE open_payments_aggregator STILL EMITS THEM. The script names all three
-- in its by_ta upsert payload; dropping them makes every by_ta write fail. Revert the Python
-- in the same step, or not at all.

BEGIN;

ALTER TABLE hcp_open_payments_by_ta_v2
  DROP COLUMN IF EXISTS ta_payments_3yr_primary,
  DROP COLUMN IF EXISTS ta_payments_count_3yr_primary,
  DROP COLUMN IF EXISTS ta_distinct_drugs_3yr_primary;

COMMIT;
