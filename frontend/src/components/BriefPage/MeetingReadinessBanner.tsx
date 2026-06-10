import type { BriefFollowUp, BriefInsight } from "../../lib/briefs";

interface Props {
  followUps: BriefFollowUp[];
  insights: BriefInsight[];
}

function computeReadiness(followUps: BriefFollowUp[], insights: BriefInsight[]): {
  state: "red" | "yellow" | "green";
  label: string;
  context: string;
} {
  const overdueCount = followUps.filter((f) => f.overdue).length;
  if (overdueCount > 0) {
    return {
      state: "red",
      label: "Follow-up Outstanding",
      context: `${overdueCount} overdue ${overdueCount === 1 ? "action" : "actions"}`,
    };
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentInsights = insights.filter(
    (i) => new Date(i.occurred_at).getTime() > thirtyDaysAgo,
  );

  if (followUps.length > 0 && recentInsights.length > 0) {
    return {
      state: "green",
      label: "Ready",
      context: "All commitments on track",
    };
  }

  if (followUps.length > 0) {
    return {
      state: "yellow",
      label: "Needs Attention",
      context: "Open follow-ups, no recent insights",
    };
  }

  if (recentInsights.length === 0) {
    return {
      state: "yellow",
      label: "Needs Attention",
      context: "Cold relationship - no recent activity",
    };
  }

  return {
    state: "green",
    label: "Ready",
    context: "All clear",
  };
}

function readinessColors(state: "red" | "yellow" | "green"): { bg: string; border: string; emoji: string } {
  switch (state) {
    case "red":
      return { bg: "rgba(232,69,69,0.12)", border: "#E84545", emoji: String.fromCodePoint(0x1F534) };
    case "yellow":
      return { bg: "rgba(232,160,32,0.12)", border: "#E8A020", emoji: String.fromCodePoint(0x1F7E1) };
    case "green":
      return { bg: "rgba(63,184,175,0.12)", border: "#3FB8AF", emoji: String.fromCodePoint(0x1F7E2) };
  }
}

export default function MeetingReadinessBanner({ followUps, insights }: Props) {
  const readiness = computeReadiness(followUps, insights);
  const colors = readinessColors(readiness.state);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: 6,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{colors.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#E8E6DF", lineHeight: 1.2 }}>
          {readiness.label}
        </div>
        <div style={{ fontSize: 11, color: "#9B9892", marginTop: 2 }}>
          {readiness.context}
        </div>
      </div>
    </div>
  );
}
