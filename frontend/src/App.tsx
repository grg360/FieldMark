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
import type { HCP as UIHCP } from "./data/hcpData";
import { getRisingStars, getTACounts } from "./lib/api";
import type { RisingStar, TACounts } from "./lib/types";

type AppHCP = Omit<UIHCP, "id"> & {
  id: string;
  hcp_id?: string;
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
  };
}

function isDarkHorse(hcp: AppHCP): boolean {
  if (hcp.score < 85) return false;
  const citNum = Number(hcp.citTraj);
  if (isNaN(citNum) || citNum < 40) return false;
  const trialsNum = Number(hcp.trialScore);
  if (isNaN(trialsNum) || trialsNum < 2) return false;
  return true;
}

type Screen = "auth" | "ta-select" | "feed" | "detail" | "note" | "search" | "bibliography" | "profile" | "landscape" | "city-feed";

export default function App() {
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
  const [hcpList, setHcpList] = useState<AppHCP[]>([]);
  const [loadingHCPs, setLoadingHCPs] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [taCounts, setTaCounts] = useState<TACounts | null>(null);

  function formatUpdatedLabel() {
    if (!lastUpdatedAt) return "Updated just now";
    const diffMs = Date.now() - lastUpdatedAt.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins <= 0) return "Updated just now";
    if (mins === 1) return "Updated 1 min ago";
    return `Updated ${mins} mins ago`;
  }

  async function fetchHCPs(loadingAsRefresh = false) {
    try {
      if (loadingAsRefresh) setRefreshingFeed(true);
      else setLoadingHCPs(true);
      const taSlug = getTASlug(selectedTA);
      const tier = darkHorseFilter ? "dark_horse" : undefined;
      const { data } = await getRisingStars(taSlug, 20, { tier });
      const mapped = (data ?? []).map(mapRisingStarToHCP);
      setHcpList(mapped);
      setLastUpdatedAt(new Date());
    } finally {
      if (loadingAsRefresh) setRefreshingFeed(false);
      else setLoadingHCPs(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoadingHCPs(true);
      const taSlug = getTASlug(selectedTA);
      const tier = darkHorseFilter ? "dark_horse" : undefined;
      const { data } = await getRisingStars(taSlug, 20, { tier });
      if (cancelled) return;

      const mapped = (data ?? []).map(mapRisingStarToHCP);
      setHcpList(mapped);
      setLastUpdatedAt(new Date());
      setLoadingHCPs(false);
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [selectedTA, darkHorseFilter]);

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

  if (currentScreen === "auth") {
    return <LinkedInAuthScreen onAuth={handleAuth} />;
  }

  if (currentScreen === "ta-select") {
    return <TASelectionScreen onContinue={handleTAContinue} onSkip={handleTASkip} />;
  }

  if (currentScreen === "search") {
    return (
      <SearchScreen
        onBack={() => setCurrentScreen("feed")}
        onCardPress={(hcp) => {
          setDetailHCP(hcp as unknown as AppHCP);
          setCurrentScreen("detail");
        }}
      />
    );
  }

  if (currentScreen === "bibliography") {
    return (
      <BibliographyScreen
        hcp={detailHCP as unknown as UIHCP}
        year={bibYear}
        onBack={() => setCurrentScreen("detail")}
      />
    );
  }

  if (currentScreen === "detail") {
    return (
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
  }

  if (currentScreen === "note") {
    return (
      <NoteEntryScreen
        hcp={detailHCP as unknown as UIHCP}
        onBack={handleBackFromNote}
      />
    );
  }

  if (currentScreen === "profile") {
    return (
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
  }

  if (currentScreen === "landscape") {
    return (
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
  }

  if (currentScreen === "city-feed") {
    return (
      <CityFeedScreen
        city={cityFeedCity}
        ta={cityFeedTA}
        onBack={() => setCurrentScreen("landscape")}
        onDetailHCPChange={setDetailHCP}
        onNavigateTo={(screen) => setCurrentScreen(screen)}
        bibYear={bibYear}
        onBibYearChange={setBibYear}
      />
    );
  }

  // Feed screen
  return (
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
        onSearchPress={() => setCurrentScreen("search")}
        onProfilePress={() => setCurrentScreen("profile")}
        onRefreshPress={() => void fetchHCPs(true)}
        refreshing={refreshingFeed}
      />

      {/* Dark Horse filter chip */}
      <div style={{ padding: "8px 16px 0" }}>
        <button
          onClick={() => setDarkHorseFilter((v) => !v)}
          className="fm-dh-chip"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: darkHorseFilter ? "#130D24" : "#0D0A1A",
            border: darkHorseFilter ? "2px solid #9B6DFF" : "1px solid #9B6DFF",
            borderRadius: 4,
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#9B6DFF" }}>♞</span>
            <span className="fm-dh-chip-label" style={{ fontSize: 13, fontWeight: 500, color: "#9B6DFF", fontFamily: "system-ui, sans-serif" }}>Dark Horses</span>
          </div>
          <span className="fm-dh-chip-count" style={{ fontSize: 12, fontFamily: "monospace", color: "#9B6DFF" }}>
            {`${taCounts?.dark_horses?.toLocaleString() ?? "—"} identified`}
          </span>
        </button>
      </div>

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

      {!darkHorseFilter && <DOLHeroPanel taSlug={getTASlug(selectedTA)} />}

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
            color: darkHorseFilter ? "#9B6DFF" : "#E8E6DF",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {darkHorseFilter
            ? `Dark Horses · ${selectedTA}`
            : selectedIndication === "All"
              ? selectedTA
              : `${selectedTA} · ${selectedIndication}`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="fm-section-header-right"
            style={{
              fontSize: 15,
              color: darkHorseFilter ? "#9B6DFF" : "#6B6A65",
              fontFamily: "monospace",
            }}
          >
            {darkHorseFilter
              ? `${taCounts?.dark_horses?.toLocaleString() ?? "—"} identified`
              : `${(taCounts?.rising_stars ?? indicationCount).toLocaleString()} identified`}
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
      </div>

      {/* HCP Cards */}
      <div className="fm-card-grid" style={{ paddingBottom: 24 }}>
        {loadingHCPs ? (
          <div style={{ color: "#6B6A65", padding: "8px 16px" }}>Loading...</div>
        ) : (
          hcpList
          .map((hcp) => (
            <HCPCard
              key={hcp.id}
              hcp={hcp as unknown as UIHCP}
              onAddPress={(cardHcp) => handleAddPress(cardHcp as unknown as AppHCP)}
              onCardPress={(cardHcp) => handleCardPress(cardHcp as unknown as AppHCP)}
            />
          ))
        )}
      </div>

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
