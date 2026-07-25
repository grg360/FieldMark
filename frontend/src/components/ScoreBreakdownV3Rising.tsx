import React from "react";
import type { RisingStarScoreBreakdown } from "../lib/api";
import { RIGHT_RAIL_HEADER_STYLE } from "./rightRailStyles";
import ScoreKpiTile from "./ScoreKpiTile";
import { formatScoreFloor1 } from "../lib/cohort-metrics";

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

  // AD 2-axis composite model: headline = rising_composite_score, two tiles
  // (Emergence / Network Influence), no archetype badge, scope-local rank.
  if (data.model === "composite") {
    const compositeScore = Math.round(data.rising_composite_score ?? 0);
    const compositeColor = "#9B6DFF";
    const compositeRankSubtext = `Rank ${data.rank} Global`;
    return (
      <div style={{ padding: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...RIGHT_RAIL_HEADER_STYLE, marginBottom: 12 }}>Rising Star Score</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span
              style={{
                fontSize: 36,
                color: compositeColor,
                fontWeight: 700,
                fontFeatureSettings: '"tnum"',
                lineHeight: 1,
              }}
            >
              {compositeScore}
            </span>
            <span style={{ fontSize: 16, color: "#6B6A65", fontWeight: 500 }}>/ 100</span>
          </div>
          <div style={{ fontSize: 11, color: "#9B9892", marginTop: 8 }}>{compositeRankSubtext}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <ScoreKpiTile
            label="Emergence"
            value={data.emergence_pctile ?? 0}
            barColor={SIGNAL_SCIENTIFIC}
            tooltip="Who is establishing themselves scientifically? Recent (2021-2025) AD publication trajectory — output (45%), senior/first authorship (35%), citations per paper (20%) — ranked within the rising cohort."
          />
          <ScoreKpiTile
            label="Network Influence"
            value={data.network_influence_pctile ?? 0}
            barColor={SIGNAL_NETWORK}
            tooltip="How connected are they? Position in the AD collaboration graph."
          />
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: "#6B6A65", lineHeight: 1.5 }}>
          Emergence 75% · Network 25%
        </div>
      </div>
    );
  }

  // Rising Star score = rising_star_percentile, floored to one decimal (see formatScoreFloor1).
  const scoreDisplay = formatScoreFloor1(data.rising_star_percentile);
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
          tooltip="Change in publication output between 2016-2020 and 2021-2025: senior-author paper count, citation volume, and senior-author share."
        />
        <ScoreKpiTile
          label="Network Momentum"
          value={data.network_momentum_percentile}
          barColor={SIGNAL_NETWORK}
          tooltip="Change in co-authorship network centrality between 2016-2020 and 2021-2025: eigenvector, degree, and betweenness."
        />
        <ScoreKpiTile
          label="Scientific Visibility"
          value={data.scientific_visibility_percentile}
          barColor={SIGNAL_SCIENTIFIC}
          tooltip="Current publication footprint in the recent 5-year window: total publications and citation rate."
        />
        <ScoreKpiTile
          label="Network Visibility"
          value={data.network_visibility_percentile}
          barColor={SIGNAL_NETWORK}
          tooltip="Current co-authorship centrality for this therapeutic area in the recent 5-year window."
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
