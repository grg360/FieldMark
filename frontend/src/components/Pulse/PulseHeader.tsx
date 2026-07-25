import type { CSSProperties } from "react";
import {
  PULSE_COLORS,
  formatMonthLabel,
  formatMonthRange,
  priorMonthIso,
} from "../../lib/pulse";
import type { PulseWindow } from "../../lib/pulse";

// Evidence-stream coverage. Deliberately DISCLOSED, not hidden: the greyed
// "not connected" rows tell an institutionally-skeptical audience exactly what
// this view does and does not yet see. Do not remove the inactive rows.
type StreamState = "active" | "not connected";
const EVIDENCE_STREAMS: ReadonlyArray<{ label: string; state: StreamState }> = [
  { label: "Publications", state: "active" },
  { label: "Clinical trials", state: "active" },
  { label: "Congress", state: "not connected" },
  { label: "Guidelines", state: "active" },
  { label: "Community", state: "not connected" },
];

const ACTIVE_DOT = "#6FA67F"; // muted sage — reads calm on the dark UI

interface PulseHeaderProps {
  therapeuticArea: string;
  window: PulseWindow;
}

const wordmarkStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.18em",
  color: PULSE_COLORS.amber,
  textTransform: "uppercase",
};

const taNameStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
  color: PULSE_COLORS.text,
  margin: "8px 0 0",
};

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  marginBottom: 10,
};

export default function PulseHeader({ therapeuticArea, window }: PulseHeaderProps) {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={wordmarkStyle}>Scientific Pulse</div>
        <h1 style={taNameStyle}>{therapeuticArea}</h1>

        {/* Rule 3: always show the window. Month grain — the current calendar month is
            deliberately excluded because publication indexing lags, so the newest shown
            month is the last COMPLETE one. */}
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 13, color: PULSE_COLORS.text, fontFeatureSettings: '"tnum"' }}>
            Updated through{" "}
            <span style={{ color: PULSE_COLORS.amber, fontWeight: 600 }}>
              {formatMonthLabel(priorMonthIso(window.current_end))}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: PULSE_COLORS.mutedDim }}>
            {window.window_months} complete calendar months (
            {formatMonthRange(window.current_start, window.current_end)}) vs the prior{" "}
            {window.window_months} · current month excluded as incomplete
          </div>
        </div>
      </div>

      {/* Confidence / coverage disclosure */}
      <div
        style={{
          backgroundColor: PULSE_COLORS.card,
          borderRadius: 6,
          padding: "14px 16px",
        }}
      >
        <div style={sectionHeaderStyle}>Confidence</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {EVIDENCE_STREAMS.map((stream) => {
            const active = stream.state === "active";
            return (
              <div
                key={stream.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 0",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: active ? PULSE_COLORS.text : PULSE_COLORS.mutedDim,
                  }}
                >
                  {stream.label}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    color: active ? PULSE_COLORS.muted : PULSE_COLORS.mutedDim,
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
                    }}
                  />
                  {stream.state}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}
