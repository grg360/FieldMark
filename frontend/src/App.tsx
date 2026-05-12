import { useEffect, useState } from "react";
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
import type { FeedCohort } from "./lib/api";
import { getRisingStars, getTACounts } from "./lib/api";
import { TrackProvider, useTrack, type Track } from "./lib/TrackContext";
import type { RisingStar, TACounts } from "./lib/types";

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
};

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

function feedCohortForTrack(track: Track): FeedCohort {
  if (track === "rising-stars") return "rising_star";
  if (track === "community") return "community";
  if (track === "established") return "established";
  return "rising_star";
}

function formatTherapeuticAreaLabel(value: string): string {
  const v = String(value || "").trim().toLowerCase();
  if (v === "nsclc") return "NSCLC";
  if (v === "rare-disease") return "Rare Disease";
  if (v === "hepatology") return "Hepatology";
  if (v === "oncology") return "Oncology";
  return value;
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
    institutionShort: item.institution_short ?? null,
    nppesPracticeCity: item.nppes_practice_city ?? null,
    nppesPracticeState: item.nppes_practice_state ?? null,
    nppesPracticeSetting: item.nppes_practice_setting ?? null,
  };
}

type Screen = "auth" | "ta-select" | "feed" | "detail" | "note" | "search" | "bibliography" | "profile" | "landscape" | "city-feed";

function AppContent() {
  const { track } = useTrack();
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
  const [darkHorseFilter, setDarkHorseFilter] = useState(false);
  const [workhorseFilter, setWorkhorseFilter] = useState(false);
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

  useEffect(() => {
    setScoringExplainedOpen(false);
    setScoringExplainedScroll(null);
  }, [currentScreen]);

  useEffect(() => {
    if (track !== "rising-stars") setDarkHorseFilter(false);
    if (track !== "community") setWorkhorseFilter(false);
  }, [track]);

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
      const { data } = await getRisingStars(taSlug, 20, {
        cohort: feedCohortForTrack(track),
        darkHorseOnly: darkHorseFilter,
        workhorseOnly: workhorseFilter,
        offset: 0,
      });
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
      const { data } = await getRisingStars(taSlug, 20, {
        cohort: feedCohortForTrack(track),
        darkHorseOnly: darkHorseFilter,
        workhorseOnly: workhorseFilter,
        offset: 0,
      });
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
  }, [selectedTA, darkHorseFilter, workhorseFilter, track]);

  async function loadMore() {
    if (track === "social") return;
    const nextOffset = feedOffset + 20;
    const taSlug = getTASlug(selectedTA);
    setLoadingMore(true);
    try {
      const { data } = await getRisingStars(taSlug, 20, {
        cohort: feedCohortForTrack(track),
        darkHorseOnly: darkHorseFilter,
        workhorseOnly: workhorseFilter,
        offset: nextOffset,
      });
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
      const { data } = await getTACounts(taSlug);
      if (cancelled) return;
      setTaCounts(data);
    }

    fetchCounts();

    return () => {
      cancelled = true;
    };
  }, [selectedTA]);

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

  // Detail → Note
  function handleAddNoteFromDetail() {
    setCurrentScreen("note");
  }

  function handleBackFromDetail() {
    setCurrentScreen("feed");
  }

  function handleBackFromNote() {
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
          setDarkHorseFilter(false);
          setWorkhorseFilter(false);
          setSelectedIndication("All");
          setCurrentScreen("feed");
        }}
        onSearchPress={() => setCurrentScreen("search")}
        onProfilePress={() => setCurrentScreen("profile")}
        onRefreshPress={() => void fetchHCPs(true)}
        onScoringExplainedPress={() => {
          setScoringExplainedScroll(null);
          setScoringExplainedOpen(true);
        }}
        refreshing={refreshingFeed}
      />

      <TrackSwitch />

      {/* Track-scoped discovery banner: Rising Stars → Dark Horses; Community → Workhorses (not on Established / Social) */}
      {(track === "rising-stars" || track === "community") && (
        <div style={{ padding: "8px 16px 0" }}>
          {track === "rising-stars" && (
            <button
              type="button"
              onClick={() => setDarkHorseFilter((v) => !v)}
              className="fm-dh-chip"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                backgroundColor: darkHorseFilter ? "#130D24" : "#0D0A1A",
                border: darkHorseFilter ? "2px solid #9B6DFF" : "1px solid #9B6DFF",
                borderRadius: 4,
                padding: "8px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, color: "#9B6DFF", flexShrink: 0 }} aria-hidden>
                  ♞
                </span>
                <span
                  className="fm-dh-chip-label"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#9B6DFF",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {`Dark Horses · ${taCounts?.dark_horses?.toLocaleString() ?? "—"} identified`}
                </span>
              </div>
              {darkHorseFilter && (
                <span
                  style={{
                    fontSize: 14,
                    color: "#9B6DFF",
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}
                  aria-label="Exit dark horse filter"
                >
                  ✕
                </span>
              )}
            </button>
          )}
          {track === "community" && (
            <button
              type="button"
              onClick={() => setWorkhorseFilter((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                backgroundColor: workhorseFilter ? "#0A1F1C" : "#0A1A18",
                border: workhorseFilter ? "2px solid #4ECDC4" : "1px solid #4ECDC4",
                borderRadius: 4,
                padding: "8px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, color: "#4ECDC4", flexShrink: 0 }} aria-hidden>
                  ⚡
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#4ECDC4",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {`Workhorses · ${taCounts?.workhorses?.toLocaleString() ?? "—"} identified`}
                </span>
              </div>
              {workhorseFilter && (
                <span
                  style={{
                    fontSize: 14,
                    color: "#4ECDC4",
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}
                  aria-label="Exit workhorse filter"
                >
                  ✕
                </span>
              )}
            </button>
          )}
        </div>
      )}
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
      <div style={{ padding: "0 16px 8px", fontSize: 10, fontFamily: "monospace", color: "#3A3A3F" }}>
        {formatUpdatedLabel()}
      </div>

      {!darkHorseFilter && !workhorseFilter && track !== "social" && (
        <DOLHeroPanel taSlug={getTASlug(selectedTA)} />
      )}

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
            color: darkHorseFilter ? "#9B6DFF" : workhorseFilter ? "#4ECDC4" : "#E8E6DF",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {darkHorseFilter
            ? `Dark Horses · ${selectedTA}`
            : workhorseFilter
              ? `Workhorses · ${selectedTA}`
              : selectedIndication === "All"
                ? selectedTA
                : `${selectedTA} · ${selectedIndication}`}
        </span>
        {track !== "social" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="fm-section-header-right"
              style={{
                fontSize: 15,
                color: darkHorseFilter ? "#9B6DFF" : workhorseFilter ? "#4ECDC4" : "#6B6A65",
                fontFamily: "monospace",
              }}
            >
              {darkHorseFilter
                ? `${taCounts?.dark_horses?.toLocaleString() ?? "—"} identified`
                : workhorseFilter
                  ? `${taCounts?.workhorses?.toLocaleString() ?? "—"} identified`
                  : feedTotal > 0 && hcpList.length < feedTotal
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
                <div style={{ padding: "0 16px 8px", width: "100%" }}>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
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
                    {loadingMore ? "Loading..." : "Load more"}
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

  return (
    <>
      {screenContent}
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
