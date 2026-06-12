import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { NextActionWithHcp } from "../../lib/home";
import HomeTile from "./HomeTile";

interface Props {
  actions: NextActionWithHcp[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}...`;
}

function renderPriorityGlyph(priority: string): ReactNode {
  if (priority === "high") {
    return (
      <span style={{ color: "#E8A020", fontSize: 11, lineHeight: 1, flexShrink: 0 }}>
        {String.fromCharCode(0x25B2)}
      </span>
    );
  }
  if (priority === "low") {
    return (
      <span style={{ color: "#6B6A65", fontSize: 11, lineHeight: 1, flexShrink: 0 }}>
        {String.fromCharCode(0x2193)}
      </span>
    );
  }
  return null;
}

function renderDueContext(action: NextActionWithHcp): ReactNode {
  if (action.overdue && action.due_at) {
    return (
      <span style={{ fontSize: 11, color: "#E8A020", flexShrink: 0, textAlign: "right" }}>
        {String.fromCharCode(0x26A0)} {formatDueDate(action.due_at)} {String.fromCharCode(0x00B7)} Overdue
      </span>
    );
  }
  if (action.due_at) {
    return (
      <span style={{ fontSize: 11, color: "#9B9892", flexShrink: 0, textAlign: "right" }}>
        {formatDueDate(action.due_at)}
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, color: "#6B6A65", flexShrink: 0, textAlign: "right" }}>
      No due date
    </span>
  );
}

export default function NextActionsTile({ actions }: Props) {
  const navigate = useNavigate();

  return (
    <HomeTile>
      <div
        style={{
          fontSize: 11,
          color: "#6B6A65",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        My Next 3 Actions
      </div>

      {actions.length === 0 ? (
        <div>
          <div style={{ fontSize: 14, color: "#E8E6DF" }}>You&apos;re all caught up.</div>
          <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 4 }}>
            No overdue or scheduled follow-ups.
          </div>
        </div>
      ) : (
        <div>
          {actions.map((action, index) => (
            <div
              key={action.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/hcp/${action.hcp.hcp_id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/hcp/${action.hcp.hcp_id}`);
                }
              }}
              style={{
                padding: "12px 0",
                borderBottom: index < actions.length - 1 ? "1px solid #1E1E22" : "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: "#1E1E22",
                  color: "#9B9892",
                  fontSize: 11,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  {renderPriorityGlyph(action.priority)}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#E8E6DF",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {action.hcp.name}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#9B9892",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncate(action.body, 80)}
                </div>
              </div>

              {renderDueContext(action)}
            </div>
          ))}
        </div>
      )}
    </HomeTile>
  );
}
