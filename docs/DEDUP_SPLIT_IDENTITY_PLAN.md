# Split-identity dedup — root cause and plan (2026-08-06)

Parked for after the demo. Written while the reasoning is fresh (found via the
Aditi Singh duplicate on the rising demo path).

## Root cause — structural, not a backlog of merges

Two ingestion pipelines mint HCP records for the same physician and never join:

- **OpenAlex / publications** → a record with **institution + publications**,
  an OpenAlex author id, TA tags, and a cohort classification driven by
  scientific output. **No NPI.**
- **NPPES / Medicare** → a record with an **NPI + Medicare / Open Payments**
  footprint and NPPES demographics (state, city, setting). **No institution,
  no publications.**

They fail to merge because **the NPPES-sourced record is never
identity-hashed** — `hcps_v2.identity_hash` is NULL on it, and the dedup
matcher keys on `identity_hash`. A record that was never hashed never enters
the matcher, so its publication twin is never even considered. The Aditi Singh
case was exactly this: `cccf408c` (NPI 1285041905, community, `identity_hash`
NULL) vs `659e0892` (UPenn, 35 pubs, rising, hashed). Same clinician, two rows.

This is a **pipeline gap**, not 3,177 individual merges. Backfilling the hash
lets the *existing* matcher find these pairs the normal way.

## The number

Split-identity signature — an OpenAlex-only record (NPI null, institution
present, pubs > 0) sharing last-name + first-token with an NPPES-only record
(NPI present, institution null, 0 pubs):

- **6,077** name-pairs · **5,159** distinct OpenAlex records · **3,177**
  distinct NPPES records (measured 2026-08-06).

This is an **upper bound**. Common names inflate it — two genuinely different
"David Smith"s (one academic, one community) match the signature but are not a
duplicate. The pair count (6,077) exceeding either distinct set is the tell.
The true duplicate count is lower and must be confirmed, not assumed.

## The fix

1. **Backfill `identity_hash` on the NPPES-sourced records.**
   `scripts/classify/backfill_identity_hash.py` already exists for this. Run it
   over the records with NULL `identity_hash` so they carry the same hash basis
   as the OpenAlex records.
2. **Re-run the dedup matcher.** The matcher then proposes the true pairs into
   `dedup_candidates_phase1.csv` (the same CSV `dedup_merge.py` consumes).
3. **Merge with `dedup_merge.py`.** Survivor precedence already favours the
   publication record (publinks > works_count > has-NPI > is_primary > id), so
   the OpenAlex record survives and the NPPES record folds in its NPI — the
   direction the Aditi merge validated. NPI provenance travels with the NPI
   (`npi_source` precedence). Merges are transactional and dry-runnable.

## What a dry-run over the 3,177 must confirm before it runs

The single-pair Aditi merge exposed the checks that matter at scale:

1. **Hash basis matches.** Confirm `backfill_identity_hash.py` computes the hash
   on the same normalised name basis the OpenAlex records used — otherwise the
   backfilled hashes won't collide with their twins and the matcher finds
   nothing. Spot-check on the known Aditi pair first (they must hash equal).
2. **False pairs are filtered.** The matcher must not merge same-name different
   people. Require corroboration beyond name — the NPI's NPPES specialty/state
   agreeing with the publication record's TA/institution geography, or an
   explicit tier gate on the candidate CSV — and review the
   `recommended_action` distribution before executing any tier.
3. **Cohort collision is handled.** When an NPPES record is `community` and its
   publication twin is `rising`/`established`, the survivor keeps the
   publication cohort and the community score/rank artifacts must be dropped
   (as done manually for Aditi: strip `hcp_community_scores_v2`,
   `hcp_score_ranks_v2` cohort='community', and the orphan
   `hcp_cohort_classification_v2` row). Decide whether `dedup_merge.py` should
   do this automatically for the cohort-mismatch case, or whether it stays a
   post-merge cleanup step. **Today it does NOT** — it re-points the community
   score to the survivor, which would put a rising star in the community
   full-board unresolved tier unless stripped.
4. **Orphan cleanup.** `hcp_cohort_classification_v2` has **no FK** to
   `hcps_v2`, so a stub delete leaves its taxonomy row dangling. The sweep must
   delete these explicitly (keyed on the deleted stub id) or they accumulate.
5. **NPI conflicts.** `dedup_merge.py` logs `[NPI_CONFLICT]` when both sides
   hold different non-null NPIs. At 3,177 scale, capture that log and review it
   — a discarded NPI is a real signal loss.

## Demo-path note

The Aditi pair is resolved (merged 2026-08-06, single clean rising record).
Before the demo, spot-check the other demo-path names for the same signature
so none surfaces on camera — see the twin check run alongside this plan.
