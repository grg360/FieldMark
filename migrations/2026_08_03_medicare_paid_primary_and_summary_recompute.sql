-- Two pre-build fixes for the Administered Volume block (2026-08-03).
-- STATUS: DRAFTED, NOT YET RUN. Execute in one session; ~1 min total.
--
-- SECTION A — hcp_medicare_by_ta_v2: add ta_drug_paid_3yr_primary (primary-
-- signal DRUG-ONLY paid). Rule 04's sentence is about AGENTS; every stored
-- paid column today includes procedures (high_confidence) or secondary codes
-- (corrected). Same rebuild pattern as 2026_08_02, one extra FILTER.
--
-- SECTION B — hcp_medicare_summary_v2: full recompute from hcp_hcpcs_detail.
-- The table was last aggregated 2026-05-26; total_paid_3yr_corrected was
-- backfilled onto old rows without a recompute; 34 crosswalk-applied HCPs have
-- no row and 41 NSCLC rollup rows have no denominator. KNOWN_ISSUES
-- remediation, now load-bearing.
--
-- Semantics (unchanged from the documented conventions):
--   • paid = Σ total_paid_est (avg × services). total_medicare_payment_3yr is
--     recomputed to the SAME value — the per-service-average-×-beneficiaries
--     defect is retired, legacy readers now see the true figure.
--   • beneficiary columns are CODE-SUMMED INSTANCES, not unique patients.
--   • total_beneficiaries_3yr_unique_est is CARRIED FORWARD where a row
--     existed (its derivation was never verified and is not reproducible from
--     detail); NULL for newly-covered HCPs.
--   • predominant_specialty/state carry forward, falling back to
--     hcps_v2.npi_specialty / nppes_practice_state for new rows; ruca carries
--     forward only (not in detail).
--   • top_hcpcs_codes = top 10 by Σ tot_srvcs (ASSUMPTION: original rank
--     basis undocumented).
--   • YoY = (b2023 − b2021) × 100.0 / b2021, NULL when 2021 empty — the
--     medicare_aggregator.py:491-494 formula.

BEGIN;

-- ───────────────────────────── SECTION A ─────────────────────────────

ALTER TABLE public.hcp_medicare_by_ta_v2
  ADD COLUMN IF NOT EXISTS ta_drug_paid_3yr_primary numeric;

COMMENT ON COLUMN public.hcp_medicare_by_ta_v2.ta_drug_paid_3yr_primary IS
  'Σ total_paid_est over PRIMARY-SIGNAL drug_admin codes only — the "paid to primary-signal NSCLC agents" numerator. Excludes procedures, imaging, E&M, and all secondary codes.';

DELETE FROM public.hcp_medicare_by_ta_v2;

