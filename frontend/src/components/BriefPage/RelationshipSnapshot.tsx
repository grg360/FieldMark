import type { CSSProperties, ReactNode } from "react";
import type { BriefFollowUp, BriefInsight } from "../../lib/briefs";

interface Props {
  status: string | null;
  insights: BriefInsight[];
  followUps: BriefFollowUp[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function statusColor(status: string): { bg: string; fg: string; border?: string } {
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
    default:
      return { bg: "#1E1E22", fg: "#9B9892" };
  }
}

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return "Today";
  }
  if (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  ) {
    return "Tomorrow";
  }
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }

  const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (date.getFullYear() === now.getFullYear()) return monthDay;
  return `${monthDay}, ${date.getFullYear()}`;
}

function formatInsightDate(iso: string): string {
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function truncateBody(body: string, maxLen = 120): string {
  if (body.length <= maxLen) return body;
  return `${body.slice(0, maxLen).trimEnd()}...`;
}

function renderPriorityGlyph(priority: string): ReactNode {
  if (priority === "high") {
    return (
      <span style={{ color: "#E8A020", fontSize: 11, lineHeight: 1 }}>
        {String.fromCharCode(0x25B2)}
      </span>
    );
  }
  if (priority === "low") {
    return (
      <span style={{ color: "#6B6A65", fontSize: 11, lineHeight: 1 }}>
        {String.fromCharCode(0x2193)}
      </span>
    );
  }
  return null;
}

const subHeaderStyle: CSSProperties = {
  fontSize: 10,
  color: "#6B6A65",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 500,
  marginBottom: 8,
  marginTop: 16,
};

const chipBase: CSSProperties = {
  fontSize: 10,
  padding: "3px 8px",
  borderRadius: 3,
  textTransform: "uppercase",
  display: "inline-block",
};

export default function RelationshipSnapshot({ status, insights, followUps }: Props) {
  const statusStyle = status ? statusColor(status) : null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {status && statusStyle ? (
        <span
          style={{
            ...chipBase,
            backgroundColor: statusStyle.bg,
            color: statusStyle.fg,
            border: statusStyle.border ?? "none",
          }}
        >
          {statusLabel(status)}
        </span>
      ) : null}

      <div style={subHeaderStyle}>OPEN FOLLOW-UPS ({followUps.length})</div>
      {followUps.length === 0 ? (
        <div style={{ fontSize: 13, color: "#6B6A65" }}>No open follow-ups.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {followUps.map((followUp, index) => {
            const dueLabel = followUp.due_at ? formatDueDate(followUp.due_at) : "No due date";
            return (
              <div
                key={`${followUp.body}-${index}`}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#E8E6DF" }}
              >
                <span style={{ flexShrink: 0, width: 12, marginTop: 2 }}>
                  {renderPriorityGlyph(followUp.priority)}
                </span>
                <span style={{ flex: 1, lineHeight: 1.4 }}>{followUp.body}</span>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 3,
                    backgroundColor: followUp.overdue ? "#E8A020" : "#1E1E22",
                    color: followUp.overdue ? "#0A0A0B" : "#9B9892",
                  }}
                >
                  {followUp.overdue ? `${String.fromCharCode(0x26A0)} ${dueLabel}` : dueLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={subHeaderStyle}>RECENT INSIGHTS ({insights.length})</div>
      {insights.length === 0 ? (
        <div style={{ fontSize: 13, color: "#6B6A65" }}>No insights recorded.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {insights.map((insight, index) => {
            const typeStyle = interactionChipStyle(insight.interaction_type);
            const showStrength = insight.insight_strength !== "routine";
            return (
              <div key={`${insight.occurred_at}-${index}`} style={{ fontSize: 13, color: "#E8E6DF" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  {typeStyle ? (
                    <span style={{ ...chipBase, ...typeStyle }}>
                      {interactionTypeLabel(insight.interaction_type)}
                    </span>
                  ) : null}
                  {showStrength ? (
                    <span
                      style={{
                        ...chipBase,
                        border: "1px solid #E8A020",
                        color: "#E8A020",
                        backgroundColor: "transparent",
                      }}
                    >
                      {insight.insight_strength.toUpperCase()}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 11, color: "#6B6A65" }}>
                    {formatInsightDate(insight.occurred_at)}
                  </span>
                </div>
                <div style={{ lineHeight: 1.4, color: "#9B9892" }}>{truncateBody(insight.body)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
