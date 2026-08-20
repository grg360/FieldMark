-- ============================================================================
-- Board snapshots v2 — capture the gating variables, not just the outputs.
-- Date: 2026-08-17   Branch: resurfacing
--
-- Revert: sql/revert/2026_08_17_board_snapshots_v2_REVERT.sql
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
-- The rising board moved 619 -> 251 on 2026-08-17 when MIN_VELOCITY_DELTA went
-- from > 0 to >= 3. hcp_rising_star_snapshots recorded the OUTPUTS of scoring
-- (ranks and percentiles) and none of the variables the board is GATED on, so
-- the move is visible as 368 departures with no recoverable reason.
--
-- It is not recoverable later, either. The gating variables live in tables that
-- are OVERWRITTEN IN PLACE, one row per (hcp, TA):
--   hcp_scientific_momentum_v1    all 2,235 NSCLC rows share one computed_at
--   hcp_network_momentum_v1       same shape
--   hcp_cohort_classification_v2  one row per (hcp, TA), restamped per run
-- Every prior value of pub_velocity_delta / recent_senior_pubs /
-- early_senior_pubs is destroyed on each scoring cycle. A week not captured is
-- permanently unanswerable. That is the whole argument for these tables.
--
-- Churn exposure, measured 2026-08-17: 94 of 251 board members (37.5%) sit
-- EXACTLY at pub_velocity_delta = 3, and 122 non-members clear every other gate
-- at delta = 2. 216 people -- 86% of board size -- are within one senior-author
-- paper of a boundary in one direction or the other.
--
-- ── DESIGN ─────────────────────────────────────────────────────────────────
-- Two tables sharing an identical SPINE (identity + membership + provenance),
-- each with its own gate block, plus a union VIEW so the cross-cohort question
-- ("did they leave Rising because they joined Established?") is one query.
-- No jsonb: "which threshold, with the value on both sides" has to be
-- queryable and typed, and a jsonb blob defeats exactly that.
--
-- THE ELIGIBLE POOL, NOT THE BOARD. The rising table stores every HCP that
-- clears the cohort gate (~2,235 for NSCLC), with is_on_board marking the 251.
-- This is what makes the questions answerable: entry becomes a flag flip rather
-- than an absence, and the 122 who are one paper away are visible BEFORE they
-- arrive. At ~500 B/row that is ~1.1 MB/week.
--
-- IDENTITY IS DENORMALIZED AT CAPTURE TIME. first_name / last_name /
-- institution / country are copied in, so a 2026-06 snapshot renders a name
-- without joining hcps_v2 -- which is precisely the table that changes
-- underneath a historical query (see the affiliation re-derivation, which
-- rewrote current_institution and current_country corpus-wide).
--
-- NO DERIVED RANKS ARE STORED. effective_country + global_rank are captured;
-- us_rank_eff and eu_rank are row_number() projections over them and are
-- derived at READ time, the same way rising_board() derives them from the live
-- table. Storing a derived rank is how the stored/derived split that produced
-- the 57-vs-58 defect got created in the first place.
--
-- NULL MEANS NOT CAPTURED, NEVER ZERO. Every gate column is nullable and the
-- backfilled 2026-06-08 / 2026-08-05 rows carry NULL for all of them with
-- source='legacy'. A NULL pub_velocity_delta means "we did not record it";
-- conflating that with an actual delta of 0 would corrupt the exact analysis
-- these tables exist to support.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- RISING
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hcp_rising_board_snapshots (
  -- ── spine: identity ───────────────────────────────────────────────────────
  snapshot_date                 date        NOT NULL,
  hcp_id                        uuid        NOT NULL,
  therapeutic_area_id           uuid        NOT NULL,
  therapeutic_area_slug         text,
  first_name                    text,
  last_name                     text,
  institution_at_snapshot       text,
  country_at_snapshot           text,
  effective_country_at_snapshot text,

  -- ── spine: membership + provenance ────────────────────────────────────────
  -- is_on_board FALSE = cleared the cohort gate but not the momentum floor.
  -- These rows are the point of the table: they are next week's entrants.
  is_on_board                boolean     NOT NULL,
  source_computed_at         timestamptz,   -- from the ranks/momentum row: proves
                                            -- this captured what SHIPPED, not a recompute
  enrichment_run_id          uuid,
  source                     text        NOT NULL DEFAULT 'capture',  -- 'capture' | 'legacy'

  -- ── placement (board members only; NULL for pool-only rows) ───────────────
  global_rank                integer,
  us_rank                    integer,       -- STORED column, scored vs historical country

  -- ── score outputs ─────────────────────────────────────────────────────────
  rising_star_percentile           numeric,
  rising_star_raw                  numeric,
  momentum_component               numeric,
  visibility_component             numeric,
  scientific_momentum_percentile   numeric,
  network_momentum_percentile      numeric,
  scientific_visibility_percentile numeric,
  network_visibility_percentile    numeric,

  -- ── GATE BLOCK: the variables membership is decided on ────────────────────
  -- pub_velocity_delta = recent_senior_pubs - early_senior_pubs. The floor is
  -- applied to this. Both sides are stored so "which threshold, and the value
  -- either side of it" is answerable without recomputing anything.
  pub_velocity_delta         numeric,
  recent_senior_pubs         integer,
  early_senior_pubs          integer,
  recent_total_pubs          integer,       -- vs MIN_PUBS_PER_WINDOW
  early_total_pubs           integer,
  recent_collaborator_count  integer,       -- vs MIN_COLLABORATORS_PER_WINDOW
  early_collaborator_count   integer,
  career_age                 integer,       -- vs MAX_CAREER_YEARS
  cohort_classification      text,          -- rising_eligible | established
  industry_classification    text,          -- ACADEMIC | GOVERNMENT | ...

  -- ── WINDOW BOUNDS ─────────────────────────────────────────────────────────
  -- The momentum windows ROLL. Without these, a delta that changes between two
  -- snapshots is indistinguishable from a window artifact, and that error is
  -- invisible -- it looks exactly like real movement.
  early_window_start         date,
  early_window_end           date,
  recent_window_start        date,
  recent_window_end          date,

  -- ── THRESHOLD PROVENANCE ──────────────────────────────────────────────────
  -- The 619 -> 251 move was a CONSTANT changing in a Python file. Without the
  -- constant in force at capture time, a threshold change is indistinguishable
  -- from a population change and "which threshold they crossed" requires
  -- reading git history to interpret.
  min_velocity_delta_applied  integer,
  min_pubs_per_window_applied integer,
  min_collaborators_applied   integer,
  max_career_years_applied    integer,

  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hcp_rising_board_snapshots_pkey
    PRIMARY KEY (snapshot_date, hcp_id, therapeutic_area_id),
  CONSTRAINT hcp_rising_board_snapshots_source_chk
    CHECK (source IN ('capture', 'legacy'))
);

