// Scientific Pulse — payload types + pure display logic.
//
// The hard product rules live here as pure functions so every component derives
// them identically (and so they are trivially testable). See the build brief:
//   1. The 20-count display gate: below it, NEVER show a percentage or a
//      percentage-change arrow — the number is Poisson noise at that volume.
//   2. Below the gate, a qualitative label from a fixed vocabulary replaces the arrow.
//
// No `any`. Payload shape mirrors sql/04_pulse_payload.sql (prototype: hardcoded
// in pulseFixture.ts; no API plumbing yet).

import { COLOR } from "./designTokens";

export interface PulseWindow {
  current_start: string;
  current_end: string;
  prior_start: string;
  prior_end: string;
  lag_months: number;
  window_months: number;
}

export interface PulseTotals {
  current_pubs: number;
  prior_pubs: number;
}

// One point on the monthly publication curve (payload input for a later component;
// carried through the types now, not yet rendered).
export interface PulseMonthly {
  /** First-of-month ISO date, e.g. "2026-04-01". */
  month: string;
  pubs: number;
}

export interface PulseTheme {
  name: string;
  description: string;
  cur_pubs: number;
  prior_pubs: number;
  lifetime_pubs: number;
  /** Percent of primary-theme pubs in the current window. May be null. */
  cur_share: number | null;
  /** Percent of primary-theme pubs in the prior window. May be null. */
  prior_share: number | null;
  // Composition within the current window.
  reviews: number;
  trials: number;
  commentary: number;
  guidance: number;
  /** This theme's counts across the same 6 months as the corpus-wide `monthly`
   *  array — zero-filled, so every theme has the same 6 points (sparkline input). */
  monthly: PulseMonthly[];
}

export type PulseEventType = "guideline" | "consensus" | "retraction";

export interface PulseEvent {
  theme: string;
  type: PulseEventType;
  title: string;
  journal: string;
  date: string;
}

export interface PulsePayload {
  therapeutic_area: string;
  generated_at: string;
  /** Time grain of the windows. Day grain is unsupported (most pub_dates are month-precision). */
  grain: "month";
  window: PulseWindow;
  totals: PulseTotals;
  themes: PulseTheme[];
  events: PulseEvent[];
  /** Monthly publication counts spanning both windows (input for the not-yet-built curve). */
  monthly: PulseMonthly[];
  /** Data-quality caveats to surface in the UI verbatim — never hide these. */
  caveats: string[];
}

// ── Rule 1: the display gate ────────────────────────────────────────────────
// A theme below this many current-window publications never shows a percentage
// or a percentage-change arrow. Absolute count + qualitative label only.
export const PUBLICATION_GATE = 20;

export function isThemeGated(theme: PulseTheme): boolean {
  return theme.cur_pubs < PUBLICATION_GATE;
}

// ── Rule 2: the qualitative vocabulary (exactly these four, nothing else) ────
export type MovementLabel =
  | "Increasing attention"
  | "Steady"
  | "Decreasing attention"
  | "Emerging";

// Derived from the count delta only — no numbers in the label. "Emerging" takes
// precedence: a young theme (lifetime < 600) that is growing is a frontier
// signal, which is exactly what the audience wants surfaced, so it is labelled
// as such rather than merely "Increasing attention".
export function qualitativeLabel(theme: PulseTheme): MovementLabel {
  const { cur_pubs, prior_pubs, lifetime_pubs } = theme;
  if (lifetime_pubs < 600 && cur_pubs > prior_pubs) return "Emerging";
  if (cur_pubs > prior_pubs) return "Increasing attention";
  if (cur_pubs < prior_pubs) return "Decreasing attention";
  return "Steady";
}

// ── Above-gate movement: signed percentage change vs the prior window ────────
// Null when there is no prior baseline to divide by (a genuinely new theme).
export function pctChange(cur: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior <= 0) return null;
  return ((cur - prior) / prior) * 100;
}

export type MovementDirection = "up" | "down" | "flat";

export function movementDirection(cur: number, prior: number): MovementDirection {
  if (cur > prior) return "up";
  if (cur < prior) return "down";
  return "flat";
}

