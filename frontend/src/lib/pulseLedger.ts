// Scientific Pulse — computed view model for the redesigned ledger.
//
// The design frame (docs/design/Scientific Pulse.dc.html) is layout authority,
// but ALL of its figures are illustrative. Every number rendered on the page is
// computed here from the payload, so the frame's smoothed monthly series, its
// 18/7 gate split, and its wider movement range never reach the screen.
//
// Four build corrections live in this file:
//   1. The corpus monthly strip carries the REAL series (Jan 200 … Jun 1,031),
//      scaled so June reads as the spike it is — not the frame's smoothed values.
//   2. The measured/gated split is computed (16 measured / 9 gated), and ADC /
//      KRAS — drawn with movement in the frame — resolve to gated here.
//   3. Movement is the clean-window share delta (Apr–May vs Feb–Mar) already
//      built in pulse.ts; the centred-zero axis is derived from the real
//      distribution so the true min/max fit without clipping.
//   4. Synthesis provenance is handled in the page (editorial, not model-run).

import type { PulsePayload, PulseTheme } from "./pulse";
import {
  PUBLICATION_GATE,
  isMovementGated,
  movementCurrentPubs,
  movementCurrentTotal,
  movementPriorPubs,
  movementPriorTotal,
  movementShareDelta,
} from "./pulse";

const MINUS = "−"; // real minus sign, not a hyphen — tabular alignment

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export interface SeriesBar {
  pubs: number;
  /** Height in px, scaled to the theme's own peak month. */
  heightPx: number;
  /** Jan and Jun are excluded from movement — drawn hollow. */
  excluded: boolean;
}

export interface LedgerRow {
  rank: string;
  name: string;
  n: number;
  nText: string;
  zero: boolean;
  share: number;
  shareText: string;
  /** Headline share bar width %, scaled to the top theme's share. */
  shareBarPct: number;
  facets: string;
  guideline: boolean;
  gated: boolean;
  nRecent: number;
  nPrior: number;
  delta: number | null;
  deltaText: string;
  /** true when |delta| is meaningfully zero (render muted). */
  deltaIsZero: boolean;
  /** Centred-zero movement bar geometry, as % of the full track. */
  barLeftPct: number;
  barWidthPct: number;
  gateNote: string;
  series: SeriesBar[];
}

export type MonthState = "excluded-head" | "clean" | "headline-tail";

export interface CorpusMonth {
  label: string;
  pubs: number;
  /** Bar height %, scaled to the peak month so June towers. */
  heightPct: number;
  state: MonthState;
}

export interface PulseLedger {
  measured: LedgerRow[];
  gated: LedgerRow[];
  measuredCount: number;
  gatedCount: number;
  measuredRangeText: string;
  gatedRangeText: string;
  /** Movement axis extent (± pp), derived to fit the real distribution. */
  axis: number;
  axisNegText: string;
  axisPosText: string;
  corpusMonthly: CorpusMonth[];
  windowSums: { prior: number; recent: number; headline: number };
  evidence: { trials: number; guidance: number; reviews: number };
  totals: { publications: number; themes: number };
}

const SERIES_MAX_PX = 22;
const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN"] as const;

function facetString(theme: PulseTheme, n: number): string {
  if (n === 0) return "NO PUBLICATIONS IN WINDOW";
  const bits = [`${n.toLocaleString()} PUB`];
  if (theme.trials > 0) bits.push(`${theme.trials} ${theme.trials === 1 ? "TRIAL" : "TRIALS"}`);
  if (theme.reviews > 0) bits.push(`${theme.reviews} ${theme.reviews === 1 ? "REVIEW" : "REVIEWS"}`);
  return bits.join(" · ");
}

function seriesBars(theme: PulseTheme): SeriesBar[] {
  const peak = Math.max(1, ...theme.monthly.map((m) => m.pubs));
  return theme.monthly.map((m, i) => ({
    pubs: m.pubs,
    heightPx: Math.max(m.pubs > 0 ? 2 : 1, Math.round((m.pubs / peak) * SERIES_MAX_PX)),
    excluded: i === 0 || i === theme.monthly.length - 1,
  }));
}

// Count only — no rank range. The gate is a THRESHOLD, not a position: SCLC
// (rank 18) is measured while ranks 16–17 are gated, so a "01–18" span would
// imply a contiguity the gate does not have.
function rankRangeText(rows: LedgerRow[]): string {
  return `${rows.length} ${rows.length === 1 ? "THEME" : "THEMES"}`;
}

