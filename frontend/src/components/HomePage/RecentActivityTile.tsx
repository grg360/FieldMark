import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ActivityEvent, ActivityEventType } from "../../lib/home";
import { formatRelative } from "../FieldInsights/dateFormat";

interface Props {
  activity: ActivityEvent[];
}

const tileStyle = {
  backgroundColor: "#0D0D10",
  border: "1px solid #1E1E22",
  borderRadius: 6,
  padding: 20,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

function eventIcon(type: ActivityEventType): ReactNode {
  switch (type) {
    case "insight_added":
      return String.fromCodePoint(0x1f4dd);
    case "follow_up_completed":
    case "follow_up_created":
      return String.fromCharCode(0x2713);
    case "brief_generated":
      return String.fromCodePoint(0x2728);
    case "status_changed":
      return String.fromCharCode(0x2192);
    default:
      return String.fromCharCode(0x2022);
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function groupByDate(events: ActivityEvent[]): Array<{ label: string; events: ActivityEvent[] }> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const buckets: Record<string, ActivityEvent[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Earlier: [],
  };

  for (const event of events) {
    const ts = new Date(event.timestamp);
    const dayStart = startOfDay(ts);

    if (dayStart.getTime() === todayStart.getTime()) {
      buckets.Today.push(event);
    } else if (dayStart.getTime() === yesterdayStart.getTime()) {
      buckets.Yesterday.push(event);
    } else if (ts.getTime() >= weekStart.getTime()) {
      buckets["This Week"].push(event);
    } else {
      buckets.Earlier.push(event);
    }
  }

  return (["Today", "Yesterday", "This Week", "Earlier"] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, events: buckets[label] }));
}

export default function RecentActivityTile({ activity }: Props) {
  const navigate = useNavigate();
  const groups = groupByDate(activity);

  return (
    <div style={tileStyle}>
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
        Recent Relationship Activity
      </div>

      {activity.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5 }}>
          Your activity will appear here as you work.
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#6B6A65",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>
              {group.events.map((event, index) => (
                <div
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/hcp/${event.hcp.hcp_id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/hcp/${event.hcp.hcp_id}`);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom:
                      index < group.events.length - 1 ? "1px solid #1E1E22" : "none",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1.4, flexShrink: 0 }}>
                    {eventIcon(event.type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#E8E6DF", lineHeight: 1.4 }}>
                      {event.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 2 }}>
                      {formatRelative(event.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
