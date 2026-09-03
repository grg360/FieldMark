import { useEffect, useState, type CSSProperties } from "react";
import { DEFAULT_REGION, REGION_DISPLAY_NAMES, type RegionKey } from "../lib/regions";
import { useFilterContext } from "../lib/filter-context";
import { getCanonicalThemes } from "../lib/themes-api";
import { countWithoutPracticeState } from "../lib/api";

function isDefaultRegions(regions: RegionKey[]): boolean {
  return regions.length === 1 && regions[0] === "US";
}

interface ActiveFilterPillsProps {
  taSlug: string;
}

export default function ActiveFilterPills({ taSlug }: ActiveFilterPillsProps) {
  const { regions, setRegions, states, setStates, themeIds, setThemeIds } =
    useFilterContext();
  const [totalThemeCount, setTotalThemeCount] = useState(0);
  const [unplaceable, setUnplaceable] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCanonicalThemes(taSlug).then((themes) => {
      if (!cancelled) setTotalThemeCount(themes.length);
    });
    return () => {
      cancelled = true;
    };
  }, [taSlug]);

  // ONLY WHEN A STATE FILTER IS ON. With no state filter nothing is being hidden, so the
  // sentence would be noise; the count is also the expensive read on this component.
  const stateFilterOn = states.length > 0;
  useEffect(() => {
    if (!stateFilterOn) { setUnplaceable(null); return; }
    let cancelled = false;
    countWithoutPracticeState(taSlug).then((n) => { if (!cancelled) setUnplaceable(n); });
    return () => { cancelled = true; };
  }, [stateFilterOn, taSlug]);

  const showRegions = !isDefaultRegions(regions);
  const showStates = states.length > 0;
  const showThemes =
    themeIds.length > 0 &&
    totalThemeCount > 0 &&
    themeIds.length < totalThemeCount;

  if (!showRegions && !showStates && !showThemes) return null;

  const pillStyle: CSSProperties = {
    background: "rgba(216, 90, 48, 0.10)",
    border: "1px solid rgba(216, 90, 48, 0.40)",
    color: "#F0997B",
    padding: "2px 6px 2px 8px",
    borderRadius: 3,
    fontSize: 10,
    lineHeight: 1,
    fontFamily: "system-ui, sans-serif",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };

  const removeBtnStyle: CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontSize: 10,
    color: "#6B6A65",
    lineHeight: 1,
  };

  function removeRegion(region: RegionKey) {
    const next = regions.filter((r) => r !== region);
    setRegions(next.length === 0 ? [DEFAULT_REGION] : next);
  }

  function removeState(state: string) {
    setStates(states.filter((s) => s !== state));
  }

  return (
    <div style={{ margin: "8px 16px 12px" }}>
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
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
      {showThemes && (
        <span style={pillStyle}>
          Themes: {themeIds.length} of {totalThemeCount}
          <button
            type="button"
            aria-label="Remove theme filter"
            style={removeBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#E8E6DF";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#6B6A65";
            }}
            onClick={() => setThemeIds([])}
          >
            ×
          </button>
        </span>
      )}
    </div>
      {/* F4: THE SILENT NARROWING, NAMED. The feed's get_*_filtered endpoints did not gain
          the institution opt-in this release, so a state filter here matches an NPPES-sourced
          state only and quietly drops everyone placed by their institution. A filter that
          shows fewer people than the user expects, with no explanation, is the blank-panel
          failure in another costume. */}
      {stateFilterOn && unplaceable != null && unplaceable > 0 ? (
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: "rgba(232,230,223,0.55)" }}>
          {unplaceable.toLocaleString()} HCPs in this area have no established practice
          location and are not shown.
        </div>
      ) : null}
    </div>
  );
}
