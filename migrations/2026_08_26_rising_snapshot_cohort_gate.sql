-- hcp_rising_board_snapshots: record the COHORT GATE the pool was drawn under.
-- Date: 2026-08-26. Branch: foundation-rebuild.
-- Revert: sql/revert/2026_08_26_rising_snapshot_cohort_gate_REVERT.sql
--
-- WHY THIS COLUMN HAS TO EXIST. The four *_applied threshold columns record int
-- literals read out of the scoring sources at capture time, so a threshold change
-- is always distinguishable from a population change. The COHORT GATE is not an
-- int literal -- it is a SQL predicate in rising_star_scoring.fetch_input_signals()
-- -- so it was invisible to that mechanism.
--
-- On 2026-08-26 the gate lost its OR-15 clause:
--     (cc.cohort = 'rising_eligible'
--      OR (cc.cohort = 'established' AND cc.career_age <= 15))
--   becomes
--     cc.cohort = 'rising_eligible'
-- The eligible pool went 1,934 -> 792 and the board 336 -> 149 (US 76 -> 42),
-- while ALL FOUR recorded constants stayed identical: min_component_percentile 50,
-- min_pubs_per_window 5, min_collaborators 20, max_career_years 15. A capture taken
-- after the change and one taken on 2026-08-20 would have been byte-identical in
-- their provenance while describing populations 2.4x apart.
--
-- WHAT IS ACTUALLY AT RISK. scientific_visibility_percentile and
-- network_visibility_percentile are computed over the POOL, not over the board
-- (rising_star_scoring.build_results(): a value used to SELECT the board cannot be
-- computed FROM the board without circularity). They are therefore comparable
-- ONLY between captures carrying the same cohort_gate_applied. Two of the four
-- component columns silently changed meaning and nothing recorded it.
--
-- scientific_momentum_percentile and network_momentum_percentile do NOT move:
-- they arrive already percentiled from hcp_scientific_momentum_v1 and
-- hcp_network_momentum_v1, neither of which reads hcp_cohort_classification_v2 at
-- all. That is a known mixed denominator, widened by this change and deliberately
-- not fixed here -- see docs/RISING_EXCLUSIVE_GATE_DEBT.md.
--
-- The backfill is a STATEMENT OF FACT about captures already taken, not a guess:
-- every existing row was captured under the OR-15 pool, which was in force from
-- 2026-08-05 (ba84d41) until today. No score, rank or percentile is rewritten.
-- Additive only.

BEGIN;

ALTER TABLE hcp_rising_board_snapshots
  ADD COLUMN IF NOT EXISTS cohort_gate_applied text;

-- Every row that exists today predates the narrowing.
UPDATE hcp_rising_board_snapshots
   SET cohort_gate_applied = 'rising_eligible|established_career_age<=15'
 WHERE cohort_gate_applied IS NULL;

COMMENT ON COLUMN hcp_rising_board_snapshots.cohort_gate_applied IS
  'The hcp_cohort_classification_v2 predicate that defined the ELIGIBLE POOL at capture '
  'time. Two values exist: ''rising_eligible|established_career_age<=15'' for captures '
  'from 2026-08-05 to 2026-08-26 (the OR-15 clause), and ''rising_eligible'' thereafter. '
  'scientific_visibility_percentile and network_visibility_percentile are pool-relative '
  'and are ONLY comparable across captures sharing this value. Set from '
  'take_weekly_snapshot.COHORT_GATE_APPLIED, which must be bumped whenever the gate in '
  'rising_star_scoring.fetch_input_signals() moves.';

COMMENT ON COLUMN hcp_rising_board_snapshots.max_career_years_applied IS
  'The momentum pipeline''s own career cap (scientific_momentum_scoring.MAX_CAREER_YEARS, '
  '15), read off hcps_v2.career_first_pub_year_v2. NOT the Rising cohort boundary -- since '
  '2026-08-26 that is cohort_gate_applied, and the taxonomy draws it at career age 3-10. '
  'The two were the same predicate only while the OR-15 clause stood.';

COMMIT;
