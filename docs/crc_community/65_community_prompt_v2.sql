-- 65 — bump the community prompt version to community_v2.0.
-- Authored and applied 2026-09-18.
--
-- WHY. The v1.0 community prompt opens by telling the model the physician "has been
-- algorithmically selected as a top Community-cohort name within their therapeutic area —
-- a practising clinician with meaningful patient volume". Both halves are false:
--
--   * COMMUNITY IS NOT RANKED. There is no "top". The four *_score columns behind any such
--     claim have been NULL corpus-wide since the composite freeze.
--   * PATIENT VOLUME WAS UNMEASURED for any TA whose Medicare aggregator had not run —
--     which was every colorectal row until 2026-09-18, and is still the state for any TA
--     added tomorrow.
--
-- It also announced "Percentile data below is computed within the community cohort in
-- their TA" while supplying no percentiles at all, and its only real lever was Open
-- Payments, so a physician with a claims record and no payments row had nothing to stand
-- on. community_v2.0 replaces all of that with displayed facts and forbids rank, score and
-- percentile language outright.
--
-- WHAT THIS DOES AND DOES NOT DO. narrative_is_current() is a plain equality against
-- current_version, so this marks every existing community narrative NOT CURRENT. It does
-- NOT delete or regenerate anything. Prose already written stays exactly where it is and
-- keeps rendering; the surfaces that show a staleness marker will show one.
--
-- BLAST RADIUS, MEASURED IMMEDIATELY BEFORE APPLYING. This is NOT lung-only — every TA
-- that has ever had a community narrative is stamped v1.0:
--
--   slug                v1.0 rows   on the board (any tier)   on the anchored+supported cut
--   nsclc                   3,005                       939                            408
--   hepatology              2,343                         0                              0
--   rare-disease              168                         0                              0
--   atopic-dermatitis          24                         0                              0
--   TOTAL                   5,540
--
-- 939 lung narratives are reachable by a reader on the ledger today and all 939 now read
-- as stale. That is the correct signal -- they were written by a prompt that asserts a
-- rank the cohort does not have -- but it is a signal with no remedy for three of the four
-- TAs: hepatology and rare-disease are not board TAs, and AD community lives in
-- community_practitioners, so none of their 2,535 narratives can currently be regenerated
-- by generate_narratives_v2. They will read stale indefinitely.
--
-- DELIBERATELY NOT REGENERATING LUNG. That is 939+ billed calls and a separate decision.
--
-- APPLY:
--   python scripts/utilities/run_sql.py --file docs/crc_community/65_community_prompt_v2.sql

UPDATE narrative_prompt_versions
   SET current_version = 'community_v2.0',
       updated_at      = now()
 WHERE cohort = 'community';

-- VERIFY. Expect community = community_v2.0, the other two unchanged.
SELECT cohort, current_version, updated_at
FROM narrative_prompt_versions
ORDER BY cohort;

-- And the staleness this creates, so the number is on the record next to the change.
SELECT therapeutic_area_slug,
       count(*) FILTER (WHERE narrative_is_current(cohort, prompt_version)) AS current_now,
       count(*) FILTER (WHERE NOT narrative_is_current(cohort, prompt_version)) AS stale_now
FROM hcp_narratives_v2
WHERE cohort = 'community'
GROUP BY 1
ORDER BY 1;
