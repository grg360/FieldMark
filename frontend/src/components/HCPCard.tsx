import { useEffect, useRef, useState } from "react";
import { HCP } from "../data/hcpData";
import { formatCohortScore, formatEngagementDollar, formatIntDisplay } from "../lib/cohort-metrics";
import { buildSubline } from "../lib/subline";
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

function formatScoreInt(score: number | null | undefined): string {
  if (score == null) return "—";
  const n = Number(score);
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

type HCPCardHCP = HCP;

interface HCPCardProps {
  hcp: HCPCardHCP;
  onAddPress: (hcp: HCPCardHCP) => void;
  onCardPress: (hcp: HCPCardHCP) => void;
  /** Opens methodology modal scrolled to Community or Workhorse section. */
  onScoringExplainedPress?: (section: "community" | "workhorse") => void;
}

function cohortStatKeys(cohort: string): readonly string[] {
  if (cohort === "established") return ["PUBS", "CITATIONS", "TRIALS"] as const;
  if (cohort === "community" || cohort === "workhorse") return ["ENGAGEMENT", "COMPANIES", "YEARS"] as const;
  return ["PUB SCORE", "H-INDEX", "PUB YEARS"] as const;
}

/** Left-border accent on feed cards — matches TA selection cohort colors. */
function cohortBorderAccentColor(cohortClassification: string): string {
  switch (cohortClassification) {
    case "rising_star":
    case "dark_horse":
      return "#9B6DFF";
    case "established":
      return "#FFD700";
    case "community":
    case "workhorse":
      return "#7B9EBD";
    default:
      return "#E8A020";
  }
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
  if (key === "PUB SCORE") {
    const v = Number(hcp.pubVel);
    return Number.isFinite(v) ? String(Math.round(v)) : (hcp.pubVel ?? "—");
  }
  if (key === "H-INDEX") {
    return hcp.h_index == null ? "—" : String(hcp.h_index);
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
    "Cohort score (0-100). Weighted combination of pharma engagement total (45%), engagement breadth across companies (25%), Medicare patient volume (15%), and career stage (15%).",
  workhorse:
    "Cohort score (0-100). Weighted combination of Medicare patient volume (60%) and career stage (40%). Identifies high-volume practitioners with low pharma engagement — underleveraged influence.",
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
  onMethodologyPress?: () => void;
}) {
  const {
    variant,
    open,
    onOpenChange,
    touchDevice,
    chipButtonStyle,
    scoreLabel,
    subtitle,
    onMethodologyPress,
  } = props;
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
          if (onMethodologyPress) {
            onOpenChange(false);
            onMethodologyPress();
            return;
          }
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
            marginTop: 8,
            boxSizing: "border-box",
            minWidth: 240,
            maxWidth: 320,
            width: 280,
            padding: "10px 14px",
            backgroundColor: "#111113",
            border: `1px solid ${borderCol}`,
            borderRadius: 4,
            zIndex: 300,
            fontSize: 12,
            color: "#9B9892",
            lineHeight: 1.5,
            whiteSpace: "normal",
            wordWrap: "break-word",
            overflowWrap: "break-word",
            boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
          }}
        >
          {COHORT_SCORE_TIP_TEXT[variant]}
        </div>
      ) : null}
    </div>
  );
}

