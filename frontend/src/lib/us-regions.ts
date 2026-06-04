export type USSubRegionKey = "Northeast" | "Southeast" | "Midwest" | "Southwest" | "West";

export const US_SUB_REGIONS: Record<USSubRegionKey, string[]> = {
  Northeast: ["CT", "ME", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"],
  Southeast: ["AL", "AR", "DE", "FL", "GA", "KY", "LA", "MD", "MS", "NC", "SC", "TN", "VA", "WV", "DC"],
  Midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  Southwest: ["AZ", "NM", "OK", "TX"],
  West: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
};

export const US_SUB_REGION_ORDER: USSubRegionKey[] = [
  "Northeast",
  "Southeast",
  "Midwest",
  "Southwest",
  "West",
];

export function statesForSubRegion(subRegion: USSubRegionKey): string[] {
  return US_SUB_REGIONS[subRegion] ?? [];
}

export function subRegionForState(state: string): USSubRegionKey | null {
  const upper = state.toUpperCase();
  for (const [key, states] of Object.entries(US_SUB_REGIONS)) {
    if (states.includes(upper)) return key as USSubRegionKey;
  }
  return null;
}
