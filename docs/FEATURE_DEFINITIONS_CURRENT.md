# FieldMark — Current Feature Definitions (ground-truth for marketing copy)

**Generated:** 2026-07-18 · **Branch:** `ad-frontend-established` · **Method:** read-only code + live-DB
introspection. Verbatim UI strings and `file:line` refs are extracted from the source; the rising-model
computation facts (tables/columns/archetype values) were verified directly against the live database.

> **Confidence note.** Quoted strings and line numbers are source-extracted (cross-checked where practical).
> The scoring/model computations (which table, which columns, archetype values, the AD-vs-NSCLC split) I
> verified myself against the live DB. Where a label contradicts the computation, it's flagged in §4 of each
> feature.

## Freshness — last-commit date of each feature's main component

| File | Last commit |
|---|---|
| `frontend/src/lib/api.ts` (all mappers/RPCs) | 2026-07-17 |
| `frontend/src/lib/home.ts` (follow-ups, coverage) | 2026-07-17 |
| `frontend/src/components/Telescope.tsx` / `TelescopeDrawer.tsx` | 2026-07-14 |
| `frontend/src/components/InstitutionRoute.tsx` / `InstitutionsInTerritoryPanel.tsx` | 2026-07-14 |
| `frontend/src/components/CommunityExplorer.tsx` | 2026-07-14 |
| `frontend/src/components/HCPCard.tsx` / `lib/types.ts` | 2026-07-13 |
| `frontend/src/components/ScoreBreakdownV3Rising.tsx` | 2026-07-12 |
| `frontend/src/components/ScientificNarrativeSection.tsx` | 2026-07-12 |
| `frontend/src/components/DetailScreen.tsx` | 2026-07-10 |
| `frontend/src/components/RisingVoicesChart.tsx` | 2026-06-30 |
| `frontend/src/components/MiniCollaboratorNetwork.tsx` | 2026-06-24 |
| `frontend/src/components/BeliefClaimReactionPanel.tsx` | 2026-06-22 |
| `frontend/src/components/BriefPage/BriefPage.tsx` | 2026-06-12 |
| `frontend/src/components/aiOverviews.ts` (`lib/aiOverviews.ts`) | 2026-06-11 |
| `frontend/src/components/FollowUpsPage/FollowUpsPage.tsx` | 2026-06-10 |
| `frontend/src/components/ResearchThemesSection.tsx` | 2026-06-03 |
| `frontend/src/components/TelescopeLegend.tsx` | 2026-06-01 |
| `frontend/src/components/ScoringExplainedModal.tsx` | **2026-05-12** (oldest — see Feature A gaps) |

---

## ⚠️ Cross-cutting finding: the Rising model is split by TA (read this before writing any "Rising" copy)

There are **two live rising-star models**, selected by therapeutic area:

- **Atopic Dermatitis (the newest TA):** the **2-axis Emergence/Network composite**. Table
  `hcp_rising_composite_v1` (columns `rising_composite_score`, `emergence_pctile`, `network_influence_pctile`
  — **no `archetype` column**). Score = **Emergence 75% + Network Influence 25%**. 5,719 AD rows; AD has
  **zero** rows in the legacy table.
- **NSCLC (and every other TA):** the **legacy Momentum/Visibility model with archetypes**. Table
  `hcp_rising_star_ranks_v3` (`momentum_component`, `visibility_component`, plus scientific/network
  sub-percentiles, and **`archetype` still populated**). Current archetype values in the data: `Emerging Leader`
  (1,371), `Scientific Accelerator` (80), `Balanced Rising Star` (71), `Network Accelerator` (59). **"Dark
  Horse" is NOT among them** — the archetype value is gone from the data, but Dark Horse *copy* survives in the
  UI (see Feature A §4).

**Net for your memory:** "migrated to 2-axis emergence/network, archetype retired, Dark Horse dropped" is TRUE
**for AD only**. NSCLC still runs the older momentum/visibility model and still emits archetypes. Any public copy
should describe the AD/composite model as current and treat momentum/visibility/archetype/Dark Horse as legacy or
NSCLC-specific — and note the UI has not fully caught up (stale strings below).

---

# A. RISING / EMERGENCE SCORING

### 1. SURFACE
- Feed card: `frontend/src/components/HCPCard.tsx`
- Detail right-rail breakdown: `frontend/src/components/ScoreBreakdownV3Rising.tsx` (hosted by `DetailScreen.tsx`)
- KPI tile primitive: `frontend/src/components/ScoreKpiTile.tsx`; feed pill tooltips: `StatPillWithTooltip.tsx`
- Methodology modal: `frontend/src/components/ScoringExplainedModal.tsx`
- Mappers/RPC routing: `frontend/src/lib/api.ts` (`getRisingStars`, `getRisingStarScoreBreakdown`)
- **Naming-collision cousin (NOT this score):** `frontend/src/components/RisingVoicesChart.tsx` — a social
  engagement scatter, unrelated to the scientific rising score.

### 2. USER-FACING COPY (verbatim)

