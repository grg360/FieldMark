import type { CSSProperties } from "react";
import { PULSE_COLORS, formatWindowDate } from "../../lib/pulse";
import type { PulseEvent, PulseEventType } from "../../lib/pulse";

// Notable publication events in the current window — practice guidelines,
// consensus statements, and retractions. These are discrete, high-signal
// documents worth surfacing on their own, distinct from the theme volume trend.

interface PulseEventsProps {
  events: PulseEvent[];
}

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  marginBottom: 4,
};

const TYPE_LABEL: Record<PulseEventType, string> = {
  guideline: "Guideline",
  consensus: "Consensus",
  retraction: "Retraction",
};

// Retractions are the one event type that flips a finding rather than adding
// one, so they get the cautionary tint; the rest read calm.
const TYPE_COLOR: Record<PulseEventType, string> = {
  guideline: "#6FA67F",
  consensus: "#6FA67F",
  retraction: "#B5836A",
};

export default function PulseEvents({ events }: PulseEventsProps) {
  if (!events || events.length === 0) return null;

  return (
    <section
      style={{
        backgroundColor: PULSE_COLORS.card,
        borderRadius: 6,
        padding: "16px 16px 6px",
      }}
    >
      <div style={sectionHeaderStyle}>Events</div>
      <div style={{ fontSize: 11.5, color: PULSE_COLORS.mutedDim, marginBottom: 12 }}>
        Guidelines, consensus statements, and retractions in this window
      </div>

      <div>
        {events.map((event, i) => (
          <div
            key={`${event.date}-${i}`}
            style={{
              display: "flex",
              gap: 12,
              padding: "11px 0",
              borderBottom: `1px solid ${PULSE_COLORS.line}`,
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: TYPE_COLOR[event.type],
                border: `1px solid ${TYPE_COLOR[event.type]}`,
                borderRadius: 3,
                padding: "2px 6px",
                whiteSpace: "nowrap",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {TYPE_LABEL[event.type]}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: PULSE_COLORS.text, lineHeight: 1.5 }}>
                {event.title}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: PULSE_COLORS.mutedDim,
                  marginTop: 3,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0 8px",
                }}
              >
                <span style={{ color: PULSE_COLORS.muted }}>{event.theme}</span>
                <span aria-hidden>·</span>
                <span>{event.journal}</span>
                <span aria-hidden>·</span>
                <span style={{ fontFeatureSettings: '"tnum"' }}>{formatWindowDate(event.date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
