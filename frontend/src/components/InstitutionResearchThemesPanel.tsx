import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InstitutionResearchTheme } from "../lib/institutionThemes";
import { institutionToSlug } from "../lib/institutionUtils";
import { COLOR } from "../lib/designTokens";

interface Props {
  themes: InstitutionResearchTheme[];
  institutionName: string;
  taDisplayName?: string;
}

export default function InstitutionResearchThemesPanel({ themes, institutionName, taDisplayName }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const visibleThemes = expanded ? themes : themes.slice(0, 10);
  const hasMore = themes.length > 10;

  return (
    <div style={{ padding: "20px 24px", borderRadius: 8, border: "1px solid #1E1E22", backgroundColor: COLOR.surfaceWell }}>
      <div
        style={{
          fontSize: 13,
          color: COLOR.ink1,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        Top Research Themes
      </div>
      <div style={{ fontSize: 11, color: COLOR.ink4, marginBottom: 12 }}>
        Most-published {taDisplayName || "NSCLC"} topics at {institutionName}
      </div>

      {themes.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink4, padding: "16px 0", textAlign: "center" }}>
          No research themes available yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleThemes.map((theme, idx) => (
              <button
                key={theme.theme_name}
                type="button"
                onClick={() => {
                  navigate(`/institution/${institutionToSlug(institutionName)}/publications?theme=${encodeURIComponent(theme.theme_name)}&institution=${encodeURIComponent(institutionName)}`);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  backgroundColor: COLOR.surfaceRaised,
                  borderRadius: 4,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                  transition: "background-color 120ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: COLOR.ink4, flexShrink: 0, width: 20 }}>{idx + 1}.</span>
                    <span style={{ fontSize: 13, color: COLOR.ink1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {theme.theme_name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "baseline", flexShrink: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#E8A020" }}>{theme.total_paper_count}</span>
                    <span style={{ fontSize: 12, color: COLOR.ink3 }}>papers</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: COLOR.ink3, marginTop: 4, marginLeft: 30 }}>
                  {theme.investigator_count} investigator{theme.investigator_count === 1 ? "" : "s"}
                  {theme.core_count > 0 ? ` (${theme.core_count} core)` : ""}
                  {theme.top_contributor ? ` ${String.fromCharCode(0x00b7)} Top: ${theme.top_contributor.name} (${theme.top_contributor.paper_count} papers)` : ""}
                </div>
              </button>
            ))}
          </div>

          {hasMore ? (
            <button
              type="button"
              className="fm-pill-button"
              onClick={() => setExpanded(!expanded)}
              style={{
                marginTop: 12,
                background: "none",
                border: "none",
                color: "#9B6DFF",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: "8px 0",
              }}
            >
              {expanded ? "Show less" : `Show more (${themes.length - 10})`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
