# FieldMark — Priority Action Items

**Captured:** May 2, 2026 evening
**Source:** Mobile testing session and methodology integrity audit

## Roadmap context

- **v1.3 (current):** Frontend tier alignment, methodology integrity audit, percentile display, view migration. Shipped May 2, 2026.
- **v1.5:** Foundation hardening — methodology calibration, country normalization, industry exclusion, narrative cleanup, DetailScreen wiring, Collaborative Orbit data foundation, methodology evolution signals (author position, editorial activity, IIT count).
- **v1.6:** Strategic feature surfacing — Collaborative Orbit feature launch, Established KOLs view with h-index data, full filtering UX, methodology evolution refinements.
- **v2.0:** Public launch.

This document is the working priority list. Items are ordered by criticality to v2.0 launch credibility, not by ease of implementation. Most P0 items will land across v1.5 and v1.6; none can ship v2.0 unresolved.

---

This document captures the prioritized backlog as of end of session. Items are ordered by criticality to launch credibility, not by ease of implementation.

---

## P0 — v2.0 launch blockers

These must be resolved before v2.0 (public launch). Each independently undermines product credibility. Most can be addressed across v1.5 and v1.6 — they don't all need to land in a single sprint, but none can ship v2.0 unresolved.

### 1. Industry employees appearing in rising star feed ✅ TACTICAL FIX SHIPPED, ARCHITECTURAL HARDENING DEFERRED TO v1.5

**Problem:** Sylvie Perez (Pfizer Research & Development, Cambridge MA) and Sudha S Shankar (Pfizer Sacramento) appeared as rising stars in the Hepatology cohort. Both are industry-employed pharma researchers. They are not MSL-engageable — they *are* the audience for FieldMark, not the targets.

**Methodology gap:** The current scoring treats anyone with a publication footprint as a candidate HCP. But for an MSL the relevant cohort is researchers at academic institutions, hospitals, clinical practices, and government/NIH — explicitly excluding pharma, biotech, and contract research organizations.

**Status (May 2 evening):** Tactical query-time exclusion shipped. INDUSTRY_PATTERNS constant in api.ts excludes 41+ pharma, biotech, and CRO companies. Filter applied in both `getRisingStars` (cards) and `getTACounts` (chip counts). Pre-fix audit: 469 industry-employed researchers across rising_star + dark_horse tiers (Hepatology 88, NSCLC 316, Rare Disease 65). Post-fix: industry employees no longer surface in any user-visible feed.

**Architectural follow-up deferred to v1.5:** Add `industry_employed` boolean column on hcps, populate via affiliation matching + ROR (Research Organization Registry) institution-type lookup. Replaces the query-time pattern matching with a proper data model. Surface industry-employed flag as a future filter dimension when filtering UI lands, allowing competitive intelligence use cases ("show me Pfizer's rising rare disease research function") without contaminating the default MSL feed.

### 2. Narrative refusal contamination ✅ CLEANUP SHIPPED, PIPELINE PATCH DEFERRED TO v1.5

**Problem:** Peter Kan's HCP card displayed the text "I cannot write these sentences as requested because there appears to be a significant mismatch in the information provided. Dr. Peter..." This was Claude refusing to generate a narrative due to data inconsistency in the prompt, and the refusal text was stored verbatim in the `hcp_narratives.narrative` column rather than being detected and rejected.

**Status (May 2 evening):** Audit identified 15 contaminated narratives across the database. Cleanup SQL nulled all 15 records. Detail screen falls back to "Narrative generating — check back soon" placeholder, which is honest. Re-audit confirmed zero remaining refusal contamination.

**Pipeline patch deferred to v1.5:** Narrative generation pipeline must detect refusals via regex match before storage; either retry with adjusted prompt or skip the HCP and log. Without this, future narrative generation runs will re-introduce the same contamination class. Estimated effort: 1-2 hours.

**Note on Peter Kan specifically:** His HCP record was likely the cause of the original refusal — Claude refused because the data passed in had inconsistencies. Worth a manual investigation as part of the cross-state same-person consolidation backlog item to determine whether his record is fragmented or has stale data that should be cleaned.

### 3. Dark Horse cohort turnover and methodology calibration ✅ RESOLVED VIA ELIGIBILITY GATE FIX

**Outcome:** The diagnostic process surfaced a much more significant finding than the original calibration question. The Dark Horse cohort wasn't too small — the methodology had a foundation gap that was suppressing the cohort. Specifically: the documented `MIN_TOTAL_CAREER_PUBS = 10` eligibility gate was not being applied in the scoring pipeline, which had two compounding effects:

1. The pub_velocity_score formula plateau at 19.7-19.8x for low-publication-count HCPs was admitting noise into rising_star and dark_horse tiers
2. The rising star tier (9,960 HCPs) was 96% under-eligible noise; only 4% (435) were legitimately ≥10 pubs
3. Tonight's afternoon tier rebuild produced 17 dark horses partly because of unstable concurrent data state and partly because the eligibility gate was missing

**Resolution:** Re-ran tier classification with eligibility gate enforced (`pub_count >= 10`) AND known-career-age guards on rising_star and emerging tiers (`first_pub_year IS NOT NULL AND first_pub_year >= 2008`). New tier distribution: **148 dark_horse, 429 rising_star, 59 established, 39 emerging across all three TAs.** Validation queries confirm all 148 dark horses and all 429 rising stars pass every methodology gate. Publication count distributions are healthy.

**Cohort turnover question, separately resolved:** With 148 dark horses and 51 "almost dark horse" candidates in the wings (NSCLC 45, Hepatology 6), natural turnover from monthly scoring reruns is structurally easy. The methodology has the right turnover mechanics; operational cadence (monthly scoring rerun) becomes the real lever.

