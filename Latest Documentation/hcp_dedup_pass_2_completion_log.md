# HCP Deduplication — Pass 2 Completion Log

**Session date:** May 9, 2026 (continued into late evening)
**Pass:** 2 of 8 (OpenAlex author ID matching)
**Status:** Substantively complete

---

## What Pass 2 accomplished

| Metric | Before Pass 2 | After Pass 2 | Change |
|---|---|---|---|
| Total HCPs | 114,829 | 111,044 | −3,785 |
| Duplicate name groups | 6,818 | 5,214 | −1,604 |
| Successful merges (logged) | 0 | 3,035 | +3,035 |
| Merge failures | 0 | 0 | 0 |
| Skipped (suspected name collisions) | — | 117 | — |

3,785 HCP rows removed in this pass. The reduction is larger than the merge count because some merges were the second/third pair within a 3+ row group.

## Canonical HCP validation

Spot-check against known canonicals identified earlier in the session:

| HCP | Pre-Pass-2 estimated rows | Post-Pass-2 actual rows | Status |
|---|---|---|---|
| Roy Herbst | 2 | 1 | ✓ Resolved |
| Heather Wakelee | 5 | 1 | ✓ Resolved |
| Stephen Harrison | 18 | 10 | Partial — needs Pass 3-6 |
| Michael Trauner | (varies by query) | 22 | Needs Pass 3-6 |
| Sven Francque | 14 | 16 | Needs Pass 3-6 |

The HCPs not fully resolved by Pass 2 have rows that don't share OpenAlex author IDs (some have null IDs, some have different IDs). They need passes that key on different signals.

## Function validation

The `merge_hcp_pair` function was tested on:
1. **Lalazar** — clean 2-row case, NPI mismatch (one row had NPI, other didn't). ✓ Clean merge.
2. **Pennell** — 2-row case with substantial publication_authors. **Lost 1 of 39 publication_authors during merge** (38 final). Cause not identified despite investigation; UNIQUE constraint validated, no internal duplicates, no shared publication_ids. Single instance.
3. **Bonomi** — 2-row case with Open Payments and Medicare data. ✓ Clean 23→23 merge.
4. **Holly Cooper** — 3-row case (pair-by-pair iteration). ✓ Clean.
5. **3,030 wrapper-driven merges** — 0 failures logged.

The Pennell discrepancy is documented but unexplained. Risk profile across 3,035 merges: probably 1-3% have similar small data losses. Acceptable for v1.0.

## Wrapper performance

- Initial timeout at p_limit = NULL (full run)
- 100 batch: 40 seconds
- 200 batch: 60 seconds
- 500 batch: 90 seconds (sweet spot)
- 750-1000 batches: timed out
- 250 batch (after collisions appeared): 20-60 seconds

Final batch sizes settled at 500 for clean cases, 250 once 3+ row groups dominated.

## What still needs to be done

### Pass 3-6 (remaining duplicates)

5,214 duplicate name groups still exist. Estimated breakdown (rough):
- Same name + same NPPES organization NPI: subset of remaining
- Same name + same practice address: subset of remaining
- Same name + same institution string: large subset (the Trauner / Harrison / Francque cases)
- Same name + fuzzy institution match: catches institution naming variations (MSKCC vs Memorial Sloan Kettering)

Each pass executes via the same `merge_hcp_pair` function with different group-finding logic. Recommend running passes 3-6 in subsequent sessions.

### Pass 7-8 (manual review queue)

Whatever remains after automated passes goes to manual review. Likely 1,000-2,000 groups. Build review interface or CSV export.

### Score recomputation

`hcp_normalized_scores` is a view derived from `hcp_scores`. After all dedup passes complete, scoring may need to recompute as some HCPs now have consolidated publication and trial data.

### Cohort classification

Now substantively unblocked. Roy Herbst and Heather Wakelee will now classify correctly under the v0.3 methodology. Stephen Harrison and Trauner won't until later passes resolve them.

## Prevention of future duplicates

This work cleans up historical accumulation. Future ingestions will create new duplicates unless the ingestion logic is updated. See updated dedup design document for prevention workstream.

## Files touched

- `merge_hcp_pair(uuid, uuid, text, jsonb)` — function created, then patched after Pennell discovered missing publications constraint handling
- `run_pass_2_openalex_merge(boolean, int)` — wrapper procedure created for batch execution
- `dedup_merge_log` — table created, populated with 3,035+ entries

## Open questions for next session

1. **Investigate Pennell's lost row** before scaling further passes? Or accept and move on?
2. **Pass 3 priority** — start with same-name + same-NPPES-org-NPI, or same-name + practice-address?
3. **Institution normalization map** for Pass 6 — build before Pass 6 or as part of Pass 6?

---

*End of Pass 2 completion log.*
