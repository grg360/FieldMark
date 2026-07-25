import { useNavigate } from "react-router-dom";
import type { NextActionWithHcp } from "../../lib/home";
import { COLOR, TYPE } from "../../lib/designTokens";
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
      <div style={{ ...TYPE.eyebrow, marginBottom: 12 }}>
        Overdue Follow-Ups
        {totalCount > 0 ? (
          <span style={{ marginLeft: 6, color: COLOR.amber }}>({totalCount})</span>
        ) : null}
      </div>

      {overdueFollowUps.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#3FB8AF", fontSize: 14 }}>{String.fromCharCode(0x2713)}</span>
          <span style={{ fontSize: 14, color: COLOR.ink1 }}>Nothing overdue.</span>
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
                borderBottom: index < overdueFollowUps.length - 1 ? `1px solid ${COLOR.hair}` : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: COLOR.ink1, marginBottom: 2 }}>
                {action.hcp.name}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: COLOR.ink3,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncate(action.body, 80)}
                </span>
                {action.due_at ? (
                  <span style={{ ...TYPE.dataValue, fontSize: 11, color: COLOR.amber, flexShrink: 0 }}>
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
