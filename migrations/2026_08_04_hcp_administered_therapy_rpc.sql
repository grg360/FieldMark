-- Medicare Administered Therapy block — scoped source rows for one HCP.
-- SECURITY DEFINER because the membership filter reads ta_hcpcs_codes, which has RLS
-- enabled with no policy (not client-readable); hcp_hcpcs_detail itself is public-read.
--
-- SCOPE (per the corrected brief, 2026-08-04): office-administered infused ONCOLOGY
-- agents only — hcpcs_drug_indicator='Y', place_of_service='O', J/Q codes that are in
-- the NSCLC ta_hcpcs_codes drug_admin set, EXCLUDING denosumab (J0897, bone) and
-- leuprolide (J9217, prostate). That exclusion previously lived only in the out-of-tree
-- scoring recompute; it is applied explicitly here. is_primary_signal is NOT used —
-- the flag is miscalibrated (marks cisplatin/docetaxel/bevacizumab biosimilars as
-- primary). This returns the raw per-(code, year) cells; the molecule merge and shaping
-- happen in the app (lib/administeredVolume.ts).
--
-- Verified 2026-08-04: Uyeki (cbbb1024-…) → 10 codes / 25 cells; Kirkpatrick
-- (ca71d44e-…) → 10 of 42 total drug codes.

CREATE OR REPLACE FUNCTION public.hcp_administered_therapy(p_hcp_id uuid)
RETURNS TABLE (
  program_year            integer,
  hcpcs_code              text,
  hcpcs_desc              text,
  tot_benes               integer,
  total_bene_day_services integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
        AND t.therapeutic_area_id = (SELECT id FROM therapeutic_areas WHERE name = 'NSCLC')
    );
$$;

-- ---------------------------------------------------------------------------
-- Run these two as separate statements after the function exists.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.hcp_administered_therapy(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
