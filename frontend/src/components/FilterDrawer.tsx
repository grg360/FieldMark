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
import { getCanonicalThemes, type CanonicalTheme } from "../lib/themes-api";
import CollapsibleFilterSection from "./CollapsibleFilterSection";

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  taSlug: string;
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

function resolveDraftThemeIds(
  contextThemeIds: string[],
  loadedThemes: CanonicalTheme[],
): string[] {
  if (loadedThemes.length === 0) return contextThemeIds;
  if (contextThemeIds.length === 0) {
    return loadedThemes.map((t) => t.id);
  }
  return contextThemeIds;
}

function toggleThemeSelection(themeId: string, draftThemeIds: string[]): string[] {
  if (draftThemeIds.includes(themeId)) {
    return draftThemeIds.filter((id) => id !== themeId);
  }
  return [...draftThemeIds, themeId];
}

export default function FilterDrawer({ open, onClose, taSlug }: FilterDrawerProps) {
  const { regions, setRegions, states, setStates, themeIds, setThemeIds } =
    useFilterContext();
  const [draftRegions, setDraftRegions] = useState<RegionKey[]>(regions);
  const [draftStates, setDraftStates] = useState<string[]>(states);
  const [draftThemeIds, setDraftThemeIds] = useState<string[]>(themeIds);
  const [themes, setThemes] = useState<CanonicalTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    if (open) {
      setDraftRegions(regions);
      setDraftStates(states);
      setThemesLoading(true);
      getCanonicalThemes(taSlug).then((loaded) => {
        setThemes(loaded);
        setDraftThemeIds(resolveDraftThemeIds(themeIds, loaded));
        setThemesLoading(false);
      });
    }
  }, [open, regions, states, themeIds, taSlug]);

  if (!open) return null;

  const usSelected = draftRegions.includes("US");
  const isDefaultRegion =
    draftRegions.length === 1 && draftRegions[0] === "US";
  const regionActiveCount = isDefaultRegion ? 0 : draftRegions.length;

  const themesActive =
    draftThemeIds.length > 0 && draftThemeIds.length < themes.length;
  const themesCount = themesActive ? draftThemeIds.length : 0;

  const noneSelected = draftThemeIds.length === 0;
  const toggleAllLabel = noneSelected ? "Select all" : "Clear";

  function handleToggleAllThemes() {
    if (noneSelected) {
      setDraftThemeIds(themes.map((t) => t.id));
    } else {
      setDraftThemeIds([]);
    }
  }

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
    const themesToCommit =
      draftThemeIds.length === 0 || draftThemeIds.length === themes.length
        ? []
        : draftThemeIds;
    setThemeIds(themesToCommit);
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
          <CollapsibleFilterSection title="Region" activeCount={regionActiveCount}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
          </CollapsibleFilterSection>

          {usSelected && (
            <CollapsibleFilterSection title="US States" activeCount={draftStates.length}>
              {US_SUB_REGION_ORDER.map((subRegion) => {
                const subStates = statesForSubRegion(subRegion);
                const selectedCount = subStates.filter((s) =>
                  draftStates.includes(s),
                ).length;
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
                          allSelected
                            ? clearSubRegion(subRegion)
                            : selectAllSubRegion(subRegion)
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
            </CollapsibleFilterSection>
          )}

          <CollapsibleFilterSection
            title="Research Themes"
            activeCount={themesCount}
          >
            {themesLoading ? (
              <div style={{ fontSize: 12, color: "#6B6A65" }}>Loading themes...</div>
            ) : themes.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6B6A65" }}>
                No canonical themes available for this therapeutic area.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginBottom: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleToggleAllThemes}
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
                    {toggleAllLabel}
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {themes.map((theme) => {
                    const selected = draftThemeIds.includes(theme.id);
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        title={theme.description}
                        onClick={() =>
                          setDraftThemeIds((prev) =>
                            toggleThemeSelection(theme.id, prev),
                          )
                        }
                        style={chipStyle(selected)}
                      >
                        {theme.canonical_name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CollapsibleFilterSection>
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
