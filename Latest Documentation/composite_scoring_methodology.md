# FieldMark Composite Scoring Methodology

**Version:** v1.0  
**Author:** Garrett (with Claude as technical thought partner)  
**Date drafted:** May 7, 2026  
**Status:** Methodology approved for v1 build. Community track scheduled for immediate implementation. Academic Rising Star track deferred to v1.5.

---

## Purpose

This document defines how FieldMark ranks HCPs for pharmaceutical Medical Science Liaison (MSL) field medical teams. The methodology must be defensible to (a) MSL field medical leaders evaluating the platform, (b) potential pharma customers asking "why is this HCP ranked here," and (c) HCPs themselves if they claim a profile and ask how they were assessed.

Every weighting decision, normalization choice, and threshold below is documented with rationale. Methodology decisions are versioned; future iterations should append change log entries rather than overwrite.

## Core architectural decision: two tracks, not one

FieldMark produces TWO separate composite scores per HCP per therapeutic area:

1. **Community HCP Composite Score** — ranks high-volume community and regional clinicians who treat patients in real-world settings. The primary differentiator vs traditional KOL databases.

2. **Academic Rising Star Composite Score** — ranks emerging academic clinicians and digital opinion leaders likely to become tomorrow's KOLs.

These scores are NOT combined into a unified ranking. They serve different MSL questions, use different signal sets, and weight overlapping signals differently. An HCP can have strong scores in both, only one, or neither.

### Why two tracks instead of one combined score

**Different MSL use cases.** An MSL preparing a territory plan asks two distinct questions:

> Question 1: "Who are the high-volume community oncologists I need to engage to influence prescribing patterns?" → Community track answers this.

> Question 2: "Who are the rising star academics I should build relationships with for advisory boards, speaking opportunities, and future trial collaboration?" → Academic track answers this.

These are different conversations, different outreach approaches, different success metrics. An MSL doesn't want one mixed ranking; they want clean lists for each use case.

**Different signal sets.** Community HCPs are best identified through Medicare practice volume and Open Payments engagement — signals that academics often score zero on due to billing patterns and personal industry policies. Academics are best identified through publication velocity, citation impact, and trial leadership — signals where community HCPs score low or zero by design.

**Same signal can mean opposite things.** Open Payments engagement at $50K is a strong positive signal for a community oncologist (existing pharma relationships, willingness to engage). The same $50K for an academic rising star may be neutral or even slightly negative in some institutional contexts where industry purity is prized. Mixing them into one composite produces meaningless averages.

**Combining rewards mediocrity.** A unified composite would rank an HCP who is moderately strong on both academic and community signals higher than someone who is exceptional at one and weak at the other. That's exactly wrong for MSL purposes — MSLs want extremes in their target track, not averages across tracks.

### Strategic prioritization

**Track #1 (Community HCPs) ships first.** This is the primary differentiator vs Definitive Healthcare, Within3, OpenData, and other established KOL databases. Those products over-index on academic credentials. FieldMark's community signal is built on Medicare and Open Payments data they don't aggregate the same way.

**Track #2 (Academic Rising Stars) ships in v1.5.** This requires additional signal preparation (publication velocity calculations, citation trajectory analysis, DOL signal infrastructure) that isn't yet complete. The methodology direction is captured below, but implementation is post-v1.

---

## Common architectural decisions (apply to both tracks)

### Unit of analysis: per HCP per therapeutic area

Composite scores are computed at the HCP × therapeutic area level, not at the HCP level alone.

**Rationale:** An MSL territory query is always TA-specific. An NSCLC MSL doesn't care about an oncologist's hepatology engagement; an immunology MSL doesn't want to see a strong score from an HCP whose work is in oncology. Per-TA scoring matches the actual use case.

**Implementation:** Each HCP can have multiple composite scores — one per TA they're tagged with in `hcp_therapeutic_areas`. An HCP tagged with both NSCLC and Hepatology would have two community composite scores and two academic composite scores.

**Storage:** Two new tables, `hcp_community_scores` and `hcp_academic_scores`, both keyed on (hcp_id, therapeutic_area_id).

### Normalization: percentile rank within TA

All component signals are normalized to percentile rank (0-100) within the relevant therapeutic area cohort before weighting.

