import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RelationshipStatus } from "../../lib/relationships";

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

function statusColor(status: RelationshipStatus): { bg: string; fg: string; border?: string } {
  switch (status) {
    case "not_engaged":
      return { bg: "transparent", fg: "#6B6A65", border: "1px solid #1E1E22" };
    case "targeted":
      return { bg: "#1E1E22", fg: "#9B9892" };
    case "contacted":
      return { bg: "#9B6DFF", fg: "#FFFFFF" };
    case "engaged":
      return { bg: "#3FB8AF", fg: "#0A0A0B" };
    case "active_relationship":
      return { bg: "#E8A020", fg: "#0A0A0B" };
    case "paused":
      return { bg: "transparent", fg: "#E8A020", border: "1px solid #E8A020" };
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
        fontFamily: "system-ui, -apple-system, sans-serif",
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
          padding: "3px 8px",
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          lineHeight: 1.2,
          cursor: pending ? "default" : "pointer",
          fontFamily: "system-ui, -apple-system, sans-serif",
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
            backgroundColor: "#0D0D10",
            border: "1px solid #1E1E22",
            borderRadius: 4,
            zIndex: 10,
            minWidth: 180,
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
                  borderRadius: "50%",
                  backgroundColor: "transparent",
                  border: `1px solid ${colors.fg}`,
                  boxSizing: "border-box",
                  marginRight: 8,
                  flexShrink: 0,
                }
              : {
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
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
                  fontSize: 13,
                  color: "#E8E6DF",
                  fontWeight: status === currentStatus ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "system-ui, -apple-system, sans-serif",
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
