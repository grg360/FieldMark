# FieldMark — Handover (2026-05-28, end of Day 3 marathon)

This is the working-context handover for the next chat. Pairs with `TECH_DEBT.md` (open items) and `SCRIPT_CATALOG.md` (file inventory). Read all three.

---

## 1. What FieldMark is (one paragraph)

B2B SaaS that surfaces **rising-star HCPs** for pharma MSL teams — researchers on an upward trajectory *before* they're recognized KOLs (timing signal over credentials). Built independently by Garrett (~20yr medcomms, works at Avalere — kept at arm's length). Combines public scientific data (PubMed, OpenAlex, ClinicalTrials.gov, NPPES, CMS Open Payments/Medicare) with planned crowdsourced MSL intelligence. Mobile-first PWA, Bloomberg-terminal aesthetic. Three cohort tracks live: Rising Stars (emerging), Established (known KOLs), Community (high-engagement community physicians). TAs: Hepatology (PBC anchor), NSCLC, Rare Disease, Oncology; Immunology planned Fall 2026.

---

## 2. Where we are RIGHT NOW (the live state to confirm first)

At handover, **`scoring_pipeline.py --target-version v2` was running** — re-scoring all cohorts against the just-corrected career-year data. The very first action in the next chat:

```sql
SELECT MAX(scored_at) AS last_scored, COUNT(*) AS n
FROM hcp_scores_v2 WHERE tier = 'rising_star';
```
If `last_scored` is recent (after ~2026-05-28 16:00 UTC), scoring completed — proceed. If not, re-run `python scoring_pipeline.py --target-version v2` (writes by default; `--target-version v2` is REQUIRED — default is v1).

### The immediate sequence (do in order)
1. Verify rising-star scoring landed (above).
2. Eyeball re-scored boards — rankings SHOULD have shifted vs. pre-fix, especially Rare Disease rising stars (was 50% conflation noise). That's the career-fix working, not a bug.
3. Run `python established_scoring.py --execute` (this one DOES use `--execute`; it reads the corrected `career_age_years` generated column).
4. **Narrative test BEFORE full batch:** run a small rising-star batch, Ctrl+C after ~10, read one narrative. Check (a) career length sane (~25yr, not 70), (b) percentile reads clean — see TECH_DEBT "percentile formatting". Fix if awkward (2-min `int(round())` edit).
5. Full rising-star narratives: `python generate_narratives_v2.py --cohort rising_star --target-version v2` (~$7). **`--target-version v2` REQUIRED** (default v1 writes to wrong table).
6. Add API funds (balance was $30.45; established+community ~$60-85 total), then established + community narratives.
7. Build the approved card redesign against real `why_now` + h_index data.

---

## 3. The big win of Day 3 (so context isn't lost)

The `career_first_pub_year` field was corrupted across ~24% of the corpus — raw OpenAlex earliest-pub years polluted by homonyms and citation-graph garbage (dates back to the 1500s). This silently corrupted **scoring** (career_age_multiplier), ranking, cohort assignment, AND narratives. Found it in QA before any customer saw it. Fixed with a publication-density heuristic (`career_first_pub_year_v2`), validated end-to-end (Gulley 1956→2001; 24%→4.8% pre-1990; 0 unresolvable across 229K). This unblocked the whole downstream chain. **Do not re-litigate this — it's done, validated, and committed.**

---

## 4. SQL TABLE MAP (the thing that always bites handovers)

> **Golden rule:** Verify columns before writing queries. Run
> `SELECT column_name FROM information_schema.columns WHERE table_name='X' ORDER BY ordinal_position;`
> Repeated 400s and "column does not exist" errors this project came from *assuming* columns. Don't assume — check. Also: **Supabase SQL editor errors on `--` comments — omit them.**

