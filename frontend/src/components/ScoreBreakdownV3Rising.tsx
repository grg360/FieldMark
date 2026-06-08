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

function KpiTile({
  label,
  value,
  barColor,
}: {
  label: string;
  value: number;
  barColor: string;
}) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
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
          height: 24,
          width: "40%",
          backgroundColor: "#1A1A1A",
          borderRadius: 14,
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

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 14,
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
