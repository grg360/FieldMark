import { useRef, useEffect, useState } from "react";

interface TooltipDef {
  title: string;
  body: string;
}

const TOOLTIP_MAP: Record<string, TooltipDef> = {
  "PUB VEL": {
    title: "Publication velocity",
    body: "Publication velocity measures how prolifically this HCP is publishing recently, expressed as a multiple of the field's typical pace for their specialty and career stage. A value of 3.0x means publishing three times as fast as peers.",
  },
  "CIT TRAJ": {
    title: "Citation trajectory",
    body: "Citation trajectory shows how fast citations to this HCP's published work are accelerating, normalized against the field average for their specialty and career stage. Higher values indicate faster-growing scientific influence.",
  },
  "TRIALS": {
    title: "Trial activity",
    body: "Trial activity counts the unique active or recently completed clinical trials this HCP is leading or co-leading as principal investigator, sub-investigator, study chair, or study director.",
  },
  "CAREER AGE": {
    title: "Career age",
    body: "Career age is calculated as years since this HCP's first published paper. A useful proxy for research career stage when CV data is unavailable.",
  },
  "Publication velocity": {
    title: "Publication velocity",
    body: "Publication velocity measures how prolifically this HCP is publishing recently, expressed as a multiple of the field's typical pace for their specialty and career stage. A value of 3.0x means publishing three times as fast as peers.",
  },
  "Citation trajectory": {
    title: "Citation trajectory",
    body: "Citation trajectory shows how fast citations to this HCP's published work are accelerating, normalized against the field average for their specialty and career stage. Higher values indicate faster-growing scientific influence.",
  },
  "Trial activity": {
    title: "Trial activity",
    body: "Trial activity counts the unique active or recently completed clinical trials this HCP is leading or co-leading as principal investigator, sub-investigator, study chair, or study director.",
  },
  "Career age multiplier": {
    title: "Career age multiplier",
    body: "Boosts scores for researchers earlier in their career. A rising star 4 years post-training outranks an equivalent researcher 20 years in — same output from a younger career is a stronger signal.",
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

    const top = rect.top + window.scrollY - tooltipHeight - 10;

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
        style={{ display: "inline-block", cursor: "pointer", position: "relative" }}
      >
        {children ?? (
          <div
            style={{
              backgroundColor: "#0D0D10",
              border: "1px solid #1E1E22",
              borderRadius: 3,
              padding: "4px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 12, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {label}
            </span>
            <span style={{ fontSize: 14, color: "#E8E6DF", fontFamily: "monospace", fontWeight: 500 }}>
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
