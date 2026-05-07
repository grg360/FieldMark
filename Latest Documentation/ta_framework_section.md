## Therapeutic area framework

FieldMark assigns HCPs into therapeutic areas (TAs) based on the topical focus of their published research. This section documents the TA assignment methodology, the scope of each TA in v1, and the runbook for adding new TAs in future versions.

### TA-agnostic assignment logic

The assignment logic is identical across all therapeutic areas — only the concept lists differ. This separation ensures that adding a new TA is a configuration change, not a methodology rebuild.

For each HCP:

1. Identify all publications attributed to the HCP in the `publications` table where `hcp_id` matches.
2. For each publication, examine the `openalex_concepts` JSONB array. A publication is **TA-relevant** if it contains at least one concept whose `display_name` matches the TA's concept list AND whose `score` is greater than or equal to 0.4.
3. Compute two metrics for the HCP:
   - `relevant_pubs` — count of TA-relevant publications
   - `total_pubs` — count of all publications attributed to the HCP
   - `ta_strength` = relevant_pubs / total_pubs
4. Tag the HCP into the TA if `relevant_pubs >= 5` OR `ta_strength >= 0.30`.

The two-condition threshold accommodates two distinct HCP profiles. A prolific researcher with 5+ TA-relevant publications qualifies regardless of the proportion (covers KOLs whose primary focus is the TA but who also publish broadly). A focused early-career researcher with fewer publications but high concentration qualifies via the fraction (covers emerging specialists whose body of work is small but TA-dedicated).

The 0.4 score threshold on individual concept matches reflects empirical observation: OpenAlex assigns concept relevance scores between 0.0 and 1.0, and below 0.4 the concept is typically peripheral mention rather than topical focus.

The strength_score column on `hcp_therapeutic_areas` stores the computed ta_strength value for downstream filtering and ranking. Prior to v1.3 this column was unused; the strength-based qualification methodology populates it for the first time.

### Adding a new therapeutic area — runbook

To add a new TA to FieldMark, follow these steps. Each step is independent of others; complete each fully before proceeding.

1. **Create the therapeutic_areas row.** Insert a new row in `therapeutic_areas` with name and description. Capture the resulting UUID.

2. **Identify a validation cohort.** Select 15-25 well-known HCPs in the TA spanning subspecialties. Capture their `hcp_id` values. The cohort should cover all major disease states the TA will encompass.

3. **Empirically derive the concept list.** Run the gold cohort concept query (see Validation cohort sections below for the template) against the validation cohort's `hcp_id` values. Output is a list of OpenAlex concepts ranked by frequency in the cohort's publications.

4. **Filter the empirical list.** Remove broad concepts (Medicine, Internal medicine, Disease, Biology) that appear in nearly all medical publications. Remove concepts shared with other TAs that would cross-contaminate (e.g. Endocrinology if the TA is not endocrinology). Verify each retained concept exists in OpenAlex via direct query of the publications table.

5. **Add AASLD/NCCN/equivalent domain coverage.** Cross-reference the empirical list against the relevant clinical practice guideline organization's domain framework. Add concepts for any major domains missing from the empirical list, verifying each exists in OpenAlex.

6. **Categorize the final concept list.** Group concepts under fixed subheadings: Core indications, Drug/biomarker concepts (high specificity), Indication-specific subtypes, Pediatric variants if applicable, Rare variants if applicable.

7. **Document the TA section.** Use the parallel template structure shown in the existing TA sections below. Each new TA section must include: Purpose, Disease states covered, Disease states NOT covered, Concept list (technical), Inclusion threshold, Validation cohort.

8. **Run TA assignment.** Execute the TA assignment logic against the new concept list to populate `hcp_therapeutic_areas` rows for the new TA.

9. **Spot-check the qualifying cohort.** Pull the top 50 HCPs by ta_strength and validate they are recognized researchers in the TA. Pull a random sample of 30 HCPs to check for false positives.

10. **Add the TA to the scoring pipeline.** Run scoring_pipeline.py — it picks up the new TA automatically via the therapeutic_areas table.

---

### Therapeutic Area: Hepatology

**Therapeutic area UUID:** `9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e`

#### Purpose

Hepatology is FieldMark's launch TA for liver disease research, supporting MSL teams in pharmaceutical companies developing therapies for metabolic, cholestatic, viral, autoimmune, and oncologic liver conditions. The TA is scoped to surface researchers actively publishing on liver-specific disease states with sufficient concentration to indicate primary research focus.

#### Disease states covered

The TA covers the following disease states, each represented in the concept list with verified OpenAlex tagging:

