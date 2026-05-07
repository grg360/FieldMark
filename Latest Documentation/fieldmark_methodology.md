# FieldMark Scoring Methodology

**Version:** 1.3 (in development)
**Last updated:** May 2, 2026
**Status:** Living document — updated as decisions are made

---

## Purpose

This document describes the methodology FieldMark uses to identify rising-star healthcare professionals (HCPs) and digital opinion leaders (DOLs) for pharmaceutical Medical Science Liaison (MSL) teams. It exists to provide methodological transparency to users, partners, and the broader medical affairs community.

FieldMark's central claim is that traditional KOL identification systematically over-weights signals that correlate with established status (Phase 3 PI roles, citation totals, top-tier institution affiliation) and under-weights signals that correlate with emerging influence (early-phase trial activity, citation trajectory, multi-sponsor research engagement, investigator-initiated work). This document explains how FieldMark's scoring reflects that thesis.

## Product positioning — tight and refined

FieldMark is a curated database, not a comprehensive one. Where commercial KOL databases (H1, OpenData, Veeva) compete on coverage volume — pulling claims data, NPPES, and licensing boards to surface 100K-500K HCPs per major therapeutic area — FieldMark deliberately surfaces a smaller, focused cohort of researchers and clinical opinion leaders who shape practice through trials, publications, guidelines, society leadership, and peer influence.

The buyer (pharmaceutical medical affairs, specifically MSL teams) doesn't need 200,000 oncologists. They need to identify and build relationships with the few hundred HCPs per program who matter most for their drug. The volume databases solve a sales-targeting problem, not a medical affairs problem. FieldMark addresses the medical affairs problem directly.

Consequence for methodology: every HCP earns their place through demonstrated research activity. Rising star and KOL classification is editorial, not exhaustive. Quality of ranking matters more than count of records. A buyer who sees five non-clinicians, lab researchers, or industry employees in the top 50 doesn't think "minor data quality issue" — they think "this isn't actually curated." The audit pattern that surfaces and fixes these issues is therefore not optional polish; it's the proof that curation is real.

This positioning shapes downstream methodology decisions:
- Industry exclusion filters and credential validation are not edge cases; they are central to the product claim
- The pub_velocity formula plateau cluster (where 47 of 50 Hepatology rising_stars sit at composite 19.77) is existential because tight-and-refined positioning requires that ranking variance reflect actual differentiation, not formula degeneracy
- HCP database expansion is selective rather than bulk — we pull additional data for HCPs already qualified by research activity, not bulk-ingest clinicians without research evidence
- The matching ceiling on trial-investigator data (~10-20% of US site PIs resolving to HCPs in our database) is a feature, not a bug — site PIs without research footprint don't belong in the curated database; they appear as text-only orbit nodes for geographic/institutional intelligence

The pitch this enables: "H1 gives you 200,000 oncologists. We give you the 2,000 oncologists who matter, plus the network they operate in. Our database is curated; every HCP earns their place through demonstrated research activity. When you see a Rising Star in FieldMark, you can trust the ranking — we filter out non-clinicians, lab researchers, and industry employees that pollute traditional databases. The HCPs we rank are the HCPs you should engage."

---

## Core thesis

A rising star is an HCP whose research, clinical, and digital activity profile indicates increasing influence within a therapeutic area, but who has not yet been identified as a key opinion leader by traditional databases.

The four characteristics of a rising-star profile:

1. **Recent activity.** Publications, trials, and citations are concentrated in the last 1-3 years rather than spread across a long career.
2. **Trajectory over volume.** Citation rate is increasing year-over-year, even if total citations remain modest.
3. **Multi-source engagement.** The HCP is being sought out for research collaborations across multiple sponsors and institutions, indicating emerging recognition.
4. **Substantive role in early-phase or investigator-initiated work.** They are designing or co-designing studies, not just executing late-phase industry trials.

Established KOLs may share some of these characteristics but typically score higher on legacy metrics (h-index, total citations, Phase 3 PI roles, single-institution dominance). FieldMark surfaces both groups but defaults to the rising-star view.

---

## Data foundation

### Sources

- **Publications:** PubMed, supplemented by OpenAlex for citation counts and DOI resolution
- **Clinical trials:** ClinicalTrials.gov v2 API, queried investigator-first against NPI-verified HCPs
- **HCP identity:** NPPES NPI Registry for verification
- **Institution data:** NPPES practice address, cross-referenced with NIH RePORTER and NCI Cancer Center designations
- **Digital presence:** Twitter/X and Bluesky public profiles
- **Bibliometric metrics:** Google Scholar h-index, citations total, i10-index
- **MSL contributions:** Anonymous structured contributions from verified MSL users (post-launch)

### Coverage as of v1.2

- 141,724 total HCPs
- 233,466 publications
- 5,860 NPI-verified US physicians
- 1,907 HCPs with Google Scholar metrics
- 51,355 HCPs with cleaned institution names
- 697 HCPs with verified social media handles

---

## Scoring components

FieldMark computes raw component scores per HCP per therapeutic area, then combines them into composite scores using two weight profiles (Rising Stars, Established KOLs).

### Trial Investigator Score (Rising-Star Matrix)

Trial activity is scored using a recency-weighted, role-aware, phase-stratified matrix designed to reward emerging research engagement.

#### Base weights by role × phase × recency

| Role × Recency | Phase 1 / Early Phase 1 | Phase 1/2 or Phase 2 | Phase 2/3 or Phase 3 | Phase 4 / NA / null |
|---|---|---|---|---|
| **PI, last 3 years** | 90 | 80 | 50 | 40 |
| **PI, 3-7 years ago** | 60 | 50 | 30 | 25 |
| **PI, 7+ years ago** | 30 | 20 | 15 | 10 |
| **Sub-I, last 3 years** | 70 | 60 | 35 | 30 |
| **Sub-I, 3-7 years ago** | 40 | 30 | 20 | 15 |
| **Sub-I, 7+ years ago** | 15 | 15 | 10 | 5 |
| **Study Chair / Director** | 50% of equivalent PI weight in same column |

#### Rationale for weighting choices

- **Phase 1 PI weights higher than Phase 3 PI** for recent activity (90 vs 50). This is the most consequential and counterintuitive design choice. Rationale: rising-star clinicians lead early-phase trials because they are at the scientific frontier, often working on novel mechanisms or populations. Phase 3 PI roles are typically held by senior faculty selected by industry sponsors based on existing recognition — a signal of established status, not emerging influence.
- **Recency dominates phase.** A Phase 1 PI in the last 3 years (90) outweighs a Phase 3 PI from 7+ years ago (15). Trial activity that is 7+ years old is treated as historical context rather than current signal.
- **Sub-investigator roles are weighted lower than PI but not dismissed.** Sub-I on a recent Phase 1 (70) is treated as stronger signal than PI on an old Phase 3 (15). Sub-investigators on early-phase trials are typically junior faculty or fellows being mentored into trial leadership.
- **Hybrid phase trials use the upper phase.** PHASE1; PHASE2 trials are scored as Phase 2. PHASE2; PHASE3 as Phase 3. This honors the upper bound rather than penalizing combined-phase studies.
- **No-phase trials (null or NA) receive moderate weight.** Approximately 55% of trials have no phase classification, primarily observational studies and registries. Observational research run by recent PIs is a real rising-star signal and is weighted at 40 (vs the original default of 20).
- **Study Chair and Study Director roles receive 50% of equivalent PI weight.** These roles indicate oversight authority but typically without day-to-day trial leadership. Recognized but not equated with PI status.
- **CONTACT roles are excluded entirely.** ClinicalTrials.gov "Contact" entries are administrative trial coordinators, not research investigators. They are filtered out at ingestion, not at scoring.

#### Multipliers (applied after base score)

- **+50% if any trial has investigator-initiated sponsor classification AND HCP has 2+ trials total.** Investigator-initiated trials (IITs) — where the academic researcher designs and runs the study, regardless of funding source — are a strong signal of original thinking and emerging influence. Identified through `lead_sponsor_class` in any of: NIH, OTHER (academic, hospital), NETWORK (cooperative groups like SWOG, ECOG-ACRIN, COG), FED (federal agencies beyond NIH including DoD, VA), or INDIV (individual investigator-sponsored). `INDUSTRY` is the only class that does NOT count as IIT. Secondary signal: `responsible_party_type = SPONSOR_INVESTIGATOR`.
- **+25% if single IIT trial only.** Partial bonus for a single investigator-initiated trial, scaled to avoid inflating HCPs with limited overall trial activity.
- **+15% per additional unique sponsor, capped at +60%.** Multi-sponsor activity indicates the HCP is being sought out by multiple research partners. A clinician who has worked with five different sponsors is a stronger signal than one who has worked with one sponsor on five trials.
- **+10% per additional unique trial, no cap.** Trial multiplicity is a leading indicator of emerging research influence.
- **Final score capped at 100.**

#### Excluded from scoring

- Trial investigator entries with role = CONTACT (administrative coordinators, not investigators)
- Trials with no resolvable phase or status data
- Trials marked WITHDRAWN or terminated before enrollment

#### HCP-to-trial matching methodology

Linking HCPs to clinical trials is the highest-stakes data integrity task in the FieldMark pipeline. A wrong match produces incorrect scoring, surfaces the wrong rising stars, and damages the methodology's credibility. The matching architecture is designed for accuracy first, coverage second.

**Two-stage matching:**

1. **Name match** — the official's name (from CTGov `overallOfficials.name`) must match the HCP's `first_name + last_name` either exactly (after normalization for titles like "MD" or "PhD") or within Levenshtein distance 2. This handles common variations like "John A. Smith" vs "John Smith" or "Dr. Jane Doe" vs "Jane Doe."

2. **Affiliation confidence scoring** — name match alone is insufficient because common names ("John Smith," "Sanath Patil") collide globally. Each candidate match receives an affiliation confidence score from 0 to 100 based on multiple signals. A confidence threshold of 40+ is required to confirm the match.

**Affiliation confidence signals:**

| Signal | Points | Description |
|---|---|---|
| Institution match | 50 | HCP's `institution_short` or `institution_full` substring-matches CTGov official's `affiliation` field, with token-overlap fallback for partial matches |
| HCP city in official affiliation | 40 | The HCP's city string appears within the official's affiliation text (e.g., "Mayo Clinic, Rochester" matches HCP city "Rochester") |
| HCP city matches trial location | 40 | The HCP's city matches the city of any trial location facility from CTGov `contactsLocationsModule.locations` |
| HCP state matches trial location | 30 | The HCP's state (abbreviation or full name) matches any trial location state |
| Facility name matches institution | 20 | A trial location facility name substring-matches the HCP's `institution_short` |

**Confidence interpretation:**

- **60-100 (high confidence)**: Multiple signals agree. Match accepted with high reliability.
- **40-59 (medium confidence)**: One strong signal (typically city or state alone). Match accepted but logged for periodic spot-checks.
- **0-39 (insufficient)**: No reliable affiliation signal. Match rejected. Better to lose a real match than introduce a false one.

**Why this architecture:**

Approximately 62.5% of NPI-verified HCPs in the FieldMark database lack `institution_short` or `institution_full` data — these clinicians are NPI-registered (current practice address known) but have minimal publication footprint, so the publication-derived institution data was never populated. Strict institution-only affiliation matching would systematically exclude this population from trial scoring, even when CTGov clearly identifies them as PI on relevant trials.

City and state from NPI are 100% covered and authoritative — they reflect the HCP's current registered practice location. CTGov trial location data is well-structured and reliably indicates where the trial is being conducted. Combining these as supplementary affiliation signals recovers trial linkage for HCPs without publication-based institution data, while preserving the disambiguation safety net that pure name matching lacks.

**Trial location data storage:**

`clinical_trials.locations` (JSONB column) stores the full `contactsLocationsModule.locations` array from CTGov. This preserves facility name, city, state, country, and geo coordinates for each enrollment site. Stored at ingestion time and used both for affiliation matching and future location-based features (e.g., territory mapping, geographic landscape views).

**Known limitations:**

- Same-name same-city collisions are theoretically possible (two "John Smith"s in Houston, both at MD Anderson). The Levenshtein-2 first-name match prevents most cases, but exact same-name collisions in the same city are not detected by the current pipeline. Manual spot-checks during validation cohort review will surface any such cases. Future versions may add NPI-as-PI cross-verification when CTGov begins exposing investigator NPI numbers in API responses.
- Stale institution data (HCPs whose `institution_short` reflects training history rather than current practice) does not cause false matches — the affiliation confidence scoring tolerates institution mismatch as long as city or state agrees with trial location. The previous strict-institution architecture would have falsely rejected these HCPs; the new architecture recovers them.

**Empirical validation (50-HCP stratified test cohort):**

The matching architecture was validated against a stratified test cohort of 50 NPI-verified HCPs:

- 8 of 50 HCPs (16%) matched at least one trial. All 8 matches were high confidence (60-100 score). Zero medium or low confidence matches.
- 29 total trial linkages produced. Average ~3.6 trials per matched HCP.
- All matches scored at the city+state combined floor (70 points) or higher. The de facto match floor is two independent affiliation signals, not the theoretical single-signal threshold of 40.
- Role distribution: 25 PRINCIPAL_INVESTIGATOR, 3 STUDY_CHAIR, 1 STUDY_DIRECTOR. Zero CONTACT pollution.
- Sponsor class distribution: 15 OTHER (academic/hospital), 12 INDUSTRY, 2 NIH. 59% non-INDUSTRY indicates strong investigator-initiated activity in the matched cohort, validating that the IIT multiplier will fire frequently and produce meaningful score differentiation.

A 16% match rate on NPI-verified HCPs is consistent with the realistic distribution of trial-active clinicians — most NPI-registered physicians practice clinically without leading trials. Extrapolated across the full 5,878 NPI-verified cohort, this projects approximately 940 HCPs with verified trial linkages — a 75% expansion over the original text-search pipeline's 536 distinct HCPs, and at materially higher data quality.

**Full pipeline results (5,828 HCPs processed):**