CREATE INDEX IF NOT EXISTS idx_rbs_date       ON public.hcp_rising_board_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_rbs_hcp        ON public.hcp_rising_board_snapshots (hcp_id, therapeutic_area_id);
CREATE INDEX IF NOT EXISTS idx_rbs_onboard    ON public.hcp_rising_board_snapshots (snapshot_date, therapeutic_area_id) WHERE is_on_board;
-- Serves "who is one paper from entry" without scanning the whole pool.
CREATE INDEX IF NOT EXISTS idx_rbs_near_floor ON public.hcp_rising_board_snapshots (snapshot_date, pub_velocity_delta) WHERE NOT is_on_board;

-- ─────────────────────────────────────────────────────────────────────────────
-- ESTABLISHED
-- ─────────────────────────────────────────────────────────────────────────────
-- SCOPED to global + US + EU5 (DE/FR/IT/ES/GB) -- the scopes established_ledger,
-- ledger_meta, the institution roster, and the narrative generator's
-- VISIBLE_SCOPES actually read. The other 74 region scopes are 15,180 of the
-- 38,012 rows and are rendered by nothing.
--
-- WRITE-ON-CHANGE, not weekly: recompute_established_ranks_v3.py is NOT in the
-- reingest cycle (stage 9 runs rising only) and computed_at moves roughly
-- monthly. A weekly capture would write ~4 identical copies per real change.
CREATE TABLE IF NOT EXISTS public.hcp_established_board_snapshots (
  -- ── spine: identity (identical to rising) ─────────────────────────────────
  snapshot_date                 date        NOT NULL,
  hcp_id                        uuid        NOT NULL,
  therapeutic_area_id           uuid        NOT NULL,
  therapeutic_area_slug         text,
  first_name                    text,
  last_name                     text,
  institution_at_snapshot       text,
  country_at_snapshot           text,
  effective_country_at_snapshot text,

  -- ── spine: membership + provenance ────────────────────────────────────────
  is_on_board                boolean     NOT NULL,
  source_computed_at         timestamptz,
  enrichment_run_id          uuid,
  source                     text        NOT NULL DEFAULT 'capture',

  -- ── placement ─────────────────────────────────────────────────────────────
  -- Established membership is a SET OF ROWS (one per scope), not a column, so
  -- scope is part of the key rather than an attribute.
  scope_type                 text        NOT NULL,
  scope_value                text        NOT NULL,  -- '__global__' sentinel, see note
  rank                       integer,

  -- ── score outputs ─────────────────────────────────────────────────────────
  cohort_score                numeric,
  scientific_influence_pctile numeric,
  network_influence_pctile    numeric,
  pharma_engagement_pctile    numeric,

  -- ── GATE BLOCK ────────────────────────────────────────────────────────────
  -- Established has NO score floor: membership is classification + the industry
  -- filter, so these columns ARE the gate. matched_pattern is included because
  -- the NCI/NIH carve-out is part of it -- GOVERNMENT is admitted only when the
  -- pattern matched National Cancer Institute / National Institutes of Health,
  -- and without the pattern an admitted GOVERNMENT row is unexplainable.
  cohort_classification      text,
  industry_classification    text,
  industry_matched_pattern   text,
  career_age                 integer,

  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hcp_established_board_snapshots_pkey
    PRIMARY KEY (snapshot_date, hcp_id, therapeutic_area_id, scope_type, scope_value),
  CONSTRAINT hcp_established_board_snapshots_source_chk
    CHECK (source IN ('capture', 'legacy'))
);
-- SENTINEL: hcp_established_ranks_v3.scope_value is NULL for scope_type='global'.
-- A NULL cannot participate in a PRIMARY KEY, so global rows store the literal
-- '__global__' here. The writer performs that mapping and hcp_board_movement_v1
-- maps it back with NULLIF, so no consumer sees the sentinel.

