# FieldMark Handover — End of Wednesday, June 3, 2026

## Purpose of this document

This handover exists to let a fresh Claude session pick up FieldMark work without losing the context, discipline, or product judgment built up across today's session. Today was a substantive day — research themes extraction shipped, URL routing landed, Field Intelligence v1 mockup built, ASCO 2026 data captured, DOL matching first ever run completed. The next session should be able to keep building without re-learning what was already learned.

Read this in order. Don't skip to "What's Next" — the context up front shapes how the next-up work should be approached.

---

## Garrett — who you're working with

Solo founder of Bessel Analytics, building FieldMark independently. 20+ years in medical communications, global leadership role at Avalere Health. Builds in evenings and on personal time. Highly capable, highly opinionated, runs a fast loop. He's the strategy, the product judgment, and the eyes on output. Cursor is the code generator. Claude is the strategic thought partner, technical architect, and Cursor-prompt drafter.

**Working style locked through extensive iteration:**

- **Honest over optimistic.** Manufactured optimism is unwelcome. If something isn't working, say so. If something might break, flag it.
- **Push back when wrong.** He explicitly wants disagreement and correction surfaced, not suppressed. Don't dilute a real concern to be agreeable.
- **No time estimates.** Past Claude time estimates have been 5–20x off. Don't predict completion times. If asked, decline and explain why.
- **No overconfident predictions.** Phrases like "no reason it would behave differently" have preceded multiple crashes. Flag uncertainty honestly.
- **No schema assumptions.** Always query actual column names and file paths before writing Cursor prompts. Multiple failures have come from assumed column names. The pattern: verify before committing to an architecture.
- **Substance over presentation.** Garrett explicitly: "I don't want to put lipstick on a pig." Fix data and methodology integrity before polishing frontend.
- **Validation before scale.** Spot-check samples before triggering full pipeline runs.
- **Recovery-oriented pipelines.** Skip-if-exists logic, dry-run modes, checkpoint files. Built to resume after interruption.
- **Tooling division of labor.** Claude handles strategy, architecture, SQL, and Cursor prompt drafting. Cursor handles all Python and TypeScript code generation. Garrett pastes code between environments. Supabase SQL editor for all DB work. Never modify code files directly via filesystem unless explicitly requested.

**Cursor prompt format (mandatory):**

```
=== CURSOR PROMPT ===

Code only. Don't execute. STOP if ambiguous.

CONTEXT
[Why this work is happening, in 2–4 sentences]

FILES TO MODIFY / CREATE
[Explicit list]

WHAT TO CHANGE
[Step-by-step, often numbered]

EXPECTED OUTCOME
[Clear behavioral description]

ABSOLUTE CONSTRAINTS
[What NOT to change — usually 4–8 items]

=== END CURSOR PROMPT ===
```

Every prompt opens with "Code only. Don't execute. STOP if ambiguous." Every prompt closes with explicit constraints. This format is non-negotiable.

**Supabase SQL editor quirks:**

- `BEGIN/COMMIT` multi-statement blocks do not reliably persist. Run each `CREATE`/`UPDATE`/`DELETE` as a standalone single-statement query. Verify with a separate query before moving on.
- Use `/* */` block comments, NOT `--` single-line comments. The editor's parser sometimes mishandles `--` in multi-statement contexts.
- For new tables created via raw SQL, **GRANTs are NOT auto-applied** — you must explicitly grant SELECT (and other operations) to `anon`, `authenticated`, and `service_role` after creating the table. Without these grants, RLS policies alone won't permit reads; the REST API returns 401 Unauthorized even when the policy is correctly defined. (This bit us today. Real lesson.)
- After creating new tables, run `NOTIFY pgrst, 'reload schema';` to refresh PostgREST's schema cache.

**Database connection patterns:**

