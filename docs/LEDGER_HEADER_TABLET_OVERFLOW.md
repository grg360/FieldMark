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
| **content width the header needs** | **1,095** |
| AppLayout inner gutter, both sides (2026-08-19: 32 each) | 64 |
| **minimum viewport before overflow** | **1,159** |

The name column is the only flexible one (`flex: 1, minWidth: 300`). Above 1,095px it absorbs
the slack; at 1,095px it hits its floor; below that the row can no longer shrink and overflows.

`CohortLedger.tsx:2095` renders `{isMobile ? null : <ColumnHeads cfg={cfg} />}`, and
`useIsMobile()` is `matchMedia("(max-width: 767px)")`. So the desktop layout is responsible for
everything from 768px upward, and **768–1,159px is a band it cannot serve**.

> **CORRECTION 2026-08-19.** This file originally recorded the floor as 1,095px. That is the
> CONTENT width the header needs, not a viewport figure -- it omitted AppLayout's own inner
> padding, which sits outside the content column. With the 16px gutter in force at the time,
> the real floor was **1,127px**, and the band was 768-1,127.

## History

The band is not new, and it has now been widened twice.

1. **2026-08-18, the Established column swap.** The three score columns were 66 + 66 + 120 =
   252px against 324px after, so the floor was ~1,055px and the band was 768-1,055 (with the
   16px gutter of the time). The swap widened it by 72px, to 768-1,127. It did not create it.
2. **2026-08-19, the AppLayout gutter.** The inner wrapper went from a flat 16px to 32px above
   the 767px breakpoint, so the content column lost 32px and the floor moved 1,127 -> 1,159.
   The gutter change was taken knowingly: surfaces without their own panel were rendering
   hard against the viewport edge. This band is the cost, and it is why the band should be
   fixed on its own terms rather than treated as a constraint on every future width decision.

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
