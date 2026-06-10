import { useEffect, useState } from "react";
import { getCurrentUser } from "../../lib/authHelpers";
import { supabase } from "../../lib/supabase";
import { useIsDesktop } from "../../lib/useIsDesktop";
import {
  getHomeSummaryCounts,
  getNextActionsForUser,
  getOpenFollowUpStats,
  getOverdueFollowUpsForUser,
  getRecentActivityForUser,
  getRecentBriefsForUser,
  getRecentInsightsForUser,
  type ActivityEvent,
  type BriefRef,
  type HomeSummaryCounts,
  type InsightWithHcp,
  type NextActionWithHcp,
  type OpenFollowUpStats,
} from "../../lib/home";
import GlobalFooter from "../GlobalFooter";
import HomeHero from "./HomeHero";
import HomeNavigationRow from "./HomeNavigationRow";
import NextActionsTile from "./NextActionsTile";
import OpenFollowUpsTile from "./OpenFollowUpsTile";
import OverdueFollowUpsTile from "./OverdueFollowUpsTile";
import RecentActivityTile from "./RecentActivityTile";
import RecentBriefsTile from "./RecentBriefsTile";
import RecentInsightsTile from "./RecentInsightsTile";
import TeamIntelligenceTile from "./TeamIntelligenceTile";

export default function HomePage() {
  const isDesktop = useIsDesktop();
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<HomeSummaryCounts | null>(null);
  const [nextActions, setNextActions] = useState<NextActionWithHcp[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<NextActionWithHcp[]>([]);
  const [followUpStats, setFollowUpStats] = useState<OpenFollowUpStats | null>(null);
  const [recentInsights, setRecentInsights] = useState<InsightWithHcp[]>([]);
  const [recentBriefs, setRecentBriefs] = useState<BriefRef[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFirstName, setUserFirstName] = useState("there");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const user = await getCurrentUser();
        if (!user || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }

        setUserId(user.id);

        const [
          profileResult,
          summaryData,
          nextActionsData,
          overdueData,
          statsData,
          insightsData,
          briefsData,
          activityData,
        ] = await Promise.all([
          supabase.from("msl_profiles").select("first_name").eq("user_id", user.id).maybeSingle(),
          getHomeSummaryCounts(user.id),
          getNextActionsForUser(user.id, 3),
          getOverdueFollowUpsForUser(user.id, 5),
          getOpenFollowUpStats(user.id),
          getRecentInsightsForUser(user.id, 5),
          getRecentBriefsForUser(user.id, 5),
          getRecentActivityForUser(user.id, 10),
        ]);

        if (cancelled) return;

        if (profileResult.data?.first_name) {
          setUserFirstName(profileResult.data.first_name);
        }

        setSummary(summaryData);
        setNextActions(nextActionsData);
        setOverdueFollowUps(overdueData);
        setFollowUpStats(statsData);
        setRecentInsights(insightsData);
        setRecentBriefs(briefsData);
        setRecentActivity(activityData);
      } catch (err) {
        console.warn("HomePage: load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const gridColumns = isDesktop ? "1fr 1fr" : "1fr";

  return (
    <div
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100vh",
        padding: 0,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: 16,
          paddingBottom: 0,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {loading ? (
          <div
            style={{
              fontSize: 15,
              color: "#6B6A65",
              lineHeight: 1.6,
              textAlign: "center",
              padding: "48px 0",
              animation: "homePulse 2s ease-in-out infinite",
            }}
          >
            <style>{`
              @keyframes homePulse {
                0%, 100% { opacity: 0.4; }
                50% { opacity: 0.8; }
              }
            `}</style>
            Loading your workspace...
          </div>
        ) : summary && userId ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <HomeHero firstName={userFirstName} summary={summary} />

            <NextActionsTile actions={nextActions} />

            <div style={{ display: "grid", gridTemplateColumns: gridColumns, gap: 16 }}>
              <OverdueFollowUpsTile
                overdueFollowUps={overdueFollowUps}
                totalCount={summary.overdue_followups}
              />
              <OpenFollowUpsTile stats={followUpStats} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: gridColumns, gap: 16 }}>
              <RecentInsightsTile insights={recentInsights} />
              <RecentBriefsTile briefs={recentBriefs} />
            </div>

            <RecentActivityTile activity={recentActivity} />

            <TeamIntelligenceTile userId={userId} />

            <HomeNavigationRow />
          </div>
        ) : null}
      </div>

      <GlobalFooter />
    </div>
  );
}