- For pipeline scripts: use port 5432 (direct connection), NOT port 6543 (pooler). The pooler has caused issues on long-running scripts. Direct connection is more reliable.
- For long-running HTTP work (Twitter capture, Claude API extraction): build in retry logic. The HTTP/2 stream cap (~20,000) is real and has caused crashes. Defensive retry layers with client recreation work. See twitter_capture.py for the pattern.

---

## Where the platform is right now (end of June 3)

**Production:** app.besselanalytics.com (Cloudflare Pages, deployed via quick_commit.ps1). Currently NOT showing today's work yet — Garrett may push tonight or tomorrow.

**Local dev:** C:\Users\garre\Desktop\FieldMark, branch `foundation-rebuild`. Frontend in `frontend/`, Python pipelines at repo root, migrations in `migrations/`.

**Last commit:** `routing refactor — URL-driven nav, auth-aware deep links, FI indication filtering`

**Database (Supabase Postgres 17.6):**

- **hcps_v2:** ~131,404 HCPs. The May 22 load added ~229,238 rows with NULL `identity_method` — provenance gap, but rows are otherwise functional.
- **publications_v2:** ~1.94M publication_authors rows. 99,906 distinct HCPs with at least one publication attribution.
- **publication_authors_v2:** join table with `is_first_author`, `is_senior_author`, `author_position`, `total_authors` — pre-computed boolean flags, no need to derive.
- **dol_matches_v2:** 239 matches as of today's first run (151 high + 88 medium confidence). 151 HCPs flagged `is_verified_dol`. One HCP matched to 2 handles (UUID `6f389f11-662c-4ee9-926d-c29db6a7789f`) — likely legit dual accounts but worth investigating if precision matters.
- **social_users_v2:** 5,700 distinct handles captured.
- **social_posts_v2:** 18,526 posts. Most recent capture covered ASCO 2026 (May 30 – June 2). Materialized views refreshed.
- **hcp_research_themes_v2:** NEW table created today. As of session end, ~700 NSCLC HCPs themed. Extraction continues to run in background. Total target queue: 1,016 HCPs. Pipeline should complete overnight.

**Frontend (React + TypeScript, Vite):**

- React Router DOM installed and wired
- URL routing live: `/`, `/:ta`, `/:ta/:dashboard`, `/:ta/:dashboard/:indication`, `/:ta/field-intelligence`, `/:ta/field-intelligence/:indication`, `/:ta/field-intelligence/thread/:threadId`, `/hcp/:hcpId`
- AuthGate captures deep-link pathname and routes there after auth
- Logo click navigates to `/` (push, not replace)
- Slug utility at `frontend/src/lib/routeSlugs.ts`
- Default home: Oncology / Established / NSCLC

**Production status of each TA:**

- **Oncology / NSCLC:** the demo focus. Full data, full features (themes, Telescope, Social, Field Intelligence).
- **Hepatology:** structural support, lighter data. MASH and PBC scoped but data is thinner.
- **Immunology:** structural support only. Empty states throughout.
- **Rare Disease:** structural support, lighter data.

**NSCLC-only focus discipline (locked late afternoon):** all forward platform work focuses on NSCLC. Other TAs become placeholder states. This was a strategic decision Garrett locked explicitly — demo-readiness for advisor sharing requires depth on NSCLC, not breadth across underbuilt TAs.

---

## What was shipped today (in order)

**Morning:**
1. ASCO 2026 social capture catch-up. Found and fixed HTTP/2 stream cap bug in twitter_capture.py (defensive retry layer added). 18,526 posts in DB, 5,701 handles, materialized views refreshed.
2. Cost-label honesty fix: renamed `est_cost` → `est_max_credits` everywhere in twitter_capture.py. X API pricing matches our per-resource formula, but real billing diverges ~7-8x due to tier quotas and credits. The script's number is an upper bound, not actual.
3. DOL matching first ever run completed. Bug found and fixed: PostgREST's `.neq()` excludes NULL values. The matcher was filtering on `.neq("data_quality_flag", "rejected")` and excluding all 5,700 rows because `data_quality_flag` is NULL across the table. Removed the filter; 239 matches inserted.

