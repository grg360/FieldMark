-- 2026_08_08 — rising_board_flags: gate on_open_trial to genuinely OPEN trials.
--
-- Same defect as caught on the Established read the same day:
-- trial_investigators_rendered_v1 is confidence-gated but NOT status-gated
-- (9,298 of its 24,687 trials are COMPLETED, +1,668 TERMINATED, 561
-- WITHDRAWN), and the badge's bare EXISTS said "OPEN TRIAL" for closed
-- trials. Gate = the platform's canonical OPEN_TRIAL_STATUSES (theWeek.ts).
-- Measured on the US rising board (123): badge 54 -> 49 (5 HCPs whose only
-- rendered trials are closed lose it). A badge that means "open" means open
-- on every ledger.
--
-- Re-issues the 2026-08-05 v2 function verbatim except the on_open_trial
-- EXISTS; signature unchanged, so no client change is needed.
--
-- COLUMN RESOLUTION (verified 2026-08-08 against information_schema and the
-- executing live function): s.early_senior_pubs / s.recent_senior_pubs are
-- REAL COLUMNS on hcp_scientific_momentum_v1 — the s alias, not the sn CTE.
-- This two-source split is the deployed v2 DESIGN, not an accident: the
-- SELECTOR reads the momentum table's precomputed rolling-window counts
-- (early = 0, recent >= 3) AND the CTE's live trailing-24-month activity
-- check; the CTE contributes ONLY first_y / latest_y / active_24mo (career-
-- anchored display + freshness). It computes no pub counts, so nothing is
-- silently ignored. The two sources CAN drift between enrichment runs (table
-- counts are as-of computed_at; active_24mo is as-of query time) — that is
-- the shipped behavior, reproduced here unchanged.

CREATE OR REPLACE FUNCTION rising_board_flags(p_hcp_ids uuid[])
RETURNS TABLE (hcp_id uuid, senior_transition boolean, recent_senior_pubs int,
               first_senior_year int, latest_senior_year int, on_open_trial boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH seniors AS (
    SELECT pa.hcp_id,
           MIN(p.pub_year) AS first_y,
           MAX(p.pub_year) AS latest_y,
           MAX(CASE WHEN (CASE WHEN EXTRACT(MONTH FROM p.pub_date) = 1 AND EXTRACT(DAY FROM p.pub_date) = 1
                          THEN make_date(p.pub_year, 7, 1)
                          ELSE COALESCE(p.pub_date, make_date(p.pub_year, 7, 1)) END)
                         >= (date_trunc('month', now()) - interval '24 months')::date
                    THEN 1 ELSE 0 END) AS active_24mo
    FROM publication_authors_v2 pa
    JOIN publications_v2 p ON p.id = pa.publication_id
    WHERE pa.hcp_id = ANY(p_hcp_ids) AND pa.is_senior_author
    GROUP BY pa.hcp_id
  )
  SELECT s.hcp_id,
         (s.early_senior_pubs = 0 AND s.recent_senior_pubs >= 3
          AND COALESCE(sn.active_24mo, 0) = 1) AS senior_transition,
         s.recent_senior_pubs::int,
         sn.first_y::int,
         sn.latest_y::int,
         EXISTS (SELECT 1 FROM trial_investigators_rendered_v1 t
                 JOIN clinical_trials_v2 ct ON ct.id = t.trial_id
                 WHERE t.hcp_id = s.hcp_id
                   AND ct.status IN ('RECRUITING', 'ACTIVE_NOT_RECRUITING',
                                     'NOT_YET_RECRUITING', 'ENROLLING_BY_INVITATION')) AS on_open_trial
  FROM hcp_scientific_momentum_v1 s
  LEFT JOIN seniors sn ON sn.hcp_id = s.hcp_id
  WHERE s.hcp_id = ANY(p_hcp_ids)
$$;

GRANT EXECUTE ON FUNCTION rising_board_flags(uuid[]) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
