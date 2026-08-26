# How FieldMark Works

FieldMark identifies and ranks Healthcare Professionals (HCPs) in specific therapeutic areas using public scientific and administrative data. This page explains how that works — what we measure, why, and the boundaries of what the platform can and cannot tell you.

## The cohort model

Every HCP in FieldMark belongs to one of three mutually exclusive cohorts:

**Established** — Field-shaping figures already recognized across pharma. These are senior investigators with sustained publication records, deep co-authorship networks, and active pharma engagement.

**Rising Star** — Academic HCPs whose recent trajectory is accelerating. These are not necessarily today's most prominent voices, but they are gaining momentum in ways that suggest they will be tomorrow's.

**Community** — Practicing clinicians active in their field. These are the HCPs MSLs encounter at conferences, in advisory boards, and in the practice settings where day-to-day decisions about therapy get made.

Each cohort uses a different scoring formula because "influence" means different things in different contexts. A high-volume community oncologist is not measured the same way as a senior NSCLC investigator, and neither is measured the same way as a fellow whose publication output has just begun to accelerate.

Every HCP receives a FieldMark Score from 0 to 100, normalized within their cohort. A score of 100 means top of cohort. The score is not absolute and is not comparable across cohorts — a 95 in Rising Star is not the same kind of signal as a 95 in Established.

## Established Scoring

The Established cohort surfaces HCPs whose influence is already recognized. The score is a weighted composite of three signals:

**Scientific Influence (50%)** — Publication leadership in the therapeutic area. This is the largest signal because for Established HCPs, the publication record is the most direct evidence of expertise. The signal is built from senior- and first-author paper counts, citation impact, and contributions to clinical practice guidelines, weighted to reward both volume and authorship seniority.

**Network Influence (35%)** — Position within the therapeutic area's co-authorship network. Established HCPs are connected — to each other, to emerging researchers, and to the institutions that shape the field. We measure this using three centrality metrics from network science: degree (how many co-authorship connections), eigenvector (how connected those connections are), and betweenness (how often this HCP serves as a bridge between research subcommunities).

**Pharma Engagement (15%)** — CMS Open Payments record. This reflects the breadth and depth of pharma relationships — payment volume, number of companies, drugs covered, and contract activity. It is a secondary signal because pharma engagement varies meaningfully by therapeutic area and individual HCP preference, and because publication and network signals are stronger evidence of scientific standing.

Established scores are computed using the formula:

```
Cohort Score = 0.50 * Scientific Influence + 0.35 * Network Influence + 0.15 * Pharma Engagement
```

Each input is itself a percentile rank within the cohort, so the composite is meaningfully bounded between 0 and 100.

## Rising Star Scoring

Rising Stars are the HCPs MSLs most want to find and most often miss. They are not the people already on the conference rosters and advisory boards. They are the next generation, and they are defined by trajectory more than by current position.

The Rising Star score is built from four signals, organized into two composites:

**Scientific Momentum (35%)** — Change in publication output between the 2016–2020 window and the 2021–2025 window. Built from change in senior-author paper count, citation volume, and senior-author share.

**Network Momentum (35%)** — Change in co-authorship network centrality between the same two windows. Built from eigenvector, degree, and betweenness deltas.

**Scientific Visibility (15%)** — Current publication footprint in the recent window: total publications and citation rate.

**Network Visibility (15%)** — Current co-authorship centrality in the recent 5-year window.

The four signals roll up through two intermediate composites:

```
Momentum   = 0.50 * Scientific Momentum + 0.50 * Network Momentum
Visibility = 0.50 * Scientific Visibility + 0.50 * Network Visibility

Cohort Score = 0.70 * Momentum + 0.30 * Visibility
```

The 70/30 weighting of Momentum over Visibility is deliberate. An HCP with a high current footprint but flat trajectory is not a Rising Star — they are Established, or on their way. An HCP with a steep trajectory but modest current footprint is exactly what the Rising Star cohort is designed to surface. The two-level rollup also enables the Momentum-vs-Visibility quadrant visualization on each Rising Star profile, where archetype is read directly from quadrant position.

Each Rising Star is also assigned an archetype based on momentum signals:

- **Balanced Rising Star** — strong on both scientific and network momentum
- **Scientific Accelerator** — strong scientific momentum, more modest network growth
- **Network Accelerator** — rapidly building network influence, more modest publication acceleration
- **Emerging Leader** — meeting the Rising Star threshold but not yet showing breakout signal in either dimension

