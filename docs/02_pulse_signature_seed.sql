DELETE FROM theme_concept_signature_v1 WHERE canonical_id IN (SELECT id FROM theme_canonical_v1 WHERE therapeutic_area = 'NSCLC');

DELETE FROM theme_keyword_signature_v1 WHERE canonical_id IN (SELECT id FROM theme_canonical_v1 WHERE therapeutic_area = 'NSCLC');

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'Osimertinib', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'T790M', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'Acquired resistance', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'Drug resistance', 0.5, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Epidermal growth factor receptor', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Tyrosine kinase', 0.6, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Tyrosine-kinase inhibitor', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Gefitinib', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Erlotinib', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Afatinib', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Erlotinib Hydrochloride', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'EGFR inhibitors', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Receptor tyrosine kinase', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'Epidermal growth factor', 0.5, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'KRAS', 0.6, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'Anaplastic lymphoma kinase', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'Crizotinib', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'Alectinib', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'ALK inhibitor', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'Ceritinib', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'ROS1', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'Fusion gene', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'Fluorescence in situ hybridization', 0.3, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'PD-L1', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'Immune checkpoint', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'Biomarker', 0.4, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'Nivolumab', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'Pembrolizumab', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'Atezolizumab', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'Ipilimumab', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'Durvalumab', 0.6, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'Combination therapy', 0.5, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'Pneumonitis', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'Interstitial lung disease', 0.6, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'Adverse effect', 0.3, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'Discontinuation', 0.3, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Tumor microenvironment', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'CD8', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Cytotoxic T cell', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'T cell', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Tumor-infiltrating lymphocytes', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Stromal cell', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Macrophage', 0.6, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Cytokine', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Chemokine', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'Immunity', 0.4, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'Neoadjuvant therapy', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'Chemoimmunotherapy', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'Perioperative', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'Pathological', 0.4, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'Complete response', 0.4, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Stage III NSCLC Multimodality Treatment' AND therapeutic_area = 'NSCLC'), 'Chemoradiotherapy', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Stage III NSCLC Multimodality Treatment' AND therapeutic_area = 'NSCLC'), 'Durvalumab', 0.7, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Surgical oncology', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Pneumonectomy', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Resection', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Cardiothoracic surgery', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Wedge resection', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Lymph node', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Mediastinal lymph node', 0.8, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'Dissection (medical)', 0.5, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'Radiation therapy', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'Radiosurgery', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'Toxicity', 0.3, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'Brain metastasis', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'Magnetic resonance imaging', 0.3, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Oligometastatic NSCLC Local Therapy' AND therapeutic_area = 'NSCLC'), 'Metastasectomy', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Oligometastatic NSCLC Local Therapy' AND therapeutic_area = 'NSCLC'), 'Primary tumor', 0.3, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'Adjuvant', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'Adjuvant therapy', 0.8, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'Liquid biopsy', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'Circulating tumor DNA', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'Circulating tumor cell', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'Digital polymerase chain reaction', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'Microvesicles', 0.6, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'Biopsy', 0.4, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'DNA sequencing', 0.4, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'Concordance', 0.3, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Mesothelioma Diagnosis and Treatment' AND therapeutic_area = 'NSCLC'), 'Mesothelioma', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Mesothelioma Diagnosis and Treatment' AND therapeutic_area = 'NSCLC'), 'Malignant pleural effusion', 0.6, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Mesothelioma Diagnosis and Treatment' AND therapeutic_area = 'NSCLC'), 'Pleural effusion', 0.4, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Cancer registry', 0.9, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Propensity score matching', 0.7, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Retrospective cohort study', 0.4, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Observational study', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Cohort', 0.3, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Population', 0.3, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Medical record', 0.5, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Comorbidity', 0.3, true);

