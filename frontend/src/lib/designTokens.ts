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
// consumers, but are DEPRECATED for register work — use SCALE / INK / GREY
// below. The two vocabularies stay separate on purpose until migration is done.

// ════════════════════════════════════════════════════════════════════════════
// THE REGISTER — extracted 2026-08-05 from the current visual register, with
// Pulse (components/Pulse/PulsePage.tsx frame palette) as the reference
// implementation. Full derivation, variant mapping and file counts:
// docs/design/DESIGN_SYSTEM_AUDIT.md + the token proposal it produced.
// Rule: pick one surface's value verbatim, never average near-twins.
// ════════════════════════════════════════════════════════════════════════════

// ── SCALE — cool near-black, six steps ──────────────────────────────────────
// One ramp serves surfaces AND rules: steps 1–3 are grounds/panels, steps 4–6
// are raised surfaces and borders. panel/well were already exact-shared by
// copy-paste across Pulse, CohortLedger, both profile spines and ForumIndex.
// 129 of the 141 near-blacks in the tree (440 of 458 uses) map within ~13 RGB
// points of a step; the exceptions are semantic tinted wells (amber/green),
// which become rgba tints of their semantic color at migration, not steps.
export const SCALE = {
  ground: "#0a0a0a", // page ground (= COLOR.ground; absorbs #0a0a0b, #08090a…)
  well: "#0a0c0e", // recessed panel (PulsePage panelDark; absorbs #0d0d10)
  panel: "#0e1013", // default panel (PulsePage panel; absorbs #111113)
  raised: "#14181d", // raised surface / soft rule (PulsePage borderSoft)
  line: "#1c2026", // default rule (PulsePage border; absorbs legacy #1e1e22)
  lineStrong: "#2a2f36", // emphasized rule (PulsePage borderMed; absorbs #2a2a30)
} as const;

// ── GOLD — the register's muted editorial gold family ───────────────────────
// COLOR.amber (#E8A020) is NOT superseded: it stays the bright interactive /
// score accent both generations share. These are the frame golds. The one-use
// per-surface golds (#c9903c, #c8892e, #c98d33, #c9962f, #c9973f, #b98f45,
// the #c9a2xx quartet, #6f5629, #7d6234) collapse into these at migration;
// mid-golds (#d8a9xx, #d69a3c/#d99a3c, #e0a544) get assigned per-surface.
export const GOLD = {
  gold: "#be914d", // eyebrows, section ticks, kickers (PulsePage gold)
  goldSoft: "#c9a55f", // caveat text, light accents (PulsePage goldCaveat)
  goldBright: "#e0a75e", // score/index numerals (CohortLedger — already
  //   exact-shared with HcpProfileBrief + CommunityHcpProfile)
  goldMuted: "#7a6136", // gated/secondary numerals (PulsePage goldRank)
  goldDeep: "#6b542f", // dimmest legible gold (PulsePage goldDim)
} as const;

// ── INK — warm parchment text on dark (register) ────────────────────────────
export const INK = {
  ink: "#e9e6df", // titles, primary text (PulsePage ink; shared w/ ForumIndex;
  //   absorbs legacy #e8e6df, #f0ebe1, #ede8dd, #e6e3dc/dd at migration)
  inkProse: "#c5bfb2", // serif body prose (PulsePage proseInk; absorbs
  //   #c4beb0, #c3bcac, #b6b2a8/aa)
  inkMuted: "#a9a396", // secondary text (PulsePage ink2; absorbs #a9a399,
  //   #a5a097, #a09a90)
} as const;

// ── GREY — cool label/data ramp, six steps ──────────────────────────────────
// Pulse-born but platform-wide by copy-paste: ForumIndex (#98a0a8, #79818b,
// #6b747e, #5a636d, #4f5862), CohortLedger/profiles (#8f959a, #7c8288 — one
// RGB point from grey3 —, #767c81, #71787e, #63696e) and Institutions
// (#8fa3ab) all carry near-twins. All six values verbatim from PulsePage —
// head2 and muted kept deliberately; the reference draws those distinctions.
export const GREY = {
  grey1: "#9aa0a8", // column heads, strong labels (PulsePage head)
  grey2: "#8d939c", // sub-heads (PulsePage head2)
  grey3: "#7b8189", // secondary labels (PulsePage muted3)
  grey4: "#6d747d", // muted labels (PulsePage muted)
  grey5: "#5f6670", // muted data, chart fills (PulsePage muted2)
  grey6: "#4d545d", // faintest legible (PulsePage faint)
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
