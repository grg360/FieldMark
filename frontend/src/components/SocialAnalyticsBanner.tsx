import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { getSocialAnalytics, type SocialAnalyticsBundle } from "../lib/api";

interface SocialAnalyticsBannerProps {
  selectedTA: string;
}

const SLICE_COLORS = ["#6BA3D8", "#7FB1B5", "#8FA38C", "#A39B7C", "#8B8585", "#5A5A5E"];

function directionSymbol(trend: string): string {
  if (trend === "rising" || trend === "new") return "↑";
  if (trend === "falling" || trend === "gone") return "↓";
  return "→";
}

function directionColor(trend: string): string {
  if (trend === "rising" || trend === "new") return "#7FB87F";
  if (trend === "falling" || trend === "gone") return "#C84830";
  return "#A39B7C";
}

function trendLabel(t: { hashtag: string; trend: string; pct_change: number | null }): string {
  // Strip leading "#" for display
  const cleanTag = t.hashtag.startsWith("#") ? t.hashtag.slice(1) : t.hashtag;
  return cleanTag;
}

export default function SocialAnalyticsBanner({ selectedTA }: SocialAnalyticsBannerProps) {
  const [data, setData] = useState<SocialAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getSocialAnalytics(selectedTA).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(String(res.error.message || res.error));
        setLoading(false);
        return;
      }
      setData(res.data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedTA]);

  // Build SOV pie data: top 5 by POST VOLUME, "Others" aggregates the rest.
  // Weighted by post count, not engagement — a single viral post shouldn't
  // outweigh a clinician's sustained presence (see the MV comment).
  const sov = data?.shareOfVoice || [];
  const sovTotal = sov.reduce((sum, r) => sum + (r.post_count || 0), 0);
  const top5 = sov.slice(0, 5);
  const others = sov.slice(5);
  const othersTotal = others.reduce((sum, r) => sum + (r.post_count || 0), 0);

  const pieData: { name: string; value: number; pct: number }[] = top5.map((r) => ({
    name: r.display_name || r.handle,
    value: r.post_count,
    pct: sovTotal > 0 ? (r.post_count / sovTotal) * 100 : 0,
  }));
  if (othersTotal > 0) {
    pieData.push({
      name: "Others",
      value: othersTotal,
      pct: sovTotal > 0 ? (othersTotal / sovTotal) * 100 : 0,
    });
  }

  // Hot topics bars: strip "#" prefix for display
  const hotTopics = (data?.hotTopics || []).map((t) => ({
    topic: t.hashtag.startsWith("#") ? t.hashtag.slice(1) : t.hashtag,
    pct: Math.round(t.engagement_pct),
  }));

  // Trending strip: only show rows that pass the prior_engagement >= 50 filter
  const trending = data?.trending || [];

  return (
    <div
      style={{
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 4,
        margin: "0 16px 12px",
        padding: 12,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* SOV + topics two-column */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          padding: "0 12px",
        }}
      >
        {/* Left: voice SOV */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#6BA3D8",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Share of voice · by post volume · last 90 days
          </div>
          {loading ? (
            <div style={{ fontSize: 11, color: "#6B6A65", textAlign: "center", padding: 20 }}>loading…</div>
          ) : error ? (
            <div style={{ fontSize: 11, color: "#C84830", textAlign: "center", padding: 20 }}>Failed to load</div>
          ) : pieData.length === 0 ? (
            <div style={{ fontSize: 11, color: "#6B6A65", textAlign: "center", padding: 20 }}>No data yet</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ width: 110, height: 110, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={50}
                      stroke="#0D0D10"
                      strokeWidth={1}
                      isAnimationActive={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pieData.map((d, i) => (
                  <div
                    key={`${d.name}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: "#B8B4AC",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length],
                        borderRadius: 1,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name}
                    </span>
                    <span style={{ fontFamily: "monospace", color: "#6B6A65", marginLeft: 4 }}>
                      {d.pct.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: hot topics bars */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#C49A4A",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Hot topics · share of conversation · last 90 days
          </div>
          {loading ? (
            <div style={{ fontSize: 11, color: "#6B6A65", textAlign: "center", padding: 20 }}>loading…</div>
          ) : hotTopics.length === 0 ? (
            <div style={{ fontSize: 11, color: "#6B6A65", textAlign: "center", padding: 20 }}>No topics yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {hotTopics.map((t) => (
                <div key={t.topic}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 11,
                      color: "#B8B4AC",
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                      {t.topic}
                    </span>
                    <span style={{ fontFamily: "monospace", color: "#6B6A65", flexShrink: 0 }}>
                      {t.pct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      backgroundColor: "#1E1E22",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${t.pct}%`,
                        backgroundColor: "#C49A4A",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trending strip */}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #1E1E22" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#6BA3D8",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 6,
          }}
        >
          Trending vs. prior week
        </div>
        {loading ? (
          <div style={{ fontSize: 11, color: "#6B6A65" }}>loading…</div>
        ) : trending.length === 0 ? (
          <div style={{ fontSize: 11, color: "#6B6A65" }}>Insufficient baseline for trend detection</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {trending.map((t) => (
              <div
                key={t.hashtag}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "#B8B4AC",
                }}
              >
                <span style={{ color: directionColor(t.trend), fontWeight: 600 }}>
                  {directionSymbol(t.trend)}
                </span>
                <span>{trendLabel(t)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
