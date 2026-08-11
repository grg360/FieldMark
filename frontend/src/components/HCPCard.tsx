import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { HCP } from "../data/hcpData";
import { useRelationships } from "../contexts/RelationshipsContext";
import { formatEngagementDollar, formatIntDisplay, formatScoreFloor1 } from "../lib/cohort-metrics";
import { institutionToSlug } from "../lib/institutionUtils";
import { supabase } from "../lib/supabase";
import { buildSubline } from "../lib/subline";
import InfoTooltip from "./InfoTooltip";
import { StatPillWithTooltip } from "./StatPillWithTooltip";
import { FONT, COLOR } from "../lib/designTokens";

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
    "Change in publication output between 2016-2020 and 2021-2025: senior-author paper count, citation volume, and senior-author share.",
  "NETWORK MOMENTUM":
    "Change in co-authorship network centrality between 2016-2020 and 2021-2025: eigenvector, degree, and betweenness.",
  "SCIENTIFIC VISIBILITY":
    "Current publication footprint in the recent 5-year window: total publications and citation rate.",
  "NETWORK VISIBILITY":
    "Current co-authorship centrality for this therapeutic area in the recent 5-year window.",
  EMERGENCE:
    "Who is establishing themselves scientifically? Recent (2021-2025) AD publication trajectory — output (45%), senior/first authorship (35%), citations per paper (20%) — ranked within the rising cohort.",
  "NETWORK INFLUENCE":
    "How connected are they? Position in the AD collaboration graph.",
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

