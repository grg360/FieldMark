-- Recompute hcp_medicare_by_ta_v2 from hcp_hcpcs_detail × ta_hcpcs_codes.
-- STATUS: DRAFTED 2026-08-02, NOT YET RUN. Review, then execute via SQL editor
-- or psql in one transaction (~seconds against 876k detail rows).
--
-- Replaces the legacy aggregation (which inherits the hcp_medicare_summary_v2
-- semantics defects, KNOWN_ISSUES 2026-07-30) with honest figures:
--   • paid = Σ total_paid_est (avg × services). NEVER avg × beneficiaries.
--   • beneficiary columns are CODE-SUMMED INSTANCES, not unique patients —
--     a patient counts once per (code, place_of_service, year) row. Label as such.
--   • drug-code tot_srvcs are BILLED UNITS (mg increments), not encounters.
--   • high_confidence = is_primary_signal codes only; *_total additionally
--     includes secondary codes whose specialty gate passes
--     (npi_specialty ILIKE any of specialty_match_patterns).
--
-- YoY trend formula (both trend columns): ((y2023 - y2021) * 100.0 / y2021),
-- NULL when 2021 is empty. CONFIRMED aligned with the summary writer
-- (scripts/aggregate/medicare_aggregator.py:491-494 computes
-- beneficiaries_yoy_trend_pct identically, unrounded) — the two surfaces
-- cannot disagree on basis.

BEGIN;

-- 1) Schema diff: new columns (existing columns keep names, recomputed meanings).
ALTER TABLE public.hcp_medicare_by_ta_v2
  ADD COLUMN IF NOT EXISTS ta_paid_3yr_corrected          numeric,
  ADD COLUMN IF NOT EXISTS ta_drug_units_2021             integer,
  ADD COLUMN IF NOT EXISTS ta_drug_units_2022             integer,
  ADD COLUMN IF NOT EXISTS ta_drug_units_2023             integer,
  ADD COLUMN IF NOT EXISTS ta_drug_units_yoy_trend_pct    numeric,
  ADD COLUMN IF NOT EXISTS top_agents                     jsonb,
  ADD COLUMN IF NOT EXISTS medicare_program_years         integer[],
  ADD COLUMN IF NOT EXISTS computed_from                  text;

COMMENT ON COLUMN public.hcp_medicare_by_ta_v2.ta_paid_3yr_corrected IS
  'Σ hcp_hcpcs_detail.total_paid_est over TA-matched, specialty-eligible codes. The only total-shaped payment figure; legacy ta_payments_* columns are recomputed to the same basis by the 2026_08_02 rebuild.';
COMMENT ON COLUMN public.hcp_medicare_by_ta_v2.ta_beneficiaries_3yr_total IS
  'CODE-SUMMED beneficiary instances (once per code×place×year), NOT unique patients.';
COMMENT ON COLUMN public.hcp_medicare_by_ta_v2.top_agents IS
  'Top 5 TA-matched codes by 3yr paid: [{code,name,category,primary,units_3yr,benes_3yr,paid_3yr}]. Drug-code units are billed units, not encounters.';

-- 2) Rebuild.
DELETE FROM public.hcp_medicare_by_ta_v2;

