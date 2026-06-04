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
const STATES_STORAGE_KEY = "fieldmark.user.states";

interface FilterContextValue {
  region: RegionKey;
  regions: RegionKey[];
  setRegions: (regions: RegionKey[]) => void;
  states: string[];
  setStates: (states: string[]) => void;
  setRegion: (region: RegionKey) => void;
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

function readStoredStates(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STATES_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string" && item.trim() !== "")
      ) {
        return parsed.map((item) => String(item).toUpperCase());
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

  useEffect(() => {
    setRegionsState(readStoredRegions());
    setStatesState(readStoredStates());
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
    try {
      window.localStorage.setItem(STATES_STORAGE_KEY, JSON.stringify(normalized));
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

  const value = useMemo<FilterContextValue>(
    () => ({ region, regions, setRegions, states, setStates, setRegion }),
    [region, regions, setRegions, states, setStates, setRegion],
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
