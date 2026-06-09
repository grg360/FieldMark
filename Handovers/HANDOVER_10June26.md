# FieldMark Day 3 Handover — Wed Jun 10, 2026

## Context

Solo founder. **Bessel Analytics / FieldMark**, B2B SaaS for pharma MSLs, NSCLC TA. Repo `grg360/FieldMark`, branch `foundation-rebuild`, prod `app.besselanalytics.com`. Stack: React/Vite/TS, Python pipelines, Supabase Postgres (project `tflrfkocbdkizmkhimiw`, port 5432 for scripts), Cloudflare auto-deploy from `foundation-rebuild`. Local: `C:\Users\garre\Desktop\FieldMark`. PowerShell environment (use `;` not `&&`, `Get-ChildItem -Recurse`).

Garrett also operates from a Dell XPS 13 secondary machine, identically configured, repo cloned to same path.

---

## State at end of Day 2-3 session (Mon-Tue Jun 8-9)

### Shipped to production

**Authentication**
- Supabase email/password (Confirm email toggled OFF for demo)
- Sign-in form added above LinkedIn button on `LinkedInAuthScreen.tsx` with "OR" divider
- Amber `#E8A020` Sign-in as primary action
- Users created manually via Supabase dashboard (no public signup form for v1)

**msl_profiles table** (Supabase Postgres)
- `user_id` PK → `auth.users(id)` ON DELETE CASCADE
- Identity: first_name, last_name, company, role (default 'Medical Science Liaison'), linkedin_url, linkedin_verified_at
- Defaults: default_ta_slug='oncology', default_indication_slug='nsclc'
- Territory: region, states_covered text[], territory_set_by, territory_locked
- Notifications: notify_new_rising_stars, notify_score_changes, notify_field_notes, notification_digest_day='sunday'
- Conference state: active_conference_slug, active_conference_until
- Activity: onboarded_at, last_active_at, last_dashboard_view_at, total_sessions_count
- UI prefs: ui_preferences jsonb
- RLS enabled, 3 policies (SELECT/INSERT/UPDATE where `auth.uid() = user_id`)

**Onboarding & dashboard**
- `WelcomeWizard.tsx` — 3-step forced setup at first signin (name → company → region/states), saves to msl_profiles, routes to `/`
- `AuthWrapper.tsx` — all routes gated except `/landing`. First-time signin → `/welcome`. Returning → `/` with `updateLastActive()` and FilterContext hydrated. Sign-out → `/landing`.
- `UserMenu.tsx` — header avatar with initials in amber circle, dropdown (name + company, Your profile → `/me`, Sign out)
- `WelcomeBanner.tsx` — "Hi {first_name}. Your {region} NSCLC territory" with dismissible state chips and "In territory (X states) ↔ All US" toggle pill
- `InstitutionsInTerritoryPanel.tsx` — top 8 institutions matching user's states in horizontal scrolling row, each card shows name + RS/Est counts + "Top: {investigator}"
- ProfileScreen wired to msl_profiles (real identity, LinkedIn badge conditional on `linkedin_verified_at`, all settings persist)

**FilterContext parallel territory concept**
- Extended with `userTerritory: string | null`, `setUserTerritory`, `hydrateFromProfile(regionSlug, statesCovered)`
- Existing `region: RegionKey` (US/UK/Global geographic) preserved — MSL territory is a parallel concept

**Analytics**
- PostHog initialized in `frontend/src/lib/analytics.ts`. API key `phc_xS4bevzEsdA49sePWi4qcuswU3axF2x7cq25zszqk9fz`, US Cloud host, project ID 461686. Session recording enabled with password masking. `identifyUser(userId, {email, first_name, last_name, company, region})` on auth. `resetIdentification()` on sign-out. Pageview/pageleave auto-captured. All dashboards populated (DAU/WAU, growth accounting, retention, referring domain).

**Snapshot infrastructure (Day 1)**
- `pipelines/take_weekly_snapshot.py`. Three snapshot tables: `hcp_rising_star_snapshots` (1,644), `hcp_established_snapshots` (22,364), `hcp_community_snapshots` (80,356)
- `.github/workflows/weekly-snapshot.yml` cron Sunday 06:00 UTC, requires `DATABASE_URL` GitHub repo secret
- First real momentum delta available Sunday Jun 14

