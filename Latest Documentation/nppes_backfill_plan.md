# NPPES Backfill — Implementation Plan

**Captured:** May 5, 2026 Tuesday evening
**Source:** Strategic priority elevated based on Neurocrine MSL Field Engagement audience input + concrete data state assessment
**Sequencing:** Foundation work for P0 #8o (regional/community HCP coverage). Blocks downstream Open Payments integration, MSL contributor surfacing, and territory-based product features.

## Why this matters

The current FieldMark methodology systematically misses regional and community HCPs because publication-based scoring privileges academic medical centers. Addressing the gap requires connecting FieldMark HCP records to NPPES (the federal NPI registry), which provides geographic and specialty data for every NPI-registered US healthcare provider.

NPPES backfill is the foundation for everything community-HCP-related. Without it, downstream signals (Open Payments cross-reference, territory-based filtering, regional intelligence views) lack the ability to connect back to FieldMark records.

## Current data state

Database snapshot (May 5 Tuesday evening):

- **Total HCPs:** 93,914
- **US-based HCPs (country = 'USA'):** 34,007 (36% of total)
- **NPI-matched US HCPs:** 8,605 (25% of US, 9% of total)
- **NPI-unmatched US HCPs:** 25,402 (75% of US cohort)
  - With state populated: 13,310 (52% of unmatched)
  - Without state: 12,092 (48% of unmatched)

**Implication:** ~25,400 US HCPs are candidates for NPPES backfill matching. Of these, 13,310 have state data which improves matching accuracy substantially. The remaining 12,092 require name + specialty matching without state filter.

The 60,000 international HCPs (~64% of database) are not addressable by NPPES — separate workstreams (international provider directories, country-specific registries) would be required.

## Scope of v1 backfill

**In scope:**
- Match all 25,402 NPI-unmatched US HCPs against NPPES dataset
- Capture practice city, state, zip, primary taxonomy, subspecialty taxonomies, group practice affiliations
- Produce match confidence score per HCP record
- Apply matches above confidence threshold; defer ambiguous matches to manual review queue

**Out of scope (deferred to subsequent workstreams):**
- International HCP enrichment (separate ingestion sources required)
- Re-matching the 8,605 currently-matched HCPs (assume existing matches are correct unless flagged)
- Real-time NPPES updates as providers' practice data changes (monthly batch refresh sufficient for v1)
- License board cross-reference for additional verification

## NPPES dataset characteristics

NPPES is published by CMS (Centers for Medicare & Medicaid Services) and refreshed monthly. The full data file:

- ~7-10 GB compressed CSV
- ~7+ million NPI records (active + deactivated)
- Public domain, no access restrictions, no API rate limits
- Available at download.cms.gov/nppes/NPI_Files.html
- Standard filename pattern: `npidata_pfile_YYYYMMDD-YYYYMMDD.csv`

Key fields for FieldMark backfill:
- NPI number (10-digit identifier, primary key in NPPES)
- Provider Last Name (Legal Name)
- Provider First Name
- Provider Middle Name
- Provider Name Suffix Text
- Provider Credential Text (MD, DO, NP, PA, etc.)
- Provider Business Practice Location Address (street, city, state, zip)
- Provider Mailing Address (often differs from practice)
- Healthcare Provider Taxonomy Code (primary specialty, NUCC code)
- Healthcare Provider Taxonomy Codes 2-15 (subspecialties)
- Authorized Official First Name / Last Name
- Provider Enumeration Date

For FieldMark we primarily need: NPI, name fields, practice location address, primary + subspecialty taxonomy codes, credentials.

## Matching algorithm

The matching task is fuzzy because:
- HCP names in our database come from publication metadata (varied formats, may include initials)
- NPPES uses legal names from NPI registration
- Common names (John Smith, Mary Johnson) are ambiguous without additional filters
- Some HCPs have changed practice locations since NPI registration

**Tiered matching approach:**

**Tier 1 — High confidence (auto-apply):**
Exact match on first name + last name + state + specialty alignment.
- Example: HCP "Rohit Loomba" with state=CA, NSCLC TA → NPPES record with first=Rohit, last=Loomba, state=CA, taxonomy=Internal Medicine/Gastroenterology
- Confidence: 95+
- Apply directly to hcps record

