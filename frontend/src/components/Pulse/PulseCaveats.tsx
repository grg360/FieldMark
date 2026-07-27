import { useState } from "react";
import type { CSSProperties } from "react";
import { PULSE_COLORS } from "../../lib/pulse";

// Data-quality caveats — surfaced VERBATIM and never removed, but no longer
// leading the page. Collapsed by default behind a small "Data caveats"
// disclosure; expanding shows every caveat word-for-word. The
// movement-reliability caveat stays the load-bearing one — the current window
// mixes a backfill-recovery month with a deflated prior month, so the theme
// list's movement figures are not yet trustworthy — and keeps its prominent
// amber-ruled callout WITHIN the expanded panel. Matched by CONTENT (not array
// index) so it stays prominent regardless of ordering, and nothing breaks if
// it is absent.

interface PulseCaveatsProps {
  caveats: string[];
}

const MOVEMENT_RE = /movement figures are not reliable/i;

const summaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  textAlign: "left",
};

export default function PulseCaveats({ caveats }: PulseCaveatsProps) {
  const [open, setOpen] = useState(false);
  if (!caveats || caveats.length === 0) return null;

  const movement = caveats.find((c) => MOVEMENT_RE.test(c));
  const rest = caveats.filter((c) => c !== movement);

  return (
    <section
      style={{
        backgroundColor: PULSE_COLORS.card,
        borderRadius: 6,
        padding: "14px 16px",
      }}
    >
      {/* Plain eyebrow header — reads as a section like THEMES / LOWER VOLUME
          (no disclosure marker, no count); still toggles the caveats on click. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={summaryStyle}
      >
        Data caveats
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {movement && (
            <div
              style={{
                borderLeft: `2px solid ${PULSE_COLORS.amber}`,
                padding: "2px 0 2px 14px",
                marginBottom: rest.length > 0 ? 16 : 0,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: PULSE_COLORS.amber,
                  marginBottom: 5,
                }}
              >
                Movement reliability
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: PULSE_COLORS.text }}>
                {movement}
              </p>
            </div>
          )}

          {rest.length > 0 && (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {rest.map((caveat, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 9,
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: PULSE_COLORS.muted,
                  }}
                >
                  <span aria-hidden style={{ color: PULSE_COLORS.indigo, flexShrink: 0 }}>
                    ·
                  </span>
                  <span>{caveat}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
