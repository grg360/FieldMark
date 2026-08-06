-- Rising board flags (2026-08-05): the RECENT SENIOR AUTHORSHIP event badge
-- (zero senior papers in the early rolling window, >= 3 in the recent — a
-- claim about the windows, not the whole career) and the open-trial flag
-- (>= 1 row in the gated trial_investigators_rendered_v1 view; inherits its
-- confidence gating and the registry role disclosure). Neither is a score
-- input. SECURITY DEFINER because the underlying tables are not anon-readable.
CREATE OR REPLACE FUNCTION rising_board_flags(p_hcp_ids uuid[])
RETURNS TABLE (hcp_id uuid, senior_transition boolean, recent_senior_pubs int, on_open_trial boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.hcp_id,
         (s.early_senior_pubs = 0 AND s.recent_senior_pubs >= 3) AS senior_transition,
         s.recent_senior_pubs::int,
         EXISTS (SELECT 1 FROM trial_investigators_rendered_v1 t WHERE t.hcp_id = s.hcp_id) AS on_open_trial
  FROM hcp_scientific_momentum_v1 s
  WHERE s.hcp_id = ANY(p_hcp_ids)
$$;
GRANT EXECUTE ON FUNCTION rising_board_flags(uuid[]) TO anon, authenticated, service_role;

-- v2 (same day): career-anchored display fields + 24-month activity selector
-- Rising badges v2 (2026-08-05): the selector stays window-based (zero senior
-- papers in the early rolling window, >= 3 in the recent, >= 1 in the trailing
-- 24 months), but the DISPLAY is career-anchored: corpus-wide first and latest
-- senior-authored years, so the claim does not shift as the windows roll.
-- "Corpus-wide" means within the FieldMark corpus — we see only what is
-- ingested; the tooltip carries that caveat.
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
         EXISTS (SELECT 1 FROM trial_investigators_rendered_v1 t WHERE t.hcp_id = s.hcp_id) AS on_open_trial
  FROM hcp_scientific_momentum_v1 s
  LEFT JOIN seniors sn ON sn.hcp_id = s.hcp_id
  WHERE s.hcp_id = ANY(p_hcp_ids)
$$;
GRANT EXECUTE ON FUNCTION rising_board_flags(uuid[]) TO anon, authenticated, service_role;
