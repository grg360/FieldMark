# FieldMark Future Features Roadmap

**Created**: May 13, 2026
**Last updated**: May 14, 2026 (mid-day)
**Status**: Living document — append as decisions get made, not retroactively
**Purpose**: Single source of truth for what's been intentionally deferred from v1.0, with rationale and dependencies

---

## Mid-afternoon May 14, 2026 — Surgery progress (paused mid-day)

The cancer surgery's destructive phase is complete. Today's progress:

**Done**:
- Step A: OpenAlex Author Inventory populated (112,195 research-active authors)
- NPPES Org → ROR mapping populated (1,181 high-confidence research institutions)
- ROR → Country enrichment populated (10,482 RORs at 100% country coverage)
- Step B: HCP reconciliation (70,384 HCPs linked, 102,516 join rows, all canonicals validated)
- Step C: New HCPs created from inventory (35,327 new HCPs, including 11K from China previously absent from database)
- Step B+ reconciliation: 71 wipe candidates rescued, 2,624 ambiguous_homonyms identified and deletion-confirmed
- Step D: 13,172 noise HCPs wiped (HCP count went 109,249 → 144,576 → 131,404)

**Critical finding documented**:
- Step E (UNIQUE constraint on hcps.openalex_author_id) deferred due to OpenAlex misattribution affecting 4.6% of database
- 2,214 OpenAlex author IDs collapse multiple real distinct people into one ID
- Concentrated in common-name researchers (Chinese, Korean, Indian)
- This is an upstream OpenAlex problem we inherit; cannot fix at the constraint level
- Plan: acknowledge in scoring (data_quality_flag), manual cluster-splitting in v1.5+

**Pending (afternoon resume)**:
- Step F: Rebuild publication_authors
- Post-surgery: trial investigator rematch, scoring rerun, 30 Step-C duplicate reconciliation

**Current HCP count**: 131,404. Clean foundation for the rest of the surgery and product work.

---

## End-of-day May 13, 2026 — major findings (preserved for reference)

Today's session produced findings that affect roadmap priorities materially:

**1. OpenAlex publication enrichment substantially complete.** 230,822 publications enriched with citation_counts_by_year, authorships (containing OpenAlex author IDs, positions, ROR institutions), concepts. This is the data foundation for the cancer surgery, Collaborative Orbit, and indication-level tagging.

**2. OpenAlex Author Inventory populated.** 112,195 research-active authors across the Hepatology corpus, with 97% ROR coverage and 53% ORCID coverage. The top of the inventory matches the senior hepatology research community as expected.

**3. CRITICAL: Trial investigator matching is the biggest unrealized signal in the database.** Discovery: 107,734 of 115,020 CT.gov investigator records (93%) have null match_status — they were never even processed by the matching pipeline. Only 1,579 distinct HCPs are matched to trials. Senior researchers like Martin Reck, Lajos Pusztai, Jacob Sands, and Charles Drescher appear unmatched. The trial component is 25% of Rising Star composite score — meaning scoring methodology has been calibrating against compromised data for the population that matters most.

This isn't a broken algorithm. It's an unfinished job. Post-cancer-surgery, re-running trial matching against clean HCPs should produce a dramatic increase in matched investigators and meaningfully improve scoring accuracy.

**4. OpenAlex author fragmentation discovered.** Senior researchers like Loomba (5 author IDs), Wong (6 IDs), Trauner (5 IDs) are fragmented across multiple OpenAlex author profiles. Step B of the cancer surgery requires a one-to-many HCP→OpenAlex author mapping (new `hcp_openalex_authors` join table). See `hcp_cancer_surgery_spec.md` for detailed design implication.

**5. ROR mapping infrastructure built.** Maps NPPES organization names to ROR institution IDs. Initial estimate of overnight runtime was wrong — only 4,600 distinct NPPES orgs, ~40 minutes total. ~36% match rate (high+medium) means ~1,660 mapped research institutions, which is the right population for Step B Category 2 reconciliation. Non-research private practices correctly fail to match.

---

## How this doc works

Every entry has:
- **Feature name** — what it is in plain language
- **Why deferred from v1.0** — the explicit reasoning
- **Target version** — v1.1, v1.2, v1.5, v2.0, or "post-launch undated"
- **Dependencies** — what needs to exist before this can ship
- **Status notes** — any progress, partial work, or open questions

When something on this list becomes the next active workstream, it graduates out of this doc into a build plan.

---

## v1.0 launch scope (for reference)