**Decision:** Methodology unchanged. Eligibility gate now enforced. No methodology gate loosening required. The cohort calibration question resolved itself once the implementation gap was closed.

**Methodology copy correction:** Previous "fewer than 1 in 12 rising stars qualify" rarity framing is no longer accurate at the new ratio. Actual ratio: 148 dark horses / 429 rising stars = 1 in 2.9. Update DetailScreen Dark Horse callout copy accordingly.

**Operational follow-up:** Monthly scoring pipeline rerun cadence still needs scheduler infrastructure. Without it, cohort turnover is dependent on manual reruns. Half-day work to set up.

### 4. Filtering and slicing the feed cohort

**Problem:** Oncology has 3,809 rising stars. The feed shows ~20. The other 3,789 are inaccessible. An MSL cannot do their job with a list of 20 HCPs surfaced by a global ranking that doesn't reflect their territory or strategic priorities.

**Discoverable independent of full filtering — pagination gap (NEW finding May 2 evening):** With the cleaner cohort post-eligibility-fix, the count/render mismatch became immediately visible. Hepatology Dark Horses chip shows "106 identified" but the feed renders only 20 cards. NSCLC Rising Stars shows "250 identified" but renders 20. Every tier feed has the same issue — the database has cohort, the feed shows top 20 by score. A user scrolling and seeing the count not match the rendered cards immediately distrusts both numbers.

**Pagination is a smaller, more isolated problem than full filtering and may warrant its own near-term sprint:**
- Backend: parameterize the existing `.limit(200)` cap in `getRisingStars` and add offset support
- Frontend: infinite scroll on feed scroll-end, "Showing X of Y" counter at section header, "Jump to top" button after scroll
- No data dependencies — works against current data foundation as-is

This is roughly 1-2 days of focused work and meaningfully improves the product before full filtering UI lands. Recommended as a v1.5 first-week sprint item separate from the broader filtering workstream.

**Status:** Scoped in fieldmark_filter_scope.md. Full filtering estimated 3-4 week dedicated workstream. Depends on country normalization, indication taxonomy completion, career age backfill, and profile-to-feed territory threading. Pagination subitem can ship independently.

**Why P0:** Without filtering, FieldMark is a demo of methodology, not a usable product. A buyer's first question after seeing the feed will be "how do I find the people in *my* territory?" There's no good answer today. Without pagination specifically, the count-vs-cards mismatch becomes a credibility issue every time a user scrolls.

### 5. DetailScreen and score tooltip contain hardcoded placeholders that contradict card data

**Problem:** Tapping a card opens a Detail screen with:
- Career age "4.2 yrs" hardcoded across every HCP (card shows real value, e.g., "0 yrs" for Colton G Brown)
- Score breakdown bars 94/88/81/76 hardcoded across every HCP
- Publication timeline showing fake 2020-2024 bars even for researchers whose career started in 2026
- "Top 8% of rising stars" leftover copy that contradicts the body text saying "Top 5%"
- Citation trajectory showing full precision (+2.4197%) instead of rounded (+2.4%) like the card
- Rising star score showing raw composite (19.8) while the card shows percentile badge ("Top 5%")

**Additional surface (NEW finding May 2 evening):** The score badge tooltip (accessible via the score chip on the upper right of each HCP card) opens "RISING STAR SCORE 48.8/100" with a "HOW THIS SCORE IS CALCULATED" breakdown. Same hardcoded 94 for "Publication velocity (35% of score)" appears regardless of HCP. This is a third surface (cards, DetailScreen, score tooltip) all sharing the same placeholder bug. The methodology weight labels (35% pub velocity, etc.) are correctly named but the per-HCP values are placeholder.

**Status:** All v1.5 backlog items, but they cluster as "score breakdown wiring" and should be done together — same data flow, three rendering surfaces.

**Why P0:** The Detail screen is where a buyer goes to verify "is this real?" A buyer who taps three Dark Horse cards and sees the same 4.2 yrs, same 94/88/81/76 bars, same 2020-2024 publication timeline immediately concludes the data is fake. The score tooltip is *more* visible than DetailScreen — it appears on every card hover/tap — so its placeholder values are an even higher-frequency credibility issue.

**Estimated effort:** 60-90 minutes once the column-name bug in `getHCPDetail` is fixed. May be longer if `getHCPDetail` has additional issues we haven't surfaced. Score tooltip may share components with DetailScreen — if so, single fix covers both.

### 6. getHCPDetail and searchHCPs have wrong column names

**Problem:** Both functions reference `pub_velocity` / `citation_trajectory` / `trial_score` in their SELECT lists. Actual column names are `pub_velocity_score` / `citation_trajectory_score` / `trial_investigator_score`. Likely produces silent failures on detail screen open.

**Status:** Known v1.5 backlog. Same fix as the `getRisingStars` work tonight.