- **Metabolic liver disease.** Nonalcoholic fatty liver disease (NAFLD/MASLD), nonalcoholic steatohepatitis (NASH/MASH), hepatic steatosis, liver fibrosis in metabolic context.
- **Cholestatic liver disease.** Primary biliary cholangitis (PBC), primary sclerosing cholangitis (PSC), generalized cholestasis.
- **Viral hepatitis.** Hepatitis B (HBV), Hepatitis C (HCV), Hepatitis D (HDV).
- **Autoimmune liver disease.** Autoimmune hepatitis (AIH).
- **Hepatobiliary cancer.** Hepatocellular carcinoma (HCC), intrahepatic cholangiocarcinoma, bile duct cancer.
- **Cirrhosis and complications.** Compensated and decompensated cirrhosis, chronic liver disease, liver transplantation.
- **Pediatric hepatology.** Biliary atresia, Alagille syndrome, Wilson's disease.
- **Rare metabolic liver disease.** Alpha-1 antitrypsin deficiency.
- **Alcohol-related liver disease.** ALD, alcoholic hepatitis.

#### Disease states NOT covered (with rationale)

The following disease states are not specifically targeted in v1 hepatology assignment. Researchers in these areas may still appear if their broader publication portfolio satisfies the strength threshold via covered concepts, but the TA does not explicitly capture these as primary scope:

- **Drug-induced liver injury (DILI) as a discrete focus.** Captured indirectly when published in conjunction with broader hepatology concepts; no DILI-specific OpenAlex concept is included in the v1 list.
- **Hepatic encephalopathy as a discrete focus.** Captured indirectly via cirrhosis-related publications; no encephalopathy-specific concept is included.
- **Portal hypertension as a discrete focus.** Same handling as hepatic encephalopathy.
- **Vascular disorders of the liver.** Budd-Chiari syndrome, portal vein thrombosis, and related conditions have limited OpenAlex concept tagging and are not explicitly captured.
- **Hereditary hemochromatosis.** Limited concept-level representation in OpenAlex tagging precluded reliable inclusion in v1.
- **Acute liver failure as a discrete focus.** Captured indirectly via broader liver disease concepts; no ALF-specific concept is included.
- **Glycogen storage diseases and related rare metabolic liver conditions.** These fall under the Rare Disease therapeutic area, not Hepatology.
- **Bariatric and metabolic surgery.** Not in scope for hepatology despite NASH-related metabolic overlap. Bariatric surgery research lies outside the boundary of the platform's hepatology definition.
- **General gastroenterology.** Inflammatory bowel disease, esophageal disease, pancreatic disease, and other non-hepatic GI subspecialties are excluded despite frequent co-occurrence with hepatology in academic departments.

This list reflects v1 scope. Future iterations may expand coverage as OpenAlex concept tagging improves and as MSL feedback prioritizes specific gaps.

#### Concept list (technical)

**Core hepatology indications (17 concepts):** Fatty liver, Steatohepatitis, Nonalcoholic steatohepatitis, Steatosis, Nonalcoholic fatty liver disease, Liver disease, Chronic liver disease, Cirrhosis, Hepatology, Hepatitis, Hepatocellular carcinoma, Cholestasis, Liver transplantation, Liver injury, Liver biopsy, Liver fibrosis, Alcoholic liver disease.

**Autoimmune and cholestatic specific (3 concepts):** Primary biliary cirrhosis, Primary sclerosing cholangitis, Autoimmune hepatitis.

**Hepatobiliary cancer (3 concepts):** Intrahepatic Cholangiocarcinoma, Bile duct cancer, Bile duct.

**Pediatric hepatology (3 concepts):** Biliary atresia, Alagille syndrome, Wilson's disease.

**Rare metabolic (1 concept):** Alpha 1-antitrypsin deficiency.

**Drug and biomarker concepts, high specificity (3 concepts):** Ursodeoxycholic acid, Obeticholic acid, Bile acid.

**Viral hepatitis subtypes (5 concepts):** Hepatitis B, Hepatitis C, Hepatitis B virus, Hepatitis C virus, Hepatitis D virus.

Total: 35 concepts. Each name is the exact OpenAlex `display_name` value as it appears in the publications.openalex_concepts JSONB structure.

#### Inclusion threshold

An HCP qualifies for the Hepatology TA if either condition is met:

- The HCP has 5 or more publications where any concept in the Hepatology concept list has a score greater than or equal to 0.4, OR
- At least 30% of the HCP's total publications are hepatology-relevant under the same per-publication criterion.

#### Validation cohort

