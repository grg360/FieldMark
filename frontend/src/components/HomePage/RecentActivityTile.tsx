import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ActivityEvent, ActivityEventType } from "../../lib/home";
import { formatRelative } from "../FieldInsights/dateFormat";
import { COLOR, TYPE } from "../../lib/designTokens";
import HomeTile from "./HomeTile";

interface Props {
  activity: ActivityEvent[];
}

interface CollapsedEntry {
  kind: "single" | "group";
  representative: ActivityEvent;
  count: number;
  label: string;
}

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

function buildGroupLabel(type: ActivityEventType, hcpName: string, count: number): string {
  const noun = (() => {
    switch (type) {
      case "insight_added":
        return count === 1 ? "insight" : "insights";
      case "follow_up_completed":
        return count === 1 ? "follow-up" : "follow-ups";
      case "follow_up_created":
        return count === 1 ? "follow-up" : "follow-ups";
      case "brief_generated":
        return count === 1 ? "brief" : "briefs";
      case "status_changed":
        return count === 1 ? "status change" : "status changes";
    }
  })();

  const verb = (() => {
    switch (type) {
      case "insight_added":
        return "Added";
      case "follow_up_completed":
        return "Completed";
      case "follow_up_created":
        return "Created";
      case "brief_generated":
        return "Generated";
      case "status_changed":
        return "Changed";
    }
  })();

  return `${verb} ${count} ${noun} for ${hcpName}`;
}

function collapseEvents(events: ActivityEvent[]): CollapsedEntry[] {
  const result: CollapsedEntry[] = [];
  let i = 0;
  while (i < events.length) {
    const current = events[i];
    let j = i + 1;
    while (
      j < events.length &&
      events[j].type === current.type &&
      events[j].hcp.hcp_id === current.hcp.hcp_id
    ) {
      j += 1;
    }
    const runLength = j - i;
    if (runLength >= 3) {
      result.push({
        kind: "group",
        representative: current,
        count: runLength,
        label: buildGroupLabel(current.type, current.hcp.name, runLength),
      });
    } else {
      for (let k = i; k < j; k += 1) {
        result.push({
          kind: "single",
          representative: events[k],
          count: 1,
          label: events[k].label,
        });
      }
    }
    i = j;
  }
  return result;
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
    <HomeTile>
      <div style={{ ...TYPE.eyebrow, marginBottom: 12 }}>
        Recent Relationship Activity
      </div>

      {activity.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink3, lineHeight: 1.5 }}>
          Your activity will appear here as you work.
        </div>
      ) : (
        <div>
          {groups.map((group) => {
            const collapsed = collapseEvents(group.events);
            return (
              <div key={group.label} style={{ marginBottom: 16 }}>
                <div style={{ ...TYPE.microLabel, marginBottom: 8 }}>
                  {group.label}
                </div>
                {collapsed.map((entry, index) => {
                  const event = entry.representative;
                  return (
                    <div
                      key={entry.kind === "group" ? `group-${event.id}-${entry.count}` : event.id}
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
                          index < collapsed.length - 1 ? `1px solid ${COLOR.hair}` : "none",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontSize: 14, lineHeight: 1.4, flexShrink: 0 }}>
                        {eventIcon(event.type)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: COLOR.ink1, lineHeight: 1.4 }}>
                          {entry.label}
                        </div>
                        <div style={{ fontSize: 11, color: COLOR.ink4, marginTop: 2 }}>
                          {formatRelative(event.timestamp)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </HomeTile>
  );
}
