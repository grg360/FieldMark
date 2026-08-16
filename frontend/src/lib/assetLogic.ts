// Drug Intelligence — pure display logic for the asset page.
//
// Every product rule that must read identically everywhere lives here as a pure
// function: the themed denominator, the per-asset composition window, the 40-per-
// year display gate, the top-6/Other theme banding, and the citation-trajectory
// verdicts. Mirrors the discipline in pulse.ts. No data access, no React.

import { COLOR } from "./designTokens";
import { VIZ, VIZ_ROTATION } from "./canonicalTokens";
import { ASSETS_TA_SLUG } from "./assetConfig";
import { taLabelForSlug } from "./taLabels";

// ── The theme ramp ───────────────────────────────────────────────────────────
// Design's one new categorical scale (frame 1f): a fixed cool ramp, lightest band
// carries the largest opening share. Amber is reserved for the hovered/held band
// and never appears in the ramp itself; Other is a flat neutral. Everything else
// on the page (amber, inks, surfaces) comes from the existing tokens.
// VIZ palette 2026-08-13 (approved spec). The previous ramp encoded CATEGORY by
// LIGHTNESS (L .70 → .36 down one blue/violet lane) — the exact anti-pattern the
// palette retires: it made band 1 read "louder" than band 6 when they are peers,
// and it collided with the magnitude ramp's own lightness language. Categories
// now vary by HUE ONLY at a fixed perceptual lightness, taken BY STACK POSITION
// from the fixed rotation so touching bands never share a hue neighbourhood.
export const THEME_RAMP = VIZ_ROTATION;
// The residual is A COLOUR, NOT A GAP: "Other (n themes)" is real data, so it
// takes a real hue (PLUM, one lightness step down at a third the chroma). The
// old value was a dark grey-brown — and grey is now reserved system-wide for
// no-data / disabled / absence, never a chart series (rule 4).
export const OTHER_COLOR = VIZ.RESIDUAL;
export const HIGHLIGHT = COLOR.amber;

// Below this many themed items in a period, the year-over-year movement view is
// withheld and the pooled view shown in its place (frame 1f, extending the Pulse
// gate). The gate states the threshold and the real numbers — never "insufficient
// data" alone.
export const THEMED_PERIOD_GATE = 40;
export const MAX_YEAR = 2026;
export const TOP_THEME_BANDS = 6;

// ── RPC payload shapes ───────────────────────────────────────────────────────
export interface PerYear {
  year: number;
  corpus: number;
  themed: number;
}
export interface PerThemeCell {
  year: number;
  short_name: string | null;
  n: number;
}
export interface CompositionPayload {
  per_year: PerYear[];
  per_theme: PerThemeCell[];
}

// ── Derived composition ──────────────────────────────────────────────────────
export interface ThemeBand {
  key: string; // short_name or "__other__"
  label: string;
  color: string;
  openingShare: number; // share in the first window year (0–1)
  closingShare: number; // share in the last window year (0–1)
  deltaPp: number; // percentage points, opening → closing
  spark: number[]; // per-window-year share (0–1), same scale across bands
  pooledShare: number; // share across the whole window (0–1)
  pooledN: number;
}
export interface YearColumn {
  year: number;
  corpus: number;
  themed: number;
  isPartial: boolean; // 2026 — a part year, never annualised
  segments: { key: string; share: number; n: number }[]; // ordered as bands
}
export interface Composition {
  gated: boolean; // true → show pooled view in place of movement
  window: number[]; // years shown
  firstGateYear: number | null;
  bands: ThemeBand[]; // top-6 + Other, ordered by opening share (pooled share when gated)
  columns: YearColumn[]; // one per window year (movement view)
  themedTotal: number; // themed papers across the window (the stated denominator)
  corpusTotal: number; // all papers across the window
  themedPct: number; // themedTotal / corpusTotal (0–1)
  gateYears: { year: number; themed: number }[]; // the failing counts, printed by the gate
}

const OTHER_KEY = "__other__";

/** Theme key → its VIZ categorical hue, taken from the composition that is
 *  already on screen. Surfaces that badge a theme (the landing rows' chips)
 *  read THIS rather than re-deriving a colour, so a chip can never disagree
 *  with the band it names — rule 2, "a category keeps its slot".
 *
 *  A theme that is NOT one of the charted bands returns undefined and the
 *  caller falls back to neutral: it genuinely has no slot on this asset, and
 *  the residual PLUM is never assigned to a NAMED category (rule 3). */
export function themeColorMap(composition: Composition): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of composition.bands) {
    if (b.key !== OTHER_KEY) m.set(b.key, b.color);
  }
  return m;
}

