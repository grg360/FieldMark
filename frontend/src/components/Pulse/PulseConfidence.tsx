import type { CSSProperties } from "react";
import { PULSE_COLORS } from "../../lib/pulse";

// Evidence-source coverage — the confidence disclosure, a COMPACT single
// horizontal row of chips. Deliberately DISCLOSED, not hidden: the greyed
// "not connected" chips tell an institutionally-skeptical audience exactly what
// this view does and does not yet see. Do not remove the inactive chips. This is
// infrastructure, so it sits low on the page, after the content.
//
// One SOURCE per chip. Publications (PubMed) is the only connected source. Its
// clinical-trial and guideline signals are publication_type FACETS of that same
// corpus — not independent feeds — so they render nested under Publications
// rather than as peer streams. Showing "Publications / Clinical trials /
// Guidelines" as three peer chips implied a corroboration ACROSS sources that
// does not exist: all three are slices of one PubMed pull. Congress and
// Community are genuinely separate sources with no feed connected yet.
type StreamState = "active" | "not connected";
interface EvidenceStream {
  label: string;
  state: StreamState;
  /** publication_type facets of this source — subordinate slices, not peer sources. */
  facets?: readonly string[];
}
const EVIDENCE_STREAMS: ReadonlyArray<EvidenceStream> = [
  {
    label: "Publications",
    state: "active",
    facets: ["Clinical-trial reports", "Guidelines & consensus"],
  },
  { label: "Congress", state: "not connected" },
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

const chipStyle = (active: boolean): CSSProperties => ({
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
});

// Facet tags are visually subordinate to their source chip: smaller, no status
// dot, a leading connector, so they read as "part of Publications", not as their
// own evidence stream.
const facetStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: `1px dashed ${PULSE_COLORS.line}`,
  backgroundColor: "transparent",
  color: PULSE_COLORS.mutedDim,
  whiteSpace: "nowrap",
};

const noteStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.5,
  color: PULSE_COLORS.mutedDim,
  marginTop: 10,
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
        Confidence <span style={{ color: PULSE_COLORS.indigo }}>·</span> evidence sources
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {EVIDENCE_STREAMS.map((stream) => {
          const active = stream.state === "active";
          return (
            <span
              key={stream.label}
              style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}
            >
              <span title={stream.state} style={chipStyle(active)}>
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
              {active &&
                stream.facets?.map((facet) => (
                  <span key={facet} style={facetStyle}>
                    <span aria-hidden style={{ marginRight: 5, color: PULSE_COLORS.line }}>
                      ⌐
                    </span>
                    {facet}
                  </span>
                ))}
            </span>
          );
        })}
      </div>
      {/* State the relationship plainly: the two facets are not independent feeds. */}
      <div style={noteStyle}>
        Clinical-trial and guideline signals are publication-type facets of the Publications corpus
        (PubMed), not independent sources. Congress and Community are separate sources, not yet
        connected.
      </div>
    </section>
  );
}