### Core entity
- **`hcps_v2`** — master HCP record. Key cols: `id` (uuid PK), `first_name`, `last_name`, `country`, `total_career_pubs`, `latest_pub_year`, `career_first_pub_year` (OLD/noisy — do not use for scoring), **`career_first_pub_year_v2`** (corrected — USE THIS), `career_age_years` (GENERATED from v2 col; can't UPDATE directly), `cohort_classification` (single-valued: rising_star/established/community/null), `cohort_score` (path-based, NOT differentiated for established — see tech debt), `npi_number`, `npi_specialty`, `nppes_practice_city/_state/_setting/_zip`, `nppes_career_stage_years`, `institution_normalized`, `institution_raw`, `institution_secondary`, `institution_history`. **`institution_full` does NOT exist** (caused repeated 400s — never select it).

### Scoring tables (per-HCP-per-TA)
- **`hcp_scores_v2`** — RISING STAR tier rows only. Cols: `hcp_id`, `therapeutic_area_id`, `composite_score`, `normalized_score`, `pub_velocity_score`, `citation_trajectory_score`, `trial_investigator_score`, `congress_score`, `msl_signal_score`, `tier`, `scored_at`. (NOTE: established/community tiers are NOT here — separate tables below.)
- **`hcp_established_scores_v2`** — established cohort. Cols incl `composite_score`, `normalized_score`, `pub_volume_score`, `recent_productivity_score`, `lead_density_score`, `trial_score`, `career_length_score`, `pharma_breadth_score`.
- **`hcp_community_scores_v2`** — community cohort. **Two column sets exist; use the POPULATED ones:** `patient_volume`, `pharma_engagement`, `group_practice_signal`, `career_years`, `publication_signal` (all 20,400 populated). The `*_score`-suffixed cols (pharma_engagement_score, medicare_volume_score, engagement_breadth_score, career_stage_score) are DEAD/NULL leftovers — do NOT query them (cost us an hour). Plus `composite_score`, `normalized_score`, `scored_at`, `scoring_run_id`.

### Rank VIEWS (scope-aware: global + region partitions; what the frontend reads)
- **`hcp_rising_star_ranks_v2`** / **`hcp_established_ranks_v2`** / **`hcp_community_ranks_v2`** — each joins its scores table to `hcps_v2`, adds `scope_type` ('global'|'region'), `scope_value` (country or null), `rank` (ROW_NUMBER by normalized_score DESC), `scope_size`. Views inherit RLS from base tables. When recreating a view, match the POPULATED column names (esp. community).

### Enrichment / metrics
- **`hcp_author_metrics_v2`** — OpenAlex author metrics. PK (hcp_id, snapshot_date). Cols: `cited_by_count`, `works_count`, `h_index`, `i10_index`, `counts_by_year` (JSONB year-by-year array — this is what the career heuristic parses), `two_yr_mean_citedness`, `data_quality_flags` (JSONB; `conflation_suspected`), `fetch_status`, `enrichment_run_id`. Current snapshot: **2026-05-27, 229,238 distinct HCPs.**
- **`hcp_author_metrics_latest_v2`** — view, latest snapshot per HCP. Frontend reads citations/h-index here.
- **`hcp_nppes_detail_v2`** — NPI detail. `nppes_enumeration_date` populated on 40,129/48,082 rows. (NOT usable as career floor — 95% of conflated HCPs absent from NPPES.)
- **`hcp_openalex_authors_v2`** — link table (hcp_id ↔ openalex_author_id). Cols: `is_primary`, `match_confidence`, `match_method`, `first_seen_pub_year`, `last_seen_pub_year`, `corpus_pub_count`, `linked_at`. 239,306 link rows / 229,238 distinct HCPs. **Offset-paging over this with `hcps_v2!inner` join is unstable — caused a 30K enrichment gap. Use --resume (existence-based skip), not offset chunking.**

### Open Payments / Medicare
- **`hcp_open_payments_summary_v2`** (`total_payments_lifetime`), **`hcp_open_payments_by_ta_v2`** (`ta_payments_3yr`, `ta_speaker_bureau_3yr`, `ta_consulting_3yr`), **`hcp_open_payments_top_companies_v2`** (manufacturer_name + total_amount + payment_count per HCP — was missed in v1's first pass; verify it populates after any aggregator run).
- **`hcp_medicare_summary_v2`**, **`hcp_medicare_by_ta_v2`** (`ta_beneficiaries_3yr_total`, `ta_beneficiaries_3yr_high_confidence`).

### Narratives
- **`hcp_narratives_v2`** — CURRENTLY EMPTY. PK/conflict (hcp_id, therapeutic_area_slug). Cols: `narrative_text`, `why_now`, `engagement_angle`, `signal_strength`, `caution_flags`, `model_used`, `prompt_version`, `generated_at`. Note: keyed by `therapeutic_area_SLUG` (string), not TA id. Script writes here ONLY with `--target-version v2`.
- (v1 `hcp_narratives` uses therapeutic_area_id + different col names — legacy.)

### Other
- **`hcp_therapeutic_areas_v2`** (hcp_id ↔ therapeutic_area_id membership), **`social_posts`/`social_users`/`dol_matches`** (social pipeline), **`dol_matches_v2`** (EMPTY — blocks DOL panel).

### TA IDs (verbatim — used constantly)
- rare-disease: `833e7b38-d01b-409e-82c0-71eb29e138a0`
- hepatology: `9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e`
- nsclc: `c0065b03-a25e-4e9a-bde4-4b4d0db7827d`
- oncology: `095bc902-c3dc-48a3-8167-52ee55795d60`
- immunology: `4cf07827-ff1c-451e-832e-0e0a14ea9c86`

---

## 5. Environment / infra

- **Codebase:** `C:\Users\garre\Desktop\FieldMark` (Python pipelines in root, frontend in `/frontend`).
- **GitHub:** `grg360/FieldMark` (private). Working branch **`foundation-rebuild`**. `quick_commit.ps1` commits to foundation-rebuild but **pushes to `main`** (HEAD→main) which auto-deploys. (foundation-rebuild remote is ~21 commits behind local — harmless, reconcile later.)
- **Production:** `app.besselanalytics.com` AND `field-mark.vercel.app` (same Vercel project, ~2-3 min build).
- **DB:** Supabase Postgres, project `tflrfkocbdkizmkhimiw`.
- **Stack:** React/Vite/TS frontend, Python pipelines, Claude API (Sonnet, model string `claude-sonnet-4-6` in narrative script), Cursor IDE, Windows PowerShell.
- **API balance:** $30.45 as of 5/28 (auto-reload OFF — no surprise-bill risk; runs just halt at $0).
- **Power instability:** Garrett's machine has had repeated power blips. Long pipelines must be resumable (enrichment, narratives both are). Prefer Windows Task Scheduler over babysat processes for any scheduled work.

---

## 6. WORKING STYLE (how Garrett works — important)

- **Fast, direct, substance over polish.** Famous line: "I don't want to put lipstick on a pig" — don't suggest frontend/cosmetic work when foundations aren't solid.
- **Honest assessments over optimism.** Wants candor about what is/isn't working. Don't soften bad news or inflate progress. He pushes back immediately if Claude relitigates settled decisions or frames false urgency ("demo urgency"). Real product decisions at appropriate pace.
- **Edits via Cursor, not PowerShell string-replace.** Hard lesson this project: PowerShell `.Replace()` silently no-ops on whitespace mismatch — burned us repeatedly (phantom commits showing "0 insertions"). Use Cursor for code edits, then ALWAYS verify the edit landed with `Select-String` + check `git diff`/commit stat shows real insertions. SQL runs directly in Supabase dashboard.
- **Verify before trusting.** The recurring failure mode all project: assuming a column exists, assuming an edit applied, assuming a flag wired through. Check the data/the file/the result every time. A 30-second verification beats a 30-minute misdiagnosis.
- **Use conversation_search proactively** when Garrett references prior work ("we did this before," "remember X"). He maintains continuity across many chats and expects Claude to retrieve rather than reconstruct. He's usually right that it's been discussed.
- **Don't re-derive settled decisions.** Tier naming (Ascendant/Dark Horse), Collaborative Orbit, pricing, exit scenarios — all settled. Search before re-opening.
- **Child/quality discipline:** he caught the career-year bug instinct and the social-matcher limitation himself — he has strong product judgment. Treat his hunches as likely-correct and worth investigating, not dismissing.

---

## 7. Two near-term threads

- **ASCO 2026 starts 5/29.** Social capture decision: capture is cheap and non-recapturable, matching can re-run on banked posts later. The matcher only surfaces the ~8% of captured accounts already in `hcps` — the architectural fix (surface high-engagement non-HCP accounts as candidate DOLs) is the real post-ASCO workstream. Twitter budget was Basic-tier (~$57 noted historically); Pro-tier comprehensive capture ($5K) ruled out. Bluesky capture is free.
- **Card redesign** (approved mockup): see TECH_DEBT. Build after narratives land.
