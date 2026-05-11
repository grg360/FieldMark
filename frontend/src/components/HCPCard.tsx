import { useState } from "react";
import { HCP } from "../data/hcpData";
import { useTrack } from "../lib/TrackContext";
import { StatPillWithTooltip } from "./StatPillWithTooltip";
import ScoreModal from "./ScoreModal";

const getCountryCode = (country: string | null): string | null => {
  if (!country) return null;
  const c = country.trim().replace(/\.$/, "").toLowerCase();
  const codes: Record<string, string> = {
    usa: "us",
    "united states": "us",
    us: "us",
    germany: "de",
    japan: "jp",
    uk: "gb",
    "united kingdom": "gb",
    france: "fr",
    italy: "it",
    spain: "es",
    canada: "ca",
    australia: "au",
    netherlands: "nl",
    sweden: "se",
    norway: "no",
    denmark: "dk",
    finland: "fi",
    switzerland: "ch",
    austria: "at",
    belgium: "be",
    israel: "il",
    china: "cn",
    "south korea": "kr",
    korea: "kr",
    india: "in",
    brazil: "br",
    argentina: "ar",
    mexico: "mx",
    singapore: "sg",
    taiwan: "tw",
    portugal: "pt",
    greece: "gr",
    poland: "pl",
    turkey: "tr",
    russia: "ru",
    ireland: "ie",
    "south africa": "za",
    egypt: "eg",
    "saudi arabia": "sa",
    nigeria: "ng",
    kenya: "ke",
    ghana: "gh",
  };
  return codes[c] || null;
};

type HCPCardHCP = HCP & { cohort_classification?: string | null };

interface HCPCardProps {
  hcp: HCPCardHCP;
  onAddPress: (hcp: HCPCardHCP) => void;
  onCardPress: (hcp: HCPCardHCP) => void;
}

