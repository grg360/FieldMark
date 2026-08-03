-- Administered Volume block — data layer (2026-08-03).
-- STATUS: DRAFTED, NOT YET RUN in this file's own right — executed by the build.
--
-- hcp_administered_volume(p_hcp_id, p_ta_id) -> jsonb. SECURITY DEFINER because
-- hcp_hcpcs_detail has RLS disabled; a definer function keeps that table
-- unexposed while letting the profile read a shaped payload. Everything is
-- computed from hcp_hcpcs_detail × ta_hcpcs_codes plus hcp_medicare_summary_v2
-- for the ONE seam figure.
--
-- Binding rules encoded here:
--   • Exactly one number crosses the seam: primary-drug paid ÷ summary
--     corrected paid. Returned only when the summary row exists; the component
--     WITHHOLDS it on the established profile (no practice scale on that page).
--   • Unique-beneficiary estimate is NEVER recomputed here — it stays upstream.
--   • Drugs: Instances + Units(dose) + Paid. Procedures: Instances + Services
--     + Paid. No "services" for drugs — at drug grain tot_srvcs is dose units
--     (line-item quantity), not encounters; labelling it Services would repeat
--     the unique-patients mislabel. drug_services_note carries the short why.
--   • Routing on CLAIMS MIX, not npi_specialty: ≥1 primary procedure code ->
--     procedure ledger leads.
--   • Two distinct absence states: no_medicare (no summary, no set rows) vs
--     no_set_activity (summary present, zero set rows).
--   • NULL primary-drug paid is its own sentence, never a blank/zero.
-- Absolute constraints (no regimen inference, instances-not-patients, Part B
-- floor, no peer comparison) are static and rendered by the component.

