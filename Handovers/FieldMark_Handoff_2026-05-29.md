# FieldMark — Session Handoff (End of Friday May 29, 2026)

> **For the next Claude instance picking up this project: read this in full before any code, SQL, or recommendation.** It captures architecture, working style, current state, surprises along the way, and what's next. Skip nothing.

---

## How to start

**Before doing anything else, read all previous project chats in this Project.** Use `conversation_search` proactively. Garrett's context, decisions, and design choices live across many sessions, and re-deriving them wastes both of your time. If he references "the rising voices chart" or "the cohort gate" or "the dol matching pipeline," those have specific meanings — find them, don't guess.

Also re-read `fieldmark_methodology.md` in the repo root. It's the source of truth for design decisions, scoring math, and session logs. Garrett uploads it across sessions for context continuity.

---

## What FieldMark is (one paragraph)

A B2B SaaS platform for pharma Medical Science Liaison (MSL) teams that identifies *rising star* HCPs and Digital Opinion Leaders (DOLs) — researchers and clinicians who are gaining influence but aren't yet recognized in traditional KOL databases. Garrett is building it independently while holding a global leadership role at Avalere Health. Therapeutic areas in scope: NSCLC, Hepatology (PBC), Rare Disease, Immunology (Fall 2026). Tagline: *"We see the nebula. Not just the star."* The thesis: **signal detection over credential recognition.**

---

## Working style — read this carefully

Garrett moves fast, prefers direct work, and rejects optimistic framing. The interaction style that works:

- **Be honest about uncertainty.** If you don't know, say so. Don't paper over it with confident-sounding speculation.
- **Push back when something is wrong.** He explicitly values this. If a band-aid fix is being proposed, name it as a band-aid. If a workstream is underscoped, say so. He'd rather hear "this is bigger than it looks" than discover it himself two hours in.
- **No band-aid fixes.** This is non-negotiable. Garrett wants solutions that support the platform long-term, not quick patches that hide real architectural problems. Tonight we hit this exact moment: I proposed disabling a broken re-fetch as a quick win. He pushed back: *"sounds like a band-aid fix to me."* He was right. The real fix was a 2-column removal in a query, but the diagnostic work to find it took 30 minutes of careful investigation. **That investigation is the work, not an obstacle to it.**
- **Sequence with honest time estimates.** When proposing a docket, give realistic durations. "60-75 min" is useful; "quick fix" is not.
- **Stop when energy is fading.** Late-night decisions on complex architecture are bad decisions. Tomorrow's fresh eyes beat tonight's tired push.
- **Tell him when things are bigger than expected.** He'd rather defer than half-finish.

### PowerShell commands and `| clip`

Garrett works in PowerShell on Windows. **Always append `| clip` to commands whose output he'll paste back.** That captures the output to clipboard cleanly so he doesn't have to wrangle terminal scrollback.

Example:

```powershell
Select-String -Path .\frontend\src\lib\api.ts -Pattern "getHCPDetail" -Context 0,15 | clip
```

He has reminded me of this multiple times. Just do it from the start.

### Don't guess at table or column names

**Verify the schema before writing SQL or proposing fixes.** Multiple times tonight I assumed a column lived in a certain table — `cohort_score` on `hcp_scores_v2` is the example that bit us — and the query errored. Every time, the right move was a 5-second `information_schema.columns` query to confirm.

Pattern:

```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'hcp_scores_v2' 
AND column_name IN ('cohort_score', 'composite_score', ...);
```

Run that first. THEN write the real query. Saves real time.

Same goes for guessing function names, file paths, or what's in a script. **Check what exists before designing.** This lesson has surfaced 4-5 times across sessions. I almost rewrote `twitter_capture.py` once before realizing it already existed (673 lines of working code). Don't be that Claude.

### Files are large; clip your reads

`frontend/src/App.tsx` is 800+ lines. `frontend/src/lib/api.ts` is 2,200+ lines. `twitter_capture.py` is 673 lines. Never paste these whole files into chat. Use targeted `Select-String` with `-Context` flags to read what you need.

Common useful patterns:

