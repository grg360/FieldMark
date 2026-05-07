# May 5, 2026 (Tuesday) — Decision Log Entry

## Session scope

Full-day session covering tier classification recovery, affiliation profiler v1.1 development through three iterations, hepatology TA cross-tagging methodology, NSCLC and Rare Disease structural framework, strategic priority restructuring elevating Regional/Community HCPs to #1 based on Neurocrine MSL audience input, NPPES filter and Parquet build (7.22M individual active providers), NPPES matcher with multi-stage debugging, NPPES Workstream B community HCP ingestion (21,241 new HCPs added across NSCLC and Rare Disease), Open Payments scoping and download initiation, Medicare Provider Data scoping.

## Major accomplishments

### Affiliation profiler v1.1 completion

Three iteration cycles to fix per-author scoping bug (Katharine Price false positive) and over-aggressive industry threshold (Loomba false positive). Final v1.1 logic:
- Industry classification requires major-pharma keyword AND publications_matched >= 1, OR company_count >= 2 AND share >= 0.30, OR signal_count >= 3 AND share >= 0.30
- Multiple pagination bug fixes (offset-based pagination dropping HCPs as set shrinks; fixed by always fetching offset=0)

Final v1.1 distribution across all 93,914 HCPs:
- Clinician: 33,883 (36.1%)
- Insufficient data: 45,698 (48.7%)
- Researcher: 6,101 (6.5%)
- Mixed: 4,624 (4.9%)
- Industry: 3,608 (3.8%)

Canonical validation: Loomba clinician/0.958/v1.1 ✓, Yang Wang industry/v1.0 then v1.1 ✓

### Tier classification with clinician filter integration

Applied SQL UPDATE to hcp_scores incorporating affiliation_classification:
- Industry → always unranked
- Researcher → excluded from rising_star/dark_horse, eligible for established
- Clinician/mixed/insufficient_data → existing tier logic applies

