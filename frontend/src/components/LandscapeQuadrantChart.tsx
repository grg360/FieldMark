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

// Archetype machinery removed 2026-08-09 (classifier retired 2026-08-05,
// column NULL corpus-wide; frame 370428e2). ONE gray population; the only
// per-dot mark is the live senior-authorship windows-claim, in gold — the
// same badge the ledgers ship via rising_board_flags.
const DOT_INK = "#9b9892";
const SENIOR_GOLD = "#c8932f";

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
      {point.senior_transition && (
        <div style={{ fontSize: 11, color: SENIOR_GOLD, marginTop: 4, letterSpacing: "0.08em" }}>
          RECENT SENIOR AUTHORSHIP
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

  // Radius stays LIVE (rising_star_percentile) — the frame's uniform dots are
  // mock placeholders; radius encodes real rank. Endorsed 2026-08-09.
  const r = percentileRadius(payload.rising_star_percentile);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={payload.senior_transition ? SENIOR_GOLD : DOT_INK}
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

// Center caption (frame): one population, one honest sentence — replaces the
// four-swatch archetype legend that described a NULL field.
function PopulationCaption({ count }: { count: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        marginTop: 16,
        marginBottom: 32,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 10,
        letterSpacing: "0.13em",
        color: "#6e6b66",
      }}
    >
      ONE POPULATION · {count} RESEARCHERS · QUADRANT IS A POSITION, NOT A TYPE
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

      <div style={{ position: "relative", width: "100%", height: 440 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
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
          {/* Quadrant tints recolored off the archetype palette onto the
              frame's neutral darks (2026-08-09); grid renders above them. */}
          <ReferenceArea x1={0} x2={50} y1={50} y2={100} fill="#10201c" fillOpacity={1} stroke="none" />
          <ReferenceArea x1={50} x2={100} y1={50} y2={100} fill="#1c1a2b" fillOpacity={1} stroke="none" />
          <ReferenceArea x1={50} x2={100} y1={0} y2={50} fill="#211b13" fillOpacity={1} stroke="none" />
          <CartesianGrid stroke="#1E1E22" strokeDasharray="3 3" />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ strokeDasharray: "3 3" }}
            wrapperStyle={{ pointerEvents: "none" }}
          />
          <Scatter
            data={chartData}
            shape={renderDot}
            onClick={(entry) => {
              const payload = (entry as { payload?: ChartPoint }).payload ?? (entry as unknown as ChartPoint);
              if (payload?.hcp_id) {
                onPointClick(String(payload.hcp_id));
              }
            }}
          />
          </ScatterChart>
        </ResponsiveContainer>
        {/* In-plot legend for the ONE real per-dot mark (built 2026-08-09
            alongside the encoding — a legend must describe a rendered mark). */}
        <div
          style={{
            position: "absolute", right: 12, bottom: 12,
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(14,14,15,0.82)", border: "1px solid #2a2a2d",
            padding: "5px 9px", pointerEvents: "none",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: SENIOR_GOLD }} />
          <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9, letterSpacing: "0.14em", color: "#b9b5ae" }}>
            RECENT SENIOR AUTHORSHIP
          </span>
        </div>
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

      <PopulationCaption count={points.length} />
    </div>
  );
}
