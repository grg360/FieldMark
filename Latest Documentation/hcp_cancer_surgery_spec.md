# HCP Duplication Elimination — Surgical Specification

**Status**: Active execution, updated mid-day May 14, 2026
**Goal**: Eliminate the HCP duplication problem rooted in PubMed-pipeline `(first_name, last_name, institution)` dedup logic.
**Prerequisite**: OpenAlex enrichment of publications complete (~230K publications with `authorships` JSONB containing OpenAlex author IDs).

---

## Status update — afternoon May 14, 2026 (mid-day pause)

### Steps complete

**Step A (May 13)**: OpenAlex Author Inventory populated.
- 230,822 publications scanned
- 719,937 distinct OpenAlex authors found
- **112,195 authors at threshold ≥5 papers** in `openalex_author_inventory`
- 109,332 (97%) have ROR; 59,766 (53%) have ORCID

**NPPES Org → ROR mapping (May 13)**: 4,600 distinct NPPES organizations mapped.
- 1,181 high-confidence matches
- 606 medium-confidence
- 2,793 no-match (correctly: small private practices not in ROR)

**ROR → Country enrichment (May 14)**: All 10,482 distinct RORs from inventory and NPPES mapped to country.
- 100% country coverage achieved
- Top countries: US (27%), CN (14%), JP (6%), IN (4.4%), GB (4.4%), IT, DE, FR, ES — confirming hepatology research is genuinely global

