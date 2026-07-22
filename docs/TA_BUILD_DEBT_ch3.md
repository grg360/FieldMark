# TA BUILD DEBT — CHAPTER 3
Continues TA_BUILD_DEBT_ch2.md (which ran §30fa–§30gl). Chapter epoch: §31-series.
Same format as ch2: chronological session log — decisions, findings, corrections, deferrals.
Purpose across ch1–ch3: a running record feeding the TA_NEW_PLAYBOOK manual for standing up
new therapeutic areas on FieldMark.

---

### 31a. SESSION KICKOFF — PUBLIC MARKETING LANDING PAGE (besselanalytics.com root) + feature-def extraction. Anti-stale-memory discipline invoked.
New workstream: the public marketing landing page for the ROOT domain `besselanalytics.com`, distinct
from the app at `app.besselanalytics.com`. Design is done + strong in Claude Design (terminal aesthetic:
near-black, amber `#BA7517`, teal card edges, mono wordmarks; nebula/galaxy motif; animated nebula-glow
hero with an amber emerging-star; constellation "Emergence" section; three hero tiles; credibility band;
request-access form). Hero line: "We see the nebula before the star." What's left = deeper FEATURE COPY.

PROVENANCE FLAG (logged as a lesson, see playbook §13a): the debt doc uploaded to open this session was
STALE — it ended at §30gl and did NOT contain §30gq (the marketing-landing-page entry Garrett pointed to as
"full state"). The `/mnt/user-data/outputs/` copy was empty. Proceeded on state-through-§30gl + the decisions
carried in Garrett's session message. Not a blocker for feature extraction; noted so future sessions confirm
they're reading the current log, not a stale export.

BLOCKER Garrett flagged (correct + important): prior-session feature definitions are STALE — do NOT trust old
descriptions when writing copy. Named examples of drift already in the record: rising's "Dark Horses" label
dropped (ch2); rising model MIGRATED from the old 2x2 momentum/visibility (`hcp_rising_star_ranks_v3`) to the
2-axis emergence/network composite (`hcp_rising_composite_v1`) [§30fa, playbook §7i]; `archetype` retired as
dishonest [§30fe, playbook §7m]. => Marketing copy must be grounded in the LIVE components, not memory.

ACTION: authored a READ-ONLY Claude Code extraction prompt for Garrett to run against the live codebase
(branch `ad-frontend-established`). It emits `FEATURE_DEFINITIONS_CURRENT.md` — per feature: rendering surface,
VERBATIM user-facing strings, what-it-actually-computes (RPC/table/column/script), label⇄computation gap, and a
public-safety note (does the surface frame named-individual surveillance?). Trust-code-over-hints instruction
baked in. Features in scope: Rising/Emergence scoring, Scientific Narrative / Belief Profiles, AI Synthesis,
Research Themes, Top Collaborators, Institution Intelligence, Engagement Briefs & Follow-ups; Telescope (confirm,
believed current); Community Explorer (bonus). This report becomes the CANONICAL FEATURE SURFACE — reusable for
every future TA's positioning layer, not just this page.