// ── Formatters ──────────────────────────────────────────────────────────────
const INT_FMT = new Intl.NumberFormat("en-US");

export function formatInt(n: number): string {
  return INT_FMT.format(n);
}

/** Signed percentage, one decimal: +4.2% / -6.0%. */
export function formatSignedPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/** Unsigned share percentage, one decimal, or an em dash for null (Rule 4). */
export function formatShare(share: number | null): string {
  if (share == null || !Number.isFinite(share)) return "—";
  return `${share.toFixed(1)}%`;
}

// Snapshot denominator (Rule: label the denominator plainly). Attention share is
// computed over PRIMARY-THEME publications in the window, not all publications —
// so the denominator is the sum of the themes' current counts.
export function primaryThemeTotal(themes: PulseTheme[]): number {
  return themes.reduce((sum, t) => sum + t.cur_pubs, 0);
}

/** Bar proportion (0–1) from counts — a faithful visual of the count share.
 *  Uses counts, not the share field, so it is defined even below the gate
 *  (where the share NUMBER must never be rendered). */
export function countProportion(theme: PulseTheme, denominator: number): number {
  if (denominator <= 0) return 0;
  return theme.cur_pubs / denominator;
}

// Date formatting for the window line: "Jun 8, 2026" from an ISO date string.
// Parsed as UTC (no time zone drift on a bare YYYY-MM-DD).
export function formatWindowDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Month-grain formatting (windows are month-precision; see caveats) ────────
// "Apr 2026" from a first-of-month ISO date.
export function formatMonthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// First-of-month ISO one month earlier, e.g. "2026-07-01" → "2026-06-01".
export function priorMonthIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

// Inclusive month range for a window whose end is EXCLUSIVE (first-of-next-month).
// start "2026-04-01", endExclusive "2026-07-01" → "Apr–Jun 2026" (collapses the shared year).
export function formatMonthRange(startIso: string, endExclusiveIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`);
  const lastInclusive = new Date(`${priorMonthIso(endExclusiveIso)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(lastInclusive.getTime())) {
    return `${startIso}–${endExclusiveIso}`;
  }
  const sameYear = start.getUTCFullYear() === lastInclusive.getUTCFullYear();
  const startMonth = start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (sameYear) {
    return `${startMonth}–${formatMonthLabel(lastInclusive.toISOString().slice(0, 10))}`;
  }
  return `${formatMonthLabel(startIso)}–${formatMonthLabel(lastInclusive.toISOString().slice(0, 10))}`;
}

export function themesRankedByCurrent(themes: PulseTheme[]): PulseTheme[] {
  return [...themes].sort((a, b) => b.cur_pubs - a.cur_pubs);
}

// ── Sparkline series: clean months only ──────────────────────────────────────
// The most recent month in the rolling window is a backfill-recovery artifact
// (see the movement-reliability caveat): every theme spikes in it, so an inline
// sparkline that included it would read as the same hockey stick everywhere and
// imply explosive growth across the board — a visual claim the collapsed caveat
// can't undo. Inline sparklines therefore use the leading clean months only
// (Jan–May of the current 6-month series). This trims the SHAPE only; the
// count/share/movement figures stay on the full 3-vs-3 windows, and the
// drill-down curve still shows the complete labelled record.
export function sparklineSeries(theme: PulseTheme): PulseMonthly[] {
  if (theme.monthly.length <= 1) return theme.monthly;
  return theme.monthly.slice(0, -1);
}

// Shared palette — now mapped onto the design-system tokens (COLOR) so Pulse
// reads as one system with the migrated shell. Centralised so the Pulse
// components don't scatter magic hex; the key names are unchanged so no
// component needed editing when this was warmed.
export const PULSE_COLORS = {
  bg: COLOR.ground,
  card: COLOR.surfaceCard,
  cardAlt: COLOR.surfaceWell,
  line: COLOR.hairStrong,
  text: COLOR.ink1,
  muted: COLOR.ink3,
  mutedDim: COLOR.ink4,
  amber: COLOR.amber,
  indigo: COLOR.indigo,
} as const;
