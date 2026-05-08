# Institution Geographic Enrichment — Workstream Plan

**Author:** Garrett with Claude as technical thought partner  
**Date drafted:** May 7, 2026 (late evening)  
**Status:** New workstream identified during May 7 evening session. To be executed in the days following.

---

## Why this workstream exists

During the May 7 evening session, while building geographic filtering for the Rising Stars track, a significant product gap was discovered:

For the 7,746 HCPs in the Rising Stars cohort:
- 97% have country populated (7,502 HCPs)
- Only 11% have state populated (889 HCPs) — limited to NPPES-enriched HCPs with NPIs
- 32% are US-based (2,445 HCPs) but only 36% of those US-based HCPs have state data

This is a critical limitation. Field MSLs cover geographic territories — typically a state or region. Without state-level filtering, the Rising Stars track cannot serve the field MSL workflow for ~89% of the cohort. The platform's product-market fit for field medical teams depends on closing this gap.

The Community track is unaffected because the 30,093 Community cohort HCPs all have NPIs and were NPPES-enriched today — state coverage is ~99%.

The Established cohort will have the same limitation as Rising Stars when it's classified.

## The data reality

Rising Star HCPs largely don't have NPIs because:
- Many are research-only PhDs/MDs who run labs but don't practice clinically
- 68% of the cohort is international (no US NPIs)
- Junior faculty in research-heavy roles may not have NPIs even if eligible

NPPES enrichment cannot fill this gap because NPPES requires NPIs.

## The opportunity

There are 4,731 unique institutions across the Rising Star cohort. This is a manageable universe. If we can derive state from institution name, we can backfill state for HCPs whose institution maps to a known location.

Per-institution enrichment is dramatically more efficient than per-HCP enrichment because each institution serves an average of ~1.6 HCPs in the cohort. The enrichment cost is bounded by ~5,000 unique institutions, not ~7,700 individual HCPs.

## Layered enrichment approach

Recommended approach is layered — start with free, structured, high-coverage sources and fall back to paid/manual options for the long tail.

### Tier 1: ROR (Research Organization Registry)

Free, structured registry of research organizations. Built specifically for this use case. API at `api.ror.org`.

Coverage estimate: 70-80% of academic/research institutions in our cohort.

Pros: free, no rate limits, structured data, designed for research institution lookup
Cons: clinical-only institutions (e.g., community hospitals with research arms) may be missing

### Tier 2: NPPES Organizations Parquet (already on disk)

We have the 1.9M-organization NPPES parquet from this morning's work at `C:\Users\garre\Desktop\FieldMark\NPPES\nppes_orgs_active.parquet`. Fuzzy match institution names against organization_name_legal.

Coverage estimate: fills 50-70% of the gap left by ROR for US institutions.

Pros: already downloaded, free, no rate limits, structured state data
Cons: fuzzy matching is finicky, won't cover non-US institutions or non-clinical research institutes

### Tier 3: Google Geocoding API

Use Google Maps' Geocoding API for institutions not matched by ROR or NPPES. Paid but generous free tier ($200/month covers ~40,000 lookups).

Coverage estimate: fills another 10-15% of remaining gap, primarily for less-prominent institutions and international ones.

Pros: structured response, designed for address resolution, very reliable
Cons: requires Google Cloud setup, costs (small but non-zero), some queries return ambiguous results

### Tier 4: Manual curation fallback

For the remaining ~5-10% (probably 200-500 institutions), hand-curate a mapping of the most-common edge cases. Likely the institutions used by 5+ HCPs in our cohort that none of the above sources resolved.

## Estimated coverage

If executed cleanly:
- Tier 1 (ROR): 70-80% of institutions resolved
- Tier 1 + Tier 2: 85-90% resolved
- Tier 1 + Tier 2 + Tier 3: 92-95% resolved
- All tiers + manual: 95-99% resolved

For Rising Star HCPs:
- Pre-enrichment state coverage: 11%
- Post-enrichment state coverage: ~85-95% (because most US Rising Stars have findable institutions)

This is the difference between "geographic filtering doesn't really work" and "geographic filtering works for the vast majority of US-based HCPs."

## Schema additions

Add to `hcps` table:
- `institution_state` (text) — derived state from institution name
- `institution_country` (text) — derived country from institution name (for HCPs missing country)
- `institution_geo_method` (text) — 'ror' | 'nppes_org' | 'google_geocode' | 'manual'
- `institution_geo_confidence` (text) — 'high' | 'medium' | 'low'
- `institution_geo_resolved_at` (timestamp)