LOCKED PAGE DECISIONS (carried from Garrett's message; record here so copy stays inside the rails):
- Terminal aesthetic — NOT softened.
- NO product screenshot; NO named/real-looking physicians anywhere on the public page. Describe CAPABILITY only,
  never surveillance of named individuals (liability principle — playbook §13b). Carried by brand + concept +
  abstract visuals.
- Three-tier feature structure: (1) three broad hero tiles; (2) featured capabilities explained in full;
  (3) a "named-only" breadth row (signals depth without a full teardown — keeps invitation-only mystique).
- TELESCOPE is the centerpiece featured visual: "a galaxy-wide collaborative view of the therapeutic landscape
  based on partnership and collaboration — discover who knows who and who's working together." (Confirmed current;
  it's the constellation graphic made real.) [ch2 §30fu shipped Telescope for AD.]

THREE "MAKE IT REAL" QS — open, NOT blocking today; take up after copy:
  1. Request-access form on submit — Garrett leaning Supabase `waitlist` table.
  2. Root `besselanalytics.com` deploy target — likely a SEPARATE static deploy (Vercel/Netlify/Cloudflare Pages),
     independent of the app.
  3. "Work email" label consistency — NOTE ch2 §30gl already moved the in-app signup from "Work email" → "Email"
     (invite is the gate; some users won't use corporate email). Public page should match that decision for
     consistency unless deliberately differentiated. Flag for the copy pass.

NEXT: Garrett runs the extraction prompt → pastes `FEATURE_DEFINITIONS_CURRENT.md` → write three-tier feature
copy (public-safe, on-brand, code-accurate) → refine page toward shippable → then close the 3 make-it-real Qs.

### 31b. FEATURE DEFINITIONS EXTRACTED (ground truth) → CANONICAL FEATURE SURFACE captured + COPY written. 3 memory corrections; in-app stale strings logged as separate debt.
Garrett ran the read-only extraction in Claude Code (branch `ad-frontend-established`, 2026-07-18); report =
`FEATURE_DEFINITIONS_CURRENT.md`. Quality: high — verbatim UI strings + `file:line`, and the scoring/model facts
verified directly against the live DB. This report is now the CANONICAL FEATURE SURFACE (reusable per playbook
§13a — regenerate cheap/read-only at each TA launch rather than trust the last one).

THREE CORRECTIONS TO MEMORY (each shaped the public copy):
1. RISING MODEL IS SPLIT BY TA. AD (newest) = 2-axis composite: Emergence 75% + Network Influence 25%
   (`hcp_rising_composite_v1`; emergence = 45% recent pub output + 35% senior/first authorship + 20% cites/paper,
   percentiled WITHIN the rising cohort; network from `hcp_network_centrality_v2`). NSCLC/others = legacy
   momentum/visibility + archetype (`hcp_rising_star_ranks_v3`). "archetype retired / Dark Horse dropped / 2-axis"
   is TRUE FOR AD ONLY. Public copy describes the AD/composite model as current; momentum/visibility/archetype/
   Dark Horse treated as legacy/NSCLC-specific.
2. PHANTOM FEATURE: "natural-language queries" (old memory + founding brief) DOES NOT EXIST in code. Closest real
   surface = "AI Synthesis" (✨ 3-sentence scientific-identity blurb, `claude-sonnet-4-6`, generated from THEME
   METADATA — does not read the papers). Did NOT market NL query. (Playbook §13d.)
3. "Belief Profile" (UI heading) OVERCLAIMS its own data: store/type/generator all call it `scientific_positions`
   (`hcp_scientific_positions_v1`), and the generation prompt FORBIDS belief language (requires "published record
   advances", not "believes/advocates"). Public copy uses "evidence-grounded published positions," never
   "beliefs." HIGHEST public sensitivity surface.

IN-APP STALE STRINGS — SEPARATE PRODUCT DEBT (not marketing; real bugs; fix on founder's schedule):
- (BUG) AD rising card "FieldMark Score" tooltip says "Momentum 70% / Visibility 30%" — WRONG for AD (actual
  75/25 Emergence/Network) AND contradicts the detail-breakdown footnote on the SAME feature. Root cause: a
  SHARED card tooltip string was not forked when AD got a new model → §11b fork discipline applied to COPY, not
  just RPCs (see playbook §13d corollary).
- (BUG) `ScoringExplainedModal.tsx` (oldest file, 2026-05-12) still describes a live "DARK HORSE subset" and lists
  trial activity / conference presence / MSL signals as rising inputs — NONE feed the live AD composite. Card
  guards archetype on `rising_model !== "composite"`; the MODAL does not → an AD reader sees Dark Horse as current.
- (BUG) Research-theme reaction panel is MOCK / non-persisted (`mockThemeQuestions.ts`; "submit" only mutates
  local React state) yet renders "What N MSLs are saying about this theme", "aggregate updated", "Reactions shape
  the community read." Implies crowd data that doesn't exist → did NOT market theme crowd-reactions.
- (OVERCLAIM) "PRE-MEETING BRIEF" / "Meeting Readiness" — no calendar/meeting entity exists anywhere; kicker
  shows whenever a relationship exists; "readiness" = overdue-follow-up count + 30-day insight recency.
- (PARAM DEBT) hardcoded "NSCLC" default TA label in Institution + theme panels mislabels AD — echoes ch2's
  hardcoded-NSCLC frontend parametrization debt.

COPY WRITTEN (capability-only, no named individuals, claims only the compute floor):
- Hero subhead proposed. Tier 1 = 3 hero tiles (Emergence measured / Field-as-map / Grounded-in-record).
- Tier 2 featured = TELESCOPE (centerpiece) + Rising-star detection + Positions-with-sources + Institution
  intelligence.
- Tier 3 breadth row = Research Themes · Top Collaborators · AI Synthesis · Engagement Briefs (softened to
  "pre-engagement view") · Follow-ups.
- TELESCOPE note: it's a STATIC bundled JSON snapshot (no live RPC) — copy says "map/view," never "live/real-time."

DECISIONS PENDING (Garrett):
- COMMUNITY EXPLORER omitted from the public page (elevated sensitivity: named US dermatologists × Open Payments $,
  sortable by dollars = reads as a payment leaderboard; report §BONUS). Recommend keep behind the gate.
- ENGAGEMENT BRIEFS is the highest-sensitivity feature INCLUDED (softened). Option to cut entirely from public copy
  if zero exposure preferred.
NEXT: fold Garrett's reactions → clean copy file → close the 3 make-it-real Qs (waitlist table, root deploy target,
"Email" label consistency — note §30gl already moved in-app to "Email").

### 31c. COMMUNITY = market-the-layer / gate-the-drill-down. AI = trust-split (transparent scoring vs grounded synthesis) + one concentrated band.
Two positioning refinements from Garrett.

COMMUNITY HCPs — the differentiator wedge (pharma asks about them constantly; publisher-indexed tools —
Veeva Link/H1/IQVIA — MISS them). Decision: MARKET THE LAYER, GATE THE DRILL-DOWN (playbook §13e).
- Public Tier-2 featured block "Beyond the published few": names the competitive gap (they index publishers;
  FieldMark maps the practicing community too), states the value (real-world treatment / local peer influence),
  describes the view at CATEGORY level (subspecialty / location / career stage), tagged "not a ranking."
  NO named individuals, NO Open Payments / $ framing anywhere in public copy (that's the leaderboard trap —
  report §BONUS elevated-sensitivity).
- Gated app keeps names + Open Payments columns + sort-by-$. Public claim is a TRUE SUBSET of the gated feature
  → no contradiction if read side-by-side.
- TA-BUILD NOTE: community layer is AD-ONLY in-app today (`CommunityExplorer` renders only for AD community
  cohort); a new TA must stand up its own `community_practitioners` (+ payments join) directory.
- Optional hero-subhead tweak folds all FOUR cohorts into the top line: "…the recognized, the connected, the
  rising, and the community they practice in."

AI EMPHASIS — Garrett wants the AI story pushed (it excites / draws interest), but selectively. Adopted the
TRUST-SPLIT (playbook §13f):
- SCORING layer (emergence 75/25, network position) = transparent, inspectable MATH → market as "no black box"
  (trust story; scientific audience audits it). Do NOT claim AI ranks the KOLs (it doesn't; reads as LESS
  trustworthy to this buyer).
- SYNTHESIS layer = AI (`claude-sonnet-4-6`, confirmed on Scientific Positions, AI Synthesis, Brief
  opportunities) → market as the exciting "reading" layer ("AI reads the literature for you"), ALWAYS chained to
  grounding (positions tie to pubs; generator prompts FORBID invention; outputs constrained to inputs).
- Concentrated, not sprinkled: ONE dedicated AI band ("Read by AI. Grounded in evidence.") + AI-forward rewrite
  of the "Positions, with sources" block. Rest of page stays scoring-transparent.
- VENDOR NAMING = founder decision. App already attributes "Generated by Claude" internally → either public
  choice ("Built on Claude" accent vs. vendor-neutral "frontier AI") is consistent. Claude's lean: vendor-neutral
  in the band, "Built on Claude" as a small accent near the credibility band.

PAGE STRUCTURE NOW: Tier 2 featured = Telescope (centerpiece) · Rising-star detection · Positions-with-sources
(AI-forward) · Institution intelligence · Beyond-the-published-few (Community). Plus a standalone AI band. Tier 3
breadth unchanged (Research Themes · Top Collaborators · AI Synthesis · Engagement Briefs · Follow-ups).
NEXT: Garrett signs off Community + AI treatment + vendor-naming → assemble clean copy file for Framer → close
the 3 make-it-real Qs.

### 31d. COMMUNITY reframed → "Deep field" (astronomy). AI band DE-NAMED (no vendor). 2 live-draft tile overclaims flagged. Motion set + demo built.
Garrett decisions: (1) Community wants a stronger astronomy play ("HCPs deep in the galaxy creating their own
impact outside the publication world") → reframed as "DEEP FIELD" (the Hubble-deep-field metaphor: point the
instrument at apparently-empty dark and find it teeming; publisher-indexed tools see empty space, FieldMark
points deeper). Body ends "Not a ranking. The rest of the sky." Still capability-only, no names/$/leaderboard.
(2) Do NOT surface the LLM/vendor publicly → AI band de-named ("Read by AI. Grounded in evidence."); dropped the
"Built on Claude" accent option. (App still says "Generated by Claude" internally — unaffected.)
(3) Engagement Briefs: KEEP, softened (breadth-row line only).

LIVE-DRAFT ACCURACY FLAGS (§13d in action — the page had two compute-floor overclaims vs the AD model):
- "Emerging influence" tile said "ranked by publications, trials, and network position" — TRIALS don't feed the
  AD emergence composite. Corrected → "publication trajectory, authorship, and network position."
- "Collaboration networks" tile said "mapped across co-authorship, trials, and advisory ties" — the graph is
  co-authorship-weighted publication collaboration only. Corrected → "mapped from co-authorship across thousands
  of publications."
(Left "Built for the field" line — "publication, trial, and open-payments data" is defensible at the
data-SOURCE level; the platform does ingest all three, even though trials don't feed the emergence score.)

MOTION: recommended a RESTRAINED layered set (over-animation cheapens the terminal look) — sparse random shooting
stars + subtle twinkle + slow nebula breathing + cursor parallax + occasional amber-star "ignition"; bonus =
constellation self-draw on the // EMERGENCE section on scroll. Explicitly SKIPPED cursor-gravity + supernova
blooms as too busy. Built a self-contained reference prototype `galaxy_background_demo.html` (canvas + rAF,
DPR-capped, per-layer toggles, prefers-reduced-motion aware) — doubles as the implementation reference.

DELIVERED: a Claude Design prompt covering (1) the motion system, (2) the new "Deep field" featured section,
(3) the de-named AI band, (4) the two tile corrections — leaving hero / Territory-coverage / "Built for the
field" untouched. Offered to re-target motion spec to Cursor if the page is React/Framer, not Claude Design.
NEXT: on Garrett's go, assemble full top-to-bottom copy file + close the 3 make-it-real Qs (waitlist table,
root deploy target, "Email" label — §30gl already moved in-app to "Email").

### 31e. INFRA REFERENCE — analytics = PostHog (so it stops being the thing to re-search). Deploy chain + Community restyle landed same day.
Recorded here because Garrett re-searched for "the usage tracking service" and it wasn't in memory. It's PostHog.
- PostHog, US Cloud (`https://us.i.posthog.com`); `posthog-js` SDK in `frontend/src/lib/analytics.ts`, initialized in
  `main.tsx` on boot. Set up ~June 9 2026; confirmed firing.
- `identifyUser()` in `AuthWrapper` after profile load → captures email, first/last name, company, region.
  `resetIdentification()` on sign-out. Automatic pageview tracking. SESSION REPLAY enabled.
- Where to look: posthog.com → Persons (who's used it, by email), Activity (event stream), Session Replay (playback).
- PRIVACY FLAG carried forward: session replay of the two consenting mentor accounts (Larry/John) was fine. Once the
  new public waitlist converts STRANGERS into logged-in users, replay of un-forewarned users is a different posture
  for a pharma/compliance audience — decide on a privacy line + PostHog input-masking BEFORE turning the invite
  funnel on at volume. (Ties to the invite-system work that just shipped in the 38e1d0d merge.)

CONTEXT — this session also executed the full landing-page deploy + the FieldMark production release:
- Marketing site (`besselanalytics-www`, Cloudflare Pages) shipped to apex `besselanalytics.com`; waitlist Function
  live (see playbook §14 for the deploy lessons). Debug logging stripped post-launch; status-only failure log kept.
- FieldMark app: merged `ad-frontend-established` → `foundation-rebuild` (fast-forward, **merge commit `38e1d0d`**,
  prev `f77af8e`) → pushed → production deploy. 110 files: AD frontend, invite system (stages 1–3 + `send-invite-email`
  edge fn), community directory, AD Telescope data, pipeline changes. NSCLC fingerprint (§11c) passed pre-merge AND
  in production (Heymach 100, three-signal Established model uncontaminated by AD composite). Community directory
  confirmed LIVE in prod (19,156 dermatologists) → its migrations were already applied.
- **`38e1d0d` is the marker for Umbra recon staleness** — the frozen recon snapshot predates this merge; the report's
  build-readiness axis is now ≥1 merge behind HEAD (reinforces §13a/§13f: readiness findings are provisional, need a
  live evidence-expansion pass).
- Community Explorer restyle IN PROGRESS on `foundation-rebuild` (direct commit — low-blast-radius styling, per the
  branch-vs-direct rule in playbook §15): align card + chrome to cohort-dashboard design system; REUSE shared tokens
  (not hardcoded hex); NO score bar / no tooltip wiring (dollars/manufacturer have no percentile — porting the KPI
  tile's percentile construct rejected as §7m-style dishonest-carry). Data/sort/"not a ranking" framing unchanged.

MIGRATIONS STILL TO RECONCILE (deferred, deliberate): 15 `migrations/*.sql` (07/09–07/17) shipped in the merge.
Community-directory ones are confirmed applied (feature renders). The rest (invite-system stages, RLS lockdown, RPC
repoints) need a schema-first check — verify object existence BEFORE running, run only what's genuinely pending as
standalone statements (Supabase editor multi-statement quirk). Do NOT blind-run all 15.

### 31f. DYNAMISM / HABIT-LOOP STRATEGY + PostHog measurement plan (pre-mass-launch). Field Intelligence reframed.
Garrett couldn't sleep thinking about FieldMark's dynamism ("I haven't checked FieldMark today…" — the daily-habit
hook). Landed, after debate with the advisor, on a durable model worth recording:

THREE INDEPENDENT DYNAMISM LOOPS (layer, don't choose — Field Intelligence is the UMBRELLA, not just a forum):
  1. DATA / event-driven (new paper, rank change, trial readout) — weekly clock, zero cold-start, Garrett generates it.
  2. ORGANIZATIONAL MEMORY (team notes, follow-ups, belief captures) — STICKIEST + most defensible, works at N=1 user,
     no cold-start, already half-built (Field Insights/follow-ups). Both Claude and advisor initially under-weighted it.
  3. COMMUNITY / human-driven (Field Intelligence exchange) — highest ceiling, highest risk. A respected voice ("three
     investigators questioned durability this week") moves the conversation TODAY, not next week — faster clock than data.
Product must feel alive from all three; community is ADDITIVE not FOUNDATIONAL (never depends on being populated to look
alive). Build order by cold-start economics: org-memory + data first (both N=1), community as seeded phase-two.

COMMUNITY REFRAME (Garrett's, strong): not a forum → a "scientific intelligence exchange." Target ~75 EXCELLENT
oncology MSLs, not thousands of passive accounts (HN model). One-sentence high-signal observations, not Reddit essays
(also lower compliance risk). Persistent PSEUDONYMOUS reputation (not real names) = the mechanism to IDENTIFY POWER
USERS (the KOLs-among-MSLs) — same core competency as the product, turned on its own users. AI synthesizes the HUMAN
discussion, not just papers ("17 MSLs discussed pediatric sequencing; confidence growing on IL-31 durability").

CLAUDE'S STANDING OBJECTION (unresolved, empirical): the 75 best contributors are the people with the MOST to lose
(compliance) and LEAST to gain (already-established, thin pseudonymous karma has no external career value) from posting.
Early MedTwitter worked on REAL-NAME career-brand upside; this exchange removes that lever by design. The pull-to-post
is unproven. Mitigations noted: consumption-first (most lurk, AI digest carries value), reciprocity gating, make
pseudonymous reputation externally legible eventually, or institutional/top-down cover (a pharma medical-affairs org
blesses participation → whole team unlocked). GARRETT'S BET: release to the masses, see what uptake is — let the market
reveal which loop is the habit. Legitimate, given all pieces are already built.

MEASUREMENT PLAN (the guardrail that makes "release and see" into "release and LEARN" — muddy top-line signal is the
failure mode). Tool = PostHog (see §31e). Loop attribution requires custom events; retention needs none.
  - MASTER METRIC (built, zero-code): Weekly Retention insight, Unique users, Pageview→Pageview, weekly brackets
    (wk1 / wk2-4 / wk5-9), "filter out internal & test users" ON. Early real signal: Jun 7 & Jun 21 cohorts showed
    100%/75% multi-week return — faint but real pulse from earliest genuine users (tiny N, anecdote not proof).
  - PER-LOOP EVENTS (needs Code — the instrumentation prompt below) must ship BEFORE mass launch, or early users can't
    be attributed to a loop. Key event = `field_intel_post_created {is_seeded:false}` — one REAL unprompted post is the
    true/false on the whole community thesis. `is_seeded` tagging is NON-NEGOTIABLE (else the #1 metric is corrupted).
  - NO PII in event properties (capture that/which-type, never payload/HCP names/note contents — same discipline as the
    waitlist Function's status-only log).
  - PRIVACY: session replay of STRANGERS (mass launch) ≠ the two consenting mentors. Decide input-masking + a privacy
    note BEFORE opening the doors (carried from §31e).
NEXT: Code adds the ~8 capture events (prompt written this session) → Garrett builds the "Which loop?" comparison +
real-posts trend in PostHog once events flow → open signup → read the scoreboard.

### 31g. WEEK PLAN LOCKED: reingest-first. Two foundational discoveries — reingest is UNPROVEN (warm path), Field Intelligence is a MOCK.
End-of-session synthesis. The week's spine: **prove a warm reingest → then design dynamism (incl. building the FI
backend) → then the launch-gating TA slate.** Launch is blocked by TA coverage (2 TAs won't attract a base); dynamism
is blocked by reingestion (no fresh data = no "what changed"); reingestion is the keystone unblocking both.

DISCOVERY 1 — REINGESTION HAS NEVER RUN; warm path unproven. ROADMAP validated the SEQUENCE on COLD builds. §3b
proves the INVENTORY stage warm-safe (idempotent upsert, preserves `matching_hcp_id`), and §6 admits automation
needs {parameterization, idempotency, gates-as-code} = unbuilt debt ("automation without gates is an unattended way
to corrupt the DB faster"; the manual way already built 191,551 wrong HCPs). Reading §1 sharpened the risk map:
  - **Step C (`run_step_c_create_hcps.py`, stage 4) is the TOP warm risk** — it CREATES HCPs, cold-designed; if not
    idempotent vs existing hcps_v2 it re-creates duplicate person-records every run and dumps them on dedup. Test
    Step C FIRST/HARDEST — a dry-run trying to create already-existing people = reingest-not-ready, full stop.
  - **Dedup (10b, `dedup_merge.py`) is the HIGHEST-consequence risk** — validated cold, never run against its own
    prior merge output; a bad warm merge is "irreversible + undetectable" (§0c false_merge invariant).
  - Full warm-run test plan authored → `WARM_REINGEST_TEST_PLAN_NSCLC.md` (Phase 0 snapshot oracle / Phase 1
    stage-by-stage w/ risk table / Phase 2 six halt-on-failure assertions / Phase 3 gates-before-cron). Guinea pig =
    NSCLC (frozen, mature, ASCII-name so dedup milder → clean NSCLC is necessary-not-sufficient; AD 82%-intl is the
    harder warm case, test separately before any intl TA goes on a cron). Highest-value first move: Step C dry-run
    against warm NSCLC. The Phase-2 diff IS the "what changed this week" dynamism content — persist the delta, don't
    overwrite (overwrite refreshes numbers, throws away the story; the story is the dynamism).

DISCOVERY 2 — FIELD INTELLIGENCE IS A MOCK (Code's instrumentation trace). The community loop — the entire premise
of the dynamism-via-community bet — has NO backend: `mockFieldIntelligencePosts.ts`, synthetic handles
(thoracic_msl_47…), NO create-post flow, reply handler just clears a draft + "coming soon" toast, nothing persists.
So there is no real-vs-seeded distinction (Code correctly refused to fake `is_seeded`), and "do MSLs post?" is
unmeasurable because there's nowhere to post. => Community dynamism is a BUILD, not a MEASURE. It sits BEHIND
reingestion (no live community over stale data). Launch "release & see" cannot include FI as a real loop until it
has persistence.

  UPSIDE: the OTHER loops are real + instrumentable today. Of ~8 requested events, 4 hit genuine persistence — all
  ORG-MEMORY (the stickiest/most-defensible loop, and the one that's actually built):
    - `insight_captured` — InsightComposer.handleSave (the ONLY real note/insight write; the separate "note" UI is
      mock → `note_created` DROPPED as a duplicate call site).
    - `followup_created` — lib/relationships.ts createNextAction.
    - `followup_completed` — lib/relationships.ts updateNextAction (gated on completedAt).
    - `field_intel_viewed` — FieldIntelligence.tsx mount (appetite signal only; post/reply/is_seeded DEFERRED
      until FI has a real backend).
  Also confirmed absent: NO "What's New"/rankings-change surface exists → `whats_new_viewed` skipped (the data loop
  has no UI surface yet either — another build, not a measure).

GARRETT'S DECISIONS for morning (not yet executed): (1) instrument `field_intel_viewed` now, defer FI post/reply.
(2) drop `note_created` (= insight_captured). (3) omit `therapeutic_area` on Loop-3 events (no lookup — keep pure).
(4) ship the 4 real events, success-only, enums/booleans only, reuse track(). NO PII in props.

NET: both "remaining pieces" are unbuilt at the foundation — reingest unproven, FI/data-feed surfaces are mock/
absent. The real week: PROVE WARM REINGEST (Step C dry-run → full NSCLC warm test → assertions-as-gates), turn on
the 4 real org-memory events (the one dynamism signal that's genuinely measurable now), and treat FI-backend + a
real "What's New" surface as dynamism BUILDS that come after reingest is trusted.
NEXT MORNING: fresh eyes → Phase 0 snapshot + Step C warm dry-run (WARM_REINGEST_TEST_PLAN_NSCLC.md); greenlight
Code's 4 events.

### 31h. WARM-REINGEST TEST → became a DEDUP-RESIDUE CLEANUP + found a MERGER BUG. (NSCLC guinea-pig session.)
The Phase-0 warm-reingest test never got to "warm reingest" — it surfaced upstream problems first, which is
exactly what a pre-flight test is for. Chain of findings:

SCHEMA GROUND-TRUTH captured (corrects stale memory): NSCLC_TA_ID = c0065b03-a25e-4e9a-bde4-4b4d0db7827d.
No `full_name` col (first/middle/last + preferred_display_name). OpenAlex link is `hcp_openalex_authors_v2`
(hcp_id + openalex_author_id + is_primary + corpus_pub_count). Metrics = hcp_author_metrics_v2 (works_count).
Ranks = hcp_established_ranks_v3 (scope_type/scope_value/rank/cohort_score + 3 _pctile cols — scope-rowed, KOL
has multiple rows). Config-per-TA table EXISTS: `therapeutic_area_ingestion_config` (relevant to the holy-grail
--ta script). Oracle snapshot tables created (dirty pre-cleanup state): nsclc_oracle_*_20260720.

FINDING 1 — NSCLC KOLs are FRAGMENTED. Riely (2 rows) + Hirsch (3 rows), each with DIFFERENT openalex_author_ids,
all `step_c_cluster_creation`, NONE in dedup_merge_log. Root cause: dedup ran once (May 10–13, 5,580 merges, 6
passes incl pass_7b_initialized_name + pass_manual_canonical), then LATER Step C re-runs (AD-era) re-created
fragments, and dedup was NEVER re-run after. => Dedup is a one-time May pass that later Step C runs silently
undid. Invisible because the app shows one card per KOL (only the pub-linked fragment ranks). Confirms the
reingest-safety thesis with a REAL example: Step C is not idempotent vs prior dedup (risk-table's #1 warm hazard).
Why not caught before: no surface symptom; nothing REQUIRED provably-clean identity until reingestion design did.

FINDING 2 — scope is SMALL/clean, not a disaster. Zero shared-openalex-id duplicates in NSCLC. `dedup_detect.py`
(verified read-only: SELECTs + CSV only, no writes, no external API) over 282,464 HCPs → 898 candidate pairs, but
only 43 high-confidence (32 merge_fragment + 11 merge), 849 fragment_low_evidence (tool declines), 6
skip_geographic_mismatch. ~0.015% duplication. Tool is conservative (false_split>false_merge working). NOTE: the
43 high-conf are mostly HEPATOLOGY/international names (El-Serag, Chalasani, Abou-Alfa, Vauthey, Pol…), NOT the
NSCLC KOLs — Riely/Hirsch are in the low-evidence 849 the strict tool won't auto-merge → they need the MANUAL
canonical path, separate task.

MERGE EXECUTION (dedup_merge.py — "Approach A": keep pub-keyed primary, merge+delete NPI stub. Verified: NO
dedup_merge_log write, NO original_*_data snapshot → NO per-merge undo; hard `DELETE FROM hcps_v2` line 563.
So FULL-TABLE BACKUP is the ONLY undo). Backup taken: `hcps_v2_pre_dedup_cleanup_20260720` (282,464 rows).
Protocol: dry-run (41 merges/39 comps/0 fail/overlap 0) → execute ONE test cluster → batch+verify count.
  - Cluster 7 (Underwood): clean. 1 stub deleted, count 282,464→282,463, one survivor. Mechanics proven live.
  - Batch 1 (10 clusters): 9 clean, count →282,454. Cluster 8 (Sutter) DECLINED — inverted case (NPI record has
    FEWER pubs than the no-NPI/no-TA record; different openalex-ids). Tool correctly did nothing → reclassified
    Sutter GREEN→manual. (Gate working: declines ambiguous, doesn't guess.)
  - Batch 2 (10 clusters): 0 merged, count UNCHANGED 282,454. NOT declines — CRASHES.

FINDING 3 — MERGER BUG (the real prize). dedup_merge.py fails with UniqueViolation on FK re-point when stub AND
survivor BOTH already have a row with the same COMPOSITE key. Two tables confirmed:
  - publication_authors_v2  pkey (publication_id, hcp_id)  — shared co-authored pubs collide
  - hcp_score_ranks_v2      unique (hcp_id, therapeutic_area_id, cohort, scope_type, scope_value)
Root cause: both are in tables_simple (plain UPDATE) but need tables_conflict (conflict-delete: delete colliding
stub row first, then update). Author enumerated most conflict tables, missed these. Transaction ROLLS BACK cleanly
(verified: Ouellet/Salvati still 2 rows each, pub_links intact) → NO corruption, just failed merges. Batch 1 mostly
worked because clean US pairs didn't share pubs; Batch 2 international fragments genuinely co-authored same papers
→ collision. This same bug would crash the automated reingest dedup step — found it in a controlled manual run.

STATE: 9 merges done+verified (282,454), backup intact, ~33 blocked on the bug. Code prompt written to (1) AUDIT
ALL FK-to-hcps_v2 tables that ALSO have a composite unique/pk key on hcp_id (there's likely a 3rd), (2) move them
all to the conflict-delete path with correct key cols, (3) show audit list before editing. Read-only audit + edit,
no run/commit/push.
NEXT: review Code's audit list → confirm key cols → fix merger → re-run blocked clusters in verified batches →
THEN handle Riely/Hirsch/Sutter/Bajor/Bronowicki×3/Péron×3 manual cases → THEN the actual warm-reingest test on a
now-clean NSCLC. (The reingest test is still pending; identity-cleanup is the prerequisite that surfaced.)

### 31i. DEDUP CLEANUP EXECUTED — merger bug fixed, 37 fragments merged, both NSCLC KOLs resolved. (continues §31h)
Merger bug fix (§31h) committed (dedup_merge.py, commit e726f3f, local — script not app, no deploy). NULL-safe
predicate `IS NOT DISTINCT FROM` + 6 tables moved simple→conflict. PROVEN on live data: cluster 27 (Mochida,
crashed pre-fix) merged clean; zero UniqueViolations across all subsequent batches.

EXECUTION (all over intact backup `hcps_v2_pre_dedup_cleanup_20260720`, 282,464 rows):
- 282,464 → 282,427 = 37 fragment records merged away, zero corruption.
- High-confidence corpus residue: 34 clusters (Batch1 9 + cluster27 + Batch3 10 + Batch4 13 + Underwood test).
  Chalasani (hep KOL) verified clean (260 pubs consolidated).
- NSCLC KOLs (manual canonical path — strict tool rated low-evidence because shards thin, NOT contrary evidence):
  built minimal CSV `manual_kol_merge.csv` (cols: cluster_id,primary_hcp_id,stub_hcp_id,recommended_action —
  action MUST be in ALLOWED_ACTIONS {merge_high_confidence, merge_fragment_high_confidence} or rows silently
  drop; write with [System.IO.File]::WriteAllText to avoid PowerShell BOM). Union-find groups multi-row clusters
  by shared cluster_id → 3-way merge = 2 rows same cluster_id.
    · RILEY: G.J.(4 pubs)→Gregory J.(124). Verified same person via shard titles (crizotinib ROS1 PROFILE 1001,
      ALK, RET NSCLC). Result: 1 row, 128 pubs. ✓
    · HIRSCH: 3-way, 26-pub + 3-pub shards → Fred R.(112). Verified via shard titles (SCLC, NSCLC EGFR/FGFR
      biomarkers). Result: 1 row, 141 pubs. ✓

DELIBERATELY HELD (manual, low priority, NOT done): Sutter(8, inverted NPI/pub — tool declined), Bronowicki
×3(48/49/50), Péron ×3(385/386/387), Bajor(689, David L. vs David J. — the one genuine false-merge RISK, keep
held until same-person confirmed). Not KOLs of concern; fine to leave.

TOOL KNOWLEDGE captured: dedup_detect.py (read-only, SELECTs+CSV) → dedup_candidates_phase1.csv. dedup_merge.py
"Approach A" (keep pub-keyed primary, delete NPI stub); NO dedup_merge_log write / NO per-merge undo → full-table
backup is the ONLY recovery; flags --dry-run/--execute/--cluster/--csv, NO manual --primary/--stub (use a hand-CSV
with cluster_id + ALLOWED action). Already-merged clusters fail safely as RuntimeError('Primary or stub not found')
— harmless skip, not a bug.

STILL PENDING (the original goal): the WARM-REINGEST TEST never ran — this whole session was the identity-cleanup
PREREQUISITE that surfaced. NSCLC identity is now materially cleaner (KOLs resolved) but NOT fully clean (holds
remain). Also uncommitted in tree: PostHog events (3 frontend files, need diff review — deploy to prod) + local
vite.config.ts (keep out of commits) + WARM_REINGEST_TEST_PLAN doc (untracked). Oracle tables from this AM
(nsclc_oracle_*_20260720) captured a PRE-cleanup dirty state → the real reingest oracle must be re-snapshotted
AFTER cleanup, before the warm test.
NEXT OPTIONS: (a) warm-reingest test on now-cleaner NSCLC (re-snapshot oracle first), (b) finish manual holds
(incl. Bajor verification), (c) review+ship the PostHog events, (d) pivot to the week's bigger reingest/TA-crank
architecture. Backup safe, 37 merges banked, nothing mid-flight.

### 31j. REINGEST TEST BLOCKED — no current Step C on disk. Last run MAY 22 (.pyc), only source is ARCHIVED, a REWRITE SPEC exists.
Attempted to start the warm-reingest test (re-snapshotted clean oracle: hcps_v2=282,427, nsclc=79,888,
dedup_merge_log=5,580 [still May count — confirms today's 37 merges are UNLOGGED, backup is the only record]).
Went to run Step C dry-run — and the tooling isn't there:
  - Only `run_step_c_create_hcps.py` SOURCE on disk is ARCHIVED: `archive\hepatology_workstream_2026_05\`
    (May-dated, hepatology-scoped). Running it vs current evolved schema = corruption risk. DO NOT run.
  - Root has an ORPHAN `__pycache__\run_step_c_create_hcps.cpython-312.pyc` → proves Step C ran from root,
    but the .py source is gone/moved. **.pyc LastWriteTime = 5/22/2026** → Step C LAST RAN IN MAY, not during
    the AD build. Contradicts the memory of "we used it 2 weeks ago" — AD HCP creation must have happened a
    different way, OR the memory conflates it. Hard evidence: Python regenerates the .pyc on every run; 5/22 is
    the last execution.
  - `docs\STEP_C_REWRITE_SPEC.md` exists (LastWriteTime pending) → Step C was slated for a REWRITE.
  - Chat search confirms Step C is real (one of 5 scripts given --target-version v2 in the May-22 foundation
    rebuild), and ROADMAP §1 lists `run_step_c_create_hcps.py --target-version v2` as canonical stage 4 — but
    neither pins a CURRENT stable source file.

CONCLUSION: The warm-reingest test is BLOCKED by the genuine absence of a current, stable, current-schema Step C.
This IS the answer to the week's reingest question — reingestion tooling (Step C esp.) hasn't been touched since
May and was flagged for rewrite (matches ROADMAP §6: automation/idempotency NOT built). Not a dead end — it's the
real blocker, now pinned: **before scheduled reingestion / TA-crank is possible, Step C must be rewritten (or a
current version located) to run idempotently against the CURRENT schema.** The whole dynamism/reingest week rests
on this.

RELEVANT PRECEDENT (chat search): the May-22 rebuild hit this exact class of bug — 81,617 HCPs w/ stale career
data because career_enrichment ran out of sequence; the "Shoji case" (243 pubs → 1 via PubMed name conflation).
Pipeline stages misbehaving against warm/existing state is a documented recurring failure → reinforces that warm
reingest needs dry-run + diff gating, and that the Step C rewrite must be idempotency-first.

NEXT: read STEP_C_REWRITE_SPEC.md (attachment path keeps rendering empty on Claude's end — get via Select-String
or Garrett's memory) to learn what the rewrite entails and its status (done/planned/abandoned). THAT — the Step C
rewrite — is the real next piece of work, upstream of the reingest test, the dynamism loops, and the launch-gating
TA slate. (Backup `hcps_v2_pre_dedup_cleanup_20260720` intact; 37 merges banked; nothing run against prod today
beyond the verified surgical merges.)

### 31k. THE REAL BLOCKER, PINNED: Step C (built or specced) is CLEAN-BUILD only — no incremental/warm reingest path exists. Architectural fork.
Read STEP_C_REWRITE_SPEC.md (create_hcps_v2.py) — it's a complete, current, build-ready spec (inputs "built,
verified July 3 2026"; preserves the anti-conflation clustering IP exactly — the Shoji/Zhang-Wei defense; validation
section names AD KOLs Guttman-Yassky/Silverberg/Simpson/etc. to check for fragmentation). GOOD: the rewrite is
specced, not lost. BUT the decisive finding is in the CLI + validation:

  - FLAGS: --target-version, --dry-run, --limit, --ta (scoping only). NO --incremental / --update-existing /
    --warm / reconcile-against-existing mode. => create_hcps_v2.py is a CLEAN-BUILD tool: cluster inventory →
    CREATE HCPs. It is NOT designed to reingest against existing hcps_v2.
  - VALIDATION checks CONSTRUCTION correctness (no conflation, no KOL fragmentation, HCPs≪authors), NOT
    incremental-update correctness ("added only new, left existing untouched"). Incremental was never in scope.

=> This explains the whole morning: Riely/Hirsch fragmented because Step C is a build-from-inventory op with no
incremental awareness — running it warm re-creates/re-fragments by design. So WARM REINGESTION (add this week's new
papers/authors without disturbing existing HCPs, produce a "what changed" diff) HAS NO TOOLING PATH — not in the
current (May) Step C, not in the specced rewrite.

THE STRATEGIC FORK (this is what the dynamism/reingest week actually turns on):
  OPTION 1 — FULL-REBUILD CADENCE: each refresh = rebuild whole corpus from inventory (create_hcps_v2.py full) →
    re-run full dedup suite → recompute scores. Buildable NOW (build step is specced; dedup tools exist, now
    bug-fixed). Idempotency via "rebuild identically each time." Heavy: expensive, slow; the "diff" = compare two
    full rebuilds. Doesn't scale to frequent refresh.
  OPTION 2 — TRUE INCREMENTAL REINGEST: net-new capability — reconcile new inventory vs existing HCPs, create only
    genuinely-new people, link new pubs to existing HCPs without re-creating. This is what cheap, frequent,
    diff-producing dynamism needs. More engineering; NOT specced anywhere yet.

The spec gets you Option 1's build step. It does NOT get you Option 2. Reingestion-for-dynamism = Option 2 = net-new
design + build. This is the load-bearing decision for the week, surfaced before sinking days into "just run the
reingest" (which had no runnable path regardless).

TODAY'S NET (plan was warm-reingest test; actual = far more valuable groundwork): fixed a live merger bug (NULL=NULL
conflict-delete skip) that would've crashed automated dedup; cleaned 37 fragments incl. both flagship NSCLC KOLs
(Riely 2→1/128 pubs, Hirsch 3→1/141 pubs, publication-verified); AND mapped the true reingestion blocker to a
specific architectural fork. Backup intact, nothing risky run against prod.

### 31l. DECISION: build reingestion via Option 2 / Path B. create_hcps_v2.py build commissioned + 3 known future gaps documented.
Garrett: dynamism MUST be day-one (1000%, non-negotiable) → stale-but-broad and periodic-full-rebuild (Option 1)
are BOTH insufficient → committed to Option 2 (true incremental reingest). Engineering path = B (create-provisional
-then-dedup), reusing today's fixed+validated dedup suite rather than building a second incremental clusterer.
(Garrett explicitly delegates engineering calls to Claude going forward; Claude owns impl decisions, escalates only
product/strategy.)

ARCHITECTURE (Path B): incremental ingest (date-windowed) → Step C insert-new-only → dedup suite folds new
fragments into existing HCPs → rescore changed → EMIT DIFF. identity_hash (UNIQUE NOT NULL, deterministic:
ORCID-hash or sha256(normalized_name|institution_ror)) IS the idempotency key — no-op reingest of unchanged data
computes same hashes, finds all existing, creates zero. Idempotency falls out of existing design.

FIRST BUILD (commissioned to Code, NOT yet built/run): create_hcps_v2.py from STEP_C_REWRITE_SPEC.md, fresh (not
resurrecting archived v1-shaped script — stale schema), preserving clustering IP EXACTLY (ORCID → name+institution
→ ANTI-CONFLATION GUARD [Shoji/Zhang-Wei: shared common name + diff institutions + no ORCID → KEEP SEPARATE] →
confidence threshold). PLUS --incremental mode: cluster→compute identity_hash→if exists in hcps_v2 skip-create +
add only missing shard links (.update().eq() not upsert; composite-PK existence check w/o select("id")); if not,
create. Default = full clean build. Explicit idempotency test: 2nd --incremental run w/ no new data = 0 HCPs/0 links.
Spec's VALIDATION checks (no conflation / no KOL fragmentation [AD KOLs named] / counts sanity) built as functions
run after dry-run. Review clustering + incremental branch → dry-run (writes nothing) → read validation BEFORE any
real execute. Higher stakes than the merger — the identity engine.

3 KNOWN FUTURE GAPS (Claude flagged; NOT "reingestion done" — this is "identity engine v1"):
  1. identity_hash INSTABILITY: institution change → different hash → incremental treats as NEW person → duplicate.
     People change institutions over a multi-year weekly cron. Fine for v1; real gap for "runs forever." Needs an
     institution-change reconciliation strategy (or ORCID-preference to dodge). NOT addressed in this build.
  2. DIFF CONTRACT MISSING: the "what changed this week" diff (the actual dynamism PRODUCT) + orchestrator aren't
     in this build. Risk: engine resolves identity perfectly but discards the "what's new" signal. Partial mitigation
     added now (see below); full diff contract = its own design pass before scheduling.
  3. STEP-C-MUST-ALWAYS-BE-FOLLOWED-BY-DEDUP coupling: incremental Step C produces transient duplicates (e.g. new
     OpenAlex fragment of existing person w/ diff institution won't identity_hash-match → dup) that ONLY dedup
     cleans. So incremental Step C is NEVER standalone — always Step C + dedup + validation as an atomic unit. If
     run without the dedup follow-up, it RE-CREATES today's exact fragmentation bug. Coupling must be ENFORCED by
     the orchestrator, not assumed.

CHEAP FUTURE-PROOFING ADDED NOW (closes gap #3's visibility + seeds gap #2's diff contract): --incremental must
EMIT a structured run-summary (HCPs created, shard-links added, existing HCPs touched/updated, + the provisional-
new-HCP count that dedup must then reconcile). One extra requirement; makes the dedup-coupling visible and starts
the diff artifact in the engine from day one instead of retrofitting.
Gaps #1 and #2-full deferred to a deliberate design pass BEFORE any cron — documented, not solved.

### 31m. create_hcps_v2.py BUILT + first live runs → idempotency bug found (v1/v2 table mismatch) → rolled back clean.
create_hcps_v2.py already existed (committed July 3, full-build, spec-faithful) at scripts/classify/ — this morning's
"Step C missing" was a wrong-folder search (looked in root+archive, not scripts/classify/). Code EXTENDED it (not
rewrote) with --incremental: pure planner plan_incremental() (:967) separate from execute_incremental() (:1129);
--self-test proves offline idempotency (round 2 = 0 creates); run-summary emits the specced JSON incl.
provisional_new_hcps + "next_step: run dedup"; docstring enforces "INCREMENTAL MUST ALWAYS BE FOLLOWED BY DEDUP."
Nameonly-bucket conflation risk (rule-3 violation) closed: measured 995/253,011 (0.39%) no-institution authors, 0
currently name-colliding → forced to singletons (fragmentation recoverable > conflation). Code review PASSED
(clustering IP untouched, is_primary=False on new-shard-to-existing so reingest never steals canonical, composite-PK
checks avoid select("id")).

LIVE RUNS (against real DB, over snapshot hcps_v2_pre_stepc_incremental_20260720):
- Dry-run: RUNS CLEAN against current schema (the thing this morning couldn't confirm — Step C executes!). Anti-
  conflation IP demonstrably working: three "Fei Liu" w/ distinct ORCIDs kept SEPARATE. Only 9 "unlinked" rows found.
- Ran --incremental 3x → created 9, 7, 9 (25 total) — each a DIFFERENT set of new authors. IDEMPOTENCY DID NOT
  CONVERGE (2nd/3rd runs should've been 0).
- ROOT CAUSE (found via console line "Loading linked OpenAlex IDs from hcp_openalex_authors... Already linked:
  253,001"): the incremental prefilter READS the V1 table `hcp_openalex_authors`, but the engine WRITES to
  `hcp_openalex_authors_v2`. So v2 links written each run are invisible to the next run's v1-based prefilter →
  never converges. Confirmed: query "inventory authors NOT in v2 link table" = 0 (everything IS linked in v2); the
  25 all present in v2 links. The clustering + creation are CORRECT; only the prefilter table ref is wrong.
- SECOND (folded-in) bug: incremental never sets openalex_author_inventory.has_matching_hcp=true / matching_hcp_id
  (253,011 all show flag false/null). Same "wired to v1 not v2" root class. Masked by the (correct) v2-would-be
  prefilter, but the flag is unreliable for any other consumer.

ROLLED BACK: deleted the 25 test HCPs + their ~26 v2 link rows (ids from the 3 run-summary JSONs). hcps_v2 back to
282,427 exactly. Pure Step C write (HCP+link only) confirmed — Step 2 delete threw no FK error, so nothing leaked to
scoring/metrics. Clean ground.

FIX HANDED TO CODE (not yet done): (1) incremental prefilter must READ hcp_openalex_authors_V2 (not v1) under
--target-version v2 — all link reads AND writes target _v2. (2) incremental must set inventory has_matching_hcp=true
+ matching_hcp_id on linked rows in the same write path. (3) prove: run once (drains backlog) → run again = 0
created. Show diff (esp. the prefilter table name + the flag update). No DB run/commit/push until reviewed.
NEXT: review Code's fix → one clean incremental run → PROVE run-2=0 (the idempotency gate) → THEN the Step C→dedup
coupling test on real new data → then rescore-diff (= the pub dynamism feed). Backup discipline held all day; nothing
lost.

### 31n. ✅ IDEMPOTENCY PROVEN. Real bug was keyset-pagination straddle (not v1/v2 table — Claude's diag was wrong; log string fooled it).
Code corrected the diagnosis: prefilter ALREADY read hcp_openalex_authors_v2 via get_table_name() (reads/writes
same table) — the MISLEADING part was a hardcoded v1 name in the console LOG STRING while the query used v2. (Lesson:
trust the query, not the print — the exact "verify don't trust the log" discipline, and Claude got fooled by it.)
REAL BUG: keyset pagination in the linked-authors prefilter ordered by hcp_id (NON-unique) with .gt("hcp_id", last)
→ when one hcp_id's shards STRADDLE a 1000-row page boundary, the tail shards get skipped (captured 1500/1502,
dropped 2). Dropped links → those authors look unlinked → duplicate HCP created. Different pair straddles each run as
ids change → run1=9/run2=7/run3=9, all different authors. FIX: paginate by openalex_author_id (UNIQUE) → no straddle
→ 1502/1502. Regression-tested offline both directions. (fetch_identity_hash_map paginates by hcps_v2.id which is
unique — no straddle there.) Also confirmed the earlier "duplicates" reading: the buggy runs created SECOND HCPs for
authors already linked to existing HCPs (e.g. Ming-Chih Hou already = 525139c4; test made a dup) — rollback correctly
removed them.

ALSO fixed: inventory back-reference now written on BOTH paths (one helper update_inventory_backrefs :963, called
from incremental :1262 AND full-build :1649) via .update().eq() never upsert → has_matching_hcp/matching_hcp_id
globally reliable (not half-reliable). Log strings now print resolved table names.

IDEMPOTENCY PROOF (live, real DB): after rollback (0 genuinely-unlinked), proof_run1 → "Loading linked OpenAlex IDs
from hcp_openalex_authors_v2... Already linked: 253,011 / Unlinked rows: 0 / Nothing to do" → hcps_created: 0,
links: 0, backrefs: 0. **A no-op incremental run against real production data creates ZERO.** This is THE core
property of the reingestion engine, proven. (hcps_v2 = 282,427, unchanged.)

STATE: create_hcps_v2.py incremental mode = built, bug-fixed, idempotency-proven. NOT yet committed/pushed (Garrett's
call). Backup hcps_v2_pre_stepc_incremental_20260720 can be dropped once satisfied. NEXT: (1) commit the fixed
script. (2) The REAL reingest cycle test — feed genuinely NEW pub data (date-windowed ingest) → incremental Step C
creates only new people → RUN DEDUP SUITE (the enforced coupling) to fold new fragments into existing canonicals →
confirm no KOL re-fragmentation → (3) capture the rescore delta = the PUB DYNAMISM FEED ("what changed this week").
That sequence is the dynamism substrate. Then: date-windowing on ingest, orchestrator+diff contract, then schedule.
Deferred gaps still open: #1 identity_hash institution-change instability (before long-lived cron); full diff/
orchestrator design.

### 31o. FINDING: identity_hash is NULL for 95% of corpus (268,853/282,427). Idempotency layer 2 is inert → backfill required.
The reconcile-cycle test attempt surfaced a bigger prerequisite. Both test-subject HCPs (Guohong Ge fefcf11b, Xihu
Qin cd90f474) had identity_hash = NULL. Scope check: 268,853 null / 13,574 have hash. So only HCPs created by the NEW
create_hcps_v2.py carry a hash; the ~269K from earlier builds don't.

WHY IT MATTERS: incremental idempotency has 2 layers — (1) link-table prefilter "is this OpenAlex id already linked"
(fixed today, working), (2) identity_hash match "does this cluster's identity already exist as an HCP." Layer 2 is
INERT for 95% of the corpus (null hashes aren't in the index — proof_run1's index loaded only 13,590). So idempotency
currently rests ENTIRELY on layer 1. The gap: a person appearing via a NEW OpenAlex fragment (new author-id → layer 1
doesn't recognize it) who is the SAME human as an existing null-hash HCP → passes BOTH layers → duplicate created.
**This is exactly the Riely/Hirsch fragmentation mechanism.** Backfilling identity_hash closes that loop permanently.

NOT a crisis — a buildable one-time backfill: compute each null-hash HCP's identity_hash via create_hcps_v2.py's OWN
hash fn (ORCID→hash ORCID; else sha256(normalized_name|institution_ror)), write it. SUBTLETY: identity_hash is UNIQUE
NOT NULL → if two existing HCPs compute the SAME hash (they're an undetected duplicate pair), the 2nd write collides.
That's a FEATURE: the backfill doubles as a duplicate-detection pass. So it must handle collisions as FINDINGS
(report), not crash. Decision: REPORT-ONLY collision handling (human/dedup-tool review; no auto-merge on hash
collision — matches today's supervised-merge discipline).

3 wins from one task: (a) hardens idempotency across whole corpus, (b) surfaces remaining duplicates, (c) unblocks a
clean reconcile-cycle test (with hashes, un-link → Step C recomputes hash → matches existing → self-heals via layer 2,
vs muddy dedup-only path).

RELATED cleanup surfaced: has_matching_hcp/matching_hcp_id also stale-null across the existing 253K inventory rows
(old code never wrote them; fixed going forward). A one-time inventory back-flag backfill from the link table is a
sibling cleanup (lower priority — engine uses link table not flag for prefilter).

No data mutated this turn (only read queries + the *_pre_cycletest_20260720 backup tables created, harmless).
create_hcps_v2.py committed (e0311d9, local, not pushed). NEXT: build + run identity_hash backfill (report-only
collisions) → then reconcile-cycle test → then real reingest cycle (new data → Step C → dedup → rescore diff = pub
dynamism feed).

### 31p. identity_hash backfill dry-run CLEAN + ingest audit: ingest is WINDOW-NATIVE (near-ready). Pipeline readiness mapped.
BACKFILL DRY-RUN (backup hcps_v2_pre_hashbackfill_20260720 = id+identity_hash taken): total_null 268,853 →
would-write 228,621 recoverable, 40,145 UNRECOVERABLE, 87 collisions, 0 errors. VERIFIED the 40,145 unrecoverable =
the NPPES community workstream (40,143 have NPI, 40,143 TA-tagged, 0 OpenAlex links) ≈ known 40,154 community HCPs.
Correct & harmless — they're NPI-matched not OpenAlex-clustered, don't use identity_hash. The 228,621 recoverable =
the entire OpenAlex/publication population → layer-2 idempotency becomes real for pub-reingest. 87 collisions = a
BONUS second-pass duplicate list (identity-based, catches what name-clustering missed) for later dedup review.
Backfill --execute RUNNING now (single-statement-per-row, IS NULL-guarded → SAFE to interrupt & resume; slow, hours
possible). Reuses engine's compute_record_identity_hash; recovers original inputs (display_name + ROR) from
openalex_author_inventory via link table (NOT from hcps_v2 — which lacks institution_ror; Code's original backfill
read the wrong column, caught by the 3-HCP round-trip test: Claxton/Qiu/Pace reproduce exactly). create_hcps_v2.py
got a behavior-preserving +45/-12 refactor extracting compute_record_identity_hash (shared by engine + backfill).

INGEST AUDIT (answering "how close to ingesting new PubMed/OpenAlex data"): ingest_publications.py is WINDOW-NATIVE
already. generate_date_windows(days_back, window_days=90) → (mindate,maxdate) tuples; loops windows; handles PubMed's
9999/query cap by splitting windows; flags --ta/--target-version/--limit/--dry-run. Window controlled by
config["pubmed_days_back"] (pull last N days from today). => Incremental ingest needs NO new code: set a small
pubmed_days_back on a weekly cadence = "pull last N days" = incremental, and the idempotent downstream (Step C won't
recreate, dedup folds, backfilled identity_hash catches re-appearance) makes the overlap safe. Only refinement for a
robust cron = exact last-run-date tracking instead of "last N days" — an optimization, NOT a blocker. **The pub
reingest front-end is essentially ready NOW.**

PIPELINE READINESS SCORECARD: ingest pubs ✅ready(window-native) · inventory build ✅warm-safe(§3b) · Step C
incremental ✅built+proven · identity_hash backfill ⏳running · dedup ✅fixed+validated · rescore ❓UNAUDITED(next) ·
diff artifact ❌not built(but seeded by Step-C run-summary + rescore delta). => After rescore audit, the ONLY
genuinely net-new piece for a working pub-reingest cycle (= the day-one dynamism feed) is the DIFF ARTIFACT. Path to
"new NSCLC pubs → full chain fires" is short: a small pubmed_days_back run → inventory → Step C incremental → dedup →
rescore → capture delta.
NEXT: grep scoring_pipeline.py (incremental vs whole-corpus rescore) → then commission the diff artifact (the real
remaining build) → then the end-to-end cycle test on a real small date window.

### 31q. ADVISOR INPUT (dynamism.docx) + Phase-1 diff spec commissioned. Backfill running (transient conn errors = self-healing).
BACKFILL EXECUTE in progress: ~21% (57,000/268,853, ~40min) → ~3.2hr total ETA. written climbing (48,443). errors=4
= ConnectionTerminated (HTTP2 idle/stream-limit drops on the long single-connection run, error_code:0,
last_stream_id:19999) — BENIGN: those rows stay NULL, caught on re-run (IS NULL-guarded, resumable). Plan: let finish
→ re-run once to sweep stragglers (the few conn-errors + the 87 collision-skips) → verify. Only add retry/conn-refresh
logic if errors climb to hundreds (at 4/57K = 0.007%, not worth interrupting).

ADVISOR DOC (dynamism.docx — strong, a mentor/advisor): core reframe "Here's what's NEW → here's what MATTERS."
Proposed 6 Field-Intelligence categories: (1)Scientific Momentum/Rising ⭐⭐⭐⭐⭐ (2)Citation Heat ⭐⭐⭐⭐⭐ [suggests
rename to Research Impact / "citation velocity"] (3)Belief Shift ⭐⭐⭐⭐⭐ [NLP over pubs+field notes+community — heavy]
(4)Network Signals (5)Territory Intelligence [geo-personalized] (6)Company Intelligence [needs Open Payments
reingest]. Sharpest ideas: WATCHLISTS (advisor's explicit #1 "build before almost anything" — personalized dynamism,
"Bloomberg terminal"), "WHY SHOULD I CARE?" (every alert states why it matters, e.g. "moves Dr. Yu into Top 5% Rising"
— natural fit for the Claude API layer to narrate), "SCIENTIFIC WEATHER" (☀️/🌩️ pulse = cheap aggregate of the diff).
Advisor top-5 build: Rising Movers, Watchlists, Citation Heat, Emerging Themes, Territory.

CLAUDE'S STRATEGIC READ (told Garrett): doc VALIDATES today's work — its 2 highest-rated (Rising ⭐⭐⭐⭐⭐ + Citation
Heat ⭐⭐⭐⭐⭐) = exactly our Phase-1 (HCP rank/cohort diff) + Phase-2 (Citation Heat, feasible: openalex_pipeline
UPDATEs existing pubs' citation_count + stores citation_counts_by_year per-year + openalex_enriched_at). CAUTION: the
doc is a 12-month VISION wearing a feature-list costume — categories span wildly different infra readiness (Belief
Shift/Company are heavy net-new); don't let breadth pull off the 2 shippable things. "Advisor describes the roof;
today poured the foundation." Correct build order (foundation up): reingest cycle (built today) → Phase-1 diff →
"why care" Claude-narration → WATCHLISTS (advisor's #1, but depends on diff existing) → Citation Heat → then the
heavy categories. Watchlists = the delivery mechanism that turns diff into a HABIT, but the diff is the fuel.

PHASE-1 DIFF spec commissioned to Code (build in parallel w/ backfill — no conflict, reads score tables). 2 advisor-
driven design requirements folded in: (a) emit STRUCTURED per-HCP deltas (not a rendered feed) so Watchlists can
filter + Claude can narrate "why this matters"; (b) include an AGGREGATE summary (N risers/M pubs/X shifts) = seed of
"Scientific Weather." Signals: new rising stars (cohort transition), rank movers (delta), new TA entrants. Mechanism:
snapshot hcp score/rank state before cycle → run cycle → snapshot after → delta table (reingest_diff_v2) keyed by
run/date, frontend-queryable.

### 31r. ✅ identity_hash backfill COMPLETE (228,598 written) + diff engine done (FK dropped). Ready for the first real cycle.
BACKFILL EXECUTE finished (11,612s ≈ 3.2hr): hashes_written 228,598, collisions 87 (matches dry-run exactly; CSV =
bonus identity-dup list for dedup review), unrecoverable 40,145 (NPPES community, correct NULL), errors 23 (ALL
benign ConnectionTerminated HTTP2 stream-limit drops — those 23 rows still NULL). identity_hash layer now real for
~228,598 OpenAlex/pub HCPs → layer-2 idempotency real across the pub corpus → the KOL-fragmentation gap is CLOSED.
TODO on return: re-run backfill ONCE (IS NULL-guarded → sweeps the 23 stragglers, few writes, likely 0 errors on a
short run; re-run again if it drops more — converges). Then verify: has_hash ~242,195 (13,574 orig + ~228,621
backfilled), null_hash ~40,232 (40,145 community + 87 collision-skips).

DIFF ENGINE (reingest_diff.py) + migration DONE, offline-verified, awaiting DB apply: 7 change_types incl
dropped_out (prominence-weighted magnitude 500 + max(0,100-before_rank) → declining KOL surfaces, long-tail exit =
noise). Schema audit caught the trap: hcps_v2.cohort_* is single-valued cross-TA (WRONG for per-TA); authoritative
source = hcp_score_ranks_v2 (cohort, score_at_rank, rank@global-scope). Reads pub_count from hcps_v2.total_career_pubs
(cross-TA — noted v1 simplification; per-TA is a later refinement). CRITICAL DESIGN DECISION (Code flagged the
dedup-hard-delete × FK-cascade interaction): DROPPED the FK from reingest_snapshot_v2/reingest_diff_v2 .hcp_id →
hcps_v2(id). These tables are an IMMUTABLE HISTORICAL EVENT LOG; the dedup suite hard-deletes stub hcp_ids, and an FK
cascade would erase diff/snapshot history exactly around merged HCPs (the interesting KOLs). Plain indexed uuid, no
FK — "HCP X was rank 47 on date D" stays true even after X is merged. Decouples dynamism history from identity churn.
migrations/2026_07_20_reingest_diff_v2.sql (3 tables: snapshot, diff, summary; watchlist index on hcp_id, feed index
on ta_slug/computed_at/magnitude; why_context reserved NULL for the Claude "why care" narration layer). Two untracked
files: scripts/score/reingest_diff.py + the migration. NOT committed/pushed/applied.

ADVISOR-DRIVEN NEXT (product layer, no backfill dependency — for tonight's session): design feed presentation +
WATCHLISTS (advisor's #1 — user follows hcp_ids/institutions/topics/drugs, filters the diff) + "Why should I care?"
Claude-narration layer (populates why_context: "moves Dr. Yu into Top 5% Rising"). Then the PAYOFF: apply migration →
before-snapshot → small real NSCLC date-window reingest (ingest --ta nsclc, small pubmed_days_back → inventory →
Step C incremental → dedup → rescore) → after-snapshot → FIRST REAL DIFF.
Garrett stepping away for dinner/family; resuming product layer tonight.

### 31s. First real cycle STARTED (33 pubs ingested) → hit the real edge: incremental-reingest PIPELINE is undesigned (ROADMAP confirms).
Set up the first real incremental cycle. Diff tables applied (block-by-block in Supabase — the 3 reingest_* tables:
snapshot 8/3, diff 16/4, summary 12/2 cols/idx; FK-drop confirmed in migration). BEFORE-snapshot taken:
snapshot_id 8c7244a1-adac-4e6a-b77a-f081d6e12618, ta=nsclc, 43,535 ranked HCPs (rising 25,672 / established 11,384 /
community 6,479; rank is PER-COHORT not global 1-N, so max_rank 25,752 ≠ count 43,535 — correct). Diff engine reads
hcp_score_ranks_v2 (per-TA), null_cohort=0 → column mapping correct.

WINDOW: ingest is config-driven (therapeutic_area_ingestion_config.pubmed_days_back, "days back from TODAY" — NOT
since-last-run). NSCLC was 3650 (10yr build window), max_results 100000. Last actual ingest = July 3 (23,390 pubs);
prior = May 21 (391,502). Both are BUILD batches — never an incremental pull. For a controlled first cycle, set
pubmed_days_back=3 (RESTORE TO 3650 after — still set to 3 right now, MUST restore). Dry-run: window 07/17-07/20, 36
PMIDs. Real ingest: 36 found, 3 skipped-existing (idempotent skip works), 33 INSERTED, 72 TA-tags, 0 failed. 33 new
NSCLC pubs now in publications_v2. ✅ Stage 1 done.

THE EDGE (the honest finding): tried to proceed to inventory build, caught self about to run the ARCHIVED
inventory_openalex_authors.py + skip a stage. Read the ROADMAP (the bible) instead of grep-guessing. §1 canonical
order = 13 stages (ingest→openalex_pipeline→inventory→StepC→career_enrich→ta_tag→stepB→reconcile→StepF→9b→
aggregators→dedup→career-rederive→cohort_class→scoring→narratives). §3b: the archived inventory script is
DELIBERATELY ABANDONED (would clobber cross-TA counts) → replaced by a SQL-native 2-stage method (verified AD July 3:
239,306→253,011). Runtime notes (~6h career enrich etc.) are FULL-BUILD numbers — at 33-pub incremental scale these
are seconds-minutes (Step C incremental already ran 52s not 1-2h).
CRITICAL: grep of ROADMAP for incremental/reingest → the incremental-REINGEST pipeline is NOT DOCUMENTED. "incremental"
appears only re: inventory build (§3b) and as a FUTURE wish ("the right long-term operation is incremental inventory
update — the script can't do that yet"). Confirms: an incremental-reingest SEQUENCE (which of the 13 stages run, at
what scope, in what order, for a weekly pub cycle) has never been built or written down. The ROADMAP is the full-BUILD
template; the incremental derivation is NET-NEW design. Proved the hardest STAGE (Step C incremental) today; the
incremental PIPELINE stringing all stages is unbuilt.

STATE: 33 pubs safely ingested (idempotent — they wait, don't degrade). before-snapshot captured. Everything upstream
proven. NEXT (design, not blind execution — same pattern as deriving incremental Step C from the full-build spec):
derive the incremental-reingest sequence from ROADMAP §1's full-build order — which stages, what scope (whole vs
affected-HCP-only), what order — DOCUMENT it as a new ROADMAP section, THEN run it against the 33 pubs stage-by-stage
with verification. Do NOT run 13 undesigned stages at 1am hoping (that's how the debt log's "ran out of sequence" bugs
happen). ALSO PENDING: restore pubmed_days_back 3→3650; commit create_hcps_v2 + backfill + reingest_diff + migration
(untracked/uncommitted); the FK-drop reply to Code on reingest_diff was applied (migration has plain uuid).

### 31t. ✅ GATE-C PASSED — new-fragment-of-existing-HCP routes via identity_hash (the Riely/Hirsch mechanism, now provably prevented).
The design-review (§31s) correctly flagged GATE-C as the biggest unproven risk: idempotency was proven for
no-new-data + genuinely-new-author, but NEVER for "a new OpenAlex fragment of an EXISTING HCP arrives" — the exact
mechanism that fragmented Riely/Hirsch this morning, and the whole reason the identity_hash backfill exists. This
test (the §31o attempt, previously aborted on null hashes — now backfilled) finally exercised it.

SETUP: Guohong Ge (fefcf11b, 2 shards, both "Guohong Ge" @ Jiangsu University ror/03jc41j30 — identical hash inputs,
so predicted clean PASS). Backups: ge_cyctest_links_backup, ge_cyctest_inv_backup. Un-linked the NON-primary shard
A5025394067 (deleted its hcp_openalex_authors_v2 link + reset inventory has_matching_hcp=false/matching_hcp_id=null)
= simulate "new fragment arrived." Verified: ge_links 2→1, shard floating, flag false. Baseline hcps_v2 = 282,427.

RESULT — PASS (the money line): incremental Step C →
  "Existing HCPs indexed by identity_hash: 242,195"  (was 13,590 this AM — BACKFILL IS LIVE in the idempotency layer)
  "Plan: 0 new HCP(s), 1 link(s) onto 1 existing HCP(s)."
  hcps_created 0, shard_links_added 1, inventory_backrefs_written 1 (the backref fix works too), errors 0.
Step C computed the floating shard's identity_hash (Guohong Ge|Jiangsu ROR) = 8caa63c0 = fefcf11b's stored hash →
MATCH → re-linked to the existing HCP instead of creating a duplicate. Verified: hcps_v2 still 282,427 (0 change),
fefcf11b back to 2 shards. THE SYSTEM SELF-HEALED — un-link a shard, Step C autonomously re-links it to the correct
existing HCP without being told which. The correct behavior WAS the restore (Ge already whole; backup tables droppable).

SIGNIFICANCE: this closes the loop of the entire day. This AM this scenario silently made a duplicate (→ Riely/Hirsch
fragmentation). Tonight it's provably caught at the source via backfilled identity_hash. Layer-2 idempotency is real
across the corpus (index 242,195) and DEMONSTRATED on the fragment case, not just asserted. GATE-C = the pattern-
blessing risk the review said mattered most for certifying the machinery for AD + future TAs. Passed.

STILL PENDING (next session — the stage walk): GATE-A (openalex enriched_at scope), GATE-B (inventory COUNT dry-run,
cross-TA-correct), GATE-D (flatten reads new authorships) — verify each before its stage per INCREMENTAL_REINGEST_
SEQUENCE.md. Then walk stages 2→10 + after-snapshot + diff on the 33 waiting pubs (before-snapshot 8c7244a1 captured).
Housekeeping: window restored to 3650 ✓. Cleanup: drop ge_cyctest_* backups (data self-healed). COMMIT PENDING:
create_hcps_v2, backfill_identity_hash, reingest_diff.py, migration (all untracked/uncommitted).

### 31u. GATE-B caught a real clobber (933 authors) → root-caused to pre-existing author_pub_flat/inventory DRIFT → GREATEST fix.
Walking the incremental cycle Stage 4 (§3b inventory upsert). Constructed the Stage-2 SQL from ROADMAP rules (spec not
literal SQL): corpus_pub_count = COUNT over FULL unfiltered author_pub_flat footprint; NSCLC filter ONLY in WHERE
author_id IN (SELECT ... source_ta_id=NSCLC) — decoupling scope from count to avoid clobber; ON CONFLICT DO UPDATE;
NOT touching has_matching_hcp/matching_hcp_id (rule 4); MODE() WITHIN GROUP for descriptive fields; HAVING >=3.
GATE-B dry-run (clobber check = count of existing authors whose recomputed count would DROP below stored): **933**.
STOPPED (did NOT write). This is exactly the silent-corruption case the review flagged; the gate caught it.

ROOT CAUSE (diagnosed, not papered over): the 933 drops are PRE-EXISTING drift between author_pub_flat and stored
inventory corpus_pub_count — NOT caused by our 33 new pubs (verified: 0 of the dropping KOLs appear in the new pubs).
Drop pattern = modest % drops on established/hepatology KOLs (Jänne 182→176, Felip 269→262, Tacke 319→314, Kono,
Kleiner, Karin). Mechanism: author_pub_flat (built July 3) slightly UNDER-represents the corpus the inventory counts
were built from — flat is a slightly-incomplete snapshot. Mirror also true: 2,665 authors have flat count HIGHER than
stored (drift both directions → flat & inventory built at different times from different corpus states).

FIX: for an INCREMENTAL cycle a count must NEVER drop. Changed ON CONFLICT to
corpus_pub_count = GREATEST(EXCLUDED.corpus_pub_count, openalex_author_inventory.corpus_pub_count)
(+ same GREATEST on last_seen_pub_year; first_seen NOT in DO UPDATE = keep original = correct). GREATEST is correct
BOTH directions: never lower (anti-clobber), raise when flat shows more (drift correction / genuine new pubs). Re-ran
clobber dry-run with GREATEST: clobber_after_greatest=0 ✓, legit_increases=2,665, new_inserts=431, authors_to_write=
99,074 (full NSCLC author set re-upsert = expected §3b behavior). GATE-B now PASSES.

⚠️ LATENT FOOTGUN FOR KNOWN_ISSUES: author_pub_flat and openalex_author_inventory.corpus_pub_count are NOT perfectly
consistent (drift both directions, established KOLs affected). A full --truncate inventory rebuild from the CURRENT
flat table would LOWER 933+ established authors' counts (silent KOL degradation). The §3b GREATEST-on-upsert protects
the incremental path, but a naive full rebuild does not. Either (a) rebuild author_pub_flat completely from
publications_v2 before any full inventory rebuild, or (b) always use GREATEST semantics. Document prominently.
NEXT: run the GREATEST INSERT (Stage 4), verify inventory grew by ~431, then Step C (Stage 5).

### 31v. Back-half walk: Step C 428 new HCPs (3 real fragment-catches) → discovered back-half needs scoping. Tooling built. Paused at ta_tagging validation.
Continued the first real incremental cycle past GATE-B (§31u). All corpus writes below are COMMITTED to DB.

STAGE 5 STEP C INCREMENTAL (real batch): 431 unlinked inventory authors → clustered (orcid 311, name_institution 120;
CN 187/US 53/JP 41 — recent NSCLC volume skews China). identity_hash index = 242,195 (backfill LIVE). Plan: **428 new
HCP(s), 3 link(s) onto 3 existing HCP(s)** — the 3 = REAL fragment-catches (new OpenAlex fragments of existing KOLs
routed to their existing HCP via identity_hash instead of duplicating; GATE-C mechanism on production data, ~0.7% of
batch). hcps_v2 282,427→282,855 (+428). shard_links_added 431, inventory_backrefs_written 431, provisional_new_hcps
428, errors 0. ingestion_run_id 5001edfd-7085-4e97-8f04-16b813bbd32a. WITHOUT the backfill these 3 would have become
duplicate HCPs — real fragmentation prevented on the first cycle.

DISCOVERY — the BACK HALF of the chain was built whole-corpus/whole-TA for the BUILD and needs scoping for incremental
(the front half — ingest→StepC — was already incremental-ready). Pattern found by walking:
  F2 (from §prior): ta_tagging WRONGLY DROPPED from our sequence → LOAD-BEARING. Step C does NOT tag TAs (428 new HCPs
     had 0 NSCLC tags); Step F scopes to TA-TAGGED HCPs → untagged new HCPs would be silently unlinked (zero-pub
     phantoms). ta_tagging MUST run Step C→ta_tagging→Step F. It's also a CONCEPT CLASSIFIER (37 NSCLC curated
     concepts) that decides WHICH of the 428 enter the scored set (shapes the diff). Re-inserted into sequence.
  F3: ta_tagging_rebuild_v2 does a WHOLE-CORPUS concept re-scan (~200K+ pubs, paginated 500/page) every run — untenable
     per-cycle. → scoping spec to Code.
  F4: dedup_detect does WHOLE-CORPUS scan. → scoping spec to Code.

TOOLING BUILT (by Code, offline both-modes proofs passed; NOT committed except where noted):
  - scoped dedup_detect.py: --ingestion-run-id / --candidate-hcp-ids-file. Relational name-block scoping (loads full
    hcps_v2 for blocking since key folds hyphens/diacritics in Python — a SQL surname filter would MISS variant-surname
    existing HCPs, e.g. Péron/Bronowicki; scopes only the giant publication_authors_v2 read). Both-modes proof covered
    the critical NEW-vs-EXISTING-KOL pair. [dedup_detect.py modified in tree, NOT committed — held for scoping batch]
  - scoped ta_tagging_rebuild_v2.py: --candidate-hcp-ids-file. Phase 2 (per-pub scoring) incremental, Phase 3 (HCP
    aggregation+tag decision) re-aggregates each affected HCP's FULL pub set. Both-modes proof covered the critical case
    (pre-existing HCP pushed OVER threshold by a new pub: 2/8=0.25 untagged → 3/9=0.33 tagged, identical full vs scoped).
    [being crash-fixed by Code overnight — NOT committed]
  - compute_affected_hcps.py (scripts/utilities, COMMITTED): affected set = new HCPs (by run_id) UNION existing authors
    of batch pubs. CRITICAL: group B derived via authorships JSON → hcp_openalex_authors_v2, NOT publication_authors_v2
    (empty pre-Step-F — sequencing trap). Guards: group A ⊆ union, no dangling ids, refuses A-only unless
    --allow-no-batch-pubs. RAN: affected.txt = 496 (A=428, B=68 pre-existing co-authors, 213 OA author ids, 0 dangling).

STAGE 6 ta_tagging validation ATTEMPTED: scoped run fast (good). FULL whole-corpus baseline run CRASHED mid-scan
(~offset 213K, PowerShell "NativeCommandError"; output UTF-16 + httpx log noise, unreadable). So scoped ta_tagging NOT
yet blessed on real data (offline proof only). → Code overnight: diagnose+fix crash (memory? bad concepts row? conn
drop?), quiet httpx logging to WARNING, emit machine-diffable per-HCP tag decisions, prove both-modes on real data.
Also queued: SCOUT stage-9b (authorship-position derivation script/SQL — the one unmapped stage).

BACK-HALF SCORECARD (all scripts confirmed on disk; ROADMAP "network/pharma ✗ PENDING" is STALE — both exist):
  ta_tagging ⏳(Code) · Step F ✅ --hcp-ids-file(R3: ALL NSCLC not --only-new) · 9b ❓unmapped(Code scouting) ·
  dedup ✅(Code scoped) · career ✅NATIVE incremental(--hcp-ids-file/--only-changed-today) · cohort ⚠️--ta whole-TA(OK) ·
  scoring ⚠️--ta whole-TA(OK): rising=scoring_pipeline.py; established=publication_leadership→network_centrality→
  pharma_engagement→recompute_established_ranks_v3 (--w-scientific 0.75 --w-network 0.25 --w-pharma 0.0 → pharma
  irrelevant to rank). The 428 are predominantly RISING-cohort → this cycle's diff is rising-driven (advisor's #1 signal).

PAUSED — clean & safe (428 committed, nothing half-written, window restored 3650). Next (fresh, next step is a WRITE):
tagging validation decision → ta_tagging --execute → Step F(--hcp-ids-file ALL NSCLC, exported AFTER tagging) → 9b →
scoped dedup(review→merge) → career re-derive(after dedup, R1) → cohort_classification --ta nsclc → scoring → AFTER-
snapshot + reingest_diff --diff --before 8c7244a1... = THE FIRST REAL DIFF.
COMMITTED tonight: create_hcps_v2, backfill_identity_hash, reingest_diff, compute_affected_hcps, reingest_diff migration,
INCREMENTAL_REINGEST_SEQUENCE.md. NOT pushed (3 ahead, PostHog frontend review pending). NOT committed: scoped
ta_tagging+dedup (finalize in AM), frontend/vite files.