**Why P0:** Blocks DetailScreen wiring (P0 #5). Also blocks search screen functionality (currently unknown if search works at all).

**Estimated effort:** 20 minutes.

### 7. Country field normalization — severity upgraded

**Problem:** Country values are corrupted across multiple distinct classes, more severely than originally documented. Discovered during May 2 evening Hepatology dark horse review (106-horse cohort surfaced 60+ "China" rows alongside multiple data corruption patterns).

**Classes of corruption observed:**
1. **US states stored as countries** — "Idaho", "Texas" etc. (already documented)
2. **Trailing punctuation** — "China.", "PR China.." (mostly fixed in afternoon SQL pass)
3. **Country aliases** — "China", "PR China", "People's Republic of China" all coexist as distinct values for the same country
4. **Email and affiliation bleed-through** (NEW finding) — PubMed affiliation parser is grabbing entire trailing strings including email addresses into the country field. Real examples observed:
  - `India. ajoyshetty@gmail.com`
  - `PR China.. Electronic address: iwangtiantian@126.com`
  - `China. weichangchen@126.com`
  - `China. Electronic address: gypan@simm.ac.cn`
5. **NULL country with publication evidence** — 14 of 106 Hepatology dark horses have NULL country despite having geographic information embedded in their institution string

**Why severity matters:** This is not just cosmetic flag-rendering issues. Country corruption directly blocks territory filtering (P0 #4), produces wrong country flags on cards (Thi Hai Yen Nguyen showing French flag), and prevents the territory-default feed framing (see new item #25 below). The email bleed-through specifically suggests the PubMed affiliation parser needs revisiting at the ingestion layer — SQL patches on existing data won't catch new ingestions.

**Why P0:** Blocks geography filtering (P0 #4), blocks territory-default feed framing (P3 #22), produces visibly wrong country flags on cards (credibility issue), reveals data parsing bugs at the ingestion layer.

**Estimated effort:** 
- Quick SQL patches (alias collapse, email-string strip, state remap): 4-6 hours
- Proper fix at ingestion layer (PubMed affiliation parser revision + re-ingest): 2-3 days
- NPI-based US state population for HCPs with US affiliations: 1 day additional

### 8. Trademark conflict on FIELDMARK

**Problem:** USPTO has an active LIVE/PENDING application for FIELDMARK (serial 99703320, filed March 15, 2026) in Class 042 for "Software as a service (SAAS) services featuring software for project management; Artificial intelligence as a service (AIAAS) services." Direct overlap with the FieldMark product class and description.

**Status:** Discovered tonight. Owner is Lawrence W Rudd, Arcadia CA, individual filing.

**Why P0:** Launching under FieldMark with an active conflicting USPTO application is high legal risk. Even if the examiner doesn't catch the conflict, the filing party can oppose during publication or sue post-launch. Renaming pre-launch is materially cheaper than rebranding post-launch under legal pressure.

**Action items:**
- Trademark attorney consultation Monday (~$400 for clearance opinion)
- Generate 3-5 alternative name candidates that fit the scientist audience — current direction: Vector / Cohort / Stratum / Vantage / similar. Avoid Nebula (consumer-app vibes).
- USPTO search each finalist in Class 042 before committing
- Domain availability check per finalist
- Decide on name no later than mid-week before more brand assets accumulate

---

## P1 — High-impact, ship across v1.5 and v1.6

These are not v2.0 launch blockers but each materially improves the product before launch. Several are the strategic features that give the product a continued narrative arc through v1.5 and v1.6.

### 9. Mobile navigation gaps

**Problem:** Multiple navigation issues surfaced during mobile testing tonight:
- Dark Horse filter has no clear "off" affordance — user has to know to re-tap the same chip
- FM logo in TopBar is not tappable; should function as "home" / reset to default feed
- Hardware back button behavior on mobile not verified — single-page React apps often lack browser history integration

**Estimated effort:** 30-60 min for the visible affordances, possibly 2-4 hours if browser history needs proper React Router integration.

### 10. DOL panel placement on dark horse view

**Problem:** Currently hidden when dark horse filter is active (correct). But on the rising stars view, the DOL panel takes vertical space above the feed even when scrolling, pushing content down. May benefit from being collapsible or moved.

**Status:** Decorative concern, not a bug. Worth a UX review.

### 11. Profile screen interactive features and LinkedIn data surfacing

**Problem (existing):** Profile screen shows territory selection (Northeast/Southeast/etc.), default TA picker, default indication picker, notification toggles. Verified that none of these flow into actual queries — the territory shown isn't a real filter. This is "decoration as feature."

**Problem (NEW finding May 2 evening):** Profile screen shows MSL identity as initials avatar + name + role + "Verified via LinkedIn" badge, but exposes no other LinkedIn-derived data. Adding the user's company name (e.g., "Ipsen") visibly to the profile would:
1. Reinforce the LinkedIn verification claim with concrete evidence
2. Provide MSL company context that becomes useful for future features (industry exclusion personalization — an Ipsen MSL should not see Ipsen-employed researchers as candidates)
3. Establish a foundation for surfacing more LinkedIn data over time (current role title, years in industry, therapeutic area focus, LinkedIn profile URL)

**Recommended display additions:**
- Company name (primary employer from LinkedIn work history) — most valuable single field
- Optional secondary: role title, years in current role
- Avoid: profile photo (privacy concerns at scale), LinkedIn URL link (encourages off-platform navigation)

**Status:** Three paths converge here:
- (a) Wire the profile to actually drive feed defaults — part of filtering workstream (P0 #4)
- (b) Strip non-functional UI to avoid making implicit promises (interim fix)
- (c) Surface LinkedIn-derived data once OAuth integration lands (P3 #23) — gates on OAuth

For demo purposes pre-OAuth, hardcoded company name on the profile (e.g., "Ipsen" for Priya Nair test profile) demonstrates the concept without requiring the full OAuth integration.

**Estimated effort:** Hardcoded demo display: 30 min. Full OAuth-driven LinkedIn data flow: 1-2 days post-OAuth integration.

### 12. Narrative coverage for rebuilt dark horse cohort

**Problem:** The 21 dark horses post-rebuild may not have narratives generated. Detail screen for Colton G Brown showed "Narrative generating — check back soon," which is the EMPTY_HCP fallback string, not a real generation-in-progress status.

**Status:** Need to verify whether `hcp_narratives` table contains rows for the new dark horse hcp_ids. If not, narrative generation pipeline needs to re-run against the rebuilt cohort.

**Estimated effort:** Diagnosis 15 min, narrative regeneration depends on Claude API costs and pipeline state.

### 13. OpenAlex citation backfill completion review

**Problem:** OpenAlex script was running in background overnight, expected to finish enriching `citation_count` on 33,959 unique DOIs. Need to verify completion, success rate, and decide whether scoring pipeline should re-run against newly-complete citation data.

**Status:** Pending verification. May have completed by the time this document is read.

**Implications if rescoring:** Tier classification will likely shift. Some current dark horses will move out, some new ones will move in. Methodology absorbs this — but dark horse cohort size may grow or shrink. Worth knowing the new distribution before any demo.

### 14. Collaborative Orbit — foundation work for v1.5, surface as v1.6

**Concept:** A network feature that maps relationships between HCPs through co-investigated clinical trials and co-authored publications. Surfaces *who works with whom* — and specifically, when an established KOL repeatedly co-investigates with a rising researcher, that KOL is implicitly validating the rising star. An MSL with an existing relationship to the established KOL gets a warm pathway into a cold relationship with the emerging one.

**Strategic significance:** This is the moat. Most FieldMark features are better versions of things competitors could replicate. Orbit is structurally different — networks have value that grows non-linearly with database size, and they expose patterns that human review can't surface at scale. It converts FieldMark from "a ranking" into "an intelligence platform."

**Why MSLs will care:** The hardest problem MSLs face isn't identifying rising stars — it's getting to them. Cold engagement is hard in medical affairs. Orbit converts cold to warm. "Dr. Chen at MGH co-investigated three trials with this researcher" is a referral pathway, not a data point.

**Technical scope (all components doable, none exotic):**

- **Data foundation:** `trial_investigators` table already exists with the right schema (hcp_id, trial_id, role). PubMed publication co-author lists can populate a similar `publication_authors` linkage if not already structured this way. Both are free public data.
- **HCP matching expansion:** Current pipeline matches only ~552 of 96K HCPs to trials. Two-pass fuzzy matching (exact then last-name + first-initial) plus institution+state agreement as tiebreaker should reach 95%+ coverage of the NPI-verified cohort.
- **Trials pipeline cap removal:** Currently capped at 1,000 trials. CT.gov has 5,000-10,000 relevant trials per TA. Same fix as the PubMed cap removal pattern.
- **Relationship table:** `hcp_relationships` table linking HCP-to-HCP via shared trials and shared papers. Single Python script computes co-investigator pairs after matching is fixed. Relational table is sufficient — graph database is overkill at this scale.
- **Relationship typing:** Trial co-investigation is the strongest signal. First/last-author co-authorship is medium. Mid-list paper co-authorship is noise (30-author consortium papers don't represent real collaboration). Orbit must weight by relationship type.
- **Orbit score component:** New scoring contribution — HCPs co-investigating with established KOLs get an "orbit bonus." Most-connected node in a rising star cluster gets flagged differently than isolated researchers. Affects composite_score.
- **Dark horse criteria expansion:** "Rising star who orbits an established KOL" is exactly the kind of additive criterion that expands the dark horse cohort meaningfully without loosening current gates. Identifies *better* dark horses, not just more of them.

**UX considerations:** Network graphs on mobile are tricky. Force-directed layouts with 50+ nodes become unreadable on phone. The right MVP is probably *not* a graph visualization — it's an "Orbit" tab on each HCP's profile showing a list: "Co-investigators (12)" with each entry as a card showing name, role, shared trials. Graph view is a v1.7 enhancement if at all.

**Privacy considerations:** Orbit aggregates implicit relationships between named professionals. None of the data is private — all derived from public registries — but the aggregation is novel from an optics standpoint. Methodology already commits to opt-out flows; this is an extension. Disclosure language: "Orbit relationships derived from public clinical trial co-investigation records and peer-reviewed publication co-authorship. HCPs may opt out at any time."

**Recommended sequencing:**

- **v1.5 foundation work (1-2 weeks):** trials pipeline cap removal, HCP matching fix, build hcp_relationships table, calculate orbit metrics. Don't surface yet.
- **v1.5 dark horse criteria expansion:** Add orbit-based gate to dark horse classification once foundation is in place. Increases cohort robustness without loosening current methodology.
- **v1.6 Orbit feature launch (post-launch milestone):** Surface as named product feature with proper UX and product narrative. "FieldMark started by ranking, now we map the network."

**Why P1 not P0:** Orbit doesn't block launch. Launch needs the foundation work (P0) and the v1.5 hardening. Orbit is the v1.6 headline feature that gives the product a continued narrative beyond launch — "what's new in FieldMark" for the next quarterly update. Building it pre-launch overloads scope; building it as the v1.6 story creates product momentum after launch.

**Open question for Garrett:** Naming — Collaborative Orbit is the working name. Chess metaphors ("Discovered Attack," "Knight" for crossover researchers) were considered. Decision deferred until MSL feedback in pilot.

**Estimated total effort to v1.6 ship:** 2-3 weeks of focused work spread across v1.5 foundation + v1.6 surfacing.

### 15. Methodology evolution — additive signals to sharpen the cohort

A cluster of related methodology improvements that share a common theme: making the methodology *more selective on quality*, not *less restrictive on data*. The right direction for a credibility-first product. None of these loosens existing gates; all of them add new positive signals that help identify *better* rising stars and dark horses.

**Candidate signals, ranked by impact-to-effort:**

**(a) Author position weighting** — Almost certainly already in the publications data (PubMed always exposes first/last/middle author position). Update `pub_velocity_score` to weight first-author and last-author papers more heavily than middle-author papers. Distinguishes "doing original work" from "appearing on collaborative papers." Could also add as a dark horse gate ("must have N first-author or last-author papers in last 3 years"). Probably the highest-value addition.

**(b) Editorial / review activity from PubMed publication types.** PubMed exposes publication types including "Editorial," "Comment," "Letter," "Review." A researcher being invited to write *editorials and reviews* in their field — especially as first author — is a strong "the field is asking for their take" signal. Different from research output. Often precedes wider recognition. Free signal already in the publications table as `publication_type` or similar.

**(c) IIT count surfaced as standalone dark horse signal.** Methodology already identifies investigator-initiated trials via `lead_sponsor_class != INDUSTRY`. Surfacing IIT count as a tier criterion (e.g., "1+ IIT in last 3 years" as additional positive signal in the dark horse CASE branch) sharpens identification toward truly original researchers vs. industry-trial executors.

**(d) NIH RePORTER grant data.** Free, structured, authoritative. Adding signals like "received first R01 in last 5 years" or "PI on active K99/R00 transition" is a strong rising-star marker. Requires a separate ingestion pipeline (1-2 days work), but data shape is straightforward.

**(e) H-index from OpenAlex author endpoint.** Methodology weights h-index 5% in Rising Stars (minimal) and 25% in Established KOLs (heavy). Currently sparse data — only 1,907 HCPs have Scholar h-index from prior ScraperAPI run. OpenAlex `summary_stats.h_index` may be available free via author endpoint if existing pipeline isn't capturing it. Verify before considering ScraperAPI Premium $149/mo spend. If OpenAlex covers it, targeted enrichment of ~800 HCPs (top rising stars + likely-established + DOLs) is sufficient. Quarterly refresh cadence — h-index is slow-moving and doesn't need monthly updates. **Note:** H-index does NOT help dark horse identification (structurally favors established researchers); this is exclusively for the Established KOLs view (25% weight there).

**(f) Citation velocity (vs. trajectory).** Trajectory measures rate change. Velocity measures *current* rate. A dark horse with 200 recent citations and flat trajectory might be doing important work that has stabilized. A rising star with 30 citations and steep trajectory might still be ahead of the curve. Both signals matter; methodology currently captures only trajectory.

**(g) Trial phase mix shift.** Captures researchers transitioning from Sub-I roles on Phase 3 trials to PI roles on Phase 1 trials — a textbook emerging-influence pattern. Currently the trial_investigator_score captures recency-weighted matrix statically but doesn't surface this trajectory.

**(h) Regional pub velocity bias investigation (NEW finding May 2 evening).** Hepatology dark horse cohort post-eligibility-fix is 62% PRC-based (66 of 106 dark horses, with substantial corruption-tail variants like "PR China" and email-bleed rows). Two competing hypotheses must be tested:

1. **Real signal hypothesis:** Hepatology research has genuinely shifted toward Asia-Pacific over the past decade — hepatitis B endemic regions, MASLD prevalence trends, large patient populations, government investment. The cohort accurately reflects where the field is growing.
2. **Formula bias hypothesis:** Chinese institutional research output skews toward high paper counts per researcher (academic incentive structures, larger team sizes, publication-count promotion criteria). Our `pub_velocity_score` rewards exactly that pattern — so even if Chinese hepatologists are 30% of *active* hepatology researchers globally, they may be 60% of *high pub velocity* researchers, inflating them in our scoring.

**Investigation approach:**
- Compare APAC vs Western pub velocity within career-age band — if Chinese researchers consistently 2-3x higher across all bands, that's evidence of incentive-structure bias
- Compare per-paper citation impact across regions — if Chinese hepatology papers have higher pub count but lower per-paper citation impact, methodology is rewarding volume over influence
- Geographic peer-group normalization — compute `pub_velocity` within geographic peer groups rather than globally, surface top 5% per region
- Look at established KOLs by region as a reference distribution — if 40% of established hepatology KOLs are PRC-based, then 62% dark horse APAC concentration is signal; if 15% are PRC-based, formula bias is more likely

**Why this matters strategically:** A US-based pharma MSL covering Northeast hepatology shown 60+ Chinese dark horses is methodologically served but operationally failed. Even if the methodology is correct, the *user* needs territory-relevant cohorts. This is the data-side argument for territory-default feed framing (see new P3 item). Methodology evolution and product framing are coupled here.

**Recommended sequencing within this workstream:** (a) and (b) first — both are essentially free and use data already in the publications table. (c) is a tier classification SQL change — small. (d) requires a new ingestion pipeline — medium. (e) depends on OpenAlex audit. (f) and (g) are calibration refinements for v2. (h) requires investigation before action — gather data, then decide whether methodology change or only product-framing change.

**Why P1:** Each of these is a methodology improvement, not a launch blocker. But they cluster naturally as a "v1.5 methodology calibration" workstream that complements the Orbit foundation work. Together, the methodology gets meaningfully sharper without loosening any existing constraint.

**Estimated total effort:** 1-2 weeks for items (a) through (d). Items (e) through (h) are extensions for v1.5 or v2.

### 16. Landscape feature — placeholder-driven, needs full data wiring

**Problem:** The Landscape view (accessible via "Landscape" chip from the feed) presents three tabs — Map, Momentum, Summary — that are currently a mix of partially-working and entirely-mocked surfaces. Discovered during May 2 evening Hepatology review.

**Findings per tab:**

**Summary tab — almost entirely hardcoded:**
- TOTAL RESEARCHERS: 847 — placeholder (Hepatology actually has 3,300+ rising stars + emerging tier HCPs)
- AVG RISING STAR SCORE: 74.2 — needs verification, possibly hardcoded
- AVG CAREER AGE: 6.4 yrs — uses old "Career Age" label; should use "Pub Years" terminology; value almost certainly hardcoded
- ACTIVE TRIALS: 312 — suspicious given total trial coverage is 552 HCPs across all TAs
- DARK HORSES: 47 — **wrong**. Hepatology has 106 dark horses post-eligibility-fix. The Landscape view is reading from a different data source than the Feed
- "top 8% of rising stars" copy — outdated, should be top 5%
- TOP INSTITUTIONS list (Boston Children's / Johns Hopkins / Mayo / UCSF / Columbia) — generic prestigious institutions, not derived from actual Hepatology HCP data. Given Hepatology cohort is 62% PRC-based, real top institutions for Hepatology research would include Chinese institutions
- TOP JOURNALS list (NEJM / Nature Medicine / Lancet / Blood / JIMD) — top medical journals generally, not Hepatology-specific. Field-specific journals (Journal of Hepatology, Hepatology, Gastroenterology, Liver International) are absent
- SCORE DISTRIBUTION buckets — needs verification, plausible shape
- FIELD MOMENTUM copy: "Lysosomal storage disorders and gene therapy are driving the acceleration" — hardcoded copy that's actually about Rare Disease, not Hepatology. Cross-TA contamination.

**Map tab — possibly working but US-only:**
- Shows clusters in California, Texas/Mexico, Midwest, Northeast US only
- An honest map of Hepatology research would show massive China cluster given 62% APAC concentration in dark horse cohort
- Either map is hardcoded to US-only, or data is filtered (possibly leftover USA filter we missed)

**Momentum tab — most likely partially working:**
- Plots researchers on citation trajectory vs. another axis (visibility/velocity)
- Names appear genuine and diverse: Kim, Tanaka, Wei, Delacroix, Hoffman, Omondi, Sorensen, Eriksson, Nair, Salave'a
- Color coding suggests tier classification
- "Platinum tier" / "High visibility" framing labels suggest real wiring partially in place

**Scope of work to fix:**
- Backend: new aggregation queries for landscape (institution rankings by HCP count per TA, journal rankings, score distribution buckets, regional breakdowns, dark horse counts)
- Map: data source decision — institution geocoding, country-level only, or both. Currently appears US-only
- Momentum: validate it's actually wired and not also placeholder
- Summary: comprehensive copy update + data wiring + cross-TA contamination cleanup
- Tie all data to therapeutic area selection consistently (currently the Feed and Landscape views show divergent dark horse counts, which is a credibility issue)

**Why P1:** Landscape is a secondary view, not the primary feed surface. Most users won't tap it before being convinced by the feed. But for an MSL or buyer who *does* tap it, the inconsistencies (47 vs 106 dark horses, generic top institutions, cross-TA copy contamination) immediately undermine trust in everything they just saw on the feed. Either the surface needs full wiring or it needs to be hidden until it's real.

**Estimated effort:** 1-2 weeks of focused work to wire all three tabs to real data with consistent therapeutic-area filtering.

**Alternative recommendation:** Hide the Landscape entry point until the feature is properly wired. Better to have a smaller, fully-working product than a larger product with credibility-undermining surfaces. This is a one-line change in the feed UI.

---

## P2 — Methodology depth, ship for v2.0 launch

These don't block initial pilot demos but become important as the product gets used by real MSLs at scale. Target v1.5 / v1.6 incorporation for v2.0 launch.

### 17. Institution tier weighting decision

**Problem:** Methodology weights institution_tier_score at 5% in Rising Stars composite and 15% in Established KOLs composite. Tier lists exist for Rare Disease only. NSCLC and Hepatology are unweighted, meaning the institution component is effectively zero for those TAs.

**Decision needed:** Either (a) zero the weight outside Rare Disease and document, (b) build NSCLC and Hepatology tier lists.

### 18. DOL scoring as composite component

**Problem:** Verified DOLs are identified separately from scoring. They appear in the hero panel but their social influence does not contribute to composite_score. Methodology commits to "v1.5+ DOL signal as a scoring component."

**Status:** Architectural decision. Requires defining how social influence translates to score weight.

### 19. Trial coverage expansion and trial_investigator_score zero-handling

**Problem (existing — coverage):** Only 552 of 93,769 HCPs have linked trial activity (0.6%). Trial signal is therefore essentially dark across most of the product. Methodology limits trial matching to NPI-verified HCPs (5,878 total), of which ~9.5% match a trial.

**Problem (NEW finding May 2 evening — score formula behavior):** `trial_investigator_score` is weighted 25% of the Rising Stars composite. For 99.4% of HCPs (those without matched trial activity), this 25% slot computes to zero. Two competing interpretations:

1. **Correct behavior:** Researchers without trial activity have zero trial-investigator score — that's accurate. They don't have trial activity to score on. The 25% weight is structurally correct.
2. **Suppressed behavior:** Researchers without *matched* trial activity (because our linkage pipeline couldn't connect them) are being penalized by a 25% slot reading zero, when the real-world reason is data incompleteness. We're punishing researchers for our pipeline's limitations.

The first interpretation is methodologically pure. The second is operationally honest — for the vast majority of HCPs, the formula effectively shrinks to 75% of its theoretical range, and high-trial-activity HCPs get an outsized advantage in the composite.

**Investigation approach:**
- Look at distribution of trial_investigator_score across the rising star tier — is it truly zero for most, or are there ranges?
- Compare composite score distributions for trial-matched vs trial-unmatched HCPs — is there visible "advantage" for the trial-matched cohort?
- Decide between three paths:
  - (a) Keep current behavior — trial signal is real, missing it is missing it
  - (b) Reweight composite to handle missing trial signal — e.g., when no trial data, redistribute the 25% across other components (pub velocity, citation trajectory, h-index)
  - (c) Improve coverage instead — fix the pipeline so more HCPs are matched to trials

**Recommendation:** Path (c) where possible (increase trial linkage via the Collaborative Orbit foundation work in P1 #14, which expands trials pipeline cap from 1,000 to ~5,000-10,000 per TA and fixes HCP matching). Then revisit whether residual zero-handling needs (b).

**Possible remediations for coverage:**
- Expand NPI verification beyond US (challenging — international physician registries are fragmented)
- Use ORCID as secondary identifier when present
- Use co-investigator inference (if A is matched and A co-investigates trial X with B, B is also on trial X — useful even if B isn't NPI-verified)
- Accept the gap and document clearly that trial signal is partial

### 20. Indication taxonomy completion

Per the filter scope doc — Oncology has CAR-T/DLBCL/etc. as decorative chips but no real HCP-to-indication mappings beyond NSCLC. Hepatology and Rare Disease lack any indication taxonomy at all.

### 21. Cross-state same-person consolidation

**Problem:** Major researchers with multi-affiliation careers may still appear as multiple records (~50-150 estimated). Younossi, Noureddin flagged from prior sessions.

**Status:** Methodology v1 dedupe consolidated 45,487 fragmented rows; Category C 6,174-group manual review backlog remains.

---

## P3 — Operational and strategic

### 22. Territory-default feed framing — product positioning decision (NEW finding May 2 evening)

**Problem:** With cleaner cohorts post-eligibility-fix, geographic distribution patterns became clearly visible. Hepatology dark horse cohort is 62% PRC-based. Whether or not this reflects real signal (see methodology evolution item #15(h)), a US-based MSL using FieldMark to cover Northeast hepatology is shown global rising stars dominated by HCPs in territories they cannot engage. The product is methodologically correct but operationally failed for that user.

**Strategic question — two product framings:**

**Option A: FieldMark surfaces global rising stars with territory filtering for local relevance.**
- Honest, methodologically sound
- Positions product as "global intelligence with local lens"
- Requires territory filtering to land before product is usable for daily MSL workflow
- Risk: first-time users see overwhelming geographic mismatch and disengage

**Option B: FieldMark surfaces regional rising stars with global view as expansion.**
- Default to user's territory (US MSL → US dark horses by default)
- "Show global" toggle expands the cohort
- Positions product as "MSL territory tool with global expansion when needed"
- Methodology unchanged
- Matches actual MSL workflow — they engage HCPs in territory, not globally
- Risk: less impressive on first impression ("only 22 NSCLC dark horses?" vs "250 globally")

**Recommendation:** Option B for v2.0 launch. MSL workflow is fundamentally territory-bound; defaulting to global creates more friction than insight.

**Dependencies:**
- Country normalization (P0 #7) must complete first — territory filtering can't work on a corrupted country field
- Profile screen territory selection must thread into the feed query (currently decorative)
- Filter UX must support "expand to global" affordance

**Status:** Strategic decision pending. Capture as a near-term decision, decide in advance of v1.5 filtering work so the architecture supports both framings.

**Estimated effort:** Decision is fast (an hour of thinking). Implementation is part of the broader filtering workstream (P0 #4) — adding territory-default behavior is a small overlay on filtering infrastructure, ~1 day on top of filtering.

### 23. LinkedIn OAuth integration

**Prerequisites:** Privacy policy, terms of service, marketing site URL, finalized brand name. None of these are ready.

**Estimated total effort:** 2-3 days of writing/setup, plus the OAuth integration itself (~half day).

### 24. Marketing site

**Problem:** Vercel deployment URL (`field-mark.vercel.app`) is the only public URL. No marketing/landing page exists.

**Action items:**
- Decide name first (tied to P0 #8)
- Single-page placeholder with product description, privacy/terms links, contact info
- Domain registration once name is settled

### 25. Privacy policy and terms of service

**Status:** Methodology commits to opt-out and profile claiming. Terms need to formalize:
- What data FieldMark collects about HCPs (publication metadata, trial data, social presence — all public)
- What data FieldMark collects about MSL users (LinkedIn profile, contributed notes, usage)
- Data retention and deletion
- HCP opt-out flow
- MSL anonymity guarantees
- Pharma compliance considerations

**Recommended:** Start with a SaaS template, then $400-800 attorney review given pharma/HCP data sensitivity.

### 26. Domain decisions

Methodology mentions fieldmark.health as investigated. Pending name finalization.

---

## What's recommended for tonight (60-90 min)

Given the scope of the larger workstreams, tonight's session should focus on diagnostics and quick fixes that surface tonight's findings cleanly. Each item should produce information that informs the bigger workstream decisions.

1. **Verify OpenAlex completion** — 5 min diagnostic SQL
2. **Run narrative refusal audit query** (P0 #2) — 5 min, sizes the contamination scope
3. **Run Dark Horse diagnostic queries** (P0 #3, all three queries) — 5 min, informs cohort calibration decision
4. **Run industry employee audit query** — count rising stars at major pharma — 5 min, sizes the exclusion scope
5. **Methodology doc append** capturing whatever the audits surfaced — 15 min
6. **Quick wins from P0 if time permits:**
   - Null contaminated narratives (P0 #2 cleanup) — 10 min
   - Two navigation UX fixes (P1 #9: Dark Horse exit, FM logo as home) — 20-30 min

The diagnostic queries are the highest-leverage part of this session — they convert open methodology questions into data-informed decisions for next week.

Industry employee audit query:
```sql
SELECT 
  ta.slug,
  COUNT(*) as industry_employed_in_rising_stars
FROM hcp_scores s
JOIN hcps h ON h.id = s.hcp_id
JOIN therapeutic_areas ta ON ta.id = s.therapeutic_area_id
WHERE s.tier IN ('rising_star', 'dark_horse')
  AND (
    h.institution ILIKE '%pfizer%' OR
    h.institution ILIKE '%merck%' OR
    h.institution ILIKE '%novartis%' OR
    h.institution ILIKE '%roche%' OR
    h.institution ILIKE '%genentech%' OR
    h.institution ILIKE '%astrazeneca%' OR
    h.institution ILIKE '%glaxosmithkline%' OR
    h.institution ILIKE '%gsk%' OR
    h.institution ILIKE '%sanofi%' OR
    h.institution ILIKE '%bristol myers%' OR
    h.institution ILIKE '%bristol-myers%' OR
    h.institution ILIKE '%eli lilly%' OR
    h.institution ILIKE '%johnson & johnson%' OR
    h.institution ILIKE '%janssen%' OR
    h.institution ILIKE '%abbvie%' OR
    h.institution ILIKE '%vertex%' OR
    h.institution ILIKE '%regeneron%' OR
    h.institution ILIKE '%amgen%' OR
    h.institution ILIKE '%biogen%' OR
    h.institution ILIKE '%moderna%' OR
    h.institution ILIKE '%gilead%'
  )
GROUP BY ta.slug
ORDER BY ta.slug;
```

Defer to dedicated workstreams:
- Industry exclusion implementation (P0 #1) — once audit shows scope, this is a 2-4 hour fix
- Filter implementation (P0 #4, 3-4 week workstream)
- DetailScreen wiring (P0 #5, requires P0 #6 column-name fix first)
- Country normalization (P0 #7, 1-2 day workstream)
- Trademark / naming decisions (P0 #8, Monday with attorney)
- LinkedIn OAuth (gated on name + privacy/terms)
- Indication taxonomy (multi-day)

---

## Notes on tonight's session

What got done tonight (May 2, 2026):
- Dark horse UI alignment with backend tier (deleted three dead isDarkHorse functions)
- "Top 5%" honorary badge replacing raw composite for dark horses
- USA filter removal — international HCPs now flow through the feed
- taCounts useEffect wired (chip count was perma-stuck on em-dash)
- Migrated getRisingStars from hcp_scores to hcp_normalized_scores view
- Solved URL-length bomb on tier pre-fetch (single query against view + tier)
- Added tier column to hcp_normalized_scores view via DROP+CREATE
- Career age pill replacing TRIALS pill on dark horse cards (data-driven, not hardcoded)
- Disabled state for inactive TAs (Immunology) and indications (CAR-T, DLBCL, Melanoma, CLL, AML)
- Removed false "your territory" claim from Dark Horse chip
- Trailing-period country normalization (China./China collapsed, etc.)
- DetailScreen Dark Horse callout copy updated to match recovered methodology
- Methodology integrity audit: deduped 44,001 rows from hcp_scores (32% of table), added unique constraint, rebuilt tier classification with null-handling guards
- Validated: 21 truly emerging dark horses across all TAs (down from 2,205 contradictory)
- Methodology doc bumped to v1.3 with full session capture
- Production deployed to Vercel with all of the above

What was discovered tonight requiring follow-up:
- Industry-employed researchers (Pfizer R&D scientists) appearing in rising star feed — RESOLVED via INDUSTRY_PATTERNS query-time filter
- Narrative refusal contamination (15 Claude refusals stored verbatim as narratives) — RESOLVED via SQL UPDATE setting narrative = NULL
- Dark Horse cohort question reframed: not "is 21 too small" but "is the eligibility gate enforced" — RESOLVED via tier rebuild with publication count guard, cohort recovered to 148 dark horses methodology-clean
- "Career age" label confused users into reading biological age — RESOLVED via "PUB YEARS" rename
- Hepatology dark horse cohort 62% PRC-based — captured as P1 #15(h) regional bias investigation; informs P3 #22 territory-default feed framing decision
- Country field corruption broader than known — email/affiliation strings bleeding into country values, severity upgraded for P0 #7
- Pagination gap — feeds render only top 20 cards regardless of cohort size; promoted to P0 #4 subitem with possible independent v1.5 sprint
- Score badge tooltip is a third placeholder surface (alongside cards and DetailScreen) — folded into P0 #5
- trial_investigator_score zero-handling for the 99.4% of HCPs without matched trial activity — folded into P2 #19 as an investigation question
- Landscape feature placeholder-driven across all three tabs (Map, Momentum, Summary) — captured as P1 #16 with recommendation to either fully wire or hide entry point
- Profile screen LinkedIn data surfacing opportunity — captured as expansion of P1 #11 with company name as the priority field to display
- Trademark conflict on FIELDMARK
- DetailScreen extensively placeholder-driven
- Mobile navigation gaps — partially resolved tonight (Dark Horse exit X icon, FM logo as home button)
- Narrative coverage gap for rebuilt dark horse cohort — separate from refusal contamination, needs verification post-cohort-rebuild
- Collaborative Orbit reaffirmed as the strategic moat feature — sequenced as v1.5 foundation work / v1.6 surfacing
- Methodology evolution backlog clustered as a coherent v1.5 workstream — author position weighting, editorial activity, IIT count, NIH grants, h-index from OpenAlex, regional bias investigation, regional bias investigation

---

*This document is the working priority list. Items move between tiers as situation changes.*
