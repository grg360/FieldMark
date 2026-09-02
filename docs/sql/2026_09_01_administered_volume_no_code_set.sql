/* ===== BLOCK 1 =====  hcp_administered_volume: add the no_code_set state */

CREATE OR REPLACE FUNCTION public.hcp_administered_volume(p_hcp_id uuid, p_ta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_set_codes_total integer := 0;
BEGIN
  /* A vs B. Whether this therapeutic area HAS a code set at all is a property of the TA,
     not of the HCP, so it is answered before any HCP-level read. Without this guard an
     empty ta_hcpcs_codes makes the INNER JOIN below return zero rows and the function
     reports no_set_activity, which is the SAME state a real zero produces. That collapses
     cannot-assess into assessed-as-nothing and states something false about every HCP in
     the area. no_set_activity keeps its exact prior meaning: the set exists, this HCP has
     no claims against it. */
  SELECT count(*) INTO v_set_codes_total
    FROM ta_hcpcs_codes WHERE therapeutic_area_id = p_ta_id;

  IF v_set_codes_total = 0 THEN
    RETURN jsonb_build_object(
      'state', 'no_code_set',
      'set_codes_total', 0);
  END IF;
  SELECT true, s.total_paid_3yr_corrected, s.beneficiaries_2023
    INTO v_has_summary, v_corrected, v_benes_2023
    FROM hcp_medicare_summary_v2 s WHERE s.hcp_id = p_hcp_id;
  IF NOT FOUND THEN v_has_summary := false; END IF;

  SELECT count(*), count(DISTINCT d.program_year), max(d.program_year)
    INTO v_set_rows, v_years, v_max_year
    FROM hcp_hcpcs_detail d
    JOIN ta_hcpcs_codes c ON c.hcpcs_code = d.hcpcs_code AND c.therapeutic_area_id = p_ta_id
    WHERE d.hcp_id = p_hcp_id;

/* Absence states (correction 3: two distinct states) */
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

/* Routing: claims mix, not taxonomy (correction 2) */
  SELECT count(*) INTO v_proc_rows
    FROM hcp_hcpcs_detail d
    JOIN ta_hcpcs_codes c ON c.hcpcs_code = d.hcpcs_code AND c.therapeutic_area_id = p_ta_id
    WHERE d.hcp_id = p_hcp_id AND c.code_category = 'procedure';
  v_lead := CASE WHEN v_proc_rows > 0 THEN 'procedure' ELSE 'drug' END;

/* Seam numerator (primary drug agents only) */
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
/* NULL primary-drug paid is a real value here (correction 4): 0 rows -> NULL, */
/* distinguished from a present-but-small figure. Component renders its sentence. */
    'primary_drug_paid_3yr', CASE WHEN v_primary_drug_paid = 0 AND NOT EXISTS (
        SELECT 1 FROM hcp_hcpcs_detail d
        JOIN ta_hcpcs_codes c ON c.hcpcs_code=d.hcpcs_code AND c.therapeutic_area_id=p_ta_id
        WHERE d.hcp_id=p_hcp_id AND c.is_primary_signal AND c.code_category='drug_admin')
      THEN NULL ELSE v_primary_drug_paid END,

/* Seam figure (rule 04): the ONE number crossing the seam */
    'seam', CASE WHEN v_has_summary AND v_corrected > 0 AND v_primary_drug_paid > 0
      THEN jsonb_build_object(
        'pct', round(100.0 * v_primary_drug_paid / v_corrected, 0),
        'primary_paid_3yr', v_primary_drug_paid,
        'corrected_paid_3yr', v_corrected)
      ELSE NULL END,

/* Primary DRUG agents: per-code (latest year figures + 3yr paid) */
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

/* Secondary (cross-indication) DRUG agents only: never summed above. */
/* E&M/imaging paid is NOT an agent figure — folding it in would claim the */
/* physician administers spend they merely bill around, so every aggregate */
/* here carries the same drug_admin filter as the rows. */
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

/* Procedures: separate ledger, tot_srvcs≈services, never summed with drugs */
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
$function$;

/* ===== BLOCK 2 =====  administered_therapy: TA-parameterised, no slug literal */

CREATE OR REPLACE FUNCTION public.administered_therapy(p_hcp_id uuid, p_ta_id uuid)
 RETURNS TABLE(program_year integer, hcpcs_code text, hcpcs_desc text, tot_benes integer, total_bene_day_services integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.program_year, d.hcpcs_code, d.hcpcs_desc, d.tot_benes, d.total_bene_day_services
  FROM hcp_hcpcs_detail d
  WHERE d.hcp_id = p_hcp_id
    AND d.hcpcs_drug_indicator = 'Y'
    AND d.place_of_service = 'O'
    AND (d.hcpcs_code LIKE 'J%' OR d.hcpcs_code LIKE 'Q%')
    AND d.hcpcs_code NOT IN ('J0897', 'J9217')
    AND EXISTS (
      SELECT 1 FROM ta_hcpcs_codes t
      WHERE t.hcpcs_code = d.hcpcs_code
        AND t.code_category = 'drug_admin'
        AND t.therapeutic_area_id = p_ta_id
    );
$function$;

/* ===== BLOCK 3 =====  hcp_administered_therapy: pinned wrapper over block 2 */

CREATE OR REPLACE FUNCTION public.hcp_administered_therapy(p_hcp_id uuid)
 RETURNS TABLE(program_year integer, hcpcs_code text, hcpcs_desc text, tot_benes integer, total_bene_day_services integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  /* Pinned wrapper. Preserves the old single-argument signature and its NSCLC behaviour for
     any caller not yet migrated. The slug literal lives here and only here, so the neutral
     function above carries none. Delete this wrapper once no caller remains, and delete the
     two ta_neutrality_allowlist.tsv rows for hcp_administered_therapy with it. */
  SELECT * FROM public.administered_therapy(
    p_hcp_id, (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc'));
$function$;

/* ===== BLOCK 4 =====  grants for the new function */

GRANT EXECUTE ON FUNCTION public.administered_therapy(uuid, uuid) TO anon;

/* ===== BLOCK 4b =====  grants, remaining roles */

GRANT EXECUTE ON FUNCTION public.administered_therapy(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.administered_therapy(uuid, uuid) TO service_role;