WITH matched AS (
  SELECT d.hcp_id, c.therapeutic_area_id, d.program_year, d.hcpcs_code,
         c.code_description, c.code_category, c.is_primary_signal,
         COALESCE(d.tot_benes, 0)      AS benes,
         COALESCE(d.tot_srvcs, 0)      AS srvcs,
         COALESCE(d.total_paid_est, 0) AS paid,
         (NOT c.requires_specialty_match
          OR EXISTS (SELECT 1 FROM unnest(c.specialty_match_patterns) AS p
                     WHERE h.npi_specialty ILIKE '%' || p || '%')) AS specialty_ok
  FROM public.hcp_hcpcs_detail d
  JOIN public.ta_hcpcs_codes  c ON c.hcpcs_code = d.hcpcs_code
  JOIN public.hcps_v2         h ON h.id = d.hcp_id
),
eligible AS (
  SELECT * FROM matched WHERE is_primary_signal OR specialty_ok
),
per_code AS (
  SELECT hcp_id, therapeutic_area_id, hcpcs_code,
         min(code_description) AS name, min(code_category) AS category,
         bool_or(is_primary_signal) AS is_primary,
         sum(srvcs) AS units_3yr, sum(benes) AS benes_3yr, sum(paid) AS paid_3yr
  FROM eligible GROUP BY 1, 2, 3
),
top5 AS (
  SELECT hcp_id, therapeutic_area_id,
         jsonb_agg(jsonb_build_object(
             'code', hcpcs_code, 'name', name, 'category', category,
             'primary', is_primary, 'units_3yr', units_3yr,
             'benes_3yr', benes_3yr, 'paid_3yr', paid_3yr)
           ORDER BY paid_3yr DESC) AS top_agents
  FROM (SELECT *, row_number() OVER (PARTITION BY hcp_id, therapeutic_area_id
                                     ORDER BY paid_3yr DESC) AS rn
        FROM per_code) ranked
  WHERE rn <= 5 GROUP BY 1, 2
),
rollup AS (
  SELECT hcp_id, therapeutic_area_id,
         sum(benes) FILTER (WHERE is_primary_signal) AS hc_benes,
         sum(srvcs) FILTER (WHERE is_primary_signal) AS hc_srvcs,
         sum(paid)  FILTER (WHERE is_primary_signal) AS hc_paid,
         count(DISTINCT hcpcs_code) FILTER (WHERE is_primary_signal) AS hc_codes,
         sum(benes) AS t_benes, sum(srvcs) AS t_srvcs, sum(paid) AS t_paid,
         count(DISTINCT hcpcs_code) AS t_codes,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin') AS drug_units,
         sum(srvcs) FILTER (WHERE code_category = 'procedure')  AS proc_vol,
         -- SECTION A's new figure: primary-signal AGENTS only.
         sum(paid)  FILTER (WHERE is_primary_signal AND code_category = 'drug_admin') AS drug_paid_primary,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin' AND program_year = 2021) AS du21,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin' AND program_year = 2022) AS du22,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin' AND program_year = 2023) AS du23,
         sum(benes) FILTER (WHERE program_year = 2021) AS b21,
         sum(benes) FILTER (WHERE program_year = 2023) AS b23,
         array_agg(DISTINCT program_year ORDER BY program_year) AS years
  FROM eligible GROUP BY 1, 2
)
INSERT INTO public.hcp_medicare_by_ta_v2 (
  id, hcp_id, therapeutic_area_id,
  ta_beneficiaries_3yr_high_confidence, ta_services_3yr_high_confidence,
  ta_payments_3yr_high_confidence,      ta_distinct_codes_3yr_high_confidence,
  ta_beneficiaries_3yr_total,           ta_services_3yr_total,
  ta_payments_3yr_total,                ta_distinct_codes_3yr_total,
  ta_drug_admin_volume_3yr,             ta_procedure_volume_3yr,
  ta_beneficiaries_yoy_trend_pct,       ta_paid_3yr_corrected,
  ta_drug_paid_3yr_primary,
  ta_drug_units_2021, ta_drug_units_2022, ta_drug_units_2023,
  ta_drug_units_yoy_trend_pct,
  top_agents, medicare_program_years, computed_from,
  aggregated_at, ingestion_run_id
)
SELECT gen_random_uuid(), r.hcp_id, r.therapeutic_area_id,
       r.hc_benes, r.hc_srvcs, r.hc_paid, r.hc_codes,
       r.t_benes,  r.t_srvcs,  r.t_paid,  r.t_codes,
       r.drug_units, r.proc_vol,
       CASE WHEN COALESCE(r.b21, 0)  > 0
            THEN (COALESCE(r.b23, 0)  - r.b21)  * 100.0 / r.b21  END,
       r.t_paid,
       r.drug_paid_primary,
       r.du21, r.du22, r.du23,
       CASE WHEN COALESCE(r.du21, 0) > 0
            THEN (COALESCE(r.du23, 0) - r.du21) * 100.0 / r.du21 END,
       t.top_agents, r.years, 'hcp_hcpcs_detail 2026_08_03 rebuild',
       now(), NULL
FROM rollup r
LEFT JOIN top5 t USING (hcp_id, therapeutic_area_id);

-- ───────────────────────────── SECTION B ─────────────────────────────

CREATE TEMP TABLE _summary_carry ON COMMIT DROP AS
SELECT hcp_id, total_beneficiaries_3yr_unique_est,
       predominant_specialty, predominant_state, predominant_ruca
