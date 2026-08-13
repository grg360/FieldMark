import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RelationshipStatus } from "../../lib/relationships";
import { COOL, FONT, GOLD, GROUND, LINE } from "../../lib/designTokens";
import { CANON } from "../../lib/canonicalTokens"; // g2 → INSET, 2026-08-12 composition fix

const STATUS_VALUES: RelationshipStatus[] = [
  "not_engaged",
  "targeted",
  "contacted",
  "engaged",
  "active_relationship",
  "paused",
];

function statusLabel(status: RelationshipStatus): string {
  switch (status) {
    case "not_engaged":
      return "Not Engaged";
    case "targeted":
      return "Targeted";
    case "contacted":
      return "Contacted";
    case "engaged":
      return "Engaged";
    case "active_relationship":
      return "Active Relationship";
    case "paused":
      return "Paused";
  }
}

// Register rebuild 2026-08-05: the ladder reads as a PROGRESSION OF NEUTRAL
// STEPS with gold reserved for the top state — no purple, no teal (the ledger's
// StateLadder set the precedent: state is read by weight, not hue). Paused is
// the gold outline it always was.
function statusColor(status: RelationshipStatus): { bg: string; fg: string; border?: string } {
  switch (status) {
    case "not_engaged":
      return { bg: "transparent", fg: COOL.label, border: `1px solid ${LINE.l1}` };
    case "targeted":
      return { bg: CANON.GROUND.INSET, fg: COOL.muted, border: `1px solid ${LINE.l1}` };
    case "contacted":
      return { bg: LINE.l0, fg: COOL.prose, border: `1px solid ${LINE.l2}` };
    case "engaged":
      return { bg: LINE.l2, fg: COOL.ui };
    case "active_relationship":
      return { bg: GOLD.gold, fg: GROUND.g0 };
    case "paused":
      return { bg: "transparent", fg: GOLD.gold, border: `1px solid ${GOLD.gold}` };
  }
}

interface Props {
  currentStatus: RelationshipStatus;
  pending: boolean;
  onChange: (status: RelationshipStatus) => void;
}

export default function StatusEditor({ currentStatus, pending, onChange }: Props) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  const currentColors = statusColor(currentStatus);

  return (
    <div
      ref={menuRef}
      style={{
        position: "relative",
        // Flex (not block) so the pill doesn't ride high on the inline
        // baseline — keeps it vertically centered against the STATUS label.
        display: "inline-flex",
        alignItems: "center",
        fontFamily: FONT.mono,
      }}
    >
      <button
        type="button"
        className="fm-pill-button"
        onClick={() => setMenuOpen((open) => !open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={pending}
        aria-label={`Change relationship status. Current: ${statusLabel(currentStatus)}`}
        aria-expanded={menuOpen}
        style={{
          padding: "4px 9px",
          borderRadius: 2,
          fontSize: 9,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          lineHeight: 1.2,
          cursor: pending ? "default" : "pointer",
          fontFamily: FONT.mono,
          backgroundColor: currentColors.bg,
          color: currentColors.fg,
          border: currentColors.border ?? "none",
          opacity: pending ? 0.6 : 1,
          display: "inline-flex",
          alignItems: "center",
          filter: hovered && !pending ? "brightness(1.1)" : "none",
          transition: "filter 0.15s ease",
        }}
      >
        {statusLabel(currentStatus)}
      </button>

      {menuOpen ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            backgroundColor: CANON.GROUND.INSET,
            border: `1px solid ${LINE.l1}`,
            borderRadius: 2,
            zIndex: 10,
            minWidth: 200,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {STATUS_VALUES.map((status) => {
            const colors = statusColor(status);
            const isOutline = colors.bg === "transparent";
            const dotStyle: CSSProperties = isOutline
              ? {
                  width: 8,
                  height: 8,
                  borderRadius: 0,
                  backgroundColor: "transparent",
                  border: `1px solid ${colors.fg}`,
                  boxSizing: "border-box",
                  marginRight: 8,
                  flexShrink: 0,
                }
              : {
                  width: 8,
                  height: 8,
                  borderRadius: 0,
                  backgroundColor: colors.bg,
                  marginRight: 8,
                  flexShrink: 0,
                };
            return (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (status !== currentStatus) onChange(status);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: status === currentStatus ? COOL.ui : COOL.prose,
                  fontWeight: status === currentStatus ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: FONT.mono,
                  listStyle: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                }}
              >
                <div style={dotStyle} />
                {statusLabel(status)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
