// FieldMark canonical tokens — the RFC-01/02/03 system, approved 2026-08-12.
// Source of record: claude.ai/design project "FieldMark token consolidation"
// (FieldMark Token Spec.dc.html = RFC-01 · v02 = RFC-02 cool charcoal + depth ·
// Mono and Sans Pairing.dc.html = RFC-03 faces, Hybrid call).
//
// SCAFFOLD ONLY (this commit): tokens exist, no surface reads them yet.
// Legacy vocabularies (designTokens.ts COLOR/GROUND/LINE/GOLD/COOL/WARM, the
// per-component P objects) stay in place; surfaces migrate references one at a
// time and legacy dies only at zero consumers. Where a legacy module exports a
// clashing name (GROUND, LINE, GOLD, FONT), import from here with an alias or
// via the CANON namespace.
//
// The four rules that keep this canonical:
//   1. Pick one value verbatim; never average near-twins back into existence.
//   2. Depth is expressed by reference to ramp tokens (L-shift), never as new
//      hexes — re-temperature the ramp and depth follows for free.
//   3. Warm belongs to the 14 accents only; the neutral ramp is cool 255°.
//   4. A step below INK/GHOST never carries live text.

import type { CSSProperties } from "react";

// ── COLOR · neutral ramp — cool slate charcoal, hue 250–265°, chroma .008–.016
// (RFC-02 §01: every role keeps its v01 name and L*; hue/chroma re-cast).
export const GROUND = {
  BASE: "#0F1114", // app canvas. L* 7
  RAISE: "#15181C", // cards, ledger rows, drawer body. L* 11
  INSET: "#1E2329", // inputs, wells, hover fill, chips; absorbs the roster surface. L* 15
} as const;

export const LINE = {
  HAIR: "#272D34", // default 1px rule. L* 19
  EDGE: "#353C44", // emphatic border, focused field, active tab. L* 26
} as const;

export const INK = {
  GHOST: "#434B54", // disabled, placeholder, empty-state glyph. L* 33 — text floor is above this
  MUTE: "#656E77", // de-emphasis: units, timestamps, inactive labels. L* 47 (absorbs census #6b6a65 ×130)
  LABEL: "#949CA5", // mono-label voice: column heads, kickers, tracked caps. L* 64 (absorbs #9b9892 ×86)
  BODY: "#C0C6CD", // default readable copy, table values, drawer prose. L* 79
  PRIME: "#E8ECF0", // prose-white: headlines, serif values, hero numerals. L* 93 — #ffffff stays banned
} as const;

// ── COLOR · the 14 warm accents — unchanged hexes (RFC-01), now the only warm
// register on screen (RFC-02 §02: "no change, more effect").
export const GOLD = {
  PRIME: "#E8A020", // brand register: kickers, active state, key-figure emphasis
  RANK: "#E0A75E", // rank numerals and ledger ordinals ONLY — desaturated on purpose
  EDGE: "#6A4E18", // gold at rule weight: underlines, active-tab borders, focus edges
  WASH: "rgba(232,160,32,0.10)", // GOLD/PRIME @ .10 — selected row, gold chip fill
} as const;

export const MARK = {
  EST: "#6E8F76", // EST cohort; doubles as STATE/POSITIVE (one green, two names)
  RS: "#9A8CC8", // RS cohort; absorbs the entire blue/indigo family — no separate "blue"
  COM: "#B0848F", // COM cohort; distinct from danger by chroma — never used for errors
  EST_WASH: "rgba(110,143,118,0.12)", // row tints @ .12
  RS_WASH: "rgba(154,140,200,0.12)",
  COM_WASH: "rgba(176,132,143,0.12)",
} as const;

export const ACTION = {
  LINK: "#3FB8AF", // anything clickable that isn't a gold control
  HOVER: "#63CCC4", // hover / visited-active; focus ring = LINK @ 55%
  WASH: "rgba(63,184,175,0.12)", // link hover fill, selected action row (flattens ≈ #1F3A38)
} as const;

export const STATE = {
  DANGER: "#C1544E", // destructive, validation failure, hard flag — high chroma IS the signal
  POSITIVE: MARK.EST, // alias, same hex — never a second green
} as const;

// One-object namespace for files that also import legacy GROUND/LINE/GOLD.
export const CANON = { GROUND, LINE, INK, GOLD, MARK, ACTION, STATE } as const;

// ── DEPTH — five surface treatments at intensity II "Register" (approved).
// One physical model: light from above, slightly behind the viewer; every
// surface is lighter at its top edge and settles to its ramp token at the
// bottom. Gradients are DERIVED from ramp tokens via an L-shift — never minted
// as standalone hexes — so depth survives any future re-temperature.
// Intensity II: shift ±3%, rim 9%. (I: ±1.5%/6% · III: ±5.5%/14% — III remains
// the floating-surface treatment via OVERHANG's double shift.)
export const DEPTH_SHIFT = 0.03; // the ONE intensity variable (RFC-02 §04)
export const DEPTH_RIM_ALPHA = 0.09;

