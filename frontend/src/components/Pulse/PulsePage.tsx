import type { CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { PULSE_BY_TA } from "../../lib/pulseFixture";
import { PULSE_COLORS } from "../../lib/pulse";
import PulseHeader from "./PulseHeader";
import PulseCaveats from "./PulseCaveats";
import ConsensusSnapshot from "./ConsensusSnapshot";
import ThemeList from "./ThemeList";

// Scientific Pulse — prototype page. Components 1–3 of the build brief
// (Header + Confidence, Consensus Snapshot, Theme list). Events (4) and the
// Composition ratio treatment (5) are intentionally not built yet.
//
// TA-scoped: /pulse/:ta selects the payload from PULSE_BY_TA by indication
// slug. Bare /pulse keeps its original behavior (NSCLC). A TA with no payload
// gets an honest empty state, never a broken page.

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
  const params = useParams();
  const taSlug = (params.ta ?? "nsclc").toLowerCase();
  const pulse = PULSE_BY_TA[taSlug];

  if (!pulse) {
    return (
      <div style={pageStyle}>
        <div style={{ ...columnStyle, alignItems: "center", paddingTop: 80, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: PULSE_COLORS.text }}>
            No Scientific Pulse for this therapeutic area yet.
          </div>
          <p style={{ fontSize: 13, color: PULSE_COLORS.muted, lineHeight: 1.6, margin: 0, maxWidth: 440 }}>
            Pulse is built per therapeutic area from its publication corpus. This TA
            hasn&rsquo;t had a Pulse cycle run yet &mdash; it will appear here when the
            first cycle completes.
          </p>
        </div>
      </div>
    );
  }

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
