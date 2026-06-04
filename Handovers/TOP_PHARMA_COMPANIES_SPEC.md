# Top Pharma Companies — Component Spec

**Status:** ready for build.
**Target file:** `frontend/src/components/TopPharmaCompanies.tsx` (new)
**Sister section:** `DrugConstellation.tsx` (see that spec for the right-column relationship)
**Build order:** ship this first. Broader data coverage (~22% of total HCPs), simpler component, establishes the right-column pharma section pattern.
**Date drafted:** Jun 4, 2026

---

## Purpose

A ranked list of the top 5 pharma manufacturers funding an HCP, sized by total lifetime payment. Answers the MSL question "who funds this HCP." Each row shows manufacturer name, total dollars, payment count, with a proportional background bar encoding scale relative to the #1. Hover/tap reveals an active-or-dormant pill plus recency data.

---

## Data source

**Table:** `hcp_open_payments_top_companies_v2`
**Coverage:** ~27,506 HCPs (~22% of total base). Empty state needed for the other ~78%.

**Columns used:**

| Column | Type | Purpose |
|---|---|---|
| `manufacturer_name` | text | Cleaned for display |
| `total_amount_usd` | numeric | Display + bar scaling |
| `payment_count` | integer | Display ("N payments") + hover stats |
| `most_recent_payment_date` | date | Hover status pill + recency line |
| `rank_by_amount` | integer | Ordering (already ranked in table) |

**Filter:** `WHERE hcp_id = $1 ORDER BY rank_by_amount ASC LIMIT 5`

---

## Visual encoding

**Row structure** (5 rows, vertically stacked, 10px gap):

