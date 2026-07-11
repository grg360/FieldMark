import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_REGION, REGIONS, type RegionKey } from "./regions";

const STORAGE_KEY = "fieldmark.user.region";
const REGIONS_STORAGE_KEY = "fieldmark.user.regions";
const THEME_IDS_STORAGE_KEY = "fieldmark.user.themeIds";

export const TERRITORY_STATES: Record<string, string[]> = {
  northeast: ["CT", "MA", "ME", "NH", "NY", "RI", "VT", "NJ", "PA"],
  southeast: ["AL", "FL", "GA", "KY", "MS", "NC", "SC", "TN", "VA", "WV"],
  midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  southwest: ["AZ", "NM", "OK", "TX"],
  west: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
  national: [],
};

export function statesFromTerritory(territory: string): string[] {
  return TERRITORY_STATES[territory] ?? [];
}

interface FilterContextValue {
  region: RegionKey;
  regions: RegionKey[];
  setRegions: (regions: RegionKey[]) => void;
  states: string[];
  setStates: (states: string[]) => void;
  national: boolean;
  setNational: (national: boolean) => void;
  themeIds: string[];
  setThemeIds: (ids: string[]) => void;
  setRegion: (region: RegionKey) => void;
  userTerritory: string | null;
  setUserTerritory: (territory: string | null) => void;
  hydrateFromProfile: (regionSlug: string | null, statesCovered: string[]) => void;
}

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

function isValidRegion(value: string): value is RegionKey {
  return Object.prototype.hasOwnProperty.call(REGIONS, value);
}

function readStoredRegions(): RegionKey[] {
  if (typeof window === "undefined") return [DEFAULT_REGION];
  try {
    const stored = window.localStorage.getItem(REGIONS_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((item) => typeof item === "string" && isValidRegion(item))
      ) {
        return parsed as RegionKey[];
      }
    }
    const legacy = window.localStorage.getItem(STORAGE_KEY);
    if (legacy && isValidRegion(legacy)) {
      return [legacy];
    }
  } catch {
    // localStorage unavailable; fall through to default.
  }
  return [DEFAULT_REGION];
}

function readStoredThemeIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(THEME_IDS_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string" && item.trim() !== "")
      ) {
        return parsed.map((item) => String(item));
      }
    }
  } catch {
    // localStorage unavailable; fall through to default.
  }
  return [];
}

function normalizeRegions(regions: RegionKey[]): RegionKey[] {
  if (regions.length === 0) return [DEFAULT_REGION];
  return regions;
}

/**
 * FilterProvider — wrap the app in this once at the root.
 * Hydrates region from localStorage on mount.
 */
export function FilterProvider({ children }: { children: ReactNode }) {
  const [regions, setRegionsState] = useState<RegionKey[]>([DEFAULT_REGION]);
  const [states, setStatesState] = useState<string[]>([]);
  const [national, setNationalState] = useState<boolean>(true);
  const [themeIds, setThemeIdsState] = useState<string[]>([]);
  const [userTerritory, setUserTerritoryState] = useState<string | null>(null);

  useEffect(() => {
    setRegionsState(readStoredRegions());
    // States are intentionally NOT restored from localStorage: every load defaults
    // to national mode (all US), so a stale saved selection can't silently re-hide
    // null-practice_state HCPs. State filtering is a per-session opt-in.
    setThemeIdsState(readStoredThemeIds());
  }, []);

  const region = regions[0] ?? DEFAULT_REGION;

  const setRegions = useCallback((nextRegions: RegionKey[]) => {
    const normalized = normalizeRegions(nextRegions);
    setRegionsState(normalized);
    try {
      window.localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(normalized));
      window.localStorage.setItem(STORAGE_KEY, normalized[0]);
    } catch {
      // Storage failed; in-memory state still updates correctly.
    }
  }, []);

  const setStates = useCallback((nextStates: string[]) => {
    const normalized = nextStates.map((s) => s.toUpperCase());
    setStatesState(normalized);
    // Empty selection = national (no state filter); a specific selection opts out of national.
    setNationalState(normalized.length === 0);
  }, []);

  const setNational = useCallback((on: boolean) => {
    setNationalState(on);
    if (on) setStatesState([]);
  }, []);

  const setThemeIds = useCallback((nextThemeIds: string[]) => {
    setThemeIdsState(nextThemeIds);
    try {
      window.localStorage.setItem(THEME_IDS_STORAGE_KEY, JSON.stringify(nextThemeIds));
    } catch {
      // Storage failed; in-memory state still updates correctly.
    }
  }, []);

  const setRegion = useCallback(
    (nextRegion: RegionKey) => {
      setRegions([nextRegion]);
    },
    [setRegions],
  );

  const setUserTerritory = useCallback((territory: string | null) => {
    setUserTerritoryState(territory);
  }, []);

  const hydrateFromProfile = useCallback((regionSlug: string | null, statesCovered: string[]) => {
    setUserTerritoryState(regionSlug);
    if (statesCovered.length > 0) {
      const normalized = statesCovered.map((s) => s.toUpperCase());
      setStatesState(normalized);
      setNationalState(false);
    }
  }, []);

  const value = useMemo<FilterContextValue>(
    () => ({
      region,
      regions,
      setRegions,
      states,
      setStates,
      national,
      setNational,
      themeIds,
      setThemeIds,
      setRegion,
      userTerritory,
      setUserTerritory,
      hydrateFromProfile,
    }),
    [
      region,
      regions,
      setRegions,
      states,
      setStates,
      national,
      setNational,
      themeIds,
      setThemeIds,
      setRegion,
      userTerritory,
      setUserTerritory,
      hydrateFromProfile,
    ],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

/**
 * useFilterContext — read/update the current region from anywhere in the tree.
 * Throws if used outside a FilterProvider.
 */
export function useFilterContext(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilterContext must be used within FilterProvider");
  }
  return ctx;
}
