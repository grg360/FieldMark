# FieldMark Session Handover — 2026-06-30 EOD

**Purpose:** Seed the next Claude session with full context on where FieldMark stands, what was decided today, and the future-proofing work ahead.
**Tone:** Honest, no manufactured optimism. The codebase has real debt; the architecture is mostly right; the work ahead is bounded.

---

## The One-Paragraph Summary

The demo video is shipped to four mentors (Larry, John, Frank, Mike). Larry replied within hours promising review in 3 days. The day was spent shipping tech debt (8 items closed or honestly documented), then pivoted to strategic planning: codebase housekeeping and the second TA expansion. The audit revealed the architecture is **mostly TA-parametric where it matters, but explicitly NSCLC-coded in three critical chokepoints** — substrate scripts, frontend surface (74 files), and seed data. **Atopic Dermatitis (AD) is selected as TA #2.** The roadmap calls for a config refactor + directory restructure FIRST (3-4 days), then AD ingest (8-12 days), rather than ship AD on current code and entrench tech debt. The 7-10 day per-TA claim from the demo email is plausible **only** if the refactor lands first.

---

## What Shipped Today

### Mentor outreach (all sent)
- Larry Liberti (`larryliberti@verizon.net` / `Astrolabe!` personalized account) — replied within hours: "Thanks for thinking of me. I'm a bit busy for the next 3 days but will look at this shortly." Garrett replied "Thanks again, Larry. Really appreciate it."
- John Knapp (personalized account) — no reply yet
- Frank (Westlaw/Web of Science background, demo account) — no reply yet. Closer custom-written: "you've spent your career building platforms that organize knowledge for the people who need it most" + "quite honestly, I'm just thrilled to have the opportunity to share my work with you"
- Mike (Garrett's sister's father-in-law, surety bonds founder/exited, lifelong friend, demo account) — no reply yet. Email included: MSL/Medical Affairs explainer paragraphs (Mike doesn't know what an MSL is), credit for the MSL-to-MSL LinkedIn suggestion that shaped Field Intelligence architecture, soft PE network intro ask, expanded cohort scoring paragraph

All four sent from `garrett@besselanalytics.com` via Google Workspace send-as feature configured in Gmail. besselanalytics.com root redirects to `app.besselanalytics.com/demo` via Cloudflare Page Rule (both bare domain and www).

### Tech debt items shipped or documented

✅ **Co-authored paper counts on Network Influence** — false flag, already worked. Documented as resolved.
✅ **Rising Voices scatter chart hit-targets** — improved via r=8 transparent overlay circles + `isAnimationActive={false}`. Edge cases (yellow-cluster overlap, farthest-left dot) documented as remaining.
✅ **Linked Belief Profile chip → specific claim scroll** — added `id={`claim-${claimKey}`}` to AdvocacySubsection wrapper in ScientificNarrativeSection.tsx; three-tier fallback in InsightCard scroll handler (specific claim → section → navigate)
✅ **WHY THIS EXPERT text color** — changed from `#B8B4AC` to `#E8E6DF` in DetailScreen.tsx line ~1340 to match FIELD INSIGHTS brightness
✅ **Dagogo-Jack UUID corrected** in `generate_seed_insights.py` (from `51760cb9-...` to `688b09af-...`); logged duplicate-record-from-hyphen-mismatch as separate DEMO_DEBT item
✅ **savedHcpIds investigated** — NOT dead state, actively used by toggleSave decision logic at line 252. Documented as part of larger toggleSave architectural question.
✅ **Dead Field Intelligence branch removed** — `false && renderFieldIntelligenceSection(...)` block deleted in DetailScreen.tsx
✅ **Community card narratives rendering** — HCPCard.tsx now uses `(hcp.why_now || hcp.narrative)` truthy check + `hcp.why_now ?? hcp.narrative` projection. Added `display: "-webkit-box"` to fix line-clamp.

### Other shipped work

✅ **$0 / 0 display for zero-engagement HCPs** in `cohort-metrics.ts` (`formatEngagementDollar` returns "$0" for null, `formatIntDisplay` returns "0" for null). Resolves Buroker's "system looks broken" concern by showing honest zeros instead of em-dash.

✅ **Community narrative generator handles zero-engagement HCPs** as opportunity-framed:
- Changed INNER JOIN to LEFT JOIN on `hcp_open_payments_summary_v2` in HCP selection query
- Replaced skip-guard with empty op_summary dict construction when no Open Payments record exists
- Added "SPECIAL CASE - zero pharma engagement" prompt instruction (frame as opportunity, don't speculate WHY zero)
- Added `--hcp-id` CLI arg and `fetch_single_community_hcp` function for targeted reruns
- Generated Buroker narrative successfully — reads as opportunity-framed, ranked correctly as "#10 nationally"
- Fixed rank scope ambiguity: prompt now says "US national rank in NSCLC Community cohort" instead of ambiguous "Community cohort rank in NSCLC"

### Documentation artifacts produced

📄 **TA_AUDIT_RAW.md** (742 lines, UTF-16) — PowerShell-generated raw inventory from `audit_ta.ps1` script. 6 signals: hardcoded NSCLC references (246 individual hits across 74 files), hardcoded TA UUID (15 files), TA slug/id usage (60+ files), TA-parametric functions, DB table references, codebase scope (47+ Python scripts in root)

📄 **TA_EXPANSION_AUDIT.md** — Claude-synthesized decision artifact. Layer-by-layer findings. Real estimate: 10-14 calendar days for first expansion. Identifies that architecture is "configured for some things but coded for the critical TA-routing."

📄 **TA_EXPANSION_ROADMAP_v2.md** — Updated roadmap incorporating audit findings and script catalog learnings. Calls for config refactor + directory restructure before AD ingest. Real estimates per phase.

---

## What Was Decided

### 1. Atopic Dermatitis is TA #2

Selection rationale:
- **Differentiation from NSCLC** — auto-immune mechanism debates vs. trial design debates, fewer-but-deeper KOLs vs. broader networks. Shows architecture handles diverse therapeutic spaces.
- **Active investment landscape** — Garrett's specific signal: "a lot of development activity and enormous investment behind the disease"
- **Real Rising Star dynamics** — biologic/JAK landscape is fast-moving (dupilumab, abrocitinib, upadacitinib, lebrikizumab, tralokinumab, rocatinlimab, nemolizumab)
- **Compact KOL community** — easier substrate validation than something with thousands of investigators
- **Dermatology MSL teams at every major manufacturer** — real commercial audience

### 2. The validator-gap risk is acknowledged but accepted

Garrett doesn't have deep AD domain expertise (his wheelhouse is oncology from Avalere). Risk: he won't catch substrate errors a dermatologist would notice immediately. Real options surfaced:
- (a) Recruit an AD-domain advisor before TA expansion
- (b) Build AD substrate first, validate with someone after
- (c) Pick something where Garrett can validate (CRC, breast, prostate)

Garrett's call: **proceed with AD**, plan to recruit validation later. Real bet that the architecture will hold and that mentors looking at AD substrate won't spot errors Garrett would have caught in NSCLC.

### 3. Refactor before AD, not AD on current code

The honest call after script inspection. Reasons:
- `pubmed_pipeline.py` has `PUBMED_QUERY_NSCLC_US` as a hardcoded constant. `trial_ta_mapping.py` has `NSCLC_CONDITION_KEYWORDS`, `NSCLC_DRUG_KEYWORDS_STRICT`, `NSCLC_DRUG_KEYWORDS_GATED` as Python lists.
- Adding AD on current code means editing constants in 4-5 scripts. Tech debt entrenches with every TA.
- The right architecture: JSON-per-TA config files in `scripts/config/therapeutic_areas/`, loaded by every script via shared loader function
- Refactor pays for itself on first AD expansion AND every subsequent TA expansion
- The audit work + script catalog has already specified the work — not designing cold

### 4. Directory restructure sequenced with refactor

47+ Python scripts in repo root is a real future-proofing problem. Restructure into `scripts/ingest/`, `scripts/enrich/`, `scripts/aggregate/`, `scripts/classify/`, `scripts/score/`, `scripts/narrative/`, `scripts/social/`, `scripts/dedup/`, `scripts/seed/`, `scripts/config/`, `scripts/utilities/`, `scripts/archive/`. Bounded ~1 day work, best done as separate session before config refactor lands.

Frontend restructure deferred — deserves its own deliberate session after demo lands.

---

## What's Still On the Open Questions Pile

### From the May 20 roadmap (still valid)

- **v1.x safeguards backlog** — extract cohort_score SQL to versioned files, build weekly_refresh.py orchestrator, build ta_expansion_preflight.py, tighten hcp_therapeutic_areas tagging logic, NPI Discovery rate limit and resumability, convert `total_career_pubs = 0` to NULL in NPPES ingest
- **Known failure modes** — common-name aggregation in OpenAlex, PubMed-ingested HCPs missing NPI, UPSERT-without-delete orphan rows, PostgREST 1000-row cap, Supabase BEGIN/COMMIT unreliability, `hcp_therapeutic_areas` tagging noise (Lenz in Hepatology, Aminah Jatoi as NSCLC #1)

### Architectural decisions deferred

- **toggleSave semantic mismatch** — the relationship between "tracking an HCP" (relationshipMap) and "HCP in default watchlist" (savedHcpIds) is genuinely tangled. Not dead state — actively used. Real architectural decision about whether watchlists are first-class concepts or derived from relationships.
- **DetailScreen 50+ re-render storm** — performance investigation deferred
- **Community ranking methodology** — should community ranking require non-zero pharma engagement, or is patient-volume-dominant ranking a legitimate "untapped opportunity" signal? Product call, not bug fix. Buroker at #10 with $0 engagement is the canonical example.
- **Community engagement signal cannot distinguish "untapped" vs "declined" vs "non-reportable engagement"** — same em-dash for all three states. Real future enhancement: cross-reference Open Payments NULL with other engagement signals.

### Substrate quality items

- **Legacy `hcps` table** still queried in 23 places. Real footgun. Worth a focused session to eliminate before AD ingest adds more references.
- **Duplicate Dagogo-Jack records** from Unicode hyphen vs ASCII hyphen. Broader dedup audit warranted to find other Unicode-character normalization gaps.
- **Top 200 / 279 Community NSCLC narratives** — remaining ~6,200 HCPs have no narrative. Background batch job, ~$10-15 in Claude API, hours of wall clock. Deprioritized.

### Frontend polish items

- **FIELD INSIGHTS vs WHY THIS EXPERT typeface alignment** in other places beyond the color fix shipped today
- **Rising Voices scatter chart** — yellow-cluster edge cases and farthest-left dot dead zone. Long-term: switch interaction model to click-to-pin only.
- **Linked Belief Profile chip on HCP detail page** — scrolls to claim card but "as far down as it can" because page can't scroll further. Acceptable.

---

## The Future-Proofing Push

This is the real headline for next sessions. The platform has carried Garrett to a credible demo. Continuing to build at current velocity without architectural investment will entrench tech debt with every new TA, every new feature, every new mentor. The honest path forward:

### 1. Config-driven TA architecture (Phase 0 of TA expansion)

JSON-per-TA config files. Every script loads its TA-specific behavior from config, not from hardcoded constants. Adding TA #3, #4, #N becomes a research task (curate the config), not an engineering task (edit code in 5 scripts). Real ~2 day investment that compounds with every TA.

### 2. Directory restructure (sequenced with config refactor)

47+ Python scripts in repo root → organized hierarchy. Surfaces dead scripts. Makes onboarding (Garrett's future self, or anyone joining) actually possible. Bounded ~1 day work.

### 3. Operational orchestration

The v1.x safeguards backlog from May 20 is still right. `weekly_refresh.py` orchestrator + `ta_expansion_preflight.py` script convert TA expansion from a 6-10 hour multi-session manual operation into a ~30 minute unattended run. Real investment that pays back every week and every TA.

### 4. Legacy table elimination

`hcps_v2` is canonical. `hcps` is legacy. 23 queries still reference legacy. Real footgun. Focused session to eliminate every reference before AD ingest adds more.

### 5. Frontend architecture pass

74 files with hardcoded NSCLC strings is real debt. The pattern is consistent (defaults to NSCLC instead of reading from TA context), so it's mechanical not architectural. Real 2-3 day Cursor sprint AFTER the TA picker drives proper context propagation.

### 6. Domain validation strategy

The AD substrate quality risk is real. Without a dermatology validator, errors propagate. Real options to surface in next session:
- Recruit a dermatology medical affairs advisor (like Larry for oncology)
- Identify a dermatology MSL prospect early as first paying customer for validation pressure
- Build a self-validation harness (canonical AD HCPs ground-truth set) to catch obvious errors

### 7. Test infrastructure

There is no test suite. Every change is validated by visual inspection and manual SQL spot-checks. Real risk as the codebase grows. Probably wrong to invest heavily now (TDD culture is expensive to bolt on), but worth identifying the 3-5 highest-leverage assertions to encode:
- Scoring pipeline output validity (top 10 HCPs per cohort don't have NULL critical fields)
- TA-tagging cleanliness (no HCPs tagged into clearly-wrong TAs)
- Narrative generation produces output for all eligible HCPs

---

## Working Patterns to Continue

- **Cursor IDE exclusive** — Claude writes structured prompts, Garrett pastes/applies, pastes diff back for review
- **Cursor prompt format** — `TASK / ABSOLUTE CONSTRAINTS / FIX / VERIFICATION / OUTPUT REQUIRED / DO NOT`
- **One recommended option with reason** — never multiple choices unless explicitly asked
- **Local dev for iteration** (`npm run dev` from `frontend/`), production for ship
- **SQL standalone statements only** — no BEGIN/COMMIT, no `--` comments, run in Supabase web editor
- **PowerShell output** — `| clip` for short, `> file.txt; notepad file.txt` for long
- **`column_name` verification before queries** — query `information_schema.columns` before guessing
- **DEMO_DEBT.md as honest documentation** — not all "fixes" require code; some require accurate documentation of constraints/findings
- **No time estimates** — historically 5-20x off, Garrett's preference
- **Push back firmly on shortcuts, CSS thrashing, scope creep, over-cautious pacing**

---

## Working Patterns to Improve

These came up explicitly in the session:

- **Claude treated bounded tickets as ticket-shaped when they were actually surfacing architectural questions** — Buroker investigation, savedHcpIds, Community narratives all turned out to be deeper than initial framing suggested. Real lesson: when an item is "easy" but the investigation keeps revealing new layers, that IS the answer about the item's actual shape.
- **Multiple grep roundtrips per investigation** — should have constructed more targeted queries the first time
- **Wrote Cursor prompts referencing functions/columns before verifying they existed** — required back-and-forth corrections
- **Set Rising Voices hit-target to r=14 (too big)** after Garrett flagged sensitivity issues — should have started more measured

The honest pattern: **Claude should slow down on diagnosis, accept that "bounded fix" sometimes means "real architectural surfacing", and verify schema/columns/function signatures BEFORE writing prompts.**

---

## State of the World

**Production:**
- `app.besselanalytics.com` — Cloudflare Pages auto-deploy from `foundation-rebuild` branch
- Demo page at `app.besselanalytics.com/demo` (auth-bypassed, public-facing)
- `besselanalytics.com` and `www.besselanalytics.com` both redirect to `/demo` via Cloudflare Page Rules (301 permanent)
- Cloudflare Stream video UID `8b692ac5cbc1adedda02689772e03ce3` ($5/month plan)
- PostHog analytics live, project token `phc_xS4bevzEsdA49sePWi4qcuswU3axF2x7cq25zszqk9fz`, US region

**Repos:**
- GitHub: `grg360/FieldMark`
- Local desktop: `C:\Users\garre\Desktop\FieldMark`
- Local laptop: Dell XPS 13, same repo + branch + .env

**Database (Supabase project `tflrfkocbdkizmkhimiw`):**
- NSCLC TA ID: `c0065b03-a25e-4e9a-bde4-4b4d0db7827d`
- Hepatology TA ID: `9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e`
- 80,018 NSCLC HCPs worldwide / 14,387 US-based
- 172,893 publications indexed since 2015
- 2,463 NSCLC trials / 977 currently active
- 6,429 belief positions extracted
- 328,524 NSCLC co-authorship edges
- 12,543 pharma engagement records
- 279 Community NSCLC narratives generated (was 200, grew during session)

**Email infrastructure:**
- Google Workspace configured with `garrett@besselanalytics.com` as send-as in regular Gmail (no Workspace account on the domain itself yet)
- Email signature: "Garrett Groesbeck / Bessel Analytics / FieldMark — HCP intelligence for Medical Affairs / besselanalytics.com" (no LLC/Inc suffix because not incorporated yet)

---

## Open Items Awaiting Response

- **Larry Liberti** — replied within hours, promised review in 3 days from June 28 send. Real check-in: Thursday July 2 evening / Friday July 3 morning if no proactive reply
- **John Knapp** — no reply yet from June 28 send
- **Frank** — no reply yet
- **Mike** — no reply yet. Honest worth checking that the email actually landed (some addresses had typos earlier in session)

Don't follow up before Thursday for Larry. Don't follow up at all for others — let them come to it.

---

## What I'd Tell the Next Session

1. **Garrett has been at this hard for two days.** Mentor emails sent, tech debt cleared, strategic planning done. Real cognitive load. If the next session starts with "let's keep going" but the energy is low, push back. Real rest matters.

2. **The roadmap (TA_EXPANSION_ROADMAP_v2.md) is the artifact to work from.** Confirm or push back on the refactor-first sequencing. If Garrett wants to ship AD on current code instead, that's defensible only with explicit acknowledgment of the tech debt cost.

3. **Phase 0 work (directory restructure, config refactor) is bounded and mechanical.** Real low-cognitive-load way to begin. First execution session should restructure scripts. Second should refactor `pubmed_pipeline.py` as the prototype config-driven script.

4. **AD domain research can happen in parallel** with engineering work. Real research-heavy: MeSH queries, drug lists, NPPES taxonomy codes, social hashtags, 15 canonical AD HCPs. Doesn't depend on engineering progress.

5. **Mentor responses will inform strategy but should NOT change the architecture work.** Refactor needs to happen regardless of what Larry / John / Frank / Mike say. Don't let response-waiting create false urgency to skip foundation work.

6. **The "future proofing" framing is real and right.** Garrett surfaced it independently. The codebase carried him to a credible demo but won't carry him to 5 TAs without investment now. Honor that instinct.

7. **Garrett's working style is collaborative.** Push back when wrong. Honest disagreement is wanted. No manufactured optimism. No time estimates without his explicit ask. One recommendation with a reason — not multiple choices.

8. **There's no co-founder.** Garrett is solo. The "we" language is accurate to the collaborative experience but Garrett carries 100% of the cognitive load. Be careful about scope-creeping plans that would only work with a team.

9. **Avalere is still the day job.** "If the money was right I would leave in a minute" — Garrett's honest answer when asked about quitting Avalere. Real strategic question: what makes the money right? Mentor responses + first paying customer signal will inform.

10. **The platform is real. The work is real. The bet is bounded.** Garrett has built something genuinely interesting. The path forward is to honor what works and honestly fix what doesn't. No more, no less.

---

**Last action of session:** Two artifacts produced (TA_EXPANSION_ROADMAP_v2.md, this handover). Walk away.
