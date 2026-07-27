import type { CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { PULSE_BY_TA } from "../../lib/pulseFixture";
import { PULSE_COLORS } from "../../lib/pulse";
import { COLOR, FONT } from "../../lib/designTokens";
import AppLayout from "../AppLayout";
import PulseHeader from "./PulseHeader";
import PulseCaveats from "./PulseCaveats";
import PulseEvents from "./PulseEvents";
import PulseConfidence from "./PulseConfidence";
import ThemeList from "./ThemeList";

// Scientific Pulse — prototype page. Content-first order: header, the merged
// theme list (ranked, with bars + sparklines + drill-down), events, then the
// infrastructure — a compact confidence row and the caveats, collapsed behind
// a disclosure. The AI synthesis paragraph and sub-themes are a separate pass.
//
// Chrome (TopBar + GlobalFooter + warm ground) comes from AppLayout. TA-scoped:
// /pulse/:ta selects the payload from PULSE_BY_TA by indication slug. Bare
// /pulse keeps its original behavior (NSCLC). A TA with no payload gets an
// honest empty state, never a broken page.

const columnStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  margin: "0 auto",
  // Breathing room so the "Scientific Pulse" wordmark doesn't butt against the
  // global header line.
  paddingTop: 24,
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
        {/* Content first: the merged, ranked theme list, then events. */}
        <ThemeList themes={pulse.themes} />
        <PulseEvents events={pulse.events} />
        {/* Infrastructure last: compact confidence row, then caveats collapsed
            behind a disclosure (verbatim, incl. the movement-reliability warning). */}
        <PulseConfidence />
        <PulseCaveats caveats={pulse.caveats} />
      </div>
    </AppLayout>
  );
}