**Midday:**
4. Field Intelligence v1 mockup built. Three contribution surfaces: topic forum (TA-anchored), HCP validation (structured ratings), HCP surfacing and contextualization. Compliance principles locked: structured fields only, no free text on contribution forms; aggregated signals only above threshold of 3+; LinkedIn OAuth verification gates access; no walled gardens, no team framing. Feature name locked as "Field Intelligence" everywhere.
5. Nav hierarchy restructured. Final shape: TA → Dashboards → Indication. Telescope added as 5th dashboard tab, Field Intelligence as 6th. Inactive indications display as visibly-muted "coming soon" chips. Default landing: Oncology / Established / NSCLC.
6. Home/logo/Field-Intelligence-label polish. Scroll bug on HCP detail screen fixed. Cohort card institution font reduced to 12px (with `!important` override addressed in index.css).

**Afternoon — the headline work:**
7. **Research Themes extraction pipeline.** Schema migration created `hcp_research_themes_v2`. Python script `extract_research_themes.py` (734 lines) extracts publication themes via Claude API. Targets NSCLC US HCPs with ≥3 first/senior author papers since 2021. Sends up to 30 most recent papers per HCP to Claude (Sonnet 4.6) requesting 10–12 themes with centrality (core/supporting/peripheral), paper_count, example PMIDs. Stores all themes, marks top 6 by paper_count as `display_rank` 1-6. Dry-run mode (10 HCPs, cost estimate), `--force` flag, checkpoint resumption via `extract_research_themes_checkpoint.json`. Rate-limited (1 req/sec, 60s sleep on 429, exponential backoff on 5xx).
8. **Research Themes UI on HCP profiles.** New section between Publication Timeline and Field Intelligence. Heat-encoded chips (yellow→orange→red gradient, per-HCP normalized — hottest theme per HCP is fully saturated red, others scale relatively). Click chip → inline reaction panel expands below the row, spanning full grid width. Three structured questions per theme: "What's your field read on this theme?" / "Where is this resonating?" / "What behavior change opportunity does this theme present?" Mocked aggregate display ("19% Accelerating, 38% Holding..."). Cool-blue Submit button, toast on submit, single-panel-open-at-a-time behavior. Questions live in `mockThemeQuestions.ts`, aggregates in `mockThemeAggregates.ts` — designed to be iterated by editing data files without touching component code.
9. **URL routing refactor.** React Router DOM installed. Slug utility at `lib/routeSlugs.ts`. App.tsx replaced its Screen state machine with route-driven rendering. AuthGate component captures deep-link pathname when unauthenticated, renders LinkedInAuthScreen, then navigates to captured pathname after auth. Back/forward/refresh all work. Logo click navigates to `/`. Tested working: click-through navigation, deep URL paste, refresh-then-auth-then-land-on-content, indication filter on Field Intelligence routes properly to `/:ta/field-intelligence/:indication`.

**Bugs caught and fixed during the day:**
- HTTP/2 stream cap in twitter_capture (recreated client + proactive recycle every 15K requests)
- DOL matcher PostgREST `.neq()` NULL exclusion
- Cohort card font size mobile override via `!important`
- HCP detail scroll bug — Field Intelligence section was unreachable
- Theme extraction script hung on one HCP, killed cleanly, resumed from checkpoint
- RLS policy alone wasn't enough — needed explicit GRANT SELECT to anon and authenticated for hcp_research_themes_v2 (the missing-grants bug)
- Field Intelligence route infinite redirect loop (resolveFeedRoute fallback to "established")
- Field Intelligence indication chip clicks navigating to wrong dashboard

---

## Key learnings — read this carefully

