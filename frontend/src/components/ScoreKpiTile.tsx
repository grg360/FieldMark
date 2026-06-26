import React from "react";
import InfoTooltip from "./InfoTooltip";

interface ScoreKpiTileProps {
  label: string;
  /** Big number to display in the tile. If a string is passed, displayed verbatim. If number, rounded. */
  value: number | string;
  /** Bar fill color */
  barColor: string;
  /** Bar fill percentage 0-100. Defaults to the numeric value of `value` if `value` is a number. */
  barPercent?: number;
  /** Optional tooltip content explaining the metric. Renders an InfoTooltip wrapping the label. */
  tooltip?: string;
}

export default function ScoreKpiTile({
  label,
  value,
  barColor,
  barPercent,
  tooltip,
}: ScoreKpiTileProps) {
  let displayValue: string;
  let inferredBarPercent: number;

  if (typeof value === "number") {
    inferredBarPercent = Math.min(100, Math.max(0, value));
    displayValue = String(Math.round(inferredBarPercent));
  } else {
    displayValue = value;
    inferredBarPercent = 0;
  }

  const pct = Math.min(100, Math.max(0, barPercent ?? inferredBarPercent));

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
      {tooltip ? (
        <InfoTooltip content={tooltip} style={{ display: "block", width: "100%" }}>
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
        </InfoTooltip>
      ) : (
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
      )}
      <div
        style={{
          fontSize: 24,
          color: "#E8E6DF",
          fontWeight: 600,
          fontFeatureSettings: '"tnum"',
          lineHeight: 1,
        }}
      >
        {displayValue}
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