CREATE INDEX IF NOT EXISTS idx_ebs_date    ON public.hcp_established_board_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_ebs_hcp     ON public.hcp_established_board_snapshots (hcp_id, therapeutic_area_id);
CREATE INDEX IF NOT EXISTS idx_ebs_onboard ON public.hcp_established_board_snapshots (snapshot_date, scope_type, scope_value) WHERE is_on_board;

-- ─────────────────────────────────────────────────────────────────────────────
-- UNION VIEW — the spine only, so cross-board movement is a single query.
-- ─────────────────────────────────────────────────────────────────────────────
-- Answers "who left Rising because they joined Established": same hcp_id and
-- snapshot_date, is_on_board false on board='rising' and true on
-- board='established'. Gate columns are deliberately NOT in the view -- they
-- differ per board and belong to the per-board tables.
CREATE OR REPLACE VIEW public.hcp_board_movement_v1 AS
  SELECT 'rising'::text                    AS board,
         snapshot_date, hcp_id, therapeutic_area_id, therapeutic_area_slug,
         first_name, last_name,
         institution_at_snapshot, country_at_snapshot, effective_country_at_snapshot,
         is_on_board,
         NULL::text                        AS scope_type,
         NULL::text                        AS scope_value,
         global_rank                       AS rank,
         rising_star_percentile            AS score,
         source_computed_at, source
  FROM public.hcp_rising_board_snapshots
  UNION ALL
  SELECT 'established'::text               AS board,
         snapshot_date, hcp_id, therapeutic_area_id, therapeutic_area_slug,
         first_name, last_name,
         institution_at_snapshot, country_at_snapshot, effective_country_at_snapshot,
         is_on_board,
         scope_type,
         NULLIF(scope_value, '__global__') AS scope_value,
         rank,
         cohort_score                      AS score,
         source_computed_at, source
  FROM public.hcp_established_board_snapshots;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — read-only public, matching the existing snapshot tables.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hcp_rising_board_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcp_established_board_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hcp_rising_board_snapshots_public_read      ON public.hcp_rising_board_snapshots;
DROP POLICY IF EXISTS hcp_established_board_snapshots_public_read ON public.hcp_established_board_snapshots;
CREATE POLICY hcp_rising_board_snapshots_public_read
  ON public.hcp_rising_board_snapshots      FOR SELECT USING (true);
CREATE POLICY hcp_established_board_snapshots_public_read
  ON public.hcp_established_board_snapshots FOR SELECT USING (true);

