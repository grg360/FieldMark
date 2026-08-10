/*
 * URL routing manual verification checklist:
 * - Fresh load at / -> Oncology / Established / NSCLC
 * - Click Hepatology -> /hepatology/established/all (or first active indication)
 * - Click Rising Stars in Oncology -> /oncology/rising-stars/<current indication>
 * - Click NSCLC -> /oncology/.../nsclc
 * - Click inactive indication (Breast) -> /oncology/established/breast, coming soon content
 * - Click HCP card -> /hcp/<hcpId>, detail renders
 * - Browser back -> previous TA/dashboard/indication
 * - Logo -> /, home view
 * - Field Intelligence tab -> /:ta/field-intelligence
 * - Thread -> /:ta/field-intelligence/thread/:threadId
 * - Paste URL in new tab -> auth then same content
 * - Refresh deep URL -> same content after auth
 */

import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "./lib/useMediaQuery";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { ArrowUp } from "lucide-react";
import TelescopeField from "./components/TelescopeField";
import LinkedInAuthScreen from "./components/LinkedInAuthScreen";
import SignupScreen from "./components/SignupScreen";
import AuthWrapper from "./components/AuthWrapper";
import { RelationshipsProvider } from "./contexts/RelationshipsContext";
import WelcomeWizard from "./components/WelcomeWizard";
import AppLayout from "./components/AppLayout";
import PeopleNavStrip from "./components/PeopleNavStrip";
import SearchBar from "./components/SearchBar";
import HCPCard from "./components/HCPCard";
import CommunityExplorer from "./components/CommunityExplorer";
import ActionTray from "./components/ActionTray";
import AssetsIndexPage from "./components/Assets/AssetsIndexPage";
import AssetPage from "./components/Assets/AssetPage";
import CohortLedger from "./components/Cohorts/CohortLedger";
import RisingLedger from "./components/Cohorts/RisingLedger";
import HcpProfileBrief from "./components/Profile/HcpProfileBrief";
import ProfileDispatch from "./components/Profile/ProfileDispatch";
import PracticeFirstProfile from "./components/Profile/PracticeFirstProfile";
import LandscapeRoute from "./components/LandscapeRoute";
import InstitutionRoute from "./components/InstitutionRoute";
import InstitutionsIndexRoute from "./components/InstitutionsIndexRoute";
import BriefPage from "./components/BriefPage/BriefPage";
import HomePage from "./components/HomePage/HomePage";
import TrialsPage from "./components/Trials/TrialsPage";
import TheWeekPage from "./components/TheWeek/TheWeekPage";
import ProfileScreen from "./components/ProfileScreen";
import FieldInsightsScreen from "./components/FieldInsightsScreen";
import MethodologyPage from "./pages/MethodologyPage";
import AdminPage from "./components/AdminPage/AdminPage";
import WatchlistsPage from "./components/WatchlistsPage/WatchlistsPage";
import FollowUpsPage from "./components/FollowUpsPage/FollowUpsPage";
import PublicationsListPage from "./components/PublicationsListPage/PublicationsListPage";
import HcpPublicationsPage from "./components/PublicationsListPage/HcpPublicationsPage";
import HcpPairPublicationsPage from "./components/PublicationsListPage/HcpPairPublicationsPage";
import HcpPositionsPage from "./components/HcpPositionsPage";
import DOLHeroPanel from "./components/DOLHeroPanel";
import SocialPage from "./components/SocialPage";
import SocialVoicePage from "./components/SocialVoicePage";
import InstitutionsInTerritoryPanel from "./components/InstitutionsInTerritoryPanel";
import ScoringExplainedModal, {
  type ScoringExplainedScrollTarget,
} from "./components/ScoringExplainedModal";
import type { HCP as UIHCP } from "./data/hcpData";
import {
  getCommunity,
  getEstablished,
  getRisingStars,
  getTAIdForLabel,
} from "./lib/api";
import ActiveFilterPills from "./components/ActiveFilterPills";
import FilterDrawer from "./components/FilterDrawer";
import { useFilterContext, statesFromTerritory } from "./lib/filter-context";
import { TrackProvider, useTrack } from "./lib/TrackContext";
import { TAProvider, deriveTAValue, useTA } from "./lib/TAContext";
import {
  buildHcpDetailPath,
  getIndicationTaId,
  indicationLabelToSlug,
  resolveFeedRoute,
  taLabelToApiSlug,
  taSlugToLabel,
} from "./lib/routeSlugs";
import type { CohortFeedResult, RisingStar } from "./lib/types";
import DemoPage from "./pages/DemoPage";
import PulsePage from "./components/Pulse/PulsePage";
import CongressCalendarPage from "./components/Congress/CongressCalendarPage";
import CongressDetailPage from "./components/Congress/CongressDetailPage";
import ForumIndexPage from "./components/FieldIntelligenceForum/ForumIndexPage";
import ThreadPage from "./components/FieldIntelligenceForum/ThreadPage";
import ModerationPage from "./components/FieldIntelligenceForum/ModerationPage";
type AppHCP = Omit<UIHCP, "id"> & {
  id: string;
  hcp_id?: string;
  cohort_classification?: string | null;
  medicareVolume?: number | null;
  distinctCompanies?: number | null;
  careerYears?: number | null;
  totalCareerPubs?: number | null;
  openPaymentsLifetime?: number | null;
  cohortScore?: number | null;
  institutionShort?: string | null;
  nppesPracticeCity?: string | null;
  nppesPracticeState?: string | null;
  nppesPracticeSetting?: string | null;
  nppesPracticeAddress?: string | null;
  nppesPracticeZip?: string | null;
  institutionFull?: string | null;
  npiNumber?: string | null;
  npiSpecialty?: string | null;
  paymentsByYear?: UIHCP["paymentsByYear"];
  beneficiariesByYear?: UIHCP["beneficiariesByYear"];
  engagementMix?: UIHCP["engagementMix"];
};

