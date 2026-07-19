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
