import type { ReactNode } from "react";

function LegendTile({
  visual,
  title,
  subtitle,
  titleColor,
}: {
  visual: ReactNode;
  title: string;
  subtitle: string;
  titleColor: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 80,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: "rgba(13, 13, 16, 0.5)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 6,
      }}
    >
      <div style={{ flexShrink: 0 }}>{visual}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: titleColor,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "rgba(232, 230, 223, 0.7)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </span>
      </div>
    </div>
  );
}

export default function TelescopeLegend() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        width: "100%",
        padding: "0 16px 12px",
        boxSizing: "border-box",
      }}
    >
      <LegendTile
        title="Established"
        subtitle="Recognized KOLs (Top 50)"
        titleColor="#FFD700"
        visual={
          <svg width="36" height="36" viewBox="-18 -18 36 36" aria-hidden>
            <defs>
              <radialGradient id="legend-gold-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="1" />
                <stop offset="40%" stopColor="#FFD700" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="0" cy="0" r="14" fill="url(#legend-gold-glow)" />
            <line x1="0" y1="-13" x2="0" y2="13" stroke="#FFD700" strokeWidth="0.8" opacity="0.85" />
            <line x1="-13" y1="0" x2="13" y2="0" stroke="#FFD700" strokeWidth="0.8" opacity="0.85" />
            <circle cx="0" cy="0" r="3" fill="#FFD700" />
          </svg>
        }
      />
      <LegendTile
        title="Top KOLs"
        subtitle="Highest-ranked names (Top 10)"
        titleColor="#FFFFFF"
        visual={
          <svg width="36" height="36" viewBox="-18 -18 36 36" aria-hidden>
            <defs>
              <radialGradient id="legend-white-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="0" cy="0" r="14" fill="url(#legend-white-glow)" />
            <line x1="0" y1="-15" x2="0" y2="15" stroke="#FFFFFF" strokeWidth="1.0" opacity="0.85" />
            <line x1="-15" y1="0" x2="15" y2="0" stroke="#FFFFFF" strokeWidth="1.0" opacity="0.85" />
            <line x1="-10" y1="-10" x2="10" y2="10" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.55" />
            <line x1="-10" y1="10" x2="10" y2="-10" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.55" />
            <circle cx="0" cy="0" r="3.5" fill="#FFFFFF" />
          </svg>
        }
      />
      <LegendTile
        title="Rising Stars"
        subtitle="Emerging researchers"
        titleColor="#9B6DFF"
        visual={
          <svg width="36" height="36" viewBox="-18 -18 36 36" aria-hidden>
            <defs>
              <radialGradient id="legend-purple-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#9B6DFF" stopOpacity="1" />
                <stop offset="40%" stopColor="#9B6DFF" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#9B6DFF" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="0" cy="0" r="10" fill="url(#legend-purple-glow)" />
            <circle cx="0" cy="0" r="2.5" fill="#9B6DFF" />
          </svg>
        }
      />
      <LegendTile
        title="Network"
        subtitle="Lines = co-authorship · Move cursor to magnify"
        titleColor="rgba(232, 230, 223, 1.0)"
        visual={
          <svg width="48" height="36" viewBox="-24 -18 48 36" aria-hidden>
            <line x1="-18" y1="0" x2="18" y2="0" stroke="#5A7090" strokeWidth="1" opacity="0.6" />
            <circle cx="-18" cy="0" r="3" fill="#FFD700" opacity="0.8" />
            <circle cx="18" cy="0" r="3" fill="#9B6DFF" opacity="0.8" />
            <circle cx="0" cy="0" r="11" fill="none" stroke="#C8D8E8" strokeWidth="0.7" opacity="0.5" />
            <circle cx="0" cy="0" r="9" fill="none" stroke="#C8D8E8" strokeWidth="0.5" opacity="0.4" />
          </svg>
        }
      />
    </div>
  );
}