The Rising Star cohort is restricted to academic HCPs (those classified as practicing in academic institutions) and to HCPs the per-therapeutic-area career-structure taxonomy classifies as Rising: three to ten years since first publication, plus a publication floor within the therapeutic area. This is a hard boundary, not a soft one. An HCP the taxonomy classifies as Established is not eligible for a Rising board at any momentum — which is what makes the three cohorts above mutually exclusive rather than merely described as such.

Between 5 August and 26 August 2026 that was not the case. The board was drawn from a wider pool that also admitted anyone classified Established within fifteen years of their first publication, and roughly two thirds of its members held both classifications at once. The wider pool had been introduced to route around an unmaintained data column, not because a three-to-ten board had been tried and found too small; it had not been tried.

## Community Scoring

The Community cohort surfaces practicing clinicians whose influence flows from patient care rather than from publication or pharma standing alone. The scoring formula reflects that:

**Patient Volume (40%)** — Estimated unique Medicare beneficiaries over a 3-year window. The largest single signal because patient volume is the most direct measure of community clinical reach.

**Pharma Engagement (30%)** — Total payments and engagement breadth from CMS Open Payments. Significant in this cohort because community-level pharma engagement is itself a signal of clinical relevance.

**Group Practice Signal (15%)** — Practice setting context, including group affiliation and practice size.

**Career Years (10%)** — Years since NPI enumeration, providing career-stage grounding.

**Publication Signal (5%)** — Publication activity. Weighted low because Community HCPs are defined by practice, not by publication output.

Community HCPs must have NPI registration and demonstrated clinical activity (either Open Payments engagement or measurable Medicare patient volume) to appear at all.

## Data sources

FieldMark draws from six public data sources:

- **PubMed and OpenAlex** — publication records, authorship attribution, citation activity, and the co-authorship edges that underlie the network influence calculations.
- **ClinicalTrials.gov** — investigator participation in registered clinical trials, including role (principal investigator vs. sub-investigator) and trial phase.
- **CMS Open Payments** — pharma payments and engagement records, refreshed quarterly. Currently using the PY2024 dataset.
- **NPPES** — National Plan and Provider Enumeration System. Provides authoritative HCP credentials, taxonomy, and practice locations.
- **Medicare Provider Utilization & Payment Data** — patient volume and practice pattern data, updated annually.

These sources are combined deliberately. NPPES provides the authoritative identity layer; PubMed and OpenAlex provide the scientific record; ClinicalTrials.gov provides operational research activity; Open Payments and Medicare provide the engagement and clinical activity context.

## Limitations

No methodology is perfect, and several real limitations shape what FieldMark can and cannot tell you:

**Coverage is not uniform.** Open Payments has data on a minority of Established HCPs in some therapeutic areas — when pharma engagement records are absent, that HCP scores zero on the Pharma Engagement dimension, which can affect their composite even when their actual pharma engagement is non-trivial. Publication data is more uniform but still incomplete for international researchers and for HCPs whose publication records pre-date OpenAlex's earliest reliable coverage.

**HCPs without sufficient signal do not appear.** The platform requires real data signal — a registered NPI, demonstrated clinical activity, or substantive publication record — to surface an HCP. A real HCP whose data footprint is too thin for any of the three cohorts will not appear in FieldMark. Coverage will improve over time as data sources expand and as MSLs flag gaps for review.

**Cohort classification is not destiny.** The classification reflects current signal across our data sources. An HCP near a cohort boundary can shift as new data arrives. We treat cohort assignment as a starting point for MSL judgment, not as an immutable label.

**Rising Star is academic-only by design.** Non-academic emerging voices — community oncologists building reputation, biotech-affiliated researchers, international investigators not yet visible in US-centric databases — do not appear as Rising Stars in v1. Identifying emerging influence outside academia is on the roadmap but requires different signal architecture.

**International coverage is imperfect.** Address parsing and institution normalization across countries is harder than within the US, and some international researchers may be misclassified. The current cohort logic is calibrated against US-skewed data.

**Industry-affiliated HCPs are excluded from cohort classification when identifiable.** HCPs whose primary affiliation is pharma or biotech are removed from the cohort universe to keep the platform focused on field-side voices. This filter is imperfect — some industry-affiliated HCPs are not yet identified and may appear; some academic researchers with industry consulting roles are correctly retained.

## A note on community refinement

FieldMark is built on the premise that no algorithm is final. Every HCP card has a flag affordance — if you disagree with a classification, flag it, and your signal becomes part of the methodology refinement loop. We treat MSL disagreement as data, not as noise.

The methodology described on this page is current as of the platform's most recent scoring run. Methodology evolves; when it does, this page will be updated first, and every surface in the platform that references the score will be updated to match.