**Therapeutic areas live in v1.0:**
- **Hepatology** (broad TA) with indication drill-down: MASH, PBC, PSC, HCC, viral hepatitis
- **Oncology** (broad TA) with NSCLC as the only active indication; other indications ingested but marked "Coming Soon"
- **Rare Disease** — marked "Coming Soon" entirely at the broad-TA level

**Core capabilities in v1.0:**
- Rising Stars cohort scoring (Hepatology indications + NSCLC)
- Established KOL composite scoring (parallel column to Rising Stars)
- HCP cards with publication history, trajectory, basic profile
- Cohort browsing, ranking, filtering by indication
- MSL contribution workflow (crowdsourced intelligence — the differentiator)

---

## v1.1 — Near-term post-launch (target: 4-8 weeks post v1.0)

### MeSH-based HCP slicing

**What it is**: Filter HCPs by their publication MeSH profile. Show MeSH signature on HCP cards. Enable filters like "HCPs with ≥5 papers tagged 'Randomized Controlled Trial'" or "HCPs publishing on FXR agonists" within an indication.

**Why deferred**: v1.0 needs basic indication-level cohort first. MeSH-based refinement is power-user functionality that adds cognitive load.

**Dependencies**: HCP cancer surgery complete (clean publication_authors links). MeSH terms already captured on publications.

**Status notes**: Infrastructure already exists in `publications.mesh_terms` column. ~70-85% MeSH coverage expected across corpus (newer papers and non-MEDLINE journals may lack indexing). Aggregation logic decision needed — frequency-weighted vs recency-weighted vs citation-weighted profiles produce different signatures.

---

### Rare Disease activation

**What it is**: Move Rare Disease from "Coming Soon" to live, with indication drill-down for major rare diseases (SCD, CF, SMA, DMD, hemophilia, lysosomal storage, etc.).

**Why deferred**: Rare Disease is a collection of many small fields. Indication-level configuration takes more time per indication. v1.0 ships sooner with Hepatology + NSCLC than with all three broad TAs.

**Dependencies**: Architecture rebuild complete (so the ingest_publications + openalex_researchers + reconcile pipeline can be re-run per indication). ~10 indication configs to populate. Validation cohorts needed per indication.

**Status notes**: Discussed extensively in the v2.0 architecture design doc. The architecture supports it; we just don't run discovery until after launch.

---

### Additional Oncology indications activation

**What it is**: Flip `is_visible_in_ui = TRUE` on Breast Cancer, Multiple Myeloma, RCC, and other oncology indications. Data already ingested via broad Oncology ingestion; just not surfaced.

**Why deferred**: v1.0 ships with NSCLC active to validate the indication-level architecture before extending. Other oncology indications need validation cohorts before activation.

**Dependencies**: Validation cohort built per indication. Scoring calibration per indication.

**Status notes**: Data ingestion already covers these via broad Oncology config. UI flip is one config change per indication.

---

## v1.2 — Methodology depth (target: 8-16 weeks post v1.0)

### Pub velocity formula redesign

**What it is**: Current pub_velocity formula produces a plateau cluster artifact at certain career-age bands. Component weight reduced to 15% as workaround. Real fix requires formula redesign.

**Why deferred**: P0 finding from May 3 audit; deweighted but not eliminated. Doesn't block v1.0 because Rising Stars composite still ranks meaningfully without it.

