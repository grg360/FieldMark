import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { HCP } from "../data/hcpData";
import { useRelationships } from "../contexts/RelationshipsContext";
import { formatCohortScore, formatEngagementDollar, formatIntDisplay } from "../lib/cohort-metrics";
import { institutionToSlug } from "../lib/institutionUtils";
import { supabase } from "../lib/supabase";
import { buildSubline } from "../lib/subline";
import InfoTooltip from "./InfoTooltip";
import { StatPillWithTooltip } from "./StatPillWithTooltip";
import ScoreModal from "./ScoreModal";

function risingStarArchetypeShortLabel(archetype: string | null | undefined): string {
  switch (archetype) {
    case "Balanced Rising Star":   return "BALANCED";
    case "Scientific Accelerator": return "SCIENCE";
    case "Network Accelerator":    return "NETWORK";
    case "Emerging Leader":        return "RISING STAR";
    default:                       return "RISING STAR";
  }
}

function risingStarArchetypeColor(archetype: string | null | undefined): string {
  switch (archetype) {
    case "Balanced Rising Star":   return "#9B6DFF";
    case "Scientific Accelerator": return "#3FB8AF";
    case "Network Accelerator":    return "#E8A04E";
    case "Emerging Leader":        return "#6B6A65";
    default:                       return "#6B6A65";
  }
}

const RISING_STAR_TILE_TOOLTIPS: Record<string, string> = {
  "SCIENTIFIC MOMENTUM":
    "Growth in publication output, citation volume, and senior-authorship across 2016-2020 vs 2021-2025.",
  "NETWORK MOMENTUM":
    "Growth in collaboration network centrality across 2016-2020 vs 2021-2025.",
  "SCIENTIFIC VISIBILITY":
    "Current publication footprint and citation impact within the Rising Star cohort.",
  "NETWORK VISIBILITY":
    "Current position in the co-authorship network for this therapeutic area.",
};

