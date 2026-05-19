# Session Handoff — May 18, 2026 → Next Session (Frontend Focus)

## Where we stand

Backend cohort data is locked. v1.0 is now ready for frontend work.

## Cohort state (final, validated)

| Cohort | Count | Notes |
|---|---|---|
| Established | 641 | 4-path methodology; canonicals (Loomba, Heymach, Sanyal, Chalasani, Wakelee) all correct |
| Rising Star | 296 | NPI required, career pubs 15-200, clinical taxonomy, no pharma-employed |
| Community | 13,690 | NPI + practice activity (Open Payments or Medicare), taxonomy-filtered |
| **Total classified** | **14,627** | |

**Dropped from v1.0:** Dark Horse and Workhorse. Cohort sizes were too thin to support as product surfaces. Will revisit in v1.1+ with proper methodology.

## What got built today

1. **NPPES taxonomy backfill** — 99.9% success on 27,371 HCPs. Effective coverage is now 100% (30,068 of 30,082 NPIs).
2. **Reference table infrastructure** — three new tables for clean classification:
   - `excluded_taxonomies` (92 entries, 10 categories)
   - `excluded_institutions` (80 entries, pharma/CRO/industry)
   - `ta_clinical_taxonomies` (44 entries across 3 TAs)
3. **Refined cohort_classification SQL** — uses reference tables, no inline ILIKE blocks
4. **Cohort scores computed** for all three cohorts as percentile ranks

## Critical frontend tasks for next session

### Priority 1: Cohort score display

Cohort_score is currently a percentile rank (0-100). The frontend currently displays raw values like "100.00" or "99.10" which implies absolute scoring.

**Fix:** Display as percentile (e.g., "94th percentile") with brief explanation in scoring modal. The score IS a percentile rank — display should be honest about that.

### Priority 2: Column-name drift in api.ts

`getHCPDetail` and `searchHCPs` query columns that don't exist on `hcp_scores`:
- Wrong: `pub_velocity`, `citation_trajectory`, `trial_score`, `career_multiplier`, `stored_pubs`
- Right: `pub_velocity_score`, `citation_trajectory_score`, `trial_investigator_score`

Detail screen probably silently shows zero/null for affected fields. `mapRisingStarRow` handles this with `??` fallbacks, but the DB queries themselves need fixing.

### Priority 3: PUB YEARS field interpretation

The "PUB YEARS = 0" or "PUB YEARS = 1" display on cards is misleading. `first_pub_year` reflects DB coverage start, not actual career start. Options:
- Rename field ("FIRST PUB IN DB")
- Hide when value is < 3
- Replace with `nppes_career_stage_years` if more meaningful

### Priority 4: "Specialty unverified" badge

For HCPs without NPPES taxonomy data, add transparency. The `npi_taxonomy_enrichment_status` column tracks this.

## Methodology issues (v1.1, NOT blockers for v1.0)

### scoring_pipeline.py is broken

The script doesn't write `normalized_score` or `tier` values. The existing values in `hcp_scores.tier` are stale from a previous run — 92% of HCPs tagged `tier='rising_star'` have `normalized_score=0`.

**Current workaround:** Cohort_classification doesn't trust the tier column for v1.0. Rising Star cohort gate uses our refined SQL filters instead.

**v1.1 work:**
- Investigate and fix scoring_pipeline.py normalization
- Modified v1.4 script drafted but not deployed (was going to add normalized_score + tier writes; decided unnecessary for v1.0 after dropping Dark Horse)
- Backup of v1.3 saved as `scoring_pipeline_v1_3_backup.py`

### Dark Horse needs a hiddenness signal

Current implementation = "top X% of Rising Star." That's decorative — no methodological differentiator. Real Dark Horse should require some hiddenness signal:
- Not at top-tier institution
- Not a verified DOL
- Lower Open Payments than expected for output

### Workhorse needs balanced per-TA criteria

TA-relative top-10% Medicare + low pharma produced unbalanced cohorts (NSCLC 47, Hepatology 1). Real Workhorse needs broader criteria that work across all TAs.

### Established scoring formula

Current: weighted percentile composite (50/10/25/15) + publication floor at 70 for pubs ≥ 800.

The floor catches Wakelee and Sanyal who lack NPPES data but have overwhelming publication evidence. Working as designed for v1.0 but worth revisiting in v1.1.

### Cohort_classification durability

The SQL we've been running through Supabase SQL editor is NOT in repo files. When the weekly refresh pipeline runs, it has no idea this logic exists. **v1.1 priority:** extract cohort classification SQL into `sql/classification/*.sql` files, wire into weekly pipeline orchestration.

## Architectural decisions that survived the day

- **Reference tables for exclusions** — `excluded_taxonomies`, `excluded_institutions`, `ta_clinical_taxonomies`. Future additions are one INSERT away.
- **Cohort_classification on hcps table** — single value per HCP, frontend reads directly.
- **Cohort_score is percentile rank** — relative to cohort, not absolute composite.
- **Per-TA TA-clinical taxonomy filter** for cohorts where specialty matters (currently Workhorse; v1.1 may extend to other cohorts).
- **3-cohort v1.0** — Established, Rising Star, Community. Plus Verified DOLs as a separate feature.

## Git state (uncommitted)

```
Modified:
- scoring_pipeline.py (today's run, before v1.4 changes were drafted)
- trial_investigator_matcher.py
- trials_pipeline.py

Untracked:
- nppes_api_backfill.py (the backfill script — keep)
- ingest_publications.py
- inventory_openalex_authors.py
- map_nppes_to_ror.py
- enrich_ror_to_country.py
- multiple run_step_*.py orchestration scripts
- Multiple Latest Documentation/ files
```

**Should commit before next session:** today's Python files and documentation. The scoring_pipeline.py v1.4 draft (in /mnt/user-data/outputs/) is NOT deployed — decide whether to commit it as a v1.1 starting point or shelve.

## Frontend architecture (already in place)

From today's api.ts read:
- `getRisingStars` reads `cohort_classification` and orders by `cohort_score` ✓
- `INDUSTRY_PATTERNS` filter at display time catches pharma-employed HCPs ✓
- `mapRisingStarRow` has fallbacks for column-name drift ✓
- `getTACounts` reads `ta_cohort_counts_cache` for fast count queries ⚠ (cache may be stale — needs refresh after today's reclassification)

**Important:** `ta_cohort_counts_cache` table needs refreshing. The counts there reflect pre-refinement state. Frontend will show old numbers in the TA selection screen until cache is updated.

## What to do FIRST in next session

1. **Refresh ta_cohort_counts_cache** so TA selection screen shows current counts
2. **Test the frontend locally** (`npm run dev`) to see current state with new cohort data
3. **Fix column-name drift in api.ts** — getHCPDetail and searchHCPs
4. **Decide on score display format** — "94th percentile" vs "94" vs something else
5. **Iterate from there based on what you see**

## Honest meta from today

Today was harder than it should have been. Some of that was real architecture work that nobody could have predicted. Some was me recommending thorough approaches when good-enough would have shipped. The output is genuinely substantial — three credible cohorts, reference table infrastructure, NPPES backfill complete — but the path was longer than necessary.

For frontend work next session: bias toward shipping. Polish backlog items can stack up. The data foundation is now solid enough that frontend can iterate quickly without re-litigating methodology.
