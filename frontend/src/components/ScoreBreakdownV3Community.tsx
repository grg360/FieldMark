import React from "react";
import type { CommunityScoreBreakdown } from "../lib/api";
import ScoreKpiTile from "./ScoreKpiTile";
import { RIGHT_RAIL_HEADER_STYLE } from "./rightRailStyles";

interface ScoreBreakdownV3CommunityProps {
  data: CommunityScoreBreakdown | null;
  loading: boolean;
}

const COMMUNITY_ACCENT = "#3F8FD9";

// 95th percentile reference values for NSCLC Community cohort.
// Used as the upper bound for tile bar scaling. Values above p95 cap at 100%.
const P95_PATIENTS = 12421;
const P95_LIFETIME_PAYMENTS = 99871;
const P95_COMPANIES = 52;
const P95_DRUGS = 11;

function formatPatients(n: number | null): string {
  if (n == null || n <= 0) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function formatPayments(n: number | null): string {
  if (n == null || n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function formatCount(n: number | null): string {
  if (n == null || n < 0) return "0";
  return String(n);
}

function scaleBar(value: number | null, p95: number): number {
  if (value == null || value <= 0 || p95 <= 0) return 0;
  return Math.min(100, (value / p95) * 100);
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ height: 28, width: "60%", backgroundColor: "#1A1A1A", borderRadius: 4 }} />
      <div style={{ height: 44, width: "40%", backgroundColor: "#1A1A1A", borderRadius: 4 }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 88, backgroundColor: "#1A1A1A", borderRadius: 4 }} />
        ))}
      </div>
    </div>
  );
}

export default function ScoreBreakdownV3Community({
  data,
  loading,
}: ScoreBreakdownV3CommunityProps) {
  if (loading) {
    return <LoadingSkeleton />;
  }
  if (!data) {
    return (
      <div style={{ padding: 0, color: "#6B6A65", fontSize: 12 }}>
        No Community score available for this HCP in this therapeutic area.
      </div>
    );
  }

  const scoreDisplay = Math.round(data.composite_score);
  const rankSubtext = data.rank != null ? `Rank ${data.rank} NSCLC` : "";

  return (
    <div style={{ padding: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...RIGHT_RAIL_HEADER_STYLE, marginBottom: 12 }}>Community Score</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span
            style={{
              fontSize: 36,
              color: COMMUNITY_ACCENT,
              fontWeight: 700,
              fontFeatureSettings: '"tnum"',
              lineHeight: 1,
            }}
          >
            {scoreDisplay}
          </span>
          <span style={{ fontSize: 16, color: "#6B6A65", fontWeight: 500 }}>/ 100</span>
        </div>
        {rankSubtext && (
          <div style={{ fontSize: 11, color: "#9B9892", marginTop: 8 }}>{rankSubtext}</div>
        )}
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
          label="Patient Volume"
          value={formatPatients(data.patient_volume_3yr)}
          barColor={COMMUNITY_ACCENT}
          tooltip="Total Medicare beneficiaries treated over the past 3 years. Proxy for clinical practice scale."
          barPercent={scaleBar(data.patient_volume_3yr, P95_PATIENTS)}
        />
        <ScoreKpiTile
          label="Pharma Engagement"
          value={formatPayments(data.lifetime_payments)}
          barColor={COMMUNITY_ACCENT}
          tooltip="Lifetime payments received from pharmaceutical manufacturers per CMS Open Payments. Includes consulting, advisory, speaking, and education-related payments."
          barPercent={scaleBar(data.lifetime_payments, P95_LIFETIME_PAYMENTS)}
        />
        <ScoreKpiTile
          label="Pharma Reach"
          value={formatCount(data.distinct_companies)}
          barColor={COMMUNITY_ACCENT}
          tooltip="Number of distinct pharmaceutical manufacturers with payment relationships. Higher reach indicates broader engagement across the industry."
          barPercent={scaleBar(data.distinct_companies, P95_COMPANIES)}
        />
        <ScoreKpiTile
          label="Drug Breadth"
          value={formatCount(data.distinct_drugs)}
          barColor={COMMUNITY_ACCENT}
          tooltip="Number of distinct agents represented in this practitioner's pharma engagement history. Indicates breadth of therapeutic exposure."
          barPercent={scaleBar(data.distinct_drugs, P95_DRUGS)}
        />
      </div>
    </div>
  );
}
