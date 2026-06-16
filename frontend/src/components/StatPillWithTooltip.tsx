import { useRef, useEffect, useState } from "react";

interface TooltipDef {
  title: string;
  body: string;
}

const TOOLTIP_MAP: Record<string, TooltipDef> = {
  "PUB SCORE": {
    title: "Publication Score",
    body: "Publication score (0-100) measuring this HCP's recent publication output, normalized within their therapeutic area and career stage cohort. Higher scores indicate more prolific publishing relative to peers.",
  },
  "CIT TRAJ": {
    title: "Citation Trajectory",
    body: "Citation trajectory shows how fast citations to this HCP's published work are accelerating, normalized against the field average for their specialty and career stage. Higher values indicate faster-growing scientific influence.",
  },
  "H-INDEX": {
    title: "H-Index",
    body: "Hirsch index — a measure of how often a researcher's work is cited. Higher values indicate sustained scientific influence rather than publication volume alone.",
  },
  "TRIAL SCORE": {
    title: "Trial Score",
    body: "Normalized score (0-100) reflecting this HCP's clinical trial involvement, weighted by role (PI, sub-investigator, study chair) and trial phase. Scores are calibrated within cohort. Note: ClinicalTrials.gov coverage of site-level investigators is limited, so some major trialists may show lower scores than their actual involvement warrants.",
  },
  "PUB YEARS": {
    title: "Publication Years",
    body: "The number of years since this HCP's first published paper, used as a proxy for research career stage when CV data is unavailable.",
  },
  "Pharma Engagement": {
    title: "Pharma Engagement",
    body: "Total pharma engagement (consulting, speaking, honoraria, food, travel) over the HCP's lifetime as reported under the Sunshine Act.",
  },
  "Pharma Companies": {
    title: "Pharma Companies",
    body: "Count of distinct manufacturers that reported Open Payments to this HCP over their lifetime in the program. A higher count usually indicates broader industry engagement.",
  },
  "Patient Volume": {
    title: "Patient Volume",
    body: "Unique Medicare beneficiaries seen over the most recent 3-year window. A practice-scale signal derived from CMS Medicare Part B data.",
  },
  "Years in Practice": {
    title: "Years in Practice",
    body: "Years in practice derived from NPPES career-stage signals when available. Used as a lightweight experience proxy for community cohort HCPs.",
  },
  Followers: {
    title: "Followers",
    body: "Total follower count on the platform where this account was captured. Indicates audience size, not engagement quality — see Engage % for that signal.",
  },
  Engage: {
    title: "Engagement rate",
    body: "Likes + replies + reposts per post, normalized by follower count. A higher rate means the audience is actively engaging, not just lurking. 1% is a typical baseline; anything above 4% is notable.",
  },
  "Posts/90d": {
    title: "Posts in last 90 days",
    body: "How many original posts this account made on TA-relevant topics in the last 90 days. Low numbers don't necessarily mean low impact — some voices post rarely but with high engagement.",
  },
  Source: {
    title: "Source hashtag",
    body: "The hashtag where FieldMark first captured this account. Indicates which conversation surfaced them. Accounts captured on conference hashtags (#ASCO26, #EASL26) and persistent community hashtags (#LCSM, #livertwitter) are weighted equally.",
  },
  ENGAGEMENT: {
    title: "Pharma Engagement",
    body: "Total pharma engagement (consulting, speaking, honoraria, food, travel) over the HCP's lifetime as reported under the Sunshine Act.",
  },
  VOLUME: {
    title: "Medicare volume",
    body: "Estimated distinct Medicare beneficiaries served across recent program years (de-duplicated across HCPCS), from CMS utilization data. Higher values indicate broader practice reach.",
  },
  COMPANIES: {
    title: "Pharma Companies",
    body: "Count of distinct manufacturers that reported Open Payments to this HCP over their lifetime in the program. A higher count usually indicates broader industry engagement.",
  },
  YEARS: {
    title: "Career Stage",
    body: "Years in practice derived from NPPES career-stage signals when available. Used as a lightweight experience proxy for community cohort HCPs.",
  },
  PUBS: {
    title: "Career publications",
    body: "Total career publications attributed to this HCP (OpenAlex / career enrichment). Used as a volume signal for established researchers.",
  },
  CITATIONS: {
    title: "Citations",
    body: "Aggregate citation signal for this HCP is not yet wired in the feed card. Placeholder until citation totals are available.",
  },
  SCIENTIFIC: {
    title: "Scientific Influence",
    body: "Publication leadership ranking (0-100 percentile). Based on senior-author papers, citation impact, guideline authorship, and recent publication activity. 50% of the FieldMark Score for Established HCPs.",
  },
  NETWORK: {
    title: "Network Influence",
    body: "Position within the co-authorship network for this therapeutic area (0-100 percentile). Combines degree centrality, eigenvector centrality, and betweenness centrality from a 10-year window. 35% of the FieldMark Score for Established HCPs.",
  },
  PHARMA: {
    title: "Pharma Engagement",
    body: "Industry engagement breadth (0-100 percentile). Based on CMS Open Payments data: payment volume, distinct companies, drugs covered, and contract activity. 15% of the FieldMark Score for Established HCPs.",
  },
};

