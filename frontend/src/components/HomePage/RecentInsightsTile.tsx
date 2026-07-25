import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { InsightWithHcp } from "../../lib/home";
import { formatRelative } from "../FieldInsights/dateFormat";
import { COLOR, TYPE } from "../../lib/designTokens";
import HomeTile from "./HomeTile";

interface Props {
  insights: InsightWithHcp[];
}

function interactionChipStyle(type: string): CSSProperties | null {
  switch (type) {
    case "general":
      return null;
    case "meeting":
      return { backgroundColor: "#E8A020", color: "#0A0A0B" };
    case "email":
      return { backgroundColor: "#4A90E2", color: "#FFFFFF" };
    case "phone":
      return { backgroundColor: "#5A9B7F", color: "#FFFFFF" };
    case "other":
      return { backgroundColor: "#7B7B9C", color: "#FFFFFF" };
    case "conference":
      return { backgroundColor: "#9B6DFF", color: "#FFFFFF" };
    case "publication_review":
      return { backgroundColor: "#3FB8AF", color: "#0A0A0B" };
    case "internal":
      return { border: "1px solid #6B6A65", color: "#6B6A65", backgroundColor: "transparent" };
    default:
      return { backgroundColor: "#2A2A30", color: "#9B9892" };
  }
}

function interactionTypeLabel(type: string): string {
  if (type === "publication_review") return "PUBLICATION REVIEW";
  return type.toUpperCase();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}...`;
}

export default function RecentInsightsTile({ insights }: Props) {
  const navigate = useNavigate();

  return (
    <HomeTile>
      <div style={{ ...TYPE.eyebrow, marginBottom: 12 }}>
        Recent Insights
      </div>

      {insights.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink3, lineHeight: 1.5 }}>
          No insights recorded yet. Start capturing what you observe.
        </div>
      ) : (
        <div>
          {insights.map((insight, index) => {
            const chipStyle = interactionChipStyle(insight.interaction_type);
            return (
              <div
                key={insight.id}
                style={{
                  padding: "12px 0",
                  borderBottom: index < insights.length - 1 ? `1px solid ${COLOR.hair}` : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/hcp/${insight.hcp.hcp_id}`)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 14,
                    fontWeight: 500,
                    color: COLOR.ink1,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    marginBottom: 6,
                  }}
                >
                  {insight.hcp.name}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {chipStyle ? (
                    <span
                      style={{
                        ...chipStyle,
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 3,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {interactionTypeLabel(insight.interaction_type)}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 11, color: COLOR.ink4 }}>
                    {formatRelative(insight.occurred_at)}
                  </span>
                </div>

                <p style={{ fontSize: 13, color: COLOR.ink3, margin: 0, lineHeight: 1.4 }}>
                  {truncate(insight.body, 100)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </HomeTile>
  );
}
