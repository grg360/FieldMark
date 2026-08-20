-- ============================================================================
-- Delete the stranded rising_star/nsclc narratives. Date: 2026-08-20
-- Branch: resurfacing
--
-- Restore:  sql/revert/2026_08_20_stranded_rising_narratives_RESTORE.sql
-- Manifest: migrations/2026_08_20_delete_stranded_rising_narratives.MANIFEST.tsv
--
-- ── What made them stranded ─────────────────────────────────────────────────
-- The board moved TWICE on 2026-08-20. MIN_VELOCITY_DELTA was replaced by
-- MIN_COMPONENT_PERCENTILE = 50 applied to all four components (251 -> 338), and
-- the eigenvector delta was then normalised within country (338 -> 336). These
-- rows describe people the rescore removed from hcp_rising_star_ranks_v3.
--
-- COMPUTED AGAINST ACTUAL CURRENT MEMBERSHIP, not against either projection.
-- The intermediate 338 board was never the live board for a full run, and using
-- a projected membership would strand the wrong people.
--
-- Unlike the 2026-08-17 deletion, this is NOT a one-time threshold consequence:
-- the coherence gate can move anyone whose four components drift across the
-- median, so this is now recurring churn. The generator's own selector is
-- correct and cannot re-create these -- it reads the board -- but a stranded
-- sweep after each rescore is the standing follow-on, not an exception.
--
-- ── The 127, measured 2026-08-20 against the live 336 ───────────────────────
--    99  now on the established board (hcp_established_ranks_v3, nsclc)
--         -- all 99 are cohort='established' in hcp_cohort_classification_v2
--    28  boardless: on no nsclc board at all
--         -- all 28 are cohort='rising_eligible' in hcp_cohort_classification_v2
--     0  on the community board
-- The two taxonomies agree exactly, so the split carries no residual bucket --
-- the same clean agreement the 08-17 sweep found.
--
-- 463 rising narratives existed; 336 belong to current members and are KEPT.
-- 127 + 336 = 463, so every row is accounted for and none is ambiguous.
--
-- ── Regeneration is already done, which is new ─────────────────────────────
-- All 336 current board members already carry a rising narrative (measured:
-- board_without_narrative = 0). The 08-17 sweep deleted first and left 270
-- people with nothing pending a later regeneration run; this one does not. The
-- board is fully covered before the delete, so the delete only removes rows that
-- describe non-members.
--
-- ── Known and accepted: 117 people are left with NO narrative ──────────────
-- Of the 127, only 10 carry a narrative under another cohort. Deleting leaves
-- 117 with none for this TA -- 99 of whom are on the ESTABLISHED board and are
-- the natural work-list for an established regeneration run. That is correct for
-- the ledgers, which read by (hcp_id, slug, cohort) and were already finding
-- nothing for a non-member. These texts assert a rising trajectory the board no
-- longer holds, so leaving them in place would be the worse error.
--
-- ── Safety ─────────────────────────────────────────────────────────────────
-- Full row images with original ids are in the RESTORE file, ON CONFLICT (id)
-- DO NOTHING so a restore cannot clobber a regenerated row. The DELETE below
-- re-derives the target set from live membership rather than from a hardcoded id
-- list, and the row count is asserted before COMMIT: if the board has moved since
-- the manifest was generated, this ABORTS rather than deleting a set that no
-- longer matches the manifest and the restore file.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _stranded ON COMMIT DROP AS
SELECT n.id
FROM hcp_narratives_v2 n
WHERE n.cohort = 'rising_star'
  AND n.therapeutic_area_slug = 'nsclc'
  AND NOT EXISTS (
    SELECT 1
    FROM hcp_rising_star_ranks_v3 r
    JOIN therapeutic_areas t ON t.id = r.therapeutic_area_id AND t.slug = 'nsclc'
    WHERE r.hcp_id = n.hcp_id
  );

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _stranded;
  IF n <> 127 THEN
    RAISE EXCEPTION
      'ABORT: % stranded rows found, manifest and RESTORE file describe 127. '
      'The board moved after the manifest was generated. Regenerate both before '
      'deleting -- a mismatch means the restore file cannot undo this delete.', n;
  END IF;
END $$;

DELETE FROM hcp_narratives_v2 WHERE id IN (SELECT id FROM _stranded);

COMMIT;
