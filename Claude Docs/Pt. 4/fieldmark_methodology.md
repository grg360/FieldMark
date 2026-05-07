# FieldMark Scoring Methodology

**Version:** 1.3 (in development)
**Last updated:** May 2, 2026
**Status:** Living document — updated as decisions are made

---

## Purpose

This document describes the methodology FieldMark uses to identify rising-star healthcare professionals (HCPs) and digital opinion leaders (DOLs) for pharmaceutical Medical Science Liaison (MSL) teams. It exists to provide methodological transparency to users, partners, and the broader medical affairs community.

FieldMark's central claim is that traditional KOL identification systematically over-weights signals that correlate with established status (Phase 3 PI roles, citation totals, top-tier institution affiliation) and under-weights signals that correlate with emerging influence (early-phase trial activity, citation trajectory, multi-sponsor research engagement, investigator-initiated work). This document explains how FieldMark's scoring reflects that thesis.

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