**Rationale considered:**
- *Z-scores within TA* — statistically clean but produces negative numbers and is unintuitive to non-statisticians. Rejected.
- *Log-scaled normalization* — useful for heavy-tailed distributions but less interpretable. Rejected as primary normalization but considered for raw signal display.
- *Percentile rank within TA* — selected. Each HCP gets a 0-100 rank within their TA cohort. Easy to explain ("top 10% in NSCLC for industry engagement"). Loses absolute magnitude information.
- *Hybrid: percentile rank for composite, raw values for display* — adopted. Composite is computed on percentiles; HCP profiles show both.

**Edge case: ties.** Use the average rank for tied values (Postgres `PERCENT_RANK()` behavior). This avoids artificial precision in the long tails.

**Edge case: very small TA cohorts.** For TAs with fewer than 50 ranked HCPs, percentile ranking produces noisy results. Flag the score with a "low cohort size" indicator on profile pages. Don't suppress the score; users should see it with appropriate uncertainty signaling.

### Missing data handling: track-specific

Different tracks handle missing data differently because the meaning of "missing" differs.

**Community track:** missing data is treated as zero (lowest percentile). An HCP with no Medicare data is genuinely low-volume from a community perspective. An HCP with zero Open Payments engagement is genuinely industry-disengaged. Both are valid signals.

**Caveat for academics:** an academic with zero Medicare and zero Open Payments will rank extremely low on the community composite. This is correct behavior — they are not a community HCP target. They will appear in the academic ranking instead.

**Academic track (v1.5):** missing data handled per-signal:
- No publications → cannot compute academic composite (HCP excluded from academic ranking entirely)
- No trial leadership → treat as zero (valid signal)
- No DOL activity → treat as zero (valid signal)

### Confidence-tier handling

We use only the high-confidence aggregations from `hcp_open_payments_by_ta` and `hcp_medicare_by_ta` for composite scoring.

**Rationale:** The high-confidence tier already filters cross-indication noise (e.g., distinguishes NSCLC oncologists from breast/prostate oncologists for pembrolizumab signals). Using `_total` columns would re-introduce that noise into the composite. The total columns remain available for separate "all-data" displays on profile pages where users can see both views.

### Output structure: composite plus components

Every composite score returned to the application surfaces:
- The composite score (0-100)
- Each component percentile (0-100)
- The raw underlying value for each component (for display and audit)
- A confidence indicator if cohort size is small

**Rationale:** When a demo viewer asks "why is HCP A ranked above HCP B," the answer must be:

> "HCP A scored 87 vs HCP B's 82 because HCP A is in the 92nd percentile for Medicare practice volume (349 NSCLC beneficiaries) and 78th percentile for industry engagement ($67K), while HCP B is 75th percentile / 68th percentile."

A single composite number alone is indefensible.

---

## Community HCP Composite Score (Track #1, building now)

### Strategic positioning

This score answers the question: "Among HCPs who treat patients in real-world settings, who should an MSL prioritize for engagement?"

Target users: pharma MSL teams, especially those with regional/community-focused territory strategies. The output is genuinely differentiated from traditional KOL databases because it's grounded in CMS public data (Medicare claims and Open Payments) that those databases don't aggregate at the per-HCP per-TA confidence-tiered level.

### Component signals and weights

| Signal | Weight | Source | Status |
|---|---|---|---|
| Medicare practice volume | 40% | `hcp_medicare_by_ta.ta_beneficiaries_3yr_high_confidence` | Available now |
| Open Payments industry engagement | 30% | `hcp_open_payments_by_ta.total_payments_3yr` | Available now |
| Practice setting / group context | 15% | NPPES (`npi_taxonomy`, organization data) | Partial; needs derivation |
| Career stage / experience | 10% | NPPES (taxonomy primary, plus enrollment date if available) | Partial; needs derivation |
| Publication context | 5% | `hcp_scores` (existing publication composite) | Available now |
| **Total** | **100%** | | |

### Weight rationale

**Medicare practice volume at 40%:** This is the strongest signal of "real patient impact." It directly measures how many beneficiaries an HCP serves in TA-relevant clinical activity. The 3-year window smooths out single-year variance. The high-confidence tier ensures we're measuring TA-relevant activity, not just any practice volume. 40% weight makes this the dominant signal for the community track, which is correct.

**Open Payments at 30%:** Industry engagement signals are valuable for two reasons. First, an HCP receiving speaker bureau or consulting fees from a relevant manufacturer is already in the pharma ecosystem — there's an existing channel for engagement. Second, payment volume correlates with influence in clinical decision-making patterns within communities. The signal has caveats (some HCPs decline payments for ideological or institutional reasons; some payments go to academic accounts, not personal NPIs), but it's a strong directional signal at scale.

