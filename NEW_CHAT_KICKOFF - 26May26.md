# Kickoff Prompt for New Chat (May 27, 2026 Morning Session)

Paste this as your first message in the new chat. Attach HANDOFF.md, ROADMAP.md, TECH_DEBT.md, SCRIPT_CATALOG.md, and TA_EXPANSION_ROADMAP.md as files alongside it.

---

## PROMPT TO PASTE:

Hi Claude. I'm Garrett. I'm picking up FieldMark work after a long Day 5 of foundation rebuilding yesterday. Before we start, please read the attached documents carefully:

- **HANDOFF.md** — Briefing doc covering my working style, how to communicate with me, the current state of v2, and immediate priorities. Read this first.
- **ROADMAP.md** — Phase plan through post-ASCO.
- **TECH_DEBT.md** — Outstanding items deferred during build.
- **SCRIPT_CATALOG.md** — Inventory of every Python script with descriptions and run sequence.
- **TA_EXPANSION_ROADMAP.md** — 12-month TA expansion plan.

A few critical things to know before we start:

**Where we are right now:**
Yesterday I finished the v2 foundation rebuild — dedup landed (640 stubs merged), trial linkage went from 3% to 19.5%, Established and Rising Star cohorts scored cleanly, and we built the Community cohort end-to-end (40,154 HCPs classified, full NPPES enrichment, all 5 v1 signals scored). The frontend api.ts was cut over to v2 tables. Last night I confirmed v2 data is live in the frontend — Sanyal's page renders with his post-dedup state ($387K OP, merged trial data).

**Latest commit on `foundation-rebuild` branch is 7f440ec.** Run `git log --oneline -5` to confirm starting state.

**Today's goal: frontend triage and refinement.** The data foundation is solid. Now I need to find and fix the surface issues that became visible once v2 data started rendering.

**Initial tasks I want to work through together (in priority order):**

1. **Start the dev server and walk through the cohorts together.**
   - `cd frontend && npm run dev`
   - Open the app
   - I'll share screenshots; you help me triage what looks wrong

2. **Investigate the cohort count discrepancies.**
   Frontend dashboard showed:
   - Hepatology Rising Stars: 103 (we scored 142,178 candidates — what's the threshold filter?)
   - Hepatology Established: 228 (we scored 11,389 — same question)
   - Hepatology Community: 820 (we wrote ~20K Hep community-TA pairs — where are the rest?)
   - NSCLC missing from the TA selector entirely (only "Oncology" shown — is that an alias?)
   
   The frontend likely has its own threshold/display logic. Find where it lives in `frontend/src/lib/api.ts` and the components that consume cohort counts.

3. **Investigate the 404 error in Sanyal's detail page console.**
   `Failed to load resource: status 404` — something specific isn't loading. Probably a missing narrative or stale endpoint. Find it and either fix or log to TECH_DEBT.

4. **Check the Career Publications discrepancy.**
   Sanyal's frontend shows 1,383 pubs but our v2 query showed 1,456. Different number. Find which column the UI reads from (probably total_career_pubs or stored publication_authors count) and confirm whether the gap is a stale cache, a different signal, or a bug.

5. **Confirm the score normalization scheme.**
   Heymach showed 84.05 in the frontend NSCLC Established list but our scoring output showed normalized_score=78.47. Different. Either the UI is showing cohort_score (path-based, in hcps_v2) instead of normalized_score (from hcp_established_scores_v2), or there's another transformation. Find the source field.

6. **Spot-check canonical KOLs across cohorts.**
   - Loomba should be Hep #1 Established with $271K OP
   - Sanyal should be Hep #2 Established post-dedup
   - Kowdley should be visible (he was Trial=0 before dedup, ~30 now)
   - Chalasani is the 3-way partial — note the visible state, log fix to TECH_DEBT
   
   Walk through each one. If something looks wrong, surface it.

**How I want you to work with me:**

- Read HANDOFF.md for working style before responding. Specifically: be honest about what's broken, push back when something is technically weak, no padding or fluff, concise responses.
- When you need to investigate the frontend code, ask me to run `Select-String` or `view` commands. I'm on Windows PowerShell.
- For Cursor prompts: wrap them in code blocks with explicit instructions ("after patching: show me the diff, compile, do NOT run yet").
- Don't assume things about the codebase. Verify by reading files or running diagnostics.
- ASCO Friday May 29 is the immovable deadline. Anything that doesn't help with ASCO goes to TECH_DEBT.

To confirm you've read the context, briefly state back to me: (a) what cohort I built end-to-end yesterday, (b) what canonical KOL has a 3-way partial dedup issue, and (c) what's at the top of today's priority list. Then we'll start the dev server.
