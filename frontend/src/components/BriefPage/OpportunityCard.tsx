import { useState, type CSSProperties } from "react";
import { createNextAction, type Priority as FollowUpPriority } from "../../lib/relationships";
import type { Opportunity, Priority } from "../../lib/briefs";

interface Props {
  opportunity: Opportunity;
  index: number;
  hcpId: string;
  userId: string;
  isSaved: boolean;
  onSaved: () => void;
}

function dueDateFromPriority(priority: Priority): string {
  const now = new Date();
  const daysAhead = priority === "high" ? 7 : priority === "medium" ? 14 : 30;
  const due = new Date(now);
  due.setDate(due.getDate() + daysAhead);
  due.setUTCHours(12, 0, 0, 0);
  return due.toISOString();
}

function followUpPriorityFromOpportunity(priority: Priority): FollowUpPriority {
  switch (priority) {
    case "high":
      return "high";
    case "medium":
      return "normal";
    case "low":
      return "low";
  }
}

function formatDueDateShort(iso: string): string {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function priorityBorderColor(priority: Priority): string {
  switch (priority) {
    case "high":
      return "#E84545";
    case "medium":
      return "#E8A020";
    case "low":
      return "#6B6A65";
  }
}

function priorityLabel(priority: Priority): string {
  switch (priority) {
    case "high":
      return "HIGH PRIORITY";
    case "medium":
      return "MEDIUM PRIORITY";
    case "low":
      return "LOW PRIORITY";
  }
}

function priorityChipStyle(priority: Priority): CSSProperties {
  switch (priority) {
    case "high":
      return { backgroundColor: "rgba(232,69,69,0.18)", color: "#E84545", borderColor: "#E84545" };
    case "medium":
      return { backgroundColor: "rgba(232,160,32,0.18)", color: "#E8A020", borderColor: "#E8A020" };
    case "low":
      return { backgroundColor: "rgba(107,106,101,0.18)", color: "#9B9892", borderColor: "#3A3A3F" };
  }
}

function evidencePillStyle(type: string): CSSProperties {
  switch (type) {
    case "insight":
      return { backgroundColor: "#4A90E2", color: "#FFFFFF" };
    case "follow_up":
      return { backgroundColor: "#E8A020", color: "#0A0A0B" };
    case "publication":
      return { backgroundColor: "#3FB8AF", color: "#0A0A0B" };
    case "theme":
      return { backgroundColor: "#9B6DFF", color: "#FFFFFF" };
    case "collaborator":
      return { backgroundColor: "#5A9B7F", color: "#FFFFFF" };
    default:
      return { backgroundColor: "#1E1E22", color: "#9B9892" };
  }
}

export default function OpportunityCard({
  opportunity,
  index,
  hcpId,
  userId,
  isSaved,
  onSaved,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDueAt, setSavedDueAt] = useState<string | null>(null);

  async function handleSave() {
    if (pending || isSaved) return;
    setPending(true);
    setError(null);

    try {
      const dueAt = dueDateFromPriority(opportunity.priority);
      await createNextAction(userId, {
        hcpId,
        body: opportunity.recommendation,
        dueAt,
        priority: followUpPriorityFromOpportunity(opportunity.priority),
        createdFrom: "brief",
      });
      setSavedDueAt(dueAt);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderLeft: `3px solid ${priorityBorderColor(opportunity.priority)}`,
        borderRadius: 6,
        padding: 16,
        marginBottom: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
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

        <div
          style={{
            fontSize: 10,
            color: "#9B9892",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 500,
            flex: 1,
            minWidth: 0,
          }}
        >
          {opportunity.category}
        </div>

        <span
          style={{
            ...priorityChipStyle(opportunity.priority),
            padding: "2px 6px",
            borderRadius: 3,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.05em",
            border: "1px solid",
            flexShrink: 0,
          }}
        >
          {priorityLabel(opportunity.priority)}
        </span>
      </div>

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: "#E8E6DF",
          margin: "0 0 16px 0",
        }}
      >
        {opportunity.recommendation}
      </p>

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
        Based on:
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {opportunity.supporting_evidence.map((evidence, evidenceIndex) => (
          <span
            key={`${evidence.type}-${evidenceIndex}`}
            style={{
              ...evidencePillStyle(evidence.type),
              padding: "3px 8px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            {evidence.label}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
        {error ? (
          <span style={{ fontSize: 11, color: "#E84545" }}>
            {error}
          </span>
        ) : null}

        {isSaved ? (
          <span style={{ fontSize: 11, color: "#6B6A65", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#3FB8AF", fontSize: 12 }}>{String.fromCharCode(0x2713)}</span>
            Saved{savedDueAt ? ` · Due ${formatDueDateShort(savedDueAt)}` : ""}
          </span>
        ) : (
          <button
            type="button"
            className="fm-pill-button"
            onClick={() => void handleSave()}
            disabled={pending}
            aria-label="Save as Follow-Up"
            style={{
              backgroundColor: "#E8A020",
              color: "#0A0A0B",
              border: "none",
              borderRadius: 3,
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              lineHeight: 1.2,
              cursor: pending ? "default" : "pointer",
              fontFamily: "system-ui, -apple-system, sans-serif",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Saving..." : "Save as Follow-Up"}
          </button>
        )}
      </div>
    </div>
  );
}
