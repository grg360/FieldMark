import { useState } from "react";
import { HCP } from "../data/hcpData";
import { getCityData } from "../data/cityFeedData";
import HCPCard from "./HCPCard";
import ActionTray from "./ActionTray";
import NoteEntryScreen from "./NoteEntryScreen";
import DetailScreen from "./DetailScreen";
import BibliographyScreen from "./BibliographyScreen";

interface CityFeedScreenProps {
  city: string;
  ta: string;
  onBack: () => void;
  onDetailHCPChange: (hcp: HCP) => void;
  onNavigateTo: (screen: "detail" | "bibliography") => void;
  bibYear: number;
  onBibYearChange: (year: number) => void;
}

type LocalScreen = "feed" | "detail" | "note" | "bibliography";

export default function CityFeedScreen({ city, ta, onBack }: CityFeedScreenProps) {
  const hcps = getCityData(city, ta);
  const [localScreen, setLocalScreen] = useState<LocalScreen>("feed");
  const [trayOpen, setTrayOpen] = useState(false);
  const [activeHCP, setActiveHCP] = useState<HCP | null>(null);
  const [detailHCP, setDetailHCP] = useState<HCP>(hcps[0]);
  const [bibYear, setBibYear] = useState(2024);

  function handleCardPress(hcp: HCP) {
    setDetailHCP(hcp);
    setLocalScreen("detail");
  }

  function handleAddPress(hcp: HCP) {
    setActiveHCP(hcp);
    setTrayOpen(true);
  }

  if (localScreen === "detail") {
    return (
      <DetailScreen
        hcp={detailHCP}
        onBack={() => setLocalScreen("feed")}
        onAddNote={() => setLocalScreen("note")}
        onYearPress={(year) => {
          setBibYear(year);
          setLocalScreen("bibliography");
        }}
      />
    );
  }

  if (localScreen === "note") {
    return (
      <NoteEntryScreen
        hcp={detailHCP}
        onBack={() => setLocalScreen("detail")}
      />
    );
  }

  if (localScreen === "bibliography") {
    return (
      <BibliographyScreen
        hcp={detailHCP}
        year={bibYear}
        onBack={() => setLocalScreen("detail")}
      />
    );
  }

  const cityShort = city.split(",")[0];

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
      {/* Nav bar */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            padding: 4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 13, color: "#6B6A65" }}>Landscape</span>
        </button>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#E8E6DF" }}>{cityShort}</span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B6A65" }}>
          {hcps.length} researchers
        </span>
      </div>

      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 8px",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: "#E8E6DF" }}>
          {cityShort} · {ta}
        </span>
        <span style={{ fontSize: 11, color: "#3A3A3F" }}>sorted by score</span>
      </div>

      {/* HCP Cards */}
      <div className="fm-city-card-grid" style={{ paddingBottom: 24 }}>
        {hcps.map((hcp) => (
          <HCPCard
            key={hcp.id}
            hcp={hcp}
            onAddPress={handleAddPress}
            onCardPress={handleCardPress}
          />
        ))}
      </div>

      {/* Action Tray */}
      <ActionTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        hcpName={activeHCP?.name ?? ""}
        onAddNote={() => {
          setLocalScreen("note");
          setTrayOpen(false);
        }}
      />
    </div>
  );
}
