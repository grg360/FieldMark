# Drug Constellation — Component Spec

**Status:** ready for build. Locked decisions inline; remaining ambiguity at the bottom.
**Target file:** `frontend/src/components/DrugConstellation.tsx` (new)
**Sister section:** `TopPharmaCompanies.tsx` (separate component, shipped first — see relationship section)
**Date drafted:** Jun 4, 2026, updated same day

---

## Purpose

A scatter plot rendering an HCP's top drug engagements as a "constellation." Each drug is a bubble; position encodes recency × dollar amount; size encodes payment count; color encodes year-over-year trend. The visual reframes raw Open Payments data into the question MSLs actually ask: *which drugs is this expert currently engaged with, and which are fading.* On-brand with the "we see the nebula, not just the star" tagline.

---

## Data source

**Table:** `hcp_open_payments_by_drug_v2`
**Coverage:** ~11,046 HCPs across 335 manufacturers, 27,916 drug-level rows. ~22% of total HCP base. ~78% will need an empty state.

**Columns used:**

| Column | Type | Purpose |
|---|---|---|
| `drug_name` | text | Brand name, displayed as-is (already uppercase, e.g., TECENTRIQ) |
| `manufacturer_name` | text | Cleaned for display (strip `INC.` / `, INC.` / `LLC` / `LP`) |
| `total_amount_usd` | numeric | Y axis position |
| `payment_count` | integer | Bubble size |
| `most_recent_payment_date` | date | X axis position |
| `year_over_year_trend_pct` | numeric | Bubble color (nullable — handle as "stable") |

**Filter:** `WHERE hcp_id = $1 ORDER BY total_amount_usd DESC LIMIT 15`

**Rendering threshold:** The constellation **only renders when the HCP has ≥3 drugs** in the result set. Below that, the entire section is hidden — no header, no empty state, no skeleton. This is because:
- Top-200 NSCLC Established coverage is 12% (24 of 200 HCPs). Median when present: 13 drugs.
- Top-200 NSCLC Rising Star coverage is 6.5% with median 1 drug. Below threshold, hidden.
- A 1–2 bubble "constellation" reads as broken, not designed. ≥3 is the minimum for the visual metaphor to work.

The result: this is a premium signal for ~12% of pages where the data justifies the visual. The 88% of pages without it still render the sister `TopPharmaCompanies` section, which has broader Open Payments coverage (~27K HCPs, 22% of total base).

---

## Visual encoding

**X axis — most recent payment date**
- Linear scale. Range: min and max `most_recent_payment_date` across the returned 10 drugs, plus 1 month padding each side.
- Tick marks: year boundaries (e.g., '22, '23, '24, '25).
- Caption: "most recent payment →" right-aligned beneath the axis.

**Y axis — total dollars (log scale)**
- `log10` scale. Floor at $10 (anything below clamps to $10). Ceiling at the max value in the dataset, rounded up to nearest power of 10.
- Tick marks: $10, $100, $1K, $10K, $30K (or scaled to data range).
- No caption — tick marks are self-explanatory.

**Bubble size — payment count**
- Linear scale. Min radius 7px (1 payment). Max radius 18px (top payment count in dataset, clamped at 20).
- Formula: `r = 7 + ((count - 1) / (maxCount - 1)) * 11`. If only one drug, default to r=12.

**Bubble color — YoY trend** (apply to fill; stroke matches with one stop brighter)

| Trend category | YoY % range | Fill | Stroke |
|---|---|---|---|
| Growing | > +5% | `#E8A020` | `#FAC775` |
| Stable | -5% to +5%, or null | `#B07816` | `#6B5A30` |
| Declining | -50% to -5% | `#855E18` | `#4A3A1A` |
| Heavily declining | < -50% (incl. -100%) | `#4A3A1A` | `#2B2520` |

