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
        minHeight: 64,
        padding: "10px 12px",
        borderRadius: 4,
        border: isActive ? "1px solid #E8A020" : "1px solid #2B2520",
        backgroundColor,
        color: textColor,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: "system-ui, sans-serif",
        transition: "border-color 0.15s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          backgroundColor: "#1A1A1E",
          color: "#E8A020",
          fontSize: 11,
          fontFamily: "monospace",
          fontWeight: 500,
          padding: "2px 7px",
          borderRadius: 3,
          lineHeight: 1.4,
        }}
      >
        {theme.paper_count}
      </span>
      <span
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.35,
          paddingRight: 36,
        }}
      >
        {theme.theme_name}
      </span>
    </button>
  );
}
