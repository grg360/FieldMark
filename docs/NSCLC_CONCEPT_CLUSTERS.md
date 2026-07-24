# NSCLC concept clusters — derived from corpus co-occurrence

Source: `pulse_preflight_concepts` (83,338 NSCLC pubs). Filters: concept_level >= 2, score >= 0.4,
corpus share < 40%, pair co-occurrence >= 50, homonyms (Stage (stratigraphy), Paleontology) removed.
Method: Louvain community detection on Jaccard-weighted concept graph (267 nodes, 2,956 edges),
resolution 1.6 top level / 1.2 within-cluster. `rec` = share of the cluster's pub volume from 2023+.

NOT yet reconciled against the 25 rows in theme_canonical_v1. This is the candidate structure to eyeball.
Result: 15 top-level clusters, 44 sub-clusters.


## C1 — 37 concepts · volume 48,820 · recent 37%
- **C1.1** · vol 16,182 · rec 42% — Retrospective cohort study (4,055), Cohort (3,549), Population (2,950), Incidence (geometry) (1,463), Prospective cohort study (831), Cohort study (645), Epidemiology (576), Concomitant (445), Cancer registry (402), Lung cancer screening (393), Observational study (365), Comorbidity (269), Medical record (239)
- **C1.2** · vol 14,856 · rec 32% — Hazard ratio (4,805), Confidence interval (2,941), Meta-analysis (2,030), Randomized controlled trial (1,501), Odds ratio (920), Quality of life (healthcare) (795), Subgroup analysis (632), Cochrane Library (539), MEDLINE (461), Systematic review (232)
- **C1.3** · vol 13,430 · rec 33% — Proportional hazards model (5,471), Survival analysis (2,616), Multivariate analysis (1,964), Univariate analysis (1,653), Performance status (779), Lymphocyte (360), Log-rank test (319), Body mass index (268)
- **C1.4** · vol 4,352 · rec 45% — Receiver operating characteristic (1,190), Nomogram (1,174), Logistic regression (786), Radiomics (636), Univariate (376), Multivariate statistics (190)

## C2 — 46 concepts · volume 47,692 · recent 33%
- **C2.1** · vol 17,315 · rec 32% — Cell growth (3,019), Downregulation and upregulation (2,305), Carcinogenesis (2,187), Gene knockdown (1,914), microRNA (1,914), Epithelial–mesenchymal transition (866), Tumor progression (809), Gene silencing (780), Long non-coding RNA (633), Angiogenesis (611), RNA (520), Transcription factor (507), Wnt signaling pathway (412), Cell migration (326), Suppressor (272), Ubiquitin (240)
- **C2.2** · vol 16,515 · rec 34% — Apoptosis (2,870), Cancer cell (2,187), Cisplatin (1,942), A549 cell (1,681), In vivo (1,609), Cell culture (1,091), Flow cytometry (851), Autophagy (664), In vitro (605), Cytotoxicity (600), Programmed cell death (581), Viability assay (550), Western blot (418), Transfection (342), MTT assay (323), Oxidative stress (201)
- **C2.3** · vol 7,129 · rec 34% — Cell (3,051), Cell cycle (1,700), Oncogene (1,576), Molecular medicine (526), Cell cycle checkpoint (276)
- **C2.4** · vol 6,733 · rec 34% — Signal transduction (1,412), Protein kinase B (1,240), Kinase (1,187), PI3K/AKT/mTOR pathway (1,143), MAPK/ERK pathway (779), PTEN (304), Phosphorylation (301), STAT3 (255), Protein kinase A (112)

## C3 — 33 concepts · volume 42,840 · recent 36%
- **C3.1** · vol 16,352 · rec 38% — Adverse effect (4,155), Nivolumab (2,734), Pembrolizumab (2,717), Chemoradiotherapy (1,209), Atezolizumab (1,151), Pneumonitis (995), Durvalumab (950), Ipilimumab (693), Discontinuation (686), Renal cell carcinoma (389), Interstitial lung disease (377), Refractory (planetary science) (296)
- **C3.2** · vol 16,302 · rec 34% — Chemotherapy (7,939), Pemetrexed (1,279), Mesothelioma (1,196), Carboplatin (1,121), Regimen (1,049), Bevacizumab (929), Docetaxel (784), Paclitaxel (641), Gemcitabine (507), Etoposide (451), Neutropenia (406)
- **C3.3** · vol 10,186 · rec 37% — Clinical trial (3,254), Clinical endpoint (1,768), Progression-free survival (1,264), Phases of clinical research (714), Response Evaluation Criteria in Solid Tumors (679), non-small cell lung cancer (NSCLC) (579), Tolerability (577), Progressive disease (537), Pharmacokinetics (479), Placebo (335)

## C4 — 27 concepts · volume 41,576 · recent 33%
- **C4.1** · vol 12,865 · rec 36% — Mutation (3,676), KRAS (3,205), Targeted therapy (2,987), Mutant (1,295), Exon (1,241), Gene mutation (304), Polymerase chain reaction (157)
- **C4.2** · vol 12,621 · rec 31% — Epidermal growth factor receptor (6,620), Tyrosine kinase (2,723), Tyrosine-kinase inhibitor (1,662), Epidermal growth factor (601), Receptor tyrosine kinase (598), Receptor (417)
- **C4.3** · vol 6,799 · rec 23% — Gefitinib (2,561), Erlotinib (2,180), Afatinib (1,166), Erlotinib Hydrochloride (461), Rash (431)
- **C4.4** · vol 5,044 · rec 33% — Osimertinib (2,901), T790M (2,143)
- **C4.5** · vol 2,868 · rec 48% — Drug (1,034), Drug resistance (846), Acquired resistance (535), Drug delivery (277), Drug discovery (176)
- **C4.6** · vol 1,379 · rec 38% — EGFR inhibitors (1,115), Docking (animal) (264)

