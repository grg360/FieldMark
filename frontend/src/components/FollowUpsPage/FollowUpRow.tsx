import { useState } from "react";
import type { FollowUpRow as FollowUpRowType } from "../../lib/home";
import type { Priority } from "../../lib/relationships";
import { formatRelative } from "../FieldInsights/dateFormat";
import SnoozePicker from "./SnoozePicker";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  row: FollowUpRowType;
  bucket: "overdue" | "thisWeek" | "future" | "noDueDate" | "completed";
  onComplete: (id: string) => void;
  onSnooze: (id: string, newDueAt: string) => void;
  onViewHcp: (hcpId: string) => void;
  onGenerateBrief: (hcpId: string) => void;
  isCompletedView?: boolean;
}

function priorityLabel(priority: Priority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function priorityColor(priority: Priority): string {
  if (priority === "high") return "#E8A020";
  if (priority === "low") return "#6B6A65";
  return "#9B9892";
}

function sourceChipConfig(
  source: string | null,
): { label: string; bg: string; color: string; icon: string | null } | null {
  if (source === "brief") {
    return {
      label: "From Brief",
      bg: "rgba(155,109,255,0.18)",
      color: "#9B6DFF",
      icon: String.fromCodePoint(0x2728),
    };
  }
  return null;
}

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (date.getFullYear() === now.getFullYear()) return monthDay;
  return `${monthDay}, ${date.getFullYear()}`;
}

function stripeColor(bucket: Props["bucket"]): string | null {
  if (bucket === "overdue") return "#E84545";
  if (bucket === "thisWeek") return "#E8A020";
  return null;
}

export default function FollowUpRow({
  row,
  bucket,
  onComplete,
  onSnooze,
  onViewHcp,
  onGenerateBrief,
  isCompletedView = false,
}: Props) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const stripe = stripeColor(bucket);
  const dayLabel = row.days_overdue === 1 ? "day" : "days";
  const sourceConfig = sourceChipConfig(row.created_from);

  async function handleComplete() {
    if (pending) return;
    setPending(true);
    try {
      await onComplete(row.id);
    } finally {
      setPending(false);
    }
  }

  async function handleSnooze(newDueAt: string) {
    if (pending) return;
    setPending(true);
    try {
      await onSnooze(row.id, newDueAt);
      setSnoozeOpen(false);
    } finally {
      setPending(false);
    }
  }

  function renderDueLine() {
    if (isCompletedView && row.completed_at) {
      return (
        <div style={{ fontSize: 12, color: "#6B6A65" }}>
          Completed {formatDueDate(row.completed_at)}
        </div>
      );
    }

    if (row.due_at === null) {
      return <div style={{ fontSize: 12, color: "#6B6A65" }}>No due date</div>;
    }

    if (row.overdue && row.days_overdue !== null) {
      return (
        <div style={{ fontSize: 12, color: "#E8A020" }}>
          Overdue by {row.days_overdue} {dayLabel} · Due {formatDueDate(row.due_at)}
        </div>
      );
    }

    return (
      <div style={{ fontSize: 12, color: "#6B6A65" }}>
        Due {formatDueDate(row.due_at)}
      </div>
    );
  }

  const outlinedButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "8px 16px",
    minHeight: 32,
    backgroundColor: "transparent",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    color: "#E8E6DF",
    cursor: pending ? "default" : "pointer",
    fontFamily: "inherit",
    opacity: pending ? 0.6 : 1,
  } as const;

  return (
    <div
      className="elevation-card"
      style={{
        padding: "16px 20px",
        borderLeft: stripe ? `3px solid ${stripe}` : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: sourceConfig ? 8 : 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "#F2F0EA", lineHeight: 1.3 }}>
            {row.hcp.name}
          </div>
          {row.hcp.institution ? (
            <div style={{ fontSize: 12, color: "#9B9892", marginTop: 2 }}>
              {row.hcp.institution}
            </div>
          ) : null}
        </div>
        {row.priority !== "normal" ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: priorityColor(row.priority),
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flexShrink: 0,
              padding: "3px 8px",
              borderRadius: 3,
              border: `1px solid ${priorityColor(row.priority)}33`,
            }}
          >
            {priorityLabel(row.priority)}
          </span>
        ) : null}
      </div>

      {sourceConfig ? (
        <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              backgroundColor: sourceConfig.bg,
              color: sourceConfig.color,
              padding: "3px 8px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {sourceConfig.icon ? (
              <span style={{ fontSize: 11, lineHeight: 1 }}>{sourceConfig.icon}</span>
            ) : null}
            {sourceConfig.label}
          </span>
          <span style={{ fontSize: 10, color: "#6B6A65" }}>
            Generated {formatRelative(row.created_at)}
          </span>
        </div>
      ) : null}

      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "#C8C5BE",
          margin: "0 0 10px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {row.body}
      </p>

      <div style={{ marginBottom: 14 }}>
        {renderDueLine()}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        {!isCompletedView ? (
          <>
            <button
              type="button"
              className="fm-pill-button"
              onClick={() => void handleComplete()}
              disabled={pending}
              style={{
                padding: "8px 16px",
                minHeight: 32,
                backgroundColor: "#3FB8AF",
                color: "#0A0A0B",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: pending ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: pending ? 0.6 : 1,
              }}
            >
              Complete
            </button>
            <button
              type="button"
              className="fm-pill-button"
              onClick={() => setSnoozeOpen((v) => !v)}
              disabled={pending}
              style={outlinedButtonStyle}
            >
              Snooze
              <span style={{ fontSize: 10, lineHeight: 1 }}>{snoozeOpen ? "▲" : "▼"}</span>
            </button>
          </>
        ) : null}

        <button
          type="button"
          className="fm-pill-button"
          onClick={() => onViewHcp(row.hcp.hcp_id)}
          disabled={pending}
          style={{
            backgroundColor: "transparent",
            color: "#9B9892",
            border: "1px solid #2A2A30",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            cursor: pending ? "default" : "pointer",
            fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
            opacity: pending ? 0.6 : 1,
          }}
        >
          View HCP
        </button>

        {row.created_from === "brief" ? (
          <button
            type="button"
            className="fm-pill-button"
            onClick={() => onGenerateBrief(row.hcp.hcp_id)}
            disabled={pending}
            style={{
              backgroundColor: "transparent",
              color: "#9B6DFF",
              border: "1px solid #9B6DFF",
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: pending ? "default" : "pointer",
              fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
            }}
          >
            View Source Brief
          </button>
        ) : bucket === "overdue" ? (
          <button
            type="button"
            className="fm-pill-button"
            onClick={() => onGenerateBrief(row.hcp.hcp_id)}
            disabled={pending}
            style={{
              backgroundColor: "transparent",
              color: "#E8A020",
              border: "1px solid #E8A020",
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: pending ? "default" : "pointer",
              fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
            }}
          >
            Generate Brief
          </button>
        ) : null}
      </div>

      {snoozeOpen && !isCompletedView ? (
        <SnoozePicker
          onSnooze={(iso) => void handleSnooze(iso)}
          onCancel={() => setSnoozeOpen(false)}
        />
      ) : null}
    </div>
  );
}
