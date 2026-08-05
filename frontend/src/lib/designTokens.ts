// FieldMark design tokens — the single shared source of truth for type, color,
// elevation, and spacing. Mirrors the CSS custom properties defined in index.css
// (:root) so the same values are reachable from both inline styles (this module,
// the app's dominant convention) and CSS classes (var(--token)).
//
// Full rationale + usage rules: docs/FIELDMARK_DESIGN_SYSTEM.md.
// Canonical theme: dark only.

import type { CSSProperties } from "react";

// ── Typefaces (loaded in index.html) ────────────────────────────────────────
// serif changed 2026-08-05: 'IBM Plex Serif' → 'Source Serif 4', the register
// serif already rendered by 6 of 9 top-level surfaces (Pulse is the reference).
// Approved knowing it re-fonts the remaining FONT.serif consumers (Institutions,
// Congress, ThreadPage/forum chrome, HCPCard, Assets panels, PublicationCard) —
// all on the reconcile/rebuild list. See docs/design/DESIGN_SYSTEM_AUDIT.md §6.
export const FONT = {
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  serif: "'Source Serif 4', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

// ── Palette ─────────────────────────────────────────────────────────────────
export const COLOR = {
  // Ground & surfaces (warm near-black)
  ground: "#0a0a0a",
  surfaceWell: "#0d0c0b", // recessed
  surfaceCard: "#161515", // raised (one point of red over neutral — a trace of warmth, no brown cast)
  surfaceRaised: "#1b1915", // hover / active

  // Ink (warm neutral, top-toned whites)
  ink1: "#F4F2EC",
  ink2: "#C7C3BA",
  ink3: "#928E86",
  ink4: "#77736B",
  ink5: "#57534b",

  // Accent — the ONLY accent (see §accent rule)
  amber: "#E8A020",
  amberHover: "#F5D060", // hover state for amber interactive text (logo/wordmark)
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
  danger: "#E8704E", // Sign Out / destructive actions

  // Hairlines — containment only, never separation
  // DEPRECATED for register surfaces: the register draws opaque rules from the
  // SCALE ramp (line / lineStrong) instead of white-alpha hairlines.
  hair: "rgba(255,255,255,0.045)",
  hairStrong: "rgba(255,255,255,0.10)",
} as const;
// NOTE on COLOR: surfaceWell/surfaceCard/surfaceRaised (warm blacks) and
// ink1–ink5 (warm parchment ramp) remain untouched for their 100+ existing
// consumers, but are DEPRECATED for register work — use GROUND / LINE / COOL /
// WARM below. The two vocabularies stay separate until migration is done.

// ════════════════════════════════════════════════════════════════════════════
// THE REGISTER — consolidated 2026-08-05 per docs/design/Token Set - Two
// Ramps.dc.html. One cool ground family shared by every surface; one minted
// gold with derived states; two ink ramps split by READING MODE, not surface
// type: scanning surfaces take COOL ink, long-dwell surfaces take WARM ink.
// Ground, line, chrome and gold are cool everywhere, without exception.
// Rule: pick one value verbatim, never average near-twins. Rule: a step below
// a ramp's published text floor never carries live text.
// ════════════════════════════════════════════════════════════════════════════

// ── GROUND — cool near-black, three steps (shared by every surface) ─────────
// Values carried over byte-identical from SCALE.ground/well/panel. The warm
// board #0b0a09 (Trials) sat one byte from ground.0 and retired into it.
export const GROUND = {
  g0: "#0a0a0a", // page field, deepest (absorbs #0a0a09, #0b0a09, #08090a…)
  g1: "#0a0c0e", // panels, cards, rails (was SCALE.well)
  g2: "#0e1013", // raised — headers, callouts (was SCALE.panel)
} as const;

// ── LINE — cool rules, three steps ──────────────────────────────────────────
// Byte-identical carries of SCALE.raised/line/lineStrong, re-roled: #14181d is
// a RULE now, not a surface (its raised-surface uses keep the value; only the
// name changed). The warm lines #1c1a15/#221f19/#2a251c (Trials) retired into
// l0/l1/l2 — a warm-ink surface carries cool rules.
export const LINE = {
  l0: "#14181d", // interior rules, row dividers, chart tracks
  l1: "#1c2026", // default border
  l2: "#2a2f36", // emphasis border, focus
} as const;

// ── GOLD — one minted accent, states derived and exported ───────────────────
// States are exported rather than left to be re-minted at the call site — that
// omission is what produced twenty-four golds in the first place. COLOR.amber
// (#E8A020) is NOT superseded: bright interactive/score accent, both
// generations. `rank` (#e0a75e, CohortLedger-born score numerals, shipping
// exact across ledger + both profile spines + rising) is OUTSIDE the frame's
// one-gold set — kept as an honest fourth member pending Design's call on
// whether rank numerals converge to `bright`.
export const GOLD = {
  gold: "#be914d", // minted — eyebrows, kickers, links, section ticks
  bright: "#d4a862", // derived — hover, focus
  dim: "#8f6d3a", // derived — pressed, visited, dim accents
  rank: "#e0a75e", // extracted, pre-dates this set — score/index numerals
} as const;

// ── COOL — one continuous ink+chrome ramp, nine steps, split by role ────────
// Steps 1–4 and 9 extracted from what ships; 5–8 interpolated (verified
// legible/distinct at real sizes, 2026-08-05 gate render). Live text stops at
// `label` (the floor — last step ≥4.5:1 on g1); `faint`/`disabled`/`floor` are
// non-text chrome only. #e7e8e9 (old INK_COOL.ink1) retired into `ui` —
// Δ1.02, a distinction without a difference. The prose mints #CDD1D4
// (CohortLedger) and #c9d0d8 (ForumIndex) retired into `prose`.
export const COOL = {
  ui: "#edeeef", // ink.ui — headings, active labels, sans body
  prose: "#c6cacd", // ink.prose — serif long-form
  muted: "#a8aeb3", // ink.muted — column labels, secondary copy
  chromeStrong: "#9aa0a8", // meta, icons, timestamps
  chrome: "#878e96", // default chrome, inactive tabs
  label: "#757c84", // column headers, step numbers — TEXT FLOOR
  faint: "#646b73", // non-text only: marks, inactive glyphs
  disabled: "#585f68", // disabled controls only
  floor: "#4d545d", // hairlines, lowest non-text chrome (= old GREY.grey6)
} as const;

// ── WARM — ink only, three steps ────────────────────────────────────────────
// Warm holds only the ink half of the old fold: no ground, no line, no chrome,
// no gold, and no step that cannot carry text. prose extracted from Trials
// ink0; body/muted interpolated. Long-dwell surfaces only (asset monograph;
// Trials/Drugs-index re-classified scanning → cool at their migration).
export const WARM = {
  prose: "#e9e5d7", // ink.prose.warm — serif body and headings
  body: "#d8d3c2", // ink.body.warm — sans body inside prose panels
  muted: "#b8b2a0", // ink.muted.warm — captions, chart labels; text floor
} as const;

// ── TRACK — canonical letter-spacing spellings ──────────────────────────────
// One spelling per value ends the ".14em" / "0.14em" split: migrate both to
// TRACK.t14 and the drift is gone mechanically. Value-named on purpose — these
// are the register's observed steps, not yet a blessed ladder.
export const TRACK = {
  display: "-0.01em",
  t04: "0.04em",
  t06: "0.06em",
  t08: "0.08em",
  t10: "0.1em",
  t12: "0.12em",
  t14: "0.14em",
  t16: "0.16em",
  t18: "0.18em",
  t20: "0.2em",
  t22: "0.22em",
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

// ── Content width tokens ─────────────────────────────────────────────────────
// The three platform content widths. Every surface picks one; a raw number is the
// signal a fourth width is being invented (the state this replaced). READING for
// single-column scanning lists and prose; STANDARD (the default) for dashboards,
// profiles, tables and indexes; WIDE only for a surface with one genuinely wide
// artifact — a multi-column chart or wide table — that compresses badly below it.
export const CONTENT_WIDTH = { reading: 880, standard: 1120, wide: 1440 } as const;
export type ContentWidth = keyof typeof CONTENT_WIDTH;

// Incomplete-data fill — the canonical treatment for a period still filling
// (e.g. the greyed projected years in the publication timeline). Documented so
// every surface uses the same muted, de-ambered fill for not-yet-complete data.
export const INCOMPLETE_DATA_FILL = "#4a4632";
