import { useEffect, useState, type CSSProperties } from "react";
import {
  DEFAULT_REGION,
  REGION_ORDER,
  type RegionKey,
} from "../lib/regions";
import { useFilterContext } from "../lib/filter-context";
import { useMediaQuery } from "../lib/useMediaQuery";
import {
  statesForSubRegion,
  US_SUB_REGION_ORDER,
  type USSubRegionKey,
} from "../lib/us-regions";

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
}

const MAIN_REGIONS = REGION_ORDER.filter((r) => r !== "Other" && r !== "Global");
const SPECIAL_REGIONS: RegionKey[] = ["Other", "Global"];

const chipBase: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "system-ui, sans-serif",
  cursor: "pointer",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
};

function chipStyle(selected: boolean): CSSProperties {
  return selected
    ? {
        ...chipBase,
        background: "rgba(216, 90, 48, 0.10)",
        border: "1px solid #D85A30",
        color: "#F0997B",
      }
    : {
        ...chipBase,
        background: "transparent",
        border: "1px solid #1E1E22",
        color: "#888076",
      };
}

export default function FilterDrawer({ open, onClose }: FilterDrawerProps) {
  const { regions, setRegions, states, setStates } = useFilterContext();
  const [draftRegions, setDraftRegions] = useState<RegionKey[]>(regions);
  const [draftStates, setDraftStates] = useState<string[]>(states);
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    if (open) {
      setDraftRegions(regions);
      setDraftStates(states);
    }
  }, [open, regions, states]);

  if (!open) return null;

  const usSelected = draftRegions.includes("US");

  function toggleRegion(key: RegionKey) {
    if (key === "Global" || key === "Other") {
      setDraftRegions((prev) => {
        if (prev.includes(key) && prev.length === 1) return [DEFAULT_REGION];
        return [key];
      });
      return;
    }
    setDraftRegions((prev) => {
      const withoutExclusive = prev.filter((r) => r !== "Global" && r !== "Other");
      if (withoutExclusive.includes(key)) {
        const next = withoutExclusive.filter((r) => r !== key);
        return next.length === 0 ? [DEFAULT_REGION] : next;
      }
      return [...withoutExclusive, key];
    });
  }

  function toggleState(code: string) {
    const upper = code.toUpperCase();
    setDraftStates((prev) =>
      prev.includes(upper) ? prev.filter((s) => s !== upper) : [...prev, upper],
    );
  }

  function selectAllSubRegion(subRegion: USSubRegionKey) {
    const codes = statesForSubRegion(subRegion);
    setDraftStates((prev) => {
      const next = new Set(prev);
      for (const code of codes) next.add(code);
      return Array.from(next);
    });
  }

  function clearSubRegion(subRegion: USSubRegionKey) {
    const codes = new Set(statesForSubRegion(subRegion));
    setDraftStates((prev) => prev.filter((s) => !codes.has(s)));
  }

  function handleApply() {
    const nextRegions = draftRegions.length === 0 ? [DEFAULT_REGION] : draftRegions;
    setRegions(nextRegions);
    setStates(usSelected ? draftStates : []);
    onClose();
  }

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          zIndex: 100,
        }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="filter-drawer-title"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          height: "100vh",
          width: isMobile ? "100vw" : 380,
          background: "#0A0A0B",
          borderLeft: "1px solid #1E1E22",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #1E1E22",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            id="filter-drawer-title"
            style={{
              fontSize: 15,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#E8E6DF",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Filters
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            style={{
              background: "none",
              border: "none",
              color: "#6B6A65",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6B6A65",
              marginBottom: 8,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Region
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {MAIN_REGIONS.map((key) => {
              const selected = draftRegions.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleRegion(key)}
                  style={chipStyle(selected)}
                >
                  {key}
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6B6A65",
              marginBottom: 8,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Special
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: usSelected ? 24 : 0 }}>
            {SPECIAL_REGIONS.map((key) => {
              const selected = draftRegions.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleRegion(key)}
                  style={chipStyle(selected)}
                >
                  {key}
                </button>
              );
            })}
          </div>

          {usSelected && (
            <>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#6B6A65",
                  marginBottom: 12,
                  marginTop: 8,
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                US States
              </div>
              {US_SUB_REGION_ORDER.map((subRegion) => {
                const subStates = statesForSubRegion(subRegion);
                const selectedCount = subStates.filter((s) => draftStates.includes(s)).length;
                const allSelected = selectedCount === subStates.length;
                return (
                  <div key={subRegion} style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "#E8E6DF",
                          fontFamily: "system-ui, sans-serif",
                        }}
                      >
                        {subRegion}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          allSelected ? clearSubRegion(subRegion) : selectAllSubRegion(subRegion)
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "#6B6A65",
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: "system-ui, sans-serif",
                          textDecoration: "underline",
                        }}
                      >
                        {allSelected ? "Clear" : "Select all"}
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {subStates.map((code) => {
                        const selected = draftStates.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => toggleState(code)}
                            style={chipStyle(selected)}
                          >
                            {code}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div
          style={{
            padding: 16,
            borderTop: "1px solid #1E1E22",
            display: "flex",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 4,
              border: "1px solid #1E1E22",
              background: "transparent",
              color: "#6B6A65",
              fontSize: 13,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 4,
              border: "1px solid #D85A30",
              background: "rgba(216, 90, 48, 0.15)",
              color: "#F0997B",
              fontSize: 13,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