**Other Day 1 features**
- Landscape page `/landscape/nsclc` with Recharts ScatterChart, Top 100 US Rising Stars
- Institution detail pages `/institution/{slug}` with runtime slug from `institution_canonical`, 2x2 leaderboard grid, Top Internal Collaborations, Top External Partner Institutions
- Institutions index `/institutions/nsclc` sortable table, 202 institutions in cohort
- `institution_canonical` column on `hcps_v2`, 228,315/269,392 HCPs populated. Consolidations: Yale Cancer Center→Yale University, Vanderbilt→VUMC, OSU→OSU Wexner, City of Hope merger, UCSD comma fix, Duke Medical Center→Duke University
- External Collaborators on HCP detail (right rail, top co-authors NOT at same institution)
- Archetype rename: "Emerging Leader" no badge (86% of cohort), coral retired (replaced with neutral gray #6B6A65)

### Performance optimization (three passes resolving 10-12 sec dashboard load)
1. Module-level Promise caches: `institutionsIndexCache` by taSlug in api.ts, `mslProfileCache` by userId in authHelpers.ts. `clearMslProfileCache()` busts on Save.
2. `getTopInstitutionsInTerritory(taSlug, states, limit)` lightweight fetcher for ribbon (replaces full `getInstitutionsIndex`). ~1-3 sec load.
3. State filter pagination fix: never query `hcps_v2.in("nppes_practice_state", states)` directly — hits 1000-row PostgREST cap. Instead fetch all cohort HCP IDs first (~1,600), then chunk-fetch details, filter by state in JavaScript. Same fix applied to `slugToInstitution` (was hitting cap, causing "Institution not found" for MSK/MGH/etc).

### Git hygiene resolved Day 3
- node_modules at REPO ROOT was getting staged (root `.gitignore` rule wasn't catching it)
- Fix: `git reset HEAD` then explicit add of intended dirs/files only
- `node_modules/` appended to root `.gitignore` and committed

### Validation completed
- Test account "GG" (Garrett Reeves) created via Supabase dashboard
- Welcome wizard end-to-end: Northeast, CT/MA/ME/NH/NY/RI/VT/NJ/PA
- Dashboard renders: banner ("Hi Garrett. Your Northeast NSCLC territory") → institutions ribbon (MSK 32 RS/80 Est top Schoenfeld, Dana-Farber 11 RS/30 Est top Sands, MGH 11 RS/24 Est top Yang, Penn 8 RS/15 Est top Singh) → state-filtered cohort feed (Jänne #1, Riely #3, Awad #10, Sholl #14, Hellmann #15, Shaw #18)
- Profile round-trip works, sign-out + sign-back-in works
- PostHog events confirmed firing
- 196/232 US Rising Stars have `nppes_practice_state` (84% coverage). 80 RS in Northeast states, all 80 with state populated.

### Supabase production config (completed Day 3)
- Site URL: `https://app.besselanalytics.com`
- Redirect URLs include `https://app.besselanalytics.com/*` and `http://localhost:5173/*`

### Cloudflare Pages
- Auto-deploy from `foundation-rebuild` verified

---

## Strategic direction (locked Day 2)

**Frame: CRM + Intelligence Layer for Medical Affairs** — pivot from "LinkedIn for HCPs" to workflow platform. Rankings get users in the door; workflow keeps them there.

### 8-step product roadmap

1. ✅ Authentication (Day 2)
2. **Watchlists (Wed Jun 11 — next up)**
3. Private Notes (Wed)
4. Relationship Status + Next Action — "the missing critical feature" (Thu)
5. Tags (Thu)
6. Generate Brief — "the demo screenshot moment" (Fri)
7. Territory Workspace (week 2)
8. Notifications (week 2+)

Plus: Team Intelligence (Tier 4, blocks on admin tooling + first pharma team interest), LinkedIn OAuth v2, TA expansion.

### Generate Brief output spec (Garrett-authored)
- Relationship Snapshot (RS rank, momentum percentiles)
- What's Changed (delta from last interaction — requires snapshots, available Sun Jun 14)
- Recent Scientific Activity (papers, ASCO presentations)
- Institution Context ("Aditi is the highest-ranked of Penn's 8 Rising Stars")
- Suggested Discussion Topics (Claude API synthesis)

Full backlog in `ROADMAP - 8June26.md` (8 tiers, 18 items).

---

## Three elephants in the room

### 1. Avalere Health employment (PENDING action)
Wife flagged. Real concerns: IP boundaries, time/attention clauses in senior employment agreement, customer overlap (Avalere clients = FieldMark target buyers), non-compete/non-solicitation enforceability, disclosure requirements.

**Action items still pending:**
- Read Avalere employment agreement carefully
- Book employment lawyer consultation ($200-500)
- **Pause MSL outreach until lawyer review complete (~2 weeks max)**
- Wait for lawyer guidance before any Avalere disclosure decision

### 2. TA expansion anxiety (RESOLVED)
Existing `TA_EXPANSION_ROADMAP.md` (May 20, 700-line operational runbook, 8-phase sequence) covers this. Backend parameterized — adding new TA = ~3-5 calendar days, ~1.5 days operator time. Pattern noted: Garrett produces excellent planning docs then forgets they exist. **Recommendation: start every work session by reading `TA_EXPANSION_ROADMAP.md` and `KNOWN_ISSUES.md`.**

### 3. MSL workflow vision (RESOLVED into roadmap)
"How do I become the place where an MSL does their work?" Profile is state container for workflow objects, not just settings. Profile schema future-proofed.

---

## Working style & discipline

### Development workflow
- Garrett describes change → Claude writes Cursor prompt → Garrett pastes into Cursor → Cursor produces code → Garrett pastes diff back for review
- Cursor for all file edits; SQL in Supabase dashboard (never in Cursor for DB work)
- PowerShell with `| clip` to send output directly to clipboard. For multi-page output use `> file.txt; notepad file.txt`
- Commits via `git add . && git commit -m "..." && git push`; Cloudflare auto-deploys within minutes

### Claude prompt standards (Cursor)
- Code only, no execution
- STOP if ambiguous
- Absolute constraints section
- One clearly recommended option, not multiple choices
- Never modify code until diagnostic logs are read
- Flag when Cursor silently no-ops (whitespace mismatch is a recurring failure mode — phantom commits with 0 insertions)

### SQL discipline (HARD RULES)
- Never use `BEGIN/COMMIT` blocks in Supabase SQL editor — run each statement standalone
- No `--` comments in queries sent to Supabase (cause syntax errors)
- **Run each SQL inquiry as separate query**, not batched
- New tables require: `CREATE TABLE` + explicit `GRANT SELECT` to anon/authenticated/service_role + `ALTER TABLE ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` for public read + `NOTIFY pgrst, 'reload schema'`
- Always verify schema column names via `information_schema.columns` before writing SQL
- Use port 5432 for pipeline scripts, not pooler on 6543

### Python pipeline discipline
- Dry-run every pipeline before full execution
- Plain ASCII over Unicode in Python string constants (em-dash corruption in Cursor-generated code)
- Commit at clean milestones before major structural changes
- `psycopg2` for direct DB connections in scripts

### Validation HCPs (canonical)
- Heymach (UUID `2302d82f-c44a-498e-b0ab-6ca39a3f8964`) — primary Established
- Jänne, Ramalingam, Spira, Xiuning Le — secondary Established/Rising Star
- Loomba (UUID `8a5ed89d-...`) — Hepatology #1
- Sanyal (UUID `be751618-...`) — Hepatology #2 post-dedup
- Kowdley (UUID `272ff3bc-...`), Chalasani (UUID `22388b63-...`)

### Decision-making style
- Pushes back on over-engineering (rejected force-directed graph: "looked like 7th grade geometry"; rejected physics simulation: "overengineered")
- Honest problem diagnosis before fixes
- No manufactured optimism, no time estimates, no overconfident predictions
- Fast decisions on product direction; slow and careful on data quality
- External advisor consulted on methodology inflection points via ChatGPT paste-back
- Don't pace work with time estimates ("that took 20 mins. lol" — agreed to stop)

---

## Known gotchas

- **PostgREST 1000-row cap is the single most reliable source of bugs.** Three times in one session (institutionsIndex, getTopInstitutionsInTerritory state filter, slugToInstitution). All chunked `.in()` queries use CHUNK_SIZE=100. Worth its own entry in `KNOWN_ISSUES.md`.
- Production anon key in `supabase.ts` is by design (Supabase model); RLS protects data
- `ScoreBreakdownV3` renders on Heymach but not other Established HCPs on mobile — known `taSlug` propagation bug on certain navigation paths
- node_modules at repo root, not just `frontend/node_modules/` — root `.gitignore` now covers it

---

## Where we're heading next (Wed Jun 11)

**Watchlists (Tier 1, Item 2)** is next up. Conceptually:
- New table `msl_watchlists` (user_id, hcp_id, added_at, notes_count?, last_viewed_at)
- RLS: user can only see their own
- "Add to watchlist" / "Remove from watchlist" affordance on HCPCard and HCP detail page
- New `/watchlist` route showing user's watched HCPs sorted by recent activity
- Lays groundwork for Private Notes (Tier 1, Item 3) — notes table FKs to hcp_id, user_id

Before writing any code, advisor recommendation is to read `TA_EXPANSION_ROADMAP.md` and `KNOWN_ISSUES.md` to refresh context.

### Pending non-engineering
- Avalere employment lawyer consult (BLOCKS MSL outreach)
- First snapshot diff available Sunday Jun 14 — enables "What's Changed" in Generate Brief
