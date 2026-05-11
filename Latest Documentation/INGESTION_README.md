# Ingestion Scripts — READ BEFORE RUNNING

**Last updated:** May 10, 2026
**Critical dependency:** HCP duplicate prevention not yet implemented at ingestion time.

---

## Background

On May 9-10, 2026, we ran a major HCP deduplication workstream that consolidated ~5,500 duplicate HCP rows across 5 automated passes. Database is in a clean state.

**However:** ingestion-time prevention has NOT been implemented. The scripts in this directory (publication backfill, NPPES enrichment, Open Payments ingestion, Medicare ingestion) currently INSERT new HCP rows without checking for existing matches. **Running these scripts will re-introduce duplicates.**

## Before running ANY ingestion script:

1. **Check the prevention workstream status.** See `Latest Documentation/hcp_dedup_prevention_addendum.md` — has the ingestion-time matching logic been added to the script you're about to run? If yes, proceed. If no, see step 2.

2. **If prevention isn't implemented:** Plan to run a cleanup dedup pass AFTER your ingestion completes. Use the `merge_hcp_pair` function in the database and the existing wrapper procedures (`run_pass_2_openalex_merge`, `run_pass_5_institution_merge`, `run_pass_6_fuzzy_institution_merge`, `run_pass_7_openalex_state_merge`, `run_pass_7b_initialized_name_merge`). These should be run sequentially after any major data ingestion until prevention work is done.

3. **Verify Supabase backups are recent.** Daily backups should be on. If you're running a major ingestion, manually trigger a backup point in Supabase Settings → Database → Backups before starting.

## Files in this directory (or wherever ingestion scripts live)

Update each ingestion script to include this comment block at the top:

```python
# ============================================================
# HCP DUPLICATE PREVENTION — TODO (v1.1)
# ============================================================
# This script currently INSERTs HCP rows without checking for
# existing matches. Until prevention is implemented:
#  - Plan to run dedup wrappers after this script completes
#  - See: Latest Documentation/hcp_dedup_prevention_addendum.md
# ============================================================
```

## Reference documentation

In `Latest Documentation/`:
- `hcp_dedup_completion_plan.md` — overall dedup roadmap
- `hcp_dedup_prevention_addendum.md` — implementation scope for prevention
- `hcp_dedup_pass_2_completion_log.md` — what cleanup accomplished
- `hcp_deduplication_design.md` — full design document
- `v1_1_backlog_updated_may10.md` — v1.1 priorities with prevention at #2

## When prevention is implemented

This README can be removed (or significantly shortened to just reference the ingestion-time matching logic). For now, it serves as a forcing function so that no one runs a major ingestion without thinking about duplicates first.

---

*End of ingestion scripts README.*
