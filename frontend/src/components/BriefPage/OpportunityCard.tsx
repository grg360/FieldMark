import type { CSSProperties } from "react";
import type { Opportunity } from "../../lib/briefs";

interface Props {
  opportunity: Opportunity;
  index: number;
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
        position: "relative",
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 6,
        padding: 16,
        marginBottom: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
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
        }}
      >
        {index + 1}
      </div>

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: "#E8E6DF",
          margin: "0 0 16px 32px",
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