const FEED_PAGE_SIZE = 20;

function isCohortFeedTrack(track: string): boolean {
  return track === "established" || track === "community" || track === "rising-stars";
}

function isTelescopeAvailable(ta: string, indication: string): boolean {
  if (ta === "Oncology") return indication === "All" || indication === "NSCLC";
  if (ta === "Immunology") return indication === "Atopic Dermatitis";
  return false;
}

function formatPublicationVelocity(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}`;
}

function formatTherapeuticAreaLabel(value: string | null | undefined): string {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "nsclc") return "NSCLC";
  if (v === "rare-disease") return "Rare Disease";
  if (v === "hepatology") return "Hepatology";
  if (v === "oncology") return "Oncology";
  return value ?? "";
}

function mapRisingStarToHCP(item: RisingStar): AppHCP {
  return {
    id: item.id ?? item.hcp_id ?? "",
    hcp_id: item.hcp_id ?? item.id ?? "",
    name: `${item.first_name} ${item.last_name}`.trim(),
    institution: item.institution,
    specialty: formatTherapeuticAreaLabel(item.therapeutic_area),
    score: item.composite_score,
    normalizedScore: Number(item.normalized_score ?? 0),
    firstPubYear: Number(item.firstPubYear ?? item.first_pub_year ?? 0),
    explanation: item.narrative ?? "Narrative generating � check back soon.",
    pubVel: formatPublicationVelocity(item.pub_velocity),
    citTraj: item.citTraj ?? null,
    trialScore: item.trialScore ?? null,
    country: item.country ?? null,
    narrative: item.narrative ?? null,
    why_now: item.why_now ?? null,
    engagement_angle: item.engagement_angle ?? null,
    caution_flags: item.caution_flags ?? null,
    signal_strength: item.signal_strength ?? null,
    h_index: item.h_index ?? null,
    rank: item.rank,
    scope: item.scope,
    global_rank: item.global_rank ?? null,
    tier: item.tier ?? null,
    cohort_classification: item.cohort_classification ?? null,
    medicareVolume: item.medicare_volume ?? null,
    distinctCompanies: item.distinct_companies ?? null,
    careerYears: item.career_years ?? null,
    totalCareerPubs: item.total_career_pubs ?? null,
    citedByCount: item.citedByCount ?? item.total_citations ?? null,
    hIndex: item.hIndex ?? item.h_index ?? null,
    worksCount: item.worksCount ?? item.works_count ?? null,
    openPaymentsLifetime: item.open_payments_lifetime ?? null,
    cohortScore: item.cohort_score ?? null,
    scientificInfluencePctile: item.scientific_influence_pctile ?? null,
    networkInfluencePctile: item.network_influence_pctile ?? null,
    pharmaEngagementPctile: item.pharma_engagement_pctile ?? null,
    institutionShort: item.institution_normalized ?? null,
    nppesPracticeCity: item.nppes_practice_city ?? null,
    nppesPracticeState: item.nppes_practice_state ?? null,
    nppesPracticeSetting: item.nppes_practice_setting ?? null,
    nppesPracticeZip: item.nppes_practice_zip ?? null,
    institutionFull: item.institution_full ?? null,
    npiNumber: item.npi_number ?? null,
    npiSpecialty: item.npi_specialty ?? null,
    paymentsByYear: item.paymentsByYear ?? null,
    beneficiariesByYear: item.beneficiariesByYear ?? null,
    engagementMix: item.engagementMix ?? null,
    rising_star_percentile: item.rising_star_percentile ?? null,
    momentum_component: item.momentum_component ?? null,
    visibility_component: item.visibility_component ?? null,
    scientific_momentum_percentile: item.scientific_momentum_percentile ?? null,
    network_momentum_percentile: item.network_momentum_percentile ?? null,
    scientific_visibility_percentile: item.scientific_visibility_percentile ?? null,
    network_visibility_percentile: item.network_visibility_percentile ?? null,
    archetype: item.archetype ?? null,
    us_rank: item.us_rank ?? null,
    scope_rank: item.scope_rank ?? null,
    emergence_pctile: item.emergence_pctile ?? null,
    rising_model: item.rising_model,
    is_industry_affiliated: item.is_industry_affiliated,
  };
}

const HOME_INDICATION_COUNT = 287;

function LandingRoute() {
  const navigate = useNavigate();
  return <LinkedInAuthScreen onAuth={() => navigate("/me")} />;
}

function FeedLayout({
  forcedDashboard,
  forcedIndication,
}: { forcedDashboard?: string; forcedIndication?: string } = {}) {
  const { track, setTrack } = useTrack();
  const { region, regions, states, national, themeIds, setStates, userTerritory, hydrateFromProfile } = useFilterContext();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const route = resolveFeedRoute({
    ta: params.ta,
    dashboard: forcedDashboard ?? params.dashboard,
    indication: forcedIndication ?? params.indication,
    isHomePath: location.pathname === "/",
  });
  const selectedTA = route.taLabel;
  const selectedIndication = route.indicationLabel;
  const indicationTaId = getIndicationTaId(selectedTA, selectedIndication);

  // Phase 1a: mirror the URL-resolved TA into TAContext (the URL stays authoritative
  // on feed routes; the context reflects it). No consumer reads it yet.
  const { setTA } = useTA();
  useEffect(() => {
    setTA(route.taSlug, route.indicationSlug);
  }, [route.taSlug, route.indicationSlug, setTA]);

  // Phase 1b.2: the feed's AD branches derive their TA from the ROUTE via TAContext's
  // pure deriveTAValue — NOT from useTA(), whose value is mirrored by the effect above and
  // so still holds the previous TA on the render a switch happens. Reading the lagging
  // value here would compute isAdFeed=false for the first AD render/effect pass, and the
  // cohort effect below (deps: selectedTA/indicationTaId) would never re-fire to correct
  // it — AD Rising would silently keep region/US instead of its global default.
  // Route-derived is exactly equivalent to the old `indicationTaId === <AD uuid>` compare
  // on every route (incl. Immunology "All", which maps to AD) and is correct at render N.
  const feedDataSlug = useMemo(
    () => deriveTAValue(route.taSlug, route.indicationSlug).dataSlug,
    [route.taSlug, route.indicationSlug],
  );
  const isAdFeed = feedDataSlug === "atopic-dermatitis";
  const [indicationCount, setIndicationCount] = useState<number | null>(
    route.indicationCount ?? HOME_INDICATION_COUNT,
  );
  // Immersive Skyview is a desktop treatment; mobile keeps the stacked list under the nav.
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const [trayOpen, setTrayOpen] = useState(false);
  const [activeHCP, setActiveHCP] = useState<AppHCP | null>(null);
  const [hcpList, setHcpList] = useState<AppHCP[]>([]);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedEmptyReason, setFeedEmptyReason] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingHCPs, setLoadingHCPs] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [scoringExplainedOpen, setScoringExplainedOpen] = useState(false);
  const [scoringExplainedScroll, setScoringExplainedScroll] = useState<ScoringExplainedScrollTarget | null>(null);
  const [telescopeSelectedHcp, setTelescopeSelectedHcp] = useState<{
    id: string;
    name: string;
    institution: string;
    cohort: string;
    rank: number;
    score: number;
  } | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [backToTopHovered, setBackToTopHovered] = useState(false);

  useEffect(() => {
    setTrack(route.track);
  }, [route.track, setTrack]);

  // Telescope swaps its node/edge source when the TA changes. Clear any open
  // drawer selection on that switch so a stale researcher (e.g. an NSCLC node
  // absent from the AD graph) can't persist across TAs. Fires both directions.
  useEffect(() => {
    setTelescopeSelectedHcp(null);
  }, [indicationTaId]);

  useEffect(() => {
    setIndicationCount(route.indicationCount);
  }, [route.indicationCount, route.indicationLabel, route.taLabel]);

  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 400);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.pathname]);

  function formatUpdatedLabel() {
    if (!lastUpdatedAt) return "Updated just now";
    const diffMs = Date.now() - lastUpdatedAt.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins <= 0) return "Updated just now";
    if (mins === 1) return "Updated 1 min ago";
    return `Updated ${mins} mins ago`;
  }


  function formatSectionHeaderLabel(): string {
    const taLabel =
      track === "skyview" && isTelescopeAvailable(selectedTA, selectedIndication)
        ? selectedTA === "Immunology"
          ? "Immunology (Atopic Dermatitis) - Telescope"
          : "Oncology (NSCLC) - Telescope"
        : selectedTA;
    if (selectedIndication === "All") return taLabel;
    return `${taLabel} \u2014 ${selectedIndication}`;
  }

  useEffect(() => {
    setScoringExplainedOpen(false);
    setScoringExplainedScroll(null);
  }, [location.pathname]);

  async function fetchHCPs(loadingAsRefresh = false) {
    if (!isCohortFeedTrack(track) || !route.indicationDataActive) {
      setHcpList([]);
      setFeedTotal(0);
      setFeedEmptyReason(null);
      return;
    }
    // AD Community renders the CommunityExplorer directory; skip getCommunity.
    if (track === "community" && isAdFeed) {
      setHcpList([]);
      setFeedTotal(0);
      setFeedEmptyReason(null);
      return;
    }
    try {
      if (loadingAsRefresh) setRefreshingFeed(true);
      else setLoadingHCPs(true);
      setFeedOffset(0);
      const taSlug = taLabelToApiSlug(selectedTA);
      // AD RISING defaults to global scope (82% intl). Gated on the rising track so
      // AD Established/Community stay region/US (their RPCs still bail on global).
      const isAdRising = isAdFeed && track === "rising-stars";
      const filters = {
        therapeuticArea: taSlug, region, states, national, themeIds, taId: indicationTaId,
        ...(isAdRising ? { scope: "global" as const } : {}),
      };
      let data: CohortFeedResult | null = null;
      if (track === "established") {
        ({ data } = await getEstablished(filters, FEED_PAGE_SIZE, { offset: 0 }));
      } else if (track === "community") {
        ({ data } = await getCommunity(filters, FEED_PAGE_SIZE, { offset: 0 }));
      } else {
        ({ data } = await getRisingStars(filters, FEED_PAGE_SIZE, { offset: 0 }));
      }
      const mapped = (data?.rows ?? []).map(mapRisingStarToHCP);
      setHcpList(mapped);
      if (data) {
        setFeedTotal(data.total);
        setFeedEmptyReason(data.emptyReason ?? null);
      } else {
        setFeedEmptyReason(null);
      }
      setLastUpdatedAt(new Date());
    } finally {
      if (loadingAsRefresh) setRefreshingFeed(false);
      else setLoadingHCPs(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (!isCohortFeedTrack(track) || !route.indicationDataActive) {
        setHcpList([]);
        setFeedOffset(0);
        setFeedTotal(0);
        setFeedEmptyReason(null);
        setLastUpdatedAt(new Date());
        setLoadingHCPs(false);
        return;
      }
      // AD Community renders the CommunityExplorer directory via its own RPC; skip
      // the unused getCommunity round-trip on this branch.
      if (track === "community" && isAdFeed) {
        setHcpList([]);
        setFeedOffset(0);
        setFeedTotal(0);
        setFeedEmptyReason(null);
        setLastUpdatedAt(new Date());
        setLoadingHCPs(false);
        return;
      }
      setLoadingHCPs(true);
      setFeedOffset(0);
      setFeedTotal(0);
      const taSlug = taLabelToApiSlug(selectedTA);
      // AD RISING defaults to global scope (82% intl). Gated on the rising track so
      // AD Established/Community stay region/US (their RPCs still bail on global).
      const isAdRising = isAdFeed && track === "rising-stars";
      const filters = {
        therapeuticArea: taSlug, region, states, national, themeIds, taId: indicationTaId,
        ...(isAdRising ? { scope: "global" as const } : {}),
      };
      let data: CohortFeedResult | null = null;
      if (track === "established") {
        ({ data } = await getEstablished(filters, FEED_PAGE_SIZE, { offset: 0 }));
      } else if (track === "community") {
        ({ data } = await getCommunity(filters, FEED_PAGE_SIZE, { offset: 0 }));
      } else {
        ({ data } = await getRisingStars(filters, FEED_PAGE_SIZE, { offset: 0 }));
      }
      if (cancelled) return;

      const mapped = (data?.rows ?? []).map(mapRisingStarToHCP);
      setHcpList(mapped);
      if (data) {
        setFeedTotal(data.total);
        setFeedEmptyReason(data.emptyReason ?? null);
      } else {
        setFeedEmptyReason(null);
      }
      setLastUpdatedAt(new Date());
      setLoadingHCPs(false);
    }

    fetchData();

    return () => {
      cancelled = true;
    };
    // isAdFeed is route-derived, so it flips on the SAME render as selectedTA/indicationTaId
    // — listing it adds no extra fire, it just keeps the dep list honest about the read.
  }, [selectedTA, track, region, regions, states, themeIds, route.indicationDataActive, indicationTaId, isAdFeed]);

  async function loadMore() {
    if (!isCohortFeedTrack(track)) return;
    if (track === "community" && isAdFeed) return;
    const nextOffset = feedOffset + FEED_PAGE_SIZE;
    const taSlug = taLabelToApiSlug(selectedTA);
    // AD RISING defaults to global scope (82% intl). Gated on the rising track so
    // AD Established/Community stay region/US (their RPCs still bail on global).
    const isAdRising = isAdFeed && track === "rising-stars";
    const filters = {
      therapeuticArea: taSlug, region, states, themeIds, taId: indicationTaId,
      ...(isAdRising ? { scope: "global" as const } : {}),
    };
    setLoadingMore(true);
    try {
      let data;
      if (track === "established") {
        ({ data } = await getEstablished(filters, FEED_PAGE_SIZE, { offset: nextOffset }));
      } else if (track === "community") {
        ({ data } = await getCommunity(filters, FEED_PAGE_SIZE, { offset: nextOffset }));
      } else {
        ({ data } = await getRisingStars(filters, FEED_PAGE_SIZE, { offset: nextOffset }));
      }
      const mapped = (data?.rows ?? []).map(mapRisingStarToHCP);
      setHcpList((prev) => [...prev, ...mapped]);
      setFeedOffset(nextOffset);
      if (data) setFeedTotal(data.total);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleCardPress(hcp: AppHCP) {
    const hcpId = hcp.hcp_id ?? hcp.id;
    if (hcpId) navigate(buildHcpDetailPath(hcpId), { state: { taLabel: selectedTA, taId: indicationTaId } });
  }

  function handleAddPress(hcp: AppHCP) {
    setActiveHCP(hcp);
    setTrayOpen(true);
  }

  function handleCloseTray() {
    setTrayOpen(false);
  }

  function handleAddNoteFromTray() {
    setTrayOpen(false);
    const hcpId = activeHCP?.hcp_id ?? activeHCP?.id;
    if (hcpId) navigate(buildHcpDetailPath(hcpId), { state: { taLabel: selectedTA, taId: indicationTaId } });
  }

  async function handleSearchSelect(hcpId: string, _taId: string) {
    navigate(buildHcpDetailPath(hcpId), { state: { taLabel: selectedTA } });
  }

  const showInactiveIndicationEmpty =
    isCohortFeedTrack(track) && !route.indicationDataActive;

  // Immersive Skyview: the sky fills the whole viewport and the chrome floats over it.
  // Only when the Telescope is actually available for the current TA/indication (else the
  // "not available" card renders in the normal stacked layout).
  const telescopeImmersive =
    !isNarrow && track === "skyview" && isTelescopeAvailable(selectedTA, selectedIndication);
  // The SkyView surface (desktop immersive AND mobile list) drops PeopleNavStrip:
  // its cohort links were the last remaining path to the card feed. Gated on the
  // surface, not on `immersive`, so mobile is covered too.
  const onSkyview = track === "skyview" && isTelescopeAvailable(selectedTA, selectedIndication);

  return (
    <>
      {/* Chrome consolidation 2026-08-05: the feed rides AppLayout like every other
          authenticated surface — NavBar mounts ABOVE the width column (ending the
          avatar clip: the bar's 1120 content row was clipped inside this 880
          overflowX:hidden column), GlobalFooter comes from the layout, and the
          translucent SkyView bar is AppLayout's navTranslucent pass-through. */}
      <AppLayout width="reading" navTranslucent={telescopeImmersive}>
      <div
        className="fm-screen"
        style={{
          // Immersive Telescope: transparent so the fixed full-bleed sky shows through.
          backgroundColor: telescopeImmersive ? "transparent" : undefined,
          fontFamily: "system-ui, -apple-system, sans-serif",
          overflowX: "hidden",
        }}
      >
      {/* Search left the bar (NAV-BUILD-01) — the feed keeps it in its own header,
          absent when no TA id resolves. Skyview carries its own "Fly to a researcher"
          search, so the feed search is dropped in the immersive view. */}
      {/* Mobile SkyView drops the inline bar too: the NavBar magnifier is the one
          search (platform pattern), and Sky's mobile list opens with it on-screen. */}
      {!telescopeImmersive && !(isNarrow && onSkyview) && getTAIdForLabel(selectedTA) ? (
        <div style={{ padding: "8px 16px 0" }}>
          <SearchBar
            variant="inline"
            currentTaId={getTAIdForLabel(selectedTA) as string}
            onSelect={(hcpId, taId) => void handleSearchSelect(hcpId, taId)}
          />
        </div>
      ) : null}

      {/* PeopleNavStrip (frame 46473259) — the "ledger register" redesign replaces the
          TAFilterChips + IndicationFilter + DashboardTabs trio: serif TA tabs + roadmap
          dropdown (subject), mono view tabs, and the cohort filter grouped with
          Filters / territory / Landscape (scope). Same handlers, look + organization only. */}
      {!onSkyview && (
        <PeopleNavStrip
          route={route}
          onOpenFilters={() => setFilterDrawerOpen(true)}
          userTerritory={userTerritory}
          showSubjectLine={!telescopeImmersive}
        />
      )}

      {/* DOL hero — cohort-feed data panel. Updated-label, subject title, and the
          Filters / territory / Landscape controls now live in PeopleNavStrip above. */}
      {isCohortFeedTrack(track) && <DOLHeroPanel taSlug={taLabelToApiSlug(selectedTA)} />}

      {/* FI feed track removed 2026-07-31: it rendered mockFieldIntelligencePosts on a
          URL-reachable route as though it were real field intelligence. The forum
          (/field-intelligence) is the one FI system. SurfaceHCPForm is retained
          unrouted — its chip flow migrates into the forum. */}
      {track === "skyview" ? (
        isTelescopeAvailable(selectedTA, selectedIndication) ? (
          // Telescope Final (frame ea483f5c): self-contained constellation field + focus
          // orbit + off-field reveal + mobile list. Replaces the old Telescope +
          // TelescopeDrawer + TelescopeLegend trio (retained unrouted). Reads the static
          // enriched JSON; opening a profile routes through the same search-select path.
          <TelescopeField
            taId={indicationTaId}
            onOpenProfile={(hcpId) => {
              const taId = getTAIdForLabel(selectedTA);
              if (taId) void handleSearchSelect(hcpId, taId);
              else navigate(`/hcp/${hcpId}`);
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              minHeight: "400px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(13, 13, 16, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "4px",
              color: "rgba(232, 230, 223, 0.7)",
              textAlign: "center",
              padding: "40px",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "rgba(232, 230, 223, 1.0)",
                marginBottom: "12px",
              }}
            >
              Telescope is currently available for Oncology (NSCLC) and Immunology (Atopic Dermatitis)
            </div>
            <div style={{ fontSize: "13px", maxWidth: "480px", lineHeight: 1.5 }}>
              {selectedTA === "Immunology"
                ? "Select the Atopic Dermatitis indication under Immunology to explore its collaboration network. Other immunology indications are in development."
                : selectedTA === "Oncology"
                ? "Select the All or NSCLC indication under Oncology to explore the NSCLC collaboration network. Other oncology indications are in development."
                : "Hepatology and Rare Disease coverage are in development. Select Oncology (NSCLC) or Immunology (Atopic Dermatitis) to explore a collaboration network."}
            </div>
          </div>
        )
      ) : isCohortFeedTrack(track) ? (
        // AD Community renders the practitioner directory (server-side RPC over
        // community_practitioners); every other TA/cohort keeps the card feed.
        track === "community" && isAdFeed ? (
          <CommunityExplorer taLabel={selectedIndication} />
        ) : (
        <>
        {route.indicationDataActive ? <InstitutionsInTerritoryPanel taSlug={taLabelToApiSlug(selectedTA)} taId={indicationTaId} /> : null}
        <ActiveFilterPills taSlug={taLabelToApiSlug(selectedTA)} />
        <div className="fm-card-grid" style={{ paddingBottom: 24 }}>
          {showInactiveIndicationEmpty ? (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "32px 16px",
                textAlign: "center",
                color: "rgba(232, 230, 223, 0.55)",
                fontSize: 13,
                lineHeight: 1.5,
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 4,
                margin: "0 16px",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E6DF", marginBottom: 8 }}>
                {selectedIndication} — coming soon
              </div>
              <div>
                This indication is not yet active in FieldMark. Select an active indication to
                browse the cohort.
              </div>
            </div>
          ) : loadingHCPs ? (
            <div style={{ color: "#6B6A65", padding: "8px 16px" }}>Loading...</div>
          ) : feedEmptyReason === "community-non-us" ? (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "48px 24px",
                textAlign: "center",
                color: "#888076",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  color: "#E8E6DF",
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                Community cohort not available outside the US
              </div>
              The Community cohort is built from US-only data sources (NPPES, CMS Open
              Payments, Medicare Provider Data). Switch to the US region to see community
              HCPs, or select a different cohort track for the current region.
            </div>
          ) : (
            <>
              {hcpList.map((hcp) => (
                <HCPCard
                  key={hcp.id}
                  hcp={hcp as unknown as UIHCP}
                  onAddPress={(cardHcp) => handleAddPress(cardHcp as unknown as AppHCP)}
                  onCardPress={(cardHcp) => handleCardPress(cardHcp as unknown as AppHCP)}
                  onScoringExplainedPress={(section) => {
                    setScoringExplainedScroll(section);
                    setScoringExplainedOpen(true);
                  }}
                />
              ))}
              {hcpList.length < feedTotal && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    width: "100%",
                    padding: "24px 16px 8px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    style={{
                      width: "auto",
                      minWidth: 200,
                      maxWidth: 320,
                      padding: "10px 24px",
                      backgroundColor: "#1A3D2E",
                      border: "1px solid #4ADE80",
                      color: "#4ADE80",
                      fontSize: 13,
                      lineHeight: 1,
                      borderRadius: 3,
                      cursor: loadingMore ? "not-allowed" : "pointer",
                      opacity: loadingMore ? 0.6 : 1,
                      fontFamily: "monospace",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {loadingMore ? "Loading..." : `Load ${FEED_PAGE_SIZE} More HCPs`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        </>
        )
      ) : null}

      <FilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        taSlug={taLabelToApiSlug(selectedTA)}
      />

      {/* Action Tray */}
        <ActionTray
          open={trayOpen}
          onClose={handleCloseTray}
          hcpName={activeHCP?.name ?? ""}
          onAddNote={handleAddNoteFromTray}
        />

      </div>
      </AppLayout>

      {showBackToTop && !trayOpen && (
        <button
          type="button"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onMouseEnter={() => setBackToTopHovered(true)}
          onMouseLeave={() => setBackToTopHovered(false)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 40,
            height: 40,
            minHeight: 0,
            minWidth: 40,
            borderRadius: "50%",
            backgroundColor: "#0D0D10",
            border: `1px solid ${backToTopHovered ? "#6B6A65" : "#1E1E22"}`,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            cursor: "pointer",
            zIndex: 100,
            opacity: 1,
            pointerEvents: "auto",
            transition: "border-color 200ms ease",
          }}
        >
          <ArrowUp size={18} color="#E8E6DF" aria-hidden />
        </button>
      )}
      <ScoringExplainedModal
        open={scoringExplainedOpen}
        onClose={() => {
          setScoringExplainedOpen(false);
          setScoringExplainedScroll(null);
        }}
        scrollToSection={scoringExplainedScroll ?? undefined}
      />
    </>
  );
}

export default function App() {
  return (
    <TrackProvider>
      <TAProvider>
      <Routes>
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/pulse" element={<PulsePage />} />
      <Route path="/trials" element={<TrialsPage />} />
      <Route path="/pulse/:ta" element={<PulsePage />} />
      <Route path="/join/:code" element={<SignupScreen />} />
      <Route path="/join" element={<SignupScreen />} />
      <Route
        path="*"
        element={
      <AuthWrapper>
        <RelationshipsProvider>
          <Routes>
          <Route path="/landing" element={<LandingRoute />} />
          <Route path="/welcome" element={<WelcomeWizard />} />
          <Route path="/me" element={<HomePage />} />
          <Route path="/me/week" element={<TheWeekPage />} />
          <Route path="/me/settings" element={<ProfileScreen />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/me/insights" element={<FieldInsightsScreen />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/me/watchlists" element={<WatchlistsPage />} />
          <Route path="/me/watchlists/:watchlistId" element={<WatchlistsPage />} />
          <Route path="/me/follow-ups" element={<FollowUpsPage />} />
          <Route path="/congress" element={<CongressCalendarPage />} />
          <Route path="/congress/:slug" element={<CongressDetailPage />} />
          {/* Social — top-level destination (NavBar SOCIAL), TA-scoped like Pulse.
              Placeholder surface until the Public Conversation build lands. The old
              /:ta/social/:indication feed track is retired (slug mapping removed). */}
          <Route path="/social" element={<SocialPage />} />
          {/* Per-voice stream — keyed on handle; platform implicit ('twitter')
              until bluesky capture ships, then the route grows a platform
              segment. MUST precede /social/:ta or "voice" parses as a TA slug. */}
          <Route path="/social/voice/:handle" element={<SocialVoicePage />} />
          <Route path="/social/:ta" element={<SocialPage />} />
          <Route path="/assets" element={<AssetsIndexPage />} />
          {/* Rising ledger (register + quadrant modes) — the rising surface's own
              board, docs/design/Rising Surface.dc.html. Runs ALONGSIDE the cohort
              ledger's rising view for now; repointing /cohorts/ledger/rising-stars
              here is an open decision. */}
          <Route path="/rising" element={<RisingLedger />} />
          <Route path="/cohorts/ledger" element={<CohortLedger />} />
          {/* Addressable cohort (2026-07-31): established | rising-stars | community.
              Bare /cohorts/ledger stays routed as the Established default. */}
          <Route path="/cohorts/ledger/:cohort" element={<CohortLedger />} />
          <Route path="/assets/:slug" element={<AssetPage />} />
          <Route path="/field-intelligence" element={<ForumIndexPage />} />
          <Route path="/field-intelligence/thread/:id" element={<ThreadPage />} />
          <Route path="/field-intelligence/moderation" element={<ModerationPage />} />
          {/* Root → workspace (2026-08-07): every "Home" affordance already means /me;
              the browse feed keeps its real routes (/:ta, /:ta/:dashboard). The old
              root feed was the last old-generation surface in the landing slot —
              FeedLayout/HCPCard rebuild remains on the §7 list. */}
          <Route path="/" element={<Navigate to="/me" replace />} />
          <Route path="/landscape/:ta" element={<LandscapeRoute />} />
          <Route path="/institutions/:ta" element={<InstitutionsIndexRoute />} />
          <Route path="/institution/:slug/publications" element={<PublicationsListPage />} />
          <Route path="/hcp/:id/publications" element={<HcpPublicationsPage />} />
          <Route path="/hcp/:id/publications-with/:partnerId" element={<HcpPairPublicationsPage />} />
          <Route path="/hcp/:id/positions" element={<HcpPositionsPage />} />
          <Route path="/hcp/:id/profile" element={<ProfileDispatch />} />
          <Route path="/institution/:slug" element={<InstitutionRoute />} />
          <Route path="/hcp/:id/brief" element={<BriefPage />} />
          {/* Practice-first community profile — runs ALONGSIDE the two-spine profile
              (frame: Community HCP Profile Practice First.dc.html); not a cutover. */}
          <Route path="/hcp/:id/practice" element={<PracticeFirstProfile />} />
          {/* CUTOVER (stage 4): the primary HCP surface is now the two-spine profile.
              /hcp/:id renders ProfileDispatch; /hcp/:id/profile also resolves to it (kept
              so existing /profile links + bookmarks work). DetailScreen / HCPDetailRoute
              were deleted 2026-08-05 (dead-code sweep, docs/design/DESIGN_SYSTEM_AUDIT.md
              §5.16) — recover from git history if ever needed. */}
          <Route path="/hcp/:id" element={<ProfileDispatch />} />
          {/* FI feed track routes removed 2026-07-31 — the forum (/field-intelligence)
              is the one FI system. Old /:ta/field-intelligence URLs fall through the
              greedy /:ta/:dashboard match to the default cohort feed. */}
          <Route path="/:ta/:dashboard/:indication" element={<FeedLayout />} />
          <Route path="/:ta/:dashboard" element={<FeedLayout />} />
          <Route path="/:ta" element={<FeedLayout />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RelationshipsProvider>
      </AuthWrapper>
        }
      />
      </Routes>
      </TAProvider>
    </TrackProvider>
  );
}