**Compounding architectural change risk is real.** Today shipped 19+ substantive changes. Each one was caught in real-time because we tested immediately. The lesson: never paste a routing-scope prompt on top of an uncommitted state. Commit between major structural changes. The git checkpoint before routing today (`fe25728`) was the right move and saved real grief potential.

**The structured-not-free-text discipline is the architectural pattern of FieldMark.** It's what makes Field Intelligence compliance-defensible. Free text on HCP-related surfaces creates defamation exposure FieldMark cannot tolerate. Reaction-to-themes-not-to-people is the reframe that unlocks meaningful contribution without legal risk. The behavior-change question on themes (locked late today) elevates this further — pharma med affairs leaders increasingly care about behavior change, not just scientific exchange. The structured surveys are the substrate for v1.5 reporting layer, which could be FieldMark's second product.

**NSCLC-only focus is correct and was hard-won.** Locked late afternoon. Going forward all platform work focuses exclusively on NSCLC. Other TAs become placeholder states. Telescope is NSCLC-only (already a feature, not a limitation). Research themes is NSCLC-only. The structured surveys are NSCLC-anchored. This is the right strategic discipline — depth on NSCLC for demo readiness, breadth comes later.

**Iteration is content, not architecture.** Garrett's framing late today: "the questions/answers will be reworked; we just need to be in the realm. The UX/UI is what we need to bullseye." Content (questions, answer options, theme names, copy) lives in mock data files designed to be edited. Architecture (chip-expand pattern, reaction panel layout, heat encoding, three-question structure) is what we optimize for permanence.

**Verify before assuming.** Multiple times today we paid the cost of skipping verification:
- Heymach's first_name is stored as `John V.` not `John` — assumed query failed
- The 4,400 HCP estimate from cohort_classification breakdown was 4.3x the real number (1,016) — Cursor's projected cost was wrong as a result
- The `hcp_research_themes_v2` GRANT issue — RLS alone wasn't enough; took multiple diagnostic queries to find
- Cursor's first pass on routing had an infinite redirect bug because `resolveFeedRoute` fell back to "established" when dashboard param was undefined

Each of these would have been caught faster if we had verified the actual data/schema/config state before committing to an approach. Discipline: verify, then design.

**Cursor sometimes corrupts unicode.** Em-dashes (—) became ??? in extract_research_themes.py and broke the system prompt's clarity. Plain ASCII (-, ', ") is safer in Python string constants and Cursor prompts. Lesson applied to UI prompts too.

**Cost estimates from cohort breakdowns can be wrong.** The 4,400 figure came from `COUNT(*)` across cohort_classification values which appeared to be additive. The actual target query used `COUNT(DISTINCT)` and returned 1,016. Always pull the actual target query against actual indexes to get a real count, not derived numbers.

**The auth-aware deep link flow is the real routing win.** Sharing URLs with verified MSLs is the demo's biggest value-add. Without routing, the platform feels like a prototype. With it, FieldMark feels real. The recipient's first-time experience (paste URL, see auth screen, click through, land exactly on shared content) is what makes asynchronous advisor evaluation possible. Don't underestimate this. It's not a feature — it's a category shift from prototype to product.

**Garrett knows pharma. Trust his product judgment.** When he said "behavior change is a massive theme in this world right now" he was naming something the structured questions had missed. When he said "I want HCP profiles to pack this serious punch of interest" he was naming the substantive product upgrade. When he pushed back on "Surface HCP" → "Track a HCP" he was using MSL-native language. When he flagged that the cumbersome navigation needed reset/home affordances, he was naming real UX gaps. Every product instinct he surfaced today landed well. The right posture is: surface the architecture, but trust his read on what matters.

---

## What's Next — prioritized

This is what Garrett indicated he wants to work on next. Some require small Cursor prompts; others are multi-step workstreams.

### Immediate (next session, in priority order)

