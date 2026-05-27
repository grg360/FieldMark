import type { ChangeEvent } from "react";
import { REGIONS, REGION_DISPLAY_NAMES, type RegionKey } from "../lib/regions";
import { useFilterContext } from "../lib/filter-context";

/**
 * RegionSelector — dropdown for choosing the current region scope.
 * Reads/writes via useFilterContext. Selection persists to localStorage.
 *
 * Intended to be mounted at the top of each cohort dashboard. Styling
 * matches Bloomberg Terminal aesthetic — amber-on-dark, monospace, uppercase.
 */
export function RegionSelector() {
  const { region, setRegion } = useFilterContext();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (Object.prototype.hasOwnProperty.call(REGIONS, value)) {
      setRegion(value as RegionKey);
    }
  };

  // US first (default), then alphabetical, Global last.
  const orderedKeys: RegionKey[] = (Object.keys(REGIONS) as RegionKey[]).sort((a, b) => {
    if (a === "US") return -1;
    if (b === "US") return 1;
    if (a === "Global") return 1;
    if (b === "Global") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="inline-flex items-center gap-2">
      <label
        htmlFor="region-select"
        className="text-xs uppercase tracking-wider text-gray-400"
      >
        Region
      </label>
      <select
        id="region-select"
        value={region}
        onChange={handleChange}
        className="bg-gray-900 text-amber-200 border border-gray-700 px-2 py-1 text-sm font-mono uppercase tracking-wide focus:border-amber-400 focus:outline-none"
      >
        {orderedKeys.map((key) => (
          <option key={key} value={key}>
            {REGION_DISPLAY_NAMES[key] ?? key}
          </option>
        ))}
      </select>
    </div>
  );
}
