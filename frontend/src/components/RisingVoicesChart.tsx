import { useEffect, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getRisingVoices, type RisingVoiceRow } from "../lib/api";

interface RisingVoicesChartProps {
  selectedTA: string;
}

type ChartPoint = {
  x: number;
  y: number;
  z: number;
  handle: string;
  displayName: string | null;
  followerCount: number;
  postCount: number;
  totalEngagement: number;
  engagementPerFollower: number;
  platform: string | null;
  hcpMatched: boolean;
};

function buildProfileUrl(p: ChartPoint): string {
  const platform = (p.platform || "twitter").toLowerCase();
  return platform === "bluesky"
    ? `https://bsky.app/profile/${p.handle}`
    : `https://twitter.com/${p.handle}`;
}

// Stationary detail panel — replaces the cursor-following tooltip. 181 points
// cluster tightly on the log-log scatter, so a floating card fired overlapping
// tooltips that flew with every cursor move. Same content, fixed position
// beneath the chart; updates on hover, locks on click. No jitter, no point
// displacement — position is data and stays truthful.
function DetailPanel({ point, pinned }: { point: ChartPoint | null; pinned: boolean }) {
  if (!point) {
    return (
      <div className="rv-detail-panel" style={{ borderTop: "1px solid #2A2A2E", marginTop: 12, paddingTop: 12, minHeight: 64, display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#6B6A65" }}>Hover a point for details — click to pin it here.</span>
      </div>
    );
  }
  const url = buildProfileUrl(point);
  const platformLabel = (point.platform || "twitter").toLowerCase() === "bluesky" ? "Bluesky" : "Twitter";
  return (
    <div className="rv-detail-panel" style={{ borderTop: "1px solid #2A2A2E", marginTop: 12, paddingTop: 12, minHeight: 64, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <div style={{ minWidth: 180 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#E8E6DF" }}>
          {point.displayName || point.handle}
          {pinned && <span style={{ fontSize: 9, color: "#E8A020", marginLeft: 8, letterSpacing: "0.08em" }}>PINNED</span>}
        </div>
        <div style={{ fontSize: 11, color: "#8A8884", fontFamily: "monospace", marginTop: 2 }}>@{point.handle}</div>
      </div>
      <div style={{ display: "flex", gap: 20, fontSize: 11, color: "#B8B4AC" }}>
        <div><div style={{ color: "#6B6A65", fontSize: 10 }}>FOLLOWERS</div>{point.followerCount.toLocaleString()}</div>
        <div><div style={{ color: "#6B6A65", fontSize: 10 }}>POSTS</div>{point.postCount}</div>
        <div><div style={{ color: "#6B6A65", fontSize: 10 }}>ENGAGEMENT</div>{point.totalEngagement.toLocaleString()}</div>
        <div><div style={{ color: "#6B6A65", fontSize: 10 }}>ENG/FOLLOWER</div>{(point.engagementPerFollower * 100).toFixed(2)}%</div>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ marginLeft: "auto", padding: "6px 10px", fontSize: 11, fontWeight: 500, color: "#E8A020", background: "transparent", border: "1px solid #E8A020", borderRadius: 3, textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
        View on {platformLabel} ↗
      </a>
    </div>
  );
}

function getDotColor(p: ChartPoint): string {
  if (p.followerCount < 5000 && p.engagementPerFollower > 0.05) return "#E8A020"; // amber: rising voice
  if (p.followerCount >= 5000 && p.engagementPerFollower > 0.02) return "#6BA3D8"; // blue: established with engagement
  return "#8AA0AC"; // brighter slate: other voices
}

export default function RisingVoicesChart({ selectedTA }: RisingVoicesChartProps) {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<ChartPoint | null>(null);
  // Last-hovered point stays displayed after the cursor leaves — a stationary
  // panel going blank on mouse-out would flicker just as badly as the tooltip.
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getRisingVoices(selectedTA).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(String(res.error.message || res.error));
        setLoading(false);
        return;
      }
      const rows = res.data || [];
      const mapped: ChartPoint[] = rows
        .filter((r) => r.engagement_per_follower != null && r.follower_count > 0)
        .map((r) => ({
          x: r.follower_count,
          y: Number(r.engagement_per_follower),
          z: r.total_engagement,
          handle: r.handle,
          displayName: r.display_name,
          followerCount: r.follower_count,
          postCount: r.post_count,
          totalEngagement: r.total_engagement,
          engagementPerFollower: Number(r.engagement_per_follower),
          platform: r.platform,
          hcpMatched: r.hcp_matched,
        }));
      setPoints(mapped);
      setHoveredPoint(null);
      setPinnedPoint(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedTA]);

  useEffect(() => {
    if (pinnedPoint === null) return;
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Don't unpin if clicking the tooltip itself or its children
      const panelEl = target.closest(".rv-detail-panel");
      if (panelEl) return;
      // Don't unpin if clicking a chart dot (that triggers a new pin)
      const dotEl = target.closest(".recharts-symbols");
      if (dotEl) return;
      setPinnedPoint(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [pinnedPoint]);

  return (
    <div
      style={{
        backgroundColor: "#111113",
        border: "1px solid #2A2A2E",
        borderRadius: 4,
        margin: "0 16px 16px",
        padding: "16px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#E8A020",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Rising Voices — Last 90 days
        </span>
        <span style={{ fontSize: 10, color: "#6B6A65" }}>
          {loading ? "loading…" : `${points.length} voices`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#8A8884", marginBottom: 12, lineHeight: 1.4 }}>
        Engagement-per-follower vs. follower count, individuals with ≥10 posts in the window. Upper-left = small audience, high engagement. Hover a dot for details below; click to pin.
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, color: "#8A8884", fontFamily: "system-ui, sans-serif", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: "#E8A020",
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span>Rising voice</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: "#6BA3D8",
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span>Established with engagement</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: "#8AA0AC",
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span>Other voices</span>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#C84830", padding: 12 }}>
          Failed to load: {error}
        </div>
      )}

      {!loading && !error && points.length === 0 && (
        <div style={{ fontSize: 12, color: "#6B6A65", padding: 24, textAlign: "center" }}>
          No voice emergence data available for {selectedTA} yet.
        </div>
      )}

      {!loading && points.length > 0 && (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 24, bottom: 36, left: 48 }}>
              <CartesianGrid stroke="#2A2A2E" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name="Followers"
                scale="log"
                domain={[100, "auto"]}
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
                tick={{ fill: "#8A8884", fontSize: 11 }}
                label={{
                  value: "Follower count (log)",
                  position: "insideBottom",
                  offset: -16,
                  fill: "#8A8884",
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Engagement/follower"
                scale="log"
                domain={[0.001, 1.0]}
                ticks={[0.001, 0.01, 0.1, 1.0]}
                tickFormatter={(v) => `${(v * 100).toFixed(v < 0.01 ? 1 : 0)}%`}
                tick={{ fill: "#8A8884", fontSize: 11 }}
                label={{
                  value: "Engagement per follower (log)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 8,
                  fill: "#8A8884",
                  fontSize: 11,
                  style: { textAnchor: "middle" },
                }}
              />
              <Scatter
                name="Voices"
                data={points}
                onClick={(p: any) => setPinnedPoint(p.payload)}
                isAnimationActive={false}
                shape={(props: any) => {
                  const { cx, cy, payload } = props;
                  const color = getDotColor(payload);
                  return (
                    <g style={{ cursor: "pointer" }} onMouseEnter={() => setHoveredPoint(payload)}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={8}
                        fill="transparent"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={color}
                        fillOpacity={0.85}
                        stroke="#111113"
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !error && points.length > 0 && (
        <DetailPanel point={pinnedPoint ?? hoveredPoint} pinned={pinnedPoint !== null} />
      )}
    </div>
  );
}
