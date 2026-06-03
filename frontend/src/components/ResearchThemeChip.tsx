import type { ResearchTheme } from "../types/researchTheme";
import { calculateHeatColor, getChipTextColor } from "../lib/themeHeatPalette";

interface ResearchThemeChipProps {
  theme: ResearchTheme;
  maxPaperCount: number;
  isActive: boolean;
  onClick: () => void;
}

export default function ResearchThemeChip({
  theme,
  maxPaperCount,
  isActive,
  onClick,
}: ResearchThemeChipProps) {
  const backgroundColor = calculateHeatColor(theme.paper_count, maxPaperCount);
  const textColor = getChipTextColor(theme.paper_count, maxPaperCount);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isActive}
      style={{
        position: "relative",
        minHeight: 80,
        padding: 16,
        borderRadius: 12,
        border: isActive ? "2px solid rgba(120, 200, 255, 0.55)" : "2px solid transparent",
        backgroundColor,
        color: textColor,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: "system-ui, sans-serif",
        boxShadow: isActive
          ? "0 6px 20px rgba(0, 0, 0, 0.35)"
          : "0 2px 8px rgba(0, 0, 0, 0.2)",
        transform: isActive ? "scale(1.02)" : "scale(1)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.transform = "scale(1.02)";
          e.currentTarget.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.3)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";
        }
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          minWidth: 24,
          height: 24,
          borderRadius: "50%",
          backgroundColor: "rgba(0, 0, 0, 0.25)",
          color: textColor,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 6px",
        }}
      >
        {theme.paper_count}
      </span>
      <span
        style={{
          display: "block",
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.35,
          paddingRight: 28,
        }}
      >
        {theme.theme_name}
      </span>
    </button>
  );
}
