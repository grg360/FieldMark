# May 6, 2026 Wednesday — Decision Log

## Session scope

Full-day session covering HCP deduplication remediation (52 failed clusters from Tuesday morning's run), Open Payments parser build and three-year parse (PY2022-2024), Open Payments schema creation in Supabase, drug keyword seeding for three priority TAs, Open Payments aggregator build and execution. End state: 14,339 HCPs have Open Payments summary rows and 5,579 HCP-TA combinations have TA-specific industry engagement aggregations.

Strategic priority structure (locked May 5 evening) unchanged: Regional/Community HCP track #1, Academic Rising Star track #2.

## Major accomplishments

### HCP deduplication remediation — complete

**Problem context:** Tuesday morning's `hcp_dedup_merge.py` consolidated 190 fragmented duplicate records but failed on 139 clusters with `npi_match_proposals_pkey` primary key constraint violations. Wednesday afternoon's `--execute` run after the original fix succeeded for 78 of 130 surfaced clusters and failed for 52 new clusters with two distinct error patterns:
- 10 clusters: publications unique constraint violation (`publications_hcp_pubmed_unique` on `hcp_id+pubmed_id`)
- 42 clusters: trial_investigator_match_proposals foreign key violation (FK to `hcps.id` via `proposed_hcp_id`)

**Root causes:**
- Publications: bulk UPDATE without per-row branching collided with unique constraint when canonical and non-canonical both had the same pubmed_id
- Trial proposals: `hcp_dedup_merge.py` had no migration logic for `trial_investigator_match_proposals` table — when trying to delete the non-canonical hcp at the end, the FK blocked it

**Fix applied:** Built separate `hcp_dedup_remediation.py` script (Option B — focused remediation on 52 known failures rather than modifying `hcp_dedup_merge.py`). Per-row branching for both error patterns: check if canonical already has a row for the same pubmed_id (publications) or trial_investigator_id (proposals); if yes, DELETE the source row; if no, UPDATE the source row's hcp_id to canonical.

**Dry run results:** 52 ok / 0 failed. Predicted 6 publications migrated + 10 deleted as duplicates, 83 proposals migrated + 0 deleted, 43 trial_investigators updated, 11 hcp_scores deleted, 57 hcps deleted.

**Execute results:** 52 ok / 0 failed. Actual 5 publications migrated + 11 deleted as duplicates, 83 proposals migrated + 0 deleted, 43 trial_investigators updated, 11 hcp_scores deleted, 57 hcps deleted. (One publication flipped from migrate to delete-as-duplicate between dry-run and execute due to ~10min gap; immaterial.)

**Methodology capture:** Per-row exception handling pattern (continue-on-error, log to action_obj, surface in summary) replaced raise-on-first-failure pattern from initial fix. Avoids same fragility that produced the original 139 failures. Required two iterations to land cleanly.

**Forward-looking item:** `hcp_dedup_merge.py` still has the publications and trial_investigator_match_proposals bugs from the original implementation — they were not patched in the script (Option B kept the script untouched). The future planned Phase 2 dedup pass (1,000-3,000 broader NPI dedup cases per `p0_hcp_deduplication.md`) will hit the same wall at scale unless `hcp_dedup_merge.py` is updated with the per-row branching pattern. Add as P0 to address before Phase 2 dedup runs.

### Open Payments PY2022-2024 parser

**Files acquired:** Three CMS Open Payments General Payments CSVs from January 2026 publication (refresh date 01/10/2026, publication date 01/23/2026) replaced the overnight PY2024 download.
- PY2022 (8.21GB, 13.31M source rows)
- PY2023 (~12GB, 14.70M source rows)  
- PY2024 (~12GB, 15.39M source rows)
- Total: 43.39M source rows

**Schema validation:** All three years have identical 91-column schema. Zero schema drift across years. Empirical Change_Type findings: only UNCHANGED, CHANGED, ADD, NEW (3 rows) — zero DELETE records across 43.4M source rows. The DELETE filter the parser was specced to apply is a no-op against this publication; preserved defensively.

**Parser architecture:** `open_payments_filter.py` (390 lines). Streaming `csv.DictReader` → filter chain → drug-slot expansion to long format → batched pyarrow Parquet write with snappy compression. 500K row batch size.

**Filter chain (in order, early exit):**
1. `Change_Type != "DELETE"` — defensive
2. `Covered_Recipient_Type == "Covered Recipient Physician"` — strict physicians-only for v1
3. `Recipient_Country == "United States"`
4. `Covered_Recipient_NPI` is exactly 10 digits
5. `Total_Amount_of_Payment_USDollars > 0`

**Real run results:**
- 43.4M rows scanned across three years
- 14.8M rows filtered (non-physician practitioners — 30-36% of source)
- 28.6M rows passed all filters (66% pass rate)
- 35.4M output rows after drug-slot expansion (1.24x ratio)
- 661MB total Parquet output (PY22: 206MB, PY23: 228MB, PY24: 227MB)
- Wall clock: ~9 minutes (4-5x faster than 40-50 min estimate; pyarrow + NVMe SSD)
- 0 parse errors

### Open Payments schema and seed

**Schema added in Supabase (DDL run):**
- `ta_drug_keywords` (12 columns) — drug list per therapeutic area, with forward-looking metadata columns (launch_year, withdrawal_year, market_position, expected_recipient_profile) for v1.5 weight tuning
- `hcp_open_payments_summary` (22 columns) — one row per HCP, includes per-year totals (py2022_total, py2023_total, py2024_total), per-category aggregates (speaker_bureau, consulting, honoraria, education, royalty, food_beverage, travel_lodging), trend, distinct companies
- `hcp_open_payments_by_ta` (11 columns) — one row per (HCP, TA) combination, includes ta_payments, ta_distinct_drugs, ta_distinct_companies, ta_speaker_bureau, ta_consulting, ta_honoraria

Indexes created upfront on aggregation columns and FK columns.

**Schema revisions from May 5 scoping doc (driven by empirical findings):**
- Added `honoraria_3yr` and `education_3yr` columns to summary (material categories not previously accounted for)
- Split `food_travel_3yr` into separate `food_beverage_3yr` and `travel_lodging_3yr` (different signal strength)
- Added `ta_consulting_3yr` and `ta_honoraria_3yr` to by_ta table

**Seed run results:** 91 drug keyword rows across three priority TAs (NSCLC: 21, Hepatology: 23, Rare Disease: 47). Initial seed of 68 rows expanded mid-session by 23 additional rows after dry-run unmatched analysis revealed major gaps (HCV/HBV antivirals missing from Hepatology, hemophilia drugs and rare disease specialty drugs missing from Rare Disease).

**TAs not seeded:** Immunology and Oncology (both have 0 HCP assignments per `hcp_therapeutic_areas`). Confirmed via SQL query before scope decision.

### Open Payments aggregator

**Architecture:** `open_payments_aggregator.py` uses DuckDB as the compute engine. All Parquet reads, filters, joins, and aggregations happen in DuckDB SQL. Supabase is used only for fetching small reference tables and writing final results.

**Phases:** (1) load env, init Supabase + DuckDB, (2) fetch FieldMark reference data via resilient pagination, (3) register Parquet view + temp tables in DuckDB, (4) pre-filter payments to FieldMark NPI cohort (35.4M → 746,177 rows), (5) compute summary aggregations, (6) compute per-TA aggregations with Tier A (exact name match) and Tier B (brand substring match) drug matching, (7) materialize results, (8) validation outputs (Level 1 stats, Level 2 canonical HCPs, Level 3 unmatched per TA), (9) Supabase truncate-and-rewrite if --execute, (10) save log.

**Drug matching strategy:** Tier A + Tier B in v1, Tier C (generic substring) deferred to avoid multi-keyword overcounting. Recommendation from session: revisit Tier C in v1.5 once seen how many payments fail Tier A+B.

**Pre-execute fixes applied:**
- Date format bug fix: `most_recent_payment_date` was being computed as lexicographic max on MM/DD/YYYY strings (wrong) and written to a Postgres DATE column (would fail on insert). Replaced with `strptime(payment_date, '%m/%d/%Y')` in DuckDB and `.date().isoformat()` in Python before Supabase write.

**Final --execute results:**
- 30,093 FieldMark NPIs in cohort
- 746,177 filtered payment-drug rows (47x reduction from 35.4M)
- 14,339 summary rows computed and inserted (0 batch failures)
- 5,579 by_ta rows computed and inserted (0 batch failures)
- 7,398 HCPs have non-zero industry engagement (51% of HCPs in cohort with payment activity beyond F&B/travel)
- max total_payments_3yr: $8.38M (royalty outlier)
- max speaker_bureau_3yr: $4.42M (major KOL)
- by_ta distribution: NSCLC 3,757 / Rare Disease 1,418 / Hepatology 404

**Canonical HCP validation:**
- Loomba (Hepatology): summary $222,914 total / $202,514 consulting / $18,000 speaker. TA-specific Hepatology row exists with $16,567 in 3yr engagement.
- Sanyal (Hepatology): NOT FOUND. NPI never applied to canonical hcp record despite Tuesday's Workstream A matched_high status. Known issue, deferred to NPPES Workstream A application step on Thursday.
- Chalasani (Hepatology): summary $175,362 total / $175,362 consulting / $0 speaker. TA-specific Hepatology row $36,408.
- Garassino (NSCLC): summary $233,037 total / $201,173 consulting / $30,324 speaker. TA-specific NSCLC row $79,748 (jumped from $48,469 after Libtayo seed addition).

**Unmatched analysis findings:**
- Hepatology: top unmatched are now cardiovascular/diabetic drugs (JARDIANCE, VERQUVO, FARXIGA, etc.) being paid to hepatology HCPs. Correctly excluded — these are not hepatology-specific. Working as intended.
- Rare Disease: DUPIXENT remains top unmatched at $1.1M (correctly excluded — broad atopic disease, not rare disease per scope). Other top items represent v1.5 seed expansion candidates: hemophilia products (WILATE, NUWIQ, ALPROLIX, ELOCTATE), tardive dyskinesia (INGREZZA, AUSTEDO), Gaucher (CERDELGA, CEREZYME), urea cycle disorders (RAVICTI), VOD (DEFITELIO), pediatric ALL (ASPARLAS).
- NSCLC: top unmatched are non-NSCLC oncology drugs (Trodelvy = breast/bladder, BRUKINSA = CLL, ADCETRIS = Hodgkin, etc.). Correctly excluded.

## Methodology captures

### NP/PA v1.5 inclusion forward-looking item

Open Payments dry-run revealed non-physician practitioner cohort represents 30-36% of all annual payment records (4.2M PY22, 5.0M PY23, 5.5M PY24). Strict physician-only filter is correct for v1 — Workstream B NPPES ingestion used physician-only taxonomies. However, the audience signal driving Regional/Community as #1 priority (Neurocrine MSL Field Engagement) explicitly mentioned community HCPs, and NPs/PAs ARE community HCPs in many practice settings (community HAE, rural/underserved oncology and hepatology, pediatric rare disease coordination).

Implementation cost if v1.5 expansion approved: re-parse Open Payments CSVs (~9 min for 3 years), expand NPPES Workstream B taxonomy filter, recalibrate scoring methodology (NP/PA payments typically smaller per-event than physician). No new compliance considerations beyond physician inclusion.

Status: deferred to v1.5 scoping conversation.

### Open Payments PY2024 January 2026 republication has zero DELETE records

Empirical finding: across 43.4M scanned rows from the January 2026 publication, the Change_Type field contains only UNCHANGED, CHANGED, ADD, and 3 rows of NEW. Zero DELETE records.

Implication: this publication issues corrections via CHANGED records rather than DELETE+ADD pairs. The parser's defensive DELETE filter is a no-op against this data but should remain defensive against future republication format changes. Refresh strategy needs re-validation that this pattern holds.

### Drug seed list academic-bias forward-looking item

The drug seed lists drafted May 5 skewed toward drugs that academic KOLs co-author papers about (novel agents, late-stage trial drugs). For ranking community HCPs, list composition may produce biased rankings.

Specific examples:
- **Mobocertinib (Exkivity):** withdrawn October 2023, near-zero PY2024 signal. Useful for PY2022 trend only.
- **Tirzepatide:** off-label MASH usage flagged in hepatology seed list, but speaker bureau payments primarily flow to endocrinologists treating diabetes/obesity in the indicated indication. Specialty cross-check at aggregation needed.

Underlying principle: community HCP speaker bureau participation differs structurally from academic KOL speaker bureau participation. Community speakers more often speak about established standard-of-care agents at regional dinner programs. The drugs that signal "this community physician is commercially influential within the TA" may not be the same drugs that signal "this academic researcher is a rising thought leader."

Implication for v1: run aggregator with current seed list, use actual payment-frequency data per drug to inform v1.5 weight refinement. The forward-looking metadata columns added to `ta_drug_keywords` (launch_year, withdrawal_year, market_position, expected_recipient_profile) are designed for this v1.5 work.

### Open Payments empirical findings updating aggregator design

From parse run:
1. **Food and Beverage dominates record count (~90%).** ~10M F&B records per year. Mean payment $292 PY22, $253 PY23/24. Not a commercial influence signal. Aggregator tracks separately, excluded from total_payments_3yr.
2. **Speaker bureau is split across two CMS payment-nature categories,** not one as scoping doc anticipated. Aggregator UNIONs both into `speaker_bureau_3yr`.
3. **Honoraria is a third commercial-influence category** (~19K-22K rows/year). Added as separate `honoraria_3yr` column.
4. **Royalty payment skew is extreme.** Single payment records exceed $90M. For commercial influence ranking, speaker_bureau + consulting + honoraria are more discriminating than total_payments. Documented caveat.
5. **Drug-indicator filter for TA aggregation:** `drug_indicator IN ('Drug', 'Biological')` — excludes Device and Medical Supply since FieldMark's TA framework is pharmaceutical.
6. **Drug-slot=0 records (~6-8% of payments)** are payments without drug attribution — speaker fees, general consulting. Kept in broad summary aggregations, excluded from per-TA aggregations.

### v1.5 product surfaces from aggregator output

Observations from aggregator output that suggest specific frontend product surfaces for v1.5:
- Industry engagement profile (speaker vs consulting split per HCP) as a sort dimension distinct from total
- Year-over-year trend as a "rising community HCP" sort dimension
- Distinct companies engaged per TA as a breadth signal
- Recurring unmatched-drug analysis as a seed list curation feedback loop
- Disputed payment records surfaced with transparency in individual HCP views
- "No industry engagement" cohort (the 6,941 HCPs with zero in 3yr total) as an explicit filter for not-yet-engaged HCPs

These are product implications, not data implications. Aggregator output contains underlying signal. Frontend design conversation determines which become v1 surfaces vs v1.5 vs deferred.

## Database state at end of session

- hcps: 114,974 rows (327 records consolidated across this week's dedup work: 190 Tuesday morning + 78 Wednesday afternoon + 57 Wednesday remediation, with two clusters surfacing additional non-canonicals during the broader 606-cluster scope)
- HCPs with NPI: 30,093
- Open Payments tables (new):
  - `ta_drug_keywords`: 91 drug seed rows (NSCLC: 21, Hepatology: 23, Rare Disease: 47)
  - `hcp_open_payments_summary`: 14,339 rows
  - `hcp_open_payments_by_ta`: 5,579 rows
- HCPs with non-zero industry engagement: 7,398 (51% of HCPs with summary rows)
- Open Payments Parquet files on disk: 661MB across PY22/PY23/PY24

## Files referenced this session

Source code:
- `C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge.py` (existing — known to need publications + trial_proposals migration patches before next dedup pass)
- `C:\Users\garre\Desktop\FieldMark\hcp_dedup_remediation.py` (built today, 332 lines)
- `C:\Users\garre\Desktop\FieldMark\open_payments_filter.py` (built today, 390 lines)
- `C:\Users\garre\Desktop\FieldMark\open_payments_aggregator.py` (built today, ~430 lines)
- Diagnostic scripts (one-time): `quick_csv_tail_check.py`, `inspect_op_headers.py`, `dedup_dryrun_spotcheck.py`, `parquet_sanity_check.py`, `categorize_dedup_failures.py`, `verify_dedup_state.py`

Data:
- `C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2022_P01232026_01102026.csv` (8.21GB, source)
- `C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2023_P01232026_01102026.csv` (source)
- `C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2024_P01232026_01102026.csv` (source)
- `C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr{2022,2023,2024}.parquet` (output, 661MB total)
- `C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log_morning_backup.json`
- `C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json` (Wednesday execute, 78 ok / 52 failed)
- `C:\Users\garre\Desktop\FieldMark\hcp_dedup_remediation_log_may6_dryrun.json`
- `C:\Users\garre\Desktop\FieldMark\hcp_dedup_remediation_log_may6_execute.json` (52 ok / 0 failed)
- `C:\Users\garre\Desktop\FieldMark\open_payments_aggregator_log_may6.json` (most recent dry run)
- `C:\Users\garre\Desktop\FieldMark\open_payments_aggregator_log_may6_execute.json` (final execute)

Documentation:
- `C:\Users\garre\Desktop\FieldMark\Latest Documentation\open_payments_scoping.md` (revised post-parse, 427 lines)
- `C:\Users\garre\Desktop\FieldMark\Latest Documentation\open_payments_scoping_v1_pre_parse.md` (archived original, recommended)
- This file: `may6_decision_log.md`

## Open items for tomorrow

1. **NPPES Workstream A application** — apply Tier 1 + Tier 2 high-confidence NPI matches that weren't applied to canonical hcps records (Sanyal example surfaced in canonical validation). Once applied, re-run aggregator to pick up additional HCPs in cohort.
2. **Patch `hcp_dedup_merge.py`** with publications + trial_investigator_match_proposals per-row branching logic before next dedup pass. Currently the script will fail on the same patterns again at scale.
3. **Medicare Provider Data acquisition** — kick off downloads of CY2021, CY2022, CY2023 from CMS Provider Summary by Type of Service. Per `medicare_provider_scoping.md`, this is Phase 3 of the Community HCP track.
4. **Documentation consolidation** — eight separate doc files in `Latest Documentation\` need integration into master priority doc and methodology doc.
5. **Drug seed list v1.5 candidates** captured from Wednesday's unmatched analysis (hemophilia products, Gaucher, urea cycle, VOD, tardive dyskinesia) — review and decide on inclusion timing.
6. **Demo flow design** — what does v1 client demo actually look like with two-track product (Rising Stars + Regional/Community) and partial signal coverage on community track until Medicare data lands.

## Items deferred from original Wednesday plan

- Tier 3 NPPES match application (1,703 with clinical taxonomies)
- Workstream B Hepatology ingestion (deferred to Phase 2 once Gastros can be filtered by signals)
- NSCLC and Rare Disease concept derivation queries
- TA cross-tagging cleanup (P0 #8m)
- Phase B career enrichment fix (P0 #8j)
- Frontend or product UI work

## Behavioral and process notes

- Per-row exception handling pattern (continue-on-error, log to action_obj, surface in summary) replaced raise-on-first-failure pattern in dedup remediation. Avoids the same fragility that produced the original 139 failures.
- Cursor produced clean code on the parser, the aggregator, and the dedup remediation script after iteration. The dedup fix needed two iterations to land cleanly (initial fix had a re-raise issue that would have re-introduced the cluster-mid-loop abort problem).
- Parser performance estimate (40-50 min) was 4-5x slower than reality (~9 min). NVMe SSD + pyarrow batched writes faster than projected. Worth recalibrating estimates for future Parquet workloads.
- Multiple workstreams in parallel during execution phases (parser, dedup dry run, dedup execute, aggregator dry run, aggregator execute) handled via separate PowerShell terminals.
- Documentation home confirmed: `C:\Users\garre\Desktop\FieldMark\Latest Documentation\` is the canonical location. Daily decision logs land there going forward.
- Mid-session decision to expand drug seed list (68 → 91 rows) based on dry-run unmatched analysis was the right call — added 952 by_ta rows to the final output (4,627 → 5,579), most in the Rare Disease TA where seed list was thinnest.
- One canonical (Sanyal) missing from aggregator output is acceptable in-session and identifies the NPPES Workstream A application gap that's already in the deferred backlog.

## Strategic implications

The Regional/Community HCP track has its first ranking signal flowing. The 30% industry_engagement weight in the community composite score is now computable for ~14K HCPs in the database — including the 21K NPPES community HCPs ingested on May 5 (most of whom have NPIs and therefore are in the 30,093 cohort processed by today's aggregator).

After Medicare Provider Data integration (Phase 3, target Thursday-onward), 70% of the community composite is computable. Group practice and career stage from NPPES alone gets it to ~95% for non-pediatric HCPs.

The aggregator's per-TA breakdown reveals the immediate strategic question for v1: **NSCLC dominates volume (3,757 of 5,579 by_ta rows = 67%). Hepatology is small (404). Rare Disease is mid (1,418).** This reflects the academic-publication-derived TA assignment methodology more than community practice reality. The Workstream B community HCP ingestion (21K HCPs added May 5) is mostly unranked here because most of those HCPs were assigned to TAs but don't yet have publication composite scores. Once Medicare data lands and practice volume signal is in place, the community cohort's ranking will lean less heavily on Open Payments alone.

The unmatched drug analysis is a recurring artifact for v1.5+ seed list curation. Each aggregator refresh produces a top-50 unmatched list per TA. Drugs that recur across multiple refreshes are seed list candidates. Drugs that appear once and disappear are noise. The forward-looking metadata columns in `ta_drug_keywords` are designed to support this curation workflow.
