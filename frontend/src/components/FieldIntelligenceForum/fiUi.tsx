// Field Intelligence Forum — shared UI kit. Design-token only; the five new
// patterns (frame 6) reuse the existing palette. Red appears only for removal,
// at the same chroma as amber and indigo (COLOR.danger). Every write affordance
// here is inert: DisabledControl renders the control visibly disabled — never
// hidden — with no "coming soon" badge (messaged separately).

import type { CSSProperties, ReactNode } from "react";
import { COLOR, FONT } from "../../lib/designTokens";
import type { ComplianceState } from "../../lib/fieldIntelligence";

export const mono = (size: number, color: string = COLOR.ink3): CSSProperties => ({
  fontFamily: FONT.mono,
  fontSize: size,
  color,
  letterSpacing: "0.04em",
});
export const serif = (size: number, color: string = COLOR.ink2): CSSProperties => ({
  fontFamily: FONT.serif,
  fontSize: size,
  color,
  lineHeight: 1.6,
});

// Compliance-state palette — one chip per post, never a bare colour.
// on_anchor muted green · under_review amber · context_note indigo · removed red.
export const STATE_STYLE: Record<
  ComplianceState,
  { fg: string; bg: string; border: string; label: string }
> = {
  on_anchor: { fg: "#7fb094", bg: "rgba(95,169,126,0.08)", border: "rgba(95,169,126,0.24)", label: "ON ANCHOR" },
  under_review: { fg: COLOR.amber, bg: "rgba(232,160,32,0.10)", border: "rgba(232,160,32,0.32)", label: "UNDER REVIEW" },
  context_note: { fg: COLOR.indigoLink, bg: "rgba(85,102,232,0.10)", border: "rgba(85,102,232,0.30)", label: "CONTEXT NOTE" },
  removed: { fg: COLOR.danger, bg: "rgba(232,112,78,0.10)", border: "rgba(232,112,78,0.30)", label: "REMOVED" },
};

// SIMULATION MARKER (pattern 05). Dashed amber outline, mono, per post — dashed
// because no production compliance state uses a dashed border, so it can never
// be mistaken for a live state. Must survive a crop of any single post.
export function SimulatedChip({ size = 9 }: { size?: number }) {
  return (
    <span
      style={{
        ...mono(size, "#b98f45"),
        letterSpacing: "0.12em",
        fontWeight: 600,
        background: "rgba(232,160,32,0.06)",
        border: "1px dashed rgba(232,160,32,0.42)",
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
          ...mono(size, "#b98f45"),
          letterSpacing: "0.12em",
          fontWeight: 600,
          background: "rgba(232,160,32,0.06)",
          border: "1px dashed rgba(232,160,32,0.42)",
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
        ...mono(size, "#7fb094"),
        letterSpacing: "0.12em",
        fontWeight: 600,
        background: "rgba(95,169,126,0.08)",
        border: "1px solid rgba(95,169,126,0.30)",
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
        background: "rgba(232,160,32,0.07)",
        border: "1px solid rgba(232,160,32,0.22)",
        borderRadius: 6,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          ...mono(10, COLOR.amber),
          letterSpacing: "0.16em",
          fontWeight: 600,
          border: "1px solid rgba(232,160,32,0.45)",
          padding: "3px 7px",
        }}
      >
        ILLUSTRATIVE PROTOTYPE
      </span>
      <span style={{ fontSize: 12.5, color: COLOR.ink3, lineHeight: 1.5 }}>
        Publications, journals and PMIDs are real.{" "}
        <strong style={{ color: COLOR.ink1, fontWeight: 500 }}>
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

// MSL-VERIFIED byline badge (existing pattern on the surface).
export function VerifiedBadge({ small = false }: { small?: boolean }) {
  return (
    <span
      style={{
        ...mono(small ? 9 : 9.5, COLOR.indigoLink),
        letterSpacing: "0.1em",
        border: `1px solid rgba(85,102,232,0.3)`,
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
    ...mono(10.5, COLOR.ink4),
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
  const variants: Record<string, CSSProperties> = {
    ghost: { border: `1px solid ${COLOR.hairStrong}`, background: "transparent", color: COLOR.ink3 },
    primary: { border: `1px solid rgba(85,102,232,0.4)`, background: "rgba(85,102,232,0.08)", color: COLOR.indigoLink },
    "solid-amber": { border: "1px solid rgba(232,160,32,0.5)", background: "rgba(232,160,32,0.5)", color: "#0a0a0a" },
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
        background: "#26231d",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...mono(size * 0.42, COLOR.ink2),
        flexShrink: 0,
      }}
    >
      {letter}
    </span>
  );
}
