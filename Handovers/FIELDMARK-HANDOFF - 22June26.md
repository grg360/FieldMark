# FieldMark Handoff Document

**Last updated:** Friday, June 19, 2026, ~9pm (last night of vacation; travel home tomorrow)
**Working doc reference:** FINAL-PRE-DEMO-LIST.md (definition of done = empty list)
**Target:** Mentor demo emails to Larry and John, ~1 week out (next weekend)

---

## Project Context

Garrett is the solo founder of Bessel Analytics, building FieldMark — a B2B SaaS platform for pharmaceutical Medical Science Liaison (MSL) teams. The platform identifies and ranks Healthcare Professionals (HCPs) across therapeutic areas, surfacing rising-star and emerging HCPs before they become widely recognized KOLs, plus Established and Community cohort intelligence.

Garrett brings 20+ years of medical communications experience and a global leadership role at Avalere Health, which he keeps at arm's length from FieldMark.

**Company name:** Bessel Analytics
**Product name:** FieldMark
**Production URL:** app.besselanalytics.com
**Active branch:** foundation-rebuild (auto-deploys to production via Cloudflare Pages)
**Repo:** grg360/FieldMark
**Local path:** C:\Users\garre\Desktop\FieldMark
**Supabase project:** tflrfkocbdkizmkhimiw

