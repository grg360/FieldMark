# P0 ELEVATION — Regional/Community HCP track is now #1 priority

**Captured:** May 5, 2026 Tuesday evening
**Source:** Strategic decision following Neurocrine MSL Field Engagement audience input + data integrity assessment of CMS sources vs publication ecosystem

## Priority restructuring

The strategic priority order for v1 is hereby restructured:

**#1 — Regional/Community HCP track.** Federal data-sourced cohort with practice volume, industry engagement, and geographic ranking. Cleaner data integrity than publication-based methodology. Directly aligned with MSL field engagement audience needs as expressed by Neurocrine and similar field-medical teams.

**#2 — Academic Rising Star track.** Existing publication/citation/trial methodology. Continues to develop in parallel but takes secondary positioning in product narrative. Useful as complement to community HCP track.

This restructuring reflects three findings:

1. **Audience signal (Neurocrine MSL Field Engagement).** Regional and community HCPs surfaced as a top priority in audience discussion. DOLs surfaced repeatedly. The product's distinctive value proposition ("HCPs your traditional databases miss") is undermined when "the HCPs we miss" doesn't include the community practitioners who are precisely the targets MSLs need.

2. **Data integrity differential.** The CMS data ecosystem (NPPES, Open Payments, Medicare Provider Data) is structurally cleaner than the publication ecosystem (OpenAlex, PubMed, ClinicalTrials.gov). CMS sources offer authoritative federal identity, structured fields, controlled taxonomies, and regulatory backing. Publication sources require author disambiguation, unstructured affiliation parsing, probabilistic concept tagging, and have known coverage gaps (Singal at 4% capture). The community HCP track will produce more trustworthy results for MSL teams.

3. **Commercial relevance.** A community oncologist treating 600 Medicare patients with NSCLC annually is a higher-value MSL target than an academic researcher with 50 NSCLC publications who hasn't seen patients in years. Practice volume is what determines prescribing influence. Open Payments measures industry's own assessment of an HCP's commercial influence (speaker bureau payments are not awarded to academic figures who don't drive prescribing).

## Data pipeline sequencing for Community HCP track

**Phase 1 — NPPES backfill and ingestion.** *In flight tonight.*
- Match existing 25,402 unmatched US HCPs against NPPES (Workstream A — running tonight)
- Ingest new community HCPs from NPPES, filtered by relevant taxonomies (Workstream B — designed after Workstream A results)
- Outcome: structured identity, geography, credentials, specialty data on US cohort

**Phase 2 — Open Payments integration.** *Next workstream after NPPES completion.*
- Download Open Payments general payment data from CMS (free, public, ~2-4GB compressed annually)
- Match by NPI to FieldMark records
- Capture: speaker bureau payments, consulting payments, research payments, food/travel payments, payment categories, sponsoring company, drug/device, payment date
- Filter to TA-relevant payments (NSCLC drug names, hepatology drugs, rare disease drugs)
- Compute aggregate metrics per HCP: total payments, distinct companies, recency trend, TA-specific payments

**Phase 3 — Medicare Provider Data integration.** *Parallel with Open Payments or sequenced after.*
- Download CMS Provider Utilization and Payment Data (Provider Type and HCPCS)
- Match by NPI to FieldMark records  
- Capture: number of unique Medicare beneficiaries by HCPCS code, total services rendered, total Medicare payments received
- Filter to TA-relevant HCPCS codes (chemotherapy administration codes for NSCLC, hepatology procedure codes, etc.)
- Compute aggregate metrics per HCP: TA-relevant patient volume, TA-relevant service volume, year-over-year trends

**Phase 4 — Community HCP ranking methodology.** *After Phase 2 and 3 complete.*
- Design composite score for community HCP ranking
- Validate against known community HCPs in target TAs
- Implement tier classification analogous to Rising Star tiers
- Surface in product as "Regional/Community" filter alongside "Rising Stars"

**Estimated total timeline:** 6-10 weeks for full Community HCP track v1, depending on Open Payments and Medicare data integration complexity.

## Proposed Community HCP ranking composite (v1 design draft)

Subject to refinement after seeing actual Open Payments and Medicare data:

```
community_composite_score = 
  weight_practice_volume * normalized(TA_relevant_patient_volume) +
  weight_industry_engagement * normalized(speaker_bureau_total + 0.5 * consulting_total) +
  weight_group_practice * group_practice_signal +
  weight_career_stage * normalized(years_since_NPI_enumeration) +
  weight_publication * normalized(existing_publication_composite_or_zero)

where:
  weight_practice_volume = 0.40    # heaviest — this is the actual practice signal
  weight_industry_engagement = 0.30 # second — industry already views them as influential
  weight_group_practice = 0.15     # third — high-volume center context
  weight_career_stage = 0.10       # fourth — established vs newer
  weight_publication = 0.05        # fifth — most community HCPs have zero
```

