import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { HCP } from "../data/hcpData";
import { useRelationships } from "../contexts/RelationshipsContext";
import { getCurrentUser } from "../lib/authHelpers";
import AddToWatchlistPopover from "./AddToWatchlistPopover";
import { institutionToSlug } from "../lib/institutionUtils";
import { fetchHcpThemes, getCommunityScoreBreakdown, getEstablishedScoreBreakdown, getHCPNarrative, getHcpWebSignals, getPublicationTimeline, getRisingStarScoreBreakdown, type CommunityScoreBreakdown, type EstablishedScoreBreakdown, type PublicationTimelinePoint, type RisingStarScoreBreakdown, type WebSignal } from "../lib/api";
import { taLabelToApiSlug } from "../lib/routeSlugs";
import { useMediaQuery } from "../lib/useMediaQuery";
import ScientificNarrativeSection from "./ScientificNarrativeSection";
import type { ResearchTheme } from "../types/researchTheme";
import { formatCohortScore, formatEngagementDollar, formatIntDisplay } from "../lib/cohort-metrics";
import { buildSubline, titleCaseCity } from "../lib/subline";
import { StatPillWithTooltip } from "./StatPillWithTooltip";
import ContextualizeHCPForm from "./ContextualizeHCPForm";
import OptOutRequestForm from "./OptOutRequestForm";
import { FiChip, FiModal, FiToast } from "./FieldIntelligenceShared";
import TopPharmaCompanies from "./TopPharmaCompanies";
import DrugConstellation from "./DrugConstellation";
import ScoreBreakdownV3 from "./ScoreBreakdownV3";
import ScoreBreakdownV3Rising from "./ScoreBreakdownV3Rising";
import ScoreBreakdownV3Community from "./ScoreBreakdownV3Community";
import MiniCollaboratorNetwork from "./MiniCollaboratorNetwork";
import GlobalFooter from "./GlobalFooter";
import ContactAccessCard from "./ContactAccessCard";
import { RIGHT_RAIL_HEADER_STYLE, RIGHT_RAIL_SECTION_STYLE } from "./rightRailStyles";
import { RISING_STAR_METHODOLOGY } from "../lib/methodologyConfig";
import { FONT, COLOR } from "../lib/designTokens";
import { FI_ACCENT_MUTED, mockFieldIntelContributorCount } from "../lib/fieldIntelligenceUi";
import FieldInsights from "./FieldInsights/FieldInsights";
import RelationshipSection from "./RelationshipSection/RelationshipSection";
import UserMenu from "./UserMenu";
import AppLayout from "./AppLayout";
type DetailHCP = HCP & {
  derivedState?: string | null;
  engagement_angle?: string | null;
  caution_flags?: string | null;
  signal_strength?: string | null;
};

function identificationAddressContent(hcp: DetailHCP): {
  content: React.ReactNode;
  label: string;
} | null {
  const derivedState = (hcp.derivedState ?? "").trim();
  const practiceState = (hcp.nppesPracticeState ?? "").trim().toUpperCase() || derivedState.toUpperCase();
  const practiceCity = (hcp.nppesPracticeCity ?? "").trim();
  const practiceAddress = (hcp.nppesPracticeAddress ?? "").trim();
  const practiceZip = (hcp.nppesPracticeZip ?? "").trim();

  if (!practiceAddress && !practiceCity && !practiceState) {
    return null;
  }

  const cityStateLine = [
    practiceCity ? titleCaseCity(practiceCity) : "",
    practiceState,
  ]
    .filter(Boolean)
    .join(", ");
  const zipSuffix = practiceZip ? ` ${practiceZip}` : "";

  const hasStreet = Boolean(practiceAddress);
  const hasCity = Boolean(practiceCity);
  let label: string;
  if (hasStreet) label = "Address";
  else if (hasCity) label = "Location";
  else label = "State";

  if (practiceAddress) {
    return {
      label,
      content: (
        <>
          <div>{practiceAddress}</div>
          {(cityStateLine || practiceZip) && <div>{cityStateLine}{zipSuffix}</div>}
        </>
      ),
    };
  }

  return {
    label,
    content: (
      <>
        {cityStateLine}
        {zipSuffix}
      </>
    ),
  };
}

const COMMUNITY_MAX_ENGAGEMENT = 8400000;
const COMMUNITY_MAX_COMPANIES = 82;
const COMMUNITY_MAX_PATIENTS = 63449;
const COMMUNITY_MAX_YEARS = 72;

// Established cohort max values for bar normalization.
// NOTE: These were derived from pre-fix inflated data and will need
// recalibration after the OpenAlex disambiguation + scoring pipeline rerun
// completes. Track this in v1.1 backlog.
const ESTABLISHED_MAX_PUBS = 2500;
const ESTABLISHED_MAX_YEARS = 47;
const ESTABLISHED_MAX_ENGAGEMENT = 3886191;
const ESTABLISHED_MAX_TRIAL = 96;

function cohortAccentColor(cohort: string | null | undefined): string {
  const c = (cohort ?? "").trim();
  if (c === "rising_star" || c === "dark_horse") return "#9B6DFF";
  if (c === "established") return "#FFD700";
  if (c === "community" || c === "workhorse") return "#7B9EBD";
  return "#E8A020"; // fallback
}

function cappedPercent(value: number | null | undefined, max: number): number {
  if (value == null || !Number.isFinite(value) || max <= 0) return 0;
  return Math.min(100, (value / max) * 100);
}

function cappedScorePercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function parsePubVelNumeric(pubVel: string): number | null {
  const n = Number(String(pubVel).replace(/x$/i, "").trim());
  return Number.isFinite(n) ? n : null;
}

function formatResearchScoreValue(n: number | null | undefined): string | number {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toFixed(1);
}

function citTrajScorePercent(citTraj: HCP["citTraj"]): number {
  if (citTraj == null || !Number.isFinite(Number(citTraj))) return 0;
  return cappedScorePercent(Math.abs(Number(citTraj)));
}

interface DetailScreenProps {
  hcp: DetailHCP;
  onBack: () => void;
  onAddNote: () => void;
  onYearPress: (year: number) => void;
  taSlug: string;
}

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <circle cx="12" cy="3" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <circle cx="12" cy="13" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <circle cx="4" cy="8" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <line x1="5.3" y1="7.2" x2="10.7" y2="4.3" stroke="#6B6A65" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="5.3" y1="8.8" x2="10.7" y2="11.7" stroke="#6B6A65" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

