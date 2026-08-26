# FieldMark Score — Canonical Methodology Copy

> **Source of truth for all user-facing copy describing the FieldMark Score.** Every tooltip, modal, methodology page, and demo script that explains the score should pull verbatim from this document. If the underlying scoring code changes, update this document FIRST, then propagate to every surface.
>
> **All weights and formulas in this doc are verified against the active scoring scripts as of 2026-06-15.** Source files: `recompute_established_ranks_v3.py`, `rising_star_scoring.py`, `scientific_momentum_scoring.py`, `network_momentum_scoring.py`, `publication_leadership_scoring.py`, `network_centrality_scoring.py`, `community_scoring.py`.

---

## The Name

- **User-facing name:** FieldMark Score
- **Internal code-level name:** Cohort Score
- **The number:** 0–100, normalized within the cohort. 100 means top of cohort.

---

## The One-Line Definition (for tooltips, ≤25 words)

> A 0–100 composite measure of an HCP's influence within the [Established / Rising Star / Community] cohort.

---

## The Methodology Overview

The FieldMark Score is a 0–100 composite that measures an HCP's influence within their cohort. Three cohorts use three distinct scoring formulas, each tailored to what "influence" means in that context:

- **Established** — Field-shaping figures already recognized across pharma. Scored by publication leadership, co-authorship network position, and pharma engagement.
- **Rising Star** — Academic HCPs whose recent trajectory is accelerating. Scored by momentum (rate of change in scientific and network signals) and current visibility.
- **Community** — Practicing clinicians active in their field. Scored by patient volume, pharma engagement, practice setting, career stage, and publication activity.

Scores are normalized 0–100 within each cohort. A score of 100 means top of cohort.

---

## Established Cohort — Verified Formula

```
Cohort Score = 0.50 * Scientific Influence percentile
             + 0.35 * Network Influence percentile
             + 0.15 * Pharma Engagement percentile
```

### Scientific Influence (50%)

Publication leadership in the therapeutic area, percentile-ranked. Built from a weighted composite of:

- Senior-author paper count
- Senior-author paper count in the recent window
- First-author paper count
- Senior-author citation impact (log-scaled)
- First-author citation impact (log-scaled)
- Guideline papers (with senior- and first-author bonuses)
- Editorial and review papers (senior-author bonuses)

Source: PubMed, OpenAlex. Stored: `hcp_publication_leadership_v2`.

### Network Influence (35%)

Position within the therapeutic area's co-authorship network, percentile-ranked. Composite of three centrality measures:

- Degree centrality (40%) — number of co-authorship connections
- Eigenvector centrality (40%) — quality of connections (connected to other well-connected HCPs)
- Betweenness centrality (20%) — role as a bridge between research subcommunities

Computed over a 10-year window. Source: PubMed, OpenAlex. Stored: `hcp_network_centrality_v2`.

### Pharma Engagement (15%)

CMS Open Payments record breadth and depth, percentile-ranked. Reflects market-relevant signal where data is available. HCPs without Open Payments records score 0 on this dimension. Source: CMS Open Payments (PY2024). Stored: `hcp_pharma_engagement_v2`.

---

## Rising Star Cohort — Verified Formula

```
Cohort Score (Rising Star Raw) = 0.70 * Momentum
                               + 0.30 * Visibility

Momentum   = 0.50 * Scientific Momentum percentile
           + 0.50 * Network Momentum percentile

Visibility = 0.50 * Scientific Visibility percentile
           + 0.50 * Network Visibility percentile
```

The Rising Star formula weights momentum (trajectory) at 70% because Rising Stars are defined by where they're going, not where they are now.

### Scientific Momentum (35% of total score)

Change in publication output between early window (2016–2020) and recent window (2021–2025). Weighted composite of:

- Publication Velocity Delta (50%) — change in senior-author paper count
- Citation Volume Delta (30%) — change in total citations
- Authorship Progression Delta (20%) — change in senior-author share