**Tier 2 — Medium confidence (auto-apply with verification flag):**
Exact name match + state match, taxonomy doesn't perfectly align but is in same broad category.
- Example: HCP last_name=Smith, first_name=John, state=TX, NSCLC TA → matches NPPES John Smith in TX with taxonomy=Hematology/Oncology
- Confidence: 80-94
- Apply with verification_status=auto_review

**Tier 3 — Low confidence (manual review queue):**
Name match without state, OR multiple state matches, OR taxonomy mismatch.
- Example: HCP "John Smith" no state, NPPES has 47 John Smith records
- Confidence: 50-79
- Defer to manual review queue, do not apply automatically

**Tier 4 — No match:**
No NPPES record meets minimum confidence threshold. Mark hcp record as `npi_match_attempted=true, npi_match_status=no_match`.

The thresholds and tiers are tuneable. Initial pass uses Tier 1 + Tier 2 auto-apply.

## Expected match yield

Based on the data state:

- **13,310 US HCPs with state:** Expect 70-80% Tier 1 + Tier 2 match rate. Strong matching foundation. Roughly 9,000-10,500 successful auto-applies.
- **12,092 US HCPs without state:** Expect 30-50% Tier 1 + Tier 2 match rate (state filter is the primary disambiguation tool). Roughly 3,500-6,000 auto-applies.
- **Total expected v1 backfill:** 12,500-16,500 newly-matched US HCPs.

After backfill: NPI coverage of US cohort moves from 25% (current 8,605 of 34,007) to approximately 65-75% (estimated 21,000-25,000 of 34,007). Combined with state data captured during matching, the platform's regional/territory intelligence becomes feasible.

## Engineering work breakdown

**Phase 1 — Data acquisition and preparation (1-2 days):**
- Download current NPPES data file from CMS
- Parse NPI Number, Provider Name fields, practice address, taxonomy codes into structured staging table
- Build indexes on (last_name, first_name, state) and (last_name, first_name) for matching queries
- Validate row count and field completeness against published NPPES statistics

**Phase 2 — Matching pipeline (3-5 days):**
- Build Python script that iterates unmatched US HCPs, queries NPPES staging table per HCP
- Implement tiered matching algorithm with confidence scoring
- Output match proposals to a `npi_match_proposals` table similar to the trial_investigator_match_proposals architecture used for Stage 2 trial matching
- Spot-check matched proposals against canonical HCPs (Loomba, Sanyal, etc.)

**Phase 3 — Apply matches (1 day):**
- Apply Tier 1 + Tier 2 matches to hcps table (npi_number, npi_taxonomy, npi_specialty, city, state, zip)
- Update country='USA' for all matched records (catches any country-null US HCPs)
- Move Tier 3 matches into manual review queue table for later resolution
- Mark Tier 4 (no match) HCPs with npi_match_status='no_match'

**Phase 4 — Validation (1-2 days):**
- Validate match quality against gold cohort (known HCPs with known NPIs)
- Sample random matched records for manual verification
- Identify and resolve systematic errors (e.g., missing taxonomy mapping, state code issues)
- Document match yield and confidence distribution

**Phase 5 — Documentation and runbook (0.5 day):**
- Add to methodology doc: NPPES enrichment section, taxonomy code mapping, match algorithm description
- Add to priority doc: P0 #8l update marking NPPES backfill complete
- Create runbook for monthly NPPES refresh

**Total estimated effort:** 1.5-2 weeks of focused engineering. Realistic completion: end of next week if started immediately, mid-following week with normal interruptions.

## Schema additions to hcps table

Add the following columns if not already present:

- `npi_match_status TEXT` — one of: 'matched_high', 'matched_medium', 'review_pending', 'no_match', 'not_attempted'
- `npi_match_confidence NUMERIC` — confidence score 0-100
- `npi_match_calculated_at TIMESTAMPTZ` — when matching last ran
- `practice_city TEXT` — from NPPES (separate from any existing city field which may be from publications)
- `practice_zip TEXT` — from NPPES
- `practice_address TEXT` — full street address from NPPES (for territory mapping)
- `npi_credentials TEXT` — credential text (MD, DO, NP, PA, etc.) — addresses the current near-empty credentials field
- `npi_taxonomy_codes TEXT[]` — array of all taxonomy codes (primary + subspecialties)