**Composite (AD) — detail breakdown (`ScoreBreakdownV3Rising.tsx`):**
- Header: `"Rising Star Score"` · denominator `"/ 100"` · rank subtext `Rank {n} Global`
- Empty: `"No Rising Star score available for this HCP in this therapeutic area."`
- Tile `"Emergence"`, tooltip: `"Who is establishing themselves scientifically? Recent (2021-2025) AD publication trajectory — output (45%), senior/first authorship (35%), citations per paper (20%) — ranked within the rising cohort."`
- Tile `"Network Influence"`, tooltip: `"How connected are they? Position in the AD collaboration graph."`
- Weighting footnote: `"Emergence 75% · Network 25%"`

**Composite (AD) — feed card (`HCPCard.tsx`):** tiles `"EMERGENCE"` and `"NETWORK INFLUENCE"` (same tooltip text as above).

**Legacy (NSCLC) — detail breakdown (`ScoreBreakdownV3Rising.tsx`):**
- Header `"Rising Star Score"` · rank `Rank {us_rank} US · Rank {rank} Global`
- Tile `"Scientific Momentum"`: `"Change in publication output between 2016-2020 and 2021-2025: senior-author paper count, citation volume, and senior-author share."`
- Tile `"Network Momentum"`: `"Change in co-authorship network centrality between 2016-2020 and 2021-2025: eigenvector, degree, and betweenness."`
- Tile `"Scientific Visibility"`: `"Current publication footprint in the recent 5-year window: total publications and citation rate."`
- Tile `"Network Visibility"`: `"Current co-authorship centrality for this therapeutic area in the recent 5-year window."`
- Footnote: `"Momentum ({momentum_component}) blends scientific and network trajectory. Visibility ({visibility_component}) reflects current publication and collaboration footprint."`
- Archetype short badges: `"BALANCED"`, `"SCIENCE"`, `"NETWORK"`

**Feed card (`HCPCard.tsx`), legacy:** tiles `"SCIENTIFIC MOMENTUM"`, `"NETWORK MOMENTUM"`, `"SCIENTIFIC VISIBILITY"`, `"NETWORK VISIBILITY"`; archetype pill labels `"BALANCED"/"SCIENCE"/"NETWORK"/"RISING STAR"`; stat-pill column label `"ARCHETYPE"`; Dark Horse badge `♞` + `"Dark Horse"`; industry badge `"Industry"` (title `"Industry-affiliated author"`); rank line `#{rank} {US|GLOBAL}`.
- **FieldMark Score tooltip on the card score badge:** title `"FieldMark Score"`, body: `"Composite of Momentum (70%, change in scientific output and network position over the last 5 years) and Visibility (30%, current publication and collaboration footprint). Normalized 0-100 within the Rising Star cohort."`

**Methodology modal (`ScoringExplainedModal.tsx`):**
- `"Rising Stars"` / `"Emerging voices building momentum"`
- `"Rising Stars are identified by a composite scoring pipeline that evaluates publication velocity, citation trajectory, clinical trial activity, conference presence, and MSL signals. HCPs in the top tier of this composite are classified Rising Stars."`
- `"DARK HORSE subset:"` / `"Rising Stars in the top 5% of composite score, with positive publication velocity OR trial investigator signal. These are the elite emerging voices most likely to break through to Established status."`
- `"Note: Some scoring components (citation trajectory, congress presence, MSL signal) are sparsely populated in v1.0 — Dark Horse identification relies primarily on publication velocity and trial activity. Coverage will improve in v1.1."`
- FAQ: `"...Rising Stars are emerging voices whose recent acceleration in publication velocity, citation trajectory, or trial investigator activity suggests they're on a trajectory toward Established status. Established describes a current state. Rising Stars describes momentum."`

### 3. WHAT IT ACTUALLY COMPUTES
- **AD:** `getRisingStars` → RPC `get_rising_composite_filtered` → table `hcp_rising_composite_v1`
  (`rising_composite_score`, `emergence_pctile`, `network_influence_pctile`). Populated by
  `scripts/score/rising_composite_scoring.py`: `composite = 0.75 * emergence_pctile + 0.25 * network_pctile`
  (network reweighted out when absent). Emergence subscore from `scripts/score/emergence_scoring.py` = 45% recent
  publication volume + 35% recent senior/first-authorship share + 20% recent citations-per-paper, percentiled
  **within the rising cohort only**; network from `hcp_network_centrality_v2` (`window_type='10yr'`).
- **NSCLC/others:** RPC `get_rising_star_filtered` → `hcp_rising_star_ranks_v3` (`momentum_component`,
  `visibility_component`, scientific/network momentum & visibility percentiles, `archetype`), frozen model
  `scripts/score/rising_star_scoring.py`.

### 4. LABEL ⇄ COMPUTATION GAP (several — this feature is the most stale)
1. **Card "FieldMark Score" tooltip is wrong for AD.** It always says `"Composite of Momentum (70%…) and
   Visibility (30%…)"` for every rising HCP — but AD's actual score is `0.75*Emergence + 0.25*Network`. The
   70/30 Momentum/Visibility construct is the retired model.
2. **Weight contradiction between two AD surfaces:** the detail footnote says `"Emergence 75% · Network 25%"`
   (correct, matches the Python) while the card tooltip says `70% / 30%`. Both cannot be right.
