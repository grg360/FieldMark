import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { getMockSocialCandidates } from "../data/socialMockData";

interface SocialAnalyticsBannerProps {
  selectedTA: string;
}

// Mocked topic emergence per TA
function getTopicTrends(selectedTA: string): { label: string; direction: "up" | "down" | "steady" }[] {
  if (selectedTA === "Hepatology") {
    return [
      { label: "MASLD trial readouts", direction: "up" },
      { label: "GLP-1 in liver disease", direction: "up" },
      { label: "Transplant criteria", direction: "steady" },
      { label: "Hep C eradication", direction: "down" },
    ];
  }
  if (selectedTA === "Rare Disease") {
    return [
      { label: "Gene therapy access", direction: "up" },
      { label: "AAV manufacturing", direction: "up" },
      { label: "Newborn screening", direction: "steady" },
    ];
  }
  return [
    { label: "KRAS G12C combos", direction: "up" },
    { label: "Trop-2 ADCs", direction: "up" },
    { label: "ASCO26 highlights", direction: "steady" },
    { label: "Checkpoint resistance", direction: "down" },
  ];
}

function getTopicShareData(selectedTA: string): { topic: string; pct: number }[] {
  if (selectedTA === "Hepatology") {
    return [
      { topic: "MASLD trial readouts", pct: 32 },
      { topic: "GLP-1 in liver disease", pct: 24 },
      { topic: "Transplant criteria", pct: 18 },
      { topic: "Hep C eradication", pct: 14 },
      { topic: "HCC screening", pct: 8 },
      { topic: "Other", pct: 4 },
    ];
  }
  if (selectedTA === "Rare Disease") {
    return [
      { topic: "Gene therapy access", pct: 30 },
      { topic: "AAV manufacturing", pct: 22 },
      { topic: "Newborn screening", pct: 18 },
      { topic: "Patient registries", pct: 14 },
      { topic: "Reimbursement pathways", pct: 10 },
      { topic: "Other", pct: 6 },
    ];
  }
  return [
    { topic: "KRAS G12C combinations", pct: 28 },
    { topic: "Trop-2 ADCs", pct: 22 },
    { topic: "ASCO26 highlights", pct: 18 },
    { topic: "CAR-T sequencing", pct: 14 },
    { topic: "Checkpoint resistance", pct: 10 },
    { topic: "Other", pct: 8 },
  ];
}

const SLICE_COLORS = ["#6BA3D8", "#7FB1B5", "#8FA38C", "#A39B7C", "#8B8585", "#5A5A5E"];

export default function SocialAnalyticsBanner({ selectedTA }: SocialAnalyticsBannerProps) {
  const candidates = getMockSocialCandidates(selectedTA);
  const topicTrends = getTopicTrends(selectedTA);
  const topicShareData = getTopicShareData(selectedTA);

  // Engagement-weighted score: engagement rate × post count
  // Rewards both audience quality AND posting activity, normalized
  // for follower count so big audiences don't automatically dominate.
  const scoreFor = (c: typeof candidates[number]) =>
    c.engagementRate * c.postsLast90Days;

  const totalScore = candidates.reduce((sum, c) => sum + scoreFor(c), 0);
  const sortedCandidates = [...candidates].sort(
    (a, b) => scoreFor(b) - scoreFor(a)
  );
  const top5 = sortedCandidates.slice(0, 5);
  const others = sortedCandidates.slice(5);
  const othersScore = others.reduce((sum, c) => sum + scoreFor(c), 0);

  const pieData: { name: string; value: number; pct: number }[] = top5.map((c) => ({
    name: c.matchedHcpName ?? c.displayName,
    value: scoreFor(c),
    pct: totalScore > 0 ? (scoreFor(c) / totalScore) * 100 : 0,
  }));
  if (othersScore > 0) {
    pieData.push({
      name: "Others",
      value: othersScore,
      pct: totalScore > 0 ? (othersScore / totalScore) * 100 : 0,
    });
  }

  const directionSymbol = (d: "up" | "down" | "steady") => {
    if (d === "up") return "↑";
    if (d === "down") return "↓";
    return "→";
  };
  const directionColor = (d: "up" | "down" | "steady") => {
    if (d === "up") return "#7FB87F";
    if (d === "down") return "#8B8585";
    return "#A39B7C";
  };

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
            Share of voice · engagement-weighted · last 30 days
          </div>
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
                  key={d.name}
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
        </div>

        {/* Right: topic share bars */}
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
            Hot topics · share of conversation · last 30 days
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {topicShareData.map((t) => (
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
        </div>
      </div>

      {/* topic emergence strip */}
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
          Trending · last 30 days
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {topicTrends.map((t) => (
            <div
              key={t.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "#B8B4AC",
              }}
            >
              <span style={{ color: directionColor(t.direction), fontWeight: 600 }}>
                {directionSymbol(t.direction)}
              </span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
