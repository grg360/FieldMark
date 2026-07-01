# FieldMark Script Catalog

Brief reference for every Python script in `C:\Users\garre\Desktop\FieldMark`. Use this to remember what each script does, what it writes, and when to run it.

Last updated: May 26, 2026 EOD

---

## Ingestion (Workstream A — publication-keyed HCPs)

### `pubmed_pipeline.py`
Fetches publications from PubMed via E-utilities API using per-TA MeSH queries. Creates publications, publication_authors, and HCP records (publication-keyed). US-affiliation filtered. Origin of Workstream A.

### `pubmed_backfill_rebuild.py`
One-time rebuild of PubMed publication ingestion. Handles edge cases the main pipeline missed (older publications, alternative author parsings).

### `pubmed_queries.py`
Configuration module — holds the MeSH query strings per therapeutic area (PUBMED_QUERY_HEPATOLOGY_US, PUBMED_QUERY_NSCLC_US, etc.). Not a runnable script; imported by pipelines.

### `openalex_pipeline.py`
Enriches HCP records with OpenAlex author IDs and citation metrics. Pulls counts_by_year arrays to populate first_pub_year and total_career_pubs. Paid OpenAlex tier required.

### `openalex_multi_shard_linker_rebuild.py`
Rebuilds the link between v2 HCPs and OpenAlex author records when shards (multiple author ID variants for same person) need reconciliation.

### `career_enrichment.py`
Populates first_pub_year + total_career_pubs from OpenAlex counts_by_year. Original implementation that stalled on first API call during early development.

### `career_enrichment_from_clusters.py`
Replacement for career_enrichment.py. Pulls career data via author clusters rather than per-publication. Faster, more reliable.

### `ingest_publications.py`
Lower-level publication ingestion routine. Helper for pubmed_pipeline.py.

### `trials_pipeline.py`
Fetches clinical trials from ClinicalTrials.gov API. Creates trial records and trial_investigator rows (mostly with NULL hcp_id at ingestion — matched later by trial_investigator_matcher.py).

---

## Ingestion (Workstream B — NPI-keyed HCPs)

### `nppes_workstream_b_ingest.py`
Brings NPI-keyed HCPs into the corpus from NPPES NPI Registry. Filters by NPI list (e.g., from Open Payments) to identify community physicians not yet in publication universe. Creates the "right side" of the dedup problem.

### `nppes_workstream_b_dryrun.py`
Read-only diagnostic version of the Workstream B ingestion. Reports what would be added without writing.

### `targeted_nppes_enrichment.py`
NPI-discovery tool. Takes publication HCPs without NPIs and looks them up in NPPES by name. Three-tier match confidence (high/medium/low). NOT for community HCPs (selection criteria require career_pubs ≥ 500).

### `nppes_api_backfill.py`
Narrow-focused enrichment: fills npi_taxonomy and npi_specialty for HCPs missing those fields. Does NOT extract enumeration_date, practice_setting, or career_stage_years.

### `community_nppes_backfill.py`
Comprehensive NPPES enrichment for the 40,154 community HCPs. Per-NPI lookup pulls every useful NPPES field — enumeration_date, sole_proprietor, practice_setting (derived), career_stage_years (derived), specialty taxonomies, full address, identifiers, endpoints, raw API response. Writes to hcps_v2 + hcp_nppes_detail_v2. Idempotent (skips already-enriched).

### `nppes_enrichment.py`
General NPPES enrichment script. Earlier iteration superseded by more focused tools (targeted_nppes_enrichment, nppes_api_backfill, community_nppes_backfill).

### `nppes_filter.py`
Filters NPPES candidates by criteria (specialty, location, etc.) before enrichment.

### `nppes_matcher.py`
Match logic for NPPES results — fuzzy name matching with affiliation tiebreaking.

### `nppes_diagnostic.py`
Diagnostic tool. Reports NPPES enrichment coverage, match quality distributions, missing data audits.

### `nppes_organizations_filter.py`
Filters NPPES organization records (entity_type=2) — used when matching individuals to their affiliated orgs.

### `nppes_org_dryrun.py`
Read-only version of the organization filter logic.

---

## Linking & Mapping

### `npi_enrichment.py`
Original NPI matching pipeline (built April 2026). Now superseded by targeted_nppes_enrichment.py.

### `trial_investigator_matcher.py`
Links trial_investigators rows to HCPs. Four-tier match logic (Tier1 single+aff=100, Tier1 single=85, Tier2 init+last+aff=70, Tier2 init+last=60). Junk filter excludes "Clinical Trials Office," "Medical Director," etc. Brought trial linkage from 3.1% to 19.5%.

### `trial_ta_mapping.py`
Classifies clinical trials into therapeutic areas (Hep/NSCLC) using condition keywords + drug names. NSCLC-gated drugs (pembrolizumab, nivolumab, durvalumab) require lung condition co-match. ~2-3% false-positive rate.

### `hcp_institution_linker.py`
Links HCPs to reference_institutions via pattern matching on institution_normalized strings. Supports 8 institution types (aamc_medical_school, academic_idn, nci_cancer_center, etc.).

### `institution_nppes_validation.py`
Validates institution links by cross-referencing NPPES practice address with reference_institutions state/city.