**Dependencies**: Validation cohort (to verify new formula doesn't introduce different artifacts).

**Status notes**: Currently weighted 15% in composite. Plateau cluster persists. Multiple iteration attempts in May haven't resolved structural issue.

---

### Validation cohort building

**What it is**: Hand-curated cohort of 30-50 known rising stars and 30-50 known established KOLs per launch TA, used as ground truth for scoring methodology validation. 80% precision target committed in methodology doc.

**Why deferred**: Open since beginning of project. Required for confident methodology claims but not strictly required for v1.0 ship.

**Dependencies**: Three preliminarily-validated rising star cases exist (Vratko Himič + 2 others). Need 27-47 more per TA.

**Status notes**: Empirical anchor missing since beginning. Highest-priority post-launch methodology work.

---

### Per-indication scoring weight calibration

**What it is**: Different indications may need different component weights. MASH research patterns may differ from PBC patterns may differ from NSCLC patterns. v1.0 uses one weight set per broad TA; v1.2 calibrates per indication.

**Why deferred**: Requires validation cohort first.

**Dependencies**: Validation cohort. Architecture already supports per-indication weights via `scoring_weights` JSONB.

**Status notes**: Architecture-ready but blocked on validation cohort.

---

## v1.5 — Strategic feature expansion (target: 16-24 weeks post v1.0)

### Conference proceedings enrichment

**What it is**: Capture conference abstracts and presentations from major medical meetings (AASLD, EASL, ASCO, ESMO, ASH, ACR, etc.). Use as a signal for active research that may not yet appear in PubMed.

**Why deferred**: Not in v1.0 because PubMed + OpenAlex publication corpus is sufficient baseline. Conference activity is a refinement signal, not core identity.

**Dependencies**: ScraperAPI infrastructure (credits already purchased — see "ScraperAPI usage" entry).

**Status notes**: Originally scoped at v1.0; descoped when v2.0 architecture rebuild took priority. ScraperAPI account at 100K monthly credit limit on hobby tier — may need upgrade for conference-scale capture.

---

### Twitter/X-based DOL identification

**What it is**: Capture conference hashtag activity (#ASCO25, #EASL26) and topic-based discussions to identify Digital Opinion Leaders. Match captured accounts to FieldMark HCPs.

**Why deferred**: Twitter API access reality check — free tier insufficient, Basic ($100/mo) too restrictive for conference-scale capture, Pro ($5K/mo) not justified at current stage. Initial social cleanup work in May 2026 dropped 39% of original social handles due to data quality issues; resetting expectations.

**Dependencies**: Decision on Twitter API tier or third-party scraping. Bluesky as free fallback.

**Status notes**: Bluesky-only path is viable but coverage is modest (early-adopter physicians). Hashtag prototype concept discussed; not yet built.

---

### H-index strategic decision

**What it is**: Currently h-index has 0% weight in Rising Stars composite (deweighted from 5% because high h-index correlates with "established," not "rising"). Three options exist: drop h-index entirely, compute from OpenAlex, or hybrid using existing Scholar values + OpenAlex computed.

**Why deferred**: Not v1.0 blocker. Current 0% weight is the right call for Rising Stars composite. May matter more for Established composite (25% weight there).

**Dependencies**: HCP cancer surgery complete (so OpenAlex author mapping is reliable). Decision on whether Established composite ships in v1.0.

**Status notes**: 662 HCPs have existing Scholar-enriched h-index values. ScraperAPI Scholar pipeline available but slow (5,000+ HCPs would take days).

---

### Immunology activation

**What it is**: Add Immunology as live broad TA with indications (rheumatoid arthritis, lupus, IBD, psoriasis, etc.).

**Why deferred**: v1.0 launches Hepatology + Oncology(NSCLC) + Rare Disease("Coming Soon"). Immunology is the next TA after that. Garrett confirmed in May 13 session: "Immunology is going to be the next TA added."

**Dependencies**: Architecture proven across Hepatology and Oncology. Validation cohort built per Immunology indication.

**Status notes**: TA row exists in database with `ta_level = 'broad_ta'`. No ingestion config row yet. Some HCPs may already be tagged via earlier work.

---

### Collaborative Orbit — foundation (v1.5) and surface (v1.6)

**What it is**: The strategic moat feature for FieldMark. Maps relationships between HCPs through shared clinical trial co-investigation and publication co-authorship. The insight: a rising star who consistently appears alongside established KOLs is operating in their "orbit" — being trusted with co-investigator roles, included in major papers, embedded in the network. Strong signal that an MSL team should engage them now.

The chess metaphor that defines it: an established KOL is a known piece on the board. Orbit reveals rising stars operating in the shadow of that known piece — a "discovered attack" where moving the known piece reveals the unknown one behind it.

**Why deferred from v1.0**: Requires clean HCP identity (cancer surgery must complete first). Also benefits from being launched after v1.0 — "v1.6 brings collaborative intelligence to FieldMark" is a stronger product narrative than shipping Orbit at launch with limited data.

**Two-phase rollout:**

**Phase 1 — v1.5 foundation work**: 
1. Complete trial-investigator matching pipeline (currently 107,734 of 115,020 CT.gov investigator records have null match_status — never attempted). Re-run matching against the clean post-surgery HCP population. Expected jump from 1,579 matched HCPs to many thousands.
2. Build the `hcp_relationships` table. 
3. Compute co-investigator pairs from `trial_investigators`. 
4. Compute co-authorship pairs from `publications.authorships`. 
5. Calculate orbit metrics per HCP (number of distinct collaborators, count of orbit-with-established-KOL connections, position-weighted relationship strength). 
6. Do NOT surface in UI yet.

**Phase 2 — v1.6 launch**: Surface Orbit as a feature on Rising Star and Dark Horse HCP cards. Visual network representation. MSL workflow: identify rising star → click into card → see orbit → spot familiar established KOL → make the warm intro call. Less prominent or absent on Established/KOL cards (the orbit is less actionable when the MSL already knows the senior researcher).

**Dependencies**:
- HCP cancer surgery complete (Steps A-F) — clean OpenAlex author IDs as identity primitives
- Trial-investigator matching pipeline completion (107K records currently unattempted)
- Publication authorships fully populated (substantially complete as of May 13, 2026 — 230K publications enriched with OpenAlex authorships JSONB containing author IDs, positions, ROR institutions)

**Status notes (May 13, 2026)**:
- Data infrastructure for publication side: substantially in place. Every publication's `authorships` JSONB now contains: OpenAlex author ID per author, author_position (first/middle/last), is_corresponding flag, institution ROR IDs, country codes. This is exactly what Orbit needs.
- Data infrastructure for trial side: `trial_investigators` table has 115,020 CT.gov investigator records across 7,813 trials, but only 1,579 distinct HCPs matched (7.2% match rate). Diagnosis: matching pipeline was never completed (107K records have null match_status). NOT a broken algorithm — an unfinished job. Re-running against clean post-surgery HCP population should produce dramatically higher match rate.
- Estimated build effort once cancer surgery is complete: ~half a day for the `hcp_relationships` computation script, plus separate effort to re-run trial investigator matching (probably 2-3 days end-to-end). Frontend visualization is separate effort (Bolt territory).
- Honest weighting note for Orbit algorithm: when built, publication co-authorship will be the dense signal (every HCP has many co-authors), trial co-investigation will be the sparser but stronger signal (deeper collaboration commitment). Both should be in the algorithm; their relative weight reflects their different reliability and density.
- This feature is structurally distinctive from any competitor. The product's most defensible long-term moat.

---

## v2.0 — Public launch (target: TBD)

### Established KOL composite scoring

**What it is**: Parallel scoring composite for established KOLs alongside Rising Stars. Different weight structure (h-index 25%, trial 25%, etc.). Tier vocabulary: kol, emerging_kol, unranked.

**Why deferred**: v1.0 focuses on Rising Stars differentiation. Established scoring exists architecturally (`hcp_scores.established_composite_score`, `established_tier`) but methodology calibration ongoing.

**Dependencies**: Validation cohort. h-index strategic decision.

**Status notes**: Architectural foundation in place from May 6 work.

---

### Country field normalization

**What it is**: P0 finding from priority doc — current `hcps.country` field has inconsistent values. Need normalization rules and migration.

**Why deferred**: Doesn't block v1.0 functionality but affects geo-filtering accuracy and international HCP display.

**Dependencies**: None — just focused remediation work.

**Status notes**: Captured in priority doc as P0 v2.0 blocker.

---

### Secondary citation source evaluation

**What it is**: Evaluate CrossRef and/or Semantic Scholar as supplementary citation sources alongside OpenAlex. Useful for older publications where OpenAlex coverage is thin.

**Why deferred**: OpenAlex coverage is sufficient for v1.0. Secondary sources are quality refinement, not foundational.

**Dependencies**: Architecture stable. Specific gaps identified.

**Status notes**: OpenAlex coverage of 2026 publications was an identified lag point in May 3 audit.

---

## Cross-cutting and infrastructure

### ScraperAPI usage (deferred from v1.0)

**Context**: Garrett purchased ~$149 of ScraperAPI credits expecting Google Scholar enrichment use. v1.0 doesn't need it (OpenAlex covers what Google Scholar would offer for biomedical research).

**Held for**: Conference proceedings scraping (v1.5) and/or institutional faculty page verification (post-launch).

**Status notes**: Credits expire on a timeline — confirm date if not already known.

---

### Long-term: HCP cancer surgery cleanup of OpenAlex misattribution

**What it is**: OpenAlex's own author resolution clusters multiple distinct researchers under one author ID for some common Chinese surnames (Wang, Zhang, Li, Liu, Chen). Cannot fix upstream; affects ~268 distinct author IDs in our DB.

**Why we accept it for v1.0**: Architecture rebuild won't compound the issue. Existing misattribution stays at the OpenAlex level, not amplified in our DB. Affected HCPs may show inflated publication counts.

**Possible future work**: Manual review of high-corpus-count common-name author IDs, manual splitting where appropriate, internal "verified-distinct-from-OpenAlex-cluster" flag.

**Status notes**: Identified in May 13 session. 614 HCP rows across 268 distinct authors with potential misattribution. Decided NOT to merge based on OpenAlex ID alone because of this concern.

---

## Items not yet placed

Use this section as a holding pen for ideas that come up but haven't been triaged into a version target yet.

### OpenAlex misattribution cluster-splitting

**What it is**: OpenAlex's author clustering algorithm collapses multiple distinct real people with common names (especially Chinese, Korean, Indian) into a single OpenAlex author ID. Identified in surgery: 2,214 OpenAlex author IDs assigned to 6,021 HCPs in our database (4.6% of total). Example: A5001446757 represents 6 different real "Yan Xiong" researchers at 6 different institutions on 3 continents.

**Why deferred from v1.0**: We can't fix OpenAlex's upstream clustering. Manual cluster-splitting requires expert review of each misattributed ID. Top 50-100 clusters likely contain 80% of the value.

**Why this matters at scale**: 
- Citation trajectory scoring inflates for HCPs in misattributed clusters (work from multiple people credited to one)
- HCP profile displays show wrong publications for affected researchers
- Trial investigator matching propagates incorrectly across cluster members
- Collaborative Orbit graph treats multiple people as one node
- Senior recognizable hepatology KOLs unaffected; concentration is in common-name researchers

**v1.0 mitigation (do now)**:
- Add `data_quality_flag = 'shared_openalex_id'` to HCPs in misattributed clusters
- Scoring methodology excludes flagged HCPs from cohort rankings (don't display scores we can't trust)
- HCP profile UI shows a "shared author identity" disclosure for affected cards
- Document the limitation transparently rather than hide it

**v1.5+ resolution (manual splitting)**:
- Build an internal tool to review high-corpus-count misattributed IDs
- For each cluster, manually assign each HCP its own internal identifier
- Maintain hcp_openalex_authors as the link to the shared OpenAlex ID with a `misattribution_split_id` field
- Top 100 clusters represent the bulk of affected senior researchers

**Dependencies**: None blocking. Can be worked in parallel with other v1.0 priorities.

**Status notes (May 14, 2026)**: Discovered during Step E preflight. Step E (UNIQUE constraint on hcps.openalex_author_id) deferred indefinitely because the constraint would force incorrect deletion of real distinct people. The hcp_openalex_authors join table's UNIQUE(hcp_id, openalex_author_id) is the meaningful integrity constraint we actually need; that constraint is in place.

---

### Drop hcps_name_institution_unique constraint (post-surgery cleanup)

**Context**: This constraint on `(first_name, last_name, institution)` was the ORIGINAL cause of HCP duplication — it forced the PubMed pipeline to dedupe by name+institution, which broke whenever institution strings varied. Step C surfaced this constraint when 30 inventory entries couldn't create new HCPs because matching name+institution rows already existed.

**Why drop**: After Step E adds UNIQUE on `openalex_author_id`, the legitimate identity primitive is in place. The name+institution constraint is now actively counterproductive — it blocks creation of legitimate distinct researchers with similar names at the same institution.

**Risk**: Two distinct people with same name+institution might create duplicate rows. Low frequency in practice. Better than the alternative (blocking legitimate creations).

**Target**: Post-surgery cleanup, before v1.0 launch.

### Reconcile 30 Step-C duplicates

**Context**: During Step C, 30 inventory entries couldn't create new HCPs because matching `(first_name, last_name, institution)` rows already existed in hcps. These are real researchers (Bozkurt at Baylor, Sachin Wani at Colorado, Poultsides at Stanford, Ana M. Grau at Vanderbilt, etc.) whose existing HCP records weren't linked to OpenAlex during Step B.

**The fix**: For each of the 30 collision cases, find the existing HCP and link the inventory entry to that HCP via `hcp_openalex_authors`. Recovers 30 OpenAlex linkages we know are correct.

**Target**: Same day as Step D/E/F. Small focused job.

### Medscape HCP behavioral data licensing

**What it is**: Medscape (WebMD-owned, Internet Brands portfolio) holds first-party engagement data on millions of opted-in US HCPs — what content they read, what specialties they engage with, etc. Their sister company PulsePoint has 3.2M validated NPIs in their Authenticated NPI™ network. Behavioral data on HCP content engagement could augment FieldMark's signal as a refinement layer (e.g., "this rising star is gaining audience attention in their specialty area").

**Why not now**: No public/self-service API. Sold as enterprise licensing or advertising platform access through their commercial team. Likely five to six figures annually. Pre-launch independent product can't justify the cost. Sales cycle is months.

**When this becomes interesting**: Post-launch with commercial traction (revenue, MSL community, network effects to offer in return). Partnership conversation rather than vendor purchase. v2.0+ realistic at earliest.

**Discussed**: May 13, 2026 session — Garrett raised interest in HCP behavioral data; both parties agreed to defer.
