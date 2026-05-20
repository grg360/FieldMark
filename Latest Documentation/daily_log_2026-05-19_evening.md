# FieldMark Daily Log — May 19, 2026 (Evening Session)

## Session arc
Continued from May 19 afternoon. Started ~1pm with frontend detail-screen polish, ended ~midnight after major backend dedup work. ~11 hours total elapsed including breaks.

## What got shipped (frontend, demo-visible)

### Community detail screen — fully demo-ready
- IDENTIFICATION section added (NPI, full address, specialty, View on NPI Registry link)
- Score Breakdown with cohort-appropriate metrics: Pharma Engagement / Pharma Companies / Patient Volume / Years in Practice
- Engagement Mix donut chart with 3-branch logic:
  - 3+ payment types → full donut + 2-column legend
  - 1-2 payment types → compact text + greenfield framing for research cohorts
  - 0 payment types → "no engagement" callout
- Engagement Timeline (3 bars: 2022/2023/2024) and Patient Volume Timeline (3 bars: 2021/2022/2023) for Community
- Cohort-colored bars (slate blue throughout for Community)
- Cohort-aware back link ("Community"/"Established"/"Rising stars") and section header ("WHY THIS PRACTITIONER" etc)
- Validate This Signal: title case labels, 0% / 0 MSLs zero-state, toggleable buttons (click selected to deselect)
- Cohort Score as hero pill (28px, gold #FFB84D)
- Right column simplified: Identification → Cohort Score → Field Notes (stub)
- Frame around detail body (1px border all sides, subtle box shadow, rounded corners)
- Section headers brightened from #6B6A65 to #E8E6DF for proper hierarchy

### Rising Star / Established detail screens — reached parity (mostly)
- Same shell improvements (Identification, frame, cohort colors, narrative section labels)
- Score Breakdown wired to REAL data (pub_velocity_score, citation_trajectory_score, trial_investigator_score)
- No more hardcoded 94/88/81/76 fake values
- Career Age Multiplier dropped (was an internal scoring artifact, not a meaningful user metric)
- Citation Trajectory shows +/- sign prefix
- Engagement Mix renders for all cohorts where data sufficient

### Auth screen
- FM logo scaled from 60-72px to 96-110px
- FIELDMARK wordmark from 14-16px to 22-24px
- Both in FieldMark gold; tighter spacing as one branded unit

### Backend filters
- API layer filters all cohort feeds to country='USA'
- Country data normalization: TX/Houston/MD USA/IL 61801/Fairfax garbled values consolidated to USA
- Established US count now 578 (was 570 + 8 misclassified)

### Narrative pipeline
- Skip-if-exists logic added to generate_narratives_v2.py
- Function: load_existing_narrative_keys(supabase, model_version)
- Skips HCP×TA pairs that already have narratives for the current model_version
- --force flag bypasses skip
- Power outage at 9:15pm UTC killed initial run at 1,258/1,506 narratives
- Resumed afterward with skip-logic, completed ~248 remaining
- Final narrative count: ~1,504 narratives stored

## What got shipped (backend, mostly invisible)

### HCP deduplication — partial success
**Goal:** Consolidate duplicate HCP records where the same person appears multiple times due to name variations + ingestion timing.

**Scope worked through:**
- 1,880 duplicate name groups identified
- 4,031 total duplicate records
- 1,490 safe pairs merged (canonical has NPI, duplicate doesn't OR same NPI)
- 251 DIFFERENT_NPI pairs NOT merged (different real physicians sharing name — Robert Hamilton, Matthew Lee, etc.)
- 410 BOTH_NULL_NPI pairs NOT merged (no way to verify same-person)

**Foreign keys remapped:**
- publication_authors: 39,925 rows
- publications: 4,227 rows
- hcp_scores: 1,503 rows deleted
- hcp_therapeutic_areas: 1,503 rows merged
- hcp_open_payments_summary: 103 rows
- hcp_open_payments_by_ta: 32 rows
- hcp_medicare_summary: 63 rows
- hcp_narratives: 8 rows
- hcp_openalex_authors: 2,572 rows
- trial_investigators: 231 rows
- npi_match_proposals: deleted
- nppes_enrichment_log: 1 row deleted

**Final cleanup:** 1,490 duplicate hcps records deleted.

**Re-ran Established cohort scoring SQL (Option C, weight 50/10/25/15, publication floor 70 for pubs ≥800).**

### Critical lesson learned: Supabase web SQL editor transaction quirk
- BEGIN/UPDATE/verify/COMMIT pattern did NOT persist across statements
- Verify queries returned misleading 0 because they ran in the same uncommitted transaction
- Lost ~2 hours to this before catching it
- Lesson: in Supabase web SQL editor, run each UPDATE as standalone statement, verify in separate query
- Multi-statement transactions don't work reliably

## What didn't get the expected payoff

**Honest meta:** dedup did its job on structural cleanup but didn't materially improve the visible leaderboard.

**Top of Established leaderboard before dedup:**
- #1 Kai Wang (100.00, 7206 pubs)
- #2 Jin Li (99.68)
- #3 Jing Li (99.20)
- #4 Marc Ladanyi (97.76)
- #14 Rob Knight (93.91)

**Top of Established leaderboard after dedup:**
- #1 Kai Wang (100.00, 7206 pubs) — unchanged
- #2 Jin Li (99.68) — unchanged
- #3 Jing Li (99.19) — unchanged
- #4 Marc Ladanyi (97.73) — unchanged
- #14 Rob Knight (93.83) — unchanged

**Winners from dedup:**
- Stephen J. Chanock: was invisible (0 pubs on classified record) → now 85.28 with 2,207 pubs
- Modest score lifts for Sanyal, Loomba, Minna
- A few "floor 70" canonicals (Wakelee, Chalasani, Rothman, Carl June) stayed at floor because their underlying composite still computes low (sparse non-pub signals)

**Why the leaderboard didn't move:**
- Kai Wang at 7,206 pubs is NOT a dedup-inflated record. His record genuinely has 7,206 pubs in our DB — this is either real (some systems biology figures do publish at this volume) OR OpenAlex author identity collapsed multiple Kai Wangs BEFORE our ingestion
- Wei Zheng, Jin Li, Hua Wang same pattern — they're not duplicates in our hcps table, they have legitimate single records with possibly-inflated OpenAlex-level pub counts
- Rob Knight and Hua Wang in NSCLC are TA misclassification (microbiome/materials science researchers caught by co-authorship-based TA assignment), not dedup issues

## Contamination accepted (v1.0)
- 11 classified HCPs (Wei Chen, Richard Lee, Yu Liu, etc) have minor publication contamination from bad merges — mostly invisible (floor 70 or sub-80 scores, not demo-prominent)
- 189 Community HCPs have similar minor contamination — invisible at 1.4% of 13,690 Community
- 51 unclassified HCPs — completely invisible
- No Open Payments / Medicare contamination (those tables were only merged for safe pairs)

## Database state at end of session
- 1,490 duplicate hcps records deleted
- 39,925+ foreign key references remapped to canonicals
- Established cohort scores recomputed
- Narratives: 1,504 total
- All cohort feeds country-filtered to USA at API layer