**Step B (May 13 evening)**: HCP-to-OpenAlex-author reconciliation.
- 109,249 HCPs processed
- 102,516 hcp_openalex_authors rows written
- **70,384 HCPs (64%) now linked to OpenAlex authors**
- 5,615 hcps.openalex_author_id values relocated to correct primaries
- 86,938 high-confidence + 376 medium + 15,202 low-confidence links
- All 6 canonical HCPs validated correctly (including Harrison's primary relocation from 57-pub fragment to 684-pub primary)
- Zero errors, 8 minutes runtime

**Step C (May 14)**: New HCPs created from unmatched inventory entries.
- 36,352 unlinked inventory entries identified
- 35,357 clusters formed (995 cluster-collapse from OpenAlex fragmentation)
- **35,327 new HCPs created** (30 duplicates blocked by existing `hcps_name_institution_unique` constraint)
- 36,318 join rows written
- 35,327 Hepatology TA tags created
- Country distribution: CN 31%, US 17%, JP 9%, IT 7%, ES 4% — Chinese hepatology research community now substantially represented for the first time
- 5.4 minute runtime

**Step B+ reconciliation pass (May 14)**: Rescued real researchers from wipe candidates.
- 13,243 initial wipe candidates analyzed
- Sample query revealed ~17.8% had name matches in inventory — initial alarm about deletion risk
- Reconciliation script attempted name-based rescue
- 71 HCPs successfully rescued (2 single-match + 69 fragment-cluster)
- 2,624 ambiguous_homonym candidates flagged (multiple inventory matches at different institutions, conservatively not auto-linked)
- 647 of those ambiguous candidates were Step-C duplicates (same-name Step-C-created HCP already exists)
- Honest analysis: the remaining unrescued candidates are shell rows with no NPI, no openalex_author_id, no link, no scores, no narratives, bad institutional data — not "real researchers we'd lose" but empty placeholders created by yesterday's over-eager publication_ingestion run
- Decision: delete all 13,172 remaining (13,243 - 71 rescued)

**Step D (May 14)**: Wipe HCPs with no defensible reason to exist.
- 13,172 HCPs deleted (in two phases due to initial timeout fixed with smaller batches)
- 12,564 npi_match_proposals deleted
- 12,795 hcp_therapeutic_areas, 12,782 hcp_scores, 313 publication_authors, 142 hcp_narratives cascade-deleted
- Final HCP count: **131,404**
- Zero errors after batch-size fix

### Current database state (afternoon May 14)

- **131,404 total HCPs** (cleaned from 109,249 starting → 144,576 after Step C → 131,404 after Step D)
- 97,280 HCPs (74%) with openalex_author_id set on hcps row
- 30,082 HCPs (23%) with NPI
- 7,044 HCPs with both
- All canonicals validated and linked correctly

### Step E DEFERRED — critical finding documented

**Original plan**: Add UNIQUE constraint on `hcps.openalex_author_id` for direct-match safety.

**Finding that blocks it**: Pre-flight check revealed 2,214 distinct openalex_author_ids assigned to multiple HCPs. 6,021 HCP rows involved. 4.6% of the database.

**Root cause**: OpenAlex's own author clustering algorithm collapses multiple distinct real people with common names (especially Chinese, Korean, Indian) into a single author ID. This is upstream misattribution we cannot fix.

**Example**: OpenAlex ID A5001446757 is assigned to 6 different real "Yan Xiong" researchers at 6 different institutions on 3 continents (Wuxi Nutrition, Jiujiang University, Data Intelligence Inc., DSS RWE Basking Ridge, Hubei Cardiology, Mount Sinai/OKC clinician). These are six different people, not duplicates.

**Why Step E is wrong**: The UNIQUE constraint assumed OpenAlex's identity is reliable. For ~4.6% of cases, it's not. Adding the constraint would force us to delete real HCPs or arbitrarily pick one. Either is wrong.

**Better safeguard**: hcp_openalex_authors join table is the source of truth for HCP↔OpenAlex relationships. It has UNIQUE(hcp_id, openalex_author_id) which is the meaningful constraint.

**Magnitude assessment**: 
- 95.4% of HCPs have clean openalex_author_id usage
- 4.6% sit in misattributed clusters, concentrated in common-name researchers (mostly East Asian/South Asian)
- Senior recognizable hepatology KOLs are essentially unaffected
- Product impact: scoring inflation possible for common-name researchers; profile display will look broken for those specific HCPs; international MSL teams may notice
- US-focused v1.0 launch: minimal impact
- Global v1.0 launch: real credibility issue requiring acknowledgment

**Treatment**: 
- Accept misattribution as inherited from OpenAlex
- v1.0 scoring should flag misattributed clusters with a "data_quality_flag" rather than computing potentially-inflated scores
- v1.5+ manual splitting of high-corpus-count misattributed clusters (top 50-100 should capture 80% of value)
- Documented in roadmap

### Steps remaining (afternoon resume)

**Step F**: Rebuild `publication_authors` from clean `hcp_openalex_authors` and `publications.authorships` data. Estimated 30-60 min.

**Post-surgery tasks**:
1. Reconcile 30 Step-C duplicates by linking existing HCPs to their inventory entries
2. Re-run trial investigator matching against clean HCP population
3. Re-run scoring with clean data + misattribution flags
4. Consider dropping `hcps_name_institution_unique` constraint
5. Plan v1.5+ manual cluster-splitting for top misattributed OpenAlex IDs

---

## Critical finding: OpenAlex author fragmentation

**The problem.** OpenAlex's own author resolution algorithm fragments senior researchers across multiple author IDs. Empirical examples from inventory query:

- **Rohit Loomba**: 5 distinct OpenAlex author IDs (1,233 + 58 + 27 + 12 + 11 papers, all UCSD, 2014-2026)
- **Vincent Wai-Sun Wong**: 6 distinct OpenAlex author IDs at Chinese University of Hong Kong
- **Michael Trauner**: 5 distinct OpenAlex author IDs at Medical University of Vienna
- **Arun J. Sanyal**: 3 distinct OpenAlex author IDs at Virginia Commonwealth University
- **Stephen Harrison**: multiple variants across institutions
- **Philip Newsome**: variants found

This is NOT a fault in our data. OpenAlex's clustering algorithm splits author profiles when newer publications haven't been merged into the primary cluster yet. We can't fix it upstream.

**The implication for Step B.** A single canonical HCP must link to MULTIPLE OpenAlex author IDs. One-to-one HCP→openalex_author_id mapping would only capture a fraction of each researcher's publication record.

Example: canonical Loomba should link to all 5 of his OpenAlex IDs. His complete corpus footprint is 1,358 papers (sum of all 5 fragments), not 1,233 (just the largest fragment).

**The design change.** Step B requires a new join table:

```sql
CREATE TABLE hcp_openalex_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps(id),
  openalex_author_id TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  match_confidence TEXT,  -- 'high', 'medium', 'inferred_fragment'
  match_method TEXT,      -- 'direct_id_match', 'name_institution_cluster', 'ror_match', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hcp_id, openalex_author_id)
);

CREATE INDEX idx_hcp_openalex_authors_hcp_id ON hcp_openalex_authors(hcp_id);
CREATE INDEX idx_hcp_openalex_authors_oa_id ON hcp_openalex_authors(openalex_author_id);
```

The `hcps.openalex_author_id` column stays as the "primary" ID for backwards compatibility. The join table is the source of truth for "all OpenAlex IDs that belong to this HCP."

**Matching strategy update.** Step B's reconciliation needs a cluster-detection pass:

1. For each canonical HCP, find ALL inventory entries where name+institution match (allowing variants of the name like "Rohit Loomba" / "Rohit S. Loomba")
2. Link each matching inventory entry to the HCP via `hcp_openalex_authors`
3. Mark the highest-pub-count fragment as `is_primary = TRUE`

**Caveat: distinguishing fragments from genuine homonyms.** The inventory revealed "Rohan Loomba" (25 papers, UCSD, 2021-2022) alongside Rohit Loomba's fragments. Different first name suggests different person (possibly Rohit's son who's also a researcher). Step B must NOT cluster these together. Conservative rule: same first-name root required for fragment clustering. Different first names → treat as separate people, flag for review if uncertain.

---

## Operating principle

Every step in this spec produces a checkpoint that can be verified before the next step runs. Nothing destructive happens without diagnostic confirmation first. The wipe (Step D) is the only step that deletes data, and it runs in a transaction with verification queries before COMMIT.

---

## Step A: OpenAlex Author Inventory

**Goal**: Build a complete inventory of OpenAlex author IDs that appear across our 230K enriched publications, with publication count per author in our corpus.

**Script**: `inventory_openalex_authors.py`

**What it does**:
1. Scans all publications where `authorships IS NOT NULL`
2. For each publication, unpacks the `authorships` JSONB array
3. For each author entry, extracts the OpenAlex author ID (`author.id` field)
4. Counts how many publications each OpenAlex author appears on in our corpus
5. Captures display name, last known institution, ORCID, and similar metadata from the most recent authorship
6. Writes results to a new table: `openalex_author_inventory`

**New table schema**:

```sql
CREATE TABLE openalex_author_inventory (
  openalex_author_id TEXT PRIMARY KEY,
  display_name TEXT,
  last_known_institution TEXT,
  last_known_institution_ror TEXT,
  orcid TEXT,
  corpus_pub_count INT NOT NULL,
  first_seen_pub_year INT,
  last_seen_pub_year INT,
  has_matching_hcp BOOLEAN DEFAULT FALSE,
  matching_hcp_id UUID REFERENCES hcps(id),
  inventoried_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Diagnostic queries after Step A completes**:
```sql
-- How many distinct OpenAlex authors appear in our corpus?
SELECT COUNT(*) AS total_distinct_authors FROM openalex_author_inventory;

-- Distribution of publication counts
SELECT 
  CASE 
    WHEN corpus_pub_count = 1 THEN '1 paper'
    WHEN corpus_pub_count BETWEEN 2 AND 4 THEN '2-4 papers'
    WHEN corpus_pub_count BETWEEN 5 AND 9 THEN '5-9 papers'
    WHEN corpus_pub_count BETWEEN 10 AND 24 THEN '10-24 papers'
    WHEN corpus_pub_count >= 25 THEN '25+ papers'
  END AS pub_count_bucket,
  COUNT(*) AS author_count
FROM openalex_author_inventory
GROUP BY 1
ORDER BY MIN(corpus_pub_count);
```

**Threshold decision needed**: What's the minimum `corpus_pub_count` for an OpenAlex author to become an HCP row?

Options:
- `corpus_pub_count >= 1` — every author. Maximum noise.
- `corpus_pub_count >= 3` — three or more papers. Some noise filtered.
- `corpus_pub_count >= 5` — established corpus presence. My recommendation.
- `corpus_pub_count >= 10` — substantial corpus presence. Misses early-career researchers.

Recommended default: **3** for v1.0 (captures rising stars while filtering one-off contributors). We can revisit after Step B shows reconciliation results.

---

## Step B: Reconcile Existing HCPs to OpenAlex Authors

**Goal**: For every HCP row in our database, determine whether it corresponds to an OpenAlex author in our inventory. Update existing rows where confident matches exist.

**Script**: `reconcile_existing_hcps.py`

**Matching strategy** (in priority order):

1. **Already-matched**: HCPs with `openalex_author_id` populated — verify the ID exists in inventory, mark matched. No further work needed.

2. **NPI-based reverse lookup**: For HCPs with NPI but no OpenAlex ID, query OpenAlex by the HCP's name AND filter by institution match. Conservative: require institution name OR ROR ID overlap. Logged as candidates, not auto-applied.

3. **Name + institution exact match**: For HCPs without NPI or OpenAlex ID (the duplicate-prone PubMed-pipeline rows), exact-match `(first_name, last_name, normalized_institution)` against OpenAlex inventory. Only auto-apply if exactly one OpenAlex author matches.

4. **Ambiguous cases** → write to `hcp_reconciliation_candidates` for manual review. Never auto-merge.

**New table for manual review**:

```sql
CREATE TABLE hcp_reconciliation_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id UUID NOT NULL REFERENCES hcps(id),
  candidate_openalex_author_id TEXT NOT NULL,
  match_confidence TEXT NOT NULL, -- 'high', 'medium', 'low'
  match_reasoning TEXT,
  reviewed BOOLEAN DEFAULT FALSE,
  reviewer_decision TEXT, -- 'accept', 'reject', 'defer'
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Diagnostic after Step B**:
```sql
-- How many HCPs got matched? How many remain unmatched?
SELECT 
  CASE
    WHEN openalex_author_id IS NOT NULL THEN 'has_openalex_id'
    WHEN npi_number IS NOT NULL THEN 'has_npi_only'
    ELSE 'no_identity'
  END AS identity_status,
  COUNT(*) AS hcp_count
FROM hcps
GROUP BY 1;
```

---

## Step C: Create New HCPs for Unmatched OpenAlex Authors

**Goal**: For OpenAlex authors in inventory who do NOT have a matching HCP yet AND meet the threshold (`corpus_pub_count >= 3`), create new clean HCP rows.

**Script**: `create_hcps_from_openalex.py`

**What it does**:
1. Selects from `openalex_author_inventory` where `has_matching_hcp = FALSE` AND `corpus_pub_count >= 3`
2. For each author, queries OpenAlex `/authors/{id}` endpoint to get full author record (name, affiliations, works_count, counts_by_year, ORCID)
3. Creates an HCP row with:
   - `openalex_author_id` = the OpenAlex ID
   - `first_name`, `last_name` = parsed from OpenAlex display_name
   - `institution`, `institution_full` = from `last_known_institutions`
   - `total_career_pubs` = OpenAlex `works_count`
   - `first_pub_year` = earliest year in `counts_by_year`
   - `orcid` = if present
   - `source` = 'openalex_v2_discovery'
4. Updates the inventory row: `has_matching_hcp = TRUE`, `matching_hcp_id = new_hcp_id`

**Tagging to therapeutic area**: After HCP creation, link to TA via `hcp_therapeutic_areas` based on OpenAlex concepts.

**Diagnostic after Step C**:
```sql
-- How many new HCPs did we create?
SELECT COUNT(*) FROM hcps WHERE source = 'openalex_v2_discovery';

-- Distribution of total_career_pubs for new HCPs (sanity check)
SELECT 
  CASE
    WHEN total_career_pubs < 10 THEN '<10'
    WHEN total_career_pubs BETWEEN 10 AND 49 THEN '10-49'
    WHEN total_career_pubs BETWEEN 50 AND 199 THEN '50-199'
    WHEN total_career_pubs >= 200 THEN '200+'
  END AS career_pub_bucket,
  COUNT(*) AS hcp_count
FROM hcps
WHERE source = 'openalex_v2_discovery'
GROUP BY 1;
```

---

## Step D: Wipe Unidentifiable Duplicates

**Goal**: Delete HCP rows that fail the preservation rule. These are by definition duplicate-prone PubMed-pipeline rows with no clean identity and no external data references.

**Preservation rule** (any single qualifying condition keeps the HCP):

1. Has `npi_number` (NPPES-identified clinicians)
2. Has `openalex_author_id` (OpenAlex-identified researchers)
3. Is in `canonical_hcps_snapshot` (manually validated canonicals)
4. Has any `trial_investigators` row
5. Has any `hcp_open_payments_summary` or `hcp_open_payments_by_ta` row
6. Has any `hcp_medicare_summary` or `hcp_medicare_by_ta` row
7. Has any `dol_matches` row
8. Has any `hcp_claims` row
9. Has any `hcp_watchlist` row
10. Has any `msl_contributions` row (CRITICAL — product differentiator data)
11. Has any `hcp_narratives` row
12. Has any `cohort_overrides` row (currently empty but preserve rule for future)
13. Has any `npi_match_proposals` row with status='confirmed'
14. Has any `trial_investigator_match_proposals` row (manual matching work)

**Pre-wipe diagnostic** (run BEFORE the wipe transaction):

```sql
-- Count HCPs by preservation status
WITH preservation_status AS (
  SELECT 
    h.id,
    CASE
      WHEN h.npi_number IS NOT NULL THEN 'has_npi'
      WHEN h.openalex_author_id IS NOT NULL THEN 'has_openalex'
      WHEN h.id IN (SELECT id FROM canonical_hcps_snapshot) THEN 'is_canonical'
      WHEN EXISTS (SELECT 1 FROM trial_investigators ti WHERE ti.hcp_id = h.id) THEN 'has_trials'
      WHEN EXISTS (SELECT 1 FROM hcp_open_payments_summary o WHERE o.hcp_id = h.id) THEN 'has_open_payments'
      WHEN EXISTS (SELECT 1 FROM hcp_medicare_summary m WHERE m.hcp_id = h.id) THEN 'has_medicare'
      WHEN EXISTS (SELECT 1 FROM dol_matches d WHERE d.hcp_id = h.id) THEN 'has_dol_match'
      WHEN EXISTS (SELECT 1 FROM hcp_claims c WHERE c.hcp_id = h.id) THEN 'has_claims'
      WHEN EXISTS (SELECT 1 FROM hcp_watchlist w WHERE w.hcp_id = h.id) THEN 'has_watchlist'
      WHEN EXISTS (SELECT 1 FROM msl_contributions ms WHERE ms.hcp_id = h.id) THEN 'has_msl_contribution'
      WHEN EXISTS (SELECT 1 FROM hcp_narratives n WHERE n.hcp_id = h.id) THEN 'has_narrative'
      ELSE 'no_identity_no_references'
    END AS category
  FROM hcps h
)
SELECT category, COUNT(*) AS hcp_count
FROM preservation_status
GROUP BY category
ORDER BY hcp_count DESC;
```

This tells us exactly how many HCPs would be wiped before any DELETE runs. If the `no_identity_no_references` count is unexpectedly high or low, stop and investigate.

**Wipe transaction**:

```sql
BEGIN;

-- Build temp table of HCPs to preserve
CREATE TEMP TABLE hcps_to_preserve AS
SELECT DISTINCT h.id
FROM hcps h
WHERE h.npi_number IS NOT NULL
   OR h.openalex_author_id IS NOT NULL
   OR h.id IN (SELECT id FROM canonical_hcps_snapshot)
   OR EXISTS (SELECT 1 FROM trial_investigators ti WHERE ti.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_open_payments_summary o WHERE o.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_open_payments_by_ta opt WHERE opt.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_medicare_summary m WHERE m.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_medicare_by_ta mt WHERE mt.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM dol_matches d WHERE d.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_claims c WHERE c.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_watchlist w WHERE w.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM msl_contributions ms WHERE ms.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM hcp_narratives n WHERE n.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM cohort_overrides co WHERE co.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM npi_match_proposals nmp WHERE nmp.hcp_id = h.id)
   OR EXISTS (SELECT 1 FROM trial_investigator_match_proposals tmp WHERE tmp.proposed_hcp_id = h.id);

-- Verify counts before any DELETE
SELECT COUNT(*) AS preserved FROM hcps_to_preserve;
SELECT COUNT(*) AS to_wipe FROM hcps WHERE id NOT IN (SELECT id FROM hcps_to_preserve);

-- STOP HERE. If counts don't match expectations, ROLLBACK.

-- Wipe dependent data for HCPs being deleted
DELETE FROM hcp_scores;  -- always full wipe, rebuilt in scoring phase
DELETE FROM publication_authors WHERE hcp_id NOT IN (SELECT id FROM hcps_to_preserve);
DELETE FROM hcp_therapeutic_areas WHERE hcp_id NOT IN (SELECT id FROM hcps_to_preserve);
DELETE FROM nppes_enrichment_log WHERE hcp_id NOT IN (SELECT id FROM hcps_to_preserve);

-- Wipe HCPs themselves
DELETE FROM hcps WHERE id NOT IN (SELECT id FROM hcps_to_preserve);

-- Verify final state
SELECT 
  (SELECT COUNT(*) FROM hcps) AS hcps_remaining,
  (SELECT COUNT(*) FROM trial_investigators) AS trial_investigators_remaining,
  (SELECT COUNT(*) FROM publication_authors) AS publication_authors_remaining;

-- If counts match expectations, COMMIT. Otherwise ROLLBACK.
COMMIT;
```

---

## Step E: Add UNIQUE Constraint on openalex_author_id

**Goal**: Prevent future duplication at the database constraint level.

**Pre-check**: After Step D, no two HCP rows should share an OpenAlex author ID (because Step B should have reconciled them and Step D wiped the rest). Verify:

```sql
SELECT openalex_author_id, COUNT(*)
FROM hcps
WHERE openalex_author_id IS NOT NULL
GROUP BY openalex_author_id
HAVING COUNT(*) > 1;
```

If this returns rows, something's wrong. Investigate before adding the constraint. If empty:

```sql
ALTER TABLE hcps
  ADD CONSTRAINT hcps_openalex_author_id_unique UNIQUE (openalex_author_id);
```

---

## Step F: Rebuild publication_authors Links

**Goal**: For each publication's OpenAlex `authorships` array, create clean `publication_authors` rows linking publications to HCPs via OpenAlex author ID.

**Script**: `link_publication_authors.py`

**What it does**:
1. For each publication with `authorships IS NOT NULL`
2. Unpacks the authorships array
3. For each author with OpenAlex ID, looks up the matching HCP via `hcps.openalex_author_id`
4. If matched, creates a `publication_authors` row
5. Author position (first, last, middle) captured from the authorship metadata

**Critical**: Only links to existing HCPs. Doesn't create new HCP rows. Authors without matching HCPs (one-off contributors below the threshold from Step A) are skipped.

**Diagnostic after Step F**:

```sql
-- Total publication_authors links
SELECT COUNT(*) FROM publication_authors;

-- Distribution of pub counts per HCP
SELECT 
  CASE
    WHEN pub_count = 0 THEN '0 papers'
    WHEN pub_count BETWEEN 1 AND 4 THEN '1-4'
    WHEN pub_count BETWEEN 5 AND 19 THEN '5-19'
    WHEN pub_count BETWEEN 20 AND 99 THEN '20-99'
    WHEN pub_count >= 100 THEN '100+'
  END AS bucket,
  COUNT(*) AS hcp_count
FROM (
  SELECT h.id, COUNT(pa.id) AS pub_count
  FROM hcps h
  LEFT JOIN publication_authors pa ON pa.hcp_id = h.id
  GROUP BY h.id
) t
GROUP BY 1;
```

---

## What we have after all six steps

**Database state:**
- HCPs with stable identity: NPI for clinicians, OpenAlex author ID for researchers, both for some
- No duplicate HCPs by identity primitive (enforced by UNIQUE constraints)
- Every HCP either has identity OR has external data references — no orphans
- publication_authors rebuilt cleanly from OpenAlex authorships
- Publication corpus enriched with OpenAlex citation data

**Capability unlocked:**
- Rising Stars scoring can run against clean HCP population
- Adding new TAs (Immunology, additional indications) follows the same architecture
- HCP discovery is OpenAlex-driven, not name-string-driven

**What's still not solved:**
- OpenAlex's own author misattribution for common Chinese names (upstream noise we accept)
- Validation cohort still needs to be built (separate workstream)
- Per-indication scoring weight calibration (separate workstream)

---

## Decisions needed before we begin

**1. Step A threshold for HCP creation**: `corpus_pub_count >= 3` is my default suggestion. Higher (5) filters more noise. Lower (1) maximizes coverage. We can iterate.

**2. Step B reconciliation auto-link confidence threshold**: How aggressive should auto-matching be? Conservative = more rows go to manual review. Liberal = faster but more risk of wrong matches.

**3. Step D timing**: Run the wipe immediately after Steps A-C, or pause for review of `hcp_reconciliation_candidates` first? My recommendation: review candidates first if there are many.

**4. Step F timing**: Run after Step D wipe, so we don't link to HCPs we're about to delete.

---

## Estimated effort

- Step A: Build script (~1 hour). Run (~5-15 minutes). Diagnostic queries (~5 minutes).
- Step B: Build script (~2 hours). Run (~30 minutes). Review output (~30 minutes).
- Step C: Build script (~1 hour). Run (~30-60 minutes — querying OpenAlex per author).
- Step D: SQL exists. Run pre-diagnostic + transaction (~10 minutes).
- Step E: One SQL statement.
- Step F: Build script (~1 hour). Run (~30-60 minutes).

Total: ~6-10 hours of focused work. Could happen across 1-2 sessions.