The application layer should treat `nppes_practice_state` as primary when available, fall back to `institution_state` otherwise. Both contribute to the unified "state" field used in geographic filters.

## Workflow

**Step 1: Build the unique institution list.**

```sql
SELECT 
  institution,
  COUNT(*) AS hcp_count
FROM hcps
WHERE institution IS NOT NULL
  AND institution_state IS NULL
GROUP BY institution
ORDER BY hcp_count DESC;
```

Output: ~4,731 unique institutions ranked by HCP count. Top 100 institutions cover most HCPs.

**Step 2: ROR enrichment script.**

For each unique institution:
1. Query `https://api.ror.org/organizations?affiliation={url-encoded-name}`
2. Parse top match
3. Confidence-score the match (name similarity + country match if known)
4. Extract country, region (state), city
5. Write to a per-institution mapping table

Approach: Build a script `institution_geo_ror.py` modeled after our existing OpenAlex backfill scripts. Same patterns: psycopg, batch writes, checkpoint, retry, progress meter.

**Step 3: NPPES organizations fuzzy matching.**

For institutions not matched by ROR:
1. Load NPPES organizations parquet into memory
2. For each unmatched institution, do fuzzy name match against organization_name_legal
3. Apply confidence threshold
4. Extract state from matched org

Approach: `institution_geo_nppes.py`. In-memory fuzzy match (already have parquet locally).

**Step 4: Google Geocoding for remaining gaps.**

For institutions not matched by ROR or NPPES:
1. Set up Google Cloud project + Geocoding API key
2. Add `GOOGLE_MAPS_API_KEY` to `.env`
3. For each remaining institution, call Geocoding API
4. Parse country, state, city from result
5. Write to mapping

Approach: `institution_geo_google.py`. Same patterns. Rate limit per Google's API specs (50 req/sec, way faster than OpenAlex's 10 req/sec).

**Step 5: Apply institution → HCP backfill.**

UPDATE all HCPs with their institution's resolved state:

```sql
UPDATE hcps h
SET 
  institution_state = i.state,
  institution_country = i.country,
  institution_geo_method = i.method,
  institution_geo_confidence = i.confidence,
  institution_geo_resolved_at = NOW()
FROM institution_geo_lookup i
WHERE h.institution = i.institution
  AND h.institution_state IS NULL;
```

**Step 6: Validation.**

Spot-check 50 random HCPs across the three tiers. Compare derived state against:
- The HCP's actual institution location (Google search the institution)
- For HCPs with NPPES state, compare derived institution_state to NPPES state — they should match for HCPs whose institution IS their practice location

Build a confidence report showing:
- Total resolved
- Distribution by method
- Disagreement cases between NPPES state and institution_state (these are HCPs who practice somewhere different from where they publish)

## Estimated work

- ROR script + run: 2-3 hours
- NPPES organization fuzzy match script + run: 2-3 hours
- Google Geocoding setup + script + run: 2-3 hours
- Apply backfill: 30 min
- Validation: 1-2 hours
- Total: 8-12 hours of focused work

This is one to two days of dedicated work. Could compress to a single day with discipline. Unlikely to land in less.

## Strategic priority

This workstream is now **higher priority than Phase 4 of the publication architecture migration** (pipeline consolidation). The reason: publication architecture is internal infrastructure; geographic enrichment directly enables the field MSL workflow that the platform is built for.

Recommended sequence:
1. Complete Phase 2 + Phase 3 publication backfills first (already in progress)
2. Then institution geographic enrichment (this workstream)
3. Then community composite scoring v1
4. Then frontend filter UI built against real geographic data
5. Phase 4 of publication architecture deferred to v1.5

## Open questions

1. **Should `institution_country` override or supplement existing `country` field?** Many HCPs already have country populated. If our institution-derived country disagrees with the existing value, which wins? Probably existing wins unless it's clearly wrong.

2. **How do we handle multi-location institutions?** "Mayo Clinic" has campuses in MN, AZ, FL. Most Mayo Clinic HCPs are in MN; some aren't. ROR returns the primary location only. We might mis-attribute some HCPs.

3. **What about HCPs at multi-institution affiliations?** "Department of Medicine, Harvard Medical School and Massachusetts General Hospital" — both Harvard and MGH are in MA, so it works out. But edge cases exist.

4. **Should this run before or after the three-cohort classification logic?** Classification depends on career stage signals which depend on publication data which is currently being backfilled. Geographic enrichment is independent — could run in parallel or before.

## Document maintenance

This document represents a workstream plan, not an architectural decision. Once executed, results should be captured in a separate "Geographic Enrichment Results" document with actual coverage numbers, validation findings, and any methodology refinements discovered during execution.
