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
import { CONTENT_WIDTH } from "./lib/designTokens";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { ArrowUp } from "lucide-react";
import Telescope from "./components/Telescope";
import TelescopeDrawer from "./components/TelescopeDrawer";
import TelescopeLegend from "./components/TelescopeLegend";
import LinkedInAuthScreen from "./components/LinkedInAuthScreen";
import SignupScreen from "./components/SignupScreen";
import AuthWrapper from "./components/AuthWrapper";
import { RelationshipsProvider } from "./contexts/RelationshipsContext";
import WelcomeWizard from "./components/WelcomeWizard";
import NavBar from "./components/NavBar";
import SearchBar from "./components/SearchBar";
import FieldIntelligenceThread from "./components/FieldIntelligenceThread";
import TAFilterChips from "./components/TAFilterChips";
import HCPCard from "./components/HCPCard";
import CommunityExplorer from "./components/CommunityExplorer";
import ActionTray from "./components/ActionTray";
import DetailScreen from "./components/DetailScreen";
import NoteEntryScreen from "./components/NoteEntryScreen";
import BibliographyScreen from "./components/BibliographyScreen";
import AssetsIndexPage from "./components/Assets/AssetsIndexPage";
import AssetPage from "./components/Assets/AssetPage";
import CohortLedger from "./components/Cohorts/CohortLedger";
import HcpProfileBrief from "./components/Profile/HcpProfileBrief";
import ProfileDispatch from "./components/Profile/ProfileDispatch";
import LandscapeScreen from "./components/LandscapeScreen";
import LandscapeRoute from "./components/LandscapeRoute";
import InstitutionRoute from "./components/InstitutionRoute";
import InstitutionsIndexRoute from "./components/InstitutionsIndexRoute";
import BriefPage from "./components/BriefPage/BriefPage";
import HomePage from "./components/HomePage/HomePage";
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
import CityFeedScreen from "./components/CityFeedScreen";
import DOLHeroPanel from "./components/DOLHeroPanel";
import SocialTrackEmpty from "./components/SocialTrackEmpty";
import DashboardTabs from "./components/DashboardTabs";
import IndicationFilter from "./components/IndicationFilter";
import FieldIntelligence from "./components/FieldIntelligence";
import SurfaceHCPForm from "./components/SurfaceHCPForm";
import GlobalFooter from "./components/GlobalFooter";
import InstitutionsInTerritoryPanel from "./components/InstitutionsInTerritoryPanel";
import { FiToast } from "./components/FieldIntelligenceShared";
import ScoringExplainedModal, {
  type ScoringExplainedScrollTarget,
} from "./components/ScoringExplainedModal";
import type { HCP as UIHCP } from "./data/hcpData";
import {
  apiSlugForTaId,
  getCommunity,
  getEstablished,
  getHCPDetail,
  getRisingStars,
  getTAIdForLabel,
  resolvePrimaryTaId,
} from "./lib/api";
import ActiveFilterPills from "./components/ActiveFilterPills";
import FilterButton from "./components/FilterButton";
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
import type { CohortFeedResult, HCPDetailResponse, RisingStar } from "./lib/types";
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

const EMPTY_HCP: AppHCP = {
  id: "",
  name: "",
  institution: "",
  specialty: "",
  score: 0,
  normalizedScore: 0,
  firstPubYear: 0,
  explanation: "",
  pubVel: "--",
  citTraj: null,
  trialScore: null,
  medicareVolume: null,
  distinctCompanies: null,
  careerYears: null,
  totalCareerPubs: null,
  openPaymentsLifetime: null,
  cohortScore: null,
  institutionShort: null,
  nppesPracticeCity: null,
  nppesPracticeState: null,
  nppesPracticeSetting: null,
  nppesPracticeAddress: null,
  nppesPracticeZip: null,
  institutionFull: null,
  npiNumber: null,
  npiSpecialty: null,
};

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

function parseOptionalNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optionalString(v: unknown): string | null {
  if (v == null || String(v).trim() === "") return null;
  return String(v);
}

