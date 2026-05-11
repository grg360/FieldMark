# HCP Deduplication — Design Document

**Created:** May 9, 2026
**Status:** Design phase, pre-implementation
**Owner:** Garrett (FieldMark)

---

## Problem statement

The `hcps` table contains substantial duplication: 6,818 name groups have multiple rows, totaling 20,679 rows for what should be ~6,818 distinct people. The duplication is most severe for high-publishing researchers, who tend to be exactly the HCPs the platform most needs to classify correctly.

### Empirical examples

- **Stephen A Harrison** — 18 rows. All point to Pinnacle Clinical Research / University of Oxford / Radcliffe Department of Medicine. This is one person, the prominent MASLD/NASH researcher.
- **Ming-Hua Zheng** — 16 rows. All Wenzhou Medical University / NASH Council. One Chinese hepatology researcher.
- **Daniel Q Huang** — 15 rows. All National University of Singapore / NAFLD Research Center. One Singaporean researcher.
- **Michael Trauner** — 15 rows. All Medical University of Vienna. One Austrian hepatology researcher.
- **Roy Herbst** — 2 rows. One at MD Anderson (TX) with $1M Open Payments data, one at Yale Cancer Center (CT) with publication data. Same person, signals fragmented across rows.

### Impact

Cohort classification cannot work correctly while duplicates exist. Real Established HCPs (Herbst, Wakelee, Janne, Ramalingam) fail to qualify because their data is split across rows that each individually fail criteria they would jointly pass.

The duplication also affects:
- Search results (showing the same person multiple times)
- Score computation (publication velocity etc. computed against partial data)
- Open Payments analysis (signals attached to wrong row)
- Trial investigator matching (links scattered)

### Cause hypothesis

Duplicates were created by ingestion processes that didn't deduplicate at write time. When publication data was ingested, a new HCP row was created for each unique author-affiliation pairing rather than joined to existing HCPs. NPPES enrichment created additional rows when names varied slightly. The OpenAlex author ID matching that should have prevented duplicates worked partially — 2,155 duplicate groups have matching OpenAlex IDs — but didn't catch all cases.

### Scope of duplicate population

From diagnostic queries:

| Metric | Count |
|---|---|
| Total HCP name groups with duplicates | 6,818 |
| Total rows in duplicate groups | 20,679 |
| Estimated redundant rows | ~14,000 |
| Groups with matching OpenAlex IDs | 2,155 |
| Groups with 4+ rows (mix of duplicates and collisions) | 1,456 |
| Groups with exactly 2 rows | 4,106 |
| Groups with matching NPIs across rows | 0 |

The zero-NPI-match figure is significant: NPI uniqueness is enforced by NPPES, so duplicates are not NPI-collision artifacts. They're between rows where some have NPIs (NPPES-sourced) and others don't (publication-sourced).

---

## Same-person signals

Two rows represent the same person if one or more of the following match. Strength varies; we use multiple signals to build confidence.

### Strong signals (high-confidence match)

1. **Same `npi_number`** (when both rows have one populated). NPI is unique per person; matching NPIs are definitive.
2. **Same `openalex_author_id`** (when both populated). OpenAlex assigns one ID per researcher (with caveats — collisions exist for short Chinese names).
3. **Same `nppes_organization_npi` AND same name** — co-located at exact same practice with matching name = same person.
4. **Same `nppes_practice_address` AND same name** — exact-match address with matching name = same person.

### Medium signals (likely match, review if uncertain)

5. **Same name AND same `institution_short`** — exact name + exact institution string match.
6. **Same name AND same `derived_state` AND non-conflicting career signals** — career_stage_years within ±3 if both populated.
7. **Same name AND one row has NPPES enrichment, others don't** — common publication-vs-NPPES split pattern. Merge if no contradicting signals.
8. **Same name AND fuzzy institution match** — institutions normalize to same canonical institution (e.g., "Memorial Sloan Kettering Cancer Center" and "MSKCC" and "Memorial Sloan Kettering" all = MSKCC).

