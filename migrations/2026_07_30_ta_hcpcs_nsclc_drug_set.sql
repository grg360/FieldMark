-- NSCLC drug-set finalization (oncology-advisor review, 2026-07-30). STAGED ONLY —
-- apply together with the community re-score commit, not before.
--
-- Adds the IV NSCLC agents missing from ta_hcpcs_codes. J-codes verified against
-- hcpcs_descriptors (CMS official descriptions from the provider-service PUFs):
--   J9060 cisplatin · J9119 cemiplimab-rwlc · J9171 docetaxel · Q5107/Q5118
--   bevacizumab biosimilars (awwb/bvzr).
-- Ramucirumab (J9308), amivantamab (J9061) and necitumumab (J9295) are included for
-- reference completeness but have ZERO rows in all three national PUFs (suppressed
-- below CMS's 11-beneficiary floor and/or billed via hospital OPPS) — inert in
-- scoring until a data source carries them.
-- Denosumab (J0897) and leuprolide (J9217) stay in the reference as-is but are
-- EXCLUDED from the NSCLC therapy-activity scoring set (bone support / hormone).

with ta as (select id from therapeutic_areas where name = 'NSCLC')
insert into ta_hcpcs_codes (therapeutic_area_id, hcpcs_code, code_description, code_category, is_primary_signal)
select ta.id, v.code, v.descr, 'drug_admin', true
from ta, (values
  ('J9060', 'Cisplatin injection'),
  ('J9119', 'Cemiplimab-rwlc injection'),
  ('J9171', 'Docetaxel injection'),
  ('Q5107', 'Bevacizumab-awwb biosimilar injection'),
  ('Q5118', 'Bevacizumab-bvzr biosimilar injection'),
  ('J9308', 'Ramucirumab injection'),
  ('J9061', 'Amivantamab-vmjw injection'),
  ('J9295', 'Necitumumab injection')
) as v(code, descr)
on conflict (therapeutic_area_id, hcpcs_code) do nothing;
