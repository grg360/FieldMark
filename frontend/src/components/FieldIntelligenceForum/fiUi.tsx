// Field Intelligence Forum — shared UI kit. Design-token only; the five new
// patterns (frame 6) reuse the existing palette. Red appears only for removal,
// at the same chroma as amber and indigo (STATE.DANGER). Every write affordance
// here is inert: DisabledControl renders the control visibly disabled — never
// hidden — with no "coming soon" badge (messaged separately).

import type { CSSProperties, ReactNode } from "react";
import { GROUND, LINE, INK, GOLD, MARK, STATE, FACE } from "../../lib/canonicalTokens";
import type { ComplianceState } from "../../lib/fieldIntelligence";

// THE forum's two type helpers. Consolidated here 2026-08-15 from three mono()
// and two serif() definitions (ForumIndexPage, fiUi, DiscussAffordance) that had
// drifted apart. ForumIndexPage's 4-parameter shape is the superset and wins.
//
// TWO DEFAULTS THAT HAD TO BE RECONCILED CAREFULLY:
//   ls     ForumIndexPage defaulted 0.14, fiUi hard-coded 0.04. Safe to settle on
//          0.04 because every ForumIndexPage call passes ls EXPLICITLY (verified:
//          all 60 sites are 3- or 4-arg), so its default was never exercised.
//   weight ForumIndexPage defaulted 400; fiUi emitted none, letting weight
//          inherit. Those are not interchangeable — ThreadPage, ModerationPage
//          and fiUi have 15 bold containers a nested label could inherit from.
//          So weight is emitted ONLY when passed, and ForumIndexPage's calls that
//          relied on its 400 default now pass 400 explicitly. Output is identical
//          at all 98 call sites.
export const mono = (
  size: number,
  color: string = INK.LABEL,
  ls = 0.04,
  weight?: number,
): CSSProperties => ({
  fontFamily: FACE.data,
  fontSize: size,
  color,
  letterSpacing: `${ls}em`,
  ...(weight === undefined ? {} : { fontWeight: weight }),
});
export const serif = (
  size: number,
  color: string = INK.BODY,
  lh = 1.6,
  weight?: number,
): CSSProperties => ({
  fontFamily: FACE.value,
  fontSize: size,
  color,
  lineHeight: lh,
  ...(weight === undefined ? {} : { fontWeight: weight }),
});

// Compliance-state palette — one chip per post, never a bare color.
// Register pass 2026-08-07: the indigo CONTEXT NOTE folds to cool chrome —
// a context note is a neutral annotation, not an accent class. Green (on
// anchor), amber (under review) and red (removed) stay: semantic states, the
// same discipline as the ledgers. Gold is the surface's only accent.
export const STATE_STYLE: Record<
  ComplianceState,
  { fg: string; bg: string; border: string; label: string }
> = {
  on_anchor: { fg: MARK.EST, bg: MARK.EST_WASH, border: MARK.EST, label: "ON ANCHOR" },
  under_review: { fg: GOLD.PRIME, bg: GOLD.WASH, border: GOLD.EDGE, label: "UNDER REVIEW" },
  context_note: { fg: INK.LABEL, bg: GROUND.INSET, border: LINE.EDGE, label: "CONTEXT NOTE" },
  // REMOVED takes STATE.DANGER: a moderation removal is the destructive-action
  // semantic, which is what DANGER carries. Canonical has no danger WASH, and the
  // rule is not to mint one-off alphas, so the fill is GROUND.INSET and the red
  // is carried by the mark and its border.
  removed: { fg: STATE.DANGER, bg: GROUND.INSET, border: STATE.DANGER, label: "REMOVED" },
};

