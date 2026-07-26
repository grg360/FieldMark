import type { CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { PULSE_BY_TA } from "../../lib/pulseFixture";
import { PULSE_COLORS } from "../../lib/pulse";
import { COLOR, FONT } from "../../lib/designTokens";
import AppLayout from "../AppLayout";
import PulseHeader from "./PulseHeader";
import PulseCaveats from "./PulseCaveats";
import ConsensusSnapshot from "./ConsensusSnapshot";
import ThemeList from "./ThemeList";

// Scientific Pulse — prototype page. Components 1–3 of the build brief
// (Header + Confidence, Consensus Snapshot, Theme list). Events (4) and the
// Composition ratio treatment (5) are intentionally not built yet.
//
// Chrome (TopBar + GlobalFooter + warm ground) comes from AppLayout. TA-scoped:
// /pulse/:ta selects the payload from PULSE_BY_TA by indication slug. Bare
// /pulse keeps its original behavior (NSCLC). A TA with no payload gets an
// honest empty state, never a broken page.

const columnStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  fontFamily: FONT.sans,
  color: PULSE_COLORS.text,
};

export default function PulsePage() {
  const params = useParams();
  const taSlug = (params.ta ?? "nsclc").toLowerCase();
  const pulse = PULSE_BY_TA[taSlug];

  if (!pulse) {
    return (
      <AppLayout maxWidth={760}>
        <div
          style={{
            ...columnStyle,
            alignItems: "center",
            paddingTop: 64,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, color: COLOR.ink1 }}>
            No Scientific Pulse for this therapeutic area yet.
          </div>
          <p style={{ fontSize: 13, color: COLOR.ink3, lineHeight: 1.6, margin: 0, maxWidth: 440 }}>
            Pulse is built per therapeutic area from its publication corpus. This TA
            hasn&rsquo;t had a Pulse cycle run yet &mdash; it will appear here when the
            first cycle completes.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout maxWidth={760}>
      <div style={columnStyle}>
        <PulseHeader therapeuticArea={pulse.therapeutic_area} window={pulse.window} />
        {/* Caveats surfaced up front — the movement-reliability warning must be seen
            before the reader interprets the theme-list movement figures. */}
        <PulseCaveats caveats={pulse.caveats} />
        <ConsensusSnapshot themes={pulse.themes} />
        <ThemeList themes={pulse.themes} />
      </div>
    </AppLayout>
  );
}
