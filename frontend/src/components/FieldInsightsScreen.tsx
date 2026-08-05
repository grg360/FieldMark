import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { getFieldInsightsForCurrentUser, formatHcpDisplayName, formatInsightDate, type FieldInsight } from "../lib/fieldInsights";
import { CATEGORY_LABELS, getCategoryColors, type InsightCategory, type InsightStrength } from "../lib/insightCategories";
import AppLayout from "./AppLayout";
import PageHero from "./PageHero";

function buildEmailBody(insights: FieldInsight[]): string {
  if (insights.length === 0) {
    return "No field insights captured yet.";
  }
  const lines: string[] = [];
  lines.push("FIELD INSIGHTS - WEEKLY DIGEST");
  lines.push("");
  lines.push(`${insights.length} insight${insights.length === 1 ? "" : "s"} captured.`);
  lines.push("");
  lines.push("-----");
  lines.push("");
  for (const ins of insights) {
    const hcpName = formatHcpDisplayName(ins.hcp_first_name, ins.hcp_last_name);
    const categoryLabel = ins.insight_category
      ? CATEGORY_LABELS[ins.insight_category as InsightCategory] ?? ins.insight_category
      : "Uncategorized";
    const dateStr = formatInsightDate(ins.occurred_at);
    lines.push(`${hcpName} - ${categoryLabel} - ${dateStr}`);
    lines.push("");
    lines.push(ins.body);
    if (ins.why_it_matters) {
      lines.push("");
      lines.push(`Why it matters: ${ins.why_it_matters}`);
    }
    lines.push("");
    lines.push("-----");
    lines.push("");
  }
  return lines.join("\n");
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M14 3h7v7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 14L21 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type InsightTab = "by_hcp" | "by_category" | "by_date";

const TABS: Array<{ id: InsightTab; label: string }> = [
  { id: "by_hcp", label: "By HCP" },
  { id: "by_category", label: "By Category" },
  { id: "by_date", label: "By Date" },
];

const IG_ACCENT = "#1D9E75";
const IG_ACCENT_BG = "rgba(29, 158, 117, 0.10)";
const IG_ACCENT_BORDER = "rgba(29, 158, 117, 0.30)";

const STRENGTH_LABELS: Record<InsightStrength, string> = {
  high: "High signal",
  medium: "Medium signal",
  observation: "Observation",
};

const INTERACTION_LABELS: Record<string, string> = {
  one_on_one: "1:1",
  advisory_board: "Advisory Board",
  congress: "Congress",
  tumor_board: "Tumor Board",
  other: "Other",
};

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function FieldInsightsScreen() {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<FieldInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<InsightTab>("by_hcp");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFieldInsightsForCurrentUser()
      .then((data) => {
        if (cancelled) return;
        setInsights(data);
      })
      .catch((err) => {
        console.warn("FieldInsightsScreen: load error", err);
        if (!cancelled) setInsights([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isEmpty = !loading && insights.length === 0;

  const handleShare = () => {
    const subject = encodeURIComponent("Field Insights - Weekly Digest");
    const body = encodeURIComponent(buildEmailBody(insights));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    { label: "Field Insights" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="reading">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Reduced H1 (PageHero, Commit B 2026-08-05) */}
            <PageHero
              reduced
              eyebrow="Insight Gen"
              title="Field Insights"
              dek="Structured field intelligence from your HCP interactions. Each insight ties published beliefs to current beliefs across your territory. Share this view with your manager to surface emerging themes and patterns."
            />
          </div>
          <button
            type="button"
            onClick={handleShare}
            disabled={insights.length === 0}
            aria-label="Share field insights via email"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: IG_ACCENT_BG,
              border: `1px solid ${IG_ACCENT_BORDER}`,
              color: IG_ACCENT,
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              cursor: insights.length === 0 ? "default" : "pointer",
              opacity: insights.length === 0 ? 0.5 : 1,
              fontFamily: "inherit",
              flexShrink: 0,
              marginTop: 4,
            }}
          >
            <ShareIcon />
            Share
          </button>
        </div>
      </div>

      <div
        style={{
          borderBottom: "1px solid #1E1E22",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...tabButtonStyle,
                  color: isActive ? "#E8E6DF" : "#6B6A65",
                  borderBottomColor: isActive ? IG_ACCENT : "transparent",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {loading ? (
          <LoadingState />
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          <TabContent tab={activeTab} insights={insights} navigate={navigate} />
        )}
      </div>
    </AppLayout>
  );
}

function TabContent({
  tab,
  insights,
  navigate,
}: {
  tab: InsightTab;
  insights: FieldInsight[];
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (tab === "by_date") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} navigate={navigate} />
        ))}
      </div>
    );
  }

  if (tab === "by_hcp") {
    const grouped = groupByHcp(insights);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {grouped.map((group) => (
          <div key={group.hcp_id}>
            <GroupHeader
              title={group.hcp_display_name}
              count={group.insights.length}
              onClick={() => navigate(`/hcp/${group.hcp_id}`)}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {group.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} navigate={navigate} hideHcp />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const grouped = groupByCategory(insights);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {grouped.map((group) => {
        const colors = getCategoryColors(group.category);
        return (
          <div key={group.category ?? "uncategorized"}>
            <GroupHeader title={group.label} count={group.insights.length} accentColor={colors.fg} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {group.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} navigate={navigate} hideCategory />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupHeader({
  title,
  count,
  accentColor,
  onClick,
}: {
  title: string;
  count: number;
  accentColor?: string;
  onClick?: () => void;
}) {
  const isClickable = typeof onClick === "function";
  const content = (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: "1px solid #1E1E22",
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: accentColor ?? "#E8E6DF",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: "#6B6A65" }}>
        {count} insight{count === 1 ? "" : "s"}
      </div>
    </div>
  );
  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {content}
      </button>
    );
  }
  return content;
}

function InsightCard({
  insight,
  navigate,
  hideHcp,
  hideCategory,
}: {
  insight: FieldInsight;
  navigate: ReturnType<typeof useNavigate>;
  hideHcp?: boolean;
  hideCategory?: boolean;
}) {
  const colors = getCategoryColors(insight.insight_category);
  const categoryLabel = insight.insight_category ? CATEGORY_LABELS[insight.insight_category] : "Uncategorized";
  const interactionLabel = insight.interaction_type ? INTERACTION_LABELS[insight.interaction_type] ?? "Other" : "Other";
  const strengthLabel = insight.insight_strength ? STRENGTH_LABELS[insight.insight_strength] : null;

  return (
    <div
      style={{
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 10,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          {!hideHcp ? (
            <button
              type="button"
              onClick={() => navigate(`/hcp/${insight.hcp_id}`)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: "#E8E6DF",
                fontSize: 15,
                fontWeight: 600,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {formatHcpDisplayName(insight)}
            </button>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!hideCategory ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  color: colors.fg,
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 999,
                  padding: "3px 10px",
                }}
              >
                {categoryLabel}
              </span>
            ) : null}
            {strengthLabel ? (
              <span style={{ fontSize: 11, color: "#9B9892", letterSpacing: 0.2 }}>
                {strengthLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: "#9B9892" }}>{formatInsightDate(insight.occurred_at)}</div>
          <div style={{ fontSize: 11, color: "#6B6A65" }}>{interactionLabel}</div>
        </div>
      </div>

      <div style={{ fontSize: 14, color: "#C8C5BE", lineHeight: 1.55, marginBottom: insight.why_it_matters ? 12 : 12 }}>
        {insight.body}
      </div>

      {insight.why_it_matters ? (
        <div
          style={{
            backgroundColor: "rgba(29, 158, 117, 0.06)",
            border: "1px solid rgba(29, 158, 117, 0.20)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: IG_ACCENT,
              marginBottom: 6,
            }}
          >
            Why it matters
          </div>
          <div style={{ fontSize: 13, color: "#C8C5BE", lineHeight: 1.5 }}>
            {insight.why_it_matters}
          </div>
        </div>
      ) : null}

      {insight.belief_claim_title ? (
        <button
          type="button"
          onClick={() => navigate(`/hcp/${insight.hcp_id}#belief-profile`)}
          aria-label={`View linked Belief Profile: ${insight.belief_claim_title}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(155, 109, 255, 0.08)",
            border: "1px solid rgba(155, 109, 255, 0.30)",
            color: "#B89BFF",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
            marginBottom: 12,
            transition: "background-color 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(155, 109, 255, 0.14)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(155, 109, 255, 0.08)";
          }}
        >
          <span style={{ color: "#9B9892", fontWeight: 400 }}>Linked Belief Profile:</span>
          <span>{insight.belief_claim_title}</span>
          <span aria-hidden style={{ color: "#9B9892", marginLeft: 2 }}>{String.fromCharCode(0x2192)}</span>
        </button>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 10,
          borderTop: "1px solid #1E1E22",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: "transparent",
            border: `1.5px solid ${IG_ACCENT}`,
            color: IG_ACCENT,
            fontSize: 10,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {insight.author_initials}
        </div>
        <div style={{ fontSize: 11, color: "#6B6A65" }}>Logged by team MSL</div>
      </div>
    </div>
  );
}

interface HcpGroup {
  hcp_id: string;
  hcp_display_name: string;
  insights: FieldInsight[];
}

function groupByHcp(insights: FieldInsight[]): HcpGroup[] {
  const map = new Map<string, HcpGroup>();
  for (const insight of insights) {
    const existing = map.get(insight.hcp_id);
    if (existing) {
      existing.insights.push(insight);
    } else {
      map.set(insight.hcp_id, {
        hcp_id: insight.hcp_id,
        hcp_display_name: formatHcpDisplayName(insight),
        insights: [insight],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.insights.length - a.insights.length);
}

interface CategoryGroup {
  category: InsightCategory | null;
  label: string;
  insights: FieldInsight[];
}

function groupByCategory(insights: FieldInsight[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const insight of insights) {
    const key = insight.insight_category ?? "uncategorized";
    const existing = map.get(key);
    if (existing) {
      existing.insights.push(insight);
    } else {
      map.set(key, {
        category: insight.insight_category,
        label: insight.insight_category ? CATEGORY_LABELS[insight.insight_category] : "Uncategorized",
        insights: [insight],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.insights.length - a.insights.length);
}

function LoadingState() {
  return (
    <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 96,
            backgroundColor: "#15131A",
            border: "1px solid #1E1E22",
            borderRadius: 10,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "64px 24px",
        textAlign: "center",
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          backgroundColor: IG_ACCENT_BG,
          border: `1px solid ${IG_ACCENT_BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: IG_ACCENT,
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        +
      </div>
      <div style={{ fontSize: 16, color: "#E8E6DF", fontWeight: 500 }}>No field insights yet</div>
      <div style={{ fontSize: 13, color: "#9B9892", maxWidth: 440, lineHeight: 1.5 }}>
        Field insights captured after HCP interactions appear here. Each insight is tagged with a category, strength,
        and optionally tied to a Belief Profile claim. Capture flow is coming soon.
      </div>
    </div>
  );
}

const tabButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  padding: "12px 16px",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "color 120ms, border-color 120ms",
  marginBottom: -1,
};