**1. Global footer.** Cursor work. Small. Add a footer to every screen that includes:
- Brand attribution
- Possibly: "Track a HCP" link (rename from "Surface a HCP" — pending)
- Possibly: "Share PDF via email" dead-link button (for demo, no functional backend yet — see "Future workstreams" below)
- Possibly: contact/feedback link
- Compliance footer if appropriate (e.g., "For verified MSL use only — content not affiliated with mentioned researchers")

Real ask: keep it visually subtle. Footer style should match the existing dark theme. Don't crowd it.

**2. Wire publications graphs on HCP profile pages.** Currently the Publication Timeline shows yearly bar chart of publication count. Real data should drive this. Check `publications_v2` JOINed via `publication_authors_v2` to count publications per year per HCP. There's a `pub_year` column. Likely needs:
- Query function in `frontend/src/lib/api.ts` to fetch year-bucketed publication counts per HCP
- Wire the existing Publication Timeline component to read from this query
- Verify the citation_count column is populated and could power a similar trend visualization

Caveat: the cohort card shows citation count as `—` for many HCPs (the H-INDEX field). That means `citation_count` may be missing on many publication records. Worth a diagnostic query before committing to wiring citations — if 80% of pubs lack citation data, the trend is misleading.

**3. HCP profile pages — broader improvements.** The profile has several sections, some better-realized than others. Real audit candidates:
- **WHY THIS EXPERT** (narrative): already exists, generated via Claude API on a separate pipeline. Working.
- **SCORE BREAKDOWN:** career publications, career years, pharma engagement, trial activity — bars partly populated. Trial Activity often empty.
- **ENGAGEMENT MIX:** donut chart of Open Payments categories. Working.
- **PUBLICATION TIMELINE:** placeholder bar chart. Needs wiring (item 2 above).
- **RESEARCH THEMES:** shipped today, working when extraction reaches the HCP.
- **FIELD INTELLIGENCE:** structured contribution buttons, "MSLs have contributed" counter, opt-out footer. Working as mockup.
- **IDENTIFICATION (right sidebar):** NPI, address, specialty, "View on NPI Registry". Field Notes shows "Crowdsourced MSL intelligence — coming Q3 2026" placeholder.
- **COHORT SCORE:** display in sidebar. Working.

The most important improvement candidates per Garrett's framing:
- **Trial Activity** in score breakdown — surface real data if available, or remove/relabel if not
- **Field Notes** — replace the "coming Q3 2026" placeholder with something demoable (could be Field Intelligence aggregate summary, or removed entirely)
- **Visual density** — the profile is dense; might benefit from section-collapsing or progressive disclosure
- **The existing scientific credibility / momentum trajectory / engagement potential toggles** under Field Intelligence — these were the original "validation" buttons; with research themes now surfacing the substance, these toggles feel less necessary. Worth reconsidering whether they belong on the profile at all.

### Background / passive