**Practice setting at 15%:** A solo community oncologist in a 2-person practice serves a different patient population and has different referral patterns than an oncologist at a 50-person regional group. Both are "community" but represent different MSL targeting strategies. This signal differentiates them.

**Career stage at 10%:** A 35-year-old oncologist 5 years into practice is not the same target as a 65-year-old oncologist with 35 years of practice. The career stage adjustment doesn't downrank either; it ensures the percentile comparison is contextually meaningful. (For example: comparing publication output, an early-career HCP with 5 publications may be more impressive than a late-career HCP with 50.)

**Publication context at 5%:** Even community HCPs occasionally publish, present, or contribute to the literature. Some have surprising publication histories. This minor weighting captures the signal without dominating the score (academic-leaning weights would defeat the purpose of the community track).

### Detailed methodology per signal

**Medicare practice volume (40%):**

- Source field: `hcp_medicare_by_ta.ta_beneficiaries_3yr_high_confidence`
- Normalization: percentile rank within TA (0-100), using `PERCENT_RANK()` over all HCPs with non-zero TA volume
- HCPs with NULL or zero `ta_beneficiaries_3yr_high_confidence` for the TA: treated as zero before normalization (will rank at 0)
- Display: raw beneficiary count alongside percentile

**Open Payments industry engagement (30%):**

- Source field: `hcp_open_payments_by_ta.total_payments_3yr` (high-confidence)
- Normalization: percentile rank within TA, using `PERCENT_RANK()` over all HCPs with non-zero TA payments
- HCPs with NULL or zero `total_payments_3yr` for the TA: treated as zero before normalization (will rank at 0)
- Display: raw payment total alongside percentile, plus breakdown by category (speaker bureau, consulting, etc.)

**Practice setting / group context (15%) — v1 implementation TBD:**

- Source: NPPES taxonomy and organization data (currently partial in `hcps`)
- Methodology direction: a derived practice setting indicator based on (a) NPPES taxonomy code mapping to clinical setting categories, (b) presence/absence of organization affiliation in NPPES, (c) co-located NPI count from NPPES (if multiple NPIs share an organization, indicates group practice)
- Normalization: derive a practice setting score (0-100) using a defined mapping table
- For v1 build: if practice setting derivation is incomplete, use NPPES taxonomy as a proxy (group vs solo vs hospital-affiliated). Document the limitation. Refine in v1.5.

**Career stage / experience (10%) — v1 implementation TBD:**

- Source: NPPES taxonomy (primary specialty implies training duration); ideally enrollment date if available
- Methodology direction: career stage estimate from NPPES enrollment date OR from publication first-year (proxy for active practice start). Map to bands: early-career (0-7 years), mid-career (8-20 years), established (21+ years).
- For v1 build: simplest implementation is to use the publication composite as a partial career stage proxy. Properly capture in v1.5.

**Publication context (5%):**

- Source field: `hcp_scores.composite_score` or equivalent (existing publication composite from prior work)
- Normalization: percentile rank within TA, using existing publication score
- HCPs with NULL or zero publication score: treated as zero (will rank at 0)
- Display: composite publication score alongside percentile

### Composite calculation

For each (hcp_id, therapeutic_area_id) combination:

```
community_composite = 
  (medicare_practice_pctile * 0.40) +
  (open_payments_pctile * 0.30) +
  (practice_setting_pctile * 0.15) +
  (career_stage_pctile * 0.10) +
  (publication_pctile * 0.05)
```

Result is a score from 0-100. Higher = stronger community HCP signal for the TA.

### Geographic filtering

The composite score is geography-agnostic at storage. Geographic filtering happens at query time:

```sql
SELECT * FROM hcp_community_scores
JOIN hcps USING (hcp_id)
WHERE therapeutic_area_id = '<TA>'
  AND hcps.predominant_state = 'CA'  -- or other state filter
ORDER BY community_composite DESC
LIMIT 50;
```

This allows the same stored scores to power different territory queries without recomputation.

### Validation methodology

The community composite must pass these checks before any external demo:

**Canonical HCP validation:** The four canonical HCPs we've been validating against (Loomba, Sanyal, Chalasani, Garassino) should produce intuitive composite scores given what we know about their practice patterns:

