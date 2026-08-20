# Ledger drawer coverage sub-lines — removed 2026-08-20

The EST/RS row drawer in `frontend/src/components/Cohorts/CohortLedger.tsx`
rendered each layer as a two-line left-rail pair: an eyebrow and a sub-line.
Layers 2 and 3 carried a coverage percentage in the sub-line slot. Those
sub-lines are gone as of 2026-08-20. The eyebrows are unchanged, and layer 1
keeps `ALWAYS PRESENT`.

This file exists so the measurement is not lost with the code.

## The removed code, verbatim

The comment and the object, exactly as they stood at `CohortLedger.tsx:432-437`:

```ts
// Coverage sublabels, measured 2026-08-08 (EST/US n=2,990; RS/US n=123):
// canonical-labeled pubs 97% / 99%; extracted positions 8% / 80%.
const COVERAGE = {
  EST: { practice: "97% OF COHORT", belief: "8% OF COHORT" },
  RS: { practice: "99% OF COHORT", belief: "80% OF COHORT" },
} as const;
```

Resolved per cohort at `CohortLedger.tsx:711`:

```ts
const cov = cfg.tag === "RS" ? COVERAGE.RS : COVERAGE.EST;
```

And consumed as `sub={cov.practice}` on `PRACTICE · CANONICAL FOCUS` and
`sub={cov.belief}` on `BELIEF · EXTRACTED POSITIONS`.

## What the numbers were

| Cohort | Denominator, as measured | Canonical-labeled pubs | Extracted positions |
|---|---|---|---|
| Established | US slice, n = 2,990 | 97% | 8% |
| Rising Star | US slice, n = 123 | 99% | 80% |

Numerators were never in the code. From the tables the drawer reads, they were
almost certainly: for *practice*, the count of board members with a non-zero
`total_labeled_pubs` in `hcp_canonical_topic_share_v1`; for *belief*, the count
with at least one row in `hcp_scientific_positions_v1`. Both were hand-measured
once, on 2026-08-08, and pasted in as complete display strings — `"97% OF
COHORT"` was stored as that whole string, so the figure was never a number in
the source and nothing recomputed it.

## Why they were removed rather than corrected

**1. A US-slice measurement was printing under every territory.** Both figures
were taken against the US board. The ledger gained a country/region axis on
2026-08-14 and 2026-08-18. After that, selecting Europe left the drawer still
asserting "97% OF COHORT" over a 3,849-row board the figure had never been
measured against. This is the same defect the header count carried until
2026-08-18, when `cohortTotal` was repointed to the row RPC's own scoped
`cohort_total` — the drawer sub-lines were missed in that sweep.

**2. Both denominators had gone stale.** RS/US n = 123 predates the 2026-08-20
coherence gate in `scripts/score/rising_star_scoring.py`, which resized the
Rising board (the scorer logs 330 → 338 globally; the US slice moved 73 → 76 on
the effective-country fix in the same pass). EST/US n = 2,990 sat against a
header reading 2,992 on the same board.

**3. The real objection is placement, not accuracy.** A population rate rendered
in the left rail of a single row reads as a fact about the person whose row is
open. The worst case was visible on any thin record: a row whose own body said
"Too few labeled publications to characterize focus" still carried "97% OF
COHORT" beside it. Correcting the number would have kept that misreading and
made it more convincing. The eyebrow alone says what the layer is, which is what
the rail is for.

## If this is ever rebuilt

Make it query-derived and scope it to the selected territory. The source is
already in the codebase:

- **`count_hcps_with_positions`** — the RPC behind `HcpPositionsPage.tsx`
  (`components/HcpPositionsPage.tsx`, `coverage.estWith` / `coverage.estTotal`
  and `coverage.risWith` / `coverage.risTotal`). It returns the with/total pair
  per cohort, i.e. exactly the *belief* coverage, computed rather than typed.
  That page renders it live at `:342-343`.
- For *practice* coverage there is no equivalent RPC today. It would be a
  `count(*) FILTER (WHERE total_labeled_pubs > 0)` over
  `hcp_canonical_topic_share_v1` joined to the board rows in scope.

Two conditions before any rebuild ships: the figure must take the ledger's
active scope (`scope.countries` / `scope.states`) as an argument the way
`established_ledger` / `rising_ledger` do, and it must be visually separated
from per-row content so it cannot be read as a claim about the open row.

Related standing prose that already states the belief figure, correctly and in
words: `components/HcpPositionsPage.tsx:356` — "Nine in ten US-ranked
established profiles have no extracted positions." That page pairs it with the
live `count_hcps_with_positions` numbers, which is the pattern to copy.
