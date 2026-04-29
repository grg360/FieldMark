import { useState } from "react";
import { HCP } from "../data/hcpData";
import { StatPillWithTooltip } from "./StatPillWithTooltip";
import ScoreModal from "./ScoreModal";

function isDarkHorse(hcp: HCP): boolean {
  if (hcp.score < 85) return false;
  const citNum = parseFloat(hcp.citTraj.replace("%", "").replace("+", ""));
  if (isNaN(citNum) || citNum < 40) return false;
  const trialsNum = parseInt(hcp.trials, 10);
  if (isNaN(trialsNum) || trialsNum < 2) return false;
  return true;
}

interface HCPCardProps {
  hcp: HCP;
  onAddPress: (hcp: HCP) => void;
  onCardPress: (hcp: HCP) => void;
}

export default function HCPCard({ hcp, onAddPress, onCardPress }: HCPCardProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const darkHorse = isDarkHorse(hcp);

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
          borderLeft: "3px solid #E8A020",
          borderRadius: 4,
          margin: "0 16px 8px",
          padding: 12,
          cursor: "pointer",
        }}
      >
        {/* Row 1: Name + Score */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#E8E6DF", fontFamily: "system-ui, sans-serif" }}>
            {hcp.name}
          </span>
          <button
            onClick={handleScoreBadgeClick}
            onTouchEnd={handleScoreBadgeClick}
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              color: "#E8A020",
              backgroundColor: "#1A1200",
              border: "1px solid #E8A020",
              borderRadius: 3,
              padding: "2px 8px",
              cursor: "pointer",
              userSelect: "none",
              lineHeight: "inherit",
            }}
          >
            {hcp.score.toFixed(1)}
          </button>
        </div>

        {/* Dark Horse badge */}
        {darkHorse && (
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

        {/* Row 2: Institution + Specialty */}
        <div style={{ fontSize: 12, color: "#6B6A65", fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
          {hcp.institution} · {hcp.specialty}
        </div>

        {/* Row 3: Explanation */}
        <div style={{ fontSize: 12, color: "#B8B4AC", fontFamily: "system-ui, sans-serif", lineHeight: 1.5, marginTop: 8 }}>
        </div>

        {/* Row 4: Stat pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {(["PUB VEL", "CIT TRAJ", "TRIALS"] as const).map((key) => (
            <StatPillWithTooltip
              key={key}
              label={key}
              value={key === "PUB VEL" ? hcp.pubVel : key === "CIT TRAJ" ? hcp.citTraj : hcp.trials}
              tooltipKey={key}
              activeTooltip={activeTooltip}
              onTooltipChange={setActiveTooltip}
            />
          ))}
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