const TOOLTIP_WIDTH = 220;
const MARGIN = 12;

interface TooltipPos {
  left: number;
  top: number;
  pointerLeft: number;
}

interface StatPillWithTooltipProps {
  label: string;
  value?: string | number;
  tooltipKey: string;
  activeTooltip: string | null;
  onTooltipChange: (key: string | null) => void;
  children?: React.ReactNode;
}

export function StatPillWithTooltip({
  label,
  value,
  tooltipKey,
  activeTooltip,
  onTooltipChange,
  children,
}: StatPillWithTooltipProps) {
  const isOpen = activeTooltip === tooltipKey;
  const def = TOOLTIP_MAP[tooltipKey];
  const pillRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<TooltipPos | null>(null);

  function calcPosition() {
    if (!pillRef.current || !tooltipRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current.offsetHeight;
    const viewportWidth = window.innerWidth;

    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    left = Math.max(MARGIN, left);
    left = Math.min(viewportWidth - TOOLTIP_WIDTH - MARGIN, left);

    const top = rect.top - tooltipHeight - 10;

    const pillCenter = rect.left + rect.width / 2;
    const pointerLeft = Math.min(Math.max(pillCenter - left, 8), TOOLTIP_WIDTH - 8);

    setPos({ left, top, pointerLeft });
  }

  // Recalculate whenever tooltip opens or pill moves
  useEffect(() => {
    if (!isOpen) { setPos(null); return; }
    // Two passes: first render at off-screen to measure height, then position
    const frame = requestAnimationFrame(calcPosition);
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (
        pillRef.current && !pillRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        onTooltipChange(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchend", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchend", handleOutside);
    };
  }, [isOpen, onTooltipChange]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onTooltipChange(isOpen ? null : tooltipKey);
  }

  return (
    <>
      <div
        ref={pillRef}
        onClick={handleClick}
        onMouseEnter={() => onTooltipChange(tooltipKey)}
        onMouseLeave={() => onTooltipChange(null)}
        style={{ display: "block", width: "100%", cursor: "pointer", position: "relative" }}
      >
        {children ?? (
          <div
            style={{
              backgroundColor: "#0D0D10",
              border: "1px solid #3A3A40",
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
              className="fm-stat-label"
              style={{
                fontSize: 12,
                color: "#6B6A65",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                textAlign: "center",
                width: "100%",
              }}
            >
              {label}
            </span>
            <span
              className="fm-stat-value"
              style={{
                fontSize: 14,
                color: "#E8E6DF",
                fontFamily: "monospace",
                fontWeight: 500,
                textAlign: "center",
                width: "100%",
              }}
            >
              {value}
            </span>
          </div>
        )}
      </div>

      {/* Always render when open so we can measure height; hide until positioned */}
      {isOpen && def && (
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            left: pos ? pos.left : -9999,
            top: pos ? pos.top : -9999,
            width: TOOLTIP_WIDTH,
            backgroundColor: "#111113",
            border: "1px solid #E8A020",
            borderRadius: 4,
            padding: "10px 12px",
            zIndex: 200,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: "#E8E6DF" }}>{def.title}</div>
          <div style={{ fontSize: 11, color: "#9B9892", marginTop: 4, lineHeight: 1.5 }}>{def.body}</div>
          <div
            style={{
              position: "absolute",
              bottom: -5,
              left: pos ? pos.pointerLeft : "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "4px solid #E8A020",
            }}
          />
        </div>
      )}
    </>
  );
}
