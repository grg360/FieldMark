import React from "react";
import type { RisingStarScoreBreakdown } from "../lib/api";

interface ScoreBreakdownV3RisingProps {
  data: RisingStarScoreBreakdown | null;
  loading: boolean;
}

const SIGNAL_SCIENTIFIC = "#3FB8AF";
const SIGNAL_NETWORK = "#E8A04E";

function archetypeColor(archetype: string): string {
  switch (archetype) {
    case "Balanced Rising Star":
      return "#9B6DFF";
    case "Scientific Accelerator":
      return SIGNAL_SCIENTIFIC;
    case "Network Accelerator":
      return SIGNAL_NETWORK;
    case "Emerging Leader":
    default:
      return "#6B6A65";
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function KpiTile({
  label,
  value,
  barColor,
}: {
  label: string;
  value: number;
  barColor: string;
}) {
  const pct = clampPercent(value);
  return (
    <div
      style={{
        backgroundColor: "#0F0F0F",
        border: "1px solid #2A2A2A",
        borderRadius: 4,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 88,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#6B6A65",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          color: "#E8E6DF",
          fontWeight: 600,
          fontFeatureSettings: '"tnum"',
          lineHeight: 1,
        }}
      >
        {Math.round(pct)}
      </div>
      <div
        style={{
          height: 4,
          backgroundColor: "#1A1A1A",
          borderRadius: 2,
          overflow: "hidden",
          marginTop: "auto",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: barColor,
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

function QuadrantChart({
  momentum,
  visibility,
  dotColor,
}: {
  momentum: number;
  visibility: number;
  dotColor: string;
}) {
  const size = 280;
  const plotLeft = 36;
  const plotTop = 12;
  const plotWidth = 220;
  const plotHeight = 220;
  const plotRight = plotLeft + plotWidth;
  const plotBottom = plotTop + plotHeight;
  const midX = plotLeft + plotWidth / 2;
  const midY = plotTop + plotHeight / 2;

  const dotCx = plotLeft + (clampPercent(visibility) / 100) * plotWidth;
  const dotCy = plotBottom - (clampPercent(momentum) / 100) * plotHeight;

  const gridSteps = [0, 25, 50, 75, 100];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", margin: "0 auto" }}
      aria-label="Momentum versus visibility quadrant chart"
    >
      {gridSteps.map((step) => {
        const x = plotLeft + (step / 100) * plotWidth;
        const y = plotBottom - (step / 100) * plotHeight;
        return (
          <g key={step}>
            <line
              x1={x}
              y1={plotTop}
              x2={x}
              y2={plotBottom}
              stroke="#1F1F1F"
              strokeWidth={1}
            />
            <line
              x1={plotLeft}
              y1={y}
              x2={plotRight}
              y2={y}
              stroke="#1F1F1F"
              strokeWidth={1}
            />
          </g>
        );
      })}

      <rect
        x={plotLeft}
        y={plotTop}
        width={plotWidth}
        height={plotHeight}
        fill="none"
        stroke="#2A2A2A"
        strokeWidth={1}
      />

      <line
        x1={midX}
        y1={plotTop}
        x2={midX}
        y2={plotBottom}
        stroke="#2A2A2A"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <line
        x1={plotLeft}
        y1={midY}
        x2={plotRight}
        y2={midY}
        stroke="#2A2A2A"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      <text
        x={plotLeft + 6}
        y={plotTop + 14}
        fill="#6B6A65"
        fontSize={9}
        fontWeight={500}
        letterSpacing="0.08em"
      >
        EARLY BREAKOUT
      </text>
      <text
        x={plotRight - 6}
        y={plotTop + 14}
        fill="#6B6A65"
        fontSize={9}
        fontWeight={500}
        letterSpacing="0.08em"
        textAnchor="end"
      >
        BREAKOUT LEADER
      </text>
      <text
        x={plotLeft + 6}
        y={plotBottom - 6}
        fill="#6B6A65"
        fontSize={9}
        fontWeight={500}
        letterSpacing="0.08em"
      >
        EMERGING
      </text>
      <text
        x={plotRight - 6}
        y={plotBottom - 6}
        fill="#6B6A65"
        fontSize={9}
        fontWeight={500}
        letterSpacing="0.08em"
        textAnchor="end"
      >
        STABILIZING
      </text>

      <text
        x={plotLeft + plotWidth / 2}
        y={size - 6}
        fill="#6B6A65"
        fontSize={10}
        fontWeight={500}
        letterSpacing="0.08em"
        textAnchor="middle"
      >
        VISIBILITY
      </text>

      <text
        x={10}
        y={plotTop + plotHeight / 2}
        fill="#6B6A65"
        fontSize={10}
        fontWeight={500}
        letterSpacing="0.08em"
        textAnchor="middle"
        transform={`rotate(-90 10 ${plotTop + plotHeight / 2})`}
      >
        MOMENTUM
      </text>

      <circle
        cx={dotCx}
        cy={dotCy}
        r={8}
        fill={dotColor}
        stroke="#FFFFFF"
        strokeWidth={2}
      />
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          height: 28,
          width: "60%",
          backgroundColor: "#1A1A1A",
          borderRadius: 4,
        }}
      />
      <div
        style={{
          height: 280,
          width: 280,
          backgroundColor: "#1A1A1A",
          borderRadius: 4,
          margin: "0 auto",
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 88,
              backgroundColor: "#1A1A1A",
              borderRadius: 4,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ScoreBreakdownV3Rising({ data, loading }: ScoreBreakdownV3RisingProps) {
  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!data) {
    return (
      <div style={{ padding: 0, color: "#6B6A65", fontSize: 12 }}>
        No Rising Star score available for this HCP in this therapeutic area.
      </div>
    );
  }

  const scoreDisplay = Math.round(data.rising_star_percentile);
  const badgeColor = archetypeColor(data.archetype);
  const rankSubtext =
    data.us_rank != null
      ? `Rank ${data.us_rank} US · Rank ${data.rank} Global`
      : `Rank ${data.rank} Global`;

  return (
    <div style={{ padding: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 15,
            color: "#E8E6DF",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 8,
            fontWeight: 500,
          }}
        >
          Rising Star Score
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span
            style={{
              fontSize: 36,
              color: badgeColor,
              fontWeight: 700,
              fontFeatureSettings: '"tnum"',
              lineHeight: 1,
            }}
          >
            {scoreDisplay}
          </span>
          <span style={{ fontSize: 16, color: "#6B6A65", fontWeight: 500 }}>/ 100</span>
        </div>
        <div style={{ fontSize: 11, color: "#9B9892", marginTop: 8 }}>{rankSubtext}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <span
          style={{
            display: "inline-block",
            backgroundColor: badgeColor,
            color: "#FFFFFF",
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 14px",
            borderRadius: 14,
            lineHeight: "16px",
            height: 28,
            boxSizing: "border-box",
          }}
        >
          {data.archetype}
        </span>
      </div>

      <div style={{ marginBottom: 20 }}>
        <QuadrantChart
          momentum={data.momentum_component}
          visibility={data.visibility_component}
          dotColor={badgeColor}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <KpiTile
          label="Scientific Momentum"
          value={data.scientific_momentum_percentile}
          barColor={SIGNAL_SCIENTIFIC}
        />
        <KpiTile
          label="Network Momentum"
          value={data.network_momentum_percentile}
          barColor={SIGNAL_NETWORK}
        />
        <KpiTile
          label="Scientific Visibility"
          value={data.scientific_visibility_percentile}
          barColor={SIGNAL_SCIENTIFIC}
        />
        <KpiTile
          label="Network Visibility"
          value={data.network_visibility_percentile}
          barColor={SIGNAL_NETWORK}
        />
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "#6B6A65",
          lineHeight: 1.5,
        }}
      >
        Momentum ({Math.round(data.momentum_component)}) blends scientific and network trajectory.
        Visibility ({Math.round(data.visibility_component)}) reflects current publication and
        collaboration footprint.
      </div>
    </div>
  );
}