```powershell
# Find function definitions
Select-String -Path .\frontend\src\lib\api.ts -Pattern "export async function" -Context 0,1 | clip

# Inspect specific function body
Select-String -Path .\frontend\src\App.tsx -Pattern "function mapRisingStarToHCP" -Context 0,40 | clip

# Find where a variable is set
Select-String -Path .\frontend\src\App.tsx -Pattern "setDetailHCP" -SimpleMatch | clip
```

### `conversation_search` for prior decisions

If Garrett references something that should already exist — a script, a decision, a piece of architecture — search past chats before saying "I don't see that." He has multiple sessions across this project and references are usually real.

### What he uses

- **Cursor IDE** for code edits via structured natural-language prompts
- **Supabase dashboard SQL editor** for direct database work
- **PowerShell + `quick_commit.ps1`** for git operations
- **Cloudflare Pages** for production deploys (auto-deploys from `foundation-rebuild` branch)
- **GitHub repo:** `grg360/FieldMark`
- **Local path:** `C:\Users\garre\Desktop\FieldMark`

---

## Architecture as it stands today

**Stack:**
- Frontend: React/Vite/TypeScript, built initially via Bolt.new, edited in Cursor
- Backend: Python data pipelines
- Database: Supabase Postgres
- Narrative generation: Claude API (Sonnet)
- Production: Cloudflare Pages from `foundation-rebuild` branch → `app.besselanalytics.com`
- Capture: `twitter_capture.py` (Twitter API v2, paid)

