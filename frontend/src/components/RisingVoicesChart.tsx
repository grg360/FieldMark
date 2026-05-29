import { useEffect, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const p: ChartPoint = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "#111113",
        border: "1px solid #E8A020",
        borderRadius: 4,
        padding: "10px 12px",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 260,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: "#E8E6DF", marginBottom: 4 }}>
        {p.displayName || p.handle}
      </div>
      <div style={{ fontSize: 11, color: "#8A8884", marginBottom: 8, fontFamily: "monospace" }}>
        @{p.handle}
      </div>
      <div style={{ fontSize: 11, color: "#B8B4AC", lineHeight: 1.5 }}>
        <div>Followers: {p.followerCount.toLocaleString()}</div>
        <div>Posts: {p.postCount}</div>
        <div>Engagement: {p.totalEngagement.toLocaleString()}</div>
        <div>Eng/follower: {(p.engagementPerFollower * 100).toFixed(2)}%</div>
      </div>
      <div style={{ fontSize: 10, color: "#6B6A65", marginTop: 8, fontStyle: "italic" }}>
        Click to view profile
      </div>
    </div>
  );
}

function getDotColor(p: ChartPoint): string {
  // Upper-left quadrant = rising voice (small audience, high engagement)
  if (p.followerCount < 5000 && p.engagementPerFollower > 0.05) return "#E8A020"; // amber: rising voice
  if (p.followerCount >= 5000 && p.engagementPerFollower > 0.02) return "#6BA3D8"; // blue: established with engagement
  return "#5A6B75"; // slate: other voices in conversation
}

function handleDotClick(p: ChartPoint) {
  const platform = (p.platform || "twitter").toLowerCase();
  const url =
    platform === "bluesky"
      ? `https://bsky.app/profile/${p.handle}`
      : `https://twitter.com/${p.handle}`;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function RisingVoicesChart({ selectedTA }: RisingVoicesChartProps) {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedTA]);

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
          Rising Voices — Last 30 days
        </span>
        <span style={{ fontSize: 10, color: "#6B6A65" }}>
          {loading ? "loading…" : `${points.length} voices`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#8A8884", marginBottom: 12, lineHeight: 1.4 }}>
        Engagement-per-follower vs. follower count. Upper-left = small audience, high engagement. Click any dot to open profile.
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
            backgroundColor: "#5A6B75",
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
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                tick={{ fill: "#8A8884", fontSize: 11 }}
                label={{
                  value: "Engagement per follower",
                  angle: -90,
                  position: "insideLeft",
                  offset: 8,
                  fill: "#8A8884",
                  fontSize: 11,
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter
                name="Voices"
                data={points}
                onClick={(p: any) => handleDotClick(p.payload)}
              >
                {points.map((p, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={getDotColor(p)}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
