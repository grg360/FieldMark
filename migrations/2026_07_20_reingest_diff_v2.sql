-- ============================================================================
-- Migration: reingest "what changed" delta engine tables
-- Date: 2026-07-20
-- Purpose: Backing store for the Field Intelligence / dynamism feed. Three tables:
--   * reingest_snapshot_v2      - per-HCP scoring state for a TA at a point in time
--   * reingest_diff_v2          - one row per CHANGED HCP per diff run (watchlist + Claude
--                                 narration consumers read this)
--   * reingest_diff_summary_v2  - one row per diff run (the "Scientific Weather" pulse seed)
--
-- Produced by scripts/score/reingest_diff.py (--snapshot / --diff). That script keeps a
-- mirror of this DDL for --print-ddl; THIS FILE is authoritative.
--
-- Design notes:
--   * Snapshots capture the GLOBAL scope of hcp_score_ranks_v2 (every ranked HCP in the TA).
--   * change_type covers both-direction transitions: rising in (new_rising_star), promotion
--     (cohort_promotion), rank moves, entry (new_entrant), exit (dropped_out), and pub bumps.
--   * why_context is reserved (NULL) for the Claude API "why this matters" narration layer,
--     so we do not migrate later.
--   * Composite PKs, no surrogate id, on the two per-HCP tables (existence checks must not
--     select("id") on these).
--   * hcp_id is a PLAIN uuid with NO foreign key to hcps_v2. These tables are an immutable
--     historical event log; the dedup suite hard-deletes stub hcp_ids, and an FK cascade
--     would erase snapshot/diff history exactly around merged HCPs (the fragmented KOLs -
--     the most interesting ones). A snapshot of "HCP X was rank 47 on date D" stays true
--     after X is merged away. Consumers treat hcp_id as possibly-historical. hcp_id stays
--     indexed for watchlist/feed reads.
--
-- Run via:
--   python scripts/utilities/run_sql.py --file migrations/2026_07_20_reingest_diff_v2.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. reingest_snapshot_v2
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reingest_snapshot_v2 (
  snapshot_id  UUID NOT NULL,
  hcp_id       UUID NOT NULL,   -- plain uuid, NO FK: this is an immutable event log. The
                                -- dedup suite hard-deletes stub hcp_ids; an FK cascade would
                                -- erase snapshot history exactly around merged HCPs (the
                                -- fragmented KOLs). "HCP X was rank 47 on date D" stays true
                                -- after X is merged away. hcp_id may be historical.
  ta_slug      TEXT NOT NULL,
  cohort       TEXT,
  cohort_score NUMERIC,
  rank         INTEGER,
  pub_count    INTEGER,
  captured_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (snapshot_id, hcp_id)   -- composite PK, no surrogate id
);

CREATE INDEX IF NOT EXISTS idx_reingest_snapshot_v2_snapshot
  ON reingest_snapshot_v2 (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_reingest_snapshot_v2_ta
  ON reingest_snapshot_v2 (ta_slug, captured_at);

COMMENT ON TABLE reingest_snapshot_v2 IS
  'Per-HCP scoring state (cohort/rank/score/pub_count) for a TA at snapshot time, global scope. Written by reingest_diff.py --snapshot.';

-- ---------------------------------------------------------------------------
-- 2. reingest_diff_v2  (one row per changed HCP per diff run)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reingest_diff_v2 (
  diff_run_id      UUID NOT NULL,
  ta_slug          TEXT NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL,
  hcp_id           UUID NOT NULL,   -- plain uuid, NO FK (immutable event log; see
                                    -- reingest_snapshot_v2). hcp_id may be historical after
                                    -- a dedup merge hard-deletes the stub. Frontend treats it
                                    -- as possibly-historical.
  hcp_display_name TEXT,
  change_type      TEXT NOT NULL CHECK (change_type IN (
                     'new_rising_star',
                     'cohort_promotion',
                     'rank_mover_up',
                     'rank_mover_down',
                     'new_entrant',
                     'new_publications',
                     'dropped_out')),
  before_cohort    TEXT,
  after_cohort     TEXT,
  before_rank      INTEGER,
  after_rank       INTEGER,
  rank_delta       INTEGER,          -- positive = moved UP the leaderboard (rank number fell)
  before_pub_count INTEGER,
  after_pub_count  INTEGER,
  pub_delta        INTEGER,
  magnitude        NUMERIC NOT NULL, -- significance sort key (not just presence)
  why_context      TEXT,             -- RESERVED: Claude "why this matters" narration (NULL for now)
  PRIMARY KEY (diff_run_id, hcp_id)  -- composite PK, no surrogate id
);

-- Watchlist consumer: "every change for this HCP".
CREATE INDEX IF NOT EXISTS idx_reingest_diff_v2_hcp
  ON reingest_diff_v2 (hcp_id);
-- Feed consumer: "latest changes for this TA, biggest first".
CREATE INDEX IF NOT EXISTS idx_reingest_diff_v2_feed
  ON reingest_diff_v2 (ta_slug, computed_at, magnitude);
-- Per-run read: "this run's changes, biggest first".
CREATE INDEX IF NOT EXISTS idx_reingest_diff_v2_run
  ON reingest_diff_v2 (diff_run_id, magnitude);

COMMENT ON TABLE reingest_diff_v2 IS
  'One row per changed HCP per diff run. Consumed by watchlists (by hcp_id) and the Claude narration layer (why_context). Written by reingest_diff.py --diff.';

-- ---------------------------------------------------------------------------
-- 3. reingest_diff_summary_v2  (one row per diff run)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reingest_diff_summary_v2 (
  diff_run_id        UUID PRIMARY KEY,
  ta_slug            TEXT NOT NULL,
  computed_at        TIMESTAMPTZ NOT NULL,
  new_rising_stars   INTEGER NOT NULL DEFAULT 0,
  promotions         INTEGER NOT NULL DEFAULT 0,
  movers_up          INTEGER NOT NULL DEFAULT 0,
  movers_down        INTEGER NOT NULL DEFAULT 0,
  new_entrants       INTEGER NOT NULL DEFAULT 0,
  dropped_outs       INTEGER NOT NULL DEFAULT 0,
  hcps_with_new_pubs INTEGER NOT NULL DEFAULT 0,   -- cross-cutting: any row with pub_delta > 0
  total_hcps_changed INTEGER NOT NULL DEFAULT 0,
  activity_level     TEXT NOT NULL CHECK (activity_level IN ('quiet','moderate','busy'))
);

CREATE INDEX IF NOT EXISTS idx_reingest_diff_summary_v2_ta
  ON reingest_diff_summary_v2 (ta_slug, computed_at);

COMMENT ON TABLE reingest_diff_summary_v2 IS
  'Run-level pulse aggregate (the "Scientific Weather" seed) for the dynamism feed. One row per diff_run_id.';

-- ---------------------------------------------------------------------------
-- Grants + schema reload (platform convention; required for service_role/API access).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reingest_snapshot_v2      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reingest_diff_v2          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reingest_diff_summary_v2  TO service_role;
-- Feed/watchlist reads are server-side (service_role). Grant SELECT to authenticated for
-- direct client reads if/when the feed queries these tables from the browser.
GRANT SELECT ON public.reingest_snapshot_v2      TO authenticated;
GRANT SELECT ON public.reingest_diff_v2          TO authenticated;
GRANT SELECT ON public.reingest_diff_summary_v2  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification
SELECT
  t AS tablename,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t) AS column_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = t) AS index_count
FROM (VALUES ('reingest_snapshot_v2'), ('reingest_diff_v2'), ('reingest_diff_summary_v2')) AS x(t);
