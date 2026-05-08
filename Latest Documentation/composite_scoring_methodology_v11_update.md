# Composite Scoring Methodology — v1.1 Update Notes

**Version:** v1.1 update notes (to be incorporated into composite_scoring_methodology.md)  
**Date drafted:** May 7, 2026 (evening)  
**Status:** Append to existing methodology document or replace v1.0 sections as noted.

---

## Why this update exists

The original methodology document described two tracks: Community HCP and Academic Rising Star. During the late-afternoon session on May 7, the framework evolved to three distinct cohorts. This update reflects that evolution.

Three cohorts, mutually exclusive, with explicit classification hierarchy. UI ordering reflects strategic priority.

## The three cohorts

**Rising Stars** — emerging academics with steep recent trajectory. Mid-career or earlier figures with publication velocity and citation acceleration. Not yet on every advisory board. Not yet famous in their field.

**Community** — practicing HCPs in regional settings. Defined by patient impact, geographic anchoring, practice volume, and procedural depth. May or may not publish.

**Established** — senior, well-known academics. Already on every pharma's KOL list. Famous in their field. Decades of publications.

## Strategic positioning

Rising Stars and Community are FieldMark's differentiated value propositions — these are HCPs that traditional KOL databases consistently miss. Established figures are well-served by traditional databases (Definitive, Veeva, ZoomRx). FieldMark includes Established for completeness so users don't have to leave the platform, not as the differentiated value prop.

