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
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #1E1E22",
        borderRadius: 6,
        backgroundColor: COLOR.ground,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: COLOR.ink1,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 10, color: COLOR.ink4, marginTop: 4 }}>{subtitle}</div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
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
              padding: "8px 10px",
              margin: 0,
              border: "none",
              borderRadius: 4,
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