**Labels** — drug name + manufacturer:
- Drug name 11px, weight 500, color `#E8E6DF` (or `#E8A020` if it's the actively-selected drug).
- Manufacturer 11px, weight 400, color `#6B6A65`.
- Positioned adjacent to bubble — left/right/above based on bubble position in the plot area (avoid running off the chart edge).
- v1.0 uses hand-tuned offset rules based on bubble quadrant. v1.x: d3-force-collide.

---

## Interaction

- **Desktop hover** → highlight the bubble (brighter stroke at 2px width) and update the info strip below the chart.
- **Mobile tap** → same. Tap a different bubble to change selection. Tap empty area to dismiss.
- **Default selection on first render** → the drug with the **most recent `most_recent_payment_date`** (ties broken by higher `total_amount_usd`). Reasoning: surfacing the most active relationship as the default is more useful than surfacing the historically largest. For Rudin, this defaults to Tecentriq or Alecensa (both Oct 2024) rather than Zepzelca (Feb 2023, dormant).
- **Info strip content** (single row, dark band beneath chart):
  - Left: drug name (amber, weight 500) + manufacturer name (muted)
  - Right: dollar amount (amber monospace) + payment count + last payment date + YoY % (red if negative, green if positive, gray if null)

---

## States

**Loading**
- 5 neutral gray skeleton bubbles in fixed positions, no labels. No animation.

**Below threshold (<3 drugs, or HCP not in `hcp_open_payments_by_drug_v2` at all)**
- Section does not render. No header, no body, no empty state. Adjacent sections close up around it.

**Sparse (3–5 drugs)**
- Chart renders. Less dense, more whitespace, fewer label collisions to manage. Still meaningful.

**Dense (10–15 drugs)**
- Chart renders. Label layout works harder; some labels may push outside the plot area into the chart padding.

**Community cohort**
- Section does not render regardless of drug count. Community pages will eventually get a Medicare-equivalent visual (out of scope for this build).

---

## Implementation notes

**Stack:** Raw SVG. No D3 dependency for v1.0. Manual coordinate math is fine for 10 bubbles.

**Coordinate formulas:**
```
plotLeft = 60, plotRight = 640, plotTop = 30, plotBottom = 270
plotWidth = plotRight - plotLeft (580)
plotHeight = plotBottom - plotTop (240)

// X: linear date scale
xRatio = (drugDate - minDate) / (maxDate - minDate)
x = plotLeft + xRatio * plotWidth

// Y: log scale
yRatio = (log10(amount) - log10(minAmount)) / (log10(maxAmount) - log10(minAmount))
y = plotBottom - yRatio * plotHeight
```

**API function:** `getTopDrugsForHcp(hcpId: string): Promise<DrugConstellationPoint[]>` in `lib/api.ts`. Returns the 10 (or fewer) rows with a computed `trend_category` field added client-side.

**Type:**
```ts
export interface DrugConstellationPoint {
  drug_name: string;
  manufacturer_name: string;
  manufacturer_clean: string;        // computed: strip corporate suffixes
  total_amount_usd: number;
  payment_count: number;
  most_recent_payment_date: string;  // ISO date
  year_over_year_trend_pct: number | null;
  trend_category: 'growing' | 'stable' | 'declining' | 'heavily_declining';
}
```

**Manufacturer name cleanup** (regex order matters):
1. Strip `, INC.` / ` INC.` / `, INC` / ` INC` (case insensitive)
2. Strip `, LLC` / ` LLC`
3. Strip ` LP` / `, LP`
4. Strip ` PHARMACEUTICALS` (only if followed by suffix already stripped)
5. Title-case the remainder

Example: `JAZZ PHARMACEUTICALS INC.` → `Jazz Pharmaceuticals`. `AstraZeneca Pharmaceuticals LP` → `AstraZeneca`.

---

## Validation case — Charles Rudin

When the component is built, Rudin's chart should render:
- 7 bubbles total
- Alecensa as the only "growing" (bright amber) bubble, top-right area
- Lumakras as "stable" (mid amber)
- Tecentriq, Zepzelca, Tagrisso, Gavreto, Keytruda all "declining" or "heavily declining" (dim)
- Tecentriq as the largest bubble (7 payments) and highest Y position by total ($16.3K)
- Zepzelca higher Y ($27K) but smaller bubble (6 payments)
- Keytruda sits effectively on the X axis (Y near floor — $10 total)
- Default selection = Zepzelca ($27.2K, top by total)

Mock from chat session 2026-06-03 shows the target visual fidelity.

---

## Relationship to TopPharmaCompanies

`TopPharmaCompanies` (separate component, ships first) and `DrugConstellation` (this component) are sister sections, both right-column under Cohort Score:

```
Right column (top → bottom):
  Identification
  Cohort Score
  Top Pharma Companies     ← shows when ANY Open Payments data exists (~22% of HCPs)
  Drug Constellation       ← shows when ≥3 drugs exist (~12% of top-200 NSCLC Established)
  Field Notes
```

They answer different questions:
- **Companies**: who funds this HCP? (lifetime totals, ranked, with proportional bars)
- **Drugs**: what therapeutic agents is this HCP engaged with? (scatter by recency × $, trend-encoded)

When both render, the page reads top-to-bottom as: identity → score → who pays them → what they work on → field notes. Natural narrative arc.

When only Companies renders, the page still tells a complete pharma story. The Constellation is the premium tier that activates on the richest HCPs.

---

## Layout — narrow right-column variant

Spec assumes a desktop right-column width of approximately 320–380px. SVG `viewBox` stays `0 0 680 320` for the internal coordinate space; CSS scales the rendered width. Practical implications:

- **X-axis ticks collapse to years only** (no quarterly subdivisions even when the date range is short).
- **Y-axis ticks reduce to 3 marks**: minimum (e.g., $10), midpoint (e.g., $1K), maximum (e.g., $30K).
- **Labels are shorter**: drug name stays full; manufacturer name truncated to one word where possible (e.g., "Jazz Pharmaceuticals" → "Jazz" when collision threatens).
- **Mobile (<600px viewport)**: column stacks below main column, SVG renders at full screen width. Labels can return to full form because there's horizontal room again.

---

## Locked decisions

1. **Position on page:** right column, below Cohort Score, above Field Notes. ✓
2. **Cap:** top 15 drugs by `total_amount_usd`. Covers through p95 of the rich-data cohort (median 13, p90 16, p95 18). Drugs beyond 15 not shown — small "+N more" indicator if applicable. ✓
3. **Community cohort:** section hidden. Medicare-equivalent feature is a separate future build. ✓
4. **Default selection:** most recent payment date. ✓
5. **Threshold:** ≥3 drugs required to render; below that, section hidden entirely. ✓

---

## Out of scope for v1.0 — but worth filing

- **Drug-to-publication crosslink.** Confirmed feasible: brand names appear in publication titles and abstracts. MeSH terms have drug *class* but not brand. v1.x build = text scan over NSCLC publications + brand→generic mapping table (~40-50 drugs for NSCLC+SCLC) + scoring logic. ~2–3 day project. When shipped, hover on Tecentriq would show "Rudin has published 4 papers mentioning Tecentriq" — strong product signal.
- **Drug class / mechanism overlay** (no data source — would need new ingestion or LLM extraction)
- **Year-by-year breakdown per drug** (would need new aggregation against raw Open Payments)
- **"Show all N" expansion** beyond top 15
- **d3-force-collide** for automated label layout (~5KB dependency). v1.0 uses hand-tuned quadrant offsets.
- **"How to read this" tutorial** / first-run hint
- **Medicare-equivalent visual** for community-cohort pages
