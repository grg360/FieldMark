interface SparklineProps {
  data: Record<string, number> | null | undefined;
  color: string;
  opacity?: number;
  width?: number;
  height?: number;
}

const QUARTER_KEYS = [
  "2022-Q1",
  "2022-Q2",
  "2022-Q3",
  "2022-Q4",
  "2023-Q1",
  "2023-Q2",
  "2023-Q3",
  "2023-Q4",
  "2024-Q1",
  "2024-Q2",
  "2024-Q3",
  "2024-Q4",
];

export default function Sparkline({
  data,
  color,
  opacity = 1,
  width = 50,
  height = 16,
}: SparklineProps) {
  if (!data) {
    return (
      <svg width={width} height={height} style={{ opacity }}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.3}
        />
      </svg>
    );
  }

  const values = QUARTER_KEYS.map((key) => Number(data[key]) || 0);
  const max = Math.max(...values);

  if (max === 0) {
    return (
      <svg width={width} height={height} style={{ opacity }}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.3}
        />
      </svg>
    );
  }

  const padding = 1;
  const usableHeight = height - padding * 2;
  const stepX = width / (QUARTER_KEYS.length - 1);

  const points = values.map((value, index) => {
    const x = index * stepX;
    const normalized = value / max;
    const y = padding + (1 - normalized) * usableHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg width={width} height={height} style={{ opacity, display: "block" }}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