WITH matched AS (
  SELECT d.hcp_id,
         c.therapeutic_area_id,
         d.program_year,
         d.hcpcs_code,
         c.code_description,
         c.code_category,
         c.is_primary_signal,
         COALESCE(d.tot_benes, 0)      AS benes,
         COALESCE(d.tot_srvcs, 0)      AS srvcs,
         COALESCE(d.total_paid_est, 0) AS paid,
         (NOT c.requires_specialty_match
          OR EXISTS (SELECT 1
                     FROM unnest(c.specialty_match_patterns) AS p
                     WHERE h.npi_specialty ILIKE '%' || p || '%')) AS specialty_ok
  FROM public.hcp_hcpcs_detail d
  JOIN public.ta_hcpcs_codes  c ON c.hcpcs_code = d.hcpcs_code
  JOIN public.hcps_v2         h ON h.id = d.hcp_id
),
eligible AS (
  -- primary-signal codes always count; secondary codes only past the specialty gate
  SELECT * FROM matched WHERE is_primary_signal OR specialty_ok
),
per_code AS (
  SELECT hcp_id, therapeutic_area_id, hcpcs_code,
         min(code_description) AS name,
         min(code_category)    AS category,
         bool_or(is_primary_signal) AS is_primary,
         sum(srvcs) AS units_3yr,
         sum(benes) AS benes_3yr,
         sum(paid)  AS paid_3yr
  FROM eligible
  GROUP BY 1, 2, 3
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
  WHERE rn <= 5
  GROUP BY 1, 2
),
rollup AS (
  SELECT hcp_id, therapeutic_area_id,
         sum(benes) FILTER (WHERE is_primary_signal) AS hc_benes,
         sum(srvcs) FILTER (WHERE is_primary_signal) AS hc_srvcs,
         sum(paid)  FILTER (WHERE is_primary_signal) AS hc_paid,
         count(DISTINCT hcpcs_code) FILTER (WHERE is_primary_signal) AS hc_codes,
         sum(benes) AS t_benes,
         sum(srvcs) AS t_srvcs,
         sum(paid)  AS t_paid,
         count(DISTINCT hcpcs_code) AS t_codes,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin') AS drug_units,
         sum(srvcs) FILTER (WHERE code_category = 'procedure')  AS proc_vol,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin' AND program_year = 2021) AS du21,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin' AND program_year = 2022) AS du22,
         sum(srvcs) FILTER (WHERE code_category = 'drug_admin' AND program_year = 2023) AS du23,
         sum(benes) FILTER (WHERE program_year = 2021) AS b21,
         sum(benes) FILTER (WHERE program_year = 2023) AS b23,
         array_agg(DISTINCT program_year ORDER BY program_year) AS years
  FROM eligible
  GROUP BY 1, 2
)
INSERT INTO public.hcp_medicare_by_ta_v2 (
  id, hcp_id, therapeutic_area_id,
  ta_beneficiaries_3yr_high_confidence, ta_services_3yr_high_confidence,
  ta_payments_3yr_high_confidence,      ta_distinct_codes_3yr_high_confidence,
  ta_beneficiaries_3yr_total,           ta_services_3yr_total,
  ta_payments_3yr_total,                ta_distinct_codes_3yr_total,
  ta_drug_admin_volume_3yr,             ta_procedure_volume_3yr,
  ta_beneficiaries_yoy_trend_pct,
  ta_paid_3yr_corrected,
  ta_drug_units_2021, ta_drug_units_2022, ta_drug_units_2023,
  ta_drug_units_yoy_trend_pct,
  top_agents, medicare_program_years, computed_from,
  aggregated_at, ingestion_run_id
)
SELECT gen_random_uuid(), r.hcp_id, r.therapeutic_area_id,
       r.hc_benes, r.hc_srvcs, r.hc_paid, r.hc_codes,
       r.t_benes,  r.t_srvcs,  r.t_paid,  r.t_codes,
       r.drug_units, r.proc_vol,
       -- unrounded, matching medicare_aggregator.py:491-494 exactly
       CASE WHEN COALESCE(r.b21, 0)  > 0
            THEN (COALESCE(r.b23, 0)  - r.b21)  * 100.0 / r.b21  END,
       r.t_paid,
       r.du21, r.du22, r.du23,
       CASE WHEN COALESCE(r.du21, 0) > 0
            THEN (COALESCE(r.du23, 0) - r.du21) * 100.0 / r.du21 END,
       t.top_agents, r.years, 'hcp_hcpcs_detail 2026_08_02 rebuild',
       now(), NULL
FROM rollup r
LEFT JOIN top5 t USING (hcp_id, therapeutic_area_id);

-- 3) Access. RLS is ENABLED on this table with ZERO policies today, so every
-- PostgREST read currently returns nothing — this policy is a behavior change,
-- not just convention. Grants exist but are re-asserted for idempotence.
DROP POLICY IF EXISTS hcp_medicare_by_ta_v2_public_read ON public.hcp_medicare_by_ta_v2;
CREATE POLICY hcp_medicare_by_ta_v2_public_read
  ON public.hcp_medicare_by_ta_v2 FOR SELECT USING (true);
GRANT SELECT ON public.hcp_medicare_by_ta_v2 TO anon, authenticated;
GRANT ALL    ON public.hcp_medicare_by_ta_v2 TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
