-- ============================================================================
-- Trials surface RPC — resolve rank against the GLOBAL boards, not the US board
-- only. Date: 2026-08-13   Branch: resurfacing
--
-- NOT YET APPLIED. Authored alongside the frontend backfill in
-- frontend/src/lib/trials.ts; applying this makes that backfill redundant
-- (it becomes a no-op, since no investigator comes back with a NULL rank).
--
-- ── The defect ──────────────────────────────────────────────────────────────
-- 2026_08_04_trials_surface_rpc.sql resolves rank against the US board only:
--
--   established arm:  WHERE scope_type = 'region' AND scope_value = 'US'
--   rising arm:       SELECT us_rank
--
-- So an investigator who sits on the board but outside the US comes back with
-- a cohort and a NULL rank. The chip's rank-gate reads that as unresolved and
-- paints UNRANKED, which made UNRANKED mean "not on the US board" rather than
-- "not in the cohort".
--
-- Measured 2026-08-13 against live data: 57 of 347 investigator slots
-- (37 distinct people) rendered UNRANKED, and ALL 37 carry a real global rank.
-- Zero were genuinely unranked. Sophie Cousin (Institut Bergonié, FR) is
-- rising #27 globally with us_rank NULL; her profile has always said so.
--
-- ── Two distinct consequences, only one of which the frontend can repair ─────
--  1. MISLABEL — resolved people printed UNRANKED. The frontend backfill
--     repairs this by re-reading the same tables the profile reads.
--  2. OMISSION — the trial_invs INNER JOIN drops anyone the `ranked` CTE has
--     no row for at all. An investigator carrying ONLY a global established
--     rank (no rising row) is therefore absent from the roster entirely, and a
--     trial whose only ranked investigators are such people never enters SET 1.
--     The frontend cannot recover rows the RPC never returned. Only this fixes
--     that, which is why the RPC is the real fix and the backfill is a stopgap.
--
-- ── The change ──────────────────────────────────────────────────────────────
-- Each arm falls back from its US rank to its global rank, and the scope is
-- returned so the surface can say WHICH board the number came off instead of
-- silently mixing two scales. US ranks still win: a person ranked on both
-- boards reads with their US number, exactly as today.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_nsclc_trials_surface()
RETURNS TABLE (
  trial_id uuid,
  nct_id text,
  title text,
  phase text,
  status text,
  sponsor text,
  lead_sponsor_class text,
  start_date date,
  completion_date date,
  interventions jsonb,
  investigators jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH nsclc AS (SELECT 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid AS ta),
  -- ranked NSCLC cohort, best cohort/rank per HCP.
  -- Preference: established over rising (pri), then a US rank over a global one
  -- (scope_pri), then the lowest number. A row only qualifies if it actually
  -- carries a rank, so NULL-ranked rows can no longer win the DISTINCT ON and
  -- strand a resolved person at UNRANKED.
  ranked AS (
    SELECT DISTINCT ON (hcp_id) hcp_id, cohort, rnk, rank_scope
    FROM (
      -- established, US region
      SELECT hcp_id, 'established' AS cohort, rank AS rnk, 'US' AS rank_scope, 0 AS pri, 0 AS scope_pri
      FROM hcp_established_ranks_v3, nsclc
      WHERE therapeutic_area_id = nsclc.ta
        AND scope_type = 'region' AND scope_value = 'US' AND rank IS NOT NULL
      UNION ALL
      -- established, global
      SELECT hcp_id, 'established' AS cohort, rank AS rnk, 'GLOBAL' AS rank_scope, 0 AS pri, 1 AS scope_pri
      FROM hcp_established_ranks_v3, nsclc
      WHERE therapeutic_area_id = nsclc.ta
        AND scope_type = 'global' AND rank IS NOT NULL
      UNION ALL
      -- rising, US board
      SELECT hcp_id, 'rising' AS cohort, us_rank AS rnk, 'US' AS rank_scope, 1 AS pri, 0 AS scope_pri
      FROM hcp_rising_star_ranks_v3, nsclc
      WHERE therapeutic_area_id = nsclc.ta AND us_rank IS NOT NULL
      UNION ALL
      -- rising, global board
      SELECT hcp_id, 'rising' AS cohort, rank AS rnk, 'GLOBAL' AS rank_scope, 1 AS pri, 1 AS scope_pri
      FROM hcp_rising_star_ranks_v3, nsclc
      WHERE therapeutic_area_id = nsclc.ta AND rank IS NOT NULL
    ) u
    ORDER BY hcp_id, pri, scope_pri, rnk
  ),
  trial_invs AS (
    SELECT ti.trial_id, ti.hcp_id, ti.match_confidence, r.cohort, r.rnk, r.rank_scope
    FROM trial_investigators_rendered_v1 ti
    JOIN ranked r ON r.hcp_id = ti.hcp_id
  ),
  set1 AS (
    SELECT DISTINCT c.id
    FROM clinical_trials_v2 c
    JOIN clinical_trials_ta_v2 ta ON ta.trial_id = c.id AND ta.therapeutic_area_id = (SELECT ta FROM nsclc)
    WHERE c.status IN ('RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION')
      AND EXISTS (SELECT 1 FROM trial_invs ti WHERE ti.trial_id = c.id)
  )
  SELECT
    c.id, c.nct_id, c.title, c.phase, c.status, c.sponsor, c.lead_sponsor_class,
    c.start_date, c.completion_date, c.interventions,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'hcp_id', h.id,
          'name', NULLIF(trim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')), ''),
          'state', h.nppes_practice_state,
          'institution', h.institution_normalized,
          'cohort', ti.cohort,
          'rank', ti.rnk,
          'rankScope', ti.rank_scope,
          'confidence', ti.match_confidence
        )
        -- US ranks sort ahead of global ones so the row still leads with the
        -- people the US board ranks highest; the two scales are not comparable
        -- and must not be interleaved by number.
        ORDER BY (ti.rank_scope = 'GLOBAL'), ti.rnk NULLS LAST, ti.match_confidence DESC
      )
      FROM trial_invs ti
      JOIN hcps_v2 h ON h.id = ti.hcp_id
      WHERE ti.trial_id = c.id
    ) AS investigators
  FROM clinical_trials_v2 c
  JOIN set1 ON set1.id = c.id;
$$;

GRANT EXECUTE ON FUNCTION get_nsclc_trials_surface() TO anon;
GRANT EXECUTE ON FUNCTION get_nsclc_trials_surface() TO authenticated;
GRANT EXECUTE ON FUNCTION get_nsclc_trials_surface() TO service_role;

NOTIFY pgrst, 'reload schema';

-- Rollback: re-run migrations/2026_08_04_trials_surface_rpc.sql verbatim.
