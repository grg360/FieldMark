# Wednesday May 6 — Tomorrow's Focus

## TL;DR

Three priority blocks tomorrow, in order of importance:

1. **Apply NPPES enrichment to existing HCPs** (cleanup work, ~2 hours)
2. **Open Payments parser and ingestion** (the single biggest value-add for community HCP ranking, ~1 day)
3. **Documentation consolidation** (catches up on drift, ~1-2 hours)

The matcher, ingestion, and download all finished tonight. The infrastructure is in place. Tomorrow is execution work to put the data to use.

## Priority Block 1: Apply NPPES enrichment (start of day)

The 623 Tier 1 + 6 Tier 2 high-confidence NPI matches are sitting in npi_match_proposals waiting to be applied to the hcps table. Plus the 1,703 Tier 3 matches with clinical taxonomies are likely-correct.

**Specific work:**

a. Spot-check 30-50 random Tier 1 matches more carefully than tonight's quick sample (verify name accuracy, state alignment, taxonomy makes sense for HCP context)

b. Apply Tier 1 + Tier 2 matches:
```sql
UPDATE hcps h
SET npi_number = p.npi,
    practice_city = p.npi_practice_city,
    practice_state = p.npi_practice_state,
    practice_zip = p.npi_practice_zip,
    credentials = p.npi_credentials,
    npi_primary_taxonomy = p.npi_primary_taxonomy
FROM npi_match_proposals p
WHERE p.hcp_id = h.id
  AND p.match_status IN ('matched_high', 'matched_medium');
```

c. Decide on Tier 3 application strategy. The 1,703 with clinical taxonomies are high-likelihood real but unverified. Options:
   - Apply automatically with same UPDATE
   - Apply only with additional manual review queue UI (not built yet)
   - Defer entirely

Recommended: Apply Tier 3 with clinical taxonomies AND state populated AND no taxonomy mismatch with HCP's existing TA assignments. That probably gets us another ~1,000 confident matches.

**Outcome:** US NPI coverage moves from 8,605 + 656 (existing in nppes_workstream_b) → ~10,000+. Geographic data populated for ~2,300+ existing HCPs.

**Estimated time:** 1-2 hours including validation.

## Priority Block 2: Open Payments parser and ingestion

This is the single most strategically important workstream. Open Payments is the strongest near-term signal for community HCP ranking. Without it, the 21,241 community HCPs we ingested tonight have no ranking data.

The PY2024 file (8-12GB) downloaded tonight. Sitting at C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2024.csv

**Specific work:**

a. **Write open_payments_filter.py** (similar pattern to nppes_filter.py):
   - Stream-parse the CSV in chunks
   - Filter to: US recipients only, non-zero amount, non-DELETE records, NPI populated
   - Extract relevant columns (NPI, recipient name, state, payment amount, nature of payment, drug name, manufacturer, date)
   - Output filtered Parquet (estimated 1-2GB)