### Weak signals (insufficient alone, may indicate collision)

9. **Same name only, different institutions, different states.** Could be same person who moved institutions; could be different people. Don't auto-merge; queue for review.
10. **Same name, one row at international institution, another at US institution.** May be same person with international + US affiliations, or may be different people. Manual review.
11. **Three or more rows with same name spread across very different geographies.** Likely name collision, not duplicate. Don't merge automatically.

### Disqualifying signals (never merge despite name match)

12. **Different `npi_number` values** when both populated. NPIs are unique, so different NPIs = different people.
13. **Different `openalex_author_id` values** when both populated. (Caveat: OpenAlex sometimes assigns multiple IDs to same researcher; this rule may need refinement for known cases.)

---

## Canonical row selection

When multiple rows are confirmed to be the same person, one row becomes canonical. Others are merged into it and then deleted. Selection priority:

### Priority order

1. **NPPES-enriched preferred.** Rows with `nppes_enriched_at IS NOT NULL` win over rows without. NPPES rows have richer downstream signal (NPI, address, career stage, organization data).

2. **More complete data wins.** Among rows with similar enrichment status, the row with more non-null fields is preferred. This is a tiebreaker after NPPES status.

3. **Most recent NPPES enrichment.** If both have NPPES data, prefer the more recent `nppes_enriched_at`.

4. **First created if all else equal.** Earliest `created_at` wins as final tiebreaker.

### Rationale

NPPES enrichment is the single most valuable downstream signal. NPI gives us Open Payments matching, practice geography, organization data. Publication-only rows lack these. Even if a publication row has more recent activity, the NPPES row is the better canonical choice because everything else can be merged into it.

### Edge cases

- **All rows are publication-sourced (no NPPES on any).** Common for international researchers. Pick the row with the most lead-author publications, then most non-null fields.
- **Multiple NPPES-enriched rows.** Should be rare since NPI is unique, but possible if NPPES enrichment ran twice with different keys. Pick most recent enrichment.

---

## Field merge logic

When merging a non-canonical row into a canonical row, each field on `hcps` follows one of these rules:

### Rules by field type

| Rule | Field type | Behavior |
|---|---|---|
| **Canonical wins** | Canonical row's value is preserved if non-null. Non-canonical's value is discarded. | Most identity fields: `first_name`, `last_name`, `derived_state`, `institution_short`, `institution_full` |
| **Fill if null** | If canonical is null, copy from non-canonical. If multiple non-canonicals have values, prefer the more recent. | Optional enrichment fields: `nppes_career_stage`, `nppes_career_stage_years`, `total_career_pubs`, `scholar_citations_total`, `country` |
| **Numeric maximum** | Take the highest value across all rows. | `total_career_pubs`, `scholar_citations_total`, `nppes_co_located_npi_count` — assume highest is most accurate |
| **Most recent** | Take the most recent timestamp. | All `*_at` and `*_resolved_at` fields |

### Canonical-wins rule rationale

For identity fields like name and institution, the canonical row was selected as canonical for a reason (NPPES enrichment, completeness). Letting non-canonicals overwrite would defeat the canonical selection. If the canonical has Yale Cancer Center and a non-canonical has MD Anderson, Yale wins because the canonical was selected based on stronger signals.

### Fill-if-null rule rationale

Some fields are partial across rows. NPPES enrichment populates career stage; OpenAlex doesn't. If canonical is publication-sourced and non-canonical is NPPES-sourced, canonical wins on identity but borrows career_stage_years from the NPPES row.

### Numeric maximum rule rationale

For pure count fields (total publications, total citations), the highest value is most likely accurate because counts only grow. A row with `total_career_pubs = 200` and another with `1,239` for the same person — `1,239` is the better count.

This rule has a known risk: if `total_career_pubs` is inflated by name-collision artifacts, taking max preserves the inflation. Acceptable tradeoff because we're not using `total_career_pubs` as a primary cohort signal anyway (lead-author counts are more reliable).

### Specific field decisions