Source: PubMed, OpenAlex. Stored: `hcp_scientific_momentum_v1`.

### Network Momentum (35% of total score)

Change in co-authorship network centrality between early window (hist_2016_2020) and recent window (recent_2021_2025). Weighted composite of:

- Eigenvector Percentile Delta (50%)
- Degree Percentile Delta (30%)
- Betweenness Percentile Delta (20%)

Source: PubMed, OpenAlex. Stored: `hcp_network_momentum_v1`.

### Scientific Visibility (15% of total score)

Current publication footprint in the recent window. 50% recent total publications percentile + 50% recent citation rate percentile.

### Network Visibility (15% of total score)

Current co-authorship centrality in the recent window. Source: `hcp_network_centrality_v2` (`recent_2021_2025` window).

### Cohort Filters

Rising Star is restricted to:

- **Academic HCPs only** (classification = 'ACADEMIC' in `hcp_industry_classification_v1`)
- **Classified `rising_eligible` in `hcp_cohort_classification_v2`** for the TA — career age 3-10 plus the per-TA publication floor. EXCLUSIVE: an HCP classified `established` is not eligible at any momentum. (Until 2026-08-26 this read "≤15 years since first publication", implemented as `cohort = 'rising_eligible' OR (cohort = 'established' AND career_age <= 15)`. The 15-year cap survives one level up as `MAX_CAREER_YEARS` in the two momentum scorers, which gate a different and wider population — see the mixed-denominator entry in `docs/RISING_EXCLUSIVE_GATE_DEBT.md`.)
- **Minimum 5 publications per window** (Scientific Momentum input)
- **Minimum 20 collaborators per window** (Network Momentum input)

### Archetype Assignment

Each Rising Star is assigned one of four archetypes based on momentum signals:

| Archetype | Condition | Color |
|---|---|---|
| Balanced Rising Star | Scientific Momentum ≥ 85 AND Network Momentum ≥ 85 | Purple |
| Scientific Accelerator | Scientific Momentum ≥ 90 AND Network Momentum < 75 | Teal |
| Network Accelerator | Network Momentum ≥ 90 AND Scientific Momentum < 75 | Amber |
| Emerging Leader | Default — Rising Star not meeting the above thresholds | Gray |

---

## Community Cohort — Verified Formula

```
Cohort Score = 0.40 * Patient Volume percentile
             + 0.30 * Pharma Engagement percentile
             + 0.15 * Group Practice Signal percentile
             + 0.10 * Career Years percentile
             + 0.05 * Publication Signal percentile
```

Community surfaces practicing clinicians with NPI registration and demonstrated clinical activity (Open Payments engagement OR Medicare patient volume).

### Patient Volume (40%)

Estimated unique Medicare beneficiaries (3-year). The largest single signal because patient volume is the most direct measure of community clinical influence.

### Pharma Engagement (30%)

Total payments and engagement breadth from CMS Open Payments.

### Group Practice Signal (15%)

Practice setting context — group affiliation, practice size, institutional connections.

### Career Years (10%)

Years since NPI enumeration. Provides career-stage grounding.

### Publication Signal (5%)

Publication activity. Weighted low because Community HCPs are defined by practice, not publication.

Source: NPPES, CMS Open Payments, Medicare Provider Utilization & Payment Data, PubMed. Stored: `hcp_community_scores_v2`.

---

## Tooltip Copy (verbatim, for FIELDMARK_SCORE_* surfaces)

These replace the existing tooltip bodies in `HCPCard.tsx` (the inline tooltip rendering) and `StatPillWithTooltip.tsx` (the TOOLTIP_MAP entries for `FIELDMARK_SCORE_ESTABLISHED`, `FIELDMARK_SCORE_RISING`, `FIELDMARK_SCORE_COMMUNITY`).

### FIELDMARK_SCORE_ESTABLISHED