b. **Build ta_drug_keywords table:**
   ```sql
   CREATE TABLE ta_drug_keywords (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
     drug_name TEXT NOT NULL,
     drug_brand_name TEXT,
     drug_generic_name TEXT,
     is_primary_signal BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
   Seed with the drug lists from open_payments_scoping.md (NSCLC: 20 drugs, Hepatology: 15 drugs, Rare Disease: 35+ drugs by sub-bucket).

c. **Write open_payments_aggregator.py:**
   - Match Open Payments records to FieldMark HCPs by NPI
   - Aggregate per HCP: total_payments_3yr, speaker_bureau_3yr, consulting_3yr, distinct_companies, year_over_year_trend
   - Aggregate per HCP-TA: ta_payments_3yr, ta_speaker_bureau_3yr, ta_distinct_drugs (using ta_drug_keywords filter)
   - Write to hcp_open_payments_summary and hcp_open_payments_by_ta tables (schema in open_payments_scoping.md)

d. **Spot-check against canonical HCPs:** Loomba should show substantial speaker bureau payments for hepatology drugs. Sanyal should show NSCLC-adjacent and hepatology-adjacent. Run validation queries.

**Outcome:** Industry engagement signal flows for ~10,000 NPI-matched HCPs. The 30% weight in the community composite score becomes computable.

**Estimated time:** 4-6 hours focused engineering. Possibly extends if drug name normalization is harder than expected.

**Note on PY2022 and PY2023 data:** Tonight only PY2024 was downloaded. For trend analysis (year-over-year), we eventually need 3 years. Decision tomorrow: download PY2022 and PY2023 in parallel with parser development, or proceed with PY2024 only and extend later. Recommended: kick off PY2022 + PY2023 downloads in background early in day.

## Priority Block 3: Documentation consolidation

Eight separate doc files in /mnt/user-data/outputs/ accumulated over today. They need integration into the master priority doc and methodology doc.

**Specific work:**

a. **Update master priority action items doc** with:
   - P0 #8l (NPPES backfill) — complete, mark resolved with details from nppes_backfill_plan.md
   - P0 #8n (Open Payments) — elevated to active workstream, reference open_payments_scoping.md
   - P0 #8o (Community HCPs and DOLs) — strategic priority, reference p0_8o_community_hcps.md
   - P0 #8p (NEW: Medicare Provider Data) — reference medicare_provider_scoping.md
   - Priority restructuring decision — Regional/Community is now #1, reference p0_elevation_community_hcp.md
   - Workstream B completion — 21,241 community HCPs ingested

b. **Update master methodology doc** with:
   - TA framework section from ta_framework_section.md (parallel template, all three TAs)
   - NPPES enrichment methodology from nppes_backfill_plan.md
   - Affiliation profiler v1.1 methodology
   - Tier classification with clinician filter integration
   - New "source" column distinguishing publication_ingestion from nppes_workstream_b cohorts
   - Open Payments scoping (placeholder section pending implementation)
   - Medicare Provider Data scoping (placeholder section pending implementation)

c. **Update May 5 decision log** with the final outcomes (the may5_decision_log_final.md captures this; needs to be merged into master log).

**Estimated time:** 1-2 hours. Mostly transcription and structural integration.

## Lower-priority items (if time permits)

- NSCLC and Rare Disease concept derivation queries (P0 #8m support work)
- Apply locked concept lists to hcp_therapeutic_areas strength_score
- Phase B career enrichment fix (P0 #8j) for first_pub_year accuracy
- Demo flow design — what does the v1 client demo actually look like with two-track product

These can wait. Open Payments is the highest-leverage work after NPPES enrichment is applied.

## Strategic context for tomorrow's work

The Regional/Community track has cohort (21,241 HCPs) but no ranking signal. The Open Payments work directly addresses that gap. After tomorrow's work:

**Track 1 (Rising Stars):** 93,914 publication-derived HCPs ranked via existing methodology. Working today.

**Track 2 (Regional/Community):** 21,241 NPPES-derived HCPs ranked by industry engagement (after Open Payments) and eventually practice volume (after Medicare Provider Data). Practice volume is the bigger signal but requires Medicare data integration.

After Open Payments tomorrow:
- 30% of community composite score computable (industry_engagement weight)
- Combined with NPPES geography and career_stage from enumeration_date, ~55% of community composite computable
- Medicare Provider Data integration adds the remaining 40% (practice_volume weight)
- Then Community HCP tier classification methodology design and validation
- Then v1 launch readiness

## Estimated tomorrow timeline

- **9-11 AM:** Apply NPPES Workstream A matches, validate Workstream B sample (Priority Block 1)
- **11 AM - 2 PM:** Open Payments parser script written and validated (Priority Block 2a, 2b)
- **2-4 PM:** Open Payments aggregator and validation (Priority Block 2c, 2d)
- **4-5 PM:** Documentation consolidation (Priority Block 3)
- **End of day:** Decision on Medicare Provider Data acquisition timing — defer to Thursday or start in parallel?

Realistic: Priority Block 1 might extend beyond 11 AM if Tier 3 application requires careful filtering. Priority Block 2 might extend if drug name normalization in Open Payments is messier than expected. Documentation could slip to Thursday morning.

## Stop signals for tomorrow

If any of these happen, pause and reassess rather than pushing through:

1. Open Payments parser memory issues like the NPPES matcher had — switch to DuckDB-based architecture instead of pandas in-memory
2. Drug name normalization producing high false-positive or false-negative rates — slow down and validate with smaller seed list
3. Database load issues from concurrent workloads — sequence rather than parallelize
4. Validation queries showing unexpected data quality issues — investigate before continuing build

## What we're NOT doing tomorrow

- Hepatology Workstream B ingestion (deferred to Phase 2 once Gastroenterology can be filtered by signals)
- Medicare Provider Data parser (Thursday or later)
- Rising Star track methodology improvements (working as is, lower priority than community track)
- Demo flow design (later this week)
- Frontend or product UI work (after data infrastructure is in place)

## Honest assessment

Tonight's work delivered substantially: 21,241 community HCPs ingested, NPPES infrastructure complete, Open Payments file in hand, eight documentation files drafted, scoring methodology improvements applied to 93,914 HCPs.

Tomorrow's work converts that infrastructure to product-usable signal. The Open Payments integration is the critical path — without it, the Regional/Community track is a list without ranking.

A reasonable Wednesday gets us to: Open Payments fully ingested, all aggregations computed, ranking signal flowing into the Community track. That positions Thursday for Medicare Provider Data and ranking methodology design.

Two productive days from end of Tuesday positions Friday for community composite score validation and the start of demo flow design.