| Field | Rule | Notes |
|---|---|---|
| `id` | Canonical wins | Canonical row's UUID is the surviving identifier |
| `first_name`, `last_name` | Canonical wins | Pick canonical's spelling |
| `npi_number` | Fill if null | NPPES row should already have it |
| `openalex_author_id` | Canonical wins | Canonical's value is authoritative |
| `institution`, `institution_short`, `institution_full` | Canonical wins | Canonical's chosen affiliation |
| `derived_state`, `nppes_practice_state` | Canonical wins | |
| `nppes_*` fields | Fill if null | Canonical NPPES data preferred when present |
| `total_career_pubs`, `scholar_citations_total` | Numeric maximum | Take highest available count |
| `first_pub_year` | Numeric minimum | Earliest year wins (this field has known data quality issues; treat with caution) |
| `created_at` | Earliest wins | Preserves earliest record |
| `nppes_enriched_at`, `openalex_resolved_at`, `institution_geo_resolved_at` | Most recent | Most recent enrichment |

---

## Foreign key update strategy

Multiple tables reference `hcps.id`. When we delete a non-canonical row, all references must be updated to point at the canonical row.

### Tables to update

Based on schema review:

| Table | FK column | Update strategy |
|---|---|---|
| `publication_authors` | `hcp_id` | Update FK to canonical hcp_id. Then dedupe duplicate rows that result. |
| `hcp_therapeutic_areas` | `hcp_id` | Update FK. Unique constraint on `(hcp_id, therapeutic_area_id)` may cause conflicts — dedupe afterward. |
| `hcp_open_payments_summary` | `hcp_id` | Update FK. May have duplicate rows after update — pick one (prefer NPPES-sourced) and delete others. |
| `hcp_open_payments_by_ta` | `hcp_id` | Update FK. Same dedup-after-update logic. |
| `hcp_normalized_scores` | `hcp_id` | Update FK. Recompute scores after dedup completes. |
| `hcp_scores` | `hcp_id` | Update FK. Recompute. |
| `hcp_narratives` | `hcp_id` | Update FK. Pick canonical narrative if duplicates result. |
| `trial_investigators` | `hcp_id` | Update FK. May have duplicate links — dedupe. |
| `dol_matches` | `hcp_id` | Update FK. Pick canonical match. |

### Update pattern

For each merge group (canonical + non-canonicals):

```sql
-- Step 1: Update FKs to point at canonical
UPDATE publication_authors 
SET hcp_id = <canonical_id> 
WHERE hcp_id = ANY(<non_canonical_ids>);

-- Step 2: Handle resulting duplicates within table
-- (e.g., if same publication_id is now linked to canonical_id twice,
-- delete the extras keeping the more recent or more complete row)

-- Step 3: After ALL FK updates complete, delete non-canonical hcps rows
DELETE FROM hcps WHERE id = ANY(<non_canonical_ids>);
```

### Constraint conflicts

Some tables have unique constraints that can be violated by FK updates:

- `hcp_therapeutic_areas` likely has `UNIQUE (hcp_id, therapeutic_area_id)`. If both canonical and non-canonical have the same TA link, the update conflicts.
- `hcp_open_payments_by_ta` likely has `UNIQUE (hcp_id, therapeutic_area_id)`.
- `publication_authors` may have `UNIQUE (hcp_id, publication_id)`.

These need to be handled before the FK update, by deleting the duplicate rows that would conflict.

### Schema verification needed

Before implementation, query the actual unique constraints on each table:

```sql
SELECT 
  conname, 
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE contype = 'u'
  AND conrelid::regclass::text IN (
    'publication_authors',
    'hcp_therapeutic_areas',
    'hcp_open_payments_summary',
    'hcp_open_payments_by_ta',
    'hcp_normalized_scores',
    'hcp_scores',
    'hcp_narratives',
    'trial_investigators',
    'dol_matches'
  );
```

This tells us which constraints need pre-emptive handling during merge.

---

## Pass-by-pass execution plan

The dedup runs in passes of decreasing confidence. High-confidence passes auto-merge. Lower-confidence passes queue for review.

