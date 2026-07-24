import type { CSSProperties } from "react";
import { NSCLC_PULSE } from "../../lib/pulseFixture";
import { PULSE_COLORS } from "../../lib/pulse";
import PulseHeader from "./PulseHeader";
import PulseCaveats from "./PulseCaveats";
import ConsensusSnapshot from "./ConsensusSnapshot";
import ThemeList from "./ThemeList";

// Scientific Pulse — prototype page. Components 1–3 of the build brief
// (Header + Confidence, Consensus Snapshot, Theme list). Events (4) and the
// Composition ratio treatment (5) are intentionally not built yet.

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: PULSE_COLORS.bg,
  color: PULSE_COLORS.text,
  fontFamily: "system-ui, -apple-system, sans-serif",
  display: "flex",
  justifyContent: "center",
  padding: "40px 20px 80px",
};

const columnStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

export default function PulsePage() {
  const pulse = NSCLC_PULSE;
  return (
    <div style={pageStyle}>
      <div style={columnStyle}>
        <PulseHeader therapeuticArea={pulse.therapeutic_area} window={pulse.window} />
        {/* Caveats surfaced up front — the movement-reliability warning must be seen
            before the reader interprets the theme-list movement figures. */}
        <PulseCaveats caveats={pulse.caveats} />
        <ConsensusSnapshot themes={pulse.themes} />
        <ThemeList themes={pulse.themes} />
      </div>
    </div>
  );
}
