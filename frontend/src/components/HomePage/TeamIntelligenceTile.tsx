import { useState } from "react";
import InviteModal from "./InviteModal";

interface Props {
  userId: string;
}

const tileStyle = {
  backgroundColor: "#0D0D10",
  border: "1px solid #1E1E22",
  borderRadius: 6,
  padding: 20,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

export default function TeamIntelligenceTile({ userId }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div style={tileStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#6B6A65",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 500,
            }}
          >
            Team Intelligence
          </div>
          <span
            style={{
              backgroundColor: "#9B6DFF",
              color: "#FFFFFF",
              padding: "2px 8px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Coming Soon
          </span>
        </div>

        <p style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5, margin: "0 0 12px 0" }}>
          FieldMark becomes more valuable when your team contributes intelligence.
        </p>
        <p style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5, margin: "0 0 16px 0" }}>
          Shared insights, follow-ups, and briefs from colleagues at your organization will appear here.
        </p>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 13,
            color: "#6B6A65",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Get notified
          <span>{String.fromCharCode(0x2192)}</span>
        </button>
      </div>

      {showModal ? (
        <InviteModal userId={userId} onClose={() => setShowModal(false)} />
      ) : null}
    </>
  );
}