**Target users:** MSLs (field medical) as primary end users; Medical Affairs leadership as secondary audience
**Therapeutic areas:** NSCLC (primary, demo-ready), Hepatology (demo-ready), Rare Disease (stale, on hold), Immunology (coming soon)
**Three cohorts:** Established (gold #FFD700), Rising Stars (purple #9B6DFF), Community (blue #7B9EBD) — mutually exclusive

---

## Working Style — How Garrett Likes to Work

**Cursor-driven workflow:**
- Claude writes prompts → Garrett pastes into Cursor → applies → pastes diff/output back
- File-by-file prompts preferred over bulk changes
- Hot reload via local dev server (Vite, port 5173); npm run dev from frontend/

**Cursor prompt format:**
- TASK section explaining what and why
- ABSOLUTE CONSTRAINTS section (which file, no execution, plain ASCII, STOP if find string doesn't match)
- FIX section with exact find and replace strings
- VERIFICATION block with PowerShell Select-String commands and expected results
- OUTPUT (REQUIRED) section listing what Cursor must report back
- DO NOT section listing what must remain untouched

**Commits:**
- `.\quick_commit.ps1 "message"` then `git push`
- Verify on localhost first; Cloudflare auto-deploys ~1-2 min on push
- Bundle waits behind browser cache - hard refresh required to see fix

**PowerShell:**
- `| clip` appended for easy pasting back to Claude
- `Select-String` for targeted reads on large files
- File paths sometimes truncate in pipe output - ForEach-Object reformat fixes it
- Careful with regex quoting (has caused hangs)

**SQL:**
- Supabase dashboard SQL editor
- Standalone statements only - no BEGIN/COMMIT (don't persist in web editor)
- No -- comments (cause errors)
- New tables/views require explicit GRANT SELECT to anon and authenticated roles plus NOTIFY pgrst, 'reload schema' - RLS alone is insufficient
- Always verify column names from information_schema before writing queries

**Decision style:**
- Garrett wants ONE concrete recommendation with a reason, not multiple options
- Uses "locked" to signal sign-off
- Pushes back hard on lazy framings and over-cautious pacing
- "I don't want to put lipstick on a pig" - prefers fixing root causes over band-aids
- Decision style favors honest assessment over agreement

**Network diagnostics:**
- Network panel recording must be ON before building theories
- Lesson learned hard after a diagnostic session went sideways

**Validation patterns:**
- Dry-run every pipeline before full execution
- Commit at clean milestones before major structural changes
- Port discipline: 5432 for pipeline scripts, not the pooler on 6543

---

## Database — Main Tables Reference

**This is the section new chats burn time reconstructing. Use this first.**

### Core HCP Tables

**`hcps_v2`** — Primary HCP table (NOT `hcps` — that's legacy, see footgun below)
- Primary key: `id` (UUID) — NOT `hcp_id`
- Key columns: `first_name`, `last_name`, `institution_canonical`, `nppes_practice_state`, `cohort_classification` ('established' | 'rising_star' | 'community' | 'unclassified'), `country`, `npi`
- ~12,000+ rows
- `cohort_classification` is the canonical truth - if rank tables disagree with this, the rank tables are wrong (Rising Star pipeline leak case)

**`hcps`** — LEGACY, DO NOT USE
- Stale parallel table with different UUIDs for same individuals
- Shares only NPI numbers with hcps_v2
- Known footgun: queries against this look right but give wrong IDs
- Should be renamed or added to KNOWN_ISSUES.md

### Ranking Tables (production scoring is v3)

**`hcp_established_ranks_v3`**
- Columns: `id`, `hcp_id`, `therapeutic_area_id`, `scope_type`, `scope_value`, `rank`, `cohort_score`, `scientific_influence_pctile`, `network_influence_pctile`, `pharma_engagement_pctile`, `computed_at`
- Scope values: global (11,390 rows), region='US' (2,885), region='CN' (2,452), etc.
- Source script: `recompute_established_ranks_v3.py`
- Formula: 50% Scientific + 35% Network + 15% Pharma

**`hcp_rising_star_ranks_v3`**
- Has BOTH `rank` and `us_rank` columns
- Key columns: `hcp_id`, `therapeutic_area_id`, `rank`, `us_rank`, `rising_star_percentile`, `scientific_momentum_percentile`, `network_momentum_percentile`
- Source script: `rising_star_scoring.py` (currently has the leak bug)
- Formula: 70% Momentum (50/50 Sci/Net) + 30% Visibility (50/50 Sci/Net), effective 35/35/15/15
- ACADEMIC HCPs only, ≤15 years since first publication
- Four archetypes: Balanced, Scientific Accelerator, Network Accelerator, Emerging Leader

**Community scoring** (`community_scoring.py`)
- 40% patient_volume + 30% pharma_engagement + 15% group_practice_signal + 10% career_years + 5% publication_signal

**Workhorse cohort: RETIRED** — no active scoring weights but render branches still exist in HCPCard.tsx (phantom paths to clean up)

### AI Content Tables

**`hcp_narratives_v2`**
- Columns: `id`, `hcp_id`, `therapeutic_area_slug`, `narrative_text`, `prompt_version`, `model_used`, `generated_at`, `why_now`, `engagement_angle`, `signal_strength`, `caution_flags`
- 2,292 HCPs covered with OLD methodology numbers - needs regeneration (highest demo impact task)

**`hcp_ai_overviews`**
- Columns: `synthesis_type`, `therapeutic_area`, `body`
- Used by AI Synthesis blocks on /me

### Relationship & Workflow Tables

**`msl_hcp_relationships`** — User-HCP relationship spine
- Columns: `id`, `user_id`, `hcp_id`, `status`, `created_from`, `first_added_at`, `last_interaction_at`, `updated_at`
- `created_from` values: 'cohort_card', 'coverage_gaps', 'hcp_detail_insight', 'hcp_detail_followup', 'brief', 'relationship_section'

**`msl_watchlist_items`** — Composite key, no `id` column
- Columns: `watchlist_id`, `relationship_id`, `added_at`, `pinned`, `list_note`, `sort_order`
- Default "Watching" watchlist ID: `5a597413-c93c-407d-91c9-8a066e850932`
- Pattern: a relationship without a watchlist entry = orphan (causes UI inconsistency between bookmarks and chips)

**`msl_hcp_next_actions`** — Follow-ups table
- Columns: `relationship_id`, `user_id`, `body`, `due_at`, `priority`, `created_from`
- Created via `createNextAction` in `frontend/src/lib/relationships.ts`

**`msl_hcp_notes`** — Insights/notes
- Created via `createNote` in same file

### Open Payments / Pharma Engagement

**`hcp_open_payments_top_companies_v2`** — Top companies per HCP
- Critical: ensure `open_payments_aggregator.py` populates this in third write path (missed in v1)
- Verify ALL THREE tables populate after any v2 run: summary, by_ta, top_companies

### Performance-Critical Views

**`institution_investigator_counts`** — SQL VIEW created Jun 19
- Columns: `institution_canonical`, `investigator_count`
- Replaces JS loop that paginated through hcps_v2 to count - reduced Institutions page from 22-35s to under 5s
- Pattern to follow for future aggregation needs

### Validation HCPs

**Primary demo flow:**
- John V. Heymach: `2302d82f-c44a-498e-b0ab-6ca39a3f8964`
- Aditi P. Singh: `659e0892-0795-4976-9938-8e43e4ea473b`
- Schoenfeld: `7efaec17-c95c-4cd2-ae25-834170adcdae`
- Dagogo-Jack: `51760cb9-3694-4e5c-a7e5-937c477c495f`
- Pasi A. Jänne (with umlaut, NOT 'Janne' - DB encoding sensitive)

**Secondary NSCLC validation cases:**
- Jänne, Ramalingam, Spira, Xiuning Le

**Cohort leak test case:**
- Biagio Ricciuti — appears at Established #62 US (score 97.5) AND Rising Star #122 US. Should not be on Rising Star table.
- Jamie E. Chaft (`e42dfa93-b412-4130-a31e-f0ee8c281567`): canonical `cohort_classification = 'established'` but appears on Rising Star dashboard. Detail page colors her gold (correct for canonical classification, confusing for users seeing her on Rising Star table)

**Test user (Garrett):**
- user_id: `f0a8352f-3846-4a85-b96d-f91d8b3109f4`
- Username: GG / Garrett Reeves

---

## Column Name Traps (Recurring Failures)

These cost real time in past sessions:
- `hcps_v2` PK is `id`, NOT `hcp_id`
- State column: `nppes_practice_state`, NOT `state`
- Publications PMID: `pubmed_id`, NOT `pmid`
- Rising star rank: has BOTH `rank` and `us_rank`
- Jänne stored with umlaut, not 'Janne' - encoding-sensitive matching
- `hcp_narratives_v2` uses `therapeutic_area_slug` (text slug), other tables use `therapeutic_area_id` (UUID)

**Always verify before writing queries:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_schema='public' AND table_name='[table]' 
ORDER BY ordinal_position;
```

---

## Tools & Resources

**IDE:** Cursor (primary code generation environment)
**Database:** Supabase Postgres (`tflrfkocbdkizmkhimiw`)
**Deployment:** Cloudflare Pages, auto-deploy from `foundation-rebuild` branch
**Frontend:** React/Vite/TypeScript
**Backend:** Python data pipelines
**AI integration:** Claude API (Sonnet 4.6) for narrative generation and AI Synthesis features
**Marketing site:** Framer (Basic, $10/month) with purchased AI-startup template
**Design:** Figma for mockups
**Analytics:** PostHog (session recording, user identification on auth, reset on sign-out)
**Data sources:** OpenAlex, PubMed, ClinicalTrials.gov, NPPES, CMS Open Payments, Medicare Provider Data, Twitter/X capture
**Shell:** PowerShell with `| clip` pattern
**Version control:** GitHub (`grg360/FieldMark`)

**Note:** When unsure about Anthropic model strings, search before using - do not assume from memory. Current as of recent sessions: `claude-sonnet-4-6`.

---

## What's Been Shipped (This Week's Ledger)

### Earlier in week
- HCP Detail page migrated to AppLayout with breadcrumbs
- User menu redesigned with WORKSPACE/DISCOVER sections, collapsible HCP Dashboards drawer
- "Scientific Narrative" renamed to "Belief Profile"
- Coverage Gaps tracked chips auto-refresh fixed
- Score chip clicks navigate to HCP profiles (ScoreModal deleted)
- `/methodology` page with full prose, cohort accent colors, formula code blocks
- createNote fix: now uses addHcpToDefaultOrCreate (commit 664092e)
- createNextAction fix: same pattern (commit a9fbc19)
- 7 ghost relationships backfilled with watchlist entries

### Thursday vacation laptop session (10 IA/polish wins)
- Removed Institutions button from cohort dashboard filter row (accessible via GG menu now)
- "Rising" → "Rising Stars" label on Institutions index
- "NSCLC landscape" → "NSCLC Landscape" capitalization
- "In territory (N states)" → "Territory (N states)"
- WelcomeBanner belly band deleted from cohort dashboards
- "X of Y identified" counter removed from filter row (redundant)
- DASHBOARDS order: Established → Rising Stars → Community (cohort gradient)
- Row order: TA → Indication → Cohort (proper drill-down)
- "INDICATION" label span removed from Indication filter row
- Cohort row centered with all 6 tabs visible at desktop widths (resolved CSS specificity bug with !important rule in index.css)

### Friday morning
- **Institutions page perf: 22-35s → under 5s** (removed dead external-partners work + created `institution_investigator_counts` SQL view to replace JS aggregation loop)
- **Mobile chip misroute fix** on Coverage Gaps tile (increased chip gap from 6 to 16 to prevent touch zone overlap)
- Chaft + Yu orphan backfill via SQL (had been created as orphans during stale-bundle mobile usage)
- createNextAction fix verified working in production (Christiani test confirmed)
- Post-login redirect changed from `/` (cohort dashboard) to `/me` (personal workspace)

### Friday night
- "Why This Expert" color bug investigated - confirmed not a frontend bug, it's the Rising Star pipeline leak manifesting (Chaft's canonical cohort_classification is 'established'; detail page correctly colors her gold)

---

## Pre-Demo Tech Debt List (Definition of Done)

### Remaining Quick Wins (laptop-friendly)
- **Cursor pointer audit** — Some clickable non-button elements (GG avatar, chip X buttons) show text I-beam instead of pointer. Either inline cursor:"pointer" per element or global CSS rule. ~15-30 min.
- **Brief cache investigation** — Verify cache check fires BEFORE the LLM API call, not after. ~10-15 min diagnostic.
- **Research themes diagnostic SQL** — Count themes with frequency=1, assess cleanup impact. 5 min SQL.

### Desktop Session Required (Python Pipeline Work)

**Narrative Regeneration (HIGHEST DEMO IMPACT)**
- 2,292 HCPs have narratives in `hcp_narratives_v2` but all quote OLD methodology numbers
- `generate_narratives_v2.py` config points at v2 tables with v2 fields; production is v3
- Plan: Update COHORT_SCORE_CONFIG['established'] to v3 tables, update HCPContext dataclass to v3 fields, update prompts to v3 methodology language (50/35/15 weights), truncate hcp_narratives_v2 for NSCLC or --force flag, dry-run ~10 HCPs first, full backfill ~2,689 HCPs
- Cost: ~$36 (Sonnet 4.6, ~600 input + 250 output tokens × 2,689 HCPs)
- Time: 60-90 min focused desktop work
- Post-demo follow-up: Update narrative prompts to lead with leadership percentile rather than raw publication volume (Shaw case: 689 total pubs but 99th percentile for leadership; percentile is more defensible for MSL use cases)

**Rising Star Pipeline Leak**
- 63 HCPs with cohort_classification='established' leaking into hcp_rising_star_ranks_v3
- Confirmed: Biagio Ricciuti shows Established 98 on detail page but Rising Star 47 (rank #122 US) on cohort card
- Confirmed: Jamie E. Chaft same issue (manifested as the "color bug")
- `rising_star_scoring.py` missing cohort_classification filter
- Plan: add filter consulting `hcps_v2.cohort_classification = 'rising_star'`, re-run pipeline (NSCLC + Hepatology), verify count drops 1,644 → ~1,581
- Why not frontend filter: 22 query sites across api.ts/home.ts/watchlists.ts - sprawling and error-prone
- Time: 30-45 min focused desktop work

### Frontend Work (Could Be Either)

**Watchlists Feature: Include Tracked Institutions**
- Watchlists page only shows HCPs; should also show tracked institutions
- Real product/schema work - institution watchlist items, mixed-type UI
- Decision points: same watchlist or separate? Same UI patterns or differentiated?
- Defer to desktop for product design

**Flag Organizations in Social Feature** (NEW from Friday morning)
- Social feature surfaces organizational accounts (OncoAlert, likely ESMO/ASCO/etc.) mixed with individual HCPs
- Add an org-vs-individual flag, render orgs with distinct visual treatment
- Open Questions: Where does org classification live? Manual list to start, or automated detection?
- Time: 30-60 min if scoping stays small

### Pre-Existing Cleanup Items

**ScoringExplainedModal Deletion** — 421-line modal superseded by /methodology page; entry already hidden in TopBar; delete file + imports + prop chain. ~30 min.

**LandscapeScreen + CityFeedScreen Legacy Deletion** — Old methodology Landscape page; live route goes to v3; legacy reachable only via CityFeed back button. Multi-file delete: LandscapeScreen.tsx, CityFeedScreen.tsx, state machine in App.tsx. 60-90 min careful surgery.

**Workhorse Phantom Render Paths in HCPCard** — Cohort retired but render branches remain in HCPCard.tsx. Delete dead branches, orphan tooltips, workhorseColor variable. 20-30 min.

**demo-runbook.md sweep** — Belief Profile rename, methodology references should match canonical doc. 20-30 min.

**TrackSwitch.tsx Dead File** — Defined but not imported in active routes (superseded by DashboardTabs). Verify zero usages, delete. 10 min.

**Other Callers of getOrCreateRelationship to Audit** — Fixed createNote and createNextAction. Other callers in relationships.ts may still have orphan-relationship bug. Original grep showed potential issues at lines 388, 532, 707, 750, 861 (line numbers may have shifted). 30-60 min audit.

---

## Demo Flow

When everything above is complete:
1. Run final visual smoke test on demo flow:
   - Land on /me, show Coverage Gaps tile and territory context
   - Navigate to Heymach profile, walk Belief Profile and methodology
   - Show Singh as second Established example
   - Switch to Rising Star dashboard, Jänne walkthrough
   - Generate Brief on one HCP, demonstrate Save as Follow-Up
2. Update demo-runbook.md to current state
3. Draft Larry email
4. Draft John email
5. Send.

---

## Key Architectural Decisions / Principles

- **Read the actual scripts before documenting methodology.** Cohort weights in chat memory have been wrong before. Verify from source.
- **Dynamic platform non-negotiable for subscription justification.** Static lookup doesn't justify MRR. Pre-launch additions: weekly snapshot/diff system, weekly digest email, "what changed" surface, territory coverage delta view.
- **IronBrand pattern (Garrett's self-awareness).** Drifts into expansion thinking (more TAs, broader audience) during execution time. Antidote: commit to one concrete next action and execute.
- **PostgREST 1000-row cap.** Any table potentially exceeding 1,000 rows requires explicit pagination. Has caused multiple silent data truncation bugs.
- **PowerShell string-replace silently no-ops on whitespace mismatch.** Use Cursor for all code edits, not PowerShell string manipulation.
- **Mentor demo pressure is self-imposed.** Larry and John have no awaiting expectation. The deadline is internal quality bar.

---

## Pending Personal/Business

- Employment agreement review with former employer (Avalere Health) before resuming outreach to potential customers; lawyer consultation recommended; MSL outreach paused pending review
- Founding 100 program: $99 upfront for 6 months, then $29.99/month at customer 101 (no free trial)
- Marketing site: Framer template ($49 AI-startup template, $10/month Basic subscription); hero section dashboard mockup in Figma completed; data source logos under "Built on the world's most rigorous scientific data sources" headline
- Platform expansion strategy: stay MSL-focused for launch, architect quietly for broader Medical Affairs audience
- TA expansion: current four TAs at launch, waitlist mechanism for others
- Queued post-demo: Watchlists, Private Notes, Relationship Status + Next Action, Tags, Generate Brief enhancements, pin icon global swap (replacing bookmark)

---

## Recent Commits (Most Recent First)

- `[pending]` feat: post-login redirect to /me instead of cohort dashboard root
- `[pending]` fix: increase chip gap in CoverageGapsTile to mitigate mobile touch-zone overlap
- `[pending]` perf: replace JS investigator-counting loop with institution_investigator_counts SQL view
- `[pending]` perf: remove unused external partners calculation from getInstitutionsIndex
- `3f4486f` fix: cohort track row now fits all 6 tabs centered at desktop widths
- `e062716` feat: remove low-signal WelcomeBanner belly band from cohort dashboards
- `a028d4e` feat: label polish on cohort dashboard and institutions page
- `a9fbc19` fix: createNextAction now uses addHcpToDefaultOrCreate
- `664092e` fix: createNote now uses addHcpToDefaultOrCreate

---

## How to Start the Next Chat

1. Paste this entire document at the top of the new chat as context
2. State the immediate goal (e.g., "Working at desktop now. Want to tackle Rising Star pipeline leak first.")
3. Claude should be ready to proceed without re-discovering schema, tooling, or context