### Pass 0: Backup and instrumentation (mandatory before any merge)

Before any merge runs:

1. **Full backup of `hcps` table:** `CREATE TABLE hcps_backup_pre_dedup AS SELECT * FROM hcps;`
2. **Backup of all FK-referenced tables:** Same pattern for `publication_authors`, `hcp_open_payments_*`, etc.
3. **Create merge log table:**

```sql
CREATE TABLE dedup_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_hcp_id uuid NOT NULL,
  merged_hcp_id uuid NOT NULL,
  merge_pass text NOT NULL,  -- 'pass_1_openalex', 'pass_2_npi', etc.
  merge_signals jsonb,  -- which signals matched (for review)
  merged_at timestamp with time zone DEFAULT NOW(),
  -- For reversibility
  original_canonical_data jsonb,  -- snapshot of canonical row before merge
  original_merged_data jsonb,  -- snapshot of merged row before deletion
  fk_updates_count jsonb  -- counts per table for verification
);
```

4. **Disable any background processes** that might write to `hcps` during dedup. Pause publication backfill, NPPES enrichment, scoring.

### Pass 1: NPI exact match (highest confidence)

**Criteria:** Multiple rows have the same non-null `npi_number`.

**Diagnostic earlier showed 0 groups match this** — meaning duplicate HCPs don't share NPIs, because NPIs are only on NPPES-sourced rows and duplicates exist between NPPES and non-NPPES rows.

**Action:** Skip this pass for now. Re-run at end as final check (in case any dedup work surfaces NPI matches).

### Pass 2: OpenAlex author ID exact match

**Criteria:** Multiple rows have the same non-null `openalex_author_id` AND matching name.

**Population:** ~2,155 groups.

**Confidence:** High. OpenAlex IDs are mostly unique per researcher. Cross-checking with name match adds protection against ID collisions.

**Risk:** OpenAlex is known to have name-collision issues for short Chinese names where multiple "Lei Wang"s share an ID. The name match guard helps but doesn't fully eliminate this.

**Mitigation:** Apply additional check — if all rows in the group have non-US `derived_state` AND row count is ≥4, queue for manual review instead of auto-merge.

**Action:** Auto-merge with the mitigation rule applied.

### Pass 3: Same name + same NPPES organization NPI

**Criteria:** Multiple rows have same name and same `nppes_organization_npi`.

**Confidence:** High. Same person at same organization.

**Risk:** Two different people with same name working at same hospital. Possible but rare for full name matches.

**Action:** Auto-merge.

### Pass 4: Same name + same practice address

**Criteria:** Multiple rows have same name and same `nppes_practice_address`.

**Confidence:** Very high. Address-level co-location is definitive.

**Action:** Auto-merge.

### Pass 5: Same name + same institution_short (exact string)

**Criteria:** Same name AND same `institution_short` (case-insensitive exact match).

**Confidence:** Medium-high.

**Risk:** Two real people with same name at same institution. Real possibility for common names at large institutions (multiple "John Smith"s at MGH).

**Mitigation:** Limit auto-merge to groups with ≤3 rows. Larger groups queue for review.

**Action:** Auto-merge with row-count guard.

### Pass 6: Same name + fuzzy institution match

**Criteria:** Same name AND institution strings normalize to same canonical institution. Examples:
- "Memorial Sloan Kettering Cancer Center" = "MSKCC" = "Memorial Sloan Kettering"
- "Dana-Farber Cancer Institute" = "Dana-Farber" = "DFCI"

**Implementation:** Build a normalization mapping. Probably 100-200 entries for major academic medical centers. Apply to both rows; if normalized matches, treat as same institution.

**Confidence:** Medium.

**Action:** Auto-merge if name + normalized institution + ≤3 rows. Otherwise queue.

### Pass 7: Same name + same state (manual review queue)

**Criteria:** Same name AND same `derived_state`, but no other strong signals match.

**Confidence:** Low. Two different people with same name in same state is plausible.

