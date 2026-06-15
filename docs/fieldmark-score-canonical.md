# FieldMark Score — Canonical Methodology Copy

> This document is the single source of truth for all user-facing copy describing the FieldMark Score. Any tooltip, modal, methodology page, or demo script that explains the score should pull verbatim from this document. If the methodology changes, update this document first, then propagate.

---

## The Name

- **User-facing name:** FieldMark Score
- **Internal code-level name:** Cohort Score (already in use in some component names like `ScoreBreakdownV3`)
- **The number:** 0–100, normalized within the cohort. 100.0 means top of cohort.

---

## The One-Line Definition (for tooltips, ≤25 words)

> A 0–100 composite score reflecting an HCP's influence within the [Established / Rising Star / Community] cohort.

---

## The Two-Sentence Definition (for short modal headers, hover cards)

> The FieldMark Score is a 0–100 measure of an HCP's influence within their cohort, computed from publication leadership and co-authorship network position. Pharma engagement is shown alongside the score but does not contribute to the ranking.

---

## The Full Methodology (for modals, methodology pages, demo narrative)

The FieldMark Score is a 0–100 composite that measures an HCP's influence within their cohort. It is built from two signals that drive the ranking, plus a third signal shown for context.

**Scientific Influence — 60% of the score**
Publication leadership in the therapeutic area. Measured from senior-author paper counts, citation impact, recent (5-year) activity, and guideline contributions. Source: PubMed and OpenAlex.

**Network Influence — 40% of the score**
Position within the co-authorship network. Measured using graph centrality across the therapeutic area's collaboration network (weighted degree, eigenvector centrality, and betweenness). Source: PubMed and OpenAlex.

**Pharma Engagement — context only**
Open Payments breadth (payment volume, number of companies, drugs covered, contract activity). Shown alongside the score but does not contribute to the ranking. Source: CMS Open Payments.

Scores are normalized 0–100 within each cohort. A score of 100 means top of cohort.

---

## Data Sources (verbatim, for the "Data Sources" footer on the modal)

- **PubMed** — publication and authorship data, updated weekly
- **OpenAlex** — citation counts, co-authorship network, updated weekly
- **ClinicalTrials.gov** — investigator and trial status, updated weekly
- **CMS Open Payments** — pharma engagement data (PY2024)

---

## The Disclaimer (verbatim, for the modal footer)

> Scores reflect publicly available scientific activity only. FieldMark does not incorporate commercial, prescribing, or proprietary data.

---

## Cohort-Specific Variants (for FIELDMARK_SCORE_* tooltip map)

These replace the existing stale tooltip bodies in `StatPillWithTooltip.tsx` (TOOLTIP_MAP entries for `FIELDMARK_SCORE_ESTABLISHED`, `FIELDMARK_SCORE_RISING`, `FIELDMARK_SCORE_COMMUNITY`).

### FIELDMARK_SCORE_ESTABLISHED

```
title: "FieldMark Score"
body: "Composite of Scientific Influence (60%, publication leadership) and Network Influence (40%, co-authorship graph centrality). Pharma engagement shown for context but does not contribute to ranking. Normalized 0–100 within the Established cohort."
```

### FIELDMARK_SCORE_RISING

```
title: "FieldMark Score"
body: "Composite of Scientific Influence (60%, publication leadership) and Network Influence (40%, co-authorship graph centrality). Pharma engagement shown for context but does not contribute to ranking. Normalized 0–100 within the Rising Star cohort."
```

### FIELDMARK_SCORE_COMMUNITY

```
title: "FieldMark Score"
body: "Composite of pharma engagement, engagement breadth across companies, Medicare patient volume, and career stage. Normalized 0–100 within the Community cohort."
```

> **Note on Community:** Community cohort uses a different methodology than Established/Rising Star because it surfaces high-volume practicing physicians rather than research-active HCPs. Worth confirming that copy is still accurate against the current `community_scoring.py` implementation before propagating.

---

## Sub-Score Tooltips (for the in-page ScoreBreakdownV3 progress bars)