export default function HCPCard({ hcp, onAddPress, onCardPress, onScoringExplainedPress }: HCPCardProps) {
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
  const borderAccentColor = cohortBorderAccentColor(effectiveCohort);
  const statPillKeys = cohortStatKeys(effectiveCohort);
  const countryCode = getCountryCode(hcp.country ?? null);
  const subline = buildSubline(hcp);
  if (typeof window !== "undefined" && ((hcp as { last_name?: string }).last_name === "McKean" || hcp.name?.includes("McKean"))) {
    console.log("[McKean subline debug]", {
      hcp_id: hcp.id,
      institution: (hcp as any).institution,
      institution_normalized: (hcp as any).institution_normalized,
      institution_full: (hcp as any).institution_full,
      nppes_practice_city: (hcp as any).nppes_practice_city,
      nppes_practice_state: (hcp as any).nppes_practice_state,
      nppes_practice_setting: (hcp as any).nppes_practice_setting,
      npi_specialty: (hcp as any).npi_specialty,
      computed_subline: subline,
    });
  }

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

  const cohortScoreLabel = formatCohortScore(hcp.cohortScore ?? null);

  function renderScoreChip() {
    if (isCommunityPlain) {
      return (
        <CohortScoreChipWithTip
          variant="community"
          open={cohortScoreTipOpen}
          onOpenChange={setCohortScoreTipOpen}
          touchDevice={touchDevice}
          scoreLabel={cohortScoreLabel}
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
          onMethodologyPress={
            onScoringExplainedPress ? () => onScoringExplainedPress("community") : undefined
          }
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
            fontSize: 12,
            fontFamily: "monospace",
            color: accentColor,
            backgroundColor: accentBg,
            border: `1px solid ${accentColor}`,
            borderRadius: 2,
            padding: "2px 8px",
            minHeight: 0,
            cursor: "pointer",
            userSelect: "none",
            lineHeight: 1,
          }}
        >
          {cohortScoreLabel}
        </button>
      );
    }
    if (isWorkhorse) {
      return (
        <CohortScoreChipWithTip
          variant="workhorse"
          open={cohortScoreTipOpen}
          onOpenChange={setCohortScoreTipOpen}
          touchDevice={touchDevice}
          scoreLabel={cohortScoreLabel}
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
          onMethodologyPress={
            onScoringExplainedPress ? () => onScoringExplainedPress("workhorse") : undefined
          }
        />
      );
    }
    if (cohort === "established") {
      return (
        <button
          type="button"
          onClick={handleScoreBadgeClick}
          onTouchEnd={handleScoreBadgeClick}
          style={{
            fontSize: 12,
            fontFamily: "monospace",
            color: accentColor,
            backgroundColor: accentBg,
            border: `1px solid ${accentColor}`,
            borderRadius: 2,
            padding: "2px 8px",
            minHeight: 0,
            cursor: "pointer",
            userSelect: "none",
            lineHeight: 1,
          }}
        >
          {cohortScoreLabel}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={handleScoreBadgeClick}
        onTouchEnd={handleScoreBadgeClick}
        style={{
          fontSize: 12,
          fontFamily: "monospace",
          color: accentColor,
          backgroundColor: accentBg,
          border: `1px solid ${accentColor}`,
          borderRadius: 3,
          padding: "2px 8px",
          minHeight: 0,
          cursor: "pointer",
          userSelect: "none",
          lineHeight: 1,
        }}
      >
        {cohortScoreLabel}
      </button>
    );
  }

  return (
    <>
      <div
        className="fm-hcp-card"
        onClick={handleCardClick}
        style={{
          position: "relative",
          backgroundColor: "#1C1C20",
          border: "1px solid #2A2A2E",
          borderLeft: `3px solid ${borderAccentColor}`,
          borderRadius: 4,
          margin: "0 16px 8px",
          padding: "12px",
          paddingBottom: 36,
          cursor: "pointer",
        }}
      >
        {/* Row 1: Name+flag grouped left, score-as-headline with two-rank stack on right */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 500, color: "#E8E6DF", fontFamily: "system-ui, sans-serif" }}>
                {hcp.name}
              </span>
              {countryCode && (
                <img
                  src={`https://flagcdn.com/16x12/${countryCode}.png`}
                  srcSet={`https://flagcdn.com/32x24/${countryCode}.png 2x`}
                  width="16"
                  height="12"
                  alt={hcp.country || ""}
                  style={{ borderRadius: "2px", objectFit: "cover", flexShrink: 0 }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
          </div>

          {/* Score as headline + two-rank stack */}
          <button
            type="button"
            onClick={handleScoreBadgeClick}
            onTouchEnd={handleScoreBadgeClick}
            title="FieldMark Score: composite signal of publication velocity, citation trajectory, and trial activity within therapeutic area (0-100)"
            style={{
              flexShrink: 0,
              background: "#1A1200",
              border: `1px solid ${accentColor}`,
              borderRadius: 4,
              padding: "8px 12px",
              cursor: "pointer",
              fontFamily: "monospace",
              minWidth: 84,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
            aria-label={`FieldMark Score ${formatScoreInt(hcp.cohortScore ?? hcp.score ?? null)}`}
          >
            <div style={{ fontSize: 20, fontWeight: 500, color: accentColor, lineHeight: 1 }}>
              {formatScoreInt(hcp.cohortScore ?? hcp.score ?? null)}
            </div>
            <div style={{ fontSize: 8, color: "#BA7517", letterSpacing: 0.8, lineHeight: 1, textTransform: "uppercase" }}>
              FieldMark Score
            </div>
            {hcp.rank != null && (
              <div style={{ fontSize: 10, color: "#BA7517", marginTop: 4, lineHeight: 1.4, letterSpacing: 0.4, textAlign: "center" }}>
                #{hcp.rank} {(hcp.scope ?? "US").toUpperCase()}
                {hcp.global_rank != null && (
                  <>
                    <br/>
                    #{hcp.global_rank} GLOBAL
                  </>
                )}
              </div>
            )}
          </button>
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

        {/* Row 2: Institution / location subline */}
        <div style={{ fontSize: 14, color: "#6B6A65", fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
          {subline}
        </div>

        {/* Why_now insight band — fixed min-height for cross-card consistency, content vertically centered */}
        {hcp.why_now && cohort !== "community" && cohort !== "workhorse" ? (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              background: "#2A2A30",
              borderRadius: 4,
              minHeight: 110,
              display: "flex",
              alignItems: "center",
            }}
          >
            <span style={{
              fontSize: 12,
              color: "#D0CCC4",
              fontFamily: "system-ui, sans-serif",
              lineHeight: 1.55,
            }}>
              {hcp.why_now}
            </span>
          </div>
        ) : null}

        {/* Row 4: Stat pills (cohort_classification-driven) */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {statPillKeys.map((key) => (
            <div key={key} style={{ flex: 1, minWidth: 0 }}>
              <StatPillWithTooltip
                label={key}
                value={statValueForKey(hcp, effectiveCohort, key)}
                tooltipKey={key}
                activeTooltip={activeTooltip}
                onTooltipChange={setActiveTooltip}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="fm-hcp-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAddPress(hcp);
          }}
          onMouseEnter={() => setAddButtonHovered(true)}
          onMouseLeave={() => setAddButtonHovered(false)}
          aria-label={`Add action for ${hcp.name}`}
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            width: 20,
            height: 20,
            minHeight: 0,
            minWidth: 20,
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 2,
            transform: addButtonHovered ? "scale(1.05)" : "scale(1)",
            transition: "transform 0.15s ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden={true} style={{ display: "block" }}>
            <rect
              x="2"
              y="8.5"
              width="16"
              height="3"
              rx="1.5"
              fill={addButtonHovered ? "#7AB89A" : "#5A9B7F"}
              style={{ transition: "fill 0.15s ease" }}
            />
            <rect
              x="8.5"
              y="2"
              width="3"
              height="16"
              rx="1.5"
              fill={addButtonHovered ? "#7AB89A" : "#5A9B7F"}
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
