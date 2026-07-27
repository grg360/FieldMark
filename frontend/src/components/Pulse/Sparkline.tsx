import type { CSSProperties } from "react";
import { PULSE_COLORS, formatInt, formatMonthLabel } from "../../lib/pulse";
import type { PulseMonthly } from "../../lib/pulse";

// Inline sparkline — shape only, no axes or labels, in the manner of the
// approved design. Muted INDIGO (amber stays scarce). Honest at any count:
// a flat/near-zero series simply reads flat, which is the truth for a low-count
// theme, so gated themes get one too.

interface SparklineProps {
  series: PulseMonthly[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}

// Build an SVG polyline path from counts, normalised to the series' own range.
// A single dominant point still shows as a rising line; an all-equal series
// (including all-zero) renders as a flat mid-line rather than a divide-by-zero.
function pointsFor(counts: number[], width: number, height: number, pad: number): string {
  const n = counts.length;
  if (n === 0) return "";
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return counts
    .map((c, i) => {
      const x = n === 1 ? width / 2 : pad + (innerW * i) / (n - 1);
      // Invert Y (SVG origin top-left); flat series sits on the mid-line.
      const t = span === 0 ? 0.5 : (c - min) / span;
      const y = pad + innerH * (1 - t);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function Sparkline({
  series,
  width = 68,
  height = 22,
  ariaLabel,
}: SparklineProps) {
  const counts = series.map((p) => p.pubs);
  const pad = 2;
  const points = pointsFor(counts, width, height, pad);
  const allZero = counts.every((c) => c === 0);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? "6-month trend"}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={PULSE_COLORS.indigo}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={allZero ? 0.35 : 0.85}
      />
    </svg>
  );
}

// Full-size labelled curve for the drill-down. Same indigo line, but with a
// baseline, month tick labels, and per-point values — the transparent,
// complete record (all six months, June included and explicitly labelled).
const axisLabelStyle: CSSProperties = {
  fontSize: 9.5,
  color: PULSE_COLORS.mutedDim,
  fontFeatureSettings: '"tnum"',
  whiteSpace: "nowrap",
};

export function ThemeCurve({ series }: { series: PulseMonthly[] }) {
  const width = 320;
  const height = 84;
  const pad = 6;
  const counts = series.map((p) => p.pubs);
  const max = Math.max(1, ...counts);
  const points = pointsFor(counts, width, height, pad);
  const n = series.length;
  const innerW = width - pad * 2;

  return (
    <div style={{ maxWidth: width }}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly publication curve"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* baseline */}
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke={PULSE_COLORS.line}
          strokeWidth={1}
        />
        <polyline
          points={points}
          fill="none"
          stroke={PULSE_COLORS.indigo}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {series.map((p, i) => {
          const x = n === 1 ? width / 2 : pad + (innerW * i) / (n - 1);
          const t = max === 0 ? 0 : p.pubs / max;
          const y = pad + (height - pad * 2) * (1 - t);
          return <circle key={p.month} cx={x} cy={y} r={2.2} fill={PULSE_COLORS.indigo} />;
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {series.map((p) => (
          <div key={p.month} style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <div style={{ ...axisLabelStyle, color: PULSE_COLORS.muted }}>{formatInt(p.pubs)}</div>
            <div style={axisLabelStyle}>{formatMonthLabel(p.month).replace(/ \d{4}$/, "")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
