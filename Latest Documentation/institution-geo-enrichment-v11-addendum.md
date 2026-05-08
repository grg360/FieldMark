# Institution Geographic Enrichment — v1.1 Addendum

**Date drafted:** May 8, 2026  
**Author:** Garrett with Claude as technical thought partner  
**Status:** Supersedes the four-tier approach in the original `institution_geographic_enrichment_plan.md`. The original document remains valid as historical context but is no longer the active plan.

---

## Why this addendum exists

The original geographic enrichment plan (May 7, 2026) described a four-tier layered approach:

- Tier 1: ROR affiliation-string matching
- Tier 2: NPPES Organizations parquet fuzzy match
- Tier 3: Google Geocoding API
- Tier 4: Manual curation

During implementation on May 7-8, validation testing of Tier 1 revealed two problems serious enough to warrant a structural pivot.

### Problem 1: Tier 1 coverage was 62%, not the projected 70-80%

ROR's affiliation matcher returns ranked candidates with confidence scores. The validation script accepted matches via three rules:

- `chosen=true` flag from ROR (the matcher's own pick)
- `consensus_state` (multiple candidates agreeing on the same state)
- `high_score_no_chosen` (single high-scoring candidate)

Even with all three rules in play, clean acceptance capped at ~62% on a 50-HCP sample. The remaining 38% of HCPs had ambiguous matches that would require manual review or a fallback to a different source.

### Problem 2: Tier 2 match quality was qualitatively poor

NPPES organization fuzzy matching produced a 64% match rate, which on paper looked good. But sample-checking the matches revealed false positives at scale: "Department of Hematology" (which appears in many publication affiliation strings) was matching to random Pennsylvania oncology practices because of substring overlap. The 64% match rate was not trustworthy without human review of every match.

This is a known pathology of string-based fuzzy matching on heterogeneous free text. Affiliation strings in publication metadata appear as messy compound forms ("Department of Radiation Oncology, Stanford University School of Medicine, Stanford, CA, USA"). Matching that against either ROR or NPPES required fuzzy logic that produces false positives at scale.

### The strategic concern

False matches in geographic enrichment poison the data more than missing matches do. An MSL filtering for "California" sees an HCP appear in their results because the system fuzzy-matched "Department of Hematology" to a California practice. The MSL trusts the geography signal. They allocate territory effort based on it. The error compounds.

This violates the working principle that **honest gaps are preferable to wrong data**. The four-tier approach as written would have produced impressive coverage numbers and unreliable data underneath.

---

## The pivot

A diagnostic on May 7 evening discovered that publication authorships JSONB already contains structured OpenAlex institution objects with stable ROR IDs embedded:

```json
{
  "authorships": [
    {
      "author": { "id": "https://openalex.org/A5052059601", "display_name": "Rohit Loomba" },
      "institutions": [
        {
          "id": "https://openalex.org/I36258959",
          "display_name": "University of California, San Diego",
          "ror": "https://ror.org/0168r3w48",
          "country_code": "US"
        }
      ]
    }
  ]
}
```

For HCPs with publications (the bulk of the Rising Star cohort), we can extract the ROR ID directly from their most recent publication's authorship record. No string matching. No fuzzy logic. Just structured ID lookups.

**Validation results from a 50-HCP diagnostic sample:** 97.1% of HCPs with publications have a clean ROR ID extractable from authorship JSONB. The remaining 2.9% had publications without structured institution data in their authorship records.

The pivot decision: replace the four-tier string-matching architecture with a three-phase ID-based architecture.

---

## The new architecture (current as of May 8, 2026)

### Phase A: Extract ROR IDs from authorships

A single SQL operation walks each HCP with publications, finds their most recent publication's authorship record, and extracts the first listed institution's OpenAlex ID and ROR ID. Writes to `hcps.openalex_institution_ror_id`.

**Execution result (May 8):** 58,598 HCPs got `openalex_institution_ror_id` populated. 8 errors out of ~58,603 attempts (0.014% error rate). The errors were edge cases in the JSON structure — handled by the script's error path, did not corrupt other writes.

### Phase B: ROR direct lookups for unique institutions

For each unique ROR ID extracted in Phase A, call ROR's direct lookup endpoint (`https://api.ror.org/organizations/{ror_id}`). Parse country, country_code, state_name, state_code, city, latitude, longitude. Write per-ROR to `institution_geo_lookup` (UNIQUE constraint on ror_id).

7,468 unique ROR IDs to look up. Run rate ~1.56 ROR/sec (intentional 5 req/sec ceiling via `time.sleep(0.2)` between requests; network latency drops actual rate). Total runtime ~80 minutes.

Zero errors expected and observed at the time of writing because these are direct ID lookups, not searches.

### Phase C: Backfill state onto hcps via single SQL UPDATE

```sql
UPDATE hcps h
SET 
  institution_state         = i.state_name,
  institution_state_code    = i.state_code,
  institution_country       = i.country,
  institution_geo_method    = 'openalex_authorship_ror',
  institution_geo_confidence = 'high',
  institution_geo_resolved_at = NOW()
FROM institution_geo_lookup i
WHERE h.openalex_institution_ror_id = i.ror_id
  AND h.institution_state_code IS NULL;
```

Single statement. Seconds to run. Idempotent — the `IS NULL` predicate makes re-runs safe.

### Then: derived_state generated column

After Phase C, add a generated column on `hcps` that coalesces NPPES practice state (where they actually practice clinically) with institution state (where they publish from). NPPES wins when present.

```sql
ALTER TABLE hcps ADD COLUMN derived_state text 
  GENERATED ALWAYS AS (
    COALESCE(nppes_practice_state, institution_state_code)
  ) STORED;

CREATE INDEX idx_hcps_derived_state ON hcps (derived_state) 
  WHERE derived_state IS NOT NULL;
```

The application layer queries `derived_state` for geographic filtering. The COALESCE precedence (NPPES first) is correct because:

- An MSL filtering by state cares where the HCP actually sees patients
- NPPES practice address is the canonical source for clinical location
- Institution state from publications can diverge — e.g., an NYU-affiliated researcher who practices clinically at a New Jersey hospital
- When both are present, NPPES is the more accurate signal for MSL workflow

When NPPES is absent (common for international HCPs and research-only academics without NPIs), institution state from publications becomes the fallback.

---

## Estimated coverage

### Rising Star cohort (~7,746 HCPs)

- Pre-enrichment state coverage: 11% (NPPES-only, limited to the small subset of Rising Stars with NPIs)
- Post-Phase-C estimated coverage: **~85-90%** for US-based HCPs
- For HCPs with publications (the bulk of the cohort): **97%+**

### Full cohort (114,829 HCPs)

- 30,089 NPPES-enriched (always have nppes_practice_state)
- 58,598 with `openalex_institution_ror_id` (Phase A)
- After Phase C, the COALESCE in `derived_state` should cover >75% of the full cohort

### Remaining gap

HCPs without publications and without NPIs (estimated ~2-3% of Rising Star cohort, ~25% of full cohort). These are unreachable via the OpenAlex authorship method. Acceptable for v1.

---

## What's NOT done compared to the original plan

The original four-tier plan's Tier 3 (Google Geocoding) and Tier 4 (manual curation) are no longer in the active plan. The OpenAlex authorship pivot makes them unnecessary for the publishing-HCP majority.

For the small remaining gap, we accept the gap rather than pursue the long tail. If post-validation reveals the gap is larger or more strategically important than expected, Tier 3 (Google Geocoding) can be reactivated as a v1.5 enhancement against the unresolved subset (~2-3 thousand HCPs maximum).

Tier 2 (NPPES Organizations fuzzy match) is fully deprecated. The qualitative validation results that showed false positives like "Department of Hematology" matching to wrong practices made it untrustworthy at scale. It is not coming back.

---

## Why this approach is structurally better than the original

1. **No string matching.** ROR IDs are stable identifiers maintained by OpenAlex's curation. No fuzzy logic, no edit distance, no false positives from substring overlap.

2. **Smaller API surface.** 7,468 unique ROR direct lookups vs. the original plan's 4,731 institution string matches plus manual ROR API queries plus NPPES fuzzy matching plus Google Geocoding. Fewer total requests, fewer dependencies, fewer failure modes.

3. **Idempotent and resumable.** Each phase is independently re-runnable. Failure mid-Phase-B does not corrupt anything because writes are per-ROR with UNIQUE constraint on ror_id; re-running Phase B picks up where it left off.

4. **Higher confidence by construction.** All matches are 'high' confidence because we are not estimating — we are looking up by ID. The 'high'/'medium'/'low' confidence taxonomy from the original plan compresses to a single 'high' value because there is nothing to estimate.

5. **Maintainable.** When OpenAlex updates an institution's ROR linkage, our next Phase A run picks it up automatically. With string matching, we would need to re-tune our fuzzy logic against new edge cases.

---

## Open questions deferred

### Multi-campus institutions

Mayo Clinic has campuses in MN, AZ, and FL. ROR returns the primary location only (MN for Mayo). Some Mayo HCPs in AZ or FL may be mis-attributed to MN. Acceptable for v1; revisit if MSL feedback flags it.

Same issue applies to other multi-campus systems (Cleveland Clinic, Kaiser, HCA, etc.). The fix would be HCP-level NPPES practice address override, which `derived_state` already provides via COALESCE — for HCPs whose Mayo Phoenix campus shows up correctly in NPPES, NPPES wins and the campus error doesn't propagate.

### International HCPs

State-level data is not always populated in ROR for non-US institutions. Country coverage is good; sub-national administrative divisions less so. Acceptable for v1 — US state filtering is the primary MSL workflow need.

### Affiliation drift across an HCP's career

The Phase A query extracts the ROR ID from an HCP's *most recent* publication's authorship. For HCPs who recently moved institutions (e.g., a postdoc who became faculty elsewhere), the most recent publication may still show the old institution. The fix is to weight by publication recency when multiple institutions appear across an author's recent publications. Deferred to v1.5 if this becomes a meaningful source of error.

### Confidence stratification

All Phase C writes use `institution_geo_confidence = 'high'`. This is correct given the architectural design (ID-based lookups don't need confidence stratification). But if we later integrate other geographic sources (e.g., Google Geocoding for the long tail), those writes should use lower confidence values, and consumers (filters, scoring) should respect the confidence level. Worth flagging in a future schema update.

---

## Validation cadence

- After Phase C: spot-check Loomba (UCSD, expect California) and Chalasani (Indiana University, expect Indiana). Both should agree on NPPES state and institution state because both work at their primary publishing institutions.
- After `derived_state` migration: count rows with NPPES vs institution disagreement. The disagreement count is interesting — these are HCPs who publish from one place but practice somewhere different.
- After Phase 2 OpenAlex resolution completes (separate workstream, blocked on rate limit): re-run Phase A on the newly-resolved HCPs to extend institution geographic coverage to the previously-unpublished cohort.

---

## What this means for the broader workstream graph

The original geographic enrichment plan said "this workstream is now higher priority than Phase 4 of the publication architecture migration." That priority assessment still holds. Geographic enrichment is the unblocker for state-level MSL filtering, which is the #1 MSL workflow need.

With the OpenAlex authorship pivot, the geographic enrichment workstream completes in roughly 1 day of focused work (Phase A executed, Phase B running, Phase C and migration trivial after) rather than the 8-12 hours estimated for the original four-tier approach — and produces cleaner data.

The freed cycles roll back into composite scoring v1, frontend filter UI, and the v1.1 cohort_classification implementation.

---

## Document maintenance

This addendum is the active reference for geographic enrichment. The original `institution_geographic_enrichment_plan.md` is preserved for historical context and should be read alongside this addendum, with this addendum understood as the current state.

When the broader documentation consolidation pass happens (deferred), this addendum can be merged into a single rewritten `institution_geographic_enrichment_plan_v2.md` that integrates both documents, with the four-tier original archived under a `historical/` subdirectory.
