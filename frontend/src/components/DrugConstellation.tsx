import React from "react";
import { getTopDrugsForHcp, type DrugConstellationPoint, type TrendCategory } from "../lib/api";
import Sparkline from "./Sparkline";
import { RIGHT_RAIL_HEADER_STYLE, RIGHT_RAIL_SECTION_STYLE } from "./rightRailStyles";

interface DrugConstellationProps {
  hcpId: string;
}

const MIN_DRUGS_TO_RENDER = 3;

const TREND_COLORS: Record<TrendCategory, string> = {
  growing: "#D85A30",
  stable: "#7A7A75",
  declining: "#A8763F",
};

const TREND_ARROWS: Record<TrendCategory, string> = {
  growing: "↑",
  stable: "→",
  declining: "↓",
};

function parseDate(iso: string): Date {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(NaN);
  return new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)));
}

function formatCurrency(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(n)}`;
}

function formatMonthYear(iso: string): string {
  if (!iso) return "—";
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "—";
  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (monthIdx < 0 || monthIdx > 11) return "—";
  return `${months[monthIdx]} ${year}`;
}

function isStale(lastPaymentDate: string): boolean {
  const last = parseDate(lastPaymentDate);
  if (Number.isNaN(last.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  return last < cutoff;
}

function formatYoYPercent(pct: number | null, trend: TrendCategory): string {
  if (pct == null) return trend === "stable" ? "0%" : "—";
  if (Math.abs(pct) < 0.5) return "0%";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${Math.round(pct)}%`;
}

function TrendDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

export default function DrugConstellation({ hcpId }: DrugConstellationProps) {
  const [drugs, setDrugs] = React.useState<DrugConstellationPoint[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    if (!hcpId) {
      setDrugs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const data = await getTopDrugsForHcp(hcpId);
      if (cancelled) return;
      setDrugs(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcpId]);

  if (loading) {
    return (
      <div style={RIGHT_RAIL_SECTION_STYLE}>
        <div style={RIGHT_RAIL_HEADER_STYLE}>
          Drug Engagement
        </div>
        <div
          style={{
            height: 160,
            backgroundColor: "#050507",
            border: "1px solid #1E1E22",
            borderRadius: 4,
          }}
        />
      </div>
    );
  }

  if (drugs.length === 0) {
    return (
      <div style={RIGHT_RAIL_SECTION_STYLE}>
        <div style={RIGHT_RAIL_HEADER_STYLE}>
          Drug Engagement
        </div>
        <div style={{ fontSize: 11, color: "#6B6A65", padding: "12px 0", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
          No payment data available.
        </div>
      </div>
    );
  }

  if (drugs.length < MIN_DRUGS_TO_RENDER) return null;

  const sortedDrugs = [...drugs].sort((a, b) => b.total_amount_usd - a.total_amount_usd);
  const hasStale = sortedDrugs.some((d) => isStale(d.most_recent_payment_date));

  const growingCount = sortedDrugs.filter((d) => d.trend_category === "growing").length;
  const stableCount = sortedDrugs.filter((d) => d.trend_category === "stable").length;
  const decliningCount = sortedDrugs.filter((d) => d.trend_category === "declining").length;

  const summaryParts: React.ReactNode[] = [];
  if (growingCount > 0) {
    summaryParts.push(
      <span key="growing" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <TrendDot color={TREND_COLORS.growing} />
        {growingCount} growing
      </span>,
    );
  }
  if (stableCount > 0) {
    summaryParts.push(
      <span key="stable" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <TrendDot color={TREND_COLORS.stable} />
        {stableCount} stable
      </span>,
    );
  }
  if (decliningCount > 0) {
    summaryParts.push(
      <span key="declining" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <TrendDot color={TREND_COLORS.declining} />
        {decliningCount} declining
      </span>,
    );
  }

  return (
    <div style={RIGHT_RAIL_SECTION_STYLE}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ ...RIGHT_RAIL_HEADER_STYLE, marginBottom: 0 }}>
          Drug Engagement
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            fontSize: 11,
            color: "#6B6A65",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          }}
        >
          {summaryParts.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <span>·</span> : null}
              {part}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{ background: "#050507", border: "1px solid #1E1E22", borderRadius: 4, padding: "4px 12px" }}>
        {sortedDrugs.map((drug) => {
            const trend = drug.trend_category;
            const trendColor = TREND_COLORS[trend];
            const companyName = drug.manufacturer_clean || drug.manufacturer_name;
            const stale = isStale(drug.most_recent_payment_date);

            const showTrendPercent =
              trend !== "stable" &&
              !(
                drug.year_over_year_trend_pct != null &&
                Math.abs(drug.year_over_year_trend_pct) < 0.5
              );

            return (
              <div
                key={`${drug.drug_name}-${companyName}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 0",
                  borderBottom: "1px solid #15141A",
                  opacity: stale ? 0.55 : 1,
                  overflow: "hidden",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: 90,
                    minWidth: 90,
                    flexShrink: 0,
                    fontSize: 13,
                    color: "#E8E6DF",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {drug.drug_name}
                </div>

                <div
                  style={{
                    width: 50,
                    minWidth: 50,
                    flexShrink: 0,
                    fontSize: 13,
                    color: "#E8E6DF",
                    textAlign: "right",
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  }}
                >
                  {formatCurrency(drug.total_amount_usd)}
                </div>

                <div
                  style={{
                    minWidth: 50,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 3,
                    fontSize: 12,
                    fontWeight: 500,
                    color: trendColor,
                    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                    textAlign: "right",
                  }}
                >
                  <span>{TREND_ARROWS[trend]}</span>
                  {showTrendPercent ? (
                    <span>{formatYoYPercent(drug.year_over_year_trend_pct, trend)}</span>
                  ) : null}
                </div>

                <div
                  style={{
                    width: 56,
                    minWidth: 56,
                    flexShrink: 0,
                    fontSize: 11,
                    color: "#6B6A65",
                    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                    textAlign: "right",
                  }}
                >
                  {formatMonthYear(drug.most_recent_payment_date)}
                </div>

                <div
                  style={{
                    flex: "1 1 auto",
                    minWidth: 50,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  <Sparkline
                    data={drug.payments_by_quarter}
                    color={trendColor}
                    opacity={stale ? 0.55 : 1}
                    width={50}
                    height={16}
                  />
                </div>
              </div>
            );
          })}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
          fontSize: 10,
          color: "#6B6A65",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <TrendDot color={TREND_COLORS.growing} />
          growing
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <TrendDot color={TREND_COLORS.stable} />
          stable
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <TrendDot color={TREND_COLORS.declining} />
          declining
        </span>
        {hasStale ? <span>· greyed = inactive &gt;2yr</span> : null}
      </div>
    </div>
  );
}
