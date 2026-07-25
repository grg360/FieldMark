import type { CSSProperties } from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LandscapePoint } from "../lib/api";
import { formatScoreFloor1 } from "../lib/cohort-metrics";

interface Props {
  points: LandscapePoint[];
  onPointClick: (hcpId: string) => void;
  loading: boolean;
}

type ChartPoint = LandscapePoint & {
  x: number;
  y: number;
};

function archetypeColor(archetype: LandscapePoint["archetype"]): string {
  switch (archetype) {
    case "Balanced Rising Star":
      return "#9B6DFF";
    case "Scientific Accelerator":
      return "#3FB8AF";
    case "Network Accelerator":
      return "#E8A04E";
    case "Emerging Leader":
    default:
      return "#6B6A65";
  }
}

function percentileRadius(percentile: number): number {
  const clamped = Math.min(100, Math.max(0, Number(percentile) || 0));
  return 4 + (clamped / 100) * 5;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: "#111113",
        border: "1px solid #E8A020",
        borderRadius: 6,
        padding: 10,
        fontSize: 12,
        color: "#E8E6DF",
        maxWidth: 260,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{point.name}</div>
      <div style={{ color: "#6B6A65", marginBottom: 6 }}>
        {point.institution ?? "Unknown institution"}
      </div>
      {point.archetype && point.archetype !== "Emerging Leader" && (
        <div
          style={{
            fontSize: 11,
            color: archetypeColor(point.archetype),
            marginTop: 4,
            fontStyle: "italic",
          }}
        >
          {point.archetype}
        </div>
      )}
      <div>Momentum: {formatScoreFloor1(point.momentum_composite)}</div>
      <div>Visibility: {formatScoreFloor1(point.visibility_composite)}</div>
      <div>Rank #{point.us_rank} US</div>
    </div>
  );
}

function renderDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;

  const r = percentileRadius(payload.rising_star_percentile);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={archetypeColor(payload.archetype)}
      fillOpacity={0.85}
      stroke="#111113"
      strokeWidth={1}
      style={{ cursor: "pointer" }}
    />
  );
}

const LABEL_TEXT_STYLE: CSSProperties = {
  fontSize: 11,
  color: "#4A4A4F",
  fontStyle: "italic",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  pointerEvents: "none",
};

const ARCHETYPE_LEGEND = [
  { color: "#9B6DFF", label: "Balanced" },
  { color: "#3FB8AF", label: "Scientific Accelerator" },
  { color: "#E8A04E", label: "Network Accelerator" },
  { color: "#6B6A65", label: "Rising Star" },
] as const;

function ArchetypeLegend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 16,
        fontSize: 11,
        color: "#9B9892",
        padding: 0,
        marginTop: 16,
        marginBottom: 32,
      }}
    >
      {ARCHETYPE_LEGEND.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              backgroundColor: item.color,
              display: "inline-block",
              marginRight: 6,
              flexShrink: 0,
            }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}

export default function LandscapeQuadrantChart({ points, onPointClick, loading }: Props) {
  if (loading) {
    return (
      <div
        style={{
          height: 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6B6A65",
          fontSize: 13,
        }}
      >
        Loading landscape...
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div
        style={{
          height: 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6B6A65",
          fontSize: 13,
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        No data available for this therapeutic area yet.
      </div>
    );
  }

  const chartData: ChartPoint[] = points.map((point) => ({
    ...point,
    x: point.visibility_display,
    y: point.momentum_display,
  }));

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 16px",
          marginBottom: 8,
        }}
      >
        <span style={LABEL_TEXT_STYLE}>Emerging Specialists</span>
        <span style={LABEL_TEXT_STYLE}>Future KOLs</span>
      </div>

      <div style={{ width: "100%", height: 440 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid stroke="#1E1E22" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 100]}
            tick={false}
            tickLine={false}
            axisLine={{ stroke: "#2A2A2E" }}
            height={0}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 100]}
            tick={false}
            tickLine={false}
            axisLine={{ stroke: "#2A2A2E" }}
            width={0}
          />
          <ReferenceArea x1={0} x2={50} y1={50} y2={100} fill="#3FB8AF" fillOpacity={0.07} stroke="none" />
          <ReferenceArea x1={50} x2={100} y1={50} y2={100} fill="#9B6DFF" fillOpacity={0.07} stroke="none" />
          <ReferenceArea x1={0} x2={50} y1={0} y2={50} fill="#6B6A65" fillOpacity={0.05} stroke="none" />
          <ReferenceArea x1={50} x2={100} y1={0} y2={50} fill="#E8A04E" fillOpacity={0.07} stroke="none" />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ strokeDasharray: "3 3" }}
            wrapperStyle={{ pointerEvents: "none" }}
          />
          <Scatter
            data={chartData}
            shape={renderDot}
            onClick={(entry) => {
              const payload = (entry as { payload?: ChartPoint }).payload ?? (entry as ChartPoint);
              if (payload?.hcp_id) {
                onPointClick(String(payload.hcp_id));
              }
            }}
          />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 16px",
          marginTop: 8,
        }}
      >
        <span style={LABEL_TEXT_STYLE}>Early Development</span>
        <span style={LABEL_TEXT_STYLE}>Established Visibility</span>
      </div>

      <ArchetypeLegend />
    </div>
  );
}