// Linear-RGB-ish luminance shift, adequate at charcoal L*: lift/sink each
// channel toward white/black by `amt`. Lands within a few 8-bit steps of the
// RFC-02 II plates' hand-set endpoints (RAISE +3% → #1c1f23 vs the frame's
// #1C2027) — the derivation-by-reference is the contract, not plate parity.
const shade = (hex: string, amt: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};
const rim = (alpha: number) => `1px solid rgba(232,236,240,${alpha})`; // INK/PRIME @ alpha, TOP EDGE ONLY

export const DEPTH: Record<string, CSSProperties> = {
  // Page canvas only. Radial, never linear — a linear page ground reads as a
  // banner and fights the panels sitting on it.
  GROUND: {
    background: `radial-gradient(120% 80% at 50% -10%, ${shade(GROUND.BASE, DEPTH_SHIFT * 2)} 0%, ${GROUND.BASE} 55%, ${shade(GROUND.BASE, -DEPTH_SHIFT * 4)} 100%)`,
  },
  // Editorial containers: call sheets, ledger frames, section panels. The
  // default surface treatment.
  PANEL: {
    background: `linear-gradient(180deg, ${shade(GROUND.RAISE, DEPTH_SHIFT)} 0%, ${GROUND.RAISE} 100%)`,
    borderTop: rim(DEPTH_RIM_ALPHA),
  },
  // Cards and rows INSIDE a panel — half the panel's shift; rim optional,
  // shadow never (full strength on a gradient panel is where dimensional
  // turns muddy).
  CARD: {
    background: `linear-gradient(180deg, ${shade(GROUND.RAISE, DEPTH_SHIFT / 2)} 0%, ${GROUND.RAISE} 100%)`,
  },
  // THE REFERENCE register: raised drawers, roster surfaces, anything that
  // floats over content. Panel gradient at DOUBLE shift + rim + cast shadow.
  // This is the shipped DrawerOverhang richness, promoted to a token.
  OVERHANG: {
    background: `linear-gradient(180deg, ${shade(GROUND.RAISE, DEPTH_SHIFT * 2)} 0%, ${GROUND.RAISE} 100%)`,
    borderTop: rim(DEPTH_RIM_ALPHA + 0.05),
    boxShadow: "0 18px 40px -20px rgba(6,8,10,.7)",
  },
  // The 1px top-edge highlight alone — carries more perceived depth than
  // doubling a gradient, at zero contrast cost. Never a full ring.
  RIM: { borderTop: rim(DEPTH_RIM_ALPHA) },
} as const;
// Depth rules (RFC-02 §03): max three planes visible at once; never stack two
// full-strength gradients (a child steps down one level); no gradients on
// text, accents, chips, buttons or marker glyphs; luminance shifts only, no
// hue shift inside a gradient.

// ── TYPE — the 10-step scale with RFC-03's optical trims applied.
// Newsreader runs optically large, so the two Newsreader display steps trim
// 1px from the v01 scale: T/SUB 21 → 20, T/TITLE 26 → 25. Every other step is
// carried verbatim. T/HERO 88 is HELD pending the re-check against the ramp
// numerals (RFC-03 "either way" note) — flagged, not changed.
export const T = {
  MICRO: 9, // tracked mono micro-labels, column heads (absorbs 8/8.5/9/9.5)
  LABEL: 11, // field labels, kickers, chips, dense mono metadata (10/10.5/11/11.5)
  META: 13, // table cells, captions, secondary UI copy (12/12.5/13/13.5)
  BODY: 15, // default reading size (14/14.5/15/15.5)
  LEAD: 17, // serif values in tables/cards, drawer lead paragraph (16–18)
  SUB: 20, // card titles, drawer headings — RFC-03 trim from 21
  TITLE: 25, // page and section titles — RFC-03 trim from 26
  FIGURE: 30, // secondary ramp numerals, stat cells — load-bearing, do not retune
  DISPLAY: 44, // primary ramp numerals, page headline — load-bearing
  HERO: 88, // the one hero figure — held; re-check vs ramp numerals at migration
} as const;

