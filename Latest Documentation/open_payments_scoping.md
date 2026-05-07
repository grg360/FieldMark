# Open Payments Integration — Scoping Doc

**Captured:** May 5, 2026 Tuesday late evening
**Source:** Phase 2 of Community HCP track (P0 #8n elevated). Sequenced after NPPES backfill completion.
**Position in pipeline:** NPPES (in flight) → **Open Payments** → Medicare Provider Data → Community HCP ranking methodology

## Why Open Payments matters for FieldMark

Open Payments / Sunshine Act data is the strongest near-term signal for community HCP ranking that exists in free public data. Every payment from pharmaceutical companies and device makers to physicians is required to be reported. The data structure provides direct measurement of:

1. **Industry's own assessment of HCP commercial influence.** Pharma companies don't pay $40K+ in speaker bureau fees to physicians who don't drive prescribing. Speaker bureau payments are a direct signal that industry views an HCP as influential within their TA.

2. **TA-relevant engagement.** Each payment record includes the associated drug, device, or medical supply. Filtering to NSCLC-relevant drugs (osimertinib, pembrolizumab, etc.), hepatology drugs (entresto, obeticholic acid, resmetirom, etc.), or rare disease drugs (nusinersen, casimersen, voxzogo, etc.) reveals which HCPs are commercially engaged in our target therapeutic areas.

3. **Geographic and practice-context signal.** Open Payments includes the recipient's state and practice address, providing a layer of identity verification beyond NPPES alone.

4. **Career trajectory.** Year-over-year payment patterns reveal rising vs declining commercial engagement. An HCP whose Open Payments are climbing 30%/year for three years is a rising community DOL.

## Data characteristics

**Source:** CMS publishes annually, refreshed January each year.
- Production URL: `https://openpaymentsdata.cms.gov/dataset/`
- Dataset Download Page: `https://openpaymentsdata.cms.gov/explorer-redirect/dataset/`
- Most recent complete program year: **2024 data** (published June 2025, refreshed January 2026)

**Data structure (Program Year 2024):**
- General Payments dataset (the one we need most): payments not tied to formal research agreements — speaker bureau, consulting, food/travel, education, gifts, royalties
- Research Payments dataset: payments tied to research agreements
- Ownership Investment dataset: ownership/investment interests held by physicians

**File sizes (estimates from CMS):**
- General Payments file: 4-6 GB compressed CSV (10-15 GB decompressed)
- Research Payments file: 1-2 GB compressed
- Total annual data: 5-8 GB compressed across all three files

**Record volume:**
- Approximately 14M+ general payment records per year
- Approximately 600K+ unique physicians receive payments annually
- Total dollar amount: approximately $13B/year across all payment types

**Key fields per record:**
- Covered_Recipient_NPI (matches our enrichment target)
- Covered_Recipient_First_Name, Last_Name, Middle_Name
- Recipient_Primary_Business_Street_Address, City, State, Zip
- Recipient_State_Tag (US state)
- Recipient_Country
- Recipient_Province (for non-US)
- Physician_Specialty (NUCC taxonomy)
- Date_of_Payment
- Total_Amount_of_Payment_USDollars
- Nature_of_Payment_or_Transfer_of_Value (one of: Speaker, Consulting Fee, Food and Beverage, Travel and Lodging, Education, Royalty or License, etc.)
- Form_of_Payment (Cash, In-kind, Stock, etc.)
- Submitting_Applicable_Manufacturer_or_Applicable_GPO_Name (the pharma/device company)
- Name_of_Drug_or_Biological_or_Device_or_Medical_Supply_1 through _5
- Indicate_Drug_or_Biological_or_Device_or_Medical_Supply_1 through _5
- NDC code (drug identifier when applicable)
- Program_Year

## Filtering scope for FieldMark v1

For v1 implementation, scope downloaded data narrowly:

**Time window:**
- Most recent 3 program years (2022, 2023, 2024) for trend analysis
- Older data available via CMS archive but not needed for v1

**Payment types:**
- General Payments (full table) — the main signal source
- Research Payments (skip for v1) — captured separately by ClinicalTrials.gov investigator data
- Ownership Investment (skip for v1) — much smaller cohort, edge case

**Initial filtering at ingestion time:**
- US recipients only (Recipient_Country = "United States")
- Non-zero payment amount
- Active records (Change_Type != "DELETE")

This narrows from approximately 14M general payment records per year to perhaps 12-13M relevant records.

## TA-relevant drug filter (the key product question)

The most valuable Open Payments signal is **TA-specific industry engagement** — not just total payments, but payments associated with NSCLC drugs, hepatology drugs, rare disease drugs.

We need to maintain a curated drug/biologic list per launch TA:

**NSCLC drug list (initial v1):**
- Osimertinib (Tagrisso) — EGFR
- Pembrolizumab (Keytruda) — IO
- Nivolumab (Opdivo) — IO
- Atezolizumab (Tecentriq) — IO
- Durvalumab (Imfinzi) — IO
- Alectinib (Alecensa) — ALK
- Brigatinib (Alunbrig) — ALK
- Lorlatinib (Lorbrena) — ALK
- Crizotinib (Xalkori) — ALK/ROS1
- Sotorasib (Lumakras) — KRAS G12C
- Adagrasib (Krazati) — KRAS G12C
- Selpercatinib (Retevmo) — RET
- Pralsetinib (Gavreto) — RET
- Capmatinib (Tabrecta) — MET
- Tepotinib (Tepmetko) — MET
- Trastuzumab deruxtecan (Enhertu) — HER2
- Amivantamab (Rybrevant) — EGFR exon 20
- Mobocertinib (Exkivity) — EGFR exon 20
- Datopotamab deruxtecan — TROP2 ADC
- Telisotuzumab vedotin (Emrelis) — c-Met ADC

**Hepatology drug list (initial v1):**
- Resmetirom (Rezdiffra) — MASH
- Obeticholic acid (Ocaliva) — PBC
- Elafibranor (Iqirvo) — PBC
- Seladelpar (Livdelzi) — PBC
- Cilofexor — clinical trials
- Firsocostat — clinical trials
- Aramchol — clinical trials
- Maralixibat (Livmarli) — Alagille, PFIC
- Odevixibat (Bylvay) — PFIC
- Lanifibranor — clinical trials
- Pegbelfermin — clinical trials
- Efruxifermin — clinical trials
- Survodutide — clinical trials
- Tirzepatide (Mounjaro/Zepbound, off-label MASH usage)
- Semaglutide (Ozempic/Wegovy, off-label MASH usage)

**Rare Disease drug list (initial v1, by sub-TA):**
- *SMA:* Nusinersen (Spinraza), Risdiplam (Evrysdi), Onasemnogene abeparvovec (Zolgensma)
- *DMD:* Casimersen (Amondys 45), Eteplirsen (Exondys 51), Golodirsen (Vyondys 53), Viltolarsen (Viltepso), Ataluren (Translarna), Givinostat (Duvyzat)
- *Sickle Cell:* Voxelotor (Oxbryta - withdrawn 2024 but historical), L-glutamine (Endari), Crizanlizumab (Adakveo), Exa-cel (Casgevy), Lovo-cel (Lyfgenia)
- *HAE:* Berotralstat (Orladeyo), Lanadelumab (Takhzyro), C1 esterase inhibitor (Cinryze, Berinert, Haegarda), Icatibant (Firazyr), Ecallantide (Kalbitor)
- *CF:* Elexacaftor/tezacaftor/ivacaftor (Trikafta), Tezacaftor/ivacaftor (Symdeko), Lumacaftor/ivacaftor (Orkambi), Ivacaftor (Kalydeco)
- *Alagille:* Maralixibat (Livmarli), Odevixibat (Bylvay)
- *PFIC:* Odevixibat, Maralixibat
- *Achondroplasia:* Vosoritide (Voxzogo)
- *Pompe:* Alglucosidase alfa (Lumizyme), Avalglucosidase alfa (Nexviazyme)
- *Fabry:* Agalsidase beta (Fabrazyme), Migalastat (Galafold), Pegunigalsidase alfa (Elfabrio)

The drug lists are seed values. Need ongoing maintenance as new approvals happen and as we learn which trade names appear in Open Payments. Some drugs may have multiple naming patterns (Trikafta, Kaftrio, ELX/TEZ/IVA, etc.) requiring fuzzy matching.

## Engineering work breakdown

**Phase 1 — Data acquisition and parsing (1-2 days):**
- Download three program years of General Payments data from CMS
- Build streaming Python parser similar to nppes_filter.py
- Filter to US-only, non-zero amount, non-DELETE records
- Write filtered Parquet file per program year (estimated 1-2 GB each)

**Phase 2 — TA drug list curation (2-3 days):**
- Build curated drug list per TA in Supabase (`ta_drug_keywords` table)
- Schema: ta_id (UUID), drug_name (TEXT), drug_brand_name (TEXT), drug_generic_name (TEXT), is_primary_signal BOOL
- Seed with the lists above
- Manual validation against actual Open Payments drug name occurrences in 2024 data
- Document name variations and normalization rules

**Phase 3 — Matching and aggregation (3-5 days):**
- Match Open Payments records to FieldMark HCPs by NPI (after NPPES backfill, ~21K-25K of our US HCPs will have NPIs)
- Aggregate per-HCP metrics:
  - Total payment amount (lifetime, last 3 years, last year)
  - Payment count by Nature_of_Payment (speaker, consulting, food, etc.)
  - Distinct paying companies count
  - TA-relevant payment amount (filtered by drug list)
  - Year-over-year trend (slope of last 3 years)
  - Most recent payment date
- Write aggregates to new `hcp_open_payments_summary` table

**Phase 4 — Schema and queries (1-2 days):**
- Add columns to hcps table or create new table for Open Payments aggregates
- Build views for "industry engagement score" component of community composite
- Spot-check known cases (high-volume KOLs should show substantial speaker bureau payments)

**Phase 5 — Validation (1-2 days):**
- Validate against canonical HCPs known to receive industry payments (high-profile KOLs)
- Sample random matched aggregates for plausibility
- Document data integrity issues found

**Total estimated effort:** 1.5-2 weeks of focused engineering, similar to NPPES.

## Schema additions

New table: `hcp_open_payments_summary`

```
CREATE TABLE hcp_open_payments_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL UNIQUE REFERENCES hcps(id),
  npi TEXT,
  
  -- Lifetime totals
  total_payments_lifetime NUMERIC,
  total_payments_count_lifetime INTEGER,
  distinct_companies_lifetime INTEGER,
  
  -- 3-year window (most recent 3 program years)
  total_payments_3yr NUMERIC,
  speaker_bureau_3yr NUMERIC,
  consulting_3yr NUMERIC,
  food_travel_3yr NUMERIC,
  research_3yr NUMERIC,
  royalty_3yr NUMERIC,
  
  -- TA-specific (computed per TA)
  -- Note: separate row per HCP-TA combination might be cleaner;
  --       evaluate during implementation
  
  -- Trend
  year_over_year_trend_pct NUMERIC,
  most_recent_payment_date DATE,
  
  -- Metadata
  open_payments_calculated_at TIMESTAMPTZ,
  open_payments_version TEXT,
  open_payments_program_years INTEGER[]
);

CREATE INDEX idx_hcp_op_summary_total_3yr ON hcp_open_payments_summary(total_payments_3yr DESC);
```

New table: `hcp_open_payments_by_ta`

```
CREATE TABLE hcp_open_payments_by_ta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps(id),
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  
  ta_payments_3yr NUMERIC,
  ta_payments_count_3yr INTEGER,
  ta_distinct_drugs_3yr INTEGER,
  ta_distinct_companies_3yr INTEGER,
  ta_speaker_bureau_3yr NUMERIC,  -- speaker bureau specifically for TA-relevant drugs
  
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(hcp_id, therapeutic_area_id)
);

CREATE INDEX idx_hcp_op_by_ta ON hcp_open_payments_by_ta(therapeutic_area_id, ta_payments_3yr DESC);
```

## Methodological considerations

**1. Three-year window vs lifetime.** Three years balances recency (current commercial relevance) with sufficient signal volume. A new community oncologist with one year of payment history would have unstable trend analysis; three years gives a stable view.

**2. Inflation adjustment.** $50K in 2022 vs $50K in 2024 are slightly different in real terms. For v1, ignore inflation (changes are small over 3 years). Note as future enhancement.

**3. Payment recency weighting.** Should a $100K speaker bureau payment in 2024 count more than $100K in 2022? Initial v1 design: no recency weighting within the 3-year window; rely on year-over-year trend metric for recency signal. Revisit after seeing data.

**4. Aggregation across multiple companies.** An HCP getting $10K each from 10 different pharma companies is arguably more influential than one getting $100K from a single company (broader industry recognition). Distinct_companies metric captures this.

**5. TA cross-payment.** Some HCPs receive payments tied to drugs in multiple TAs (a thoracic oncologist might receive payments for both NSCLC and SCLC drugs, or a hepatologist for both MASH and PBC). The hcp_open_payments_by_ta table allows clean per-TA aggregation.

**6. Name-of-Drug matching subtleties.** Open Payments records may have:
- Brand name only ("Trikafta")
- Generic name only ("elexacaftor/tezacaftor/ivacaftor")
- Partial match ("ELX/TEZ/IVA")
- Misspellings or formatting variants

Matching algorithm should be tolerant — case-insensitive, partial-word matching, with the curated ta_drug_keywords table acting as the authoritative reference.

**7. Specialty mismatch.** Some HCPs receive payments for drugs outside their stated specialty. A general internist receiving NSCLC drug payments might be a community oncologist who hasn't updated their NPPES taxonomy. Don't filter by specialty — let the data tell us.

## Open methodological questions for design phase

**Q1: How to handle covered recipients without NPI in Open Payments?**
Some Open Payments records list "Teaching Hospital" or "Non-Physician Practitioner" recipients. For v1 community HCP work, we focus on physician recipients with NPIs. Skip non-NPI records.

**Q2: How to handle disputed records?**
Open Payments allows physicians to dispute records. Disputed records have a `Dispute_Status_for_Publication` field. For v1, include disputed but published records (most disputes are resolved without removal). Note this in data docs.

**Q3: What to do with renewal-of-payment delays?**
Some research-related payments can be delayed up to 4 years. Since we're focused on General Payments (not Research Payments), this is mostly not applicable. Skip.

**Q4: How frequently to refresh?**
- CMS publishes annual data on June 30 each year
- CMS refreshes January each year (corrections, late submissions)
- Recommendation: bi-annual refresh (June, January) for v1. Quarterly for v2 if needed.

**Q5: Storage strategy for raw Open Payments data?**
The decompressed CSVs total 30+ GB across 3 years. Two options:
- **Keep raw files in `C:\Users\garre\Desktop\FieldMark\OpenPayments\`** for re-processing if needed. Costs disk space.
- **Process to filtered Parquets, delete raw**. Saves disk space, can't re-process without re-downloading.

Recommend first option for v1 — disk is cheap, reprocessing without re-download is faster.

## Integration with Community HCP ranking

After Open Payments aggregates exist, the community composite from p0_elevation_community_hcp.md becomes computable:

```
community_composite_score = 
  weight_practice_volume * normalized(TA_relevant_patient_volume) +     -- waits for Medicare data
  weight_industry_engagement * normalized(speaker_bureau_3yr_TA_relevant + 0.5 * consulting_3yr_TA_relevant) +
  weight_group_practice * group_practice_signal +                       -- from NPPES group data
  weight_career_stage * normalized(years_since_NPI_enumeration) +       -- from NPPES
  weight_publication * normalized(existing_publication_composite) ;     -- from existing scoring

weights:
  practice_volume = 0.40
  industry_engagement = 0.30  ← computable after Open Payments integration
  group_practice = 0.15
  career_stage = 0.10
  publication = 0.05
```

After Phase 2 (Open Payments) we have 30% of the composite computable. After Phase 3 (Medicare) we have 70%. Group practice and career stage are computable from NPPES alone.

## Risks and contingencies

**Risk 1: Drug name normalization is harder than estimated.** The Open Payments drug naming is freeform text. Real implementation will likely require a multi-week effort to build and validate the curated list against actual data. Time estimate may extend.

**Risk 2: NPI coverage in Open Payments.** Some Open Payments records lack NPI — the recipient might be identified by name only. We lose those records. Estimate: 10-20% of records may lack NPI. Acceptable for v1.

**Risk 3: TA classification subjectivity.** Is omeprazole a hepatology drug? (Sometimes, in PBC patients.) Is metformin a NSCLC drug? (Some research interest.) Drug list curation requires therapeutic judgment. Initial seed lists need expert review.

**Risk 4: Community HCP coverage gap persists.** Even after Open Payments integration, community HCPs without industry payments are still invisible to the ranking. Pure cash-pay or independent practitioners. Acceptable gap; addressed partially by MSL contributor surfacing in v2.

## Deliverables when complete

1. Filtered Parquet files for 3 program years of General Payments data
2. Curated `ta_drug_keywords` table with seed drug lists per TA
3. Streaming parser script (`open_payments_filter.py`)
4. Aggregation script (`open_payments_aggregator.py`) writing to `hcp_open_payments_summary` and `hcp_open_payments_by_ta`
5. Validation queries for canonical HCPs
6. Methodology doc section on Open Payments enrichment
7. Updated priority doc reflecting Phase 2 completion

## Sequencing relative to NPPES

Open Payments work can begin **immediately after NPPES matcher Workstream A completes** (matching existing US HCPs to NPIs). Because:
- Open Payments matching uses NPI as join key
- Without NPPES backfill, only 8,605 HCPs have NPIs in our database
- After NPPES backfill, ~21K-25K US HCPs will have NPIs
- Open Payments value scales with NPI coverage

Workstream B (ingest new community HCPs from NPPES) can run in parallel with Open Payments — they don't depend on each other.