### `map_nppes_to_ror.py`
Maps NPPES organization NPIs to ROR (Research Organization Registry) identifiers. Bridges NPPES institutional data with academic publication metadata.

### `enrich_ror_to_country.py`
Adds country information to ROR-mapped institutions. Used for HCP geographic classification.

### `affiliation_profiler.py`
Classifies HCPs by affiliation type (clinician, researcher, industry, mixed, insufficient_data). v1-era — affiliation_classification column exists in v1 hcps but not in v2 hcps_v2.

---

## Aggregation

### `open_payments_aggregator.py`
Aggregates raw CMS Open Payments data per HCP. Writes to four tables: hcp_open_payments_summary_v2, hcp_open_payments_by_ta_v2, hcp_open_payments_top_companies_v2, hcp_open_payments_by_drug_v2. ~222K rows total.

### `medicare_aggregator.py`
Aggregates CMS Medicare Part D / Part B utilization per HCP. Writes to hcp_medicare_summary_v2 and hcp_medicare_by_ta_v2. ~45K rows total. Has TA-specific filtering for Hep/NSCLC drug categories.

---

## Cohort Classification

### `community_classification.py`
Identifies eligible community HCPs (NPI + Open Payments OR Medicare + TA-linked + not at aamc_medical_school or nci_cancer_center). Batched UPDATE in 500-row chunks. Currently redundant since the 40K Workstream B HCPs were already classified during ingestion, but kept for future ingestions.

---

## Scoring

### `scoring_pipeline.py`
The Rising Star scoring engine. Per-TA composite from publication velocity + citation trajectory + trial investigator role. Eligibility filter: total_career_pubs ≥ 10 when set, else stored publication rows ≥ 6 (MIN_STORED_PUBLICATIONS_FALLBACK). Writes to hcp_scores_v2.

### `established_scoring.py`
TA-specific scoring for the Established (known KOL) cohort. Six weighted signals including trial role, publication volume, citation impact. Writes per-TA scores (composite_score, normalized_score, trial_score, pub_volume_score, etc.) to hcp_established_scores_v2.

### `community_scoring.py`
Per-TA composite for community HCPs using v1 methodology — 40% TA-relevant patient volume, 30% pharma engagement, 15% group practice, 10% career years, 5% publication signal. Writes to hcp_community_scores_v2.

---

## Dedup

### `dedup_detect.py`
Detects duplicate HCP clusters via strict criteria: uncommon last name (< 50 globally), first-name match after initial stripping, complementary pub/NPI data (one record has publications, other has NPI). Iterates all pairs within group (handles 3+-record clusters like Sanyal). Outputs to dedup_candidates_phase1.csv. 712 candidates identified May 26.

### `dedup_merge.py`
Executes Approach A smart merge per cluster. NPI-uniqueness-safe 3-step shuffle (NULL stub.npi → UPDATE primary.npi → FK reassign → delete stub). FK reassignment across 21 tables. Per-cluster try/except with rollback. 640 stubs deleted May 26 (Sanyal, Kowdley fully consolidated; Chalasani 3-way partial).

### `dedup_detection.py`
Earlier dedup detection from May 25 against v1. Found 12,312 candidates with loose criteria. Superseded by dedup_detect.py (strict criteria, May 26).

---

## DOL / Social

### `bluesky_enrichment.py`
Fetches HCP social presence on Bluesky. Populates social_users_v2 + dol_matches_v2.

### `twitter_enrichment.py`
Twitter/X social handle discovery for HCPs. Same pattern as bluesky_enrichment.

### `scholar_enrichment.py`
Google Scholar profile discovery for HCPs. Augments OpenAlex data.

---

## Narrative Layer

### `claude_layer.py`
Generates AI narratives for HCP profiles using Claude API. Writes to hcp_narratives_v2. Five-section format including the critical "why now" timing signal.

---

## Run Sequence Cheat Sheet

**Initial data foundation (in order):**
1. pubmed_pipeline.py → ingest publications + HCPs
2. openalex_pipeline.py → enrich citations/career data
3. trials_pipeline.py → ingest clinical trials
4. nppes_workstream_b_ingest.py → add NPI-keyed HCPs
5. open_payments_aggregator.py + medicare_aggregator.py → aggregate utilization data

**Linkage layer:**
6. trial_ta_mapping.py → tag trials by therapeutic area
7. trial_investigator_matcher.py → link trial investigators to HCPs
8. hcp_institution_linker.py → link HCPs to reference institutions

**Enrichment:**
9. career_enrichment_from_clusters.py → first_pub_year / total_career_pubs
10. targeted_nppes_enrichment.py → NPI discovery for publication HCPs
11. community_nppes_backfill.py → comprehensive NPPES for community HCPs

**Dedup:**
12. dedup_detect.py → identify clusters
13. dedup_merge.py → execute merges

**Cohort assignment + scoring:**
14. community_classification.py → flag community HCPs
15. established_scoring.py --execute → score Established
16. scoring_pipeline.py --target-version v2 → score Rising Stars
17. community_scoring.py --execute → score Community

**Final layers:**
18. claude_layer.py → generate narratives
19. bluesky_enrichment.py / twitter_enrichment.py → social discovery
