-- ============================================================================
-- Timeline mis-link cleanup — unlink the 277 pre-2001 publications from the
-- modern HCPs they were wrongly attached to by OpenAlex author disambiguation.
--
-- Scope: publication_authors_v2 JUNCTION ROWS ONLY. The publications themselves
-- STAY in publications_v2 (correct years, genuinely-old papers). We delete link
-- rows; the FK cascade direction is publications_v2 -> publication_authors_v2,
-- never the reverse, so no publication is orphaned or removed by these deletes.
--
-- Two scopes below. Run the PREVIEW first, then exactly ONE of Option A / B.
-- DO NOT run both. Author decides scope.
-- ============================================================================

-- ── PREVIEW — see what each scope would remove before deleting. ──────────────
SELECT
  count(*)                                                    AS all_links,           -- expect 311
  count(DISTINCT pa.hcp_id)                                   AS all_hcps,            -- expect 52
  count(*) FILTER (WHERE r.hcp_id IS NULL)                    AS unranked_links,      -- expect 269
  count(DISTINCT pa.hcp_id) FILTER (WHERE r.hcp_id IS NULL)   AS unranked_hcps,       -- expect 45
  count(*) FILTER (WHERE r.hcp_id IS NOT NULL)                AS ranked_links,        -- expect 42
  count(DISTINCT pa.hcp_id) FILTER (WHERE r.hcp_id IS NOT NULL) AS ranked_hcps        -- expect 7
FROM publication_authors_v2 pa
JOIN publications_v2 p ON p.id = pa.publication_id
LEFT JOIN (
  SELECT hcp_id FROM hcp_established_ranks_v3
  UNION SELECT hcp_id FROM hcp_rising_composite_v1
  UNION SELECT hcp_id FROM hcp_rising_star_ranks_v3
  UNION SELECT hcp_id FROM hcp_community_ranks_v2
) r ON r.hcp_id = pa.hcp_id
WHERE p.pub_year < 2001;


-- ── OPTION A — FULL SWEEP: all pre-2001 links (311 links, 52 HCPs). ──────────
--    Includes the 7 ranked HCPs. Use only if you accept that (a) some ranked
--    pre-2001 links may be genuine senior-faculty papers, and (b) their
--    publication/senior-author counts will change on the NEXT scorer run.
-- BEGIN;
-- DELETE FROM publication_authors_v2 pa
-- USING publications_v2 p
-- WHERE pa.publication_id = p.id
--   AND p.pub_year < 2001;
-- COMMIT;


-- ── OPTION B — CONSERVATIVE (recommended): unranked HCPs only ────────────────
--    269 links across 45 HCPs. Leaves the 7 ranked HCPs' pre-2001 links intact
--    for manual review, so no scoring input changes silently. The display axis
--    guard (timelineAxisFloor) already fixes the visible symptom for ranked and
--    unranked HCPs alike, without touching any count — so nothing is lost by
--    holding the ranked links back for a human decision.
-- BEGIN;
-- DELETE FROM publication_authors_v2 pa
-- USING publications_v2 p
-- WHERE pa.publication_id = p.id
--   AND p.pub_year < 2001
--   AND pa.hcp_id NOT IN (
--     SELECT hcp_id FROM hcp_established_ranks_v3
--     UNION SELECT hcp_id FROM hcp_rising_composite_v1
--     UNION SELECT hcp_id FROM hcp_rising_star_ranks_v3
--     UNION SELECT hcp_id FROM hcp_community_ranks_v2
--   );
-- COMMIT;