- *Loomba* (Hepatology): mid-tier community composite (his practice is partially academic but he has Medicare volume). Expected percentile: 30-60th in Hepatology community ranking.
- *Garassino* (NSCLC): moderate community composite (academic billing means low Open Payments and Medicare under personal NPI). Expected: 20-50th in NSCLC community ranking. She should rank MUCH higher in academic ranking when v1.5 ships.
- *Chalasani* (Hepatology): low community composite (small Medicare volume). Expected: 10-40th. Higher in academic.
- *Sanyal* (Hepatology): currently no NPI applied to canonical record (known issue), so will not appear until NPPES Workstream A application.

**Cohort size sanity check:** The TAs with very small cohort sizes (Rare Disease has only 2 by_ta rows in Medicare) need explicit handling. A composite ranked over a 2-row cohort is meaningless. For v1, suppress composite display for TAs with <50 ranked HCPs and instead show raw values only.

**Distribution sanity check:** Inspect the community composite distribution per TA. The shape should be roughly bell-curved with a long upper tail. If the distribution is bimodal or weirdly skewed, the weights need re-examination. Run during initial build before any demo.

**Top-10 spot check:** Pull the top 10 community HCPs per TA per state for the largest 10 states. Manually inspect: do these names make sense? Are they recognizably community-leaning oncologists/hepatologists? Are they NOT all famous academic names? This is the smell test that catches methodological problems traditional validation misses.

### Known limitations of v1 community composite

These are documented limitations to disclose during demos and in any methodology summary shared with prospects:

- **Practice setting and career stage signals are simplified in v1.** Full NPPES-derived signals will land in v1.5.
- **Academic billing patterns underweight academics on community track.** This is intentional; academics are surfaced via the academic track. But it means the community composite is NOT a "complete HCP score" — it's specifically a community track signal.
- **Cross-indication drugs in Open Payments are confidence-tiered but not perfectly clean.** Pembrolizumab payments may still show in NSCLC scores even when the prescribing context is melanoma. The high-confidence tier mitigates but doesn't eliminate this.
- **HCPCS code list curation is v1 (89 codes).** v1.5 will expand based on the unmatched analysis from yesterday's aggregator runs.
- **No drug-specific scoring.** A community oncologist heavily prescribing pembrolizumab vs nivolumab vs neither is currently undifferentiated in the composite. Drug-specific subscores are a v2 feature.
- **No temporal weighting.** Recent activity (last 12 months) should weight more than 3-year-old activity. Currently we treat all 3-year activity equally. v1.5 enhancement.

---

## Academic Rising Star Composite Score (Track #2, deferred to v1.5)

### Strategic positioning

This score answers the question: "Among emerging academic clinicians in this TA, who is rising fastest and likely to become a major KOL?"

Target users: pharma medical affairs teams building advisory boards, speaker bureaus, future trial collaborator networks. The differentiator vs Definitive Healthcare and similar is FieldMark's combination of (a) earlier-career capture (rising vs established), (b) verification through MSL crowdsourced contributions, (c) integration of digital opinion leadership signals (conferences, social, peer mentions) alongside traditional academic metrics.

### Why this is harder than the community composite

**Validation is inherently uncertain.** A "rising star" prediction can only be validated retrospectively. Did our 2026 ranking accurately predict who became a major KOL by 2030? We won't know for years. The methodology has to be defensible without ground truth.

**Required signals are not all built yet.** Publication velocity (recent acceleration vs total volume), citation trajectory (rate of citation accrual over time), DOL signal (conference speaking, social engagement, peer mentions) — none of these are computed cleanly in our current data. Building them is a v1.5 engineering workstream.

**Higher methodology stakes.** The whole differentiation is "find people traditional databases miss." If our ranking is just a re-ordering of well-known names, we have no product. The methodology needs to genuinely surface lesser-known emerging figures — which is much harder than ranking established figures.

### Component signals (preliminary, subject to v1.5 refinement)

| Signal | Tentative Weight | Source | Status |
|---|---|---|---|
| Publication velocity | 25% | OpenAlex / PubMed (recent vs cumulative output) | Needs derivation |
| Citation trajectory | 20% | OpenAlex citations over time | Needs derivation |
| Trial leadership | 20% | ClinicalTrials.gov (PI/Co-PI on relevant trials) | Partial |
| DOL / conference activity | 15% | Conference speaking, social engagement, podcast | Largely absent |
| Institution tier | 10% | NIH/NCI cancer centers, ACGME programs, etc. | Needs lookup table |
| Career stage adjustment | 10% | Years since first publication | Needs derivation |

