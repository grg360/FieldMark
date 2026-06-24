import React from "react";
import type { RisingStarScoreBreakdown } from "../lib/api";
import { RIGHT_RAIL_HEADER_STYLE } from "./rightRailStyles";
import ScoreKpiTile from "./ScoreKpiTile";

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
      return "#E8E6DF";
  }
}

function archetypeShortLabel(archetype: string): string {
  switch (archetype) {
    case "Balanced Rising Star":
      return "BALANCED";
    case "Scientific Accelerator":
      return "SCIENCE";
    case "Network Accelerator":
      return "NETWORK";
    default:
      return "";
  }
}

function showArchetypeBadge(archetype: string): boolean {
  return (
    archetype === "Balanced Rising Star" ||
    archetype === "Scientific Accelerator" ||
    archetype === "Network Accelerator"
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
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ ...RIGHT_RAIL_HEADER_STYLE, marginBottom: 0 }}>
            Rising Star Score
          </div>
          {showArchetypeBadge(data.archetype) && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "4px 8px",
                borderRadius: 4,
                backgroundColor: badgeColor,
                color: "#FFFFFF",
                flexShrink: 0,
              }}
            >
              {archetypeShortLabel(data.archetype)}
            </span>
          )}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <ScoreKpiTile
          label="Scientific Momentum"
          value={data.scientific_momentum_percentile}
          barColor={SIGNAL_SCIENTIFIC}
        />
        <ScoreKpiTile
          label="Network Momentum"
          value={data.network_momentum_percentile}
          barColor={SIGNAL_NETWORK}
        />
        <ScoreKpiTile
          label="Scientific Visibility"
          value={data.scientific_visibility_percentile}
          barColor={SIGNAL_SCIENTIFIC}
        />
        <ScoreKpiTile
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
