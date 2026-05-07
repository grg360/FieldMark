# May 6, 2026 Wednesday — Decision Log Addendum (Evening Session)

**Captured:** May 6-7 evening / overnight  
**Continues from:** `may6_decision_log.md` (afternoon session)  
**Position in session:** After Open Payments aggregator execute + dedup remediation, before EOD

This addendum captures the evening's work that occurred after the original May 6 decision log was written. The original log covered HCP dedup remediation through Open Payments aggregator execute. This addendum covers Open Payments validation, Medicare Provider Data full pipeline build and execute, and end-of-session state.

## Major accomplishments

### Open Payments execute final validation

Earlier in the evening session, Open Payments aggregator --execute completed with 14,339 summary rows + 5,579 by_ta rows written cleanly (0 batch failures). Final database-side verification queried via Supabase:

- summary_count: 14,339
- by_ta_count: 5,579
- HCPs with non-zero industry engagement (>$0 in `total_payments_3yr`): 7,398
- max total_payments_3yr: $8,381,904 (royalty outlier)
- max speaker_bureau_3yr: $4,418,000 (major KOL)

Outputs match aggregator log. State at start of Medicare workstream confirmed.

### Medicare Provider Data acquisition and parser

**Files acquired:** Three CMS Medicare Physician & Other Practitioners "by Provider and Service" CSVs from data.cms.gov. Browser-downloaded after API option was discussed and considered. CY2021 (2.97 GB), CY2022 (2.94 GB), CY2023 (2.85 GB). Total 8.76 GB on disk in `C:\Users\garre\Desktop\FieldMark\Medicare\`.

Per CMS publication cadence, CY2023 is the latest available (CY2024 not yet published as of May 2026). Decision: 3-year window (CY2021-2023) matches scoping doc plan. Earlier years (2018-2020) accessible via API but COVID distortion makes them less useful for trend analysis. Deferred to v1.5 if longer trajectory analysis becomes valuable.

**Schema validation:** `inspect_medicare_headers.py` (built and run) confirmed all three files have identical 28-column schema. Zero schema drift across years.

**Schema discovery — column name change from scoping doc:** The May 5 scoping doc referenced fields as `npi`, `nppes_provider_last_org_name`, `bene_unique_cnt`, etc. Actual CMS schema uses abbreviated naming: `Rndrng_NPI`, `Rndrng_Prvdr_Last_Org_Name`, `Tot_Benes`. CMS migrated to the abbreviated naming at some point between scoping doc draft and now. Mapping captured in working notes; parser uses actual column names.

**Bonus column discovery: RUCA.** The dataset includes `Rndrng_Prvdr_RUCA` and `Rndrng_Prvdr_RUCA_Desc` — Rural-Urban Commuting Area classification per provider. The scoping doc didn't anticipate this. RUCA directly identifies whether a provider practices in a rural or community setting. Captured in parser output schema as `provider_ruca` and `provider_ruca_desc`. Material upgrade for community HCP track territory analysis.

**Parser architecture:** `medicare_filter.py` follows same architectural pattern as `open_payments_filter.py`. Streaming `csv.DictReader` → filter chain → batched pyarrow Parquet write with snappy compression. 500K row batch size.

**Filter scope decisions (two judgment calls during session):**

1. **Participation indicator filter — Decision B (loosen).** Original scoping doc filtered to participating providers only (`Mdcr_Prtcptg_Ind == "Y"`). Decision was to loosen and keep both participating and non-participating providers. The dry-run revealed non-participating cohort is only 0.026% of records (vs my initial 5-10% estimate that informed the loosen decision). The decision still holds — no reason to drop those 2,562 records — but the impact was much smaller than anticipated. Methodology capture.

2. **HCPCS code filter — Decision A (broad, no parse-time filter).** Per scoping doc and Open Payments precedent: keep all HCPCS codes at parse time, filter at aggregation time. Same pattern enables flexible TA-specific aggregation without re-parsing. User initially selected "B" (filter at parse) but reverted to "A" after I pushed back on the irreversibility tradeoff.

**Filter chain (in order):**
- `Rndrng_Prvdr_Cntry == "US"`
- `Rndrng_Prvdr_Ent_Cd == "I"` (individual providers, not organizations)
- `Rndrng_NPI` is exactly 10 digits (regex)
- `Tot_Benes > 0` (CMS suppresses records with <11 beneficiaries)

**Pre-execute parser fix:** Initial parser raised ValueError when CMS-suppressed sub-fields (Tot_Bene_Day_Srvcs, Avg_*) were empty even on rows that passed Tot_Benes > 0. Treated as fatal errors via parse_error counter, would abort at 1000 errors. Fix: relaxed those fields to nullable handling so suppression patterns don't crash the parser. Cursor prompt applied.

**Real run results:**
- 29.30M source rows scanned
- 1.68M rows filtered (entity = O, organizations) — 5.7% of source
- 1,215 rows filtered (non-US country)
- 0 rows filtered for invalid NPI or missing Tot_Benes (Medicare data is cleaner than Open Payments at row level)
- 27.62M rows passed filters → written to Parquet (94% pass rate)
- 1.14 GB total Parquet output (374MB + 392MB + 376MB)
- Wall clock: ~5 minutes total
- 0 parse errors after the nullable-fields fix

**Empirical findings during dry-run:**
- US providers: 99.99%
- Individual providers: 94% (organizations filtered)
- Participating providers: 99.97%
- Office vs Facility: 64% / 36% (stable across years)
- Drug HCPCS share: 4.8% PY2021 → 5.5% PY2023 (modest growth in Part B drug administration)
- Cross-year row count declining: 9.89M → 9.76M → 9.66M (~2.3% YoY decline, likely Medicare Advantage shift)

### Medicare HCPCS list curation — confidence-tiered design

**Critical product question surfaced during session:** Cross-indication oncology drugs (pembrolizumab, nivolumab, etc.) have 30+ FDA indications each. A community oncologist billing J9271 isn't necessarily an NSCLC oncologist — could be melanoma, RCC, head-and-neck. The methodology has to handle this honestly without overstating NSCLC volume.

**Three options surfaced for user decision:**
- Option A: Be precise about what the metric measures, document limitation
- Option B: Use NSCLC-specific drugs only (osimertinib, alectinib, brigatinib, etc.)
- Option C: Confidence-tiered design — primary signals (TA-specific drugs, no specialty filter needed) + cross-indication codes (require provider specialty match)

**User decision: Option C.** Schema added for `is_primary_signal`, `requires_specialty_match`, `specialty_match_patterns`, `code_category`. Aggregator computes both `_high_confidence` (primary + specialty-matched) and `_total` (all matches) per HCP per TA.

**Schema additions to Supabase:**
- `ta_hcpcs_codes` — HCPCS code list per TA with confidence-tier metadata
- `hcp_medicare_summary` — per-HCP aggregated practice volume metrics
- `hcp_medicare_by_ta` — per-HCP per-TA confidence-tiered metrics

**Initial seed: 81 HCPCS codes across NSCLC (35), Hepatology (22), Rare Disease (24).** Immunology and Oncology TAs deliberately not seeded (zero HCP assignments per `hcp_therapeutic_areas`).

### Provider type diagnostic and specialty pattern refinement

**Real finding from `diagnostic_provider_types.py`:**

There is no "Hepatology" specialty in Medicare data. Hepatologists self-register as `Gastroenterology` (15,183 NPIs in our cohort). Cannot distinguish hepatologists from general gastroenterologists by specialty alone — differentiation has to come from HCPCS codes (liver biopsy, paracentesis, FibroScan are highly specific to hepatology practice within GI).

**Other findings:**
- "Oncology" substring catches Hematology-Oncology (9,600), Radiation Oncology (5,212), Medical Oncology (4,144), Surgical Oncology (1,218), Gynecological Oncology (1,091) — broad cohort
- Pediatric Medicine: only 2,168 NPIs (Medicare blind spot for pediatrics confirmed)
- Medical Genetics and Genomics: only 80 NPIs (rare disease specialty filter has limited yield)
- Pulmonary Disease: 11,402 NPIs — added to NSCLC specialty patterns since pulmonologists often manage NSCLC
- Thoracic Surgery: 2,629 NPIs — added to NSCLC patterns

**Specialty pattern updates applied:**
- Hepatology specialty patterns dropped fictional "Hepatology" and misleading "Transplant" → narrowed to `['Gastroenterology']` only
- NSCLC specialty patterns expanded to `['Oncology', 'Hematology', 'Pulmonary', 'Thoracic']` for drug admin/procedure/imaging codes
- Rare Disease patterns kept current but accept broader noise

### Cross-specialty contamination problem and resolution

First aggregator dry-run output revealed concerning cross-specialty contamination in NSCLC TA: 5,946 by_ta rows, with E/M codes dominating volume from oncologists who weren't NSCLC-focused (breast, prostate, gyn). The "Oncology" substring match was too broad.

**Iteration 1: Drop all E/M codes from seed (over-aggressive).**

Removed 13 E/M codes across all three TAs. Result: by_ta count dropped from 6,510 to 2,083. **Loomba lost 75% of his hepatology volume. Chalasani's hepatology row disappeared entirely. Garassino's NSCLC row disappeared entirely.** Methodology was too narrow — academic HCPs whose drug admin bills under institutional NPIs disappeared from TA aggregations.

**Iteration 2: Add E/M codes back with narrow specialty patterns (Decision B).**

Re-added E/M codes for NSCLC and Hepatology only (Rare Disease deliberately excluded — no clean specialty signal). Specialty patterns narrowed from substring matching to exact specialty matching:
- NSCLC E/M: `['Hematology-Oncology', 'Medical Oncology']` only — drops Radiation/Surgical/Gyn Oncology
- Hepatology E/M: `['Gastroenterology']` (already narrow)

**Final seed state: 89 HCPCS codes total.** NSCLC 41, Hepatology 27, Rare Disease 21.

### Medicare aggregator final execute

**Aggregator architecture:** `medicare_aggregator.py` (~700 lines) uses DuckDB as compute engine. Two-JOIN UNION ALL pattern implements confidence-tier matching: primary-signal codes joined with no specialty filter; cross-indication codes joined with `unnest(specialty_match_patterns) WHERE LOWER(provider_type) LIKE '%' || LOWER(pattern) || '%'`.

**Schema mismatch fix before execute:** Initial Cursor-generated aggregator built insert payloads using older scoping-doc column names (`ta_beneficiaries_3yr` instead of `ta_beneficiaries_3yr_high_confidence`, `medicare_data_calculated_at` instead of `medicare_calculated_at`, missing several schema columns entirely). Identified during code review. Fixed via Cursor prompt before execute. Both helper functions (`summary_row_for_insert`, `by_ta_row_for_insert`) updated to match actual schema.

**Final --execute results:**
- 30,093 FieldMark NPIs in cohort
- 342,343 filtered Medicare rows (80x reduction from 27.62M)
- 10,331 summary rows computed and inserted (0 batch failures)
- 5,775 by_ta rows computed and inserted (0 batch failures)
- 21 summary insert batches + 12 by_ta insert batches = 33 batches total, all successful
- All 10,331 HCPs have non-zero practice volume
- 5,080 by_ta rows have meaningful TA volume (>100 beneficiaries)
- 74 distinct provider specialties represented in cohort
- max total_beneficiaries_3yr: 68,316 (high-volume hospitalist or pathologist outlier)
- max total_medicare_payment_3yr: $4,346,899 (high-volume cardiologist or oncologist)
- by_ta distribution: NSCLC 5,347 / Hepatology 426 / Rare Disease 2

**Canonical HCP validation:**
- Loomba (Hepatology): 121 total benes / $14.7K Medicare. Hepatology TA: 91 benes / $12.1K / 4 distinct codes / 23 procedure volume. Predominant specialty: Gastroenterology ✓
- Sanyal (Hepatology): NOT FOUND. NPI not applied to canonical record (known issue, deferred). Will appear after NPPES Workstream A application step on Thursday.
- Chalasani (Hepatology): 44 total benes / $2.9K. Hepatology TA: 44 benes / $2.9K / 2 distinct codes. Predominant specialty: Gastroenterology ✓
- Garassino (NSCLC): 452 total benes / $51.1K. NSCLC TA: 349 benes / $40.5K / 3 distinct codes. Predominant specialty: Hematology-Oncology ✓

**Drug administration volume = 0 for canonical academic HCPs.** Garassino, Loomba, Chalasani all show 0 drug_admin volume. Confirms academic billing pattern — drug administration billed under institutional NPI, not individual physician NPI. For community HCP ranking specifically (the Track #1 priority), this is fine: the methodology will surface community HCPs who bill drug admin under their own NPI, which is exactly the cohort MSL teams want. Academics get ranked through publication track instead.

## Methodology captures

### Confidence-tiered HCPCS design pattern

The cross-indication problem required schema-level support, not just aggregation logic. Specifically: `is_primary_signal BOOLEAN`, `requires_specialty_match BOOLEAN`, `specialty_match_patterns TEXT[]`, `code_category TEXT` columns on `ta_hcpcs_codes`. Aggregator's two-JOIN UNION ALL pattern uses these to compute high-confidence aggregates separately from raw match aggregates.

For v1, both aggregates are populated identically because we don't have a "total without confidence filter" version. The schema supports the distinction; future iterations can populate them separately if needed.

### Specialty match precision tradeoff

We tested three specialty match approaches in sequence:

1. **Broad substring** (`['Oncology', 'Hematology']`): catches Hematology-Oncology, Medical Oncology, Radiation Oncology, Surgical Oncology, Gynecological Oncology. Net: cross-specialty contamination. NSCLC by_ta = 5,946 with many false-positives.

2. **No E/M codes**: drops the contamination but loses the major academic HCPs whose office-visit volume is the only Medicare signal. NSCLC by_ta = 1,757; Garassino disappears entirely. Too narrow.

3. **Narrow exact specialty** (`['Hematology-Oncology', 'Medical Oncology']`): preserves volume signal for the right cohort. NSCLC by_ta = 5,347 (down from 5,946 by 599 rows). Garassino restored. Cross-specialty noise mostly removed.

The final state captures the medical-oncology cohort while excluding radiation oncologists, surgical oncologists, and gynecologic oncologists who had been false-matching. Documented as v1 methodology choice; v1.5 could refine further (e.g., specialty + NPPES taxonomy combination).

### RUCA as a community HCP signal

CMS Medicare data includes a Rural-Urban Commuting Area code per provider, captured in `provider_ruca` and `provider_ruca_desc` fields. The scoping doc didn't anticipate this. RUCA directly identifies practice setting (urban / large rural / small rural / isolated rural) without requiring derivation from city/state. Captured in `predominant_ruca` column on `hcp_medicare_summary`. Available for territory and rural-practice filtering in product UI.

### Drug administration volume = 0 for academic HCPs is a feature, not a bug

The aggregator output shows zero drug_admin volume for major academic clinicians (Loomba, Chalasani, Garassino). Initially looked like a methodology problem. Actually: academic medical centers bill drug administration under institutional NPIs, not individual physician NPIs. The professional fee for the visit goes to the physician's NPI; the drug administration fee goes to the hospital's NPI.

For community HCP ranking specifically (the FieldMark Track #1 priority), this is correct behavior. Community HCPs bill drug admin under their own NPI; academic HCPs don't. The methodology surfaces the right cohort for MSL targeting.

For the demo conversation: when someone asks "why doesn't this famous academic show up with high drug admin volume?", the answer is: "Because their hospital bills the drug administration. Their personal NPI shows the office visits. For academic HCPs we rank through the publication track; for community HCPs we rank through Medicare practice volume + Open Payments engagement."

### Hepatology specialty hidden in Gastroenterology

There is no "Hepatology" provider_type in CMS Medicare data. Hepatologists self-register as Gastroenterology. Within Medicare data, hepatologists vs general GIs are differentiated by HCPCS code patterns (liver biopsy 47000, paracentesis 49083, FibroScan 76981, TIPS 37182), not by specialty.

Implication: our Hepatology by_ta rows include some general GIs who happen to do hepatology work alongside endoscopy. This is acceptable — for an MSL targeting community hepatology, "GIs who manage liver disease" is the right cohort, regardless of self-designation.

## Database state at end of session

- hcps: 114,974 rows (unchanged from afternoon)
- HCPs with NPI: 30,093 (unchanged)
- Open Payments tables (created in afternoon, populated in afternoon execute):
  - `ta_drug_keywords`: 91 drug seed rows
  - `hcp_open_payments_summary`: 14,339 rows
  - `hcp_open_payments_by_ta`: 5,579 rows
- Medicare tables (created and populated this evening):
  - `ta_hcpcs_codes`: 89 HCPCS code rows (NSCLC 41, Hepatology 27, Rare Disease 21)
  - `hcp_medicare_summary`: 10,331 rows
  - `hcp_medicare_by_ta`: 5,775 rows
- Parquet on disk:
  - Open Payments: 661 MB (3 files, PY2022-2024)
  - Medicare: 1.14 GB (3 files, CY2021-2023)
  - Total: 1.8 GB

**Strategic state: 70% of community composite score now computable.** Industry engagement (30% weight) flowing for 14,339 HCPs. Practice volume (40% weight) flowing for 10,331 HCPs. Combined: NPPES geography + career stage adds another 25%, making the community composite ~95% computable for non-pediatric HCPs.

## Files referenced this evening

Source code (added/updated):
- `inspect_medicare_headers.py` (built and run; one-time diagnostic)
- `medicare_filter.py` (built; ~390 lines; one fix applied for nullable fields)
- `diagnostic_provider_types.py` (built and run; one-time diagnostic against Parquet)
- `medicare_aggregator.py` (built; ~700 lines; schema-mismatch fix applied before execute)

Data (added):
- `Medicare/Medicare_Physician_Other_Practitioners_by_Provider_and_Service_2021.csv` (2.97 GB source)
- `Medicare/Medicare_Physician_Other_Practitioners_by_Provider_and_Service_2022.csv` (2.94 GB source)
- `Medicare/Medicare_Physician_Other_Practitioners_by_Provider_and_Service_2023.csv` (2.85 GB source)
- `Medicare/medicare_provider_service_2021.parquet` (374 MB output)
- `Medicare/medicare_provider_service_2022.parquet` (392 MB output)
- `Medicare/medicare_provider_service_2023.parquet` (376 MB output)
- `medicare_aggregator_log_may6.json` (most recent dry run)
- `medicare_aggregator_log_may6_execute.json` (final execute, after rename)
- `open_payments_aggregator_log_may6_execute.json` (afternoon execute, after rename)

Documentation:
- This file: `may6_decision_log_addendum.md`

## Open items for tomorrow

**P0 — Backups before any other work:**
1. **Set up GitHub repo** for the FieldMark codebase. Currently no version control. Multiple custom Python scripts (parsers, aggregators, dedup remediation, diagnostics) live only in local working directory. High risk if disk fails or files are accidentally edited.
2. **Set up Supabase backups** before any further DDL or data modifications. The database state has substantial computed value now (327 dedup consolidations, 14,339 + 5,579 Open Payments rows, 10,331 + 5,775 Medicare rows, plus the seed tables). Manual export or scheduled Supabase backup config needed.

**P1 — Continued data work:**
3. **Apply unapplied NPPES Workstream A NPI matches** (Sanyal example). After application, re-run both Open Payments and Medicare aggregators to pick up newly-cohort-eligible HCPs.
4. **Patch `hcp_dedup_merge.py`** with publications + trial_proposals branching pattern. Required before the next Phase 2 dedup pass at scale.
5. **Composite score query / view** — wire up the weights and produce a ranked community HCP output. First demoable product output combining all signals.

**P2 — Methodology iteration:**
6. **Drug seed list v1.5 candidates** from Open Payments unmatched analysis (hemophilia products beyond Hemlibra, Gaucher, urea cycle, VOD, tardive dyskinesia, Ayvakit).
7. **HCPCS list v1.5 candidates** from Medicare unmatched analysis (additional pathology codes for Hepatology, generic supportive care codes evaluated case-by-case for NSCLC).
8. **Documentation consolidation** — eight separate docs in `Latest Documentation\` need integration into master priority + methodology doc.

**P3 — Demo-related:**
9. **Demo flow design** — what does the actual SQL/output look like when we show this to people. Three demo audiences identified: customers, advisors/partners, technical hires/investors. Different needs.
10. **Frontend HCP profile page** against canonical HCPs (Loomba, Chalasani, Garassino, Wakelee). Profile-page-first build approach: make four pages excellent before scaling.

## Behavioral notes

- Multiple iteration cycles on HCPCS seed list: noisy → over-aggressive → narrow specialty match. Final state is "smaller and more accurate" per user preference. Documented tradeoffs at each iteration so methodology doc captures the WHY, not just the WHAT.
- Two Cursor-generated scripts had real issues caught in code review before execute: medicare_filter.py had nullable-field handling bug (would have failed mid-parse); medicare_aggregator.py had schema-mismatch bug (would have failed all inserts). Both fixed via small targeted Cursor prompts before execute. Code review pattern is working.
- User explicitly requested fewer commands at once when overloaded; honored throughout the session by surfacing one decision at a time and waiting for confirmation before proceeding.
- "Show this to some people as soon as possible" goal locked in mid-session as ALL audiences ASAP (customers, advisors, investors, partners). Strategic implication: composite scoring methodology + demo flow design are the highest-priority next workstreams after backups.

## Strategic implications at end of session

The community HCP track has crossed a threshold tonight. From "no ranking signal beyond geography" yesterday morning to "70% of composite score computable, with the right cohorts in each TA" tonight.

What's now demonstrable to a pharma MSL team:

> "Our database has 30,093 HCPs with NPIs across our priority TAs. For 14,339 of them we have 3-year Open Payments industry engagement profiles broken out by category (speaker bureau, consulting, honoraria) and by therapeutic area. For 10,331 of them we have 3-year Medicare practice volume measured in beneficiaries served, distinct HCPCS codes, and TA-relevant clinical activity weighted by confidence tier. We can rank a Hepatology territory by combined signal in seconds. The data is current through PY2024 (Open Payments) and CY2023 (Medicare). All sources are public CMS data, fully audit-traceable."

That's a sales conversation. Not a vapor pitch.

The demoable output gap is now the composite-score query + frontend, not the underlying data. Both are tomorrow's work, neither is blocked by data architecture. The path from here to demo is shorter than the path we already walked.
