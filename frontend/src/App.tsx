import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import LinkedInAuthScreen from "./components/LinkedInAuthScreen";
import TASelectionScreen from "./components/TASelectionScreen";
import TopBar from "./components/TopBar";
import TAFilterChips from "./components/TAFilterChips";
import HCPCard from "./components/HCPCard";
import ActionTray from "./components/ActionTray";
import DetailScreen from "./components/DetailScreen";
import NoteEntryScreen from "./components/NoteEntryScreen";
import SearchScreen from "./components/SearchScreen";
import BibliographyScreen from "./components/BibliographyScreen";
import ProfileScreen from "./components/ProfileScreen";
import LandscapeScreen from "./components/LandscapeScreen";
import CityFeedScreen from "./components/CityFeedScreen";
import DOLHeroPanel from "./components/DOLHeroPanel";
import SocialTrackEmpty from "./components/SocialTrackEmpty";
import TrackSwitch from "./components/TrackSwitch";
import ScoringExplainedModal, {
  type ScoringExplainedScrollTarget,
} from "./components/ScoringExplainedModal";
import type { HCP as UIHCP } from "./data/hcpData";
import { getHCPDetail, getRisingStars, getTACounts, getTAIdForLabel, getTADisplayName } from "./lib/api";
import { useFilterContext } from "./lib/filter-context";
import { TrackProvider, useTrack } from "./lib/TrackContext";
import type { HCPDetailResponse, RisingStar, TACounts } from "./lib/types";
import { RegionSelector } from "./components/RegionSelector";

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

const EMPTY_HCP: AppHCP = {
  id: "",
  name: "",
  institution: "",
  specialty: "",
  score: 0,
  normalizedScore: 0,
  firstPubYear: 0,
  explanation: "",
  pubVel: "0.0x",
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

function getTASlug(ta: string): string {
  switch (ta) {
    case "Hepatology":
      return "hepatology";
    case "Oncology":
      return "nsclc";
    case "Rare Disease":
    default:
      return "rare-disease";
  }
}

function formatPublicationVelocity(value: number): string {
  if (!Number.isFinite(value)) return "0.0x";
  return `${value.toFixed(1)}x`;
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
    firstPubYear: Number(item.first_pub_year ?? 0),
    explanation: item.narrative ?? "Narrative generating — check back soon.",
    pubVel: formatPublicationVelocity(item.pub_velocity),
    citTraj: item.citTraj ?? null,
    trialScore: item.trialScore ?? null,
    country: item.country ?? null,
    narrative: item.narrative ?? null,
    tier: item.tier ?? null,
    cohort_classification: item.cohort_classification ?? null,
    medicareVolume: item.medicare_volume ?? null,
    distinctCompanies: item.distinct_companies ?? null,
    careerYears: item.career_years ?? null,
    totalCareerPubs: item.total_career_pubs ?? null,
    openPaymentsLifetime: item.open_payments_lifetime ?? null,
    cohortScore: item.cohort_score ?? null,
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
  };
}

type Screen = "auth" | "ta-select" | "feed" | "detail" | "note" | "search" | "bibliography" | "profile" | "landscape" | "city-feed";

