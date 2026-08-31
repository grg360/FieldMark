-- Affiliation re-derivation — BEFORE snapshot. READ-ONLY against every source table.
--
-- RUN THIS FIRST, before 02_build_staging.sql. Companion: 05_verify.sql, which captures the
-- 'after' phase into the SAME table and diffs the two.
--
-- WHY A SNAPSHOT AT ALL. 03_apply.sql rewrites current_country / affiliation_confidence for
-- every HCP in the corpus, and two boards read those columns in different ways. Without a
-- before-state a shift is DISCOVERED (someone notices a rank looks wrong) instead of
-- MEASURED. Cheap insurance: ~114k rows, one table.
--
-- ── WHAT SHOULD MOVE, AND WHAT SHOULD NOT ─────────────────────────────────────────────────
-- This asymmetry is the whole point of capturing both boards, because a diff on the wrong
-- one reads as a disaster and a diff on the right one reads as success.
--
--   ESTABLISHED — placement MUST NOT MOVE.
--     board_established derives scored_country from hs.country, and 03_apply.sql never writes
--     `country` (its header: historical values preserved). Scope membership is STORED on
--     hcp_established_ranks_v3, so it cannot change without recompute_established_ranks_v3.py.
--     Only flag_eligible and the hedge label change. A rank diff here means something is wrong.
--
--   RISING — placement WILL MOVE, and that is correct.
--     board_rising slices on nullif(btrim(coalesce(h.current_country, h.country)),'') at READ
--     TIME, so country_rank, europe_rank and any country/EUROPE selection re-slice the moment
--     current_country changes. `rank` and `us_rank` are stored and must not move.
--
-- CRC is captured alongside NSCLC deliberately. NSCLC is the regression risk; CRC is the
-- intended beneficiary, and the same two queries answer both questions at the same cost.
--
-- IDEMPOTENT: re-running replaces the 'before' phase rather than duplicating it.

SET statement_timeout = '10min';

-- Schema derived from the capture query itself (WHERE false), so the column types cannot
-- drift from the tables they come from.
CREATE TABLE IF NOT EXISTS affiliation_rerun_snapshot AS
SELECT 'before'::text AS phase,
       now()          AS captured_at,
       -- ONE HASHABLE IDENTITY PER ROW. 05_verify diffs before-vs-after by joining this
       -- table to itself; joining on the natural key means (hcp_id, scope_type, scope_value)
       -- with two NULLABLE columns, and IS NOT DISTINCT FROM defeats the hash join -- the
       -- planner falls back to a nested loop over 114k x 114k and the verify never returns
       -- (measured: >10min, killed). A single non-null text key keeps it a hash join.
       ('EST:' || ta.slug || ':' || r.hcp_id::text || ':'
        || COALESCE(r.scope_type, '') || ':' || COALESCE(r.scope_value, '')) AS row_key,
       'EST'::text    AS board,
       ta.slug        AS ta,
       r.hcp_id,
       r.rank,
       NULL::int      AS us_rank,
       r.scope_type,
       r.scope_value,
       h.country,
       h.current_country,
       h.affiliation_confidence,
       h.affiliation_as_of,
       NULLIF(BTRIM(COALESCE(h.current_country, h.country)), '') AS effective_country,
       (NULLIF(BTRIM(COALESCE(h.current_country, '')), '') IS NOT NULL
        AND lower(COALESCE(h.affiliation_confidence, '')) = 'high') AS flag_eligible
FROM hcp_established_ranks_v3 r
JOIN hcps_v2 h ON h.id = r.hcp_id
JOIN therapeutic_areas ta ON ta.id = r.therapeutic_area_id
WHERE false;

DELETE FROM affiliation_rerun_snapshot WHERE phase = 'before';

INSERT INTO affiliation_rerun_snapshot
-- ESTABLISHED: every scope row, not just the ledger's default selection, so any territory
-- or country the ledger can be pointed at is comparable afterwards.
SELECT 'before', now(),
       'EST:' || ta.slug || ':' || r.hcp_id::text || ':'
       || COALESCE(r.scope_type, '') || ':' || COALESCE(r.scope_value, ''),
       'EST', ta.slug, r.hcp_id, r.rank, NULL::int,
       r.scope_type, r.scope_value,
       h.country, h.current_country, h.affiliation_confidence, h.affiliation_as_of,
       NULLIF(BTRIM(COALESCE(h.current_country, h.country)), ''),
       (NULLIF(BTRIM(COALESCE(h.current_country, '')), '') IS NOT NULL
        AND lower(COALESCE(h.affiliation_confidence, '')) = 'high')
FROM hcp_established_ranks_v3 r
JOIN hcps_v2 h ON h.id = r.hcp_id
JOIN therapeutic_areas ta ON ta.id = r.therapeutic_area_id
WHERE ta.slug IN ('nsclc', 'colorectal-cancer')
UNION ALL
-- RISING: one row per board member. us_rank is carried because it is STORED and must be
-- identical afterwards -- it is the control against which the read-time country_rank /
-- europe_rank movement is judged.
SELECT 'before', now(),
       'RS:' || ta.slug || ':' || r.hcp_id::text || '::',
       'RS', ta.slug, r.hcp_id, r.rank, r.us_rank,
       NULL, NULL,
       h.country, h.current_country, h.affiliation_confidence, h.affiliation_as_of,
       NULLIF(BTRIM(COALESCE(h.current_country, h.country)), ''),
       (NULLIF(BTRIM(COALESCE(h.current_country, '')), '') IS NOT NULL
        AND lower(COALESCE(h.affiliation_confidence, '')) = 'high')
FROM hcp_rising_star_ranks_v3 r
JOIN hcps_v2 h ON h.id = r.hcp_id
JOIN therapeutic_areas ta ON ta.id = r.therapeutic_area_id
WHERE ta.slug IN ('nsclc', 'colorectal-cancer');

-- The index the diff depends on. Without it 05_verify plans a nested loop and does not
-- return; with it the whole verification runs in seconds.
CREATE INDEX IF NOT EXISTS idx_affiliation_rerun_snapshot_key
  ON affiliation_rerun_snapshot (phase, row_key);
ANALYZE affiliation_rerun_snapshot;

GRANT SELECT ON public.affiliation_rerun_snapshot TO service_role;

-- Final statement returns rows on purpose: run_sql.py prints only the LAST result set, and a
-- capture you cannot see is a capture you will not trust. Expected on 2026-08-31:
--   EST colorectal-cancer  67,550 rows   19,096 flagged  28.3%
--   EST nsclc              46,015        29,819          64.8%
--   RS  colorectal-cancer     140            30          21.4%
--   RS  nsclc                 149           142          95.3%
SELECT board, ta,
       count(*)                                      AS rows,
       count(*) FILTER (WHERE flag_eligible)         AS flagged,
       round(100.0 * count(*) FILTER (WHERE flag_eligible) / count(*), 1) AS pct_flagged
FROM affiliation_rerun_snapshot
WHERE phase = 'before'
GROUP BY 1, 2
ORDER BY 1, 2;