// ── FACES — RFC-03 final pairing (02 · Hybrid): Newsreader value face over
// Plex chrome. The contrast is the point — mono chrome reads as a different
// register from editorial values, and Plex's four weight steps keep sort
// state, badge urgency and ledger totals off the color channel (color stays
// the cohort markers' monopoly).
export const FACE = {
  // Value face: names, prose, and HEADLINE/STANDALONE DISPLAY NUMERALS (hero
  // figures, rank ordinals standing alone). NUMERAL RULE (settled 2026-08-12):
  // display numerals are value-face; tabular/column/row numerals are data-face;
  // tiebreaker — anything that column-aligns is FACE.data.
  // PROSE RULE (locked 2026-08-12): serif carries narrative/interpretive
  // prose, text ABOUT THE PERSON, and empty-states. Mono never carries prose —
  // see FACE.data for what mono annotates. Fallback runs through the shipped
  // Source Serif 4 so the swap window shows a same-class serif, never an
  // unstyled flash — Source Serif must only ever paint during that swap window.
  value: "'Newsreader', 'Source Serif 4', Georgia, serif",
  // Data face: labels, tracked caps, and every TABULAR/COLUMN/ROW numeral
  // (numeral rule above — standalone display figures go to FACE.value).
  // PROSE RULE (locked 2026-08-12): mono is the DATA-ANNOTATION voice only —
  // provenance, sort order, cell/badge semantics, source/method notes, control
  // microcopy. Sentence prose that interprets the record or speaks about the
  // person is FACE.value. tabular-nums where columns align.
  data: "'IBM Plex Mono', ui-monospace, monospace",
  // UI face: body copy, controls, meta rows.
  ui: "'IBM Plex Sans', system-ui, sans-serif",
} as const;
// Stray faces — flagged for retirement DURING migration, not removed here:
//   · 'IBM Plex Sans Condensed' — RESOLVED 2026-08-13 at the ledger's migration:
//     FOLDED INTO FACE.data with tabular-nums, no scoped FACE/RANK. The numeral
//     rule decides it — ledger rank ordinals sit in a column and column-align,
//     and the tiebreaker sends anything that column-aligns to the data face.
//     Zero consumers remain.
//   · 'IBM Plex Serif' — ghost (loaded in index.html, zero renders) → deletes
//     from the font link at migration.

// ── VIZ — the chart palette (approved 2026-08-13, "FieldMark VIZ palette
// design"). Held SEPARATE from the semantic set on purpose: semantic accents
// encode meaning in the INTERFACE, VIZ colours encode categories in DATA, and
// the two never borrow from each other. Every categorical slot sits at a fixed
// perceptual lightness (L .70–.76) at near-constant chroma, so no category
// reads louder than another on charcoal — only the hue changes. Hues sweep
// 110°→355°; the WARM QUADRANT (40°–100°) is reserved for semantics, which is
// what stops a chart ever colliding with amber.
export const VIZ = {
  C01: "#7C8CF5", // PERIWINKLE  oklch(.72 .14 274)
  C02: "#46B4D6", // CYAN        oklch(.73 .10 226)
  C03: "#3EAB9B", // TEAL        oklch(.70 .09 182)
  C04: "#6FBE7C", // GREEN       oklch(.74 .12 149)
  C05: "#A9BC5C", // OLIVE       oklch(.76 .13 116)
  C06: "#AC80EC", // VIOLET      oklch(.71 .15 303)
  C07: "#D782C4", // ORCHID      oklch(.72 .14 330)
  C08: "#E7838E", // ROSE        oklch(.72 .14 12)
  // RESIDUAL. A COLOUR, NOT A GAP: the "Other" bucket is real data, so it takes
  // a real hue — one lightness step down at a third the chroma, so it recedes
  // without disappearing. Never assigned to a named category (rule 3).
  RESIDUAL: "#9A7796", // PLUM   oklch(.60 .05 340)
} as const;

// Assignment is BY STACK POSITION from this fixed rotation — never by list
// index, never by hash (rule 1). Consecutive bands take non-adjacent hues so
// touching segments never share a neighbourhood. A category keeps its slot
// across every surface (rule 2): EGFR resistance is C01 on Drugs, on
// Intelligence, on Pulse.
export const VIZ_ROTATION = [VIZ.C01, VIZ.C06, VIZ.C03, VIZ.C08, VIZ.C04, VIZ.C02, VIZ.C05, VIZ.C07] as const;

// Sequential ramp for MAGNITUDE — sparklines, count bars, density. One ramp,
// anchored on C01's hue so magnitude and categorical charts read as one family.
// Steps climb in LIGHTNESS, not hue: SEQ[0] sits just above GROUND.INSET, the
// top step is the brightest ink in the system after pure text.
export const SEQ = ["#1B2430", "#27405C", "#345F8E", "#4A8BC0", "#7DB6E4", "#B4D8F5"] as const;

// Pick a categorical slot for stack position `i`; anything past the eighth
// category collapses into the residual and the legend reads "Other (n …)".
export const vizSlot = (i: number): string => (i < VIZ_ROTATION.length ? VIZ_ROTATION[i] : VIZ.RESIDUAL);
// Pick a SEQ step for a 0–1 magnitude. Floors at SEQ-200 so a live value never
// renders at SEQ-100 (which is a ground, not a series colour).
export const seqStep = (t: number): string => SEQ[Math.max(1, Math.min(5, 1 + Math.round(t * 3)))];

// The six rules the palette carries (from the approved spec):
//   1. Categories by stack position, from the fixed rotation.
//   2. A category keeps its slot across every surface.
//   3. Past eight categories → RESIDUAL; RESIDUAL is never a named category.
//   4. GREY NEVER APPEARS IN A CHART SERIES — grey means no-data, disabled or
//      out-of-window, everywhere in the system.
//   5. Magnitude never uses categorical hues; category never uses the SEQ ramp.
//   6. Semantic amber may sit on a chart only as a STATE FLAG or axis-level
//      annotation — never as a series.