Each row is a relative-positioned div with two layers:
1. **Background bar layer** — `position: absolute`, full row height, width proportional to row's `total_amount_usd` divided by the #1 row's amount, amber tint `rgba(232, 160, 32, 0.10)` (or `0.12` for the #1 row). `border-radius: 3px`.
2. **Content layer** — `position: relative` (sits on top of bar), `padding: 8px 12px`, flex justify-between.

**Content per row:**
- **Left:** manufacturer name (`13px`, weight 500, `#E8E6DF`) on top; payment count subscript ("7 payments", `11px`, `#6B6A65`) below.
- **Right:** total dollar amount (`14px` amber monospace `#E8A020`, weight 500).

**Bar scaling:**
- Row 1 (top): 100% width.
- Rows 2–5: width = `(row_amount / row_1_amount) * 100%`.
- The bar is the *background* of the row (not a thin underline) — gives subtle visual weight to large engagements without crowding the text.

**Manufacturer name cleanup** (regex order matters):
1. Strip trailing `, INC.` / ` INC.` / `, INC` / ` INC` (case insensitive)
2. Strip trailing `, LLC` / ` LLC`
3. Strip trailing ` LP` / `, LP`
4. Strip trailing ` PHARMACEUTICALS` (only when followed by a stripped suffix)
5. Title-case the remainder

Examples: `JAZZ PHARMACEUTICALS INC.` → `Jazz Pharmaceuticals`. `AstraZeneca Pharmaceuticals LP` → `AstraZeneca`. `Boehringer Ingelheim Pharmaceuticals, Inc.` → `Boehringer Ingelheim`.

---

## Interaction

**Hover (desktop) / tap (mobile)** → popover anchored to the active row, showing recency and engagement detail.

**Popover content:**

```
┌──────────────────────────────────────────┐
│ Genentech                  [ACTIVE]     │
│ ────────────────────────────────────    │
│ Most recent           Apr 12, 2024      │
│ Total payments        14                │
│ Avg per payment       $1.6K             │
└──────────────────────────────────────────┘
```

- **Header row:** company name (12px, weight 500) + status pill (right-aligned, 10px, see status logic below).
- **Stat rows:** 3 lines, label-left + value-right format. Labels muted (`#6B6A65`, 12px). Values primary text + monospace (`#E8E6DF`, 12px).

**Status pill logic** (computed client-side from `most_recent_payment_date` vs. today):

| Status | Threshold | Color (bg / border / text) |
|---|---|---|
| ACTIVE | within last 18 months | `#0A1F16` / `#1D9E75` / `#1D9E75` |
| DORMANT | 18–36 months | `#1F1A0A` / `#B07816` / `#B07816` |
| LAPSED | > 36 months | `#1E1E22` / `#6B6A65` / `#6B6A65` |

Padding: `2px 7px`, border-radius `3px`, letter-spacing `0.04em`, uppercase.

**Popover positioning:**
- **Desktop:** floats above or below the hovered row, anchored to row center, with a 6px gap. Avoid overflowing the right edge of the section.
- **Mobile:** expands inline below the tapped row (not a floating popover — full-width inline expansion). Tap again on the same row, or tap a different row, to switch/close.

**No default selection.** Unlike the constellation, this section reads cleanly as a static list. Hover/tap reveals additional data; no info strip is "always populated."

---

## States

**Loading**
- 5 skeleton rows, each: dark gray bar at 60% width, no labels, no animation.

**Empty (HCP not in `hcp_open_payments_top_companies_v2`)**
- Section does not render at all. No header, no empty state message. Adjacent sections close up.

**Sparse (1–4 companies)**
- Render whatever exists. Bar scaling still works (top row 100%, others relative). No filler rows.

**Community cohort**
- Section renders normally when data exists. Community HCPs by definition have low pharma engagement, so most won't have any rows — but the ~22% threshold still applies.

---

## Implementation notes

**Component structure:**
- `TopPharmaCompanies.tsx` — main component, fetches and renders
- API function: `getTopCompaniesForHcp(hcpId): Promise<TopCompanyEntry[]>` in `lib/api.ts`
- Popover state managed locally with `useState<number | null>(activeRowIndex)`

**Type:**
```ts
export interface TopCompanyEntry {
  manufacturer_name: string;
  manufacturer_clean: string;       // computed: stripped + title-cased
  total_amount_usd: number;
  payment_count: number;
  most_recent_payment_date: string; // ISO date
  status: 'active' | 'dormant' | 'lapsed'; // computed client-side
  rank_by_amount: number;
}
```

**Format helpers** (reuse from existing codebase if available):
- Dollar formatting: `$27.2K`, `$1.6M`, `$487` — use the same helper as Pharma Engagement row in Score Breakdown.
- Date formatting: `Apr 12, 2024` — short month, no leading zero on day.

**Popover dismissal:**
- Click-outside or `Escape` key closes the popover.
- On mobile, scrolling closes it (avoid sticky-popover-during-scroll feel).

---

## Validation case — Charles Rudin

When built, Rudin's section should render:
- 5 rows in order: Jazz Pharmaceuticals ($27.2K, 7 payments), Genentech ($22.0K, 14), Daiichi Sankyo ($15.0K, 14), Boehringer Ingelheim ($14.4K, 3), AstraZeneca ($9.1K, 5).
- Row 1 (Jazz) bar at 100% width; row 2 (Genentech) at ~80.7%; row 5 (AstraZeneca) at ~33.3%.
- Hovering Genentech shows: ACTIVE pill, Most recent Apr 12 2024 (or whatever the real date is), 14 total payments, ~$1.6K average.

Mock from chat session 2026-06-03 shows the target visual fidelity.

---

## Locked decisions

1. **Position on page:** right column, below Cohort Score, above Drug Constellation (when present) and Field Notes. ✓
2. **Cap:** top 5 by `rank_by_amount`. Already pre-ranked in the rollup; no client-side sorting needed. ✓
3. **Community cohort:** renders normally if data exists; section hides if no rows. ✓
4. **Interaction:** hover (desktop) / tap (mobile) reveals popover. No persistent selection state. ✓
5. **Empty handling:** entire section hidden when no rows. No "no data" message. ✓

---

## Out of scope for v1.0 — but worth filing

- **Drug breakdown per company on hover.** Hover Genentech → see "Tecentriq $16.3K · Alecensa $2.8K · Gavreto $1.3K". This is the natural deepening — already feasible with `hcp_open_payments_by_drug_v2`. Why deferred: Drug Constellation already surfaces per-drug data prominently when present. Adding it to the Companies hover too is duplicative for the rich-data 12% and unavailable for the broader 22%. Revisit after seeing both sections live.
- **Payment-type breakdown** (consulting vs speaker bureau vs travel) per company. Engagement Mix donut already shows this at the HCP level. Per-company would need new aggregation against raw Open Payments.
- **Year-over-year trend per company.** Not in the rollup. Would require new aggregation.
- **"Show all N" expansion** beyond top 5.
- **Per-company sparkline** showing payment cadence over time (engagement intensity visual). Real product idea, deferred.
