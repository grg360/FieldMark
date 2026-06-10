import { useNavigate } from "react-router-dom";
import type { CoverageGapHcp, TerritoryCoverageStats } from "../../lib/home";

interface Props {
  gaps: CoverageGapHcp[];
  stats: TerritoryCoverageStats | null;
}

const tileStyle = {
  backgroundColor: "#0D0D10",
  border: "1px solid #1E1E22",
  borderRadius: 6,
  padding: 20,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

export default function CoverageGapsTile({ gaps, stats }: Props) {
  const navigate = useNavigate();

  const hasStats = stats && stats.total_rising_stars_in_territory > 0;

  return (
    <div style={tileStyle}>
      <div
        style={{
          fontSize: 11,
          color: "#6B6A65",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        Territory Opportunities
      </div>

      {hasStats ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "#E8E6DF", lineHeight: 1.5 }}>
            You&apos;re tracking <span style={{ fontWeight: 600 }}>{stats.tracked_count}</span> of{" "}
            <span style={{ fontWeight: 600 }}>{stats.total_rising_stars_in_territory}</span> Rising Stars{" "}
            <span style={{ color: "#6B6A65" }}>{String.fromCharCode(0x00B7)}</span>{" "}
            <span style={{ color: "#9B6DFF", fontWeight: 600 }}>{stats.coverage_percentage}% coverage</span>
          </div>
          {stats.territory_label ? (
            <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 4 }}>
              {stats.territory_label}
            </div>
          ) : null}
        </div>
      ) : null}

      {gaps.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5 }}>
          {hasStats
            ? "You're tracking every Rising Star in your territory. Outstanding."
            : "No territory data yet."}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 10,
              color: "#6B6A65",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Not yet tracking:
          </div>

          <div>
            {gaps.map((gap, index) => (
              <div
                key={gap.hcp_id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/hcp/${gap.hcp_id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/hcp/${gap.hcp_id}`);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: index < gaps.length - 1 ? "1px solid #1E1E22" : "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#E8E6DF",
                      marginBottom: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {gap.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9B9892",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {gap.institution ?? "Unknown institution"}
                    {gap.state ? (
                      <>
                        <span style={{ color: "#6B6A65" }}> {String.fromCharCode(0x00B7)} </span>
                        {gap.state}
                      </>
                    ) : null}
                  </div>
                </div>

                <span
                  style={{
                    backgroundColor: "rgba(155,109,255,0.18)",
                    color: "#9B6DFF",
                    border: "1px solid #9B6DFF",
                    padding: "3px 8px",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    flexShrink: 0,
                  }}
                >
                  #{gap.us_rank}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