```
title: "FieldMark Score"
body: "Composite of Scientific Influence (50%, publication leadership), Network Influence (35%, co-authorship graph centrality), and Pharma Engagement (15%, Open Payments record). Normalized 0-100 within the Established cohort."
```

### FIELDMARK_SCORE_RISING

```
title: "FieldMark Score"
body: "Composite of Momentum (70%, change in scientific output and network position over the last 5 years) and Visibility (30%, current publication and collaboration footprint). Normalized 0-100 within the Rising Star cohort."
```

### FIELDMARK_SCORE_COMMUNITY

```
title: "FieldMark Score"
body: "Composite of patient volume (40%), pharma engagement (30%), group practice signal (15%), career years (10%), and publication signal (5%). Normalized 0-100 within the Community cohort."
```

---

## Sub-Score Tooltips (for in-page ScoreBreakdown components)

### Established Sub-Scores

**Scientific Influence**
```
title: "Scientific Influence"
body: "Publication leadership in the therapeutic area: senior-author and first-author paper counts, citation impact, guideline contributions. 50% of the FieldMark Score."
```

**Network Influence**
```
title: "Network Influence"
body: "Co-authorship network position: degree, eigenvector, and betweenness centrality over a 10-year window. 35% of the FieldMark Score."
```

**Pharma Engagement**
```
title: "Pharma Engagement"
body: "CMS Open Payments record: payment volume, number of companies, drugs covered, contract activity. 15% of the FieldMark Score."
```

### Rising Star Sub-Scores

**Scientific Momentum**
```
title: "Scientific Momentum"
body: "Change in publication output between 2016-2020 and 2021-2025: senior-author count, citation volume, and senior-author share."
```

**Network Momentum**
```
title: "Network Momentum"
body: "Change in co-authorship network centrality between 2016-2020 and 2021-2025: eigenvector, degree, and betweenness."
```

**Scientific Visibility**
```
title: "Scientific Visibility"
body: "Current publication footprint in the recent window: total publications and citation rate."
```

**Network Visibility**
```
title: "Network Visibility"
body: "Current co-authorship centrality in the recent 5-year window."
```

---

## Data Sources (verbatim, for footer)

- **PubMed** — publication and authorship data
- **OpenAlex** — citation counts, co-authorship network
- **ClinicalTrials.gov** — investigator and trial status
- **CMS Open Payments** — pharma engagement data (PY2024)
- **NPPES** — provider credentials and practice locations
- **Medicare Provider Utilization & Payment Data** — patient volume

---

## Disclaimer (verbatim, for footer)

> Scores reflect publicly available scientific and administrative activity only. FieldMark does not incorporate commercial, prescribing, or proprietary data.

---

## Retired Cohorts

**Workhorse** — A subset of Community surfacing high-volume practitioners with low pharma engagement. Retired during the Community methodology consolidation; the current Community formula incorporates patient volume as the primary signal, capturing the same underlying signal Workhorse was designed to isolate. Frontend code references remain but no HCPs are currently classified as Workhorse.

---

## Where This Copy Lives in the Codebase

When propagating updates, search these files:

1. `frontend/src/components/HCPCard.tsx` — inline FieldMark Score tooltip (~line 880), plus Workhorse/Community sub-tile tooltips (~lines 322, 324)
2. `frontend/src/components/StatPillWithTooltip.tsx` — `FIELDMARK_SCORE_*` TOOLTIP_MAP entries
3. `frontend/src/components/ScoreModal.tsx` — modal copy (currently unreachable from demo path)
4. `frontend/src/components/ScoringExplainedModal.tsx` — full methodology documentation modal (entry point currently hidden in TopBar)
5. `frontend/src/components/DetailScreen.tsx` — embedded methodology copy at lines 963, 1156, 1164, 1172
6. `frontend/src/components/LandscapeScreen.tsx` — embedded methodology copy at lines 365, 374
7. `demo/demo-runbook.md` — Mentor talking-points
8. Future `/methodology` page
