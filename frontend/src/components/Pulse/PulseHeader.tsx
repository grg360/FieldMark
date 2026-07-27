import type { CSSProperties } from "react";
import {
  PULSE_COLORS,
  formatMonthLabel,
  formatMonthRange,
  priorMonthIso,
} from "../../lib/pulse";
import type { PulseWindow } from "../../lib/pulse";

// Page header — TA name + the window line only. The evidence-stream confidence
// disclosure moved OUT of the header to its own compact component (PulseConfidence)
// that now sits low on the page: content leads, infrastructure follows.

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

export default function PulseHeader({ therapeuticArea, window }: PulseHeaderProps) {
  return (
    <header>
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
    </header>
  );
}
