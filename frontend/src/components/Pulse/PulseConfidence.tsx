import type { CSSProperties } from "react";
import { PULSE_COLORS } from "../../lib/pulse";

// Evidence-stream coverage — the confidence disclosure, now a COMPACT single
// horizontal row of chips rather than a full-height panel. Deliberately
// DISCLOSED, not hidden: the greyed "not connected" chips tell an
// institutionally-skeptical audience exactly what this view does and does not
// yet see. Do not remove the inactive chips. This is infrastructure, so it sits
// low on the page, after the content.
type StreamState = "active" | "not connected";
const EVIDENCE_STREAMS: ReadonlyArray<{ label: string; state: StreamState }> = [
  { label: "Publications", state: "active" },
  { label: "Clinical trials", state: "active" },
  { label: "Congress", state: "not connected" },
  { label: "Guidelines", state: "active" },
  { label: "Community", state: "not connected" },
];

const ACTIVE_DOT = "#6FA67F"; // muted sage — reads calm on the dark UI

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  marginBottom: 10,
};

export default function PulseConfidence() {
  return (
    <section
      style={{
        backgroundColor: PULSE_COLORS.card,
        borderRadius: 6,
        padding: "14px 16px",
      }}
    >
      <div style={eyebrowStyle}>
        Confidence <span style={{ color: PULSE_COLORS.indigo }}>·</span> evidence streams
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {EVIDENCE_STREAMS.map((stream) => {
          const active = stream.state === "active";
          return (
            <span
              key={stream.label}
              title={stream.state}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 999,
                border: `1px solid ${PULSE_COLORS.line}`,
                backgroundColor: active ? PULSE_COLORS.cardAlt : "transparent",
                color: active ? PULSE_COLORS.text : PULSE_COLORS.mutedDim,
                whiteSpace: "nowrap",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: active ? ACTIVE_DOT : "transparent",
                  border: active ? "none" : `1px solid ${PULSE_COLORS.mutedDim}`,
                  flexShrink: 0,
                }}
              />
              {stream.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}