INSERT INTO theme_concept_signature_v1 (canonical_id, concept_name, weight, can_set_primary) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'Lung cancer screening', 1.0, true),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'Epidemiology', 0.3, true);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'C797S', 'substring', 'title', 1.0, true, 128),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'MET amplification', 'substring', 'title', 1.0, true, 99),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'resistance to osimertinib', 'substring', 'title', 1.0, true, 99),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'histologic transformation', 'substring', 'title', 0.8, true, 26),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'small cell transformation', 'substring', 'title', 0.9, true, 21),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'bypass signaling', 'substring', 'title', 0.8, true, 4);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'icotinib', 'substring', 'title', 1.0, true, 131),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'uncommon EGFR', 'substring', 'title', 1.0, true, 107),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'dacomitinib', 'substring', 'title', 1.0, true, 97),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'G719', 'substring', 'title', 1.0, true, 57),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'L861Q', 'substring', 'title', 1.0, true, 31),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR-Mutant NSCLC Treatment' AND therapeutic_area = 'NSCLC'), 'atypical EGFR', 'substring', 'title', 1.0, true, 10);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Exon 20 Insertion Targeting' AND therapeutic_area = 'NSCLC'), 'exon 20 insertion', 'substring', 'title', 1.0, true, 230),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Exon 20 Insertion Targeting' AND therapeutic_area = 'NSCLC'), 'amivantamab', 'substring', 'title', 1.0, true, 166),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Exon 20 Insertion Targeting' AND therapeutic_area = 'NSCLC'), 'mobocertinib', 'substring', 'title', 1.0, true, 41),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Exon 20 Insertion Targeting' AND therapeutic_area = 'NSCLC'), 'poziotinib', 'substring', 'title', 1.0, true, 20),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Exon 20 Insertion Targeting' AND therapeutic_area = 'NSCLC'), 'sunvozertinib', 'substring', 'title', 1.0, true, 18),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Exon 20 Insertion Targeting' AND therapeutic_area = 'NSCLC'), 'zipalertinib', 'substring', 'title', 1.0, true, 6),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'EGFR Exon 20 Insertion Targeting' AND therapeutic_area = 'NSCLC'), 'exon20ins', 'substring', 'title', 1.0, true, 4);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'G12C', 'substring', 'title', 1.0, true, 257),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'sotorasib', 'substring', 'title', 1.0, true, 140),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'adagrasib', 'substring', 'title', 1.0, true, 50),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'SHP2', 'word', 'title', 0.7, true, 45),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'G12D', 'substring', 'title', 1.0, true, 26),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'SOS1', 'word', 'title', 0.7, true, 20),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'divarasib', 'substring', 'title', 1.0, true, 4),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'KRAS-Mutant NSCLC Therapeutics' AND therapeutic_area = 'NSCLC'), 'olomorasib', 'substring', 'title', 1.0, true, 3);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'lorlatinib', 'substring', 'title', 1.0, true, 328),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'brigatinib', 'substring', 'title', 1.0, true, 181),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'entrectinib', 'substring', 'title', 1.0, true, 86),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'ensartinib', 'substring', 'title', 1.0, true, 60),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'repotrectinib', 'substring', 'title', 1.0, true, 25),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'ALK and ROS1 Targeted Therapy' AND therapeutic_area = 'NSCLC'), 'taletrectinib', 'substring', 'title', 1.0, true, 18);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'MET exon 14', 'substring', 'title', 1.0, true, 202),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'RET fusion', 'substring', 'title', 1.0, true, 144),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'trametinib', 'substring', 'title', 0.9, true, 124),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'selpercatinib', 'substring', 'title', 1.0, true, 123),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'BRAF V600', 'substring', 'title', 1.0, true, 96),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'dabrafenib', 'substring', 'title', 0.9, true, 95),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'capmatinib', 'substring', 'title', 1.0, true, 88),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'ERBB2', 'word', 'title', 0.9, true, 86),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'tepotinib', 'substring', 'title', 1.0, true, 84),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'pralsetinib', 'substring', 'title', 1.0, true, 73),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'savolitinib', 'substring', 'title', 1.0, true, 59),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'NRG1', 'word', 'title', 1.0, true, 44),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'HER2 mutation', 'substring', 'title', 1.0, true, 32),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'METex14', 'substring', 'title', 1.0, true, 19),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Rare Oncogenic Drivers in NSCLC' AND therapeutic_area = 'NSCLC'), 'encorafenib', 'substring', 'title', 0.9, true, 17);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'antibody-drug conjugate', 'substring', 'title', 1.0, true, 136),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'deruxtecan', 'substring', 'title', 1.0, true, 128),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'B7-H3', 'substring', 'title', 0.9, true, 39),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'sacituzumab', 'substring', 'title', 1.0, true, 26),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'datopotamab', 'substring', 'title', 1.0, true, 25),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'TROP2', 'word', 'title', 1.0, true, 23),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'patritumab', 'substring', 'title', 1.0, true, 19),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'TROP-2', 'substring', 'title', 1.0, true, 16),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'antibody drug conjugate', 'substring', 'title', 1.0, true, 15),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'telisotuzumab', 'substring', 'title', 1.0, true, 15),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'ifinatamab', 'substring', 'title', 1.0, true, 3),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'tusamitamab', 'substring', 'title', 1.0, true, 2),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Antibody-Drug Conjugates in Thoracic Malignancies' AND therapeutic_area = 'NSCLC'), 'anetumab', 'substring', 'title', 1.0, true, 2);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'PD-L1 expression', 'substring', 'title', 1.0, true, 909),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'tumor mutational burden', 'substring', 'title', 1.0, true, 160),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'KEAP1', 'word', 'title', 1.0, true, 124),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'STK11', 'word', 'title', 1.0, true, 93),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'TMB', 'word', 'title', 0.9, true, 56),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'tumor proportion score', 'substring', 'title', 1.0, true, 37),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Biomarkers and Patient Selection' AND therapeutic_area = 'NSCLC'), 'combined positive score', 'substring', 'title', 1.0, true, 7);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'chemoimmunotherapy', 'substring', 'title', 1.0, true, 367),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'sintilimab', 'substring', 'title', 0.9, true, 140),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'tislelizumab', 'substring', 'title', 0.9, true, 119),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'camrelizumab', 'substring', 'title', 0.9, true, 109),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'toripalimab', 'substring', 'title', 0.9, true, 64),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'tremelimumab', 'substring', 'title', 1.0, true, 60),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'cemiplimab', 'substring', 'title', 0.9, true, 45),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune Checkpoint Inhibitor Combinations' AND therapeutic_area = 'NSCLC'), 'dual checkpoint', 'substring', 'title', 1.0, true, 11);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'immune evasion', 'substring', 'title', 0.9, true, 153),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'immune escape', 'substring', 'title', 0.9, true, 112),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'hyperprogress', 'substring', 'title', 1.0, true, 84),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'primary resistance', 'substring', 'title', 0.8, true, 80),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'immunotherapy resistance', 'substring', 'title', 1.0, true, 75),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immunotherapy Resistance Mechanisms' AND therapeutic_area = 'NSCLC'), 'resistance to immunotherapy', 'substring', 'title', 1.0, true, 37);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'immune-related adverse event', 'substring', 'title', 1.0, true, 369),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'myocarditis', 'substring', 'title', 0.8, true, 94),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'checkpoint inhibitor pneumonitis', 'substring', 'title', 1.0, true, 52),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'hypophysitis', 'substring', 'title', 1.0, true, 23),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'thyroiditis', 'substring', 'title', 0.9, true, 18),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'irAE', 'word', 'title', 1.0, true, 8),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Immune-Related Adverse Event Management' AND therapeutic_area = 'NSCLC'), 'immune colitis', 'substring', 'title', 1.0, true, 1);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'single-cell RNA', 'substring', 'title', 0.8, true, 91),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'tertiary lymphoid', 'substring', 'title', 1.0, true, 82),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'spatial transcriptomic', 'substring', 'title', 0.8, true, 34),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Tumor Microenvironment and Immune Biology' AND therapeutic_area = 'NSCLC'), 'scRNA-seq', 'substring', 'title', 0.8, true, 22);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'pCR', 'word', 'title', 0.8, true, 201),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'neoadjuvant nivolumab', 'substring', 'title', 1.0, true, 32),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'pathologic complete response', 'substring', 'title', 1.0, true, 29),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'major pathologic response', 'substring', 'title', 1.0, true, 14),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'AEGEAN', 'word', 'title', 1.0, true, 6),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'KEYNOTE-671', 'substring', 'title', 1.0, true, 5),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'CheckMate 816', 'substring', 'title', 1.0, true, 5),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'perioperative durvalumab', 'substring', 'title', 1.0, true, 4),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Perioperative Immunotherapy in Resectable NSCLC' AND therapeutic_area = 'NSCLC'), 'NEOTORCH', 'word', 'title', 1.0, true, 2);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Stage III NSCLC Multimodality Treatment' AND therapeutic_area = 'NSCLC'), 'unresectable stage III', 'substring', 'title', 1.0, true, 234),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Stage III NSCLC Multimodality Treatment' AND therapeutic_area = 'NSCLC'), 'consolidation immunotherapy', 'substring', 'title', 1.0, true, 23),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Stage III NSCLC Multimodality Treatment' AND therapeutic_area = 'NSCLC'), 'PACIFIC trial', 'substring', 'title', 1.0, true, 14),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Stage III NSCLC Multimodality Treatment' AND therapeutic_area = 'NSCLC'), 'LAURA', 'word', 'title', 0.8, true, 10),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Stage III NSCLC Multimodality Treatment' AND therapeutic_area = 'NSCLC'), 'stage III', 'substring', 'title', 0.5, false, 1280);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'lobectomy', 'substring', 'title', 1.0, true, 647),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'segmentectomy', 'substring', 'title', 1.0, true, 319),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'sublobar resection', 'substring', 'title', 1.0, true, 184),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'video-assisted thoracoscopic', 'substring', 'title', 1.0, true, 154),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'VATS', 'word', 'title', 1.0, true, 57),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'robotic-assisted', 'substring', 'title', 0.8, true, 54),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'JCOG0802', 'word', 'title', 1.0, true, 5),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Early-Stage NSCLC Surgical Management' AND therapeutic_area = 'NSCLC'), 'CALGB 140503', 'substring', 'title', 1.0, true, 2);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'stereotactic body', 'substring', 'title', 1.0, true, 762),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'SBRT', 'word', 'title', 1.0, true, 187),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'ablative radiotherapy', 'substring', 'title', 1.0, true, 161),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'hypofractionat', 'substring', 'title', 0.9, true, 137),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'proton therapy', 'substring', 'title', 0.9, true, 71),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SBRT and Radiation Oncology in NSCLC' AND therapeutic_area = 'NSCLC'), 'SABR', 'word', 'title', 1.0, true, 54);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'leptomeningeal', 'substring', 'title', 1.0, true, 385),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'whole brain radiotherapy', 'substring', 'title', 1.0, true, 47),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'CNS metasta', 'substring', 'title', 1.0, true, 38),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'intracranial response', 'substring', 'title', 1.0, true, 18),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'WBRT', 'word', 'title', 1.0, true, 11),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'CNS Metastases Management' AND therapeutic_area = 'NSCLC'), 'brain penetrant', 'substring', 'title', 0.9, true, 1);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Oligometastatic NSCLC Local Therapy' AND therapeutic_area = 'NSCLC'), 'oligometastatic', 'substring', 'title', 1.0, true, 340),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Oligometastatic NSCLC Local Therapy' AND therapeutic_area = 'NSCLC'), 'oligoprogress', 'substring', 'title', 1.0, true, 102),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Oligometastatic NSCLC Local Therapy' AND therapeutic_area = 'NSCLC'), 'local consolidative', 'substring', 'title', 1.0, true, 32),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Oligometastatic NSCLC Local Therapy' AND therapeutic_area = 'NSCLC'), 'oligorecurrent', 'substring', 'title', 1.0, true, 7);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'adjuvant osimertinib', 'substring', 'title', 1.0, true, 41),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'adjuvant alectinib', 'substring', 'title', 1.0, true, 20),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'adjuvant atezolizumab', 'substring', 'title', 1.0, true, 20),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'ADAURA', 'word', 'title', 1.0, true, 16),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'IMpower010', 'word', 'title', 1.0, true, 6),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'ALINA', 'word', 'title', 0.9, true, 5),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Adjuvant and Targeted Therapy in Early-Stage NSCLC' AND therapeutic_area = 'NSCLC'), 'KEYNOTE-091', 'substring', 'title', 1.0, true, 2);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'minimal residual disease', 'substring', 'title', 1.0, true, 39),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'MRD', 'word', 'title', 0.9, true, 20),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'molecular residual disease', 'substring', 'title', 1.0, true, 15),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'plasma genotyping', 'substring', 'title', 1.0, true, 11),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Liquid Biopsy and ctDNA Applications' AND therapeutic_area = 'NSCLC'), 'ctDNA clearance', 'substring', 'title', 1.0, true, 2);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'extensive-stage', 'substring', 'title', 0.9, true, 429),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'DLL3', 'word', 'title', 1.0, true, 38),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'lurbinectedin', 'substring', 'title', 1.0, true, 37),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'tarlatamab', 'substring', 'title', 1.0, true, 32),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'ASCL1', 'word', 'title', 0.9, true, 21),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'SCLC Biology and Treatment' AND therapeutic_area = 'NSCLC'), 'NEUROD1', 'word', 'title', 0.9, true, 8);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Mesothelioma Diagnosis and Treatment' AND therapeutic_area = 'NSCLC'), 'asbestos', 'substring', 'title', 0.9, true, 47),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Mesothelioma Diagnosis and Treatment' AND therapeutic_area = 'NSCLC'), 'BAP1', 'word', 'title', 0.9, true, 37),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Mesothelioma Diagnosis and Treatment' AND therapeutic_area = 'NSCLC'), 'pleurectomy', 'substring', 'title', 1.0, true, 35);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'real-world', 'substring', 'title', 0.9, true, 1748),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'SEER', 'word', 'title', 1.0, true, 276),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'National Cancer Database', 'substring', 'title', 1.0, true, 68),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'claims data', 'substring', 'title', 1.0, true, 24),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'Veterans Affairs', 'substring', 'title', 0.8, true, 13),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Real-World Outcomes and Population Research' AND therapeutic_area = 'NSCLC'), 'NCDB', 'word', 'title', 1.0, true, 10);