The following 20 HCPs were used as the gold-standard validation cohort during concept list development. Each is a recognized hepatology figure spanning the disease states covered. The cohort is preserved here for future regression testing.

| Name | Institution | Subspecialty focus | hcp_id |
|------|-------------|-------------------|--------|
| Rohit Loomba | UCSD NAFLD Research Center | NAFLD/NASH | `9339ead6-2023-4e69-9eda-2914553a2e20` |
| Arun J Sanyal | Virginia Commonwealth University | NASH | `32495742-222a-45c6-bb96-cc44d5227e7e` |
| Naga Chalasani | Indiana University School of Medicine | NAFLD, AIH | `6f9dd309-bd67-4260-a9c2-8a22129f988c` |
| Gregory J Gores | Mayo Clinic | HCC, cholangiocarcinoma | `bb1d0db8-bbf7-495a-a8af-cef964c92ec3` |
| Mary E Rinella | Northwestern University | NASH guidelines | `ba7b49d7-03fa-4b2f-8afd-10e6ace1422f` |
| Eric Lawitz | Texas Liver Institute | Clinical trial PI | `44c117ee-ca4d-4e1f-b6df-a84282d13dc7` |
| Raymond T Chung | Massachusetts General Hospital | Viral hepatitis | `3eb1eb57-3c9b-4101-ba9f-e2d5b0ca80f7` |
| Kathleen E Corey | MGH Liver Center | NASH | `711841f5-b447-4f6f-aa9a-a3a4b95c5977` |
| Bernd Schnabl | UCSD | Microbiome and liver | `27453612-e529-4668-bb6f-36c733c78704` |
| Jasmohan S Bajaj | VCU | Cirrhosis complications | `29610f2d-ed78-469f-a88d-3bf5c1e3bc6a` |
| Amit G Singal | UT Southwestern | HCC surveillance | `d1b5e8df-133e-464a-aee8-529200ad0705` |
| John E Eaton | Mayo Clinic | PSC | `ae739bf9-87fb-46f4-a878-f893876d48da` |
| Elizabeth J Carey | Mayo Clinic Arizona | AIH, PBC | `b2d0622f-0391-4748-9ccc-a676bb190c13` |
| Cynthia Levy | University of Miami | PBC, cholestatic | `a0b851f2-719b-4b00-ab94-d1d3a40ab38b` |
| Christopher L Bowlus | UC Davis | PBC, PSC | `d0568518-90c2-4ea4-b08d-228f8bacf5b6` |
| Kris V Kowdley | Liver Institute Northwest | PBC, PSC, NASH | `c1421322-e199-4167-8844-8565312557c3` |
| Gideon M Hirschfield | University of Toronto | PBC | `b11da2f1-12f2-4c82-b9f9-38d4103a7276` |
| James E Squires | UPMC Children's Hospital | Pediatric hepatology | `55da2f92-5ca4-4621-bc9d-3fa82743c4a4` |
| Krupa R Mysore | Pediatric hepatology | Pediatric | `a737aa88-ca19-4374-8e27-bed1f0eb9a06` |
| Joanne Kurtzberg | Duke | Pediatric BMT, metabolic | `91f66f0b-fdbd-4d52-b990-1cb646b977ac` |

---

### Therapeutic Area: NSCLC

**Therapeutic area UUID:** `c0065b03-a25e-4e9a-bde4-4b4d0db7827d`

#### Purpose

Non-small cell lung cancer (NSCLC) is FieldMark's launch oncology TA, supporting MSL teams in pharmaceutical companies developing therapies for advanced and metastatic NSCLC across histologies, biomarker subgroups, and lines of therapy. The TA is scoped narrowly to NSCLC rather than broad oncology because v1 data foundation supports rigorous concept-based filtering for a single indication, and because NSCLC has the most active and well-defined commercial pipeline among solid tumor oncology.

Future versions of FieldMark will expand oncology coverage by adding additional cancer-specific TAs (breast cancer, prostate cancer, hematologic malignancies, etc.) using the runbook framework, rather than redefining NSCLC as broader oncology.

#### Disease states covered

The TA covers research focus areas within NSCLC, each represented in the concept list with verified OpenAlex tagging:

- **Histologic subtypes.** Adenocarcinoma, squamous cell carcinoma of the lung, large cell carcinoma, NSCLC not otherwise specified.
- **Stage and treatment lines.** Early-stage resectable NSCLC, locally advanced (stage III) NSCLC, metastatic (stage IV) NSCLC, neoadjuvant and adjuvant settings, first-line and later-line therapy.
- **Driver mutations and biomarker-defined subgroups.** EGFR-mutant NSCLC, ALK-rearranged NSCLC, ROS1-rearranged NSCLC, KRAS-mutant NSCLC (including KRAS G12C), BRAF-mutant NSCLC, MET exon 14 skipping, RET fusion-positive, NTRK fusion-positive, HER2-mutant NSCLC.
- **Therapy classes.** Tyrosine kinase inhibitors (TKIs), immune checkpoint inhibitors, antibody-drug conjugates, chemotherapy combinations relevant to NSCLC.
- **Biomarker testing.** PD-L1 expression, tumor mutational burden (TMB), comprehensive genomic profiling in NSCLC context.

#### Disease states NOT covered (with rationale)

The following lung-related and oncology-related research areas are not in scope for v1 NSCLC. Researchers in these areas may still appear if their broader publication portfolio satisfies the strength threshold via covered concepts:

- **Small cell lung cancer (SCLC).** Distinct disease biology, distinct clinical care pathways, distinct commercial pipelines. Candidate for separate TA in v1.5+.
- **Mesothelioma.** Pleural mesothelioma is sometimes grouped with thoracic oncology but is a distinct disease. Excluded from v1.
- **Thymic carcinoma and thymoma.** Rare thoracic malignancies with separate research community. Excluded from v1.
- **Lung neuroendocrine tumors (carcinoid).** Distinct biology, separate research community.
- **Other solid tumor oncology.** Breast, prostate, colorectal, melanoma, gynecologic cancers, etc. Future TAs.
- **Hematologic malignancies.** Leukemias, lymphomas, multiple myeloma. Future TAs.
- **Tumor immunology research independent of NSCLC clinical context.** Basic immuno-oncology research not tied to specific NSCLC indications may appear via "Cancer immunotherapy" concepts but is not specifically targeted.
- **Lung cancer screening and prevention as a discrete focus.** USPSTF-aligned screening research (low-dose CT, smoking cessation in screening context) is not specifically captured. Researchers focused primarily on screening rather than treatment will not qualify on screening publications alone.
- **Pulmonary medicine non-cancer.** COPD, asthma, idiopathic pulmonary fibrosis (IPF), pulmonary hypertension, pulmonary infections. None covered in v1; future TAs.

#### Concept list (technical)

[Pending empirical derivation. Concept list will be developed against the NSCLC validation cohort using the gold cohort concept query methodology.]

The expected structure of the final concept list:

**NSCLC core concepts:** Non-small cell lung cancer, Lung cancer, Lung adenocarcinoma, Squamous cell carcinoma of the lung, Lung neoplasms. *Specific OpenAlex display_names to be verified.*

**Driver mutation and biomarker concepts:** Epidermal growth factor receptor (EGFR), Anaplastic lymphoma kinase (ALK), ROS1, KRAS, BRAF V600E, MET, RET, NTRK, HER2 (in NSCLC context), Programmed cell death protein 1 (PD-1), Programmed death-ligand 1 (PD-L1), Tumor mutational burden. *Specific OpenAlex display_names to be verified.*

**Therapy class concepts:** Tyrosine kinase inhibitor, Immune checkpoint inhibitor, Immunotherapy (in NSCLC context), Chemotherapy (in NSCLC context), Targeted therapy. *Specific OpenAlex display_names to be verified.*

**Drug-specific concepts (high specificity):** Osimertinib, Gefitinib, Erlotinib, Afatinib, Dacomitinib, Crizotinib, Alectinib, Brigatinib, Lorlatinib, Ceritinib, Sotorasib, Adagrasib, Selpercatinib, Pralsetinib, Capmatinib, Tepotinib, Entrectinib, Larotrectinib, Pembrolizumab, Nivolumab, Atezolizumab, Durvalumab, Cemiplimab, Tremelimumab, Ipilimumab (in NSCLC context). *Specific OpenAlex display_names to be verified.*

**Stage and clinical context:** Adjuvant chemotherapy, Neoadjuvant therapy, Metastasis (in lung cancer context), Stage IV cancer, Early-stage cancer. *Specific OpenAlex display_names to be verified.*

#### Inclusion threshold

An HCP qualifies for the NSCLC TA if either condition is met:

- The HCP has 5 or more publications where any concept in the NSCLC concept list has a score greater than or equal to 0.4, OR
- At least 30% of the HCP's total publications are NSCLC-relevant under the same per-publication criterion.

#### Validation cohort

The following NSCLC clinician-researchers will be used as the gold-standard validation cohort during concept list development. The cohort spans driver-mutation specialists, immunotherapy researchers, surgical oncology, and clinical trialists. International researchers are included where US database coverage may be limited for specific subspecialty areas.

