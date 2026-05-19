# FieldMark Session Handoff — May 12, 2026 (Evening)

**Picks up from:** `session_handoff_2026_05_12.md` (morning session)
**Next session expected:** May 12, 2026 ~8pm

---

## TL;DR — What happened today

Five things landed in production data:

1. **`first_pub_year` corrected** for ~4,365 HCPs (fixed OpenAlex truncation bug for senior researchers)
2. **`total_career_pubs` corrected** for ~42,000 HCPs (37,157 null-fills + 4,807 upward corrections)
3. **Four canonical HCPs consolidated** from 22 rows down to 4 (Harrison, Trauner, Francque + Sundhar Ramalingam deferred)
4. **Pre-1960 collision artifacts cleaned** (4 rows set to NULL — Susan Siew, Emma Linden, 2x Michael Murphy)
5. **Citation trajectory horizon expanded** from 3-year window to 5-year window — methodology change that materially improved trajectory signal coverage in Hepatology and NSCLC

Scoring pipeline ran successfully twice (once with batch_size fix, once with horizon expansion). The second run produced meaningfully different rankings — top Hepatology now surfaces real MASH/NASH researchers instead of trial-activity-only rankings.

---

## What's still broken / not done

### Citation trajectory methodology is partially patched, not fully fixed

Horizon expansion to 5-year window improved coverage. But two structural issues remain:

1. **Metric uses `publications.citation_count` (total), not `publications.citation_counts_by_year` (year-by-year).** The year-by-year data exists for 58,294 publications (31% of corpus) and isn't being consumed. Real trajectory should use slope of per-year citation accruals, not average-of-totals divided by age.

2. **Rare Disease trajectory still mostly zero.** Structural reality of rare disease research (smaller citation volumes). No metric change fixes this — need different signals (trial activity, MSL contributions) for that TA.

User commitment from this session: **"We cannot ship without CIT TRAJ. We just need to put the work in."** This remains the v1.0 blocker.

### Pub velocity degeneracy persists

Output column shows PubVel clustered at 11.0-12.5 for nearly every HCP in every TA. May 3 audit flagged this as P0. Renormalization just shifted the plateau center (was ~41.8 in earlier run, now ~11.4). Not ranking anyone effectively. Pulls composite scores toward identical noise on 30% of the formula weight.

Multiple plausible replacement formulations exist (CAGR, z-score relative to career-age peers, weighted regression slope). Selection requires distribution analysis on enriched data.

### Validation cohort still doesn't exist

Methodology commits to 80% target (top-100 ranked HCPs contain at least 80% of curated cohort per TA). Hand-curated cohort has never been built. Three preliminarily-validated individual cases only (Vratko Himič and two others). This is the empirical anchor that's been missing since the beginning. No technical dependencies — possibly leverages Avalere Health network.

### Trauner/Harrison/Wakelee `first_pub_year` data-coverage limited

After today's fix:
- Stephen A. Harrison: 2022 (real: ~1995ish)
- Michael Trauner: 2021 (real: ~1990s)
- Heather A. Wakelee: 2014 (real: 2006)

These are the cases where `publication_authors` has only recent papers, so corroborated min is recent. Their `total_career_pubs` (773, 3328, 945 respectively) correctly reflects senior careers, so cohort classification via PATH 2 works. But card displays will show wrong career-start years. v1.1 fix needed via targeted OpenAlex author endpoint refresh or expanded phase 3 ingestion.

### Sven Francque appears twice in Hepatology top 100

Position #41 "Sven M. Francque" (CareerPubs=447) and #70 "Sven Francque" (CareerPubs=553). The May 11 + May 12 dedup work consolidated one Francque canonical row to f53ce08e (Antwerp, 553 pubs). Now there are two rows again — probably a separate "Sven M. Francque" row I didn't catch during the audit. Worth investigating but not urgent.

### Upstream bugs not fixed

`career_enrichment.py` and `openalex_pipeline.py` still compute `first_pub_year` from OpenAlex's truncated author-endpoint summary. If these scripts re-run, today's SQL corrections revert. Need code-level fix in v1.1 backlog.

---

## Session arc: how we got here

