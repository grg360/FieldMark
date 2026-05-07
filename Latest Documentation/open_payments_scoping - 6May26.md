# Open Payments Integration — Scoping Doc

**Originally captured:** May 5, 2026 Tuesday late evening
**Revised:** May 6, 2026 Wednesday afternoon (post-parse empirical updates)
**Source:** Phase 2 of Community HCP track (P0 #8n elevated). Sequenced after NPPES backfill completion.
**Position in pipeline:** NPPES (complete) → **Open Payments** (parser complete, aggregator pending) → Medicare Provider Data → Community HCP ranking methodology

> **Revision note (May 6):** This document was originally drafted before parsing the actual CMS data. After parsing 28.6M physician-payment records across PY2022-2024 (January 2026 publication), several assumptions in the original draft did not hold. Sections marked "Updated post-parse" reflect what the data actually contains. Sections without that marker are unchanged from the May 5 draft.

## Why Open Payments matters for FieldMark

Open Payments / Sunshine Act data is the strongest near-term signal for community HCP ranking that exists in free public data. Every payment from pharmaceutical companies and device makers to physicians is required to be reported. The data structure provides direct measurement of:

1. **Industry's own assessment of HCP commercial influence.** Pharma companies don't pay $40K+ in speaker bureau fees to physicians who don't drive prescribing. Speaker bureau payments are a direct signal that industry views an HCP as influential within their TA.

2. **TA-relevant engagement.** Each payment record includes the associated drug, device, or medical supply. Filtering to NSCLC-relevant drugs (osimertinib, pembrolizumab, etc.), hepatology drugs (resmetirom, obeticholic acid, etc.), or rare disease drugs (nusinersen, casimersen, voxzogo, etc.) reveals which HCPs are commercially engaged in our target therapeutic areas.

3. **Geographic and practice-context signal.** Open Payments includes the recipient's state and practice address, providing a layer of identity verification beyond NPPES alone.

4. **Career trajectory.** Year-over-year payment patterns reveal rising vs declining commercial engagement. An HCP whose Open Payments are climbing 30%/year for three years is a rising community DOL.

## Data characteristics — Updated post-parse

**Source:** CMS publishes annually, refreshed January each year.
- Production URL: `https://openpaymentsdata.cms.gov/dataset/`
- Most recent complete program year: **2024 data** (originally published June 2025, refreshed January 2026)

**Files acquired (May 6, 2026):**
- `OP_DTL_GNRL_PGYR2022_P01232026_01102026.csv` (8.21GB / 13.31M source rows)
- `OP_DTL_GNRL_PGYR2023_P01232026_01102026.csv` (14.70M source rows)
- `OP_DTL_GNRL_PGYR2024_P01232026_01102026.csv` (15.39M source rows)
- All three files are from the January 23, 2026 publication, refreshed January 10, 2026
- Total source: 43.39M rows, ~24-30GB across three years

**Schema characteristics (verified post-parse):**
- 91 columns per file
- Zero schema drift across PY2022, PY2023, PY2024 — all three files have identical column lists
- File format: standard CSV with quoted fields, embedded commas in quoted fields, UTF-8 encoding
- Source row counts validated against CMS published statistics

**Data structure (Program Year 2024):**
- General Payments dataset (the one we use): non-research, non-ownership payments — speaker bureau, consulting, food/travel, education, gifts, royalties
- Research Payments dataset: payments tied to research agreements (skipped for v1; covered by ClinicalTrials.gov investigator data)
- Ownership Investment dataset: ownership/investment interests held by physicians (skipped for v1)

**Record volume (verified post-parse):**
- ~13-15M general payment records per year (lower than scoping doc's "14M+" estimate but in the same range)
- 593K-648K distinct physician NPIs per year
- Total physician general payments: ~$3.0-3.2B/year (subset of CMS's ~$13B all-recipient total)

## Filtering scope for FieldMark v1 — Updated post-parse

**Time window:** Most recent 3 program years (2022, 2023, 2024) for trend analysis. Older data available via CMS archive but not needed for v1.

**Payment types:**
- General Payments (full table) — the main signal source
- Research Payments — skip for v1 (captured separately by ClinicalTrials.gov investigator data)
- Ownership Investment — skip for v1 (much smaller cohort, edge case)

**Filters applied at parse time (verified working in `open_payments_filter.py`):**

| Filter | Purpose | Rows filtered (3yr total) |
|---|---|---|
| `Change_Type != "DELETE"` | Defensive — exclude logical deletions | 0 (no DELETE records in Jan 2026 publication) |
| `Covered_Recipient_Type == "Covered Recipient Physician"` | Strict physicians-only for v1 | 14.82M (NPs/PAs/teaching hospitals excluded) |
| `Recipient_Country == "United States"` | US recipients only | 1,367 (US Minor Outlying Islands + foreign physicians) |
| `Covered_Recipient_NPI` is exactly 10 digits | Need NPI for join key | 18,365 |
| `Total_Amount_of_Payment_USDollars > 0` | Skip zero/missing amount | 3 |

**Net pass rate:** 28.56M of 43.39M source rows pass all filters (66%).

**Output expansion:** The parser writes long-format Parquet — one row per payment-drug-slot. CMS source has 5 wide drug slots per record; most general payments have 1 drug attribution, some have 0 (no drug attributed), few have 2-5. Real expansion ratio: 1.24x. Final output: 35.39M long-format rows across three Parquet files (661MB total at snappy compression).

**Empirical findings on Change_Type values (May 6 parse):**
- `UNCHANGED` — ~99% of rows
- `CHANGED` — ~1% (corrections to previously published records)
- `ADD` — small number per year (167-1,327)
- `NEW` — 3 rows in PY2023 only (essentially noise)
- `DELETE` — **zero across all 43.4M rows**

The January 2026 publication appears to issue corrections via CHANGED records superseding prior values rather than DELETE+ADD pairs. The DELETE filter is a no-op against this publication but should remain in place defensively against future republication format changes.

**Empirical findings on Covered_Recipient_Type distribution (May 6 parse):**
- `Covered Recipient Physician` — 9.0M / 9.7M / 9.9M (PY22/23/24)
- `Covered Recipient Non-Physician Practitioner` — 4.2M / 5.0M / 5.5M (NPs, PAs, CRNAs — 30-36% of all payments)
- `Covered Recipient Teaching Hospital` — 30K-40K (negligible)

The non-physician practitioner cohort is large enough to warrant explicit decision: **filter strict to physicians for v1** because (a) NPPES Workstream B ingestion used physician-only taxonomies, so NPs/PAs are not in the FieldMark hcps cohort, and (b) including them adds 30%+ parse volume that won't join to anything. Re-parse cost is ~9 minutes if v1.5 expands cohort to include NPs/PAs.

**Empirical findings on Recipient_Country distribution (May 6 parse):**
- `United States` — 99.99% of rows per year
- `United States Minor Outlying Islands` — few hundred per year (Wake Island, Midway — drop)
- Foreign countries — single-digit to tens of rows each (German, Canadian, Japanese physicians paid by US-applicable manufacturers — drop)

## TA-relevant drug filter (the key product question)

> **Note (May 6):** The drug seed lists below are the v1 starting point as drafted May 5. Empirical observations from the parse run (specifically: market withdrawals affecting drugs like mobocertinib, off-label specialty mismatches like tirzepatide) suggest the lists need refinement based on actual payment distribution data. Refinement is a v1.5 methodology task — see "Methodology notes — drug seed list academic-bias" capture in May 6 decision log.

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
- Mobocertinib (Exkivity) — EGFR exon 20 *[withdrawn October 2023; useful for PY2022 trend only]*
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
- Tirzepatide (Mounjaro/Zepbound, off-label MASH) *[primarily endocrinology signal; specialty cross-check at aggregation]*
- Semaglutide (Ozempic/Wegovy, off-label MASH) *[primarily endocrinology signal; specialty cross-check at aggregation]*

**Rare Disease drug list (initial v1, by sub-TA):**
- *SMA:* Nusinersen (Spinraza), Risdiplam (Evrysdi), Onasemnogene abeparvovec (Zolgensma)
- *DMD:* Casimersen (Amondys 45), Eteplirsen (Exondys 51), Golodirsen (Vyondys 53), Viltolarsen (Viltepso), Ataluren (Translarna), Givinostat (Duvyzat)
- *Sickle Cell:* Voxelotor (Oxbryta - withdrawn 2024), L-glutamine (Endari), Crizanlizumab (Adakveo), Exa-cel (Casgevy), Lovo-cel (Lyfgenia)
- *HAE:* Berotralstat (Orladeyo), Lanadelumab (Takhzyro), C1 esterase inhibitor (Cinryze, Berinert, Haegarda), Icatibant (Firazyr), Ecallantide (Kalbitor)
- *CF:* Elexacaftor/tezacaftor/ivacaftor (Trikafta), Tezacaftor/ivacaftor (Symdeko), Lumacaftor/ivacaftor (Orkambi), Ivacaftor (Kalydeco)
- *Alagille:* Maralixibat (Livmarli), Odevixibat (Bylvay)
- *PFIC:* Odevixibat, Maralixibat
- *Achondroplasia:* Vosoritide (Voxzogo)
- *Pompe:* Alglucosidase alfa (Lumizyme), Avalglucosidase alfa (Nexviazyme)
- *Fabry:* Agalsidase beta (Fabrazyme), Migalastat (Galafold), Pegunigalsidase alfa (Elfabrio)

The drug lists are seed values. Need ongoing maintenance as new approvals happen and as we learn which trade names appear in Open Payments. Some drugs may have multiple naming patterns (Trikafta, Kaftrio, ELX/TEZ/IVA) requiring fuzzy matching.

## Engineering work breakdown — Updated post-parse

**Phase 1 — Data acquisition and parsing — COMPLETE (May 6).**
- ✅ Three program years (PY2022, PY2023, PY2024) downloaded from CMS January 2026 publication
- ✅ Streaming Python parser (`open_payments_filter.py`, 390 lines)
- ✅ Filter chain validated via dry-run before real parse
- ✅ Filtered to US-physician records with valid NPI and non-zero amount
- ✅ Output: three Parquet files at `C:\Users\garre\Desktop\FieldMark\OpenPayments\op_general_pgyr{2022,2023,2024}.parquet`
- ✅ Total output: 35.39M long-format rows (one row per payment-drug-slot), 661MB at snappy compression
- ✅ Wall clock: ~9 minutes (4-5x faster than estimated; pyarrow + NVMe SSD dominate)
- ✅ 0 parse errors across 43.4M source rows

**Phase 2 — TA drug list curation — Pending.**
- Build curated drug list per TA in Supabase (`ta_drug_keywords` table)
- Schema (post-parse revision): see "Schema additions" section below
- Seed with the lists above
- Manual validation against actual Open Payments drug name occurrences in 2024 data

**Phase 3 — Matching and aggregation — Pending (`open_payments_aggregator.py`).**
- Read three Parquet files from disk
- Filter `drug_indicator IN ('Drug', 'Biological')` for TA aggregations (excludes Device/Medical Supply)
- Match Open Payments records to FieldMark HCPs by NPI (after dedup, ~30K+ HCPs have NPIs)
- Aggregate per HCP and per HCP-TA combination
- Write to `hcp_open_payments_summary` and `hcp_open_payments_by_ta` tables

**Phase 4 — Validation — Pending.**
- Validate against canonical HCPs known to receive industry payments (Loomba, Sanyal in hepatology; Garassino, Mok in NSCLC)
- Sample random matched aggregates for plausibility
- Document data integrity issues found

**Total estimated remaining effort:** 1 week of focused engineering for Phases 2-4.

## Schema additions — Updated post-parse

The original scoping doc proposed a single `speaker_bureau_3yr` column and bundled `food_travel_3yr`. Empirical parse data shows speaker bureau is split across two CMS payment-nature categories, food and beverage dominates record count and warrants separate tracking, and honoraria is a meaningful third commercial-influence category not previously accounted for. Schema revised accordingly.

**Empirical findings on Nature_of_Payment distribution (May 6 parse, PY2024):**

| Nature of Payment | Rows PY2024 | Signal type |
|---|---|---|
| Food and Beverage | 11,037,091 | Low — high frequency, low value per event |
| Travel and Lodging | 575,322 | Low — context-dependent |
| Compensation for services other than consulting (non-CE speaker) | 211,020 | High — speaker bureau |
| Consulting Fee | 194,976 | High — direct industry engagement |
| Education | 113,815 | Medium — educational program participation |
| Gift | 27,962 | Low |
| Honoraria | 18,635 | High — one-off speaker engagements |
| Entertainment | 18,214 | Low |
| Royalty or License | 17,441 | High — but extreme outlier skew (single records >$90M) |
| Compensation for serving as faculty/speaker for medical education program (CE speaker) | 14,257 | High — speaker bureau (CE-accredited) |
| Long term medical supply or device loan | 7,783 | Low |
| Grant | 3,566 | Medium |
| Debt forgiveness | 2,232 | Low |
| Acquisitions | 409 | Low |
| Charitable Contribution | 154 | Low |

**Speaker bureau categories combined:** UNION the two CMS speaker categories ("Compensation for services other than consulting..." and "Compensation for serving as faculty or as a speaker for a medical education program") into a single `speaker_bureau_3yr` aggregate column.

**Royalty skew warning:** Single payment records exceed $90M (physician-inventor royalty deals on patented drugs/devices). Total-payment metrics are dominated by royalty outliers. For commercial influence ranking, speaker_bureau + consulting are more discriminating than total_payments. Methodology should flag this caveat.

### `ta_drug_keywords` table

```sql
CREATE TABLE ta_drug_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  drug_name TEXT NOT NULL,
  drug_brand_name TEXT,
  drug_generic_name TEXT,
  is_primary_signal BOOLEAN DEFAULT TRUE,
  -- Forward-looking metadata (populate when v1.5 weight tuning happens):
  launch_year INTEGER,
  withdrawal_year INTEGER,
  market_position TEXT,  -- 'novel' | 'standard_of_care' | 'legacy' | NULL
  expected_recipient_profile TEXT,  -- 'academic_skewed' | 'community_skewed' | 'balanced' | NULL
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ta_drug_keywords_ta ON ta_drug_keywords(therapeutic_area_id);
CREATE INDEX idx_ta_drug_keywords_name_lower ON ta_drug_keywords(LOWER(drug_name));
```

### `hcp_open_payments_summary` table — REVISED post-parse

```sql
CREATE TABLE hcp_open_payments_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL UNIQUE REFERENCES hcps(id),
  npi TEXT,

  -- Lifetime totals (across all payment types, all program years available)
  total_payments_lifetime NUMERIC,
  total_payments_count_lifetime INTEGER,
  distinct_companies_lifetime INTEGER,

  -- 3-year window (PY2022 + PY2023 + PY2024)
  -- "Total" excludes food/beverage and travel — those tracked separately as low-signal
  total_payments_3yr NUMERIC,
  speaker_bureau_3yr NUMERIC,        -- UNION of both CMS speaker categories
  consulting_3yr NUMERIC,
  honoraria_3yr NUMERIC,             -- NEW post-parse — material category not in original schema
  education_3yr NUMERIC,             -- NEW post-parse — educational program compensation
  royalty_3yr NUMERIC,               -- with skew caveat documented in methodology
  food_beverage_3yr NUMERIC,         -- SPLIT post-parse — separate from travel/lodging
  travel_lodging_3yr NUMERIC,        -- SPLIT post-parse — separate from food/beverage

  -- Trend (computed from per-year aggregates)
  year_over_year_trend_pct NUMERIC,
  most_recent_payment_date DATE,

  -- Metadata
  open_payments_calculated_at TIMESTAMPTZ,
  open_payments_version TEXT,
  open_payments_program_years INTEGER[]
);

CREATE INDEX idx_hcp_op_summary_total_3yr ON hcp_open_payments_summary(total_payments_3yr DESC);
CREATE INDEX idx_hcp_op_summary_speaker_3yr ON hcp_open_payments_summary(speaker_bureau_3yr DESC);
CREATE INDEX idx_hcp_op_summary_consulting_3yr ON hcp_open_payments_summary(consulting_3yr DESC);
```

### `hcp_open_payments_by_ta` table

```sql
CREATE TABLE hcp_open_payments_by_ta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps(id),
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),

  -- TA-specific aggregates (filtered to drug_indicator IN ('Drug', 'Biological') AND drug matched in ta_drug_keywords)
  ta_payments_3yr NUMERIC,
  ta_payments_count_3yr INTEGER,
  ta_distinct_drugs_3yr INTEGER,
  ta_distinct_companies_3yr INTEGER,
  ta_speaker_bureau_3yr NUMERIC,      -- speaker bureau specifically for TA-relevant drugs
  ta_consulting_3yr NUMERIC,          -- NEW post-parse — consulting on TA drugs separately
  ta_honoraria_3yr NUMERIC,           -- NEW post-parse — honoraria on TA drugs

  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(hcp_id, therapeutic_area_id)
);

CREATE INDEX idx_hcp_op_by_ta ON hcp_open_payments_by_ta(therapeutic_area_id, ta_payments_3yr DESC);
CREATE INDEX idx_hcp_op_by_ta_speaker ON hcp_open_payments_by_ta(therapeutic_area_id, ta_speaker_bureau_3yr DESC);
```

## Methodological considerations — Updated post-parse

**1. Three-year window vs lifetime.** Three years balances recency (current commercial relevance) with sufficient signal volume. A new community oncologist with one year of payment history would have unstable trend analysis; three years gives a stable view. *Confirmed in scoping; remains the v1 design.*

**2. Inflation adjustment.** $50K in 2022 vs $50K in 2024 are slightly different in real terms. For v1, ignore inflation (changes are small over 3 years). Note as future enhancement.

**3. Payment recency weighting.** Should a $100K speaker bureau payment in 2024 count more than $100K in 2022? Initial v1 design: no recency weighting within the 3-year window; rely on year-over-year trend metric for recency signal. Revisit after seeing data.

**4. Aggregation across multiple companies.** An HCP getting $10K each from 10 different pharma companies is arguably more influential than one getting $100K from a single company (broader industry recognition). Distinct_companies metric captures this.

**5. TA cross-payment.** Some HCPs receive payments tied to drugs in multiple TAs (a thoracic oncologist might receive payments for both NSCLC and SCLC drugs, or a hepatologist for both MASH and PBC). The `hcp_open_payments_by_ta` table allows clean per-TA aggregation.

**6. Name-of-Drug matching subtleties.** Open Payments records may have:
- Brand name only ("Trikafta")
- Generic name only ("elexacaftor/tezacaftor/ivacaftor")
- Partial match ("ELX/TEZ/IVA")
- Misspellings or formatting variants

Matching algorithm should be tolerant — case-insensitive, partial-word matching, with the curated `ta_drug_keywords` table acting as the authoritative reference.

**7. Specialty mismatch.** Some HCPs receive payments for drugs outside their stated specialty. A general internist receiving NSCLC drug payments might be a community oncologist who hasn't updated their NPPES taxonomy. Don't filter by specialty — let the data tell us.

**8. Food and Beverage dominates record count (NEW post-parse).** ~90% of all general payment records are F&B. Mean F&B payment $292 (PY22) dropping to $253 (PY23/24) — most are <$50, a single sales rep lunch. **Track F&B separately and exclude from industry engagement composite.** Including F&B in total payments would dilute speaker bureau / consulting signal. Keeping F&B tracked separately preserves option to use it as a "rep contact frequency" signal in v2.

**9. Drug indicator filter for TA aggregation (NEW post-parse).** The `Indicate_Drug_or_Biological_or_Device_or_Medical_Supply_N` field distinguishes:
- `Drug` — small molecule pharmaceuticals (~6.0M rows/year)
- `Biological` — antibodies, gene therapies, vaccines (~1.9M rows/year)
- `Device` — medical devices (~2.8M rows/year)
- `Medical Supply` — consumables (~80K rows/year)
- empty/None — payments without drug attribution (~870K rows/year, drug_slot=0 in Parquet)

For TA aggregation, filter to `drug_indicator IN ('Drug', 'Biological')`. Excludes Device and Medical Supply since FieldMark's TA framework is pharmaceutical, not device-focused.

**10. Drug-slot=0 records (NEW post-parse).** Payments without drug attribution: speaker fees, general consulting, F&B without specific drug. ~6-8% of payments. Keep in broad payment aggregations (`total_payments_3yr`, `speaker_bureau_3yr`, etc.) but exclude from per-TA aggregations since they have no drug to match.

**11. Royalty skew (NEW post-parse).** Single payment records exceed $90M (physician-inventor royalty on patented drugs). Total-payment metrics dominated by royalty outliers. **For commercial influence ranking in community HCP composite, use speaker_bureau + consulting + honoraria, not total_payments.** Document this as an explicit methodology decision with the underlying data caveat.

## Open methodological questions for design phase

**Q1: How to handle covered recipients without NPI in Open Payments?**
Some Open Payments records list "Teaching Hospital" or "Non-Physician Practitioner" recipients. For v1 community HCP work, we focus on physician recipients with NPIs. **Resolved post-parse:** Filter at parse time excludes these. ~14.8M non-physician rows and ~18K malformed-NPI rows dropped across 3 years.

**Q2: How to handle disputed records?**
Open Payments allows physicians to dispute records. Disputed records have a `Dispute_Status_for_Publication` field. For v1, include disputed but published records (most disputes are resolved without removal). Note this in data docs. **Resolved post-parse:** Disputed records are 0.003-0.005% of total — essentially negligible. Decision to include them holds; flag for transparency in product UI when surfacing individual payment records.

**Q3: What to do with renewal-of-payment delays?**
Some research-related payments can be delayed up to 4 years. Since we're focused on General Payments (not Research Payments), this is mostly not applicable. Skip.

**Q4: How frequently to refresh?**
- CMS publishes annual data on June 30 each year
- CMS refreshes January each year (corrections, late submissions)
- Recommendation: bi-annual refresh (June, January) for v1. Quarterly for v2 if needed.

**Q5: Storage strategy for raw Open Payments data?**
Decompressed CSVs total 30+ GB across 3 years. Decision: **keep raw files** in `C:\Users\garre\Desktop\FieldMark\OpenPayments\` for re-processing if needed. Disk is cheap, reprocessing without re-download is faster.

**Q6 (NEW post-parse): Drug name normalization strategy in aggregator?**
The aggregator joins Parquet `drug_name` to `ta_drug_keywords` for TA classification. Open Payments uses freeform drug naming with brand-name, generic-name, and partial-match variants. Aggregator implementation should:
- Lowercase both sides for case-insensitive match
- Try exact match on `drug_name`, `drug_brand_name`, `drug_generic_name` columns of `ta_drug_keywords`
- Try substring match if exact match fails (e.g., "Tagrisso" matches "OSIMERTINIB (TAGRISSO) 80MG TABLETS")
- NDC code match as secondary signal when drug_ndc is populated
- Log unmatched drug names per TA — review monthly for seed list expansion

**Q7 (NEW post-parse): Speaker bureau category UNION vs separate columns?**
CMS splits speaker compensation into two payment-nature values (CE-accredited vs non-CE). Both signal commercial influence. **Decision: UNION at aggregation time into single `speaker_bureau_3yr` column.** Rationale: from a pharma compliance / MSL targeting perspective, the distinction is operational not strategic — both indicate the HCP is a recognized speaker for the manufacturer.

## Integration with Community HCP ranking

After Open Payments aggregates exist, the community composite from `p0_elevation_community_hcp.md` becomes partially computable:

```
community_composite_score =
  weight_practice_volume * normalized(TA_relevant_patient_volume) +     -- waits for Medicare data
  weight_industry_engagement * normalized(speaker_bureau_3yr_TA_relevant + 0.5 * consulting_3yr_TA_relevant + 0.5 * honoraria_3yr_TA_relevant) +
  weight_group_practice * group_practice_signal +                       -- from NPPES group data
  weight_career_stage * normalized(years_since_NPI_enumeration) +       -- from NPPES
  weight_publication * normalized(existing_publication_composite) ;     -- from existing scoring

weights:
  practice_volume = 0.40
  industry_engagement = 0.30  ← computable after Open Payments aggregator
  group_practice = 0.15
  career_stage = 0.10
  publication = 0.05
```

**Updated industry_engagement formula (post-parse):** Adds honoraria as a third commercial-influence component at 0.5x weight (similar to consulting). Speaker bureau remains the dominant signal (1.0x), with consulting and honoraria as secondary signals. Excludes royalty (skew), education (less direct industry-influence signal), F&B (high frequency / low signal), travel/lodging (context-dependent).

After Phase 2 (Open Payments) we have 30% of the composite computable. After Phase 3 (Medicare) we have 70%. Group practice and career stage are computable from NPPES alone.

## Risks and contingencies — Updated post-parse

**Risk 1: Drug name normalization is harder than estimated.** ~~Open Payments drug naming is freeform text. Real implementation will likely require a multi-week effort to build and validate the curated list against actual data. Time estimate may extend.~~ **Resolved post-parse:** Drug names appear consistently formatted across the three years. Brand and generic name variants are the primary normalization challenge, not malformed entries. Estimated drug normalization effort: 1-2 days, not multi-week.

**Risk 2: NPI coverage in Open Payments.** ~~Some Open Payments records lack NPI — the recipient might be identified by name only. We lose those records. Estimate: 10-20% of records may lack NPI.~~ **Resolved post-parse:** NPI missingness in physician records is 0.04% (~18K rows across 43.4M). Negligible. The 10-20% estimate was conservative.

**Risk 3: TA classification subjectivity.** Is omeprazole a hepatology drug? (Sometimes, in PBC patients.) Is metformin a NSCLC drug? (Some research interest.) Drug list curation requires therapeutic judgment. Initial seed lists need expert review.

**Risk 4: Community HCP coverage gap persists.** Even after Open Payments integration, community HCPs without industry payments are still invisible to the ranking. Pure cash-pay or independent practitioners. Acceptable gap; addressed partially by MSL contributor surfacing in v2.

**Risk 5 (NEW post-parse): Royalty payment skew.** Single-record payments exceeding $90M from physician-inventor royalty deals dominate total-payment aggregations for affected HCPs. Mitigation: use speaker_bureau + consulting + honoraria for commercial influence ranking, not total_payments. Document explicitly.

**Risk 6 (NEW post-parse): F&B as ranking signal in v1.** F&B is excluded from industry engagement composite, but ~90% of payment record volume is F&B. Worth confirming with MSL audience whether F&B frequency (rep-contact intensity) carries useful signal for v2 — distinct from commercial influence but potentially useful for "active prescribers in our territory" segmentation.

## Deliverables when complete — Updated post-parse

1. ✅ Filtered Parquet files for 3 program years of General Payments data — DONE
2. Curated `ta_drug_keywords` table with seed drug lists per TA — Pending
3. ✅ Streaming parser script (`open_payments_filter.py`) — DONE
4. Aggregation script (`open_payments_aggregator.py`) writing to `hcp_open_payments_summary` and `hcp_open_payments_by_ta` — Pending
5. Validation queries for canonical HCPs — Pending
6. Methodology doc section on Open Payments enrichment — Pending (next consolidation pass)
7. Updated priority doc reflecting Phase 2 partial completion — Pending

## Sequencing relative to NPPES

Open Payments work proceeds **after NPPES Workstream A application is complete** (matching existing US HCPs to NPIs). Status as of May 6:
- ✅ NPPES filter and Parquet build (387MB, 7.22M individual active US providers)
- ✅ NPPES Workstream A matcher run (627 Tier 1+2 matches, 1,703 Tier 3 with clinical taxonomies pending decision)
- ✅ NPPES Workstream B ingestion (21,241 community HCPs ingested)
- ✅ HCP deduplication remediation (May 6 dedup run consolidating ~136 duplicate records)
- ⏳ Open Payments aggregator (next, this week)

Workstream B (ingest new community HCPs from NPPES) ran in parallel with Open Payments parsing — they don't depend on each other.
