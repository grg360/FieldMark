import { useEffect, useState } from "react";
import { FONT } from "../../lib/designTokens";
import { PULSE_COLORS } from "../../lib/pulse";
import { getPulseSynthesis } from "../../lib/pulseSynthesis";

// TA-level AI synthesis paragraph that opens /pulse/:ta, above the theme list.
// Marker follows the app's AI-synthesis convention (✨ + "AI Synthesis" chip in
// the indigo/purple accent — amber stays scarce); body is the serif prose role
// used by the other narrative blocks. Renders nothing until a body is available
// (cache read is fast), and nothing if there is none — never a bare marker.

interface PulseSynthesisProps {
  taSlug: string;
  windowStart: string;
  windowEnd: string;
}

const AI_ACCENT = "#9B6DFF";

export default function PulseSynthesis({ taSlug, windowStart, windowEnd }: PulseSynthesisProps) {
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    getPulseSynthesis(taSlug, windowStart, windowEnd).then((result) => {
      if (!cancelled && result?.body) setBody(result.body);
    });
    return () => {
      cancelled = true;
    };
  }, [taSlug, windowStart, windowEnd]);

  if (!body) return null;

  return (
    <section
      style={{
        backgroundColor: PULSE_COLORS.card,
        borderRadius: 6,
        padding: "18px 18px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            backgroundColor: "rgba(155,109,255,0.18)",
            color: AI_ACCENT,
            padding: "3px 8px",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontFamily: FONT.sans,
          }}
        >
          <span style={{ fontSize: 11, lineHeight: 1 }}>{String.fromCodePoint(0x2728)}</span>
          AI Synthesis
        </span>
      </div>

      <p
        style={{
          fontFamily: FONT.serif,
          fontSize: 15,
          color: "#BDB9B0",
          lineHeight: 1.72,
          margin: 0,
        }}
      >
        {body}
      </p>

      {/* Provenance — states plainly what it was synthesized from. */}
      <div
        style={{
          fontFamily: FONT.sans,
          fontSize: 11,
          color: PULSE_COLORS.mutedDim,
          marginTop: 14,
        }}
      >
        Synthesized from the current window&rsquo;s publication data.
      </div>
    </section>
  );
}
