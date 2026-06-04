import React from "react";
import { getTopDrugsForHcp, type DrugConstellationPoint, type TrendCategory } from "../lib/api";

interface DrugConstellationProps {
  hcpId: string;
}

const MIN_DRUGS_TO_RENDER = 3;

const TREND_COLOR: Record<
  TrendCategory,
  { fill: string; fillOpacity: number; stroke: string; strokeOpacity: number }
> = {
  growing: { fill: "#D85A30", fillOpacity: 1.0, stroke: "#F0997B", strokeOpacity: 1.0 },
  stable: { fill: "#D85A30", fillOpacity: 0.85, stroke: "#F0997B", strokeOpacity: 0.9 },
  declining: { fill: "#D85A30", fillOpacity: 0.3, stroke: "#D85A30", strokeOpacity: 0.5 },
};

const VIEWBOX_W = 360;
const VIEWBOX_H = 280;
const PLOT_LEFT = 40;
const PLOT_RIGHT = 330;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 220;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

function parseDate(iso: string): Date {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(NaN);
  return new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)));
}

function formatCompactDollar(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `$${Math.round(n)}`;
}

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "—";
  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (monthIdx < 0 || monthIdx > 11) return "—";
  return `${months[monthIdx]} ${year}`;
}

function formatYoY(pct: number | null): { text: string; color: string } {
  if (pct == null) return { text: "—", color: "#6B6A65" };
  const sign = pct > 0 ? "+" : "";
  const text = `${sign}${pct.toFixed(1)}% YoY`;
  if (pct > 5) return { text, color: "#1D9E75" };
  if (pct >= -5) return { text, color: "#6B6A65" };
  return { text, color: "#E24B4A" };
}