| Name | Institution | Subspecialty focus | hcp_id |
|------|-------------|-------------------|--------|
| Corey J Langer | Abramson Cancer Center / University of Pennsylvania | NSCLC chemo + immuno | `11a29cfa-0cb2-4776-9b83-8e2fb066af9d` |
| Solange Peters | Lausanne University Hospital | NSCLC international, ESMO | `72d996a2-cf1f-4d5c-8b5c-eee70664b24a` |
| Geoffrey R Oxnard | Foundation Medicine / Dana-Farber | EGFR resistance, ctDNA | `d5a19769-af09-4b35-968e-3873af768705` |
| John V Heymach | MD Anderson Cancer Center | NSCLC translational, EGFR | `2972c2f9-6975-426f-9c17-fec2d0698604` |
| Suresh S Ramalingam | Winship Cancer Institute Emory | NSCLC clinical trials | `79167924-3b34-4943-b072-726c61810467` |
| Tony Mok | Chinese University of Hong Kong | NSCLC EGFR international | `49adcd5f-119c-47aa-9d1e-c28603d27136` |
| D Ross Camidge | University of Colorado Cancer Center | NSCLC TKIs, ALK/ROS1 | `cb8dbca2-3f80-4b9f-bd5a-5fbfe20c789e` |
| Roy S Herbst | Yale Cancer Center | NSCLC immunotherapy, biomarkers | `092f917e-e5e3-405f-b813-4891e3af2a30` |
| Alice T Shaw | Massachusetts General Hospital / Dana-Farber | ALK-rearranged NSCLC | `89f05041-ec62-492d-b0a1-7be7f94ed8f2` |
| David Gandara | UC Davis Comprehensive Cancer Center | NSCLC clinical trials network | `29f168f6-3bf2-4d8c-88be-f8f295c71488` |
| Heather A Wakelee | Stanford Cancer Institute | NSCLC adjuvant, ALCHEMIST | `abfe0b11-be4c-421d-a93d-d6c7b9bfe98e` |
| Edward J Kim | UC Davis | NSCLC community oncology | `a490870a-1ced-4c24-8db5-44841b0ba2ce` |
| Caicun Zhou | Shanghai East Hospital / Shanghai Pulmonary Hospital | NSCLC China cohort | `3863afee-2b48-42bb-9496-31edff830f34` |
| Pasi A Jänne | Dana-Farber Cancer Institute | EGFR-mutant NSCLC | `4c5e8ed3-271a-417f-85de-d51cc833e95a` |
| Alexander Drilon | Memorial Sloan Kettering Thoracic Oncology | RET/NTRK/MET in NSCLC | `f1cf4bf2-a1d8-4c80-ad35-bcd53eebc1b6` |
| Edward S Kim | City of Hope National Medical Center | NSCLC community oncology | `b176f4a0-daef-4222-98e3-eb1b313227d6` |
| Hossein Borghaei | Fox Chase Cancer Center | NSCLC immunotherapy | `03cd2aca-21e3-40b6-8aa7-742178bc289e` |
| Charles M Rudin | Memorial Sloan Kettering | Lung cancer broad | `7a378ac2-40eb-4abe-8330-eafd5e27da1e` |
| Mark G Kris | Memorial Sloan Kettering Thoracic Oncology | NSCLC senior clinical | `d1cf2dd2-065c-4e35-9995-73b445b20b02` |
| Naiyer A Rizvi | AstraZeneca / Synthetic Biologics | NSCLC immunotherapy | NOT IN DATABASE |
| Vassiliki A Papadimitrakopoulou | Pfizer / former MD Anderson | NSCLC industry transition | NOT IN DATABASE |

19 of 21 originally-scoped NSCLC validation cohort members are present in the database with canonical hcp_id values. Two members (Naiyer Rizvi, Vassiliki Papadimitrakopoulou) were not located during the gold cohort lookup query and are marked NOT IN DATABASE — both have transitioned to industry roles (Synthetic Biologics, Pfizer respectively), which may explain their absence from publication-side ingestion. Heavy fragmentation was observed in the lookup query (Tony Mok in 6 rows, Caicun Zhou in 11 rows, Pasi Jänne in 5 rows due to umlaut handling — note OpenAlex display name strips to "Jnne") and canonical hcp_id selection prioritized the row with the highest stored publication count for each researcher.

The cohort is sparser than the Hepatology gold cohort in stored-publication terms (~110 combined stored publications across the NSCLC cohort versus ~700 for Hepatology), which means empirical concept derivation will surface fewer candidate concepts. The methodology accommodates this by relying more heavily on NCCN-domain coverage cross-reference for concept list completeness.