- 552 HCPs with verified trial linkages (9.5% of NPI-verified cohort — lower than the test cohort's 16% projection)
- 1,729 trials ingested
- 1,730 trial-investigator links
- **All 552 matches were high confidence (60-100).** Zero medium-confidence matches. 16 candidates were rejected at the affiliation confidence threshold, demonstrating the disambiguation safety net rejecting weak signals rather than allowing them through.
- Role distribution: 1,568 PRINCIPAL_INVESTIGATOR, 144 STUDY_CHAIR, 18 STUDY_DIRECTOR. Zero CONTACT pollution.
- Sponsor class distribution: 1,400 OTHER (academic/hospital), 180 INDUSTRY, 103 NIH, 29 NETWORK (cooperative groups), 14 FED (federal beyond NIH), 3 INDIV (individual investigator-sponsored).
- **88% of trials are non-INDUSTRY**, meaning the IIT multiplier will fire on the vast majority of HCPs and produce significant score differentiation under the v1.2 rising-star matrix.

**Architectural inversion outcome:**

The new pipeline produced 552 distinct HCPs with trial activity vs. the prior text-search pipeline's 536. Coverage expansion is modest (3%), but the quality inversion is substantial: zero CONTACT pollution (vs. 30% in prior pipeline), all matches confidence-verified (vs. uncategorized prior), and the data is now structured to support sophisticated scoring (sponsor class, trial locations, role, phase recency). The pipeline rewrite did not primarily expand coverage — it transformed the quality of the existing coverage. For a methodology-driven product, this is the right outcome: 552 trustworthy matches outperform 536 mixed-quality matches in every way that matters for downstream scoring and product credibility.

**Notable validation case — Margaret Fischl, MD:**

Margaret Fischl is a longstanding HIV trialist at the University of Miami, Director of the AIDS Clinical Research Unit, and a sub-investigator on early AZT trials in the 1980s. Her record in the FieldMark database lacked `institution_short` and `institution_full` data — the publication-derived institution enrichment did not populate her record. Under the previous strict-institution matching architecture, every CTGov match would have been rejected. Under the new multi-signal architecture, four distinct trial linkages matched on city + state agreement (Miami, FL). This represents the architectural inversion's central value: surfacing legitimate trial-active clinicians whose data foundation differs from the academic-publication-heavy profile that legacy KOL databases require.

### Trial Investigator Score (Classic / Established KOL Matrix)

For the Established KOL view, trial activity is scored using traditional weights that reward Phase 3 PI roles and downplay early-phase work. *Detailed matrix to be specified during Phase 4 of v1.2 build.*

### Citation Trajectory Score

*To be specified after OpenAlex pipeline expansion captures `counts_by_year` data.*

Currently populated for 1.56% of HCPs. Planned: per-publication year-over-year citation deltas, aggregated per HCP, with emphasis on recent acceleration over total volume.

### Publication Velocity Score

*Existing component, well-populated (99.97% coverage). Documentation pending.*

### H-index Score

*New component for v1.2. Derived from Google Scholar `scholar_h_index` for the 1,907 HCPs with Scholar metrics. Weighted differently in Rising Stars vs Established KOL composites: low weight (5%) for Rising Stars (high h-index correlates with established status, not emerging), high weight (25%) for Established KOLs.*

### Institution Tier Score

*New component for v1.2. Derived from cleaned institution names cross-referenced against curated tier lists. See "Institution Tier Lists" section below.*

### Congress Score

*Currently 0 across all HCPs. Planned for v1.5: PubMed metadata mining for congress abstracts (ASCO, ASH, AHA, AASLD, ACR Annual Meeting, etc.) as an interim signal. Targeted scraping of society abstract databases planned for v2.*

### MSL Signal Score

*Currently 0 across all HCPs (no MSL contributors yet). Architecture defined: anonymous structured contributions from verified MSL users will indicate engagement signals. Will activate as the MSL user base grows.*

### Digital Opinion Leader (DOL) Identification

FieldMark separately identifies Digital Opinion Leaders — HCPs with verified, substantive social media presence on Twitter/X or Bluesky. DOL status is a categorical flag, not a magnitude on the rising-star score. An HCP can be both a rising star and a DOL, or either independently.

#### DOL verification methodology

Social media handles for HCPs are sourced through public profile matching but require a multi-stage verification pipeline before being surfaced in the product:

1. **Algorithmic filtering.** Handles are removed if any of: handle is fewer than 4 characters; handle matches only the HCP's last name (insufficient disambiguation); bio is empty or under 20 characters; bio is non-English while HCP country is USA; bio contains non-clinical professional keywords (lawyer, graphic designer, student, undergraduate); the same handle appears for multiple HCPs (impossible to disambiguate without further verification); follower count is zero.

2. **Bio classification via Claude.** Remaining candidates have their bios analyzed by Claude haiku 4.5 against the HCP profile. The classifier returns a structured assessment of whether the bio describes a clinician or researcher, whether the implied specialty matches the HCP record, whether the implied institution matches, and an overall confidence rating. Only "high" confidence matches are flagged as verified.

3. **Manual spot-check on edge cases.** Medium-confidence matches are reviewed manually before launch.

#### DOL classification outcome

Verified DOLs receive `social_verified = true` in the database. The verification method (algorithmic, claude_classification, manual_review) and reasoning are stored alongside the flag for transparency.

Only verified DOLs surface social handles, follower counts, and DOL badges in the product UI. Unverified social data remains in the database for future re-evaluation but is not displayed.

#### DOL in scoring

In v1.2, DOL status is **display-only and filterable, not scored**. Verified DOLs receive no scoring boost in either the Rising Stars or Established KOLs composite. The decision rationale: digital influence is a real form of HCP influence, but the verified cohort is too narrow (estimated 200-300 HCPs of 141,724) to materially affect composite ranking, and follower count alone is a weak proxy for medical influence without engagement data (impressions, peer replies, sustained activity).

DOL scoring contribution is planned for v1.5 once the verified cohort is broader and engagement data can be captured.

#### Rationale for strict verification

The first-pass social enrichment produced 697 social handles with substantial false-match contamination — generic short handles matched to multiple HCPs sharing common last names; bios revealing the matched account belonged to lawyers, students, businesses, or unrelated individuals in other countries; and zero verified Twitter accounts despite the cohort containing several known high-profile clinicians. Surfacing this data unverified would damage FieldMark's credibility — a wrong DOL match is more harmful than a missing one. The strict verification pipeline trades coverage for trust.

---

## Composite scoring

FieldMark computes two composite scores from the same underlying component scores, using different weight profiles.

### Rising Stars composite (default view)

| Component | Weight |
|---|---|
| Publication velocity | 25% |
| Citation trajectory | 20% |
| Trial investigator (rising-star matrix) | 25% |
| Congress | 10% |
| MSL signal | 10% |
| H-index | 5% |
| Institution tier | 5% |

### Established KOLs composite (toggle view)

| Component | Weight |
|---|---|
| Publication velocity | 10% |
| Citation trajectory | 5% |
| Trial investigator (classic matrix) | 25% |
| Congress | 15% |
| MSL signal | 5% |
| H-index | 25% |
| Institution tier | 15% |

### Tier classification

Composite scores produce four tiers:

- **Dark Horse:** Composite (rising-star) ≥ 95 AND meets all four criteria — score ≥ 85, citation trajectory ≥ +40%, 2+ active trials, career age < 8 years. The rarest tier — fewer than 1 in 12 rising stars qualify.
- **Rising Star:** Composite (rising-star) ≥ 85, not yet established by career age and citation profile.
- **Established:** Composite (rising-star) ≥ 85 AND career age ≥ 18 years (first publication 2008 or earlier) AND high citation total. These are existing KOLs, surfaced for completeness.
- **Emerging:** Composite ≥ 30, below Rising Star threshold but above noise floor.

---

## Validation

### Validation cohort approach

Prior to public launch, FieldMark scoring will be validated against hand-curated cohorts of known rising stars and known established KOLs across the launch therapeutic areas (Hepatology, Oncology, Rare Disease). The methodology is considered validated when the top-100 ranked HCPs in each TA contain at least 80% of the curated cohort for that TA.

### Validated examples (preliminary)

Three rising-star profiles surfaced by v1.1 scoring and validated through external research:

1. **Vratko Himič** — Neuro-oncology, surfaced in oncology TA, confirmed as early-career researcher with significant publication trajectory not present in legacy KOL databases.
2. **Crystal M. Proud, MD** — SMA / pediatric neuromuscular, Director of Neuromuscular Medicine at Children's Hospital of the King's Daughters (Norfolk, VA). Regional academic center, not a top-20 NIH-funded institution. Exact rising-star profile.
3. **Kateryna Fedorov, MD** — Hematology-oncology fellow, FLT3-mutated AML focus, transitioning Montefiore → Vanderbilt. Earliest-career profile of the three; minimal LinkedIn footprint (2 followers); already speaking on OncLive.

These three were surfaced from v1.1 scoring before the v1.2 methodology improvements. Full validation cohort to be built during Phase 7 of v1.2 development.

---

## Data quality and limitations

This section documents known limitations honestly. Updated as gaps are identified or closed.

- **Trial coverage** is limited to NPI-verified US physicians (5,878 HCPs as of v1.2). Non-NPI HCPs (~136,000) lack reliable disambiguation and are not currently scored on trial signal. Coverage expansion planned for v2.
- **NPI verification gap.** Approximately 5,878 HCPs in the database have NPI numbers, of which only 2,207 (37.5%) also have publication-derived institution data. The remaining 3,671 NPI-verified HCPs are practicing clinicians without significant publication footprint. They are scored on trial activity using NPI city/state as the affiliation signal, but lack publication velocity and citation trajectory contributions.
- **Stale institution data.** `institution_short` is derived from publication author affiliations and may reflect training history (medical school, fellowship) rather than current practice. The trial matching pipeline accommodates this by allowing city/state agreement to override institution mismatch. Other scoring components (h-index, institution tier) use this field directly and may produce signals that lag the HCP's current institutional position. Manual review during validation will identify systematic cases.
- **Citation trajectory** is computed from total `citation_count` and publication year as a proxy. True year-over-year citation deltas (`counts_by_year`) require OpenAlex pipeline expansion (in progress for v1.2).
- **Congress signal** is not yet populated. Planned for v1.5.
- **MSL signal** is empty until MSL contributors are onboarded (post-launch).
- **Investigator-initiated trial detection** uses `lead_sponsor_class != INDUSTRY` as the primary heuristic. Industry-funded but investigator-designed trials (industry IIRs) are not currently captured and may be undercounted.
- **International HCP coverage** is partial. NPI is US-only; international physicians are present in publication data but lack institutional verification.
- **Same-name same-city collisions** are not currently detected. Two distinct clinicians named "John Smith" practicing in the same city would both match trials in that city. This is a theoretical limitation; manual review during validation cohort building will surface any actual cases.
- **HCP identity fragmentation.** The publication ingestion pipeline created multiple HCP records for individuals whose name appeared on papers with varying affiliation strings. The most prolific researchers in launch therapeutic areas were most affected: Rohit Loomba (UC San Diego hepatology) appeared in 82 separate rows; Arun Sanyal (VCU) in 55; Zobair Younossi (Inova) in 43; Mazen Noureddin (Houston Methodist) in 40; Stephen Harrison (NASH) in 38. After classifier refinement (country normalization, institution equivalence whitelist, elimination of fallback-review category), 45,487 rows consolidated into 33,965 canonical individuals, reducing the database from 141,724 rows to 96,237 distinct HCPs. Fragmentation systematically degraded scoring for the most important HCPs: their publications, citations, trial linkages, and NPI verifications were split across rows, causing each fragment to score below its true signal. Future ingestion runs are protected against re-fragmentation by the identity-resolution decisions documented above (NPI matching, ORCID capture, weekly dedupe audit). 6,174 groups (21,544 rows) remain in a manual-review backlog (Category C) for post-launch resolution.

---

## Privacy and ethics

- HCPs may opt out of FieldMark profiles at any time via a public opt-out flow. Opted-out HCPs are excluded from all scoring and display.
- HCPs may claim their profile to correct or augment publicly sourced information. Claimed profiles include a verification badge.
- No private practice data, prescribing data, or patient-related data is used in FieldMark scoring.
- All MSL contributions are anonymous to other MSLs but tied to a verified contributor identity for accountability.
- FieldMark does not sell HCP data. Composite scores and rankings are accessible only to authenticated MSL users within their organization's seat allocation.

---

## Versioning

- **v1.0** — Initial pub_velocity-only scoring. December 2025 prototype.
- **v1.1** — Added career age multiplier, basic citation trajectory and trial investigator components. April 2026.
- **v1.2** — Investigator-first trial pipeline with NPI verification, IIT detection, dual rising/established composites, h-index and institution tier components, recency-weighted trial scoring matrix.
- **v1.3** — Frontend tier alignment with backend methodology, normalized_score view migration, USA-filter removal, taCounts effect wiring, trailing-period country normalization, percentile-based score display for dark horses, methodology integrity audit (32% duplicate hcp_scores rows deleted, unique constraint added, tier classification rebuilt with null-handling guards, MIN_TOTAL_CAREER_PUBS eligibility gate enforced, narrative refusal contamination cleaned, industry employee exclusion at query layer, "PUB YEARS" rename, OpenAlex citation enrichment completed at 55% coverage with 80% positive-trajectory signal validation). **(Current development.)**
- **v1.5** — Congress signal via PubMed mining, expanded citation trajectory via OpenAlex `counts_by_year`. Planned.
- **v2.0** — Non-NPI HCP trial coverage, society abstract scraping, MSL contribution scoring activation. Planned.

---

## Decision log

This section records significant methodology decisions and the rationale at the time. Updated as decisions are made.

### April 30, 2026

- **Decision:** Phase 1 PI weighted higher than Phase 3 PI for recent activity (90 vs 50). **Rationale:** Phase 3 PI roles correlate with established status, not emerging influence. Reinforces FieldMark's rising-star thesis.
- **Decision:** CONTACT trial role excluded entirely from scoring. **Rationale:** ClinicalTrials.gov CONTACT entries are administrative coordinators, not research investigators. Including them as low-weight signal pollutes the trial score with non-research activity.
- **Decision:** Hybrid phase trials (PHASE1; PHASE2, PHASE2; PHASE3) scored at the upper phase rather than the lower or an average. **Rationale:** Combined-phase studies are typically dose-finding rolling into expansion. The upper phase reflects the eventual study scope.
- **Decision:** No-phase trials (null or NA) scored at 40 for recent PIs rather than the default 20. **Rationale:** 55% of trials lack phase classification, primarily observational studies and registries. Observational research is a real signal, especially for early-career PIs. Default-collapsing to 20 systematically under-counts this work.
- **Decision:** IIT multiplier set at +50% for HCPs with 2+ trials including IIT activity. **Rationale:** Investigator-initiated work is the strongest signal of original thinking and emerging influence in the trial domain. The 2+ trial threshold prevents single-IIT inflation.
- **Decision:** Trial scoring computed in two parallel forms (rising-star matrix and classic matrix), with one composite scoring formula per view. **Rationale:** Same underlying data, different lenses. MSLs need both views — rising stars for landscape work, established KOLs for traditional engagement.
- **Decision:** Default product view is Rising Stars; Established KOLs is a toggle. **Rationale:** Rising stars is the differentiated, on-thesis view. Established KOLs is for completeness. The brand identity is rising stars.
- **Decision:** Trial pipeline rewritten as investigator-first against NPI-verified HCPs. **Rationale:** The original text-search-based pipeline produced 30% pollution from CONTACT roles and missed disambiguation. NPI verification provides clean name + institution matching at the API level.
- **Decision:** Social media data hidden from product UI until multi-stage verification pipeline runs. **Rationale:** The first-pass enrichment produced 697 social handles with high false-match contamination (generic last-name handles matched to multiple HCPs, bios indicating lawyers, students, and businesses rather than clinicians, zero verified Twitter accounts). Unverified social data damages credibility more than missing social data. Verification combines algorithmic filtering, Claude bio classification, and manual spot-check on edge cases. Estimated 200-300 verified DOLs from the original 697.
- **Decision:** Verified DOL status is display-only and filterable in v1.2, not scored. **Rationale:** Verified DOL cohort is narrow (~0.18% of HCPs), follower count alone is weak signal for medical influence, and engagement data needed for true digital influence scoring is not yet captured. DOL scoring contribution planned for v1.5.
- **Decision:** Trial-to-HCP matching uses multi-signal affiliation confidence scoring (institution + city + state + trial location) rather than strict institution-only matching. **Rationale:** 62.5% of NPI-verified HCPs lack institution data, and existing institution data sometimes reflects training history rather than current practice. Strict institution matching would systematically exclude legitimate trial relationships. Multi-signal scoring with a confidence threshold (40+) preserves disambiguation while accommodating the realities of the data foundation. Accuracy is prioritized over coverage — affiliation signal is required, never name-only matching.
- **Decision:** Confidence threshold for trial match acceptance set at 40 (city alone qualifies). **Rationale:** NPI city/state are 100% covered and authoritative (current practice address). CTGov trial locations are well-structured and reliable. Combining these signals at threshold 40 captures legitimate matches without sacrificing safety. The strict alternative (threshold 60+, requiring institution match) would lose roughly half of recoverable trial linkages for HCPs without publication-based institution data.
- **Decision:** Trial location data stored as JSONB on `clinical_trials.locations`. **Rationale:** Used during pipeline matching and reserved for future geographic features (territory mapping, landscape views, regional rising star clustering). Storage is cheap; the data is structured and useful beyond the immediate matching use case. No simple solutions — store it.
- **Empirical finding:** The 40-point match threshold is not exercised in practice. All matches in the 50-HCP test cohort scored 70+ from combined city+state signals. The de facto match floor is two independent affiliation signals, which is stricter than the theoretical floor and produces higher-confidence matches than the threshold suggests. The 40-point design is preserved for cases where institution data is rich and city data is unavailable, but combined-signal matching is the dominant pattern.
- **Empirical finding:** Among 29 trials matched in the 50-HCP test, 59% had non-INDUSTRY sponsor classification (academic, hospital, or NIH). This validates that the IIT (+50% / +25%) multiplier in the rising-star trial scoring matrix will fire frequently and produce meaningful score differentiation rather than acting as an edge-case modifier.
- **Decision:** Launch therapeutic areas are Hepatology, Oncology, and Rare Disease. Immunology is deferred to a future "Coming Soon" release. **Rationale:** All three launch TAs have substantive data foundations (Hepatology: 2,753 rising stars, NSCLC/Oncology: 6,549, Rare Disease: 2,034) and hand-curatable validation cohorts. Immunology requires additional therapeutic area mapping work and validation cohort building that would delay launch without proportional value. Better to launch with three well-validated TAs than four with one partially built.
- **Empirical finding (social cleanup Stage 1):** Of 697 social handles in the original enrichment, 270 HCPs (39%) had all social data dropped and 427 HCPs (61%) retained at least one platform handle. Top drop reasons: duplicate handles attributed to multiple HCPs (24 Twitter, 96 Bluesky — primarily algorithmic-generation patterns like `dr<lastname>.bsky.social` mapped to anyone with that surname), non-English bios for HCPs with country=USA (legitimate filter for false matches), bio pattern violations (lawyers, students, businesses), and missing/short bios. Bluesky duplicate-handle pollution (`drxu.bsky.social` matched 13 HCPs, `drjain.bsky.social` matched 8) confirmed that the original Bluesky enrichment was generating handles algorithmically rather than verifying real accounts. Stage 1 dropped these correctly.
- **Decision:** Component score weighting must reflect data coverage. Components with low population coverage (e.g., Scholar h-index covers ~1.3% of HCPs) should not receive their full nominal weight when applied to HCPs lacking that data. Scoring composites must redistribute weight intelligently when components are absent rather than treating missing data as zero signal. Implementation detail to be specified during Phase 4 of v1.2 build, but the principle is committed: **a component with no data should not silently penalize the HCP**. The Established composite weights (which lean heavily on h-index at 25%) will be reduced to a "data-presence-weighted" formula where weights are normalized only across populated components per HCP.
- **Empirical finding (full trials pipeline):** 5,828 NPI-verified HCPs processed. 552 matched to verified trial activity (9.5% match rate). All matches scored ≥60 (high confidence). 16 candidate matches rejected for failing the affiliation confidence threshold — the disambiguation safety net working as designed. 88% of matched trials are non-INDUSTRY sponsor class, meaning the v1.2 IIT multiplier will fire on the vast majority of HCPs and produce strong score differentiation.
- **Decision (refinement):** IIT multiplier triggers expanded to include NETWORK, FED, and INDIV sponsor classes alongside the original NIH and OTHER. **Rationale:** The full pipeline run revealed sponsor classes not anticipated in the original v1.2 design. NETWORK (cooperative research groups like SWOG, ECOG-ACRIN, Children's Oncology Group) is highly investigator-driven by definition. FED (DoD, VA, etc.) is federal-funded research analogous to NIH. INDIV (individual investigator-sponsored) is the strongest possible IIT signal. Only INDUSTRY remains excluded from IIT classification.
- **Empirical finding (architectural inversion):** The new trials pipeline produced 552 distinct matched HCPs vs. the prior text-search pipeline's 536 — a 3% coverage expansion. The far more important outcome is quality inversion: zero CONTACT pollution, all matches confidence-verified, structured data captured for sophisticated scoring. The pipeline rewrite was not primarily a coverage expansion; it was a quality transformation. 552 trustworthy matches outperform 536 mixed-quality matches for every downstream use.
- **Discovery:** HCP identity fragmentation across publication ingestion is severe and systematically affects the most prolific researchers. Top-20 most-duplicated names include Rohit Loomba (82 rows), Arun Sanyal (55), Zobair Younossi (43), Mazen Noureddin (40), Stephen Harrison (38) — every one a known major hepatology KOL or NASH trialist. Approximately 54,840 rows are estimated to consolidate under a name + state match key, reducing the database from ~141K rows to ~110K distinct individuals.
- **Decision:** HCP deduplication becomes a foundational workstream that runs before composite scoring refactor. **Rationale:** Scoring on fragmented identities produces incorrect results for the highest-value HCPs in the database. Rohit Loomba's publications, citations, trial linkages, and NPI verifications are split across 82 rows, causing each fragment to score far below his true signal. Fixing this is more important than any individual scoring component improvement.
- **Decision:** Deduplication match key uses first_name + last_name + state, with non-null state required. Cross-country variations and null-state groups are flagged for manual review rather than auto-merged. Canonical record retention is most-recent-affiliation. Alternative affiliations are preserved as historical metadata in JSONB. **Rationale:** Standard match key with strict requirements prevents conflation of common-name distinct individuals (e.g., multiple "Jing Wang"s). Most-recent-affiliation reflects current institutional position rather than training history. Preserving alternative affiliations retains data integrity for future re-analysis.
- **Decision:** Null values are treated as silence (missing data), not conflict. **Rationale:** A row with null state does not disagree with a row that has state populated; it provides no signal. Treating nulls as conflicts systematically rejects legitimate same-person merges where some publication ingestion runs failed to populate state. The earlier strict implementation rejected the most obviously-mergeable case in the database (Rohit Loomba's 82 rows) because some had null state.
- **Decision:** State and country consensus uses a 90% majority threshold rather than 100% strict agreement. **Rationale:** Outlier values from visiting affiliations (e.g., a researcher's NIH presentation in DC while resident in CA) should not block consolidation when the dominant value is clear. The 90% threshold preserves safety while accommodating realistic data noise.
- **Decision:** Country values are normalized at audit time. Trailing punctuation, embedded email artifacts ("Electronic address: ..."), and country name aliases (UK = United Kingdom, China = People's Republic of China, USA = United States) are collapsed to canonical forms. **Rationale:** The publication ingestion pipeline corrupted the country field with email addresses, trailing periods, and inconsistent country naming. Without normalization, the same researcher with `country = "Spain"` and `country = "Spain. Electronic address: tmacarulla@vhio.net."` is classified as a country conflict. Normalization recovers ~14,000 groups that were incorrectly flagged as international conflicts.
- **Decision:** Institution equivalence whitelist recognizes named-institution variations. The whitelist captures known same-institution patterns (King's College London = KCL, AP-HP = Centre Hospitalier Universitaire de Bicêtre = Hôpital de Bicêtre = Hôpitaux Universitaires Paris-Saclay, UCSD = UC San Diego = University of California San Diego, etc.). Approximately 30 canonical institution groups with associated alias lists. **Rationale:** Publication metadata captures institution names with substantial variation in formatting, abbreviation, and parent-organization references. Pure fuzzy similarity matching misses cases where the same institution appears under genuinely different names (e.g., a French researcher whose papers list AP-HP, then Bicêtre, then Paris-Saclay, all referring to the same hospital system). The whitelist is not exhaustive — it covers the most common variations affecting launch-relevant institutions.
- **Decision:** Eliminated `fallback_review` as a Category C reason. Every duplicate group must receive a specific named reason for its category assignment. **Rationale:** The first classifier iteration produced 25,756 groups with `fallback_review` — meaning the classifier had no specific reason but defaulted to manual review. This was effectively the classifier throwing up its hands. Replacing the fallback with explicit decision logic (state-absent groups with strong signals → Category B, state-absent groups without signals → specific reason in C, etc.) routed those groups to deterministic categories and recovered ~17,000 mergeable groups.
- **Empirical finding (final dedupe audit):** After three classifier refinements (null-as-silence, country normalization, institution equivalence, fallback elimination), the audit produced 13,766 Category A groups (19,807 rows), 20,199 Category B groups (25,680 rows), 6,174 Category C groups (21,544 rows held for manual review), and 137 Category D groups (353 rows correctly identified as distinct individuals). Auto-merge of A+B reduces the database from 141,724 rows to 96,237 rows — a 32% consolidation. Rohit Loomba's 82 rows correctly classified as Category A. Five sample groups newly recovered by the refinements (Jérôme Bouligand at AP-HP, Natasha Leighl at Princess Margaret/Toronto, Kai Huang at Jianghan University, Tong-Zhen Xu at Chinese Academy of Medical Sciences, Loes Maria Latten-Jansen at Maastricht UMC+) all visually verify as legitimate same-person consolidations.
- **Decision:** Category C (6,174 groups, 21,544 rows) is left unmerged for manual review backlog post-launch. Category D (137 groups, 353 rows) is preserved as distinct individuals. Auto-merge proceeds on Category A and Category B together. **Rationale:** Continuing classifier refinement past this point produces diminishing returns. The remaining Category C cases require either manual judgment or additional disambiguation signals (e.g., publication co-author analysis) that are out of scope for the launch-blocking dedupe pass. A 96K-row foundation with 6K manual-review backlog is materially better than indefinite classifier iteration.

- **Empirical finding (post-merge verification, evening of April 30, 2026):** Live merge executed successfully against the 33,965 Category A+B groups. Final database state: 96,237 hcps rows (down from 141,724 pre-merge, exact 32% consolidation as predicted). 13,766 Category A canonical rows + 20,199 Category B canonical rows + 62,272 unmerged distinct = 96,237 total. Zero foreign-key orphans across all five dependent tables (publications, hcp_scores, hcp_therapeutic_areas, trial_investigators, hcp_narratives). The top 20 consolidations are a hepatology Hall of Fame — Rohit Loomba consolidated from 82 rows to 1, Arun Sanyal from 55 to 1, Vlad Ratziu from 37 to 1, Kris Kowdley from 33 to 1, Cynthia Levy from 32 to 1, Eric Gershwin from 28 to 1, Quentin Anstee from 26 to 1, plus other recognizable hepatology and broader medical KOLs. Margaret Fischl consolidated correctly with both NPI (1801850326) and University of Miami institution data preserved on the canonical row. The merge required three live-run iterations to resolve unique constraint patterns (publications hcp_pubmed_unique, hcps NPI uniqueness, alternative_affiliations Json adapter), each of which led to a script fix and resume via a skip-already-merged check rather than a rollback. The skip-on-restart and DELETE-non-canonical-before-UPDATE-canonical patterns are now documented in hcp_merge_pipeline.py for future reuse.

- **Empirical finding (overnight enrichment plan, evening of April 30, 2026):** Three overnight enrichment workstreams were planned: OpenAlex publications-only citation backfill, NPI gap audit, and Google Scholar h-index expansion. Of these, only OpenAlex was kicked off. NPI gap audit revealed two script-side bugs during initial run — schema mismatch (script wrote to non-existent npi_taxonomy and npi_specialty columns; resolved by adding those columns to hcps) and matching-logic bug (NPPES API does not tolerate middle initials in first_name parameter, so HCPs with middle-initial first names like "Carl H" were incorrectly logged as no_results despite NPPES having valid records for them). NPI fix is committed but deferred to morning execution given that overnight running of a script with only one validation case (Carl June) carries the same risk pattern as the merge pipeline's three failed iterations. Scholar enrichment was abandoned for the night when ScraperAPI account hit 100,525 of 100,000 monthly credits — the consolidated cohort is larger than the hobby tier supports, and an upgrade decision was deferred until scoring on current data demonstrates whether Scholar enrichment is materially needed for v1.2 quality. **Decision:** Scholar enrichment depth is a v1.5+ workstream, not a v1.2 launch blocker. The v1.2 composite scoring weights Scholar h-index at 5% (Rising Stars) and 25% (Established KOLs) — for the differentiated Rising Stars view, Scholar gaps are tolerable with data-presence-weighted compositing.

### Second-pass dedupe and identity consolidation findings (May 1, 2026)

- **Empirical finding (post-first-merge audit):** During NPI gap audit testing on a 50-record cohort, an unexpected pattern surfaced: 1,093 same-name-same-state pairs across the database that should have consolidated in the first merge pass but didn't. Root cause: the dedupe classifier grouped duplicate candidates by (first_name, last_name) only. When a researcher's rows spanned multiple states (e.g., "Stuart C Gordon" appearing across DC, VA, and null-state rows due to varying publication metadata), the entire same-name cluster bundled into a single 17-row group. Mixed states triggered `state_genuine_conflict`, kicking the *entire cluster* into Category C manual review — including the obvious DC-DC duplicate pairs that should have been Category A. The classifier's classification *logic* was correct; the *grouping* was too coarse.
- **Decision:** Classifier grouping changed from (first_name, last_name) to (first_name, last_name, state_bucket) with null states bucketed separately. Cross-state same-name patterns are preserved in a new `cross_state_clusters` output section that flags them for manual review without auto-merging. **Rationale:** Within-state same-name pairs are usually the same person; cross-state same-name pairs may be the same person who moved or distinct individuals who happen to share a name. Within-state auto-merge is safe; cross-state requires human judgment.
- **Empirical finding (v2 merge results):** Re-audit produced 1,119 Category A groups (within-state pairs newly recognized as safe) and 318 Category B groups, plus 2,536 cross-state name clusters flagged for manual review. The v2 merge consolidated 2,341 additional rows. Final database state after both merge passes: 93,914 distinct HCPs (down from 141,724 pre-merge originally), 35,382 canonical rows with merge metadata, zero foreign-key orphans. Top consolidations from the v2 merge are launch-relevant KOLs that the first pass missed: Zobair Younossi DC (15 rows merged), Mazen Noureddin TX (8) and CA (8) — Noureddin's case captured the genuine institutional move from Cedars-Sinai LA to Houston Methodist as two correctly-distinguished within-state clusters with cross-state warning preserved. Similar patterns for Robert Gish, Christopher Goss, Naim Alkhouri, Stephen Harrison, and others.
- **Empirical finding (residual fragmentation, expected):** Some major researchers remain partially fragmented after the v2 merge due to first-name variants (e.g., "Zobair" vs "Zobair M"), null-state rows, and cross-state spread. Zobair Younossi appears across 6 distinct canonicals as a result. These are documented in cross_state_clusters and the first-name-variant-pattern output. **Decision:** First-name variants and cross-state same-person consolidation are deferred to v1.5 as a manual-review workstream. The classifier cannot safely auto-merge these without risking false positives on genuinely distinct people who happen to share names. Approximately 50-150 major researchers will require manual reconciliation; this is tractable as a one-time cleanup rather than ongoing.

### Social media strategy pivot (May 1, 2026)

- **Empirical finding (social cohort quality audit, May 1, 2026):** The Stage 1-filtered cohort of 427 candidate social handles (from initial Twitter and Bluesky enrichment) contains substantial false-match noise. Diagnostic check against a known set of 23 active medical DOLs (Loomba, Chalasani, Subbiah, Heymach, Awad, Choueiri, Rugo, Pal, Rinella, Younossi, Sanyal, Noureddin, and others) found that 22 of 23 had no social handle in the database. The single match (Subbiah) was a high-confidence exact name pattern. The 252 surviving social handles after merge attrition are predominantly false matches: "Lei Song" matched to a Bluesky political account, "Karen Messer" to a public defender, "Feng He" to an indie developer, etc. Sample false-match rate in publication-rank-biased subset: ~50%.
- **Decision:** Drop the 252-handle Stage 1 cohort entirely. Null out twitter_handle, bluesky_handle, and all associated social fields on HCPs in the database. **Rationale:** Showing unverified social data implies "FieldMark identifies DOLs" when the data is mostly false matches. Cutting noisy data is more defensible than displaying it. The data is preserved in audit history; the production HCPs table will not surface it.
- **Decision:** v1 launches without social/DOL display. Marketing copy will not claim DOL identification capability for v1. **Rationale:** A half-broken DOL feature is worse than no DOL feature for product credibility. The methodology is honest about what's in v1 and what's coming in v1.1.
- **Decision:** v1.1 (post-launch update tied to ASCO 2026 in late May / EASL 2026 in mid-June) will introduce hashtag-based DOL identification. The approach: capture posts using conference-relevant hashtags (#ASCO2026, #ASCO2026, #ESMO2026, #EASL2026, #AASLD2026, etc.) via Twitter/X API; filter at API level using `min_faves` operator to capture engagement-validated posts; extract unique handles; match back to FieldMark HCPs via name + bio + institution signals; surface verified handles in product. **Rationale:** Hashtag-based discovery is behavioral rather than name-matching. Anyone tweeting #ASCO2026 from the conference has self-selected as in-domain. Engagement filtering captures the posts and posters who matter, not just any account with a medical-sounding name. This approach mirrors how MSL teams already think about DOL identification: people *visibly active at conferences*, not anyone with a medical handle.
- **Decision:** Twitter/X API access via pay-per-resource pricing (Posts: Read at $0.005/post, User: Read at $0.010/user) with a $50/month spending cap during conference seasons. **Rationale:** Pay-per-resource favors FieldMark's spiky usage pattern (heavy during conferences, near-zero between). Estimated total spend across ASCO + EASL + AASLD: $200-600. Pre-conference monitoring is also valuable as researchers tweet about accepted abstracts and scheduled sessions in the weeks before meetings; this captures intent and engagement signal earlier than during-conference noise.
- **Decision:** Bluesky API access (free) runs in parallel as a hedge against Twitter platform stability and to capture early-adopter medical professionals. **Rationale:** Bluesky has lower medical adoption than Twitter but is growing, and free API access removes platform-risk from the v1.1 social strategy. Capturing both platforms doubles the seed data without doubling the cost.
- **DOL scoring placement remains v1.5+:** v1.1 introduces verified DOL display; v1.5 introduces DOL signal as a scoring component. This staged release prevents premature commitment to DOL methodology before sufficient data exists to calibrate it.

- **Empirical finding (merge execution, April 30, 2026):** Live merge completed successfully against the consolidated audit. Final state: 96,237 hcps rows (down from 141,724), 33,965 canonical rows with merge metadata, zero foreign-key orphans across publications, hcp_scores, hcp_therapeutic_areas, trial_investigators, and hcp_narratives. Top consolidations matched the predicted hepatology Hall of Fame: Rohit Loomba (82 → 1), Arun Sanyal (55 → 1), Vlad Ratziu (37 → 1), Kris Kowdley (33 → 1), Cynthia Levy (32 → 1), Eric Gershwin (28 → 1), Quentin Anstee (26 → 1), Gideon Hirschfield (24 → 1), Frank Tacke (19 → 1), Mary Rinella (18 → 1). All visually verify as legitimate same-person consolidations. Margaret Fischl (the NPI consolidation case) successfully unified NPI 1801850326 with University of Miami Miller School of Medicine institutional data into a single canonical record. The merge required four execution attempts: the first three discovered missing FK conflict-handling patterns (publications unique constraint on pubmed_id, alternative_affiliations JSONB binding via psycopg Json adapter, within-non-canonical-set duplicate dedupe, hcps_npi_number_key constraint requiring DELETE-before-UPDATE ordering). Each iteration was caught early via per-group transactional rollback, leaving database state recoverable. The dry-run-first methodology and skip-on-restart logic enabled iterative debugging without data loss.

- **Decision:** Scholar h-index enrichment is deferred. **Rationale:** ScraperAPI hobby tier (100K monthly credits) was exhausted before completing enrichment of the post-merge cohort. Upgrading to a higher tier ($149/mo) would close the gap but represents a meaningful spend pre-launch for a component scored at 5% weight in the Rising Stars composite (the differentiated default view). The strategic case for the upgrade should be evaluated against post-merge scoring results: if rankings on the consolidated cohort are well-calibrated without Scholar improvements, the upgrade is unnecessary. If rankings demonstrate that Scholar gaps materially harm the Established KOLs view (where h-index is 25% weight), the upgrade is justified. Decision deferred until validation cohort runs against the consolidated foundation.

- **Decision:** NPI gap audit script requires logic fixes before re-execution. **Rationale:** Initial overnight launch revealed two issues: (1) script attempts to write to hcps.npi_taxonomy and hcps.npi_specialty columns that do not exist in the schema (every successful NPPES match failed the database write); (2) script-side matching logic incorrectly classifies known clinicians as "no_results" (Carl June at UPenn, NPI 1386687689, returned by direct NPPES API call but flagged no_results by the script). Both issues are tractable but require fresh-eyes diagnostic work. Adding `npi_taxonomy` and `npi_specialty` columns to hcps schema and identifying the matching-logic bug are scoped for May 1.

### Ingestion architecture (preventing re-fragmentation)

The need for a 33,965-group dedupe pass on 141,724 rows revealed that the original PubMed ingestion pipeline lacked identity-resolution logic. New HCP rows were created whenever an author appeared with an affiliation string that did not exactly match an existing record, so a single researcher writing papers with "UC San Diego," "University of California, San Diego," and "UCSD School of Medicine" created three separate HCP records. The ClinicalTrials.gov ingestion does not have this problem because the rebuilt trial pipeline matches investigators against existing NPI-verified HCPs rather than creating new records.

The following architectural decisions govern future ingestion to prevent re-fragmentation:

- **Decision:** PubMed ingestion must run identity-resolution logic before creating a new HCP row. The matching priority is: (1) exact NPI match on (first_name, last_name, NPI); (2) state match on (first_name, last_name, state); (3) canonical-institution match using the institution equivalence whitelist; (4) only create a new HCP row if none of the above match with high confidence. **Rationale:** This is the dedupe classifier running at ingestion time rather than as post-hoc cleanup. Each new publication's author is checked against the canonical HCP foundation before adding to it. This prevents the next ingestion run from recreating the fragmentation we just consolidated.
- **Decision:** ORCID identifiers will be captured at ingestion when PubMed provides them, stored on the hcps table, and used as a deterministic match key when present. **Rationale:** ORCID is a stable researcher identifier provided by approximately 30-40% of recent PubMed publications and growing. When ORCID is available, identity resolution is exact rather than fuzzy. Capturing it at ingestion time is essentially free and substantially reduces future fragmentation risk for the cohort of researchers who use it.
- **Decision:** A weekly lightweight dedupe audit will run on rows added since the last audit. Newly-introduced fragmentation is caught within seven days rather than discovered at scale months later. **Rationale:** Even with pre-ingestion identity resolution, edge cases will produce some duplicates (e.g., a researcher writing under a name variation that does not match any existing record). Detecting these within a week is operationally trivial; allowing them to accumulate produces another 33,965-group cleanup pass.
- **Decision:** Affiliation will eventually move from being a property of the HCP record to being a property of the publication-HCP link. The current `alternative_affiliations` JSONB on hcps is an interim consolidation; the longer-term architecture stores per-publication affiliation on a join table or directly on the publication-author relationship. **Rationale:** Researchers move institutions during their careers. Capturing publication-time affiliation is a real signal (it tells us where a paper was written), not noise. The current design conflates "what institutions has this researcher been at" with "what is this researcher's current institution," forcing the merge process to pick one canonical answer when both are true. This refactor is deferred to post-launch — the immediate cost is too high relative to the marginal accuracy gain — but the direction is committed.
- **Decision:** ClinicalTrials.gov ingestion is not modified. **Rationale:** The rebuilt trial pipeline already matches investigators against existing NPI-verified HCPs using multi-signal affiliation confidence scoring. It does not create new HCP records from CT.gov data. The fragmentation problem is publication-side and solved by the changes above; the trial side is already correct.

### May 1, 2026 — DOL pipeline, methodology recovery, and frontend integration

#### Twitter/X DOL identification — operational

- **Decision:** Twitter API hashtag capture pipeline implemented and operational. Configured hashtags for first capture run: #ASCO26, #MASLD, #NSCLC, #raredisease. Captured 256 unique social_users; high-confidence matches against FieldMark HCPs produced 8 verified DOLs across launch TAs.
- **Empirical finding (first DOL capture run):** 8 verified DOLs identified — Toni K Choueiri (Dana-Farber, 44.5K followers), Naveen Pemmaraju (MD Anderson, 20.6K), Mazyar Shadman (Fred Hutchinson, 3.0K), Anoop Misra (Fortis C-DOC, 29.1K), Arsela Prelaj (INT Milano, 1.3K), Alessio Cortellini (Imperial/Campus Bio-Medico, 1.1K), Giada Sebastiani (McGill, 586), Shrinidhi Nathany (Fortis Memorial, 321). Distribution: 5 NSCLC, 2 Hepatology, 2 Rare Disease (Nathany cross-tagged NSCLC and Rare Disease). Total Twitter API spend approximately $5.42 of $57 monthly cap. Confirms hashtag-based discovery surfaces real, recognizable medical voices at low cost.
- **Decision:** match_confidence levels on dol_matches use three-tier scheme — high (institution + bio + name signals all aligned), medium (two of three signals), low (single signal or weak signals). Only high-confidence matches surface in product UI. Medium and low are retained in the database for audit and future calibration.
- **Decision:** Bluesky parallel capture pipeline scaffolded but deferred to v1.5 implementation. **Rationale:** Twitter/X hashtag capture proved sufficient for the launch DOL cohort; Bluesky adoption among medical professionals remains low enough that the marginal cohort gain does not justify the parallel pipeline maintenance cost pre-launch. The scaffolding is preserved so v1.5 implementation does not require architectural rework.

#### Tier classification — methodology recovered, validated, and refreshed

- **Empirical finding (methodology audit, May 1, 2026):** Tier classification logic was found to be missing from the codebase despite tier values existing on all 137,770 hcp_scores rows. The scoring pipeline (scoring_pipeline.py) computes composite_score and component scores but does not write tier values; tier was assigned by an ad-hoc SQL UPDATE run interactively on April 30, 2026 (all 137,770 rows share calculated_at timestamp 2026-04-30 13:54:08). The original tier-assignment SQL was not committed to the repository.
- **Decision:** Tier classification methodology recovered from prior conversation history (conversation_search tool used). The recovered methodology uses the hcp_normalized_scores view (PERCENT_RANK partitioned by therapeutic_area_id over composite_score) rather than raw composite_score thresholds, with the following CASE assignment order:
  ```
  WHEN normalized_score >= 95 AND pub_velocity > 0 AND citation_trajectory > 0 → dark_horse
  WHEN normalized_score >= 85 AND first_pub_year < 2008 → established
  WHEN normalized_score >= 85 → rising_star
  WHEN normalized_score >= 30 → emerging
  ELSE → unranked
  ```
  Critical: established branch must precede rising_star to prevent CASE-statement bug where rising_star catches all >=85 rows before established can evaluate. The bug had occurred in prior chat work and the recovered methodology incorporates the fix.
- **Decision:** Tier classification re-run against post-merge HCP foundation using recovered SQL. **Rationale:** Pre-merge tier values referenced HCP IDs that were consolidated during the v1 and v2 merge passes, producing stale classifications for the most-fragmented researchers. Re-run aligns tier values with current canonical HCP rows.
- **Empirical finding (post-refresh tier distribution):**
  - Hepatology: 6,980 rising_star / 318 dark_horse / 1,750 established / 2,750 emerging
  - NSCLC: 8,887 rising_star / 239 dark_horse / 2,855 established / 13,860 emerging
  - Rare Disease: 6,670 rising_star / 1,648 dark_horse / 659 established / 0 emerging

  Distribution validates expected nesting (rising_star > dark_horse) in NSCLC and Rare Disease. Hepatology shows higher dark_horse count than expected; root cause is sparse population of citation_trajectory_score and trial_investigator_score (which feed dark_horse classification) and TA-specific composite_score distribution. Cross-TA total: 22,537 rising_star, 2,205 dark_horse, 5,264 established, 16,610 emerging, 91,154 unranked. Total tier-classified rows: 137,770.
- **Decision:** Tier classification SQL is documented here in the methodology doc as the source of truth. Future scoring re-runs will execute this same UPDATE explicitly post-scoring. **Rationale:** Tier assignment is a derived classification on top of scoring; conflating the two in scoring_pipeline.py would couple methodology decisions that should remain independently versionable. Documenting the SQL in methodology and running it explicitly preserves separation while preventing future loss of the assignment logic.
- **Decision (reaffirmed):** FieldMark scoring is intentionally designed to surface unknown/lesser-known HCPs, not established giants. Major researchers (e.g., Heymach, Subbiah, Wakelee, Younossi) frequently score 0 or unranked because their data shape (long careers, high career publication counts, established status) deliberately deprioritizes them in the rising-star methodology. **Rationale:** Established KOLs are already known to MSL teams; identifying them adds no product value. The differentiation against traditional KOL platforms is identifying who is *becoming* important, not ranking who is already known. This is a feature, not a methodology gap. Validation that scoring "missed" prominent names is a positive signal that the methodology behaves as designed, not a bug to fix.

#### Frontend integration — DOL panel and real counts

- **Decision:** Verified DOL display surfaces above the rising-star feed as a horizontal-scrolling hero panel, anchored to the currently-selected therapeutic area. Each DOL card shows display name, institution_short, follower count, bio preview (two lines), platform indicator, and a teal/cyan accent border-left distinguishing it from the gold-bordered HCP cards. Card tap opens the social profile in a new tab. Panel returns null gracefully when no verified DOLs exist for the selected TA. **Rationale:** DOL identification is one of FieldMark's distinctive capabilities versus traditional KOL platforms. Surfacing it prominently on the feed without dominating the rising-star content matches the product thesis: rising stars are the core, DOLs are the differentiator on top.
- **Decision:** Therapeutic area selection screen displays real per-TA counts of rising_stars, dark_horses, and (implicitly through DOL panel rendering) verified_dols. Numbers populate via getAllTACounts() on mount; loading state uses em-dash placeholders rather than zeros to avoid implying empty data. **Rationale:** Real counts replace the prior hardcoded placeholder values (40 dark horses, etc.). With validated tier methodology, the counts are defensible to MSL customers asking "how many rising stars in X TA?". Em-dash during load is more honest than a transient zero.
- **Empirical finding (frontend RLS gaps):** Initial DOL panel implementation surfaced previously-missing RLS policies on hcp_therapeutic_areas, therapeutic_areas, dol_matches, and social_users — all four had RLS enabled with no SELECT policies, blocking all anon reads. The existing hcps and hcp_scores tables had public_read policies in place; the new tables for the DOL feature did not. Public read policies (TO public USING true) added matching the existing pattern.
- **Empirical finding (opt_out gate):** The existing hcps_public_read RLS policy filters by `opt_out = false`. Of 8 verified DOLs, only 2 had explicit opt_out=false; the other 6 had NULL opt_out, which fails the equality check. The frontend received only 2 of 8 verified DOLs through the API. **Decision:** All NULL opt_out values normalized to false across the entire hcps table (93,914 rows affected). **Rationale:** opt_out semantically means "the HCP has explicitly requested removal from FieldMark"; NULL means "no explicit choice has been made", which should default to visible. NULL-as-not-opted-out is the safer default and aligns the field's semantics with its expected behavior in queries.
- **Empirical finding (PostgREST URL length):** Initial getVerifiedDOLs implementation queried hcp_therapeutic_areas first to get the HCP cohort for a TA, then filtered hcps using `.in("id", taHcpIds)`. For NSCLC the taHcpIds array contains 38,219 UUIDs, blowing past PostgREST's URL length limit and producing 400 Bad Request errors. **Decision:** Query order inverted. Verified DOLs are a small global set (8 rows), so fetch them first, then look up their TA assignments and filter in JavaScript. The reordered pattern eliminates the URL length issue while preserving query correctness.
- **Empirical finding (statement timeouts on count queries):** First version of getTACounts produced 500 Internal Server errors on hcp_therapeutic_areas count queries with embedded inner-join (`hcps!inner(id)`) — Supabase statement timeout (8 seconds) was exceeded. Required fix combined adding indexes (idx_hcp_scores_ta_tier, idx_hcp_scores_tier, idx_hcp_scores_ta_score, idx_hta_ta_hcp, idx_hcps_verified_dol partial-on-true) and refactoring the verified DOL count to a two-step query approach (fetch verified HCP IDs first, then count occurrences in the TA), eliminating the inner-join. Post-fix query timing dropped to under 100ms.
- **Decision:** All future Supabase queries against tables with >100K rows must verify index coverage of the WHERE columns before deployment. **Rationale:** PostgREST's default 8-second statement timeout is unforgiving for unindexed scans on large tables. The error mode (HTTP 500 with "canceling statement due to statement timeout") obscures the underlying cause and produces inconsistent UI behavior (cards rendering or not depending on which queries timed out). Index-first query design is operationally cheaper than post-hoc 500 debugging.

#### Data hygiene — name capitalization

- **Empirical finding (lowercase name audit):** Diagnostic across the post-merge HCP foundation surfaced 90 first names and 161 last names stored entirely in lowercase (e.g., "anoop misra", "arsela prelaj"). Separately, approximately 8,000 names appeared truncated due to PubMed UTF-8 ingestion failures — characters such as Turkish ş/ç/ğ/ı/ö/ü and Polish ą/ć/ł were stripped during ingestion, leaving fragments like "Ali zdemir" (originally Ali Özdemir) and "agatay etinkaya" (Çağatay Çetinkaya).
- **Decision:** Apply INITCAP only to names that are entirely lowercase with length ≥3 characters, leaving mixed-case names untouched. **Rationale:** INITCAP is destructive on intentional capitalization (AbdiGhani → Abdighani, McDowell → Mcdowell, D'Amico → D'amico). The narrow filter targets only the cases where a name is unambiguously lowercase by mistake. The 8,000 truncated-name cases are preserved as-is rather than capitalized, since INITCAP would simply produce "officially capitalized garbage" without recovering the missing characters.
- **Decision:** Truncated-name recovery (~8,000 affected rows) is deferred to v1.5 as a re-ingestion workstream. **Rationale:** The fix requires re-fetching the affected publications from PubMed with proper UTF-8 handling rather than SQL transformation. The scope is significant but well-bounded; the v1 launch tolerates the existing truncated names because they affect a minority of the cohort and do not produce false positives in scoring (truncated names still resolve to the same researcher row).
- **Decision:** social_users.display_name normalized in parallel using the same lowercase-only INITCAP pattern. **Rationale:** Twitter display names are user-controlled and frequently lowercase. The DOL hero panel preferentially displays display_name from the Twitter profile; without normalization, "anoop misra" and "arsela prelaj" would render lowercase even after the underlying hcps row is corrected. Normalizing both tables ensures consistent display.

#### Operational and infrastructure

- **Empirical finding (OpenAlex rate limit / cost discovery):** The OpenAlex citation backfill script (openalex_publications.py) initially failed with HTTP 429 errors despite parameter-correct request format. Diagnostic revealed the configured OPENALEX_API_KEY was a paid Premium-tier key with `dailyRemainingUsd: 0` (budget exhausted). The 429 was budget rejection, not rate limiting. **Decision:** API key removed from request parameters; script runs against OpenAlex's free polite pool (mailto-only authentication, 100K requests/day at 10 requests/second). **Rationale:** Free polite pool is more than sufficient for the 33,959 unique DOIs the script processes. Premium tier was unnecessary cost.
- **Empirical finding (OpenAlex efficiency bug):** Original script processed publications row-by-row, calling the OpenAlex API once per row. With 155,374 rows and many co-authored publications, the same DOI was fetched repeatedly (once per author of that paper). **Decision:** Script refactored to dedupe by DOI before processing, mapping author rows to unique DOI groups. 155,374 rows collapse to 33,959 unique DOIs — a 4.6× reduction in API calls. Each DOI fetch updates citation_count for all author rows of that paper in a single UPDATE statement. **Rationale:** The original design treated publications as the iteration unit when DOI is the natural API unit; the refactor aligns iteration with API semantics.
- **Decision:** OpenAlex citation backfill runs as a long-running background job (estimated 9-10 hours total runtime) rather than a foreground operation. Estimated to complete overnight. **Rationale:** Citation enrichment is not a launch blocker; tier classification works on whatever citation_trajectory data is available, and missing citations degrade dark_horse classification gracefully (HCPs with cit_traj=0 cannot qualify as dark_horse, but rising_star and other tiers function normally).
- **Decision:** Database performance indexes documented in methodology — idx_hcp_scores_ta_tier, idx_hcp_scores_tier, idx_hcp_scores_ta_score, idx_hta_ta_hcp, idx_hcps_verified_dol (partial WHERE is_verified_dol=true). **Rationale:** Indexes are infrastructure required for production queries to complete within Supabase's statement timeout. Treating them as documented infrastructure rather than discovered-as-needed prevents regression when database is rebuilt or migrated.

### May 2, 2026 — Frontend tier alignment, view migration, and country normalization

#### Dark horse UI methodology alignment

- **Empirical finding (frontend tier discrepancy):** Three components in the frontend codebase (App.tsx, HCPCard.tsx, DetailScreen.tsx) each defined their own `isDarkHorse()` function using the criteria `composite_score >= 85 AND citation_trajectory >= 40 AND trial_score >= 2`. Maximum observed composite_score in the production database is 72; the threshold of 85 was therefore unreachable, meaning the frontend dark_horse logic never matched any HCP. The HCPCard purple "Dark Horse" badge had never displayed in the live product despite the backend correctly tagging dark_horse rows in `hcp_scores.tier`. The DetailScreen "Dark Horse callout" copy described the old four-criteria methodology and was inconsistent with the recovered v1.2 tier logic (`normalized_score >= 95 AND pub_velocity > 0 AND citation_trajectory > 0`).
- **Decision:** All three frontend `isDarkHorse()` implementations removed. All dark_horse visual treatment (card border-left color, score badge color, badge label visibility, detail screen callout visibility) now reads `hcp.tier === "dark_horse"` directly from the backend tier assignment. **Rationale:** Backend tier is the source of truth; duplicating tier logic in the frontend invited methodology drift and produced silently-broken UI features. A single canonical definition prevents the kind of "code reads as defensive but is actually dead" pattern that obscures real bugs.
- **Decision:** Dark horse cards receive purple visual treatment — left border `#9B6DFF`, score badge text/border/background recolored to purple variants (`#9B6DFF`, `#0D0A1A`, `#9B6DFF`). Rising star cards retain gold treatment (`#E8A020`). **Rationale:** Visual differentiation is the primary product affordance for the dark_horse tier. A user toggling from Rising Stars to Dark Horses needs to see immediately that the cards represent a categorically different cohort, not just a filtered subset of the same one.
- **Decision:** Dark horse callout copy on DetailScreen rewritten to match recovered methodology. Old copy referenced four obsolete criteria; new copy reads "ranks in the top 5% of [TA] rising stars by normalized score, with active publication velocity and citation momentum. Fewer than 2% of scored HCPs in this therapeutic area qualify." **Rationale:** Methodology integrity in user-visible narrative copy matters. The old copy was methodologically inaccurate post-recovery and would have failed scrutiny from any methodologically-curious user.

#### Score display — percentile rank for dark horses

- **Empirical finding (raw composite confusion):** Raw `composite_score` for dark_horse-tier HCPs typically lands between 40-55 (e.g., Wara Naeem at 46.0, Sujay Shah at 45.1). Tier assignment uses normalized_score (PERCENT_RANK by therapeutic area) where dark_horse requires `>= 95`. The display number (raw composite ~46) and the tier classification metric (normalized_score 95-100) operate on different scales, producing cognitive dissonance for users who see "low score" cards labeled as top-tier.
- **Decision:** Frontend score badge for dark_horse cards displays normalized_score as a percentile (e.g., "98%") rather than raw composite_score. Rising star cards (gold border) continue to display raw composite_score. **Rationale:** The percentile is the actual decision criterion the tier system uses. Showing the percentile is showing the methodology, not hiding it. The raw composite is a means to an end; the percentile is the end. This is more honest, not less — the tier label and the displayed number now both reference the same underlying metric.

#### Data source — view migration

- **Decision:** `getRisingStars` API function migrated from querying `hcp_scores` directly to querying the `hcp_normalized_scores` view as the primary source, with a secondary lookup for `tier` (which the view does not expose). **Rationale:** The view is the source of truth for normalized_score. Querying it directly removes the need to compute percentile on the fly and aligns the frontend with the same metric the backend tier-assignment SQL uses. The two-query pattern (view for scores, hcp_scores for tier) preserves clean separation of concerns and matches the existing pattern used for narrative enrichment.
- **Empirical finding (view column inventory):** `hcp_normalized_scores` view exposes hcp_id, therapeutic_area_id, raw_score, normalized_score, pub_velocity_score, citation_trajectory_score, trial_investigator_score, congress_score, msl_signal_score, calculated_at. The view does NOT expose tier or first_pub_year, both of which require separate lookups (tier from hcp_scores, first_pub_year from a yet-to-be-identified source).
- **Empirical finding (PostgREST 400 on first_pub_year):** Initial migration attempt included `first_pub_year` in the SELECT against hcp_scores (assumed to live there). PostgREST rejected with `column hcp_scores.first_pub_year does not exist`. The field is referenced in `mapRisingStarRow` but currently always falls back to 0. Source location for first_pub_year is deferred to v1.5 (likely on hcps table or derived from earliest publication year). Career age display on DetailScreen remains hardcoded ("4.2 yrs") as a v1.5 backlog item.

#### USA filter removal

- **Empirical finding (international rising stars dropped):** `getRisingStars` was filtering the hcps query with `.eq("country", "USA")`. Verified DOLs Cortellini (Imperial/Campus Bio-Medico, Italy), Prelaj (INT Milano, Italy), Sebastiani (McGill, Canada), Misra (Fortis Delhi, India) appeared in the DOL hero panel but would have been silently absent from the rising star feed beneath. The filter contradicted the methodology's stated international scope.
- **Decision:** USA filter removed entirely from getRisingStars. International rising stars now flow through the feed naturally. **Rationale:** Methodology defines international HCP coverage as partial-but-included. The DOL pipeline already surfaces international researchers; the rising star feed was the only code path enforcing US-only scope, creating an inconsistency between adjacent UI sections. Removing the filter aligns the feed with the methodology and with sibling features.

#### Frontend state management — taCounts effect

- **Empirical finding (taCounts never populated):** App.tsx state included `taCounts` and the dark horse chip read from it, but no `useEffect` was calling `getTACounts(taSlug)` to populate the state. The chip displayed "— identified" indefinitely because the loading-state em-dash placeholder never resolved. This bug appeared to surface during the Step 2 useEffect refactor for dark horse refetch, but root cause was a pre-existing missing effect — the count had been getting set incidentally elsewhere (likely TASelectionScreen on continue) and broke when the App.tsx state lifecycle changed.
- **Decision:** Added a dedicated useEffect with dependency array `[selectedTA]` that calls `getTACounts(taSlug)` and populates `setTaCounts(data)` on every TA change. **Rationale:** Counts are TA-scoped and do not change when the dark horse filter toggles. Coupling them to a different state lifecycle (e.g., the HCP fetch effect) would refetch unnecessarily when the filter toggled. A dedicated effect is architecturally honest and prevents incidental coupling.

#### DOL panel visibility on dark horse view

- **Decision:** DOL hero panel hidden when `darkHorseFilter === true`. The panel renders normally when the filter is off; tapping the dark horse chip suppresses the DOL panel and gives the dark horse cards the full feed. **Rationale:** The DOL panel surfaces verified social media voices, which is a complement to the rising star feed but a distraction on the dark horse view. When a user explicitly requests "show me the dark horses," visual real estate should belong to dark horses, not a separate cohort.

#### Country field normalization

- **Empirical finding (country field corruption):** PubMed affiliation parser captured the last token of affiliation strings as the country, producing systematic false positives. Trailing-period variants (China./China, Japan./Japan, Italy./Italy, France./Germany./Spain.) split single countries across two values — China alone had 11,586 "China." rows alongside 2,982 "China" rows. US-state false positives (Idaho., Texas., California., New York. captured as countries when affiliation ended with a US state name) affected an unknown number of HCPs in the long tail. Travis Williams (Saint Luke's Cancer Institute, Boise) had `country = "Idaho."` — surface symptom: missing US flag in card UI.
- **Decision:** Trailing-period normalization applied across all country values: `UPDATE hcps SET country = TRIM(TRAILING '.' FROM country) WHERE country LIKE '%.';`. Punctuation noise eliminated. **Rationale:** Cosmetic and methodologically harmless — trailing periods carry no semantic meaning. Consolidates country distribution by ~50%, simplifies downstream country code mapping in HCPCard.tsx flag rendering.
- **Decision (v1.5 deferred):** US-state-as-country semantic remap (`"Idaho" → "USA"`, `"Texas" → "USA"`, etc.) deferred to v1.5 country re-normalization workstream. **Rationale:** Semantic remapping requires either (a) a US-state whitelist applied as SQL UPDATE (cheap but doesn't address the underlying ingestion bug), or (b) NPI-based country backfill for the 5,878 NPI-verified rows (correct architecturally; aligns with v1.5 ingestion-pipeline architecture decisions). Path (b) is the right answer; path (a) is a workaround that masks the ingestion bug. The methodology already commits to NPI-derived country in the v1.5 architecture section. Cosmetic impact of unflagged HCPs is small; deferring respects the architectural integrity of the planned fix.

#### Methodology integrity audit — duplicate hcp_scores rows and tier classification rebuild

The most consequential finding of the May 2 session. While investigating why the displayed CAREER AGE pill on dark horse cards showed em-dashes for some HCPs (e.g., Stefano Pileri, Eleonora Gambineri, Claire Booth) and a 43-year career age for an HCP labeled Dark Horse (Joanne Kurtzberg, first published 1983), a deeper investigation surfaced two compounding methodology defects.

- **Empirical finding (32% duplicate hcp_scores rows):** Diagnostic query revealed `hcp_scores` table contained 137,770 rows but only 93,769 unique `(hcp_id, therapeutic_area_id)` pairs. **44,001 rows (32%) were duplicates.** The 8 distinct `calculated_at` timestamps in the table (April 27, 29, and 30) showed the scoring pipeline had run 8 separate times without cleanup, each run inserting new rows instead of upserting. Each duplicate row carried a *different* composite_score because each pipeline execution computed against a different data state. Tier values across duplicate rows for the same HCP/TA pair were therefore non-deterministically assigned — Joanne Kurtzberg had three rows for Rare Disease with composite_scores 62.96, 9.46, and 16.72, and tiers dark_horse, established, established. The frontend's tier filter (`WHERE tier = 'dark_horse'`) matched whichever row PostgREST returned first, producing an HCP-tier display that was effectively random.
- **Empirical finding (null-handling gap in tier CASE statement):** The recovered v1.2 tier classification SQL applied the established branch via `WHEN normalized_score >= 85 AND first_pub_year < 2008 THEN 'established'`. Postgres CASE evaluation treats `NULL < 2008` as UNKNOWN, not TRUE, so HCPs with null `first_pub_year` fell through the established branch even when they were established veterans. Of the 2,205 dark_horse-tagged rows in the pre-fix database, 1,570 (71%) had null first_pub_year on their hcps row — they had escaped the established branch entirely because their career age was unknown. An additional 387 rows (17.5%) had first_pub_year < 2008 but had been classified as dark_horse rather than established because they were processed via duplicate rows from runs where the tier UPDATE used a different first_pub_year join state. **Only 248 of 2,205 dark horses (11%) were legitimately emerging by methodology.**
- **Decision:** Hard remediation in five steps, executed in sequence:
  1. **Diagnostic confirmation.** Verified 137,770 total rows / 93,769 unique pairs / 44,001 duplicates. Verified 8 distinct calculated_at timestamps spanning April 27-30, 2026.
  2. **Dedupe.** `DELETE FROM hcp_scores WHERE ctid IN (subquery returning duplicate rows ranked by calculated_at DESC, keeping rn=1)`. Kept the most recent row per (hcp_id, ta_id) pair. 44,001 rows deleted. Post-dedupe: 93,769 rows = 93,769 unique pairs.
  3. **Unique constraint.** `ALTER TABLE hcp_scores ADD CONSTRAINT hcp_scores_hcp_ta_unique UNIQUE (hcp_id, therapeutic_area_id)`. Future scoring runs that attempt to insert a duplicate now fail loudly rather than accumulating silently. This is the architectural fix preventing recurrence.
  4. **Tier classification rebuild.** Re-ran the tier UPDATE with the null-handling gap closed:
     ```sql
     UPDATE hcp_scores s
     SET tier = CASE
       WHEN v.normalized_score >= 95
         AND s.pub_velocity_score > 0
         AND s.citation_trajectory_score > 0
         AND h.first_pub_year IS NOT NULL
         AND h.first_pub_year >= 2008
       THEN 'dark_horse'
       WHEN v.normalized_score >= 85
         AND h.first_pub_year IS NOT NULL
         AND h.first_pub_year < 2008
       THEN 'established'
       WHEN v.normalized_score >= 85
       THEN 'rising_star'
       WHEN v.normalized_score >= 30
       THEN 'emerging'
       ELSE 'unranked'
     END
     FROM hcp_normalized_scores v, hcps h
     WHERE v.hcp_id = s.hcp_id
       AND v.therapeutic_area_id = s.therapeutic_area_id
       AND h.id = s.hcp_id;
     ```
     Note: tier UPDATE now joins `hcps` for first_pub_year (since the column does not exist on `hcp_scores`), and joins `hcp_normalized_scores` for normalized_score. The `IS NOT NULL` guards on first_pub_year prevent silent fall-through for HCPs with unknown career age.
  5. **Validation.** Re-ran the dark horse audit. Result: 21 total dark horses, 0 with null career age, 0 misclassified-as-established, 21 legitimately emerging.
- **Empirical finding (post-rebuild tier distribution):**
  - Hepatology: 7 dark_horse / 3,291 rising_star / 801 established / 731 emerging / 22,483 unranked
  - NSCLC: 9 dark_horse / 3,809 rising_star / 1,708 established / 0 emerging / 32,693 unranked
  - Rare Disease: 5 dark_horse / 2,860 rising_star / 105 established / 0 emerging / 25,267 unranked
  - **Cross-TA total: 21 dark_horse, 9,960 rising_star, 2,614 established, 731 emerging, 80,443 unranked**
  - Cohort compression vs pre-rebuild: dark_horse went from 2,205 to 21 (-99%). Rising_star went from 22,537 to 9,960 (-56%). Established went from 5,264 to 2,614 (-50%). The compression reflects two effects compounding: (a) deduplication removed inflated counts where a single HCP carried multiple tier rows, (b) tightened CASE rules excluded HCPs with null career age that were silently classified.
- **Empirical finding (dark_horse cohort observation):** The 5 Rare Disease dark horses observed post-fix ranged from 0-13 years career age, with publication velocities clustering at 19.7-19.8x. The narrow velocity distribution suggests potential calibration tightness in pub_velocity_score for low-publication-count HCPs (a 19.8x multiple may be the formula's plateau for specific (count, recency) combinations). Worth investigating in v1.5 calibration work but does not affect tier correctness — the rank-based normalization handles plateau values appropriately.
- **Decision:** The 21 dark_horse cohort size is structurally correct given current data, but is sensitive to citation_trajectory_score completeness. The OpenAlex citation backfill (running concurrently, expected to complete during this session or shortly after) is the primary input to citation_trajectory. Once OpenAlex completes and the scoring pipeline re-runs against complete citation data, the dark_horse cohort is expected to expand modestly as more HCPs satisfy the `citation_trajectory > 0` gate. The unique constraint added in step 3 ensures the next scoring run upserts cleanly rather than re-introducing duplicates. **No further methodology adjustments are committed pre-launch.** The tier definitions stand. If, after fresh scoring against complete data, the dark_horse cohort remains in the 20-50 range, that is the methodology answering honestly: dark_horse is the rarest tier, by design.
- **Decision:** Methodology doc commits to "the rarest tier — fewer than 1 in 12 rising stars qualify" copy is now incorrect. Revised: dark_horse is roughly **1 in 475** of scored HCPs (21 / 9,960 rising stars, or 21 / 93,769 of all scored). The DetailScreen Dark Horse callout copy referencing "Fewer than 2% of scored HCPs in this therapeutic area qualify" is accurate within an order of magnitude but understates rarity; copy may be tightened post-OpenAlex to reflect the stable cohort size. **Rationale:** Methodology integrity in user-visible copy matters; pre-fix copy was generated against contaminated tier data and overstated the cohort.
- **Decision:** A brief, non-technical version of this audit is product-defensible content. When a buyer's data team asks "how do you know your scoring is right?", the honest answer is: "We audited it. We found that an unsupervised pipeline had accumulated 32% duplicate rows and that our tier classification didn't handle null career age correctly. We fixed both, deleted 44,001 contaminating rows, added a structural constraint to prevent recurrence, and validated that the dark horse cohort is now methodologically clean." That story builds trust rather than eroding it. **Rationale:** Discovering and fixing data integrity problems is what credible methodology operations look like. Concealing them is what eroded methodology operations look like. FieldMark's positioning as a methodology-first product depends on this audit being publicly defensible.

#### Methodology integrity audit, continued — eligibility gate enforcement and cohort recovery (May 2 evening)

The afternoon's audit caught one foundation-level methodology gap: 32% duplicate hcp_scores rows accumulated across 8 unsupervised pipeline runs, contaminating tier assignments. The evening session caught a second, equally consequential gap: the documented `MIN_TOTAL_CAREER_PUBS = 10` eligibility gate was never being applied in the scoring pipeline. The diagnostic chain that surfaced this finding also corrected several downstream methodology questions about Dark Horse cohort calibration.

- **Empirical finding (cohort calibration question):** Post-afternoon-rebuild, the Dark Horse cohort was 17 across all three TAs (5 Rare Disease, 7 Hepatology, 9 Oncology, of which Sujay Shah at J&J was an industry employee leaving 8 NSCLC). The cohort felt too small for a usable feed feature — an MSL who exhausts the entire cohort in one afternoon's review has stopped using the product. Two distinct concerns surfaced: (a) cohort *size* — was 17 correct, or should methodology be loosened? (b) cohort *turnover* — even if 17 is correct, the same 17 names month-over-month makes the feature static. The instinct to relax the methodology was correctly resisted in favor of running diagnostics first.

- **Diagnostic Query 1 (gate-by-gate breakdown across all 93,769 scored HCPs):**
  - Pub velocity > 0: 93,764 (99.99%) — meaningless as a filter
  - Career age 2008+: 12,061 (12.9%)
  - Normalized score >= 95 (top 5%): 4,001 (4.3%)
  - Citation trajectory > 0: 687 (0.7%) — bottleneck, attributable to OpenAlex incomplete enrichment
  - Citation trajectory >= 0 (allowing zero): 93,769 (100%)
  
  **Reading:** The citation_trajectory > 0 gate was doing 99% of the filtering. Initially interpreted as evidence that OpenAlex incompleteness was the primary constraint on cohort size.

- **Diagnostic Query 2 ("almost dark horse" cohort — normalized_score 90-94 with all other gates passing):** Hepatology 6, NSCLC 45, Rare Disease 0. NSCLC had healthy turnover bench. Rare Disease had no candidates on the boundary, suggesting either tight methodology for that TA or OpenAlex incompleteness affecting Rare Disease publications.

- **Diagnostic Query 3 (OpenAlex sensitivity — held back only by citation_trajectory = 0):** Hepatology 352, NSCLC 212, Rare Disease 14. Total: 578 HCPs would qualify as dark horses today if citation_trajectory `>= 0` were allowed instead of `> 0`. Initially read as confirmation that OpenAlex completion would dramatically expand the cohort.

- **Pivotal sample query — characterizing the held-back HCPs:** Sample of 5 held-back HCPs revealed publication counts of 1, 1, 1, 2, 2 — not 20, not 50. The "held back" cohort wasn't researchers with rich publication records waiting on citation enrichment. It was researchers with extremely thin publication records who happened to land at percentile 95+ because the scoring formula produces inflated `pub_velocity_score` values for low-publication-count HCPs.

- **Confirmation query — eligibility gate enforcement:** Of the 575 held-back HCPs queried (3 dropped from LEFT JOIN as zero-publication HCPs), **570 (99.1%) had fewer than 10 publications**. The methodology's `MIN_TOTAL_CAREER_PUBS = 10` eligibility gate was not being applied in the scoring pipeline.

- **Empirical finding (broader scope):** The eligibility gap was not isolated to the held-back cohort. Audit of the full rising star tier (9,960 HCPs) revealed:
  - Hepatology: 3,291 rising stars total, 3,070 (93%) under 10 pubs, only 221 legitimately eligible
  - NSCLC: 3,809 rising stars total, 3,670 (96%) under 10 pubs, only 139 legitimately eligible
  - Rare Disease: 2,860 rising stars total, 2,785 (97%) under 10 pubs, only 75 legitimately eligible
  - **Total: 9,960 rising stars, of which 9,525 (96%) were below the documented eligibility threshold and only 435 (4%) qualified.**
  
  The pub_velocity_score plateau at 19.7-19.8x observed on every dark horse card all session was the formula's behavior on low-publication-count HCPs, not a calibration tightness or coincidence. With ≥10 publications eligibility properly applied, this plateau would not appear on the dark horse cards.

- **Refining diagnostic — career age distribution within the eligible cohort:** Of the 435 rising stars with ≥10 publications, breakdown by career age:
  - Hepatology: 220 truly emerging, 1 misclassified as established, 0 null
  - NSCLC: 125 truly emerging, 14 misclassified as established, 0 null
  - Rare Disease: 47 truly emerging, 28 misclassified as established, 0 null
  - **Total: 392 truly emerging, 43 misclassified veterans hiding in rising star tier despite the afternoon's tier rebuild.**
  
  Zero null-career-age cases. The 333 nulls observed in the earlier diagnostic were artifacts of LEFT JOIN behavior on zero-publication HCPs, not genuine data nulls. First_pub_year was populated for every HCP with publications.

- **Decision:** Apply the eligibility gate to tier classification. Re-run the tier UPDATE with two combined corrections: (a) `MIN_TOTAL_CAREER_PUBS >= 10` enforced via JOIN to publications count subquery, (b) all tiers (including rising_star and emerging) require known career age within the appropriate window. **Rationale:** The methodology doc commits to MIN_TOTAL_CAREER_PUBS = 10. The pipeline diverging from the documented methodology is the same class of bug as the duplicate-rows finding from the afternoon. Both are alignment between specification and implementation, not methodology change. The fix tightens the cohort, not the rules.

- **Decision:** SQL UPDATE structure for tier classification with eligibility:

  ```sql
  WITH pub_counts AS (
    SELECT hcp_id, COUNT(*) as pub_count FROM publications GROUP BY hcp_id
  )
  UPDATE hcp_scores s
  SET tier = CASE
    WHEN COALESCE(pc.pub_count, 0) < 10 THEN 'unranked'
    WHEN v.normalized_score >= 95 
      AND s.pub_velocity_score > 0 
      AND s.citation_trajectory_score > 0 
      AND h.first_pub_year IS NOT NULL 
      AND h.first_pub_year >= 2008 THEN 'dark_horse'
    WHEN v.normalized_score >= 85 
      AND h.first_pub_year IS NOT NULL 
      AND h.first_pub_year < 2008 THEN 'established'
    WHEN v.normalized_score >= 85 
      AND h.first_pub_year IS NOT NULL 
      AND h.first_pub_year >= 2008 THEN 'rising_star'
    WHEN v.normalized_score >= 30 
      AND h.first_pub_year IS NOT NULL 
      AND h.first_pub_year >= 2008 THEN 'emerging'
    ELSE 'unranked'
  END
  FROM hcp_normalized_scores v, hcps h
  LEFT JOIN pub_counts pc ON pc.hcp_id = h.id
  WHERE v.hcp_id = s.hcp_id 
    AND v.therapeutic_area_id = s.therapeutic_area_id 
    AND h.id = s.hcp_id;
  ```

- **Empirical finding (post-eligibility-rebuild tier distribution):**
  - Hepatology: 106 dark_horse / 132 rising_star / 1 established / 39 emerging / 27,035 unranked
  - NSCLC: 22 dark_horse / 250 rising_star / 22 established / 0 emerging / 37,925 unranked
  - Rare Disease: 20 dark_horse / 47 rising_star / 36 established / 0 emerging / 28,134 unranked
  - **Cross-TA total: 148 dark_horse, 429 rising_star, 59 established, 39 emerging.**

- **Validation — methodology compliance check:** Direct query verifying every dark_horse and rising_star row passes all gates returned 0 violations across all 148 dark horses and all 429 rising stars. Publication count distributions for dark horses are healthy: Hepatology avg 50 pubs (min 11, max 57), NSCLC avg 43 pubs (min 10, max 53), Rare Disease avg 92 pubs (min 16, max 500). Cohort is methodologically clean.

- **Empirical finding (cohort expansion explanation):** Dark horse cohort grew 8.7x from afternoon (17) to evening (148). This was not a methodology change. The afternoon's tier rebuild ran while data was still settling from concurrent OpenAlex enrichment and country normalization work; tier UPDATE produced an incomplete cohort against partial state. Evening's UPDATE ran against stable data with eligibility gate properly applied, producing the cohort the methodology was always supposed to produce. The expansion is recovery of legitimate dark horse candidates that were missed by the partial-state afternoon run, not loosening of methodology gates.

- **Decision:** Industry employee filtering applied at query time rather than via tier classification. `INDUSTRY_PATTERNS` constant in api.ts excludes 41+ pharma, biotech, and CRO companies (Pfizer, Merck, Novartis, Roche, Genentech, AstraZeneca, GSK, Sanofi, Bristol Myers, Eli Lilly, J&J, Janssen, AbbVie, Vertex, Regeneron, Amgen, Biogen, Moderna, Gilead, Takeda, Bayer, Boehringer, Daiichi, Astellas, Servier, Novo Nordisk, Eisai, BioMarin, Alnylam, Ionis, Blueprint, Mirati, Arvinas, Seagen, Incyte, Jazz, Bluebird Bio, IQVIA, Parexel, Syneos, ICON, Charles River). **Rationale:** Industry-employed researchers are not MSL-engageable — they are the audience for FieldMark, not the targets. An MSL would never engage a competitor's R&D scientist as a KOL, would never engage their own colleague. Pre-fix audit: 469 industry-employed researchers across rising_star + dark_horse tiers (Hepatology 88, NSCLC 316, Rare Disease 65). Post-fix: industry employees filtered from cards (in `getRisingStars`) and counts (in `getTACounts`) without modifying tier classification. Future work: add `industry_employed` boolean column on hcps and population via affiliation matching + ROR institution-type lookup as v1.5 hardening.

- **Decision:** Narrative refusal contamination in `hcp_narratives`. Audit identified 15 records where Claude had refused to generate a narrative due to data inconsistency (refusal text such as "I cannot write these sentences as requested..." or "I don't have sufficient evidence to characterize..."), and the refusal text was stored verbatim in the narrative column rather than being detected and rejected by the pipeline. Cleanup: nulled all 15 records via `UPDATE hcp_narratives SET narrative = NULL WHERE narrative ILIKE '%I cannot%' OR ILIKE '%I am unable%' OR ILIKE '%I apologize%'` (with full pattern set covering common refusal openers). Detail screen falls back to "Narrative generating — check back soon" placeholder, which is honest. **Pipeline patch deferred to v1.5:** narrative generation must detect refusals via regex match before storage; either retry with adjusted prompt or skip the HCP and log.

- **Decision:** Renamed "CAREER AGE" stat pill on dark horse cards to "PUB YEARS" with corresponding value format change (display just the number, no "yrs" suffix). DetailScreen retains the longer "Years publishing" label since space allows. **Rationale:** "Career age" was being read as biological age by users, when the metric measures years since first publication — research career duration, not life duration. "PUB YEARS" pairs naturally with "PUB VEL" (publication velocity), is unambiguous, and reads scientifically without requiring decoding. Tooltip clarifies: "The number of years since this HCP's first published paper, used as a proxy for research career stage when CV data is unavailable."

- **Methodology copy update:** Pre-fix copy committed to "fewer than 1 in 12 rising stars qualify" as dark horse rarity framing. Post-fix actual ratio is 148 dark horses / 429 rising stars = 1 in 2.9, far less rare than originally stated. The rarity framing in DetailScreen Dark Horse callout copy and methodology doc both need updating to reflect actual ratios. Possible revision: "Dark Horses rank in the top 5% of rising stars by normalized score with active publication velocity and citation momentum. Roughly 1 in 3 rising stars qualify in this therapeutic area." Less dramatic than the prior framing but accurate.

#### Implications for the v1.5 product narrative

The methodology integrity audit, conducted across May 2 afternoon and evening, identified and corrected three foundation-level alignment gaps between documented methodology and pipeline implementation:

1. **32% duplicate hcp_scores rows** from 8 unsupervised pipeline runs. Resolved via dedupe + unique constraint.
2. **Null-handling gap in tier classification CASE statement** that allowed null-career-age HCPs to bypass the established branch. Resolved via tier rebuild with `IS NOT NULL AND first_pub_year >= 2008` guards.
3. **Unenforced MIN_TOTAL_CAREER_PUBS = 10 eligibility gate** that allowed researchers with 1-3 publications to be classified as rising stars and dark horses. Resolved via tier rebuild with publication count JOIN and `pub_count >= 10` guard.

The combined effect: cohort sizes shifted from 2,205 dark horses (contradictory, contaminated) to 148 (methodologically clean), and from 22,537 rising stars (96% noise) to 429 (100% eligible). Both reductions reflect the methodology's design intent. Neither reduction was a methodology change.

This audit is product-defensible content. When a buyer's data team asks "how do you know your scoring is right?", the credible answer is: "We audited it. We found three foundation-level alignment gaps between our documented methodology and our pipeline behavior. We fixed all three, deleted contaminating rows, added structural constraints to prevent recurrence, and validated that the resulting cohorts are methodologically clean." That story builds trust rather than eroding it.

#### OpenAlex enrichment completion (May 3 afternoon)

The OpenAlex citation_count backfill that was running in background since May 1 evening completed after 30.34 hours of runtime. Final state captured here for methodology context.

- **Empirical finding (final enrichment state):** 105,152 of 190,724 publications enriched (55%). 1,793 publications have no DOI and could not be enriched. 83,779 publications have DOIs but were not successfully enriched (404 from OpenAlex, malformed DOIs, API errors during runtime, or DOIs the by-row script never reached due to processing inefficiency). The remaining 35,000 gap between "publications attempted by script" (155,374) and "total publications" (190,724) is the no-DOI cohort.

- **Empirical finding (citation distribution within enriched cohort):** 50.3% zero citations (52,889), 30.1% low 1-10 citations (31,679), 13.4% medium 11-50 (14,088), 5.3% high 51-200 (5,547), 0.9% very high >200 (953). Half of all enriched publications have zero citations, validating the eligibility gate (≥10 publications) — researchers with thin records of mostly-uncited papers were never going to be defensible rising stars.

- **Empirical finding (cohort signal validation):** Rising star cohort citation_trajectory_score distribution at 55% enrichment:
  - Hepatology: 132 rising stars, 106 (80%) positive trajectory, 26 (20%) flat
  - NSCLC: 250 rising stars, 198 (79%) positive trajectory, 52 (21%) flat  
  - Rare Disease: 47 rising stars, 22 (47%) positive trajectory, 25 (53%) flat
  
  The 80% positive-trajectory rate in Hepatology and NSCLC confirms the citation_trajectory dimension is differentiating meaningfully across the cohort — it's signal, not noise. Rare Disease's lower 47% reflects the structural reality that rare disease research has smaller citation volumes by nature (fewer researchers, fewer papers citing each other), not a methodology failure.

- **Decision:** OpenAlex enrichment is "done" for what it can do at this pass. The remaining 83,779 unenriched-with-DOI publications are split between (a) papers OpenAlex tried and gave up on (404s, malformed DOIs), and (b) papers the by-row script never reached due to processing inefficiency. A second OpenAlex run with a smarter by-DOI processing pattern could push coverage from 55% to ~85%, but that's a v1.5 hardening item, not blocking tonight's work.

- **Decision:** Proceed with rescoring at 55% enrichment. The methodology produces defensible cohorts at this enrichment level (validated by 80% positive-trajectory in major TAs). Re-running scoring now establishes the post-OpenAlex steady-state cohort and validates that methodology is stable across enrichment levels. If the cohort doesn't shift dramatically between 55% and a future ~85% rerun, that's strong methodology validation. If it does shift, we'll know which dimensions are most sensitive to citation completeness.

- **v1.5 backlog item (OpenAlex script hardening):** Refactor enrichment script for by-DOI processing (~6× throughput improvement), add retry logic for transient errors, pre-validate DOI format before lookup, properly resume from checkpoint without re-attempting already-enriched rows. Establish quarterly refresh cadence as operational rule (citation counts update over time as new papers cite older work). Estimated effort: 1-2 days script work plus runtime.

#### May 3 Sunday evening session — data foundation expansion + product visibility

A focused execution session ran on May 3 Sunday evening (~7:30pm-11:00pm Eastern). Five workstreams executed: country field normalization (completed), feed pagination (shipped to product), Scholar enrichment relaunched after diagnostic correction, OpenAlex pipeline refactored with expanded data capture (running, ~95% complete by session end), and one product visibility finding that elevated an existing methodology issue.

##### Workstream 1 — Country field normalization (P0 #7) completed for buyer-relevant cohort

The May 2 evening audit characterized country corruption across multiple distinct classes (alias variants, US states stored as countries, US state abbreviations, email-bleed patterns, full affiliation strings). The Sunday evening session executed a five-phase SQL cleanup against `hcps.country` with preview-before-update verification at each phase.

**Phase 1 — High-volume alias consolidation.** Eight country aliases consolidated to canonical forms via `UPDATE hcps SET country = '<canonical>' WHERE country IN (<variants>)`:
- China variants (PR China, P.R. China, P. R. China, People's Republic of China — 1,616 rows → "China", total cohort now 18,004 after Phase 3)
- UK variants (United Kingdom, U.K — 400 rows → "UK", total now 2,167)
- Korea variants (Republic of Korea, Korea — 866 rows → "South Korea", total 1,029)
- Netherlands variants (The Netherlands, the Netherlands — 744 rows → "Netherlands", total 833)
- Türkiye → Turkey (352 rows, total 987)
- España → Spain (46 rows, total 1,578)
- México → Mexico (45 rows, total 235)
- IND → India (68 rows, total 1,961 after Phase 3)
- United States of America → USA (43 rows, folded into Phase 2)

**Phase 2 — US states (full names and abbreviations) → USA.** Two combined UPDATEs covering: state full names (New York, Massachusetts, California, Maryland, Florida, Texas, Ohio, Pennsylvania, Missouri, Connecticut, Minnesota, Colorado, Illinois, Michigan, Wisconsin, North Carolina, Arizona, Virginia, New Jersey, Rhode Island, South Carolina, Washington, Utah, Indiana, West Virginia, Arkansas, New Hampshire, Tennessee, Iowa, Nebraska, Idaho, Kentucky, Alabama — Georgia explicitly excluded), state abbreviations (CA, MD, MA, NY, OH, PA, IL, TN, NJ, MN, WA, NC, IN, VA, FL, WI, MI, MO, CO, RI, AL, DC, OK, SC, KY, IA, CT, AZ, UT, LA, OR, NE, DE, NV, ME, KS, MS, WY), and composite "STATE United States" patterns. Total ~531 rows updated.

CA disambiguation resolved via institution lookup: 19 CA rows with known institutions all California-based (Scripps, UCSD, Caltech, Eclipse Bio); 120 null-institution rows assumed California by extension. CA → USA confidently.

Georgia explicitly preserved as country Georgia (not US state) after institution lookup showed 10 of 11 known-institution Georgia rows are country Georgia (Tbilisi State Medical, Batumi, Research Institute of Clinical Medicine); only 1 was Emory.

IN disambiguation: all 23 IN rows had null institution. Pattern argument (every other 2-letter code in dataset is US state) plus database convention (other countries stored as full names like "China", not ISO codes) led to IN → USA decision.

**Phase 3 — Email-bleed strip via regex.** Targeted Pattern A cases (`Country. email_or_url`):
```sql
UPDATE hcps
SET country = TRIM(SUBSTRING(country FROM '^([^.]+)\.'))
WHERE country ~ '\.\s*([^@]*@|Electronic address)';
```
Successfully cleaned ~2,450 rows across China, Italy, France, Iran, South Korea, Sweden, Austria, Malaysia, Montenegro, India. Counter examples: "China. chao_zheng@zju.edu.cn" → "China"; "Italy. Electronic address: stefania.corti@unimi.it" → "Italy".

Caveat: regex was overly greedy on values without a period after the country word. Strings like "China qidongxia_md@163.com" got stripped to "China qidongxia_md@163" (truncated at the email's period rather than between country and email). Net effect: ~2,450 rows correctly cleaned, ~50 rows moved from one corruption form to another. Acceptable trade-off given volume.

**Phase 4 — Affiliation-string country extraction with word boundaries.** For 505 rows where country contained full affiliation strings, used word-boundary regex matching on canonical country names within the corrupted string:
```sql
UPDATE hcps
SET country = CASE
  WHEN country ~* '\y(USA|United States)\y' THEN 'USA'
  WHEN country ~* '\yCanada\y' THEN 'Canada'
  -- ... 18 additional country WHEN clauses ...
END
WHERE country IS NOT NULL
  AND LENGTH(country) > 30
  AND (country ~* '\y(<list>)\y' OR country ~* '(^|\s)UK\y');
```

Two iterations required. First version used substring matching (`ILIKE '%USA%'`), which produced false positive matching "Busan" / "Pusan" → USA (because "usa" appears as substring inside the city name). Second version with `\y` word boundaries fixed Pusan/Busan but missed `.co.uk` masquerading as bare UK; third version restricted bare UK to `(^|\s)UK\y`. Final version cleaned 505 rows to canonical countries (USA, Canada, UK, Germany, France, Italy, Spain, Japan, Australia, Switzerland, Netherlands, Belgium, Sweden, Denmark, Norway, Ireland, Austria, Israel, Singapore, South Korea).

One known false positive accepted: "Egypt-Japan University of Science and Technology Alexandria Egypt" (1 row) maps to Japan instead of Egypt because Japan is checked first in the CASE order. Egypt is not in the buyer-relevant country list, so the row remains misclassified rather than corrupted. Acceptable.

**Phase 5 — NULL the genuinely broken values.** 140 rows with gibberish country values (`Republic of` 67, `and` 48, single-letter codes P/Y/T/U/W/Z) set to NULL.

**Final state.** Distinct country values reduced from ~5,790 pre-session to ~1,500 post-session (decrease of ~74%). USA cohort: 32,029 (baseline) → 34,007 (post-cleanup). China cohort: 14,568 split across 5 variants → 18,004 single canonical value. ~4,000-5,000 country values changed across all phases. Buyer-relevant cohort (US, EU, established research countries) substantially cleaner.

**Residual.** ~715 long-string corruption rows remain — affiliation strings for non-buyer-relevant countries (Saudi Arabia, Egypt, Pakistan), pure email-domain values (kfu.edu.sa, henryford.com), and similar. Deliberately not chased: the long-tail corruption is an ingestion-layer issue (PubMed affiliation parser writing entire affiliation blocks to country field) and the right fix is at ingestion, not at data layer. Captured as v1.5+ ingestion-pipeline backlog item.

##### Workstream 2 — Feed pagination shipped to product (P0 #4 subitem)

The frontend feed (`getRisingStars` in api.ts) had a hardcoded `.limit(200)` cap with `.slice(0, 20)` returning only top 20 to the UI. Users could not walk past row 20 of any cohort regardless of total tier population (Hepatology rising_star = 132, NSCLC rising_star = 250, etc.).

Two-prompt Cursor refactor:
1. **api.ts** — `getRisingStars` accepts `options.offset`, returns `{ rows, total }` shape, uses `.range(offset, offset + limit - 1)` instead of `.limit(200)`. Count query precedes row query. Backwards compatibility broken at function signature; App.tsx callers updated to use `data.rows`.
2. **App.tsx** — added `feedOffset`, `feedTotal`, `loadingMore` state. useEffect resets offset on TA/darkHorse change. `loadMore` function appends pages to `hcpList` rather than replacing. Added "Load more" button at bottom of card list when `hcpList.length < feedTotal`. Section header shows "X of Y identified" when partial, total only when fully loaded. Button styled green (#1A3D2E bg, #4ADE80 border/text) per design feedback. Manual refresh via TopBar resets to first page.

**Critical product finding:** pagination revealed a previously-hidden methodology issue. Past row 20-30 in any TA cohort, every HCP card showed identical scoring values: composite=47.3, pub_vel=62.7x, cit_traj=+0.0%, trials=—. This is the publication velocity formula plateau (May 3 morning audit Foundation Issue 3 — pub velocity returns 0 for HCPs with sparse publication histories, normalized to identical 19.78 score across the 55% of cohort with degenerate input). The plateau was invisible when the feed only displayed top 20 because top-20 HCPs are above the plateau by construction.

Implication: the cohort's apparent depth (148 dark horses, 429 rising stars, 59 established, 39 emerging classified) substantially overstates differentiated cohort depth. Maybe 20-50 per TA are meaningfully ranked; the rest sit at the plateau. Pagination didn't create the issue, it surfaced it.

This elevates Foundation Issue 3 (pub velocity formula redesign) from "1-2 weeks of methodology design work" deferred to v1.5 backlog to a higher-urgency item: **the product cannot be demoed past row 20 without producing a wall of identical 47.3 cards.** Captured as P0 #10 in priority doc.

##### Workstream 3 — Scholar enrichment diagnostic and relaunch

Existing `scholar_overnight.py` script targeting HCPs with `scholar_h_index IS NULL AND total_career_pubs >= 5` (27,025 HCPs in queue). Script uses ScraperAPI for Google Scholar access at $149/month Startup plan upgraded during the session.

**First run output anomaly:** Across 250 HCPs processed, 0 matched, 249 skipped, 1 failed in 43.8 minutes. Skipped breakdown was mostly `missing_hcp_institution` (expected; 16,538 of 27,025 queue HCPs lack `institution_short`), but the HCPs that *did* reach Scholar (Christie Ballantyne, Eric Boerwinkle, Philippe Gabriel Steg, Fred Saad, Min Shi, Ramachandran S Vasan, Benjamin Besse, Pier Luigi Zinzani, Eric Van Cutsem) all returned `no_scholar_name_match`. Real, prominent researchers all failing to match was the diagnostic anomaly.

**Diagnostic process and conclusion (with two walked-back hypotheses).**

First hypothesis (incorrect): URL pattern bug. The script fetches `/scholar?q=<name>` (publication search) but parses for `.gsc_1usr` author cards, which appear on `/citations?view_op=search_authors&mauthors=<name>` (author profile search). Browser test of `/citations?view_op=search_authors&mauthors=Eric+Boerwinkle` returned "didn't match any user profiles." Hypothesis falsified.

Second hypothesis (correct on diagnosis, doesn't suggest a fix): the `/scholar?q=` URL historically surfaced an author panel side-card on publication search results (containing `.gsc_1usr` cards) for prominent researchers, but Scholar has since changed this behavior. The 662 HCPs originally enriched by `scholar_enrichment.py` happened during the period when this side-panel existed. The author profile search URL (`/citations?view_op=search_authors`) only matches *registered Scholar profiles*, and many senior researchers (Boerwinkle, Vasan, Van Cutsem) don't maintain Scholar profiles even though their publications are indexed. Eric Boerwinkle (h-index >100, hundreds of publications visible on `/scholar?q=`) does not have a profile findable on `/citations?view_op=search_authors`.

**Implication:** The script is not fundamentally broken. It is correctly identifying that most queue HCPs do not have Scholar profiles to match against. The original 662 were the easy, profile-having cohort. The remaining 27,025 will yield matches at a substantially lower rate than the 30-40% projected earlier in the session. Realistic yield: 1,500-3,000 additional h-index values from 24-48 hours of script runtime. Cost: ~50,000 ScraperAPI credits out of 1,000,000 monthly allowance (~5%).

**Decision:** restart Scholar script as-is. Don't refactor at 11pm Sunday based on hasty diagnostic. Document Scholar diagnostic remains open. Reassess actual yield Monday morning with completion data. Flag in priority doc as P1 — open question whether Scholar is an effective enrichment path for this cohort or whether OpenAlex-derived h-index becomes the primary path.

##### Workstream 4 — OpenAlex pipeline refactor with expanded data capture

The May 3 morning audit Foundation Issue 8 captured 83,779 publications-with-DOI as unenriched. Original `openalex_pipeline.py` used singleton endpoint pattern (one DOI per API call, 0.2s sleep) — would take ~28 hours to re-process the unenriched cohort. Sunday evening session refactored the script for batch processing using OpenAlex's filter endpoint, capturing 7 fields per publication instead of just `citation_count`.

**Schema migration (run via SQL Editor before script):**
```sql
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS citation_counts_by_year jsonb,
  ADD COLUMN IF NOT EXISTS authorships jsonb,
  ADD COLUMN IF NOT EXISTS primary_location jsonb,
  ADD COLUMN IF NOT EXISTS publication_type text,
  ADD COLUMN IF NOT EXISTS openalex_concepts jsonb,
  ADD COLUMN IF NOT EXISTS open_access jsonb,
  ADD COLUMN IF NOT EXISTS openalex_enriched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_publications_openalex_enriched_at
  ON publications (openalex_enriched_at)
  WHERE openalex_enriched_at IS NULL;
```

Seven new columns; partial index on the timestamp column for efficient quarterly refresh queries.

**Script refactor scope (Cursor prompt):**
- Replaced `fetch_openalex_work_by_doi` (singleton endpoint, one DOI at a time) with `fetch_openalex_works_batch` (filter endpoint, up to 100 DOIs per call, pipe-separated `doi:a|b|c` syntax)
- Replaced `update_citation_count` with `update_publication_enrichment` writing all 7 fields to publications table, conditional on non-null values, always sets `openalex_enriched_at` timestamp
- Added `extract_publication_fields` helper extracting all 7 fields from each work payload
- Added checkpoint-at-batch-level via `openalex_checkpoint.json` (every 10 batches = ~1,000 publications)
- Added `--skip-career-enrichment` flag to bypass the existing (broken — see below) career enrichment phase
- Filter publications cohort to `citation_count IS NULL` so script processes only unenriched
- 0.1 second sleep between batches (well under OpenAlex's 100 req/sec rate limit)
- Retry-with-backoff for 429 (5s, 15s) and 5xx errors

**Career enrichment phase explicitly NOT refactored.** The existing `pick_confident_author_match` function in `run_career_enrichment` uses fuzzy name matching weighted 80% on name similarity and 20% on having ≥3 works, with NO institution-based disambiguation. For common names (Joanne Kurtzberg's `first_pub_year=2025` data corruption is the example) this produces silent false positives where one researcher's `total_career_pubs` and `first_pub_year` get written from another researcher's OpenAlex profile. Running the career enrichment phase would expand corruption rather than fix the foundation. Career phase needs its own refactor with institution-gated matching (matching what Scholar does) before any future run. Captured as v1.5+ backlog.

**Validation slice (10 batches = 1,000 publications):**
- 1,723 enriched rows post-validation (counter exceeded 1,000 because batches don't stop precisely at user interrupt)
- `total_enriched`, `has_citation_count`, `has_year_data`, `has_authorships`, `has_journal_data`: all 1,723 — every field populated for every enriched row
- Sample inspection of 10 rows confirmed: clean DOIs, sensible citation_counts, real journal names with ISSNs (NEJM, Lancet, Nature), correct OA URLs
- One known data-quality noise found: 1 row had `primary_location.source.display_name = "Lara D. Veeken"` (a person's name) where the journal should have been (ISSN identified it as Rheumatology). OpenAlex itself has malformed source records for some publications. <1% volume, will deal with via post-processing later.
- Authorship JSONB contains substantially richer data than expected per author: OpenAlex author ID (canonical, stable), ORCID when present, `author_position` (first/middle/last), `is_corresponding`, full `institutions` array with ROR identifiers and country codes, `raw_affiliation_string` preserved alongside normalized data.

**Strategic significance of authorships capture (unanticipated):**
The captured `authorships` JSONB is not just citation enrichment — it's the data foundation for several future workstreams previously blocked or partially blocked:

1. **Collaborative Orbit (publication side).** OpenAlex author IDs are stable and canonical across publications. Co-authorship pairs become a single SQL query: find all publications where author A1 and author A2 both appear in `authorships`, weight by frequency, surface the network. The publication side of Orbit's `hcp_relationships` table now has its data foundation.
2. **Author position-weighted scoring.** Last author / corresponding author signals seniority; first author signals primary contribution. Both feed Established vs. Rising Stars discrimination directly. Previously not in scoring; now possible to add as v1.5 methodology evolution.
3. **Institutional career arcs.** Same author ID across publications over time shows institutional moves and career inflection points.
4. **Co-authorship strength weighting.** Frequency-weighted relationships (15 papers together over 5 years vs. 1 paper) for Orbit relationship scoring.
5. **ORCID-based identity reconciliation.** Where ORCID present, provides authoritative deduplication signal for the Category C 6,174-group manual review backlog.

**Run status at session end (~11:00pm):** Script processing batch ~750 of 838. ETA roughly 10-15 minutes to completion. Final yield expected: ~80,000-83,000 publications enriched with all 7 fields.

**Cost:** Free. OpenAlex's $1/day budget covers 838 batches × $0.10/1000 = $0.084 of the $1 daily allowance. No funding required.

**Methodology implication.** The citation_trajectory_score component (20% of Rising Stars composite) was previously computed from sparse approximations because `counts_by_year` data wasn't captured. Now it can be computed properly from actual year-by-year citation deltas. This is a methodology improvement post-run that should be captured in v1.5 scoring update.

##### Workstream 5 — Visibility-driven priority elevation

The pagination work (Workstream 2) made the publication velocity plateau visible in product for the first time. This is the explicit case the May 3 morning audit (Foundation Issue 3) predicted. Foundation Issue 3 was sequenced as roughly priority #5 in the morning's top-10 list — a v1.5 methodology design item. Sunday evening's product visibility means it should be elevated.

**Decision:** Pub velocity formula redesign moved from "deferred 1-2 week methodology design item" to active v1.5 priority. The product cannot be demoed past row 20-30 without surfacing the plateau. Captured as P0 #10 in priority doc.

##### Workstreams that did NOT execute (deliberate)

**Eligibility gate tightening (Option 1 from session).** Considered SQL UPDATE to demote HCPs failing documented eligibility gate (`total_career_pubs IS NULL OR < 10`) from rising_star/dark_horse to unranked. Volume preview: 120 demotions across 3 TAs (matching May 3 morning Foundation Issue 4 exactly). BUT name-level preview revealed top-cohort HCPs would be incorrectly demoted: Yang Wang (Hepatology dark_horse, composite 72.04 — top of cohort, null career_pubs due to OpenAlex enrichment incompleteness, NOT thin record), Michael Trauner (established hepatologist at MedUni Vienna), Amit G Singal (UT Southwestern, HCC researcher). The naive gate cannot distinguish "data foundation incomplete" from "thin actual record." Walked back. Proper fix is data-presence-weighted formula (Foundation Issue 5) which lifts composite scores for data-incomplete HCPs without affecting plateau-bug HCPs. Multi-day work, deferred.

**OpenAlex Phase B (career enrichment) refactor.** The existing fuzzy-name-only matching in `pick_confident_author_match` produces silent false positives for common names (Joanne Kurtzberg's `first_pub_year=2025` data artifact is a probable example). Refactor requires institution-gated disambiguation (matching Scholar's gate). Multi-day methodology work; deferred to v1.5+. Career enrichment phase preserved in script but skipped tonight via `--skip-career-enrichment` flag.

##### Session-end state (Sunday May 3, ~11:00pm)

| Workstream | Status |
|---|---|
| Country normalization (P0 #7) | Complete for buyer-relevant cohort. Residual long-tail captured as ingestion-pipeline backlog. |
| Pagination (P0 #4 subitem) | Shipped to product. Working in dev. |
| OpenAlex DOI enrichment (Foundation Issue 8) | Running. ~95% complete. Expected ~80K-83K publications enriched with 7 fields by ~11:15pm. |
| OpenAlex career enrichment (Phase B) | Deliberately skipped. Refactor deferred to v1.5+. |
| Scholar enrichment | Restarted as-is after diagnostic. Yield uncertain; 24-48 hours expected runtime to exhaust 27,025 queue. |
| Pub velocity plateau (Foundation Issue 3) | Surfaced visibly in product via pagination. Elevated to P0 #10 in priority doc. |

##### v1.5+ backlog accumulated during May 3 Sunday evening

- Pub velocity formula redesign (Foundation Issue 3) — elevated from v1.5 deferred to active v1.5 priority based on product visibility. 1-2 weeks methodology design work.
- Data-presence-weighted formula (Foundation Issue 5) — required for v1.3+ correctness across both Rising Stars and Established composites. Blocks naive eligibility gate tightening. 2-3 days implementation.
- Established KOLs composite implementation (Foundation Issue 1) — schema migration plus scoring pipeline expansion plus tier rebuild SQL. 1 week, depends on classic trial matrix specification.
- Classic trial matrix specification (Foundation Issue 7) — 1-2 days methodology design.
- Dual-path eligibility gate (Foundation Issue 4) — small SQL change; methodology decision documented. 1-2 days.
- OpenAlex Phase B (career enrichment) refactor with institution-gated disambiguation — multi-day methodology work.
- Citation trajectory recomputation using `counts_by_year` data now captured — v1.5 scoring update.
- Author position-weighted scoring component using captured `authorships` data — v1.5 methodology evolution.
- Collaborative Orbit (publication side) computation from captured `authorships` — `hcp_relationships` table population, co-author pair extraction, frequency weighting. Trial side still depends on trials pipeline matching fix.
- Country field ingestion-layer fix (the right fix for the residual long-tail corruption) — PubMed affiliation parser revision. Ingestion-layer work.
- ORCID-based deduplication for Category C 6,174-group manual review backlog — uses captured `authorships.author.orcid` field.
- Secondary citation source evaluation (CrossRef, Semantic Scholar) — for the share of the unenriched cohort that's OpenAlex coverage gap rather than script-side issue.
- Validation cohort building from public sources (AASLD Emerging Liver Scholars, ASCO YIA, NASPGHAN rising star awards, Conquer Cancer Foundation YIAs) — measuring instrument for all subsequent methodology work.
- Methodology doc internal consistency review (Foundation Issue 2) — composite weights vs tier classification sections; OpenAlex characterization update; periodic discipline.
- H-index strategic decision (Scholar continuation vs. OpenAlex-derived vs. hybrid) — deferred until OpenAlex coverage matures via quarterly refresh and Scholar's actual yield is known.

#### May 4 Monday morning session — bug recovery, Scholar killed, Orbit foundation analysis

A focused Monday morning session (~8am-12pm Eastern) verified Sunday's overnight runs, discovered two bugs, killed Scholar enrichment after empirical zero-yield confirmation, ran OpenAlex re-run to recover the unchanged-path bug, and conducted Orbit foundation analysis that surfaced a third architectural issue. Three bugs found and addressed; one workstream pivot.

##### Workstream 1 — Scholar enrichment killed after empirical zero-yield confirmation

Sunday evening Scholar enrichment ran ~12 hours overnight against the 27,025-HCP queue. Monday morning verification:
- 3,800 HCPs processed, **0 matched, 0 failed, 3,800 skipped**
- ScraperAPI consumed ~105K credits (10.5% of monthly budget)
- Skip reasons: mostly `missing_hcp_institution` (expected) plus `no_scholar_name_match` for the institution-having queue (Christie Ballantyne, Eric Boerwinkle, Philippe Gabriel Steg, Fred Saad, Min Shi, Ramachandran S Vasan, Benjamin Besse, Pier Luigi Zinzani, Eric Van Cutsem, etc.)

**Root cause confirmed:** Sunday's diagnostic conclusion was empirically correct. The 662 HCPs originally enriched by `scholar_enrichment.py` were the easy-cohort — researchers with verified, surfacing-on-publication-search Scholar profiles. The remaining 27,025 cohort largely doesn't have findable Scholar profiles. Browser tests Sunday evening confirmed this (Eric Boerwinkle, h-index >100, hundreds of indexed publications, `/citations?view_op=search_authors&mauthors=Eric+Boerwinkle` returns "didn't match any user profiles").

**Decision:** Killed Scholar Monday morning. Continued runtime burns credits without yield. Remaining ~895K monthly credits preserved for other use cases. Methodology decision on h-index path deferred per Sunday's framing — h-index from Scholar is a dead path for this cohort; OpenAlex-derived h-index requires the OpenAlex coverage maturation that's months away. Strategic decision is for v1.5 methodology work, not a Monday morning patch.

##### Workstream 2 — OpenAlex unchanged-path bug discovered and recovered

Sunday's overnight OpenAlex re-run reported clean completion: 82,056 publications processed, 28,567 updated, 53,305 unchanged, 176 not found, 8 failed. **Database verification revealed only 51,770 publications actually got new JSONB fields written.**

**Root cause:** The script's "unchanged citation_count" path was skipping the entire database write, including the new JSONB fields (authorships, primary_location, citation_counts_by_year, publication_type, openalex_concepts, open_access). The optimization was correct when only citation_count was being written, but became incorrect after Sunday's refactor added 6 new JSONB fields plus a timestamp. The 53,305 "unchanged" publications had their OpenAlex API responses fetched and parsed but never written to the database.

**Why it wasn't caught Sunday evening:** Validation slice was unrepresentative — all 1,723 validation rows happened to be on the "updated" path (citation_count went from null to non-zero). The "unchanged" path that affects ~half the cohort never appeared in validation. Audit pattern improvement: validation slices should explicitly include rows from all branch paths the script can take, not just the most-active path.

**Recovery (Monday morning):** Cursor refactor with two changes:
1. Filter expanded from `citation_count IS NULL` to `openalex_enriched_at IS NULL`, catching both unchanged-path bug victims (~32,009 publications) and original-pipeline-only cohort (~105,156 publications). Total re-run scope: ~137,165 publications.
2. Update logic rewritten — always write JSONB fields and timestamp when OpenAlex returns data, regardless of citation_count comparison. Removed the citation_count equality check entirely; "unchanged" counter retained but unused.

Validation slice (603 publications across ~7 minutes of runtime) confirmed fix: all 603 had `authorships`, `primary_location`, `citation_counts_by_year`, `citation_count` populated, including 538 (89%) with `citation_count = 0` — the population that was previously skipped. Full re-run launched ~10am, expected completion ~12:30pm. Final yield expected: ~135K-140K publications with full 7-field JSONB enrichment.

**Audit log implication:** When refactoring write paths to add new fields, audit existing conditional write logic for assumptions that may no longer hold. The "skip if value matches" optimization was preserved verbatim from the prior version of the script during Sunday's prompt; it should have been audited and either removed or scoped to the citation_count column only.

##### Workstream 3 — Trials pipeline architectural issue (Orbit blocker)

Monday morning Orbit foundation analysis examined the trials pipeline (`trials_pipeline.py`) to assess whether trial-side Orbit data is computable on current data. Findings:

**Coverage analysis:**
- 552 verified trial linkages across 567 launch-TA HCPs
- TA distribution: NSCLC 321, Rare Disease 140, Hepatology 106
- Per-HCP distribution shows healthy long-tail: 2 HCPs at 24 trials, 2 at 23, 1 at 22-19 each, 18 HCPs in 10-15 range, 142 HCPs total with ≥4 trial linkages
- These coverage numbers projected as workable for Orbit-via-trials computation

**Architectural issue surfaced:** The script processes one HCP at a time (investigator-first architecture) and only records the *queried* HCP's link to each trial. Other co-investigators on the same trial are visible in the CT.gov API response but never written to the database. Co-investigator pair computation is impossible from current `trial_investigators` data.

Empirical validation: Single-HCP orbit query against the highest-link HCP (24 trial linkages) returned **zero co-investigators**. Reason: every trial in our database has exactly one investigator linkage (the HCP whose name was queried). Other 2-4 investigators per trial visible to CT.gov are filtered out by `name_ok()` and `compute_affiliation_confidence()` gates that only validate against the target HCP.

**Decision:** Architectural refactor required. Decouple ingestion from matching:
- Stage 1: Record EVERY investigator on every trial (raw name + role + trial_id), with `hcp_id` null when no match yet
- Stage 2: Separate matching pipeline walks unmatched investigator names and resolves each to an HCP via fuzzy matching + institution/state disambiguation

Captured as P0 #8f in priority doc. Estimated 2-3 days focused work plus runtime. Gating dependency for Orbit-via-trials.

**Methodology weighting decision (per Garrett):** Trials side weighted more heavily than publications side, with both incorporated into the composite Orbit relationship score. Trials side is currently blocked (P0 #8f) but heavier-weighted. Publications side is unblocked (Monday OpenAlex re-run captures `authorships` JSONB on ~135K publications) and lighter-weighted. Both sides need to be in place before Orbit can ship as a feature; v1.0 lite via publications-only would not honor the methodology weighting decision.

##### Workstream 4 — Industry exclusion gap surfaced

Top-cohort review during Orbit candidate selection surfaced two HCPs with pharma/biotech affiliations ranking high in launch TA cohorts:
- **Yang Wang at "Medicine Design"** — Hepatology #1 by composite (72.04, dramatically higher than #2 Gores at 31.30). "Medicine Design" plausibly a pharma R&D department naming convention.
- **Ruihan Guo at "Helixon US Inc."** — NSCLC #4 (composite 30.30). Helixon is an AI-drug-discovery biotech.

P0 #1 industry exclusion shipped tactical fix only (string pattern matching against `INDUSTRY_PATTERNS` list). Pattern list may be incomplete for modern pharma/biotech naming. Architectural hardening was deferred to v1.5.

**Decision:** Industry exclusion gap captured as P0 #8g. Pattern audit + expansion (1 day). Consider whether OpenAlex `authorships[].institutions[].type` provides more robust filter signal than string patterns (institutions tagged as `"company"` would catch Helixon-type cases regardless of name). Architectural fix is v1.5.

##### Workstream 5 — Duplicate publication rows finding

Per-DOI inspection during Orbit work revealed `publications` table stores one row per HCP-author pair, not one row per unique publication. A 6-author Hepatology paper (DOI `10.1093/HEP.0000000000000004`, Younossi 2024) has 8 rows in our database — 6 unique authors plus 2 duplicate `hcps.id` records (Linda Henry, James M Paik) that didn't merge during dedup.

**Affects every aggregate query touching publications.** Counting publications gives publication-author-pair count, not unique publications. Pub velocity, citation totals, journal counts, citation_trajectory_score — all potentially inflated by the duplication factor. Linda Henry / James M Paik duplicates suggest Category C dedupe backlog (6,174 unmerged groups) is producing this issue at scale.

**Decision:** Captured as P0 #8h. Two possible fixes:
1. Deduplicate publications table — collapse to one row per unique DOI. Requires choosing canonical hcp_id or making publications-to-hcps a proper junction table. 1-2 days schema change + migration.
2. Audit aggregate queries — ensure all publication aggregates use `COUNT(DISTINCT doi)` rather than `COUNT(*)`. Doesn't fix the underlying data model but prevents inflation. Half-day audit.

Fix priority depends on whether scoring computations are currently affected. Sunday's eligibility gate work and current composite formula need audit against this finding before next rescore.

##### Workstream 6 — Publication-side Orbit data foundation validated

OpenAlex re-run (in progress through Monday morning) populates `authorships` JSONB on ~135K publications by completion. Each authorship contains:
- Canonical OpenAlex author ID (stable across publications)
- ORCID when present
- `display_name`
- `author_position` (first/middle/last)
- `is_corresponding` flag
- `institutions` array with ROR identifiers, country codes, lineage hierarchy
- `raw_affiliation_string` preserved
- `countries` array (per-author)

Sample inspected (Younossi Hepatology paper, 6 authors): all 9 fields populated for every author. ORCIDs present for all 6 (unusual completeness, helps Orbit dedup). Position pattern correctly tagged (first/middle×4/last). `is_corresponding` correctly identifies Younossi as the corresponding author.

**Capture rate caveat:** Per-HCP capture rate varies dramatically by career stage. Established researchers like Gregory Gores (1,013 career_pubs in `total_career_pubs`) have only ~5% of their publications visible in our database (97 publication-author-pair rows = ~30-50 unique publications). Mid-career rising stars typically have much higher capture rates because their publication corpus is small enough that ingestion captured most of it.

**Methodology implication:** Orbit is most valuable on the cohort where (1) MSLs need help (don't already know the HCP), (2) data is most complete (recent enough that ingestion captured most of corpus), (3) network is still forming (not already public knowledge). All three constraints align on mid-career rising stars and dark horses. Orbit is essentially a feature of the Rising Stars view, not a feature for the entire platform. Established KOLs have established networks that MSLs already know; Orbit on Established adds less product value.

##### Session-end state (Monday May 4, ~12pm)

| Workstream | Status |
|---|---|
| Scholar enrichment | Killed. Methodology decision on h-index path deferred to v1.5. |
| OpenAlex re-run | In progress, ~75% complete at session check. Expected completion ~12:30pm. |
| Trials pipeline architectural issue | Identified, captured as P0 #8f. 2-3 days refactor scope. |
| Industry exclusion gap | Identified, captured as P0 #8g. 1 day pattern audit. |
| Duplicate publications finding | Identified, captured as P0 #8h. Half-day audit + 1-2 day schema fix. |
| Publication-side Orbit foundation | Validated, ready when OpenAlex completes. |
| Trials-side Orbit foundation | Blocked on P0 #8f. |
| Orbit methodology weighting | Decided — trials heavier than publications, both incorporated. |

##### Audit log entry — bug discovery patterns

Two bugs discovered Monday morning (OpenAlex unchanged-path skip, trials pipeline single-investigator-only). Both share a pattern: **assumption preserved verbatim from earlier version of the code without auditing whether the assumption still holds**.

OpenAlex unchanged-path: the `if new_citation == old_value: skip database call` optimization was preserved during Sunday's refactor. It was correct when citation_count was the only field being written; it became incorrect when 6 new JSONB fields were added and the optimization wasn't scoped to the citation_count column.

Trials pipeline single-investigator: the `if not name_ok(target_first, target_last, official_name): continue` filter is correct for matching the queried HCP to a trial, but the script doesn't separately record other officials as candidate HCPs. The pattern of "filter to what we want, discard the rest" was correct when the script's only job was per-HCP linkage; it's incorrect now that we want network-side data.

**Lesson for audit pattern:** When a script's purpose evolves (Sunday's enrichment refactor, Orbit's network requirements), audit the existing logic for assumptions that may no longer match the new purpose. Don't preserve "existing logic where possible" without deliberate review.

#### May 4 Monday afternoon session — Orbit publication-side validation, trials pipeline Stage 1 + 1.5 refactor, Stage 2 algorithm specification

A focused Monday afternoon session (~12:30pm-5pm Eastern) executed the trials pipeline architectural refactor scoped this morning as a 2-3 day P0 blocker, compressed it to a single afternoon by leveraging clean architectural decisions upfront, and discovered an even more valuable expansion (site-level investigator capture) mid-stream. Three workstreams completed; Stage 2 (matching pipeline) remains as tomorrow's work.

##### Workstream 1 — Publication-side Orbit proof-of-concept

Validated the publication-side foundation by running the orbit query (drafted Monday morning during the OpenAlex re-run wait) against two test HCPs:

**Krupa R Mysore (pediatric hepatology, OpenAlex ID `A5007382188`):**
- 91% capture rate (53 of 58 career publications visible in our database with authorships JSONB)
- Disambiguation challenge: candidate query returned 3 OpenAlex IDs for "K Mysore" (Keshava Mysore, Krupa R. Mysore, Kirankumar S. Mysore). Manually selected correct ID by ORCID + display name match. This validates that the eventual `hcps.id ↔ openalex_author_id` mapping pipeline (Phase 2 of Orbit work, P1 #14) needs institution gating, not just fuzzy name matching.
- Orbit query returned 15 collaborators meeting threshold (`>=2 papers, >=1 recent`)
- Top collaborator at heat 17.0 (Sanjiv Harpavat at Texas Children's), tail down to 6.0
- Institutional clustering recognizable: 5 collaborators at Baylor, 2 at Texas Children's, plus Cincinnati Children's, Lurie, Children's Hospital of Pittsburgh, Riley, Emory, Michigan
- Recognizable pediatric hepatology figures in orbit (Karpen, Alonso, Miethke, Magee, Horslen)
- Heat scoring formula (`count + recent_count × 2`) produced reasonable rankings
- Position pattern heuristic correctly tagged Moreshwar S. Desai as "mentor" (consistently last author on shared papers)

**Eric Samorodnitsky (NSCLC #1 rising_star, OpenAlex ID `A5003346438`):**
- 34% capture rate (22 of 67 career publications visible)
- Orbit returned 15 collaborators meeting threshold
- **Single-institution dominated:** 13 of 15 collaborators at Ohio State University, dominated by Sameek Roychowdhury (classified mentor by heuristic, last author on shared papers)
- External web verification revealed Samorodnitsky is a Research Scientist Ph.D. (Postdoctoral Fellow) at OSU Wexner Medical Center, not a clinical investigator. Works in Roychowdhury's precision oncology lab on RNA sequencing assay validation. Does not see NSCLC patients.

**Methodology insight:** The orbit query produces fundamentally different topology for clinical investigators (multi-institutional consortium pattern) vs. research scientists (single-lab cluster). The output isn't "wrong" for Samorodnitsky — it accurately surfaces his actual professional network, which is a single lab. The problem is that he shouldn't be ranked NSCLC #1 rising star in the first place.

This led to surfacing P0 #8k — non-clinician research scientists ranked as clinical rising stars across all three launch TAs (Yang Wang in Hep, Samorodnitsky and Ruihan Guo in NSCLC). The pattern is consistent across launch TAs and undermines the product's central credibility claim. Captured as a credential validation problem requiring NPI + trial-role signals, which themselves depend on completing the trials pipeline refactor.

##### Workstream 2 — Trials pipeline Stage 1 (capture all overall_official investigators)

Architectural decisions locked in 5 minutes (single-table nullable hcp_id, decoupled matching, investigator-first discovery preserved with full-trial-fetch). Cursor implementation produced clean refactor:

- Schema migration: `trial_investigators.hcp_id` made nullable; added `match_confidence INTEGER`, `investigator_raw_first_name`, `investigator_raw_last_name`, `investigator_raw_affiliation` columns; existing 552 verified rows migrated to `match_confidence = 100`
- Unique constraint added on `(trial_id, raw_first_name, raw_last_name, role)` for upsert idempotency
- `extract()` function modified to record EVERY official with valid role, with hcp_id NULL when not the queried HCP
- `insert_links()` modified to use upsert with on_conflict semantics
- 5-HCP test passed first acceptance check

**Bug discovered: `splitn()` parser failed on multi-credential names.** "Rebecca J Brown, M.D., Ph.D." was parsing to `first_name="m d", last_name="rebecca j brown"` because the credential-stripping regex only handled ONE trailing credential. Created 14 malformed rows in initial test run.

Fix: changed regex to loop until no more matches, handling multiple sequential credentials. Re-tested. 14 malformed legacy rows cleaned up via two-step preview SQL → DELETE pattern (preserved verified counterparts).

##### Workstream 3 — Trials pipeline Stage 1.5 (site-level investigator capture)

Discovered mid-Stage-1 that the average investigator-per-trial was 1.36 — far below the 3-5 we'd projected. Investigated by inspecting NCT05675410 (Hodgkin Lymphoma phase 3, ECOG-ACRIN cooperative group) directly via the CT.gov API:

**Key finding:** The trial had 404 locations (US sites) with 397 site PIs in `locations[].contacts[]`. None were captured by Stage 1, which only reads `overallOfficials[]`. Site PIs are the actual treating-physician investigators MSLs care about — they're missing from our entire trial dataset.

**Stage 1.5 implementation (same afternoon):**
- Schema expanded: `investigator_raw_facility`, `investigator_raw_city`, `investigator_raw_state`, `investigator_raw_country`, `source` columns added
- Unique constraint expanded to include `source` and `investigator_raw_facility` to differentiate overall_official from site_contact rows for the same investigator
- `extract()` second pass added over `locations[].contacts[]`: captures every site contact with valid role (PI, Sub-I, Study Chair, Study Director), populates structured location fields per site
- 5-HCP test produced 484 trial_investigator links (vs. 28 from pre-1.5 — already an order of magnitude richer)
- 50-HCP test produced 17,385 trial_investigator links: 17,005 PRINCIPAL_INVESTIGATOR + 346 SUB_INVESTIGATOR + 18 STUDY_CHAIR + 17 STUDY_DIRECTOR
- 13,594 site_contact rows captured with full structured location data (facility/city/country populated 100%, state populated 98.4%)

**Trial-level investigator distribution post-Stage-1.5 (from 50-HCP test):**
- 6 trials with 100+ investigators: Olaparib ovarian (665), EQUATE myeloma (527), BRCA1 surgical (484), regional radiotherapy (412), Hodgkin Lymphoma (399), MyeloMATCH AML (221)
- 2 trials with 50-99 investigators: Bria-IMT breast (85), ACR-368 endometrial (70)
- 1 trial with 20-49 (lutetium prostate, 26)
- 1 trial with 2-4 (clear cell RCC, 3)
- Long tail of single-investigator trials (mostly NIH-sponsored or industry phase 1)

**Investigator-network shape:**
- 4,851 unique investigators surfaced from 50-HCP queries
- 122 investigators in 5-9 trials, 136 in 10-19 trials (the prolific clinical investigator spine)
- One outlier (Kathleen Butler at Michigan, 26 trials)
- Eight investigators appeared in exactly 19 trials each — empirically validated as COG (Children's Oncology Group) cooperative-group portfolio site PIs (Jeffrey Dome at Children's National, Aarati Rao at CHLA, Emad Salman at Nicklaus Miami, etc.) all running the same 19 pediatric oncology protocols

**One mid-run statement timeout** (`canceling statement due to statement timeout`) occurred during the full-cohort run on a `clinical_trials` upsert. Cause: trials with 400+ locations have large JSONB payloads in the `locations` column; Postgres timeout exceeded. Fix: chunked `upsert_trials()` into 10-row batches (was unbounded). Resume from checkpoint working.

##### Workstream 4 — Stage 2 matching pipeline algorithm specification

Drafted Tier 1 prototype query against current 38,891 site_contact rows. Joined to NPI HCPs by last_name + state (after normalizing state full names to abbreviations). Returned top 50 candidate matches.

**Match quality on the prototype output:**
- All 50 returned matches scored 100 (city + first_name + institution all matched)
- Spot-check of recognizable names: Najat Daw at MD Anderson, Karen Reckamp at Cedars-Sinai, Zofia Piotrowska at MGH, Panagiotis Konstantinopoulos at Dana-Farber, Bartosz Chmielowski at UCLA — all real and clean
- One false positive identified: "Derek Wong" matched to "Deborah Wong" (same last name, same state, same city, but different first names — the algorithm accepted because both start with "D"). Fix: tighten first-name verification to require exact match OR initial-only-with-confirmation, not just shared first letter.

**Resolution ceiling on current data:**
- 44,019 unmatched US site_contact rows (after current Stage 1 + 1.5 ingestion through the partial run)
- 4,381 (10%) have at least one HCP candidate by last_name + state criteria
- 39,771 (90%) have NO candidate — corresponding HCP records simply don't exist in our database with usable data

**Candidate distribution among matchable rows:**
- 3,546 (81%) have exactly 1 candidate — deterministic match if first_name verifies
- 538 (12%) have 2-3 candidates — disambiguation by city/institution
- 207 (5%) have 4-9 candidates — multi-signal disambiguation required
- 90 (2%) have 10+ candidates — strict three-way match needed (common-name cases like Smith, Lee, Wang)

**Stage 2 algorithm decisions locked May 4 afternoon:**
- Add `match_status` column to `trial_investigators` (cheap, useful for audit)
- Confidence floor 75 for accepting matches (conservative; better to leave unmatched than create false positives)
- Skip prefix-name handling ("Del Priore", "Van Cutsem", "von Eschenbach") for v1
- Single matcher script `trial_investigator_matcher.py`, runs as separate workstream
- Group queries by `(last_name, state)` for performance — one candidate query per unique key
- Decision tree: 0 candidates → no_candidate; 1 candidate → first_name verification @ confidence 95; 2-3 → city + first_name @ 85, else institution overlap @ 75; 4-9 → require all three @ 70; 10+ → strict three-way match @ 65

**The 10% resolution ceiling is the most important strategic finding from the afternoon.** Most US clinical trial site PIs are real clinicians who simply aren't in our HCPs database (they don't publish much, or their publications aren't in our index, or their NPI hasn't been pulled). Resolving the 90% unmatched rows requires HCP database expansion (P0 #8l), not algorithm improvements. The Orbit graph will still display unmatched site_contacts as text-only nodes ("Dr. Smith at Camden Clark Medical Center, WV") — useful intelligence even without click-through HCP profiles.

##### Workstream 5 — Full re-run launched

Initiated full re-run against ~5,860 NPI HCPs. Crashed mid-run on `clinical_trials` upsert statement timeout (handled in Workstream 3 with chunked upserts). Fix applied, run resumed from checkpoint. State at session pause:
- ~250-300 HCPs processed
- 4,910 overall_official rows (was 2,127 pre-afternoon)
- 54,307 site_contact rows (was 38,891 pre-afternoon)
- 2,864 unique trials in clinical_trials (was ~1,800 pre-afternoon)

Resumed run is in progress as of session close. Likely overnight to Tuesday morning depending on resumed pace.

##### Session-end state (Monday May 4, ~5pm)

| Workstream | Status |
|---|---|
| Publication-side Orbit POC (Mysore) | Validated. Mechanics work for clinical investigator profile. |
| Publication-side Orbit POC (Samorodnitsky) | Surfaced P0 #8k (non-clinician researchers in feed). Orbit accurate but should not have been ranked rising star. |
| Trials pipeline Stage 1 | Complete. Schema migration applied, parser bug fixed, 14 malformed rows cleaned. |
| Trials pipeline Stage 1.5 | Complete. Site-level capture validated at 50-HCP scale. 17,385 links from 50 HCPs. |
| Trials pipeline full re-run | In progress. Resumed from checkpoint after statement timeout fix. |
| Stage 2 matching pipeline algorithm | Specified with empirical validation. Implementation = tomorrow's primary work. |

##### Methodology insight — what site-level capture means for Orbit

Pre-afternoon: Orbit-via-trials assumed 552 verified linkages with 1 investigator per trial = no co-investigator pairs computable. Orbit graph essentially zero-density on the trial side.

Post-afternoon: Site-level capture produces 100-665 investigators per major cooperative-group oncology trial, ~10-30 investigators per typical industry-sponsored phase 2/3. The 50-HCP test alone surfaced 4,851 unique investigators, with 259 appearing in 5+ trials. These prolific multi-trial investigators form the spine of the Orbit network.

For Orbit composite scoring, the trial-side weighting decision (heavier than publications) now has substantive data to weight. Pre-afternoon, the heavier weighting would have applied to nearly empty data. Post-afternoon, it applies to a network where:
- Strong edges = two HCPs both in `overallOfficials` of same trial (Study Chair + Study Director)
- Strong-medium edges = site PI ↔ Study Chair on same trial (the COG-style cooperative group pattern)
- Medium edges = two site PIs at different sites of same trial (cooperative group cohort)
- Weak edges = single-trial overlap with no other evidence

The relative edge weights become a methodology design choice for Phase 4 of the Orbit work (composite scoring). Today's foundation work made that design exercise meaningful instead of theoretical.

##### Audit log entry — productive workstream compression

Today's afternoon session compressed what was scoped this morning as a 2-3 day P0 workstream (P0 #8f, trials pipeline architectural refactor) into approximately 4 hours of focused work. The compression was real, not optimistic narration:
- Stage 1 schema + extract() refactor + parser fix: ~90 minutes
- Stage 1.5 site-level capture refactor (genuinely new scope discovered mid-stream): ~60 minutes
- Stage 2 algorithm specification with empirical validation: ~45 minutes
- Test cycles, cleanup, diagnostics, full-run launch: ~75 minutes

**What enabled the compression:**
1. Architectural decisions made upfront with clean A/B options rather than open-ended design exploration
2. Cursor prompts that specified scope precisely with code samples, leaving implementation to autocomplete-style execution
3. Empirical testing at 5-HCP scale before scaling to 50-HCP, before launching full run — small failures absorbed cheaply
4. Willingness to expand scope (Stage 1.5) when the data revealed a more valuable architecture, rather than defending the original Stage 1-only plan

**What remains (Stage 2 + downstream):** The matching pipeline itself is ~1 day of Cursor work + runtime. After that, `hcp_relationships` table computation (~half day), Orbit composite scoring methodology design (~1 day), frontend Orbit feature (~2-3 days). Total Orbit feature timeline: 3-5 weeks remaining vs. the 4-6 weeks projected this morning.

#### v1.5+ backlog accumulated during May 2 work

- Country field re-normalization (US-state-as-country false positives; semantic remap or NPI-derived backfill required)
- DetailScreen score breakdown bars wired to real component scores (currently hardcoded 94/88/81/76)
- DetailScreen "Career age multiplier" row removed (multiplier is not a 0-100 score, was misrepresented as one); replacement candidate is h-index score or institution_tier_score when populated
- DetailScreen career age display still hardcoded "4.2 yrs" — needs first_pub_year wiring (HCPCard pill is wired, DetailScreen header pill is not)
- getHCPDetail and searchHCPs column name fixes (`pub_velocity`/`citation_trajectory`/`trial_score` → `pub_velocity_score`/`citation_trajectory_score`/`trial_investigator_score`)
- DetailScreen "Dr. {hcp.name.split(' ').slice(1).join(' ')}" name parsing — patched in HCPCard but verify no remaining instances
- Country code map in HCPCard.tsx — coverage gaps for Czech Republic, Hungary, several others present in dataset
- AppHCP type drift — `as unknown as` casts at five call sites in App.tsx; cleanup before LinkedIn OAuth introduces user types
- Profile screen interactive features (Region buttons, Default View persistence, notification toggles) are decorative; verify scope and either wire or strip
- Territory-aware filtering for Dark Horses chip ("your territory" copy removed; actual state-level filtering deferred until country/state data is normalized)
- DOL panel integration in TASelectionScreen (currently shows on feed, may be valuable on TA selection screen with verified DOL count next to the tier counts)
- Re-run scoring pipeline after OpenAlex citation backfill completes (current scoring uses incomplete citation data; tier distribution may shift after fresh run)
- Pub velocity calibration — observation that low-publication-count dark horses cluster at 19.7-19.8x suggests potential plateau in formula; investigate calibration in v1.5
- Confirm ingestion pipeline now uses INSERT ... ON CONFLICT (hcp_id, therapeutic_area_id) DO UPDATE — unique constraint will fail loudly otherwise on next run

#### v1.5+ backlog from prior sessions (carried forward)

- ~8,000 truncated names from PubMed UTF-8 ingestion (re-fetch required)
- getRisingStars and getHCPDetail still query verbose `institution` column instead of `institution_short` (inconsistent with getVerifiedDOLs which uses institution_short)
- Cross-state same-person manual reconciliation (~50-150 major researchers including Younossi, Noureddin)
- First-name-variant consolidation (Stephen A Harrison appears across 14+ rows)
- Category C 6,174-group manual review backlog from v1 dedupe
- Institution synonym expansion (would have caught Lovly, Desai, Reiberger as DOLs)
- DOL scoring as composite component (DOLs currently identified separately; scoring contribution remains v1.5+)
- Bluesky capture implementation (scaffolded only)
- Patient DOL identification (separate ethical framework, v2)
- Neurology TA addition (post-launch)
- Immunology TA data (deferred to Fall 2026 by design)
- LinkedIn OAuth prep work (privacy policy, terms, marketing site URL prerequisites)
- Domain/hosting decisions (fieldmark.health investigated; trademark search pending)
- Institution tier weighting decision for NSCLC and Hepatology (tier lists exist for Rare Disease only; institution_tier_score is weighted 5%/15% in Rising Stars/Established composites but lists are not built for the other launch TAs — either zero the weight outside Rare Disease or build the missing tier lists)

---

*This document is maintained alongside FieldMark development. Substantive methodology changes are versioned and rationaled here.*
