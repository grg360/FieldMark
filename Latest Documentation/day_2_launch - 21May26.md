# FieldMark Foundation Rebuild — Day 2 Launch Document

**Created:** May 21, 2026, end of Day 1 work
**Author:** Garrett + Claude (Opus 4.7)
**Purpose:** Capture complete state at end of Day 1 so any future session (new chat, future self, new collaborator) can resume the rebuild cleanly without reconstructing context.

---

## How to use this document

Read this entire document before resuming work. Do not skim. The handoff failures we've experienced in previous sessions resulted from:

1. New sessions making assumptions about state that turned out to be wrong
2. New sessions repeating decisions we'd already made
3. New sessions missing subtle architectural choices that matter

This document is the source of truth for state at end of Day 1. The codebase itself is the secondary source. Memory (Anthropic's persistent memory across chats) is the tertiary source and may be partial or outdated.

---

## The headline state

**We are mid-execution of a foundation rebuild (Path B).** Original v1 tables are untouched. New v2 tables exist alongside v1 with the strangler-fig pattern. The frontend still reads from v1; it is unaware v2 exists.

**Day 1 is approximately 80% complete.** publications_v2 is fully populated with 392,547 publications (Hepatology 311K + NSCLC 81K). OpenAlex enrichment is running in background and expected to complete overnight (estimated midnight to 1 AM ET on May 22).

**Day 2 cannot start until OpenAlex enrichment completes.** Inventory and Step C scripts depend on populated `publications_v2.authorships` column.

---

## What is actually running right now (May 21, evening)

A PowerShell window on Garrett's machine is executing:

```
python openalex_pipeline.py --target-version v2 --skip-career-enrichment
```

This script:
- Reads from publications_v2 where openalex_enriched_at IS NULL
- Batches 100 DOIs per OpenAlex API call
- Writes back to publications_v2: citation_count, citation_counts_by_year, authorships (JSONB), primary_location, publication_type, openalex_concepts, open_access, openalex_enriched_at
- Uses checkpoint file `openalex_checkpoint_v2.json` for resume capability
- Has --skip-career-enrichment flag set (Phase 2 of original script is disabled in v2; v2 uses career_enrichment_from_clusters.py instead)

Current rate: ~12 publications/second. Expected completion: 8-10 hours from launch (~midnight to 1 AM ET).

**If the script is still running when resuming work tomorrow:**
- DO NOT interrupt it unless writes have stopped
- Check progress: `SELECT COUNT(*) FILTER (WHERE openalex_enriched_at IS NOT NULL) FROM publications_v2;`
- Compare to total (392,547). If percentage >95%, can probably move on. If below 80%, keep waiting.

**If the script has stopped or crashed:**
- Check the PowerShell window for errors
- Resume with: `python openalex_pipeline.py --target-version v2 --skip-career-enrichment`
- Checkpoint file will skip already-processed publications

---

## Critical architectural decisions made on Day 1

These decisions are FINAL. Do not re-evaluate without explicit reason.

### Decision 1: Path B (full rebuild) over Path C (fix v1 in place)

Considered fixing v1's broken career data via career_enrichment_from_clusters.py. Dry-run revealed risks (Shoji conflation: 243 pubs collapsed to 1 because v1 had over-aggregated multiple same-named Japanese researchers). Path C would have produced inconsistent results — some HCPs fixed, others actively corrupted.

Path B (rebuild from scratch using existing sophisticated Step A-F architecture, with v2 routing flags) was chosen because:
- Existing scripts represent real engineering effort, not greenfield work
- Multi-shard OpenAlex linking is already implemented in run_step_c_create_hcps.py
- Establishment override for senior researchers exists in scoring_pipeline.py v1.4
- Strangler-fig pattern means v1 stays alive during rebuild — zero risk to frontend

### Decision 2: ingest_publications.py is publication-only, no HCP creation

V1's PubMed ingestion created hcps rows during ingestion, causing massive conflation (Shoji × N merged into one row, Zhang Wei aggregating hundreds of distinct Chinese researchers). 

V2's ingest_publications.py:
- Already had the architecturally correct pattern (docstring says "This script does NOT create HCP rows")
- Stores PubMed authorships as JSONB on publications_v2
- HCP identity resolution happens AFTER ingestion via OpenAlex-driven Step B/C

This is the single most important architectural shift in v2 and it solves the Gulley/Shoji/Hwu/Planchard/Younossi duplication problems systemically.

### Decision 3: Separate TA tagging from HCP creation

V1's Step C tagged every new HCP to Hepatology as default TA. This was wrong — NSCLC researchers also went through Step C in v1 and got mis-tagged.

V2's Step C (when --target-version v2 is set):
- Creates HCPs and OpenAlex linkages ONLY
- Does NOT tag TAs
- A separate script `ta_tagging_rebuild.py` (NOT YET WRITTEN) will assign TAs based on publication evidence after Step C completes

This is single-responsibility-principle separation. Don't merge them back together.

### Decision 4: --target-version v2 flag pattern, not new script files

All existing scripts get modified IN PLACE with a `--target-version` CLI flag. No new files like `ingest_publications_v2.py`. Reasons:
- One source of truth per script
- v1 and v2 share identical logic — only table names differ
- New scripts get `_rebuild` suffix to avoid collision with existing `_v2` naming (like generate_narratives_v2.py which is "second iteration" not "rebuild")

### Decision 5: Workstream A (academic) and Workstream B (community) separate

V1 conflated PubMed-derived researchers with NPPES community providers. V2 keeps them separate:
- Workstream A: PubMed → OpenAlex → Step B/C creates hcps_v2 rows for researchers
- Workstream B: NPPES Parquet filtered by NPI taxonomy creates hcps_v2 rows for community providers
- Both populate the same hcps_v2 table but via different paths
- NPI is the disambiguator when both find the same person

---

## What is in v2 schema right now

14 tables total. All with RLS enabled and public-read policies.

### Core tables (Phase 1, May 21 morning)

**hcps_v2** (33 columns) — Canonical HCP records. Empty until Step C runs.

**hcps_therapeutic_areas_v2** (4 columns) — TA tagging with CHECK constraint (publication_count >= 3). Empty until ta_tagging_rebuild.py runs.

**hcp_openalex_authors_v2** (9 columns) — Multi-shard OpenAlex linkages. Empty until Step C runs.

**hcp_scores_v2** (11 columns) — Composite + normalized + tier scoring. Empty until scoring_pipeline.py runs against v2.

**hcp_narratives_v2** (7 columns) — Claude-generated narratives. Empty until generate_narratives_v2.py runs against v2.

**hcp_open_payments_summary_v2** (15 columns) — Industry payment aggregation. Empty until open_payments_aggregator.py runs against v2.

**hcp_medicare_summary_v2** (9 columns) — Medicare claims aggregation. Empty until medicare_aggregator.py runs against v2.

**pipeline_runs** (12 columns) — Observability/audit table. Empty.

**dol_canonical_overrides** (5 columns) — Manual DOL-to-HCP overrides. Empty.

**tracked_conferences** (7 columns) — ASCO, EASL, ESMO, AASLD configured.

### Publications tables (Phase 1 Addendum 2, 3, 5)

**publications_v2** (24 columns including OpenAlex enrichment columns added in Addendum 5)
- Schema corrected from initial wrong design (was modeling row-per-author-pub, now correctly row-per-publication with JSONB authors)
- Currently 392,547 rows
- OpenAlex enrichment in progress

**publication_therapeutic_areas_v2** (4 columns) — 477,843 rows currently. Tags publications to TAs with hierarchy support (NSCLC pubs tagged as both NSCLC and Oncology).

**publication_authors_v2** (10 columns) — Empty. Will be populated by Step F after Step C and Step B run.

### Trials tables (Phase 1 Addendum 6)

**clinical_trials_v2** (17 columns) — Empty. Schema designed to match what trials_pipeline.py writes.

**trial_investigators_v2** (15 columns) — Empty. Schema corrected from initial wrong design. Has all investigator_raw_* fields needed by trials_pipeline.py.

### Supporting tables (UNCHANGED from v1, shared)

These are NOT v2-suffixed; they exist as single shared tables in the database:

- **therapeutic_areas** — TA taxonomy (Hepatology, NSCLC, Oncology, Rare Disease, Immunology, etc.). Hierarchy via parent_ta_id.
- **therapeutic_area_ingestion_config** — PubMed queries per TA. Only Hepatology and NSCLC are active.
- **openalex_author_inventory** — Will be repopulated by inventory_openalex_authors.py.
- **nppes_org_to_ror** — NPPES org name to ROR ID mapping.
- **ror_to_country** — ROR ID to country code mapping.
- **canonical_hcps_snapshot** — Pinned canonical HCPs.

### Missing from v2 schema (must address tomorrow)

**RPC function `upsert_trial_investigators_preserving_match`** — Postgres function used by trials_pipeline.py. Exists in v1, not yet defined for v2 path. Either modify to accept target table parameter, OR replace RPC call with direct upsert in v2 mode.

---

## What scripts are v2-ready

These five scripts have been modified with --target-version flag and proper routing:

| Script | Day 2 Step | Status |
|--------|-----------|--------|
| ingest_publications.py | Already executed for Day 1 | DONE |
| openalex_pipeline.py | Currently running | IN PROGRESS |
| inventory_openalex_authors.py | Day 2 step 1 | READY |
| run_step_c_create_hcps.py | Day 2 step 2 | READY |
| career_enrichment_from_clusters.py | Day 2 step 3 | READY |

### Tomorrow's exact launch sequence

After confirming openalex_pipeline.py completed (or got far enough):

```powershell
cd C:\Users\garre\Desktop\FieldMark

# Step 1: Build OpenAlex author inventory from enriched publications_v2
python inventory_openalex_authors.py --target-version v2 --truncate

# Step 2: Step C - create HCPs from inventory clusters (dry-run first!)
python run_step_c_create_hcps.py --target-version v2 --dry-run --limit 100
# Review output, then if good:
python run_step_c_create_hcps.py --target-version v2

# Step 3: Career enrichment (dry-run first, then 10-HCP test, then full)
python career_enrichment_from_clusters.py --target-version v2 --dry-run --limit 10
# Verify Gulley/Sanyal/Loomba get correct first_pub_year. Then:
python career_enrichment_from_clusters.py --target-version v2
```

Each step has its own runtime. Inventory ~30 minutes. Step C ~1-2 hours. Career enrichment ~6 hours overnight.

---

## What scripts still need v2 routing (Day 2-4 work)

In approximate priority order:

### High priority (Day 2-3)

1. **run_step_b_matching.py** — Matches existing HCPs to OpenAlex authors. In v2, this runs AFTER Step C for any HCPs that came in via Workstream B but need OpenAlex linkage.

2. **run_step_b_plus_reconcile.py** — Step B+ name-based rescue. Runs after Step B.

3. **trials_pipeline.py** — Has RPC dependency that needs to be resolved before this can be modified.

4. **trial_investigator_matcher.py** — Matches trial investigators to HCPs. Runs after trials_pipeline.py.

5. **nppes_workstream_b_ingest.py** — Workstream B community HCP ingestion from NPPES Parquet. NEEDS: a published path for hcps_v2 IDs that don't collide with Step C-created IDs.

### Medium priority (Day 3-4)

6. **nppes_api_backfill.py** — NPPES taxonomy backfill for HCPs with NPI.
7. **nppes_enrichment.py** — Full NPPES enrichment from Parquet.
8. **targeted_nppes_enrichment.py** — Targeted NPPES enrichment for publication-side HCP records.
9. **affiliation_profiler.py** — Classifies institutional affiliations.

### Late priority (Day 4-5)

10. **open_payments_aggregator.py** — Aggregates Open Payments data.
11. **medicare_aggregator.py** — Aggregates Medicare claims.
12. **scoring_pipeline.py** — Composite + normalized + tier scoring. CRITICAL — this is the output that powers everything downstream.
13. **generate_narratives_v2.py** — Claude narratives. The "_v2" in this name is misleading; it's the second iteration of the narrative script, NOT "rebuild v2". Already sophisticated.
14. **dol_matching.py** — DOL matching against hcps_v2.

### Day 5-6

15. Frontend cutover: modify ~20 query functions to read from v2 tables instead of v1.
16. Pilot 50 validation against known HCPs (Gulley, Sanyal, Loomba, Younossi, Pawlik, Kudo, etc.).
17. Drop v1 tables after validation.

### Brand new scripts to write

- **ta_tagging_rebuild.py** — Assigns TAs to HCPs based on publication evidence (≥3 publications threshold per TA). NEW script, not modification.

---

## The --target-version flag pattern

All script modifications follow this pattern. New scripts should use the same pattern.

### Pattern

```python
# Near top of file, after imports, before constants:
def get_table_name(base_name: str, target_version: str) -> str:
    """
    Returns the correct table name based on --target-version flag.
    v1 returns base_name unchanged. v2 appends _v2 suffix.
    """
    if target_version == "v2":
        return f"{base_name}_v2"
    return base_name


# In argparse block:
parser.add_argument("--target-version", choices=["v1", "v2"], default="v1",
                    help="Schema version to write to. v1=legacy tables, v2=rebuild tables.")


# Inside any function that does supabase.table("xxx"):
def some_function(supabase, target_version: str = "v1"):
    table_name = get_table_name("xxx", target_version)
    supabase.table(table_name).select(...).execute()
```

### Important nuances

**Shared tables stay hardcoded.** Tables that exist as single shared resources (therapeutic_areas, openalex_author_inventory, nppes_org_to_ror, ror_to_country, canonical_hcps_snapshot, therapeutic_area_ingestion_config) keep hardcoded names. Don't route these through get_table_name.

**Checkpoint files need v2 isolation.** Scripts with checkpoint files (openalex_pipeline.py, trials_pipeline.py) need separate v1 and v2 checkpoint filenames so they don't poison each other.

**Belt-and-suspenders for dangerous paths.** openalex_pipeline.py has explicit safety guard that skips Phase 2 (career enrichment) in v2 mode regardless of --skip-career-enrichment flag. This prevents accidental data corruption if someone forgets the flag.

---

## Critical bugs caught on Day 1 (lessons learned)

### Bug 1: publications_v2 schema was wrong initially

Initial Phase 1 schema modeled publications_v2 with hcp_id as NOT NULL column — assuming row-per-author-per-publication. Wrong. V2 architecture is row-per-publication with JSONB authors. Dropped and recreated in Phase 1 Addendum 3.

**Lesson:** Don't mirror v1's denormalized patterns when designing v2.

### Bug 2: Missing OpenAlex enrichment columns

openalex_pipeline.py writes 9 columns (citation_count, citation_counts_by_year, authorships, primary_location, publication_type, openalex_concepts, open_access, openalex_enriched_at, citation_count). Initial publications_v2 schema only had 4 of them. First run produced 100% write failures.

Fixed in Phase 1 Addendum 5: added primary_location, publication_type, openalex_concepts, open_access.

**Lesson:** When modifying a script for v2, also verify the target schema has every column the script writes. Don't assume schema matches script.

### Bug 3: Bulk upsert is wrong for partial-column updates

To speed up writes, attempted to refactor openalex_pipeline.py from per-row .update() to bulk .upsert(). This failed because Supabase upsert tries to insert when ON CONFLICT key doesn't match, which fails NOT NULL constraints on other columns (specifically `source`).

Reverted to per-row .update(). Slow but correct.

**Lesson:** Supabase upsert is for full-row writes. For partial updates, use .update().eq().

### Bug 4: trial_investigators_v2 initial schema was wrong

Initial schema had wrong columns (id, hcp_id, trial_id, nct_number, role, phase, status, match_method, match_confidence, ingested_at). Missing all investigator_raw_* fields and source field. Wrong shape entirely.

Dropped and recreated in Phase 1 Addendum 6 with correct shape matching what trials_pipeline.py writes.

**Lesson:** Read the actual script to determine schema needs. Don't guess from table name.

---

## Honest assessment of where we are

### What we did well

- Correctly diagnosed the Gulley problem (first_pub_year=2025 despite Step B linkages from May 20)
- Made the right architectural call (Path B over Path C)
- Built schema corrections as we discovered gaps, didn't paper over
- Maintained strangler-fig pattern throughout — v1 stays alive
- Caught architectural mistakes during code review (bulk upsert pre-revert)
- Resisted temptation to take shortcuts

### What was harder than expected

- Schema design required multiple addenda (4 corrections to Phase 1) as gaps surfaced
- OpenAlex API throughput is the bottleneck for enrichment (8-10 hours, not 30 minutes)
- The script ecosystem is larger than initially understood (75+ Python files, not 12-15)

### What we still don't know

- Whether the multi-shard OpenAlex linking actually produces correct results at scale (we'll know after Step C + career_enrichment_from_clusters runs on Day 2)
- Whether Workstream A/B integration works correctly (we'll know after both run on Day 3)
- Whether the verified 33 DOLs from v1 land correctly in v2 (pilot 50 validation on Day 4-5)

### Realistic timeline

Original spec said 6 days. Today completed roughly 80% of Day 1's scope. Remaining work:

- Day 2 (May 22): Inventory + Step C + career enrichment for hcps_v2 academic population
- Day 3 (May 23): Workstream B (community NPPES) + trials + RPC fix
- Day 4 (May 24): NPPES enrichment + affiliation profiler + Open Payments + Medicare
- Day 5 (May 25): scoring + narratives + DOL matching
- Day 6 (May 26): Frontend cutover + pilot 50 validation
- Day 7 (May 27): Buffer / fixes / refinements
- Day 8 (May 28): Lock for ASCO

This assumes no major surprises and ~6-hour focused workdays. Honest reality: probably some slippage. If we're done by end of May, that's still ahead of the mid-June demo target.

---

## Open architectural questions for Day 2+

These don't need to be resolved tonight but should be addressed before relevant scripts run:

### Question 1: RPC function for trials

trials_pipeline.py calls `c.rpc("upsert_trial_investigators_preserving_match")`. This RPC exists in v1 schema, not v2. Options:

A. Create v2 version: `upsert_trial_investigators_v2_preserving_match` with parallel logic targeting trial_investigators_v2.

B. Modify existing RPC to accept a target table parameter.

C. Replace RPC call with direct Supabase upsert in script for v2 mode.

Decision deferred. Discuss when prepping trials_pipeline.py modifications.

### Question 2: hcps_v2 identity hash strategy

hcps_v2 schema has `identity_hash` column (UNIQUE NOT NULL). What goes in it? Options:

A. Hash of (NPI || first_name || last_name) when NPI exists, else hash of (first_name || last_name || institution_ror).

B. Hash of OpenAlex author ID cluster (sorted, joined).

C. UUID (effectively unused for identity).

Current Step C script doesn't write identity_hash. Either fix Step C to write it, or change schema to not require it.

Decision needed before Step C runs against v2.

### Question 3: TA tagging logic for ta_tagging_rebuild.py

The new script we need to write. Key questions:

- Publication evidence: HCP gets a TA tag for any TA where they have ≥3 publications via publication_authors_v2 join.
- Should publication count be raw, or weighted by recency? (V1 was raw count.)
- Should single-author publications count differently than co-authored? (V1 didn't distinguish.)
- Should there be a minimum publication year filter? (V1 didn't have one.)

These are product decisions. Defer until script is being written.

### Question 4: Workstream B community ingestion timing

nppes_workstream_b_ingest.py creates hcps_v2 rows directly from NPPES Parquet — NOT going through OpenAlex first. Question: when in Day 2/3 should this run?

Options:

A. After Step C (academic) completes. Step C creates academic HCPs first. Then Workstream B adds community HCPs. NPI is the disambiguator.

B. Before Step C. Workstream B is a separate path; runs independently.

C. In parallel with Step C using different ID ranges.

Recommendation: A. Reasoning: most rigorous identity check happens in Step C; Workstream B adds community providers who may or may not have publication footprint.

---

## Files of record

### In repo (`C:\Users\garre\Desktop\FieldMark`)

**Documentation:**
- `Latest Documentation/fieldmark_foundation_rebuild_spec.md` — Original spec from morning of May 21
- `Latest Documentation/fieldmark_foundation_rebuild_addendum_1.md` — Updates from script inventory work
- `Latest Documentation/day_2_launch.md` — THIS DOCUMENT

**SQL migrations (`sql/rebuild/`):**
- phase1_schema.sql
- phase1_rls_policies.sql
- phase1_addendum_open_payments_medicare.sql
- phase1_addendum_2_publications_ta.sql
- phase1_addendum_3_publications_v2_correction.sql
- phase1_addendum_4_authorships_column.sql
- phase1_addendum_5_openalex_enrichment_columns.sql
- phase1_addendum_6_clinical_trials_and_investigators.sql

**Modified scripts (with --target-version flag):**
- ingest_publications.py
- openalex_pipeline.py
- inventory_openalex_authors.py
- run_step_c_create_hcps.py
- career_enrichment_from_clusters.py

**Branch:** `foundation-rebuild` in `grg360/FieldMark`. All work committed and pushed.

### In Supabase

Project: `tflrfkocbdkizmkhimiw.supabase.co`

14 v2 tables (all with RLS + public-read policies). v1 tables untouched.

Latest scheduled backup: May 21, 2026 12:19:09 UTC. This is the rollback point if anything goes catastrophically wrong.

### Checkpoint files (in repo root, not committed)

- `openalex_checkpoint.json` — v1 checkpoint (May 15)
- `openalex_checkpoint_v2.json` — v2 checkpoint (currently being written by running script)

---

## How to resume tomorrow

### Morning checklist

1. Open this document. Read it fully.

2. Verify openalex_pipeline.py completed:
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE openalex_enriched_at IS NOT NULL) AS enriched,
     COUNT(*) AS total,
     ROUND(100.0 * COUNT(*) FILTER (WHERE openalex_enriched_at IS NOT NULL) / COUNT(*), 1) AS pct
   FROM publications_v2;
   ```
   Expected: pct > 95%. If pct < 80%, decide whether to wait for completion or proceed with partial data.

3. Check git status: `git status` and `git log -10 --oneline`. Confirm no uncommitted work.

4. Confirm branch: `git branch --show-current`. Must be `foundation-rebuild`.

5. Confirm v2 schema unchanged:
   ```sql
   SELECT COUNT(*) AS v2_tables 
   FROM information_schema.tables 
   WHERE table_schema = 'public' AND table_name LIKE '%_v2';
   ```
   Expected: 13. (Plus pipeline_runs, dol_canonical_overrides, tracked_conferences = 16 total rebuild-era tables.)

6. Decide on Question 2 (identity_hash strategy). Modify Step C or schema as needed.

7. Launch Day 2 step 1: inventory_openalex_authors.py.

### If starting a fresh chat

The new chat will have Anthropic memory but limited context about today's specifics. Paste a brief opener:

> Continuing FieldMark foundation rebuild Path B execution. Day 1 complete except OpenAlex enrichment running overnight. Read `Latest Documentation/day_2_launch.md` in the repo for full state. Branch: foundation-rebuild. Currently waiting on openalex_pipeline.py completion before running inventory_openalex_authors.py.

That should be enough orientation. Then point Claude at this document for full context.

---

## What this document is NOT

- It is not the spec. The spec lives in `fieldmark_foundation_rebuild_spec.md`.
- It is not a script. It is documentation.
- It is not exhaustive. The codebase has detail this document doesn't capture.
- It is not eternal. Tomorrow's Day 2 work will produce Day 3 launch documentation.

---

## Final notes

Today was substantial. We avoided shortcuts. We caught real bugs. The architecture is sound.

If the rebuild succeeds, today's restraint to NOT take Path C shortcuts will be the deciding factor. Path C would have produced "demo-ready data" faster but with known integrity gaps. Path B produces correct data with verified integrity at every step.

The data foundation underneath FieldMark matters more than the timeline. Garrett made this call explicitly. Honor it tomorrow.

---

**End of Day 2 launch document.**
