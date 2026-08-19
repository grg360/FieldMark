# Cohort ledger header overflows between 768px and 1,095px

**Status:** open, unfixed. Logged 2026-08-18.
**Surface:** `frontend/src/components/Cohorts/CohortLedger.tsx` — `ColumnHeads` and the row grid it heads.
**Severity:** the header and every row scroll horizontally on a tablet-width viewport. Not a
crash, not data loss; the rightmost columns (PHARMA, INSIGHTS, TRACKED, RELATIONSHIP) fall
off the visible area and the header stops sitting above the values it labels.

## The measurement

Taken from the live DOM (dev server, Established ledger, IBM Plex Mono 9px / letter-spacing
.14em, character advance 6.66px) on 2026-08-18:

| part | width |
|---|---|
| RANK | 104 |
| COHORT SCORE | 88 |
| CITATIONS | 100 |
| COLLABORATORS | 104 |
| PHARMA | 120 |
| spacer | 14 |
| INSIGHTS | 62 |
| TRACKED | 52 |
| RELATIONSHIP | 108 |
| **fixed total (measured)** | **752** |
| header padding (`10px 20px 8px 23px`) | 43 |
| PHYSICIAN column `minWidth` | 300 |
| **minimum viewport before overflow** | **1,095** |

The name column is the only flexible one (`flex: 1, minWidth: 300`). Above 1,095px it absorbs
the slack; at 1,095px it hits its floor; below that the row can no longer shrink and overflows.

`CohortLedger.tsx:2095` renders `{isMobile ? null : <ColumnHeads cfg={cfg} />}`, and
`useIsMobile()` is `matchMedia("(max-width: 767px)")`. So the desktop layout is responsible for
everything from 768px upward, and **768–1,095px is a band it cannot serve**.

## History

The band is not new. Before the 2026-08-18 Established column swap the three score columns were
66 + 66 + 120 = 252px against 324px after, so the floor was ~1,023px and the broken band was
768–1,023px. The swap widened it by 72px. It did not create it.

## Why this is logged separately rather than fixed in the column work

Every proposal to widen a column now has to argue against this band, which makes an unrelated
layout defect into a veto on column design. That is the wrong shape. The band should be fixed on
its own terms — the plausible options are a third breakpoint between the mobile card and the
full desktop grid, dropping the our-side controls (INSIGHTS / TRACKED / RELATIONSHIP, 236px
together) into an overflow affordance below 1,095px, or lowering the PHYSICIAN floor with
truncation — and then column widths can be chosen on their merits.

## Reproduce

Open `/cohorts/ledger/established` at a viewport between 768px and 1,095px wide. Compare against
767px, where the mobile card layout takes over and renders correctly.
