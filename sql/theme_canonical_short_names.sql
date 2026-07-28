-- theme_canonical_v1.short_name — a single-line display form for the bibliography
-- characterisation line. Canonical names run 25–53 chars and repeat "NSCLC"
-- (redundant on an NSCLC surface); the short form is authored, not truncated.
-- MSL audience: IO / irAE / ADCs are standard. Applied via run_sql.py.

BEGIN;

ALTER TABLE public.theme_canonical_v1 ADD COLUMN IF NOT EXISTS short_name text;

UPDATE public.theme_canonical_v1 tc SET short_name = m.short
FROM (VALUES
  ('Drug-Tolerant Persisters and Novel Resistance Biology', 'Drug-tolerant persisters'),
  ('Adjuvant and Targeted Therapy in Early-Stage NSCLC',    'Adjuvant & targeted, early-stage'),
  ('Antibody-Drug Conjugates in Thoracic Malignancies',     'ADCs'),
  ('Perioperative Immunotherapy in Resectable NSCLC',       'Perioperative immunotherapy'),
  ('Immunotherapy Biomarkers and Patient Selection',        'IO biomarkers & selection'),
  ('Lung Cancer Screening and Health Disparities',          'Screening & disparities'),
  ('Real-World Outcomes and Population Research',            'Real-world outcomes'),
  ('Tumor Microenvironment and Immune Biology',             'Tumor microenvironment'),
  ('Immune Checkpoint Inhibitor Combinations',              'Checkpoint combinations'),
  ('Stage III NSCLC Multimodality Treatment',               'Stage III multimodality'),
  ('Immune-Related Adverse Event Management',               'irAE management'),
  ('Early-Stage NSCLC Surgical Management',                 'Early-stage surgery'),
  ('Mesothelioma Diagnosis and Treatment',                  'Mesothelioma'),
  ('Liquid Biopsy and ctDNA Applications',                  'Liquid biopsy'),
  ('SBRT and Radiation Oncology in NSCLC',                  'SBRT & radiation'),
  ('Oligometastatic NSCLC Local Therapy',                   'Oligometastatic therapy'),
  ('Immunotherapy Resistance Mechanisms',                   'IO resistance'),
  ('EGFR Exon 20 Insertion Targeting',                      'EGFR exon 20'),
  ('Rare Oncogenic Drivers in NSCLC',                       'Rare oncogenic drivers'),
  ('KRAS-Mutant NSCLC Therapeutics',                        'KRAS-mutant therapeutics'),
  ('ALK and ROS1 Targeted Therapy',                         'ALK / ROS1 targeted'),
  ('EGFR-Mutant NSCLC Treatment',                           'EGFR-mutant treatment'),
  ('SCLC Biology and Treatment',                            'SCLC'),
  ('EGFR Resistance Mechanisms',                            'EGFR resistance'),
  ('CNS Metastases Management',                             'CNS metastases')
) AS m(canonical, short)
WHERE tc.canonical_name = m.canonical;

COMMIT;
