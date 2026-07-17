import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "../../lib/authHelpers";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { useTA } from "../../lib/TAContext";
import { taIdForApiSlug } from "../../lib/api";
import { taLabelToApiSlug, taSlugToLabel } from "../../lib/routeSlugs";
import { addHcpToDefaultOrCreate } from "../../lib/relationships";
import { supabase } from "../../lib/supabase";
import { useIsDesktop } from "../../lib/useIsDesktop";
import {
  getCoverageGapsForUser,
  getHomeSummaryCounts,
  getNextActionsForUser,
  getOpenFollowUpStats,
  getOverdueFollowUpsForUser,
  getRecentActivityForUser,
  getRecentBriefsForUser,
  getRecentInsightsForUser,
  getTerritoryCoverageStats,
  getTerritoryProfile,
  type ActivityEvent,
  type BriefRef,
  type CoverageGapHcp,
  type HomeSummaryCounts,
  type InsightWithHcp,
  type NextActionWithHcp,
  type OpenFollowUpStats,
  type TerritoryCoverageStats,
  type TerritoryProfile,
} from "../../lib/home";
import AppLayout from "../AppLayout";
import CoverageGapsTile from "./CoverageGapsTile";
import HomeHero from "./HomeHero";
import InviteColleaguesTile from "./InviteColleaguesTile";
import NextActionsTile from "./NextActionsTile";
import OpenFollowUpsTile from "./OpenFollowUpsTile";
import OverdueFollowUpsTile from "./OverdueFollowUpsTile";
import RecentActivityTile from "./RecentActivityTile";
import RecentBriefsTile from "./RecentBriefsTile";
import RecentInsightsTile from "./RecentInsightsTile";
import TeamIntelligenceTile from "./TeamIntelligenceTile";
import WelcomeShareBanner from "./WelcomeShareBanner";
import YourInstitutionsTile from "./YourInstitutionsTile";

export default function HomePage() {
  const isDesktop = useIsDesktop();
  // The home dashboard has no feed URL, so its TA is anchored to the USER'S PROFILE
  // default (resolved in load() below) rather than the volatile last-browsed ambient
  // value — otherwise the tiles would show the wrong TA (e.g. a stale AD selection
  // makes NSCLC's coverage gaps disappear). We seed TAContext from the profile so the
  // tiles' own useTA() reads stay consistent.
  const { setTA } = useTA();
  const [homeTaId, setHomeTaId] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const { refreshAll } = useRelationships();
  const [trackRefreshCounter, setTrackRefreshCounter] = useState(0);
  const [summary, setSummary] = useState<HomeSummaryCounts | null>(null);
  const [nextActions, setNextActions] = useState<NextActionWithHcp[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<NextActionWithHcp[]>([]);
  const [followUpStats, setFollowUpStats] = useState<OpenFollowUpStats | null>(null);
  const [recentInsights, setRecentInsights] = useState<InsightWithHcp[]>([]);
  const [recentBriefs, setRecentBriefs] = useState<BriefRef[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGapHcp[]>([]);
  const [territoryStats, setTerritoryStats] = useState<TerritoryCoverageStats | null>(null);
  const [territoryProfile, setTerritoryProfile] = useState<TerritoryProfile | null>(null);
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

        // Resolve the dashboard TA from the user's profile default FIRST, seed
        // TAContext so the tiles' useTA() reads match, then fetch TA-scoped data
        // with it. Single fetch → no hide-then-flash.
        const { data: profile } = await supabase
          .from("msl_profiles")
          .select("first_name, default_ta_slug, default_indication_slug")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profile?.first_name) setUserFirstName(profile.first_name);

        const parentSlug = profile?.default_ta_slug ?? "oncology";
        const indicationSlug =
          profile?.default_indication_slug ?? taLabelToApiSlug(taSlugToLabel(parentSlug));
        const resolvedTaId =
          taIdForApiSlug(indicationSlug) ??
          taIdForApiSlug(taLabelToApiSlug(taSlugToLabel(parentSlug)));
        setHomeTaId(resolvedTaId);
        setTA(parentSlug, indicationSlug);

        const [
          summaryData,
          nextActionsData,
          overdueData,
          statsData,
          insightsData,
          briefsData,
          activityData,
          gapsData,
          territoryStatsData,
          territoryProfileData,
        ] = await Promise.all([
          getHomeSummaryCounts(user.id),
          getNextActionsForUser(user.id, 3),
          getOverdueFollowUpsForUser(user.id, 5),
          getOpenFollowUpStats(user.id),
          getRecentInsightsForUser(user.id, 5),
          getRecentBriefsForUser(user.id, 5),
          getRecentActivityForUser(user.id, 10),
          getCoverageGapsForUser(user.id, resolvedTaId, 5),
          getTerritoryCoverageStats(user.id, resolvedTaId),
          getTerritoryProfile(user.id),
        ]);

        if (cancelled) return;

        setSummary(summaryData);
        setNextActions(nextActionsData);
        setOverdueFollowUps(overdueData);
        setFollowUpStats(statsData);
        setRecentInsights(insightsData);
        setRecentBriefs(briefsData);
        setRecentActivity(activityData);
        setCoverageGaps(gapsData);
        setTerritoryStats(territoryStatsData);
        setTerritoryProfile(territoryProfileData);
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
  }, [setTA]);

  const handleTrackHcp = useCallback(async (hcpId: string) => {
    if (!userId) throw new Error("No user");
    await addHcpToDefaultOrCreate(userId, hcpId, "coverage_gaps");
    await refreshAll();
    const [newGaps, newStats] = await Promise.all([
      getCoverageGapsForUser(userId, homeTaId, 5),
      getTerritoryCoverageStats(userId, homeTaId),
    ]);
    setCoverageGaps(newGaps);
    setTerritoryStats(newStats);
    const newSummary = await getHomeSummaryCounts(userId);
    setSummary(newSummary);
    setTrackRefreshCounter((c) => c + 1);
  }, [userId, refreshAll, homeTaId]);

  const gridColumns = isDesktop ? "1fr 1fr" : "1fr";

  return (
    <AppLayout>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 16, marginBottom: 32 }}>
            <WelcomeShareBanner />

            <HomeHero firstName={userFirstName} summary={summary} territory={territoryProfile} />

            <NextActionsTile actions={nextActions} />

            <InviteColleaguesTile />

            {userId ? <YourInstitutionsTile userId={userId} /> : null}

            <CoverageGapsTile gaps={coverageGaps} stats={territoryStats} onTrack={handleTrackHcp} refreshTrigger={trackRefreshCounter} />

            <div style={{ display: "grid", gridTemplateColumns: gridColumns, gap: 32 }}>
              <OverdueFollowUpsTile
                overdueFollowUps={overdueFollowUps}
                totalCount={summary.overdue_followups}
              />
              <OpenFollowUpsTile stats={followUpStats} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: gridColumns, gap: 32 }}>
              <RecentInsightsTile insights={recentInsights} />
              <RecentBriefsTile briefs={recentBriefs} />
            </div>

            <TeamIntelligenceTile userId={userId} />

            <RecentActivityTile activity={recentActivity} />
          </div>
        ) : null}
    </AppLayout>
  );
}