3. **Archetype / "Dark Horse" copy is stale for AD.** The AD/composite path emits no archetype (`archetype: ""`),
   yet the methodology modal still describes a live `"DARK HORSE subset:"`, and the card still ships the `♞
   "Dark Horse"` badge + `"ARCHETYPE"` pills (`"BALANCED"/"SCIENCE"/"NETWORK"`). At the data layer "Dark Horse"
   is gone from **every** TA. The card guards archetype with `rising_model !== "composite"`, but the **modal does
   not** — an AD reader sees Dark Horse described as current.
4. **Modal lists signals not in the live formula:** `"publication velocity, citation trajectory, clinical trial
   activity, conference presence, and MSL signals"` — the actual composite is only Emergence + Network Influence;
   trials, congress, and MSL signals do not feed it. (Modal file is the oldest, last touched 2026-05-12.)
5. **Naming collision:** `"Rising Voices — Last 30 days"` (`RisingVoicesChart.tsx`, a social/Twitter engagement
   scatter fed by `mv_social_voice_emergence_by_ta`) shares "Rising"/"emergence" vocabulary but is a different
   construct.

### 5. PUBLIC-SAFETY NOTE
Tooltips are phrased as capabilities ("Who is establishing themselves scientifically?", "How connected are
they?"), not as tracking of a person. But every score/rank/archetype renders attached to a **named physician**.
The methodology modal frames removal: `"HCPs can request removal from the platform by emailing
optout@besselanalytics.com"` and `"Industry-affiliated HCPs are excluded"`. No individual is named inside the
strings themselves.

---

# B. SCIENTIFIC NARRATIVE / "BELIEF PROFILE"

### 1. SURFACE
- `frontend/src/components/ScientificNarrativeSection.tsx` (detail screen, in `<div id="belief-profile">`)
- Reaction panel: `frontend/src/components/BeliefClaimReactionPanel.tsx`; question data `data/beliefClaimQuestions.ts`
- A **separate** per-cohort narrative ("Signal Summary" / "Why this expert") also lives on the detail screen
  (`DetailScreen.tsx`), fed by a different table/pipeline (below).

### 2. USER-FACING COPY (verbatim)
- Heading: **`"Belief Profile"`**
- Corpus badges: `"Deep Corpus"`, `"Focused Corpus"`, `"Emerging Signal"`, fallback `"Corpus"`
- Subsection labels: `"Strongly Advocates"`, `"Frequently Raises"`, `"Research Focus"`
- Confidence tooltip: `Confidence: {n} of 5` · paper chip: `Supported by {n} publications` · `"View sources"`
- Footer counters: `{n} papers`, `{n} positions`
- Reaction panel: `What {n} MSLs are saying about this position` · empty `"No reactions yet on this position. Your read would be the first."` · `"Submit reactions"`
- Reaction prompts (`beliefClaimQuestions.ts`): `"What's your field read on this position?"` (`Accelerating`/`Holding steady`/`Fading`/`Not encountered`); `"Where is this position resonating?"` (`Primarily academic centers`/`Reaching community oncology`/`Both`/`Neither`); `"What behavior change opportunity does this position present?"` (`Building awareness (pre-adoption phase)`/`Driving adoption (evidence exists, uptake lagging)`/`Reinforcing practice (established, maintenance phase)`/`Limited opportunity (too narrow or too early)`)
- Separate cohort narrative (`DetailScreen.tsx`): headers `"Why this expert"`/`"Why this practitioner"`/`"Why rising star"`, `"Signal Summary"`, `"Signal"`, `"Why Now"`, `"Engagement Angle"`, `"Caution"`; empty `"Narrative generating — check back soon."`; `"Unclassified — this HCP is in our database but hasn't met cohort criteria. Available data shown below."`

### 3. WHAT IT ACTUALLY COMPUTES
- **"Belief Profile"** reads a pre-generated JSON from `hcp_ai_overviews` where `synthesis_type =
  "scientific_positions"`, produced offline by `scripts/narrative/generate_scientific_position_synthesis.py`
  (model **`claude-sonnet-4-6`**, `max_tokens=4000`), which reads extracted positions from
  `hcp_scientific_positions_v1` (joined to `publications_v2`) and buckets them into
  strongly_advocates/frequently_raises/research_focus. Corpus depth is a paper-count threshold (deep ≥5, focused
  ≥3). Confidence is a **model-self-assigned** 0.50–0.98 score; evidence counts are LLM-produced.
- **Belief-claim reactions** are NOT AI: MSL crowd reactions in `msl_belief_claim_reactions`, keyed by `hcp_id`
  + a SHA-256 `claim_key`.
- **Separate cohort narrative** (`why_now`, `engagement_angle`, `signal_strength`, `caution_flags`) from
  `hcp_narratives_v2`, generated by `scripts/narrative/generate_narratives_v2.py` (model `claude-sonnet-4-6`,
  temp 0.1), cohort-specific prompts.

### 4. LABEL ⇄ COMPUTATION GAP
- **The UI heading `"Belief Profile"` overclaims the data.** The store, type, and generator all call it
  **"scientific positions"** (`synthesis_type="scientific_positions"`, `hcp_scientific_positions_v1`), and the
  generation prompt explicitly *forbids* belief language — it requires grounded phrasing like `"the
  investigator's published record advances"`, `not "believes" or "advocates for" without evidence`. So the UI
  escalates evidence-grounded published *positions* into the stronger word **"Belief."** The reaction panel
  compounds this by calling each synthesized theme a `"position"` the doctor holds.
- The 5-bar **confidence meter** presents a model-self-rated score as if it were a measured statistic.

### 5. PUBLIC-SAFETY NOTE — **HIGHEST SENSITIVITY.**
This renders a synthesized scientific-stance profile of a **named real physician** under the literal heading
**"Belief Profile,"** then invites reps to crowd-rate that named doctor's "positions" and to pick a `"behavior
change opportunity"` (`"Building awareness (pre-adoption)"`, `"Driving adoption"`). The parallel
`hcp_narratives_v2` pipeline attaches per-named-HCP `caution_flags` and an `engagement_angle`. **Do not echo
"Belief Profile" or the behavior-change framing in public copy** — describe the capability as evidence-grounded
synthesis of a researcher's *published* positions, not their beliefs.

---

# C. AI SYNTHESIS

### 1. SURFACE
- `frontend/src/components/HomePage/CoverageGapsTile.tsx` (the blurb on each coverage-gap HCP row)
- Helper `frontend/src/lib/aiOverviews.ts` (`getHcpOverview`); Edge Function `supabase/functions/generate-hcp-synthesis/index.ts`
- Distinct from Feature B, though both persist to `hcp_ai_overviews` (this uses `synthesis_type = "overview"`).

### 2. USER-FACING COPY (verbatim)
- Badge: `"AI Synthesis"` (next to a ✨ sparkle), shown on the coverage-gap row.
- Body text is model output (three sentences); **no visible disclaimer, "AI-generated," "may be inaccurate," or
  methodology tooltip** on this surface — only the badge.

### 3. WHAT IT ACTUALLY COMPUTES
`getHcpOverview` serves a cached `hcp_ai_overviews` row (`synthesis_type="overview"`); on miss, POSTs to
`generate-hcp-synthesis`, which reads the `hcps_v2` row + up to 10 `hcp_research_themes_v2` rows and calls
**`claude-sonnet-4-6`** (`max_tokens: 250`) to write "exactly 3 sentences." Cached back with
`model_used: "claude-sonnet-4-6"`.

### 4. LABEL ⇄ COMPUTATION GAP
- Blurb is generated from theme metadata only (name/centrality/paper_count) — it does **not** read the
  publications themselves — yet is instructed to sound `"Clinical, factual, confident"` and is shown with no
  confidence qualifier.
- If an HCP has zero themes, the function errors (`"Insufficient research themes to generate synthesis"`) and the
  tile silently renders nothing — absence is invisible.

### 5. PUBLIC-SAFETY NOTE
The Edge Function prompt is explicit targeting framing for a named HCP: `"...a 3-sentence scientific identity
synthesis for an MSL … who has not yet engaged with this HCP. The MSL is browsing a list of potential
investigators to track. Your synthesis is the hook that helps them decide whether this HCP is worth their
attention."` — sentence 3 must answer "What would the MSL … gain from tracking them?" **Avoid "track / worth
their attention / gain from tracking" verbs in public copy.**

---

# D. RESEARCH THEMES

### 1. SURFACE
- `frontend/src/components/ResearchThemesSection.tsx` (detail), with `ResearchThemeChip.tsx` and
  `ThemeReactionPanel.tsx`
- Institution variant: `frontend/src/components/InstitutionResearchThemesPanel.tsx`
- Question copy: `frontend/src/data/mockThemeQuestions.ts`

### 2. USER-FACING COPY (verbatim)
- Section header `"Research Themes"` · loading `"Loading themes..."`
- Empty: `"Publication-derived themes are surfaced for actively-publishing researchers. This HCP's profile emphasizes field-derived signals (see Field Intelligence below)."`
- Footer: `"Reactions shape the community read on this work — your contribution stays private to you."`
- Toast: `"Thanks for your reaction — aggregate updated"`
- Reaction panel: `{n} papers in this theme`, `What {n} MSLs are saying about this theme`, `"Submit reactions"`
- Questions (`mockThemeQuestions.ts`): `"What's your field read on this theme?"` (`Accelerating`/`Holding steady`/`Fading`/`Not encountered`); `"Where is this resonating?"` (`Primarily academic centers`/`Reaching community oncology`/`Both`/`Neither`); `"What behavior change opportunity does this theme present?"` (`Building awareness (pre-adoption phase)`/`Driving adoption (evidence exists, uptake lagging)`/`Reinforcing practice (established, maintenance phase)`/`Limited opportunity (too narrow or too early)`)
- Institution panel: `"Top Research Themes"` · `Most-published {TA|NSCLC} topics at {institution}` · empty `"No research themes available yet."`

### 3. WHAT IT ACTUALLY COMPUTES
Theme chips read directly from `hcp_research_themes_v2` (`theme_name`, `paper_count`, `centrality`,
`display_rank`, `example_pmids`) via `fetchHcpThemes`, generated by an offline extraction pipeline. **The
reaction panel is entirely mock/local:** questions are a static array (`mockThemeQuestions.ts`), aggregates come
from `getMockAggregateForTheme`, and "submit" only mutates local React state — **nothing persists to the
backend.** (The theme *filter* used by AD rising is real: `get_rising_composite_filtered` joins
`hcp_research_themes_v2` → `theme_to_canonical_v1` where `centrality IN ('core','supporting')`.)

### 4. LABEL ⇄ COMPUTATION GAP
- **`"What N MSLs are saying about this theme"` implies real crowd data that does not exist** — the count and
  the `"aggregate updated"` toast reflect mock, non-persisted local state. `"Reactions shape the community
  read"` overclaims persistence (reactions are discarded on unmount).
- Institution panel hardcodes `"NSCLC"` as the default TA label — mislabels themes for AD when the TA name is
  absent.
- Option `"Reaching community oncology"` is oncology-specific but renders for every TA including AD.

### 5. PUBLIC-SAFETY NOTE
Themes are per-`hcp_id` (attached to a named physician), and the reaction panel invites MSLs to editorialize
about a named HCP's body of work. The privacy line protects the *reactor*, not the profiled physician. Themes
themselves are publication-derived professional topics (defensible); the mock crowd-reaction layer is the
overclaim, not a safety issue per se.

---

# E. TOP COLLABORATORS

### 1. SURFACE
- `frontend/src/components/MiniCollaboratorNetwork.tsx`, rendered on the HCP detail right rail
  (`DetailScreen.tsx`) for Established and Rising cohorts, plus an "External Collaborators" variant for Rising.
  Detail-screen only (no feed variant).

### 2. USER-FACING COPY (verbatim)
- `"Top Collaborators"` · `"External Collaborators"` · sub `"Top co-authors at other institutions"`
- External empty: `"All top collaborators are at the same institution. This HCP's publication network is concentrated within their home institution."`
- Per-collaborator badge `RS {score}` / `EST {score}`; count `{n} co-authored papers`

### 3. WHAT IT ACTUALLY COMPUTES
Reads `hcp_top_collaborators_v2` (`rank`, `collaborator_hcp_id`, `shared_publications`, by `hcp_id` +
`therapeutic_area_id`, limit 10), joins names/institutions from `hcps_v2`, and badges each collaborator with a
score from `hcp_established_ranks_v3.cohort_score` or `hcp_rising_composite_v1.rising_composite_score`. "External"
= collaborator's `institution_canonical` differs from the source HCP's. `{n} co-authored papers` = stored
`shared_publications`.

### 4. LABEL ⇄ COMPUTATION GAP
- Widget shows only top **5** though the query fetches 10 — "Top" is a truncated top-5.
- Badge score comes from a different table than the collaboration ranking; collaborators with no score row show
  no badge. No as-of date on the shared-publication counts.

### 5. PUBLIC-SAFETY NOTE
Displays the real co-authorship network of a named physician (other named physicians, institutions, paper
counts, drill-down to co-authored papers). Co-authorship is public bibliometric data; presentation is
professional attribution, but it is relationship-graph mapping of named individuals within an MSL engagement
context. No surveillance verbs in this component's own strings.

---

# F. INSTITUTION INTELLIGENCE

### 1. SURFACE
`InstitutionRoute.tsx` (detail), `InstitutionsIndexRoute.tsx` (index), `InstitutionsInTerritoryPanel.tsx`
(home/feed rail), and panels `InstitutionCollaborationsPanel.tsx`, `InstitutionExternalPartnersPanel.tsx`,
`InstitutionResearchThemesPanel.tsx`.

### 2. USER-FACING COPY (verbatim)
- Detail: `"Institution not found"`, `"← Home"`, sub-line fragments `"investigators"` / `"Rising Star"` /
  `"Established"`, `"Top investigator:"`, `"Rising Star Pipeline"`, pipeline buckets `"90+"`/`"80-89"`/`"70-79"`/`"<70"`
- Leaderboards: `"Top Rising Stars"`, `"Top Established"`, `"Most Connected"` / `"Highest network position"`,
  `"Highest Network Momentum"` / `"Fastest-growing collaboration networks"`
- Index: `{TA} Institutions`, `{n} institutions with {TA} investigators`, `"Search institutions..."`, `"Sort by"`
  with options `"Rising Stars"`/`"Established"`/`"Total Investigators"`/`"Talent Density"`/`"Yield Ratio"`/`"Name
  (A-Z)"`, empty `"No institutions match your search."`, `"Pin institution"`/`"Unpin institution"`
- Territory rail: `"Institutions in your territory"` / `"Top institutions"`, `"View all →"`, suffixes `"RS"` / `"Est"` / `"Top:"`
- Panels: `"Top Internal Collaborations"` / `"Investigator pairs ranked by shared publications"` (`"papers"`);
  `"Top External Partner Institutions"` / `Ranked by total co-publications with {institution}` (`"co-pubs"`);
  `"Top Research Themes"` / `Most-published {TA|NSCLC} topics at {institution}`

### 3. WHAT IT ACTUALLY COMPUTES
No dedicated institution RPCs — computed client-side in `api.ts` / `institutionThemes.ts` over base tables:
members from `hcps_v2` (by `institution_canonical`/`institution_normalized`), ranks from
`hcp_established_ranks_v3` + rising tables; "Most Connected" from `hcp_network_centrality_v2.degree_percentile`
(fallback `network_visibility_percentile`); "Highest Network Momentum" from
`hcp_rising_star_ranks_v3.network_momentum_percentile`; collaborations/partners from `hcp_top_collaborators_v2`;
themes from `hcp_research_themes_v2`; index metrics `talent_density_pct = rs/investigators*100` and `yield_ratio
= rs/est` (guarded by minimum counts) over `institution_investigator_counts`.

### 4. LABEL ⇄ COMPUTATION GAP
- `"Highest Network Momentum" / "Fastest-growing collaboration networks"` — value is a static
  `network_momentum_percentile` snapshot, not a measured growth rate; "fastest-growing" implies a temporal
  derivative not computed.
- `"Most Connected"` silently falls back from `degree_percentile` to `network_visibility_percentile` (a
  different metric) when centrality rows are missing.
- Themes panel default TA label is hardcoded `"NSCLC"`.

### 5. PUBLIC-SAFETY NOTE
No surveillance-of-individual framing. Copy is aggregate research capability (collaborations, co-pubs, themes);
named physicians appear only as publication-derived attribution (`"Top investigator:"`, `"Top pair:"`).
**Institution intelligence is the safest surface for public copy.**

---

# G. ENGAGEMENT BRIEFS & FOLLOW-UPS

### 1. SURFACE
- Brief (`/hcp/:hcpId/brief`): `BriefPage/BriefPage.tsx` + `BriefHeader.tsx`, `MeetingReadinessBanner.tsx`,
  `RelationshipSnapshot.tsx`, `ScientificSnapshot.tsx`, `NetworkAndInstitution.tsx`, `StrategicOpportunities.tsx`,
  `OpportunityCard.tsx`
- Follow-Ups page: `FollowUpsPage/*`
- Inline relationship section on detail: `RelationshipSection/*`

### 2. USER-FACING COPY (verbatim)
- Brief loading: `"Pulling intelligence... synthesizing opportunities..."` · error `"Couldn't generate brief"` / `"Retry"`
- Kicker: `"PRE-MEETING BRIEF"` (with relationship) or `"FIELDMARK PROFILE"` (without); chips `Score {n}`, `#{n} US`, `Generated {relative}`
- Readiness banner states: `"Follow-up Outstanding"` (`{n} overdue actions`), `"Ready"` (`"All commitments on track"` / `"All clear"`), `"Needs Attention"` (`"Open follow-ups, no recent insights"` / `"Cold relationship - no recent activity"`)
- Snapshot sub-headers: `OPEN FOLLOW-UPS ({n})` (empty `"No open follow-ups."`), `RECENT INSIGHTS ({n})` (empty `"No insights recorded."`); `"No recent publications indexed."`; `"TOP COLLABORATORS"` / `"No frequent collaborators identified."`; `Affiliated with {institution}`
- AI section: `"STRATEGIC ENGAGEMENT OPPORTUNITIES"` · disclaimer/attribution **`"Generated by Claude"`** · failure `"Strategic Engagement Opportunities unavailable. Please try again."`
- Opportunity card: `"HIGH PRIORITY"`/`"MEDIUM PRIORITY"`/`"LOW PRIORITY"`, `"Based on:"`, `"Save as Follow-Up"` (`"Saving..."`), `Saved · Due {date}`
- Collapsible section titles: `"Relationship Context"`, `"Scientific Activity"`, `"Network & Institution"`
- Follow-Ups page: buckets `"Overdue"`/`"This Week"`/`"Future"`/`"No Due Date"`/`"Completed"`; hero `Open Follow-Up(s)`, chips `overdue`/`due this week`/`future`/`no due date`, `Completed: {n} this month`, `{n}% completion rate (30d)`, `{n}-day median close`; filters `"Status"` (`Open`/`Completed`), `"Priority"` (`All`/`High`/`Normal`/`Low`), `"Source"` (`All`/`From Brief`/`Manual`); empty `"You're all caught up."` / `"Follow-ups appear here when you create them from HCP pages or save AI recommendations from Briefs."`
- Follow-up row: `"From Brief"`, `Generated {relative}`, buttons `"Complete"`/`"Snooze"`/`"View HCP"`/`"View Source Brief"`/`"Generate Brief"`; snooze `"Tomorrow"`/`"Next Week"`/`"30 Days"`/`"Custom"`/`"Cancel"`
- Inline composer (`FollowUpsList.tsx`): placeholder `"Add a follow-up..."`, `"Due date"`, `"Save"`, `"Mark Complete"`, `"Delete"`, confirm `"Delete this follow-up?"`

### 3. WHAT IT ACTUALLY COMPUTES
The brief is `supabase/functions/generate-brief/index.ts`, model **`claude-sonnet-4-6`** (`max_tokens 2000`) —
UI labels it `"Generated by Claude"`. **Only the "Strategic Engagement Opportunities" are LLM-generated;** the
header/snapshots are deterministic DB reads from `hcps_v2`, `hcp_rising_star_ranks_v3`, `hcp_established_ranks_v3`,
`msl_hcp_relationships`, `hcp_research_themes_v2`, `publications_v2`, `hcp_top_collaborators_v2`, `msl_profiles`,
plus the MSL's own `msl_hcp_notes` and `msl_hcp_next_actions`. Cached in `msl_hcp_briefs`, 24h TTL. Follow-ups are
a plain table `msl_hcp_next_actions` (via `msl_hcp_relationships`); bucketing and all stats
(completion_rate_30d, median_close_days_30d) are computed **client-side in JS** (`home.ts`). Brief → follow-up
sets `created_from: "brief"` with due date auto-derived from AI priority (high +7d, medium +14d, low +30d).

### 4. LABEL ⇄ COMPUTATION GAP
- **`"PRE-MEETING BRIEF"` and `"Meeting Readiness"` overclaim** — there is no meeting/calendar entity anywhere;
  the kicker shows whenever a relationship exists, and "readiness" is derived only from overdue-follow-up counts
  and whether an insight occurred in the last 30 days. A tracked HCP with no scheduled meeting still sees
  "PRE-MEETING BRIEF."
- `"completion rate (30d)"` is completed-in-30d ÷ created-in-30d (a cohort-mismatch ratio), denominator not disclosed.
- `Generated {relative}` on brief-sourced follow-up rows uses the row's save time, not the brief's generation time.

### 5. PUBLIC-SAFETY NOTE — **HIGH SENSITIVITY.**
The brief is an AI strategic dossier headed by a **real physician's name** + institution + archetype + score +
`#{rank} US`. The generate-brief system prompt casts it as engagement intelligence: `"...who is preparing to
engage with Dr. {name} ({institution}, {archetype} in {specialty})."`, with categories including `"Relationship
Hygiene"` and `"Strategic Positioning"`, and aggregates the MSL's private recorded observations
(`"INSIGHTS RECORDED BY {user}"`, `"OPEN FOLLOW-UPS (commitments {user} has made)"`) plus named `"TOP
COLLABORATORS"`. Guardrails exist in the prompt (`"DO NOT: Invent observations… Recommend specific products,
dosages, or clinical actions… Reference any data not present in the inputs"`), and the UI carries `"Generated by
Claude"` — **but there is no visible AI-limitations, accuracy, or confidentiality/"internal use only" disclaimer
on the brief itself.** Treat as a named-individual engagement profile; don't reproduce the dossier framing in
public copy.

---

# H. TELESCOPE

### 1. SURFACE
`frontend/src/components/Telescope.tsx` (force-graph), `TelescopeDrawer.tsx` (node drawer), `TelescopeLegend.tsx`
(legend), and the descriptive paragraphs live in `frontend/src/App.tsx` (Telescope block ~lines 820–908).

### 2. USER-FACING COPY (verbatim — the two full paragraphs)

**AD version (`App.tsx`):**
> "Telescope maps the network of HCPs driving clinical and scientific progress in atopic dermatitis. Each star
> represents a researcher; the lines between them reflect publication collaboration, weighted by shared work. The
> brightest stars at the center are the field's most recognized KOLs, while the smaller purple stars surrounding
> them are emerging investigators connected to that core. The brightest purple stars represent the top 100 rising
> stars in atopic dermatitis — the researchers most likely to become tomorrow's KOLs. Move your cursor to magnify
> the nearest star and reveal its identity; click any star to view that researcher's profile and closest
> collaborators. Together, this view surfaces both the established research community and the next generation
> working alongside it."

**NSCLC version (`App.tsx`):**
> "Telescope maps the network of HCPs driving clinical and scientific progress in non-small cell lung cancer.
> Each star represents a US-based researcher; the lines between them reflect publication collaboration, weighted
> by shared work. The brightest stars at the center are the field's most recognized KOLs, while the smaller
> purple stars surrounding them are emerging investigators connected to that core. The brightest purple stars
> represent the top 100 rising stars in NSCLC — the researchers most likely to become tomorrow's KOLs. Move your
> cursor to magnify the nearest star and reveal its identity; click any star to view that researcher's profile
> and closest collaborators. Together, this view surfaces both the established research community and the next
> generation working alongside it."

(Only differences: "atopic dermatitis" vs "non-small cell lung cancer"; "a researcher" vs "a US-based
researcher"; "top 100 rising stars in atopic dermatitis" vs "…in NSCLC".)

- Unavailable-TA state: `"Telescope is currently available for Oncology (NSCLC) and Immunology (Atopic Dermatitis)"` + three conditional bodies (e.g. `"Hepatology and Rare Disease coverage are in development. Select Oncology (NSCLC) or Immunology (Atopic Dermatitis) to explore a collaboration network."`)
- Legend (`TelescopeLegend.tsx`): `"Established"` / `"Recognized KOLs (Top 50)"`; `"Top KOLs"` / `"Highest-ranked names (Top 10)"`; `"Rising Stars"` / `"Emerging researchers"`; `"Network"` / `"Lines = co-authorship · Move cursor to magnify"`
- Drawer: cohort badges `"Top KOL"`/`"Established"`/`"Top Rising Star"`/`"Rising Star"`; `"Rank"`, `"Score"`, `"View full profile →"`, `"Top Collaborators"`, `"View co-authored papers"`, `{weight} papers`

### 3. WHAT IT ACTUALLY COMPUTES
**Static bundled JSON — no RPC, no live table.** `frontend/src/data/telescope_nsclc_nodes.json` /
`_edges.json`, or `telescope_ad_*` when the TA is AD. Nodes `{id, name, institution, cohort, rank, score}`; edges
`{source, target, weight}` (drawn only when `weight ≥ 3`). The drawer's "Top Collaborators" and `{weight} papers`
are computed in-browser by summing incident edge weights. Tier thresholds (Top 10 / Top 50 / top 100 rising) are
client-side rank slices of the JSON.

### 4. LABEL ⇄ COMPUTATION GAP
- The copy calls it a live "collaboration network" ("publication collaboration, weighted by shared work") but the
  graph is a **frozen JSON snapshot** — no indication it isn't live. Otherwise labels match the client-side rank
  slicing. (Legend `"Top KOLs"` vs drawer badge `"Top KOL"` is a trivial singular/plural nit.)

### 5. PUBLIC-SAFETY NOTE
Describes a capability over an aggregate research community; named individuals surface only as their own clickable
co-authorship node. The most individual phrasing — `"Move your cursor to magnify the nearest star and reveal its
identity"` — reads as a UI affordance over public co-authorship data, not tracking of a targeted person. Low
concern; "reveal its identity" is the only mildly surveillant phrase.

---

# BONUS — COMMUNITY EXPLORER

### 1. SURFACE
`frontend/src/components/CommunityExplorer.tsx`, rendered only for the AD community cohort (`App.tsx`, when
`track === "community" && isAdFeed`).

### 2. USER-FACING COPY (verbatim)
- Search: `"Search dermatologists by name or city…"`
- Header: `{TA} — Community` (default `"Atopic Dermatitis — Community"`)
- Subtitle: `Directory of {n} U.S. dermatologists · search and filter · not a ranking`
- `"Filters"`, `"State"`, `"Subspecialty"`, toggle `"AD-drug engagement"`, `"Sort"` (`AD $`/`Total $`/`Tenure`/`Name`)
- Count line: `{n} dermatologists … · {n} with AD-drug engagement`
- Loading `"Loading directory…"`; empty `"No dermatologists match these filters. Clear one to widen the search."`; `Showing {n} of {n}` / `Load 60 more`
- Card labels: `"OPEN PAYMENTS (3YR)"`, `"AD-DRUG $"`, `"TOP MFR"`, `{n} yrs practicing` / `"Tenure n/a"`, `"Published KOL"`, `"Sole proprietor"`
- Subspecialties: `"General Dermatology"`, `"Procedural"`, `"MOHS Surgery"`, `"Dermatopathology"`, `"Pediatric Dermatology"`, `"Dermatological Immunology"` (badges `GEN`/`PEDS`/`MOHS`/`PATH`/`PROC`/`IMMUN`)

### 3. WHAT IT ACTUALLY COMPUTES
Server-side via RPCs `get_community_directory_filtered` (+ `_count`, called twice for total and AD-only). Source
`community_practitioners` LEFT JOIN `community_practitioner_payments` (Open Payments 3-year totals,
`ad_drug_payments_3yr`, `top_manufacturers`, `top_drugs`, `career_stage_years`, `is_published_kol`,
`matched_hcp_id`).

### 4. LABEL ⇄ COMPUTATION GAP
- Copy is deliberately conservative and matches computation: `"· not a ranking"` (a code comment reinforces
  "deliberately says DIRECTORY, not ranking"). No overclaim.
- Minor: the `"Published KOL"` badge can be set by an HCP match alone (`matched_hcp_id != null`) even when
  `is_published_kol` is false.

### 5. PUBLIC-SAFETY NOTE — **elevated.**
Lists **named individual physicians** (name, city, state, credentials) alongside pharma-payment figures
(`"OPEN PAYMENTS (3YR)"`, `"AD-DRUG $"` per named dermatologist, `"TOP MFR"`, per-drug tags) and lets users
sort by dollars received. Open Payments is public, but this aggregates/sorts **named practitioners by pharma
dollars** — the most sensitivity-relevant framing in the app after the Belief Profile and Brief. Mitigation is
built in and explicit (`"· not a ranking"`). For public copy, describe it as a searchable directory of public
data, never as a payment leaderboard.

---

## Summary for copywriting (what's safe vs. what to avoid)

- **Safe to describe as capabilities:** Institution Intelligence, Telescope (note it's a snapshot), Research
  Themes (the publication-derived themes, not the mock crowd layer), Top Collaborators, the Rising/Emergence
  scoring *methodology* (AD: Emergence + Network Influence).
- **Describe carefully / avoid the internal framing:** the **Brief** ("Strategic Engagement Opportunities",
  "PRE-MEETING") and **"Belief Profile"** — both are named-individual profiles with engagement/behavior-change
  language; **Community Explorer** payment figures. Do not echo "track / worth their attention", "behavior change
  opportunity", "Belief Profile", or payment-leaderboard framing.
- **Do not claim in public copy (stale/incorrect in the UI itself):** "Dark Horse" (gone from all data),
  archetypes for AD (dropped), "Momentum 70% / Visibility 30%" for AD rising (it's Emergence 75% / Network 25%),
  and the methodology modal's "trial activity / conference presence / MSL signals" as rising inputs (not in the
  live formula). The `ScoringExplainedModal.tsx` (last updated 2026-05-12) is the single most stale surface.
