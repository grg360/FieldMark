import { useNavigate } from "react-router-dom";
import type { NextActionWithHcp } from "../../lib/home";
import HomeTile from "./HomeTile";

interface Props {
  overdueFollowUps: NextActionWithHcp[];
  totalCount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDueDateShort(iso: string): string {
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}...`;
}

export default function OverdueFollowUpsTile({ overdueFollowUps, totalCount }: Props) {
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
        Overdue Follow-Ups
        {totalCount > 0 ? (
          <span style={{ marginLeft: 6, color: "#E8A020" }}>({totalCount})</span>
        ) : null}
      </div>

      {overdueFollowUps.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#3FB8AF", fontSize: 14 }}>{String.fromCharCode(0x2713)}</span>
          <span style={{ fontSize: 14, color: "#E8E6DF" }}>You&apos;re all caught up.</span>
        </div>
      ) : (
        <div>
          {overdueFollowUps.map((action, index) => (
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
                padding: "10px 0",
                borderBottom: index < overdueFollowUps.length - 1 ? "1px solid #1E1E22" : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: "#E8E6DF", marginBottom: 2 }}>
                {action.hcp.name}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: "#9B9892",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncate(action.body, 80)}
                </span>
                {action.due_at ? (
                  <span style={{ fontSize: 11, color: "#E8A020", flexShrink: 0 }}>
                    {formatDueDateShort(action.due_at)}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </HomeTile>
  );
}
