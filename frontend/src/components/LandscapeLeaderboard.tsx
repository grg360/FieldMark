import type { LeaderboardEntry } from "../lib/api";
import { COLOR } from "../lib/designTokens";

interface Props {
  title: string;
  subtitle?: string;
  entries: LeaderboardEntry[];
  onEntryClick: (hcpId: string) => void;
  valueLabel?: string;
  accentColor?: string;
  showRanks?: boolean;
}

export default function LandscapeLeaderboard({
  title,
  subtitle,
  entries,
  onEntryClick,
  accentColor = "#E8A020",
  showRanks = true,
}: Props) {
  // Uniform panel (frame 370428e2, reconciled 2026-08-09): ALL FOUR landscape
  // panels are the same kind of object — one ranked list each — so they share
  // ONE chrome: #161617 on a #232326 hairline, no rounding, no shadow, rows
  // separated by #1f1f22 top-borders. Grouping is a caption's job, not a box's.
  return (
    <div
      style={{
        padding: "18px 18px 22px",
        border: "1px solid #232326",
        backgroundColor: "#161617",
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 11,
          color: "#ece9e4",
          textTransform: "uppercase",
          letterSpacing: "0.13em",
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 11, color: "#6e6b66", marginTop: 4, paddingBottom: 8 }}>{subtitle}</div>
      ) : (
        <div style={{ paddingBottom: 8 }} />
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {entries.map((entry) => (
          <button
            key={entry.hcp_id}
            type="button"
            onClick={() => onEntryClick(entry.hcp_id)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
              padding: "9px 4px",
              margin: 0,
              border: "none",
              borderTop: "1px solid #1f1f22",
              backgroundColor: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, color: COLOR.ink1, fontWeight: 500 }}>
                {showRanks ? `${entry.rank}. ` : ""}
                {entry.name}
              </div>
              {entry.institution ? (
                <div
                  style={{
                    fontSize: 11,
                    color: COLOR.ink4,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.institution}
                </div>
              ) : null}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                fontFamily: "monospace",
                color: accentColor,
                flexShrink: 0,
                paddingTop: 1,
              }}
            >
              {entry.primary_label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
