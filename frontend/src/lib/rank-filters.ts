import { countriesForRegion, DEFAULT_REGION, REGIONS, type RegionKey } from "./regions";
import type { FilterState } from "./types";
import { supabase } from "./supabase";

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
export interface RankScopeParams {
  scope: ResolvedScope;
  isMultiCountryRegion: boolean;
  countries: string[] | null;
  shouldApplyStates: boolean;
}

export function resolveRankScopeParams(filters: FilterState): RankScopeParams {
  const scope = resolveFilterScope(filters);
  const requestedRegion = (filters.region as RegionKey | undefined) ?? DEFAULT_REGION;
  const isMultiCountryRegion =
    scope.scopeType === "region" &&
    requestedRegion !== undefined &&
    requestedRegion !== "US" &&
    requestedRegion !== "UK" &&
    requestedRegion !== "Global" &&
    requestedRegion !== "Other" &&
    (REGIONS[requestedRegion as Exclude<RegionKey, "Global" | "Other">] ?? []).length > 1;

  let countries: string[] | null = null;
  if (isMultiCountryRegion) {
    countries = countriesForRegion(requestedRegion) ?? [];
  }

  const shouldApplyStates =
    Boolean(filters.states && filters.states.length > 0) &&
    (scope.scopeValue === "US" || (isMultiCountryRegion && (countries?.includes("US") ?? false)));

  return { scope, isMultiCountryRegion, countries, shouldApplyStates };
}

export async function filterRankRowsByStates<T extends { hcp_id: string }>(
  rankRows: T[],
  filters: FilterState,
  shouldApplyStates: boolean,
): Promise<T[]> {
  if (!shouldApplyStates || !filters.states || filters.states.length === 0) {
    return rankRows;
  }
  const rankHcpIds = rankRows.map((r) => r.hcp_id);
  if (rankHcpIds.length === 0) return rankRows;

  const { data: stateMatches } = await supabase
    .from("hcps_v2")
    .select("id")
    .in("id", rankHcpIds)
    .in("nppes_practice_state", filters.states);

  const allowedIds = new Set((stateMatches ?? []).map((m) => String(m.id)));
  return rankRows.filter((r) => allowedIds.has(String(r.hcp_id)));
}

export function formatRankDisplay(rank: number, scopeSize: number, percentile: number): {
  rankShort: string;
  percentileShort: string;
} {
  return {
    rankShort: `#${rank} of ${scopeSize.toLocaleString()}`,
    percentileShort: percentile >= 99 ? "Top 1%" : `Top ${(100 - Math.floor(percentile))}%`,
  };
}
