import { useEffect, useRef, useState } from "react";
import { HCP } from "../data/hcpData";
import { formatCohortScore, formatEngagementDollar, formatIntDisplay, formatTopPercentileLabel } from "../lib/cohort-metrics";
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

type HCPCardHCP = HCP;

interface HCPCardProps {
  hcp: HCPCardHCP;
  onAddPress: (hcp: HCPCardHCP) => void;
  onCardPress: (hcp: HCPCardHCP) => void;
}

function cohortStatKeys(cohort: string): readonly string[] {
  if (cohort === "established") return ["PUBS", "CITATIONS", "TRIALS"] as const;
  if (cohort === "community" || cohort === "workhorse") return ["ENGAGEMENT", "COMPANIES", "YEARS"] as const;
  return ["PUB VEL", "CIT TRAJ", "PUB YEARS"] as const;
}

function statValueForKey(hcp: HCPCardHCP, cohort: string, key: string): string {
  if (cohort === "established") {
    if (key === "PUBS") return formatIntDisplay(hcp.totalCareerPubs ?? null);
    if (key === "CITATIONS") return "—";
    if (key === "TRIALS") {
      return hcp.trialScore == null || !Number.isFinite(hcp.trialScore) || hcp.trialScore === 0
        ? "—"
        : String(Math.round(hcp.trialScore));
    }
    return "—";
  }
  if (cohort === "community" || cohort === "workhorse") {
    if (key === "ENGAGEMENT") return formatEngagementDollar(hcp.openPaymentsLifetime ?? null);
    if (key === "COMPANIES") return formatIntDisplay(hcp.distinctCompanies ?? null);
    if (key === "YEARS") return formatIntDisplay(hcp.careerYears ?? null);
    return "—";
  }
  if (key === "PUB VEL") return hcp.pubVel;
  if (key === "CIT TRAJ") {
    return hcp.citTraj == null
      ? "—"
      : `${Number(hcp.citTraj) >= 0 ? "+" : ""}${Number(hcp.citTraj).toFixed(1)}%`;
  }
  if (key === "PUB YEARS") {
    return !hcp.firstPubYear || hcp.firstPubYear === 0
      ? "—"
      : `${new Date().getFullYear() - hcp.firstPubYear}`;
  }
  return "—";
}

const COHORT_SCORE_TIP_TEXT = {
  community:
    "Composite score (0-100). Weighted combination of pharma engagement total (45%), engagement breadth across companies (25%), Medicare patient volume (15%), and career stage (15%).",
  workhorse:
    "Workhorse score (0-100). Weighted combination of Medicare patient volume (60%) and career stage (40%). Identifies high-volume practitioners with low pharma engagement — underleveraged influence.",
} as const;

type CohortScoreTipVariant = keyof typeof COHORT_SCORE_TIP_TEXT;

function CohortScoreChipWithTip(props: {
  variant: CohortScoreTipVariant;
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  touchDevice: boolean;
  chipButtonStyle: React.CSSProperties;
  scoreLabel: string;
  subtitle?: React.ReactNode;
}) {
  const { variant, open, onOpenChange, touchDevice, chipButtonStyle, scoreLabel, subtitle } = props;
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open, onOpenChange]);

  const borderCol = variant === "community" ? "#E8A020" : "#4ECDC4";

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "flex-start" }}
      onMouseEnter={() => {
        if (!touchDevice) onOpenChange(true);
      }}
      onMouseLeave={() => {
        if (!touchDevice) onOpenChange(false);
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (touchDevice) {
            e.preventDefault();
            onOpenChange((v) => !v);
          }
        }}
        style={chipButtonStyle}
      >
        <span
          style={{
            fontSize: subtitle ? 13 : 12,
            fontWeight: subtitle ? 600 : undefined,
            fontFamily: "monospace",
            display: "block",
          }}
        >
          {scoreLabel}
        </span>
        {subtitle}
      </button>
      {open ? (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            maxWidth: 280,
            padding: "10px 12px",
            backgroundColor: "#111113",
            border: `1px solid ${borderCol}`,
            borderRadius: 4,
            zIndex: 300,
            fontSize: 11,
            color: "#9B9892",
            lineHeight: 1.5,
            boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
          }}
        >
          {COHORT_SCORE_TIP_TEXT[variant]}
        </div>
      ) : null}
    </div>
  );
}