UI track switch ordering: Rising Stars / Community / Established. Default landing on Community (Track #1 priority for v1).

## Mutual exclusivity and classification hierarchy

An HCP belongs to exactly one cohort, not multiple. When an HCP could qualify for multiple cohorts, the classification follows a strict hierarchy:

**Established > Rising Star > Community**

Practical implications:
- An HCP qualifying for Established is not also a Rising Star, even if they have recent acceleration
- An HCP qualifying for Rising Star is not also Community, even if they practice clinically
- Community is the catch-all for active practitioners who are neither Established nor Rising

## Updated classification criteria

### Rising Star qualifies if all of:

1. Career age ≤15 years (NPI date or publication first-year, whichever is more reliable)
2. Publication velocity ≥1.5x peer baseline (showing acceleration vs typical for career age) AND/OR citation trajectory positive and accelerating
3. Industry engagement breadth low — engaged with ≤3 distinct manufacturers in past 2 years (this is the "not yet on every advisory board" signal — see "Why engagement breadth, not dollars" below)
4. NOT classified as Established by other paths

### Established qualifies if career age >15 years AND any of:

1. Cumulative publications in top 25% of all publishing HCPs in their TA
2. Industry engagement breadth high — engaged with 5+ distinct manufacturers AND sustained $50K+/year cumulative
3. Multiple trial principal investigator roles (3+ industry-sponsored trials as PI)
4. Top-tier academic affiliation + sustained publication output

Multiple paths to Established because senior physicians have different recognition profiles. Some are publication-prolific. Some are trial-prolific. Some are speaker/consultant-prolific. Some are all three.

### Community qualifies if all of:

1. Not classified as Rising Star or Established
2. Has Medicare practice volume (proves they actively see patients)
3. Located in a non-academic-cluster region OR has community-style practice setting (group_practice, solo_practice, hospital_affiliated)

## Why engagement breadth, not dollars

A genuine Rising Star might already be on the radar of 1-2 forward-looking pharma companies (the ones who do their own scouting work). They've been engaged for advisory boards, maybe an early-phase trial. But the broader market hasn't caught on yet. They're still in the "found by some, not by most" zone.

Excluding them because they have ANY industry engagement misses these people — exactly the people FieldMark should be surfacing.

The right signal isn't engagement EXISTS, it's engagement BREADTH.

Two HCPs at age 35 with $30K total engagement over 2 years:
- HCP A: $30K from one company, 1 manufacturer relationship → Rising Star
- HCP B: $30K spread across 8 different companies, 8 manufacturer relationships → closer to Established

The breadth signal naturally captures "established figure that pharma recognizes." A senior advisor on multiple companies' advisory boards is by definition established. Even if they don't publish much.

## Three composite score methodologies

### Community composite (Track #1, v1 priority)

Existing methodology preserved from v1.0. Weights:
- Medicare practice volume: 40%
- Open Payments engagement: 30%
- NPPES practice setting: 15%
- Career stage: 10%
- Publication context: 5%

Stored in `hcp_community_scores` table. Per-HCP per-TA scoring with percentile rank within TA normalization.

### Rising Star composite (Track #2)

Existing methodology preserved from v1.0. Weights:
- Publication velocity: 25%
- Citation trajectory: 20%
- Trial leadership: 20%
- DOL/conference signal: 15%
- Institution tier: 10%
- Career stage: 10%

Stored in existing `hcp_scores` table. Per-HCP per-TA scoring.

NOTE: Rising Star classification now requires engagement breadth ≤3 manufacturers. This filters out HCPs with broad pharma recognition who would otherwise score high on velocity (e.g., fast-tracked academics).

### Established composite (Track #3, methodology v1.5)

NEW METHODOLOGY — DESIGN DEFERRED TO v1.5.

Working hypothesis for weights (to be designed in detail later):

- Total publication count percentile within TA (~25%)
- Total citation count percentile within TA (~20%)
- Trial PI portfolio size and recency (~20%)
- Current institution rank (~15%)
- Recent activity sustained (~10%): still publishing, still doing trials, still engaged
- Industry engagement diversity (~10%): wide manufacturer breadth, royalty payments, consulting roles

Different methodology than the other two. Established figures are well-known, so the score is more "summary metric" than "discovery signal." The score answers "how prominent is this figure" rather than "should we discover them."

Stored in new `hcp_established_scores` table. Schema design deferred to v1.5.

## Dark Horse extends to two tracks, not three

Dark Horse is a cross-track status marker for "exceptional within track." Same purple visual treatment, parameterized criteria narrative.

**Rising Star Dark Horse:**
- Composite score 85+
- Citation trajectory +40%
- 2+ active trials
- Career age <8 years

**Community Dark Horse:**
- Composite score 85+
- Top 10% practice volume in TA + region
- Located outside major academic clusters
- High recent therapy adoption
- Demonstrated therapeutic specialization

**Established does NOT get a Dark Horse marker.** By definition, Established figures are not "missed" by traditional intelligence platforms. The Dark Horse concept doesn't apply.

So Dark Horse is a two-track concept (Rising Stars + Community), not three-track.

## What changes in scoring pipeline implementation

The scoring pipeline must:

1. **Classify each HCP into one cohort** before computing scores. Add `cohort_classification` column to hcps with values: 'rising_star' | 'established' | 'community' | 'unclassified'.

2. **Compute the appropriate composite score** based on classification. An HCP classified as Established gets only the Established composite score. An HCP classified as Community gets only the Community composite score. Etc.

3. **Run classification logic re-runs as data changes.** New publications via Phase 3 might shift career age computations. New Open Payments data might shift engagement breadth. Re-classify periodically.

4. **Validate against canonical HCPs.** Loomba should classify as Established. Garassino likely Established (depending on engagement breadth) or Rising Star. Chalasani should classify as Established. Several Iowa community oncologists should classify as Community.

## What changes in v1 demo positioning

When demoing FieldMark v1, the narrative becomes:

"FieldMark identifies HCPs that traditional KOL databases consistently miss — emerging academic Rising Stars before they're widely recognized, and high-impact Community physicians outside academic clusters. We also include Established figures for comprehensive coverage, so you don't have to leave FieldMark to look anyone up."

This positioning is sharper than the original two-track framing. It explicitly acknowledges that Established figures are NOT the differentiated value prop, which lets the platform's actual value (discovery of overlooked figures) come through cleanly.

## Validation cadence

Same validation cadence as v1.0:
- Spot-check canonical HCPs after each scoring run
- Review classification results for 10-20 random HCPs per cohort
- Tune thresholds based on observed distribution

Add to v1.0 cadence:
- After each Phase 3 publication backfill, re-run classification (career age signal will improve)
- After each NPPES re-derivation, re-run classification (career stage signal will improve)
- After Open Payments aggregation refresh, re-run classification (engagement breadth signal will refresh)

## Migration notes from v1.0 to v1.1

For implementations already built against v1.0 framework:

1. Add `cohort_classification` column to hcps via schema migration
2. Build classification logic (SQL function or Python script) implementing the criteria above
3. Run classification, populate column for all 30K cohort HCPs
4. Update community composite scoring to filter to `cohort_classification = 'community'` only
5. Update rising star composite scoring (existing) to filter to `cohort_classification = 'rising_star'` only
6. Defer Established score methodology to v1.5

## Open questions for v1.5

1. Established score methodology — exact weights and signal definitions
2. `cohort_classification` re-run cadence (daily? weekly? on-demand?)
3. Threshold tuning based on real distribution observed in v1
4. Edge cases: HCPs near classification boundaries (e.g., 14 vs 16 years career age) — soft thresholds vs hard cutoffs
5. International HCPs (foreign-trained physicians like Garassino who came to US later in career) — career age computation is ambiguous

## Document maintenance

This v1.1 update should be incorporated into the master composite_scoring_methodology.md document. Either:

- **Option A:** Append this update as a "v1.1 Addendum" section to the existing v1.0 doc
- **Option B:** Rewrite the master doc to v1.1 with this content integrated and v1.0 archived

Option A is faster. Option B produces a cleaner authoritative reference. Either is valid.