**Action:** Do NOT auto-merge. Queue for manual review.

### Pass 8: Manual review queue

Everything not auto-merged in passes 2-6 lands here. Estimated population: 1,500-2,000 groups.

**Process:** Either build a minimal admin UI or export to CSV for spreadsheet review. For each group, decision is "merge into one" / "keep as separate people" / "merge subset, keep others separate."

**Time estimate:** 30 seconds to 2 minutes per group. ~25-50 hours of review work total. Prioritize high-impact groups first (high-publication researchers, known canonical HCPs, top cohort positions).

### Pass 9: Final NPI re-check

After all merges complete, re-run NPI match check. If any groups still have multiple rows with matching NPIs, that's a missed merge — investigate.

---

## Validation strategy

### Pre-merge baseline metrics

Capture these BEFORE any merge runs:

```sql
-- Row counts per table
SELECT 'hcps' AS table_name, COUNT(*) AS row_count FROM hcps
UNION ALL
SELECT 'publication_authors', COUNT(*) FROM publication_authors
UNION ALL
SELECT 'hcp_therapeutic_areas', COUNT(*) FROM hcp_therapeutic_areas;
-- ...etc for all FK tables

-- Duplicate group count
SELECT COUNT(*) FROM (
  SELECT LOWER(TRIM(first_name)), LOWER(TRIM(last_name))
  FROM hcps
  WHERE first_name IS NOT NULL AND last_name IS NOT NULL
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
) t;

-- Canonical HCP states (capture full row snapshots)
SELECT * FROM hcps WHERE id IN (
  '9339ead6-2023-4e69-9eda-2914553a2e20',  -- Loomba
  '6f9dd309-bd67-4260-a9c2-8a22129f988c',  -- Chalasani  
  'dc645bf0-b7e0-4c3c-9aaf-9e7bc35d6331'   -- Garassino
);
-- Plus: rows for Stephen Harrison, Roy Herbst, Heather Wakelee, Pasi Janne
```

### Post-merge validation

After each pass and at the end:

1. **Duplicate count should decrease.** Re-run duplicate diagnostic. If a pass merged 1,000 groups, the duplicate group count should drop by ~1,000.

2. **Total HCP row count should decrease by merged-row count.** If pass merged 500 groups averaging 3 rows each → 500 canonical + 1,000 deleted = 1,500 rows removed.

3. **FK reference count should be preserved.** Total `publication_authors` rows shouldn't decrease (just rebalance). Total Open Payments rows can decrease (after deduping conflicts).

4. **No orphaned FK references.** Query `publication_authors WHERE hcp_id NOT IN (SELECT id FROM hcps)` should return zero.

5. **Canonical HCPs spot-check.**
   - Stephen Harrison: should be 1 row, with consolidated institution / state / lead-author count
   - Roy Herbst: should be 1 row, combining Yale + MD Anderson signals
   - Pasi Janne, Heather Wakelee, Suresh Ramalingam: should be 1 row each
   - Loomba, Chalasani: still 1 row each (they were already singleton)

6. **Cohort classification re-check.** After dedup, re-run the v0.3 spot-check query. Roy Herbst, Wakelee, Janne should now classify as Established (PATH 3 likely).

### Rollback plan

If post-merge validation reveals problems:

1. **Identify scope.** Which pass introduced the problem?
2. **Rollback strategy:**
   - If problem is in latest pass only: use `dedup_merge_log` to identify merged_hcp_ids, restore from `hcps_backup_pre_dedup`, restore FK references.
   - If problem spans multiple passes: full restore of `hcps` from `hcps_backup_pre_dedup` and all dependent tables from their backups.
3. **Investigation.** Diagnose the failure mode. Adjust merge logic. Re-run from Pass 1.

---

## Reversibility plan

The `dedup_merge_log` table preserves enough information to undo individual merges:

- `original_canonical_data` (jsonb) — full snapshot of canonical row pre-merge
- `original_merged_data` (jsonb) — full snapshot of merged row pre-deletion
- `fk_updates_count` (jsonb) — per-table count of FKs that were updated

