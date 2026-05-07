# P0 — HCP Deduplication: Same physical person, multiple hcps records

**Captured:** May 6, 2026 Wednesday afternoon  
**Source:** Surfaced by NPI matching application work. ~322 NPIs proposed for multiple hcps records by the matcher.  
**Severity:** P0 data quality issue. Blocks ~52% of Tier 1+2 NPI match application.

## Problem statement

Some physical HCPs are represented by 2-4 different hcps records in the FieldMark database. Each record has the same physical person's data but different `id` UUIDs, often slightly different name formats from OpenAlex disambiguation.

Pattern observed today (May 6 application of Workstream A NPI matches):

- Of 623 Tier 1 + 6 Tier 2 high-confidence NPI matches identified by the matcher
- 287 (46%) are truly clean — single hcps record per physical person
- 322 (52%) cannot be applied because the NPI either already exists in hcps (from a prior record) or is being proposed for multiple hcps records simultaneously
- The remaining 14 are accounted for in conflict overlap

Specific example: NPI 1720137094 has 4 different hcps records pointing to it (likely the same physical person publishing under "Mark C Walters", "Mark Walters", "M Walters", "Mark C. Walters" or similar variants).

## Root cause

Two distinct mechanisms create duplicates:

**1. OpenAlex authorship disambiguation fragmentation.** OpenAlex assigns separate author IDs when name format varies. Each becomes a distinct hcps record during publication ingestion. We observed this pattern repeatedly throughout May 5 work — Tony Mok in 6 rows, Caicun Zhou in 11 rows, William Lumry in 7+ rows in our database.

**2. NPPES Workstream B ingestion overlap.** Last night's community HCP ingestion added 21,241 NPPES-derived records. Some of those NPIs match physical people who already had publication-derived records in our database. The Workstream B insert checked for NPI uniqueness (caught most duplicates) but couldn't catch cases where the existing publication-derived record had no NPI.

The combination produces a layered problem:
- Same physical person → multiple OpenAlex author IDs → multiple hcps records
- Sometimes one of those records was already ingested via NPPES Workstream B with NPI populated
- NPI matcher correctly identifies the NPI for the publication-derived records
- But application creates unique constraint violations because NPI is already in use

## Scope assessment

Conservative estimates from observed patterns:
- ~322 conflicts among Tier 1+2 matches alone
- Total in-database duplicates likely 3,000-8,000 across all 115,155 HCPs
- Concentrated in HCPs with: foreign-born names, hyphenated names, names with middle initials, unusual transliterations

We've never run a comprehensive duplicate detection pass. Number could be substantially higher than 8,000.

## Why this matters strategically

**Without deduplication:**
- ~50% of Workstream A NPI matches are blocked from application
- Rising Star scores fragmented across 2-4 records per physical person — diluting their actual prominence
- Community HCP ranking will face same fragmentation when Open Payments data flows
- Demo will show duplicate names with different scores
- Trust signal is broken — MSL viewing the platform will see duplicates

**With deduplication:**
- All NPI matches applicable
- Scoring consolidates correctly per physical person
- Open Payments and Medicare data flow to the canonical record
- Demo is clean

Deduplication is now blocking the strategic priority work (community HCP ranking signal flow).

## Approach options

**Option A: NPI-anchored merge.** For each NPI conflict:
1. Identify all hcps records for that NPI (existing + matcher proposals)
2. Pick the canonical record (priority: NPPES Workstream B record if exists with NPI; otherwise highest-scored publication record)
3. Merge data from other records into canonical: combine publications, hcp_therapeutic_areas, scoring history
4. Update foreign keys in dependent tables (publications.hcp_id, hcp_scores.hcp_id, hcp_therapeutic_areas.hcp_id, npi_match_proposals.hcp_id, etc.)
5. Delete the non-canonical records

**Option B: Soft-merge with canonical_hcp_id pointer.** Don't delete duplicates. Add a `canonical_hcp_id UUID NULL` column referencing the master record. Queries filter to WHERE canonical_hcp_id IS NULL OR canonical_hcp_id = id. Less destructive but more complex querying.

**Option C: Defer until product UI exists.** Show all duplicates in product UI, let users (MSLs) flag duplicates for manual review. Crowdsourced deduplication. Not viable without a UI.

**Option D: Name-similarity dedup pass FIRST, NPI dedup SECOND.** Do a comprehensive name+state similarity dedup across the full 115K cohort to find pairs/groups that look like the same person, manually verify, merge. Then NPI matching becomes cleaner.

## Recommended approach

**Option A (NPI-anchored merge) is the right structural answer.** It produces clean canonical data and unblocks downstream work. Estimated effort: 1-2 weeks engineering depending on scope.

Phasing:
- **Phase 1 (today/tomorrow):** NPI-anchored merge for the 322 conflicts surfaced by Workstream A matching. Focused, bounded, unblocks NPI application.
- **Phase 2 (this week):** Broader NPI-anchored merge across all NPI duplicates in database (likely 1,000-3,000 cases beyond Workstream A).
- **Phase 3 (next week or later):** Name-similarity dedup pass for HCPs without NPIs. Larger scope, more uncertain.

## Implementation considerations

**Foreign key cascade:** When merging records, all dependent tables need updates:
- `publications.hcp_id` — multiple publications point to the duplicate records
- `trial_investigators.hcp_id` — same issue
- `hcp_therapeutic_areas.hcp_id` — multiple TA assignments per physical person
- `hcp_scores.hcp_id` — scoring fragmented
- `npi_match_proposals.hcp_id` — matching proposals
- Any other foreign key references

**Score reconciliation:** When a publication-derived record (with scoring) merges with a Workstream B record (with NPI), the scoring should preserve. Means UPDATE the canonical record's score fields to whatever the publication-derived record had, then delete the Workstream B record.

OR (alternate logic): Keep the NPI-bearing record as canonical (Workstream B has cleaner data structure), copy the publication-derived data into it, then delete the publication-derived record. This means scoring history needs to migrate carefully.

**TA assignment merging:** If publication-derived record is in Hepatology TA and Workstream B record is in Rare Disease TA, the merged record should be in both. UNION the hcp_therapeutic_areas rows.

**Affiliation classification preservation:** Publication-derived records have v1.1 affiliation profiles based on real publications. Workstream B records have stub profiles based on taxonomy filter. Always preserve the publication-derived classification.

## Decision needed

Garrett to confirm:
1. Approve Phase 1 (focused NPI dedup on 322 conflicts)?
2. Approve Phase 2 (broader NPI dedup) as next workstream after Phase 1?
3. Defer Phase 3 (name-similarity dedup) until later?
4. Apply the 287 truly-clean NPI matches now, or wait for full dedup design?

Per Garrett's stated direction May 5 evening: "We have enough noise in our database." Strict deduplication aligns with that direction.

## Files to update

When dedup methodology is locked:
- Master methodology doc (add deduplication section)
- Master priority doc (mark this P0 with status)
- Affected scripts: any future ingestion script needs dedup-aware logic to avoid creating new duplicates

## Adjacent priority items

- P0 #8m (TA cross-tagging cleanup) — affected by deduplication. After dedup, fewer hcps records means cleaner TA assignment counts.
- Open Payments integration (this week) — needs deduplication first or inherits the duplicate problem
- Medicare Provider Data integration — same issue

This deduplication work is now blocking three downstream workstreams. Priority elevated accordingly.
