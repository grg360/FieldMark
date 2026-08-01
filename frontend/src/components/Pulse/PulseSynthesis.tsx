import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { FONT } from "../../lib/designTokens";
import { PULSE_COLORS } from "../../lib/pulse";
import { getPulseSynthesis } from "../../lib/pulseSynthesis";

// TA-level narrative that opens /pulse/:ta, above the theme list.
//
// This is an EDITORIAL window summary written from the payload facts — it is NOT
// AI-generated — so it carries NO AI-synthesis marker: no ✦ sparkle, no "AI
// Synthesis" chip, no "synthesized from…" line. The ✦ convention is reserved for
// genuinely generated content (build brief), and the prototype's live AI path is
// frozen (see pulseSynthesis.ts). When a real generation is captured from the
// generate-pulse-synthesis Edge Function, restore the AI marker together with it
// — do not put the marker back over hand-authored text.

interface PulseSynthesisProps {
  taSlug: string;
  windowStart: string;
  windowEnd: string;
}

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  marginBottom: 12,
};

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
      <div style={eyebrowStyle}>Window summary</div>

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

      {/* Honest provenance — an editorial summary of the window's data, not a
          model generation. */}
      <div
        style={{
          fontFamily: FONT.sans,
          fontSize: 11,
          color: PULSE_COLORS.mutedDim,
          marginTop: 14,
        }}
      >
        Editorial summary of the current window&rsquo;s publication data.
      </div>
    </section>
  );
}
