import type { CSSProperties } from "react";
import type { Opportunity, Priority } from "../../lib/briefs";

interface Props {
  opportunity: Opportunity;
  index: number;
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

export default function OpportunityCard({ opportunity, index }: Props) {
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
    </div>
  );
}
