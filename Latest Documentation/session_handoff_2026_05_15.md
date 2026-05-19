# FieldMark Session Handoff — May 15, 2026 (Morning)

## TL;DR — Where we are

The HCP cancer surgery is **complete**. The data foundation is clean. FieldMark has the integrity it needed before serious product work could proceed.

Today's priorities, in order:
1. Verify Step F summary numbers (you've already done this — they're clean)
2. Reconcile the 30 Step-C duplicates (small focused job)
3. Re-run trial investigator matching against clean HCPs (big payoff expected)
4. Configure NSCLC ingestion for ASCO (the strategic work)
5. Plan scoring rerun

ASCO is May 30. We have 15 days. The architecture supports it.

---

## Surgery completion — final state

**HCP population**: 131,404 clean HCPs
- 97,280 with openalex_author_id (74%)
- 30,082 with NPI (23%)
- 138,996 hcp_openalex_authors join rows
- 105,711 HCPs linked via at least one join row
- All 6 hepatology canonicals validated

**Publication linkage**: 1,946,027 publication_authors rows
- 94.4% direct OpenAlex matches (step_f_unique_hcp)
- 5.6% misattributed clusters disambiguated by institutional ROR
- 0.001% disambiguated by institution name
- 4.5% authorships orphaned (couldn't confidently attribute, correct behavior)
- 99,906 distinct HCPs have at least one publication_authors row (76% of population)
- 170,257 distinct publications represented

**Database state**:
- 233,215 publications total (none deleted in surgery)
- 230,822 publications have authorships JSONB populated
- 10,482 RORs mapped to country (100% coverage)
- 4,600 NPPES orgs mapped to ROR

---

## What the surgery solved

**Problem solved**: HCP duplication from the legacy PubMed pipeline's `(first_name, last_name, institution)` dedup logic. Real researchers had multiple HCP rows due to OpenAlex fragmentation; institution string variations; etc.

**Now**:
- Each real researcher is one HCP with stable identity
- Citation trajectories accurately reflect each researcher's full work
- Publication attribution is precise (not "all Yan Xiongs share papers")
- Trial investigator matching can finally produce reliable results
- Scoring methodology has clean inputs

**Critical architectural finding documented**: OpenAlex misattribution affects ~4.6% of HCPs (multiple distinct researchers collapsed under shared OpenAlex IDs, mostly common-name international researchers). The architecture now handles this correctly:
- `hcp_openalex_authors` join table is the source of truth (handles many-to-many)
- `hcps.openalex_author_id` is denormalized convenience only, NOT unique
- Step F's smart disambiguation attributes papers to the right specific HCP via institution/country
- No UNIQUE constraint on hcps.openalex_author_id (Step E was rejected as wrong architecture)

---

## Today's immediate work

### Task 1: Verify Step F summary (DONE)

Already verified:
- 1,946,027 total rows (matches 1,955,430 dry-run within 0.5%)
- Method breakdown matches dry-run almost exactly
- 99,906 distinct HCPs covered
- 170,257 distinct publications represented
- 31,498 HCPs have zero papers (all from expected sources — NPPES clinicians, publication_ingestion survivors, 35 edge cases from Step C)

### Task 2: Reconcile 30 Step-C duplicates (15-30 min)

During Step C, 30 inventory entries couldn't create new HCPs because matching `(first_name, last_name, institution)` rows already existed in hcps. These are real researchers (Bozkurt at Baylor, Sachin Wani at Colorado, Poultsides at Stanford, Ana M. Grau at Vanderbilt, etc.) whose existing HCP records weren't linked to OpenAlex during Step B.

Fix: For each of the 30 collisions, find the existing HCP and link the inventory entry to that HCP via `hcp_openalex_authors`. Recovers 30 OpenAlex linkages we know are correct.

This is a small focused script. Cursor can build it from the constraint violation logs in Step C's output (collisions printed at end of Step C live run).

### Task 3: Trial investigator rematch (half day)

Pre-surgery: 1,579 trial investigators matched to HCPs out of 115,020 records.
Post-surgery expectation: 10,000-25,000 matches.

Why such a jump:
- Pre-surgery: matching had to navigate duplicate HCPs and broken identity
- Post-surgery: 35K new HCPs (Step C) cover international researchers who are PIs on global trials
- Senior researchers like Martin Reck, Pusztai, Sands, Drescher should now match correctly

This is its own workstream. Existing trial_investigator_match script in the repo needs to be re-run against the clean HCP table.

### Task 4: NSCLC ingestion for ASCO (THE strategic work)

**Goal**: NSCLC TA at parity with Hepatology before ASCO (May 30).

**Current state of NSCLC**:
- 39,077 HCPs tagged to NSCLC (60% with OpenAlex, 30% with NPI, 9% join-only)
- Zero publications tagged to NSCLC
- No active pubmed_query in therapeutic_area_ingestion_config
- HCPCS codes configured for oncology drug administration signal
- DOL workstream around ASCO already planned

**What needs to happen**:

**4a. Modify ingest_publications.py to support indication-level configs.** Current script filters to `ta_level = 'broad_ta'` only. NSCLC is `ta_level = 'indication'`. Either:
- Modify script to also process indication-level configs (RIGHT answer — 1-2 hours of work)
- Or use Oncology broad_ta config as a workaround (loses NSCLC-specific tagging)

**4b. Finalize NSCLC PubMed query.** The query was drafted last night:

```
(
"Carcinoma, Non-Small-Cell Lung"[Mesh]
OR "Lung Neoplasms"[Mesh]
OR NSCLC[tiab]
OR "non-small cell lung cancer"[tiab]
OR "non-small-cell lung cancer"[tiab]
OR "non small cell lung cancer"[tiab]
OR "non-small-cell lung carcinoma"[tiab]
OR "non-small cell lung carcinoma"[tiab]
OR "lung adenocarcinoma"[tiab]
OR "pulmonary adenocarcinoma"[tiab]
OR "lung squamous carcinoma"[tiab]
OR "squamous NSCLC"[tiab]
OR LUAD[tiab]
OR LUSC[tiab]
OR LCNEC[tiab]
OR "large cell neuroendocrine carcinoma"[tiab]
)
AND
(
EGFR[tiab]
OR ALK[tiab]
OR ROS1[tiab]
OR KRAS[tiab]
OR "KRAS G12C"[tiab]
OR MET[tiab]
OR RET[tiab]
OR HER2[tiab]
OR ERBB2[tiab]
OR BRAF[tiab]
OR NTRK[tiab]
OR PD-1[tiab]
OR PD-L1[tiab]
OR CTLA-4[tiab]
OR immunotherapy[tiab]
OR checkpoint inhibitor*[tiab]
OR targeted therapy[tiab]
OR tyrosine kinase inhibitor*[tiab]
OR TKI[tiab]
OR osimertinib[tiab]
OR amivantamab[tiab]
OR lazertinib[tiab]
OR sotorasib[tiab]
OR adagrasib[tiab]
OR alectinib[tiab]
OR lorlatinib[tiab]
OR pembrolizumab[tiab]
OR nivolumab[tiab]
OR durvalumab[tiab]
OR trastuzumab deruxtecan[tiab]
OR T-DXd[tiab]
OR ctDNA[tiab]
OR NGS[tiab]
OR "liquid biopsy"[tiab]
OR "molecular profiling"[tiab]
OR resistance[tiab]
OR "acquired resistance"[tiab]
OR "osimertinib resistance"[tiab]
OR "metastatic NSCLC"[tiab]
OR "advanced NSCLC"[tiab]
OR "early-stage NSCLC"[tiab]
OR "resectable NSCLC"[tiab]
OR "unresectable NSCLC"[tiab]
OR survival[tiab]
OR PFS[tiab]
OR OS[tiab]
OR ORR[tiab]
OR HRQoL[tiab]
)
```

PubMed counts:
- All time: 134,231 papers
- 10 years: 83,367 papers
- 5 years: 48,515 papers

Decision: 10-year scope, matching Hepatology approach.

**4c. Insert NSCLC ingestion config row**:

```sql
INSERT INTO therapeutic_area_ingestion_config (
  therapeutic_area_id,
  pubmed_query,
  pubmed_max_results,
  pubmed_days_back,
  is_active,
  is_visible_in_ui
) VALUES (
  'c0065b03-a25e-4e9a-bde4-4b4d0db7827d',
  '<query above>',
  100000,
  3650,
  TRUE,
  TRUE
);
```

**4d. Run NSCLC ingestion.** Estimated 3-6 hours runtime for 83K papers.

**4e. OpenAlex enrichment of new NSCLC publications.** Estimated 6-12 hours.

**4f. Re-run inventory + Step B + Step C for new researchers.** Estimated 2-3 hours.

**4g. Re-run Step F to rebuild publication_authors with new NSCLC papers.** Estimated 60-90 minutes (smaller scope than original).

**4h. Configure NSCLC scoring weights and run scoring.** Estimated 1-2 hours.

**4i. Validate top NSCLC rising stars against known names.** Sniff test.

End-to-end realistic: 2-3 days of mostly-unattended pipeline time plus 4-6 hours of focused human work. ASCO-ready by May 17-20 with buffer.

### Task 5: Scoring rerun

After NSCLC is done, full scoring rerun across all TAs with clean data. Senior researchers will reshuffle. Rising stars will emerge correctly. The 80% precision target becomes testable.

---

## ASCO strategy

**Demo plan**:
- Hepatology as the "see what we built first" companion story
- NSCLC + DOL workstream as the primary oncology demo
- Maybe HCC since it bridges Hepatology and Oncology

**Strategic context**: Hepatology alone is proof of concept only (200-500 MSL universe). Need NSCLC for App Store / commercial viability. The 39K NSCLC HCPs already exist post-surgery. NSCLC ingestion completes the picture.

**Timeline**: 16 days to ASCO. With NSCLC ingestion completing May 17-18, you have 12 days for validation, demo polish, and DOL workstream completion.

---

## Documents to review (most important first)

**Foundational architecture** (read first if starting fresh):
1. `hcp_cancer_surgery_spec.md` — the complete surgery story, decisions, and outcomes. End-to-end through Step F.
2. `fieldmark_future_roadmap.md` — v1.5+ workstreams, OpenAlex misattribution handling plan, Collaborative Orbit, Medscape integration, all deferred items.

**Today's reference**:
3. This handoff document.

**Existing reference docs** (don't need to re-read but useful context):
- Methodology spec (rising star scoring composition)
- Filtering UI scope (v1.5 filter dimensions)
- LinkedIn OAuth readiness brief
- TA framework documents

---

## Working preferences (reminder for fresh chat)

- Push back when wrong; no manufactured optimism
- Cursor handles Python (preserves Claude.ai usage); paste prompts in single-fence boxes
- Supabase SQL editor for DB work
- Garrett's time estimates more accurate than Claude's
- Garrett can't manually review at scale
- Documentation discipline maintained throughout
- "Strategic thought partner, technical architect, AI layer designer, vibe coding collaborator"
- Speed to validation over perfection

---

## Files to consult in your repo

- `C:\Users\garre\Desktop\FieldMark\` — project root
- `ingest_publications.py` — the publication ingestion script that needs indication-level support
- `run_step_f_rebuild_publication_authors.py` — Step F (done)
- `run_step_b_matching.py`, `run_step_c_create_hcps.py`, `run_step_d_wipe.py` — surgery scripts (done)
- `inventory_openalex_authors.py` — OpenAlex inventory builder
- `enrich_ror_to_country.py` — ROR country enrichment (done)

---

## What yesterday taught us

**About Supabase**: It gets flaky under sustained load. Statement timeouts fire. Count queries 500. Multi-hour scripts need:
- Retry logic on every external call
- Resume capability (last_pub_id checkpointing)
- Smaller batch/page sizes than feel natural

**About Step F specifically**: The disambiguation logic worked perfectly in production. The dedup fix worked. The architecture's correct. The deployment infrastructure (timeouts, retries) is what needed hardening.

**About me (Claude)**: My confidence ran ahead of my certainty multiple times yesterday. "No reason it would behave differently from dry run" was wrong. "Just one more step" was wrong. Garrett caught the patterns and pushed back. In a fresh chat I should be more careful about predictions and clearer about what I don't actually know about the current codebase.

---

## How to start the fresh chat

Recommended opening message to Claude in the new chat:

> I'm continuing FieldMark work. The HCP cancer surgery completed yesterday — 131,404 clean HCPs, 1.94M publication_authors rows, OpenAlex misattribution handled correctly via hcp_openalex_authors join table. Read the handoff document and surgery spec to get oriented, then we plan today's work: Step C duplicate reconciliation, trial investigator rematch, and NSCLC ingestion for ASCO in 15 days.

The new Claude will need to read:
1. This handoff doc
2. hcp_cancer_surgery_spec.md
3. fieldmark_future_roadmap.md

Then ask Garrett to clarify priorities for today specifically.