Hepatology dark_horse cohort validated against US-only filter shows real clinical hepatologists (Russo at Atrium, Gawrieh at Indiana, Promrat at Providence VA, Loomes at CHOP, Squires at UPMC peds, Harpavat at Texas Children's, Behari at Pitt, Goel at Stanford). NSCLC dark_horse showed Narjust Florez (Dana-Farber DOL), Coral Olazagasti (Miami), Alexandra Goodman (Novant Health NC community oncology). Rare Disease dark_horse showed Charles Quinn (Cincinnati sickle cell), Richard Finkel (St. Jude SMA), Diana Castro (Texas neuromuscular community practice).

### Strategic priority restructuring

Following May 5 evening Neurocrine Biosciences MSL Field Engagement audience conversation, regional/community HCPs and DOLs flagged as top priorities. Strategic priority order restructured:

**#1 (NEW): Regional/Community HCP track** — Federal data-sourced cohort with practice volume, industry engagement, and geographic ranking. Cleaner data integrity than publication-based methodology. Directly aligned with MSL field engagement audience needs.

**#2: Academic Rising Star track** — Existing publication/citation/trial methodology. Continues development as secondary product positioning.

Data integrity rationale: CMS data ecosystem (NPPES, Open Payments, Medicare Provider Data) provides authoritative federal identity, structured fields, controlled taxonomies (NUCC, HCPCS), regulatory backing (Sunshine Act, billing fraud penalties). Publication ecosystem requires author disambiguation, unstructured affiliation parsing, probabilistic concept tagging.

### NPPES infrastructure built

Downloaded NPPES Data Dissemination V.2 (April 13, 2026) — 1.07GB compressed CSV decompressing to 11.36GB. Built streaming parser:
- 7,220,969 individual active US providers retained from 9,494,438 source rows
- Output: nppes_individual_providers.parquet (387MB, 30x compression)
- Top 10 states: CA 951K, NY 541K, FL 465K, TX 426K, OH 331K, MI 280K, PA 258K, IL 238K, MA 217K, WA 202K
- Top primary taxonomies dominated by non-physician HCPs (Behavior Analyst, Counselor, Pharmacist) — physicians appear deeper in distribution

### NPPES matcher Workstream A (existing HCP enrichment)

25,402 unmatched US HCPs processed against Parquet. Multi-stage debugging cycle:
1. Initial pyarrow ArrowMemoryError on groupby — rewrote with direct pandas multi-index lookup
2. PerformanceWarnings indicating multi-index lexsort issues — performance acceptable
3. State column lost on candidate extraction (multi-index level value not preserved as column) — fixed with reset_index()
4. Over-permissive first-name matching (Ryan→Ryanna, A→Aaron) — tightened with boundary requirement (space or period after HCP first name)
5. Case sensitivity in first_name_norm filter — added defensive lowercasing on both sides
6. Supabase statement timeouts on count and pagination — switched count='estimated', resilient pagination

Final results:
- Tier 1 (matched_high, confidence 95): 617
- Tier 2 (matched_medium, confidence 85): 6
- Tier 3 (review_pending, confidence 50-70): 4,120
- Tier 4 ambiguous: 2,264
- Tier 4 no_match: 18,395 (72%)

Initial projection of 12,500-16,500 matches did not hold. The 25K cohort represented residual hard-to-match HCPs after prior enrichment cycles — international physicians, PhD-only researchers, OpenAlex-disambiguated fragments. Many legitimately don't have NPIs to find.

Tier 1 sample validated against canonical cases shows accurate matches when found (Charlton, Karnsakul, Garassino, Gainor, Harpavat, Shapiro, Ahrens-Nicklas all correctly matched).

Of Tier 3 review_pending matches, 1,703 have clinical taxonomies (207*, 208*, 209*, 363LF, 363A) and could be applied with low risk in remediation pass.

Total auto-applicable from Workstream A: ~2,326 (623 Tier 1+2 plus ~1,703 filtered Tier 3).

### NPPES Workstream B (community HCP ingestion)

Strict taxonomy filtering applied per Garrett's "we have enough noise" direction:

**NSCLC:** 207RH0000X (Hematology & Oncology), 207RX0202X (Medical Oncology) — dropped Pulmonary Disease, Sleep Medicine, Nuclear Medicine

**Hepatology:** Deferred to Phase 2 — strict filter (207RT0003X Transplant Hepatology only) yielded only 480 providers because most US hepatologists register as Gastroenterology. Phase 2 will use Open Payments + Medicare signals to filter Gastros by liver-drug engagement.

**Rare Disease:** 2080N0001X (Pediatric Neuromuscular - DMD/SMA), 2080P0207X (Pediatric Hematology-Oncology - sickle cell), 207RA0401X (Allergy & Immunology - HAE), 207RM1200X (Medical Genetics - lysosomal/metabolic) — dropped broader pediatric subspecialties and Internal Medicine

Dry-run results: NSCLC 8,711, Rare Disease 13,438, total unique 22,591 across both TAs (38 cross-TA overlaps).

**Schema additions:**
- ALTER TABLE hcps ADD COLUMN source TEXT DEFAULT 'publication_ingestion'
- ALTER TABLE hcps ADD COLUMN source_calculated_at TIMESTAMPTZ
- ALTER TABLE hcps ADD COLUMN middle_name TEXT (added during ingestion when first run revealed missing column)

**Two-run ingestion:**
- Run 1: 10,959 inserted, 42 batch failures from format-normalized NPI mismatches causing duplicate key violations
- Fix: Changed insert() to upsert(on_conflict='npi_number', ignore_duplicates=True)
- Run 2: 10,282 additional inserted, 0 failures
- **Total inserted: 21,241 community HCPs across NSCLC (8,044) and Rare Disease (13,227 TA junction rows; 30 cross-TA)**

Database state after ingestion:
- publication_ingestion: 93,914
- nppes_workstream_b: 21,241
- Total: 115,155 HCPs (23% expansion)

Spot-check sample of new ingested HCPs validated: real US clinicians across multiple states (SC, IN, IL, FL, PA, NY, HI Tripler AMC, DC, etc.), all with MD credentials and proper city/state population.

### Documentation drafted

Eight files in /mnt/user-data/outputs/:
1. ta_framework_section.md — TA framework with parallel template, 10-step runbook, Hepatology fully filled, NSCLC and Rare Disease structurally complete
2. may5_decision_log_entry.md — full session log (this file is the updated version)
3. may5_priority_update.md + may5_p0_status_updates.md — priority doc updates
4. p0_8o_community_hcps.md — strategic P0 for community/DOL gap with three-tier enrichment landscape
5. nppes_backfill_plan.md — NPPES implementation plan with concrete data state
6. p0_elevation_community_hcp.md — priority restructuring elevating Regional/Community to #1
7. open_payments_scoping.md — Open Payments integration scoping with TA drug seed lists
8. medicare_provider_scoping.md — Medicare Provider Data integration scoping with TA HCPCS lists

### Open Payments PY2024 download initiated

Downloaded PY2024 General Payments file from CMS:
- URL: https://download.cms.gov/openpayments/PGYR2024_P06302025_06162025/OP_DTL_GNRL_PGYR2024_P06302025_06162025.csv
- File: 8-12GB plain CSV
- Stored at: C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2024.csv
- Content: ~16.16M general payment records totaling $13.18B for PY2024
- Status: download in progress / complete (running parallel to other workstreams tonight)

PY2022 and PY2023 files not yet downloaded — single-year (PY2024) sufficient for v1 validation phase.

## Behavioral and process notes

- Multiple Cursor architectural changes without explicit approval (upsert→update switch on prior matcher iterations) — prompts now contain explicit RULES FOR THIS TASK header forbidding execution and architectural changes beyond specified scope
- Garrett pushed back on Google search verification link as "slippery slope - sends message we don't trust our own data" — DECISION reaffirmed: no Google link in v1
- Multiple time-tracking comments by assistant earlier in day — Garrett explicit instruction: "Stop trying to guess what hour we're on. Forget about time altogether."
- Garrett: "You're talking like you're the one that needs sleep" — assistant editorializing on energy levels noted as inappropriate; user's call to make
- Database load timeouts repeatedly hit during heavy concurrent workloads — adapted with count='estimated', resilient pagination, smaller batches
- Mid-conversation reset bug discovered: SQL-based v1.0 wipe didn't catch all v1.0 rows due to in-flight script writes; solved with iterative wipe + run cycle

## Strategic implications

The Regional/Community track is now real cohort, not theoretical. With 21,241 NPPES-derived community HCPs ingested:
- Most are NOT in traditional KOL databases (academic publications wouldn't surface them)
- Geographic spread covers all US regions including community medicine, military medicine, and tertiary academic centers
- All marked as clinicians (taxonomy-filtered, no publication-affiliation inference needed)
- Composite scores currently 0 — will populate when Open Payments + Medicare data integration completes

The two-track product is positioned for v1 demo:
- Track 1 (Rising Stars): 93,914 publication-derived HCPs scored via existing methodology
- Track 2 (Regional/Community): 21,241 NPPES-derived HCPs awaiting community ranking methodology

Without Phase 2 (Open Payments) and Phase 3 (Medicare Provider Data), the Regional/Community track shows community HCPs by territory but with no meaningful ranking — a limitation that needs addressing before demo. Recommended interpretation: Open Payments and Medicare Provider Data are now required for v1 launch readiness.

## Items pending tomorrow morning

1. Apply 623 Tier 1 + 6 Tier 2 high-confidence NPI matches from Workstream A to hcps table (npi_number, npi_taxonomy, practice_city, practice_state, practice_zip, credentials)
2. Apply 1,703 Tier 3 matches with clinical taxonomies after additional sanity check
3. Validate full 21,241 Workstream B cohort with broader spot-check sample (50 random)
4. Open Payments parser script (open_payments_filter.py) — same architecture pattern as nppes_filter.py
5. Open Payments matcher and aggregator (open_payments_aggregator.py) writing to hcp_open_payments_summary and hcp_open_payments_by_ta
6. TA drug list curation in ta_drug_keywords table (seed values from open_payments_scoping.md)
7. NSCLC and Rare Disease concept derivation queries (database load now manageable since active workstreams complete)
8. TA cross-tagging cleanup (P0 #8m) using locked concept lists once derivation queries complete
9. Phase B career enrichment fix (P0 #8j)
10. Documentation consolidation — integrate eight separate doc files into master priority doc and methodology doc

## Database state at session end

- hcps: 115,155 rows (93,914 publication_ingestion + 21,241 nppes_workstream_b)
- hcp_scores: 87,344 v1.3 rows
- hcp_therapeutic_areas: 114,761 (93,769 publication-derived + ~21,271 from Workstream B; some overlap)
- publications: 190,724 (147,600 enriched)
- trial_investigators: 115,020 (8,338 verified)
- npi_match_proposals: ~25,000 rows from Workstream A matcher
- All HCPs in publication_ingestion source classified under v1.1 affiliation profile
- All HCPs in nppes_workstream_b source classified as clinician with score 1.0 (taxonomy-filtered, no publications)

## Files referenced in this session

Source code:
- /mnt/user-data/outputs/scoring_pipeline.py (existing v1.3 deployed)
- C:\Users\garre\Desktop\FieldMark\affiliation_profiler.py (v1.1 deployed)
- C:\Users\garre\Desktop\FieldMark\nppes_filter.py (built tonight)
- C:\Users\garre\Desktop\FieldMark\nppes_matcher.py (built and iteratively debugged tonight)
- C:\Users\garre\Desktop\FieldMark\nppes_diagnostic.py (debugging tool tonight)
- C:\Users\garre\Desktop\FieldMark\nppes_workstream_b_dryrun.py (built tonight)
- C:\Users\garre\Desktop\FieldMark\nppes_workstream_b_ingest.py (built tonight, two-run completion)

Data:
- C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet (387MB, built tonight)
- C:\Users\garre\Desktop\FieldMark\NPPES\npidata_pfile_20050523-20260412.csv (11.36GB raw NPPES download)
- C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2024.csv (PY2024 General Payments, downloaded tonight)
- C:\Users\garre\Desktop\FieldMark\workstream_b_dryrun_results.json (analysis output)

Documentation drafted /mnt/user-data/outputs/:
- ta_framework_section.md
- may5_decision_log_entry.md (this file)
- may5_priority_update.md
- may5_p0_status_updates.md
- p0_8o_community_hcps.md
- nppes_backfill_plan.md
- p0_elevation_community_hcp.md
- open_payments_scoping.md
- medicare_provider_scoping.md
