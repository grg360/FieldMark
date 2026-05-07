# May 7 Session Decision Log — Addendum

**Author:** Garrett with Claude as technical thought partner  
**Date drafted:** May 7, 2026 (evening)  
**Status:** Captures decisions made in the latter portion of the May 7 session that occurred after the initial decision log was written.

---

## Three-cohort classification framework

The session evolved from a two-track view (Rising Stars + Community) to a three-cohort framework. This was a meaningful product positioning evolution and should be captured durably before any further code is written against the wrong assumption.

### The three cohorts

**Rising Stars** — emerging academics with steep recent trajectory. Mid-career or earlier figures with publication velocity and citation acceleration. Not yet on every advisory board. Not yet famous in their field. The platform's discovery value proposition.

**Community** — practicing HCPs in regional settings. Defined by patient impact, geographic anchoring, practice volume, and procedural depth. May or may not publish. The community oncologist in Iowa, the hepatologist in Birmingham. The platform's other discovery value proposition — these are HCPs traditional KOL databases consistently miss.

**Established** — senior, well-known academics. Already on every pharma's KOL list. Famous in their field. Decades of publications. Recognized leaders. Loomba is the canonical example. Traditional databases handle this well; FieldMark includes them for completeness, not differentiation.

### Strategic framing

FieldMark's differentiated value sits in Rising Stars and Community. Established is comprehensive coverage — table stakes that means users don't have to leave FieldMark to look up well-known figures.