function RisingStarSignalTile({
  label,
  value,
  barColor,
  tooltip,
}: {
  label: string;
  value: number;
  barColor: string;
  tooltip: string;
}) {
  return (
    <div
      style={{
        background: "#0F0F0F",
        border: "1px solid #2A2A2A",
        borderRadius: 6,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <InfoTooltip content={tooltip} style={{ display: "block", width: "100%" }}>
        <div
          style={{
            fontSize: 9,
            color: "#6B6A65",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
          }}
        >
          {label}
        </div>
      </InfoTooltip>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "#FFFFFF",
          marginTop: 2,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 6,
          height: 3,
          background: "#1A1A1A",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${value}%`,
            background: barColor,
          }}
        />
      </div>
    </div>
  );
}

const getCountryCode = (country: string | null): string | null => {
  if (!country) return null;
  const c = country.trim().replace(/\.$/, "").toLowerCase();
  if (/^[a-z]{2}$/.test(c)) {
    return c;
  }
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

type HCPCardHCP = HCP & {
  momentum_component?: number | null;
  visibility_component?: number | null;
  archetype?: string | null;
  scope_rank?: number | null;
  scientific_momentum_percentile?: number | null;
  network_momentum_percentile?: number | null;
  scientific_visibility_percentile?: number | null;
  network_visibility_percentile?: number | null;
};

function formatCardAffiliationLine(hcp: HCPCardHCP): string {
  const { institution, state } = getCardInstitutionAndState(hcp);
  if (institution && state) return `${institution} · ${state}`;
  if (institution) return institution;
  return buildSubline(hcp);
}

function getCardInstitutionAndState(hcp: HCPCardHCP): { institution: string; state: string } {
  const institution = String(
    hcp.institutionShort ??
      (hcp as { institution_normalized?: string | null }).institution_normalized ??
      hcp.institution ??
      "",
  ).trim();
  const state = String(
    hcp.nppesPracticeState ??
      (hcp as { nppes_practice_state?: string | null }).nppes_practice_state ??
      "",
  ).trim();
  return { institution, state };
}

function shortArchetypeLabel(archetype: string | null | undefined): string {
  switch (archetype) {
    case "Balanced Rising Star":
      return "BALANCED";
    case "Scientific Accelerator":
      return "SCIENCE";
    case "Network Accelerator":
      return "NETWORK";
    case "Emerging Leader":
      return "RISING STAR";
    default:
      return "RISING STAR";
  }
}

function archetypePillStyle(archetype: string | null | undefined): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  switch (archetype) {
    case "Balanced Rising Star":
      return { backgroundColor: "rgba(155, 109, 255, 0.18)", borderColor: "#9B6DFF", color: "#E8E6DF" };
    case "Scientific Accelerator":
      return { backgroundColor: "rgba(63, 184, 175, 0.18)", borderColor: "#3FB8AF", color: "#E8E6DF" };
    case "Network Accelerator":
      return { backgroundColor: "rgba(232, 160, 78, 0.18)", borderColor: "#E8A04E", color: "#E8E6DF" };
    case "Emerging Leader":
      return { backgroundColor: "rgba(107, 106, 101, 0.18)", borderColor: "#6B6A65", color: "#9B9892" };
    default:
      return { backgroundColor: "rgba(107, 106, 101, 0.18)", borderColor: "#6B6A65", color: "#9B9892" };
  }
}

function risingArchetypeLabel(hcp: HCPCardHCP): string | null | undefined {
  return hcp.archetype ?? hcp.npiSpecialty ?? null;
}

interface HCPCardProps {
  hcp: HCPCardHCP;
  onAddPress: (hcp: HCPCardHCP) => void;
  onCardPress: (hcp: HCPCardHCP) => void;
  /** Opens methodology modal scrolled to Community or Workhorse section. */
  onScoringExplainedPress?: (section: "community" | "workhorse") => void;
}

function cohortStatKeys(cohort: string): readonly string[] {
  if (cohort === "established") return ["SCIENTIFIC", "NETWORK", "PHARMA"] as const;
  if (cohort === "community" || cohort === "workhorse") return ["ENGAGEMENT", "COMPANIES", "YEARS"] as const;
  if (cohort === "rising_star" || cohort === "dark_horse") {
    return ["MOMENTUM", "VISIBILITY", "ARCHETYPE"] as const;
  }
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
    if (key === "SCIENTIFIC") return formatScoreInt(hcp.scientificInfluencePctile);
    if (key === "NETWORK") return formatScoreInt(hcp.networkInfluencePctile);
    if (key === "PHARMA") return formatScoreInt(hcp.pharmaEngagementPctile);
    return "—";
  }
  if (cohort === "community" || cohort === "workhorse") {
    if (key === "ENGAGEMENT") return formatEngagementDollar(hcp.openPaymentsLifetime ?? null);
    if (key === "COMPANIES") return formatIntDisplay(hcp.distinctCompanies ?? null);
    if (key === "YEARS") return formatIntDisplay(hcp.careerYears ?? null);
    return "—";
  }
  if (cohort === "rising_star" || cohort === "dark_horse") {
    if (key === "MOMENTUM") {
      return formatScoreInt(hcp.momentum_component ?? hcp.scientificInfluencePctile ?? null);
    }
    if (key === "VISIBILITY") {
      return formatScoreInt(hcp.visibility_component ?? hcp.networkInfluencePctile ?? null);
    }
    if (key === "ARCHETYPE") {
      return shortArchetypeLabel(risingArchetypeLabel(hcp));
    }
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

function cardStatusStyle(status: string): { bg: string; fg: string; border?: string } {
  switch (status) {
    case "targeted":
      return { bg: "#1E1E22", fg: "#9B9892" };
    case "contacted":
      return { bg: "#9B6DFF", fg: "#FFFFFF" };
    case "engaged":
      return { bg: "#3FB8AF", fg: "#0A0A0B" };
    case "active_relationship":
      return { bg: "#E8A020", fg: "#0A0A0B" };
    case "paused":
      return { bg: "transparent", fg: "#E8A020", border: "1px solid #E8A020" };
    default:
      return { bg: "#2A2A30", fg: "#9B9892" };
  }
}

function cardStatusLabel(status: string): string {
  switch (status) {
    case "targeted":
      return "TARGETED";
    case "contacted":
      return "CONTACTED";
    case "engaged":
      return "ENGAGED";
    case "active_relationship":
      return "ACTIVE";
    case "paused":
      return "PAUSED";
    default:
      return status.toUpperCase();
  }
}

export default function HCPCard({ hcp, onAddPress: _onAddPress, onCardPress, onScoringExplainedPress }: HCPCardProps) {
  const navigate = useNavigate();
  const { isSaved, toggleSave, getInsightCount, relationshipMap } = useRelationships();
  const [savePending, setSavePending] = useState(false);
  const hcpId = String(hcp.hcp_id ?? hcp.id ?? "");
  const saved = hcpId ? isSaved(hcpId) : false;
  const insightCount = hcpId ? getInsightCount(hcpId) : 0;
  const relationship = hcpId ? relationshipMap.get(hcpId) : undefined;
  const status = relationship?.status;
  const showStatus = status && status !== "not_engaged";
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [cohortScoreTipOpen, setCohortScoreTipOpen] = useState(false);
  const [bookmarkHovered, setBookmarkHovered] = useState(false);
  const touchDevice =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const cohort = (hcp.cohort_classification ?? "").trim();
  const effectiveCohort =
    cohort === ""
      ? "rising_star"
      : cohort;
  const scoreTooltipKey =
    effectiveCohort === "established" ? "FIELDMARK_SCORE_ESTABLISHED"
    : (effectiveCohort === "community" || effectiveCohort === "workhorse") ? "FIELDMARK_SCORE_COMMUNITY"
    : "FIELDMARK_SCORE_RISING";
  const isDarkHorse = cohort === "dark_horse";
  const isWorkhorse = cohort === "workhorse";
  const isCommunityPlain = cohort === "community";
  const accentColor = isDarkHorse ? "#9B6DFF" : isWorkhorse ? "#4ECDC4" : "#E8A020";
  const accentBg = isDarkHorse ? "#0D0A1A" : isWorkhorse ? "#0A1A18" : "#1A1200";
  const borderAccentColor = cohortBorderAccentColor(effectiveCohort);
  const statPillKeys = cohortStatKeys(effectiveCohort);
  const isRisingCohort = effectiveCohort === "rising_star" || effectiveCohort === "dark_horse";
  const risingScopeLabel = hcp.scope === "US" ? "US" : "GLOBAL";
  const displayRank = isRisingCohort ? (hcp.scope_rank ?? hcp.rank) : hcp.rank;
  const countryCode = getCountryCode(hcp.country ?? null);
  const { institution: cardInstitution, state: cardState } = getCardInstitutionAndState(hcp);
  const affiliationLine = formatCardAffiliationLine(hcp);
  if (typeof window !== "undefined" && (hcp as { last_name?: string }).last_name === "McKean") {
    console.log("[McKean subline debug]", {
      hcp_id: hcp.id,
      institution: (hcp as any).institution,
      institution_normalized: (hcp as any).institution_normalized,
      institution_full: (hcp as any).institution_full,
      nppes_practice_city: (hcp as any).nppes_practice_city,
      nppes_practice_state: (hcp as any).nppes_practice_state,
      nppes_practice_setting: (hcp as any).nppes_practice_setting,
      computed_subline: affiliationLine,
    });
  }

  async function handleInstitutionClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!cardInstitution) return;

    const instHcpId = String(hcp.hcp_id ?? hcp.id ?? "");
    if (!instHcpId) {
      navigate(`/institution/${institutionToSlug(cardInstitution)}`);
      return;
    }

    const { data } = await supabase
      .from("hcps_v2")
      .select("institution_canonical")
      .eq("id", instHcpId)
      .maybeSingle();

    const canonical = data?.institution_canonical ?? cardInstitution;
    navigate(`/institution/${institutionToSlug(canonical)}`);
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

  const cohortScoreLabel =
    effectiveCohort === "established"
      ? formatScoreInt(hcp.cohortScore ?? null)
      : formatCohortScore(hcp.cohortScore ?? null);

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
        {/* Identity block — left column; max width keeps institution clear of score + rank badge */}
        <div
          className="fm-hcp-identity"
          style={{
            maxWidth: "min(65%, calc(100% - 136px))",
            width: "min(65%, calc(100% - 136px))",
            minWidth: 0,
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", minWidth: 0 }}>
            <span
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: "#E8E6DF",
                fontFamily: "system-ui, sans-serif",
                minWidth: 0,
                flexShrink: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
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
            {hcp.cohort_classification === "rising_star" &&
              hcp.archetype &&
              hcp.archetype !== "Emerging Leader" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 22,
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  borderRadius: 4,
                  verticalAlign: "middle",
                  backgroundColor: risingStarArchetypeColor(hcp.archetype),
                  color: "#FFFFFF",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {risingStarArchetypeShortLabel(hcp.archetype)}
              </span>
            )}
          </div>

          <div
            className="fm-hcp-institution"
            style={{
              fontSize: 12,
              color: "#B8B4AC",
              fontFamily: "system-ui, sans-serif",
              marginTop: 4,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {cardInstitution ? (
              <>
                <span
                  onClick={handleInstitutionClick}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px dotted #6B6A65",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#E8E6DF";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "inherit";
                  }}
                >
                  {cardInstitution}
                </span>
                {cardState ? (
                  <>
                    {" \u00b7 "}
                    {cardState}
                  </>
                ) : null}
              </>
            ) : (
              affiliationLine
            )}
          </div>
        </div>

        {/* Score — absolute-positioned top-right corner */}
        <button
          type="button"
          onClick={handleScoreBadgeClick}
          onTouchEnd={handleScoreBadgeClick}
          onMouseEnter={() => setActiveTooltip(scoreTooltipKey)}
          onMouseLeave={() => setActiveTooltip(null)}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "monospace",
            textAlign: "right",
            zIndex: 1,
          }}
          aria-label={`FieldMark Score ${formatScoreInt(hcp.cohortScore ?? hcp.score ?? null)}`}
        >
          <div style={{ fontSize: 28, fontWeight: 600, color: accentColor, lineHeight: 1 }}>
            {formatScoreInt(hcp.cohortScore ?? hcp.score ?? null)}
          </div>
          {displayRank != null && (
            <div style={{ fontSize: 10, color: "#E8E6DF", marginTop: 6, lineHeight: 1.4, letterSpacing: 0.4 }}>
              #{displayRank}{" "}
              {isRisingCohort ? risingScopeLabel : (hcp.country ?? "US").toUpperCase()}
              {!isRisingCohort && hcp.global_rank != null ? ` · #${hcp.global_rank} GLOBAL` : ""}
            </div>
          )}
        </button>

        {/* Score tooltip — rendered when activeTooltip matches */}
        {activeTooltip === scoreTooltipKey && (
          <div
            style={{
              position: "absolute",
              top: 56,
              right: 12,
              width: 240,
              backgroundColor: "#111113",
              border: "1px solid #E8A020",
              borderRadius: 4,
              padding: "10px 12px",
              zIndex: 200,
              pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: "#E8E6DF" }}>FieldMark Score</div>
            <div style={{ fontSize: 11, color: "#9B9892", marginTop: 4, lineHeight: 1.5 }}>
              {scoreTooltipKey === "FIELDMARK_SCORE_RISING"
                ? "Composite signal of publication velocity, citation trajectory, and clinical trial activity within the therapeutic area, with career-stage adjustment. Normalized 0-100 within the rising star cohort."
                : scoreTooltipKey === "FIELDMARK_SCORE_ESTABLISHED"
                ? "Composite signal of publication volume, recent productivity, lead authorship density, clinical trial activity, career length, and pharma engagement breadth. Normalized 0-100 within the established cohort."
                : "Composite signal of pharma engagement, engagement breadth across companies, Medicare patient volume, and career stage. Normalized 0-100 within the community cohort."}
            </div>
          </div>
        )}

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

        {/* Why_now insight band — 3-line clamp; full narrative on card click → detail */}
        {hcp.why_now && cohort !== "community" && cohort !== "workhorse" ? (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              background: "#2A2A30",
              borderRadius: 4,
            }}
          >
            <span style={{
              fontSize: 12,
              color: "#D0CCC4",
              fontFamily: "system-ui, sans-serif",
              lineHeight: 1.55,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {hcp.why_now}
            </span>
          </div>
        ) : null}

        {/* Row 4: Stat pills (cohort_classification-driven) */}
        {cohort === "rising_star" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 12,
            }}
          >
            <RisingStarSignalTile
              label="SCIENTIFIC MOMENTUM"
              value={Math.round(hcp.scientific_momentum_percentile ?? 0)}
              barColor="#3FB8AF"
              tooltip={RISING_STAR_TILE_TOOLTIPS["SCIENTIFIC MOMENTUM"]}
            />
            <RisingStarSignalTile
              label="NETWORK MOMENTUM"
              value={Math.round(hcp.network_momentum_percentile ?? 0)}
              barColor="#E8A04E"
              tooltip={RISING_STAR_TILE_TOOLTIPS["NETWORK MOMENTUM"]}
            />
            <RisingStarSignalTile
              label="SCIENTIFIC VISIBILITY"
              value={Math.round(hcp.scientific_visibility_percentile ?? 0)}
              barColor="#3FB8AF"
              tooltip={RISING_STAR_TILE_TOOLTIPS["SCIENTIFIC VISIBILITY"]}
            />
            <RisingStarSignalTile
              label="NETWORK VISIBILITY"
              value={Math.round(hcp.network_visibility_percentile ?? 0)}
              barColor="#E8A04E"
              tooltip={RISING_STAR_TILE_TOOLTIPS["NETWORK VISIBILITY"]}
            />
          </div>
        ) : (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {statPillKeys.map((key) => (
            <div key={key} style={{ flex: 1, minWidth: 0 }}>
              {isRisingCohort && key === "ARCHETYPE" ? (
                <StatPillWithTooltip
                  label=""
                  tooltipKey={key}
                  activeTooltip={activeTooltip}
                  onTooltipChange={setActiveTooltip}
                >
                  {(() => {
                    const archetype = risingArchetypeLabel(hcp);
                    const style = archetypePillStyle(archetype);
                    return (
                      <div
                        style={{
                          backgroundColor: style.backgroundColor,
                          border: `1px solid ${style.borderColor}`,
                          borderRadius: 3,
                          padding: "4px 8px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 2,
                          width: "100%",
                          boxSizing: "border-box",
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "#6B6A65",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          ARCHETYPE
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: style.color,
                            fontFamily: "monospace",
                            fontWeight: 600,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {shortArchetypeLabel(archetype)}
                        </span>
                      </div>
                    );
                  })()}
                </StatPillWithTooltip>
              ) : (
                <StatPillWithTooltip
                  label={key}
                  value={statValueForKey(hcp, effectiveCohort, key)}
                  tooltipKey={key}
                  activeTooltip={activeTooltip}
                  onTooltipChange={setActiveTooltip}
                />
              )}
            </div>
          ))}
        </div>
        )}

        {hcpId ? (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              zIndex: 2,
            }}
          >
            {showStatus ? (
              <div
                aria-label={`Relationship status: ${cardStatusLabel(status)}`}
                style={{
                  padding: "2px 6px",
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 500,
                  backgroundColor: cardStatusStyle(status).bg,
                  color: cardStatusStyle(status).fg,
                  border: cardStatusStyle(status).border ?? "none",
                  pointerEvents: "none",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  lineHeight: 1,
                  letterSpacing: "0.05em",
                }}
              >
                {cardStatusLabel(status)}
              </div>
            ) : null}

            {insightCount > 0 ? (
              <div
                aria-label={`${insightCount} insight${insightCount === 1 ? "" : "s"}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  lineHeight: 1,
                  color: "#9B9892",
                  fontSize: 11,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  pointerEvents: "none",
                }}
              >
                <span style={{ fontSize: 11 }}>{String.fromCodePoint(0x1F4DD)}</span>
                <span>{insightCount}</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (savePending) return;
                setSavePending(true);
                void toggleSave(hcpId, "cohort_card")
                  .catch(() => {})
                  .finally(() => setSavePending(false));
              }}
              onMouseEnter={() => setBookmarkHovered(true)}
              onMouseLeave={() => setBookmarkHovered(false)}
              disabled={savePending}
              aria-label={saved ? "Unsave HCP" : "Save HCP"}
              style={{
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
                cursor: savePending ? "default" : "pointer",
                opacity: savePending ? 0.6 : 1,
                transform: bookmarkHovered ? "scale(1.05)" : "scale(1)",
                transition: "transform 0.15s ease",
              }}
            >
              {saved ? (
                <BookmarkCheck size={14} color="#3FB8AF" fill="#3FB8AF" />
              ) : (
                <Bookmark size={14} color="#5A9B7F" />
              )}
            </button>
          </div>
        ) : null}
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
