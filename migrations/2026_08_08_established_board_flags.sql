-- 2026_08_08 — Established board flags: the two badges picked from the
-- 2026-08-08 signal inventory (HELD for review; run after approval).
--
--   senior_recent    — >= 1 senior-authored publication within the trailing
--                      24 months (corpus-bounded, same claim-type as Rising's
--                      badge at Established-scale coverage: 727 of 2,990).
--                      Display fields mirror rising_board_flags' career-anchored
--                      pattern: count in window + latest senior year.
--   verified_social  — hcps_v2.is_verified_dol, set only by human review;
--                      the same gate as Social's gold (38 of 2,990).
--
-- One RPC, one round trip per ledger page (open-trial stays in
-- board_open_trials — already shaped for its future pop-up). SECURITY
-- DEFINER, matching rising_board_flags: publication_authors_v2 sits behind
-- RLS and the flags must not depend on client-side table policy.
-- Neither flag is a score input.

CREATE OR REPLACE FUNCTION established_board_flags(p_hcp_ids uuid[])
RETURNS TABLE (hcp_id uuid, senior_recent boolean, senior_pubs_24mo int,
               latest_senior_year int, verified_social boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH seniors AS (
    SELECT pa.hcp_id,
           COUNT(*) FILTER (
             WHERE (CASE WHEN EXTRACT(MONTH FROM p.pub_date) = 1 AND EXTRACT(DAY FROM p.pub_date) = 1
                    THEN make_date(p.pub_year, 7, 1)
                    ELSE COALESCE(p.pub_date, make_date(p.pub_year, 7, 1)) END)
                   >= (date_trunc('month', now()) - interval '24 months')::date
           )::int AS pubs_24mo,
           MAX(p.pub_year) AS latest_y
    FROM publication_authors_v2 pa
    JOIN publications_v2 p ON p.id = pa.publication_id
    WHERE pa.hcp_id = ANY(p_hcp_ids) AND pa.is_senior_author
    GROUP BY pa.hcp_id
  )
  SELECT h.id,
         COALESCE(sn.pubs_24mo, 0) > 0 AS senior_recent,
         COALESCE(sn.pubs_24mo, 0)     AS senior_pubs_24mo,
         sn.latest_y::int              AS latest_senior_year,
         COALESCE(h.is_verified_dol, false) AS verified_social
  FROM hcps_v2 h
  LEFT JOIN seniors sn ON sn.hcp_id = h.id
  WHERE h.id = ANY(p_hcp_ids)
$$;

GRANT EXECUTE ON FUNCTION established_board_flags(uuid[]) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