---

### Therapeutic Area: Rare Disease

**Therapeutic area UUID:** `833e7b38-d01b-409e-82c0-71eb29e138a0`

#### Purpose

Rare Disease is FieldMark's primary launch focus, supporting MSL teams in pharmaceutical companies developing therapies for low-prevalence conditions across multiple organ systems and disease categories. Unlike anatomically-defined therapeutic areas (Hepatology) or single-indication areas (NSCLC), Rare Disease is defined by patient population size — fewer than 200,000 patients in the US per the Orphan Drug Act, or fewer than 1 in 2,000 in Europe.

Because Rare Disease as a category spans hundreds of distinct conditions, FieldMark v1 takes a **bucketed approach**: scope is restricted to five categories aligned with active commercial pharmaceutical pipelines and well-defined patient research communities. Each bucket is documented with its own concept list and validation cohort. Bucket selection prioritizes therapeutic areas where MSL teams currently engage with field-medical KOLs and rising-star researchers.

#### Disease states covered (bucketed scope)

The following five buckets define the Rare Disease TA in v1:

**1. Lysosomal storage disorders (LSDs)**
- Gaucher disease (types I, II, III)
- Fabry disease
- Pompe disease (infantile and late-onset)
- Mucopolysaccharidoses (MPS I-VII, including Hunter, Hurler, Sanfilippo, Maroteaux-Lamy, Sly)
- Niemann-Pick disease (types A, B, C)

**2. Neuromuscular disorders**
- Spinal muscular atrophy (SMA, types I-IV)
- Duchenne muscular dystrophy (DMD)
- Becker muscular dystrophy
- Friedreich ataxia
- Limb-girdle muscular dystrophy (selected subtypes with active pipelines)

**3. Hemoglobinopathies and rare hematologic disorders**
- Sickle cell disease
- Beta-thalassemia (transfusion-dependent and non-transfusion-dependent)
- Paroxysmal nocturnal hemoglobinuria (PNH)
- Aplastic anemia (in rare-disease context)

**4. Hereditary angioedema (HAE)**
- HAE types I, II, and III (HAE with normal C1 inhibitor)
- Acquired angioedema (related rare conditions)

**5. Cystic fibrosis (CF)**
- Cystic fibrosis across all CFTR mutation classes
- CF-related complications captured when published in CF-specific context

#### Disease states NOT covered (with rationale)

The Rare Disease TA in v1 deliberately excludes the following categories. Future versions may add these as separate TAs or expand existing buckets:

- **Primary immunodeficiencies (PID, SCID, CVID).** Substantial clinical and research community but distinct from the v1 buckets. Candidate for separate TA in v1.5+.
- **Pulmonary arterial hypertension (PAH).** Originally scoped as a v1 bucket but dropped during validation when the Rare Disease gold cohort lookup query found zero PAH researchers in the database — the v1 ingestion did not capture sufficient PAH clinical-research community for reliable concept derivation. PAH research community is well-defined and the indication has substantial commercial pipelines (endothelin receptor antagonists, PDE5 inhibitors, prostacyclin pathway agents). Coverage planned for v1.5 once ingestion expansion captures the PAH clinical-research community.
- **Rare cancers.** Soft tissue sarcomas, rare leukemias and lymphomas, neuroendocrine tumors. These overlap with the Oncology TA framework and will be captured when oncology subtypes are added.
- **Rare renal diseases.** ADPKD, IgA nephropathy, Alport syndrome, atypical hemolytic uremic syndrome (aHUS). Active commercial pipelines exist but a coherent renal-rare-disease bucket warrants its own definition.
- **Rare neurologic conditions outside neuromuscular bucket.** Huntington's disease, Rett syndrome, tuberous sclerosis complex, rare epilepsies (Dravet, Lennox-Gastaut). These deserve dedicated coverage rather than being collapsed into the neuromuscular bucket.
- **Inborn errors of metabolism beyond LSDs.** Phenylketonuria (PKU), urea cycle disorders, organic acidemias, tyrosinemia. Significant rare disease population but not aligned with the v1 bucket framework.
- **Rare endocrine disorders.** Acromegaly, Cushing's disease, congenital adrenal hyperplasia.
- **Rare ophthalmologic conditions.** Inherited retinal dystrophies (Leber congenital amaurosis, retinitis pigmentosa).
- **Rare dermatologic conditions.** Epidermolysis bullosa, ichthyoses, vitiligo (in some classifications).
- **Mitochondrial diseases as a discrete focus.** Captured indirectly when published in conjunction with neuromuscular concepts but not specifically targeted.
- **Hereditary cardiomyopathies.** Hypertrophic cardiomyopathy, ARVC, restrictive cardiomyopathy.
- **Rare bone and skeletal dysplasias.** Osteogenesis imperfecta, achondroplasia, hypophosphatasia.
- **Wilson's disease and Alpha-1 antitrypsin deficiency.** These rare metabolic liver conditions are captured in the **Hepatology TA**, not Rare Disease, because their clinical care is delivered by hepatologists. HCPs working primarily on these conditions will appear in Hepatology, not Rare Disease.