UI ordering reflects this priority: track switch shows Rising Stars / Community as primary tracks, with Established as the third option. Default landing: Community (Track #1 priority for v1).

### Mutual exclusivity

An HCP belongs to exactly one cohort, not multiple. Classification hierarchy when a HCP could qualify for multiple:

**Established > Rising Star > Community**

If someone qualifies as Established (senior + recognized), they're not a Rising Star regardless of recent activity. If they qualify as Rising Star (early-career + accelerating + low engagement breadth), they're not Community. Community is the catch-all for active practitioners who are neither Established nor Rising.

### Classification criteria

Working framework for v1. Will tune as real data lands and real users react.

**Rising Star qualifies if:**
- Career age ≤15 years (allowing some flexibility — strict 8-year cap excludes too much)
- Publication velocity ≥1.5x peer baseline (showing acceleration vs typical for career age)
- AND/OR citation trajectory positive and accelerating
- Industry engagement breadth low — engaged with ≤3 distinct manufacturers in past 2 years (this is the "not yet on every advisory board" signal)
- NOT classified as Established by other paths

**Established qualifies if:**
- Career age >15 years AND at least one of:
  - Cumulative publications in top 25% of all publishing HCPs in their TA
  - Industry engagement breadth high — engaged with 5+ distinct manufacturers AND sustained $50K+/year cumulative
  - Multiple trial principal investigator roles (3+ industry-sponsored trials as PI)
  - Top-tier academic affiliation + sustained publication output

**Community qualifies if:**
- Not classified as Rising Star or Established
- Has Medicare practice volume (proves they actively see patients)
- Located in a non-academic-cluster region OR has community-style practice setting (group_practice, solo_practice, hospital_affiliated)

### Why engagement breadth matters more than dollars

Initial framing used dollar amounts as the primary engagement signal. User pushed back: a Rising Star might be known to 1-2 forward-looking pharma companies (the ones who do their own scouting work) without being on the broader pharma circuit. Excluding them because they have ANY industry engagement would miss real Rising Stars.

The right signal isn't engagement EXISTS — it's engagement BREADTH.

Two HCPs at age 35 with $30K total engagement over 2 years: one with all $30K from one company is a Rising Star (only one company has discovered them); one with $30K spread across 8 different companies is closer to Established (already on the broader pharma circuit).

This refined the Rising Star criterion to focus on number of distinct manufacturers (≤3) rather than dollar thresholds.

### Loomba reclassification

Under the three-cohort framework:
- Career age: ~25+ years (publications going back to early 2000s, NPI 2006)
- Cumulative publications: 1,000+ (after Phase 1 expansion)
- Top-tier institution: UC San Diego academic_medical_center
- Frequent trial PI
- Heavy industry engagement (assumed — to be verified post Phase 1)

Loomba is clearly Established. Should not appear in Rising Stars or Community search. Has full profile in Established track.

This is a change from current state where he scores in the Rising Stars cohort due to thin historical data. Phase 1 publication backfill plus the three-cohort classification logic will reclassify him correctly.

### What this means for backend work

Each HCP needs a `cohort_classification` column on hcps with values: 'rising_star' | 'established' | 'community' | 'unclassified'. Classification logic implemented as part of the scoring pipeline. Re-runs as data changes (e.g., publication backfill, NPPES enrichment, scoring updates).

Three score tables: existing `hcp_scores` (Rising Star), planned `hcp_community_scores` (Community), and a third — to be designed — for Established.

### Established score methodology — design needed

Different methodology than the other two. Established figures are well-known, so the score is more "summary metric" than "discovery signal." Working hypothesis for weights:

- Total publication count percentile within TA
- Total citation count percentile within TA
- Trial PI portfolio size and recency
- Current institution rank
- Recent activity sustained (still publishing, still doing trials, still engaged)

Not a "Dark Horse" signal for Established — by definition, Established figures are not missed by traditional databases.

This methodology needs design work. Deferred to v1.5 unless prioritized.

### Dark Horse — two-track concept (not three)

Dark Horse extends across Rising Stars + Community only. Same purple visual treatment, parameterized criteria narrative.

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

Established does NOT get a Dark Horse marker. Established figures are by definition not "missed" by traditional intelligence platforms.

### Naming concerns flagged

User raised legitimate concern about how HCPs would react to the "Dark Horse" label. Some considerations:

- "Dark Horse" connotes "underdog" / "unrecognized" / "should've been recognized" — flattering for emerging figures, potentially condescending for established community physicians
- HCPs may see this label if profile claiming becomes part of the platform (mentioned in initial scope)
- "Dark Horse" is also internal/MSL-facing language that pharma medical affairs leads will encounter

User decision: keep "Dark Horse" for now. Worth stress-testing with early customers and HCP contacts before it hardens in marketing materials.

Alternative framings if needed later: "Underrecognized signals," "Outside academic clusters," "Off-radar," "Quiet signal," "Field expert" (community-specific), "Trajectory leader" (Rising Star-specific).

---

## Frontend implications of three-cohort framework

The Community Track UI design document (also drafted today) needs a v1.1 update to reflect three tracks instead of two.

### Track switch component change

```
[ Rising Stars  |  Community  |  Established ]
```

Three options instead of two. Visual ordering communicates priority (Rising Stars and Community lead; Established is third).

### HCP cards have three variants

- Rising Stars card: PUB VEL / CIT TRAJ / TRIALS pills
- Community card: VOLUME / SETTING / EXP pills
- Established card: PUBS / CITATIONS / TRIALS pills (cumulative metrics, not velocity)

### Detail page has three section list variants

Each track has its own composition of sections matched to what makes sense for that cohort.

### Score modals have three variants

- Rising Stars modal: existing copy
- Community modal: practice volume / engagement / setting / career stage / publications copy
- Established modal: total publications percentile / total citations / trial portfolio / institution rank copy (when methodology is designed)

### Cross-track marker is still valid

For HCPs that score well in two tracks (rare overlap, probably 5-15% of cohort), the small visual marker indicates the dual-track relevance. With three tracks, theoretically an HCP could score in three tracks but practically that's nearly impossible (Rising Star and Established are mutually exclusive by career age; Community and Rising Star are mutually exclusive by engagement breadth). So in practice the cross-track marker handles 2-of-3 overlaps.

### Search across all three tracks

Search results show which tracks each HCP scores well in. User taps takes them to detail page in current track context.

### Onboarding default

Default to Community on first session. Strategic priority Track #1.

---

## Documentation updates needed (not blocking, but should happen)

The following documents need v1.1 updates to reflect the three-cohort framework:

1. **Composite Scoring Methodology document** — currently describes two tracks (Community + Academic Rising Star, the latter deferred to v1.5). Needs update to:
   - Three cohorts with classification criteria
   - Hierarchy (Established > Rising Star > Community)
   - Updated weights for Rising Star (incorporating engagement breadth)
   - Established score methodology (deferred design)

2. **Community Track UI Design document** — currently describes two-track UI. Needs update to:
   - Three-track switch component
   - Three card variants
   - Three detail page section list variants
   - Three score modal variants
   - Onboarding default to Community

3. **Publication Data Architecture document** — currently track-agnostic but mentions two tracks in strategic positioning section. Minor update needed to:
   - Reference three cohorts in strategic positioning
   - No actual architecture changes (publication data architecture is the same regardless of how cohorts are classified)

These updates are not blocking for tonight's Phase 2 + Phase 3 backfill work. The publication data architecture is independent of cohort classification. Updates can happen tomorrow or this weekend.

---

## What this means for tomorrow's work

Once Phase 1 + Phase 2 + Phase 3 publication backfills complete, the data foundation supports the three-cohort framework. Specifically:

- Real career age becomes derivable from publication first-year (Phase 3 produces this)
- Real cumulative publication counts become available
- Cumulative citation counts become available
- Engagement breadth signal can be computed from existing Open Payments aggregations

Tomorrow's classification logic implementation:

1. Build a SQL query or Python script that classifies each HCP into one of: rising_star / established / community / unclassified
2. Add `cohort_classification` column to hcps
3. Run classification, populate column
4. Validate against canonical HCPs (Loomba should be Established, Garassino should be Rising Star or Established depending on engagement breadth, Chalasani should be Established)
5. Spot-check 10-20 random HCPs for reasonableness

Then frontend evolution can proceed against a stable classification.