export default function HCPCard({ hcp, onAddPress, onCardPress }: HCPCardProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [cohortScoreTipOpen, setCohortScoreTipOpen] = useState(false);
  const [addButtonHovered, setAddButtonHovered] = useState(false);
  const touchDevice =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const cohort = (hcp.cohort_classification ?? "").trim();
  const effectiveCohort =
    cohort === ""
      ? "rising_star"
      : cohort;
  const isDarkHorse = cohort === "dark_horse";
  const isWorkhorse = cohort === "workhorse";
  const isCommunityPlain = cohort === "community";
  const accentColor = isDarkHorse ? "#9B6DFF" : isWorkhorse ? "#4ECDC4" : "#E8A020";
  const accentBg = isDarkHorse ? "#0D0A1A" : isWorkhorse ? "#0A1A18" : "#1A1200";
  const statPillKeys = cohortStatKeys(effectiveCohort);
  const countryCode = getCountryCode(hcp.country ?? null);

  function handleCardClick() {
    if (activeTooltip) {
      setActiveTooltip(null);
      return;
    }
    if (cohortScoreTipOpen) {
      setCohortScoreTipOpen(false);
      return;
    }
    onCardPress(hcp);
  }

  function handleScoreBadgeClick(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    setScoreModalOpen(true);
  }

  const topPctRising = formatTopPercentileLabel(hcp.normalizedScore ?? 0);
  const topPctEstablished = formatTopPercentileLabel(hcp.normalizedScore ?? 0);

  function renderScoreChip() {
    if (isCommunityPlain) {
      const label = formatCohortScore(hcp.cohortScore ?? null);
      return (
        <CohortScoreChipWithTip
          variant="community"
          open={cohortScoreTipOpen}
          onOpenChange={setCohortScoreTipOpen}
          touchDevice={touchDevice}
          scoreLabel={label}
          chipButtonStyle={{
            fontSize: 12,
            fontFamily: "monospace",
            color: "#E8A020",
            backgroundColor: "#1A1200",
            border: "1px solid #E8A020",
            borderRadius: 3,
            padding: "2px 8px",
            minHeight: 0,
            cursor: "pointer",
            userSelect: "none",
            lineHeight: 1,
          }}
        />
      );
    }
    if (isDarkHorse) {
      return (
        <button
          type="button"
          onClick={handleScoreBadgeClick}
          onTouchEnd={handleScoreBadgeClick}
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: accentColor,
            backgroundColor: accentBg,
            border: `1px solid ${accentColor}`,
            borderRadius: 2,
            padding: "2px 6px",
            minHeight: 0,
            cursor: "pointer",
            userSelect: "none",
            lineHeight: 1,
          }}
        >
          Top 5%
        </button>
      );
    }
    if (isWorkhorse) {
      const scoreLabel = formatCohortScore(hcp.cohortScore ?? null);
      return (
        <CohortScoreChipWithTip
          variant="workhorse"
          open={cohortScoreTipOpen}
          onOpenChange={setCohortScoreTipOpen}
          touchDevice={touchDevice}
          scoreLabel={scoreLabel}
          chipButtonStyle={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 1,
            fontFamily: "monospace",
            color: "#4ECDC4",
            backgroundColor: "#0A1A18",
            border: "1px solid #4ECDC4",
            borderRadius: 2,
            padding: "3px 8px",
            minHeight: 0,
            cursor: "pointer",
            userSelect: "none",
            lineHeight: 1.1,
          }}
          subtitle={
            <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.85 }}>Workhorse</span>
          }
        />
      );
    }
    if (cohort === "established") {
      if (!topPctEstablished) return null;
      return (
        <button
          type="button"
          onClick={handleScoreBadgeClick}
          onTouchEnd={handleScoreBadgeClick}
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: accentColor,
            backgroundColor: accentBg,
            border: `1px solid ${accentColor}`,
            borderRadius: 2,
            padding: "2px 6px",
            minHeight: 0,
            cursor: "pointer",
            userSelect: "none",
            lineHeight: 1,
          }}
        >
          {topPctEstablished}
        </button>
      );
    }
    const label = topPctRising ?? hcp.score.toFixed(1);
    return (
      <button
        type="button"
        onClick={handleScoreBadgeClick}
        onTouchEnd={handleScoreBadgeClick}
        style={{
          fontSize: topPctRising ? 11 : 14,
          fontFamily: "monospace",
          color: accentColor,
          backgroundColor: accentBg,
          border: `1px solid ${accentColor}`,
          borderRadius: 3,
          padding: topPctRising ? "2px 6px" : "2px 8px",
          minHeight: 0,
          cursor: "pointer",
          userSelect: "none",
          lineHeight: 1,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        style={{
          position: "relative",
          backgroundColor: "#111113",
          border: "1px solid #1E1E22",
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: 4,
          margin: "0 16px 8px",
          padding: "12px 12px 40px 12px",
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
            {renderScoreChip()}
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

        {/* Row 3: Narrative (hidden on Community / Workhorse — stats carry the card) */}
        {hcp.narrative && cohort !== "community" && cohort !== "workhorse" ? (
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

        {/* Row 4: Stat pills (cohort_classification-driven) */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {statPillKeys.map((key) => (
            <StatPillWithTooltip
              key={key}
              label={key}
              value={statValueForKey(hcp, effectiveCohort, key)}
              tooltipKey={key}
              activeTooltip={activeTooltip}
              onTooltipChange={setActiveTooltip}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddPress(hcp);
          }}
          onMouseEnter={() => setAddButtonHovered(true)}
          onMouseLeave={() => setAddButtonHovered(false)}
          aria-label={`Add action for ${hcp.name}`}
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transform: addButtonHovered ? "scale(1.05)" : "scale(1)",
            transition: "transform 0.15s ease",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden={true} style={{ display: "block" }}>
            <rect
              x="2"
              y="8.5"
              width="16"
              height="3"
              rx="1.5"
              fill={addButtonHovered ? "#86EFAC" : "#4ADE80"}
              style={{ transition: "fill 0.15s ease" }}
            />
            <rect
              x="8.5"
              y="2"
              width="3"
              height="16"
              rx="1.5"
              fill={addButtonHovered ? "#86EFAC" : "#4ADE80"}
              style={{ transition: "fill 0.15s ease" }}
            />
          </svg>
        </button>
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
