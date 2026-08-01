import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { handleAvatarColor, FI_ACCENT_MUTED } from "../lib/fieldIntelligenceUi";

export function FiToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        padding: "12px 20px",
        background: "rgba(13, 13, 16, 0.98)",
        border: "1px solid rgba(120, 200, 255, 0.35)",
        borderRadius: 4,
        color: "rgba(232, 230, 223, 1)",
        fontSize: 13,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 400,
        textAlign: "center",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      {message}
    </div>
  );
}

export function FiModal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        background: "rgba(0, 0, 0, 0.65)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: wide ? 720 : 440,
          background: "rgba(13, 13, 16, 0.98)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: 4,
          padding: 24,
          marginTop: 40,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "rgba(232, 230, 223, 1)" }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(232, 230, 223, 0.6)",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FiAvatar({ handle }: { handle: string }) {
  const letter = (handle.replace(/^@/, "")[0] || "?").toUpperCase();
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: handleAvatarColor(handle),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

export function FiMslVerified() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        color: FI_ACCENT_MUTED,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Lock size={10} strokeWidth={2} />
      MSL Verified
    </span>
  );
}

// FiChannelPill removed 2026-07-31 with the FI feed track — it rendered
// mockFieldIntelligencePosts channel labels and had no other consumer.

export function FiChip({
  label,
  selected,
  onClick,
  multi,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 4,
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
        cursor: "pointer",
        background: selected ? "rgba(120, 200, 255, 0.15)" : "rgba(255, 255, 255, 0.03)",
        border: selected ? "1px solid rgba(120, 200, 255, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
        color: selected ? "rgba(120, 200, 255, 1)" : "rgba(232, 230, 223, 0.75)",
      }}
    >
      {label}
      {multi && selected ? " ✓" : ""}
    </button>
  );
}