### What needs to be built before this composite is meaningful

1. **Publication velocity calculation:** For each HCP, compute (a) publications in last 24 months, (b) publications in last 60 months, (c) ratio of recent to cumulative. The ratio is the "velocity" signal — high ratios indicate recent acceleration.

2. **Citation trajectory:** For each HCP's publications, track citation accrual over time. Compute average citations-per-year for publications in the last 5 years. Rising authors have steeper citation curves on recent work.

3. **Trial leadership signal:** Existing `trial_investigators` data needs aggregation: count of trials where HCP is PI vs Co-PI vs site investigator. Phase weighting (Phase 3 > Phase 2 > Phase 1 for KOL signal). Sponsor weighting (industry-sponsored is stronger signal than NIH-only).

4. **DOL / conference activity:** This is largely absent from our data. v1.5 needs an ingestion workstream for conference speaker rosters (ASH, ASCO, AACR, EASL, etc.) and structured social engagement signals.

5. **Institution tier:** A lookup table mapping institutions to tiers (Tier 1: NCI Comprehensive Cancer Centers, top-10 academic medical centers; Tier 2: NCI Designated Centers, large academic hospitals; Tier 3: regional academic centers). Manual curation, defensible but laborious.

### v1.5 build order

Most efficient sequence:

1. Publication velocity (1-2 weeks)
2. Citation trajectory (1-2 weeks, can run parallel with #1)
3. Trial leadership aggregation (1 week)
4. Institution tier lookup table (3-5 days)
5. Career stage derivation (3-5 days)
6. DOL / conference data ingestion (2-3 weeks, this is the largest unknown)

Realistic v1.5 timeline: 6-8 weeks of additional work to make the academic composite genuinely useful. The conference data ingestion is the wildcard that could extend this.

### Until v1.5 is ready

For demos before v1.5, we can:
- Show the community composite for Track #1 use cases
- Show raw publication scores from existing `hcp_scores` for academic-curious questions, with explicit caveat that "this is publication volume only — full academic rising star ranking ships in v1.5"
- Capture interest from prospects asking about academic ranking; that interest validates the v1.5 priority

Avoid:
- Mocking up a fake academic composite for demos. We've consistently chosen accuracy over speed; this is not the time to compromise.
- Claiming the academic track is complete when it isn't. Pharma medical affairs teams are sophisticated and will quickly identify gaps if we oversell.

---

## Storage architecture

### New tables

**`hcp_community_scores`** (one row per HCP per TA)

- `id` UUID primary key
- `hcp_id` UUID, FK to hcps
- `therapeutic_area_id` UUID, FK to therapeutic_areas
- `community_composite` numeric(5,2) — 0 to 100
- `medicare_practice_pctile` numeric(5,2)
- `medicare_practice_raw` integer (raw beneficiary count)
- `open_payments_pctile` numeric(5,2)
- `open_payments_raw` numeric(12,2) (raw 3-year payment total)
- `practice_setting_pctile` numeric(5,2)
- `practice_setting_raw` text or jsonb (the underlying signal)
- `career_stage_pctile` numeric(5,2)
- `career_stage_raw` integer (years since first publication or NPPES enrollment)
- `publication_pctile` numeric(5,2)
- `publication_raw` numeric(8,2)
- `cohort_size` integer (number of HCPs in the TA cohort at time of computation)
- `low_cohort_flag` boolean (true if cohort_size < 50)
- `calculated_at` timestamptz
- UNIQUE constraint on (hcp_id, therapeutic_area_id)

**`hcp_academic_scores`** (deferred to v1.5; stub schema captured for future reference; not built in v1)

### Refresh cadence

For v1, scores are recomputed weekly via scheduled aggregator runs. Every Sunday night, a script:

1. Recomputes percentiles for each TA cohort
2. Recomputes composite scores
3. Truncates and rewrites `hcp_community_scores`
4. Logs distribution stats and top-10 deltas vs prior week

Source data underlying the composites refreshes on different cadences (Open Payments annually from CMS, Medicare annually from CMS, NPPES weekly from CMS). The composite refresh keeps everything in sync as those underlying tables update.

For v1, manual refresh is also supported — run the script ad-hoc when underlying data changes significantly.

---

## Validation cadence

Every meaningful methodology change (new signal added, weight adjustment, normalization change) requires:

1. **Canonical HCP check:** the four canonicals (Loomba, Sanyal, Chalasani, Garassino) should produce expected-direction movements
2. **Distribution shape check:** per-TA composite distribution stays roughly bell-curved with long upper tail
3. **Top-10 spot check:** manually inspect top 10 per TA per state for largest 10 states; do names look like real community/academic targets
4. **Methodology log entry:** capture in this document under a Change Log section (not yet created — add when first methodology change occurs)

---

## Demo positioning

### What to say in demos

For the community composite specifically:

> "The community composite ranks HCPs based on real patient practice volume from Medicare claims, weighted by therapeutic-area-specific clinical activity, combined with industry engagement patterns from CMS Open Payments. It's grounded in CMS public data sources that traditional KOL databases don't aggregate at this confidence-tiered, per-TA, per-HCP level. The methodology is documented and reproducible, and every individual HCP score is decomposed into its component signals so MSL teams can defend the ranking to internal stakeholders."

### What to NOT say

- "FieldMark ranks all HCPs better than [competitor]." → It ranks community HCPs better. Academic ranking is v1.5.
- "Our composite is the definitive HCP score." → It's two scores, each defensible for specific MSL questions.
- "Our methodology is proprietary." → It should be transparent. Pharma customers need to defend it to compliance and medical affairs leadership; opaque methodologies are a sale-killer.

### Honest objections to anticipate

- *"Why should I trust your normalization?"* → Show the methodology document. Show component signals, not just composite. Offer to walk through specific examples.
- *"Why is [famous academic] ranked low in your community track?"* → Explain academic billing patterns. Show that they would rank high in the academic track when v1.5 ships. Frame as a feature, not a bug.
- *"How do you handle cross-indication drugs?"* → Confidence-tiered design. Reference yesterday's HCPCS curation methodology.
- *"What's the data freshness?"* → Open Payments PY2024, Medicare CY2023 (latest published). Refresh annually as CMS publishes new data.
- *"How does this compare to Definitive/Within3/etc.?"* → FieldMark's differentiation is community HCP signal grounded in CMS public data, plus MSL-crowdsourced verification, plus DOL signal for academic track in v1.5. We don't compete on academic credentials alone — we surface targets they miss.

---

## Open questions / decisions deferred

1. **Should community composite have a minimum threshold?** E.g., suppress composite display for HCPs with <50 total Medicare beneficiaries because the signal is too thin. Decision deferred — implement and observe distribution first.

2. **How to weight Open Payments by category?** Speaker bureau, consulting fees, honoraria, and royalties all signal differently. Currently we use total. Should there be category-specific subcomposites? Decision deferred to v1.5.

3. **How to handle HCPs with multiple NPIs?** Some HCPs have personal NPI plus organizational NPI for different roles. Current implementation aggregates only personal NPI. Should we sum across NPIs the HCP is associated with? Decision deferred — depends on how often this happens in practice.

4. **Score versioning:** when methodology changes, do we keep historical scores for comparison? Probably yes for academic track (rising star prediction is inherently temporal), unclear for community. Decision deferred.

5. **Exposing the methodology to MSL contributors:** when an MSL claims an HCP profile or contributes information, should they see the methodology? Probably yes, but with appropriate framing. Decision deferred to UX phase.

---

## Implementation order for v1 community composite

1. **Create `hcp_community_scores` table** with the schema defined above. (Schema migration)
2. **Build percentile computation queries** for each component signal. (Postgres window functions over `hcp_medicare_by_ta` and `hcp_open_payments_by_ta`)
3. **Build composite weighting query** that joins all component percentiles and computes the weighted sum.
4. **Run against current Supabase state.** Compute scores for all HCP × TA combinations.
5. **Validate canonical HCP outputs** against expected direction.
6. **Inspect top-10 per TA per state** for the 5 largest states. Manual smell test.
7. **If validation passes:** insert results into `hcp_community_scores`. Mark v1 community composite as live.
8. **Document any deviations from the methodology above** as a change log entry to this document.

Estimated time to v1 community composite live: 2-4 hours of focused work after schema migration.

---

## Document maintenance

This methodology document is the canonical source of truth for FieldMark scoring. Changes to scoring approach (weights, signals, normalization) require:

1. Append to a Change Log section at the bottom of this document
2. Justification for the change
3. Validation results before/after
4. Date and rationale

The document lives at `Latest Documentation/composite_scoring_methodology.md` in the FieldMark repository. Version control via git.
