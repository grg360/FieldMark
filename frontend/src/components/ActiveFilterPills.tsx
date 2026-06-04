import type { CSSProperties } from "react";
import { DEFAULT_REGION, REGION_DISPLAY_NAMES, type RegionKey } from "../lib/regions";
import { useFilterContext } from "../lib/filter-context";

function isDefaultRegions(regions: RegionKey[]): boolean {
  return regions.length === 1 && regions[0] === "US";
}

export default function ActiveFilterPills() {
  const { regions, setRegions, states, setStates } = useFilterContext();

  const showRegions = !isDefaultRegions(regions);
  const showStates = states.length > 0;

  if (!showRegions && !showStates) return null;

  function removeRegion(region: RegionKey) {
    const next = regions.filter((r) => r !== region);
    setRegions(next.length === 0 ? [DEFAULT_REGION] : next);
  }

  function removeState(state: string) {
    setStates(states.filter((s) => s !== state));
  }

  const pillStyle: CSSProperties = {
    background: "rgba(216, 90, 48, 0.10)",
    border: "1px solid rgba(216, 90, 48, 0.40)",
    color: "#F0997B",
    padding: "4px 8px 4px 10px",
    borderRadius: 3,
    fontSize: 11,
    fontFamily: "system-ui, sans-serif",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  const removeBtnStyle: CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontSize: 11,
    color: "#6B6A65",
    lineHeight: 1,
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        margin: "8px 16px 12px",
      }}
    >
      {showRegions &&
        regions.map((region) => (
          <span key={region} style={pillStyle}>
            Region: {REGION_DISPLAY_NAMES[region]}
            <button
              type="button"
              aria-label={`Remove ${REGION_DISPLAY_NAMES[region]} region filter`}
              style={removeBtnStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#E8E6DF";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#6B6A65";
              }}
              onClick={() => removeRegion(region)}
            >
              ×
            </button>
          </span>
        ))}
      {showStates &&
        states.map((state) => (
          <span key={state} style={pillStyle}>
            {state}
            <button
              type="button"
              aria-label={`Remove ${state} state filter`}
              style={removeBtnStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#E8E6DF";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#6B6A65";
              }}
              onClick={() => removeState(state)}
            >
              ×
            </button>
          </span>
        ))}
    </div>
  );
}