function AppContent() {
  const { track } = useTrack();
  const { region } = useFilterContext();
  const [currentScreen, setCurrentScreen] = useState<Screen>("auth");
  const [selectedTA, setSelectedTA] = useState("Rare Disease");
  const [selectedIndication, setSelectedIndication] = useState("All");
  const [indicationCount, setIndicationCount] = useState(2034);
  const [trayOpen, setTrayOpen] = useState(false);
  const [activeHCP, setActiveHCP] = useState<AppHCP | null>(null);
  const [detailHCP, setDetailHCP] = useState<AppHCP>(EMPTY_HCP);
  const [bibYear, setBibYear] = useState<number>(2024);
  const [cityFeedCity, setCityFeedCity] = useState<string>("Chicago, IL");
  const [cityFeedTA, setCityFeedTA] = useState<string>("Rare Disease");
  const [hcpList, setHcpList] = useState<AppHCP[]>([]);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedTotal, setFeedTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingHCPs, setLoadingHCPs] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [taCounts, setTaCounts] = useState<TACounts | null>(null);
  const [scoringExplainedOpen, setScoringExplainedOpen] = useState(false);
  const [scoringExplainedScroll, setScoringExplainedScroll] = useState<ScoringExplainedScrollTarget | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [backToTopHovered, setBackToTopHovered] = useState(false);

  useEffect(() => {
    setScoringExplainedOpen(false);
    setScoringExplainedScroll(null);
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen !== "detail") return;
    const hcpId = detailHCP.id || detailHCP.hcp_id;
    if (!hcpId) return;
    const taSlug = getTASlug(selectedTA);

    let cancelled = false;
    void (async () => {
      const { data, error } = await getHCPDetail(hcpId, {
        therapeuticArea: taSlug,
        region,
      });
      if (cancelled || error || !data) return;
      setDetailHCP(mapRisingStarToHCP(detailResponseToRisingStar(data)));
    })();

    return () => {
      cancelled = true;
    };
  }, [currentScreen, detailHCP.id, detailHCP.hcp_id, selectedTA, region]);

  useEffect(() => {
    if (currentScreen !== "feed") {
      setShowBackToTop(false);
      return;
    }

    function onScroll() {
      setShowBackToTop(window.scrollY > 400);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [currentScreen]);

  function formatUpdatedLabel() {
    if (!lastUpdatedAt) return "Updated just now";
    const diffMs = Date.now() - lastUpdatedAt.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins <= 0) return "Updated just now";
    if (mins === 1) return "Updated 1 min ago";
    return `Updated ${mins} mins ago`;
  }

  async function fetchHCPs(loadingAsRefresh = false) {
    if (track === "social") {
      setHcpList([]);
      setFeedTotal(0);
      return;
    }
    try {
      if (loadingAsRefresh) setRefreshingFeed(true);
      else setLoadingHCPs(true);
      setFeedOffset(0);
      const taSlug = getTASlug(selectedTA);
      const { data } = await getRisingStars(
        { therapeuticArea: taSlug, region },
        FEED_PAGE_SIZE,
        { offset: 0 },
      );
      const mapped = (data?.rows ?? []).map(mapRisingStarToHCP);
      setHcpList(mapped);
      if (data) setFeedTotal(data.total);
      setLastUpdatedAt(new Date());
    } finally {
      if (loadingAsRefresh) setRefreshingFeed(false);
      else setLoadingHCPs(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (track === "social") {
        setHcpList([]);
        setFeedOffset(0);
        setFeedTotal(0);
        setLastUpdatedAt(new Date());
        setLoadingHCPs(false);
        return;
      }
      setLoadingHCPs(true);
      setFeedOffset(0);
      setFeedTotal(0);
      const taSlug = getTASlug(selectedTA);
      const { data } = await getRisingStars(
        { therapeuticArea: taSlug, region },
        FEED_PAGE_SIZE,
        { offset: 0 },
      );
      if (cancelled) return;

      const mapped = (data?.rows ?? []).map(mapRisingStarToHCP);
      setHcpList(mapped);
      if (data) setFeedTotal(data.total);
      setLastUpdatedAt(new Date());
      setLoadingHCPs(false);
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [selectedTA, track, region]);

  async function loadMore() {
    if (track === "social") return;
    const nextOffset = feedOffset + FEED_PAGE_SIZE;
    const taSlug = getTASlug(selectedTA);
    setLoadingMore(true);
    try {
      const { data } = await getRisingStars(
        { therapeuticArea: taSlug, region },
        FEED_PAGE_SIZE,
        { offset: nextOffset },
      );
      const mapped = (data?.rows ?? []).map(mapRisingStarToHCP);
      setHcpList((prev) => [...prev, ...mapped]);
      setFeedOffset(nextOffset);
      if (data) setFeedTotal(data.total);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      const taSlug = getTASlug(selectedTA);
      const { data } = await getTACounts({
        therapeuticArea: taSlug,
        region,
      });
      if (cancelled) return;
      setTaCounts(data);
    }

    fetchCounts();

    return () => {
      cancelled = true;
    };
  }, [selectedTA, region]);

  // Auth flow
  function handleAuth() {
    setCurrentScreen("ta-select");
  }

  function handleTASkip() {
    setCurrentScreen("feed");
  }

  function handleTAContinue(ta: string) {
    setSelectedTA(ta);
    setSelectedIndication("All");
    setCurrentScreen("feed");
  }

  // Feed interactions
  function handleCardPress(hcp: AppHCP) {
    setDetailHCP(hcp);
    setCurrentScreen("detail");
  }

  function handleAddPress(hcp: AppHCP) {
    setActiveHCP(hcp);
    setTrayOpen(true);
  }

  function handleCloseTray() {
    setTrayOpen(false);
  }

  function handleAddNoteFromTray() {
    setCurrentScreen("note");
    setTrayOpen(false);
  }

  // Detail â†’ Note
  function handleAddNoteFromDetail() {
    setCurrentScreen("note");
  }

  function handleBackFromDetail() {
    setCurrentScreen("feed");
  }

  function handleBackFromNote() {
    setCurrentScreen("detail");
  }

  async function handleSearchSelect(hcpId: string, taId: string) {
    const taLabel = getTADisplayName(taId);
    if (taLabel && taLabel !== "Other TA") {
      setSelectedTA(taLabel);
      setSelectedIndication("All");
    }
    const effectiveTaLabel = taLabel !== "Other TA" ? taLabel : selectedTA;
    const { data, error } = await getHCPDetail(hcpId, {
      therapeuticArea: getTASlug(effectiveTaLabel),
      region,
    });
    if (error || !data) return;
    setDetailHCP(mapRisingStarToHCP(detailResponseToRisingStar(data)));
    setCurrentScreen("detail");
  }

  let screenContent;
  if (currentScreen === "auth") {
    screenContent = <LinkedInAuthScreen onAuth={handleAuth} />;
  } else if (currentScreen === "ta-select") {
    screenContent = <TASelectionScreen onContinue={handleTAContinue} onSkip={handleTASkip} />;
  } else if (currentScreen === "search") {
    screenContent = (
      <SearchScreen
        onBack={() => setCurrentScreen("feed")}
        onCardPress={(hcp) => {
          setDetailHCP(hcp as unknown as AppHCP);
          setCurrentScreen("detail");
        }}
      />
    );
  } else if (currentScreen === "bibliography") {
    screenContent = (
      <BibliographyScreen
        hcp={detailHCP as unknown as UIHCP}
        year={bibYear}
        onBack={() => setCurrentScreen("detail")}
      />
    );
  } else if (currentScreen === "detail") {
    screenContent = (
      <DetailScreen
        hcp={detailHCP as unknown as UIHCP}
        onBack={handleBackFromDetail}
        onAddNote={handleAddNoteFromDetail}
        onYearPress={(year) => {
          setBibYear(year);
          setCurrentScreen("bibliography");
        }}
      />
    );
  } else if (currentScreen === "note") {
    screenContent = (
      <NoteEntryScreen
        hcp={detailHCP as unknown as UIHCP}
        onBack={handleBackFromNote}
      />
    );
  } else if (currentScreen === "profile") {
    screenContent = (
      <ProfileScreen
        initialTA={selectedTA}
        onBack={() => setCurrentScreen("feed")}
        onSave={(ta) => {
          setSelectedTA(ta);
          setSelectedIndication("All");
          setCurrentScreen("feed");
        }}
      />
    );
  } else if (currentScreen === "landscape") {
    screenContent = (
      <LandscapeScreen
        ta={selectedTA}
        indication={selectedIndication}
        onBack={() => setCurrentScreen("feed")}
        onCityPress={(city, ta) => {
          setCityFeedCity(city);
          setCityFeedTA(ta);
          setCurrentScreen("city-feed");
        }}
      />
    );
  } else if (currentScreen === "city-feed") {
    screenContent = (
      <CityFeedScreen
        city={cityFeedCity}
        ta={cityFeedTA}
        onBack={() => setCurrentScreen("landscape")}
        onDetailHCPChange={(hcp) => setDetailHCP(hcp as unknown as AppHCP)}
        onNavigateTo={(screen) => setCurrentScreen(screen)}
        bibYear={bibYear}
        onBibYearChange={setBibYear}
      />
    );
  } else {
    // Feed screen (default)
    screenContent = (
      <div
        className="fm-screen"
        style={{
          backgroundColor: "#0A0A0B",
          minHeight: "100dvh",
          maxWidth: 480,
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
          overflowX: "hidden",
        }}
      >
      <TopBar
        onLogoPress={() => {
          setSelectedIndication("All");
          setCurrentScreen("feed");
        }}
        onProfilePress={() => setCurrentScreen("profile")}
        onRefreshPress={() => void fetchHCPs(true)}
        onScoringExplainedPress={() => {
          setScoringExplainedScroll(null);
          setScoringExplainedOpen(true);
        }}
        refreshing={refreshingFeed}
        currentTaId={getTAIdForLabel(selectedTA)}
        onSearchSelect={(hcpId, taId) => void handleSearchSelect(hcpId, taId)}
      />

      <TrackSwitch />

      <TAFilterChips
        selected={selectedTA}
        onSelect={(ta) => {
          setSelectedTA(ta);
          setSelectedIndication("All");
        }}
        onIndicationChange={(indication, count) => {
          setSelectedIndication(indication);
          setIndicationCount(count);
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 16px 8px" }}>
        <RegionSelector />
      </div>
      <div style={{ padding: "0 16px 8px", fontSize: 10, fontFamily: "monospace", color: "#3A3A3F" }}>
        {formatUpdatedLabel()}
      </div>

      {track !== "social" && <DOLHeroPanel taSlug={getTASlug(selectedTA)} />}

      {/* Section header */}
      <div
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
            fontSize: 15,
            fontWeight: 500,
            color: "#E8E6DF",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {selectedIndication === "All"
            ? selectedTA
            : `${selectedTA} · ${selectedIndication}`}
        </span>
        {track !== "social" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="fm-section-header-right"
              style={{
                fontSize: 15,
                color: "#6B6A65",
                fontFamily: "monospace",
              }}
            >
              {feedTotal > 0 && hcpList.length < feedTotal
                ? `${hcpList.length.toLocaleString()} of ${feedTotal.toLocaleString()} identified`
                : `${(
                    track === "rising-stars"
                      ? (taCounts?.rising_stars ?? indicationCount)
                      : track === "community"
                        ? (taCounts?.community_pool ?? indicationCount)
                        : track === "established" && feedTotal > 0
                          ? feedTotal
                          : indicationCount
                  ).toLocaleString()} identified`}
            </span>
            <button
              onClick={() => setCurrentScreen("landscape")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#0D0D10",
                border: "1px solid #1E1E22",
                borderRadius: 3,
                padding: "3px 8px",
                cursor: "pointer",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0" y="6" width="2" height="4" fill="#6B6A65" />
                <rect x="4" y="3" width="2" height="7" fill="#6B6A65" />
                <rect x="8" y="0" width="2" height="10" fill="#6B6A65" />
              </svg>
              <span style={{ fontSize: 11, color: "#6B6A65" }}>
                {selectedIndication !== "All" ? `${selectedIndication} landscape` : "Landscape"}
              </span>
            </button>
          </div>
        )}
      </div>

      {track === "social" ? (
        <SocialTrackEmpty selectedTA={selectedTA} />
      ) : (
        <div className="fm-card-grid" style={{ paddingBottom: 24 }}>
          {loadingHCPs ? (
            <div style={{ color: "#6B6A65", padding: "8px 16px" }}>Loading...</div>
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
                    width: "100%",
                    padding: "0 0 8px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      maxWidth: 400,
                      textAlign: "center",
                      backgroundColor: "#1A3D2E",
                      border: "1px solid #4ADE80",
                      borderRadius: 3,
                      padding: "10px 16px",
                      cursor: loadingMore ? "not-allowed" : "pointer",
                      opacity: loadingMore ? 0.6 : 1,
                      fontFamily: "monospace",
                      fontSize: 13,
                      color: "#4ADE80",
                    }}
                  >
                    {loadingMore ? "Loading..." : `Load ${FEED_PAGE_SIZE} More HCPs`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Action Tray */}
        <ActionTray
          open={trayOpen}
          onClose={handleCloseTray}
          hcpName={activeHCP?.name ?? ""}
          onAddNote={handleAddNoteFromTray}
        />
      </div>
    );
  }

  const backToTopVisible = currentScreen === "feed" && showBackToTop && !trayOpen;

  return (
    <>
      {screenContent}
      {currentScreen === "feed" && (
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
            opacity: backToTopVisible ? 1 : 0,
            pointerEvents: backToTopVisible ? "auto" : "none",
            transition: "opacity 200ms ease, border-color 200ms ease",
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
      <AppContent />
    </TrackProvider>
  );
}

