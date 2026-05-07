# FieldMark Project — Continuation Handoff

I'm Garrett, continuing work on FieldMark, my B2B SaaS platform. I've been working with a previous Claude instance and need to bring you up to speed before we continue.

## Project context

FieldMark identifies rising star HCPs (Healthcare Professionals) and digital opinion leaders for pharmaceutical MSL (Medical Science Liaison) field medical teams. It's a crowdsourced intelligence platform combining public scientific data (PubMed, ClinicalTrials.gov, OpenAlex) with structured contributions from MSLs. I built it solo. I'm pre-launch, building toward client demos.

**Tech stack:** React frontend (planned), Python data pipeline backend, Supabase database, Claude API for AI layer, LinkedIn OAuth (planned for verifying MSL contributors).

**Therapeutic areas (TAs):** Rare Disease (primary launch focus), NSCLC (Oncology), Hepatology (Immunology adjacent).

**Database:** tflrfkocbdkizmkhimiw.supabase.co
**Working directory:** C:\Users\garre\Desktop\FieldMark on Alienware Aurora R15
**My background:** Global leadership team at Avalere Health, 20+ years in medical communications. I'm accuracy-first and quality-focused.

## Required reading: documentation review FIRST

Before responding substantively, please read all the FieldMark documentation files. These contain critical strategic, methodological, and technical context. Use the view tool on each:

```
view /mnt/user-data/outputs/may5_decision_log_final.md
view /mnt/user-data/outputs/wednesday_may6_focus.md
view /mnt/user-data/outputs/p0_hcp_deduplication.md
view /mnt/user-data/outputs/p0_elevation_community_hcp.md
view /mnt/user-data/outputs/p0_8o_community_hcps.md
view /mnt/user-data/outputs/nppes_backfill_plan.md
view /mnt/user-data/outputs/open_payments_scoping.md
view /mnt/user-data/outputs/medicare_provider_scoping.md
view /mnt/user-data/outputs/ta_framework_section.md
```

Read them in that order. The decision log gives session history, then the focus doc gives current priorities, then the dedup P0 explains what we just finished, then the strategic and tactical docs give the broader landscape.

**After reading, please confirm: "I've read the documentation. Here's my summary of where we are and what's next." Then I'll confirm or correct your understanding before we work.**

## Where we are right now (May 6, 2026 Wednesday afternoon)

**Strategic priority structure (locked May 5 evening based on Neurocrine MSL Field Engagement audience input):**
- **#1: Regional/Community HCP track** — Federal data-sourced cohort (NPPES + Open Payments + Medicare Provider Data). Cleaner data integrity than publication-based methodology. The NEW priority elevation from May 5.
- **#2: Academic Rising Star track** — Existing publication/citation/trial methodology. Continues development as secondary product positioning.