-- The writer is a psycopg2 script on DATABASE_URL (table owner), but grant
-- service_role explicitly so a later RPC or Edge Function reading these does
-- not hit the standing "new tables need explicit service_role grants" trap.
GRANT SELECT ON public.hcp_rising_board_snapshots      TO anon, authenticated, service_role;
GRANT SELECT ON public.hcp_established_board_snapshots TO anon, authenticated, service_role;
GRANT SELECT ON public.hcp_board_movement_v1           TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL — spine + placement only, gate columns NULL, source='legacy'.
-- ─────────────────────────────────────────────────────────────────────────────
-- Identity is taken from hcps_v2 AS IT IS TODAY, which is NOT what it was on
-- those dates (the affiliation re-derivation has since rewritten
-- current_institution / current_country corpus-wide). That is a known and
-- accepted imprecision for the two legacy dates only; source='legacy' is what
-- marks it. Every capture from now on denormalizes identity at capture time.
INSERT INTO public.hcp_rising_board_snapshots (
  snapshot_date, hcp_id, therapeutic_area_id, therapeutic_area_slug,
  first_name, last_name, institution_at_snapshot, country_at_snapshot,
  effective_country_at_snapshot, is_on_board, source,
  global_rank, us_rank,
  rising_star_percentile,
  scientific_momentum_percentile, network_momentum_percentile,
  scientific_visibility_percentile, network_visibility_percentile
)
SELECT s.snapshot_date, s.hcp_id, s.therapeutic_area_id, ta.slug,
       h.first_name, h.last_name,
       COALESCE(h.current_institution, h.institution_normalized),
       h.country,
       NULLIF(BTRIM(COALESCE(h.current_country, h.country)), ''),
       true,          -- every legacy row WAS a board member; the pool was never captured
       'legacy',
       s.global_rank, s.us_rank,
       s.rising_star_percentile,
       s.scientific_momentum_percentile, s.network_momentum_percentile,
       s.scientific_visibility_percentile, s.network_visibility_percentile
FROM public.hcp_rising_star_snapshots s
LEFT JOIN public.hcps_v2 h            ON h.id  = s.hcp_id
LEFT JOIN public.therapeutic_areas ta ON ta.id = s.therapeutic_area_id
ON CONFLICT (snapshot_date, hcp_id, therapeutic_area_id) DO NOTHING;

INSERT INTO public.hcp_established_board_snapshots (
  snapshot_date, hcp_id, therapeutic_area_id, therapeutic_area_slug,
  first_name, last_name, institution_at_snapshot, country_at_snapshot,
  effective_country_at_snapshot, is_on_board, source,
  scope_type, scope_value, rank, cohort_score
)
SELECT s.snapshot_date, s.hcp_id, s.therapeutic_area_id, ta.slug,
       h.first_name, h.last_name,
       COALESCE(h.current_institution, h.institution_normalized),
       h.country,
       NULLIF(BTRIM(COALESCE(h.current_country, h.country)), ''),
       true, 'legacy',
       s.scope_type, COALESCE(s.scope_value, '__global__'),
       s.us_rank, s.cohort_score
FROM public.hcp_established_snapshots s
LEFT JOIN public.hcps_v2 h            ON h.id  = s.hcp_id
LEFT JOIN public.therapeutic_areas ta ON ta.id = s.therapeutic_area_id
WHERE s.scope_type = 'global'
   OR (s.scope_type = 'region' AND s.scope_value IN ('US','DE','FR','IT','ES','GB'))
ON CONFLICT (snapshot_date, hcp_id, therapeutic_area_id, scope_type, scope_value) DO NOTHING;

-- Post-condition: the legacy rows landed and carry no fabricated gate values.
DO $$
DECLARE n_rise int; n_est int; n_bad int;
BEGIN
  SELECT count(*) INTO n_rise FROM public.hcp_rising_board_snapshots      WHERE source = 'legacy';
  SELECT count(*) INTO n_est  FROM public.hcp_established_board_snapshots WHERE source = 'legacy';
  SELECT count(*) INTO n_bad  FROM public.hcp_rising_board_snapshots
   WHERE source = 'legacy'
     AND (pub_velocity_delta IS NOT NULL OR recent_senior_pubs IS NOT NULL
          OR min_velocity_delta_applied IS NOT NULL);
  IF n_bad > 0 THEN
    RAISE EXCEPTION 'legacy backfill wrote % gate values; NULL means not-captured', n_bad;
  END IF;
  RAISE NOTICE 'backfill OK: % rising legacy rows, % established legacy rows, 0 fabricated gate values',
    n_rise, n_est;
END $$;

COMMIT;
