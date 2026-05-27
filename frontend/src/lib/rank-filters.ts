import { DEFAULT_REGION, type RegionKey } from "./regions";
import type { FilterState } from "./types";

/**
 * Result of resolving a FilterState into the actual query parameters needed
 * to read from hcp_score_ranks_v2.
 *
 * Either:
 *   - scopeType="region" with scopeValue=region key (most common path), OR
 *   - scopeType="country" with scopeValue=country code (specific country filter), OR
 *   - scopeType="global" with scopeValue=null (no filter, "Global" view)
 */
export interface ResolvedScope {
  scopeType: "country" | "region" | "global";
  scopeValue: string | null;
}

/**
 * resolveFilterScope - given a FilterState, decide which (scope_type, scope_value)
 * tuple to query against hcp_score_ranks_v2.
 *
 * Precedence:
 *   1. If filters.country is set, country scope wins.
 *   2. Else if filters.region is set and not "Global", region scope.
 *   3. Else if filters.region is "Global", global scope.
 *   4. Else default to region=DEFAULT_REGION ("US").
 */
export function resolveFilterScope(filters: FilterState): ResolvedScope {
  if (filters.scope === "global") {
    return { scopeType: "global", scopeValue: null };
  }

  if (filters.country && filters.country.trim() !== "") {
    return { scopeType: "country", scopeValue: filters.country.toUpperCase() };
  }

  const region = (filters.region as RegionKey | undefined) ?? DEFAULT_REGION;

  if (region === "Global") {
    return { scopeType: "global", scopeValue: null };
  }

  return { scopeType: "region", scopeValue: region };
}

/**
 * formatRankDisplay - given rank + scope_size + percentile, return the
 * canonical display strings used across the dashboard.
 *
 *   "#3 of 142"
 *   "Top 2% in US Hep"
 */
export function formatRankDisplay(rank: number, scopeSize: number, percentile: number): {
  rankShort: string;
  percentileShort: string;
} {
  return {
    rankShort: `#${rank} of ${scopeSize.toLocaleString()}`,
    percentileShort: percentile >= 99 ? "Top 1%" : `Top ${(100 - Math.floor(percentile))}%`,
  };
}