CREATE OR REPLACE FUNCTION public.hcp_administered_volume(p_hcp_id uuid, p_ta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_has_summary boolean := false;
  v_corrected   numeric;
  v_benes_2023  integer;
  v_set_rows    integer := 0;
  v_years       integer := 0;
  v_proc_rows   integer := 0;
  v_primary_drug_paid numeric := 0;
  v_lead text;
  v_max_year integer;
BEGIN
  SELECT true, s.total_paid_3yr_corrected, s.beneficiaries_2023
    INTO v_has_summary, v_corrected, v_benes_2023
    FROM hcp_medicare_summary_v2 s WHERE s.hcp_id = p_hcp_id;
  IF NOT FOUND THEN v_has_summary := false; END IF;

  SELECT count(*), count(DISTINCT d.program_year), max(d.program_year)
    INTO v_set_rows, v_years, v_max_year
    FROM hcp_hcpcs_detail d
    JOIN ta_hcpcs_codes c ON c.hcpcs_code = d.hcpcs_code AND c.therapeutic_area_id = p_ta_id
    WHERE d.hcp_id = p_hcp_id;

  -- ── Absence states (correction 3: two distinct states) ──
  IF v_set_rows = 0 THEN
    IF v_has_summary THEN
      RETURN jsonb_build_object(
        'state', 'no_set_activity',
        'benes_2023', v_benes_2023,
        'corrected_paid_3yr', v_corrected);
    ELSE
      RETURN jsonb_build_object('state', 'no_medicare');
    END IF;
  END IF;

  -- ── Routing: claims mix, not taxonomy (correction 2) ──
  SELECT count(*) INTO v_proc_rows
    FROM hcp_hcpcs_detail d
    JOIN ta_hcpcs_codes c ON c.hcpcs_code = d.hcpcs_code AND c.therapeutic_area_id = p_ta_id
    WHERE d.hcp_id = p_hcp_id AND c.code_category = 'procedure';
  v_lead := CASE WHEN v_proc_rows > 0 THEN 'procedure' ELSE 'drug' END;

  -- ── Seam numerator (primary drug agents only) ──
  SELECT COALESCE(sum(d.total_paid_est), 0) INTO v_primary_drug_paid
    FROM hcp_hcpcs_detail d
    JOIN ta_hcpcs_codes c ON c.hcpcs_code = d.hcpcs_code AND c.therapeutic_area_id = p_ta_id
    WHERE d.hcp_id = p_hcp_id AND c.is_primary_signal AND c.code_category = 'drug_admin';

  RETURN jsonb_build_object(
    'state',
      CASE
        WHEN v_years <= 1
             AND (SELECT count(DISTINCT d.hcpcs_code) FROM hcp_hcpcs_detail d
                  JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
                  WHERE d.hcp_id=p_hcp_id) <= 2
        THEN 'sparse'
        ELSE 'matched'
      END,
    'ledger_lead', v_lead,
    'max_year', v_max_year,
    'has_practice_scale', v_has_summary,
    'corrected_paid_3yr', v_corrected,
    'benes_2023', v_benes_2023,
    -- NULL primary-drug paid is a real value here (correction 4): 0 rows -> NULL,
    -- distinguished from a present-but-small figure. Component renders its sentence.
    'primary_drug_paid_3yr', CASE WHEN v_primary_drug_paid = 0 AND NOT EXISTS (
        SELECT 1 FROM hcp_hcpcs_detail d
        JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
        WHERE d.hcp_id=p_hcp_id AND c.is_primary_signal AND c.code_category='drug_admin')
      THEN NULL ELSE v_primary_drug_paid END,

    -- ── Seam figure (rule 04): the ONE number crossing the seam ──
    'seam', CASE WHEN v_has_summary AND v_corrected > 0 AND v_primary_drug_paid > 0
      THEN jsonb_build_object(
        'pct', round(100.0 * v_primary_drug_paid / v_corrected, 0),
        'primary_paid_3yr', v_primary_drug_paid,
        'corrected_paid_3yr', v_corrected)
      ELSE NULL END,

    -- ── Primary DRUG agents: per-code (latest year figures + 3yr paid) ──
    'primary_drug', jsonb_build_object(
      'codes_admin', (SELECT count(DISTINCT d.hcpcs_code) FROM hcp_hcpcs_detail d
        JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
        WHERE d.hcp_id=p_hcp_id AND c.is_primary_signal AND c.code_category='drug_admin'),
      'codes_total', (SELECT count(*) FROM ta_hcpcs_codes WHERE therapeutic_area_id=p_ta_id AND is_primary_signal AND code_category='drug_admin'),
      'paid_3yr', v_primary_drug_paid,
      'rows', (
        SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'paid_latest')::numeric DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object(
            'code', d.hcpcs_code, 'agent', min(d.hcpcs_desc),
            'instances_latest', sum(d.tot_benes) FILTER (WHERE d.program_year = v_max_year),
            'units_latest', sum(d.tot_srvcs) FILTER (WHERE d.program_year = v_max_year),
            'paid_latest', COALESCE(sum(d.total_paid_est) FILTER (WHERE d.program_year = v_max_year), 0),
            'paid_3yr', sum(d.total_paid_est)) AS r
          FROM hcp_hcpcs_detail d
          JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
          WHERE d.hcp_id=p_hcp_id AND c.is_primary_signal AND c.code_category='drug_admin'
          GROUP BY d.hcpcs_code
        ) q),
      'per_year', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('year', y.program_year,
          'instances', y.inst, 'units', y.units, 'paid', y.paid) ORDER BY y.program_year), '[]'::jsonb)
        FROM (
          SELECT d.program_year, sum(d.tot_benes) inst, sum(d.tot_srvcs) units, sum(d.total_paid_est) paid
          FROM hcp_hcpcs_detail d
          JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
          WHERE d.hcp_id=p_hcp_id AND c.is_primary_signal AND c.code_category='drug_admin'
          GROUP BY d.program_year
        ) y)),

    -- ── Secondary (cross-indication) DRUG agents only: never summed above.
    -- E&M/imaging paid is NOT an agent figure — folding it in would claim the
    -- physician administers spend they merely bill around, so every aggregate
    -- here carries the same drug_admin filter as the rows. ──
    'secondary', jsonb_build_object(
      'codes_admin', (SELECT count(DISTINCT d.hcpcs_code) FROM hcp_hcpcs_detail d
        JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
        WHERE d.hcp_id=p_hcp_id AND NOT c.is_primary_signal AND c.code_category='drug_admin'),
      'codes_total', (SELECT count(*) FROM ta_hcpcs_codes WHERE therapeutic_area_id=p_ta_id AND NOT is_primary_signal AND code_category='drug_admin'),
      'paid_3yr', (SELECT COALESCE(sum(d.total_paid_est),0) FROM hcp_hcpcs_detail d
        JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
        WHERE d.hcp_id=p_hcp_id AND NOT c.is_primary_signal AND c.code_category='drug_admin'),
      'pct_of_corrected', CASE WHEN v_has_summary AND v_corrected>0 THEN
        round(100.0 * (SELECT COALESCE(sum(d.total_paid_est),0) FROM hcp_hcpcs_detail d
          JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
          WHERE d.hcp_id=p_hcp_id AND NOT c.is_primary_signal AND c.code_category='drug_admin') / v_corrected, 0) ELSE NULL END,
      'rows', (
        SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'paid_latest')::numeric DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('code', d.hcpcs_code, 'agent', min(d.hcpcs_desc),
            'category', min(c.code_category),
            'instances_latest', sum(d.tot_benes) FILTER (WHERE d.program_year=v_max_year),
            'units_latest', sum(d.tot_srvcs) FILTER (WHERE d.program_year=v_max_year),
            'paid_latest', COALESCE(sum(d.total_paid_est) FILTER (WHERE d.program_year=v_max_year),0)) AS r
          FROM hcp_hcpcs_detail d
          JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
          WHERE d.hcp_id=p_hcp_id AND NOT c.is_primary_signal AND c.code_category='drug_admin'
          GROUP BY d.hcpcs_code
        ) q)),

    -- ── Procedures: separate ledger, tot_srvcs≈services, never summed with drugs ──
    'procedures', jsonb_build_object(
      'present', v_proc_rows > 0,
      'instances_latest', (SELECT COALESCE(sum(d.tot_benes) FILTER (WHERE d.program_year=v_max_year),0) FROM hcp_hcpcs_detail d
        JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
        WHERE d.hcp_id=p_hcp_id AND c.code_category='procedure'),
      'paid_latest', (SELECT COALESCE(sum(d.total_paid_est) FILTER (WHERE d.program_year=v_max_year),0) FROM hcp_hcpcs_detail d
        JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
        WHERE d.hcp_id=p_hcp_id AND c.code_category='procedure'),
      'per_year', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('year',y.program_year,'instances',y.inst,'paid',y.paid) ORDER BY y.program_year),'[]'::jsonb)
        FROM (SELECT d.program_year, sum(d.tot_benes) inst, sum(d.total_paid_est) paid FROM hcp_hcpcs_detail d
          JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
          WHERE d.hcp_id=p_hcp_id AND c.code_category='procedure' GROUP BY d.program_year) y),
      'rows', (
        SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'paid_latest')::numeric DESC),'[]'::jsonb) FROM (
          SELECT jsonb_build_object('code',d.hcpcs_code,'name',min(d.hcpcs_desc),
            'instances_latest', sum(d.tot_benes) FILTER (WHERE d.program_year=v_max_year),
            'services_latest', sum(d.tot_srvcs) FILTER (WHERE d.program_year=v_max_year),
            'paid_latest', COALESCE(sum(d.total_paid_est) FILTER (WHERE d.program_year=v_max_year),0)) AS r
          FROM hcp_hcpcs_detail d
          JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
          WHERE d.hcp_id=p_hcp_id AND c.code_category='procedure' GROUP BY d.hcpcs_code
        ) q)),

    'distinct_codes_in_set', (SELECT count(DISTINCT d.hcpcs_code) FROM hcp_hcpcs_detail d
      JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
      WHERE d.hcp_id=p_hcp_id),
    'set_codes_total', (SELECT count(*) FROM ta_hcpcs_codes WHERE therapeutic_area_id=p_ta_id),
    'drug_services_note', 'At drug grain the billed quantity is dose units, not encounters, so a services figure would not mean what it appears to.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hcp_administered_volume(uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
