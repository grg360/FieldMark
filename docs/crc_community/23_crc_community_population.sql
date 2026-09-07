/* ==== 23. HOW BIG WOULD A CRC COMMUNITY BOARD BE ====
   Read-only. nsclc is the control: whatever nsclc has and colorectal-cancer
   does not is the gap.

   partd_present is the number that matters. It is the OR arm of qualifies
   (patient_volume > 0 OR any hcp_part_d_oncology_v1 row) and it needs no
   HCPCS code set. If it is large for colorectal, a CRC board is buildable
   now and the HCPCS work is enrichment rather than a prerequisite. */

SELECT ta.slug,
       (SELECT count(*) FROM public.hcp_therapeutic_areas_v2 x
          WHERE x.therapeutic_area_id = ta.id)                       AS ta_hcps,
       (SELECT count(*) FROM public.hcp_therapeutic_areas_v2 x
          JOIN public.hcps_v2 h ON h.id = x.hcp_id
          WHERE x.therapeutic_area_id = ta.id
            AND h.npi_number IS NOT NULL)                            AS with_npi,
       (SELECT count(DISTINCT x.hcp_id) FROM public.hcp_therapeutic_areas_v2 x
          WHERE x.therapeutic_area_id = ta.id
            AND EXISTS (SELECT 1 FROM public.hcp_part_d_oncology_v1 p
                        WHERE p.hcp_id = x.hcp_id))                  AS partd_present,
       (SELECT count(*) FROM public.ta_hcpcs_codes c
          WHERE c.therapeutic_area_id = ta.id)                       AS hcpcs_codes,
       (SELECT count(*) FROM public.hcp_medicare_by_ta_v2 m
          WHERE m.therapeutic_area_id = ta.id)                       AS medicare_rows
FROM public.therapeutic_areas ta
WHERE ta.slug IN ('nsclc','colorectal-cancer')
ORDER BY ta.slug;