// Card-local metric cell — the design's recessed well-strip treatment (§Elevation tier 2 +
// §type role 6/9). FORKED from StatPillWithTooltip's default pill rather than restyling that
// shared primitive: it is passed as `children` to StatPillWithTooltip, so the tooltip machinery
// (positioning + TOOLTIP_MAP copy) is preserved. `pct` drives the 2px indigo fill and is provided
// only for percentile metrics (Established Scientific/Network/Pharma); other cohorts pass null so
// no misleading bar is drawn under a dollar amount or a raw count.
function CardMetricCell({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number | null;
}) {
  return (
    <div style={{ background: "#0d0c0b", padding: "11px 13px 12px", width: "100%", boxSizing: "border-box" }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#6E6A62",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          fontFamily: FONT.mono,
          fontSize: 17,
          fontWeight: 500,
          color: "#DAD7CF",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {pct != null && Number.isFinite(pct) && (
        <div style={{ marginTop: 8, height: 2, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, pct))}%`,
              background: COLOR.indigo,
              borderRadius: 2,
            }}
          />
        </div>
      )}
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
  is_industry_affiliated?: boolean;
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
  /** Opens methodology modal scrolled to the Community section. */
  onScoringExplainedPress?: (section: "community") => void;
}

function cohortStatKeys(cohort: string): readonly string[] {
  if (cohort === "established") return ["SCIENTIFIC", "NETWORK", "PHARMA"] as const;
  if (cohort === "community") return ["ENGAGEMENT", "COMPANIES", "YEARS"] as const;
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
  if (cohort === "community") {
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

// Community roster tier labels (Phase 3): card chip vocabulary. heme_dominant
// gets the affirmative different-specialty label, never a deficit one.
const COMMUNITY_TIER_CARD_LABEL: Record<string, string> = {
  anchored: "ANCHORED · NSCLC EVIDENCE",
  supported: "SUPPORTED · NSCLC EVIDENCE",
  heme_dominant: "HEME-FOCUSED PRACTICE",
  candidate: "CANDIDATE",
  unresolved: "NO MEDICARE EVIDENCE",
};


function cardStatusStyle(status: string): { bg: string; fg: string; border?: string } {
  switch (status) {
    case "targeted":
      return { bg: "#1E1E22", fg: "#9B9892" };
    case "contacted":
      return { bg: "#9B6DFF", fg: "#FFFFFF" };
    case "engaged":
      return { bg: "#3FB8AF", fg: "#0A0A0B" };
    case "active_relationship":
      // --info cyan, not amber: amber stays scarce for the score numeral. Other status
      // semantics (contacted/engaged/paused) are unchanged.
      return { bg: COLOR.info, fg: "#0A0A0B" };
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

export default function HCPCard({ hcp, onAddPress: _onAddPress, onCardPress }: HCPCardProps) {
  const navigate = useNavigate();
  const { isSaved, toggleSave, getInsightCount, getFollowUpInfo, relationshipMap } = useRelationships();
  const [savePending, setSavePending] = useState(false);
  const hcpId = String(hcp.hcp_id ?? hcp.id ?? "");
  const saved = hcpId ? isSaved(hcpId) : false;
  const insightCount = hcpId ? getInsightCount(hcpId) : 0;
  const followUpInfo = hcpId ? getFollowUpInfo(hcpId) : { openCount: 0, hasOverdue: false };
  const showFollowUpBadge = followUpInfo.openCount > 0;
  const relationship = hcpId ? relationshipMap.get(hcpId) : undefined;
  const status = relationship?.status;
  const showStatus = status && status !== "not_engaged";
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [bookmarkHovered, setBookmarkHovered] = useState(false);
  const cohort = (hcp.cohort_classification ?? "").trim();
  const effectiveCohort =
    cohort === ""
      ? "rising_star"
      : cohort;
  const scoreTooltipKey =
    effectiveCohort === "established" ? "FIELDMARK_SCORE_ESTABLISHED"
    : effectiveCohort === "community" ? "FIELDMARK_SCORE_COMMUNITY"
    : "FIELDMARK_SCORE_RISING";
  const isDarkHorse = cohort === "dark_horse";
  const isCommunityPlain = cohort === "community";
  const accentColor = isDarkHorse ? "#9B6DFF" : "#E8A020";
  const borderAccentColor = cohortBorderAccentColor(effectiveCohort);
  const statPillKeys = cohortStatKeys(effectiveCohort);
  const isRisingCohort = effectiveCohort === "rising_star" || effectiveCohort === "dark_horse";
  const risingScopeLabel = hcp.scope === "US" ? "US" : "GLOBAL";
  // Community (Phase 3 roster): not ranked — no #rank, no numeral; the badge
  // slot carries the evidence tier + Medicare reach fact instead.
  const displayRank = isRisingCohort ? (hcp.scope_rank ?? hcp.rank) : isCommunityPlain ? null : hcp.rank;
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
    onCardPress(hcp);
  }

  function handleScoreBadgeClick(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    onCardPress(hcp);
  }


  // Score numeral: floor to one decimal for Established (cohort_score) and Rising Star /
  // Dark Horse (rising_star_percentile) — see formatScoreFloor1. Community/unclassified
  // keep integer display. Numeral size stays 28px.
  const numeralScoreRaw = hcp.cohortScore ?? hcp.score ?? null;
  const usesFloorScore =
    effectiveCohort === "established" ||
    effectiveCohort === "rising_star" ||
    effectiveCohort === "dark_horse";
  const numeralScoreDisplay = usesFloorScore
    ? formatScoreFloor1(numeralScoreRaw)
    : formatScoreInt(numeralScoreRaw);


  return (
    <>
      <div
        className="fm-hcp-card elevation-card elevation-interactive"
        onClick={handleCardClick}
        style={{
          position: "relative",
          // Tier-1 card surface (fill, radius 11, top-highlight + soft shadow) comes from
          // .elevation-card; hover→tier-3 from .elevation-interactive. Only the cohort accent
          // stripe stays inline — cohort colors are untouched per the redesign scope.
          borderLeft: `3px solid ${borderAccentColor}`,
          margin: "0 16px 12px",
          padding: "18px 20px 40px",
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
            {/* Name is a real anchor to the profile — the whole card also navigates
                there, but the anchor adds open-in-new-tab, keyboard focus and
                middle-click. Same destination, so stop propagation to avoid a
                double navigation. Visually identical to the prior span. */}
            <Link
              to={hcpId ? `/hcp/${hcpId}` : "#"}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 21,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                lineHeight: 1.1,
                color: "#F2F0EA",
                fontFamily: FONT.sans,
                minWidth: 0,
                flexShrink: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              {hcp.name}
            </Link>
            {countryCode && (
              // Flag emoji per the List mockup (it shows 🇺🇸, not a mono country code).
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
              hcp.rising_model !== "composite" &&
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
            {hcp.rising_model === "composite" && hcp.is_industry_affiliated && (
              <span
                title="Industry-affiliated author"
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
                  backgroundColor: "rgba(232, 160, 32, 0.12)",
                  color: "#E8A020",
                  border: "1px solid rgba(232, 160, 32, 0.4)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Industry
              </span>
            )}
          </div>

          <div
            className="fm-hcp-institution"
            style={{
              fontSize: 13,
              color: "#928E86",
              fontFamily: FONT.sans,
              marginTop: 7,
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
                    color: COLOR.indigoLink,
                    borderBottom: "1px solid rgba(139,147,242,0.35)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = COLOR.indigoLinkHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = COLOR.indigoLink;
                  }}
                >
                  {cardInstitution}
                </span>
                {cardState ? (
                  <span style={{ color: "#57534b" }}>
                    {" \u00b7 "}
                    {cardState}
                  </span>
                ) : null}
              </>
            ) : (
              affiliationLine
            )}
          </div>
        </div>

        {/* Community (Phase 3): tier + reach facts in the badge slot — no score,
            no rank, no tooltip. heme_dominant wears the AFFIRMATIVE different-
            specialty label, not a deficit one. */}
        {isCommunityPlain ? (
          <div
            style={{ position: "absolute", top: 12, right: 12, textAlign: "right", zIndex: 1, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "#7B9EBD",
                backgroundColor: "rgba(123,158,189,0.12)",
                border: "1px solid rgba(123,158,189,0.4)",
                borderRadius: 3,
                padding: "3px 8px",
              }}
            >
              {COMMUNITY_TIER_CARD_LABEL[hcp.evidenceTier ?? ""] ?? "COMMUNITY"}
            </span>
            {hcp.patientVolume != null && hcp.patientVolume > 0 ? (
              <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "#B8B4AC", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(hcp.patientVolume).toLocaleString()} <span style={{ color: "#77736B" }}>MEDICARE BENES · 3YR</span>
              </span>
            ) : null}
          </div>
        ) : (
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
          aria-label={`FieldMark Score ${numeralScoreDisplay}`}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: accentColor,
              lineHeight: 1,
              letterSpacing: "-0.01em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {numeralScoreDisplay}
          </div>
          {displayRank != null && (
            // Rank string carries the added presence (numeral stays 28): mono ranks + sans unit
            // labels, US brighter than GLOBAL, per the monospace rule (#N is a rank → mono; the
            // US/GLOBAL scope word is a categorical label → sans).
            <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.3, whiteSpace: "nowrap" }}>
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "#E4E1D9",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                #{displayRank}
              </span>
              <span style={{ fontFamily: FONT.sans, color: "#77736B", letterSpacing: "0.06em" }}>
                {" "}
                {isRisingCohort ? risingScopeLabel : (hcp.country ?? "US").toUpperCase()}
              </span>
              {!isRisingCohort && hcp.global_rank != null && (
                <>
                  <span style={{ color: "#3d3a34" }}> · </span>
                  <span
                    style={{
                      fontFamily: FONT.mono,
                      fontWeight: 500,
                      color: "#8f8b83",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    #{hcp.global_rank}
                  </span>
                  <span style={{ fontFamily: FONT.sans, color: "#57534b", letterSpacing: "0.06em" }}>
                    {" "}
                    GLOBAL
                  </span>
                </>
              )}
            </div>
          )}
        </button>
        )}

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
                ? "Composite of Momentum (70%, change in scientific output and network position over the last 5 years) and Visibility (30%, current publication and collaboration footprint). Normalized 0-100 within the Rising Star cohort."
                : scoreTooltipKey === "FIELDMARK_SCORE_ESTABLISHED"
                ? "Composite of Scientific Influence (50%, publication leadership), Network Influence (35%, co-authorship graph centrality), and Pharma Engagement (15%, Open Payments record). Normalized 0-100 within the Established cohort."
                : "Composite of patient volume (40%), pharma engagement (30%), group practice signal (15%), career years (10%), and publication signal (5%). Normalized 0-100 within the Community cohort."}
            </div>
          </div>
        )}

        {/* Dark Horse cohort badge */}
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

        {/* Why_now narrative — role-7 serif prose, 3-line clamp; no filled band (the design
            sets prose directly on the card). Full narrative on card click → detail. */}
        {(hcp.why_now || hcp.narrative) ? (
          <p
            style={{
              margin: "15px 0 0",
              fontFamily: FONT.serif,
              fontSize: 13.5,
              lineHeight: 1.58,
              color: "#A29E96",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {hcp.why_now ?? hcp.narrative}
          </p>
        ) : null}

        {/* Row 4: Stat pills (cohort_classification-driven) */}
        {cohort === "rising_star" && hcp.rising_model === "composite" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 12,
            }}
          >
            <RisingStarSignalTile
              label="EMERGENCE"
              value={Math.round(hcp.emergence_pctile ?? 0)}
              barColor="#3FB8AF"
              tooltip={RISING_STAR_TILE_TOOLTIPS["EMERGENCE"]}
            />
            <RisingStarSignalTile
              label="NETWORK INFLUENCE"
              value={Math.round(hcp.networkInfluencePctile ?? 0)}
              barColor="#E8A04E"
              tooltip={RISING_STAR_TILE_TOOLTIPS["NETWORK INFLUENCE"]}
            />
          </div>
        ) : cohort === "rising_star" ? (
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
        ) : isRisingCohort ? (
        // Dark Horse (rising family) keeps its existing pill row incl. the cohort-colored
        // archetype pill — cohort specifics untouched.
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
        ) : (
          // Established / Community / unclassified: recessed well strip (tier-2),
          // mono values, indigo percentile bar for Established only.
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            {statPillKeys.map((key) => {
              const val = statValueForKey(hcp, effectiveCohort, key);
              const pct = effectiveCohort === "established" ? Number(val) : null;
              return (
                <StatPillWithTooltip
                  key={key}
                  label={key}
                  value={val}
                  tooltipKey={key}
                  activeTooltip={activeTooltip}
                  onTooltipChange={setActiveTooltip}
                >
                  <CardMetricCell label={key} value={val} pct={pct} />
                </StatPillWithTooltip>
              );
            })}
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
                  gap: 4,
                  lineHeight: 1,
                  color: COLOR.indigoLink,
                  fontSize: 11,
                  pointerEvents: "none",
                }}
              >
                <span style={{ fontSize: 11 }}>{String.fromCodePoint(0x1F4DD)}</span>
                <span style={{ fontFamily: FONT.mono, fontVariantNumeric: "tabular-nums" }}>
                  {insightCount}
                </span>
              </div>
            ) : null}

            {hcpId && showFollowUpBadge ? (
              <div
                aria-label={`${followUpInfo.openCount} open follow-up${followUpInfo.openCount === 1 ? "" : "s"}${followUpInfo.hasOverdue ? ", overdue" : ""}`}
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
                <span style={{ fontSize: 11 }}>{String.fromCodePoint(0x1F4CC)}</span>
                <span>{followUpInfo.openCount}</span>
                {followUpInfo.hasOverdue ? (
                  <span style={{ color: "#E8A020", fontSize: 11, marginLeft: 2 }}>
                    {String.fromCharCode(0x26A0)}
                  </span>
                ) : null}
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
                <BookmarkCheck size={14} color={COLOR.info} fill={COLOR.info} />
              ) : (
                <Bookmark size={14} color="#5A9B7F" />
              )}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