These are the tooltips that appear next to each sub-signal label inside the score breakdown view.

### Scientific Influence (label tooltip)

```
title: "Scientific Influence"
body: "Publication leadership in the therapeutic area. Built from senior-author paper counts, citation impact, recent 5-year activity, and guideline contributions. 60% of the FieldMark Score."
```

### Network Influence (label tooltip)

```
title: "Network Influence"
body: "Position within the co-authorship network. Measured via weighted degree, eigenvector centrality, and betweenness across the therapeutic area's collaboration graph. 40% of the FieldMark Score."
```

### Pharma Engagement (label tooltip)

```
title: "Pharma Engagement"
body: "Breadth of pharma relationships from CMS Open Payments: payment volume, number of companies, drugs covered, and contract activity. Shown for context. Does not contribute to the FieldMark Score ranking."
```

---

## Evidence Tile Tooltips (for ScoreBreakdownV3 KPI tiles)

### Scientific Influence evidence tiles

```
Sr. Papers — title: "Senior-author papers", body: "Papers in the therapeutic area where this HCP is the senior (last) author. Senior authorship indicates principal investigator role."

Citations — title: "Total citations", body: "Citations across all therapeutic area publications, log-scaled to dampen the long tail. Source: OpenAlex."

Recent 5y — title: "Recent activity", body: "Papers published in the therapeutic area in the last 5 years. Indicates current scientific engagement."

Guidelines — title: "Guideline papers", body: "Publications classified as clinical practice guidelines, including title-keyword matches for guidelines PubMed does not formally tag."
```

### Pharma Engagement evidence tiles

```
Payments — title: "Total payments", body: "Total dollar value of pharma payments received in PY2024. Source: CMS Open Payments."

Companies — title: "Pharma companies", body: "Number of unique pharma companies that paid this HCP in PY2024."

Drugs — title: "Drugs covered", body: "Number of unique drugs associated with pharma payments to this HCP."

Contracts — title: "Contracts", body: "Number of distinct payment relationships across all pharma companies."
```

---

## The Modal Copy (verbatim, for ScoreModal.tsx replacement)

When a user clicks "How this score is calculated" or a score number on an HCP profile:

```
[Cohort name e.g. ESTABLISHED] SCORE
[Score value e.g. 100.0]/100
[HCP name] · [Indication]

HOW THIS SCORE IS CALCULATED

The FieldMark Score is a 0–100 composite measuring an HCP's influence
within the [Established / Rising Star / Community] cohort. Scores are
normalized so that 100 represents the top of the cohort.

[Three progress bars, one per signal:]

  Scientific Influence — 60% of score                       [value]
  Publication leadership in the therapeutic area
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Network Influence — 40% of score                          [value]
  Co-authorship graph centrality
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Pharma Engagement — context only                          [value]
  Shown alongside the score but does not contribute to ranking
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DATA SOURCES
  · PubMed — publication and authorship data, updated weekly
  · OpenAlex — citation counts, co-authorship network, updated weekly
  · ClinicalTrials.gov — investigator and trial status, updated weekly
  · CMS Open Payments — pharma engagement (PY2024)

Scores reflect publicly available scientific activity only. FieldMark
does not incorporate commercial, prescribing, or proprietary data.

[Close button]
```

---

## Where This Copy Lives in the Codebase (apply Layer 2 to these files)

When you're back at the desk, search-and-replace stale methodology copy in:

1. `frontend/src/components/ScoreModal.tsx` — full modal copy replacement
2. `frontend/src/components/ScoringExplainedModal.tsx` — review and align
3. `frontend/src/components/StatPillWithTooltip.tsx` — `FIELDMARK_SCORE_*` tooltip bodies
4. `frontend/src/components/HCPCard.tsx` — inline score tooltip (currently lists 6 stale signals)
5. `frontend/src/components/DetailScreen.tsx` lines 963, 1156, 1164, 1172 — check what's there
6. `frontend/src/components/LandscapeScreen.tsx` lines 365, 374 — check what's there
7. `demo/demo-runbook.md` — Mentor talking-points alignment
8. Any future methodology overview page