function detailResponseToRisingStar(detail: HCPDetailResponse): RisingStar {
  const hcp = detail.hcp;
  const score = detail.score ?? {};
  const rank = detail.rank ?? {};
  const medicare = detail.medicare;
  const pay = detail.openPayments;
  const metrics = detail.authorMetrics;

  const id = String(hcp.id ?? "");
  const py2022 = parseOptionalNumber(pay?.py2022_total);
  const py2023 = parseOptionalNumber(pay?.py2023_total);
  const py2024 = parseOptionalNumber(pay?.py2024_total);
  const y2021 = parseOptionalNumber(medicare?.beneficiaries_2021);
  const y2022 = parseOptionalNumber(medicare?.beneficiaries_2022);
  const y2023 = parseOptionalNumber(medicare?.beneficiaries_2023);
  const engagementMix = pay
    ? {
        speakerBureau: parseOptionalNumber(pay.speaker_bureau_3yr),
        consulting: parseOptionalNumber(pay.consulting_3yr),
        honoraria: parseOptionalNumber(pay.honoraria_3yr),
        education: parseOptionalNumber(pay.education_3yr),
        royalty: parseOptionalNumber(pay.royalty_3yr),
        foodBeverage: parseOptionalNumber(pay.food_beverage_3yr),
        travelLodging: parseOptionalNumber(pay.travel_lodging_3yr),
      }
    : null;
  const hasEngagementMix =
    engagementMix != null &&
    Object.values(engagementMix).some((v) => v != null && v > 0);

  return {
    id,
    hcp_id: id,
    first_name: String(hcp.first_name ?? ""),
    last_name: String(hcp.last_name ?? ""),
    institution: String(hcp.institution_normalized ?? hcp.institution_raw ?? ""),
    institution_normalized: optionalString(hcp.institution_normalized),
    nppes_practice_city: optionalString(hcp.nppes_practice_city),
    nppes_practice_state: optionalString(hcp.nppes_practice_state),
    nppes_practice_setting: optionalString(hcp.nppes_practice_setting),
    nppes_practice_zip: optionalString(hcp.nppes_practice_zip),
    institution_full: optionalString(hcp.institution_full),
    npi_number: optionalString(hcp.npi_number),
    npi_specialty: optionalString(hcp.npi_specialty),
    country: String(hcp.country ?? ""),
    therapeutic_area: detail.therapeuticArea,
    narrative: detail.narrative?.narrative_text ?? null,
    why_now: detail.narrative?.why_now ?? null,
    engagement_angle: detail.narrative?.engagement_angle ?? null,
    caution_flags: detail.narrative?.caution_flags ?? null,
    signal_strength: detail.narrative?.signal_strength ?? null,
    tier: score.tier != null ? String(score.tier) : null,
    cohort_classification: optionalString(hcp.cohort_classification),
    cohort_score: parseOptionalNumber(hcp.cohort_score),
    composite_score: Number(score.composite_score ?? 0),
    normalized_score: Number(score.normalized_score ?? 0),
    pub_velocity: Number(score.pub_velocity_score ?? 0),
    citation_trajectory: Number(score.citation_trajectory_score ?? 0),
    trial_score: Number(score.trial_investigator_score ?? 0),
    citTraj: parseOptionalNumber(score.citation_trajectory_score),
    trialScore: parseOptionalNumber(score.trial_investigator_score),
    career_multiplier: 1,
    first_pub_year: Number(hcp.career_first_pub_year ?? 0),
    stored_pubs: Number(hcp.total_career_pubs ?? 0),
    medicare_volume: parseOptionalNumber(medicare?.total_beneficiaries_3yr_unique_est),
    distinct_companies: parseOptionalNumber(pay?.distinct_companies_lifetime),
    open_payments_lifetime: parseOptionalNumber(pay?.total_payments_lifetime),
    career_years: parseOptionalNumber(hcp.nppes_career_stage_years),
    total_career_pubs: parseOptionalNumber(hcp.total_career_pubs),
    citedByCount: parseOptionalNumber(metrics?.cited_by_count),
    hIndex: parseOptionalNumber(metrics?.h_index),
    worksCount: parseOptionalNumber(metrics?.works_count),
    total_citations: parseOptionalNumber(metrics?.cited_by_count),
    h_index: parseOptionalNumber(metrics?.h_index),
    works_count: parseOptionalNumber(metrics?.works_count),
    paymentsByYear:
      py2022 == null && py2023 == null && py2024 == null
        ? null
        : { py2022, py2023, py2024 },
    beneficiariesByYear:
      y2021 == null && y2022 == null && y2023 == null
        ? null
        : { y2021, y2022, y2023 },
    engagementMix: hasEngagementMix ? engagementMix : null,
    rank: rank.rank != null ? Number(rank.rank) : undefined,
    percentile: rank.percentile != null ? Number(rank.percentile) : undefined,
    scope_size: rank.scope_size != null ? Number(rank.scope_size) : undefined,
  };
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

type FeedOverlay = "landscape" | "city-feed" | null;

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
  const [feedOverlay, setFeedOverlay] = useState<FeedOverlay>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [activeHCP, setActiveHCP] = useState<AppHCP | null>(null);
  const [bibYear, setBibYear] = useState<number>(2024);
  const [cityFeedCity, setCityFeedCity] = useState<string>("Chicago, IL");
  const [cityFeedTA, setCityFeedTA] = useState<string>("Rare Disease");
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
  const [surfaceHcpOpen, setSurfaceHcpOpen] = useState(false);
  const [fiToast, setFiToast] = useState<string | null>(null);
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

  function showFiToast(message: string) {
    setFiToast(message);
    window.setTimeout(() => setFiToast(null), 3000);
  }

  function formatSectionHeaderLabel(): string {
    if (track === "field-intelligence") {
      return "Field Intelligence";
    }
    const taLabel =
      track === "telescope" && isTelescopeAvailable(selectedTA, selectedIndication)
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

  if (feedOverlay === "landscape") {
    return (
      <LandscapeScreen
        ta={selectedTA}
        indication={selectedIndication}
        onBack={() => setFeedOverlay(null)}
        onCityPress={(city, ta) => {
          setCityFeedCity(city);
          setCityFeedTA(ta);
          setFeedOverlay("city-feed");
        }}
      />
    );
  }

  if (feedOverlay === "city-feed") {
    return (
      <CityFeedScreen
        city={cityFeedCity}
        ta={cityFeedTA}
        onBack={() => setFeedOverlay("landscape")}
        onDetailHCPChange={(hcp) => {
          const row = hcp as unknown as AppHCP;
          const id = row.hcp_id ?? row.id;
          if (id) navigate(buildHcpDetailPath(String(id)), { state: { taLabel: selectedTA } });
        }}
        onNavigateTo={() => {}}
        bibYear={bibYear}
        onBibYearChange={setBibYear}
      />
    );
  }

  const showInactiveIndicationEmpty =
    isCohortFeedTrack(track) && !route.indicationDataActive;

  return (
    <>
      <div
        className="fm-screen"
        style={{
          backgroundColor: "#0A0A0B",
          minHeight: "100dvh",
          maxWidth: CONTENT_WIDTH.reading,
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
          overflowX: "hidden",
        }}
      >
      <NavBar />
      {/* Search left the bar (NAV-BUILD-01) — the feed keeps it in its own header,
          absent when no TA id resolves. */}
      {getTAIdForLabel(selectedTA) ? (
        <div style={{ padding: "8px 16px 0" }}>
          <SearchBar
            variant="inline"
            currentTaId={getTAIdForLabel(selectedTA) as string}
            onSelect={(hcpId, taId) => void handleSearchSelect(hcpId, taId)}
          />
        </div>
      ) : null}

      <TAFilterChips selected={selectedTA} />

      <IndicationFilter
        therapeuticArea={selectedTA}
        selected={selectedIndication}
        onSelect={(_indication, count) => {
          setIndicationCount(count);
        }}
      />

      <DashboardTabs />

      <div style={{ padding: "0 16px 8px", fontSize: 11, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", letterSpacing: "0.08em", color: "#57534b" }}>
        {formatUpdatedLabel()}
      </div>

      {isCohortFeedTrack(track) && <DOLHeroPanel taSlug={taLabelToApiSlug(selectedTA)} />}

      {/* Section header */}
      <div
        className="fm-feed-section-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px 8px",
        }}
      >
        <span
          className="fm-section-header-left"
          style={{
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#F4F2EC",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          }}
        >
          {formatSectionHeaderLabel()}
        </span>
        {isCohortFeedTrack(track) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FilterButton
              onClick={() => setFilterDrawerOpen(true)}
              taSlug={taLabelToApiSlug(selectedTA)}
            />
            <button
              type="button"
              onClick={() => {
                if (states.length > 0) {
                  setStates([]);
                } else {
                  hydrateFromProfile(userTerritory, statesFromTerritory(userTerritory ?? ""));
                }
              }}
              style={{
                // Territory-active → indigo selection (§5); inactive → warm ghost.
                backgroundColor: states.length > 0 ? "rgba(85,102,232,0.12)" : "transparent",
                border: `1px solid ${states.length > 0 ? "rgba(85,102,232,0.5)" : "rgba(255,255,255,0.09)"}`,
                color: states.length > 0 ? "#AEB4F5" : "#B6B2AA",
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: 12.5,
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                cursor: "pointer",
                marginLeft: 8,
              }}
            >
              {states.length > 0 ? `Territory (${states.length} states)` : "All US"}
            </button>
            <button
              onClick={() => {
                const indSlug = indicationLabelToSlug(selectedTA, selectedIndication);
                navigate(`/landscape/${indSlug === "all" ? "nsclc" : indSlug}`);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                // Landscape control → indigo (navigation, per the design's Landscape button).
                backgroundColor: "rgba(85,102,232,0.10)",
                border: "1px solid rgba(85,102,232,0.40)",
                borderRadius: 8,
                padding: "5px 12px",
                cursor: "pointer",
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0" y="6" width="2" height="4" fill="#AEB4F5" />
                <rect x="4" y="3" width="2" height="7" fill="#AEB4F5" />
                <rect x="8" y="0" width="2" height="10" fill="#AEB4F5" />
              </svg>
              <span style={{ fontSize: 12.5, color: "#AEB4F5" }}>
                {selectedIndication !== "All" ? `${selectedIndication} Landscape` : "Landscape"}
              </span>
            </button>
          </div>
        )}
      </div>

      {track === "field-intelligence" ? (
        <FieldIntelligence
          therapeuticArea={selectedTA}
          selectedIndication={selectedIndication}
          onToast={showFiToast}
          onSurfaceHcp={() => setSurfaceHcpOpen(true)}
        />
      ) : track === "social" ? (
        <SocialTrackEmpty selectedTA={selectedTA} />
      ) : track === "telescope" ? (
        isTelescopeAvailable(selectedTA, selectedIndication) ? (
          <>
            <TelescopeLegend />
            <div
              style={{
                marginTop: "16px",
                marginBottom: "16px",
                padding: "18px 22px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "4px",
                color: "rgba(232, 230, 223, 0.75)",
                fontSize: "13px",
                lineHeight: "1.6",
                fontWeight: 400,
              }}
            >
              {isAdFeed
                ? "Telescope maps the network of HCPs driving clinical and scientific progress in atopic dermatitis. Each star represents a researcher; the lines between them reflect publication collaboration, weighted by shared work. The brightest stars at the center are the field's most recognized KOLs, while the smaller purple stars surrounding them are emerging investigators connected to that core. The brightest purple stars represent the top 100 rising stars in atopic dermatitis — the researchers most likely to become tomorrow's KOLs. Move your cursor to magnify the nearest star and reveal its identity; click any star to view that researcher's profile and closest collaborators. Together, this view surfaces both the established research community and the next generation working alongside it."
                : "Telescope maps the network of HCPs driving clinical and scientific progress in non-small cell lung cancer. Each star represents a US-based researcher; the lines between them reflect publication collaboration, weighted by shared work. The brightest stars at the center are the field's most recognized KOLs, while the smaller purple stars surrounding them are emerging investigators connected to that core. The brightest purple stars represent the top 100 rising stars in NSCLC — the researchers most likely to become tomorrow's KOLs. Move your cursor to magnify the nearest star and reveal its identity; click any star to view that researcher's profile and closest collaborators. Together, this view surfaces both the established research community and the next generation working alongside it."}
            </div>
            <div
              style={{
                width: "100%",
                height: "1000px",
                minHeight: "1000px",
                position: "relative",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "4px",
              }}
            >
              <Telescope
                taId={indicationTaId}
                selectedNodeId={telescopeSelectedHcp?.id ?? null}
                onNodeClick={(node) => setTelescopeSelectedHcp(node)}
              />
              <TelescopeDrawer
                taId={indicationTaId}
                hcp={telescopeSelectedHcp}
                onClose={() => setTelescopeSelectedHcp(null)}
                onViewProfile={(hcpId) => {
                  setTelescopeSelectedHcp(null);
                  const taId = getTAIdForLabel(selectedTA);
                  if (taId) {
                    void handleSearchSelect(hcpId, taId);
                  }
                }}
                onSelectCollaborator={(collab) => setTelescopeSelectedHcp(collab)}
              />
            </div>
          </>
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

        <GlobalFooter onToast={showFiToast} />
      </div>

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
      {surfaceHcpOpen && (
        <SurfaceHCPForm
          onClose={() => setSurfaceHcpOpen(false)}
          onSubmit={() => {
            setSurfaceHcpOpen(false);
            showFiToast("Thanks — we'll review and add this HCP to the platform when confirmed");
          }}
        />
      )}
      <FiToast message={fiToast} />
    </>
  );
}

type HcpDetailSubScreen = "detail" | "note" | "bibliography";

function HCPDetailRoute() {
  const { hcpId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { region } = useFilterContext();
  const navState = location.state as { taLabel?: string; taId?: string } | null;
  const [resolvedTaId, setResolvedTaId] = useState<string | undefined>(navState?.taId);
  const [taResolving, setTaResolving] = useState<boolean>(!navState?.taId);
  const detailTaSlug = resolvedTaId ? apiSlugForTaId(resolvedTaId) : undefined;
  const [subScreen, setSubScreen] = useState<HcpDetailSubScreen>("detail");
  const [hcp, setHcp] = useState<AppHCP>(EMPTY_HCP);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bibYear, setBibYear] = useState(2024);
  const [trayOpen, setTrayOpen] = useState(false);

  // Re-derive the HCP's TA when the caller carried none (refresh, bookmark,
  // deep-link, back-nav). navState.taId always wins when present so in-app
  // context + dual-TA intent are preserved. No silent default to NSCLC.
  useEffect(() => {
    if (navState?.taId) {
      setResolvedTaId(navState.taId);
      setTaResolving(false);
      return;
    }
    if (!hcpId) {
      setTaResolving(false);
      return;
    }
    let cancelled = false;
    setTaResolving(true);
    void (async () => {
      const primary = await resolvePrimaryTaId(hcpId);
      if (cancelled) return;
      setResolvedTaId(primary ?? undefined);
      setTaResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcpId, navState?.taId]);

  useEffect(() => {
    if (!hcpId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (taResolving) return; // wait for TA re-derivation before fetching
    if (!resolvedTaId || !detailTaSlug) {
      // HCP has no TA membership → honest not-found instead of a wrong TA.
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    void (async () => {
      const { data, error } = await getHCPDetail(hcpId, {
        therapeuticArea: detailTaSlug,
        region,
        taId: resolvedTaId,
      });
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setHcp(mapRisingStarToHCP(detailResponseToRisingStar(data)));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [hcpId, region, resolvedTaId, taResolving]);

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  if (loading) {
    return (
      <div
        className="fm-screen"
        style={{
          backgroundColor: "#0A0A0B",
          minHeight: "100dvh",
          maxWidth: CONTENT_WIDTH.reading,
          margin: "0 auto",
          color: "#6B6A65",
          padding: 24,
        }}
      >
        Loading profile...
      </div>
    );
  }

  if (notFound || !hcpId) {
    return (
      <div
        className="fm-screen"
        style={{
          backgroundColor: "#0A0A0B",
          minHeight: "100dvh",
          maxWidth: CONTENT_WIDTH.reading,
          margin: "0 auto",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ color: "#E8E6DF", fontSize: 16, marginBottom: 12 }}>HCP not found</p>
        <p style={{ color: "#6B6A65", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
          We could not load a profile for this link. The HCP may have been removed or the URL may
          be incorrect.
        </p>
        <Link to="/" style={{ color: "#E8A020", fontSize: 14 }}>
          Return to home
        </Link>
      </div>
    );
  }

  if (subScreen === "note") {
    return (
      <NoteEntryScreen
        hcp={hcp as unknown as UIHCP}
        onBack={() => setSubScreen("detail")}
      />
    );
  }

  if (subScreen === "bibliography") {
    return (
      <BibliographyScreen
        hcp={hcp as unknown as UIHCP}
        year={bibYear}
        onBack={() => setSubScreen("detail")}
      />
    );
  }

  return (
    <>
      <DetailScreen
        hcp={hcp as unknown as UIHCP}
        onBack={handleBack}
        onAddNote={() => setSubScreen("note")}
        onYearPress={(year) => {
          setBibYear(year);
          setSubScreen("bibliography");
        }}
        taSlug={detailTaSlug as string}
      />
      <ActionTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        hcpName={hcp.name}
        onAddNote={() => {
          setTrayOpen(false);
          setSubScreen("note");
        }}
      />
    </>
  );
}

function FIThreadRoute() {
  const { ta, threadId } = useParams();
  const navigate = useNavigate();
  const taLabel = taSlugToLabel(ta);
  const [fiToast, setFiToast] = useState<string | null>(null);

  function showFiToast(message: string) {
    setFiToast(message);
    window.setTimeout(() => setFiToast(null), 3000);
  }

  if (!threadId) {
    return <Navigate to={`/${ta ?? "oncology"}/field-intelligence`} replace />;
  }

  return (
    <div
      className="fm-screen"
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: CONTENT_WIDTH.reading,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <NavBar />
      <FieldIntelligenceThread
        postId={threadId}
        onBack={() => navigate(`/${ta ?? "oncology"}/field-intelligence`)}
        onToast={showFiToast}
      />
      <GlobalFooter onToast={showFiToast} />
      <FiToast message={fiToast} />
    </div>
  );
}

function FieldIntelligenceFeedRoute() {
  const params = useParams();
  return (
    <FeedLayout
      forcedDashboard="field-intelligence"
      forcedIndication={params.indication ?? "all"}
    />
  );
}

export default function App() {
  return (
    <TrackProvider>
      <TAProvider>
      <Routes>
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/pulse" element={<PulsePage />} />
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
          <Route path="/me/settings" element={<ProfileScreen />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/me/insights" element={<FieldInsightsScreen />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/me/watchlists" element={<WatchlistsPage />} />
          <Route path="/me/watchlists/:watchlistId" element={<WatchlistsPage />} />
          <Route path="/me/follow-ups" element={<FollowUpsPage />} />
          <Route path="/congress" element={<CongressCalendarPage />} />
          <Route path="/congress/:slug" element={<CongressDetailPage />} />
          <Route path="/assets" element={<AssetsIndexPage />} />
          <Route path="/cohorts/ledger" element={<CohortLedger />} />
          <Route path="/assets/:slug" element={<AssetPage />} />
          <Route path="/field-intelligence" element={<ForumIndexPage />} />
          <Route path="/field-intelligence/thread/:id" element={<ThreadPage />} />
          <Route path="/field-intelligence/moderation" element={<ModerationPage />} />
          <Route path="/" element={<FeedLayout />} />
          <Route path="/landscape/:ta" element={<LandscapeRoute />} />
          <Route path="/institutions/:ta" element={<InstitutionsIndexRoute />} />
          <Route path="/institution/:slug/publications" element={<PublicationsListPage />} />
          <Route path="/hcp/:id/publications" element={<HcpPublicationsPage />} />
          <Route path="/hcp/:id/publications-with/:partnerId" element={<HcpPairPublicationsPage />} />
          <Route path="/hcp/:id/positions" element={<HcpPositionsPage />} />
          <Route path="/hcp/:id/profile" element={<ProfileDispatch />} />
          <Route path="/institution/:slug" element={<InstitutionRoute />} />
          <Route path="/hcp/:hcpId/brief" element={<BriefPage />} />
          <Route path="/hcp/:hcpId" element={<HCPDetailRoute />} />
          <Route
            path="/:ta/field-intelligence/thread/:threadId"
            element={<FIThreadRoute />}
          />
          <Route
            path="/:ta/field-intelligence/:indication"
            element={<FieldIntelligenceFeedRoute />}
          />
          <Route path="/:ta/field-intelligence" element={<FieldIntelligenceFeedRoute />} />
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

