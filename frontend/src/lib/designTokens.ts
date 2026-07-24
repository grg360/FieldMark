// FieldMark design tokens — the single shared source of truth for type, color,
// elevation, and spacing. Mirrors the CSS custom properties defined in index.css
// (:root) so the same values are reachable from both inline styles (this module,
// the app's dominant convention) and CSS classes (var(--token)).
//
// Full rationale + usage rules: docs/FIELDMARK_DESIGN_SYSTEM.md.
// Canonical theme: dark only.

import type { CSSProperties } from "react";

// ── Typefaces (IBM Plex superfamily; loaded in index.html) ──────────────────
export const FONT = {
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  serif: "'IBM Plex Serif', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

// ── Palette ─────────────────────────────────────────────────────────────────
export const COLOR = {
  // Ground & surfaces (warm near-black)
  ground: "#0a0a0a",
  surfaceWell: "#0d0c0b", // recessed
  surfaceCard: "#171512", // raised
  surfaceRaised: "#1b1915", // hover / active

  // Ink (warm neutral, top-toned whites)
  ink1: "#F4F2EC",
  ink2: "#C7C3BA",
  ink3: "#928E86",
  ink4: "#77736B",
  ink5: "#57534b",

  // Accent — the ONLY accent (see §accent rule)
  amber: "#E8A020",
  amberSoft: "rgba(232,160,32,0.16)", // dominant chart value / thesis-rule tint

  // Secondary — selection, links, bars, secondary actions
  indigo: "#5566E8",
  indigoLink: "#8B93F2",
  indigoLinkHover: "#adb2f6",
  indigoSoft: "rgba(85,102,232,0.12)",

  // Semantic
  estGreen: "#5FA97E", // cohort / est chips
  violet: "#8B78E8", // belief / provenance strength
  info: "#4FA3C7", // bookmark / saved

  // Hairlines — containment only, never separation
  hair: "rgba(255,255,255,0.045)",
  hairStrong: "rgba(255,255,255,0.10)",
} as const;

// ── Type scale — nine roles (§Type scale) ───────────────────────────────────
// Each returns a ready-to-spread CSSProperties object. Sizes are the mid of the
// documented range unless a component needs the larger/smaller end.
export const TYPE = {
  // 1 — Score numeral. The one hero quantity per surface. Amber. Mono for the
  // profile hero (tabular), Sans acceptable on dense list cards.
  scoreNumeral: {
    fontFamily: FONT.sans,
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: 0.9,
    color: COLOR.amber,
    fontVariantNumeric: "tabular-nums",
  } as CSSProperties,

  // 2 — Display. Page title, profile name.
  display: {
    fontFamily: FONT.sans,
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    lineHeight: 1.05,
    color: COLOR.ink1,
  } as CSSProperties,

  // 3 — Card title. Expert name on a list card.
  cardTitle: {
    fontFamily: FONT.sans,
    fontSize: 21,
    fontWeight: 600,
    letterSpacing: "-0.015em",
    lineHeight: 1.1,
    color: "#F2F0EA",
  } as CSSProperties,

  // 4 — Subtitle / lead. Module titles, prompts.
  subtitle: {
    fontFamily: FONT.sans,
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: 1.4,
    color: COLOR.ink2,
  } as CSSProperties,

  // 5 — Eyebrow. Section headers (IDENTIFICATION, WHY THIS EXPERT).
  eyebrow: {
    fontFamily: FONT.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: COLOR.ink4,
  } as CSSProperties,

  // 6 — Micro-label. Metric captions, sub-eyebrows.
  microLabel: {
    fontFamily: FONT.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.11em",
    textTransform: "uppercase",
    color: COLOR.ink4,
  } as CSSProperties,

  // 7 — Body prose. Narrative panels. Serif. italic 400 for interpretive voice.
  bodyProse: {
    fontFamily: FONT.serif,
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.72,
    color: "#BDB9B0",
  } as CSSProperties,

  // 8 — Body UI. Meta rows, helper text, secondary labels.
  bodyUI: {
    fontFamily: FONT.sans,
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.5,
    color: COLOR.ink3,
  } as CSSProperties,

  // 9 — Data value. Any value from the monospace rule. tabular-nums.
  dataValue: {
    fontFamily: FONT.mono,
    fontWeight: 500,
    letterSpacing: 0,
    color: COLOR.ink2,
    fontVariantNumeric: "tabular-nums",
  } as CSSProperties,
} as const;

// ── Elevation — four tiers (§Elevation) ─────────────────────────────────────
// Depth through light logic: raised surfaces catch a top highlight + cast a soft
// shadow; recessed surfaces sink with an inner shadow. Hairlines contain, never
// separate. Prefer the .elevation-card / .elevation-well CSS classes; these
// objects are for inline-styled components.
export const ELEVATION = {
  // Tier 1 — CARD (raised). The default module.
  card: {
    background: COLOR.surfaceCard,
    borderRadius: 11,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.045), 0 12px 26px -18px rgba(0,0,0,0.85)",
  } as CSSProperties,

  // Tier 2 — WELL (recessed). Data cut into a card.
  well: {
    background: COLOR.surfaceWell,
    borderRadius: 8,
    boxShadow:
      "inset 0 1px 2px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.035)",
  } as CSSProperties,

  // Tier 3 — RAISED (hover / active only).
  raised: {
    background: COLOR.surfaceRaised,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.07), 0 18px 34px -14px rgba(0,0,0,0.95)",
  } as CSSProperties,
} as const;

// ── Spacing rhythm ──────────────────────────────────────────────────────────
// A 4px base step; card gaps 16, card padding 22–28, section-header margins 14–20.
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
} as const;

export const RADIUS = {
  card: 11,
  well: 8,
  chip: 8,
  pill: 20,
} as const;

// Incomplete-data fill — the canonical treatment for a period still filling
// (e.g. the greyed projected years in the publication timeline). Documented so
// every surface uses the same muted, de-ambered fill for not-yet-complete data.
export const INCOMPLETE_DATA_FILL = "#4a4632";