export default function HCPCard({ hcp, onAddPress, onCardPress }: HCPCardProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const isDarkHorse = hcp.cohort_classification === "dark_horse";
  const isWorkhorse = hcp.cohort_classification === "workhorse";
  const accentColor = isDarkHorse ? "#9B6DFF" : isWorkhorse ? "#4ECDC4" : "#E8A020";
  const accentBg = isDarkHorse ? "#0D0A1A" : isWorkhorse ? "#0A1A18" : "#1A1200";
  const { track } = useTrack();
  const statPillKeys: readonly string[] = (() => {
    if (track === "community") {
      return ["VOLUME", "SETTING", "EXP"] as const;
    }
    if (track === "established") {
      return ["PUBS", "CITATIONS", "TRIALS"] as const;
    }
    return isDarkHorse
      ? (["PUB VEL", "CIT TRAJ", "PUB YEARS"] as const)
      : (["PUB VEL", "CIT TRAJ", "TRIALS"] as const);
  })();
  const countryCode = getCountryCode(hcp.country ?? null);

  function handleCardClick() {
    if (activeTooltip) {
      setActiveTooltip(null);
      return;
    }
    onCardPress(hcp);
  }

  function handleScoreBadgeClick(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    setScoreModalOpen(true);
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        style={{
          backgroundColor: "#111113",
          border: "1px solid #1E1E22",
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: 4,
          margin: "0 16px 8px",
          padding: 12,
          cursor: "pointer",
        }}
      >
        {/* Row 1: Name + Country + Score */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", fontFamily: "system-ui, sans-serif" }}>
            {hcp.name}
          </span>
          <div style={{ display: "flex", alignItems: "center" }}>
            {countryCode && (
              <img
                src={`https://flagcdn.com/16x12/${countryCode}.png`}
                srcSet={`https://flagcdn.com/32x24/${countryCode}.png 2x`}
                width="16"
                height="12"
                alt={hcp.country || ""}
                style={{ borderRadius: "2px", objectFit: "cover", flexShrink: 0, marginRight: "6px" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <button
              onClick={handleScoreBadgeClick}
              onTouchEnd={handleScoreBadgeClick}
              style={{
                fontSize: isDarkHorse || isWorkhorse ? 11 : 14,
                fontFamily: "monospace",
                color: accentColor,
                backgroundColor: accentBg,
                border: `1px solid ${accentColor}`,
                borderRadius: isDarkHorse || isWorkhorse ? 2 : 3,
                padding: isDarkHorse || isWorkhorse ? "2px 6px" : "2px 8px",
                minHeight: 0,
                cursor: "pointer",
                userSelect: "none",
                lineHeight: 1,
              }}
            >
              {isDarkHorse ? "Top 5%" : isWorkhorse ? "Workhorse" : hcp.score.toFixed(1)}
            </button>
          </div>
        </div>

        {/* Dark Horse / Workhorse cohort badges */}
        {isDarkHorse && (
          <div style={{ marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#0D0A1A",
                border: "1px solid #9B6DFF",
                borderRadius: 3,
                padding: "2px 8px",
              }}
            >
              <span style={{ fontSize: 10, color: "#9B6DFF", lineHeight: 1 }}>♞</span>
              <span style={{ fontSize: 10, color: "#9B6DFF", fontFamily: "system-ui, sans-serif" }}>Dark Horse</span>
            </span>
          </div>
        )}
        {isWorkhorse && (
          <div style={{ marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#0A1A18",
                border: "1px solid #4ECDC4",
                borderRadius: 3,
                padding: "2px 8px",
              }}
            >
              <span style={{ fontSize: 10, color: "#4ECDC4", lineHeight: 1 }}>⚡</span>
              <span style={{ fontSize: 10, color: "#4ECDC4", fontFamily: "system-ui, sans-serif" }}>Workhorse</span>
            </span>
          </div>
        )}

        {/* Row 2: Institution */}
        <div style={{ fontSize: 14, color: "#6B6A65", fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
          {hcp.institution}
        </div>

        {/* Row 3: Narrative */}
        {hcp.narrative ? (
          <div
            style={{
              fontSize: 14,
              color: "#B8B4AC",
              fontFamily: "system-ui, sans-serif",
              lineHeight: 1.5,
              marginTop: 8,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {hcp.narrative}
          </div>
        ) : null}

        {/* Row 4: Stat pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {statPillKeys.map((key) => {
            let value: string;
            if (track === "community") {
              // Placeholder values — will be wired to community composite data later.
              if (key === "VOLUME") value = "—";
              else if (key === "SETTING") value = "—";
              else if (key === "EXP") value = "—";
              else value = "—";
            } else if (track === "established") {
              // Placeholder values — will be wired to established cumulative data later.
              if (key === "PUBS") value = "—";
              else if (key === "CITATIONS") value = "—";
              else if (key === "TRIALS") value = hcp.trialScore == null || hcp.trialScore === 0 ? "—" : `${hcp.trialScore}`;
              else value = "—";
            } else {
              // Existing rising stars behavior.
              if (key === "PUB VEL") value = hcp.pubVel;
              else if (key === "CIT TRAJ") {
                value = hcp.citTraj == null
                  ? "—"
                  : `${Number(hcp.citTraj) >= 0 ? "+" : ""}${Number(hcp.citTraj).toFixed(1)}%`;
              } else if (key === "PUB YEARS") {
                value = !hcp.firstPubYear || hcp.firstPubYear === 0
                  ? "—"
                  : `${new Date().getFullYear() - hcp.firstPubYear}`;
              } else if (key === "TRIALS") {
                value = hcp.trialScore == null || hcp.trialScore === 0 ? "—" : `${hcp.trialScore} active`;
              } else {
                value = "—";
              }
            }

            return (
              <StatPillWithTooltip
                key={key}
                label={key}
                value={value}
                tooltipKey={key}
                activeTooltip={activeTooltip}
                onTooltipChange={setActiveTooltip}
              />
            );
          })}
        </div>

        {/* Row 5: Action row */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onAddPress(hcp); }}
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "1px solid #1E1E22",
              backgroundColor: "#0D0D10",
              color: "#6B6A65",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
            aria-label={`Add action for ${hcp.name}`}
          >
            +
          </button>
        </div>
      </div>

      {scoreModalOpen && (
        <ScoreModal
          hcpName={hcp.name}
          ta={hcp.specialty}
          score={hcp.score}
          onClose={() => setScoreModalOpen(false)}
        />
      )}
    </>
  );
}
