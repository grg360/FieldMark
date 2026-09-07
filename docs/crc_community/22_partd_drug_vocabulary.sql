/* ==== 22. WHAT IS IN THE PART D ONCOLOGY DRUG TABLE ====
   Read-only. part_d_oncology_drugs_v1 is the founder-curated seed the Part D
   ingest reads; the ingest itself is TA-neutral and loads whatever stems are
   here. If colorectal orals are already present, CRC prescribers are already
   in hcp_part_d_oncology_v1 and the community qualifies OR arm can be lit
   without any HCPCS work.

   Colorectal orals to look for: capecitabine, regorafenib, trifluridine
   (Lonsurf, may be stored as trifluridine or tipiracil), encorafenib,
   sotorasib and adagrasib (KRAS G12C, shared with lung), fruquintinib.

   Lung stems to expect: osimertinib, alectinib, lorlatinib, brigatinib,
   ceritinib, crizotinib, dacomitinib, afatinib, erlotinib, gefitinib. */

SELECT drug_group,
       count(*)                                               AS stems,
       string_agg(DISTINCT drug_stem, ', ' ORDER BY drug_stem) AS stem_list
FROM public.part_d_oncology_drugs_v1
GROUP BY drug_group
ORDER BY drug_group;
