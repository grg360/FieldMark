/* ==== 40. THE COMPOSITE MEASUREMENT ====
   Read-only. First look at the advisor's practice-fingerprint model against a
   population that contains medical oncologists.

   Everything is same hcp_id + same program_year. This is a PRACTICE
   fingerprint, not a regimen: co-occurrence on a provider-year does not mean
   co-administration to a patient, and nothing downstream may claim it does.

   bevacizumab family: J9035 plus the four biosimilars, which must always be
   treated together. */

WITH crc AS (
  SELECT x.hcp_id
  FROM public.hcp_therapeutic_areas_v2 x
  JOIN public.therapeutic_areas ta
    ON ta.id = x.therapeutic_area_id AND ta.slug = 'colorectal-cancer'
),
yr AS (
  SELECT d.hcp_id, d.program_year,
         bool_or(d.hcpcs_code IN ('J9035','Q5107','Q5118','Q5126','Q5129')) AS vegf,
         bool_or(d.hcpcs_code = 'J9263')                                    AS oxaliplatin,
         bool_or(d.hcpcs_code = 'J9206')                                    AS irinotecan,
         bool_or(d.hcpcs_code = 'J9190')                                    AS fluorouracil,
         bool_or(d.hcpcs_code = 'J0640')                                    AS leucovorin,
         bool_or(d.hcpcs_code = '96416')                                    AS pump,
         bool_or(d.hcpcs_code = 'J9055')                                    AS cetuximab,
         bool_or(d.hcpcs_code = 'J9303')                                    AS panitumumab
  FROM public.hcp_hcpcs_detail d
  JOIN crc ON crc.hcp_id = d.hcp_id
  GROUP BY d.hcp_id, d.program_year
)
SELECT
  (SELECT count(*) FROM crc)                                            AS crc_linked,
  (SELECT count(*) FROM crc JOIN public.hcps_v2 h ON h.id = crc.hcp_id
     WHERE h.npi_number IS NOT NULL)                                    AS crc_with_npi,
  (SELECT count(DISTINCT hcp_id) FROM yr)                               AS crc_with_any_claims,
  (SELECT count(DISTINCT hcp_id) FROM yr WHERE vegf)                    AS vegf_any,
  (SELECT count(DISTINCT hcp_id) FROM yr
     WHERE vegf AND oxaliplatin AND fluorouracil)                       AS anchor_a_folfox_vegf,
  (SELECT count(DISTINCT hcp_id) FROM yr
     WHERE vegf AND irinotecan AND fluorouracil)                        AS anchor_b_folfiri_vegf,
  (SELECT count(DISTINCT hcp_id) FROM yr
     WHERE oxaliplatin AND fluorouracil AND NOT vegf)                    AS folfox_no_vegf,
  (SELECT count(DISTINCT hcp_id) FROM yr
     WHERE irinotecan AND fluorouracil AND NOT vegf)                     AS folfiri_no_vegf,
  (SELECT count(DISTINCT hcp_id) FROM yr WHERE cetuximab OR panitumumab) AS strict_codes_present;