export default function DrugConstellation({ hcpId }: DrugConstellationProps) {
  const [drugs, setDrugs] = React.useState<DrugConstellationPoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeIndex, setActiveIndex] = React.useState<number>(0);

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
      let defaultIdx = 0;
      if (data.length > 0) {
        let maxTime = -Infinity;
        for (let i = 0; i < data.length; i++) {
          const t = parseDate(data[i].most_recent_payment_date).getTime();
          if (t > maxTime) {
            maxTime = t;
            defaultIdx = i;
          } else if (t === maxTime && data[i].total_amount_usd > data[defaultIdx].total_amount_usd) {
            defaultIdx = i;
          }
        }
      }
      setActiveIndex(defaultIdx);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcpId]);

  if (loading) {
    return (
      <div style={{ padding: "0 0 16px", borderBottom: "1px solid #1E1E22", marginBottom: 16 }}>
        <div
          style={{
            fontSize: 15,
            color: "#E8E6DF",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 12,
          }}
        >
          Drug Constellation
        </div>
        <div
          style={{
            height: 240,
            backgroundColor: "#050507",
            border: "1px solid #1E1E22",
            borderRadius: 4,
          }}
        />
      </div>
    );
  }

  if (drugs.length < MIN_DRUGS_TO_RENDER) return null;

  const dates = drugs.map((d) => parseDate(d.most_recent_payment_date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateSpan = Math.max(maxDate - minDate, 30 * 24 * 60 * 60 * 1000);

  const amounts = drugs.map((d) => Math.max(d.total_amount_usd, 10));
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const logMin = Math.log10(Math.max(minAmount, 10));
  const logMax = Math.log10(maxAmount);
  const logSpan = Math.max(logMax - logMin, 0.5);

  const counts = drugs.map((d) => d.payment_count);
  const maxCount = Math.max(...counts);

  function xFor(iso: string): number {
    const t = parseDate(iso).getTime();
    const ratio = (t - minDate) / dateSpan;
    return PLOT_LEFT + ratio * PLOT_W;
  }
  function yFor(amount: number): number {
    const clampedAmount = Math.max(amount, 10);
    const ratio = (Math.log10(clampedAmount) - logMin) / logSpan;
    return PLOT_BOTTOM - ratio * PLOT_H;
  }
  function rFor(count: number): number {
    if (maxCount <= 1) return 9;
    return 6 + ((count - 1) / (maxCount - 1)) * 9;
  }

  const yearTickPositions: { year: number; x: number }[] = [];
  const minYear = new Date(minDate).getUTCFullYear();
  const maxYear = new Date(maxDate).getUTCFullYear();
  for (let y = minYear; y <= maxYear; y++) {
    const jan1 = Date.UTC(y, 0, 1);
    if (jan1 >= minDate && jan1 <= maxDate) {
      yearTickPositions.push({ year: y, x: PLOT_LEFT + ((jan1 - minDate) / dateSpan) * PLOT_W });
    }
  }

  const yTicks: { label: string; y: number }[] = [];
  const logMinFloor = Math.floor(logMin);
  const logMaxCeil = Math.ceil(logMax);
  for (let lg = logMinFloor; lg <= logMaxCeil; lg++) {
    const amount = Math.pow(10, lg);
    const y = yFor(amount);
    if (y < PLOT_TOP - 2 || y > PLOT_BOTTOM + 2) continue;
    let label: string;
    if (amount >= 1000) label = `$${amount / 1000}K`;
    else label = `$${amount}`;
    yTicks.push({ label, y });
  }

  const bubblePositions = drugs.map((d, i) => {
    const baseX = xFor(d.most_recent_payment_date);
    const baseY = yFor(d.total_amount_usd);
    const r = rFor(d.payment_count);
    const labelOnLeft = baseX > PLOT_LEFT + PLOT_W * 0.55;
    const labelOnTop = baseY > PLOT_TOP + PLOT_H * 0.7;
    let labelX: number;
    let labelY: number;
    let labelAnchor: "start" | "end" | "middle";
    if (labelOnTop) {
      labelX = baseX;
      labelY = baseY - r - 10;
      labelAnchor = "middle";
    } else if (labelOnLeft) {
      labelX = baseX - r - 9;
      labelY = baseY - 2;
      labelAnchor = "end";
    } else {
      labelX = baseX + r + 9;
      labelY = baseY - 2;
      labelAnchor = "start";
    }
    return { i, drug: d, x: baseX, y: baseY, r, labelX, labelY, labelAnchor };
  });

  const activeDrug = drugs[activeIndex] ?? drugs[0];
  const activeYoY = formatYoY(activeDrug.year_over_year_trend_pct);

  const growingCount = drugs.filter((d) => d.trend_category === "growing").length;
  const stableCount = drugs.filter((d) => d.trend_category === "stable").length;
  const decliningCount = drugs.filter((d) => d.trend_category === "declining").length;
  const summaryParts: string[] = [];
  if (growingCount > 0) summaryParts.push(`${growingCount} growing`);
  if (stableCount > 0) summaryParts.push(`${stableCount} stable`);
  if (decliningCount > 0) summaryParts.push(`${decliningCount} declining`);
  const subtitle = summaryParts.join(" · ");

  return (
    <div style={{ padding: "0 0 16px", borderBottom: "1px solid #1E1E22", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: "#E8E6DF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Drug Constellation
        </div>
        <div style={{ fontSize: 11, color: "#6B6A65", fontFamily: "system-ui, sans-serif" }}>
          {subtitle}
        </div>
      </div>
      <div style={{ background: "#050507", border: "1px solid #1E1E22", borderRadius: 4 }}>
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          style={{ width: "100%", display: "block" }}
          role="img"
          aria-label="Drug engagement scatter plot"
        >
          <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke="#1E1E22" strokeWidth="1" />
          <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="#1E1E22" strokeWidth="1" />
          {yTicks.map((t, i) => (
            <g key={`y-${i}`}>
              <line
                x1={PLOT_LEFT}
                y1={t.y}
                x2={PLOT_RIGHT}
                y2={t.y}
                stroke="#1E1E22"
                strokeWidth="0.5"
                strokeDasharray="2,4"
                opacity="0.5"
              />
              <text x={PLOT_LEFT - 4} y={t.y + 3} textAnchor="end" fontSize="9" fill="#6B6A65" fontFamily="monospace">
                {t.label}
              </text>
            </g>
          ))}
          {yearTickPositions.map((t) => (
            <text
              key={`x-${t.year}`}
              x={t.x}
              y={PLOT_BOTTOM + 14}
              fontSize="10"
              fill="#6B6A65"
              fontFamily="monospace"
              textAnchor="middle"
            >
              &apos;{String(t.year).slice(2)}
            </text>
          ))}
          <text
            x={PLOT_RIGHT}
            y={PLOT_BOTTOM + 30}
            textAnchor="end"
            fontSize="10"
            fill="#3A3A3F"
            fontFamily="system-ui, sans-serif"
          >
            most recent payment →
          </text>
          {bubblePositions.map((p) => {
            const isActive = p.i === activeIndex;
            const color = TREND_COLOR[p.drug.trend_category];
            return (
              <g
                key={`bubble-${p.i}`}
                style={{ cursor: "pointer" }}
                onClick={() => setActiveIndex(p.i)}
                onMouseEnter={() => setActiveIndex(p.i)}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r + (isActive ? 2 : 0)}
                  fill={color.fill}
                  fillOpacity={color.fillOpacity}
                  stroke={isActive ? "#E8A020" : color.stroke}
                  strokeOpacity={isActive ? 1.0 : color.strokeOpacity}
                  strokeWidth={isActive ? 2 : 1}
                />
                <text
                  x={p.labelX}
                  y={p.labelY}
                  textAnchor={p.labelAnchor}
                  fontSize="9"
                  fontWeight="500"
                  fill={isActive ? "#E8A020" : "#E8E6DF"}
                  fontFamily="system-ui, sans-serif"
                >
                  {p.drug.drug_name}
                </text>
              </g>
            );
          })}
          <rect x="0" y="0" width={VIEWBOX_W} height={VIEWBOX_H} fill="transparent" onClick={() => { /* swallow */ }} />
        </svg>
        <div style={{ background: "#161618", borderTop: "1px solid #1E1E22", padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: "#E8A020", fontWeight: 500, fontFamily: "system-ui, sans-serif" }}>
                {activeDrug.drug_name}
              </span>
              <span style={{ fontSize: 11, color: "#6B6A65", fontFamily: "system-ui, sans-serif" }}>
                {activeDrug.manufacturer_clean}
              </span>
            </div>
            <span style={{ fontSize: 13, color: "#E8A020", fontFamily: "monospace", fontWeight: 500 }}>
              {formatCompactDollar(activeDrug.total_amount_usd)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontSize: 11,
              color: "#6B6A65",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <span>
              {activeDrug.payment_count} {activeDrug.payment_count === 1 ? "payment" : "payments"} · last{" "}
              {formatShortDate(activeDrug.most_recent_payment_date)}
            </span>
            <span style={{ color: activeYoY.color, fontFamily: "monospace" }}>{activeYoY.text}</span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
          fontSize: 10,
          color: "#6B6A65",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#D85A30", opacity: 1.0 }} />
            growing
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#D85A30", opacity: 0.85 }} />
            stable
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#D85A30", opacity: 0.3 }} />
            declining
          </span>
        </div>
        <span>size = payments</span>
      </div>
    </div>
  );
}