/** Build the composition: window, banding, per-year stacks, and the gate. */
export function buildComposition(payload: CompositionPayload): Composition {
  const perYear = [...payload.per_year]
    .filter((y) => y.year != null)
    .sort((a, b) => a.year - b.year);

  const firstGate = perYear.find((y) => y.themed >= THEMED_PERIOD_GATE);
  const firstGateYear = firstGate ? firstGate.year : null;
  const gated = firstGateYear == null;

  // Movement window: first gate-clearing year → 2026 (per-asset, not fixed). When
  // gated, pool across every year the asset has.
  const window = gated
    ? perYear.map((y) => y.year)
    : perYear.filter((y) => y.year >= firstGateYear!).map((y) => y.year);
  const windowSet = new Set(window);

  // Per (year, theme) lookup, restricted to the window.
  const cell = new Map<string, number>();
  const themeTotals = new Map<string, number>();
  for (const c of payload.per_theme) {
    if (!windowSet.has(c.year)) continue;
    const key = c.short_name ?? "Unthemed";
    cell.set(`${c.year}|${key}`, (cell.get(`${c.year}|${key}`) ?? 0) + c.n);
    themeTotals.set(key, (themeTotals.get(key) ?? 0) + c.n);
  }

  const perYearWindow = perYear.filter((y) => windowSet.has(y.year));
  const themedTotal = perYearWindow.reduce((s, y) => s + y.themed, 0);
  const corpusTotal = perYearWindow.reduce((s, y) => s + y.corpus, 0);

  // SELECT the six bands by pooled share across the window — a small opening year
  // (a per-asset window can start on a thin year) must not promote a noise theme.
  // Then ORDER the selected bands by opening share for the ramp, per Design
  // ("ordered by the category's opening share"). When gated there is no opening
  // year, so order stays by pooled share.
  const firstYear = window[0];
  const firstYearThemed = perYearWindow.find((y) => y.year === firstYear)?.themed ?? 0;
  const bySelection = [...themeTotals.keys()].sort(
    (a, b) => (themeTotals.get(b) ?? 0) - (themeTotals.get(a) ?? 0),
  );
  const topThemes = bySelection.slice(0, TOP_THEME_BANDS);
  const pooledThemes = bySelection.slice(TOP_THEME_BANDS);
  const otherCount = pooledThemes.length;

  const openingShareOf = (name: string): number =>
    firstYearThemed ? (cell.get(`${firstYear}|${name}`) ?? 0) / firstYearThemed : (themeTotals.get(name) ?? 0);
  if (!gated) topThemes.sort((a, b) => openingShareOf(b) - openingShareOf(a));

  const bandKeys = [...topThemes];
  if (otherCount > 0) bandKeys.push(OTHER_KEY);

  const labelFor = (key: string): string =>
    key === OTHER_KEY ? `Other (${otherCount} theme${otherCount === 1 ? "" : "s"})` : key;
  const colorFor = (key: string, i: number): string =>
    key === OTHER_KEY ? OTHER_COLOR : THEME_RAMP[i] ?? OTHER_COLOR;

  const themedInYear = (year: number): number =>
    perYearWindow.find((y) => y.year === year)?.themed ?? 0;
  const nFor = (year: number, key: string): number => {
    if (key !== OTHER_KEY) return cell.get(`${year}|${key}`) ?? 0;
    return pooledThemes.reduce((s, t) => s + (cell.get(`${year}|${t}`) ?? 0), 0);
  };
  const pooledNFor = (key: string): number => {
    if (key !== OTHER_KEY) return themeTotals.get(key) ?? 0;
    return pooledThemes.reduce((s, t) => s + (themeTotals.get(t) ?? 0), 0);
  };

  const lastYear = window[window.length - 1];
  const bands: ThemeBand[] = bandKeys.map((key, i) => {
    const openingShare = themedInYear(firstYear) ? nFor(firstYear, key) / themedInYear(firstYear) : 0;
    const closingShare = themedInYear(lastYear) ? nFor(lastYear, key) / themedInYear(lastYear) : 0;
    const pooledN = pooledNFor(key);
    return {
      key,
      label: labelFor(key),
      color: colorFor(key, i),
      openingShare,
      closingShare,
      deltaPp: (closingShare - openingShare) * 100,
      spark: window.map((y) => (themedInYear(y) ? nFor(y, key) / themedInYear(y) : 0)),
      pooledShare: themedTotal ? pooledN / themedTotal : 0,
      pooledN,
    };
  });

  const columns: YearColumn[] = perYearWindow.map((y) => ({
    year: y.year,
    corpus: y.corpus,
    themed: y.themed,
    isPartial: y.year >= MAX_YEAR,
    segments: bandKeys.map((key) => ({
      key,
      n: nFor(y.year, key),
      share: y.themed ? nFor(y.year, key) / y.themed : 0,
    })),
  }));

  return {
    gated,
    window,
    firstGateYear,
    bands,
    columns,
    themedTotal,
    corpusTotal,
    themedPct: corpusTotal ? themedTotal / corpusTotal : 0,
    gateYears: perYear
      .filter((y) => y.year >= MAX_YEAR - 2)
      .map((y) => ({ year: y.year, themed: y.themed })),
  };
}

