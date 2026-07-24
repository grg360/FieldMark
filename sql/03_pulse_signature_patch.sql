INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'SCLC', 'word', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'amrubicin', 'substring', 'title', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'relapsed small cell', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'refractory small cell', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'neuroendocrine carcinoma', 'substring', 'title', 0.6, true)
ON CONFLICT (canonical_id, term) DO NOTHING;

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'BRAF', 'word', 'title', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'HER2 inhibitor', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'HER2-mutant', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'zongertinib', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'poziotinib', 'substring', 'title', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'MET inhibitor', 'substring', 'title', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'RET inhibitor', 'substring', 'title', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'MET-mutant', 'substring', 'title', 1.0, true)
ON CONFLICT (canonical_id, term) DO NOTHING;

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'ADC therapeutic', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'ADC therapy', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'conjugate therapy', 'substring', 'title', 0.8, true)
ON CONFLICT (canonical_id, term) DO NOTHING;

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'almonertinib', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'aumolertinib', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'alflutinib', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'furmonertinib', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'befotertinib', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'rezivertinib', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'S768I', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'rare EGFR', 'substring', 'title', 1.0, true)
ON CONFLICT (canonical_id, term) DO NOTHING;

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'immune-related pneumonitis', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'immune related adverse', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'immune-related toxicit', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'checkpoint inhibitor-related', 'substring', 'title', 1.0, true)
ON CONFLICT (canonical_id, term) DO NOTHING;

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'cancer-associated fibroblast', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'tumor-associated macrophage', 'substring', 'title', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'M2 polarization', 'substring', 'title', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'M1/M2', 'substring', 'title', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'neoantigen', 'substring', 'title', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'TIL therapy', 'substring', 'title', 1.0, true)
ON CONFLICT (canonical_id, term) DO NOTHING;

NOTIFY pgrst, 'reload schema';