To undo a single merge:

1. Recreate the deleted hcp row from `original_merged_data`
2. Restore canonical row's pre-merge state from `original_canonical_data`
3. Re-update FKs in dependent tables (more complex — requires capturing which specific FK rows were updated)

Note: full reversibility requires more than just data snapshots. We'd need a record of which exact FK rows were updated, not just counts. Consider whether to capture that or rely on full backup tables for reversibility.

**Recommendation:** Use `hcps_backup_pre_dedup` and per-table backups as primary recovery mechanism. Use `dedup_merge_log` for diagnostic and audit purposes, not surgical undo.

---

## Risks and known limitations

### Risk: OpenAlex name collisions

Pass 2 uses `openalex_author_id` matching. OpenAlex assigns the same ID to multiple "Lei Wang"s globally. Pass 2 mitigation (limit to non-non-US-collision groups) helps but is imperfect.

**Acceptable risk:** False merges of Chinese-name researchers are problematic but those rows are excluded from cohort classification anyway (via US-only filter). Audit Pass 2 results to confirm.

### Risk: Common name collisions in US

Pass 5 (name + institution) might falsely merge two real people at large institutions. "John Smith at MGH" could be two different physicians.

**Mitigation:** Row-count guard (≤3 rows). Manual spot-check post-merge.

### Limitation: Career-move cases require manual review

Roy Herbst (TX → CT) and similar career-move cases don't trigger any auto-merge pass because state, institution, and NPI all differ. They require manual review queue.

**Implication:** Pass 8 manual review is non-trivial workload. Build prioritization based on cohort relevance.

### Limitation: Score recomputation needed post-dedup

`hcp_normalized_scores` and `hcp_scores` are computed from publication and trial data per HCP. After dedup consolidates publications, scores need to recompute on the merged HCPs.

**Plan:** After all dedup passes complete, re-run scoring pipeline.

### Limitation: Dedup is one-time, not ongoing

This workstream resolves existing duplicates but doesn't prevent new ones. Future ingestion runs will create new duplicates if their dedup logic isn't fixed.

**v1.1 backlog item:** Add ingestion-time deduplication to publication backfill, NPPES enrichment, etc.

---

## Estimated workstream

Given scope:

- **Sitting 1 (today/next):** Design review, schema constraint verification, backup creation, merge log table creation. Pass 2 (OpenAlex match) implementation and execution. Validation.
- **Sitting 2:** Passes 3-6 implementation. Spot-checking. Rollback if needed.
- **Sitting 3:** Pass 8 manual review queue construction. Begin manual review of high-priority groups.
- **Sittings 4-5+:** Continue manual review. Final validation. Cohort classification re-run.

Total estimate: 3-5 sittings of focused work plus background manual review effort.

---

## Open questions for review

Before kicking off Sitting 1 implementation, decisions needed:

1. **Backup strategy.** Full table backups (cheap, one-time) or row-level snapshots in merge log (more granular, harder to use)? Recommend full table backups.

2. **OpenAlex collision handling.** Pass 2 mitigation (skip if all-non-US + ≥4 rows) is conservative. Tighter? Looser?

3. **Manual review priority.** When Pass 8 queue is built, what determines review order? Cohort relevance? TA? Row count? Recommend: prioritize HCPs with highest publication output first, since they're most likely to be Established and most visible in the platform.

4. **FK update scope.** Confirm the table list (`publication_authors`, etc.). Run schema verification query before implementation.

5. **When does scoring re-run happen?** After all dedup passes complete, or incrementally?

6. **Stop criteria.** When do we declare dedup "done"? After Pass 7? After Pass 8 catches up to the high-priority queue? After residual duplicates are below some threshold?

---

## Implementation NOT YET STARTED

This document is design only. No merge SQL has been written or executed. Implementation begins after this design is reviewed and accepted.

Next step after acceptance: Sitting 1 implementation — backup, merge log table creation, schema verification, Pass 2 execution.

---

*End of HCP deduplication design document.*
