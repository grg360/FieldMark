-- Non-lung oral-oncology groups for part_d_oncology_drugs_v1.
-- These exist for ORAL-MIX classification (heme-dominant / candidate tiers), not
-- for NSCLC anchoring: anchor_grade is NULL for every row. Same table, same
-- lowercased PREFIX-match convention, valid_from_year 2022 / valid_to_year NULL.
--
-- Additive and idempotent: run after part_d_oncology_schema.sql. The ingest's
-- membership is stem presence in this table (year-independent), so these rows
-- widen what loads on the NEXT ingest run with no code change; the ingest must be
-- re-run to pick them up.
--
-- See the accompanying report for prefix-collision and cross-group findings.
-- Rows flagged there carry a note; grouping is left AS SPECIFIED (not silently
-- changed) pending your decision.

INSERT INTO public.part_d_oncology_drugs_v1
  (drug_stem, drug_group, anchor_grade, valid_from_year, valid_to_year, note) VALUES
  -- breast
  ('anastrozole',  'breast',   NULL, 2022, NULL, NULL),
  ('letrozole',    'breast',   NULL, 2022, NULL, NULL),
  ('exemestane',   'breast',   NULL, 2022, NULL, NULL),
  ('tamoxifen',    'breast',   NULL, 2022, NULL, NULL),
  ('palbociclib',  'breast',   NULL, 2022, NULL, NULL),
  ('ribociclib',   'breast',   NULL, 2022, NULL, NULL),
  ('abemaciclib',  'breast',   NULL, 2022, NULL, NULL),
  ('alpelisib',    'breast',   NULL, 2022, NULL, NULL),
  ('neratinib',    'breast',   NULL, 2022, NULL, NULL),
  ('tucatinib',    'breast',   NULL, 2022, NULL, NULL),
  ('olaparib',     'breast',   NULL, 2022, NULL, 'PARP — ovarian/breast dominate; prostate overlap and a small pancreatic slice; grouped breast for volume'),
  -- prostate
  ('abiraterone',  'prostate', NULL, 2022, NULL, NULL),
  ('enzalutamide', 'prostate', NULL, 2022, NULL, NULL),
  ('apalutamide',  'prostate', NULL, 2022, NULL, NULL),
  ('darolutamide', 'prostate', NULL, 2022, NULL, NULL),
  ('bicalutamide', 'prostate', NULL, 2022, NULL, NULL),
  ('relugolix',    'prostate', NULL, 2022, NULL, NULL),
  ('nilutamide',   'prostate', NULL, 2022, NULL, NULL),
  ('flutamide',    'prostate', NULL, 2022, NULL, NULL),
  -- heme
  ('hydroxyurea',  'heme',     NULL, 2022, NULL, NULL),
  ('lenalidomide', 'heme',     NULL, 2022, NULL, NULL),
  ('pomalidomide', 'heme',     NULL, 2022, NULL, NULL),
  ('ibrutinib',    'heme',     NULL, 2022, NULL, NULL),
  ('acalabrutinib','heme',     NULL, 2022, NULL, NULL),
  ('zanubrutinib', 'heme',     NULL, 2022, NULL, NULL),
  ('venetoclax',   'heme',     NULL, 2022, NULL, NULL),
  ('ruxolitinib',  'heme',     NULL, 2022, NULL, NULL),
  ('imatinib',     'heme',     NULL, 2022, NULL, NULL),
  ('dasatinib',    'heme',     NULL, 2022, NULL, NULL),
  ('nilotinib',    'heme',     NULL, 2022, NULL, NULL),
  ('bosutinib',    'heme',     NULL, 2022, NULL, NULL),
  ('ixazomib',     'heme',     NULL, 2022, NULL, NULL),
  ('anagrelide',   'heme',     NULL, 2022, NULL, NULL),
  ('eltrombopag',  'heme',     NULL, 2022, NULL, NULL),
  ('midostaurin',  'heme',     NULL, 2022, NULL, NULL),
  ('gilteritinib', 'heme',     NULL, 2022, NULL, NULL),
  ('azacitidine',  'heme',     NULL, 2022, NULL, 'oral azacitidine = Onureg; injectable Vidaza is Part B, not seen here'),
  ('decitabine',   'heme',     NULL, 2022, NULL, 'oral = decitabine-cedazuridine (Inqovi); injectable is Part B'),
  -- gi_renal
  ('cabozantinib', 'gi_renal', NULL, 2022, NULL, NULL),
  ('lenvatinib',   'gi_renal', NULL, 2022, NULL, NULL),
  ('axitinib',     'gi_renal', NULL, 2022, NULL, NULL),
  ('everolimus',   'gi_renal', NULL, 2022, NULL, 'FLAG: spans renal/breast/NET; generic name shared with transplant everolimus (Zortress) — indistinguishable by Gnrc_Name'),
  ('sunitinib',    'gi_renal', NULL, 2022, NULL, NULL),
  ('pazopanib',    'gi_renal', NULL, 2022, NULL, NULL),
  ('regorafenib',  'gi_renal', NULL, 2022, NULL, NULL),
  ('sorafenib',    'gi_renal', NULL, 2022, NULL, NULL),
  ('trifluridine', 'gi_renal', NULL, 2022, NULL, 'FLAG: intended drug is trifluridine-tipiracil (Lonsurf); prefix also matches ophthalmic trifluridine (Viroptic)')
ON CONFLICT (drug_stem, valid_from_year) DO UPDATE
  SET drug_group    = EXCLUDED.drug_group,
      anchor_grade  = EXCLUDED.anchor_grade,
      valid_to_year = EXCLUDED.valid_to_year,
      note          = EXCLUDED.note;
