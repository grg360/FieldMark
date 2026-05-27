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

interface FilterContextValue {
  region: RegionKey;
  setRegion: (region: RegionKey) => void;
}

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

function isValidRegion(value: string): value is RegionKey {
  return Object.prototype.hasOwnProperty.call(REGIONS, value);
}

function readStoredRegion(): RegionKey {
  if (typeof window === "undefined") return DEFAULT_REGION;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidRegion(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable (e.g., private browsing); fall through to default.
  }
  return DEFAULT_REGION;
}

/**
 * FilterProvider — wrap the app in this once at the root.
 * Hydrates region from localStorage on mount.
 */
export function FilterProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<RegionKey>(DEFAULT_REGION);

  useEffect(() => {
    setRegionState(readStoredRegion());
  }, []);

  const setRegion = useCallback((nextRegion: RegionKey) => {
    setRegionState(nextRegion);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextRegion);
    } catch {
      // Storage failed; in-memory state still updates correctly.
    }
  }, []);

  const value = useMemo<FilterContextValue>(
    () => ({ region, setRegion }),
    [region, setRegion],
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
