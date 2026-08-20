-- regions.aggregate_scope — mark which regions get a scored aggregate board.
-- Date: 2026-08-18. Branch: resurfacing.
-- Revert: sql/revert/2026_08_18_regions_aggregate_scope_REVERT.sql
--
-- WHY A FLAG AND NOT A RULE. The obvious rule -- "any region with more than one
-- country that is neither global nor the catchall" -- was measured against the
-- NSCLC Established cohort on 2026-08-18 and writes 19,018 aggregate rows where
-- 12,620 are wanted:
--
--     EU5     2,733    EUROPE  3,849    EU      3,320
--     APAC    8,771    LATAM      66    MENA      279
--
-- That is three overlapping European boards over the same people (EU5 within EU
-- within EUROPE), plus two regions nobody selected, one of them (LATAM, 66 rows)
-- too small to rank meaningfully. Which regions deserve an aggregate board is a
-- product decision, so it is stored, not derived.
--
-- THIS COLUMN HAS TWO READERS, which is why it is on `regions` rather than in a
-- constant in the scorer:
--   1. recompute_established_ranks_v3.py emits one bucket per flagged region.
--   2. the ledger territory tree marks a region SELECTABLE when it is flagged
--      (Established needs a scored bucket to select) -- via ledger_regions().
-- Both ledgers also read it to recognise an aggregate scope_value at read time.
--
-- ADDING A REGION LATER IS ONE UPDATE plus a scorer re-run. Removing one needs the
-- bucket deleted too -- the scorer upserts and never deletes, so an unflagged
-- region's rows would otherwise linger and stay selectable-looking.

BEGIN;

ALTER TABLE public.regions
  ADD COLUMN IF NOT EXISTS aggregate_scope boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.regions.aggregate_scope IS
  'True when this region gets its own scored aggregate board (scope_type=''region'', '
  'scope_value=<region_key>) written by recompute_established_ranks_v3.py, and is '
  'selectable as a territory in the cohort ledger. Deliberately not derived from '
  'country count -- see migrations/2026_08_18_regions_aggregate_scope.sql.';

-- EUROPE: already scored and shipped 2026-08-18 (3,849 rows, 31 countries).
-- APAC:   scored by the same run this migration precedes (8,771 rows, 13 countries).
UPDATE public.regions SET aggregate_scope = true WHERE region_key IN ('EUROPE', 'APAC');

COMMIT;
