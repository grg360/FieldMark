import type { CSSProperties } from "react";
import {
  PULSE_COLORS,
  countProportion,
  formatInt,
  formatShare,
  isThemeGated,
  primaryThemeTotal,
  themesRankedByCurrent,
} from "../../lib/pulse";
import type { PulseTheme } from "../../lib/pulse";

interface ConsensusSnapshotProps {
  themes: PulseTheme[];
}

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  marginBottom: 4,
};

export default function ConsensusSnapshot({ themes }: ConsensusSnapshotProps) {
  const ranked = themesRankedByCurrent(themes);
  const total = primaryThemeTotal(themes);

  return (
    <section
      style={{
        backgroundColor: PULSE_COLORS.card,
        borderRadius: 6,
        padding: "16px 16px 18px",
      }}
    >
      <div style={sectionHeaderStyle}>Consensus Snapshot</div>
      {/* Denominator stated plainly: this is share of PRIMARY-THEME publications
          in the window, not all publications. */}
      <div style={{ fontSize: 11.5, color: PULSE_COLORS.mutedDim, marginBottom: 16 }}>
        Share of {formatInt(total)} primary-theme publications in this window
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {ranked.map((theme) => {
          const gated = isThemeGated(theme);
          const proportion = countProportion(theme, total);
          const widthPct = `${(proportion * 100).toFixed(2)}%`;
          return (
            <div key={theme.name}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  marginBottom: 5,
                }}
              >
                <span style={{ fontSize: 13, color: PULSE_COLORS.text }}>{theme.name}</span>
                <span
                  style={{
                    fontSize: 12.5,
                    color: PULSE_COLORS.muted,
                    fontFeatureSettings: '"tnum"',
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: PULSE_COLORS.text }}>{formatInt(theme.cur_pubs)}</span>
                  {/* Rule 1: no percentage for a theme below the gate. */}
                  {!gated && (
                    <span style={{ marginLeft: 6 }}>{formatShare(theme.cur_share)}</span>
                  )}
                </span>
              </div>
              {/* Bar proportion comes from COUNTS, so it is honest even below the
                  gate (where the share number must not appear). A minimum pixel
                  width keeps a small-but-real theme visible rather than hidden. */}
              <div
                style={{
                  height: 6,
                  backgroundColor: PULSE_COLORS.line,
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: widthPct,
                    minWidth: theme.cur_pubs > 0 ? 3 : 0,
                    backgroundColor: PULSE_COLORS.indigo,
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