FROM public.hcp_medicare_summary_v2;

DELETE FROM public.hcp_medicare_summary_v2;

WITH per_hcp AS (
  SELECT d.hcp_id,
         min(d.npi) AS npi,
         sum(d.tot_benes) FILTER (WHERE d.program_year = 2021) AS b21,
         sum(d.tot_benes) FILTER (WHERE d.program_year = 2022) AS b22,
         sum(d.tot_benes) FILTER (WHERE d.program_year = 2023) AS b23,
         sum(d.tot_benes)  AS benes_3yr,
         sum(d.tot_srvcs)  AS srvcs_3yr,
         sum(d.tot_srvcs) FILTER (WHERE d.hcpcs_drug_indicator = 'Y') AS drug_srvcs_3yr,
         sum(d.total_paid_est) AS paid_3yr,
         count(DISTINCT d.hcpcs_code) AS codes_3yr,
         array_agg(DISTINCT d.program_year ORDER BY d.program_year) AS years
  FROM public.hcp_hcpcs_detail d
  GROUP BY 1
),
pos_pick AS (
  SELECT DISTINCT ON (hcp_id) hcp_id, place_of_service
  FROM (SELECT hcp_id, place_of_service, sum(COALESCE(tot_srvcs, 0)) AS s
        FROM public.hcp_hcpcs_detail
        WHERE place_of_service IS NOT NULL
        GROUP BY 1, 2) x
  ORDER BY hcp_id, s DESC
),
top_codes AS (
  SELECT hcp_id, array_agg(hcpcs_code ORDER BY s DESC) AS codes
  FROM (SELECT hcp_id, hcpcs_code, sum(COALESCE(tot_srvcs, 0)) AS s,
               row_number() OVER (PARTITION BY hcp_id
                                  ORDER BY sum(COALESCE(tot_srvcs, 0)) DESC) AS rn
        FROM public.hcp_hcpcs_detail
        GROUP BY 1, 2) y
  WHERE rn <= 10 GROUP BY 1
)
INSERT INTO public.hcp_medicare_summary_v2 (
  hcp_id, npi,
  beneficiaries_2021, beneficiaries_2022, beneficiaries_2023,
  total_beneficiaries_3yr, total_beneficiaries_3yr_unique_est,
  total_services_3yr, drug_services_3yr,
  total_medicare_payment_3yr, total_paid_3yr_corrected,
  total_distinct_hcpcs_codes_3yr,
  beneficiaries_yoy_trend_pct,
  primary_place_of_service, predominant_specialty, predominant_state,
  predominant_ruca, top_hcpcs_codes, medicare_program_years,
  medicare_calculated_at, aggregated_at, ingestion_run_id
)
SELECT p.hcp_id,
       COALESCE(h.npi_number, p.npi),
       COALESCE(p.b21, 0), COALESCE(p.b22, 0), COALESCE(p.b23, 0),
       COALESCE(p.benes_3yr, 0),
       c.total_beneficiaries_3yr_unique_est,
       COALESCE(p.srvcs_3yr, 0), COALESCE(p.drug_srvcs_3yr, 0),
       p.paid_3yr,      -- legacy column recomputed to the TRUE figure; defect retired
       p.paid_3yr,
       p.codes_3yr,
       CASE WHEN COALESCE(p.b21, 0) > 0
            THEN (COALESCE(p.b23, 0) - p.b21) * 100.0 / p.b21 END,
       pp.place_of_service,
       COALESCE(c.predominant_specialty, h.npi_specialty),
       COALESCE(c.predominant_state, h.nppes_practice_state),
       c.predominant_ruca,
       tc.codes,
       p.years,
       now(), now(), NULL
FROM per_hcp p
JOIN public.hcps_v2 h ON h.id = p.hcp_id
LEFT JOIN _summary_carry c ON c.hcp_id = p.hcp_id
LEFT JOIN pos_pick  pp ON pp.hcp_id = p.hcp_id
LEFT JOIN top_codes tc ON tc.hcp_id = p.hcp_id;

COMMIT;

NOTIFY pgrst, 'reload schema';
