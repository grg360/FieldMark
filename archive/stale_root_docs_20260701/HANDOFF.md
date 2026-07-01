# FieldMark Handoff — May 26, 2026 EOD

**Purpose:** Briefing document for the next Claude chat session. Paste this at the start of the new chat along with ROADMAP.md and TECH_DEBT.md.

---

## Who I am

Garrett. ~20 years in medical communications. Global leadership role at Avalere Health (kept at arm's length from FieldMark). Building FieldMark independently — a B2B SaaS platform identifying "rising star" HCPs for pharma MSL teams. Acquisition by H1/Veeva/IQVIA is a plausible exit. Target market: ~57,000 US MSLs. Pricing: $24.99/month individual subscription, 7-day free trial. PWA.

The entire build happened in ~10 days. I move fast and iterate aggressively.

---

## What FieldMark is

B2B SaaS surfacing rising-star HCPs and DOLs to pharma MSL teams.

**Three cohorts:**
- **Established** — known KOLs (Loomba, Sanyal, Kowdley, Heymach, etc.)
- **Rising Star** — emerging researchers on upward trajectory (THE differentiator vs Veeva/H1/IQVIA)
- **Community** — "doctors in the wild" / regional doctors (the MSL-targetable real-world clinicians)

**Therapeutic areas (current):** Hepatology, NSCLC, Rare Disease. Strategic narrowing toward cell/gene therapy with hematologic oncology as lead indication.

**Differentiation vs competitors (Veeva Link, H1, IQVIA, Within3, Indegene):** Only platform oriented around rising stars + weekly live refresh + crowdsourced MSL intelligence + Collaborative Orbit visual (co-investigator graph) + natural language AI queries + individual MSL subscription + mobile-first.

---

## How I work with Claude

### Communication style I respond well to
- **Honest assessments.** Tell me what's broken, what's risky, what's not working. Don't optimize for making me feel good.
- **Push back when something is technically unrealistic or strategically weak.** That's literally what I want.
- **Detailed technical explanations of what each step does and why.** Not just "here's the command" — explain the implications.
- **Concise.** No preamble, no padding. Get to the point. Don't over-explain things I already understand.
- **Don't pretend to know things you don't know.** Search past chats, run diagnostics, check the schema. Don't guess.

### What I don't want
- Empty acknowledgments. ("Great question!" "That makes sense!") Skip them.
- Optimistic framing when reality is mixed. Be straight.
- Cutting corners on substance to save time. I said "I don't want to put lipstick on a pig." I mean it.
- Claude pretending to know what time it is. Reframe with what I actually tell you.
- Assuming I'm tired or rushed. Ask if you need to know.

### What works well
- **Cursor prompts.** Wrap the exact instructions for Cursor in a code block. Make them comprehensive: list explicit replacements, gotchas to watch for, "after patching: 1) show me the diff, 2) compile, 3) do NOT run yet." Cursor is at its best with tight specifications.
- **Diagnostic SQL first.** Before recommending a fix, run queries to confirm the actual state. Don't assume what the data looks like.
- **Search past chats** for relevant context (especially v1 decisions, methodology discussions). Don't fly blind.
- **Stage decisions.** When there are options, lay out A/B/C with honest tradeoffs. Recommend one but tell me why.
- **Honest time estimates.** "This is a 3-4 hour run." Not "this should be quick."

---

## v2 Foundation Status (as of May 26 EOD)

### Database state
- **hcps_v2**: 269,392 HCPs (post-dedup, from 270,032)
- **Established cohort**: 11,389 HCPs × 2 TAs = 22,778 per-TA scores
- **Rising Star cohort**: Scored to hcp_scores_v2 (Hep 142,178 / NSCLC 70,591 candidates)
- **Community cohort**: 40,154 HCPs (post-USA→US country standardization, scoring pending re-run after NPPES enrichment)
- **Open Payments**: 222,544 rows across 4 tables
- **Medicare**: 26,005 summary + 19,379 by_ta rows
- **Reference institutions**: 421 entries, 8 entity types
- **HCP-institution links**: 31,386
- **Trial investigator linkage**: 50,668 of 259,738 (19.5%, up from 3.1%)
- **Trial-TA mapping**: 6,776 (Hep 4,313 / NSCLC 2,463)
- **Dedup**: 640 stubs merged. Sanyal + Kowdley fully consolidated. Chalasani 3-way partial (TECH_DEBT).

### Canonical KOL state (post-dedup)
- **Loomba**: 1,536 pubs, NPI, $271K OP. Hep #1 normalized=100.
- **Sanyal**: 1,456 pubs + NPI + 19 trials + $387K OP + 57 Medicare. Hep #2 normalized=98.87.
- **Kowdley**: 1,016 pubs + NPI + 7 trials + $646K OP + 141 Medicare. Hep visible.
- **Chalasani**: PARTIAL — main pub record (22388b63, 843 pubs) still orphaned from NPI/trial data.

### Frontend
- **api.ts v2 cutover complete**: 22 .from() replacements, ta_cohort_counts_cache replaced with live aggregation, TypeScript compiles clean.
- **Dev server NOT yet started.** Frontend triage begins next chat session.

---

## Today's Major Work (May 26)

In rough order, today landed:
1. Trial-to-TA mapping (6,776 trials)
2. Established cohort + TA-specific scoring (22,780 rows)
3. Reference_institutions taxonomy (421 across 8 types)
4. HCP-institution linker (31,386 links)
5. Workstream B NPPES ingestion (40,342 new HCPs)
6. Open Payments aggregation (222K rows)
7. Medicare aggregation (45K rows)
8. Trial investigator matcher (42K new linkages, 6.3x improvement)
9. Scoring threshold patch (3→6 min stored pubs)
10. Frontend api.ts v2 cutover
11. Dedup detect + merge (640 canonical stubs deleted)
12. Established + Rising Star re-scoring
13. Community classification (kept for future ingestions; existing 40K already classified via Workstream B)
14. Community scoring methodology (v1 formula ported)
15. Country standardization (USA→US, 40K row update)
16. **community_nppes_backfill.py** — comprehensive NPPES enrichment running in background at session end (~3.3 hour runtime, expected complete ~6pm)

---

## What's Next (immediate session priorities)

### Step 1 (after NPPES enrichment completes)
```
python community_scoring.py --execute
```
~10 min. Now group_practice_signal + career_years signals (25% weight) will actually contribute since the data exists post-enrichment.

### Step 2 — Verify
```sql
SELECT 
  COUNT(*) AS total_scored,
  AVG(group_practice_signal)::numeric(4,2) AS avg_group,
  AVG(career_years)::numeric(4,2) AS avg_years
FROM hcp_community_scores_v2;
```
If `avg_group > 0` and `avg_years > 0`, full methodology is active.

### Step 3 — Commit
```powershell
git add community_nppes_backfill.py TECH_DEBT.md ROADMAP.md
git commit -m "Community NPPES backfill + final scoring"
git push
```

### Step 4 — Frontend
```powershell
cd frontend
npm run dev
```
Open browser. See what loads. Triage surface issues one at a time:
- Tier badge rendering (Dark Horse/Workhorse leftovers expected — frontend stubs to 0)
- Cohort count accuracy via fetchLiveCohortCountsForTAIds
- HCP detail pages render OP + Medicare for canonicals (Loomba should show $271K)
- DOL panel state
- Narratives gaps (hcp_narratives_v2 may have stale rows; regeneration deferred)

---

## Critical Working Principles (don't violate these)

1. **"Substance before presentation."** I will reject cosmetic shortcuts that paper over broken data.
2. **"I'm not going to cut a corner on the last step."** Stay honest about completion criteria.
3. **No "lipstick on a pig."** If something is broken, fix it. Don't ship it broken.
4. **Push back when methodology is being weakened.** If you're suggesting I drop signals because data is missing, suggest fixing the data instead. I want every bit of signal.
5. **Confirm before destructive operations.** Always.
6. **Diagnostic queries before fixes.** Don't assume database state.

---

## Tech Stack Reference

- **Database**: Supabase (PostgreSQL + RLS + REST API via PostgREST)
- **IDE**: Cursor
- **Frontend**: Bolt.new (React PWA, mobile-first, Bloomberg Terminal aesthetic)
- **Version control**: GitHub (grg360/FieldMark, private), current branch `foundation-rebuild`
- **Data sources**: PubMed (US-filtered queries), OpenAlex (paid), ClinicalTrials.gov, CMS Open Payments, CMS Medicare, NPPES NPI Registry
- **AI layer**: Claude API for narrative generation
- **Python pipelines** at `C:\Users\garre\Desktop\FieldMark`
- **Frontend** at `C:\Users\garre\Desktop\FieldMark\frontend`

### Key scripts (CLI patterns vary by script)
- `--dry-run` (no writes): scoring_pipeline.py, open_payments_aggregator.py, medicare_aggregator.py — default writes
- `--execute` (writes): established_scoring.py, community_classification.py, community_scoring.py, community_nppes_backfill.py, dedup_merge.py, trial_investigator_matcher.py, trial_ta_mapping.py — default dry-runs
- `--target-version v2`: scoring_pipeline.py, targeted_nppes_enrichment.py — selects schema version

---

## ASCO Context

- **ASCO 2026 starts Friday, May 29.**
- **Goal: social feed lit up Friday, NOT live demo.**
- DOL identification active, ASCO content fetching every 3-4 hours
- No structural changes during demo window
- Post-ASCO Phase 2 priorities: NIH RePORTER enrichment → Collaborative Orbit visual → other items in ROADMAP.md

---

## TECH_DEBT Highlights (see TECH_DEBT.md for full list)

- v1 canonical UUIDs still referenced in open_payments_aggregator.py and medicare_aggregator.py canonical_check blocks
- Chalasani 3-way surgical merge (~5 min SQL post-ASCO)
- community_classification.py kept for future ingestions but currently redundant
- Established cohort_score path-based (4,092 HCPs all=95); per-TA scores in hcp_established_scores_v2 are properly differentiated
- Trial-to-TA mapping ~2-3% false-positive rate (acceptable for demo)
- Frontend: Dark Horse/Workhorse rendering cleanup, tier nomenclature finalization, auth screen tagline republish, DOL wiring
- v1 archive: 1 week post-ASCO, export to .sql.gz and drop

---

## How to behave in the new chat

1. **Don't restate this whole document back to me.** Read it, internalize it, act on it.
2. **Confirm you understand by stating what's next.** "OK — picking up post-enrichment. Want me to verify scoring re-run completed, then start frontend?"
3. **Don't ask me to repeat context already here.** It's all in this doc + ROADMAP + TECH_DEBT.
4. **Run diagnostics liberally.** Schema, row counts, sample data. Verify before acting.
5. **When you draft Cursor prompts, be exhaustive.** Explicit column names, file paths, fallback logic, what to do after patching.
6. **Treat ASCO Friday as the immovable deadline.** Anything that doesn't help with that goes to TECH_DEBT.
