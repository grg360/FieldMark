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
  /** DOI (bare, no URL prefix) if the source publication has one — links the
   *  event to the full article. May be null. */
  doi: string | null;
}

export interface PulsePayload {
  /** Stable identity - keys PULSE_BY_TA / PULSE_SYNTHESIS_BY_TA and matches the
   *  URL segment. Was folded into `therapeutic_area`, a single string doing both
   *  display and dispatch; the 2026-08-15 rename split them. */
  ta_slug: string;
  /** Display only - the page headline. Rename freely; nothing keys on it. */
  ta_label: string;
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
// A theme below this many publications (in the window a figure is computed on)
// never shows a percentage or a change figure — the number is Poisson noise at
// that volume. Absolute count + qualitative label only.
export const PUBLICATION_GATE = 20;

// The HEADLINE gate: keyed on the full display window's count (cur_pubs). Drives
// whether the theme's SHARE renders as a number or an em dash. Unchanged.
export function isThemeGated(theme: PulseTheme): boolean {
  return theme.cur_pubs < PUBLICATION_GATE;
}

// ── Movement windows: clean months only ─────────────────────────────────────
// Movement is computed on the CLEAN months, never the full display window. The
// most recent month is a backfill-recovery spike (and NOT theme-neutral — it
// added +8.4pp of June share to ICI alone) and the oldest is the deflated tail
// of an ingest gap; both are excluded from the movement math entirely. This is
// the same most-recent month sparklineSeries already drops for the charts, plus
// the deflated oldest month. From the clean interior, the trailing
// MOVEMENT_WINDOW_MONTHS are the movement "current" window and the leading
// MOVEMENT_WINDOW_MONTHS the "prior". Headline counts/shares are unaffected —
// they stay on the full display window.
export const MOVEMENT_WINDOW_MONTHS = 2;

function cleanInterior(monthly: PulseMonthly[]): PulseMonthly[] {
  // Needs two full movement windows plus the two excluded edge months.
  if (monthly.length < 2 * MOVEMENT_WINDOW_MONTHS + 2) return [];
  return monthly.slice(1, -1);
}

function sumPubs(months: PulseMonthly[]): number {
  return months.reduce((total, m) => total + m.pubs, 0);
}

export function movementCurrentPubs(theme: PulseTheme): number {
  return sumPubs(cleanInterior(theme.monthly).slice(-MOVEMENT_WINDOW_MONTHS));
}

export function movementPriorPubs(theme: PulseTheme): number {
  return sumPubs(cleanInterior(theme.monthly).slice(0, MOVEMENT_WINDOW_MONTHS));
}

export function movementCurrentTotal(themes: PulseTheme[]): number {
  return themes.reduce((total, t) => total + movementCurrentPubs(t), 0);
}

export function movementPriorTotal(themes: PulseTheme[]): number {
  return themes.reduce((total, t) => total + movementPriorPubs(t), 0);
}

// The MOVEMENT gate: a theme with fewer than PUBLICATION_GATE publications in the
// two-month movement CURRENT window shows a qualitative label, not a pp figure.
// Two-month windows push more themes under the gate than the display window does
// — correct: less data, less licence to quote a number.
export function isMovementGated(theme: PulseTheme): boolean {
  return movementCurrentPubs(theme) < PUBLICATION_GATE;
}

// ── Above-gate movement: change in SHARE of window, in percentage points ─────
// The specified primitive is share of attention, NOT raw count change. Share is
// zero-sum, so it cannot all move one way. Each window's share is the theme's
// clean-window count over that window's clean-window total. Null only when a
// window total is empty (no baseline at all).
export function movementShareDelta(
  theme: PulseTheme,
  currentTotal: number,
  priorTotal: number,
): number | null {
  if (currentTotal <= 0 || priorTotal <= 0) return null;
  const current = (movementCurrentPubs(theme) / currentTotal) * 100;
  const prior = (movementPriorPubs(theme) / priorTotal) * 100;
  return current - prior;
}

export type MovementDirection = "up" | "down" | "flat";

// Keys on the SHARE delta (percentage points), not on the count comparison.
export function movementDirection(delta: number): MovementDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

// ── Rule 2: the qualitative vocabulary (exactly these four, nothing else) ────
export type MovementLabel =
  | "Increasing attention"
  | "Steady"
  | "Decreasing attention"
  | "Emerging";

// Derived from the sign of the clean-window SHARE delta, so the below-gate label
// agrees in direction with the above-gate figure. No numbers in the label.
// "Emerging" takes precedence: a young theme (lifetime < 600) gaining share is a
// frontier signal, exactly what the audience wants surfaced.
export function qualitativeLabel(
  theme: PulseTheme,
  currentTotal: number,
  priorTotal: number,
): MovementLabel {
  const delta = movementShareDelta(theme, currentTotal, priorTotal) ?? 0;
  if (theme.lifetime_pubs < 600 && delta > 0) return "Emerging";
  if (delta > 0) return "Increasing attention";
  if (delta < 0) return "Decreasing attention";
  return "Steady";
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

/** Signed percentage points, one decimal: +4.5 pp / -2.2 pp. */
export function formatSignedPoints(pp: number): string {
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)} pp`;
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

// First-of-month ISO one month later, e.g. "2026-05-01" → "2026-06-01". Gives an
// EXCLUSIVE end to feed formatMonthRange from an inclusive last month.
export function nextMonthIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Movement-window labels for the caption ───────────────────────────────────
// Derived from a theme's six-point monthly series so the caption never hard-codes
// month names — all themes share the same months, so any theme's series works.
// Returns null if the series is too short to define the clean windows.
export interface MovementWindowLabels {
  /** Movement current window, e.g. "Apr–May 2026". */
  current: string;
  /** Movement prior window, e.g. "Feb–Mar 2026". */
  prior: string;
  /** Excluded most-recent month (backfill-recovery spike), e.g. "Jun 2026". */
  excludedTail: string;
  /** Excluded oldest month (deflated ingest-gap tail), e.g. "Jan 2026". */
  excludedHead: string;
}

export function movementWindowLabels(monthly: PulseMonthly[]): MovementWindowLabels | null {
  if (monthly.length < 2 * MOVEMENT_WINDOW_MONTHS + 2) return null;
  const interior = monthly.slice(1, -1);
  const current = interior.slice(-MOVEMENT_WINDOW_MONTHS);
  const prior = interior.slice(0, MOVEMENT_WINDOW_MONTHS);
  return {
    current: formatMonthRange(current[0].month, nextMonthIso(current[current.length - 1].month)),
    prior: formatMonthRange(prior[0].month, nextMonthIso(prior[prior.length - 1].month)),
    excludedTail: formatMonthLabel(monthly[monthly.length - 1].month),
    excludedHead: formatMonthLabel(monthly[0].month),
  };
}

export function themesRankedByCurrent(themes: PulseTheme[]): PulseTheme[] {
  return [...themes].sort((a, b) => b.cur_pubs - a.cur_pubs);
}

// ── Sparkline series: clean months only ──────────────────────────────────────
// The most recent month in the rolling window is a backfill-recovery artifact
// (see the movement-reliability caveat): every theme spikes in it, so an inline
// sparkline that included it would read as the same hockey stick everywhere and
// imply explosive growth across the board — a visual claim the collapsed caveat
// can't undo. The charts therefore use the leading clean months only (Jan–May
// of the current 6-month series) — BOTH the inline sparkline and the drill-down
// curve. This trims the SHAPE only; the count/share/movement figures stay on
// the full 3-vs-3 windows (June included).
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
