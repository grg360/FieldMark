import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { CoverageGapHcp, TerritoryCoverageStats } from "../../lib/home";

interface Props {
  gaps: CoverageGapHcp[];
  stats: TerritoryCoverageStats | null;
  onTrack: (hcpId: string) => Promise<void>;
}

const tileStyle = {
  backgroundColor: "#0D0D10",
  border: "1px solid #1E1E22",
  borderRadius: 6,
  padding: 20,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

export default function CoverageGapsTile({ gaps, stats, onTrack }: Props) {
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [errorByHcp, setErrorByHcp] = useState<Record<string, string>>({});

  const hasStats = stats && stats.total_rising_stars_in_territory > 0;

  async function handleTrack(hcpId: string, event: MouseEvent) {
    event.stopPropagation();
    if (trackingId || trackedIds.has(hcpId)) return;

    setTrackingId(hcpId);
    setErrorByHcp((prev) => {
      const next = { ...prev };
      delete next[hcpId];
      return next;
    });

    try {
      await onTrack(hcpId);
      setTrackedIds((prev) => {
        const next = new Set(prev);
        next.add(hcpId);
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Track failed";
      setErrorByHcp((prev) => ({ ...prev, [hcpId]: message }));
    } finally {
      setTrackingId(null);
    }
  }

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

      {hasStats ? (() => {
        const opportunitiesRemaining = stats.total_rising_stars_in_territory - stats.tracked_count;
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#E8E6DF", lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600 }}>{stats.tracked_count}</span> of{" "}
              <span style={{ fontWeight: 600 }}>{stats.total_rising_stars_in_territory}</span> Rising Stars tracked
            </div>
            <div style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5, marginTop: 2 }}>
              {opportunitiesRemaining} {opportunitiesRemaining === 1 ? "opportunity" : "opportunities"} remaining
            </div>
            <div style={{ fontSize: 11, color: "#9B6DFF", fontWeight: 600, marginTop: 6 }}>
              Coverage: {stats.coverage_percentage}%
            </div>
            {stats.territory_label ? (
              <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 4 }}>
                {stats.territory_label}
              </div>
            ) : null}
          </div>
        );
      })() : null}

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
                style={{
                  borderBottom: index < gaps.length - 1 ? "1px solid #1E1E22" : "none",
                }}
              >
                <div
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

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
                      }}
                    >
                      #{gap.us_rank}
                    </span>

                    {trackedIds.has(gap.hcp_id) ? (
                      <span style={{ fontSize: 11, color: "#3FB8AF", fontWeight: 600, padding: "3px 8px" }}>
                        {String.fromCharCode(0x2713)} Tracked
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="fm-pill-button"
                        onClick={(e) => void handleTrack(gap.hcp_id, e)}
                        disabled={trackingId === gap.hcp_id}
                        style={{
                          backgroundColor: "#9B6DFF",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: 3,
                          padding: "3px 8px",
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          lineHeight: 1.2,
                          cursor: trackingId === gap.hcp_id ? "default" : "pointer",
                          fontFamily: "system-ui, -apple-system, sans-serif",
                          opacity: trackingId === gap.hcp_id ? 0.6 : 1,
                        }}
                      >
                        {trackingId === gap.hcp_id ? "..." : "+ Track"}
                      </button>
                    )}
                  </div>
                </div>

                {errorByHcp[gap.hcp_id] ? (
                  <div style={{ fontSize: 11, color: "#E84545", paddingBottom: 8 }}>
                    {errorByHcp[gap.hcp_id]}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