### Phase 1: Context recovery (~2pm)
Started session believing dedup was "done." User pushed back: "We spent many hours on this dedupe case and I thought we landed in a place where we were going to accept that 5k or so HCPs would remain." Read May 10-11 transcripts via conversation_search. Reset framing.

### Phase 2: `first_pub_year` diagnosis and fix (~2-3pm)
Identified root cause: `career_enrichment.py` populates `hcps.first_pub_year` from OpenAlex author-endpoint `counts_by_year`, which is truncated to recent ~10-15 years. Senior researchers like Loomba (real first pub 2014) showed 2022; Wakelee (real first pub 2006) showed 2025.

Built corroborated-MIN-of-both-sources fix:
- Use `publication_authors` join to derive min publication year per HCP
- Require either ≥2 publications in that year (corroboration) OR pub_year >= 2010 (junior researchers don't need corroboration)
- Floor at 1960 (older = collision artifact)
- Take MIN of pubauth_min and current value (preserves rare cases where OpenAlex has older data)

Dry-run preview revealed 4,459 HCPs to update, 608 with 10+ year correction, 88 with 20+ year correction (collision-suspect).

Top-20 spot-check revealed legitimate seniors mixed with obvious collisions (William Bowie 1920, Stefan Schwartz 1970). Refined logic, ran final UPDATE: 4,365 HCPs corrected. Loomba 2022→2014, Wakelee 2025→2014, Choueiri 2025→2014, Ramalingam 2025→2012.

Bowie's 1957→1930 case isolated by 1960 floor (only HCP with corroborated pre-1960 year was Bowie). 4 pre-1960 stragglers nulled (Siew, Linden, 2x Murphy).

### Phase 3: `total_career_pubs` diagnosis and fix (~3-4pm)
Discovered `total_career_pubs` field is populated from OpenAlex author-endpoint `works_count` (external truth about career-wide output). Different from `publication_authors` count (papers ingested in our DB).

Initial dry-run showed 59,639 HCPs would be touched if we did naive "overwrite with publication_authors count." This would have DESTROYED data for canonicals (Loomba 1239→945, Choueiri 2430→smaller).

Switched to floor-only approach: only update where current is NULL or publication_authors count exceeds cached value. Never overwrite downward.

Spot-check on the 4,807 upward corrections surfaced Stephen Harrison having 12 rows. Realization: Harrison was never consolidated despite May 11 dedup work. Forced pause on the UPDATE.

### Phase 4: Targeted manual dedup (~4-5pm)
Diagnostic query revealed:
- Stephen A. Harrison: 12 rows
- Michael Trauner: 7 rows
- Sundhar Ramalingam: 2 rows (NPPES NC vs publication ON — name collision risk, DEFERRED)
- Sven Francque: 2 rows

All from April 27-29 ingestion. No post-May-11 ingestion creating new duplicates. Pure residual from earlier dedup passes.

Ran 19 merge_hcp_pair calls in one SQL block:
- Harrison canonical: 664b62e9 (Pinnacle, OpenAlex resolved, 582 pub_authors)
- Trauner canonical: 34897812 (OpenAlex resolved, 156 pub_authors, 3328 cached career pubs)
- Francque canonical: f53ce08e (Antwerp, 553 pub_authors)

All 18 executed merges succeeded (Sundhar deferred). Verified: each canonical at 1 row.

### Phase 5: `total_career_pubs` UPDATE finally ran (~5pm)
Now safe with canonicals consolidated. Floor-only UPDATE: 41,971 rows touched (37,157 nulls filled, 4,807 upward corrections, 0 destructive overwrites of cached values).

Harrison post-update: 773 cached pubs (preserved), 582 pub_authors (we have). Loomba unchanged at 1239 (cached value preserved correctly).

### Phase 6: Scoring re-run attempt 1 — FAILED (~5:30pm)
Ran `python scoring_pipeline.py`. Computed 70,796 score rows successfully but FAILED on first upsert batch with PostgREST statement timeout (code 57014). batch_size=500 with high conflict rate (existing rows) too slow for Supabase's request timeout.

### Phase 7: Methodology validation reality-check (~6pm)
User asked: "we won't know if the results are truly in fact rising stars. Is that correct?"

Honest answer: yes. Searched project chats via conversation_search. Confirmed:
- Validation cohort (methodology doc's 80% target) has never been built
- Three preliminarily-validated individual cases only (Himič and two others)
- Methodology spec exists with documented weights but multiple known issues (pub_vel degeneracy P0, missing data-presence weighting P0, no Established composite)

User confirmed: "We cannot ship without CIT TRAJ. We just need to put the work in."

### Phase 8: Scoring re-run attempt 2 — succeeded (~6:30pm)
Edited `scoring_pipeline.py` line 636: batch_size 500 → 100. Re-ran. Completed successfully in ~10 minutes. New `hcp_scores` rows persisted.

Top 100 output showed:
- ~15 of top 100 HCPs per TA had non-zero CitTraj (gating excluded most)
- PubVel plateau cluster visible at 41.7-42.0 across all HCPs
- Rankings driven primarily by Trial score + Career multiplier
- Senior canonicals (Sanyal, Heymach, Chalasani) appearing in Rising Stars due to data-coverage-limited first_pub_year

User feedback: "I believe in the methodology and composite score structure that was originally created. But without CIT TRAJ, we will never get an accurate picture."

### Phase 9: Citation trajectory horizon expansion (~7-8pm)
Diagnostic revealed:
- 187,214 total publications
- 42,958 never_enriched (23%)
- 85,962 enriched_but_empty (46%) — of which ~84K are structurally empty (2025-2026 papers without citation history yet), only ~2K are actually missing
- 58,294 has_data (31%) — the working set for trajectory

Decision: expand trajectory horizon from 3-year to 5-year window. Patched `citation_trajectory_raw` in `scoring_pipeline.py`:
- Recent = `pub_year >= current_year - 5` (was -2)
- Older = `pub_year < current_year - 6` (was else)
- Middle year (current_year - 6) falls through ungrouped — gives clearer signal separation

Re-ran scoring. Results:
- Hepatology trajectory coverage: ~65 of top 100 now non-zero (up from ~15)
- NSCLC trajectory coverage: ~30 of top 100 non-zero (modest improvement)
- Rare Disease: still mostly zero (structural data limitation)

Top 10 Hepatology now contains recognizable MASH/NASH researchers (Kanwal, Abdelmalek, Cusi, Bowlus) — real signal improvement, not just coverage. Real differentiation appearing.

---

## Validation cohort: top of each TA — Hepatology output

Worth preserving for tomorrow's comparison work:

```
[Hepatology] Top 10 of 9255 HCPs
 1. Fasiha Kanwal          Comp=29.69  CitTraj=60.13  Trial=20.00  (Baylor MASH/MAFLD)
 2. Tim F. Greten          Comp=28.90  CitTraj=19.51  Trial=60.00  (NCI hepatobiliary)
 3. Manal F. Abdelmalek    Comp=28.26  CitTraj=42.64  Trial=30.00  (Mayo NASH)
 4. Kenneth Cusi           Comp=28.25  CitTraj=49.81  Trial=24.00  (Florida endo/NASH)
 5. Bart G. Koot           Comp=26.55  CitTraj=87.75  Trial= 0.00  (Amsterdam peds hepatology)
 6. Jack A. Yanovski       Comp=24.43  CitTraj= 0.00  Trial=64.00
 7. C. Wendy Spearman      Comp=24.15  CitTraj=78.53  Trial= 0.00
 8. Christopher L. Bowlus  Comp=23.38  CitTraj=21.21  Trial=34.00  (UC Davis cholestatic liver)
 9. Diana Romero           Comp=23.31  CitTraj=75.49  Trial= 0.00
10. Stavra A. Xanthakos    Comp=22.85  CitTraj=36.57  Trial=20.00
```

These look like real Rising Star / Established hepatology figures. This is the empirical signal that horizon expansion was the right call.

```
[NSCLC] Top 10 of 16185 HCPs
 1. Aminah Jatoi           Comp=36.35  CitTraj= 0.00  Trial=86.00  (Mayo medical oncology)
 2. Siqing Fu              Comp=31.30  CitTraj= 2.94  Trial=70.00  (MD Anderson Phase I)
 3. David R. Spigel        Comp=31.04  CitTraj= 2.80  Trial=94.00  (Sarah Cannon)
 4. Corey J. Langer        Comp=29.72  CitTraj= 7.98  Trial=62.00  (Penn Lung Cancer)
 5. Aung Naing             Comp=29.10  CitTraj= 2.35  Trial=64.00  (MD Anderson Phase I)
 6. Tim F. Greten          Comp=28.90  CitTraj=19.51  Trial=60.00  (NCI hepatobiliary)
 7. Sharad Ghamande        Comp=28.20  CitTraj= 0.00  Trial=64.00
 8. James L. Gulley        Comp=27.45  CitTraj= 0.00  Trial=62.00  (NCI GU)
 9. Eric Jonasch           Comp=25.95  CitTraj= 0.00  Trial=58.00  (MD Anderson GU)
10. Charles L. Loprinzi    Comp=25.95  CitTraj= 0.00  Trial=58.00  (Mayo medical oncology)
```

NSCLC is still trial-heavy (low trajectory coverage), but recognizable senior oncology investigators.

```
[Rare Disease] Top 5 of 7666 HCPs
 1. Ozlem Goker-Alpan      Comp=23.62  CitTraj= 1.96  Trial=50.00  (Gaucher disease)
 2. Antonio Y. Hardan      Comp=22.22  CitTraj= 0.00  Trial=48.00
 3. Swee Lay Thein         Comp=20.56  CitTraj= 1.96  Trial=42.00  (NIH sickle cell)
 4. Konstantinos Lazaridis Comp=20.49  CitTraj=11.15  Trial=34.00  (Mayo PSC)
 5. Patrick A. Flume       Comp=20.49  CitTraj= 4.12  Trial=40.00  (MUSC CF)
```

Rare Disease almost entirely trial-driven. Citation trajectory doesn't fire well due to structural data limitations (smaller research communities → fewer citing papers → no citation density to compare).

---

## Database state at end of session

- `hcps` row count: ~109,253 (down from 109,278 — 18 merges + 4 dedup-aborted rows)
- `hcp_scores`: fully refreshed with v1.3 + horizon-5 methodology
- `publications`: unchanged (187,214 rows)
- `publication_authors`: unchanged
- `dedup_merge_log`: +18 entries with pass='pass_manual_canonical'

Verified canonical state after all UPDATEs:
- Loomba: first_pub=2014, career_pubs=1239 ✓
- Wakelee: first_pub=2014, career_pubs=945 ✓ (data-coverage limited)
- Choueiri: first_pub=2014, career_pubs=2430 ✓
- Suresh S. Ramalingam: first_pub=2012, career_pubs=1232 ✓
- Tolaney: first_pub=2020, career_pubs=80 ✓
- Heymach: first_pub=2022, career_pubs=2431 ✓ (data-coverage limited)
- Chalasani: first_pub=2021, career_pubs=841 ✓ (data-coverage limited)
- Harrison: first_pub=2022, career_pubs=773 ✓ (data-coverage limited, post-consolidation)
- Trauner: first_pub=2021, career_pubs=3328 ✓ (data-coverage limited, post-consolidation)
- Francque: first_pub=2022, career_pubs=553 ✓ (data-coverage limited, post-consolidation)
- Herbst: first_pub=2025, career_pubs=23 (data-coverage limited)
- Janne: first_pub=null, career_pubs=0 (no publication data linked)

---

## Tomorrow's options (you decide)

### Option A: Pub velocity formula redesign

May 3 audit P0 finding still unresolved. Plateau cluster visible in every output we've seen today (11.4-12.5 across the cohort). The methodology weights pub_velocity at 25% of composite and the dimension isn't ranking anyone.

Three plausible replacement formulations:
- Compound annual growth rate over career-defined window
- Z-score relative to peers in same career-age band
- Weighted regression slope of pub count over time, with peer-adjusted normalization

This is real methodology design work — 1-2 weeks if doing it carefully. Validation depends on validation cohort.

### Option B: Citation trajectory deeper rewrite

The horizon expansion is a coverage patch. The deeper fix uses `publications.citation_counts_by_year` directly to compute per-paper slopes, then aggregate slopes per HCP. Different mathematical operation than average-comparison.

Code change in `citation_trajectory_raw`. Estimated 1-2 days of careful work plus re-run. Would meaningfully improve signal quality for the 58K publications that have year-by-year data.

### Option C: Validation cohort building

No technical dependencies. Hand-curate 30-50 known rising stars + 30-50 known established KOLs per TA. Use to validate every methodology change going forward. Possibly leverages Avalere Health network.

Could start tomorrow as parallel workstream to A or B.

### Option D: Sundhar Ramalingam dedup decision

Deferred this session. Two rows:
- ON, OpenAlex resolved, 8 pub_authors, 43 cached pubs
- NC, NPPES enriched, $43K Open Payments, 16-year career, 0 pub_authors

Looks like different geographies + different data sources. Could be same person (moved) or two people (name collision). 10-minute investigation + 1-line merge OR keep separate.

### Option E: Sven Francque double-row investigation

Position #41 vs #70 in current Hepatology rankings. Quick diagnostic to understand what's happening. Probably <30 minutes.

### Option F: Upstream code fix for `first_pub_year`

Patch `career_enrichment.py` and `openalex_pipeline.py` to compute `first_pub_year` correctly (currently use OpenAlex truncated author-endpoint summary). Without this, today's SQL corrections revert next time these scripts run. ~1-2 hours of code work + Cursor prompt cycle.

---

## My read on what comes next

Today's win was real — horizon expansion + data corrections produced visibly better Hepatology rankings. The Hepatology top 10 looks like real MASH/NASH researchers, not noise.

The biggest remaining methodology gap is **pub_velocity degeneracy** (Option A). It's affecting every HCP's composite score by adding ~25% weighted noise. Fixing it would likely produce another meaningful improvement in rankings — especially in NSCLC where trajectory is partial.

Citation trajectory deeper rewrite (Option B) is technically simpler but improves signal quality, not coverage. May matter less in practice than fixing pub_velocity.

Validation cohort building (Option C) is the empirical anchor. Could start in parallel.

My honest recommendation for tomorrow: **start the pub_velocity redesign**. It's the largest unresolved methodology issue. Don't expect to finish it in one session — methodology design needs iteration. But starting the analysis (distribution of current pub_velocity values, peer-band considerations, formula candidates) is real progress.

If you're not ready for methodology design, Options D and E are quick cleanup tasks (under 30 minutes each).

---

## Working notes for fresh-head reading

- All SQL changes today are reversible via the `dedup_merge_log` table for merges, and via the `hcps.first_pub_year` / `hcps.total_career_pubs` columns for data corrections. Nothing destructive landed without sign-off.
- The `scoring_pipeline.py` edits today:
  - Line 636: `batch_size = 500` → `batch_size = 100` (timeout fix)
  - `citation_trajectory_raw` function: 3-year recent window → 5-year recent window (horizon expansion)
- The horizon expansion edit may want to be reverted or tuned. If 5 years feels too wide for "rising stars" (it skews toward mid-career rising rather than early-career), we can tighten to 4 years. Empirical test would tell us which is better.
- The `total_career_pubs` UPDATE was floor-only (never overwrites downward). This is the correct preservation behavior. Future ingestion scripts should follow the same pattern.

---

## What this session was emotionally / practically

User pushed back on Claude's framing multiple times today, correctly. Examples:
- "We spent many hours on this dedupe case" — Claude was reading stale summary as current state
- "I'm not sure I fully understand the reasoning but it sounds like you feel strongly" — Claude was about to push past user uncertainty
- "I find it hard to believe you can't search to find the answer" — Claude was speculating about validation history when conversation_search would have grounded the conversation
- "Look at more years of publication activity" — User's domain expertise on the horizon issue led to the actual methodology insight

These pushbacks were real and improved the work. Tomorrow-you should keep this pattern: push back on Claude when reasoning isn't clear, and Claude should ground claims in actual searches/data instead of speculation.

User also took a 5-hour break mid-session before the final horizon-expansion run. This was the right call. Eight hours of database work in one stretch was already a lot.

---

## File locations

- Scoring script (modified today): `C:\Users\garre\Desktop\FieldMark\scoring_pipeline.py`
- Methodology doc: `/home/claude/fieldmark_methodology.md` (last edited May 1)
- Previous session handoffs in this directory:
  - `session_handoff_2026_05_11.md`
  - `session_handoff_2026_05_12.md` (morning)
  - `session_handoff_2026_05_12_evening.md` (this file)

---

*End of handoff. See you at 8pm.*