**Database state at end of today's session:**
- 114,965 HCPs total (93,761 publication-derived + 21,204 NPPES community-ingested)
- 30,140 HCPs have NPI numbers
- All 93,761 publication HCPs classified under v1.1 affiliation profiler
- Tier classification with clinician filter applied to hcp_scores (87,344 v1.3 rows)
- ZERO duplicate NPIs (just dedup'd)

**Just completed today (May 6):**
- Applied 287 truly-clean NPI matches from Workstream A NPPES matcher
- HCP deduplication merge: 190 fragmented duplicate records consolidated to canonicals (e.g., Heather A Wakelee CA had 4 records → 1, 945-pubs canonical preserved with NPI applied; Wilbur Lam GA had 2 records → 1, publication record canonical, Workstream B NPI migrated to it)
- Result: cleaner database with consolidated publication/trial/scoring signal per physical person

**About 139 dedup clusters failed during execution** with `npi_match_proposals_pkey` constraint violations. These are duplicate clusters that weren't resolved this session. Acceptable for now — log preserved at C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json. Can be addressed in a follow-up dedup pass after fixing proposal migration logic in `hcp_dedup_merge.py`.

**Today's plan was: dedup → Open Payments. Dedup is now done. Open Payments is next.**

## Next workstream: Open Payments integration

This is the strategically critical work. Without Open Payments, the 21,204 community HCPs we ingested have no ranking signal. Open Payments captures:
- Speaker bureau payments from pharma companies (the strongest "industry views this HCP as commercially influential" signal)
- Consulting payments
- TA-relevant drug payments (filtering payments associated with NSCLC drugs, hepatology drugs, rare disease drugs)
- Year-over-year trends

**File already downloaded:**
- `C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2024.csv` (8-12GB plain CSV)
- Source: PY2024 General Payments from CMS (~16.16M records totaling $13.18B)
- URL used: https://download.cms.gov/openpayments/PGYR2024_P06302025_06162025/OP_DTL_GNRL_PGYR2024_P06302025_06162025.csv

**Per `open_payments_scoping.md`, the workstream consists of:**
1. Open Payments parser (`open_payments_filter.py`) — stream-parse CSV, filter, write to Parquet (similar architecture pattern to `nppes_filter.py`)
2. TA drug list curation (`ta_drug_keywords` table seeded with NSCLC/Hepatology/Rare Disease drug seed lists)
3. Open Payments aggregator (`open_payments_aggregator.py`) — match by NPI, aggregate per-HCP and per-HCP-TA metrics
4. Schema additions (`hcp_open_payments_summary` and `hcp_open_payments_by_ta` tables)
5. Validation against canonical HCPs

Read `open_payments_scoping.md` for full TA drug seed lists, schema definitions, and methodological considerations.

## How I work — behavioral calibration

A few things the previous Claude instance learned about working with me. Not rules, just patterns:

**1. Prefer honest pushback over deference.** If I'm about to do something technically unrealistic or strategically weak, say so. I'd rather have a productive disagreement than build something I have to redo. Don't capitulate when I push back — defend your position if you believe it.

**2. Don't make energy-level commentary.** Don't tell me I should rest, that I've been working hard, or otherwise editorialize on my time/state. I make those decisions. I called this out explicitly with the previous Claude.

**3. Don't time-track unprompted.** Don't tell me what hour we're on or estimate how late it is. Same reason as above.

**4. Be honest about projection misses.** Today's NPPES matching produced ~2.5% match rate against my 50%+ projection. I asked for honest reframing, not face-saving. Real data over confident estimates.

**5. Quality matters more than throughput.** I'd rather pause and design carefully than rush through. The dedup work today was an example — I chose to handle it cleanly before moving to Open Payments rather than power through with fragmented data.

**6. I work with Cursor for code editing.** When you want me to modify a script, write a "Cursor prompt" that I copy/paste to Cursor. The prompt should include rules: code only, do NOT execute, report errors. Cursor has a tendency to make architectural changes I didn't approve, so the rules header is important.

**7. Show your reasoning when stakes are high.** For technical decisions, give me options A/B/C with honest tradeoffs. For strategic decisions, ground in real data not assumptions.

## Active state on disk

**Scripts in C:\Users\garre\Desktop\FieldMark\:**
- `affiliation_profiler.py` (v1.1, deployed)
- `scoring_pipeline.py` (v1.3, deployed)
- `nppes_filter.py` (built and run yesterday)
- `nppes_matcher.py` (built and run yesterday with bugs identified, 287 matches applied)
- `nppes_diagnostic.py` (debugging tool from yesterday)
- `nppes_workstream_b_dryrun.py` (analysis tool from yesterday)
- `nppes_workstream_b_ingest.py` (ran yesterday, ingested 21,241 community HCPs)
- `hcp_dedup_merge.py` (just executed today, 190 records consolidated)

**Data files:**
- `C:\Users\garre\Desktop\FieldMark\NPPES\nppes_individual_providers.parquet` (387MB, 7.22M individual active US providers)
- `C:\Users\garre\Desktop\FieldMark\NPPES\npidata_pfile_*.csv` (11.36GB raw NPPES download)
- `C:\Users\garre\Desktop\FieldMark\OpenPayments\OP_DTL_GNRL_PGYR2024.csv` (8-12GB, ready for parsing)
- `C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json` (775KB, dedup execution log)
- `C:\Users\garre\Desktop\FieldMark\workstream_b_dryrun_results.json` (Workstream B taxonomy analysis)

**Documentation in /mnt/user-data/outputs/** (the files you'll read above)

## Canonical HCP IDs (validation cohort for hepatology)

Useful for validating future work:
- Loomba: 9339ead6-2023-4e69-9eda-2914553a2e20 (NPI 1578593521)
- Sanyal: 32495742-222a-45c6-bb96-cc44d5227e7e (matched_high tonight, NPI 1629168273)
- Chalasani: 6f9dd309-bd67-4260-a9c2-8a22129f988c (NPI 1588628002)
- Gores: bb1d0db8-bbf7-495a-a8af-cef964c92ec3 (NPI 1336126861)
- Singal: d1b5e8df-133e-464a-aee8-529200ad0705 (NPI 1073653622)
- Industry test case: Yang Wang (Pfizer Medicine Design): e65cd43c-0837-40b6-9c21-6e1800a255e2 — should be classified industry under v1.1

## Open methodological items

These remain pending across sessions:
- TA cross-tagging cleanup (P0 #8m) — apply locked concept lists to hcp_therapeutic_areas.strength_score
- NSCLC and Rare Disease concept derivation queries (now feasible since database load manageable)
- Phase B career enrichment fix (P0 #8j) for first_pub_year accuracy (Loomba shows 2022 instead of late 90s)
- Additional dedup pass (139 failed clusters from today's run)
- Tier 3 NPI match application (1,703 filtered Tier 3 with clinical taxonomies — pending decision on whether to apply directly or do more careful review)

## What we're NOT doing right now

- Hepatology Workstream B ingestion (deferred to Phase 2 after Open Payments + Medicare data exists, since Gastroenterology is too broad to filter on alone)
- Medicare Provider Data parser (Thursday or later)
- Demo flow design (later this week)
- Frontend or product UI work (after data infrastructure)

## What I'd like to do in this conversation

After you confirm understanding from the documentation review, let's start on Open Payments. The PY2024 CSV is downloaded. We need:

1. The parser script (`open_payments_filter.py`) following the same pattern as `nppes_filter.py` — stream-parse CSV, filter, write to Parquet
2. Then the `ta_drug_keywords` table built and seeded
3. Then the aggregator script

If you have suggestions on starting differently — say, validating the dedup outcome first before moving to Open Payments — I'm open to that. But Open Payments is the critical path.

Please start by reading the documentation, then confirm understanding before we work.