**Key tables (all `_v2` suffix — v1 is dead, don't use):**
- `hcps_v2` — 269K rows. The HCP profile table.
- `hcp_scores_v2` — research-based scoring components per (HCP, TA). Has rising_star and established HCPs. Does NOT have community HCPs.
- `hcp_rising_star_ranks_v2`, `hcp_established_ranks_v2`, `hcp_community_ranks_v2` — cohort-specific rank tables.
- `hcp_narratives_v2` — Claude-generated narratives. Column is `narrative_text`, not `narrative`. **This trips up old code.**
- `social_posts_v2` — captured Twitter posts. RLS enabled, zero policies. **Frontend cannot read this table directly.** Use materialized views.
- `social_users_v2` — Twitter user profiles
- `dol_matches_v2`, `npi_match_proposals_v2`, `trial_investigator_match_proposals_v2` — three staging tables that exist but have NO ROWS. Features never wired in v2. Filed as real workstreams.

**Four materialized views (refreshed via `refresh_social_analytics()` Postgres function):**
- `mv_social_share_of_voice_by_ta`
- `mv_social_hot_topics_by_ta`
- `mv_social_trending_topics_by_ta`
- `mv_social_voice_emergence_by_ta` — has precomputed `dominant_source_hashtag` column (added tonight)

**Three cohorts:**
- Rising Star (`rising_star`, also `dark_horse` for top tier)
- Established (`established`)
- Community (`community`, also `workhorse` for top tier)

`cohort_classification` lives on `hcps_v2` and was backfilled tonight for 124K HCPs (72,715 rising_star + 11,302 established + 40,154 community). 145K HCPs remain NULL — they're in the database but never scored, which is correct.

**`cohort_score` on `hcps_v2`** was also backfilled tonight for rising_star and established (using MAX normalized_score across their TA scores). **Community HCPs still have NULL cohort_score** because they aren't in `hcp_scores_v2` — their score is API-computed on-the-fly from Medicare + Open Payments aggregates. That's an architectural gap, see Tech Debt below.

---

## What we shipped today (full ledger across morning + afternoon + evening)

### Morning
- Narrative pipeline complete: 1,316 narratives generated (553 rising star + 262 established + 501 community), ~$4.23 total
- Pipeline refactored to be cohort-aware (TA visibility config, per-cohort prompts and formatters)

### Afternoon
- Pt. 11 HCP card redesign shipped to production (6+ iterations)
- Cloudflare Pages production branch corrected to `foundation-rebuild`
- v1→v2 audit across 21 table pairs (3 real staging-table gaps identified)
- ASCO Twitter capture: 3,217 posts, 753 users, $23.62
- EASL Twitter capture: 113 posts (real-small, hepatology Twitter is genuinely sparse)
- Four social analytics materialized views built end-to-end
- Rising Voices scatter chart shipped on production
- Real social cards shipped (replaced mock) with bio-keyword confidence-tier heuristic
- Hepatology cohort classification backfill

### Evening (this session)
- **`social_update.py` shipped and tested.** One-command pipeline: capture + tag + refresh. Subprocess wrapper around `twitter_capture.py`. Tested end-to-end with `--refresh-only` and `--tag "#EASL26"`. Garrett can run `python social_update.py --profile ASCO` daily during conferences.
- **`refresh_social_analytics()` Postgres function created.** SECURITY DEFINER, callable via Supabase `rpc()`. Refreshes all 4 MVs in one call.
- **Cohort score backfill executed.** 84K rising_star + established HCPs populated with `cohort_score = MAX(normalized_score)`. Backup table: `hcps_v2_cohortscore_backup_20260529`.
- **SOURCE bug fixed.** RLS on `social_posts_v2` blocked the frontend's cross-table lookup. Solution: rebuilt `mv_social_voice_emergence_by_ta` with precomputed `dominant_source_hashtag` column. Frontend reads from view; no more direct table access needed.
- **Detail page score wiring fixed.** Root cause: `getHCPDetail` queried `hcp_scores_v2` for `recency_bonus` and `cross_signal_bonus` columns that don't exist. Postgrest 400'd the whole SELECT, dropping all score data. Removing those two columns restored the data flow.
- **EASL 2026 capture during the conference week.**
- **DetailScreen diagnostic logging** added for field passthrough inspection.
- **LAPTOP_SETUP.md and `requirements.txt`** created for second dev environment.
- **Tech debt doc updated.**

---

## Surprises and lessons from today

Things I wish I had known before this session. Write these into your operating model:

### "Working tree clean" doesn't mean "all bugs fixed"

We hit moments where I overstated completeness — said "Almquist's detail page is wired end-to-end" when the publication timeline was still hardcoded mock data. Garrett caught this. The lesson: **be precise about what's real and what's still mock.** A page can render without errors and still be 40% mock data. Distinguish them clearly.

### Silent failures are everywhere in the codebase

Multiple Supabase queries 400 (Bad Request) silently. The frontend doesn't crash — it just falls back to nulls and the UI renders "Loading..." or "—" forever. **Always check the browser console for 400 errors when investigating a "data not showing up" bug.** They're often the smoking gun.

Tonight we found:
- `getHCPNarrative` queries `narrative` column (should be `narrative_text`) — 400s
- `getHCPDetail` queries `recency_bonus` and `cross_signal_bonus` (don't exist in schema) — 400s
- `publication_therapeutic_areas_v2` query broken — 400s
- `trial_investigators_v2` query broken — 400s

These have been firing all day, possibly for weeks. Real product damage hidden in the silence.

### The v1→v2 migration was incomplete in subtle ways

Three staging tables (`dol_matches_v2`, `npi_match_proposals_v2`, `trial_investigator_match_proposals_v2`) have ZERO rows because the matching pipelines were never wired for v2. Several queries reference v2 tables but use v1 column names. The migration didn't fully cover scripts that depended on the data shape. **Expect to find more of these.**

### Diagnostic console.logs are gold

When tracing a data-flow bug, adding `console.log` at strategic points beats reasoning about the code statically. Tonight's `[DetailScreen diagnostic]` log let us see in 5 seconds that DetailScreen renders 30+ times per page mount (a perf bug we hadn't noticed). Same diagnostic showed exactly where score data dropped between API and render.

**Always remove diagnostic logs after the fix lands.** Leaving them in production is sloppy. (We didn't remove tonight's diagnostic yet — file as cleanup.)

### Garrett's confidence about what exists is reliable

When he says "the script should be doing X" or "we built that already," he's almost always right. Search for it. Don't dismiss with "I don't see that in the code." His memory of the project is better than my context window.

### Cohort gates and overlap are real data integrity questions

88 HCPs appear in BOTH `hcp_rising_star_ranks_v2` AND `hcp_established_ranks_v2`. The cohort gate during scoring should produce non-overlapping sets. We promoted those 88 to rising_star tonight (last-write-wins), but that's a real product decision we made for him because the cohort gate didn't produce a clean result. **File: investigate why cohort gate produces overlap.**

### Backup before destructive UPDATEs

Backfilling 124K HCPs at once is reversible only if you snapshot first. We did. The pattern:

```sql
CREATE TABLE hcps_v2_cohort_backup_20260529 AS
SELECT id, cohort_classification, NOW() AS backup_time
FROM hcps_v2;
```

Then verify count matches before running the UPDATE. Cheap insurance.

### Social capture results are real and uneven

ASCO captured 3,217 posts. EASL captured 113. That's not a bug — hepatology Twitter is genuinely 1/30th of oncology Twitter. AASLD in November will be a richer hepatology window. **Communicate this honestly to users. Don't try to hide thin signal — surface it as "small but accurate."**

### Hardcoded fallbacks are landmines

`mapRisingStarToHCP` uses `item.narrative ?? "Narrative generating — check back soon."` That string fires when narrative is null. **The string lies** — nothing is generating. It just hasn't been queued. Real fix: replace with "Narrative not yet generated" — honest, accurate. Filed.

The publication timeline in `DetailScreen.tsx` is `[{year: 2020, value: 2}, ...{year: 2024, value: 11}]` hardcoded. Every HCP shows the same fake chart. **Real product damage.** Filed as priority workstream.

---

## Supabase Data API grants — new pattern as of May 30, 2026

**Read this before creating any new table.** Supabase shipped a breaking change: starting May 30, 2026 (today, as of this handoff), new projects no longer auto-expose `public` schema tables to the Data API. On October 30, 2026, this becomes enforced on all existing projects including FieldMark.

Garrett opted in early on the existing FieldMark project. That means **starting now, every new table in `public` schema requires explicit `GRANT` statements** before the Data API (PostgREST, `supabase-js`, `/rest/v1/`) can see it. Existing tables (the ~50+ we have) keep their current grants — they're unaffected.

### The one-time opt-in (already run, just for context)

The following was executed in Supabase SQL editor to opt in on the existing project:

```sql
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
```

This changed the default for FUTURE tables. Existing tables were unaffected.

### Canonical table-creation pattern going forward

Every new table needs this full block. **Do not create tables without it** — they'll be invisible to the frontend and you'll spend 30 minutes debugging silent 400 errors.

```sql
-- 1. Create the table
CREATE TABLE public.your_new_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... your columns
  created_at timestamptz DEFAULT now()
);

-- 2. Grant access to the roles that need it
GRANT SELECT ON public.your_new_table TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_new_table TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_new_table TO service_role;

-- 3. Enable RLS
ALTER TABLE public.your_new_table ENABLE ROW LEVEL SECURITY;

-- 4. Add RLS policies appropriate to the table
CREATE POLICY "..." ON public.your_new_table FOR SELECT TO authenticated USING (...);
```

### Adjust per-table based on access needs

- **Internal/admin-only tables** (e.g., the `hcps_v2_cohort_backup_20260529` snapshot table): skip the `anon` and `authenticated` grants. Only `service_role` needs access. Or skip grants entirely if no API access is needed.
- **Read-only public tables**: grant only `SELECT` to `anon` and `authenticated`.
- **Materialized views**: not directly affected by default privileges — they inherit from base tables. But if you create a new MV, verify the frontend can read it before assuming it's reachable.
- **Postgres functions** (like `refresh_social_analytics()` we built tonight): use `GRANT EXECUTE ON FUNCTION ... TO ...` separately. Already in use.

### What changes for routine work

**Most SQL work is unaffected.** Queries, UPDATEs, MV refreshes, function calls — all work the same. The change only matters when you CREATE TABLE in the `public` schema.

### Telling Cursor about this

When prompting Cursor to create a new table, include language like:

> "Use the canonical FieldMark table creation pattern with explicit GRANTs for anon, authenticated, and service_role roles. Enable RLS. Define appropriate RLS policies."

Or reference this section of the methodology doc directly in the prompt.

### Filed workstream: audit existing tables

Real follow-up work: some existing tables shouldn't be exposed via the Data API (e.g., backup tables, internal scoring intermediate tables). Audit the table list and revoke unnecessary Data API access:

```sql
revoke all on table public.your_internal_table from anon, authenticated, service_role;
```

The Supabase Dashboard's "Data API exposure badge" and Security Advisor flag candidates worth reviewing. Not blocking — file as cleanup work.

### Rollback (only if needed)

If anything breaks during the transition, the rollback is reversible:

```sql
-- Restore the old default behavior
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- Fix any tables created since opt-in
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
```

Don't rollback unless something is actually broken. The new default is better architecture.

---

## Tech debt — the full list

In rough priority order:

### Detail page wiring (real workstream)

1. **Publication timeline still hardcoded mock.** `DetailScreen.tsx` lines ~408-420. Real fix requires resolving the `publication_therapeutic_areas_v2` 400 error in `getHCPDetail`, then wiring real data into the timeline render. **Product-damaging — every HCP shows the same fake chart.**

2. **`getHCPNarrative` (api.ts line 205-237) has 2 broken queries.** Lines 215 and 230 use `.select("narrative")` but the column is `narrative_text`. Fix: change both string literals. Two-line fix.

3. **`trial_investigators_v2?sel...ource_th...` 400.** Still firing from `getHCPDetail`. Need to inspect query around api.ts line 1685.

4. **`publication_therapeutic_areas_v2` 400.** Query at api.ts line 1663 with nested join. Unknown what's broken — needs investigation.

5. **Identification block empty for Almquist** despite his row existing in `hcps_v2`. Either his row genuinely lacks NPI data or the data flows but isn't rendering. Need to check his row directly.

6. **DetailScreen re-renders 30+ times per page mount.** Real perf bug. Likely useEffect dependency thrash or unstable prop references. Not blocking but should be fixed before any demo.

### Community cohort score architectural gap

7. **40,154 community HCPs have NULL `cohort_score`.** They aren't in `hcp_scores_v2` (which only holds research-based scoring). Community scoring uses `hcp_medicare_summary_v2` + `hcp_open_payments_summary_v2` computed at API-request time. Real architectural fix: either populate `cohort_score` from a Medicare + Open Payments aggregate, or accept that community detail pages will show empty cohort score until a different read path is wired.

### Narrative coverage gap

8. **Narrative pipeline produced incomplete coverage.** Per-cell counts from this morning's batch:
   - hepatology/rising_star: 290 ✓
   - hepatology/community: 252 ✓
   - hepatology/established: 119 (small but reasonable)
   - nsclc/rising_star: 263 ✓
   - nsclc/established: 143
   - nsclc/community: **82** (expected ~250 — undersized)
   - rare-disease/community: 167
   - rare-disease/rising_star: **0** (missing entirely)
   - rare-disease/established: **0** (missing entirely)
   
   Root cause unknown — investigate `narrative_pipeline.py` logs from this morning, or rerun for missing combinations. Bounded cost (~$2-5).

9. **Fallback messaging dishonest.** "Narrative generating — check back soon." should be "Narrative not yet generated for this HCP." 5-min Cursor edit in App.tsx line 220.

### Cohort gate data integrity

10. **88 HCPs appear in both rising_star AND established rank tables.** Cohort gate should produce non-overlapping sets. Real investigation — read the cohort gate logic, find the overlap source.

### Diagnostic cleanup

11. **Diagnostic console.log in DetailScreen.tsx** added tonight for debugging the score-passthrough bug. Should be removed.

### Cosmetic / minor

12. **`quick_commit.ps1`** had a hardcoded branch fix earlier — verify it's right.
13. **Vercel dead project deletion** — `field-mark.vercel.app` is filed for deletion but not yet deleted.
14. **TA selector "0 verified DOLs" count** — should pull from voice emergence view distinct handles, not from the empty `dol_matches_v2` table.

### Supabase Data API grants audit

16. **Audit existing tables for Data API exposure.** Garrett opted in to the new Supabase default grants behavior. Existing ~50 tables still have legacy default grants. Some shouldn't be reachable via the Data API (backup tables, internal scoring intermediates, staging tables). Walk through the table list, identify tables that should be locked down, run targeted `REVOKE` statements. Use Supabase's Security Advisor and Data API exposure badge to surface candidates. Not blocking — cleanup work.

### Trademark

17. **FieldMark trademark conflict** — USPTO serial 99703320 (live/pending, Class 042). Unresolved. Real product decision: rename or fight. Tier naming (Dark Horse confirmed; Ascendant leading candidate for rising star tier) deferred.

---

## Where we're going next (Garrett's stated priorities)

### **PRIORITY 0: ASCO reply chain capture before window closes (Monday June 1)**

> **Read this first.** Time-sensitive workstream that didn't exist when this doc was first written. Full details in `FieldMark_Social_Workstream_2026-05-30.md`, summary here.

Twitter/X API standard search has a 7-day rolling window. ASCO 2026 Day 1 reply chains become unreachable on **Wednesday June 4**. Subsequent days roll off through the following week.

**The cost to capture reply chains for top-50 ASCO posts + all drug-mention posts is approximately $10-15.** That's a hard cap. Beyond that is overkill.

**Why it matters:** The top-level posts validated the drug-mention moat tonight (120 posts, 99 voices, 9 drugs surfaced in Day 2 alone). The reply chains are where substantive interpretation lives — expert disagreement, safety concerns, comparative analysis. Reply chains ARE the differentiated signal that elevates FieldMark from "we capture conference posts" to "we surface what oncologists are actually saying about your drug."

**Garrett's schedule:**
- Saturday May 30 (today) — capture surveyed, docs updated, light session
- Sunday May 31 — limited session
- Monday June 1 — **significant session available, BUILD DAY**
- Tuesday June 2 — buffer
- Wednesday June 4 — Day 1 reply window closes

**Monday June 1 is the build day.** Estimated ~2.5 hours. Schema additions + new `capture_replies.py` script + small-batch test + full run on selected post IDs + integration into `social_update.py`.

Full implementation sketch (script architecture, SQL for selecting target posts, schema changes) is in the Social Workstream doc. Don't re-derive — read that doc and execute.

### After Priority 0, then the previously-filed priorities:

1. **Investigate narrative pipeline gap** — why rare-disease research cohorts skipped, why nsclc community undersized.
2. **Publication timeline real data wire** — the highest-leverage detail page fix.
3. **Identification block diagnosis and fix.**
4. **Fix remaining 400 errors.**
5. **Replace dishonest fallback messaging.**
6. **Investigate DetailScreen 30+ re-render perf bug.**
7. **Community cohort_score architectural path.**

### Real product direction (medium term)

This is where it gets interesting. Garrett's vision goes well beyond bug-fixing:

#### Drug-level intelligence from social

The single biggest moat workstream. Hashtags capture conference-level activity but **don't carry drug-level conversation.** When an oncologist tweets "the KRAS G12C data is impressive but adoption will hinge on tox profile," that post might carry `#ASCO26` as a hashtag, but the drug-class signal lives in the post text.

**The workstream: LLM-based drug/entity extraction from `social_posts_v2.post_text`** to surface drug-specific conversations. Outputs: per-drug volume, sentiment, and rising voices. Real differentiator. 2-3 day workstream.

This is what makes FieldMark genuinely valuable to pharma MSL teams. They don't care about "ASCO 2026 buzz" — they care about "who's talking about *our drug class* and what are they saying?"

#### More social analytics and visualization

Beyond drug extraction, real product directions Garrett is thinking about:

- **Congress-specific pages.** Event-scoped views (e.g., "ASCO 2026 Conference Pulse") separate from steady-state rising voices. Drug-mention drilldown by hashtag, day-by-day timeline, session-linked spikes.
- **Sentiment-per-drug** via Claude API.
- **Topic clustering** via embeddings to surface emerging conversation themes.
- **Predictive rising-voice model** — who's about to surge based on engagement trajectory.

#### Collaborative Orbit

**This is the strategic moat feature Garrett wants to start thinking about.** Maps co-investigator relationships to surface rising stars in the orbit of established KOLs. Real product hook: "Show me the rising stars working with [Famous KOL]" — that's a question no other tool answers cleanly.

Architecturally: `trial_investigators_v2` + `publications_v2` (co-authorship) data is the substrate. Build a graph. Surface "orbit" connections in the UI.

Filed as v1.5 foundation, v1.6 surfacing.

#### Other strategic items

- **Weekly automated refresh pipeline** → live intelligence feed
- **Monday morning digest** as primary retention mechanic
- **Phase 3.5: sponsor independence scoring** (no pharma relationships = higher score)
- **Immunology TA** (currently "Coming Soon", Fall 2026)
- **EU CTIS ingestion**
- **LinkedIn data surfacing** on profile screen (priority field: company name like "Ipsen")

---

## Where ASCO Day 2 capture is right now (or just completed)

Garrett fired `python social_update.py --profile ASCO` shortly before this handoff was written. By the time the next session starts, capture should be complete. Expected outcomes:

- New posts captured from Day 2 (Saturday morning of ASCO — heavy abstract presentation traffic)
- Cost likely $15-30 depending on volume
- All 4 materialized views refreshed
- Oncology Social tab on production reflects new data

**First thing to do in next session:** ask Garrett what the capture summary showed (post count, cost, anything unexpected). Then walk through what changed on the Social tab — new rising voices, hot topics shifts, trending strip updates.

He had a balance of $62.50 when he started. If capture cost more than that, the run would have failed mid-stream with an auth/balance error. Worth checking.

---

## Things that matter to Garrett's product vision

A few honest read-outs on what he cares about beyond features:

### Substance over polish

Garrett rejected moving to frontend polish before scoring was correct. *"Don't put lipstick on a pig."* Respect this sequencing. If scoring is wrong, fixing UI is premature.

### Honest framing of sparse data

When EASL captured only 113 posts vs ASCO's 3,217, the right product response wasn't to hide hepatology — it was to communicate the gap honestly. "Small but accurate" beats "looks the same as oncology but is actually mostly fake."

### Real product decisions made at real pace

He explicitly rejects artificial urgency. "Demo tomorrow" is not a reason to ship broken work. Real product decisions get made at appropriate pace.

### Long-term platform thinking

Every fix should support the platform 6+ months from now. Band-aids that hide problems get rejected. Architectural fixes that take longer get prioritized.

### Methodology document is the source of truth

`fieldmark_methodology.md` should stay current. Major decisions, scoring math changes, session logs all go in there. Garrett uploads it to new chats for context continuity.

---

## Things I think are worth mentioning

A few observations that don't fit elsewhere:

### The frontend has real tech debt accumulating in `api.ts`

It's 2,200+ lines with multiple functions doing overlapping work. `getRisingStars` / `getEstablished` / `getCommunity` share a lot of logic but are duplicated. The narrative-fetching pattern appears 5 times across the file. Eventually this needs a refactor — but not now. Filed.

### Two-machine git discipline

Garrett set up FieldMark on a laptop tonight (separate chat). Now there are two dev environments. Standard pattern: `git pull` before starting, `git push` before stopping. `LAPTOP_SETUP.md` is in the repo root with the full guide.

### Cost discipline matters

Twitter API isn't free. Narrative generation isn't free. Each run has a real cost, and Garrett funds this himself. Always estimate cost before firing a capture. Don't run "just to see what happens" — propose, get sign-off, then fire.

### When to push back vs. when to defer

Push back when something is technically wrong or strategically weak. Defer to Garrett on product decisions, naming, prioritization. Don't argue with his vision; do flag when execution will undermine it.

### Always check what exists

Five times tonight, the right move was to read existing code before designing new code. The wrong move would have been to write something from scratch. **This is the highest-leverage rule.** Apply ruthlessly.

---

## Closing thought

FieldMark is real product work. The thesis is sound (signal detection over credential recognition), the architecture is sound (data pipeline → scoring → visualization → social signal), and Garrett is shipping. The tech debt is real but bounded. The product direction has clear long-term differentiators (drug-level intelligence, Collaborative Orbit).

Treat this project like the real thing it is. Don't propose band-aids. Do investigate carefully. Read previous chats before getting started. Use `| clip`. Verify schema before writing SQL. Be honest about what's mock vs real. Push back when needed.

Good luck. Build it well.

— Claude, end of Friday May 29, 2026
