import { useState } from "react";
import InviteModal from "./InviteModal";
import { COLOR, TYPE } from "../../lib/designTokens";
import HomeTile from "./HomeTile";

interface Props {
  userId: string;
}

export default function TeamIntelligenceTile({ userId }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <HomeTile>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={TYPE.eyebrow}>
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

        <p style={{ fontSize: 13, color: COLOR.ink1, lineHeight: 1.5, margin: "0 0 12px 0" }}>
          No colleagues connected yet.
        </p>
        <p style={{ fontSize: 13, color: COLOR.ink3, lineHeight: 1.5, margin: "0 0 8px 0" }}>
          Invite teammates to unlock:
        </p>
        <ul style={{ fontSize: 13, color: COLOR.ink3, lineHeight: 1.6, margin: "0 0 16px 0", paddingLeft: 20 }}>
          <li>Shared field insights</li>
          <li>Territory coverage visibility</li>
          <li>Cross-account briefing</li>
        </ul>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 13,
            color: COLOR.ink4,
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
      </HomeTile>

      {showModal ? (
        <InviteModal userId={userId} onClose={() => setShowModal(false)} />
      ) : null}
    </>
  );
}
