# Medicare Provider Data Integration — Scoping Doc

**Captured:** May 5, 2026 Tuesday late evening  
**Source:** Phase 3 of Community HCP track (P0 #8p, NEW priority). Sequenced after Open Payments completion or in parallel.  
**Position in pipeline:** NPPES (in flight) → Open Payments (next) → **Medicare Provider Data** → Community HCP ranking methodology

## Why Medicare Provider Data matters for FieldMark

Medicare Provider Data is **the most direct measurement of clinical practice volume that exists in free public data.** While Open Payments measures industry's view of HCP commercial influence, Medicare Provider Data measures the actual clinical activity — how many patients an HCP treats, how many procedures they perform, what services they bill.

For Community HCP ranking, this is the decisive signal:

1. **Practice volume by HCPCS code.** Every service a provider bills Medicare for is captured with the HCPCS procedure code, the count of services rendered, and the count of unique beneficiaries. A community oncologist billing 600 chemotherapy administration codes a year is treating 600 patients with cancer — that's the prescribing influence MSL teams care about.

2. **TA-relevant patient cohort sizes.** HCPCS codes map to specific clinical activities. NSCLC drug administration codes (J9355 for trastuzumab, J9145 for daratumumab, etc.), hepatology procedure codes (transient elastography, paracentesis, transjugular intrahepatic shunting), rare disease infusion codes — each maps to volumes per HCP.

3. **Geographic practice intensity.** Same data shows where Medicare beneficiaries are being treated, allowing territory-level analysis of practice volume.

4. **Year-over-year practice trajectory.** Multiple years of data reveal which community HCPs are growing their practice (rising community DOLs) vs declining (retiring/transitioning).

## Data characteristics

**Source:** CMS publishes annually as the Medicare Physician & Other Practitioners dataset (formerly the "Physician and Other Supplier Public Use File").

- Production URL: `https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners`
- Two main datasets:
  - **By Provider and Service:** NPI × HCPCS code × place of service (the granular level we need)
  - **By Provider:** Aggregated to NPI level (less detail but smaller file)
- Most recent complete year: **CY2023 data** (typically published mid-2025)
- Data lag: roughly 1.5 years from end of calendar year to publication

**File sizes (estimates):**
- By Provider and Service annual file: 2-3 GB compressed CSV
- By Provider annual file: 200-400 MB compressed
- 100% final-action Medicare fee-for-service Part B claims

**Record volume (annual):**
- Approximately 10M+ NPI-HCPCS-place_of_service combinations
- Approximately 1.1M unique providers per year
- Limited to providers with 11+ unique beneficiaries (CMS privacy threshold — fewer beneficiaries get suppressed)

**Key fields per record (by Provider and Service):**
- npi (National Provider Identifier)
- nppes_provider_last_org_name, first_name, mi
- nppes_credentials (MD, DO, NP, PA, etc.)
- nppes_provider_gender
- nppes_entity_code (1=individual, 2=organization)
- nppes_provider_street1, street2, city, zip, state, country
- provider_type (specialty)
- medicare_participation_indicator
- place_of_service ("F" facility or "O" non-facility/office)
- hcpcs_code (the procedure/service code)
- hcpcs_description
- hcpcs_drug_indicator (Y/N — is this a Part B drug)
- line_srvc_cnt (total services rendered)
- bene_unique_cnt (distinct Medicare beneficiaries served)
- bene_day_srvc_cnt (distinct beneficiary-days of service)
- average_medicare_allowed_amt
- average_submitted_chrg_amt
- average_medicare_payment_amt
- average_medicare_standard_amt (geographic adjustment removed)

## Filtering scope for FieldMark v1

**Time window:** Most recent 3 program years for trend analysis (CY2021, CY2022, CY2023).

**Provider filtering:**
- nppes_entity_code = "1" (individual providers, not organizations)
- US recipients only (nppes_provider_country = "US")
- Medicare participating providers (medicare_participation_indicator = "Y") — non-participating providers don't accept assignment, may be different population

**HCPCS filtering at ingestion:** Don't filter — keep all HCPCS codes per HCP. The TA-specific subsetting happens at aggregation time so the same dataset can serve multiple TAs.

This narrows from approximately 10M records per year to perhaps 8-9M relevant records.

## TA-relevant HCPCS code lists (the key product question)

The most valuable Medicare signal is **TA-specific patient volume** — how many lung cancer patients does this oncologist treat, not just total patient volume.

**HCPCS code categories relevant to launch TAs:**

**NSCLC (Oncology):**
- *Drug administration codes:* J9355 (trastuzumab), J9305 (pemetrexed), J9035 (bevacizumab), J9299 (nivolumab), J9271 (pembrolizumab), J9022 (atezolizumab), J9173 (durvalumab), J9301 (obinutuzumab), J9264 (paclitaxel)
- *NSCLC-specific drug codes:* osimertinib, alectinib, brigatinib, sotorasib, etc. — each has a J-code or HCPCS in the Part B drug list
- *Procedure codes:* 96413 (chemotherapy infusion), 96365 (IV infusion), 96367 (additional hour), 31624-31628 (bronchoscopy with biopsy), 32607-32674 (lung biopsy/lobectomy)
- *Imaging codes:* 71250-71275 (chest CT), 78815 (whole body PET)
- *E/M codes:* 99213-99215 (established patient visits — high volume in oncology)

**Hepatology:**
- *Procedure codes:* 76981 (transient elastography / FibroScan), 49083 (paracentesis), 47000 (liver biopsy), 47100 (transjugular liver biopsy), 37182 (TIPS placement)
- *Drug administration codes:* G0428, G0427 (PBC drug administration), J-codes for emerging MASH drugs (resmetirom, etc.)
- *Imaging:* 76700 (liver ultrasound), 74181 (MRI abdomen)
- *E/M codes:* 99213-99215 (established patient hepatology visits)

**Rare Disease (varies by sub-bucket):**
- *SMA:* J2326 (nusinersen administration), J3590 (unspecified biologic)
- *DMD:* J1428 (eteplirsen), J1429 (golodirsen), J1426 (casimersen)
- *Sickle Cell:* J0791 (crizanlizumab), exa-cel/Casgevy procedure codes
- *HAE:* J0596 (C1 esterase inhibitor), J0597 (icatibant), J0598 (lanadelumab)
- *CF:* J7682 (tobramycin), J7639 (dornase alfa), oral CFTR modulator administration
- *Pompe/Fabry/Lysosomal:* alglucosidase alfa codes, agalsidase beta codes, related infusion codes

The HCPCS lists need ongoing maintenance. Some drugs receive new HCPCS codes annually. CMS publishes the HCPCS Code List quarterly with updates.

## Engineering work breakdown

**Phase 1 — Data acquisition and parsing (1-2 days):**
- Download three program years (CY2021, CY2022, CY2023) of Medicare Physician & Other Practitioners data from CMS
- Build streaming parser similar to nppes_filter.py
- Filter to individual US providers participating in Medicare
- Write filtered Parquet files per program year

**Phase 2 — TA HCPCS list curation (3-5 days):**
- Build curated HCPCS list per TA in Supabase (`ta_hcpcs_codes` table)
- Schema: ta_id (UUID), hcpcs_code (TEXT), code_description (TEXT), code_category (TEXT — drug_admin/procedure/imaging/em), is_primary_signal BOOL
- Seed with the lists above (significant clinical research effort)
- Manual validation — check that codes are still active in current HCPCS, identify obsolete codes, find new codes
- Document code variations and place-of-service considerations

**Phase 3 — Matching and aggregation (3-5 days):**
- Match Medicare records to FieldMark HCPs by NPI
- Aggregate per-HCP metrics:
  - Total Medicare beneficiaries served (lifetime, last 3 years, last year)
  - Total services rendered
  - Total Medicare payments received
  - TA-relevant beneficiaries (filtered by HCPCS)
  - TA-relevant service volume
  - Year-over-year practice volume trend
  - Most active HCPCS codes (top 10 per HCP)
- Write aggregates to new `hcp_medicare_summary` and `hcp_medicare_by_ta` tables

**Phase 4 — Schema and queries (1-2 days):**
- Add columns or new table for Medicare aggregates
- Build views for "practice_volume" component of community composite
- Spot-check against canonical HCPs

**Phase 5 — Validation (1-2 days):**
- Validate against canonical clinical HCPs — should show high beneficiary counts in TA
- Sample random matched aggregates for plausibility
- Compare to known Medicare Physician Compare data
- Document data integrity issues found

**Total estimated effort:** 1.5-2 weeks of focused engineering, similar to NPPES and Open Payments. The HCPCS list curation is the biggest variable — could extend if clinical accuracy validation takes longer than estimated.

## Schema additions

New table: `hcp_medicare_summary`

```
CREATE TABLE hcp_medicare_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL UNIQUE REFERENCES hcps(id),
  npi TEXT,
  
  -- Lifetime totals (3-year window)
  total_beneficiaries_3yr INTEGER,
  total_services_3yr INTEGER,
  total_medicare_payment_3yr NUMERIC,
  
  -- Most recent year
  beneficiaries_last_year INTEGER,
  services_last_year INTEGER,
  
  -- Trend
  beneficiaries_yoy_trend_pct NUMERIC,
  
  -- Practice context
  primary_place_of_service TEXT,  -- F or O, whichever has more volume
  total_distinct_hcpcs_codes INTEGER,
  top_hcpcs_codes TEXT[],  -- top 10 by service count
  
  -- Metadata
  medicare_data_calculated_at TIMESTAMPTZ,
  medicare_data_program_years INTEGER[]
);

CREATE INDEX idx_hcp_medicare_total_3yr ON hcp_medicare_summary(total_beneficiaries_3yr DESC);
```

New table: `hcp_medicare_by_ta`

```
CREATE TABLE hcp_medicare_by_ta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps(id),
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  
  ta_beneficiaries_3yr INTEGER,
  ta_services_3yr INTEGER,
  ta_medicare_payment_3yr NUMERIC,
  ta_distinct_hcpcs_codes INTEGER,
  ta_drug_admin_volume_3yr INTEGER,  -- specifically drug administration codes
  ta_procedure_volume_3yr INTEGER,
  
  ta_beneficiaries_yoy_trend_pct NUMERIC,
  
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(hcp_id, therapeutic_area_id)
);

CREATE INDEX idx_hcp_medicare_by_ta ON hcp_medicare_by_ta(therapeutic_area_id, ta_beneficiaries_3yr DESC);
```

## Methodological considerations

**1. Medicare-only view is the biggest limitation.** Approximately 65% of US adults 65+ are Medicare beneficiaries; commercial-insurance and pediatric populations are entirely absent. This creates known gaps:

- **Pediatric specialists:** A pediatric oncologist treating SMA in children has zero Medicare volume but could be a major MSL target. Medicare data is structurally blind here.
- **Commercial-only practices:** A concierge oncology practice serving primarily commercial-insured patients won't show in Medicare data.
- **Overall scaling factor:** A full-time oncologist treating 1,200 patients/year might show 300 in Medicare data. The 4x scaling factor varies by specialty and is approximate.

For NSCLC and Hepatology (older patient populations), Medicare data captures most of the cohort. For Pediatric Rare Disease, Medicare is largely useless and we'll need alternative signals (claims data, professional society memberships, MSL contributor flagging).

**2. Aggregation level decisions.**
- HCPCS code level is most granular but most data
- Code category level (drug admin, procedure, imaging, e/m) is more useful for ranking
- TA level is what feeds the composite score

We aggregate at all three levels but feature the TA level prominently.

**3. Place of service matters.**
- Facility setting (place_of_service = "F"): hospital outpatient, ASC — physician gets only professional fee
- Non-facility setting (place_of_service = "O"): private office — physician gets total payment

Total Medicare payment differs by place of service. For practice intensity ranking, the meaningful metric is `bene_unique_cnt` (unique patients) regardless of setting. For revenue intensity, place of service matters.

**4. CMS privacy threshold (10 beneficiaries) creates artifacts.** HCPs treating between 1-10 Medicare beneficiaries with a specific HCPCS code have that record suppressed. This means:
- Low-volume HCPs are systematically underrepresented
- Subspecialty HCPs with rare procedures may have entire HCPCS codes hidden
- Acceptable for v1 — doesn't affect community DOL identification (DOLs by definition have non-trivial volume)

**5. NPPES data appears in both NPPES file and Medicare data.** Each Medicare record duplicates NPPES fields (name, address, credentials). Per CMS docs: "for all Physician and Other Supplier PUF data years, provider demographics are included from the National Plan & Provider Enumeration System (NPPES)."

This means we don't need our NPPES backfill to use Medicare data — Medicare data already includes NPPES fields per record. But: NPPES backfill is still valuable because:
- Provides geography for HCPs without Medicare activity
- Captures specialty and credentials beyond what's in Medicare
- Foundation for matching to other data sources (Open Payments, etc.)

**6. Total payment vs allowed amount vs submitted amount.** Three different dollar figures per record:
- `average_submitted_chrg_amt`: What the provider charged
- `average_medicare_allowed_amt`: What Medicare allowed (after policy adjustments)  
- `average_medicare_payment_amt`: What Medicare actually paid (allowed minus copay/deductible)

For practice volume ranking, dollars are less important than `bene_unique_cnt`. For practice revenue ranking, use `average_medicare_payment_amt × line_srvc_cnt`.

## Open methodological questions for design phase

**Q1: How to handle providers with multiple specialties?**
A multi-specialty internist showing both NSCLC drug admin volume and hepatology procedure volume splits across two TAs. Per-TA aggregation handles this naturally.

**Q2: How to integrate with claims-based intelligence?**
Some commercial claims providers (Komodo, Definitive) offer richer data. For v1 we use only public CMS data. For v2 / v3, partnerships with commercial data providers would expand coverage to commercial-insured patient volumes. Note this gap explicitly.

**Q3: Time delays in data publication.**
CY2023 data published in 2025 means we're working with 1.5+ year lag. An HCP who had a major practice change in 2024-2025 (retirement, location move, retirement) won't reflect in our Medicare data until CY2024 publishes in 2026. Acceptable lag for ranking purposes; flag in product as "data current through CY2023."

**Q4: NDC-to-HCPCS mapping for Part B drugs.**
Part B drugs have both NDC codes (manufacturer level) and HCPCS J-codes (Medicare reimbursement level). Our TA drug list is in NDC/brand names but Medicare data is in HCPCS. Need crosswalk. CMS publishes this. Implementation detail.

**Q5: Pediatric provider gap.**
For pediatric rare disease, Medicare data is largely blind. Mitigations:
- Use NPPES taxonomy filtering to identify pediatric specialists upfront
- Flag pediatric specialists with "Medicare data not applicable for ranking" indicator
- Rely on Open Payments and publication signal more heavily for this cohort
- Plan v2 work for state Medicaid claims data (covers pediatric population)

## Integration with Community HCP ranking

After Medicare aggregates exist, the community composite becomes fully computable for non-pediatric HCPs:

```
community_composite_score = 
  weight_practice_volume * normalized(TA_relevant_beneficiaries_3yr) +     ← Medicare
  weight_industry_engagement * normalized(speaker_bureau_3yr_TA_relevant) + ← Open Payments
  weight_group_practice * group_practice_signal +                          ← NPPES
  weight_career_stage * normalized(years_since_NPI_enumeration) +          ← NPPES
  weight_publication * normalized(existing_publication_composite)          ← existing pipeline
```

After this phase: 70% of composite computable. Group practice and career stage from NPPES = 25%. Total: 95% computable for non-pediatric HCPs. Pediatric HCPs remain partial because Medicare data doesn't apply.

## Risks and contingencies

**Risk 1: HCPCS list curation is materially harder than estimated.** Building accurate per-TA HCPCS lists requires therapeutic-area expertise. May need clinical consultant input. Time estimate may extend by 1-2 weeks.

**Risk 2: Pediatric coverage gap.** Material limitation for Rare Disease TA which has substantial pediatric component. May need to caveat the community ranking for pediatric-relevant rare diseases. Doesn't block other TAs.

**Risk 3: NPI coverage gap.** Same as Open Payments — Medicare records are keyed by NPI. Without NPPES backfill, only 8,605 of our HCPs have NPIs. Value scales with NPI coverage.

**Risk 4: HCPCS code obsolescence.** Some drug administration codes get retired or replaced annually. Curation must account for code history (a 2021 record might use a now-obsolete code; aggregating across 3 years requires code mapping).

**Risk 5: Data publication timing.** If CY2024 data publishes earlier than expected (mid-2026), we'd want to incorporate. Design for monthly check on CMS publication schedule.

## Deliverables when complete

1. Filtered Parquet files for 3 program years of Medicare Physician & Other Practitioners data
2. Curated `ta_hcpcs_codes` table with seed HCPCS lists per TA
3. Streaming parser script (`medicare_filter.py`)
4. Aggregation script (`medicare_aggregator.py`) writing to summary tables
5. Validation queries for canonical HCPs
6. Methodology doc section on Medicare data enrichment
7. Updated priority doc reflecting Phase 3 completion

## Sequencing relative to NPPES and Open Payments

Medicare Provider Data work can run **in parallel with Open Payments** since both depend on NPPES backfill but not on each other. Realistic sequencing:

- Week 1-2: NPPES backfill (in flight)
- Week 3-4: Open Payments integration  
- Week 5-6: Medicare Provider Data integration
- Week 7-8: Community HCP ranking methodology design and validation

Or with parallelization:
- Week 1-2: NPPES backfill
- Week 3-5: Open Payments AND Medicare Provider Data simultaneously
- Week 6-7: Community HCP ranking methodology

Total: 6-8 weeks for full Community HCP track v1, depending on parallelism.

## Critical product implication

Medicare Provider Data is the strongest single signal for community HCP ranking — direct measurement of clinical practice. Without this, "Regional/Community" track ranks community HCPs only by industry engagement (Open Payments) and demographic signals (NPPES). With this, ranking reflects actual patient care intensity.

**Recommendation: Medicare Provider Data integration is required for v1 launch of the Regional/Community track.** Without it, the track shows community HCPs without meaningful ranking — a "list of community HCPs in your territory" rather than "ranked community HCPs by practice influence." The latter is what the audience asked for.
