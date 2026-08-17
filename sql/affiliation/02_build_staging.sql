-- Affiliation re-derivation — staging build (READS ONLY from source tables).
--
-- Builds hcp_affiliation_rederived_v1, one row per HCP that has at least one ROR'd
-- publication. Nothing in hcps_v2 is touched here; 03_apply.sql does the UPDATE.
--
-- METHODOLOGY (docs/AFFILIATION_REDERIVATION_SCOPE.md, as amended by
-- docs/AFFILIATION_REDERIVATION_STEPS_1_2_RESULTS.md):
--
--   window    : pub_year >= 2023 (3 full years + current partial), primary tier
--   weight    : 0.65 ^ (2026 - LEAST(pub_year, 2026))
--               The LEAST() clamp is load-bearing: author_pub_flat holds 337,068 rows
--               dated 2026, 217 dated 2027 and 6 dated 2028 (ahead-of-print). Without
--               the clamp those take a negative exponent and weigh MORE than 1.0.
--
--   *** COUNTRY ROLLUP (the Step-2 correctness fix) ***
--   current_country is decided by summing weights BY COUNTRY first, then picking the
--   winner -- NOT by reading the country off the winning institution. One real employer
--   is routinely split across several ROR entities (Bataller: IDIBAPS + Hospital Clinic;
--   Nagasaka: UC Irvine + UCI Medical Center + UC Irvine Health; Park: Samsung Medical
--   Center + Sungkyunkwan). Institution-level picking splits that vote and produced a
--   verified false positive: Keunchil Park resolved to US/MD Anderson (dom 0.44) when
--   public record has him still at Samsung Medical Center. Country rollup holds him KR.
--
--   current_institution is then the top-weighted ROR *within the winning country*, so
--   country and institution can never disagree.
--
--   STALE TIER: HCPs with no in-window ROR'd paper fall back to ALL years, with weights
--   taken relative to that person's OWN most recent year (so their latest affiliation
--   dominates -- effectively "last known"). They are stamped confidence='stale' and
--   affiliation_as_of = the year that evidence actually comes from.
--
--   confidence: high   = evidence_n >= 3 AND country dominance >= 0.6, in-window
--               medium = in-window but thin (n<3) or contested (dominance < 0.6)
--               stale  = no in-window evidence; value from the all-time fallback
--               unknown= no ROR'd affiliation ever (stamped by 03_apply.sql, not here)

SET statement_timeout = '30min';

DROP TABLE IF EXISTS hcp_affiliation_rederived_v1;

CREATE TABLE hcp_affiliation_rederived_v1 AS
WITH base AS (
  SELECT l.hcp_id,
         regexp_replace(f.institution_ror, '^https?://ror\.org/', '') AS rid,
         f.institution AS inst_name,
         LEAST(f.pub_year, 2026) AS py
  FROM hcp_openalex_authors_v2 l
  JOIN author_pub_flat f ON f.author_id = l.openalex_author_id
  WHERE f.institution_ror IS NOT NULL
    AND f.pub_year IS NOT NULL
),
bc AS (
  SELECT b.hcp_id, b.rid, b.inst_name, b.py, rc.country_code AS cc
  FROM base b
  LEFT JOIN ror_to_country rc ON rc.ror_id = b.rid
),
-- Does this person have any in-window evidence? Decides which tier they use.
tier AS (
  SELECT hcp_id,
         bool_or(py >= 2023) AS has_win,
         max(py)             AS max_py
  FROM bc
  GROUP BY hcp_id
),
-- Weighted rows. In-window people use only in-window rows, referenced to 2026.
-- Stale people use ALL rows, referenced to their own latest year.
wrows AS (
  SELECT bc.hcp_id, bc.rid, bc.inst_name, bc.cc, bc.py, t.has_win,
         CASE WHEN t.has_win THEN power(0.65, 2026 - bc.py)
              ELSE power(0.65, t.max_py - bc.py) END AS w
  FROM bc
  JOIN tier t ON t.hcp_id = bc.hcp_id
  WHERE (t.has_win AND bc.py >= 2023) OR NOT t.has_win
),