// SIMULATION MARKER (pattern 05). Dashed amber outline, mono, per post — dashed
// because no production compliance state uses a dashed border, so it can never
// be mistaken for a live state. Must survive a crop of any single post.
export function SimulatedChip({ size = 9 }: { size?: number }) {
  return (
    <span
      style={{
        ...mono(size, GOLD.PRIME),
        letterSpacing: "0.12em",
        fontWeight: 600,
        background: GOLD.WASH,
        border: `1px dashed ${GOLD.EDGE}`,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      SIMULATED
    </span>
  );
}

// PROVENANCE MARKER — the per-row SEEDED / LIVE distinction (2026-08-03).
// SEEDED keeps the dashed-amber treatment of the old SIMULATED marker, so
// fabricated content stays unmistakable and survives a crop of any single row.
// LIVE is a solid quiet green — a legitimate, production-shaped state, legible
// beside SEEDED without being louder. Driven by the row's is_seed, never assumed.
export function ProvenanceChip({ seed, size = 9 }: { seed: boolean; size?: number }) {
  if (seed) {
    return (
      <span
        style={{
          ...mono(size, GOLD.PRIME),
          letterSpacing: "0.12em",
          fontWeight: 600,
          background: GOLD.WASH,
          border: `1px dashed ${GOLD.EDGE}`,
          padding: "2px 6px",
          whiteSpace: "nowrap",
        }}
      >
        SEEDED
      </span>
    );
  }
  return (
    <span
      style={{
        ...mono(size, MARK.EST),
        letterSpacing: "0.12em",
        fontWeight: 600,
        background: MARK.EST_WASH,
        border: `1px solid ${MARK.EST}`,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      LIVE
    </span>
  );
}

// The persistent header strip paired with the per-post marker. Renders on every
// forum route so the surface is never mistaken for live discussion.
export function PrototypeStrip() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "9px 16px",
        background: GOLD.WASH,
        border: `1px solid ${GOLD.EDGE}`,
        borderRadius: 6,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          ...mono(10, GOLD.PRIME),
          letterSpacing: "0.16em",
          fontWeight: 600,
          border: `1px solid ${GOLD.EDGE}`,
          padding: "3px 7px",
        }}
      >
        ILLUSTRATIVE PROTOTYPE
      </span>
      <span style={{ fontSize: 12.5, color: INK.LABEL, lineHeight: 1.5 }}>
        Publications, journals and PMIDs are real.{" "}
        <strong style={{ color: INK.PRIME, fontWeight: 500 }}>
          Every post, handle and moderation record below is fabricated
        </strong>{" "}
        for compliance review. No real individual is represented or quoted.
      </span>
    </div>
  );
}

// A compliance-state chip — always with a reason fragment, never a bare colour.
export function ComplianceChip({
  state,
  fragment,
}: {
  state: ComplianceState;
  fragment?: string | null;
}) {
  const s = STATE_STYLE[state];
  const text = fragment ? `${s.label} · ${fragment}` : s.label;
  return (
    <span
      style={{
        ...mono(9, s.fg),
        letterSpacing: "0.1em",
        fontWeight: 600,
        background: s.bg,
        border: `1px solid ${s.border}`,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

// MSL-VERIFIED byline badge — register: cool chrome on an emphasis border
// (identity assurance is structure, not an accent).
export function VerifiedBadge({ small = false }: { small?: boolean }) {
  return (
    <span
      style={{
        ...mono(small ? 9 : 9.5, INK.LABEL),
        letterSpacing: "0.1em",
        border: `1px solid ${LINE.EDGE}`,
        padding: small ? "1px 5px" : "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      MSL VERIFIED
    </span>
  );
}

// Consistent disabled treatment for every inert write affordance. Rendered, not
// hidden: reviewers need to see the interaction. No tooltip, no badge.
export function DisabledControl({
  children,
  variant = "ghost",
  title,
}: {
  children: ReactNode;
  variant?: "ghost" | "primary" | "solid-amber";
  title?: string;
}) {
  const base: CSSProperties = {
    ...mono(10.5, INK.MUTE),
    letterSpacing: "0.08em",
    padding: "8px 14px",
    borderRadius: 4,
    cursor: "not-allowed",
    opacity: 0.42,
    userSelect: "none",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  // Register pass 2026-08-07: outline buttons only — the filled amber leaves
  // (it was the platform's last filled button) and indigo folds to the gold
  // outline. Variant names kept so call sites stay untouched.
  const variants: Record<string, CSSProperties> = {
    ghost: { border: `1px solid ${LINE.EDGE}`, background: "transparent", color: INK.BODY },
    primary: { border: `1px solid ${GOLD.MUTE}`, background: "transparent", color: GOLD.PRIME },
    "solid-amber": { border: `1px solid ${GOLD.MUTE}`, background: "transparent", color: GOLD.PRIME },
  };
  return (
    <span aria-disabled="true" role="button" title={title} style={{ ...base, ...variants[variant] }}>
      {children}
    </span>
  );
}

// A small circular handle avatar (initial from the pseudonym).
export function HandleAvatar({ handle, size = 26 }: { handle: string; size?: number }) {
  const letter = handle.replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: LINE.HAIR,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...mono(size * 0.42, INK.BODY),
        flexShrink: 0,
      }}
    >
      {letter}
    </span>
  );
}
