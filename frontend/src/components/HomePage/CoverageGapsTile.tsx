import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../lib/authHelpers";
import { getHcpOverview } from "../../lib/aiOverviews";
import { getTrackedHcpsInTerritory, type CoverageGapHcp, type TerritoryCoverageStats, type TrackedHcpChip } from "../../lib/home";
import { useIsDesktop } from "../../lib/useIsDesktop";
import HomeTile from "./HomeTile";

interface Props {
  gaps: CoverageGapHcp[];
  stats: TerritoryCoverageStats | null;
  onTrack: (hcpId: string) => Promise<void>;
  refreshTrigger?: number;
}

export default function CoverageGapsTile({ gaps, stats, onTrack, refreshTrigger = 0 }: Props) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop(600);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [errorByHcp, setErrorByHcp] = useState<Record<string, string>>({});
  const [overviewsByHcpId, setOverviewsByHcpId] = useState<Record<string, { body: string; loading: boolean; error: boolean }>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [trackedChips, setTrackedChips] = useState<TrackedHcpChip[]>([]);
  const [trackedLoading, setTrackedLoading] = useState(false);

  useEffect(() => {
    void getCurrentUser().then((user) => setUserId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    setTrackedLoading(true);
    getTrackedHcpsInTerritory(userId)
      .then((chips) => setTrackedChips(chips))
      .catch((err) => console.warn("CoverageGapsTile: tracked chips error", err))
      .finally(() => setTrackedLoading(false));
  }, [userId, refreshTrigger]);

  useEffect(() => {
    if (!gaps || gaps.length === 0) return;

    setOverviewsByHcpId((prev) => {
      const next = { ...prev };
      for (const gap of gaps) {
        if (!next[gap.hcp_id]) {
          next[gap.hcp_id] = { body: "", loading: true, error: false };
        }
      }
      return next;
    });

    for (const gap of gaps) {
      getHcpOverview(gap.hcp_id, "NSCLC")
        .then((overview) => {
          setOverviewsByHcpId((prev) => ({
            ...prev,
            [gap.hcp_id]: overview
              ? { body: overview.body, loading: false, error: false }
              : { body: "", loading: false, error: true },
          }));
        })
        .catch((err) => {
          console.warn("CoverageGapsTile: overview fetch error", err);
          setOverviewsByHcpId((prev) => ({
            ...prev,
            [gap.hcp_id]: { body: "", loading: false, error: true },
          }));
        });
    }
  }, [gaps]);

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
    <HomeTile>
      <style>{`@keyframes fmShimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`}</style>
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
          {trackedChips.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#6B6A65",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Tracking ({trackedChips.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {trackedChips.map((chip) => {
                  const cohortColor = chip.cohort === "rising_star" ? "#9B6DFF"
                    : chip.cohort === "established" ? "#E8A020"
                    : chip.cohort === "community" ? "#4A90E2"
                    : "#6B6A65";
                  const cohortBg = chip.cohort === "rising_star" ? "rgba(155,109,255,0.15)"
                    : chip.cohort === "established" ? "rgba(232,160,32,0.15)"
                    : chip.cohort === "community" ? "rgba(74,144,226,0.15)"
                    : "rgba(107,106,101,0.15)";
                  return (
                    <button
                      key={chip.hcp_id}
                      type="button"
                      onClick={() => navigate(`/hcp/${chip.hcp_id}`)}
                      className="fm-pill-button"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 8px",
                        backgroundColor: cohortBg,
                        color: cohortColor,
                        border: `1px solid ${cohortColor}`,
                        borderRadius: 3,
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        whiteSpace: "nowrap",
                        transition: "opacity 120ms",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                      <span>{chip.name}</span>
                      {chip.cohort_rank !== null ? (
                        <span style={{ fontSize: 10, opacity: 0.85 }}>#{chip.cohort_rank}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

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
                    flexDirection: isDesktop ? "row" : "column",
                    alignItems: isDesktop ? "center" : "stretch",
                    justifyContent: isDesktop ? "space-between" : "flex-start",
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

                    {(() => {
                      const overview = overviewsByHcpId[gap.hcp_id];
                      if (!overview) return null;

                      if (overview.loading) {
                        return (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 11, lineHeight: 1, color: "#9B6DFF" }}>{String.fromCodePoint(0x2728)}</span>
                              <span style={{ fontSize: 10, color: "#9B6DFF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                AI Synthesis
                              </span>
                            </div>
                            <div style={{ height: 12, background: "linear-gradient(90deg, #1E1E22 0%, #2A2A30 50%, #1E1E22 100%)", borderRadius: 3, width: "85%", animation: "fmShimmer 1.5s infinite" }} />
                            <div style={{ height: 12, background: "linear-gradient(90deg, #1E1E22 0%, #2A2A30 50%, #1E1E22 100%)", borderRadius: 3, width: "70%", animation: "fmShimmer 1.5s infinite" }} />
                          </div>
                        );
                      }

                      if (overview.error || !overview.body) return null;

                      return (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                backgroundColor: "rgba(155,109,255,0.18)",
                                color: "#9B6DFF",
                                padding: "3px 8px",
                                borderRadius: 3,
                                fontSize: 10,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              <span style={{ fontSize: 11, lineHeight: 1 }}>{String.fromCodePoint(0x2728)}</span>
                              AI Synthesis
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#9B9892",
                              lineHeight: 1.5,
                            }}
                          >
                            {overview.body}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexShrink: 0,
                      ...(isDesktop ? {} : { marginTop: 12, alignSelf: "flex-end" }),
                    }}
                  >
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
    </HomeTile>
  );
}