## C5 — 27 concepts · volume 39,495 · recent 47%
- **C5.1** · vol 27,125 · rec 51% — Immunotherapy (9,483), Immune system (7,304), Biomarker (3,174), Tumor microenvironment (2,884), Context (archaeology) (858), Phenotype (491), Stromal cell (461), Combination therapy (459), Mechanism (biology) (419), Inflammation (315), Infiltration (HVAC) (302), Cytokine (294), Immunity (253), Chemokine (242), Macrophage (186)
- **C5.2** · vol 5,509 · rec 36% — Immune checkpoint (2,157), PD-L1 (1,531), Melanoma (1,028), Blockade (793)
- **C5.3** · vol 3,656 · rec 42% — CD8 (1,460), Cytotoxic T cell (1,080), T cell (788), Tumor-infiltrating lymphocytes (328)
- **C5.4** · vol 3,205 · rec 43% — Cancer immunotherapy (1,385), Antibody (900), Antigen (523), Monoclonal antibody (397)

## C6 — 18 concepts · volume 34,647 · recent 40%
- **C6.1** · vol 27,332 · rec 42% — Adenocarcinoma (13,190), Lung (11,667), Adenocarcinoma of the lung (753), Hematology (438), Carcinoembryonic antigen (329), Value (mathematics) (270), Computed tomography (253), Messenger RNA (235), Ablation (197)
- **C6.2** · vol 3,751 · rec 28% — Immunohistochemistry (2,931), Clinical significance (487), Tissue microarray (333)
- **C6.3** · vol 3,564 · rec 37% — Carcinoma (2,078), Basal cell (454), Hepatocellular carcinoma (355), Neuroendocrine tumors (343), Small Cell Lung Carcinoma (231), Small-cell carcinoma (103)

## C7 — 15 concepts · volume 20,192 · recent 36%
- **C7.1** · vol 9,278 · rec 36% — Radiation therapy (5,707), Brain metastasis (1,576), Radiosurgery (999), Toxicity (701), Magnetic resonance imaging (295)
- **C7.2** · vol 7,399 · rec 35% — Metastasis (5,881), Primary tumor (605), Treatment of lung cancer (354), Bone metastasis (302), Sarcoma (257)
- **C7.3** · vol 3,515 · rec 37% — Colorectal cancer (1,314), Breast cancer (1,190), Prostate cancer (357), Metastasectomy (333), Pancreatic cancer (321)

## C8 — 19 concepts · volume 13,962 · recent 46%
- **C8.1** · vol 7,000 · rec 44% — Surgical oncology (1,657), Propensity score matching (1,013), Pneumonectomy (889), Perioperative (781), Overall survival (761), Survival rate (674), Resection (496), Cardiothoracic surgery (433), Wedge resection (296)
- **C8.2** · vol 4,615 · rec 54% — Pathological (1,491), Neoadjuvant therapy (1,040), Adjuvant (952), Chemoimmunotherapy (505), Adjuvant therapy (462), Complete response (165)
- **C8.3** · vol 2,347 · rec 36% — Lymph node (1,368), Lymph (380), Dissection (medical) (305), Mediastinal lymph node (294)

## C9 — 16 concepts · volume 11,145 · recent 39%
- **C9.1** · vol 4,657 · rec 35% — Biopsy (1,365), Liquid biopsy (1,152), Concordance (797), Circulating tumor cell (559), Microvesicles (466), Digital polymerase chain reaction (318)
- **C9.2** · vol 3,821 · rec 41% — Disease (2,434), Malignancy (1,082), Systemic therapy (305)
- **C9.3** · vol 1,111 · rec 41% — DNA (388), DNA sequencing (385), Circulating tumor DNA (338)
- **C9.4** · vol 854 · rec 52% — Precision medicine (533), Personalized medicine (321)
- **C9.5** · vol 702 · rec 43% — DNA damage (394), DNA repair (308)

## C10 — 9 concepts · volume 9,470 · recent 26%
- **C10.1** · vol 5,045 · rec 26% — Anaplastic lymphoma kinase (2,410), Crizotinib (2,283), Lymphoma (352)
- **C10.2** · vol 2,348 · rec 27% — Alectinib (933), ALK inhibitor (892), Ceritinib (523)
- **C10.3** · vol 2,077 · rec 27% — ROS1 (1,201), Fusion gene (544), Fluorescence in situ hybridization (332)

## C11 — 11 concepts · volume 8,021 · recent 44%
- **C11.1** · vol 6,271 · rec 45% — Gene (2,781), Transcriptome (990), Gene signature (568), KEGG (525), Gene expression (488), Identification (biology) (399), Gene expression profiling (393), Genome (127)
- **C11.2** · vol 1,750 · rec 41% — DNA methylation (639), Epigenetics (595), Methylation (516)

## C12 — 2 concepts · volume 1,088 · recent 29%
- **C12.1** · vol 1,088 · rec 29% — Positron emission tomography (719), Standardized uptake value (369)

## C13 — 2 concepts · volume 871 · recent 32%
- **C13.1** · vol 871 · rec 32% — Pleural effusion (555), Malignant pleural effusion (316)

## C14 — 2 concepts · volume 868 · recent 28%
- **C14.1** · vol 868 · rec 28% — Cancer stem cell (532), Stem cell (336)

## C15 — 3 concepts · volume 719 · recent 21%
- **C15.1** · vol 719 · rec 21% — Genotype (303), Single-nucleotide polymorphism (263), Allele (153)