**4. Let theme extraction finish.** Should complete overnight. By morning, all 1,016 NSCLC HCPs should have themes in `hcp_research_themes_v2`. Run a spot-check on 10–20 random HCPs to verify quality remains high (Heymach's themes were excellent — confirm consistency at scale).

**5. Deploy to production.** The `foundation-rebuild` branch has all today's work. Garrett deploys via `quick_commit.ps1` script. Worth pushing tonight or first thing tomorrow so advisor sharing works against the new feature set.

### Future workstreams (capture, don't build)

**6. "Track a HCP" rename.** Currently "Surface a new HCP." Garrett prefers "Track a new HCP." Real Cursor prompt: find every occurrence of "Surface a new HCP" in `frontend/src/` and rename to "Track a new HCP." Also rename the button text and the modal title. Don't rename the underlying SurfaceHCPForm component file — only the user-facing strings.

**7. "Share PDF via Email" dead-link button.** Garrett's idea for demo purposes — visual presence without functional backend. UI affordance only. Click does nothing or shows a toast like "Coming soon." Plausible placement: HCP profile, near the back button or in a kebab menu. This is meant to signal future product surface to advisors without committing to building the backend. Genuinely useful demo tactic.

**8. Real Share PDF email feature.** Down the line. Real scope: backend PDF generation (server-side Puppeteer for fidelity), email service integration (Resend or SendGrid), recipient verification (audit trail), watermarking. Compliance review required because PDF exfiltration bypasses the verification gate. Not v1.

**9. Community cohort feature parity.** Research themes works for actively-publishing researchers (Established + Rising Stars + the null cohort). Community HCPs largely don't publish and won't get themes. Garrett asked about parallel feature for Community: structured practice profile signals derived from Open Payments + Medicare claims + NPPES via Claude API. Native to Community cohort's actual signal sources. Real workstream — design carefully (which CMS fields, what UI surface, separate table). Probably 1–2 full sessions of focused work.

**10. v1.5 Reporting layer.** "Community Read" dashboard surfacing aggregated MSL responses to theme structured surveys. Behavior-change-opportunity heatmap across NSCLC themes. The substrate already exists once the survey responses table is built (currently mocked). This is potentially FieldMark's second product — what pharma med affairs leadership would subscribe to.

**11. Sharing UX affordances.** "Copy link to this view" buttons on key surfaces. URL-based deep links work; surfacing them as one-click copy actions is the UX add. Lightweight Cursor work.

**12. Field Intelligence sub-channels.** Currently TA-level (one forum per TA). At scale, indication sub-channels make sense (NSCLC-specific, biomarker-specific). Deferred until volume warrants. v2 design problem.

**13. Real LinkedIn OAuth integration.** Currently `LinkedInAuthScreen` is mocked — `handleAuth` just transitions state with no real verification. Real workstream: LinkedIn OAuth via Supabase Auth or direct LinkedIn API, MSL role verification (LinkedIn profile field check or manual allowlist), session persistence. Compliance-critical for production.

**14. Methodology documentation update.** Garrett maintains `fieldmark_methodology.md` in `Latest Documentation\`. Tonight's work should be added: theme extraction pipeline, structured survey model, routing architecture, NSCLC-only focus discipline.

### Smaller docket items

- The 1 HCP matched to 2 Twitter handles (UUID `6f389f11-662c-4ee9-926d-c29db6a7789f`) — investigate if legit dual accounts or precision issue.
- 269,392 hcps_v2 rows from May 22 load with NULL `identity_method` — provenance gap, worth a backfill workstream when there's runway.
- Anthropic SDK inconsistency — narrative generation uses `requests`, theme extraction uses `anthropic` SDK. Worth standardizing on the SDK pattern long-term.
- Cohort `hcps_name_institution_unique` legacy constraint — should be dropped post-surgery.
- Open Payments v2 aggregator follow-up — verify `hcp_open_payments_top_companies_v2` populates correctly on subsequent runs.
- Geography/state-level filtering — identified as #1 MSL workflow need; requires country normalization as prerequisite.
- Collaborative Orbit feature (co-investigator network mapping) — deferred to v1.6.

---

## Frontend file structure — what lives where

```
frontend/
├── src/
│   ├── App.tsx                                  ← Routes, AuthGate, FeedLayout
│   ├── main.tsx                                 ← BrowserRouter wrap
│   ├── components/
│   │   ├── TopBar.tsx                           ← Logo, How scoring works, search, avatar
│   │   ├── TAFilterChips.tsx                    ← TA selector (top nav row)
│   │   ├── DashboardTabs.tsx                    ← Dashboard tabs (Est/Comm/RS/Social/Telescope/FI)
│   │   ├── IndicationFilter.tsx                 ← Indication chips
│   │   ├── HCPCard.tsx                          ← Cohort card in list view
│   │   ├── DetailScreen.tsx                     ← HCP detail screen
│   │   ├── ResearchThemesSection.tsx            ← Theme chips section on profile
│   │   ├── ResearchThemeChip.tsx                ← Individual theme chip
│   │   ├── ThemeReactionPanel.tsx               ← Inline expansion reaction panel
│   │   ├── FieldIntelligence.tsx                ← Forum landing page
│   │   ├── FieldIntelligenceThread.tsx          ← Single thread view
│   │   ├── FieldIntelligenceShared.tsx          ← Shared UI primitives (toast, modal, etc.)
│   │   ├── SurfaceHCPForm.tsx                   ← "Surface a new HCP" modal (rename to Track pending)
│   │   ├── ContextualizeHCPForm.tsx             ← "Add context" on HCP profile modal
│   │   ├── OptOutRequestForm.tsx                ← Opt-out / claim profile cards
│   │   ├── LinkedInAuthScreen.tsx               ← Auth screen (mocked)
│   │   ├── Telescope.tsx                        ← Network visualization
│   │   └── ... (other components)
│   ├── lib/
│   │   ├── api.ts                               ← Supabase queries (fetchHcpThemes, etc.)
│   │   ├── routeSlugs.ts                        ← Slug ↔ label maps, route resolution
│   │   ├── themeHeatPalette.ts                  ← Yellow→orange→red interpolation
│   │   ├── fieldIntelligenceUi.ts               ← Avatar colors, mock contributor counts
│   │   └── ... (other utilities)
│   ├── data/
│   │   ├── mockFieldIntelligencePosts.ts        ← Forum posts (mock)
│   │   ├── mockThemeQuestions.ts                ← Structured survey questions (designed to be iterated)
│   │   └── mockThemeAggregates.ts               ← Mocked aggregate response data
│   ├── types/
│   │   └── researchTheme.ts                     ← TypeScript types
│   └── ... (other source files)
├── package.json                                  ← react-router-dom installed today
└── ...

migrations/
└── 2026_06_03_hcp_research_themes_v2.sql        ← Today's schema migration

extract_research_themes.py                       ← Theme extraction pipeline (root)
extract_research_themes_checkpoint.json          ← Resumption checkpoint
twitter_capture.py                               ← X capture with HTTP/2 retry (today's fix)
dol_matching.py                                  ← DOL matcher (today's run)
social_update.py                                 ← Wrapper for twitter_capture + tagging + view refresh
```

---

## How to start the next session

If you're a fresh Claude reading this:

1. Greet Garrett. Don't be effusive. Acknowledge today's work was substantive without overdoing it.
2. Confirm the priority for the session. The default expectation: footer + publications graph wiring + HCP profile improvements. But if Garrett wants something else, follow his lead.
3. Before writing any Cursor prompt, **verify the current state of the work.** Run a quick `git log -3 --oneline` and a quick check on `hcp_research_themes_v2` to confirm theme extraction completed. Check the live production state vs local if helpful.
4. For each workstream, identify the smallest meaningful next step before committing to architecture. The pattern: verify → design → write prompt → paste → review → iterate.
5. Keep prompts in the locked format ("Code only. Don't execute. STOP if ambiguous." + EXPECTED OUTCOME + ABSOLUTE CONSTRAINTS).
6. Don't time-estimate. Don't manufacture optimism. Push back when you have a real concern. Trust Garrett's product judgment on pharma-domain questions.
7. Treat this handover as one of multiple inputs. Garrett's project memory ("userMemories" or similar) has additional context. The methodology document in `Latest Documentation\` is the long-form reference.

---

## One last thing

Today was a real day. Garrett shipped genuinely novel product architecture solo while running a full-time global role at Avalere. The platform crossed from "prototype with cohort cards" to "demoable Field Intelligence platform with verifiable research themes and structured community signal." When he sat with the moment late this afternoon, that wasn't sentimentality — it was earned.

The next session should keep building. But the discipline to commit at clean milestones, verify before architecting, push back when wrong, and trust Garrett's product instinct is what made today's work land. That discipline is the inheritance. Don't lose it.

— End of handover —