INSERT INTO theme_keyword_signature_v1 (canonical_id, term, match_mode, field_scope, weight, can_set_primary, observed_title_hits) VALUES
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'disparit', 'substring', 'title', 0.9, true, 182),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'second primary', 'substring', 'title', 0.5, false, 103),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'low-dose CT', 'substring', 'title', 1.0, true, 22),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'LDCT', 'word', 'title', 1.0, true, 11),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'screening eligibility', 'substring', 'title', 1.0, true, 10),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'stage migration', 'substring', 'title', 0.8, true, 5),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'NLST', 'word', 'title', 1.0, true, 4),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'NELSON', 'word', 'title', 0.8, true, 3),
  ((SELECT id FROM theme_canonical_v1 WHERE canonical_name = 'Lung Cancer Screening and Health Disparities' AND therapeutic_area = 'NSCLC'), 'USPSTF', 'word', 'title', 1.0, true, 2);

INSERT INTO pulse_concept_blocklist_v1 (concept_name, reason) VALUES
  ('Stage (stratigraphy)', 'OpenAlex homonym: cancer staging mapped to geology'),
  ('Paleontology', 'OpenAlex homonym: parent of Stage (stratigraphy)'),
  ('Infiltration (HVAC)', 'OpenAlex disambiguation artifact'),
  ('Refractory (planetary science)', 'OpenAlex disambiguation artifact'),
  ('Context (archaeology)', 'OpenAlex disambiguation artifact'),
  ('Incidence (geometry)', 'OpenAlex disambiguation artifact'),
  ('Docking (animal)', 'OpenAlex disambiguation artifact'),
  ('Adenocarcinoma', 'Histology-generic, non-thematic'),
  ('Lung', 'Histology-generic, non-thematic'),
  ('Hazard ratio', 'Study-design vocabulary'),
  ('Confidence interval', 'Study-design vocabulary'),
  ('Proportional hazards model', 'Study-design vocabulary'),
  ('Survival analysis', 'Study-design vocabulary'),
  ('Multivariate analysis', 'Study-design vocabulary'),
  ('Univariate analysis', 'Study-design vocabulary'),
  ('Univariate', 'Study-design vocabulary'),
  ('Multivariate statistics', 'Study-design vocabulary'),
  ('Odds ratio', 'Study-design vocabulary'),
  ('Log-rank test', 'Study-design vocabulary'),
  ('Receiver operating characteristic', 'Study-design vocabulary'),
  ('Nomogram', 'Study-design vocabulary'),
  ('Logistic regression', 'Study-design vocabulary'),
  ('Subgroup analysis', 'Study-design vocabulary'),
  ('Cochrane Library', 'Study-design vocabulary'),
  ('MEDLINE', 'Study-design vocabulary'),
  ('Systematic review', 'Study-design vocabulary'),
  ('Meta-analysis', 'Study-design vocabulary'),
  ('Randomized controlled trial', 'Study-design vocabulary'),
  ('Performance status', 'Study-design vocabulary')
ON CONFLICT (concept_name) DO NOTHING;

UPDATE theme_concept_signature_v1 s SET concept_id = p.concept_id FROM (SELECT DISTINCT concept_name, concept_id FROM pulse_preflight_concepts) p WHERE p.concept_name = s.concept_name AND s.concept_id IS NULL;

NOTIFY pgrst, 'reload schema';