The deliberate exclusion of these categories from v1 is not a statement of clinical importance — it is a scope decision based on launch priorities and validation feasibility. Each excluded category is a candidate for future TA expansion using the runbook framework.

#### Concept list (technical)

[Pending empirical derivation. Per-bucket concept lists will be developed against the bucket-specific validation cohorts using the gold cohort concept query methodology.]

The expected structure of the final concept list:

**LSD core concepts:** Lysosomal storage disease, Gaucher disease, Fabry disease, Pompe disease, Mucopolysaccharidosis, Niemann-Pick disease, Glucocerebrosidase, Alpha-galactosidase, Acid alpha-glucosidase. *Specific OpenAlex display_names to be verified.*

**LSD drug/biomarker concepts:** Imiglucerase, Velaglucerase, Agalsidase, Migalastat, Alglucosidase, Avalglucosidase, Idursulfase, Galsulfase. *Specific OpenAlex display_names to be verified.*

**Neuromuscular core concepts:** Spinal muscular atrophy, Survival motor neuron, Duchenne muscular dystrophy, Dystrophin, Friedreich ataxia, Frataxin. *Specific OpenAlex display_names to be verified.*

**Neuromuscular drug/biomarker concepts:** Nusinersen, Onasemnogene abeparvovec, Risdiplam, Eteplirsen, Casimersen, Golodirsen, Viltolarsen. *Specific OpenAlex display_names to be verified.*

**Hemoglobinopathy core concepts:** Sickle cell disease, Sickle cell anemia, Beta-thalassemia, Hemoglobinopathy, Paroxysmal nocturnal hemoglobinuria. *Specific OpenAlex display_names to be verified.*

**Hemoglobinopathy drug/biomarker concepts:** Hydroxyurea (sickle cell context), Voxelotor, Crizanlizumab, Eculizumab, Ravulizumab. *Specific OpenAlex display_names to be verified.*

**HAE core concepts:** Hereditary angioedema, C1-inhibitor, Bradykinin, Kallikrein. *Specific OpenAlex display_names to be verified.*

**HAE drug/biomarker concepts:** Lanadelumab, Berotralstat, Icatibant, Ecallantide. *Specific OpenAlex display_names to be verified.*

**CF core concepts:** Cystic fibrosis, CFTR, Cystic fibrosis transmembrane conductance regulator, Pseudomonas aeruginosa (in CF context), Sweat chloride. *Specific OpenAlex display_names to be verified.*

**CF drug/biomarker concepts:** Ivacaftor, Lumacaftor, Tezacaftor, Elexacaftor, Trikafta. *Specific OpenAlex display_names to be verified.*

#### Inclusion threshold

An HCP qualifies for the Rare Disease TA if either condition is met using the union of all five bucket concept lists:

- The HCP has 5 or more publications where any concept in the unified Rare Disease concept list has a score greater than or equal to 0.4, OR
- At least 30% of the HCP's total publications are Rare Disease-relevant under the same per-publication criterion.

The same thresholds apply uniformly across all five buckets. A researcher publishing primarily on Pompe disease and a researcher publishing primarily on cystic fibrosis are both Rare Disease-tagged using the same logic.

#### Validation cohort

Validation is structured per bucket. Each bucket has 3-6 known clinician-researchers used as the gold cohort for empirical concept derivation. Cohort selection prioritizes US-based researchers (where database coverage is strongest) but includes select international figures for buckets with limited US representation.

**Lysosomal storage disorders cohort:**

| Name | Institution | Subspecialty focus | hcp_id |
|------|-------------|-------------------|--------|
| Priya S Kishnani | Duke University Medical Center | Pompe, MPS, enzyme replacement | `1d5a66bc-24ad-4737-b99e-5c883f738284` |
| Joseph Muenzer | University of North Carolina at Chapel Hill | Hunter syndrome (MPS II) | `5b600b20-ad58-423c-9234-2b403ef0653b` |
| Pramod K Mistry | Yale School of Medicine | Gaucher disease | `d9cdae00-83b5-4270-ac32-372cce09b7dd` |
| Robert J Hopkin | Cincinnati Children's Hospital | Fabry disease | `72897e88-6a46-46bf-94c0-56140c3c5cbf` |
| Roberto Giugliani | UFRGS Brazil | MPS multiple | `a6cf22b1-6278-482b-b165-63ad437a2028` |