function CohortScorePill({ value, muted }: { value: string | number; muted?: boolean }) {
  return (
    <div
      style={{
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 4,
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 12, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>
        Cohort score
      </span>
      <span
        style={{
          fontSize: muted ? 16 : 28,
          color: muted ? "#6B6A65" : "#FFB84D",
          fontFamily: "monospace",
          fontWeight: muted ? 500 : 700,
          textAlign: "center",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DetailHeaderMetrics({ hcp }: { hcp: DetailHCP }) {
  if (isUnclassifiedCohort(hcp.cohort_classification)) {
    return <CohortScorePill value="Unclassified" muted />;
  }
  return <CohortScorePill value={formatCohortScore(hcp.cohortScore ?? null)} />;
}

function ScoreRow({
  label,
  value,
  percent,
  barColor = "#E8A020",
  activeTooltip,
  onTooltipChange,
}: {
  label: string;
  value: string | number;
  percent: number;
  barColor?: string;
  activeTooltip: string | null;
  onTooltipChange: (k: string | null) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <StatPillWithTooltip
          label={label}
          tooltipKey={label}
          activeTooltip={activeTooltip}
          onTooltipChange={onTooltipChange}
        >
          <span style={{ fontSize: 13, color: "#E8E6DF", cursor: "pointer" }}>{label}</span>
        </StatPillWithTooltip>
        <span style={{ fontSize: 13, color: barColor, fontFamily: "monospace" }}>{value}</span>
      </div>
      <div style={{ height: 3, backgroundColor: "#1E1E22", borderRadius: 0, overflow: "hidden" }}>
        <div style={{ height: "100%", backgroundColor: barColor, width: `${percent}%` }} />
      </div>
    </div>
  );
}

function backLinkLabel(cohort: string | null | undefined): string {
  const c = (cohort ?? "").trim();
  if (c === "established") return "Established";
  if (c === "community" || c === "workhorse") return "Community";
  if (c === "rising_star" || c === "dark_horse") return "Rising Stars";
  return "Back";
}

function narrativeSectionLabel(cohort: string | null | undefined): string {
  const c = (cohort ?? "").trim();
  if (c === "established") return "Why this expert";
  if (c === "community" || c === "workhorse") return "Why this practitioner";
  if (c === "rising_star" || c === "dark_horse") return "Why rising star";
  return "Profile";
}

function isUnclassifiedCohort(cohort: string | null | undefined): boolean {
  const c = (cohort ?? "").trim().toLowerCase();
  if (!c) return true;
  return !["established", "rising_star", "dark_horse", "community", "workhorse"].includes(c);
}

const COMMUNITY_TIMELINE_COLOR = "#7B9EBD";

type YearBarPoint = { year: number; value: number | null };

function YearBarChart({
  bars,
  activeYear,
  onActiveYearChange,
  mobileTimerRef,
  formatTooltipValue,
}: {
  bars: YearBarPoint[];
  activeYear: number | null;
  onActiveYearChange: (year: number | null) => void;
  mobileTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  formatTooltipValue: (value: number) => string;
}) {
  const numericValues = bars
    .map((b) => b.value)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const maxValue = Math.max(1, ...numericValues);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, justifyContent: "center" }}>
      {bars.map((p) => {
        const isActive = activeYear === p.year;
        const hasValue = p.value != null && Number.isFinite(p.value);
        const barHeight = hasValue ? (p.value! / maxValue) * 80 : 2;
        return (
          <div
            key={p.year}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              position: "relative",
              cursor: hasValue ? "pointer" : "default",
            }}
            onMouseEnter={() => (hasValue ? onActiveYearChange(p.year) : undefined)}
            onMouseLeave={() => onActiveYearChange(null)}
            onTouchStart={(e) => {
              if (!hasValue) return;
              e.preventDefault();
              if (mobileTimerRef.current) clearTimeout(mobileTimerRef.current);
              onActiveYearChange(p.year);
              mobileTimerRef.current = setTimeout(() => onActiveYearChange(null), 2000);
            }}
          >
            {isActive && hasValue && (
              <div
                style={{
                  position: "absolute",
                  bottom: `${barHeight + 8 + 16}px`,
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "#1E1E22",
                  border: `1px solid ${COMMUNITY_TIMELINE_COLOR}`,
                  borderRadius: 3,
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6A65" }}>
                  {p.year}
                </div>
                <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 500, color: COMMUNITY_TIMELINE_COLOR }}>
                  {formatTooltipValue(p.value!)}
                </div>
              </div>
            )}
            <div
              style={{
                width: "100%",
                backgroundColor: hasValue ? COMMUNITY_TIMELINE_COLOR : "#1E1E22",
                height: `${barHeight}px`,
                marginBottom: 8,
              }}
            />
            <span style={{ fontSize: 10, color: "#6B6A65", fontFamily: "monospace" }}>{p.year}</span>
          </div>
        );
      })}
    </div>
  );
}

type EngagementMixKey = keyof NonNullable<HCP["engagementMix"]>;

type EngagementMixSlice = {
  label: string;
  color: string;
  value: number;
  percent: number;
  startAngle: number;
  endAngle: number;
};

// Slice colors are assigned DYNAMICALLY by rank in buildEngagementMixSlices (largest → amber, per
// §5.5); the `color` here is an unused placeholder kept only to satisfy the shape. slice→category
// mapping (key/label) is what matters and is stable.
const ENGAGEMENT_MIX_DEFS: { key: EngagementMixKey; label: string; color: string }[] = [
  { key: "speakerBureau", label: "Speaker Bureau", color: "#6b6760" },
  { key: "consulting", label: "Consulting", color: "#6b6760" },
  { key: "honoraria", label: "Honoraria", color: "#6b6760" },
  { key: "education", label: "Education", color: "#6b6760" },
  { key: "royalty", label: "Royalty", color: "#6b6760" },
  { key: "foodBeverage", label: "Food & Beverage", color: "#6b6760" },
  { key: "travelLodging", label: "Travel & Lodging", color: "#6b6760" },
];

// Non-dominant engagement slices: indigo / green / neutral at restrained saturation.
const ENGAGEMENT_NON_DOMINANT = ["#5566E8", "#5FA97E", "#7B9EBD", "#8f8b83", "#6b6760", "#4A9D5F"];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const span = endAngle - startAngle;
  if (span >= 359.99) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.001} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy - rOuter}`,
      `M ${cx} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx + 0.001} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner}`,
      "Z",
    ].join(" ");
  }
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, startAngle);
  const endInner = polarToCartesian(cx, cy, rInner, endAngle);
  const largeArc = span > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function buildEngagementMixSlices(mix: HCP["engagementMix"]): EngagementMixSlice[] {
  if (!mix) return [];
  const items = ENGAGEMENT_MIX_DEFS.map((d) => ({
    label: d.label,
    color: d.color,
    value: mix[d.key] ?? 0,
  })).filter((i) => i.value > 0);
  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (total <= 0) return [];

  const sorted = [...items].sort((a, b) => b.value - a.value);
  let angle = 0;
  return sorted.map((item, idx) => {
    const isLast = idx === sorted.length - 1;
    const sliceAngle = isLast ? 360 - angle : (item.value / total) * 360;
    const startAngle = angle;
    const endAngle = angle + sliceAngle;
    angle = endAngle;
    // One-amber rule (§5.5): amber goes to the DOMINANT (largest) slice, whatever category that
    // is for this HCP — not hard-assigned. Every other slice is indigo / green / neutral so
    // nothing out-shouts the role-1 score numeral. slice→category (label) is unchanged.
    const color = idx === 0 ? "#E8A020" : ENGAGEMENT_NON_DOMINANT[(idx - 1) % ENGAGEMENT_NON_DOMINANT.length];
    return {
      ...item,
      color,
      percent: Math.round((item.value / total) * 100),
      startAngle,
      endAngle,
    };
  });
}

function countNonZeroEngagementTypes(mix: HCP["engagementMix"]): number {
  if (!mix) return 0;
  return Object.values(mix).filter((v) => v != null && v > 0).length;
}

function EngagementMixHeader() {
  return (
    <div style={RIGHT_RAIL_HEADER_STYLE}>
      Engagement Mix
    </div>
  );
}

function EngagementMixDonutSection({ slices }: { slices: EngagementMixSlice[] }) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = 23;

  return (
    <div style={RIGHT_RAIL_SECTION_STYLE}>
      <EngagementMixHeader />
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
          {slices.map((slice) => (
            <path
              key={slice.label}
              d={donutSlicePath(cx, cy, rOuter, rInner, slice.startAngle, slice.endAngle)}
              fill={slice.color}
            />
          ))}
        </svg>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            rowGap: 8,
            columnGap: 16,
            flex: 1,
            minWidth: 0,
            alignContent: "start",
          }}
        >
          {slices.map((slice) => (
            <div key={slice.label} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: slice.color,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#E8E6DF", lineHeight: 1.2 }}>{slice.label}</div>
                <div style={{ fontSize: 11, color: "#6B6A65", fontFamily: "monospace", marginTop: 1, lineHeight: 1.2 }}>
                  {formatEngagementDollar(slice.value)} ({slice.percent}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EngagementMixBlock({
  mix,
  cohortClassification,
}: {
  mix: HCP["engagementMix"];
  cohortClassification: string | null | undefined;
}) {
  const nonZeroCount = countNonZeroEngagementTypes(mix);
  const cohort = (cohortClassification ?? "").trim();
  const isResearchCohort =
    cohort === "rising_star" || cohort === "dark_horse" || cohort === "established";
  const noteColor = isResearchCohort ? cohortAccentColor(cohortClassification) : "#6B6A65";
  const slices = buildEngagementMixSlices(mix);

  if (nonZeroCount >= 3) {
    return <EngagementMixDonutSection slices={slices} />;
  }

  if (nonZeroCount >= 1) {
    return (
      <div style={RIGHT_RAIL_SECTION_STYLE}>
        <EngagementMixHeader />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {slices.map((slice) => (
            <div key={slice.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: slice.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 14, color: "#E8E6DF", lineHeight: 1.4 }}>
                {slice.percent}% {slice.label} ·{" "}
                <span style={{ fontFamily: "monospace" }}>{formatEngagementDollar(slice.value)}</span>
              </span>
            </div>
          ))}
          <p style={{ fontSize: 12, fontStyle: "italic", color: noteColor, margin: "4px 0 0", lineHeight: 1.4 }}>
            {isResearchCohort
              ? "Sparse engagement footprint — potential greenfield for early MSL outreach."
              : "Limited industry engagement reported."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={RIGHT_RAIL_SECTION_STYLE}>
      <EngagementMixHeader />
      <p style={{ fontSize: 14, color: "#E8E6DF", margin: "0 0 8px", lineHeight: 1.4 }}>
        No reported industry engagement
      </p>
      <p style={{ fontSize: 12, fontStyle: "italic", color: noteColor, margin: 0, lineHeight: 1.4 }}>
        {isResearchCohort
          ? "No Open Payments record in CMS database. Greenfield for first-mover MSL relationships."
          : "No Open Payments record. This HCP may operate outside typical industry engagement channels."}
      </p>
    </div>
  );
}

function DetailSubline({ hcp }: { hcp: DetailHCP }) {
  const navigate = useNavigate();
  const subline = buildSubline(hcp);
  const slugSource = (hcp.institutionShort ?? hcp.institution ?? "").trim();
  const institutionFull = (hcp.institutionFull ?? "").trim();

  if (!slugSource) {
    return <>{subline}</>;
  }

  const slug = institutionToSlug(slugSource);
  const linkStyle = {
    color: "inherit",
    textDecoration: "none",
    borderBottom: "1px dotted #6B6A65",
  } as const;

  if (institutionFull && subline.startsWith(institutionFull)) {
    const suffix = subline.slice(institutionFull.length);
    return (
      <>
        <a
          href={`/institution/${slug}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/institution/${slug}`);
          }}
          style={linkStyle}
        >
          {institutionFull}
        </a>
        {suffix}
      </>
    );
  }

  if (subline.startsWith(slugSource)) {
    const suffix = subline.slice(slugSource.length);
    return (
      <>
        <a
          href={`/institution/${slug}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/institution/${slug}`);
          }}
          style={linkStyle}
        >
          {slugSource}
        </a>
        {suffix}
      </>
    );
  }

  return <>{subline}</>;
}

export default function DetailScreen({ hcp, onBack, onAddNote, onYearPress, taSlug }: DetailScreenProps) {
  if (typeof window !== "undefined") {
    console.log("[DetailScreen diagnostic]", {
      name: hcp.name,
      cohort_classification: hcp.cohort_classification,
      cohortScore: hcp.cohortScore,
      score: hcp.score,
      normalizedScore: hcp.normalizedScore,
      pubVel: hcp.pubVel,
      citTraj: hcp.citTraj,
      trialScore: hcp.trialScore,
      h_index: hcp.h_index,
      npiNumber: hcp.npiNumber,
      npiSpecialty: hcp.npiSpecialty,
      nppesPracticeCity: hcp.nppesPracticeCity,
      nppesPracticeState: hcp.nppesPracticeState,
      nppesPracticeAddress: hcp.nppesPracticeAddress,
      institutionShort: hcp.institutionShort,
      totalCareerPubs: hcp.totalCareerPubs,
      careerYears: hcp.careerYears,
      firstPubYear: hcp.firstPubYear,
      narrative: hcp.narrative ? "[present]" : null,
      why_now: hcp.why_now ? "[present]" : null,
    });
  }
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [engagementTooltipYear, setEngagementTooltipYear] = useState<number | null>(null);
  const [volumeTooltipYear, setVolumeTooltipYear] = useState<number | null>(null);
  const [narrative, setNarrative] = useState<string | null>(hcp.narrative ?? null);
  const [narrativeLoading, setNarrativeLoading] = useState(true);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);
  const [researchThemes, setResearchThemes] = useState<ResearchTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [scoreBreakdown, setScoreBreakdown] = useState<EstablishedScoreBreakdown | null>(null);
  const [scoreBreakdownLoading, setScoreBreakdownLoading] = useState(false);
  const [risingStarBreakdown, setRisingStarBreakdown] = useState<RisingStarScoreBreakdown | null>(null);
  const [risingStarBreakdownLoading, setRisingStarBreakdownLoading] = useState(false);
  const [communityBreakdown, setCommunityBreakdown] = useState<CommunityScoreBreakdown | null>(null);
  const [communityBreakdownLoading, setCommunityBreakdownLoading] = useState(false);
  const [webSignals, setWebSignals] = useState<WebSignal[]>([]);
  const [webSignalsLoading, setWebSignalsLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const targetId = hash.slice(1);
    let elementFoundAt: number | null = null;
    let attemptsRemaining = 30;

    const waitForSettle = () => {
      const el = document.getElementById(targetId);
      if (!el) {
        attemptsRemaining -= 1;
        if (attemptsRemaining > 0) {
          window.setTimeout(waitForSettle, 100);
        }
        return;
      }
      if (elementFoundAt === null) {
        elementFoundAt = Date.now();
      }
      const elapsedSinceFound = Date.now() - elementFoundAt;
      if (elapsedSinceFound < 800) {
        attemptsRemaining -= 1;
        if (attemptsRemaining > 0) {
          window.setTimeout(waitForSettle, 100);
        }
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    waitForSettle();
  }, [hcp.id]);

  useEffect(() => {
    const hcpId = hcp.hcp_id || (hcp.id != null ? String(hcp.id) : "");
    if (!hcpId) {
      setNarrativeLoading(false);
      return;
    }

    let cancelled = false;
    setNarrativeLoading(true);

    void (async () => {
      const { data, error } = await getHCPNarrative(hcpId, taSlug);
      if (cancelled) return;
      if (!error) {
        setNarrative(data);
      }
      setNarrativeLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id, taSlug]);

  useEffect(() => {
    const hcpId = hcp.hcp_id || (hcp.id != null ? String(hcp.id) : "");
    if (!hcpId) {
      setResearchThemes([]);
      setThemesLoading(false);
      return;
    }

    let cancelled = false;
    setThemesLoading(true);

    void (async () => {
      const { data, error } = await fetchHcpThemes(hcpId);
      if (cancelled) return;
      if (!error && data) {
        setResearchThemes(data);
      } else {
        setResearchThemes([]);
      }
      setThemesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id]);

  useEffect(() => {
    const hcpId = hcp.hcp_id || (hcp.id != null ? String(hcp.id) : "");
    if (!hcpId || !taSlug) return;
    if (hcp.cohort_classification !== "established") return;

    let cancelled = false;
    setScoreBreakdownLoading(true);

    getEstablishedScoreBreakdown(hcpId, taSlug)
      .then((data) => {
        if (cancelled) return;
        setScoreBreakdown(data);
      })
      .catch((err) => {
        console.error("[DetailScreen] getEstablishedScoreBreakdown failed:", err);
        if (!cancelled) setScoreBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setScoreBreakdownLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id, hcp.cohort_classification, taSlug]);

  useEffect(() => {
    const hcpId = hcp.hcp_id || (hcp.id != null ? String(hcp.id) : "");
    if (!hcpId || !taSlug) return;
    if (hcp.cohort_classification !== "rising_star") return;

    let cancelled = false;
    setRisingStarBreakdownLoading(true);

    getRisingStarScoreBreakdown(hcpId, taSlug)
      .then((data) => {
        if (cancelled) return;
        setRisingStarBreakdown(data);
      })
      .catch((err) => {
        console.error("[DetailScreen] getRisingStarScoreBreakdown failed:", err);
        if (!cancelled) setRisingStarBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setRisingStarBreakdownLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id, hcp.cohort_classification, taSlug]);

  useEffect(() => {
    const hcpId = hcp.hcp_id || (hcp.id != null ? String(hcp.id) : "");
    if (!hcpId || !taSlug) return;
    if (hcp.cohort_classification !== "community" && hcp.cohort_classification !== "workhorse") return;
    let cancelled = false;
    setCommunityBreakdownLoading(true);
    getCommunityScoreBreakdown(hcpId, taSlug)
      .then((data) => {
        if (cancelled) return;
        setCommunityBreakdown(data);
      })
      .catch((err) => {
        console.error("[DetailScreen] getCommunityScoreBreakdown failed:", err);
        if (!cancelled) setCommunityBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setCommunityBreakdownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id, hcp.cohort_classification, taSlug]);

  useEffect(() => {
    const hcpId = hcp.hcp_id || (hcp.id != null ? String(hcp.id) : "");
    if (!hcpId) return;
    if (hcp.cohort_classification !== "rising_star") return;

    let cancelled = false;
    setWebSignalsLoading(true);

    getHcpWebSignals(hcpId, "identification")
      .then((data) => {
        if (cancelled) return;
        setWebSignals(data);
      })
      .catch((err) => {
        console.error("[DetailScreen] getHcpWebSignals failed:", err);
        if (!cancelled) setWebSignals([]);
      })
      .finally(() => {
        if (!cancelled) setWebSignalsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id, hcp.cohort_classification]);

  const isUnclassified = isUnclassifiedCohort(hcp.cohort_classification);
  const isCommunityCohort =
    hcp.cohort_classification === "community" || hcp.cohort_classification === "workhorse";
  const isEstablishedCohort = hcp.cohort_classification === "established";
  const isRisingStarCohort = hcp.cohort_classification === "rising_star";
  const cohortBarColor = cohortAccentColor(hcp.cohort_classification);

  const pubVelNumeric = parsePubVelNumeric(hcp.pubVel);

  const citTrajNumeric =
    hcp.citTraj == null || !Number.isFinite(Number(hcp.citTraj)) ? null : Number(hcp.citTraj);
  const citTrajDisplay =
    citTrajNumeric == null
      ? "—"
      : citTrajNumeric === 0
        ? "0.0"
        : `${citTrajNumeric > 0 ? "+" : ""}${citTrajNumeric.toFixed(1)}`;

  const [pubTimeline, setPubTimeline] = React.useState<PublicationTimelinePoint[]>([]);
  const [pubTimelineLoading, setPubTimelineLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const targetId = hcp.hcp_id ?? hcp.id ?? "";
    if (!targetId) {
      setPubTimeline([]);
      setPubTimelineLoading(false);
      return;
    }
    setPubTimelineLoading(true);
    void (async () => {
      const data = await getPublicationTimeline(String(targetId));
      if (cancelled) return;
      setPubTimeline(data);
      setPubTimelineLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcp.hcp_id, hcp.id]);

  const maxValue = Math.max(1, ...pubTimeline.map((p) => p.pubCount));
  const totalPubsInWindow = pubTimeline.reduce((s, p) => s + p.pubCount, 0);
  const [tooltip, setTooltip] = React.useState<number | null>(null);
  const mobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engagementMobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeMobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const engagementBars: YearBarPoint[] = hcp.paymentsByYear
    ? [
        { year: 2022, value: hcp.paymentsByYear.py2022 ?? null },
        { year: 2023, value: hcp.paymentsByYear.py2023 ?? null },
        { year: 2024, value: hcp.paymentsByYear.py2024 ?? null },
      ]
    : [];

  const volumeBars: YearBarPoint[] = hcp.beneficiariesByYear
    ? [
        { year: 2021, value: hcp.beneficiariesByYear.y2021 ?? null },
        { year: 2022, value: hcp.beneficiariesByYear.y2022 ?? null },
        { year: 2023, value: hcp.beneficiariesByYear.y2023 ?? null },
      ]
    : [];

  const [validation, setValidation] = React.useState({
    dataMatch: null as string | null,
    engagement: null as string | null,
    credibility: null as string | null,
    momentum: null as string | null,
  });

  const allValidated =
    validation.dataMatch && validation.engagement && validation.credibility && validation.momentum;

  const hcpId = String(hcp.hcp_id ?? hcp.id ?? "");
  const navigate = useNavigate();
  const { isSaved, toggleSave, hasBrief, relationshipMap } = useRelationships();
  const [savePending, setSavePending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [addToWatchlistAnchor, setAddToWatchlistAnchor] = useState<DOMRect | null>(null);
  const addToWatchlistButtonRef = useRef<HTMLButtonElement>(null);
  const saved = hcpId ? isSaved(String(hcpId)) : false;
  const relationship = hcpId ? (relationshipMap.get(hcpId) ?? null) : null;
  console.log('[DetailScreen bookmark debug]', { hcpId, userId, relationship, mapSize: relationshipMap.size, mapKeys: Array.from(relationshipMap.keys()).slice(0, 5) });
  const briefExists = hcpId ? hasBrief(hcpId) : false;
  const fieldIntelCount = mockFieldIntelContributorCount(String(hcpId));
  const doctorLabel = hcp.name.match(/^dr\.?\s/i) ? hcp.name : `Dr. ${hcp.name}`;

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (!cancelled) setUserId(user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [contextualizeOpen, setContextualizeOpen] = React.useState(false);
  const [optOutOpen, setOptOutOpen] = React.useState(false);
  const [reportIssueOpen, setReportIssueOpen] = React.useState(false);
  const [fiToast, setFiToast] = React.useState<string | null>(null);
  const [issueType, setIssueType] = React.useState<string | null>(null);
  const [issueNotes, setIssueNotes] = React.useState<Set<string>>(new Set());

  function showFiToast(message: string) {
    setFiToast(message);
    window.setTimeout(() => setFiToast(null), 3000);
  }

  const ISSUE_TYPES = [
    "incorrect institution",
    "wrong specialty",
    "outdated info",
    "other",
  ] as const;

  const ISSUE_NOTE_CHIPS = [
    "Affiliation recently changed",
    "Specialty label mismatch",
    "Publication count seems stale",
    "Score inconsistent with field read",
    "Possible duplicate profile",
  ] as const;

  const renderNarrative = (): React.ReactNode => {
    if (narrativeLoading) return "Loading...";
    if (!narrative) return "Narrative generating — check back soon.";

    const linkButtonStyle: React.CSSProperties = {
      background: "none",
      border: "none",
      padding: 0,
      color: "#E8A020",
      fontSize: "inherit",
      fontFamily: "inherit",
      cursor: "pointer",
      textDecoration: "underline",
    };

    if (isMobile && narrativeExpanded) {
      return (
        <>
          {narrative}{" "}
          <button
            type="button"
            onClick={() => setNarrativeExpanded(false)}
            style={linkButtonStyle}
          >
            Show less
          </button>
        </>
      );
    }

    if (!isMobile) {
      return narrative;
    }

    const TRUNCATE_AT = 180;
    if (narrative.length <= TRUNCATE_AT) return narrative;

    const truncated = narrative.substring(0, TRUNCATE_AT);
    const lastSpace = truncated.lastIndexOf(" ");
    const display = truncated.substring(0, lastSpace > 0 ? lastSpace : TRUNCATE_AT);

    return (
      <>
        {display}…{" "}
        <button
          type="button"
          onClick={() => setNarrativeExpanded(true)}
          style={linkButtonStyle}
        >
          Read more
        </button>
      </>
    );
  };

  const renderFieldIntelligenceSection = (
    sectionStyle: React.CSSProperties,
    headerStyle: React.CSSProperties,
  ) => (
    <div
      className="fm-detail-section fm-section-field-intelligence"
      style={sectionStyle}
    >
      <div style={headerStyle}>
        Field Intelligence
      </div>

      <div
        style={{
          fontSize: 12,
          color: fieldIntelCount >= 3 ? FI_ACCENT_MUTED : "rgba(232, 230, 223, 0.45)",
          marginBottom: 12,
          lineHeight: 1.45,
        }}
      >
        {fieldIntelCount >= 3
          ? `${fieldIntelCount} MSLs have contributed to this profile`
          : "Field Intelligence pending — be among the first to contribute"}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#6B6A65", marginBottom: 8 }}>Community Confidence</div>
        <div style={{ height: 6, backgroundColor: "#1E1E22", borderRadius: 0, marginBottom: 8 }}>
          <div style={{ height: "100%", backgroundColor: cohortBarColor, width: "0%" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: cohortBarColor, fontFamily: "monospace" }}>0%</span>
          <span style={{ fontSize: 11, color: "#6B6A65" }}>0 MSLs</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
        <ValidationField
          label="Data Matches Field Reality"
          options={["Confirms", "Partial", "Disputes"]}
          selected={validation.dataMatch}
          onSelect={(val) => setValidation({ ...validation, dataMatch: val })}
        />
        <ValidationField
          label="Engagement Potential"
          options={["High", "Moderate", "Low"]}
          selected={validation.engagement}
          onSelect={(val) => setValidation({ ...validation, engagement: val })}
        />
        <ValidationField
          label="Scientific Credibility"
          options={["Strong", "Moderate", "Early"]}
          selected={validation.credibility}
          onSelect={(val) => setValidation({ ...validation, credibility: val })}
        />
        <ValidationField
          label="Momentum Trajectory"
          options={["Accelerating", "Steady", "Plateauing"]}
          selected={validation.momentum}
          onSelect={(val) => setValidation({ ...validation, momentum: val })}
        />
      </div>

      <button
        onClick={() => {}}
        disabled={!allValidated}
        style={{
          width: "100%",
          height: 44,
          marginTop: 16,
          backgroundColor: "#0A1F16",
          border: "1px solid #1D9E75",
          color: "#1D9E75",
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 4,
          cursor: allValidated ? "pointer" : "not-allowed",
          opacity: allValidated ? 1 : 0.4,
        }}
      >
        Submit validation
      </button>

      <div style={{ fontSize: 11, color: "#3A3A3F", textAlign: "center", marginTop: 8 }}>
        Your identity is never shared. Contributor UUID only.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setContextualizeOpen(true)}
          style={fiSecondaryBtnStyle}
        >
          Add context
        </button>
        <button
          type="button"
          onClick={() => setReportIssueOpen(true)}
          style={fiSecondaryBtnStyle}
        >
          Report data issue
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOptOutOpen(true)}
        style={{
          marginTop: 16,
          padding: 0,
          background: "transparent",
          border: "none",
          fontSize: 11,
          color: "rgba(232, 230, 223, 0.4)",
          textDecoration: "underline",
          cursor: "pointer",
          fontFamily: "system-ui, sans-serif",
          textAlign: "left",
        }}
      >
        Are you {doctorLabel}? Request opt-out or claim your profile
      </button>
    </div>
  );

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    { label: hcp.name },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <style>{`@keyframes fm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div
        className={`fm-detail-body fm-cohort-${(hcp.cohort_classification ?? "").trim() || "unclassified"}`}
        style={{
          border: "1px solid #1E1E22",
          borderRadius: 6,
          boxSizing: "border-box",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
          margin: "0 16px 24px 16px",
          backgroundColor: "#0A0A0B",
          overflow: "visible",
        }}
      >
        {/* LEFT COLUMN: Header + main content */}
        <div className="fm-detail-left">
        {/* Header section */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="fm-detail-heading"
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 30,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.05,
                  color: "#F4F2EC",
                  marginBottom: 6,
                }}
              >
                {hcp.name}
              </div>
              <div className="fm-detail-subheading" style={{ fontSize: 13.5, color: "#928E86", marginBottom: 12 }}>
                <DetailSubline hcp={hcp} />
              </div>
            </div>
            {hcpId ? (
              <button
                type="button"
                className="fm-pill-button"
                onClick={() => navigate(`/hcp/${hcpId}/brief`)}
                aria-label="View AI-generated brief for this HCP"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "#1E1E22",
                  color: "#E8E6DF",
                  border: "1px solid #2A2A30",
                  borderRadius: 3,
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  lineHeight: 1.2,
                  cursor: "pointer",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 12, lineHeight: 1, color: "#E8A020" }}>{String.fromCodePoint(0x2728)}</span>
                {briefExists ? "Open Brief" : "Brief"}
              </button>
            ) : null}
            {hcpId && userId && relationship ? (
              <button
                ref={addToWatchlistButtonRef}
                type="button"
                className="fm-pill-button"
                aria-label="Add to a watchlist"
                onClick={() => {
                  const rect = addToWatchlistButtonRef.current?.getBoundingClientRect() ?? null;
                  setAddToWatchlistAnchor(rect);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  backgroundColor: "transparent",
                  color: "#9B9892",
                  border: "1px solid #1E1E22",
                  borderRadius: 3,
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  lineHeight: 1.2,
                  cursor: "pointer",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, lineHeight: 1 }}>+</span>
                <span>List</span>
              </button>
            ) : null}
            {hcpId ? (
              <button
                type="button"
                onClick={() => {
                  if (savePending) return;
                  setSavePending(true);
                  void toggleSave(String(hcpId), "hcp_detail")
                    .catch(() => {})
                    .finally(() => setSavePending(false));
                }}
                disabled={savePending}
                aria-label={saved ? "Unsave HCP" : "Save HCP"}
                style={{
                  background: "none",
                  border: "none",
                  padding: 4,
                  cursor: savePending ? "default" : "pointer",
                  opacity: savePending ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {saved ? (
                  <BookmarkCheck size={24} color={COLOR.info} fill={COLOR.info} />
                ) : (
                  <Bookmark size={24} color="#5A9B7F" />
                )}
              </button>
            ) : null}
          </div>
        </div>

        {/* fm-section-* wrapper: mobile ordering hook only (desktop block flow unchanged) */}
        <div className="fm-section-relationship">
          <RelationshipSection hcp={hcp} />
        </div>

        <div className="fm-section-insights">
          <FieldInsights hcp={hcp} />
        </div>

        {/* Narrative / unclassified notice */}
        <div
          className="fm-detail-section fm-section-narrative"
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          {isUnclassified ? (
            <div
              style={{
                backgroundColor: "#18181B",
                borderLeft: "4px solid #71717A",
                padding: 16,
                borderRadius: 4,
              }}
            >
              <p style={{ fontSize: 14, color: "#A1A1AA", lineHeight: 1.6, margin: 0 }}>
                Unclassified — this HCP is in our database but hasn&apos;t met cohort criteria. Available data shown below.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: COLOR.ink4,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  marginBottom: 14,
                }}
              >
                {narrativeSectionLabel(hcp.cohort_classification)}
              </div>
              {/* Thesis rule: 2px amber left rule marks FieldMark's synthesized claim about the
                  expert (§5 amber use #4). Body is role-7 serif — the editorial voice for the most
                  valuable, most-skippable content. */}
              <div
                style={{
                  borderLeft: `2px solid ${COLOR.amber}`,
                  paddingLeft: 16,
                  fontFamily: FONT.serif,
                  fontSize: 15,
                  color: "#BDB9B0",
                  lineHeight: 1.72,
                }}
              >
                {renderNarrative()}
              </div>
            </>
          )}
        </div>

        {(hcp.signal_strength || hcp.why_now || hcp.engagement_angle || hcp.caution_flags) && (
          <div
            className="fm-detail-section fm-section-signal-summary"
            style={{
              padding: "16px 16px 12px",
              borderBottom: "1px solid #1E1E22",
            }}
          >
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 11,
                fontWeight: 600,
                color: COLOR.ink4,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                marginBottom: 16,
              }}
            >
              Signal Summary
            </div>

            {/* Thesis rule (amber) + role-6 micro-labels + role-7 serif body. */}
            <div style={{ borderLeft: `2px solid ${COLOR.amber}`, paddingLeft: 16 }}>
            {hcp.signal_strength && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, fontWeight: 600, color: "#6E6A62", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 }}>
                  Signal
                </div>
                <div style={{ fontFamily: FONT.serif, fontSize: 14.5, color: "#BDB9B0", lineHeight: 1.72 }}>
                  {hcp.signal_strength}
                </div>
              </div>
            )}

            {hcp.why_now && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, fontWeight: 600, color: "#6E6A62", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 }}>
                  Why Now
                </div>
                <div style={{ fontFamily: FONT.serif, fontSize: 14.5, color: "#BDB9B0", lineHeight: 1.72 }}>
                  {hcp.why_now}
                </div>
              </div>
            )}

            {hcp.engagement_angle && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, fontWeight: 600, color: "#6E6A62", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 }}>
                  Engagement Angle
                </div>
                <div style={{ fontFamily: FONT.serif, fontSize: 14.5, color: "#BDB9B0", lineHeight: 1.72 }}>
                  {hcp.engagement_angle}
                </div>
              </div>
            )}

            {hcp.caution_flags && (
              <div>
                {/* Caution keeps its amber-orange warn tint — a semantic, not decoration. */}
                <div style={{ fontFamily: FONT.sans, fontSize: 10, fontWeight: 600, color: "#E8A04E", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 7 }}>
                  Caution
                </div>
                <div style={{ fontFamily: FONT.serif, fontSize: 14.5, color: "#BDB9B0", lineHeight: 1.72 }}>
                  {hcp.caution_flags}
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Score breakdown */}
        <div
          className="fm-detail-section fm-section-score-breakdown"
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #1E1E22",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {isCommunityCohort ? (
              <ScoreBreakdownV3Community
                data={communityBreakdown}
                loading={communityBreakdownLoading}
              />
            ) : isRisingStarCohort ? (
              <ScoreBreakdownV3Rising
                data={risingStarBreakdown}
                loading={risingStarBreakdownLoading}
              />
            ) : isEstablishedCohort ? (
              <ScoreBreakdownV3
                data={scoreBreakdown}
                loading={scoreBreakdownLoading}
              />
            ) : null}
          </div>
        </div>

        <div className="fm-detail-section fm-section-engagement-mix">
          <EngagementMixBlock mix={hcp.engagementMix} cohortClassification={hcp.cohort_classification} />
        </div>

        {isCommunityCohort ? (
          <>
            {hcp.paymentsByYear && (
              <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1E1E22" }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: COLOR.ink4, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 14 }}>
                  Engagement Timeline
                </div>
                <YearBarChart
                  bars={engagementBars}
                  activeYear={engagementTooltipYear}
                  onActiveYearChange={setEngagementTooltipYear}
                  mobileTimerRef={engagementMobileTimerRef}
                  formatTooltipValue={(v) => formatEngagementDollar(v)}
                />
              </div>
            )}
            {hcp.beneficiariesByYear && (
              <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1E1E22" }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: COLOR.ink4, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 14 }}>
                  Patient Volume
                </div>
                <YearBarChart
                  bars={volumeBars}
                  activeYear={volumeTooltipYear}
                  onActiveYearChange={setVolumeTooltipYear}
                  mobileTimerRef={volumeMobileTimerRef}
                  formatTooltipValue={(v) => `${formatIntDisplay(v)} beneficiaries`}
                />
              </div>
            )}
          </>
        ) : (
          <div
            className="fm-detail-section fm-section-publication-timeline"
            style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1E1E22" }}
          >
            <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: COLOR.ink4, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 14 }}>
              Publication timeline
            </div>
            {pubTimelineLoading ? (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, justifyContent: "center" }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        backgroundColor: "#1E1E22",
                        height: `${30 + ((i * 13) % 50)}px`,
                        marginBottom: 8,
                      }}
                    />
                    <span style={{ fontSize: 10, color: "#3A3A3F", fontFamily: "monospace" }}>—</span>
                  </div>
                ))}
              </div>
            ) : totalPubsInWindow === 0 ? (
              <div style={{ fontSize: 13, color: "#6B6A65", padding: "24px 0", textAlign: "center" }}>
                No publications since {new Date().getFullYear() - 9}.
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, justifyContent: "center" }}>
                {pubTimeline.map((p) => {
                  const isActive = tooltip === p.year;
                  const barHeight = p.pubCount === 0 ? 0 : Math.max(2, (p.pubCount / maxValue) * 80);
                  // Incomplete-data treatment (design system §7): ONLY the current calendar year is
                  // still filling (indexing lag in this corpus is weeks, so the prior year is already
                  // complete). Provisional years render in the muted, de-ambered --incomplete-data
                  // fill; complete years render in the live series color at full presence. Opacity is
                  // no longer used to encode anything on this chart — the old citation-maturity
                  // opacity heuristic is retired, so "faded" means exactly one thing: incomplete.
                  const isProjected = p.year >= new Date().getFullYear();
                  const barFill = isProjected ? "var(--incomplete-data)" : cohortBarColor;
                  return (
                    <div
                      key={p.year}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", cursor: "pointer" }}
                      onClick={() => onYearPress(p.year)}
                      onMouseEnter={() => setTooltip(p.year)}
                      onMouseLeave={() => setTooltip(null)}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        if (mobileTimerRef.current) clearTimeout(mobileTimerRef.current);
                        setTooltip(p.year);
                        mobileTimerRef.current = setTimeout(() => setTooltip(null), 2000);
                      }}
                    >
                      {isActive && p.pubCount > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: `${barHeight + 8 + 16}px`,
                            left: "50%",
                            transform: "translateX(-50%)",
                            backgroundColor: "#1E1E22",
                            border: `1px solid ${cohortBarColor}`,
                            borderRadius: 3,
                            padding: "4px 8px",
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                            zIndex: 10,
                          }}
                        >
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6A65" }}>
                            {p.year}
                          </div>
                          <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 500, color: cohortBarColor }}>
                            {p.pubCount} {p.pubCount === 1 ? "paper" : "papers"}
                          </div>
                          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6B6A65" }}>
                            avg {p.avgCitations.toFixed(1)} citations
                          </div>
                          {isProjected && (
                            <div style={{ fontSize: 10, color: "#8f8b83", marginTop: 2 }}>
                              In progress — indexing lag
                            </div>
                          )}
                        </div>
                      )}
                      <div
                        style={{
                          width: "100%",
                          backgroundColor: barFill,
                          height: `${barHeight}px`,
                          marginBottom: 8,
                        }}
                      />
                      <span style={{ fontSize: 10, color: "#6B6A65", fontFamily: "monospace" }}>{p.year}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div id="belief-profile" className="fm-section-belief-profile" style={{ scrollMarginTop: 80 }}>
          <ScientificNarrativeSection hcpId={hcp.id} therapeuticArea={taSlug === "nsclc" ? "NSCLC" : taSlug} />
        </div>
        </div>{/* end fm-detail-left */}

        {/* RIGHT COLUMN: Metric pills + Field notes */}
        <div className="fm-detail-right">
          {isRisingStarCohort && (
            <div
              className="fm-detail-section fm-section-contact-access"
              style={RIGHT_RAIL_SECTION_STYLE}
            >
              <ContactAccessCard
                hcpName={hcp.name ?? ""}
                signals={webSignals}
                loading={webSignalsLoading}
              />
            </div>
          )}

          {!isRisingStarCohort && (() => {
            const hasNpi = Boolean(hcp.npiNumber);
            const addressResult = identificationAddressContent(hcp);
            const hasAddress = addressResult !== null;
            const hasSpecialty = Boolean(hcp.npiSpecialty);
            if (!hasNpi && !hasAddress && !hasSpecialty) return null;
            return (
              <div
                className="fm-detail-section fm-section-identification"
                style={RIGHT_RAIL_SECTION_STYLE}
              >
                <div style={RIGHT_RAIL_HEADER_STYLE}>
                  Identification
                </div>
                {/* §2 monospace rule: NPI is an opaque registry identifier → mono/tabular; State
                    (a place) and Specialty (a category) are language → sans. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, fontFamily: FONT.sans }}>
                  {hcp.npiNumber ? (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#8f8b83" }}>NPI</span>
                      <span style={{ color: "#DAD7CF", fontFamily: FONT.mono, fontVariantNumeric: "tabular-nums" }}>{hcp.npiNumber}</span>
                    </div>
                  ) : null}
                  {addressResult ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ color: "#8f8b83" }}>{addressResult.label}</span>
                      <span style={{ color: "#DAD7CF", textAlign: "right", maxWidth: "65%" }}>{addressResult.content}</span>
                    </div>
                  ) : null}
                  {hcp.npiSpecialty ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ color: "#8f8b83", flexShrink: 0 }}>Specialty</span>
                      <span style={{ color: "#DAD7CF", textAlign: "right", maxWidth: "65%" }}>{hcp.npiSpecialty}</span>
                    </div>
                  ) : null}
                </div>
                {hcp.npiNumber && (
                  <a
                    href={`https://npiregistry.cms.hhs.gov/provider-view/${hcp.npiNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      marginTop: 14,
                      padding: "9px 12px",
                      backgroundColor: "transparent",
                      border: "1px solid rgba(255,255,255,0.09)",
                      color: "#B6B2AA",
                      fontSize: 12.5,
                      fontFamily: FONT.sans,
                      textDecoration: "none",
                      textAlign: "center",
                      borderRadius: 8,
                    }}
                  >
                    View on NPI Registry →
                  </a>
                )}
              </div>
            );
          })()}

          <div className="fm-detail-section fm-section-top-pharma">
            <TopPharmaCompanies hcpId={String(hcp.hcp_id ?? hcp.id ?? "")} />
          </div>
          <div className="fm-detail-section fm-section-drug-constellation">
            <DrugConstellation hcpId={String(hcp.hcp_id ?? hcp.id ?? "")} />
          </div>

          {isEstablishedCohort &&
            scoreBreakdown?.top_collaborators &&
            scoreBreakdown.top_collaborators.length > 0 && (
              <div
                className="fm-detail-section fm-section-top-collaborators"
                style={RIGHT_RAIL_SECTION_STYLE}
              >
                <div style={RIGHT_RAIL_HEADER_STYLE}>
                  Top Collaborators
                </div>
                <MiniCollaboratorNetwork
                  hcpName={hcp.name ?? ""}
                  hcpId={String(hcp.hcp_id ?? hcp.id ?? "")}
                  collaborators={scoreBreakdown.top_collaborators}
                />
              </div>
            )}
          {isRisingStarCohort &&
            risingStarBreakdown?.top_collaborators &&
            risingStarBreakdown.top_collaborators.length > 0 && (
              <div
                className="fm-detail-section fm-section-top-collaborators"
                style={RIGHT_RAIL_SECTION_STYLE}
              >
                <div style={RIGHT_RAIL_HEADER_STYLE}>
                  Top Collaborators
                </div>
                <MiniCollaboratorNetwork
                  hcpName={hcp.name ?? ""}
                  hcpId={String(hcp.hcp_id ?? hcp.id ?? "")}
                  collaborators={risingStarBreakdown.top_collaborators}
                />
                {risingStarBreakdown?.network_momentum_percentile != null &&
                  risingStarBreakdown?.early_collaborator_count != null &&
                  risingStarBreakdown?.recent_collaborator_count != null && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #1E1E22" }}>
                      <div style={RIGHT_RAIL_HEADER_STYLE}>
                        Network Trajectory
                      </div>

                      <div
                        className="fm-network-trajectory-cards"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginTop: 12,
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            backgroundColor: "#15131A",
                            border: "1px solid #2A2730",
                            borderRadius: 6,
                            padding: "10px 12px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              color: "#6B6A65",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              marginBottom: 4,
                            }}
                          >
                            {RISING_STAR_METHODOLOGY.early_window.label}
                          </div>
                          <div
                            style={{
                              fontSize: 22,
                              color: "#E8E6DF",
                              fontWeight: 600,
                              lineHeight: 1.1,
                            }}
                          >
                            {risingStarBreakdown.early_collaborator_count}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 18,
                            color: "#9B6DFF",
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {"→"}
                        </div>

                        <div
                          style={{
                            flex: 1,
                            backgroundColor: "#15131A",
                            border: "1px solid #9B6DFF",
                            borderRadius: 6,
                            padding: "10px 12px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              color: "#9B6DFF",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              marginBottom: 4,
                            }}
                          >
                            {RISING_STAR_METHODOLOGY.recent_window.label}
                          </div>
                          <div
                            style={{
                              fontSize: 22,
                              color: "#E8E6DF",
                              fontWeight: 600,
                              lineHeight: 1.1,
                            }}
                          >
                            {risingStarBreakdown.recent_collaborator_count}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          fontSize: 13,
                          color: "#9B9892",
                          lineHeight: 1.4,
                        }}
                      >
                        <span style={{ color: "#9B6DFF", fontWeight: 500 }}>
                          +
                          {Math.round(
                            ((risingStarBreakdown.recent_collaborator_count -
                              risingStarBreakdown.early_collaborator_count) /
                              risingStarBreakdown.early_collaborator_count) *
                              100,
                          )}
                          % growth
                        </span>
                        <span style={{ margin: "0 8px", color: "#3A3A3F" }}>{"·"}</span>
                        <span>
                          {Math.round(risingStarBreakdown.network_momentum_percentile)}th percentile network momentum
                        </span>
                      </div>
                    </div>
                  )}
              </div>
            )}

          {isRisingStarCohort && risingStarBreakdown?.external_collaborators && (
            <div
              className="fm-detail-section fm-section-external-collaborators"
              style={RIGHT_RAIL_SECTION_STYLE}
            >
              <div style={RIGHT_RAIL_HEADER_STYLE}>
                External Collaborators
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#6B6A65",
                  marginTop: -4,
                  marginBottom: 8,
                }}
              >
                Top co-authors at other institutions
              </div>

              {risingStarBreakdown.external_collaborators.length > 0 ? (
                <MiniCollaboratorNetwork
                  hcpName={hcp.name ?? ""}
                  hcpId={String(hcp.hcp_id ?? hcp.id ?? "")}
                  collaborators={risingStarBreakdown.external_collaborators}
                />
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: "#9B9892",
                    lineHeight: 1.4,
                    padding: "12px 0",
                    fontStyle: "italic",
                  }}
                >
                  All top collaborators are at the same institution. This HCP's
                  publication network is concentrated within their home institution.
                </div>
              )}
            </div>
          )}

          {renderFieldIntelligenceSection(RIGHT_RAIL_SECTION_STYLE, RIGHT_RAIL_HEADER_STYLE)}

        {/* Field notes */}
        <div className="fm-detail-section fm-section-field-notes" style={RIGHT_RAIL_SECTION_STYLE}>
          <div style={RIGHT_RAIL_HEADER_STYLE}>
            Field notes
          </div>

          <div
            className="elevation-well"
            style={{
              padding: "14px 16px",
              marginBottom: 12,
            }}
          >
            {/* Honest empty state — no field notes yet, no invented ship date. */}
            <div style={{ fontSize: 12.5, color: "#8f8b83", lineHeight: 1.5, fontFamily: FONT.sans }}>
              No field notes yet — add the first.
            </div>
          </div>

          <button
            onClick={onAddNote}
            style={{
              width: "100%",
              height: 40,
              backgroundColor: "transparent",
              border: "1px dashed rgba(255,255,255,0.12)",
              color: "#77736B",
              fontSize: 12.5,
              fontFamily: FONT.sans,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            + Add note
          </button>
        </div>
        </div>{/* end fm-detail-right */}
      </div>{/* end fm-detail-body */}

      {contextualizeOpen && (
        <ContextualizeHCPForm
          hcpName={doctorLabel}
          therapeuticArea={
            hcp.specialty?.toLowerCase().includes("lung") || hcp.specialty?.toLowerCase().includes("onc")
              ? "Oncology"
              : undefined
          }
          onClose={() => setContextualizeOpen(false)}
          onSubmit={() => {
            setContextualizeOpen(false);
            showFiToast("Saved. Your contribution will appear in aggregate when 3+ MSLs contribute similar context.");
          }}
        />
      )}

      {optOutOpen && (
        <OptOutRequestForm
          hcpName={doctorLabel}
          onClose={() => setOptOutOpen(false)}
          onSubmit={() => {
            setOptOutOpen(false);
            showFiToast("Request received — we'll respond within 5 business days");
          }}
        />
      )}

      {reportIssueOpen && (
        <FiModal title="Report data issue" onClose={() => setReportIssueOpen(false)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.5)", marginBottom: 8 }}>Issue type</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ISSUE_TYPES.map((opt) => (
                <FiChip
                  key={opt}
                  label={opt}
                  selected={issueType === opt}
                  onClick={() => setIssueType(issueType === opt ? null : opt)}
                />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.5)", marginBottom: 8 }}>Notes (select all that apply)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ISSUE_NOTE_CHIPS.map((opt) => (
                <FiChip
                  key={opt}
                  label={opt}
                  selected={issueNotes.has(opt)}
                  multi
                  onClick={() => {
                    const next = new Set(issueNotes);
                    if (next.has(opt)) next.delete(opt);
                    else next.add(opt);
                    setIssueNotes(next);
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setReportIssueOpen(false);
              showFiToast("Issue reported — thank you for helping improve this profile");
            }}
            style={fiSecondaryBtnStyle}
          >
            Submit report
          </button>
        </FiModal>
      )}

      <FiToast message={fiToast} />

      {addToWatchlistAnchor && userId && relationship ? (
        <AddToWatchlistPopover
          userId={userId}
          relationshipId={relationship.id}
          anchorRect={addToWatchlistAnchor}
          onClose={() => setAddToWatchlistAnchor(null)}
        />
      ) : null}
    </AppLayout>
  );
}

const fiSecondaryBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  // Secondary action → indigo (§5), not amber.
  background: "rgba(85, 102, 232, 0.10)",
  border: "1px solid rgba(85, 102, 232, 0.35)",
  borderRadius: 8,
  color: "#AEB4F5",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
};

function ValidationField({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (val: string | null) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#928E86", marginBottom: 8, fontFamily: FONT.sans }}>{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((opt) => {
          const isSelected = selected === opt;
          // Idle → warm ghost; selected keeps the confirm/partial/dispute traffic-light semantic.
          let bgColor = "transparent";
          let borderColor = "rgba(255,255,255,0.08)";
          let textColor = "#8f8b83";

          if (isSelected) {
            if (opt === "Confirms" || opt === "High" || opt === "Strong" || opt === "Accelerating") {
              bgColor = "#0A1F16";
              borderColor = "#1D9E75";
              textColor = "#1D9E75";
            } else if (opt === "Partial" || opt === "Moderate" || opt === "Steady") {
              bgColor = "#1A1200";
              borderColor = "#E8A020";
              textColor = "#E8A020";
            } else {
              bgColor = "#1A0A0A";
              borderColor = "#7B2020";
              textColor = "#E05555";
            }
          }

          return (
            <button
              key={opt}
              onClick={() => onSelect(selected === opt ? null : opt)}
              style={{
                flex: 1,
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                color: textColor,
                fontSize: 12,
                fontFamily: FONT.sans,
                padding: "8px 0",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