export function buildPulseLedger(payload: PulsePayload): PulseLedger {
  const themes = payload.themes;
  const guidelineThemes = new Set(payload.events.map((e) => e.theme));

  const recentTotal = movementCurrentTotal(themes); // Apr–May, 902
  const priorTotal = movementPriorTotal(themes); // Feb–Mar, 782
  const maxShare = Math.max(1, ...themes.map((t) => t.cur_share ?? 0));

  // Axis derived from the real distribution: smallest 0.5-step that clears the
  // largest |delta| among measured themes, so nothing clips (correction 3).
  let maxAbsDelta = 0;
  for (const t of themes) {
    if (isMovementGated(t)) continue;
    const d = movementShareDelta(t, recentTotal, priorTotal);
    if (d != null) maxAbsDelta = Math.max(maxAbsDelta, Math.abs(d));
  }
  const axis = Math.max(0.5, Math.ceil(maxAbsDelta * 2) / 2);

  const rows: LedgerRow[] = themes.map((theme, i) => {
    const rank = i + 1;
    const n = theme.cur_pubs;
    const zero = n === 0;
    const gated = isMovementGated(theme);
    const nRecent = movementCurrentPubs(theme);
    const nPrior = movementPriorPubs(theme);
    const delta = gated ? null : movementShareDelta(theme, recentTotal, priorTotal);

    let deltaText = "";
    if (delta != null) {
      const sign = delta > 0 ? "+" : delta < 0 ? MINUS : "";
      deltaText = `${sign}${Math.abs(delta).toFixed(2)}`;
    }
    const w = delta == null ? 0 : (Math.min(Math.abs(delta), axis) / axis) * 50;

    const gateNote = zero
      ? "NO PUBLICATIONS IN EITHER WINDOW"
      : `n=${nRecent} APR${MINUS}MAY · n=${nPrior} FEB${MINUS}MAR · GATE ${PUBLICATION_GATE}`;

    return {
      rank: pad2(rank),
      name: theme.name,
      n,
      nText: zero ? "0" : n.toLocaleString(),
      zero,
      share: theme.cur_share ?? 0,
      shareText: `${(theme.cur_share ?? 0).toFixed(1)}%`,
      shareBarPct: ((theme.cur_share ?? 0) / maxShare) * 100,
      facets: facetString(theme, n),
      guideline: guidelineThemes.has(theme.name),
      gated,
      nRecent,
      nPrior,
      delta,
      deltaText,
      deltaIsZero: delta === 0,
      barLeftPct: delta != null && delta < 0 ? 50 - w : 50,
      barWidthPct: w,
      gateNote,
      series: seriesBars(theme),
    };
  });

  const measured = rows.filter((r) => !r.gated);
  const gated = rows.filter((r) => r.gated);

  // Corpus monthly strip — the REAL series, scaled to its peak (June) so the
  // backfill spike is unmistakable (correction 1). Jan is the deflated head,
  // June the backfill tail carried in the headline only.
  const monthly = payload.monthly;
  const peakMonth = Math.max(1, ...monthly.map((m) => m.pubs));
  const corpusMonthly: CorpusMonth[] = monthly.map((m, i) => ({
    label: MONTH_LABELS[i] ?? m.month,
    pubs: m.pubs,
    heightPct: (m.pubs / peakMonth) * 100,
    state: i === 0 ? "excluded-head" : i === monthly.length - 1 ? "headline-tail" : "clean",
  }));

  const sumIn = (from: number, to: number) =>
    monthly.slice(from, to).reduce((s, m) => s + m.pubs, 0);

  const evidence = themes.reduce(
    (acc, t) => ({
      trials: acc.trials + t.trials,
      guidance: acc.guidance + t.guidance,
      reviews: acc.reviews + t.reviews,
    }),
    { trials: 0, guidance: 0, reviews: 0 },
  );

  return {
    measured,
    gated,
    measuredCount: measured.length,
    gatedCount: gated.length,
    measuredRangeText: rankRangeText(measured),
    gatedRangeText: rankRangeText(gated),
    axis,
    axisNegText: `${MINUS}${axis}`,
    axisPosText: `+${axis}`,
    corpusMonthly,
    windowSums: {
      prior: sumIn(1, 3), // Feb–Mar
      recent: sumIn(3, 5), // Apr–May
      headline: sumIn(3, 6), // Apr–Jun
    },
    evidence,
    totals: { publications: payload.totals.current_pubs, themes: themes.length },
  };
}