-- ============ COUNTRY ROLLUP (fragmented RORs summed into one national vote) =========
cscore AS (
  SELECT hcp_id, cc, sum(w) AS w, count(*) AS n, max(py) AS last_year, bool_or(has_win) AS has_win
  FROM wrows
  WHERE cc IS NOT NULL
  GROUP BY hcp_id, cc
),
crank AS (
  SELECT *,
         row_number() OVER (PARTITION BY hcp_id ORDER BY w DESC, last_year DESC, cc) AS rn,
         sum(w)       OVER (PARTITION BY hcp_id) AS total_w
  FROM cscore
),
cwin AS (SELECT * FROM crank WHERE rn = 1),

-- ============ INSTITUTION WINNER, constrained to the winning country =================
iscore AS (
  SELECT w.hcp_id, w.rid, w.cc,
         MODE() WITHIN GROUP (ORDER BY w.inst_name) AS inst_name,
         sum(w.w) AS w, count(*) AS n, min(w.py) AS first_year, max(w.py) AS last_year
  FROM wrows w
  WHERE w.cc IS NOT NULL
  GROUP BY w.hcp_id, w.rid, w.cc
),
iwin AS (
  SELECT DISTINCT ON (i.hcp_id) i.hcp_id, i.rid, i.inst_name, i.last_year
  FROM iscore i
  JOIN cwin c ON c.hcp_id = i.hcp_id AND c.cc = i.cc
  ORDER BY i.hcp_id, i.w DESC, i.last_year DESC, i.rid
),

-- ============ SECONDARY: top institution in a DIFFERENT country, >= 0.20 share =======
-- Deliberately cross-country. A same-country runner-up is almost always another ROR
-- entity for the same employer (UC Irvine Medical Center vs UC Irvine) -- noise. A
-- different-country runner-up is a real second post (Lazarus: ISGlobal alongside CUNY;
-- Vogel: Hannover alongside Toronto).
sec AS (
  SELECT DISTINCT ON (i.hcp_id) i.hcp_id, i.inst_name AS secondary
  FROM iscore i
  JOIN cwin c ON c.hcp_id = i.hcp_id
  JOIN crank r ON r.hcp_id = i.hcp_id AND r.cc = i.cc
  WHERE i.cc <> c.cc
    AND r.w / NULLIF(c.total_w, 0) >= 0.20
  ORDER BY i.hcp_id, i.w DESC, i.last_year DESC
),

-- ============ HISTORY: the per-institution trail, weight-ordered, capped at 10 =======
hist AS (
  SELECT hcp_id,
         jsonb_agg(jsonb_build_object(
           'ror', rid, 'institution', inst_name, 'country', cc,
           'n', n, 'first_year', first_year, 'last_year', last_year,
           'weight', round(w::numeric, 3)
         ) ORDER BY w DESC) AS institution_history
  FROM (
    SELECT *, row_number() OVER (PARTITION BY hcp_id ORDER BY w DESC, last_year DESC) AS rk
    FROM iscore
  ) s
  WHERE rk <= 10
  GROUP BY hcp_id
)

SELECT
  c.hcp_id,
  c.cc                                            AS current_country,
  iw.inst_name                                    AS current_institution,
  iw.rid                                          AS current_institution_ror,
  CASE
    WHEN NOT c.has_win THEN 'stale'
    WHEN c.n >= 3 AND (c.w / NULLIF(c.total_w, 0)) >= 0.6 THEN 'high'
    ELSE 'medium'
  END                                             AS affiliation_confidence,
  c.last_year                                     AS affiliation_as_of,
  c.n                                             AS affiliation_evidence_n,
  round((c.w / NULLIF(c.total_w, 0))::numeric, 3) AS affiliation_dominance,
  s.secondary                                     AS institution_secondary,
  h.institution_history
FROM cwin c
LEFT JOIN iwin iw ON iw.hcp_id = c.hcp_id
LEFT JOIN sec  s  ON s.hcp_id  = c.hcp_id
LEFT JOIN hist h  ON h.hcp_id  = c.hcp_id;

ALTER TABLE hcp_affiliation_rederived_v1 ADD PRIMARY KEY (hcp_id);
CREATE INDEX idx_hcp_affil_rederived_country ON hcp_affiliation_rederived_v1 (current_country);
GRANT SELECT ON public.hcp_affiliation_rederived_v1 TO service_role;