Tier classification analogous to Rising Stars:
- **Established Community HCP:** High composite, long career stage, sustained practice volume
- **Rising Community HCP:** Recent NPI enumeration + climbing Open Payments trend + emerging practice volume — this is the analog of Rising Star for the community track
- **Active Community HCP:** Mid-career, steady practice volume, moderate engagement
- **Emerging Community HCP:** Newer practitioners showing early signals
- **Insufficient Data:** Insufficient practice volume or industry engagement signal to classify

## Why community HCP ranking integrity beats publication-based ranking

**Authoritative identity.** Each NPI is one person, federally registered. Author disambiguation problem (Tony Mok in 6 rows, Caicun Zhou in 11 rows in our database today) does not exist in NPPES.

**Structured fields throughout.** NPPES practice address, NUCC taxonomy code, Open Payments amounts, HCPCS service codes. No unstructured affiliation strings to parse, no probabilistic concept tagging.

**Controlled vocabularies.** NUCC taxonomies are a controlled medical specialty hierarchy. HCPCS codes are CMS-defined procedure codes. Versus OpenAlex concepts which are LLM-derived and have probabilistic relevance scores.

**Regulatory backing.** Open Payments reporting is required by Sunshine Act. Medicare claims reporting is required for CMS payment. Pharma companies face FCPA/Sunshine Act penalties for misreporting payments. Providers face billing fraud penalties for misreported claims. Data accuracy has compliance teeth.

**Direct measurement.** "Number of Medicare patients seen for HCPCS J9355 (trastuzumab) in 2024" is a direct count. Versus "how influential is this researcher" inferred from citation patterns.

**No phase B career enrichment problem.** NPI enumeration date is a hard date in the federal registry, not OpenAlex's earliest-publication-found heuristic that gave Loomba first_pub_year=2022.

## Known integrity issues with CMS sources (honest disclosure)

- **Practice address staleness.** Only updates when provider proactively updates NPI registration. Some addresses 10+ years old.
- **Multiple NPIs per provider.** Some physicians have 2-3 NPIs across group affiliations. Our matching must handle.
- **Medicare-only view.** Medicare Provider Data only captures Medicare-billed services. Pediatric specialists, mostly-commercial-payer practices have lower Medicare volume despite high actual practice volume.
- **Taxonomy self-declaration.** HCPs pick their taxonomy at NPI registration; some choose aspirationally.
- **Open Payments thresholds.** Payments under $10 unreported; drug samples and some research payments excluded.

These issues are bounded and knowable, unlike the unbounded fuzziness of publication metadata.

## Implication for v1 product positioning

Recommended product narrative:

> "FieldMark surfaces the HCPs your traditional KOL databases miss. Two complementary tracks: (1) Regional/Community HCPs ranked by clinical practice volume and industry engagement using authoritative federal data sources, and (2) Academic Rising Stars surfaced through emerging publication and citation signals."

This positioning leads with the audience-validated cohort (community/regional) and uses the academic cohort as a complement, not the primary. Substantially differentiates from existing KOL databases that focus on academic figures.

## Decision to confirm

Garrett to confirm:

1. **Restructure approved?** Regional/Community is new #1 priority, Rising Star is now #2 in v1 product narrative.
2. **Sequencing approved?** NPPES (in flight) → Open Payments → Medicare Provider Data → Community HCP ranking methodology.
3. **Timeline acceptable?** 6-10 weeks for full Community HCP v1 track. v1 launch shifted accordingly, OR launched with Regional/Community filter showing geographic data without ranking until Phase 2-3 complete.
4. **Investment in CMS data integration.** Multi-week engineering across two new data sources. Confirms this is the right resource allocation given strategic priority.

## Adjacent priority updates required

The following P0 items in the priority action items doc need status updates to reflect this restructuring:

- **P0 #8n (Open Payments integration):** Elevate from current "active workstream consideration" to "Phase 2 of v1 Community HCP track." Sequenced immediately after NPPES backfill completion.
- **P0 #8l (NPPES backfill):** Already in flight. Expand scope from "metadata enrichment" to "Phase 1 foundation for Community HCP track."
- **P0 #8o (Community/regional/DOL gap):** Consolidate with this elevation. The P0 entry drafted earlier captures the strategic framing; this entry adds the implementation pipeline.
- **P0 (NEW) #8p:** Medicare Provider Data integration. New P0 capturing the third data source in the Community HCP pipeline.

## What does NOT change

- Existing scoring pipeline (v1.3) continues running for the Academic Rising Star track
- Tier classification methodology continues operating for Hepatology/NSCLC/Rare Disease publication-based cohorts
- Affiliation profiler v1.1 remains the clinician filter for the academic track
- TA framework documentation continues as designed (concepts apply to both tracks — community HCP ranking still needs TA assignment to surface in NSCLC/Hepatology/Rare Disease feeds)
- All in-flight cleanup work for academic cohort remains valid; the academic track is positioned as v2 in product narrative but its underlying data quality work proceeds normally
