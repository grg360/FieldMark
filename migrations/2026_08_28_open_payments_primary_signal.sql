-- hcp_open_payments_by_ta_v2: primary-signal companion columns.
-- Date: 2026-08-28. Branch: foundation-rebuild.
-- Revert: sql/revert/2026_08_28_open_payments_primary_signal_REVERT.sql
--
-- THE SEMANTIC being made measurable (clinical review, recorded 2026-08-28):
--   ta_drug_keywords.is_primary_signal = true  -> a payment for this drug may INDEPENDENTLY
--                                                 establish therapeutic-area engagement
--                                          false -> contributes only AFTER TA relevance is
--                                                 established elsewhere
--
-- WHY COLUMNS AND NOT A FILTER. open_payments_aggregator INNER JOINs hcp_therapeutic_areas_v2
-- before its drug match, so every HCP it aggregates has already met the "established
-- elsewhere" precondition -- exactly the case in which the semantic admits SECONDARY drugs.
-- Filtering that aggregator to primary would discard the payments the definition allows, and
-- weighting them would invent a number that is neither the real total nor a defensible score
-- (these feed pharma_engagement_scoring and displayed payment facts). A companion column
-- changes nothing and answers the question.
--
-- SHAPE COPIED FROM ta_hcpcs_codes, deliberately. migrations/2026_08_02_medicare_by_ta_recompute.sql
-- already solved this exact problem on the sibling config table:
--     sum(benes) FILTER (WHERE is_primary_signal) AS hc_benes
-- high_confidence = primary-only, *_total = everything. Same convention here so the two
-- payment/medicare surfaces read alike.
--
-- ADDITIVE AND UNREAD. Existing columns keep their current meaning; no consumer changes.
-- community_scoring.py deliberately still reads the TOTALS -- whether it should read
-- primary-only is a real decision, and it waits until CRC's split makes it measurable.
--
-- WHY NOW. The distinction is invisible today: 103 of 105 ta_drug_keywords rows are primary
-- (NSCLC 21/21, hepatology 23/23, rare-disease 47/47, AD 12/14). CRC is expected to seed
-- ~9 primary / 12 secondary -- the first TA where this materially changes a number. These
-- columns exist so that change can be measured BEFORE anything is made to depend on it.

BEGIN;

ALTER TABLE hcp_open_payments_by_ta_v2
  ADD COLUMN IF NOT EXISTS ta_payments_3yr_primary        numeric,
  ADD COLUMN IF NOT EXISTS ta_payments_count_3yr_primary  integer,
  ADD COLUMN IF NOT EXISTS ta_distinct_drugs_3yr_primary  integer;

COMMENT ON COLUMN hcp_open_payments_by_ta_v2.ta_payments_3yr_primary IS
  'Subset of ta_payments_3yr attributable to ta_drug_keywords rows with is_primary_signal = true '
  '-- drugs whose payment may independently establish TA engagement. NULL on rows written before '
  '2026-08-28 and on rows whose payments are all secondary-drug. Compare against ta_payments_3yr, '
  'which remains the unfiltered total and is what every current consumer reads.';

COMMENT ON COLUMN hcp_open_payments_by_ta_v2.ta_payments_count_3yr_primary IS
  'Primary-signal subset of ta_payments_count_3yr. See ta_payments_3yr_primary.';

COMMENT ON COLUMN hcp_open_payments_by_ta_v2.ta_distinct_drugs_3yr_primary IS
  'Primary-signal subset of ta_distinct_drugs_3yr. See ta_payments_3yr_primary.';

COMMIT;
