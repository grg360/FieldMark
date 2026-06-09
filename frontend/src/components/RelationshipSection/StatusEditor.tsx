import { useEffect, useRef, useState } from "react";
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
    <div ref={menuRef} style={{ position: "relative", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={pending}
        aria-label={`Change relationship status. Current: ${statusLabel(currentStatus)}`}
        aria-expanded={menuOpen}
        style={{
          padding: "5px 10px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
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
            const dotColor = colors.bg === "transparent" ? colors.fg : colors.bg;
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
                  color: status === currentStatus ? colors.fg : "#E8E6DF",
                  cursor: "pointer",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: dotColor,
                    marginRight: 8,
                    flexShrink: 0,
                  }}
                />
                {statusLabel(status)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