**Neuromuscular disorders cohort:**

| Name | Institution | Subspecialty focus | hcp_id |
|------|-------------|-------------------|--------|
| Jerry R Mendell | Sarepta Therapeutics / Nationwide Children's | DMD, gene therapy | `eaa58013-8bd9-47e7-9b2a-c22841f85339` |
| Eugenio Mercuri | Catholic University Rome | SMA international | `edf2a201-91b8-467d-8897-8ffcb62d935f` |
| Basil T Darras | Boston Children's Hospital | SMA, DMD | `35fca391-c1db-42e0-ab00-d17a9745807a` |
| Richard S Finkel | St. Jude Children's Research Hospital | SMA | `bc92e0aa-cd5f-4d69-82f6-4ce14c08c6ca` |
| John W Day | Stanford University | DMD, SMA | `2c9b8b94-37ae-4081-83c4-851d3c3380dd` |
| Craig M McDonald | UC Davis | DMD natural history | `b1d8398d-28bc-4640-a510-1d39e6107e0a` |

**Hemoglobinopathies cohort:**

| Name | Institution | Subspecialty focus | hcp_id |
|------|-------------|-------------------|--------|
| Stuart Orkin | Harvard / Boston Children's | Sickle cell genetic basis | NOT IN DATABASE |
| John F Tisdale | NIH Cellular and Molecular Therapeutics Branch | Sickle cell gene therapy | `bbe1a265-7989-4a67-ac63-0d144b96515c` |
| Mark C Walters | UCSF Benioff Oakland | BMT for sickle cell | `78103311-b937-44b9-9d19-c46d875021b8` |
| Julie Kanter | University of Alabama at Birmingham | Sickle cell adult care | `fb8c7076-1b87-4f6d-8b74-76dbe42ec483` |
| Vivien A Sheehan | Aflac Cancer and Blood Disorders Center | Sickle cell | `9b8c465d-c480-42df-b957-b3c25fc51e54` |

**Hereditary angioedema cohort:**

| Name | Institution | Subspecialty focus | hcp_id |
|------|-------------|-------------------|--------|
| Marc A Riedl | University of California San Diego | HAE clinical trials | `81d0297c-2985-4ed9-b6c3-e483980d8c0c` |
| Aleena Banerji | Massachusetts General Hospital | HAE | `2f271050-726e-4889-a31a-62295c9416fb` |
| Bruce Zuraw | UC San Diego | HAE | `81db1005-228e-4868-be5c-4ce8cd90bfe8` |
| William R Lumry | Allergy and Asthma Research Associates Texas | HAE | `ff4d3cd1-75bb-4bf9-9a7a-e45e2ab991c3` |
| Timothy Craig | Penn State Hershey | HAE | `afa10435-d820-4cbc-a93f-a5e0a961af99` |

**Cystic fibrosis cohort:**

| Name | Institution | Subspecialty focus | hcp_id |
|------|-------------|-------------------|--------|
| Steven M Rowe | UAB Heersink School of Medicine | CF, biomarkers | `fd30f45e-7c04-4ad0-9928-bf647690d91a` |
| Patrick A Flume | Medical University of South Carolina | CF clinical care | `e0860415-7aa3-48f9-ac76-364940dfd7c9` |
| Bonnie Ramsey | Seattle Children's Hospital | CF, clinical trials | `29f4bf7a-a0f9-47de-b9af-87e1bfc05190` |
| J Stuart Elborn | Queen's University Belfast | CF (international) | `a4290d6f-2794-47c1-a3bd-0d42ee5af52b` |
| Nicholas Antos | Children's Wisconsin | CF | NOT IN DATABASE |

All 23 of 25 originally-scoped Rare Disease validation cohort members are present in the database with canonical hcp_id values. Two members (Stuart Orkin in Hemoglobinopathies, Nicholas Antos in CF) were not located during the gold cohort lookup query and are marked NOT IN DATABASE. The empirical concept derivation will proceed using the 23 located HCPs across the five buckets. Heavy fragmentation was observed in the lookup query — same physical persons appearing as multiple hcp_id rows due to ingestion artifacts — and canonical hcp_id selection prioritized the row with the highest stored publication count for each researcher.