// ── Citation trajectory ──────────────────────────────────────────────────────
export type Verdict = "climbing" | "plateaued" | "falling" | "none";

export interface CitationYear {
  year: number;
  cited_by_count: number;
}

export interface Trajectory {
  verdict: Verdict;
  reason: string | null; // set only when verdict === "none"
  spark: number[]; // last up-to-6 years' counts, ascending; drawn only when verdict !== "none"
}

/**
 * Verdict from the yearly citation series. 2026 is partial and never used for the
 * verdict (comparing a part year to a full one invites a false "falling"); it is
 * still drawn as the sparkline's final bar. Under twelve months of history — a
 * publication year at or past the cap, or fewer than two full citation years — the
 * sparkline is suppressed and replaced with "no trajectory" and the reason.
 */
export function trajectory(series: CitationYear[] | null | undefined, pubYear: number): Trajectory {
  const clean = (series ?? [])
    .filter((c) => c && typeof c.year === "number")
    .map((c) => ({ year: c.year, n: Number(c.cited_by_count) || 0 }))
    .sort((a, b) => a.year - b.year);

  if (pubYear >= MAX_YEAR) {
    return { verdict: "none", reason: "< 12 months", spark: [] };
  }
  const fullYears = clean.filter((c) => c.year < MAX_YEAR);
  if (fullYears.length < 2) {
    return { verdict: "none", reason: "< 12 months", spark: [] };
  }

  const vLast = fullYears[fullYears.length - 1].n;
  const vPrev = fullYears[fullYears.length - 2].n;
  let verdict: Verdict;
  if (vLast > vPrev * 1.05) verdict = "climbing";
  else if (vLast < vPrev * 0.85) verdict = "falling";
  else verdict = "plateaued";

  const spark = clean.slice(-6).map((c) => c.n);
  return { verdict, reason: null, spark };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  climbing: "STILL CLIMBING",
  plateaued: "PLATEAUED",
  falling: "ACCRUAL FALLING",
  none: "NO TRAJECTORY",
};

/** Amber only for "still climbing"; every other verdict is neutral (frame 1f). */
export function verdictColor(v: Verdict): string {
  return v === "climbing" ? COLOR.amber : COLOR.ink3;
}

// ── Study-design badge (from publication_types) ──────────────────────────────
// One badge per paper, most-specific design first. Kept in mono caps like the
// frames' "PHASE 3 / POOLED ANALYSIS / OBSERVATIONAL" chips.
export function designBadge(types: string[] | null | undefined): string | null {
  const t = types ?? [];
  const has = (s: string) => t.some((x) => x.toLowerCase().includes(s));
  if (has("phase iii") || has("phase 3")) return "PHASE 3";
  if (has("phase ii") || has("phase 2")) return "PHASE 2";
  if (has("phase i") || has("phase 1")) return "PHASE 1";
  if (has("meta-analysis")) return "META-ANALYSIS";
  if (has("systematic review")) return "SYSTEMATIC REVIEW";
  if (has("randomized controlled")) return "RCT";
  if (has("observational")) return "OBSERVATIONAL";
  if (has("multicenter")) return "MULTICENTRE";
  if (has("case reports")) return "CASE REPORT";
  if (has("review")) return "REVIEW";
  return null;
}

// ── Open-access link (open in new tab; DOI resolver fallback) ─────────────────
export interface OpenAccess {
  is_oa?: boolean;
  oa_url?: string | null;
}
export interface OaLink {
  url: string | null;
  label: string; // "Full text" (OA) / "View on publisher" (DOI) / "No open access"
  isOa: boolean;
}
export function oaLink(oa: OpenAccess | null | undefined, doi: string | null | undefined): OaLink {
  if (oa?.is_oa && oa.oa_url) {
    return { url: oa.oa_url, label: "Full text", isOa: true };
  }
  if (doi) {
    return { url: `https://doi.org/${doi}`, label: "View on publisher", isOa: false };
  }
  return { url: null, label: "No open access", isOa: false };
}

// ── Authors ──────────────────────────────────────────────────────────────────
export function authorInitialName(first: string | null, last: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const initial = f ? `${f[0]}. ` : "";
  return `${initial}${l}`.trim() || "Unknown";
}

/** Honest rank label — the author's best NSCLC established rank, or unranked.
 *  No invented "board" boundary: the established ranks table ranks the whole
 *  cohort, so we show the position, not a yes/no membership. */
export function authorRankLabel(
  boardRank: number | null,
  scopeType: string | null,
  scopeValue: string | null,
): string {
  const ta = taLabelForSlug(ASSETS_TA_SLUG).toUpperCase();
  if (boardRank == null) return `NOT RANKED IN ${ta}`;
  const scope = scopeType === "global" || !scopeValue ? "GLOBAL" : scopeValue.toUpperCase();
  return `${ta} #${boardRank} · ${scope}`;
}
