import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { getFieldInsightsForCurrentUser, formatHcpDisplayName, formatInsightDate, type FieldInsight } from "../lib/fieldInsights";
import { CATEGORY_LABELS, getCategoryColors, type InsightCategory, type InsightStrength } from "../lib/insightCategories";

type InsightTab = "by_hcp" | "by_category" | "by_date";

const TABS: Array<{ id: InsightTab; label: string }> = [
  { id: "by_hcp", label: "By HCP" },
  { id: "by_category", label: "By Category" },
  { id: "by_date", label: "By Date" },
];

const IG_ACCENT = "#1D9E75";
const IG_ACCENT_BG = "rgba(29, 158, 117, 0.10)";
const IG_ACCENT_BORDER = "rgba(29, 158, 117, 0.30)";

const MOCK_INSIGHTS: FieldInsight[] = [
  {
    id: "mock-1",
    hcp_id: "2302d82f-c44a-498e-b0ab-6ca39a3f8964",
    hcp_first_name: "John V.",
    hcp_last_name: "Heymach",
    body: "Raised concerns regarding biomarker testing implementation outside major academic centers. Specifically questioned whether community oncology practices are equipped to operationalize comprehensive genomic profiling within the AEGEAN perioperative window.",
    interaction_type: "advisory_board",
    visibility: "team",
    occurred_at: "2026-06-12T15:30:00+00:00",
    insight_strength: "high" as InsightStrength,
    insight_category: "message_challenge" as InsightCategory,
    author_user_id: "f0a8352f-3846-4a85-b96d-f91d8b3109f4",
    author_initials: "GR",
  },
  {
    id: "mock-2",
    hcp_id: "2302d82f-c44a-498e-b0ab-6ca39a3f8964",
    hcp_first_name: "John V.",
    hcp_last_name: "Heymach",
    body: "Requested additional data supporting sequencing decisions following progression on perioperative immunotherapy. Indicated current evidence base is thin for second-line targeted therapy selection in patients who progress through neoadjuvant IO.",
    interaction_type: "one_on_one",
    visibility: "team",
    occurred_at: "2026-06-02T14:00:00+00:00",
    insight_strength: "high" as InsightStrength,
    insight_category: "evidence_gap" as InsightCategory,
    author_user_id: "f0a8352f-3846-4a85-b96d-f91d8b3109f4",
    author_initials: "GR",
  },
  {
    id: "mock-3",
    hcp_id: "2302d82f-c44a-498e-b0ab-6ca39a3f8964",
    hcp_first_name: "John V.",
    hcp_last_name: "Heymach",
    body: "Highlighted MATTERHORN durability data as particularly compelling in treatment discussions with referring physicians. Noted long-term response duration data is reshaping how he frames adjuvant decisions in EGFR-wildtype patients.",
    interaction_type: "congress",
    visibility: "team",
    occurred_at: "2026-05-18T10:15:00+00:00",
    insight_strength: "medium" as InsightStrength,
    insight_category: "message_reinforcement" as InsightCategory,
    author_user_id: "f0a8352f-3846-4a85-b96d-f91d8b3109f4",
    author_initials: "GR",
  },
  {
    id: "mock-4",
    hcp_id: "71b51a2d-0f56-434f-abf4-f6755c796eaf",
    hcp_first_name: "Suresh S.",
    hcp_last_name: "Ramalingam",
    body: "Discussed competitor durvalumab positioning in Stage III consolidation. Indicated colleagues in community settings are increasingly comparing PACIFIC data with newer combination strategies and questioning whether durvalumab monotherapy remains the optimal backbone.",
    interaction_type: "one_on_one",
    visibility: "team",
    occurred_at: "2026-06-08T11:45:00+00:00",
    insight_strength: "high" as InsightStrength,
    insight_category: "competitor_signal" as InsightCategory,
    author_user_id: "f0a8352f-3846-4a85-b96d-f91d8b3109f4",
    author_initials: "GR",
  },
  {
    id: "mock-5",
    hcp_id: "71b51a2d-0f56-434f-abf4-f6755c796eaf",
    hcp_first_name: "Suresh S.",
    hcp_last_name: "Ramalingam",
    body: "Voiced skepticism about PD-L1 expression as a reliable selection marker for IO combinations. Argued that integrated biomarker panels combining PD-L1 with TMB and inflammatory gene signatures will replace single-marker selection within 3-5 years.",
    interaction_type: "advisory_board",
    visibility: "team",
    occurred_at: "2026-05-24T16:00:00+00:00",
    insight_strength: "medium" as InsightStrength,
    insight_category: "clinical_practice_trend" as InsightCategory,
    author_user_id: "f0a8352f-3846-4a85-b96d-f91d8b3109f4",
    author_initials: "GR",
  },
  {
    id: "mock-6",
    hcp_id: "b217c02b-9402-497e-9fba-f8cc69bb382b",
    hcp_first_name: "Alexander I.",
    hcp_last_name: "Spira",
    body: "Flagged emerging community practice pattern of using KRAS G12C inhibitors earlier in sequencing than guidelines recommend. Suggested real-world data may need to catch up to community adoption before optimal sequencing can be defined.",
    interaction_type: "tumor_board",
    visibility: "team",
    occurred_at: "2026-05-30T13:20:00+00:00",
    insight_strength: "high" as InsightStrength,
    insight_category: "clinical_practice_trend" as InsightCategory,
    author_user_id: "f0a8352f-3846-4a85-b96d-f91d8b3109f4",
    author_initials: "GR",
  },
  {
    id: "mock-7",
    hcp_id: "5c4b1a8e-0000-0000-0000-000000000007",
    hcp_first_name: "Aditi P.",
    hcp_last_name: "Singh",
    body: "Raised reimbursement barrier for comprehensive genomic profiling in Medicare Advantage patients. Reports several referring oncologists have been declining CGP based on prior authorization friction, leading to under-identification of actionable mutations.",
    interaction_type: "one_on_one",
    visibility: "team",
    occurred_at: "2026-06-15T09:30:00+00:00",
    insight_strength: "medium" as InsightStrength,
    insight_category: "access_reimbursement" as InsightCategory,
    author_user_id: "f0a8352f-3846-4a85-b96d-f91d8b3109f4",
    author_initials: "GR",
  },
];

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
        if (data.length === 0) {
          setInsights(MOCK_INSIGHTS);
        } else {
          setInsights(data);
        }
      })
      .catch((err) => {
        console.warn("FieldInsightsScreen: load error", err);
        if (!cancelled) setInsights(MOCK_INSIGHTS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isEmpty = !loading && insights.length === 0;

  return (
    <div
      className="fm-screen"
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#E8E6DF",
      }}
    >
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          backgroundColor: "#0A0A0B",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => navigate("/me")}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            padding: 4,
            fontFamily: "inherit",
          }}
          aria-label="Back to Home"
        >
          <BackArrow />
          <span style={{ fontSize: 13, color: "#6B6A65" }}>Home</span>
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 16px" }}>
        <div style={{ marginBottom: 4 }}>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: IG_ACCENT,
              fontWeight: 600,
            }}
          >
            Insight Gen
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#E8E6DF", margin: "0 0 8px", lineHeight: 1.2 }}>
          Field Insights
        </h1>
        <p style={{ fontSize: 14, color: "#9B9892", margin: 0, maxWidth: 640, lineHeight: 1.5 }}>
          Structured field intelligence from your HCP interactions. Each insight ties published beliefs to current
          beliefs across your territory. Share this view with your manager to surface emerging themes and patterns.
        </p>
      </div>

      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px",
          borderBottom: "1px solid #1E1E22",
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

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 64px" }}>
        {loading ? (
          <LoadingState />
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          <TabContent tab={activeTab} insights={insights} navigate={navigate} />
        )}
      </div>
    </div>
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

      <div style={{ fontSize: 14, color: "#C8C5BE", lineHeight: 1.55, marginBottom: 12 }}>
        {insight.body}
      </div>

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
