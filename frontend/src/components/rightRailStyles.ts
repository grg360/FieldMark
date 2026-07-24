import type { CSSProperties } from "react";

// Shared right-rail section styling. Header follows the design system's role-5 "eyebrow"
// (see docs/FIELDMARK_DESIGN_SYSTEM.md §3): sans, 11/600, 0.18em, uppercase, --ink-4.
// This is the single migration point for every rail section header (Identification, Top
// Pharma, Contact & Access), so they all pick up the new type role at once.

export const RIGHT_RAIL_SECTION_STYLE: CSSProperties = {
  padding: "12px 16px 8px",
  borderBottom: "1px solid var(--hair-strong)",
};

export const RIGHT_RAIL_HEADER_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  marginBottom: 12,
};