Existing columns (`npi_number`, `npi_taxonomy`, `npi_specialty`, `state`, `country`) get populated/updated for matched records.

## Downstream dependencies

This backfill is sequencing prerequisite for:

1. **Open Payments integration (P0 #8n).** Open Payments data is keyed on NPI. Without expanded NPI coverage, Open Payments cross-reference identifies industry-engaged HCPs only for the current 8,605 NPI-matched cohort.

2. **Territory-based product features.** Filtering rising stars by state, region, or distance from MSL home territory requires the address data NPPES provides.

3. **Credential-based filtering.** The existing `credentials` column on hcps is essentially empty (1 of 93,914 rows populated). NPPES credential text addresses this — NPI-matched HCPs gain credentials data, enabling MD/DO vs PhD vs other clinician filtering.

4. **MSL contributor surfacing.** When MSLs flag community HCPs, validating their identity benefits from NPI cross-reference.

5. **Specialty-based TA assignment refinement.** NPPES taxonomy codes provide an additional signal for therapeutic area assignment beyond OpenAlex publication concepts. An HCP with primary taxonomy "Hepatology" who has minimal hepatology publications could still be tagged into the Hepatology TA based on their specialty-of-record.

## Open methodological questions

**Question 1: Multiple NPIs per HCP.** Some physicians have multiple NPIs (group affiliation NPI vs individual NPI, for example). Decision: capture the individual NPI (entity_type_code = 1 in NPPES). Group NPIs (entity_type_code = 2) are not relevant for HCP-level matching.

**Question 2: Deactivated NPIs.** NPPES includes records for HCPs whose NPIs have been deactivated (retired, deceased, license revoked). Decision: filter to active NPIs only for matching, but capture the deactivation date if matched against a historical record so we can flag retired HCPs in the platform.

**Question 3: Out-of-state practice.** Some HCPs practice in multiple states or have moved since NPI registration. The address in NPPES may not be current. Decision for v1: trust NPPES address as currently registered; flag in v1.5 with confidence indicators when address is older than X years.

**Question 4: Provider name variations.** OpenAlex publication metadata sometimes uses different name formatting than NPI registration (initial vs full name, hyphenated vs separated). Matching algorithm must handle: middle initial inclusion/exclusion, accented character normalization, hyphenated last name variants. Tier 2 matching loosens these constraints.

**Question 5: Common names without disambiguators.** "John Smith" or "Mary Johnson" without state will produce many candidates. Decision for v1: defer to manual review queue rather than guessing. Subsequent versions can use additional signals (publication co-authors, hospital affiliations from publications) for disambiguation.

## Alignment with existing P0 items

This backfill plan is the implementation detail for P0 #8l (HCP ingestion expansion — state coverage gap caps trial matching at 10%). The plan addresses the underlying data gap rather than working around it.

P0 #8o (regional/community HCPs and DOLs) depends on this work. The community HCP intelligence layer cannot be built without NPI-keyed geographic and specialty data.

P0 #8n (Open Payments) depends on this work. Open Payments cross-reference value scales with NPI coverage.

P0 #8k (clinician filter precision) benefits from this work. NPPES credentials field populates the currently-empty credentials column, providing an authoritative MD/DO/NP/PhD distinction beyond the affiliation-string heuristic.

## Decision needed

Garrett to confirm sequencing:

**Option A:** Start NPPES backfill immediately as next workstream, treating it as v1 launch dependency. Compresses other v1 cleanup work timeline by 2-3 weeks.

**Option B:** Complete current Tuesday cleanup (clinician filter integration into tier classification, NSCLC and Rare Disease concept lists) first, then NPPES backfill. Maintains sequencing of in-flight work, NPPES starts next week.

**Option C:** Run NPPES backfill in parallel with continuing cleanup work. Requires the engineering focus to split, but compresses overall timeline.

Per Garrett's stated direction May 5 Tuesday evening: "I want to prioritize regional/community immediately." Recommended interpretation: Option B — complete what's in flight (we're hours from finishing the affiliation profiler reclassification, then a few hours of integration), then NPPES backfill becomes the primary workstream.
